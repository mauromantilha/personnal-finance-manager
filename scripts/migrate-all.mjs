#!/usr/bin/env node
/**
 * MKS Finanças — Migration runner para instâncias familiares
 *
 * Uso:
 *   node scripts/migrate-all.mjs                        # todas as famílias ativas (lê do KV)
 *   node scripts/migrate-all.mjs --subdomain silva      # somente uma família
 *   node scripts/migrate-all.mjs --dry-run              # simula sem aplicar
 *   node scripts/migrate-all.mjs --main                 # instância principal (D1_DATABASE_ID do .env)
 *
 * Lógica:
 *   1. Lê tenants ativos do KV MKS_TENANTS (tenant:* keys) — sem arquivo local
 *   2. Cria schema_migrations se não existe no D1
 *   3. Se vazia (DB antigo sem tracking): semeia 0001-0010 como já aplicadas
 *   4. Aplica somente as migrations pendentes (não presentes em schema_migrations)
 *   5. Registra cada migration aplicada em schema_migrations
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const MIGRATIONS = join(ROOT, 'migrations');
const CF_ACCOUNT = '9b61f609fee4408fd1c4344feaf9b16a';
const KV_NS_ID   = '6017e7ceeaa84a0fa7d7c798ce22bce8';

// Versões criadas antes do controle de schema — consideradas já aplicadas em DBs antigos
const LEGACY_VERSIONS = [
  '0001_schema', '0002_seed', '0003_categories', '0004_credit_cards',
  '0005_recurrences', '0006_documents', '0007_family', '0008_installments',
  '0009_investments', '0010_users',
];

const args      = process.argv.slice(2);
const get       = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const onlySub   = get('--subdomain')?.toLowerCase();
const dryRun    = args.includes('--dry-run');
const mainMode  = args.includes('--main');

function log(icon, msg) { process.stdout.write(`\n${icon}  ${msg}\n`); }
function ok(msg)        { process.stdout.write(`   ✓ ${msg}\n`); }
function skip(msg)      { process.stdout.write(`   · ${msg}\n`); }
function warn(msg)      { process.stdout.write(`   ⚠  ${msg}\n`); }
function fail(msg)      { process.stderr.write(`\n❌  ${msg}\n`); process.exit(1); }

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8').split('\n')
      .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
  );
}

async function loadTenantsFromKV(token) {
  // Lista todas as chaves tenant:* do KV
  const keysResult = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/storage/kv/namespaces/${KV_NS_ID}/keys?prefix=tenant%3A&limit=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  ).then(r => r.json());

  if (!keysResult.success) throw new Error(`KV list: ${JSON.stringify(keysResult.errors)}`);

  const families = [];
  for (const { name: key } of keysResult.result) {
    const val = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/storage/kv/namespaces/${KV_NS_ID}/values/${encodeURIComponent(key)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).then(r => r.json()).catch(() => null);

    if (val?.d1DatabaseId && val?.status === 'active') {
      families.push({
        name:         val.name ?? val.subdomain,
        subdomain:    val.subdomain,
        d1DatabaseId: val.d1DatabaseId,
        status:       val.status,
      });
    }
  }
  return families;
}

async function cf(path, method = 'GET', body, token) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const d = await r.json();
  if (!d.success) throw new Error(`CF ${method} ${path}: ${JSON.stringify(d.errors)}`);
  return d.result;
}

async function d1q(dbId, sql, params = [], token) {
  const result = await cf(
    `/accounts/${CF_ACCOUNT}/d1/database/${dbId}/query`,
    'POST', { sql, params }, token
  );
  return result?.[0]?.results ?? [];
}

function loadMigrationFiles() {
  return readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => ({ file: join(MIGRATIONS, f), version: basename(f, '.sql') }));
}

function parseSql(sql) {
  return sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
}

async function migrateFamily({ name, subdomain, d1DatabaseId }, token) {
  log('🗄️ ', `${name} (${subdomain}) — D1: ${d1DatabaseId}`);

  if (dryRun) { skip('dry-run — nenhuma alteração'); return { applied: 0, skipped: 0, errors: 0 }; }

  // 1. Criar schema_migrations se não existe
  await d1q(d1DatabaseId,
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version TEXT NOT NULL PRIMARY KEY,
       applied_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`, [], token);

  // 2. Ler versões já aplicadas
  const rows       = await d1q(d1DatabaseId, 'SELECT version FROM schema_migrations', [], token);
  const appliedSet = new Set(rows.map(r => r.version));

  // 3. Semear legados se tabela estava vazia E as tabelas físicas já existem
  //    (DB antigo provisionado antes do tracking). DBs novos NÃO devem pular migrações.
  if (appliedSet.size === 0) {
    const tables = await d1q(d1DatabaseId,
      `SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'`, [], token);
    if (tables.length > 0) {
      for (const v of LEGACY_VERSIONS) {
        await d1q(d1DatabaseId,
          `INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`, [v], token);
        appliedSet.add(v);
      }
      ok(`Schema_migrations semeada com ${LEGACY_VERSIONS.length} versões legadas (DB antigo)`);
    } else {
      ok('DB novo detectado — aplicando todas as migrations do zero');
    }
  }

  // 4. Aplicar pendentes
  const migrations = loadMigrationFiles();
  let applied = 0, skipped = 0, errors = 0;

  for (const { file, version } of migrations) {
    if (appliedSet.has(version)) { skip(`já aplicada: ${version}`); skipped++; continue; }

    const stmts = parseSql(readFileSync(file, 'utf8'));
    let failed = false;
    for (const stmt of stmts) {
      try {
        await d1q(d1DatabaseId, stmt + ';', [], token);
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
        // "duplicate column name" / "table already exists" → schema já aplicado manualmente, tratar como sucesso
        const msg = e.message ?? '';
        if (msg.includes('duplicate column') || msg.includes('already exists')) {
          skip(`${version}: statement idempotente ignorado (${msg.split(':')[0]})`);
          continue;
        }
        warn(`${version}: ${e.message}`);
        failed = true; errors++; break;
      }
    }
    if (!failed) {
      await d1q(d1DatabaseId,
        `INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`, [version], token);
      ok(`aplicada: ${version} (${stmts.length} statements)`);
      applied++;
    }
  }

  return { applied, skipped, errors };
}

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  MKS Finanças — Migration Runner');
  if (dryRun)    console.log('  [DRY-RUN — nenhuma alteração real]');
  if (mainMode)  console.log('  [MODO --main — instância principal]');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ── Modo --main: migra o D1 da instância principal (root .env) ────────────
  if (mainMode) {
    const mainEnv = parseEnvFile(join(ROOT, '.env'));
    const token   = mainEnv.CLOUDFLARE_API_TOKEN;
    const dbId    = mainEnv.D1_DATABASE_ID;
    if (!token) fail('CLOUDFLARE_API_TOKEN não encontrado no .env principal.');
    if (!dbId)  fail('D1_DATABASE_ID não encontrado no .env principal.');

    const migrations = loadMigrationFiles();
    console.log(`\n  D1: ${dbId}`);
    console.log(`  Migrations no repositório: ${migrations.length}`);
    console.log(`  Último arquivo: ${migrations.at(-1)?.version ?? '—'}\n`);

    const r = await migrateFamily({ name: 'Instância principal', subdomain: 'main', d1DatabaseId: dbId }, token);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  ✅  Concluído`);
    console.log(`  Aplicadas: ${r.applied}  Puladas: ${r.skipped}  Erros: ${r.errors}`);
    if (dryRun) console.log('\n  ⚠️  Dry-run — nenhuma alteração foi aplicada.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    if (r.errors > 0) process.exit(1);
    return;
  }

  // ── Modo normal: famílias lidas do KV ───────────────────────────────────
  const rootEnv = parseEnvFile(join(ROOT, '.env'));
  const token   = rootEnv.CLOUDFLARE_API_TOKEN;
  if (!token) fail('CLOUDFLARE_API_TOKEN não encontrado no .env raiz.');

  const allFamilies = await loadTenantsFromKV(token);

  if (allFamilies.length === 0) fail('Nenhuma família ativa encontrada no KV. Use --main para a instância principal.');

  const targets = onlySub
    ? allFamilies.filter(f => f.subdomain === onlySub)
    : allFamilies;

  if (targets.length === 0) fail(`Família "${onlySub}" não encontrada ou não está ativa no KV.`);

  const migrations = loadMigrationFiles();
  console.log(`\n  Famílias-alvo: ${targets.length}`);
  console.log(`  Migrations no repositório: ${migrations.length}`);
  console.log(`  Último arquivo: ${migrations.at(-1)?.version ?? '—'}\n`);

  const totals = { applied: 0, skipped: 0, errors: 0 };

  for (const family of targets) {
    try {
      const r = await migrateFamily(family, token);
      totals.applied  += r.applied;
      totals.skipped  += r.skipped;
      totals.errors   += r.errors;
    } catch (e) {
      warn(`Erro em ${family.subdomain}: ${e.message}`);
      totals.errors++;
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ✅  Concluído`);
  console.log(`  Aplicadas:  ${totals.applied}`);
  console.log(`  Puladas:    ${totals.skipped}`);
  console.log(`  Erros:      ${totals.errors}`);
  if (dryRun) console.log('\n  ⚠️  Dry-run — nenhuma alteração foi aplicada.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (totals.errors > 0) process.exit(1);
}

main().catch(e => fail(e.message));
