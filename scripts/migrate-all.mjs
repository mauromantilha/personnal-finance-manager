#!/usr/bin/env node
/**
 * MKS Finanças — Migration runner para instâncias familiares
 *
 * Uso:
 *   node scripts/migrate-all.mjs                        # todas as famílias ativas (lê do KV)
 *   node scripts/migrate-all.mjs --subdomain silva      # somente uma família
 *   node scripts/migrate-all.mjs --dry-run              # simula sem aplicar
 *   node scripts/migrate-all.mjs --main                 # instância principal (D1_DATABASE_ID do .env)
 *   node scripts/migrate-all.mjs --fix-schema           # só reparo: debts + seed categorias se vazio
 *
 * Lógica:
 *   1. Lê tenants ativos do KV MKS_TENANTS (tenant:* keys, paginado) — sem arquivo local
 *   2. Cria schema_migrations se não existe no D1
 *   3. Se vazia (DB antigo sem tracking): semeia versões estruturais legadas
 *      (NÃO inclui 0003_categories — seed precisa rodar se a tabela estiver vazia)
 *   4. Aplica somente as migrations pendentes (não presentes em schema_migrations)
 *   5. Reparo: garante tabela debts + seed de categorias se COUNT=0
 *   6. Registra cada migration aplicada em schema_migrations
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const MIGRATIONS = join(ROOT, 'migrations');
const CF_ACCOUNT = '9b61f609fee4408fd1c4344feaf9b16a';
const KV_NS_ID   = '6017e7ceeaa84a0fa7d7c798ce22bce8';

// Versões estruturais pré-tracking. Exclui 0003_categories de propósito:
// INSERT OR IGNORE é idempotente e corrige tenants provisionados sem seed.
// Inclui 0002_seed para NÃO reaplicar dados demo em DBs que já têm contas reais.
const LEGACY_VERSIONS = [
  '0001_schema', '0002_seed',
  '0004_credit_cards',
  '0005_recurrences', '0006_documents', '0007_family', '0008_installments',
  '0009_investments', '0010_users',
];

const args       = process.argv.slice(2);
const get        = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const onlySub    = get('--subdomain')?.toLowerCase();
const dryRun     = args.includes('--dry-run');
const mainMode   = args.includes('--main');
const fixSchema  = args.includes('--fix-schema');

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
  const families = [];
  let cursor;

  do {
    const qs = new URLSearchParams({ prefix: 'tenant:', limit: '1000' });
    if (cursor) qs.set('cursor', cursor);

    const keysResult = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/storage/kv/namespaces/${KV_NS_ID}/keys?${qs}`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).then(r => r.json());

    if (!keysResult.success) throw new Error(`KV list: ${JSON.stringify(keysResult.errors)}`);

    for (const { name: key } of keysResult.result ?? []) {
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

    cursor = keysResult.result_info?.cursor;
  } while (cursor);

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

/** Statements de seed de categorias (só INSERTs) a partir de 0003. */
function categorySeedStatements() {
  const file = join(MIGRATIONS, '0003_categories.sql');
  return parseSql(readFileSync(file, 'utf8')).filter(s =>
    /^INSERT\s+/i.test(s)
  );
}

async function ensureDebtsTable(d1DatabaseId, token) {
  const tables = await d1q(d1DatabaseId,
    `SELECT name FROM sqlite_master WHERE type='table' AND name='debts'`, [], token);
  if (tables.length > 0) {
    skip('debts: tabela já existe');
    await d1q(d1DatabaseId,
      `INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`, ['0016_debts'], token);
    return { created: false };
  }

  if (dryRun) {
    ok('debts: seria criada (dry-run)');
    return { created: true };
  }

  const stmts = parseSql(readFileSync(join(MIGRATIONS, '0016_debts.sql'), 'utf8'));
  for (const stmt of stmts) {
    await d1q(d1DatabaseId, stmt + ';', [], token);
  }
  await d1q(d1DatabaseId,
    `INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`, ['0016_debts'], token);
  ok('debts: tabela criada + 0016_debts registrada');
  return { created: true };
}

async function ensureCategorySeed(d1DatabaseId, token) {
  const tables = await d1q(d1DatabaseId,
    `SELECT name FROM sqlite_master WHERE type='table' AND name='categories'`, [], token);
  if (tables.length === 0) {
    warn('categories: tabela ausente — rode migrate-all sem --fix-schema para aplicar 0003');
    return { seeded: false };
  }

  const rows = await d1q(d1DatabaseId, 'SELECT COUNT(*) AS c FROM categories', [], token);
  const count = Number(rows[0]?.c ?? 0);
  if (count > 0) {
    skip(`categories: já tem ${count} linha(s)`);
    await d1q(d1DatabaseId,
      `INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`, ['0003_categories'], token);
    return { seeded: false };
  }

  const inserts = categorySeedStatements();
  if (dryRun) {
    ok(`categories: seriam inseridas ${inserts.length} linhas (dry-run)`);
    return { seeded: true };
  }

  for (const stmt of inserts) {
    await d1q(d1DatabaseId, stmt + ';', [], token);
    await new Promise(r => setTimeout(r, 50));
  }
  await d1q(d1DatabaseId,
    `INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`, ['0003_categories'], token);
  ok(`categories: seed aplicado (${inserts.length} inserts)`);
  return { seeded: true };
}

