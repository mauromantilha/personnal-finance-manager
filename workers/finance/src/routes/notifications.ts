import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { sendCloudflareEmail } from '../lib/cf-email';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── POST /api/notifications/test-email — Envio de teste via Cloudflare Email Sending ──
router.post('/notifications/test-email', async (c) => {
  const user = c.get('user');
  const userEmail = user?.email || c.get('email');

  let bodyEmail: string | undefined;
  try {
    const body = await c.req.json<any>();
    bodyEmail = body?.email;
  } catch {
    // Body opcional
  }

  const recipient = bodyEmail || userEmail;
  if (!recipient || !recipient.includes('@')) {
    return c.json({ error: 'E-mail do destinatário inválido ou não autenticado.' }, 400);
  }

  const accountId = c.env.CF_ACCOUNT_ID || '9b61f609fee4408fd1c4344feaf9b16a';
  const emailToken = c.env.CF_EMAIL_TOKEN || c.env.CF_API_TOKEN;

  if (!emailToken) {
    return c.json({
      error: 'Token de envio de e-mail não configurado. Configure CF_EMAIL_TOKEN via wrangler secret put CF_EMAIL_TOKEN.',
    }, 500);
  }

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 28px;">🔔</span>
        <h2 style="color: #1e293b; margin: 8px 0 4px; font-size: 20px;">MKS Finanças — Notificação de Teste</h2>
        <p style="color: #64748b; font-size: 13px; margin: 0;">Disparado via Cloudflare Email Sending REST API</p>
      </div>
      <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 20px; border-left: 4px solid #6366f1;">
        <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.5;">
          Olá! Este é um e-mail de teste para confirmar que o canal de alertas e notificações do <strong>MKS Finanças</strong> está ativo e operando com sucesso em sua conta.
        </p>
      </div>
      <ul style="color: #475569; font-size: 13px; line-height: 1.6; padding-left: 20px; margin-bottom: 24px;">
        <li>Alertas proativos de limite de cartões de crédito (80%)</li>
        <li>Avisos de vencimento de faturas em até 3 dias</li>
        <li>Monitoramento de orçamentos e saldo de contas</li>
        <li>Infraestrutura 100% Cloudflare (Edge Network)</li>
      </ul>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
        MKS Finanças Livre · Este e-mail foi gerado automaticamente a pedido do usuário em ${new Date().toLocaleString('pt-BR')}.
      </p>
    </div>
  `;

  const text = `MKS Finanças - Teste de Notificação\n\nOlá! Este é um e-mail de teste confirmando que as notificações via Cloudflare Email Sending estão ativas para ${recipient}.\n\nData: ${new Date().toLocaleString('pt-BR')}`;

  const result = await sendCloudflareEmail(
    {
      to: recipient,
      subject: '[MKS Finanças] Teste de Notificação — Cloudflare Email',
      html,
      text,
    },
    accountId,
    emailToken,
  );

  if (!result.success) {
    return c.json({
      error: 'Falha ao enviar e-mail de teste via Cloudflare.',
      details: result.error,
    }, 502);
  }

  return c.json({
    success: true,
    recipient,
    messageId: result.messageId,
    timestamp: new Date().toISOString(),
  });
});

export default router;
