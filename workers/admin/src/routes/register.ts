/**
 * POST /public/register — auto-cadastro (sem CF Access JWT).
 * Pré-verify: só KV pending + e-mail. D1/Access nascem no POST /public/verify.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../index';
import {
  createD1Database, execD1Batch, createAccessApp, createAccessPolicy,
  addPagesDomain, removeCfAccessDnsPlaceholder, deleteD1Database, deleteAccessApp,
} from '../lib/cf-api';
import { sendVerificationEmail } from '../lib/resend';
import { isReservedSubdomain } from '../lib/tenant-constants';
// @ts-ignore
import SCHEMA_SQL from '../schema.sql';

const router = new Hono<{ Bindings: Env }>();

const RATE_LIMIT_MAX     = 5;
const RATE_LIMIT_WINDOW  = 10 * 60;
const VERIFY_TTL_SECONDS = 24 * 3600;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256hex(text: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const PBKDF2_ITERATIONS = 250_000;
async function pbkdf2Cpf(cpf: string, salt: string): Promise<string> {
  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(cpf),
    { name: 'PBKDF2' }, false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey, 256,
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isValidCPF(raw: string): boolean {
  const cpf = raw.replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(cpf[i]) * (len + 1 - i);
    const rem = (sum * 10) % 11;
    return rem === 10 ? 0 : rem;
  };
  return calc(9) === parseInt(cpf[9]) && calc(10) === parseInt(cpf[10]);
}

async function verifyTurnstile(secret: string, token: string, ip: string): Promise<boolean> {
  if (!secret || !token) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: form,
  });
  const data = await res.json<{ success: boolean }>();
  return data.success === true;
}

function randomTokenId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function applySchema(accountId: string, token: string, dbId: string): Promise<void> {
  const sql = SCHEMA_SQL as string;
  const withoutLineComments = sql
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith('--') ? '' : line;
    })
    .join('\n');
  const stmts = withoutLineComments
    .split(';')
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0)
    .map((s: string) => s + ';');
  await execD1Batch(accountId, token, dbId, stmts);
}

async function rollbackInfra(
  accountId: string,
  apiToken: string,
  resources: { d1DatabaseId?: string; accessAppId?: string },
): Promise<void> {
  if (resources.accessAppId) {
    try { await deleteAccessApp(accountId, apiToken, resources.accessAppId); }
    catch (e) { console.error('[rollback] Access:', (e as Error).message); }
  }
  if (resources.d1DatabaseId) {
    try { await deleteD1Database(accountId, apiToken, resources.d1DatabaseId); }
    catch (e) { console.error('[rollback] D1:', (e as Error).message); }
  }
}

interface PendingTenant {
  name: string;
  subdomain: string;
  familyId: string;
  tier: 1;
  d1DatabaseId: string;
  r2Bucket: string;
  r2Prefix: string;
  accessAppId: string;
  accessAppAud: string;
  accessPolicyId: string;
  ownerEmailHash: string;
  ownerEmail: string;
  cpfHash: string;
  status: 'pending';
  createdAt: string;
  verifyTokenId?: string;
}

interface VerifyRecord {
  subdomain: string;
  email: string;
  exp: number;
}

function escHtml(v: string): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function confirmPageHtml(token: string, baseDomain: string): string {
  const escToken = escHtml(token);
  const escBase  = escHtml(baseDomain);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Ativar conta — Finanças Livre</title>
</head>
<body style="font-family:system-ui,sans-serif;max-width:420px;margin:4rem auto;padding:0 1.5rem;color:#1e293b">
  <h1 style="font-size:1.5rem;color:#6366f1;margin-bottom:0.5rem">Finanças Livre</h1>
  <p style="color:#475569;line-height:1.5">Confirme para ativar sua conta. Este passo evita ativação automática por leitores de e-mail.</p>
  <form method="POST" action="/public/verify" style="margin-top:1.5rem">
    <input type="hidden" name="token" value="${escToken}">
    <button type="submit" style="background:#10b981;color:#fff;border:0;padding:0.75rem 1.5rem;border-radius:8px;font-weight:600;cursor:pointer;font-size:1rem">
      Ativar minha conta
    </button>
  </form>
  <p style="margin-top:2rem;font-size:0.8rem;color:#94a3b8"><a href="https://${escBase}" style="color:#94a3b8">financaslivre.com</a></p>
</body>
</html>`;
}

async function extractToken(c: Context<{ Bindings: Env }>): Promise<string | null> {
  const q = c.req.query('token');
  if (q) return q;
  const ct = c.req.header('content-type') ?? '';
  try {
    if (ct.includes('application/json')) {
      const body = await c.req.json<{ token?: string }>();
      return typeof body?.token === 'string' ? body.token : null;
    }
    const form = await c.req.parseBody();
    const t = form['token'];
    return typeof t === 'string' ? t : null;
  } catch {
    return null;
  }
}

/** Ativa tenant pending: provisiona D1/Access e marca active. */
async function activatePending(
  env: Env,
  tenant: PendingTenant,
  email: string,
): Promise<{ ok: true; subdomain: string } | { ok: false; status: number; error: string }> {
  if (tenant.ownerEmail.toLowerCase() !== email.toLowerCase()) {
    return { ok: false, status: 400, error: 'Token não corresponde ao email da conta.' };
  }

  // Já provisionado (fluxo legado ou retry) — só ativa policy se faltar
  if (tenant.d1DatabaseId && tenant.accessAppId && tenant.status === 'pending') {
    // fall through to policy + activate below using existing ids
  }

  const { CF_ACCOUNT_ID, CF_API_TOKEN, BASE_DOMAIN, CF_PAGES_PROJECT, ZT_OTP_IDP_ID, CF_ZONE_ID } = env;
  const domain = `${tenant.subdomain}.${BASE_DOMAIN}`;
  const created: { d1DatabaseId?: string; accessAppId?: string } = {};

  let d1DatabaseId = tenant.d1DatabaseId;
  let accessAppId  = tenant.accessAppId;
  let accessAppAud = tenant.accessAppAud;

  try {
    if (!d1DatabaseId) {
      d1DatabaseId = await createD1Database(CF_ACCOUNT_ID, CF_API_TOKEN, `mks-${tenant.subdomain}`);
      created.d1DatabaseId = d1DatabaseId;
      await applySchema(CF_ACCOUNT_ID, CF_API_TOKEN, d1DatabaseId);
    }

    if (!accessAppId || !accessAppAud) {
      const app = await createAccessApp(CF_ACCOUNT_ID, CF_API_TOKEN, {
        name: `Finanças Livre — ${tenant.name}`,
        domain,
        otpIdpId: ZT_OTP_IDP_ID,
      });
      accessAppId  = app.id;
      accessAppAud = app.aud;
      created.accessAppId = app.id;
    }

    let accessPolicyId = tenant.accessPolicyId;
    if (!accessPolicyId) {
      accessPolicyId = await createAccessPolicy(CF_ACCOUNT_ID, CF_API_TOKEN, accessAppId, {
        name: `Owner — ${email}`,
        email,
      });
    }

    try { await removeCfAccessDnsPlaceholder(CF_ZONE_ID, CF_API_TOKEN, domain); }
    catch { /* non-fatal */ }

    if (CF_PAGES_PROJECT) {
      try { await addPagesDomain(CF_ACCOUNT_ID, CF_API_TOKEN, CF_PAGES_PROJECT, domain); }
      catch { /* non-fatal */ }
    }

    const active = {
      name: tenant.name,
      subdomain: tenant.subdomain,
      familyId: tenant.familyId,
      tier: 1 as const,
      d1DatabaseId,
      r2Bucket: tenant.r2Bucket,
      r2Prefix: tenant.r2Prefix,
      accessAppId,
      accessAppAud,
      accessPolicyId,
      ownerEmailHash: tenant.ownerEmailHash,
      status: 'active' as const,
      createdAt: tenant.createdAt,
      activatedAt: new Date().toISOString(),
    };

    await env.MKS_TENANTS.put(`tenant:${tenant.subdomain}`, JSON.stringify(active));
    return { ok: true, subdomain: tenant.subdomain };
  } catch (e) {
    await rollbackInfra(CF_ACCOUNT_ID, CF_API_TOKEN, created);
    return { ok: false, status: 500, error: `Falha ao ativar: ${(e as Error).message}` };
  }
}

