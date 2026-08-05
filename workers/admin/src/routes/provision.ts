import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import {
  createD1Database, execD1Batch, createAccessApp, createAccessPolicy,
  addPagesDomain, removeCfAccessDnsPlaceholder, deleteD1Database, deleteAccessApp,
} from '../lib/cf-api';
import { sendWelcomeEmail } from '../lib/resend';
import { isReservedSubdomain } from '../lib/tenant-constants';
// @ts-ignore — wrangler Text rule imports .sql as string
import SCHEMA_SQL from '../schema.sql';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

async function writeAudit(
  kv: KVNamespace,
  entry: { action: string; actor: string; target: string; ip: string; result: string; details?: unknown },
): Promise<void> {
  const ts = new Date().toISOString();
  const id = `audit:${ts}:${entry.action}:${entry.target}`;
  await kv.put(id, JSON.stringify({ ...entry, ts }), { expirationTtl: 90 * 24 * 3600 });
}

async function rollbackInfra(
  accountId: string,
  apiToken: string,
  resources: { d1DatabaseId?: string; accessAppId?: string },
): Promise<void> {
  if (resources.accessAppId) {
    try { await deleteAccessApp(accountId, apiToken, resources.accessAppId); }
    catch (e) { console.error('[provision rollback] Access:', (e as Error).message); }
  }
  if (resources.d1DatabaseId) {
    try { await deleteD1Database(accountId, apiToken, resources.d1DatabaseId); }
    catch (e) { console.error('[provision rollback] D1:', (e as Error).message); }
  }
}

router.post('/provision', async (c) => {
  const body = await c.req.json<any>();
  const { name, subdomain, ownerEmail, tier = 1 } = body;

  if (!name || !subdomain || !ownerEmail)
    return c.json({ error: 'name, subdomain e ownerEmail são obrigatórios.' }, 400);
  const nameStr = String(name).trim();
  if (nameStr.length < 2 || nameStr.length > 60 || !/^[\p{L}\p{N} .'\-]+$/u.test(nameStr))
    return c.json({ error: 'name: 2-60 caracteres, apenas letras, números, espaço, ponto, apóstrofo e hífen.' }, 400);
  if (!/^[a-z0-9-]{2,30}$/.test(subdomain))
    return c.json({ error: 'subdomain: 2-30 caracteres, letras minúsculas, números e hífens.' }, 400);
  if (subdomain.startsWith('-') || subdomain.endsWith('-') || isReservedSubdomain(subdomain))
    return c.json({ error: `O subdomínio "${subdomain}" não está disponível.` }, 400);
  if (!ownerEmail.includes('@') || ownerEmail.length > 254)
    return c.json({ error: 'ownerEmail inválido.' }, 400);

  const existing = await c.env.MKS_TENANTS.get(`tenant:${subdomain}`);
  if (existing) return c.json({ error: `Subdomínio "${subdomain}" já está em uso.` }, 409);

  const { CF_ACCOUNT_ID, CF_API_TOKEN, BASE_DOMAIN, RESEND_API_KEY, RESEND_FROM_DOMAIN, ZT_OTP_IDP_ID, CF_PAGES_PROJECT } = c.env;
  const familyId = `fam-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const domain = `${subdomain}.${BASE_DOMAIN}`;
  const created: { d1DatabaseId?: string; accessAppId?: string } = {};

  let d1DatabaseId: string;
  let accessAppId: string;
  let accessAppAud: string;
  let accessPolicyId: string;

  try {
    d1DatabaseId = await createD1Database(CF_ACCOUNT_ID, CF_API_TOKEN, `mks-${subdomain}`);
    created.d1DatabaseId = d1DatabaseId;

    const [, app] = await Promise.all([
      applySchema(CF_ACCOUNT_ID, CF_API_TOKEN, d1DatabaseId),
      createAccessApp(CF_ACCOUNT_ID, CF_API_TOKEN, {
        name: `Finanças Livre — ${nameStr}`,
        domain,
        otpIdpId: ZT_OTP_IDP_ID,
      }),
    ]);
    accessAppId  = app.id;
    accessAppAud = app.aud;
    created.accessAppId = app.id;

    accessPolicyId = await createAccessPolicy(CF_ACCOUNT_ID, CF_API_TOKEN, accessAppId, {
      name: `Owner — ${ownerEmail}`,
      email: ownerEmail,
    });
  } catch (e) {
    await rollbackInfra(CF_ACCOUNT_ID, CF_API_TOKEN, created);
    return c.json({ error: `Falha no provisionamento: ${(e as Error).message}` }, 500);
  }

  try {
    await removeCfAccessDnsPlaceholder(c.env.CF_ZONE_ID, CF_API_TOKEN, domain);
  } catch (e) {
    console.error('DNS placeholder removal failed:', (e as Error).message);
  }

  const ownerEmailHash = await hashEmail(ownerEmail);
  const tenant = {
    name: nameStr,
    subdomain,
    familyId,
    tier: Number(tier) as 1 | 2,
    d1DatabaseId,
    r2Bucket:       'mks-documents',
    r2Prefix:       familyId,
    accessAppId,
    accessAppAud,
    accessPolicyId,
    ownerEmailHash,
    status:    'active' as const,
    createdAt: new Date().toISOString(),
  };

  if (CF_PAGES_PROJECT) {
    try {
      await addPagesDomain(CF_ACCOUNT_ID, CF_API_TOKEN, CF_PAGES_PROJECT, domain);
    } catch (e) {
      console.error('addPagesDomain failed:', (e as Error).message);
    }
  }

  await c.env.MKS_TENANTS.put(`tenant:${subdomain}`, JSON.stringify(tenant));

  const index: string[] = JSON.parse(await c.env.MKS_TENANTS.get('tenants:index') ?? '[]');
  if (!index.includes(subdomain)) index.push(subdomain);
  await Promise.all([
    c.env.MKS_TENANTS.put('tenants:index', JSON.stringify(index)),
    c.env.MKS_TENANTS.put('tenants:count', String(index.length)),
  ]);

  c.executionCtx.waitUntil(
    sendWelcomeEmail(RESEND_API_KEY, ownerEmail, nameStr, subdomain, BASE_DOMAIN, RESEND_FROM_DOMAIN || BASE_DOMAIN),
  );

  await writeAudit(c.env.MKS_ADMIN, {
    action: 'family.provision',
    actor: c.get('adminEmail') ?? c.get('adminSub') ?? 'unknown',
    target: subdomain,
    ip: c.req.header('CF-Connecting-IP') ?? 'unknown',
    result: 'success',
    details: { tenantName: nameStr, ownerEmail, d1: d1DatabaseId },
  });

  return c.json({ success: true, tenant });
});

async function applySchema(accountId: string, token: string, dbId: string): Promise<void> {
  const sql = SCHEMA_SQL as string;
  const withoutLineComments = sql
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith('--') ? '' : line;
    })
    .join('\n');
  const stmts = withoutLineComments
    .split(';')
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0)
    .map((s: string) => s + ';');

  await execD1Batch(accountId, token, dbId, stmts);
}

async function hashEmail(email: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.toLowerCase()));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export default router;
