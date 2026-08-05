/**
 * Migrations versionadas — aceita apenas arquivos em workers/admin/migrations/.
 * SQL arbitrário do cliente foi removido (PR E / auditoria).
 */
import { Hono } from 'hono';
import type { Env, Tenant } from '../index';
import { execD1 } from '../lib/cf-api';
// @ts-ignore — wrangler Text rule
import SQL_0020 from '../../migrations/0020_indexes.sql';

const router = new Hono<{ Bindings: Env }>();

const MIGRATION_CATALOG: Record<string, string> = {
  '0020_indexes': SQL_0020 as string,
};

function splitSQL(sql: string): string[] {
  return sql
    .split('\n')
    .map(line => (line.trim().startsWith('--') ? '' : line))
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

async function d1Query(
  accountId: string,
  apiToken: string,
  dbId: string,
  sql: string,
  params: unknown[] = [],
): Promise<Record<string, unknown>[]> {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    },
  );
  const data = await r.json() as {
    success: boolean;
    errors?: unknown;
    result?: { success?: boolean; results?: Record<string, unknown>[] }[];
  };
  if (!data.success || !data.result?.[0]?.success) {
    throw new Error(JSON.stringify(data.errors ?? data));
  }
  return data.result[0].results ?? [];
}

async function migrationAlreadyApplied(
  accountId: string,
  apiToken: string,
  dbId: string,
  version: string,
): Promise<boolean> {
  try {
    const rows = await d1Query(
      accountId, apiToken, dbId,
      'SELECT 1 AS ok FROM schema_migrations WHERE version = ? LIMIT 1',
      [version],
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function applyVersionedMigration(
  accountId: string,
  apiToken: string,
  tenant: Tenant,
  version: string,
  dryRun: boolean,
): Promise<{ applied: number; skipped: boolean; errors: string[] }> {
  const sql = MIGRATION_CATALOG[version];
  if (!sql) return { applied: 0, skipped: false, errors: [`Versão desconhecida: ${version}`] };
  if (!tenant.d1DatabaseId) return { applied: 0, skipped: false, errors: ['Tenant sem D1.'] };

  const already = await migrationAlreadyApplied(accountId, apiToken, tenant.d1DatabaseId, version);
  if (already) return { applied: 0, skipped: true, errors: [] };

  const stmts = splitSQL(sql);
  if (dryRun) return { applied: stmts.length, skipped: false, errors: [] };

  const errors: string[] = [];
  let applied = 0;
  for (const stmt of stmts) {
    try {
      await execD1(accountId, apiToken, tenant.d1DatabaseId, stmt + ';');
      applied++;
    } catch (e) {
      const msg = (e as Error).message ?? '';
      if (msg.includes('already exists')) { applied++; continue; }
      errors.push(`${msg} | ${stmt.slice(0, 80)}`);
    }
  }

  if (errors.length === 0) {
    try {
      await d1Query(
        accountId, apiToken, tenant.d1DatabaseId,
        'INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)',
        [version],
      );
    } catch (e) {
      errors.push(`schema_migrations: ${(e as Error).message}`);
    }
  }

  return { applied, skipped: false, errors };
}

router.get('/migrations', (c) => {
  return c.json({ versions: Object.keys(MIGRATION_CATALOG).sort() });
});

router.post('/migrations/apply', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}));
  const { subdomain, version, dryRun = false } = body ?? {};
  if (!subdomain || !version) {
    return c.json({ error: 'subdomain e version são obrigatórios. SQL livre não é mais aceito.' }, 400);
  }
  if (!MIGRATION_CATALOG[version]) {
    return c.json({
      error: `Versão desconhecida. Disponíveis: ${Object.keys(MIGRATION_CATALOG).join(', ')}`,
    }, 400);
  }

  const tenant = await c.env.MKS_TENANTS.get<Tenant>(`tenant:${subdomain}`, 'json');
  if (!tenant) return c.json({ error: 'Família não encontrada.' }, 404);

  const result = await applyVersionedMigration(
    c.env.CF_ACCOUNT_ID, c.env.CF_API_TOKEN, tenant, version, !!dryRun,
  );
  return c.json({
    success: result.errors.length === 0,
    dryRun: !!dryRun,
    version,
    subdomain,
    ...result,
  });
});

router.post('/migrations/apply-all', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}));
  const { version, dryRun = false } = body ?? {};
  if (!version) {
    return c.json({ error: 'version é obrigatório. SQL livre não é mais aceito.' }, 400);
  }
  if (!MIGRATION_CATALOG[version]) {
    return c.json({
      error: `Versão desconhecida. Disponíveis: ${Object.keys(MIGRATION_CATALOG).join(', ')}`,
    }, 400);
  }

  const index: string[] = JSON.parse(await c.env.MKS_TENANTS.get('tenants:index') ?? '[]');
  const results: Record<string, { applied: number; skipped: boolean; errors: string[] }> = {};

  for (const subdomain of index) {
    const tenant = await c.env.MKS_TENANTS.get<Tenant>(`tenant:${subdomain}`, 'json');
    if (!tenant || tenant.status !== 'active') continue;
    results[subdomain] = await applyVersionedMigration(
      c.env.CF_ACCOUNT_ID, c.env.CF_API_TOKEN, tenant, version, !!dryRun,
    );
  }

  return c.json({ dryRun: !!dryRun, version, results });
});

export default router;
