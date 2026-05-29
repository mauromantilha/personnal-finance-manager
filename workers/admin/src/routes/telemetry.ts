/**
 * Rotas de Telemetria — visibilidade global e por família
 *
 * GET /api/telemetry/global      — KPIs do sistema, usuários, saúde
 * GET /api/telemetry/family/:sub — D1, R2, usuários, atividade de uma família
 * GET /api/telemetry/security    — ataques, brute-force, rate-limit hits
 * GET /api/telemetry/workers     — analytics dos Workers via CF GraphQL
 */

import { Hono } from 'hono';
import type { Env, Tenant } from '../index';

const CF  = 'https://api.cloudflare.com/client/v4';
const hdr = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

const router = new Hono<{ Bindings: Env }>();

// ── helpers ───────────────────────────────────────────────────────────────────

async function cfGet<T>(token: string, path: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(`${CF}${path}`, { headers: hdr(token), signal });
    const d   = await res.json() as any;
    return d.success ? d.result : null;
  } catch { return null; }
}

async function d1q(accountId: string, token: string, dbId: string, sql: string): Promise<any[]> {
  try {
    const res = await fetch(`${CF}/accounts/${accountId}/d1/database/${dbId}/query`, {
      method: 'POST', headers: hdr(token), body: JSON.stringify({ sql }),
      signal: AbortSignal.timeout(6000),
    });
    const d = await res.json() as any;
    return d.result?.[0]?.results ?? [];
  } catch { return []; }
}

async function cfGraphQL(token: string, _accountId: string, query: string): Promise<any> {
  try {
    const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: hdr(token),
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10000),
    });
    const d = await res.json() as any;
    return d.data ?? null;
  } catch { return null; }
}

function dateHoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

// ── GET /api/telemetry/global ─────────────────────────────────────────────────

router.get('/telemetry/global', async (c) => {
  const { CF_ACCOUNT_ID, CF_API_TOKEN, MKS_TENANTS } = c.env;

  // Load all tenants
  const index: string[] = JSON.parse(await MKS_TENANTS.get('tenants:index') ?? '[]');
  const tenants = (await Promise.all(
    index.map(s => MKS_TENANTS.get<Tenant>(`tenant:${s}`, 'json')),
  )).filter(Boolean) as Tenant[];

  const active    = tenants.filter(t => t.status === 'active');
  const suspended = tenants.filter(t => t.status === 'suspended');
  const deleted   = tenants.filter(t => t.status === 'deleted');

  // D1 sizes + user counts per family (parallel, best-effort)
  const familyStats = await Promise.all(active.map(async t => {
    const [dbMeta, users, recentTx] = await Promise.all([
      cfGet<any>(CF_API_TOKEN, `/accounts/${CF_ACCOUNT_ID}/d1/database/${t.d1DatabaseId}`),
      d1q(CF_ACCOUNT_ID, CF_API_TOKEN, t.d1DatabaseId, 'SELECT COUNT(*) AS n FROM users WHERE is_active=1'),
      d1q(CF_ACCOUNT_ID, CF_API_TOKEN, t.d1DatabaseId,
        `SELECT COUNT(*) AS n FROM transactions WHERE created_at >= datetime('now','-24 hours')`),
    ]);
    return {
      subdomain:    t.subdomain,
      name:         t.name,
      tier:         t.tier,
      d1FileSizeBytes: dbMeta?.file_size ?? 0,
      users:        users[0]?.n ?? 0,
      txLast24h:    recentTx[0]?.n ?? 0,
    };
  }));

  const totalUsers = familyStats.reduce((s, f) => s + f.users, 0);
  const totalD1Bytes = familyStats.reduce((s, f) => s + f.d1FileSizeBytes, 0);

  // Workers analytics — last 24 h via GraphQL
  const since = dateHoursAgo(24);
  const until = new Date().toISOString();
  const workersGql = await cfGraphQL(CF_API_TOKEN, CF_ACCOUNT_ID, `{
    viewer {
      accounts(filter:{accountTag:"${CF_ACCOUNT_ID}"}) {
        workersInvocationsAdaptive(
          limit:5000
          filter:{datetimeHalfHour_geq:"${since}" datetimeHalfHour_leq:"${until}"}
          orderBy:[datetimeHalfHour_ASC]
        ) {
          dimensions { scriptName datetimeHalfHour }
          sum { subrequests errors }
          quantiles { cpuTimeP50 cpuTimeP99 }
        }
      }
    }
  }`);

  const invocations = workersGql?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? [];
  const workersSummary = invocations.reduce((acc: any, row: any) => {
    acc.totalRequests  = (acc.totalRequests  ?? 0) + (row.sum?.subrequests ?? 0);
    acc.totalErrors    = (acc.totalErrors    ?? 0) + (row.sum?.errors ?? 0);
    return acc;
  }, {});

  // Group by half-hour for sparkline
  const requestsTimeline = invocations.reduce((acc: Record<string, number>, row: any) => {
    const t = row.dimensions?.datetimeHalfHour ?? '';
    acc[t] = (acc[t] ?? 0) + (row.sum?.subrequests ?? 0);
    return acc;
  }, {});

  // R2 bucket list
  const r2 = await cfGet<{ buckets: any[] }>(CF_API_TOKEN, `/accounts/${CF_ACCOUNT_ID}/r2/buckets`);

  return c.json({
    summary: {
      totalFamilies: tenants.length,
      activeFamilies: active.length,
      suspendedFamilies: suspended.length,
      deletedFamilies: deleted.length,
      totalUsers,
      totalD1Bytes,
    },
    families: familyStats,
    workers: {
      totalRequests: workersSummary.totalRequests ?? 0,
      totalErrors: workersSummary.totalErrors ?? 0,
      errorRate: workersSummary.totalRequests
        ? (workersSummary.totalErrors / workersSummary.totalRequests * 100).toFixed(2)
        : '0.00',
      requestsTimeline,
    },
    r2Buckets: r2?.buckets ?? [],
    timestamp: new Date().toISOString(),
  });
});

