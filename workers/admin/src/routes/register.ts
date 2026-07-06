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
import { sendVerificationEmail } from '../lib/resend';
// @ts-ignore
import SCHEMA_SQL from '../schema.sql';

const router = new Hono<{ Bindings: Env }>();

const RATE_LIMIT_MAX    = 5;
const RATE_LIMIT_WINDOW = 10 * 60; // 10 min
const VERIFY_TTL_SECONDS = 24 * 3600; // 24 horas
const VERIFY_LOCK_TTL_SECONDS = 15 * 60;

// Subdomínios reservados — impede que um usuário registre hosts de infraestrutura
// (admin, api, www…) que colidiriam com rotas do sistema ou seriam usados para
// phishing sob o domínio principal.
const RESERVED_SUBDOMAINS = new Set([
  'admin', 'api', 'www', 'app', 'mail', 'email', 'smtp', 'imap', 'pop',
  'ftp', 'ns', 'ns1', 'ns2', 'dns', 'mx', 'root', 'support', 'help',
  'status', 'blog', 'dev', 'staging', 'test', 'demo', 'static', 'cdn',
  'assets', 'img', 'images', 'files', 'docs', 'pay', 'payment', 'billing',
  'account', 'accounts', 'auth', 'login', 'signup', 'register', 'dashboard',
  'financaslivre', 'security', 'no-reply', 'noreply', 'system', 'internal',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** HMAC-SHA-256 hex — mantido apenas para compatibilidade com hashes legados (cpf:). */
async function hmacSha256hex(text: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * PBKDF2-SHA-256 com 250k iterações — usado para hash determinístico de CPF (v2).
 * Custo computacional alto inviabiliza brute-force de tabela arco-íris mesmo
 * se CPF_SALT vazar: ~50 ms por candidato × 10^9 CPFs ≈ 1.500 anos em 1 CPU.
 * Mantém-se determinístico (salt fixo) para permitir detecção de duplicidade.
 */
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

// ── Token de verificação assinado (HMAC-SHA-256) ─────────────────────────────
function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - b64.length % 4);
  return Uint8Array.from(atob(b64 + pad), c => c.charCodeAt(0));
}
async function hmac256(secret: string, msg: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return new Uint8Array(sig);
}
async function signVerifyToken(payload: { sub: string; email: string; exp: number }, secret: string): Promise<string> {
  const p = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = b64urlEncode(await hmac256(secret, p));
  return `${p}.${sig}`;
}
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function verifyVerifyToken(token: string, secret: string): Promise<{ sub: string; email: string } | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [p, sig] = parts;
  try {
    const expected = await hmac256(secret, p);
    const given    = b64urlDecode(sig);
    if (!timingSafeEqual(expected, given)) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p))) as { sub: string; email: string; exp: number };
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
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

  // Whitelist Unicode: letras, números, espaço, ponto, apóstrofo, hífen. Bloqueia <>"'&/\`
  const nameStr = String(name).trim();
  if (nameStr.length < 2 || nameStr.length > 60 || !/^[\p{L}\p{N} .'\-]+$/u.test(nameStr))
    return c.json({ error: 'Nome: 2-60 caracteres. Use apenas letras, números, espaço, ponto, apóstrofo e hífen.' }, 400);

  if (!/^[a-z0-9-]{2,30}$/.test(subdomain))
    return c.json({ error: 'Subdomínio: 2-30 caracteres, letras minúsculas, números e hífens.' }, 400);
  // Rejeita hífen nas pontas (hosts inválidos) e nomes reservados de infraestrutura.
  if (subdomain.startsWith('-') || subdomain.endsWith('-') || RESERVED_SUBDOMAINS.has(subdomain))
    return c.json({ error: `O subdomínio "${subdomain}" não está disponível. Escolha outro.` }, 400);

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

  // Dual lookup: v2 (PBKDF2) para registros novos + v1 (HMAC) para legacy.
  // Escritas novas usam apenas v2.
  const cpfHashV2 = await pbkdf2Cpf(cpfDigits, cpfSalt);
  const cpfHashV1 = await hmacSha256hex(cpfDigits, cpfSalt);

  const [existingV2, existingV1] = await Promise.all([
    c.env.MKS_TENANTS.get(`cpf2:${cpfHashV2}`),
    c.env.MKS_TENANTS.get(`cpf:${cpfHashV1}`),
  ]);
  if (existingV2 || existingV1)
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
        name: `Finanças Livre — ${nameStr}`,
        domain,
        otpIdpId: ZT_OTP_IDP_ID,
      }),
    ]);
    accessAppId  = app.id;
    accessAppAud = app.aud;
  } catch (e) {
    return c.json({ error: `Falha no provisionamento: ${(e as Error).message}` }, 500);
  }

  // Importante: NÃO criamos CF Access policy aqui. Ela só é criada quando o dono
  // do email confirmar via /public/verify. Isso impede que alguém cadastre o
  // email de outra pessoa e a vítima receba magic link de uma conta que não pediu.

  try {
    await removeCfAccessDnsPlaceholder(c.env.CF_ZONE_ID, CF_API_TOKEN, domain);
  } catch (_) { /* non-fatal */ }

  // ── 7. KV: tenant (pending) + CPF index ───────────────────────────────────
  // 32 chars = 128 bits — birthday collision exige ~1.8×10^19 registros.
  const ownerEmailHash = (await sha256hex(email.toLowerCase())).slice(0, 32);
  const tenant = {
    name: nameStr, subdomain, familyId,
    tier: 1 as const,
    d1DatabaseId,
    r2Bucket:       'mks-documents',
    r2Prefix:       familyId,
    accessAppId, accessAppAud,
    accessPolicyId: '',                 // criado em /public/verify
    ownerEmailHash,
    ownerEmail:     email,              // necessário p/ criar policy ao verificar
    cpfHash:        cpfHashV2,          // permite à limpeza de pendentes liberar o índice de CPF
    status:         'pending' as const, // ativa só após verificação
    createdAt:      new Date().toISOString(),
  };

  if (CF_PAGES_PROJECT) {
    try { await addPagesDomain(CF_ACCOUNT_ID, CF_API_TOKEN, CF_PAGES_PROJECT, domain); }
    catch (_) { /* non-fatal */ }
  }

  await Promise.all([
    c.env.MKS_TENANTS.put(`tenant:${subdomain}`, JSON.stringify(tenant)),
    c.env.MKS_TENANTS.put(`cpf2:${cpfHashV2}`, familyId),          // CPF → familyId (v2 PBKDF2)
    c.env.MKS_TENANTS.put(`email:${ownerEmailHash}`, subdomain),   // email index (16-char hash)
  ]);

  const index: string[] = JSON.parse(await c.env.MKS_TENANTS.get('tenants:index') ?? '[]');
  if (!index.includes(subdomain)) index.push(subdomain);
  await Promise.all([
    c.env.MKS_TENANTS.put('tenants:index', JSON.stringify(index)),
    c.env.MKS_TENANTS.put('tenants:count', String(index.length)),
  ]);

  // NÃO decrementar o rate-limit: permitir reset facilita enumeração de CPFs/subdomínios
  // já cadastrados (atacante registra, ganha sucesso = HTTP 201, reseta contador, e itera).

  // Token de verificação (24h) — assinado com APP_SECRET
  if (!c.env.APP_SECRET) {
    return c.json({ error: 'APP_SECRET não configurado no servidor.' }, 503);
  }
  const exp   = Math.floor(Date.now() / 1000) + VERIFY_TTL_SECONDS;
  const token = await signVerifyToken({ sub: subdomain, email, exp }, c.env.APP_SECRET);
  const verifyUrl = `https://admin.${BASE_DOMAIN}/public/verify?token=${encodeURIComponent(token)}`;

  c.executionCtx.waitUntil(
    sendVerificationEmail(RESEND_API_KEY, email, nameStr, verifyUrl, BASE_DOMAIN, RESEND_FROM_DOMAIN || BASE_DOMAIN),
  );

  return c.json({
    success: true,
    pending: true,
    message: 'Verifique seu e-mail para ativar a conta.',
  }, 201);
});

