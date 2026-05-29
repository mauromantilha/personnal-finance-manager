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
  try {
    const r = await cfFetch<{ uuid: string }>(token, `/accounts/${accountId}/d1/database`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    return r.uuid;
  } catch (e) {
    // If DB already exists (partial previous provision), fetch and reuse it
    if ((e as Error).message?.toLowerCase().includes('already exists')) {
      const list = await cfFetch<{ uuid: string; name: string }[]>(token, `/accounts/${accountId}/d1/database?per_page=100`);
      const existing = list.find((db) => db.name === name);
      if (existing) return existing.uuid;
    }
    throw e;
  }
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

/** Send multiple statements in a single subrequest using the D1 batch endpoint. */
export async function execD1Batch(
  accountId: string, token: string, dbId: string, statements: string[],
): Promise<void> {
  const queries = statements.map((sql) => ({ sql, params: [] }));
  await fetch(`${CF}/accounts/${accountId}/d1/database/${dbId}/batch`, {
    method: 'POST',
    headers: h(token),
    body: JSON.stringify(queries),
  });
}

export async function deleteD1Database(accountId: string, token: string, dbId: string): Promise<void> {
  await fetch(`${CF}/accounts/${accountId}/d1/database/${dbId}`, {
    method: 'DELETE',
    headers: h(token),
  });
}

// ── R2 ────────────────────────────────────────────────────────────────────────

/**
 * Deletes all objects with a given prefix in an R2 bucket.
 * LGPD compliance: removes all family documents when a family is deleted.
 */
export async function deleteR2ObjectsWithPrefix(
  accountId: string, token: string, bucket: string, prefix: string,
): Promise<number> {
  let deletedCount = 0;
  let cursor: string | undefined = undefined;
  
  // R2 list objects API paginated
  while (true) {
    const params = new URLSearchParams({ prefix, limit: '1000' });
    if (cursor) params.set('cursor', cursor);
    
    const listRes = await fetch(`${CF}/accounts/${accountId}/r2/buckets/${bucket}/objects?${params}`, {
      method: 'GET',
      headers: h(token),
    });
    const listData = await listRes.json() as any;
    
    if (!listData.success) break;
    
    const objects = listData.result?.objects || [];
    if (objects.length === 0) break;
    
    // Delete each object
    for (const obj of objects) {
      await fetch(`${CF}/accounts/${accountId}/r2/buckets/${bucket}/objects/${encodeURIComponent(obj.key)}`, {
        method: 'DELETE',
        headers: h(token),
      });
      deletedCount++;
    }
    
    cursor = listData.result?.cursor;
    if (!cursor) break;
  }
  
  return deletedCount;
}

// ── CF Access ─────────────────────────────────────────────────────────────────

export async function createAccessApp(
  accountId: string,
  token: string,
  opts: { name: string; domain: string; otpIdpId: string },
): Promise<{ id: string; aud: string }> {
  try {
    const r = await cfFetch<{ id: string; aud: string }>(
      token, `/accounts/${accountId}/access/apps`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: opts.name,
          domain: opts.domain,
          type: 'self_hosted',
          session_duration: '20m',
          allowed_idps: [opts.otpIdpId],
          auto_redirect_to_identity: true,
        }),
      },
    );
    return { id: r.id, aud: r.aud };
  } catch (e) {
    // If app already exists (partial previous provision), find and reuse it
    if ((e as Error).message?.includes('application_already_exists')) {
      const list = await cfFetch<{ id: string; aud: string; domain: string }[]>(
        token, `/accounts/${accountId}/access/apps`,
      );
      const existing = list.find((app) => app.domain === opts.domain);
      if (existing) return { id: existing.id, aud: existing.aud };
    }
    throw e;
  }
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

export async function updateAccessAppName(
  accountId: string, token: string, appId: string, name: string,
): Promise<void> {
  await cfFetch(token, `/accounts/${accountId}/access/apps/${appId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function listAccessApps(
  accountId: string, token: string,
): Promise<{ id: string; name: string; domain: string }[]> {
  return cfFetch<{ id: string; name: string; domain: string }[]>(
    token, `/accounts/${accountId}/access/apps?per_page=100`,
  );
}

// Add custom domain to CF Pages project (so each family's subdomain serves the SPA)
export async function addPagesDomain(
  accountId: string, token: string, projectName: string, domain: string,
): Promise<void> {
  const res = await fetch(`${CF}/accounts/${accountId}/pages/projects/${projectName}/domains`, {
    method: 'POST',
    headers: h(token),
    body: JSON.stringify({ name: domain }),
  });
  const d = await res.json() as any;
  // Treat "already exists" as success
  if (!d.success && !JSON.stringify(d.errors ?? '').toLowerCase().includes('already')) {
    throw new Error(`addPagesDomain: ${JSON.stringify(d.errors)}`);
  }
}

/**
 * Deletes ONLY the specific A placeholder (100.64.0.1) planted by CF Access
 * for this exact hostname. With a wildcard DNS (*.domain) already in place
 * the wildcard takes over automatically once the placeholder is gone.
 *
 * Importante: jamais remover outros A/CNAME do hostname — outros records
 * (legítimos, do dono do domínio, ou de outras integrações) ficariam órfãos.
 */
export const CF_ACCESS_PLACEHOLDER_IP = '100.64.0.1';
export async function removeCfAccessDnsPlaceholder(
  zoneId: string, token: string, hostname: string,
): Promise<void> {
  const list = await cfFetch<{ id: string; type: string; content: string }[]>(
    token, `/zones/${zoneId}/dns_records?name=${encodeURIComponent(hostname)}&per_page=50`,
  );
  for (const rec of list) {
    // Apenas o A record 100.64.0.1 (assinatura do placeholder do CF Access)
    if (rec.type === 'A' && rec.content === CF_ACCESS_PLACEHOLDER_IP) {
      await fetch(`${CF}/zones/${zoneId}/dns_records/${rec.id}`, {
        method: 'DELETE', headers: h(token),
      });
    }
  }
}

export async function countZTUsers(accountId: string, token: string): Promise<number> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`${CF}/accounts/${accountId}/access/users?per_page=1`, {
      headers: h(token),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    const d = await res.json() as any;
    return d.result_info?.total_count ?? 0;
  } catch {
    clearTimeout(tid);
    return 0;
  }
}
