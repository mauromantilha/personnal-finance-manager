import { Hono } from 'hono';
import type { Env } from '../index';
import { createD1Database, execD1Batch, createAccessApp, createAccessPolicy, addPagesDomain, removeCfAccessDnsPlaceholder } from '../lib/cf-api';
import { sendWelcomeEmail } from '../lib/resend';
// @ts-ignore — wrangler Text rule imports .sql as string
import SCHEMA_SQL from '../schema.sql';

const router = new Hono<{ Bindings: Env }>();

router.post('/provision', async (c) => {
  const body = await c.req.json<any>();
  const { name, subdomain, ownerEmail, tier = 1 } = body;

  if (!name || !subdomain || !ownerEmail)
    return c.json({ error: 'name, subdomain e ownerEmail são obrigatórios.' }, 400);
  if (!/^[a-z0-9-]+$/.test(subdomain))
    return c.json({ error: 'subdomain: use apenas letras minúsculas, números e hífens.' }, 400);
  if (!ownerEmail.includes('@'))
    return c.json({ error: 'ownerEmail inválido.' }, 400);

  const existing = await c.env.MKS_TENANTS.get(`tenant:${subdomain}`);
  if (existing) return c.json({ error: `Subdomínio "${subdomain}" já está em uso.` }, 409);

  const { CF_ACCOUNT_ID, CF_API_TOKEN, BASE_DOMAIN, RESEND_API_KEY, RESEND_FROM_DOMAIN, ZT_OTP_IDP_ID, CF_PAGES_PROJECT } = c.env;
  const familyId = `fam-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

  // Step 1: Create D1 database
  let d1DatabaseId: string;
  try {
    d1DatabaseId = await createD1Database(CF_ACCOUNT_ID, CF_API_TOKEN, `mks-${subdomain}`);
  } catch (e) {
    return c.json({ error: `Falha ao criar D1: ${(e as Error).message}` }, 500);
  }

  // Step 2+3: Apply schema to D1 AND create CF Access app in parallel
  const domain = `${subdomain}.${BASE_DOMAIN}`;

  let accessAppId: string;
  let accessAppAud: string;

  try {
    const [, app] = await Promise.all([
      applySchema(CF_ACCOUNT_ID, CF_API_TOKEN, d1DatabaseId),
      createAccessApp(CF_ACCOUNT_ID, CF_API_TOKEN, {
        name: `Finanças Livre — ${name}`,
        domain,
        otpIdpId: ZT_OTP_IDP_ID,
      }),
    ]);
    accessAppId  = app.id;
    accessAppAud = app.aud;
  } catch (e) {
    return c.json({ error: `Falha no provisionamento: ${(e as Error).message}` }, 500);
  }

  // Step 4: Create CF Access policy allowing owner email
  let accessPolicyId: string;
  try {
    accessPolicyId = await createAccessPolicy(CF_ACCOUNT_ID, CF_API_TOKEN, accessAppId, {
      name: `Owner — ${ownerEmail}`,
      email: ownerEmail,
    });
  } catch (e) {
    return c.json({ error: `Falha ao criar policy: ${(e as Error).message}` }, 500);
  }

  // Step 4b: Remove the A 100.64.0.1 placeholder that CF Access plants for
  // the subdomain. With *.mksbrasil.com wildcard in place, deleting the
  // specific record is enough — the wildcard takes over automatically.
  try {
    await removeCfAccessDnsPlaceholder(
      c.env.CF_ZONE_ID, CF_API_TOKEN,
      `${subdomain}.${BASE_DOMAIN}`,
    );
  } catch (e) {
    console.error('DNS placeholder removal failed:', (e as Error).message);
  }

  // Step 5: Build tenant record and write to KV
  const ownerEmailHash = await hashEmail(ownerEmail);
  const tenant = {
    name,
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

  // Step 5b: Register CF Pages custom domain (blocking — 522 without this)
  if (CF_PAGES_PROJECT) {
    try {
      await addPagesDomain(CF_ACCOUNT_ID, CF_API_TOKEN, CF_PAGES_PROJECT, `${subdomain}.${BASE_DOMAIN}`);
    } catch (e) {
      console.error('addPagesDomain failed:', (e as Error).message);
      // Non-fatal: domain may already be active or Pages may accept it later
    }
  }

  await c.env.MKS_TENANTS.put(`tenant:${subdomain}`, JSON.stringify(tenant));

  const index: string[] = JSON.parse(await c.env.MKS_TENANTS.get('tenants:index') ?? '[]');
  if (!index.includes(subdomain)) index.push(subdomain);
  await Promise.all([
    c.env.MKS_TENANTS.put('tenants:index', JSON.stringify(index)),
    c.env.MKS_TENANTS.put('tenants:count', String(index.length)),
  ]);

  // Step 6: Send welcome email (best-effort, non-blocking)
  c.executionCtx.waitUntil(
    sendWelcomeEmail(RESEND_API_KEY, ownerEmail, name, subdomain, BASE_DOMAIN, RESEND_FROM_DOMAIN || BASE_DOMAIN),
  );

  return c.json({ success: true, tenant });
});

async function applySchema(accountId: string, token: string, dbId: string): Promise<void> {
  const sql = SCHEMA_SQL as string;
  const stmts = sql
    .split(';')
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0 && !s.startsWith('--'))
    .map((s: string) => s + ';');

  // Single batch call — avoids hitting the 50-subrequest-per-invocation limit
  await execD1Batch(accountId, token, dbId, stmts);
}

async function hashEmail(email: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.toLowerCase()));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export default router;
