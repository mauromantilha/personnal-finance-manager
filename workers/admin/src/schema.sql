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

INSERT OR IGNORE INTO categories VALUES ('cat-alimentacao',    'Alimentação',    NULL,              '🍽️',  '#EA580C', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-transporte',     'Transporte',     NULL,              '🚗',  '#0284C7', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-moradia',        'Moradia',        NULL,              '🏠',  '#7C3AED', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-saude',          'Saúde',          NULL,              '❤️',  '#DC2626', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-educacao',       'Educação',       NULL,              '📚',  '#0891B2', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-lazer',          'Lazer',          NULL,              '🎮',  '#16A34A', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-vestuario',      'Vestuário',      NULL,              '👕',  '#DB2777', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-investimentos',  'Investimentos',  NULL,              '📈',  '#059669', 'both');
INSERT OR IGNORE INTO categories VALUES ('cat-receita',        'Receita',        NULL,              '💰',  '#EAB308', 'income');
INSERT OR IGNORE INTO categories VALUES ('cat-outros',         'Outros',         NULL,              '📦',  '#6B7280', 'both');
INSERT OR IGNORE INTO categories VALUES ('cat-supermercado',   'Supermercado',   'cat-alimentacao', '🛒',  '#EA580C', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-restaurante',    'Restaurante',    'cat-alimentacao', '🍴',  '#F97316', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-delivery',       'Delivery',       'cat-alimentacao', '🛵',  '#FB923C', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-padaria',        'Padaria/Café',   'cat-alimentacao', '☕',  '#FDBA74', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-uber',           'Uber/99',        'cat-transporte',  '📱',  '#0284C7', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-combustivel',    'Combustível',    'cat-transporte',  '⛽',  '#0369A1', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-transporte-pub', 'Transporte Púb.','cat-transporte',  '🚌',  '#075985', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-estacionamento', 'Estacionamento', 'cat-transporte',  '🅿️',  '#0C4A6E', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-aluguel',        'Aluguel',        'cat-moradia',     '🔑',  '#7C3AED', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-condominio',     'Condomínio',     'cat-moradia',     '🏢',  '#6D28D9', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-agua-luz',       'Água/Luz/Gás',   'cat-moradia',     '💡',  '#5B21B6', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-internet',       'Internet/TV',    'cat-moradia',     '📡',  '#4C1D95', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-farmacia',       'Farmácia',       'cat-saude',       '💊',  '#DC2626', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-consulta',       'Consulta/Exame', 'cat-saude',       '🏥',  '#B91C1C', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-plano-saude',    'Plano de Saúde', 'cat-saude',       '🩺',  '#991B1B', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-academia',       'Academia',       'cat-saude',       '🏋️',  '#7F1D1D', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-cursos',         'Cursos Online',  'cat-educacao',    '💻',  '#0891B2', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-livros',         'Livros',         'cat-educacao',    '📖',  '#0E7490', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-faculdade',      'Faculdade',      'cat-educacao',    '🎓',  '#155E75', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-streaming',      'Streaming',      'cat-lazer',       '📺',  '#16A34A', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-viagem',         'Viagem',         'cat-lazer',       '✈️',  '#15803D', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-cinema',         'Cinema/Show',    'cat-lazer',       '🎬',  '#166534', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-jogos',          'Jogos',          'cat-lazer',       '🎮',  '#14532D', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-salario',        'Salário',        'cat-receita',     '💼',  '#EAB308', 'income');
INSERT OR IGNORE INTO categories VALUES ('cat-freelance',      'Freelance',      'cat-receita',     '🖥️',  '#CA8A04', 'income');
INSERT OR IGNORE INTO categories VALUES ('cat-dividendos',     'Dividendos',     'cat-receita',     '📊',  '#A16207', 'income');
INSERT OR IGNORE INTO categories VALUES ('cat-bonus',          'Bônus/13º',      'cat-receita',     '🎁',  '#854D0E', 'income');
INSERT OR IGNORE INTO categories VALUES ('cat-aporte',         'Aporte',         'cat-investimentos','💸', '#059669', 'expense');
INSERT OR IGNORE INTO categories VALUES ('cat-resgate',        'Resgate',        'cat-investimentos','🏧', '#047857', 'income');

INSERT OR IGNORE INTO schema_migrations (version) VALUES ('1.0.0');
