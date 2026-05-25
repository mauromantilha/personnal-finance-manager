// Pluggy Open Finance API client

const PLUGGY_BASE = 'https://api.pluggy.ai';

async function getPluggyToken(clientId: string, clientSecret: string): Promise<string> {
  const resp = await fetch(`${PLUGGY_BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!resp.ok) throw new Error(`Pluggy auth error: ${resp.status}`);
  const data = await resp.json() as { apiKey: string };
  return data.apiKey;
}

export async function pluggyFetch<T>(
  clientId: string,
  clientSecret: string,
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const token = await getPluggyToken(clientId, clientSecret);
  const resp = await fetch(`${PLUGGY_BASE}${path}`, {
    ...opts,
    headers: {
      'X-API-KEY': token,
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  });
  if (!resp.ok) throw new Error(`Pluggy ${path}: ${resp.status}`);
  return resp.json() as Promise<T>;
}

export async function getConnectToken(
  clientId: string,
  clientSecret: string,
  webhookUrl: string,
): Promise<string> {
  const data = await pluggyFetch<{ accessToken: string }>(
    clientId, clientSecret,
    '/connect_token',
    { method: 'POST', body: JSON.stringify({ clientUserId: 'mks-user', webhookUrl }) },
  );
  return data.accessToken;
}
