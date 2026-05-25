-- Sprint 1: Adapta users para CF Access (sem senha/TOTP) + LGPD por usuário

-- Campos de autenticação legada ficam NULL (CF Access assume o controle)
UPDATE users SET password_hash = NULL, totp_secret = NULL;

-- Adiciona campos de LGPD por usuário
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member';
ALTER TABLE users ADD COLUMN member_id TEXT;
ALTER TABLE users ADD COLUMN lgpd_accepted_at TEXT;
ALTER TABLE users ADD COLUMN lgpd_policy_version TEXT;

-- Primeiro usuário existente vira owner
UPDATE users SET role = 'owner' WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1);

-- Rastreia qual usuário aceitou o LGPD em cada registro
ALTER TABLE lgpd_aceites ADD COLUMN user_id TEXT;
