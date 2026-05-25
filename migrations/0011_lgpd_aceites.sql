-- LGPD Art. 7 / Art. 8 — Registro de aceite da Política de Privacidade
-- Cada linha representa um evento de consentimento (nova versão → novo registro)
CREATE TABLE IF NOT EXISTS lgpd_aceites (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_version TEXT    NOT NULL DEFAULT '1.0',
  ip_address     TEXT,
  user_agent     TEXT,
  accepted_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
