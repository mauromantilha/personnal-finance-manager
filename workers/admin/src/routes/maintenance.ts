/**
 * Manutenção — limpeza de tenants `pending` órfãos.
 *
 * Cadastro público guarda stub KV até o verify; D1/Access só nascem no
 * POST /public/verify. Pendentes antigos (fluxo legado) podem ter D1+Access
 * sem confirmação. Esta varredura remove tenants `pending` com mais de
 * PENDING_MAX_AGE_HOURS (KV + infra se existir).
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
    if (t.status !== 'pending') continue;
    const ageHours = (now - new Date(t.createdAt).getTime()) / 3_600_000;
    if (!Number.isFinite(ageHours) || ageHours < PENDING_MAX_AGE_HOURS) continue;
    result.eligible.push({ subdomain: t.subdomain, ageHours: Math.round(ageHours) });
    toDelete.push(t);
  }

  if (!apply) return result;

  const { CF_ACCOUNT_ID, CF_API_TOKEN, CF_ZONE_ID, BASE_DOMAIN } = env;
  let newIndex = index.slice();

  for (const t of toDelete) {
    try {
      if (t.r2Bucket && t.r2Prefix)
        await deleteR2ObjectsWithPrefix(CF_ACCOUNT_ID, CF_API_TOKEN, t.r2Bucket, t.r2Prefix);
      if (t.d1DatabaseId)
        await deleteD1Database(CF_ACCOUNT_ID, CF_API_TOKEN, t.d1DatabaseId);
      if (t.accessAppId)
        await deleteAccessApp(CF_ACCOUNT_ID, CF_API_TOKEN, t.accessAppId);
      try { await removeCfAccessDnsPlaceholder(CF_ZONE_ID, CF_API_TOKEN, `${t.subdomain}.${BASE_DOMAIN}`); }
      catch { /* best-effort */ }

      const kvDeletes: Promise<void>[] = [
        env.MKS_TENANTS.delete(`tenant:${t.subdomain}`),
      ];
      if (t.ownerEmailHash) kvDeletes.push(env.MKS_TENANTS.delete(`email:${t.ownerEmailHash}`));
      if (t.cpfHash)        kvDeletes.push(env.MKS_TENANTS.delete(`cpf2:${t.cpfHash}`));
      if (t.verifyTokenId)  kvDeletes.push(env.MKS_TENANTS.delete(`verify:${t.verifyTokenId}`));
      await Promise.all(kvDeletes);

      newIndex = newIndex.filter(s => s !== t.subdomain);
      result.deleted.push(t.subdomain);
      console.log(`[pending-cleanup] removido ${safeLog(t.subdomain)}`);
    } catch (e) {
      result.errors.push({ subdomain: t.subdomain, error: (e as Error).message });
    }
  }

  await Promise.all([
    env.MKS_TENANTS.put('tenants:index', JSON.stringify(newIndex)),
    env.MKS_TENANTS.put('tenants:count', String(newIndex.length)),
  ]);

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
