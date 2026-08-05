/** Validação compartilhada de uploads base64 (documentos / comprovantes). */

export const MAX_DOC_BYTES = 8 * 1024 * 1024; // 8 MB

export const ALLOWED_DOC_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
]);

/** Detecta magic bytes do início do buffer e retorna o mime real ou null. */
export function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf';
  return null;
}

export function decodeBase64Strict(b64: string): Uint8Array | null {
  if (typeof b64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length % 4 !== 0) {
    return null;
  }
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export type ValidatedUpload =
  | { ok: true; buf: Uint8Array; mime: string }
  | { ok: false; status: 400 | 413 | 415; error: string };

/** Valida base64 + tamanho + MIME declarado vs magic bytes. */
export function validateBase64Upload(base64: unknown, mimeType: unknown): ValidatedUpload {
  if (typeof base64 !== 'string' || typeof mimeType !== 'string') {
    return { ok: false, status: 400, error: 'base64 e mimeType são obrigatórios.' };
  }
  if (!ALLOWED_DOC_MIMES.has(mimeType)) {
    return { ok: false, status: 415, error: 'mimeType não suportado. Use JPEG, PNG, WebP, GIF ou PDF.' };
  }
  if (base64.length > Math.ceil(MAX_DOC_BYTES * 4 / 3)) {
    return { ok: false, status: 413, error: 'Documento maior que 8 MB.' };
  }
  const buf = decodeBase64Strict(base64);
  if (!buf) return { ok: false, status: 400, error: 'base64 inválido.' };
  if (buf.byteLength > MAX_DOC_BYTES) {
    return { ok: false, status: 413, error: 'Documento maior que 8 MB.' };
  }
  const realMime = sniffMime(buf);
  if (!realMime) return { ok: false, status: 415, error: 'Formato de arquivo não reconhecido.' };
  if (realMime !== mimeType) {
    return { ok: false, status: 415, error: `MIME informado (${mimeType}) não corresponde ao conteúdo (${realMime}).` };
  }
  return { ok: true, buf, mime: realMime };
}