// ── POST /public/register ─────────────────────────────────────────────────────

router.post('/public/register', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? 'unknown';

  const rlKey = `ratelimit:reg:${ip}`;
  const rlRaw = await c.env.MKS_TENANTS.get(rlKey);
  const attempts = rlRaw ? parseInt(rlRaw) : 0;
  if (attempts >= RATE_LIMIT_MAX) {
    return c.json({ error: 'Muitas tentativas. Aguarde 10 minutos e tente novamente.' }, 429);
  }
  await c.env.MKS_TENANTS.put(rlKey, String(attempts + 1), { expirationTtl: RATE_LIMIT_WINDOW });

  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: 'Corpo da requisição inválido.' }, 400);
  }
  const { name, subdomain, email, cpf, turnstileToken } = body ?? {};

  if (!name || !subdomain || !email || !cpf || !turnstileToken)
    return c.json({ error: 'Campos obrigatórios: nome, subdomínio, email, CPF e captcha.' }, 400);

  const nameStr = String(name).trim();
  if (nameStr.length < 2 || nameStr.length > 60 || !/^[\p{L}\p{N} .'\-]+$/u.test(nameStr))
    return c.json({ error: 'Nome: 2-60 caracteres. Use apenas letras, números, espaço, ponto, apóstrofo e hífen.' }, 400);

  if (!/^[a-z0-9-]{2,30}$/.test(subdomain))
    return c.json({ error: 'Subdomínio: 2-30 caracteres, letras minúsculas, números e hífens.' }, 400);
  if (subdomain.startsWith('-') || subdomain.endsWith('-') || isReservedSubdomain(subdomain))
    return c.json({ error: `O subdomínio "${subdomain}" não está disponível. Escolha outro.` }, 400);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    return c.json({ error: 'E-mail inválido.' }, 400);

  const turnstileOk = await verifyTurnstile(c.env.TURNSTILE_SECRET_KEY, turnstileToken, ip);
  if (!turnstileOk)
    return c.json({ error: 'Verificação de segurança falhou. Recarregue a página e tente novamente.' }, 400);

  if (!isValidCPF(cpf))
    return c.json({ error: 'CPF inválido.' }, 400);

  const cpfDigits = cpf.replace(/\D/g, '');
  const cpfSalt   = c.env.CPF_SALT;
  if (!cpfSalt) return c.json({ error: 'Serviço temporariamente indisponível.' }, 503);

  const cpfHashV2 = await pbkdf2Cpf(cpfDigits, cpfSalt);
  const cpfHashV1 = await hmacSha256hex(cpfDigits, cpfSalt);

  const [existingV2, existingV1] = await Promise.all([
    c.env.MKS_TENANTS.get(`cpf2:${cpfHashV2}`),
    c.env.MKS_TENANTS.get(`cpf:${cpfHashV1}`),
  ]);
  if (existingV2 || existingV1)
    return c.json({ error: 'Este CPF já possui uma conta cadastrada.' }, 409);

  const existingSub = await c.env.MKS_TENANTS.get(`tenant:${subdomain}`);
  if (existingSub)
    return c.json({ error: `O subdomínio "${subdomain}" já está em uso. Escolha outro.` }, 409);

  const { BASE_DOMAIN, RESEND_API_KEY, RESEND_FROM_DOMAIN } = c.env;
  const familyId = `fam-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const ownerEmailHash = (await sha256hex(email.toLowerCase())).slice(0, 32);
  const tokenId = randomTokenId();

  // Stub pending — sem D1/Access até o verify
  const tenant: PendingTenant = {
    name: nameStr,
    subdomain,
    familyId,
    tier: 1,
    d1DatabaseId: '',
    r2Bucket: 'mks-documents',
    r2Prefix: familyId,
    accessAppId: '',
    accessAppAud: '',
    accessPolicyId: '',
    ownerEmailHash,
    ownerEmail: email,
    cpfHash: cpfHashV2,
    status: 'pending',
    createdAt: new Date().toISOString(),
    verifyTokenId: tokenId,
  };

  const verifyRec: VerifyRecord = {
    subdomain,
    email: email.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + VERIFY_TTL_SECONDS,
  };

  await Promise.all([
    c.env.MKS_TENANTS.put(`tenant:${subdomain}`, JSON.stringify(tenant)),
    c.env.MKS_TENANTS.put(`cpf2:${cpfHashV2}`, familyId),
    c.env.MKS_TENANTS.put(`email:${ownerEmailHash}`, subdomain),
    c.env.MKS_TENANTS.put(`verify:${tokenId}`, JSON.stringify(verifyRec), {
      expirationTtl: VERIFY_TTL_SECONDS,
    }),
  ]);

  const index: string[] = JSON.parse(await c.env.MKS_TENANTS.get('tenants:index') ?? '[]');
  if (!index.includes(subdomain)) index.push(subdomain);
  await Promise.all([
    c.env.MKS_TENANTS.put('tenants:index', JSON.stringify(index)),
    c.env.MKS_TENANTS.put('tenants:count', String(index.length)),
  ]);

  const verifyUrl = `https://admin.${BASE_DOMAIN}/public/verify?token=${encodeURIComponent(tokenId)}`;
  c.executionCtx.waitUntil(
    sendVerificationEmail(RESEND_API_KEY, email, nameStr, verifyUrl, BASE_DOMAIN, RESEND_FROM_DOMAIN || BASE_DOMAIN),
  );

  return c.json({
    success: true,
    pending: true,
    message: 'Verifique seu e-mail para ativar a conta.',
  }, 201);
});

