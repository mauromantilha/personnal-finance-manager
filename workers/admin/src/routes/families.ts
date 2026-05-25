import { Hono } from 'hono';
import type { Env, Tenant } from '../index';
import { deleteAccessApp } from '../lib/cf-api';

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

// DELETE /api/families/:subdomain — soft delete
router.delete('/families/:subdomain', async (c) => {
  const { subdomain } = c.req.param();
  const tenant = await c.env.MKS_TENANTS.get<Tenant>(`tenant:${subdomain}`, 'json');
  if (!tenant) return c.json({ error: 'Família não encontrada.' }, 404);

  tenant.status = 'deleted';
  await c.env.MKS_TENANTS.put(`tenant:${subdomain}`, JSON.stringify(tenant));

  const index: string[] = JSON.parse(await c.env.MKS_TENANTS.get('tenants:index') ?? '[]');
  const newIndex = index.filter(s => s !== subdomain);
  await Promise.all([
    c.env.MKS_TENANTS.put('tenants:index', JSON.stringify(newIndex)),
    c.env.MKS_TENANTS.put('tenants:count', String(newIndex.length)),
  ]);

  if (tenant.accessAppId && c.env.CF_API_TOKEN) {
    c.executionCtx.waitUntil(
      deleteAccessApp(c.env.CF_ACCOUNT_ID, c.env.CF_API_TOKEN, tenant.accessAppId).catch(() => {}),
    );
  }

  return c.json({ success: true });
});

export default router;
