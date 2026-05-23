CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  balance_in_cents INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#6B7280',
  is_linked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  institution_name TEXT NOT NULL,
  logo TEXT DEFAULT '🏦',
  status TEXT NOT NULL DEFAULT 'DISCONNECTED',
  item_id TEXT,
  last_synced_at TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  amount_in_cents INTEGER NOT NULL,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  account_id TEXT NOT NULL,
  destination_account_id TEXT,
  is_synced INTEGER NOT NULL DEFAULT 0,
  original_merchant_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL UNIQUE,
  limit_in_cents INTEGER NOT NULL DEFAULT 0,
  spent_in_cents INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target_in_cents INTEGER NOT NULL,
  current_in_cents INTEGER NOT NULL DEFAULT 0,
  target_date TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366F1'
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'INFO',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  date TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chat_history (
  id TEXT PRIMARY KEY,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp TEXT NOT NULL
);
