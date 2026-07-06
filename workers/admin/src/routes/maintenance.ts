/**
 * Manutenção — limpeza de tenants `pending` órfãos.
 *
 * O fluxo de registro cria D1 + CF Access app ANTES da verificação de e-mail.
 * Se o dono nunca confirma, esses recursos ficam órfãos (contam contra o limite
 * de bancos D1 e poluem o Zero Trust). Esta varredura remove tenants que ficaram
 * em `pending` por mais de PENDING_MAX_AGE_HOURS.
 *
 * Segurança: destrutivo. Só age em status === 'pending' acima do limiar de idade.
 * A rota HTTP é dry-run por padrão (exige ?apply=1). O cron só executa em modo
 * apply se AUTO_CLEANUP === 'true' (opt-in explícito no wrangler.toml).
 */
import { Hono } from 'hono';
import type { Env, Tenant, Variables } from '../index';
import {
  deleteAccessApp, deleteD1Database, deleteR2ObjectsWithPrefix, removeCfAccessDnsPlaceholder,
} from '../lib/cf-api';

const PENDING_MAX_AGE_HOURS = 48;
const CLEANUP_LOCK_TTL_SECONDS = 15 * 60;

export interface SweepResult {
  dryRun:   boolean;
  scanned:  number;
  eligible: { subdomain: string; ageHours: number }[];
  deleted:  string[];
  errors:   { subdomain: string; error: string }[];
}

/** Sanitiza string p/ logging — strip CR/LF/CTRL para evitar log injection. */
function safeLog(s: string): string {
  return String(s).replace(/[\r\n\t\x00-\x1F\x7F]+/g, '_').slice(0, 80);
}

function eligiblePendingAgeHours(t: Tenant, now: number): number | null {
  if (t.status !== 'pending') return null;
  const ageHours = (now - new Date(t.createdAt).getTime()) / 3_600_000;
  if (!Number.isFinite(ageHours) || ageHours < PENDING_MAX_AGE_HOURS) return null;
  return ageHours;
}

async function findCpf2KeysForTenant(env: Env, tenant: Tenant): Promise<string[]> {
  const keys = new Set<string>();
  if (tenant.cpfHash) {
    keys.add(`cpf2:${tenant.cpfHash}`);
    return [...keys];
  }

  let cursor: string | undefined;
  do {
    const page = await env.MKS_TENANTS.list({ prefix: 'cpf2:', cursor });
    const matches = await Promise.all(page.keys.map(async ({ name }) => {
      const familyId = await env.MKS_TENANTS.get(name);
      return familyId === tenant.familyId ? name : null;
    }));
    for (const name of matches) {
      if (name) keys.add(name);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return [...keys];
}

export async function sweepPendingTenants(env: Env, apply: boolean): Promise<SweepResult> {
  const index: string[] = JSON.parse(await env.MKS_TENANTS.get('tenants:index') ?? '[]');
  const now = Date.now();
  const result: SweepResult = { dryRun: !apply, scanned: 0, eligible: [], deleted: [], errors: [] };

  const tenants = await Promise.all(
    index.map(sub => env.MKS_TENANTS.get<Tenant>(`tenant:${sub}`, 'json')),
  );

  const toDelete: Tenant[] = [];
  for (const t of tenants) {
    if (!t) continue;
    result.scanned++;
    const ageHours = eligiblePendingAgeHours(t, now);
    if (ageHours === null) continue;
    result.eligible.push({ subdomain: t.subdomain, ageHours: Math.round(ageHours) });
    toDelete.push(t);
  }

  if (!apply) return result;

  const { CF_ACCOUNT_ID, CF_API_TOKEN, CF_ZONE_ID, BASE_DOMAIN } = env;
  let newIndex = index.slice();

  for (const t of toDelete) {
    const cleanupLockKey = `cleanup:${t.subdomain}`;
    try {
      await env.MKS_TENANTS.put(cleanupLockKey, '1', { expirationTtl: CLEANUP_LOCK_TTL_SECONDS });

      const current = await env.MKS_TENANTS.get<Tenant>(`tenant:${t.subdomain}`, 'json');
      if (!current) continue;
      const ageHours = eligiblePendingAgeHours(current, now);
      if (ageHours === null) continue;
      if (await env.MKS_TENANTS.get(`verify:${current.subdomain}`)) continue;

      const cpf2Keys = await findCpf2KeysForTenant(env, current);
      const tenantKey = `tenant:${current.subdomain}`;
      const nextIndex = newIndex.filter(s => s !== current.subdomain);

      await env.MKS_TENANTS.put(tenantKey, JSON.stringify({ ...current, status: 'deleted' }));
      await Promise.all([
        env.MKS_TENANTS.put('tenants:index', JSON.stringify(nextIndex)),
        env.MKS_TENANTS.put('tenants:count', String(nextIndex.length)),
        current.ownerEmailHash ? env.MKS_TENANTS.delete(`email:${current.ownerEmailHash}`) : Promise.resolve(),
        ...cpf2Keys.map(key => env.MKS_TENANTS.delete(key)),
      ]);
      newIndex = nextIndex;

      if (current.r2Bucket && current.r2Prefix)
        await deleteR2ObjectsWithPrefix(CF_ACCOUNT_ID, CF_API_TOKEN, current.r2Bucket, current.r2Prefix);
      if (current.d1DatabaseId)
        await deleteD1Database(CF_ACCOUNT_ID, CF_API_TOKEN, current.d1DatabaseId);
      if (current.accessAppId)
        await deleteAccessApp(CF_ACCOUNT_ID, CF_API_TOKEN, current.accessAppId);
      try { await removeCfAccessDnsPlaceholder(CF_ZONE_ID, CF_API_TOKEN, `${current.subdomain}.${BASE_DOMAIN}`); }
      catch { /* best-effort */ }

      await env.MKS_TENANTS.delete(tenantKey);

      result.deleted.push(current.subdomain);
      console.log(`[pending-cleanup] removido ${safeLog(current.subdomain)}`);
    } catch (e) {
      result.errors.push({ subdomain: t.subdomain, error: (e as Error).message });
    } finally {
      try { await env.MKS_TENANTS.delete(cleanupLockKey); }
      catch { /* best-effort */ }
    }
  }

  return result;
}

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /api/maintenance/pending-cleanup?apply=1
// Sem apply → dry-run (só lista o que seria removido). Requer JWT admin (middleware global).
router.post('/maintenance/pending-cleanup', async (c) => {
  const apply = c.req.query('apply') === '1' || c.req.query('apply') === 'true';
  const result = await sweepPendingTenants(c.env, apply);
  return c.json(result);
});

export default router;
