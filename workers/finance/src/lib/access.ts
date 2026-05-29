// CF Access JWT verification via JWKS (RS256)
// JWKS is fetched from CF's edge, which respects Cache-Control: max-age=3600

export interface AccessClaims {
  email: string;
  sub: string;
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

  // JWKS — CF edge faz cache por 1h automaticamente
  const jwksResp = await fetch(`${iss}/cdn-cgi/access/certs`);
  if (!jwksResp.ok) throw new Error('Falha ao buscar JWKS');
  const { keys } = await jwksResp.json() as { keys: (JsonWebKey & { kid?: string })[] };

  const jwk = header.kid
    ? (keys.find(k => k.kid === header.kid) ?? keys[0])
    : keys[0];
  if (!jwk) throw new Error('JWK não encontrado');

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
