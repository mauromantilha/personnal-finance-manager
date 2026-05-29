import { Hono } from 'hono';
import type { Env, Tenant } from '../index';

const CF  = 'https://api.cloudflare.com/client/v4';
const hdr = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

const router = new Hono<{ Bindings: Env }>();

// GET /api/noc — aggregate D1 sizes + R2 buckets for all tenants
router.get('/noc', async (c) => {
  const index: string[] = JSON.parse(await c.env.MKS_TENANTS.get('tenants:index') ?? '[]');
  const tenants = (await Promise.all(
    index.map(s => c.env.MKS_TENANTS.get<Tenant>(`tenant:${s}`, 'json')),
  )).filter(Boolean) as Tenant[];

  // Fetch D1 info for each tenant in parallel (5 s timeout each)
  const d1Results = await Promise.allSettled(
    tenants.map(async (t) => {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 5000);
      try {
        const res = await fetch(
          `${CF}/accounts/${c.env.CF_ACCOUNT_ID}/d1/database/${t.d1DatabaseId}`,
          { headers: hdr(c.env.CF_API_TOKEN), signal: ctrl.signal },
        );
        clearTimeout(tid);
        const d = await res.json() as { success: boolean; result: any };
        return {
          subdomain:  t.subdomain,
          name:       t.name,
          tier:       t.tier,
          status:     t.status,
          dbId:       t.d1DatabaseId,
          fileSize:   d.result?.file_size  ?? 0,
          numTables:  d.result?.num_tables ?? 0,
        };
      } catch {
        clearTimeout(tid);
        return {
          subdomain: t.subdomain, name: t.name, tier: t.tier,
          status: t.status, dbId: t.d1DatabaseId, fileSize: 0, numTables: 0, error: true,
        };
      }
    }),
  );

  const databases = d1Results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : {
      subdomain: tenants[i].subdomain, name: tenants[i].name, tier: tenants[i].tier,
      status: tenants[i].status, dbId: tenants[i].d1DatabaseId, fileSize: 0, numTables: 0, error: true,
    },
  );

  // R2 bucket list (best-effort, 5 s timeout)
  let r2Buckets: { name: string; creation_date?: string }[] = [];
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 5000);
    const res  = await fetch(`${CF}/accounts/${c.env.CF_ACCOUNT_ID}/r2/buckets`, {
      headers: hdr(c.env.CF_API_TOKEN), signal: ctrl.signal,
    });
    clearTimeout(tid);
    const d = await res.json() as { success: boolean; result: { buckets: any[] } };
    r2Buckets = d.result?.buckets ?? [];
  } catch { /* best-effort */ }

  return c.json({
    summary: {
      total:         tenants.length,
      active:        tenants.filter(t => t.status === 'active').length,
      suspended:     tenants.filter(t => t.status === 'suspended').length,
      deleted:       tenants.filter(t => t.status === 'deleted').length,
      totalD1Bytes:  databases.reduce((s, d) => s + (d.fileSize ?? 0), 0),
    },
    databases,
    r2Buckets,
    timestamp: new Date().toISOString(),
  });
});

// GET /api/families/:subdomain/stats — D1 row counts for one family
router.get('/families/:subdomain/stats', async (c) => {
  const { subdomain } = c.req.param();
  const tenant = await c.env.MKS_TENANTS.get<Tenant>(`tenant:${subdomain}`, 'json');
  if (!tenant) return c.json({ error: 'Família não encontrada.' }, 404);

  const ALLOWED_TABLES = new Set([
    'transactions', 'accounts', 'credit_cards', 'categories',
    'investments', 'users', 'goals', 'recurrences',
  ]);
  const tables = Array.from(ALLOWED_TABLES);
  const rows: Record<string, number> = {};

  await Promise.allSettled(tables.map(async (table) => {
    // Defesa em profundidade: nunca enviar nome de tabela vindo de input ao D1.
    if (!ALLOWED_TABLES.has(table)) throw new Error('table not allowed');
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(
        `${CF}/accounts/${c.env.CF_ACCOUNT_ID}/d1/database/${tenant.d1DatabaseId}/query`,
        {
          method: 'POST',
          headers: hdr(c.env.CF_API_TOKEN),
          body: JSON.stringify({ sql: `SELECT COUNT(*) AS n FROM ${table}` }),
          signal: ctrl.signal,
        },
      );
      clearTimeout(tid);
      const d = await res.json() as any;
      rows[table] = d.result?.[0]?.results?.[0]?.n ?? 0;
    } catch {
      clearTimeout(tid);
      rows[table] = -1;
    }
  }));

  // D1 database metadata (best-effort)
  let dbInfo: { file_size?: number; num_tables?: number } = {};
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 5000);
    const res  = await fetch(
      `${CF}/accounts/${c.env.CF_ACCOUNT_ID}/d1/database/${tenant.d1DatabaseId}`,
      { headers: hdr(c.env.CF_API_TOKEN), signal: ctrl.signal },
    );
    clearTimeout(tid);
    const d = await res.json() as any;
    dbInfo = d.result ?? {};
  } catch { /* best-effort */ }

  return c.json({
    tenant,
    d1:   { fileSize: dbInfo.file_size ?? 0, numTables: dbInfo.num_tables ?? 0 },
    rows,
    timestamp: new Date().toISOString(),
  });
});

export default router;
