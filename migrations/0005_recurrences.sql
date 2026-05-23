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

-- Seed: common recurring expenses/income
INSERT OR IGNORE INTO recurrences VALUES (
  'rec-1','Salário Mensal MKS Brasil',650000,'REC','Receita','acc-2',NULL,
  'monthly',1,'2026-01-01',NULL,'2026-05-01',1,datetime('now')
);
INSERT OR IGNORE INTO recurrences VALUES (
  'rec-2','Aluguel Loft Paulista',180000,'DES','Moradia','acc-2',NULL,
  'monthly',2,'2026-01-01',NULL,'2026-05-02',1,datetime('now')
);
INSERT OR IGNORE INTO recurrences VALUES (
  'rec-3','Netflix',5290,'DES','Lazer','acc-2',NULL,
  'monthly',17,'2026-01-01',NULL,'2026-05-17',1,datetime('now')
);
INSERT OR IGNORE INTO recurrences VALUES (
  'rec-4','Spotify',2190,'DES','Lazer','acc-2',NULL,
  'monthly',20,'2026-01-01',NULL,NULL,1,datetime('now')
);
INSERT OR IGNORE INTO recurrences VALUES (
  'rec-5','Plano de Saúde Bradesco',48000,'DES','Saúde','acc-2',NULL,
  'monthly',10,'2026-01-01',NULL,'2026-05-10',1,datetime('now')
);
INSERT OR IGNORE INTO recurrences VALUES (
  'rec-6','Condomínio',32000,'DES','Moradia','acc-2',NULL,
  'monthly',15,'2026-01-01',NULL,'2026-05-15',1,datetime('now')
);
INSERT OR IGNORE INTO recurrences VALUES (
  'rec-7','Aporte Mensal Poupança',120000,'DES','Investimentos','acc-2',NULL,
  'monthly',10,'2026-01-01',NULL,'2026-05-10',1,datetime('now')
);