async function repairFamily({ name, subdomain, d1DatabaseId }, token) {
  log('🔧', `${name} (${subdomain}) — reparo schema`);
  if (dryRun) skip('dry-run — nenhuma alteração');

  // schema_migrations precisa existir para registrar versões
  if (!dryRun) {
    await d1q(d1DatabaseId,
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version TEXT NOT NULL PRIMARY KEY,
         applied_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`, [], token);
  }

  const debts = await ensureDebtsTable(d1DatabaseId, token);
  const cats  = await ensureCategorySeed(d1DatabaseId, token);
  return {
    applied: (debts.created ? 1 : 0) + (cats.seeded ? 1 : 0),
    skipped: (debts.created ? 0 : 1) + (cats.seeded ? 0 : 1),
    errors: 0,
    repaired: true,
  };
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
  if (appliedSet.size === 0) {
    const tables = await d1q(d1DatabaseId,
      `SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'`, [], token);
    if (tables.length > 0) {
      for (const v of LEGACY_VERSIONS) {
        await d1q(d1DatabaseId,
          `INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`, [v], token);
        appliedSet.add(v);
      }
      ok(`Schema_migrations semeada com ${LEGACY_VERSIONS.length} versões estruturais (sem 0003_categories)`);
    } else {
      ok('DB novo detectado — aplicando todas as migrations do zero');
    }
  }

  // 4. Aplicar pendentes
  const migrations = loadMigrationFiles();
  let applied = 0, skipped = 0, errors = 0;

  for (const { file, version } of migrations) {
    if (appliedSet.has(version)) { skip(`já aplicada: ${version}`); skipped++; continue; }

    // Nunca aplicar seed demo em tenant que já tem contas (só DB vazio de verdade)
    if (version === '0002_seed') {
      const tables = await d1q(d1DatabaseId,
        `SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'`, [], token);
      if (tables.length > 0) {
        const accCount = await d1q(d1DatabaseId, 'SELECT COUNT(*) AS c FROM accounts', [], token);
        if (Number(accCount[0]?.c ?? 0) > 0) {
          await d1q(d1DatabaseId,
            `INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`, [version], token);
          skip('0002_seed: pulada (DB já tem contas) — marcada como aplicada');
          skipped++;
          continue;
        }
      }
    }

    const stmts = parseSql(readFileSync(file, 'utf8'));
    let failed = false;
    for (const stmt of stmts) {
      try {
        await d1q(d1DatabaseId, stmt + ';', [], token);
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
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
      appliedSet.add(version);
    }
  }

  // 5. Reparo pós-migrate (cobre tenants que já tinham 0003 marcada sem seed)
  const debts = await ensureDebtsTable(d1DatabaseId, token);
  const cats  = await ensureCategorySeed(d1DatabaseId, token);
  applied += (debts.created ? 1 : 0) + (cats.seeded ? 1 : 0);

  return { applied, skipped, errors };
}

async function runTargets(targets, token) {
  const migrations = loadMigrationFiles();
  console.log(`\n  Famílias-alvo: ${targets.length}`);
  console.log(`  Migrations no repositório: ${migrations.length}`);
  console.log(`  Último arquivo: ${migrations.at(-1)?.version ?? '—'}`);
  if (fixSchema) console.log('  Modo: --fix-schema (só debts + categorias)\n');
  else console.log('');

  const totals = { applied: 0, skipped: 0, errors: 0 };

  for (const family of targets) {
    try {
      const r = fixSchema
        ? await repairFamily(family, token)
        : await migrateFamily(family, token);
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
  console.log(`  Aplicadas/reparos: ${totals.applied}`);
  console.log(`  Puladas:           ${totals.skipped}`);
  console.log(`  Erros:             ${totals.errors}`);
  if (dryRun) console.log('\n  ⚠️  Dry-run — nenhuma alteração foi aplicada.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (totals.errors > 0) process.exit(1);
}

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  MKS Finanças — Migration Runner');
  if (dryRun)    console.log('  [DRY-RUN — nenhuma alteração real]');
  if (mainMode)  console.log('  [MODO --main — instância principal]');
  if (fixSchema) console.log('  [MODO --fix-schema — reparo debts/categorias]');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (mainMode) {
    const mainEnv = parseEnvFile(join(ROOT, '.env'));
    const token   = mainEnv.CLOUDFLARE_API_TOKEN;
    const dbId    = mainEnv.D1_DATABASE_ID;
    if (!token) fail('CLOUDFLARE_API_TOKEN não encontrado no .env principal.');
    if (!dbId)  fail('D1_DATABASE_ID não encontrado no .env principal.');

    await runTargets(
      [{ name: 'Instância principal', subdomain: 'main', d1DatabaseId: dbId }],
      token,
    );
    return;
  }

  const rootEnv = parseEnvFile(join(ROOT, '.env'));
  const token   = rootEnv.CLOUDFLARE_API_TOKEN;
  if (!token) fail('CLOUDFLARE_API_TOKEN não encontrado no .env raiz.');

  const allFamilies = await loadTenantsFromKV(token);

  if (allFamilies.length === 0) fail('Nenhuma família ativa encontrada no KV. Use --main para a instância principal.');

  const targets = onlySub
    ? allFamilies.filter(f => f.subdomain === onlySub)
    : allFamilies;

  if (targets.length === 0) fail(`Família "${onlySub}" não encontrada ou não está ativa no KV.`);

  await runTargets(targets, token);
}

main().catch(e => fail(e.message));
