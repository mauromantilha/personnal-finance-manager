import { Hono } from 'hono';
import type { Env, Tenant } from '../index';

const CF  = 'https://api.cloudflare.com/client/v4';
const hdr = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

const router = new Hono<{ Bindings: Env }>();

const LEVELS: Record<string, { label: string; color: string; icon: string }> = {
  info:        { label: 'Informativo',           color: '#0aad68', icon: 'ℹ️'  },
  maintenance: { label: 'Manutenção Programada', color: '#e09210', icon: '🔧' },
  incident:    { label: 'Indisponibilidade',     color: '#d93535', icon: '🔴' },
  news:        { label: 'Novidade',              color: '#4f70f7', icon: '🚀' },
};

async function getOwnerEmail(
  accountId: string, token: string, dbId: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${CF}/accounts/${accountId}/d1/database/${dbId}/query`, {
      method: 'POST',
      headers: hdr(token),
      body: JSON.stringify({ sql: "SELECT email FROM users WHERE role='owner' LIMIT 1" }),
      signal: AbortSignal.timeout(5000),
    });
    const d = await res.json() as any;
    return d.result?.[0]?.results?.[0]?.email ?? null;
  } catch { return null; }
}

// GET /api/communications
router.get('/communications', async (c) => {
  const raw   = await c.env.MKS_ADMIN.get('comms:index');
  const index: string[] = JSON.parse(raw ?? '[]');
  const items = (await Promise.all(
    index.slice(-50).map(id => c.env.MKS_ADMIN.get<any>(`comm:${id}`, 'json')),
  )).filter(Boolean);
  return c.json({ items: items.reverse() });
});

// POST /api/communications/send
router.post('/communications/send', async (c) => {
  const { subject, message, level, target } = await c.req.json<{
    subject: string; message: string; level: string; target: string;
  }>();

  if (!subject?.trim() || !message?.trim())
    return c.json({ error: 'Assunto e mensagem são obrigatórios.' }, 400);

  const { CF_ACCOUNT_ID, CF_API_TOKEN, MKS_TENANTS, MKS_ADMIN, RESEND_API_KEY, BASE_DOMAIN, RESEND_FROM_DOMAIN } = c.env;
  const lvl = LEVELS[level] ?? LEVELS.info;

  const index: string[] = JSON.parse(await MKS_TENANTS.get('tenants:index') ?? '[]');
  let tenants = (await Promise.all(
    index.map(s => MKS_TENANTS.get<Tenant>(`tenant:${s}`, 'json')),
  )).filter((t): t is Tenant => !!t && t.status === 'active');

  if (target && target !== 'all')
    tenants = tenants.filter(t => t.subdomain === target);

  if (!tenants.length)
    return c.json({ error: 'Nenhuma família ativa encontrada.' }, 400);

  const recipients: { name: string; email: string }[] = [];
  await Promise.all(tenants.map(async t => {
    const email = await getOwnerEmail(CF_ACCOUNT_ID, CF_API_TOKEN, t.d1DatabaseId);
    if (email) recipients.push({ name: t.name, email });
  }));

  if (!recipients.length)
    return c.json({ error: 'Não foi possível obter emails dos responsáveis.' }, 400);

  const sent: string[] = [];
  const errors: string[] = [];

  await Promise.all(recipients.map(async r => {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `Finanças Livre <noreply@${RESEND_FROM_DOMAIN ?? BASE_DOMAIN}>`,
          to:   [r.email],
          subject,
          html: buildEmailHtml(lvl, subject, message, r.name, BASE_DOMAIN),
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sent.push(r.email);
    } catch (e) {
      errors.push(`${r.email}: ${(e as Error).message}`);
    }
  }));

  const id     = Date.now().toString();
  const record = { id, subject, level, message, sentAt: new Date().toISOString(), sent, errors, total: recipients.length };
  const existing: string[] = JSON.parse(await MKS_ADMIN.get('comms:index') ?? '[]');
  existing.push(id);

  await Promise.all([
    MKS_ADMIN.put(`comm:${id}`, JSON.stringify(record)),
    MKS_ADMIN.put('comms:index', JSON.stringify(existing.slice(-100))),
  ]);

  return c.json({ success: true, sent: sent.length, errors, total: recipients.length });
});

function buildEmailHtml(
  lvl: { label: string; color: string; icon: string },
  subject: string, message: string, familyName: string, baseDomain: string,
): string {
  const escaped = message
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;">
  <div style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:${lvl.color};padding:16px 24px;">
      <span style="color:#fff;font-weight:700;font-size:15px;">${lvl.icon} ${lvl.label}</span>
    </div>
    <div style="padding:24px;">
      <h2 style="color:#1a2340;margin:0 0 16px;font-size:18px;">${subject}</h2>
      <div style="color:#334155;font-size:14px;line-height:1.8;">${escaped}</div>
    </div>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:0;">
    <div style="padding:16px 24px;background:#f8fafc;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">
        Enviado para a família <strong>${familyName}</strong> pelo painel administrativo.<br>
        <a href="https://${baseDomain}" style="color:#6366f1;">Finanças Livre</a>
      </p>
    </div>
  </div>
</div>`;
}

export default router;
