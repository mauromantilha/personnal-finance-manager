-- Migration 0014: Metadados de receita e campo de profissão/pagador
-- Adicionados às transações tipo REC para rastreamento detalhado de renda

ALTER TABLE transactions ADD COLUMN income_type TEXT;
-- Valores possíveis: salary, freelance, rent, dividends, inheritance, investment_return, pro_labore, other

ALTER TABLE transactions ADD COLUMN payer TEXT;
-- Nome do pagador da receita (empresa, inquilino, corretora, etc.)

ALTER TABLE transactions ADD COLUMN profession TEXT;
-- Profissão/cargo do usuário neste lançamento de receita
