CREATE TABLE IF NOT EXISTS debts (
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
);
