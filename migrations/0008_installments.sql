CREATE TABLE IF NOT EXISTS installment_groups (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  total_in_cents INTEGER NOT NULL,
  installment_count INTEGER NOT NULL,
  installment_amount_in_cents INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'Compras',
  account_id TEXT,
  credit_card_id TEXT,
  member_id TEXT,
  start_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
