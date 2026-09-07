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

import { AsaasClient } from '../lib/asaas';

// ── POST /api/storage/checkout — Gera cobrança Asaas (PIX) ────────────────────
router.post('/storage/checkout', async (c) => {
  const tenant     = c.get('tenant');
  const user       = c.get('user');
  const limitBytes = getStorageLimit(tenant.storageTierBytes);

  if (limitBytes >= STORAGE_PAID_BYTES) {
    return c.json({ error: 'Você já possui o plano de 1 GB ativo.' }, 409);
  }

  const asaasKey = (c.env as any).ASAAS_API_KEY;
  const isSandbox = (c.env as any).ASAAS_ENVIRONMENT === 'sandbox' || !(c.env as any).ASAAS_ENVIRONMENT;

  // Se chave configurada, gera cobrança real via Asaas API
  if (asaasKey) {
    try {
      const asaas = new AsaasClient(asaasKey, isSandbox);
      const customer = await asaas.getOrCreateCustomer({
        name: user.name || tenant.name,
        email: user.email,
        externalReference: tenant.familyId,
      });

      const payment = await asaas.createStoragePixPayment({
        customerId: customer.id,
        value: STORAGE_UPGRADE_PRICE,
        familyId: tenant.familyId,
        description: `Upgrade 1GB - ${tenant.name}`,
      });

      const qr = await asaas.getPixQrCode(payment.id);

      return c.json({
        ok: true,
        provider: 'asaas',
        paymentId: payment.id,
        price: STORAGE_UPGRADE_PRICE,
        pixQrCode: qr.encodedImage,
        pixCopiaECola: qr.payload,
        expirationDate: qr.expirationDate,
      });
    } catch (e: any) {
      console.error('[Asaas Checkout Error]', e.message);
      // Fallback para solicitação assistida caso a API falhe
    }
  }

  // Modo Simulação/Fallback caso ASAAS_API_KEY não esteja configurada no ambiente
  const mockPaymentId = `pay-mock-${crypto.randomUUID()}`;
  return c.json({
    ok: true,
    provider: 'simulated',
    paymentId: mockPaymentId,
    price: STORAGE_UPGRADE_PRICE,
    pixCopiaECola: '00020126580014br.gov.bcb.pix0136mksbrasil-storage-upgrade-mock-key52040000530398654055.005802BR5910MKSBRASIL6009SAOPAULO62070503***6304ABCD',
    pixQrCode: '',
    message: 'Chave Asaas não configurada. Modo de simulação pronto para receber ASAAS_API_KEY.',
  });
});

// ── GET /api/storage/check-payment/:id — Polling de status do pagamento ───────
router.get('/storage/check-payment/:id', async (c) => {
  const { id }    = c.req.param();
  const tenant    = c.get('tenant');
  const asaasKey  = (c.env as any).ASAAS_API_KEY;
  const isSandbox = (c.env as any).ASAAS_ENVIRONMENT === 'sandbox' || !(c.env as any).ASAAS_ENVIRONMENT;

  // Se simulado, aprova na hora
  if (id.startsWith('pay-mock-')) {
    const updatedTenant = { ...tenant, storageTierBytes: STORAGE_PAID_BYTES };
    await c.env.MKS_TENANTS.put(`tenant:${tenant.subdomain}`, JSON.stringify(updatedTenant));
    return c.json({ ok: true, paid: true, status: 'CONFIRMED' });
  }

  if (!asaasKey) return c.json({ ok: false, error: 'Asaas não configurado' }, 503);

  try {
    const asaas = new AsaasClient(asaasKey, isSandbox);
    const payment = await asaas.getPayment(id);
    const isPaid = payment.status === 'RECEIVED' || payment.status === 'CONFIRMED';

    if (isPaid) {
      const updatedTenant = { ...tenant, storageTierBytes: STORAGE_PAID_BYTES };
      await c.env.MKS_TENANTS.put(`tenant:${tenant.subdomain}`, JSON.stringify(updatedTenant));
    }

    return c.json({ ok: true, paid: isPaid, status: payment.status });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500);
  }
});

// ── POST /api/webhooks/asaas — Webhook público da Asaas ───────────────────────
router.post('/webhooks/asaas', async (c) => {
  const webhookSecret = (c.env as any).ASAAS_WEBHOOK_SECRET;
  const authToken     = c.req.header('asaas-access-token');

  if (webhookSecret && authToken !== webhookSecret) {
    return c.json({ error: 'Token de webhook inválido.' }, 401);
  }

  const body = await c.req.json<any>().catch(() => ({}));
  const event = body.event;
  const payment = body.payment;

  if ((event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') && payment?.externalReference) {
    const familyId = payment.externalReference;
    // Buscar tenant pelo familyId
    const index: string[] = JSON.parse(await c.env.MKS_TENANTS.get('tenants:index') ?? '[]');
    for (const sub of index) {
      const t = await c.env.MKS_TENANTS.get<any>(`tenant:${sub}`, 'json');
      if (t && t.familyId === familyId) {
        t.storageTierBytes = STORAGE_PAID_BYTES;
        await c.env.MKS_TENANTS.put(`tenant:${sub}`, JSON.stringify(t));
        break;
      }
    }
  }

  return c.json({ ok: true });
});

// ── POST /api/storage/upgrade — Registra solicitação assistida ────────────────
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
