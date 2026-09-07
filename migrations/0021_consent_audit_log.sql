-- Migration 0021: Tabela de auditoria de consentimento (Proteção Jurídica MKS Brasil & LGPD)
CREATE TABLE IF NOT EXISTS consent_audit_log (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL,
  user_email         TEXT NOT NULL,
  consent_type       TEXT NOT NULL, -- 'AI_DOCUMENT_ANALYSIS', 'LGPD_POLICY', etc.
  document_type      TEXT,          -- 'BILL', 'INVOICE', 'INVESTMENT_STATEMENT', etc.
  disclaimer_version TEXT NOT NULL, -- 'v1.0'
  disclaimer_text    TEXT NOT NULL, -- Snapshot integral do termo de isenção aceito
  ip_address         TEXT,
  user_agent         TEXT,
  accepted_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_consent_user ON consent_audit_log(user_id, accepted_at);
CREATE INDEX IF NOT EXISTS idx_consent_type ON consent_audit_log(consent_type, accepted_at);
