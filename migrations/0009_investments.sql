CREATE TABLE IF NOT EXISTS investments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ticker TEXT,
  asset_class TEXT NOT NULL DEFAULT 'fixed_income',
  institution TEXT NOT NULL,
  invested_in_cents INTEGER NOT NULL DEFAULT 0,
  current_value_in_cents INTEGER NOT NULL DEFAULT 0,
  annual_rate REAL,
  start_date TEXT NOT NULL,
  maturity_date TEXT,
  account_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
