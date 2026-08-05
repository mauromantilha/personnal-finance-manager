import { Hono }      from 'hono';
import { getCookie } from 'hono/cookie';

import { verifyAccessJWT } from './lib/access';
import { countZTUsers }    from './lib/cf-api';
import { adminHtml }      from './html';

import provisionRoutes       from './routes/provision';
import familyRoutes          from './routes/families';
import migrationRoutes       from './routes/migrations';
import nocRoutes             from './routes/noc';
import registerRoutes        from './routes/register';
import telemetryRoutes       from './routes/telemetry';
import communicationsRoutes  from './routes/communications';
import maintenanceRoutes, { sweepPendingTenants } from './routes/maintenance';

// ── Env bindings ──────────────────────────────────────────────────────────────
export interface Env {
  MKS_TENANTS:  KVNamespace;
  MKS_ADMIN:    KVNamespace;
  CF_ACCOUNT_ID:    string;
  CF_ZONE_ID:       string;
  CF_TEAM_DOMAIN:   string;
  BASE_DOMAIN:      string;
  ZT_OTP_IDP_ID:    string;
  ZT_ADMIN_APP_AUD: string;
  CF_PAGES_PROJECT: string;
  RESEND_FROM_DOMAIN: string;
  D1_FREE_LIMIT:    string;
  D1_PAID_LIMIT:    string;
  ZT_FREE_LIMIT:    string;
  CF_API_TOKEN:        string;
  CF_ZT_TOKEN:         string;
  ADMIN_PASSWORD:      string;
  RESEND_API_KEY:      string;
  TURNSTILE_SECRET_KEY: string;
  CPF_SALT:            string;
  APP_SECRET:          string;  // HMAC para tokens de verificação de email
  AUTO_CLEANUP?:       string;  // "true" habilita o cron de limpeza de pendentes (destrutivo)
  FINANCE?:            Fetcher; // service binding → mks-finance (API dos tenants)
}

export interface Tenant {
  name:           string;
  subdomain:      string;
  familyId:       string;
  tier:           1 | 2;
  /** Vazio em pending pré-verify (D1 só nasce no POST /public/verify). */
  d1DatabaseId:   string;
  r2Bucket:       string;
  r2Prefix:       string;
  accessAppId:    string;
  accessAppAud:   string;
  accessPolicyId: string;
  ownerEmailHash: string;
  status:            'pending' | 'active' | 'suspended' | 'deleted';
  createdAt:         string;
  storageTierBytes?: number;
  cpfHash?:          string;
  ownerEmail?:       string;  // só pending — removido após verify
  verifyTokenId?:    string;
}

export interface Variables {
  adminEmail: string;
  adminSub:   string;
  cspNonce:   string;
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── Security headers ──────────────────────────────────────────────────────────
// Gera um nonce por request (CSP strict). Salvo em c.var para o handler do SPA usar.
function genNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** CSP do painel admin (HTML inline com nonce). */
function adminCsp(nonce: string): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' https://cdn.jsdelivr.net https://static.cloudflareinsights.com`,
    `script-src-elem 'self' 'nonce-${nonce}' https://cdn.jsdelivr.net https://static.cloudflareinsights.com`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' https://api.dicebear.com data:`,
    `connect-src 'self' https://api.resend.com https://cloudflareinsights.com https://static.cloudflareinsights.com`,
    `frame-ancestors 'none'`,
  ].join('; ');
}

/**
 * CSP do SPA do tenant (proxied Pages).
 * Precisa permitir Cloudflare Access: quando a sessão OTP expira, fetch('/api/…')
 * recebe 302 para *.cloudflareaccess.com — sem isso o browser bloqueia e
 * criar conta / market / data falham com "Failed to fetch".
 */
