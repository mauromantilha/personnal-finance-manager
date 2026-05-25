import { Hono } from 'hono';
import type { Env, Tenant } from '../index';
import { execD1 } from '../lib/cf-api';

const router = new Hono<{ Bindings: Env }>();

function splitSQL(sql: string): string[] {
  return sql.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'));
}

// POST /api/migrations/apply — apply SQL to one family
router.post('/migrations/apply', async (c) => {
  const { subdomain, sql } = await c.req.json<any>();
  if (!subdomain || !sql) return c.json({ error: 'subdomain e sql são obrigatórios.' }, 400);

  const tenant = await c.env.MKS_TENANTS.get<Tenant>(`tenant:${subdomain}`, 'json');
  if (!tenant) return c.json({ error: 'Família não encontrada.' }, 404);

  const stmts  = splitSQL(String(sql));
  const errors: string[] = [];
  let applied = 0;

  for (const stmt of stmts) {
    try {
      await execD1(c.env.CF_ACCOUNT_ID, c.env.CF_API_TOKEN, tenant.d1DatabaseId, stmt + ';');
      applied++;
    } catch (e) {
      errors.push(`${(e as Error).message} | ${stmt.slice(0, 80)}`);
    }
  }

  return c.json({ success: errors.length === 0, applied, errors });
});

// POST /api/migrations/apply-all — apply SQL to every active family
router.post('/migrations/apply-all', async (c) => {
  const { sql } = await c.req.json<any>();
  if (!sql) return c.json({ error: 'sql é obrigatório.' }, 400);

  const index: string[] = JSON.parse(await c.env.MKS_TENANTS.get('tenants:index') ?? '[]');
  const results: Record<string, { applied: number; errors: string[] }> = {};

  for (const subdomain of index) {
    const tenant = await c.env.MKS_TENANTS.get<Tenant>(`tenant:${subdomain}`, 'json');
    if (!tenant || tenant.status !== 'active') continue;

    const stmts  = splitSQL(String(sql));
    const errors: string[] = [];
    let applied = 0;

    for (const stmt of stmts) {
      try {
        await execD1(c.env.CF_ACCOUNT_ID, c.env.CF_API_TOKEN, tenant.d1DatabaseId, stmt + ';');
        applied++;
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    results[subdomain] = { applied, errors };
  }

  return c.json({ results });
});

export default router;
