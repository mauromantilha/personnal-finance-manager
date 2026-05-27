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

// ── Env bindings ──────────────────────────────────────────────────────────────
export interface Env {
  MKS_TENANTS:  KVNamespace;
  MKS_ADMIN:    KVNamespace;
  CF_ACCOUNT_ID:    string;
  CF_ZONE_ID:       string;
  CF_TUNNEL_ID:     string;
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
}

export interface Tenant {
  name:           string;
  subdomain:      string;
  familyId:       string;
  tier:           1 | 2;
  d1DatabaseId:   string;
  r2Bucket:       string;
  r2Prefix:       string;
  accessAppId:    string;
  accessAppAud:   string;
  accessPolicyId: string;
  ownerEmailHash: string;
  status:         'active' | 'suspended' | 'deleted';
  createdAt:      string;
}

const app = new Hono<{ Bindings: Env }>();

// ── Security headers ──────────────────────────────────────────────────────────
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' https://api.dicebear.com data:; connect-src 'self'; frame-ancestors 'none'");
});

// ── Tenant frontend proxy ─────────────────────────────────────────────────────
// For subdomains other than admin.*, proxy all traffic to the CF Pages project.
// This avoids per-tenant CF Pages custom domain registration entirely.
app.all('*', async (c, next) => {
  const url = new URL(c.req.url);
  const hostname = url.hostname;
  if (hostname === `admin.${c.env.BASE_DOMAIN}`) return next();
  // Public API paths (registration, etc.) — bypass proxy so Worker handles them
  if (url.pathname.startsWith('/public/') || url.pathname.startsWith('/api/public/')) return next();

  // Only serve SPA for provisioned, active tenants — reject unknown subdomains
  const subdomain = hostname.split('.')[0];
  const tenant = await c.env.MKS_TENANTS.get<Tenant>(`tenant:${subdomain}`, 'json');
  if (!tenant || tenant.status !== 'active') {
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

  // Proxy to Pages project, preserving path + query
  const pagesUrl = `https://${c.env.CF_PAGES_PROJECT}.pages.dev${url.pathname}${url.search}`;
  const res = await fetch(pagesUrl, {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body,
    redirect: 'follow',
  });
  return new Response(res.body, {
    status: res.status,
    headers: res.headers,
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

// ── Middleware: CF Access JWT ─────────────────────────────────────────────────
app.use('/api/*', async (c, next) => {
  const jwt = c.req.header('Cf-Access-Jwt-Assertion') ?? getCookie(c, 'CF_Authorization');
  if (!jwt) return c.json({ error: 'Não autenticado', code: 'NO_JWT' }, 401);

  try {
    const expectedAud = c.env.ZT_ADMIN_APP_AUD || undefined;
    await verifyAccessJWT(jwt, c.env.CF_TEAM_DOMAIN, expectedAud);
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

// ── SPA ───────────────────────────────────────────────────────────────────────
app.get('*', (c) => {
  c.header('Cache-Control', 'no-store');
  return c.html(adminHtml(c.env.BASE_DOMAIN));
});

export default app;
