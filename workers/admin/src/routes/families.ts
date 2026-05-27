import { Hono } from 'hono';
import type { Env, Tenant } from '../index';
import { deleteAccessApp, addPagesDomain, removeCfAccessDnsPlaceholder, listAccessApps, updateAccessAppName, deleteD1Database, deleteR2ObjectsWithPrefix } from '../lib/cf-api';

const router = new Hono<{ Bindings: Env }>();

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
  if (updates.name   !== undefined) tenant.name   = updates.name;
  if (updates.status !== undefined) tenant.status = updates.status;
  if (updates.tier   !== undefined) tenant.tier   = updates.tier;

  await c.env.MKS_TENANTS.put(`tenant:${subdomain}`, JSON.stringify(tenant));
  return c.json({ success: true, tenant });
});

// DELETE /api/families/:subdomain — HARD DELETE (LGPD compliance)
// Deletes D1 database, R2 objects, CF Access app, and all KV records
router.delete('/families/:subdomain', async (c) => {
  const { subdomain } = c.req.param();
  const tenant = await c.env.MKS_TENANTS.get<Tenant>(`tenant:${subdomain}`, 'json');
  if (!tenant) return c.json({ error: 'Família não encontrada.' }, 404);

  const { CF_ACCOUNT_ID, CF_API_TOKEN, CF_ZONE_ID, BASE_DOMAIN } = c.env;
  const errors: string[] = [];

  // Step 1: Delete all R2 objects with this family's prefix (LGPD — remove all documents)
  if (tenant.r2Bucket && tenant.r2Prefix) {
    try {
      const deletedCount = await deleteR2ObjectsWithPrefix(
        CF_ACCOUNT_ID, CF_API_TOKEN, tenant.r2Bucket, tenant.r2Prefix
      );
      console.log(`[DELETE ${subdomain}] R2: ${deletedCount} objetos deletados`);
    } catch (e) {
      errors.push(`R2: ${(e as Error).message}`);
    }
  }

  // Step 2: Delete D1 database (LGPD — remove all financial data)
  if (tenant.d1DatabaseId) {
    try {
      await deleteD1Database(CF_ACCOUNT_ID, CF_API_TOKEN, tenant.d1DatabaseId);
      console.log(`[DELETE ${subdomain}] D1 database ${tenant.d1DatabaseId} deletado`);
    } catch (e) {
      errors.push(`D1: ${(e as Error).message}`);
    }
  }

  // Step 3: Delete CF Access app
  if (tenant.accessAppId) {
    try {
      await deleteAccessApp(CF_ACCOUNT_ID, CF_API_TOKEN, tenant.accessAppId);
      console.log(`[DELETE ${subdomain}] CF Access app ${tenant.accessAppId} deletado`);
    } catch (e) {
      errors.push(`CF Access: ${(e as Error).message}`);
    }
  }

  // Step 4: Remove DNS placeholder (best-effort)
  try {
    await removeCfAccessDnsPlaceholder(CF_ZONE_ID, CF_API_TOKEN, `${subdomain}.${BASE_DOMAIN}`);
  } catch (e) {
    // Non-critical, just log
    console.log(`[DELETE ${subdomain}] DNS cleanup: ${(e as Error).message}`);
  }

  // Step 5: Remove from KV (tenant record + index)
  const index: string[] = JSON.parse(await c.env.MKS_TENANTS.get('tenants:index') ?? '[]');
  const newIndex = index.filter(s => s !== subdomain);
  
  await Promise.all([
    c.env.MKS_TENANTS.delete(`tenant:${subdomain}`),  // HARD DELETE from KV
    c.env.MKS_TENANTS.put('tenants:index', JSON.stringify(newIndex)),
    c.env.MKS_TENANTS.put('tenants:count', String(newIndex.length)),
  ]);

  console.log(`[DELETE ${subdomain}] Família completamente removida. Errors: ${errors.length}`);

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

export default router;
