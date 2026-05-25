import { Hono }      from 'hono';
import { getCookie } from 'hono/cookie';

import { verifyAccessJWT } from './lib/access';
import { countZTUsers }    from './lib/cf-api';
import { ADMIN_HTML }      from './html';

import provisionRoutes  from './routes/provision';
import familyRoutes     from './routes/families';
import migrationRoutes  from './routes/migrations';

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
  D1_FREE_LIMIT:    string;
  D1_PAID_LIMIT:    string;
  ZT_FREE_LIMIT:    string;
  CF_API_TOKEN:   string;
  ADMIN_PASSWORD: string;
  RESEND_API_KEY: string;
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

  const ztUsers = await countZTUsers(c.env.CF_ACCOUNT_ID, c.env.CF_API_TOKEN);

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
  const ztFreeLimit = parseInt(c.env.ZT_FREE_LIMIT);
  const ztUsers     = await countZTUsers(c.env.CF_ACCOUNT_ID, c.env.CF_API_TOKEN);

  const alerts: string[] = [];
  if (count >= d1FreeLimit - 1)
    alerts.push(`D1 Free: ${count}/${d1FreeLimit} databases — Atualize para Workers Paid ($5/mês) antes da próxima família.`);
  if (count >= d1PaidLimit - 1000)
    alerts.push(`D1 Paid: ${count}/${d1PaidLimit} — Planeje migração para Turso ($29/mês).`);
  if (ztUsers >= ztFreeLimit - 5)
    alerts.push(`Zero Trust Free: ${ztUsers}/${ztFreeLimit} usuários — Limite próximo.`);

  return c.json({ families: count, ztUsers, alerts });
});

// ── Rotas ─────────────────────────────────────────────────────────────────────
app.route('/api', provisionRoutes);
app.route('/api', familyRoutes);
app.route('/api', migrationRoutes);

// ── SPA ───────────────────────────────────────────────────────────────────────
app.get('*', (c) => c.html(ADMIN_HTML));

export default app;
