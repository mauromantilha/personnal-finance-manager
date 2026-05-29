// CF Access JWT verification via JWKS (RS256)
// JWKS é cacheado em KV (1h) + memória local do isolate, evitando round-trip
// ao CF Access edge a cada request.

export interface AccessClaims {
  email: string;
  sub: string;
}

type JwkLike = JsonWebKey & { kid?: string };

// Cache de memória local — válido só dentro do mesmo isolate
const MEMORY_JWKS_CACHE = new Map<string, { keys: JwkLike[]; expiresAt: number }>();
const MEMORY_TTL_MS = 5 * 60 * 1000; // 5 min
const KV_TTL_SECONDS = 60 * 60;       // 1 h

async function fetchJwks(teamDomain: string, cache?: KVNamespace): Promise<JwkLike[]> {
  const cacheKey = `jwks:${teamDomain}`;
  const now = Date.now();

  // Memory cache
  const mem = MEMORY_JWKS_CACHE.get(teamDomain);
  if (mem && mem.expiresAt > now) return mem.keys;

  // KV cache
  if (cache) {
    try {
      const cached = await cache.get<{ keys: JwkLike[] }>(cacheKey, 'json');
      if (cached?.keys?.length) {
        MEMORY_JWKS_CACHE.set(teamDomain, { keys: cached.keys, expiresAt: now + MEMORY_TTL_MS });
        return cached.keys;
      }
    } catch { /* fallthrough */ }
  }

  // Origem
  const iss = `https://${teamDomain}.cloudflareaccess.com`;
  const resp = await fetch(`${iss}/cdn-cgi/access/certs`);
  if (!resp.ok) throw new Error('Falha ao buscar JWKS');
  const { keys } = await resp.json() as { keys: JwkLike[] };
  if (!keys?.length) throw new Error('JWKS vazio');

  MEMORY_JWKS_CACHE.set(teamDomain, { keys, expiresAt: now + MEMORY_TTL_MS });
  if (cache) {
    // Não bloquear se KV falhar — apenas best-effort
    cache.put(cacheKey, JSON.stringify({ keys }), { expirationTtl: KV_TTL_SECONDS }).catch(() => {});
  }
  return keys;
}

interface JWTPayload {
  aud: string | string[];
  email: string;
  exp: number;
  iat: number;
  iss: string;
  sub: string;
  type: string;
}

function b64urlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

export async function verifyAccessJWT(
  jwt: string,
  teamDomain: string,
  expectedAud: string,
  jwksCache?: KVNamespace,
): Promise<AccessClaims> {
  if (!expectedAud) throw new Error('expectedAud é obrigatório');

  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('Formato JWT inválido');

  const [rawHeader, rawPayload, rawSig] = parts;
  const header  = JSON.parse(atob(rawHeader))  as { kid?: string; alg: string };
  const payload = JSON.parse(atob(rawPayload)) as JWTPayload;

  // Expiry — 60s de tolerância para clock skew
  if (Math.floor(Date.now() / 1000) > payload.exp + 60) throw new Error('JWT expirado');

  // Issuer
  const iss = `https://${teamDomain}.cloudflareaccess.com`;
  if (payload.iss !== iss) throw new Error(`JWT issuer inválido: ${payload.iss}`);

  // Audience (obrigatório — impede JWTs de outros apps no mesmo team)
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(expectedAud)) throw new Error('JWT audience inválido');

  // JWKS — memória local 5min + KV 1h + fetch origem como fallback
  const keys = await fetchJwks(teamDomain, jwksCache);

  // CF Access sempre emite com kid presente; aceitar JWT sem kid abre brecha
  // para forjar JWTs cujo cabeçalho omita kid e cair em fallback ao primeiro JWK.
  if (!header.kid) throw new Error('JWT sem kid');
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('JWK não encontrado para o kid informado');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['verify'],
  );

  const message   = new TextEncoder().encode(`${rawHeader}.${rawPayload}`);
  const signature = b64urlDecode(rawSig);

  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, message);
  if (!valid) throw new Error('Assinatura JWT inválida');

  return { email: payload.email, sub: payload.sub };
}
