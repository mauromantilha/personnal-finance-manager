import type { D1Client } from './d1';

/**
 * Garante colunas/tabelas críticas em tenants antigos (idempotente).
 * Deploy de código novo não aplica migrations D1 automaticamente — sem isto,
 * INSERT com colunas de 0015+ quebra criação de contas em famílias legadas.
 */
export async function ensureTenantSchema(db: D1Client): Promise<void> {
  const accountCols = await columnSet(db, 'accounts');
  await addColumnIfMissing(db, accountCols, 'accounts', 'branch', 'TEXT');
  await addColumnIfMissing(db, accountCols, 'accounts', 'account_number', 'TEXT');
  await addColumnIfMissing(db, accountCols, 'accounts', 'account_digit', 'TEXT');
  await addColumnIfMissing(db, accountCols, 'accounts', 'manager_name', 'TEXT');
  await addColumnIfMissing(db, accountCols, 'accounts', 'manager_phone', 'TEXT');

  const userCols = await columnSet(db, 'users');
  await addColumnIfMissing(db, userCols, 'users', 'relationship', 'TEXT');

  const txCols = await columnSet(db, 'transactions');
  await addColumnIfMissing(db, txCols, 'transactions', 'income_type', 'TEXT');
  await addColumnIfMissing(db, txCols, 'transactions', 'payer', 'TEXT');
  await addColumnIfMissing(db, txCols, 'transactions', 'profession', 'TEXT');

  // Tabelas que podem faltar em tenants provisionados antes das migrations
  await db.exec(`CREATE TABLE IF NOT EXISTS credit_cards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    last_four TEXT,
    limit_in_cents INTEGER NOT NULL DEFAULT 0,
    billing_day INTEGER NOT NULL DEFAULT 1,
    due_day INTEGER NOT NULL DEFAULT 10,
    color TEXT NOT NULL DEFAULT '#6366F1',
    is_active INTEGER NOT NULL DEFAULT 1
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    credit_card_id TEXT NOT NULL,
    month TEXT NOT NULL,
    total_in_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open',
    due_date TEXT,
    paid_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS debts (
    id TEXT PRIMARY KEY,
    creditor TEXT NOT NULL,
    type TEXT NOT NULL,
    original_amount_in_cents INTEGER NOT NULL,
    current_amount_in_cents INTEGER NOT NULL,
    due_date TEXT,
    months_overdue INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ativo',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT NOT NULL PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // Remove seed demo enquanto fingerprints existirem (Itaú Personalité, salário MKS…)
  await purgeDemoSeedIfNeeded(db);
}

/** Fingerprints do seed antigo (0002/0004/0005) — IDs fixos + nomes conhecidos. */
async function tenantHasDemoSeed(db: D1Client): Promise<boolean> {
  const checks = [
    `SELECT 1 AS x FROM accounts WHERE id IN ('acc-1','acc-2','acc-3','acc-4')
       OR name IN ('Conta Itaú Personalité','Carteira Principal','Poupança Inter','XP Carteira Global')
     LIMIT 1`,
    `SELECT 1 AS x FROM transactions WHERE id IN ('tx-1','tx-2','tx-3','tx-4','tx-5','tx-6','tx-7','tx-8','tx-9','tx-10','tx-11','tx-12')
       OR description = 'Salário Mensal MKS Brasil'
       OR description = 'Aluguel Loft Paulista'
     LIMIT 1`,
    `SELECT 1 AS x FROM credit_cards WHERE id IN ('cc-1','cc-2')
       OR name LIKE '%Ultravioleta%'
     LIMIT 1`,
    `SELECT 1 AS x FROM goals WHERE id IN ('g-1','g-2')
       OR name IN ('Reserva de Emergência','Viagem de Férias Japão')
     LIMIT 1`,
    `SELECT 1 AS x FROM connections WHERE id IN ('conn-itau','conn-inter','conn-xp','conn-bradesco') LIMIT 1`,
    `SELECT 1 AS x FROM recurrences WHERE id IN ('rec-1','rec-2','rec-3','rec-4','rec-5','rec-6','rec-7') LIMIT 1`,
  ];

  for (const sql of checks) {
    try {
      const row = await db.first<{ x: number }>(sql);
      if (row) return true;
    } catch {
      // Tabela pode não existir — segue
    }
  }
  return false;
}

/**
 * Se ainda houver seed demo, apaga TODO o conjunto financeiro do tenant
 * (igual wipe-data do admin). Assim recorrências não regeneram txs fictícias.
 * Roda em todo /api/data enquanto fingerprints existirem — não depende só do
 * flag 0018 (que podia ser marcado sem limpar de fato).
 */
async function purgeDemoSeedIfNeeded(db: D1Client): Promise<void> {
  const hasDemo = await tenantHasDemoSeed(db);
  if (!hasDemo) {
    // Garante tracking mesmo em tenants limpos
    try {
      await db.exec(`INSERT OR IGNORE INTO schema_migrations (version) VALUES ('0018_remove_demo_seed')`);
      await db.exec(`INSERT OR IGNORE INTO schema_migrations (version) VALUES ('0019_force_purge_demo')`);
    } catch { /* ignore */ }
    return;
  }

  console.warn('[purgeDemoSeed] fingerprints de seed detectados — limpando dados financeiros');

  // Ordem: filhos antes de pais (evita FK em schemas com REFERENCES)
  const tables = [
    'transactions',
    'invoices',
    'credit_cards',
    'recurrences',
    'installment_groups',
    'investments',
    'debts',
    'budgets',
    'goals',
    'alerts',
    'chat_history',
    'connections',
    'accounts',
  ];

  for (const table of tables) {
    try {
      await db.exec(`DELETE FROM ${table}`);
    } catch (e) {
      console.error('[purgeDemoSeed]', table, (e as Error).message);
    }
  }

  try {
    await db.exec(`INSERT OR IGNORE INTO schema_migrations (version) VALUES ('0018_remove_demo_seed')`);
    await db.exec(`INSERT OR IGNORE INTO schema_migrations (version) VALUES ('0019_force_purge_demo')`);
  } catch (e) {
    console.error('[purgeDemoSeed] schema_migrations', (e as Error).message);
  }
}

async function columnSet(db: D1Client, table: string): Promise<Set<string>> {
  try {
    const rows = await db.query<{ name: string }>(`PRAGMA table_info(${table})`);
    return new Set(rows.map(r => r.name));
  } catch {
    return new Set();
  }
}

async function addColumnIfMissing(
  db: D1Client,
  cols: Set<string>,
  table: string,
  column: string,
  typeSql: string,
): Promise<void> {
  if (cols.has(column)) return;
  try {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeSql}`);
    cols.add(column);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    // Outro request pode ter adicionado a coluna em paralelo
    if (!/duplicate column/i.test(msg)) throw e;
    cols.add(column);
  }
}
