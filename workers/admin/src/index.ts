import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';

// ── Env bindings ─────────────────────────────────────────────────────────────
export interface Env {
  // KV
  MKS_TENANTS: KVNamespace;
  MKS_ADMIN:   KVNamespace;
  // Vars
  CF_ACCOUNT_ID:  string;
  CF_ZONE_ID:     string;
  CF_TUNNEL_ID:   string;
  CF_TEAM_DOMAIN: string;
  BASE_DOMAIN:    string;
  D1_FREE_LIMIT:  string;
  D1_PAID_LIMIT:  string;
  ZT_FREE_LIMIT:  string;
  // Secrets
  CF_API_TOKEN:  string;
  ADMIN_PASSWORD: string;
  RESEND_API_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

// ── Middleware: CF Access JWT para o admin ────────────────────────────────────
// Sprint 4: implementar verifyAccessJWT
// Por ora: verifica header manual para não bloquear desenvolvimento
app.use('/api/*', async (c, next) => {
  const jwt  = c.req.header('Cf-Access-Jwt-Assertion')
             ?? getCookie(c, 'CF_Authorization');
  const prod = c.req.header('host')?.includes('admin.mksbrasil.com') ?? false;

  // Em produção CF Access garante que só o admin chega aqui com JWT válido
  if (prod && !jwt) return c.json({ error: 'Não autenticado' }, 401);

  // Sprint 4: verifyAccessJWT(jwt, c.env.CF_TEAM_DOMAIN)
  return next();
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', async (c) => {
  const count = parseInt(await c.env.MKS_TENANTS.get('tenants:count') ?? '0');
  const d1FreeLimit  = parseInt(c.env.D1_FREE_LIMIT);
  const d1PaidLimit  = parseInt(c.env.D1_PAID_LIMIT);
  const ztFreeLimit  = parseInt(c.env.ZT_FREE_LIMIT);

  return c.json({
    ok: true,
    families: count,
    limits: {
      d1: {
        current: count,
        freeLimit: d1FreeLimit,
        paidLimit: d1PaidLimit,
        alert: count >= d1FreeLimit - 1,
        critical: count >= d1PaidLimit - 1000,
      },
      zt: {
        freeLimit: ztFreeLimit,
        alert: false, // Sprint 4: consultar CF API
      },
    },
    timestamp: new Date().toISOString(),
  });
});

// ── Limites do sistema ────────────────────────────────────────────────────────
app.get('/api/limits', async (c) => {
  const count       = parseInt(await c.env.MKS_TENANTS.get('tenants:count') ?? '0');
  const d1FreeLimit = parseInt(c.env.D1_FREE_LIMIT);
  const d1PaidLimit = parseInt(c.env.D1_PAID_LIMIT);

  const alerts: string[] = [];
  if (count >= d1FreeLimit - 1) {
    alerts.push(`D1 Free: ${count}/${d1FreeLimit} — Atualize para Workers Paid ($5/mês) antes da próxima família.`);
  }
  if (count >= d1PaidLimit - 1000) {
    alerts.push(`D1 Paid: ${count}/${d1PaidLimit} — Planeje migração para Turso ($29/mês).`);
  }

  return c.json({ families: count, alerts });
});

// ── Rotas principais (implementadas no Sprint 4) ──────────────────────────────
app.all('/api/families*',   (c) => c.json({ sprint: 4, status: 'pending' }));
app.all('/api/provision*',  (c) => c.json({ sprint: 4, status: 'pending' }));
app.all('/api/migrations*', (c) => c.json({ sprint: 4, status: 'pending' }));
app.all('/api/email*',      (c) => c.json({ sprint: 4, status: 'pending' }));
app.all('/api/lgpd*',       (c) => c.json({ sprint: 4, status: 'pending' }));

// ── SPA Admin (Sprint 4: substituir pelo html.ts completo) ───────────────────
app.get('*', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>MKS Admin — Sprint 0</title>
  <style>
    body { font-family: monospace; background: #0f172a; color: #94a3b8;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; }
    .box { text-align: center; }
    h1 { color: #6366f1; font-size: 1.5rem; }
    p  { color: #64748b; font-size: .9rem; }
    .badge { background: #1e293b; border: 1px solid #334155;
             padding: 4px 12px; border-radius: 9999px; font-size: .75rem; }
  </style>
</head>
<body>
  <div class="box">
    <h1>🏛️ MKS Finanças Admin</h1>
    <p>Worker online — Sprint 0 concluído</p>
    <p><span class="badge">Sprint 4 → SPA completa</span></p>
  </div>
</body>
</html>`);
});

export default app;