// ── GET /api/telemetry/family/:sub ───────────────────────────────────────────

router.get('/telemetry/family/:sub', async (c) => {
  const { sub } = c.req.param();
  const { CF_ACCOUNT_ID, CF_API_TOKEN, MKS_TENANTS } = c.env;

  const tenant = await MKS_TENANTS.get<Tenant>(`tenant:${sub}`, 'json');
  if (!tenant) return c.json({ error: 'Família não encontrada.' }, 404);

  const ALLOWED_TABLES = new Set([
    'accounts', 'transactions', 'credit_cards', 'categories',
    'investments', 'users', 'goals', 'recurrences', 'documents',
    'budgets', 'alerts', 'installment_groups',
  ]);
  const tables = Array.from(ALLOWED_TABLES);

  const [dbMeta, ...tableCounts] = await Promise.all([
    cfGet<any>(CF_API_TOKEN, `/accounts/${CF_ACCOUNT_ID}/d1/database/${tenant.d1DatabaseId}`),
    ...tables.map(tbl => {
      // Defesa em profundidade contra inadvertida interpolação de input
      if (!ALLOWED_TABLES.has(tbl)) return Promise.resolve({ table: tbl, count: 0 });
      return d1q(CF_ACCOUNT_ID, CF_API_TOKEN, tenant.d1DatabaseId,
        `SELECT COUNT(*) AS n FROM ${tbl}`).then(r => ({ table: tbl, count: r[0]?.n ?? 0 }));
    }),
  ]);

  // Last 7 days transaction volume
  const txTimeline = await d1q(CF_ACCOUNT_ID, CF_API_TOKEN, tenant.d1DatabaseId, `
    SELECT date(created_at) AS day, COUNT(*) AS n
    FROM transactions
    WHERE created_at >= datetime('now','-7 days')
    GROUP BY day ORDER BY day ASC
  `);

  // Recent users
  const recentUsers = await d1q(CF_ACCOUNT_ID, CF_API_TOKEN, tenant.d1DatabaseId,
    `SELECT id, name, email, role, created_at FROM users WHERE is_active=1 ORDER BY created_at DESC LIMIT 10`,
  );

  // R2 objects for this family prefix
  let r2Objects = 0, r2Bytes = 0;
  try {
    const r2Res = await fetch(
      `${CF}/accounts/${CF_ACCOUNT_ID}/r2/buckets/${tenant.r2Bucket}/objects?prefix=${tenant.r2Prefix}&limit=1000`,
      { headers: hdr(CF_API_TOKEN), signal: AbortSignal.timeout(5000) },
    );
    const r2d = await r2Res.json() as any;
    const objs = r2d.result?.objects ?? [];
    r2Objects = objs.length;
    r2Bytes   = objs.reduce((s: number, o: any) => s + (o.size ?? 0), 0);
  } catch { /* best-effort */ }

  return c.json({
    tenant,
    d1: {
      fileSizeBytes: dbMeta?.file_size ?? 0,
      numTables:     dbMeta?.num_tables ?? 0,
      tables:        Object.fromEntries(tableCounts.map(r => [r.table, r.count])),
    },
    r2: { objects: r2Objects, bytes: r2Bytes },
    txTimeline,
    recentUsers,
    timestamp: new Date().toISOString(),
  });
});

