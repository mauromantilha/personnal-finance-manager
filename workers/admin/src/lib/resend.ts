function escHtml(v: string): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function sendVerificationEmail(
  apiKey: string,
  to: string,
  familyName: string,
  verifyUrl: string,
  baseDomain: string,
  fromDomain?: string,
): Promise<void> {
  if (!apiKey) return;
  const escFamily = escHtml(familyName);
  const escTo     = escHtml(to);
  const escVerify = escHtml(verifyUrl);
  const escBase   = escHtml(baseDomain);
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Finanças Livre <noreply@${fromDomain ?? baseDomain}>`,
      to: [to],
      subject: `Confirme seu cadastro no Finanças Livre`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#6366f1;margin-bottom:8px">Confirme seu cadastro 📧</h2>
          <p style="color:#334155">Olá! Recebemos uma solicitação para criar a família <strong>${escFamily}</strong> com este endereço de email (<strong>${escTo}</strong>).</p>
          <p style="color:#334155">Se foi você, clique abaixo para ativar sua conta. <strong>O link expira em 24 horas.</strong></p>
          <div style="margin:24px 0">
            <a href="${escVerify}" style="background:#10b981;color:white;padding:12px 28px;border-radius:8px;
               text-decoration:none;font-weight:600;display:inline-block">
              ✓ Ativar minha conta
            </a>
          </div>
          <p style="color:#64748b;font-size:13px;line-height:1.6">
            <strong>Se você NÃO solicitou este cadastro</strong>, ignore este email — sua conta nunca será ativada.<br>
            Nenhuma cobrança ocorrerá.
          </p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
          <p style="color:#94a3b8;font-size:12px">
            MKS Seguros e Finanças — CNPJ 64.293.212/0001-97<br>
            <a href="https://${escBase}/privacidade" style="color:#94a3b8">Política de Privacidade</a>
          </p>
        </div>
      `,
    }),
  }).catch(() => {});
}

export async function sendWelcomeEmail(
  apiKey: string,
  to: string,
  familyName: string,
  subdomain: string,
  baseDomain: string,
  fromDomain?: string,
): Promise<void> {
  if (!apiKey) return;
  // Sanitize subdomain — apenas [a-z0-9-] entram em URL
  const safeSub = String(subdomain).replace(/[^a-z0-9-]/g, '');
  const safeBase = String(baseDomain).replace(/[^a-zA-Z0-9.-]/g, '');
  const url = `https://${safeSub}.${safeBase}`;
  const escFamily = escHtml(familyName);
  const escTo     = escHtml(to);
  const escSubject = String(familyName).replace(/[\r\n"<>]/g, '');
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Finanças Livre <noreply@${fromDomain ?? baseDomain}>`,
      to: [to],
      subject: `Bem-vindo ao Finanças Livre — ${escSubject}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#6366f1;margin-bottom:8px">Sua conta está pronta! 🎉</h2>
          <p style="color:#334155">Olá! A família <strong>${escFamily}</strong> foi criada com sucesso no Finanças Livre.</p>
          <div style="margin:24px 0">
            <a href="${url}" style="background:#6366f1;color:white;padding:12px 28px;border-radius:8px;
               text-decoration:none;font-weight:600;display:inline-block">
              Acessar meu painel →
            </a>
          </div>
          <p style="color:#64748b;font-size:14px;line-height:1.6">
            Use o email <strong>${escTo}</strong> para autenticar.<br>
            Ao clicar em "Acessar", você receberá um código de acesso de uso único no seu email.
          </p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
          <p style="color:#94a3b8;font-size:12px">
            MKS Seguros e Finanças — CNPJ 64.293.212/0001-97<br>
            <a href="${url}/privacidade" style="color:#94a3b8">Política de Privacidade</a>
          </p>
        </div>
      `,
    }),
  }).catch(() => {});
}