function tenantCsp(teamDomain: string): string {
  const access = `https://${teamDomain}.cloudflareaccess.com`;
  return [
    `default-src 'self'`,
    `script-src 'self' https://static.cloudflareinsights.com`,
    `style-src 'self' 'unsafe-inline' ${access}`,
    `img-src 'self' https://api.dicebear.com data: ${access}`,
    `font-src 'self' data:`,
    `connect-src 'self' ${access} https://cloudflareinsights.com https://static.cloudflareinsights.com`,
    `frame-src ${access}`,
    `form-action 'self' ${access}`,
    `frame-ancestors 'none'`,
  ].join('; ');
}

app.use('*', async (c, next) => {
  const nonce = genNonce();
  c.set('cspNonce', nonce);
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  c.header('Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), ' +
    'accelerometer=(), gyroscope=(), interest-cohort=()');

  const host = new URL(c.req.url).hostname;
  const isAdmin = host === `admin.${c.env.BASE_DOMAIN}`;
  c.header(
    'Content-Security-Policy',
    isAdmin ? adminCsp(nonce) : tenantCsp(c.env.CF_TEAM_DOMAIN),
  );
});

// ── Tenant frontend proxy ─────────────────────────────────────────────────────
// For subdomains other than admin.*, proxy all traffic to the CF Pages project.
// This avoids per-tenant CF Pages custom domain registration entirely.
app.all('*', async (c, next) => {
  const url = new URL(c.req.url);
  const hostname = url.hostname;
  if (hostname === `admin.${c.env.BASE_DOMAIN}`) return next();
  // /api/* do tenant NÃO pode ir ao Pages (HTML). Encaminha ao Finance Worker
  // via service binding — cobre conflito de rota *.financaslivre.com/* vs /api/*.
  if (
    url.pathname.startsWith('/api/') &&
    !url.pathname.startsWith('/api/public/') &&
    hostname !== `admin.${c.env.BASE_DOMAIN}`
  ) {
    if (c.env.FINANCE) {
      return c.env.FINANCE.fetch(c.req.raw);
    }
    return c.json({
      error: 'API do tenant deveria ir ao Finance Worker. Binding FINANCE ausente.',
      code: 'API_ROUTE_MISMATCH',
    }, 502);
  }
  if (url.pathname.startsWith('/public/') || url.pathname.startsWith('/api/public/')) {
    return next();
  }

  // Only serve SPA for provisioned, active tenants — reject unknown/pending subdomains
  const subdomain = hostname.split('.')[0];
  const tenant = await c.env.MKS_TENANTS.get<Tenant>(`tenant:${subdomain}`, 'json');
  if (!tenant) {
    return c.html(
      '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>404</title>' +
      '<meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
      '<body style="font-family:sans-serif;text-align:center;padding:4rem;color:#374151">' +
      '<h1 style="font-size:4rem;margin:0">404</h1>' +
      '<p>Endereço não encontrado.</p>' +
      `<p><a href="https://${c.env.BASE_DOMAIN}" style="color:#6366F1">financaslivre.com</a></p>` +
      '</body></html>',
      404,
    );
  }
  if (tenant.status === 'pending') {
    return c.html(
      '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Confirmação pendente</title>' +
      '<meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
      '<body style="font-family:sans-serif;text-align:center;padding:4rem;color:#374151">' +
      '<h1 style="font-size:2.2rem;margin:0 0 1rem;color:#6366F1">📧 Confirmação pendente</h1>' +
      '<p>Verifique seu e-mail e clique no link para ativar sua conta.</p>' +
      '<p style="color:#6b7280;font-size:14px;">O link expira em 24 horas.</p>' +
      `<p style="margin-top:2rem;"><a href="https://${c.env.BASE_DOMAIN}" style="color:#6366F1">← Voltar</a></p>` +
      '</body></html>',
      403,
    );
  }
  if (tenant.status !== 'active') {
    return c.html(
      '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Conta indisponível</title></head>' +
      '<body style="font-family:sans-serif;text-align:center;padding:4rem;color:#374151">' +
      '<h1>Conta indisponível</h1><p>Esta conta está suspensa ou encerrada.</p>' +
      `<p><a href="https://${c.env.BASE_DOMAIN}" style="color:#6366F1">financaslivre.com</a></p>` +
      '</body></html>',
      tenant.status === 'deleted' ? 410 : 403,
    );
  }

  // Proxy to Pages project, preserving path + query.
  // Strip auth-sensitive headers: o pages.dev é um origin diferente, não deve receber
  // o JWT do CF Access nem cookies de sessão — risco de vazamento se houver
  // comprometimento ou logging no Pages.
  const pagesUrl = `https://${c.env.CF_PAGES_PROJECT}.pages.dev${url.pathname}${url.search}`;
  const filteredHeaders = new Headers(c.req.raw.headers);
  filteredHeaders.delete('cf-access-jwt-assertion');
  filteredHeaders.delete('cf-access-authenticated-user-email');
  filteredHeaders.delete('cf-access-authenticated-user-id');
  filteredHeaders.delete('cookie');
  filteredHeaders.delete('authorization');
  // host correto para o destino
  filteredHeaders.set('host', `${c.env.CF_PAGES_PROJECT}.pages.dev`);
  const res = await fetch(pagesUrl, {
    method: c.req.method,
    headers: filteredHeaders,
    body: c.req.raw.body,
    redirect: 'follow',
    // Evita Worker cachear HTML/JS antigo do Pages após deploy
    cf: { cacheTtl: 0, cacheEverything: false },
  } as RequestInit);
  // Também filtrar headers sensíveis da resposta (set-cookie do Pages não deve vazar
  // ao tenant — qualquer cookie deve vir do nosso próprio Worker).
  const respHeaders = new Headers(res.headers);
  respHeaders.delete('set-cookie');
  // CSP do tenant (middleware também aplica; reforça no Response cru do proxy)
  respHeaders.set('Content-Security-Policy', tenantCsp(c.env.CF_TEAM_DOMAIN));
  const ct = respHeaders.get('content-type') ?? '';
  if (ct.includes('text/html') || url.pathname === '/' || url.pathname.endsWith('.html')) {
    respHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    respHeaders.set('Pragma', 'no-cache');
  }
  return new Response(res.body, {
    status: res.status,
    headers: respHeaders,
  });
});

