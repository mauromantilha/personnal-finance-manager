-- Credit cards (separate from bank accounts)
CREATE TABLE IF NOT EXISTS credit_cards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  last_four TEXT,
  limit_in_cents INTEGER NOT NULL DEFAULT 0,
  billing_day INTEGER NOT NULL DEFAULT 1,
  due_day INTEGER NOT NULL DEFAULT 10,
  color TEXT NOT NULL DEFAULT '#6366F1',
  is_active INTEGER NOT NULL DEFAULT 1
);

-- Invoices (one per card per month)
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  credit_card_id TEXT NOT NULL REFERENCES credit_cards(id),
  month TEXT NOT NULL,  -- 'YYYY-MM'
  total_in_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',  -- 'open', 'closed', 'paid'
  due_date TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Extend transactions for credit card + installments
ALTER TABLE transactions ADD COLUMN credit_card_id TEXT;
ALTER TABLE transactions ADD COLUMN invoice_id TEXT;
ALTER TABLE transactions ADD COLUMN installment_number INTEGER;
ALTER TABLE transactions ADD COLUMN installment_total INTEGER;
ALTER TABLE transactions ADD COLUMN installment_group_id TEXT;

-- Seed de cartões/faturas REMOVIDO (era demo Nubank/Itaú).
-- Limpeza: migration 0018_remove_demo_seed.sql
