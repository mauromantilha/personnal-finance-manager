#!/usr/bin/env node
/**
 * MKS Finanças — Migration runner para instâncias familiares
 *
 * Uso:
 *   node scripts/migrate-all.mjs                        # todas as famílias ativas
 *   node scripts/migrate-all.mjs --subdomain silva      # somente uma família
 *   node scripts/migrate-all.mjs --dry-run              # simula sem aplicar
 *
 * Lógica:
 *   1. Cria schema_migrations se não existe no D1
 *   2. Se vazia (DB antigo sem tracking): semeia 0001-0010 como já aplicadas
 *   3. Aplica somente as migrations pendentes (não presentes em schema_migrations)
 *   4. Registra cada migration aplicada em schema_migrations
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const CTRL       = join(process.env.HOME, '.mks-control');
const MIGRATIONS = join(ROOT, 'migrations');
const CF_ACCOUNT = '9b61f609fee4408fd1c4344feaf9b16a';

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

function loadFamilies() {
  const p = join(CTRL, 'families.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
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

  // 3. Semear legados se tabela estava vazia (DB provisionado sem tracking)
  if (appliedSet.size === 0) {
    for (const v of LEGACY_VERSIONS) {
      await d1q(d1DatabaseId,
        `INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`, [v], token);
      appliedSet.add(v);
    }
    ok(`Schema_migrations semeada com ${LEGACY_VERSIONS.length} versões legadas`);
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
  if (dryRun) console.log('  [DRY-RUN — nenhuma alteração real]');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const allFamilies = loadFamilies().filter(f => f.status === 'active');

  if (allFamilies.length === 0) fail('Nenhuma família ativa encontrada.');

  const targets = onlySub
    ? allFamilies.filter(f => f.subdomain === onlySub)
    : allFamilies;

  if (targets.length === 0) fail(`Família "${onlySub}" não encontrada ou não está ativa.`);

  const migrations = loadMigrationFiles();
  console.log(`\n  Famílias-alvo: ${targets.length}`);
  console.log(`  Migrations no repositório: ${migrations.length}`);
  console.log(`  Último arquivo: ${migrations.at(-1)?.version ?? '—'}\n`);

  const totals = { applied: 0, skipped: 0, errors: 0 };

  for (const family of targets) {
    // CF token da instância (está no .env da família)
    const envPath = join(CTRL, 'envs', `${family.subdomain}.env`);
    const env     = parseEnvFile(envPath);
    const token   = env.CLOUDFLARE_API_TOKEN;
    if (!token) { warn(`Token CF não encontrado para ${family.subdomain} — pulando`); continue; }

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
