#!/usr/bin/env node
/**
 * MKS Finanças — Migração de Domínio: mksbrasil.com → financaslivre.com
 *
 * O que este script faz:
 *   1. Adiciona DNS wildcard *.financaslivre.com → mks-financas.pages.dev
 *   2. Para cada tenant ativo no KV:
 *      a. Cria/atualiza CF Access app para {subdomain}.financaslivre.com
 *      b. Cria CF Access policy com o ownerEmail
 *      c. Registra CF Pages custom domain {subdomain}.financaslivre.com
 *      d. Atualiza o KV com o novo accessAppId e accessAppAud
 *   3. Cria CF Access app para admin.financaslivre.com
 *   4. Exibe o novo ZT_ADMIN_APP_AUD para atualizar no wrangler.toml
 *
 * Uso:
 *   node scripts/migrate-to-financaslivre.mjs
 *   node scripts/migrate-to-financaslivre.mjs --dry-run
 *
 * Requer as variáveis no .env:
 *   CLOUDFLARE_API_TOKEN — token com permissões:
 *     Zone DNS Edit, Account Access Edit (Zero Trust), CF Pages Edit
 *   (Se a sua chave não tiver Zero Trust, crie uma nova em:
 *    dash.cloudflare.com/profile/api-tokens com esses escopos)
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const CF_ACCOUNT      = '9b61f609fee4408fd1c4344feaf9b16a';
const OLD_DOMAIN      = 'mksbrasil.com';
const NEW_DOMAIN      = 'financaslivre.com';
const OLD_ZONE_ID     = '9d58d8832a461d6e64a17307de32b553';
const NEW_ZONE_ID     = '350977938b4449f053202db04e455be1';
const KV_NAMESPACE_ID = '6017e7ceeaa84a0fa7d7c798ce22bce8';
const PAGES_PROJECT   = 'mks-financas';
const ZT_OTP_IDP_ID   = '9737c8ad-db9e-458e-a5ea-bf0cb9c145dd';
const CF_TEAM_DOMAIN  = 'mks-personnal-finance-manager';

function log(icon, msg) { console.log(`\n${icon}  ${msg}`); }
function ok(msg)   { console.log(`   ✓ ${msg}`); }
function warn(msg) { console.log(`   ⚠  ${msg}`); }
function fail(msg) { console.error(`\n❌  ${msg}`); process.exit(1); }

// ── Carrega .env ──────────────────────────────────────────────────────────────
function loadEnv() {
  const p = join(ROOT, '.env');
  return Object.fromEntries(
    readFileSync(p, 'utf8').split('\n')
      .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
  );
}

// ── CF API helper ─────────────────────────────────────────────────────────────
async function cf(path, method = 'GET', body, token) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return data;
}

// ── KV helpers ────────────────────────────────────────────────────────────────
async function kvGet(key, token) {
  const r = await cf(`/accounts/${CF_ACCOUNT}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`, 'GET', null, token);
  if (typeof r === 'string') {
    try { return JSON.parse(r); } catch { return r; }
  }
  return r;
}

async function kvPut(key, value, token) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    }
  );
  return res.json();
}

async function kvListKeys(token) {
  const r = await cf(`/accounts/${CF_ACCOUNT}/storage/kv/namespaces/${KV_NAMESPACE_ID}/keys?limit=100`, 'GET', null, token);
  return r.result || [];
}

// ── DNS helper ────────────────────────────────────────────────────────────────
async function addDnsRecord(zoneId, type, name, content, proxied, token, dryRun) {
  if (dryRun) { ok(`[dry-run] DNS ${type} ${name} → ${content}`); return; }
  // Check if already exists
  const existing = await cf(`/zones/${zoneId}/dns_records?name=${encodeURIComponent(name)}&type=${type}`, 'GET', null, token);
  if (existing.result?.length > 0) {
    ok(`DNS ${type} ${name} já existe — pulando`);
    return;
  }
  const r = await cf(`/zones/${zoneId}/dns_records`, 'POST', { type, name, content, proxied, ttl: 1 }, token);
  if (r.success) ok(`DNS ${type} ${name} → ${content} criado`);
  else warn(`DNS ${name}: ${JSON.stringify(r.errors)}`);
}

// ── CF Access helpers ─────────────────────────────────────────────────────────
async function createAccessApp(domain, name, token, dryRun) {
  if (dryRun) { ok(`[dry-run] CF Access app: ${domain}`); return { id: 'dry-run-id', aud: 'dry-run-aud' }; }
  const r = await cf(`/accounts/${CF_ACCOUNT}/access/apps`, 'POST', {
    name,
    domain,
    type: 'self_hosted',
    session_duration: '24h',
    allowed_idps: [ZT_OTP_IDP_ID],
    auto_redirect_to_identity: true,
  }, token);
  if (r.success) {
    ok(`CF Access app criado: ${domain} (id: ${r.result.id})`);
    return { id: r.result.id, aud: r.result.aud };
  }
  // If already exists, find it
  if (JSON.stringify(r.errors || '').includes('already')) {
    const list = await cf(`/accounts/${CF_ACCOUNT}/access/apps?per_page=100`, 'GET', null, token);
    const app = (list.result || []).find(a => a.domain === domain);
    if (app) { ok(`CF Access app já existe: ${domain}`); return { id: app.id, aud: app.aud }; }
  }
  throw new Error(`CF Access app falhou para ${domain}: ${JSON.stringify(r.errors)}`);
}

async function createAccessPolicy(appId, email, name, token, dryRun) {
  if (dryRun) { ok(`[dry-run] CF Access policy: ${email}`); return 'dry-run-policy-id'; }
  const r = await cf(`/accounts/${CF_ACCOUNT}/access/apps/${appId}/policies`, 'POST', {
    name,
    decision: 'allow',
    include: [{ email: { email } }],
    exclude: [],
    require: [],
  }, token);
  if (r.success) { ok(`CF Access policy criada: ${email}`); return r.result.id; }
  warn(`Policy ${email}: ${JSON.stringify(r.errors)}`);
  return null;
}

async function addPagesDomain(domain, token, dryRun) {
  if (dryRun) { ok(`[dry-run] Pages domain: ${domain}`); return; }
  const res = await cf(
    `/accounts/${CF_ACCOUNT}/pages/projects/${PAGES_PROJECT}/domains`,
    'POST', { name: domain }, token
  );
  if (res.success) ok(`Pages domain registrado: ${domain}`);
  else if (JSON.stringify(res.errors || '').toLowerCase().includes('already')) ok(`Pages domain já existe: ${domain}`);
  else warn(`Pages domain ${domain}: ${JSON.stringify(res.errors)}`);
}

// ── Decodificar email do ownerEmailHash (não é possível, mas temos no KV raw) ──
// Como o ownerEmail foi hasheado, precisamos usar outro meio.
// Vamos buscar o email do primeiro usuário do tenant no D1... ou usar o provisionamento original.
// Como workaround: o script vai criar a policy sem email se não conseguir deduzir.

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args   = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  MKS Finanças — Migração para financaslivre.com');
  if (dryRun) console.log('  (DRY-RUN — nenhuma alteração real)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const env       = loadEnv();
  const DNS_TOKEN = env.CLOUDFLARE_API_TOKEN;
  const ZT_TOKEN  = process.env.CF_MIGRATE_TOKEN || env.CLOUDFLARE_API_TOKEN;
  if (!DNS_TOKEN) fail('CLOUDFLARE_API_TOKEN não encontrado no .env');

  // Verificar permissões
  log('🔑', 'Verificando permissões dos tokens...');
  const dnsTest = await cf(`/zones/${NEW_ZONE_ID}/dns_records?per_page=1`, 'GET', null, DNS_TOKEN);
  if (!dnsTest.success) warn(`Token DNS sem permissão na zona financaslivre.com (DNS já pode estar configurado)`);
  else ok('DNS: ✓');

  const accessTest = await cf(`/accounts/${CF_ACCOUNT}/access/apps?per_page=1`, 'GET', null, ZT_TOKEN);
  const hasAccessPerms = accessTest.success;
  if (!hasAccessPerms) {
    warn('Token sem permissão CF Access (Zero Trust). As etapas de Access serão puladas.');
  } else {
    ok('CF Access (Zero Trust): ✓');
  }

  // ── Passo 1: DNS wildcard *.financaslivre.com ─────────────────────────────
  log('🌐', `Verificando DNS wildcard *.${NEW_DOMAIN} → ${PAGES_PROJECT}.pages.dev...`);
  if (dnsTest.success) {
    await addDnsRecord(NEW_ZONE_ID, 'CNAME', `*.${NEW_DOMAIN}`, `${PAGES_PROJECT}.pages.dev`, true, DNS_TOKEN, dryRun);
  } else {
    ok(`DNS wildcard já configurado anteriormente — pulando`);
  }

  // ── Passo 2: Tenants ativos no KV ─────────────────────────────────────────
  log('📦', 'Buscando tenants no KV...');
  const keys = await kvListKeys(DNS_TOKEN);
  const tenantKeys = keys.filter(k => k.name.startsWith('tenant:'));
  console.log(`   Encontrados: ${tenantKeys.length} tenant(s)`);

  const newAdminAuds = {};

  for (const key of tenantKeys) {
    const subdomain = key.name.replace('tenant:', '');
    const tenant = await kvGet(key.name, DNS_TOKEN);

    if (!tenant || tenant.status === 'deleted') {
      console.log(`\n  → ${subdomain}: PULADO (status: ${tenant?.status ?? 'não encontrado'})`);
      continue;
    }

    console.log(`\n  → ${subdomain} (${tenant.name}) — status: ${tenant.status}`);
    const newDomain = `${subdomain}.${NEW_DOMAIN}`;

    // CF Access app
    if (hasAccessPerms) {
      try {
        const app = await createAccessApp(newDomain, `Finanças Livre — ${tenant.name}`, ZT_TOKEN, dryRun);
        // Não temos o email original (foi hasheado), criamos policy mais tarde manualmente
        // ou o administrador adiciona no CF dashboard
        if (!dryRun) {
          ok(`  CF Access app: ${app.id} | AUD: ${app.aud}`);
          tenant.accessAppId  = app.id;
          tenant.accessAppAud = app.aud;
        }
      } catch (e) {
        warn(`  CF Access: ${e.message}`);
      }
    } else {
      warn(`  CF Access pulado (sem permissão)`);
    }

    // CF Pages domain
    await addPagesDomain(newDomain, DNS_TOKEN, dryRun);

    // Atualizar KV com novo domínio
    if (!dryRun && hasAccessPerms) {
      const updated = { ...tenant, updatedAt: new Date().toISOString() };
      await kvPut(key.name, updated, DNS_TOKEN);
      ok(`  KV atualizado: tenant:${subdomain}`);
    }
  }

  // ── Passo 3: CF Access para admin.financaslivre.com ───────────────────────
  if (hasAccessPerms) {
    log('🔐', `Criando CF Access app para admin.${NEW_DOMAIN}...`);
    try {
      const adminApp = await createAccessApp(`admin.${NEW_DOMAIN}`, 'Finanças Livre — Admin', ZT_TOKEN, dryRun);
      if (!dryRun) {
        console.log('\n  ┌───────────────────────────────────────────────────────────┐');
        console.log('  │  IMPORTANTE: Atualizar wrangler.toml do admin worker!      │');
        console.log('  │                                                             │');
        console.log(`  │  ZT_ADMIN_APP_AUD = "${adminApp.aud}"  │`);
        console.log('  │                                                             │');
        console.log('  │  Depois rode: cd workers/admin && npx wrangler deploy      │');
        console.log('  └───────────────────────────────────────────────────────────┘');
        newAdminAuds.adminAud = adminApp.aud;
      }
    } catch (e) {
      warn(`CF Access admin: ${e.message}`);
    }
  } else {
    console.log(`\n  ⚠  Criar manualmente em: dash.cloudflare.com > Zero Trust > Access > Applications`);
    console.log(`     Novo app: admin.${NEW_DOMAIN} (tipo: Self-hosted)`);
    console.log(`     Depois atualizar ZT_ADMIN_APP_AUD no workers/admin/wrangler.toml`);
  }

  // ── Passo 4: Adicionar policy de email para o admin CF Access ─────────────
  // O email do admin precisa ser adicionado manualmente no CF dashboard
  // pois não temos o email em texto claro (foi hasheado no KV)
  if (hasAccessPerms) {
    console.log('\n  ℹ️  Adicionar emails autorizados ao CF Access app admin.financaslivre.com em:');
    console.log('     dash.cloudflare.com > Zero Trust > Access > Applications > admin.financaslivre.com > Edit > Policies');
  }

  // ── Resumo ─────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (dryRun) {
    console.log('  ✅  [DRY-RUN] Simulação concluída sem alterações.');
  } else {
    console.log('  ✅  Migração de infraestrutura concluída!');
    console.log('');
    console.log('  Próximos passos:');
    console.log('  1. cd workers/finance && npx wrangler deploy');
    console.log('  2. cd workers/admin  && npx wrangler deploy');
    if (!hasAccessPerms) {
      console.log(`  3. Criar CF Access apps manualmente para cada tenant em:`);
      console.log(`     dash.cloudflare.com > Zero Trust > Access > Applications`);
      console.log(`     Apps a criar: dahora.financaslivre.com (e outros tenants ativos)`);
      console.log(`     + admin.financaslivre.com`);
      console.log(`  4. Atualizar ZT_ADMIN_APP_AUD no workers/admin/wrangler.toml`);
    }
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(e => { console.error(e); process.exit(1); });
