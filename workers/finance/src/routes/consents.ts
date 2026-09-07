import { Hono } from 'hono';
import type { Env, Variables } from '../index';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

export const DEFAULT_AI_DISCLAIMER_TEXT =
  'Ao enviar este extrato ou documento, você declara estar ciente e consente expressamente que as informações financeiras e imagens sejam processadas por inteligência artificial exclusivamente para extração e categorização de dados. Você reconhece que dados confidenciais (como CPF, números de cartão e contas) são automaticamente mascarados e isenta a MKS Brasil de quaisquer responsabilidades decorrentes do processamento automatizado, nos termos da LGPD e dos Termos de Uso.';

export interface DbConsentAudit {
  id: string;
  user_id: string;
  user_email: string;
  consent_type: string;
  document_type: string | null;
  disclaimer_version: string;
  disclaimer_text: string;
  ip_address: string | null;
  user_agent: string | null;
  accepted_at: string;
}

// ── GET /api/consents — Lista logs de consentimento do tenant ─────────────────
router.get('/consents', async (c) => {
  const db = c.get('db');
  const rows = await db.query<DbConsentAudit>(
    'SELECT * FROM consent_audit_log ORDER BY accepted_at DESC LIMIT 100',
  );
  return c.json({
    consents: rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      userEmail: r.user_email,
      consentType: r.consent_type,
      documentType: r.document_type,
      disclaimerVersion: r.disclaimer_version,
      disclaimerText: r.disclaimer_text,
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
      acceptedAt: r.accepted_at,
    })),
  });
});

// ── POST /api/consents — Registra consentimento do usuário ────────────────────
router.post('/consents', async (c) => {
  const db   = c.get('db');
  const user = c.get('user');
  const body = await c.req.json<any>().catch(() => ({}));

  const consentType       = String(body.consentType || 'AI_DOCUMENT_ANALYSIS');
  const documentType      = body.documentType ? String(body.documentType) : null;
  const disclaimerVersion = String(body.disclaimerVersion || '1.0');
  const disclaimerText    = String(body.disclaimerText || DEFAULT_AI_DISCLAIMER_TEXT);

  const ip        = c.req.header('CF-Connecting-IP') ?? c.req.header('x-forwarded-for') ?? 'unknown';
  const userAgent = c.req.header('user-agent') ?? 'unknown';
  const id        = `cst-${crypto.randomUUID()}`;

  await db.exec(
    `INSERT INTO consent_audit_log (
      id, user_id, user_email, consent_type, document_type,
      disclaimer_version, disclaimer_text, ip_address, user_agent, accepted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [id, user.id, user.email, consentType, documentType, disclaimerVersion, disclaimerText, ip, userAgent],
  );

  return c.json({
    ok: true,
    id,
    userEmail: user.email,
    acceptedAt: new Date().toISOString(),
  }, 201);
});

export default router;