// ── GET /api/telemetry/security ───────────────────────────────────────────────

router.get('/telemetry/security', async (c) => {
  const { CF_ACCOUNT_ID, CF_API_TOKEN, CF_ZONE_ID, MKS_TENANTS } = c.env;

  // 1. Rate-limit counters from KV (brute-force attempts)
  const kvKeys = await MKS_TENANTS.list({ prefix: 'ratelimit:', limit: 500 });
  const rateLimitHits = await Promise.all(
    kvKeys.keys.map(async k => {
      const val = await MKS_TENANTS.get(k.name);
      return { key: k.name.replace('ratelimit:', ''), count: parseInt(val ?? '0') };
    }),
  );
  const rlTotal     = rateLimitHits.reduce((s, r) => s + r.count, 0);
  const rlTopIPs    = [...rateLimitHits]
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // 2. CF Firewall/WAF events via GraphQL (last 24 h)
  const since = dateHoursAgo(24);
  const until = new Date().toISOString();
  const fwGql = await cfGraphQL(CF_API_TOKEN, CF_ACCOUNT_ID, `{
    viewer {
      zones(filter:{zoneTag:"${CF_ZONE_ID}"}) {
        firewallEventsAdaptive(
          limit:5000
          filter:{datetime_geq:"${since}" datetime_leq:"${until}"}
          orderBy:[count_DESC]
        ) {
          count
          dimensions {
            action clientIP clientAsn clientCountryName
            source userAgent ruleId
          }
        }
      }
    }
  }`);

  const fwEvents = fwGql?.viewer?.zones?.[0]?.firewallEventsAdaptive ?? [];

  // Aggregate by action
  const byAction: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  const topIPs: Record<string, number> = {};
  let totalBlocked = 0;

  for (const ev of fwEvents) {
    const action  = ev.dimensions?.action ?? 'unknown';
    const country = ev.dimensions?.clientCountryName ?? 'Unknown';
    const ip      = ev.dimensions?.clientIP ?? '';
    const cnt     = ev.count ?? 1;
    byAction[action]   = (byAction[action] ?? 0) + cnt;
    byCountry[country] = (byCountry[country] ?? 0) + cnt;
    if (ip) topIPs[ip] = (topIPs[ip] ?? 0) + cnt;
    if (['block', 'challenge', 'jschallenge', 'managed_challenge'].includes(action)) {
      totalBlocked += cnt;
    }
  }

  const topBlockedIPs = Object.entries(topIPs)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .map(([ip, count]) => ({ ip, count }));

  const topCountries = Object.entries(byCountry)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([country, count]) => ({ country, count }));

  // 3. CF WAF Analytics — managed rules triggered
  const wafGql = await cfGraphQL(CF_API_TOKEN, CF_ACCOUNT_ID, `{
    viewer {
      zones(filter:{zoneTag:"${CF_ZONE_ID}"}) {
        httpRequestsAdaptiveGroups(
          limit:48
          filter:{datetime_geq:"${since}" datetime_leq:"${until}"}
          orderBy:[datetimeHour_ASC]
        ) {
          count
          dimensions { datetimeHour }
          sum { cachedRequests encryptedRequests }
        }
      }
    }
  }`);

  const httpTimeline = (wafGql?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups ?? [])
    .map((r: any) => ({
      hour:     r.dimensions?.datetimeHour,
      requests: r.count ?? 0,
      cached:   r.sum?.cachedRequests ?? 0,
    }));

  return c.json({
    rateLimits: {
      totalHits: rlTotal,
      activeIPs: rlTopIPs.filter(r => r.count > 0),
    },
    firewall: {
      totalBlocked,
      byAction,
      topBlockedIPs,
      topCountries,
    },
    httpTimeline,
    timestamp: new Date().toISOString(),
  });
});

export default router;
