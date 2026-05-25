-- Controle de versão de schema por banco (D1 por família)
-- Criada por migrate-all.mjs; provision.mjs registra cada migration ao aplicar
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT NOT NULL PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
