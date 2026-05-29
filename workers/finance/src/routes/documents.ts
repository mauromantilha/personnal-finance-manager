import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { groqChat, classifyMerchant } from '../lib/groq';
import { r2Put, r2Get } from '../lib/r2';
import { mapCreditCard, DbCreditCard } from '../lib/mappers';
import { recalculateBudgets } from '../lib/helpers';
import { D1Stmt } from '../lib/d1';
import { checkQuota, incrementStorage, decrementStorage, formatBytes, STORAGE_UPGRADE_PRICE, STORAGE_PAID_BYTES } from '../lib/storage';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// Nota: tenant.r2Prefix é validado no middleware de tenant em index.ts.
// Aqui podemos confiar que existe e tem comprimento mínimo.

// ── Validação de upload (base64 + magic bytes) ──────────────────────────────
const MAX_DOC_BYTES = 8 * 1024 * 1024; // 8 MB

const ALLOWED_DOC_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
]);

/** Detecta magic bytes do início do buffer e retorna o mime real ou null. */
function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
  // GIF: 47 49 46 38 ('GIF8')
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
  // WebP: 52 49 46 46 .. .. .. .. 57 45 42 50
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  // PDF: 25 50 44 46 ('%PDF')
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf';
  return null;
}

function decodeBase64Strict(b64: string): Uint8Array | null {
  // Aceita apenas alfabeto base64 padrão; rejeita whitespace/lixo.
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

// ── GET /api/documents — lista documentos do tenant no R2 ────────────────────
router.get('/documents', async (c) => {
  const tenant = c.get('tenant');
  const prefix = `${tenant.r2Prefix}/documents/`;
  const listed = await c.env.MKS_DOCUMENTS.list({ prefix, limit: 500 });
  const docs = listed.objects.map(obj => ({
    key:        obj.key,
    name:       obj.key.split('/').pop() ?? obj.key,
    size:       obj.size,
    uploadedAt: obj.uploaded.toISOString(),
  }));
  docs.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return c.json({ documents: docs });
});

// ── DELETE /api/documents/* — remove documento do R2 ─────────────────────────
router.delete('/documents/*', async (c) => {
  const key = c.req.param('*');
  if (!key) return c.json({ error: 'key obrigatória' }, 400);
  const tenant = c.get('tenant');
  // Security: ensure the key belongs to this tenant's prefix
  if (!key.startsWith(tenant.r2Prefix + '/')) {
    return c.json({ error: 'Acesso negado.' }, 403);
  }
  // Obter tamanho antes de deletar para decrementar o contador de storage
  const existing = await c.env.MKS_DOCUMENTS.head(key);
  const fileSize = existing?.size ?? 0;
  await c.env.MKS_DOCUMENTS.delete(key);
  if (fileSize > 0) {
    c.executionCtx.waitUntil(
      decrementStorage(c.env.MKS_TENANTS, tenant.familyId, fileSize),
    );
  }
  return c.json({ success: true });
});

// ── POST /api/documents/analyze — Groq Vision ─────────────────────────────────
router.post('/documents/analyze', async (c) => {
  const { base64, mimeType, documentType } = await c.req.json<any>();
  if (!base64 || !mimeType || !documentType)
    return c.json({ error: 'base64, mimeType e documentType são obrigatórios.' }, 400);
  if (!['BILL', 'INVOICE'].includes(documentType))
    return c.json({ error: 'documentType deve ser BILL ou INVOICE.' }, 400);
  if (!ALLOWED_DOC_MIMES.has(mimeType))
    return c.json({ error: 'mimeType não suportado. Use JPEG, PNG, WebP, GIF ou PDF.' }, 415);

  // Cap aproximado do tamanho antes de decodificar (base64 = ~1.33x do binário)
  if (typeof base64 !== 'string' || base64.length > Math.ceil(MAX_DOC_BYTES * 4 / 3))
    return c.json({ error: 'Documento maior que 8 MB.' }, 413);

  const buf = decodeBase64Strict(base64);
  if (!buf) return c.json({ error: 'base64 inválido.' }, 400);
  if (buf.byteLength > MAX_DOC_BYTES)
    return c.json({ error: 'Documento maior que 8 MB.' }, 413);

  // Sniff de magic bytes — rejeita MIME falsificado pelo cliente
  const realMime = sniffMime(buf);
  if (!realMime) return c.json({ error: 'Formato de arquivo não reconhecido.' }, 415);
  if (realMime !== mimeType)
    return c.json({ error: `MIME informado (${mimeType}) não corresponde ao conteúdo (${realMime}).` }, 415);

  // ── Verificação de cota de storage ───────────────────────────────────────────
  const tenant = c.get('tenant');
  const quotaErr = await checkQuota(c.env.MKS_TENANTS, tenant.familyId, tenant.storageTierBytes, buf.byteLength);
  if (quotaErr) {
    return c.json({
      error: 'QUOTA_EXCEEDED',
      code:  'QUOTA_EXCEEDED',
      usedBytes:  quotaErr.usedBytes,
      limitBytes: quotaErr.limitBytes,
      usedFormatted:  formatBytes(quotaErr.usedBytes),
      limitFormatted: formatBytes(quotaErr.limitBytes),
      upgradePrice:   STORAGE_UPGRADE_PRICE,
      upgradeLimitBytes: STORAGE_PAID_BYTES,
    }, 402);
  }

  const key   = c.env.GROQ_API_KEY;
  const r2key = buildDocKey(tenant.r2Prefix, realMime);
  let extracted: Record<string, unknown> = {};

  const billPrompt   = `Analise este documento financeiro brasileiro e extraia em JSON: {"description":"nome do serviço","amountInCents":número em centavos,"dueDate":"YYYY-MM-DD","payerName":"string|null","payerDoc":"CPF/CNPJ|null"}. Retorne APENAS o JSON.`;
  const invoicePrompt = `Analise esta fatura de cartão brasileiro e extraia em JSON: {"dueDate":"YYYY-MM-DD","totalAmountInCents":número em centavos,"lineItems":[{"date":"YYYY-MM-DD","merchant":"string","amountInCents":número}]}. Inclua TODOS os lançamentos. Retorne APENAS o JSON.`;

  if (key) {
    try {
      const raw = await groqChat(key, 'meta-llama/llama-4-scout-17b-16e-instruct',
        [{ role: 'user', content: [
          { type: 'text', text: documentType === 'INVOICE' ? invoicePrompt : billPrompt },
          { type: 'image_url', image_url: { url: `data:${realMime};base64,${base64}` } },
        ] }],
        { temperature: 0.1, max_tokens: 2048 },
      );
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) extracted = JSON.parse(match[0]);
    } catch { /* prossegue sem extração */ }
  }

  if (documentType === 'INVOICE' && Array.isArray(extracted.lineItems)) {
    extracted.lineItems = (extracted.lineItems as any[]).map(item => ({
      ...item, category: classifyMerchant(item.merchant ?? ''),
    }));
  }

  // Reutiliza o buffer já validado e usa o mime real detectado.
  // buf vem de `new Uint8Array(bin.length)` em decodeBase64Strict, então o
  // backing buffer é sempre ArrayBuffer (nunca SharedArrayBuffer) — cast seguro.
  await r2Put(c.env.MKS_DOCUMENTS, r2key, buf.buffer as ArrayBuffer, realMime);

  // Atualizar contador de storage de forma assíncrona (não bloqueia resposta)
  c.executionCtx.waitUntil(
    incrementStorage(c.env.MKS_TENANTS, tenant.familyId, buf.byteLength),
  );

  return c.json({ ...extracted, documentKey: r2key });
});

