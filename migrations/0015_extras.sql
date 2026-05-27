-- 0015: Campos bancários na conta + relação familiar no usuário
ALTER TABLE accounts ADD COLUMN branch TEXT;
ALTER TABLE accounts ADD COLUMN account_number TEXT;
ALTER TABLE accounts ADD COLUMN account_digit TEXT;
ALTER TABLE accounts ADD COLUMN manager_name TEXT;
ALTER TABLE accounts ADD COLUMN manager_phone TEXT;
ALTER TABLE users ADD COLUMN relationship TEXT;
