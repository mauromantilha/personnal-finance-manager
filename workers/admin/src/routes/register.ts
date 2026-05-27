/**
 * POST /api/public/register
 *
 * Self-registration endpoint for new families.
 * - No CF Access JWT required (public)
 * - Cloudflare Turnstile verification
 * - CPF validation + uniqueness (hashed in KV)
 * - IP-based brute-force protection (5 attempts / 10 min)
 * - Runs the full provision flow
 */
import { Hono } from 'hono';
import type { Env } from '../index';
import {
  createD1Database, execD1Batch, createAccessApp, createAccessPolicy,
  addPagesDomain, removeCfAccessDnsPlaceholder,
} from '../lib/cf-api';
import { sendWelcomeEmail } from '../lib/resend';
// @ts-ignore
import SCHEMA_SQL from '../schema.sql';

const router = new Hono<{ Bindings: Env }>();

const RATE_LIMIT_MAX    = 5;
const RATE_LIMIT_WINDOW = 10 * 60; // 10 min

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** HMAC-SHA-256 hex — use for all identity-sensitive hashes (CPF). */
async function hmacSha256hex(text: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Brazilian CPF validation (check digits) */
function isValidCPF(raw: string): boolean {
  const cpf = raw.replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // all-same digits
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(cpf[i]) * (len + 1 - i);
    const rem = (sum * 10) % 11;
    return rem === 10 ? 0 : rem;
  };
  return calc(9) === parseInt(cpf[9]) && calc(10) === parseInt(cpf[10]);
}

/** Cloudflare Turnstile server-side verification */
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

