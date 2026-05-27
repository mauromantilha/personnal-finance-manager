-- MKS Finanças — Schema consolidado v1.0
-- Aplicado automaticamente na provisão de novas famílias

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT NOT NULL PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id               TEXT    PRIMARY KEY,
  name             TEXT    NOT NULL,
  type             TEXT    NOT NULL,
  bank_name        TEXT    NOT NULL,
  balance_in_cents INTEGER NOT NULL DEFAULT 0,
  color            TEXT    NOT NULL DEFAULT '#6B7280',
  is_linked        INTEGER NOT NULL DEFAULT 0,
  branch           TEXT,
  account_number   TEXT,
  account_digit    TEXT,
  manager_name     TEXT,
  manager_phone    TEXT
);

CREATE TABLE IF NOT EXISTS connections (
  id               TEXT PRIMARY KEY,
  institution_name TEXT NOT NULL,
  logo             TEXT DEFAULT '🏦',
  status           TEXT NOT NULL DEFAULT 'DISCONNECTED',
  item_id          TEXT,
  last_synced_at   TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id                   TEXT    PRIMARY KEY,
  amount_in_cents      INTEGER NOT NULL,
  date                 TEXT    NOT NULL,
  type                 TEXT    NOT NULL,
  category             TEXT    NOT NULL,
  description          TEXT    NOT NULL,
  account_id           TEXT,
  destination_account_id TEXT,
  is_synced            INTEGER NOT NULL DEFAULT 0,
  original_merchant_name TEXT,
  credit_card_id       TEXT,
  invoice_id           TEXT,
  installment_number   INTEGER,
  installment_total    INTEGER,
  installment_group_id TEXT,
  document_key         TEXT,
  member_id            TEXT,
  income_type          TEXT,
  payer                TEXT,
  profession           TEXT,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budgets (
  id             TEXT    PRIMARY KEY,
  category       TEXT    NOT NULL UNIQUE,
  limit_in_cents INTEGER NOT NULL DEFAULT 0,
  spent_in_cents INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS goals (
  id               TEXT    PRIMARY KEY,
  name             TEXT    NOT NULL,
  target_in_cents  INTEGER NOT NULL,
  current_in_cents INTEGER NOT NULL DEFAULT 0,
  target_date      TEXT    NOT NULL,
  color            TEXT    NOT NULL DEFAULT '#6366F1'
);

CREATE TABLE IF NOT EXISTS alerts (
  id      TEXT    PRIMARY KEY,
  type    TEXT    NOT NULL DEFAULT 'INFO',
  title   TEXT    NOT NULL,
  message TEXT    NOT NULL,
  date    TEXT    NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chat_history (
  id        TEXT PRIMARY KEY,
  sender    TEXT NOT NULL,
  text      TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_cards (
  id             TEXT    PRIMARY KEY,
  name           TEXT    NOT NULL,
  bank_name      TEXT    NOT NULL,
  last_four      TEXT,
  limit_in_cents INTEGER NOT NULL DEFAULT 0,
  billing_day    INTEGER NOT NULL DEFAULT 1,
  due_day        INTEGER NOT NULL DEFAULT 10,
  color          TEXT    NOT NULL DEFAULT '#6366F1',
  is_active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS invoices (
  id             TEXT    PRIMARY KEY,
  credit_card_id TEXT    NOT NULL REFERENCES credit_cards(id),
  month          TEXT    NOT NULL,
  total_in_cents INTEGER NOT NULL DEFAULT 0,
  status         TEXT    NOT NULL DEFAULT 'open',
  due_date       TEXT,
  paid_at        TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recurrences (
  id                  TEXT    PRIMARY KEY,
  description         TEXT    NOT NULL,
  amount_in_cents     INTEGER NOT NULL,
  type                TEXT    NOT NULL DEFAULT 'DES',
  category            TEXT    NOT NULL DEFAULT 'Outros',
  account_id          TEXT,
  credit_card_id      TEXT,
  frequency           TEXT    NOT NULL DEFAULT 'monthly',
  day_of_month        INTEGER,
  start_date          TEXT    NOT NULL,
  end_date            TEXT,
  last_generated_date TEXT,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS family_members (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT '#6366F1',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS installment_groups (
  id                          TEXT    PRIMARY KEY,
  description                 TEXT    NOT NULL,
  total_in_cents              INTEGER NOT NULL,
  installment_count           INTEGER NOT NULL,
  installment_amount_in_cents INTEGER NOT NULL,
  category                    TEXT    NOT NULL DEFAULT 'Compras',
  account_id                  TEXT,
  credit_card_id              TEXT,
  member_id                   TEXT,
  start_date                  TEXT    NOT NULL,
  created_at                  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS investments (
  id                    TEXT    PRIMARY KEY,
  name                  TEXT    NOT NULL,
  ticker                TEXT,
  asset_class           TEXT    NOT NULL DEFAULT 'fixed_income',
  institution           TEXT    NOT NULL,
  invested_in_cents     INTEGER NOT NULL DEFAULT 0,
  current_value_in_cents INTEGER NOT NULL DEFAULT 0,
  annual_rate           REAL,
  start_date            TEXT    NOT NULL,
  maturity_date         TEXT,
  account_id            TEXT,
  notes                 TEXT,
  created_at            TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id                   TEXT    PRIMARY KEY,
  name                 TEXT    NOT NULL,
  email                TEXT    NOT NULL UNIQUE,
  password_hash        TEXT,
  totp_secret          TEXT,
  role                 TEXT    NOT NULL DEFAULT 'member',
  member_id            TEXT,
  lgpd_accepted_at     TEXT,
  lgpd_policy_version  TEXT,
  avatar_url           TEXT,
  relationship         TEXT,
  is_active            INTEGER NOT NULL DEFAULT 1,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invites (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lgpd_aceites (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_version TEXT    NOT NULL DEFAULT '1.0',
  user_id        TEXT,
  ip_address     TEXT,
  user_agent     TEXT,
  accepted_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  parent_id TEXT REFERENCES categories(id),
  icon      TEXT NOT NULL DEFAULT '📦',
  color     TEXT NOT NULL DEFAULT '#6B7280',
  type      TEXT NOT NULL DEFAULT 'both'
);

