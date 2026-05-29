// Storage quota helpers — tracking via KV counter por família.
// KV key: `storage:{familyId}:used` → bytes usados como string inteira.
// O valor pode divergir do R2 real em falhas; um recálculo periódico via
// R2.list() pode corrigi-lo, mas para uso diário o contador é suficiente.

export const STORAGE_FREE_BYTES    = 300 * 1024 * 1024;   // 300 MB
export const STORAGE_PAID_BYTES    = 1_073_741_824;         // 1 GB
export const STORAGE_UPGRADE_PRICE = 5.00;                  // R$ 5,00/mês

function kvKey(familyId: string): string {
  return `storage:${familyId}:used`;
}

export async function getStorageUsed(kv: KVNamespace, familyId: string): Promise<number> {
  const raw = await kv.get(kvKey(familyId));
  const n   = raw ? parseInt(raw, 10) : 0;
  return isNaN(n) || n < 0 ? 0 : n;
}

export async function incrementStorage(kv: KVNamespace, familyId: string, bytes: number): Promise<void> {
  const current = await getStorageUsed(kv, familyId);
  await kv.put(kvKey(familyId), String(Math.max(0, current + bytes)));
}

export async function decrementStorage(kv: KVNamespace, familyId: string, bytes: number): Promise<void> {
  const current = await getStorageUsed(kv, familyId);
  await kv.put(kvKey(familyId), String(Math.max(0, current - bytes)));
}

/** Retorna o limite em bytes do tenant (campo opcional — fallback free). */
export function getStorageLimit(storageTierBytes: number | undefined): number {
  if (typeof storageTierBytes === 'number' && storageTierBytes > 0) return storageTierBytes;
  return STORAGE_FREE_BYTES;
}

/**
 * Verifica se um upload de `uploadBytes` caberia dentro da cota.
 * Retorna `null` se OK, ou um objeto de erro se exceder.
 */
export async function checkQuota(
  kv: KVNamespace,
  familyId: string,
  storageTierBytes: number | undefined,
  uploadBytes: number,
): Promise<{ usedBytes: number; limitBytes: number } | null> {
  const used  = await getStorageUsed(kv, familyId);
  const limit = getStorageLimit(storageTierBytes);
  if (used + uploadBytes > limit) return { usedBytes: used, limitBytes: limit };
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024)               return `${bytes} B`;
  if (bytes < 1024 * 1024)        return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
