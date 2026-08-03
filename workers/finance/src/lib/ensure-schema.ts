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
