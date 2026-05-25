const CF = 'https://api.cloudflare.com/client/v4';

function h(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function cfFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CF}${path}`, {
    ...init,
    headers: { ...h(token), ...(init?.headers as Record<string, string> ?? {}) },
  });
  const d = await res.json() as { success: boolean; result: T; errors?: { message: string }[] };
  if (!d.success) throw new Error(d.errors?.[0]?.message ?? `CF API error on ${path}`);
  return d.result;
}

// ── D1 ────────────────────────────────────────────────────────────────────────

export async function createD1Database(accountId: string, token: string, name: string): Promise<string> {
  const r = await cfFetch<{ uuid: string }>(token, `/accounts/${accountId}/d1/database`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return r.uuid;
}

export async function execD1(
  accountId: string, token: string, dbId: string, sql: string, params: unknown[] = [],
): Promise<void> {
  await fetch(`${CF}/accounts/${accountId}/d1/database/${dbId}/query`, {
    method: 'POST',
    headers: h(token),
    body: JSON.stringify({ sql, params }),
  });
}

// ── CF Access ─────────────────────────────────────────────────────────────────

export async function createAccessApp(
  accountId: string,
  token: string,
  opts: { name: string; domain: string; otpIdpId: string },
): Promise<{ id: string; aud: string }> {
  const r = await cfFetch<{ id: string; aud: string }>(
    token, `/accounts/${accountId}/access/apps`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: opts.name,
        domain: opts.domain,
        type: 'self_hosted',
        session_duration: '24h',
        allowed_idps: [opts.otpIdpId],
        auto_redirect_to_identity: true,
        cors_headers: { allowed_origins: [`https://${opts.domain}`] },
      }),
    },
  );
  return { id: r.id, aud: r.aud };
}

export async function createAccessPolicy(
  accountId: string,
  token: string,
  appId: string,
  opts: { name: string; email: string },
): Promise<string> {
  const r = await cfFetch<{ id: string }>(
    token, `/accounts/${accountId}/access/apps/${appId}/policies`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: opts.name,
        decision: 'allow',
        include: [{ email: { email: opts.email } }],
        exclude: [],
        require: [],
      }),
    },
  );
  return r.id;
}

export async function deleteAccessApp(accountId: string, token: string, appId: string): Promise<void> {
  await fetch(`${CF}/accounts/${accountId}/access/apps/${appId}`, {
    method: 'DELETE',
    headers: h(token),
  });
}

export async function countZTUsers(accountId: string, token: string): Promise<number> {
  try {
    const res = await fetch(`${CF}/accounts/${accountId}/access/users?per_page=1`, {
      headers: h(token),
    });
    const d = await res.json() as any;
    return d.result_info?.total_count ?? 0;
  } catch {
    return 0;
  }
}
