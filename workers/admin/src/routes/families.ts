import { Hono } from 'hono';
import type { Env, Tenant, Variables } from '../index';
import { deleteAccessApp, addPagesDomain, removeCfAccessDnsPlaceholder, listAccessApps, updateAccessAppName, deleteD1Database, deleteR2ObjectsWithPrefix } from '../lib/cf-api';
import { isTenantStatus } from '../lib/tenant-constants';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

const DELETE_RL_MAX    = 3;
const DELETE_RL_WINDOW = 60; // seconds

/** Sanitiza string p/ logging — strip CR/LF/CTRL para evitar log injection. */
function safeLog(s: string): string {
  return String(s).replace(/[\r\n\t\x00-\x1F\x7F]+/g, '_').slice(0, 80);
}

async function writeAudit(
  kv: KVNamespace,
  entry: { action: string; actor: string; target: string; ip: string; result: string; details?: unknown },
): Promise<void> {
  const ts = new Date().toISOString();
  const id = `audit:${ts}:${entry.action}:${entry.target}`;
  const rec = { ...entry, ts };
  // 90 dias de retenção
  await kv.put(id, JSON.stringify(rec), { expirationTtl: 90 * 24 * 3600 });
}

// GET /api/families
router.get('/families', async (c) => {
  const index: string[] = JSON.parse(await c.env.MKS_TENANTS.get('tenants:index') ?? '[]');
  const tenants = (await Promise.all(
    index.map(sub => c.env.MKS_TENANTS.get<Tenant>(`tenant:${sub}`, 'json')),
  )).filter(Boolean) as Tenant[];
  return c.json({ families: tenants });
});

// GET /api/families/:subdomain
router.get('/families/:subdomain', async (c) => {
  const tenant = await c.env.MKS_TENANTS.get<Tenant>(`tenant:${c.req.param('subdomain')}`, 'json');
  if (!tenant) return c.json({ error: 'Família não encontrada.' }, 404);
  return c.json({ tenant });
});

