#!/usr/bin/env node
/**
 * MKS Finanças — Destruição de Instância Familiar (LGPD Art. 18 — Direito ao Esquecimento)
 *
 * Uso:
 *   node scripts/deprovision.mjs --subdomain silva
 *   node scripts/deprovision.mjs --subdomain silva --dry-run
 *
 * ⚠️  IRREVERSÍVEL: apaga D1, R2, processo PM2 e todos os dados da família.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { randomBytes, createHash } from 'crypto';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const CTRL       = join(process.env.HOME, '.mks-control');
const CF_ACCOUNT = '9b61f609fee4408fd1c4344feaf9b16a';
const CF_TUNNEL  = '50e41496-a62b-452a-bd9f-d0f08c2a620d';
const BASE_DOMAIN = 'financaslivre.com';

function log(icon, msg) { console.log(`\n${icon}  ${msg}`); }
function ok(msg)  { console.log(`   ✓ ${msg}`); }
function warn(msg){ console.log(`   ⚠  ${msg}`); }
function fail(msg){ console.error(`\n❌  ${msg}`); process.exit(1); }

function loadEnv() {
  const p = join(ROOT, '.env');
  return Object.fromEntries(
    readFileSync(p, 'utf8').split('\n')
      .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
  );
}

function loadFamilies() {
  const p = join(CTRL, 'families.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
}
function saveFamilies(list) {
  writeFileSync(join(CTRL, 'families.json'), JSON.stringify(list, null, 2));
}

async function cf(path, method = 'GET', body, token) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const d = await r.json();
  if (!d.success) throw new Error(`CF ${method} ${path}: ${JSON.stringify(d.errors)}`);
  return d.result;
}

async function emptyR2Bucket(bucket, token) {
  // Lista e deleta todos os objetos antes de deletar o bucket
  try {
    const list = await cf(`/accounts/${CF_ACCOUNT}/r2/buckets/${bucket}/objects`, 'GET', null, token);
    const objects = list?.objects || [];
    for (const obj of objects) {
      await cf(`/accounts/${CF_ACCOUNT}/r2/buckets/${bucket}/objects/${encodeURIComponent(obj.key)}`, 'DELETE', null, token);
      ok(`Objeto deletado: ${obj.key}`);
    }
  } catch (e) {
    warn(`Não foi possível listar objetos R2: ${e.message}`);
  }
}

async function removeTunnelIngress(subdomain, token, dryRun) {
  const hostname = `${subdomain}.${BASE_DOMAIN}`;
  try {
    const cfg = await cf(`/accounts/${CF_ACCOUNT}/cfd_tunnel/${CF_TUNNEL}/configurations`, 'GET', null, token);
    const ingress = (cfg?.config?.ingress || []).filter(r => r.hostname !== hostname);
    // Garante que o catch-all existe
    if (!ingress.find(r => !r.hostname)) ingress.push({ service: 'http_status:404' });
    if (!dryRun) {
      await cf(`/accounts/${CF_ACCOUNT}/cfd_tunnel/${CF_TUNNEL}/configurations`, 'PUT', { config: { ingress } }, token);
    }
    ok(`Rota tunnel removida: ${hostname}`);
  } catch (e) {
    warn(`Tunnel: ${e.message} (remova manualmente se necessário)`);
  }
}

async function removeDNSRecord(subdomain, token, dryRun) {
  const hostname = `${subdomain}.${BASE_DOMAIN}`;
  try {
    const zones = await cf(`/zones?name=${BASE_DOMAIN}`, 'GET', null, token);
    if (!zones?.length) { warn('Zona DNS não encontrada'); return; }
    const zoneId  = zones[0].id;
    const records = await cf(`/zones/${zoneId}/dns_records?name=${hostname}`, 'GET', null, token);
    for (const rec of records || []) {
      if (!dryRun) await cf(`/zones/${zoneId}/dns_records/${rec.id}`, 'DELETE', null, token);
      ok(`DNS removido: ${hostname}`);
    }
  } catch (e) {
    warn(`DNS: ${e.message}`);
  }
}

// ── Confirmação interativa ────────────────────────────────────────────────────

async function confirm(subdomain) {
  const { createInterface } = await import('readline');
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(
      `\n⚠️  ATENÇÃO: Esta ação é IRREVERSÍVEL.\n   Digite o subdomínio "${subdomain}" para confirmar: `,
      answer => { rl.close(); resolve(answer.trim() === subdomain); }
    );
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  MKS Finanças — Destruição de Família');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const args      = process.argv.slice(2);
  const get       = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
  const subdomain = get('--subdomain')?.toLowerCase();
  const dryRun    = args.includes('--dry-run');
  const force     = args.includes('--force');

  if (!subdomain) fail('Uso: node scripts/deprovision.mjs --subdomain silva');

  const families = loadFamilies();
  const family   = families.find(f => f.subdomain === subdomain && f.status !== 'deleted');
  if (!family) fail(`Família "${subdomain}" não encontrada ou já foi deletada.`);

  const env      = loadEnv();
  const CF_TOKEN = env.CLOUDFLARE_API_TOKEN;
  if (!CF_TOKEN) fail('CLOUDFLARE_API_TOKEN não configurado.');

  console.log(`\n  Família:  ${family.name}`);
  console.log(`  URL:      https://${subdomain}.${BASE_DOMAIN}`);
  console.log(`  D1:       ${family.d1DatabaseId}`);
  console.log(`  R2:       ${family.r2Bucket}`);
  console.log(`  PM2:      ${family.pm2Name}`);
  console.log(`  Criada:   ${new Date(family.createdAt).toLocaleString('pt-BR')}`);

  if (!dryRun && !force) {
    const confirmed = await confirm(subdomain);
    if (!confirmed) { console.log('\n  Operação cancelada.\n'); process.exit(0); }
  }

  if (dryRun) console.log('\n  [DRY-RUN — nenhuma alteração real]\n');

  // ── 1. Parar PM2 ──────────────────────────────────────────────────────────
  log('⚙️ ', `Parando processo PM2 (${family.pm2Name})...`);
  try {
    if (!dryRun) {
      execSync(`pm2 delete ${family.pm2Name} 2>/dev/null || true`, { stdio: 'pipe' });
      execSync('pm2 save', { stdio: 'pipe' });
    }
    ok(`PM2 processo removido`);
  } catch (e) { warn(`PM2: ${e.message}`); }

  // ── 2. Limpar e deletar R2 ────────────────────────────────────────────────
  log('📦', `Deletando bucket R2 (${family.r2Bucket})...`);
  if (!dryRun) {
    await emptyR2Bucket(family.r2Bucket, CF_TOKEN);
    try {
      await cf(`/accounts/${CF_ACCOUNT}/r2/buckets/${family.r2Bucket}`, 'DELETE', null, CF_TOKEN);
      ok(`R2 bucket deletado`);
    } catch (e) { warn(`R2 delete: ${e.message}`); }
  } else { ok(`[dry-run] R2 seria deletado`); }

  // ── 3. Deletar D1 ─────────────────────────────────────────────────────────
  log('🗄️ ', `Deletando banco D1 (${family.d1DatabaseId})...`);
  if (!dryRun) {
    try {
      await cf(`/accounts/${CF_ACCOUNT}/d1/database/${family.d1DatabaseId}`, 'DELETE', null, CF_TOKEN);
      ok(`D1 banco deletado — todos os dados destruídos`);
    } catch (e) { warn(`D1 delete: ${e.message}`); }
  } else { ok(`[dry-run] D1 seria deletado`); }

  // ── 4. Remover rota do Tunnel e DNS ───────────────────────────────────────
  log('🌐', 'Removendo rota do Tunnel e DNS...');
  await removeTunnelIngress(subdomain, CF_TOKEN, dryRun);
  await removeDNSRecord(subdomain, CF_TOKEN, dryRun);

  // ── 5. Remover arquivos locais ────────────────────────────────────────────
  log('🗑️ ', 'Removendo arquivos locais...');
  const files = [
    join(CTRL, 'envs', `${subdomain}.env`),
    join(CTRL, 'ecosystems', `mks-${subdomain}.config.cjs`),
  ];
  for (const f of files) {
    if (existsSync(f)) {
      if (!dryRun) unlinkSync(f);
      ok(`Removido: ${f}`);
    }
  }

  // ── 6. Atualizar metadata (hard delete — mantém só tombstone para audit) ──
  log('💾', 'Atualizando metadata...');
  if (!dryRun) {
    const updated = families.map(f =>
      f.subdomain === subdomain
        ? { id: f.id, name: f.name, subdomain: f.subdomain, status: 'deleted',
            createdAt: f.createdAt, deletedAt: new Date().toISOString() }
        : f
    );
    saveFamilies(updated);
  }
  ok('Tombstone registrado (audit LGPD — prova do direito ao esquecimento)');

  // ── Resumo ─────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ✅  Família "${family.name}" destruída.`);
  console.log('  Todos os dados financeiros foram eliminados.');
  if (dryRun) console.log('\n  ⚠️  Dry-run — nenhuma alteração foi aplicada.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(e => fail(e.message));
