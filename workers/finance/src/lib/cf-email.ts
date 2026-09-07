/**
 * Cloudflare Email Sending API Client
 *
 * Utiliza a API REST oficial da Cloudflare para envio de e-mails transacionais:
 * POST https://api.cloudflare.com/client/v4/accounts/{accountId}/email/sending/send
 */

export interface SendEmailOptions {
  to: string;
  from?: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const DEFAULT_FROM = 'welcome@financaslivre.com';

export async function sendCloudflareEmail(
  opts: SendEmailOptions,
  accountId: string,
  apiToken: string,
): Promise<SendEmailResult> {
  const from = opts.from || DEFAULT_FROM;
  const to = opts.to;
  const subject = opts.subject;
  const html = opts.html;
  const text = opts.text || html.replace(/<[^>]+>/g, ' ').trim();

  if (!accountId || !apiToken) {
    return { success: false, error: 'Credenciais de e-mail Cloudflare não configuradas (accountId ou apiToken ausentes).' };
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        from,
        subject,
        html,
        text,
      }),
    });

    const bodyText = await res.text();
    let data: any;
    try {
      data = JSON.parse(bodyText);
    } catch {
      data = { raw: bodyText };
    }

    if (!res.ok || (data && data.success === false)) {
      const errMsg = data?.errors?.[0]?.message || data?.error || bodyText.slice(0, 200) || `HTTP ${res.status}`;
      return { success: false, error: `Cloudflare Email error (${res.status}): ${errMsg}` };
    }

    return {
      success: true,
      messageId: data?.result?.id || data?.id || 'cf-msg-ok',
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Falha na requisição Cloudflare Email: ${err.message || String(err)}`,
    };
  }
}