// ── GET /public/verify — página de confirmação (não ativa; evita prefetch) ─────

router.get('/public/verify', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Token ausente.' }, 400);

  // Token opaco one-time no KV
  const raw = await c.env.MKS_TENANTS.get(`verify:${token}`);
  if (!raw) {
    return c.html(
      `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Link inválido</title></head>
       <body style="font-family:sans-serif;text-align:center;padding:3rem;color:#64748b">
       <h1>Link inválido ou expirado</h1>
       <p>Solicite um novo cadastro ou verifique se o link já foi usado.</p>
       </body></html>`,
      400,
    );
  }

  return c.html(confirmPageHtml(token, c.env.BASE_DOMAIN));
});

// ── POST /public/verify — provisiona infra e ativa ────────────────────────────

router.post('/public/verify', async (c) => {
  const token = await extractToken(c);
  if (!token) return c.json({ error: 'Token ausente.' }, 400);

  const verifyKey = `verify:${token}`;
  const raw = await c.env.MKS_TENANTS.get(verifyKey);
  if (!raw) return c.json({ error: 'Token inválido ou já utilizado.' }, 400);

  // One-time: apaga antes de provisionar (evita double-click duplicar D1)
  await c.env.MKS_TENANTS.delete(verifyKey);

  let rec: VerifyRecord;
  try { rec = JSON.parse(raw) as VerifyRecord; }
  catch { return c.json({ error: 'Token corrompido.' }, 400); }

  if (typeof rec.exp !== 'number' || rec.exp < Math.floor(Date.now() / 1000)) {
    return c.json({ error: 'Token expirado.' }, 400);
  }

  const tenantRaw = await c.env.MKS_TENANTS.get(`tenant:${rec.subdomain}`);
  if (!tenantRaw) return c.json({ error: 'Conta não encontrada.' }, 404);
  const tenant = JSON.parse(tenantRaw) as {
    name: string;
    subdomain: string;
    familyId: string;
    tier: 1;
    d1DatabaseId: string;
    r2Bucket: string;
    r2Prefix: string;
    accessAppId: string;
    accessAppAud: string;
    accessPolicyId: string;
    ownerEmailHash: string;
    ownerEmail: string;
    cpfHash: string;
    status: string;
    createdAt: string;
    verifyTokenId?: string;
  };

  if (tenant.status === 'active') {
    const accept = c.req.header('Accept') ?? '';
    if (accept.includes('application/json')) {
      return c.json({ success: true, alreadyActive: true, url: `https://${tenant.subdomain}.${c.env.BASE_DOMAIN}` });
    }
    return c.redirect(`https://${tenant.subdomain}.${c.env.BASE_DOMAIN}`, 302);
  }
  if (tenant.status !== 'pending') {
    return c.json({ error: `Conta não pode ser ativada (status: ${tenant.status}).` }, 409);
  }

  const result = await activatePending(c.env, { ...tenant, status: 'pending' }, rec.email);
  if (!result.ok) return c.json({ error: result.error }, result.status as 400 | 500);

  const url = `https://${result.subdomain}.${c.env.BASE_DOMAIN}`;
  const accept = c.req.header('Accept') ?? '';
  const ct = c.req.header('Content-Type') ?? '';
  if (accept.includes('application/json') && ct.includes('application/json')) {
    return c.json({ success: true, url });
  }
  return c.redirect(url, 302);
});

export default router;