// PUT /api/families/:subdomain
router.put('/families/:subdomain', async (c) => {
  const { subdomain } = c.req.param();
  const tenant = await c.env.MKS_TENANTS.get<Tenant>(`tenant:${subdomain}`, 'json');
  if (!tenant) return c.json({ error: 'Família não encontrada.' }, 404);

  const updates = await c.req.json<Partial<Pick<Tenant, 'name' | 'status' | 'tier'>>>();
  if (updates.name !== undefined) {
    const n = String(updates.name).trim();
    if (n.length < 2 || n.length > 60 || !/^[\p{L}\p{N} .'\-]+$/u.test(n))
      return c.json({ error: 'name: 2-60 caracteres, apenas letras, números, espaço, ponto, apóstrofo e hífen.' }, 400);
    tenant.name = n;
  }
  if (updates.status !== undefined) {
    if (!isTenantStatus(updates.status)) {
      return c.json({ error: 'status inválido. Use: pending | active | suspended | deleted.' }, 400);
    }
    tenant.status = updates.status;
  }
  if (updates.tier   !== undefined) tenant.tier   = updates.tier;
  // Admin pode aprovar upgrade de storage via storageTierBytes
  const rawTierBytes = (updates as any).storageTierBytes;
  if (rawTierBytes !== undefined) {
    const tb = parseInt(String(rawTierBytes), 10);
    if (isNaN(tb) || tb < 0) return c.json({ error: 'storageTierBytes inválido.' }, 400);
    (tenant as any).storageTierBytes = tb > 0 ? tb : undefined; // 0 = volta ao free
  }

  await c.env.MKS_TENANTS.put(`tenant:${subdomain}`, JSON.stringify(tenant));

  await writeAudit(c.env.MKS_ADMIN, {
    action: 'family.update',
    actor: c.get('adminEmail') ?? c.get('adminSub') ?? 'unknown',
    target: subdomain,
    ip: c.req.header('CF-Connecting-IP') ?? 'unknown',
    result: 'success',
    details: updates,
  });

  return c.json({ success: true, tenant });
});

// DELETE /api/families/:subdomain — HARD DELETE (LGPD compliance)
// Deletes D1 database, R2 objects, CF Access app, and all KV records
router.delete('/families/:subdomain', async (c) => {
  const { subdomain } = c.req.param();
  const actor = c.get('adminEmail') ?? c.get('adminSub') ?? 'unknown';
  const ip    = c.req.header('CF-Connecting-IP') ?? 'unknown';

  // 1. Confirmação server-side: header deve bater com o path param
  const confirmHeader = c.req.header('X-Confirm-Subdomain');
  if (confirmHeader !== subdomain) {
    await writeAudit(c.env.MKS_ADMIN, {
      action: 'family.delete', actor, target: subdomain, ip,
      result: 'rejected', details: 'missing or mismatched X-Confirm-Subdomain',
    });
    return c.json({
      error: 'Confirmação ausente. Envie header X-Confirm-Subdomain com o subdomínio exato.',
      code: 'CONFIRM_REQUIRED',
    }, 400);
  }

  // 2. Rate limit por admin (sub do JWT) — 3 deletes/min
  const rlKey = `ratelimit:family-delete:${c.get('adminSub') ?? actor}`;
  const rlRaw = await c.env.MKS_ADMIN.get(rlKey);
  const attempts = rlRaw ? parseInt(rlRaw, 10) : 0;
  if (attempts >= DELETE_RL_MAX) {
    await writeAudit(c.env.MKS_ADMIN, {
      action: 'family.delete', actor, target: subdomain, ip,
      result: 'rate_limited', details: `${attempts}/${DELETE_RL_MAX} per ${DELETE_RL_WINDOW}s`,
    });
    return c.json({
      error: `Limite de ${DELETE_RL_MAX} exclusões por minuto atingido. Aguarde.`,
      code: 'RATE_LIMITED',
    }, 429);
  }
  await c.env.MKS_ADMIN.put(rlKey, String(attempts + 1), { expirationTtl: DELETE_RL_WINDOW });

  const tenant = await c.env.MKS_TENANTS.get<Tenant>(`tenant:${subdomain}`, 'json');
  if (!tenant) {
    await writeAudit(c.env.MKS_ADMIN, {
      action: 'family.delete', actor, target: subdomain, ip,
      result: 'not_found',
    });
    return c.json({ error: 'Família não encontrada.' }, 404);
  }

  const { CF_ACCOUNT_ID, CF_API_TOKEN, CF_ZONE_ID, BASE_DOMAIN } = c.env;
  const errors: string[] = [];

  // Step 1: Delete all R2 objects with this family's prefix (LGPD — remove all documents)
  if (tenant.r2Bucket && tenant.r2Prefix) {
    try {
      const deletedCount = await deleteR2ObjectsWithPrefix(
        CF_ACCOUNT_ID, CF_API_TOKEN, tenant.r2Bucket, tenant.r2Prefix
      );
      console.log(`[DELETE ${safeLog(subdomain)}] R2: ${deletedCount} objetos deletados`);
    } catch (e) {
      errors.push(`R2: ${(e as Error).message}`);
    }
  }

  // Step 2: Delete D1 database (LGPD — remove all financial data)
  if (tenant.d1DatabaseId) {
    try {
      await deleteD1Database(CF_ACCOUNT_ID, CF_API_TOKEN, tenant.d1DatabaseId);
      console.log(`[DELETE ${safeLog(subdomain)}] D1 database ${safeLog(tenant.d1DatabaseId)} deletado`);
    } catch (e) {
      errors.push(`D1: ${(e as Error).message}`);
    }
  }

  // Step 3: Delete CF Access app
  if (tenant.accessAppId) {
    try {
      await deleteAccessApp(CF_ACCOUNT_ID, CF_API_TOKEN, tenant.accessAppId);
      console.log(`[DELETE ${safeLog(subdomain)}] CF Access app ${safeLog(tenant.accessAppId)} deletado`);
    } catch (e) {
      errors.push(`CF Access: ${(e as Error).message}`);
    }
  }

  // Step 4: Remove DNS placeholder (best-effort)
  try {
    await removeCfAccessDnsPlaceholder(CF_ZONE_ID, CF_API_TOKEN, `${subdomain}.${BASE_DOMAIN}`);
  } catch (e) {
    // Non-critical, just log
    console.log(`[DELETE ${safeLog(subdomain)}] DNS cleanup: ${safeLog((e as Error).message)}`);
  }

  // Step 5: Remove from KV (tenant record + index)
  const index: string[] = JSON.parse(await c.env.MKS_TENANTS.get('tenants:index') ?? '[]');
  const newIndex = index.filter(s => s !== subdomain);
  
  await Promise.all([
    c.env.MKS_TENANTS.delete(`tenant:${subdomain}`),  // HARD DELETE from KV
    c.env.MKS_TENANTS.put('tenants:index', JSON.stringify(newIndex)),
    c.env.MKS_TENANTS.put('tenants:count', String(newIndex.length)),
  ]);

  console.log(`[DELETE ${safeLog(subdomain)}] Família completamente removida. Errors: ${errors.length}`);

  await writeAudit(c.env.MKS_ADMIN, {
    action: 'family.delete', actor, target: subdomain, ip,
    result: errors.length === 0 ? 'success' : 'partial',
    details: { tenantName: tenant.name, d1: tenant.d1DatabaseId, errors },
  });

  return c.json({
    success: true,
    message: `Família "${tenant.name}" completamente removida (LGPD).`,
    errors: errors.length > 0 ? errors : undefined,
  });
});

// POST /api/families/:subdomain/repair
// Retroactively fixes DNS placeholder + CF Pages custom domain for a tenant
// provisioned before those steps were added to the provision flow.
router.post('/families/:subdomain/repair', async (c) => {
  const subdomain = c.req.param('subdomain');
  const { CF_ACCOUNT_ID, CF_API_TOKEN, CF_ZONE_ID, BASE_DOMAIN, CF_PAGES_PROJECT } = c.env;

  const raw = await c.env.MKS_TENANTS.get(`tenant:${subdomain}`);
  if (!raw) return c.json({ error: 'Tenant not found' }, 404);

  const results: Record<string, string> = {};

  // Fix DNS placeholder
  try {
    await removeCfAccessDnsPlaceholder(CF_ZONE_ID, CF_API_TOKEN, `${subdomain}.${BASE_DOMAIN}`);
    results.dns = 'ok';
  } catch (e) {
    results.dns = (e as Error).message;
  }

  // Register CF Pages custom domain
  if (CF_PAGES_PROJECT) {
    try {
      await addPagesDomain(CF_ACCOUNT_ID, CF_API_TOKEN, CF_PAGES_PROJECT, `${subdomain}.${BASE_DOMAIN}`);
      results.pages = 'ok';
    } catch (e) {
      results.pages = (e as Error).message;
    }
  }

  return c.json({ success: true, subdomain, results });
});

// POST /api/access/rename-apps
// Renames all CF Access apps whose name starts with "MKS Finanças" to "Finanças Livre"
router.post('/access/rename-apps', async (c) => {
  const { CF_ACCOUNT_ID, CF_API_TOKEN } = c.env;
  const apps = await listAccessApps(CF_ACCOUNT_ID, CF_API_TOKEN);
  const toRename = apps.filter(a => a.name.startsWith('MKS Finanças'));

  const results: { id: string; oldName: string; newName: string; status: string }[] = [];
  for (const app of toRename) {
    const newName = app.name.replace(/^MKS Finanças/, 'Finanças Livre');
    try {
      await updateAccessAppName(CF_ACCOUNT_ID, CF_API_TOKEN, app.id, newName);
      results.push({ id: app.id, oldName: app.name, newName, status: 'ok' });
    } catch (e) {
      results.push({ id: app.id, oldName: app.name, newName, status: (e as Error).message });
    }
  }
  return c.json({ renamed: results.length, results });
});

// ── GET /api/storage/upgrade-requests — lista pedidos de upgrade pendentes ────
router.get('/storage/upgrade-requests', async (c) => {
  const { keys } = await c.env.MKS_TENANTS.list({ prefix: 'upgrade-req:', limit: 100 });
  const requests = await Promise.all(
    keys.map(async k => {
      const raw = await c.env.MKS_TENANTS.get(k.name);
      return raw ? JSON.parse(raw) : null;
    }),
  );
  return c.json({ requests: requests.filter(Boolean) });
});

// ── POST /api/storage/upgrade-requests/:subdomain/approve ─────────────────────
// Ativa o plano pago (1 GB) para a família e limpa o pedido.
router.post('/storage/upgrade-requests/:subdomain/approve', async (c) => {
  const { subdomain } = c.req.param();
  const actor = c.get('adminEmail') ?? c.get('adminSub') ?? 'unknown';
  const ip    = c.req.header('CF-Connecting-IP') ?? 'unknown';

  const tenant = await c.env.MKS_TENANTS.get<Tenant>(`tenant:${subdomain}`, 'json');
  if (!tenant) return c.json({ error: 'Família não encontrada.' }, 404);

  const PAID_BYTES = 1_073_741_824; // 1 GB
  (tenant as any).storageTierBytes = PAID_BYTES;
  await c.env.MKS_TENANTS.put(`tenant:${subdomain}`, JSON.stringify(tenant));

  // Marcar pedido como aprovado
  const reqKey = `upgrade-req:${tenant.familyId}`;
  const existing = await c.env.MKS_TENANTS.get<any>(reqKey, 'json');
  if (existing) {
    await c.env.MKS_TENANTS.put(reqKey, JSON.stringify({ ...existing, status: 'approved', approvedAt: new Date().toISOString(), approvedBy: actor }), { expirationTtl: 7 * 24 * 3600 });
  }

  await writeAudit(c.env.MKS_ADMIN, {
    action: 'storage.upgrade.approve', actor, target: subdomain, ip,
    result: 'success', details: { newLimitBytes: PAID_BYTES },
  });

  return c.json({ success: true, storageTierBytes: PAID_BYTES });
});

export default router;
