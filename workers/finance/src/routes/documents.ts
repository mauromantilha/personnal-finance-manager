import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { groqChat, classifyMerchant } from '../lib/groq';
import { r2Put, r2Get } from '../lib/r2';
import { mapCreditCard, DbCreditCard } from '../lib/mappers';
import { recalculateBudgets } from '../lib/helpers';
import { D1Stmt } from '../lib/d1';
import { checkQuota, incrementStorage, decrementStorage, formatBytes, STORAGE_UPGRADE_PRICE, STORAGE_PAID_BYTES } from '../lib/storage';
import { validateBase64Upload } from '../lib/upload';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// Nota: tenant.r2Prefix é validado no middleware de tenant em index.ts.
// Aqui podemos confiar que existe e tem comprimento mínimo.

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
  if (!documentType)
    return c.json({ error: 'base64, mimeType e documentType são obrigatórios.' }, 400);
  if (!['BILL', 'INVOICE'].includes(documentType))
    return c.json({ error: 'documentType deve ser BILL ou INVOICE.' }, 400);

  const upload = validateBase64Upload(base64, mimeType);
  if (!upload.ok) return c.json({ error: upload.error }, upload.status);

  const { buf, mime: realMime } = upload;

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

  await r2Put(c.env.MKS_DOCUMENTS, r2key, buf.buffer as ArrayBuffer, realMime);

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