// ── GET /public/verify ────────────────────────────────────────────────────────
// Confirma o cadastro: valida token assinado, cria CF Access policy e ativa o tenant.
router.get('/public/verify', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Token ausente.' }, 400);
  if (!c.env.APP_SECRET) return c.json({ error: 'Serviço indisponível.' }, 503);

  const claims = await verifyVerifyToken(token, c.env.APP_SECRET);
  if (!claims) return c.json({ error: 'Token inválido ou expirado.' }, 400);

  const verifyLockKey = `verify:${claims.sub}`;
  await c.env.MKS_TENANTS.put(verifyLockKey, '1', { expirationTtl: VERIFY_LOCK_TTL_SECONDS });
  try {
    if (await c.env.MKS_TENANTS.get(`cleanup:${claims.sub}`))
      return c.json({ error: 'Conta em manutenção. Tente novamente em instantes.' }, 409);

    const tenantRaw = await c.env.MKS_TENANTS.get(`tenant:${claims.sub}`);
    if (!tenantRaw) return c.json({ error: 'Conta não encontrada.' }, 404);
    const tenant = JSON.parse(tenantRaw) as any;

    // Idempotência: se já ativo, redireciona sem erro
    if (tenant.status === 'active') {
      return c.redirect(`https://${tenant.subdomain}.${c.env.BASE_DOMAIN}`, 302);
    }
    if (tenant.status !== 'pending') {
      return c.json({ error: 'Conta não pode ser ativada (status: ' + tenant.status + ').' }, 409);
    }
    if (tenant.ownerEmail !== claims.email) {
      return c.json({ error: 'Token não corresponde ao email da conta.' }, 400);
    }

    // Cria CF Access policy agora que o email foi confirmado
    let accessPolicyId: string;
    try {
      accessPolicyId = await createAccessPolicy(
        c.env.CF_ACCOUNT_ID, c.env.CF_API_TOKEN, tenant.accessAppId,
        { name: `Owner — ${claims.email}`, email: claims.email },
      );
    } catch (e) {
      return c.json({ error: `Falha ao ativar acesso: ${(e as Error).message}` }, 500);
    }

    const latestRaw = await c.env.MKS_TENANTS.get(`tenant:${claims.sub}`);
    if (!latestRaw) return c.json({ error: 'Conta não encontrada.' }, 404);
    const latest = JSON.parse(latestRaw) as any;
    if (latest.status !== 'pending') {
      return c.json({ error: 'Conta não pode ser ativada (status: ' + latest.status + ').' }, 409);
    }
    if (latest.ownerEmail !== claims.email) {
      return c.json({ error: 'Token não corresponde ao email da conta.' }, 400);
    }

    latest.accessPolicyId = accessPolicyId;
    latest.status         = 'active';
    latest.activatedAt    = new Date().toISOString();
    delete latest.ownerEmail; // não precisamos mais armazenar em claro
    delete latest.cpfHash;    // hash de CPF vive no índice cpf2:; não precisa no registro do tenant
    await c.env.MKS_TENANTS.put(`tenant:${latest.subdomain}`, JSON.stringify(latest));

    return c.redirect(`https://${latest.subdomain}.${c.env.BASE_DOMAIN}`, 302);
  } finally {
    try { await c.env.MKS_TENANTS.delete(verifyLockKey); }
    catch { /* best-effort */ }
  }
});

export default router;
