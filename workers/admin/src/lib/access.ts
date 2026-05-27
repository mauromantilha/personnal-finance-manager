interface JWKSKey {
  kid: string;
  kty: string;
  alg: string;
  use: string;
  n: string;
  e: string;
}

interface AccessClaims {
  email: string;
  sub: string;
  aud: string | string[];
  iss: string;
  exp: number;
  iat: number;
}

const JWKS_CACHE = new Map<string, { keys: JWKSKey[]; fetchedAt: number }>();

async function getPublicKeys(teamDomain: string): Promise<JWKSKey[]> {
  const cached = JWKS_CACHE.get(teamDomain);
  if (cached && Date.now() - cached.fetchedAt < 3_600_000) return cached.keys;

  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 5000);
  let res: Response;
  try {
    res = await fetch(`https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`, {
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(tid);
    throw new Error(`JWKS fetch timeout/error: ${(e as Error).message}`);
  }
  clearTimeout(tid);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = await res.json() as { keys: JWKSKey[] };
  JWKS_CACHE.set(teamDomain, { keys: data.keys, fetchedAt: Date.now() });
  return data.keys;
}

function b64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad  = b64.length % 4 === 0 ? '' : '='.repeat(4 - b64.length % 4);
  return Uint8Array.from(atob(b64 + pad), c => c.charCodeAt(0));
}

async function importRSAKey(key: JWKSKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk', key as unknown as JsonWebKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['verify'],
  );
}

export async function verifyAccessJWT(
  jwt: string,
  teamDomain: string,
  expectedAud?: string,
): Promise<{ email: string; sub: string }> {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('JWT malformado');

  const [headerB64, payloadB64, sigB64] = parts;
  const header  = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')));
  const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))) as AccessClaims;

  if (payload.exp < Date.now() / 1000) throw new Error('JWT expirado');

  const issuer = `https://${teamDomain}.cloudflareaccess.com`;
  if (payload.iss !== issuer) throw new Error(`Issuer inválido: ${payload.iss}`);

  if (expectedAud) {
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(expectedAud)) throw new Error('AUD inválido');
  }

  const keys   = await getPublicKeys(teamDomain);
  const jwkKey = keys.find(k => k.kid === header.kid) ?? keys[0];
  if (!jwkKey) throw new Error('Chave pública não encontrada');

  const cryptoKey = await importRSAKey(jwkKey);
  const sigInput  = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const valid     = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', cryptoKey, b64url(sigB64), sigInput,
  );
  if (!valid) throw new Error('Assinatura JWT inválida');

  return { email: payload.email, sub: payload.sub };
}
