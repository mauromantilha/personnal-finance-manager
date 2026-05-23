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

-- Seed credit cards
INSERT OR IGNORE INTO credit_cards VALUES ('cc-1', 'Nubank Ultravioleta', 'Nubank',   '4531', 1500000, 12, 19, '#8B5CF6', 1);
INSERT OR IGNORE INTO credit_cards VALUES ('cc-2', 'Itaú Personnalité',   'Banco Itaú', '8872', 2000000, 20, 27, '#0284C7', 1);

-- Seed invoices (current month: 2026-05)
INSERT OR IGNORE INTO invoices VALUES ('inv-cc1-2605', 'cc-1', '2026-05', 89740,  'open',   '2026-06-19', NULL, '2026-05-01T00:00:00Z');
INSERT OR IGNORE INTO invoices VALUES ('inv-cc2-2605', 'cc-2', '2026-05', 245300, 'open',   '2026-06-27', NULL, '2026-05-01T00:00:00Z');
INSERT OR IGNORE INTO invoices VALUES ('inv-cc1-2604', 'cc-1', '2026-04', 112500, 'paid',   '2026-05-19', '2026-05-19T10:30:00Z', '2026-04-01T00:00:00Z');