// ── Public ping (no auth — use for diagnostics) ───────────────────────────────
app.get('/api/ping', (c) => c.json({ ok: true, ts: new Date().toISOString(), v: '2' }));

// ── Public registration (no auth, Turnstile-protected, CORS open) ─────────────
app.use('/public/*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  if (c.req.method === 'OPTIONS') return c.text('', 204 as any);
  return next();
});
app.route('/', registerRoutes);

// ── CSRF: exigir header customizado em mutações ───────────────────────────────
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
app.use('/api/*', async (c, next) => {
  // /api/public/* (registro) é chamado por origin de outro subdomínio — exige CORS
  // (já configurado em /public/*) mas Turnstile já protege contra automação.
  if (c.req.path.startsWith('/api/public/')) return next();
  if (MUTATING.has(c.req.method)) {
    const xrw = c.req.header('X-Requested-With');
    if (xrw !== 'fetch') {
      return c.json({ error: 'CSRF guard: header X-Requested-With ausente.', code: 'CSRF_GUARD' }, 403);
    }
  }
  return next();
});

// ── Middleware: CF Access JWT ─────────────────────────────────────────────────
app.use('/api/*', async (c, next) => {
  const jwt = c.req.header('Cf-Access-Jwt-Assertion') ?? getCookie(c, 'CF_Authorization');
  if (!jwt) return c.json({ error: 'Não autenticado', code: 'NO_JWT' }, 401);

  try {
    if (!c.env.ZT_ADMIN_APP_AUD) {
      return c.json({ error: 'Admin app sem audience configurado.', code: 'ADMIN_MISCONFIGURED' }, 503);
    }
    const claims = await verifyAccessJWT(jwt, c.env.CF_TEAM_DOMAIN, c.env.ZT_ADMIN_APP_AUD);
    c.set('adminEmail', claims.email);
    c.set('adminSub',   claims.sub);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'JWT inválido';
    return c.json({ error: msg, code: 'INVALID_JWT' }, 401);
  }

  return next();
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', async (c) => {
  const count       = parseInt(await c.env.MKS_TENANTS.get('tenants:count') ?? '0');
  const d1FreeLimit = parseInt(c.env.D1_FREE_LIMIT);
  const d1PaidLimit = parseInt(c.env.D1_PAID_LIMIT);
  const ztFreeLimit = parseInt(c.env.ZT_FREE_LIMIT);

  const ztUsers = await countZTUsers(c.env.CF_ACCOUNT_ID, c.env.CF_ZT_TOKEN || c.env.CF_API_TOKEN);

  return c.json({
    ok: true,
    families: count,
    limits: {
      d1: {
        current:   count,
        freeLimit: d1FreeLimit,
        paidLimit: d1PaidLimit,
        alert:     count >= d1FreeLimit - 1,
        critical:  count >= d1PaidLimit - 1000,
      },
      zt: {
        current:   ztUsers,
        freeLimit: ztFreeLimit,
        alert:     ztUsers >= ztFreeLimit - 5,
      },
    },
    timestamp: new Date().toISOString(),
  });
});

