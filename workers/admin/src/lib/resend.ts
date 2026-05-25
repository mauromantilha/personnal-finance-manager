export async function sendWelcomeEmail(
  apiKey: string,
  to: string,
  familyName: string,
  subdomain: string,
  baseDomain: string,
): Promise<void> {
  if (!apiKey) return;
  const url = `https://${subdomain}.${baseDomain}`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `MKS Finanças <noreply@${baseDomain}>`,
      to: [to],
      subject: `Bem-vindo ao MKS Finanças — ${familyName}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#6366f1;margin-bottom:8px">Sua conta está pronta! 🎉</h2>
          <p style="color:#334155">Olá! A família <strong>${familyName}</strong> foi criada com sucesso no MKS Finanças.</p>
          <div style="margin:24px 0">
            <a href="${url}" style="background:#6366f1;color:white;padding:12px 28px;border-radius:8px;
               text-decoration:none;font-weight:600;display:inline-block">
              Acessar meu painel →
            </a>
          </div>
          <p style="color:#64748b;font-size:14px;line-height:1.6">
            Use o email <strong>${to}</strong> para autenticar.<br>
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