async function applySchema(accountId: string, token: string, dbId: string): Promise<void> {
  const sql = SCHEMA_SQL as string;
  const stmts = sql
    .split(';')
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0 && !s.startsWith('--'))
    .map((s: string) => s + ';');
  await execD1Batch(accountId, token, dbId, stmts);
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post('/public/register', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? 'unknown';

  // ── 1. Rate limit ──────────────────────────────────────────────────────────
  const rlKey = `ratelimit:reg:${ip}`;
  const rlRaw = await c.env.MKS_TENANTS.get(rlKey);
  const attempts = rlRaw ? parseInt(rlRaw) : 0;
  if (attempts >= RATE_LIMIT_MAX) {
    return c.json({ error: 'Muitas tentativas. Aguarde 10 minutos e tente novamente.' }, 429);
  }
  // Increment immediately to prevent parallel abuse
  await c.env.MKS_TENANTS.put(rlKey, String(attempts + 1), { expirationTtl: RATE_LIMIT_WINDOW });

  // ── 2. Parse & basic validate ─────────────────────────────────────────────
  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: 'Corpo da requisição inválido.' }, 400);
  }
  const { name, subdomain, email, cpf, turnstileToken } = body ?? {};

  if (!name || !subdomain || !email || !cpf || !turnstileToken)
    return c.json({ error: 'Campos obrigatórios: nome, subdomínio, email, CPF e captcha.' }, 400);

  if (!/^[a-z0-9-]{2,30}$/.test(subdomain))
    return c.json({ error: 'Subdomínio: 2-30 caracteres, letras minúsculas, números e hífens.' }, 400);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    return c.json({ error: 'E-mail inválido.' }, 400);

  // ── 3. Turnstile ──────────────────────────────────────────────────────────
  const turnstileOk = await verifyTurnstile(c.env.TURNSTILE_SECRET_KEY, turnstileToken, ip);
  if (!turnstileOk)
    return c.json({ error: 'Verificação de segurança falhou. Recarregue a página e tente novamente.' }, 400);

  // ── 4. CPF validation ─────────────────────────────────────────────────────
  if (!isValidCPF(cpf))
    return c.json({ error: 'CPF inválido.' }, 400);

  const cpfDigits = cpf.replace(/\D/g, '');
  const cpfSalt   = c.env.CPF_SALT;
  if (!cpfSalt) return c.json({ error: 'Serviço temporariamente indisponível.' }, 503);
  const cpfHash   = await hmacSha256hex(cpfDigits, cpfSalt);

  const existingCpf = await c.env.MKS_TENANTS.get(`cpf:${cpfHash}`);
  if (existingCpf)
    return c.json({ error: 'Este CPF já possui uma conta cadastrada.' }, 409);

  // ── 5. Subdomain uniqueness ────────────────────────────────────────────────
  const existingSub = await c.env.MKS_TENANTS.get(`tenant:${subdomain}`);
  if (existingSub)
    return c.json({ error: `O subdomínio "${subdomain}" já está em uso. Escolha outro.` }, 409);

  const { CF_ACCOUNT_ID, CF_API_TOKEN, BASE_DOMAIN, RESEND_API_KEY, RESEND_FROM_DOMAIN,
          ZT_OTP_IDP_ID, CF_PAGES_PROJECT } = c.env;
  const familyId = `fam-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const domain   = `${subdomain}.${BASE_DOMAIN}`;

  // ── 6. Provision: D1 + CF Access ─────────────────────────────────────────
  let d1DatabaseId: string;
  try {
    d1DatabaseId = await createD1Database(CF_ACCOUNT_ID, CF_API_TOKEN, `mks-${subdomain}`);
  } catch (e) {
    return c.json({ error: `Falha ao criar banco de dados: ${(e as Error).message}` }, 500);
  }

  let accessAppId: string, accessAppAud: string;
  try {
    const [, app] = await Promise.all([
      applySchema(CF_ACCOUNT_ID, CF_API_TOKEN, d1DatabaseId),
      createAccessApp(CF_ACCOUNT_ID, CF_API_TOKEN, {
        name: `Finanças Livre — ${name}`,
        domain,
        otpIdpId: ZT_OTP_IDP_ID,
      }),
    ]);
    accessAppId  = app.id;
    accessAppAud = app.aud;
  } catch (e) {
    return c.json({ error: `Falha no provisionamento: ${(e as Error).message}` }, 500);
  }

  let accessPolicyId: string;
  try {
    accessPolicyId = await createAccessPolicy(CF_ACCOUNT_ID, CF_API_TOKEN, accessAppId, {
      name: `Owner — ${email}`,
      email,
    });
  } catch (e) {
    return c.json({ error: `Falha ao configurar acesso: ${(e as Error).message}` }, 500);
  }

  try {
    await removeCfAccessDnsPlaceholder(c.env.CF_ZONE_ID, CF_API_TOKEN, domain);
  } catch (_) { /* non-fatal */ }

  // ── 7. KV: tenant + CPF index ─────────────────────────────────────────────
  const ownerEmailHash = (await sha256hex(email.toLowerCase())).slice(0, 16);
  const tenant = {
    name, subdomain, familyId,
    tier: 1 as const,
    d1DatabaseId,
    r2Bucket:       'mks-documents',
    r2Prefix:       familyId,
    accessAppId, accessAppAud, accessPolicyId,
    ownerEmailHash,
    status:    'active' as const,
    createdAt: new Date().toISOString(),
  };

  if (CF_PAGES_PROJECT) {
    try { await addPagesDomain(CF_ACCOUNT_ID, CF_API_TOKEN, CF_PAGES_PROJECT, domain); }
    catch (_) { /* non-fatal */ }
  }

  await Promise.all([
    c.env.MKS_TENANTS.put(`tenant:${subdomain}`, JSON.stringify(tenant)),
    c.env.MKS_TENANTS.put(`cpf:${cpfHash}`, familyId),           // CPF → familyId
    c.env.MKS_TENANTS.put(`email:${ownerEmailHash}`, subdomain),  // email index (16-char hash)
  ]);

  const index: string[] = JSON.parse(await c.env.MKS_TENANTS.get('tenants:index') ?? '[]');
  if (!index.includes(subdomain)) index.push(subdomain);
  await Promise.all([
    c.env.MKS_TENANTS.put('tenants:index', JSON.stringify(index)),
    c.env.MKS_TENANTS.put('tenants:count', String(index.length)),
  ]);

  // Decrement rate limit on success so genuine users aren't penalized
  await c.env.MKS_TENANTS.put(rlKey, String(Math.max(0, attempts)), { expirationTtl: RATE_LIMIT_WINDOW });

  c.executionCtx.waitUntil(
    sendWelcomeEmail(RESEND_API_KEY, email, name, subdomain, BASE_DOMAIN, RESEND_FROM_DOMAIN || BASE_DOMAIN),
  );

  return c.json({ success: true, url: `https://${domain}` }, 201);
});

export default router;
