import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { classifyMerchant } from '../lib/groq';
import { recalculateBudgets } from '../lib/helpers';
import { D1Stmt } from '../lib/d1';
import { requireOwner } from '../lib/authz';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

const MAX_OFX_TRANSACTIONS = 5000;
const MAX_CSV_LINES         = 5000;
const MAX_MEMO_LEN          = 500;
const FITID_REGEX = /^[A-Za-z0-9_\-.]{1,64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

router.use('*', requireOwner);

function parseAmountCents(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && Number.isInteger(raw) && raw > 0 && raw <= 1_000_000_000) {
    return raw;
  }
  if (typeof raw === 'string' && /^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    if (n > 0 && n <= 1_000_000_000) return n;
  }
  return null;
}

// ── POST /api/import/ofx ──────────────────────────────────────────────────────
router.post('/import/ofx', async (c) => {
  const db = c.get('db');
  const { transactions, accountId } = await c.req.json<any>();
  if (!accountId || !Array.isArray(transactions) || !transactions.length)
    return c.json({ error: 'accountId e transactions[] são obrigatórios.' }, 400);
  if (transactions.length > MAX_OFX_TRANSACTIONS)
    return c.json({ error: `Máximo ${MAX_OFX_TRANSACTIONS} transações por importação.` }, 413);

  const acc = await db.first('SELECT id FROM accounts WHERE id = ?', [accountId]);
  if (!acc) return c.json({ error: 'Conta não encontrada.' }, 404);

  const stmts: D1Stmt[] = [];
  let imported = 0, skipped = 0;

  for (const tx of transactions) {
    const rawFitid = typeof tx.fitid === 'string' ? tx.fitid : '';
    const fitid = FITID_REGEX.test(rawFitid) ? rawFitid : null;
    if (!fitid) { skipped++; continue; }

    const amountCents = parseAmountCents(tx.amountCents);
    if (amountCents === null) { skipped++; continue; }

    const date = typeof tx.date === 'string' && ISO_DATE.test(tx.date) ? tx.date : null;
    if (!date) { skipped++; continue; }

    const memoRaw = typeof tx.memo === 'string' ? tx.memo : '';
    const memo = memoRaw.slice(0, MAX_MEMO_LEN);

    const txId = `tx-ofx-${fitid}`;
    const dup  = await db.first('SELECT id FROM transactions WHERE id = ?', [txId]);
    if (dup) { skipped++; continue; }

    const txType   = tx.type === 'CREDIT' ? 'REC' : 'DES';
    const category = classifyMerchant(memo);
    const balDelta = txType === 'REC' ? amountCents : -amountCents;

    stmts.push({
      sql: 'INSERT INTO transactions (id,amount_in_cents,date,type,category,description,account_id,is_synced,original_merchant_name) VALUES (?,?,?,?,?,?,?,1,?)',
      params: [txId, amountCents, date, txType, category, memo, accountId, memo || null],
    });
    stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents + ? WHERE id = ?', params: [balDelta, accountId] });
    imported++;
  }

  if (stmts.length) {
    await db.batch(stmts);
    await recalculateBudgets(db);
  }
  return c.json({ success: true, imported, skipped });
});

// ── POST /api/import/csv ──────────────────────────────────────────────────────
router.post('/import/csv', async (c) => {
  const db = c.get('db');
  const { csv, accountId } = await c.req.json<any>();
  if (!csv || !accountId) return c.json({ error: 'csv e accountId são obrigatórios.' }, 400);
  if (typeof csv !== 'string' || csv.length > 2 * 1024 * 1024)
    return c.json({ error: 'CSV muito grande (máx. 2 MB).' }, 413);

  const acc = await db.first('SELECT id FROM accounts WHERE id = ?', [accountId]);
  if (!acc) return c.json({ error: 'Conta não encontrada.' }, 404);

  const lines  = String(csv).split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > MAX_CSV_LINES)
    return c.json({ error: `Máximo ${MAX_CSV_LINES} linhas por importação.` }, 413);
  const stmts: D1Stmt[]  = [];
  const errors: string[] = [];
  let imported = 0, balanceDelta = 0;

  for (const line of lines) {
    if (/^(data|date|dia)/i.test(line)) continue;

    const cols = line.replace(/^﻿/, '').split(/[,;]/).map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 3) { errors.push(`Colunas insuficientes: ${line.slice(0, 60)}`); continue; }

    const [rawDate, rawDesc, rawAmount, rawType] = cols;

    let date = rawDate;
    if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(rawDate)) {
      const p = rawDate.split(/[\/\-]/);
      date = `${p[2]}-${p[1]}-${p[0]}`;
    }
    if (!ISO_DATE.test(date)) { errors.push(`Data inválida: ${rawDate}`); continue; }

    const amountFloat = parseFloat(rawAmount.replace(/\./g, '').replace(',', '.'));
    if (isNaN(amountFloat)) { errors.push(`Valor inválido: ${rawAmount}`); continue; }

    const cents = Math.round(Math.abs(amountFloat) * 100);
    if (cents === 0) continue;

    const type: 'REC' | 'DES' = rawType
      ? (/crédito|credito|entrada|receita|credit/i.test(rawType) ? 'REC' : 'DES')
      : (amountFloat > 0 ? 'REC' : 'DES');

    const category = type === 'REC' ? 'Receita' : classifyMerchant(rawDesc);
    const slug     = rawDesc.slice(0, 8).replace(/\W/g, '');
    const txId     = `tx-imp-${accountId}-${date.replace(/-/g, '')}-${cents}-${slug}`;

    stmts.push({ sql: 'INSERT OR IGNORE INTO transactions (id,amount_in_cents,date,type,category,description,account_id,is_synced) VALUES (?,?,?,?,?,?,?,0)', params: [txId, cents, date, type, category, rawDesc.slice(0, MAX_MEMO_LEN), accountId] });
    balanceDelta += type === 'REC' ? cents : -cents;
    imported++;
  }

  if (stmts.length) {
    stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents + ? WHERE id = ?', params: [balanceDelta, accountId] });
    await db.batch(stmts);
    await recalculateBudgets(db);
  }
  return c.json({ imported, errors });
});

export default router;