// ── Limits ────────────────────────────────────────────────────────────────────
app.get('/api/limits', async (c) => {
  const count       = parseInt(await c.env.MKS_TENANTS.get('tenants:count') ?? '0');
  const d1FreeLimit = parseInt(c.env.D1_FREE_LIMIT);
  const d1PaidLimit = parseInt(c.env.D1_PAID_LIMIT);
  // Note: ztUsers not fetched here — /api/health already returns it; avoids duplicate CF API call

  const alerts: string[] = [];
  if (count >= d1FreeLimit - 1)
    alerts.push(`D1 Free: ${count}/${d1FreeLimit} databases — Atualize para Workers Paid ($5/mês) antes da próxima família.`);
  if (count >= d1PaidLimit - 1000)
    alerts.push(`D1 Paid: ${count}/${d1PaidLimit} — Planeje migração para Turso ($29/mês).`);

  return c.json({ families: count, alerts });
});

// ── Rotas ─────────────────────────────────────────────────────────────────────
app.route('/api', provisionRoutes);
app.route('/api', familyRoutes);
app.route('/api', migrationRoutes);
app.route('/api', nocRoutes);
app.route('/api', telemetryRoutes);
app.route('/api', communicationsRoutes);
app.route('/api', maintenanceRoutes);

// ── SPA ───────────────────────────────────────────────────────────────────────
app.get('*', (c) => {
  const nonce = c.get('cspNonce');
  c.header('Cache-Control', 'no-store');
  // Reforça CSP do painel (nonce) — evita regressão se Host/BASE_DOMAIN divergir
  c.header('Content-Security-Policy', adminCsp(nonce));
  return c.html(adminHtml(c.env.BASE_DOMAIN, nonce));
});

// ── Handler exportado: fetch (Hono) + scheduled (cron de manutenção) ─────────
// O cron de limpeza de pendentes só executa em modo destrutivo se AUTO_CLEANUP
// === 'true' (opt-in no wrangler.toml). Caso contrário, roda dry-run e loga.
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const apply = env.AUTO_CLEANUP === 'true';
    ctx.waitUntil(
      sweepPendingTenants(env, apply)
        .then(r => console.log(`[cron pending-cleanup] ${JSON.stringify(r)}`))
        .catch(e => console.log(`[cron pending-cleanup] erro: ${(e as Error).message}`)),
    );
  },
};
