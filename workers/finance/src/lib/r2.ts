// R2 helpers — usa o binding MKS_DOCUMENTS (único bucket, isolamento por prefixo)

export async function r2Put(
  bucket: R2Bucket,
  key: string,
  body: string | ArrayBuffer,
  contentType = 'application/json',
): Promise<void> {
  await bucket.put(key, body, { httpMetadata: { contentType } });
}

export async function r2Get(
  bucket: R2Bucket,
  key: string,
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;
  return {
    body:        await obj.arrayBuffer(),
    contentType: obj.httpMetadata?.contentType ?? 'application/octet-stream',
  };
}

export async function r2Delete(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key);
}
