import { describe, expect, it } from 'vitest';
import { decodeBase64Strict, sniffMime, validateBase64Upload } from './upload';

function toB64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

describe('sniffMime', () => {
  it('detecta JPEG/PNG/PDF', () => {
    expect(sniffMime(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]))).toBe('image/jpeg');
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4E, 0x47]))).toBe('image/png');
    expect(sniffMime(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe('application/pdf');
  });
  it('retorna null para buffer curto ou desconhecido', () => {
    expect(sniffMime(new Uint8Array([1, 2]))).toBeNull();
    expect(sniffMime(new Uint8Array([0, 1, 2, 3]))).toBeNull();
  });
});

describe('decodeBase64Strict', () => {
  it('decodifica base64 válido', () => {
    expect(Array.from(decodeBase64Strict(btoa('ab'))!)).toEqual([97, 98]);
  });
  it('rejeita lixo', () => {
    expect(decodeBase64Strict('!!!')).toBeNull();
    expect(decodeBase64Strict('abc')).toBeNull(); // length % 4 !== 0
  });
});

describe('validateBase64Upload', () => {
  it('aceita PNG coerente', () => {
    const png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    const r = validateBase64Upload(toB64(png), 'image/png');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mime).toBe('image/png');
  });
  it('rejeita mime declarado diferente do conteúdo', () => {
    const png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    const r = validateBase64Upload(toB64(png), 'image/jpeg');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(415);
  });
  it('rejeita mime não permitido', () => {
    const r = validateBase64Upload(btoa('x'), 'text/plain');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(415);
  });
});
