-- Recurring transactions (salary, rent, subscriptions, etc.)
CREATE TABLE IF NOT EXISTS recurrences (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  amount_in_cents INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'DES',           -- 'REC' | 'DES'
  category TEXT NOT NULL DEFAULT 'Outros',
  account_id TEXT,                             -- NULL if credit card
  credit_card_id TEXT,
  frequency TEXT NOT NULL DEFAULT 'monthly',  -- 'daily' | 'weekly' | 'monthly' | 'yearly'
  day_of_month INTEGER,                        -- e.g. 5 = "todo dia 5"
  start_date TEXT NOT NULL,                    -- first occurrence YYYY-MM-DD
  end_date TEXT,                               -- NULL = infinite
  last_generated_date TEXT,                    -- last date a tx was generated
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed de recorrências REMOVIDO (era demo: salário MKS, aluguel Loft, Netflix…).
-- Limpeza: migration 0018_remove_demo_seed.sql
