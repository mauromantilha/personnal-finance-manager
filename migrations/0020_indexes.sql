-- Índices para tabelas quentes (transactions e relacionadas)
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_tx_member_date ON transactions(member_id, date);
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_tx_credit_card ON transactions(credit_card_id);
CREATE INDEX IF NOT EXISTS idx_tx_installment_group ON transactions(installment_group_id);
CREATE INDEX IF NOT EXISTS idx_invoices_card_month ON invoices(credit_card_id, month);
CREATE INDEX IF NOT EXISTS idx_recurrences_active_dom ON recurrences(is_active, day_of_month);
