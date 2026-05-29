import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import {
  getStorageUsed, getStorageLimit, formatBytes,
  STORAGE_PAID_BYTES, STORAGE_UPGRADE_PRICE,
} from '../lib/storage';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── GET /api/storage/info ─────────────────────────────────────────────────────
router.get('/storage/info', async (c) => {
  const tenant    = c.get('tenant');
  const familyId  = tenant.familyId;
  const limitBytes  = getStorageLimit(tenant.storageTierBytes);
  const usedBytes   = await getStorageUsed(c.env.MKS_TENANTS, familyId);
  const percentage  = limitBytes > 0 ? Math.min(100, (usedBytes / limitBytes) * 100) : 0;
  const tier        = limitBytes >= STORAGE_PAID_BYTES ? 'paid' : 'free';

  return c.json({
    usedBytes,
    limitBytes,
    percentage: parseFloat(percentage.toFixed(1)),
    usedFormatted:  formatBytes(usedBytes),
    limitFormatted: formatBytes(limitBytes),
    tier,
    upgradePrice: STORAGE_UPGRADE_PRICE,
    upgradeLimitBytes: STORAGE_PAID_BYTES,
    upgradeLimitFormatted: formatBytes(STORAGE_PAID_BYTES),
  });
});

// ── POST /api/storage/upgrade ─────────────────────────────────────────────────
// Registra uma solicitação de upgrade. O admin é notificado por email e pode
// aprovar manualmente via PUT /api/families/:subdomain (campo storageTierBytes).
router.post('/storage/upgrade', async (c) => {
  const tenant    = c.get('tenant');
  const user      = c.get('user');
  const limitBytes = getStorageLimit(tenant.storageTierBytes);

  // Já está no plano pago
  if (limitBytes >= STORAGE_PAID_BYTES) {
    return c.json({ error: 'Você já está no plano de 1 GB.' }, 409);
  }

  // Verificar se já existe pedido pendente
  const reqKey = `upgrade-req:${tenant.familyId}`;
  const existing = await c.env.MKS_TENANTS.get(reqKey);
  if (existing) {
    const req = JSON.parse(existing) as { status: string };
    if (req.status === 'pending') {
      return c.json({
        ok: true,
        alreadyPending: true,
        message: 'Sua solicitação já está em análise. Nossa equipe entrará em contato em breve.',
      });
    }
  }

  const usedBytes = await getStorageUsed(c.env.MKS_TENANTS, tenant.familyId);

  // Gravar solicitação em KV (30 dias)
  const request = {
    status:    'pending',
    subdomain: tenant.subdomain,
    familyId:  tenant.familyId,
    tenantName: tenant.name,
    userEmail: user.email,
    usedBytes,
    requestedAt: new Date().toISOString(),
    price: STORAGE_UPGRADE_PRICE,
    newLimitBytes: STORAGE_PAID_BYTES,
  };
  await c.env.MKS_TENANTS.put(reqKey, JSON.stringify(request), { expirationTtl: 30 * 24 * 3600 });

  // Notificar admin por email via Resend (best-effort)
  if (c.env.RESEND_API_KEY) {
    c.executionCtx.waitUntil(
      sendUpgradeNotification(c.env.RESEND_API_KEY, request).catch(() => {}),
    );
  }

  return c.json({
    ok: true,
    message: `Solicitação enviada! Nossa equipe entrará em contato em até 24h no email ${user.email} para processar o pagamento de R$ ${STORAGE_UPGRADE_PRICE.toFixed(2)}/mês.`,
  });
});

async function sendUpgradeNotification(apiKey: string, req: {
  tenantName: string; subdomain: string; userEmail: string;
  usedBytes: number; price: number; requestedAt: string;
}): Promise<void> {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Finanças Livre <noreply@financaslivre.com>',
      to:   ['comercial@mksseguros.com'],
      subject: `[Upgrade Solicitado] ${req.tenantName} — R$${req.price.toFixed(2)}/mês`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#6366f1">⬆️ Solicitação de Upgrade de Armazenamento</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:8px 0;color:#64748b;width:140px">Família</td><td style="font-weight:600">${req.tenantName}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b">Subdomínio</td><td>${req.subdomain}.financaslivre.com</td></tr>
            <tr><td style="padding:8px 0;color:#64748b">Email</td><td>${req.userEmail}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b">Uso atual</td><td>${formatBytes(req.usedBytes)}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b">Plano</td><td>Free → 1 GB (R$${req.price.toFixed(2)}/mês)</td></tr>
            <tr><td style="padding:8px 0;color:#64748b">Solicitado em</td><td>${new Date(req.requestedAt).toLocaleString('pt-BR')}</td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
          <p style="font-size:13px;color:#64748b">
            Para aprovar: acesse o Admin → Famílias → editar "${req.subdomain}" e defina
            <code>storageTierBytes = ${1_073_741_824}</code> (1 GB) via PUT /api/families/${req.subdomain}.
          </p>
        </div>
      `,
    }),
  });
}

export default router;