// ── POST /api/import/invoice — importa linha a linha de fatura ────────────────
router.post('/import/invoice', async (c) => {
  const db = c.get('db');
  const { items, creditCardId } = await c.req.json<any>();
  if (!Array.isArray(items) || !creditCardId)
    return c.json({ error: 'items e creditCardId são obrigatórios.' }, 400);

  const card = await db.first<DbCreditCard>('SELECT * FROM credit_cards WHERE id = ?', [creditCardId]);
  if (!card) return c.json({ error: 'Cartão não encontrado.' }, 404);
  const mapped = mapCreditCard(card);

  const stmts: D1Stmt[] = [];
  let imported = 0;
  const errors: string[] = [];

  for (const item of items) {
    const { date, merchant, amountInCents, category } = item;
    if (!date || !merchant || !amountInCents) { errors.push(`Item inválido: ${JSON.stringify(item)}`); continue; }
    const amount = Math.round(Number(amountInCents));
    if (isNaN(amount) || amount <= 0) { errors.push(`Valor inválido: ${amountInCents}`); continue; }

    const txDate   = new Date(date as string);
    const month    = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
    const invId    = `inv-${creditCardId}-${month.replace('-', '')}`;
    const dueYear  = txDate.getMonth() + 1 === 12 ? txDate.getFullYear() + 1 : txDate.getFullYear();
    const dueMonth = ((txDate.getMonth() + 1) % 12) + 1;
    const dueDate  = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(mapped.dueDay).padStart(2, '0')}`;

    stmts.push({ sql: "INSERT OR IGNORE INTO invoices (id,credit_card_id,month,total_in_cents,status,due_date,created_at) VALUES (?,?,?,0,'open',?,datetime('now'))", params: [invId, creditCardId, month, dueDate] });
    stmts.push({ sql: 'UPDATE invoices SET total_in_cents = total_in_cents + ? WHERE id = ?', params: [amount, invId] });

    const slug = String(merchant).slice(0, 8).replace(/\W/g, '');
    const txId = `tx-inv-${creditCardId}-${String(date).replace(/-/g, '')}-${amount}-${slug}`;
    stmts.push({
      sql: "INSERT OR IGNORE INTO transactions (id,amount_in_cents,date,type,category,description,account_id,is_synced,credit_card_id,invoice_id) VALUES (?,?,?,'DES',?,?,NULL,0,?,?)",
      params: [txId, amount, date, category ?? classifyMerchant(merchant), merchant, creditCardId, invId],
    });
    imported++;
  }

  if (stmts.length) {
    await db.batch(stmts);
    await recalculateBudgets(db);
  }
  return c.json({ imported, errors });
});

// ── GET /api/documents/* — proxy R2 ──────────────────────────────────────────
router.get('/documents/*', async (c) => {
  const key = c.req.param('*');
  if (!key) return c.json({ error: 'key obrigatória' }, 400);

  const tenant = c.get('tenant');
  if (!key.startsWith(tenant.r2Prefix + '/')) {
    return c.json({ error: 'Acesso negado.' }, 403);
  }

  const doc = await r2Get(c.env.MKS_DOCUMENTS, key);
  if (!doc) return c.json({ error: 'Documento não encontrado.' }, 404);

  return new Response(doc.body, {
    headers: {
      'Content-Type':        doc.contentType,
      'Content-Disposition': 'inline',
      'Cache-Control':       'private, max-age=3600',
    },
  });
});

function buildDocKey(prefix: string, mimeType: string): string {
  const extMap: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };
  const ext = extMap[mimeType] ?? 'jpg';
  const now = new Date();
  return `${prefix}/documents/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/doc-${crypto.randomUUID()}.${ext}`;
}

export default router;
