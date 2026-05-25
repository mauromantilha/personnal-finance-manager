import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { mapTransaction, mapCreditCard, DbTransaction, DbCreditCard } from '../lib/mappers';
import { recalculateBudgets, checkBudgetThresholds } from '../lib/helpers';
import { D1Stmt } from '../lib/d1';

const VALID_TYPES = ['REC', 'DES', 'TRANS'];

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── POST /api/transactions ─────────────────────────────────────────────────────
router.post('/transactions', async (c) => {
  const db = c.get('db');
  const body = await c.req.json<Record<string, unknown>>();

  const { amountInCents, date, type, category, description,
          accountId, destinationAccountId, creditCardId, installments,
          documentKey, memberId } = body as any;

  if (!amountInCents || !date || !type || !category || !description)
    return c.json({ error: 'Parâmetros obrigatórios ausentes.' }, 400);
  if (!VALID_TYPES.includes(type))
    return c.json({ error: 'Tipo inválido. Use REC, DES ou TRANS.' }, 400);

  const amount = parseInt(String(amountInCents), 10);
  if (isNaN(amount) || amount <= 0)
    return c.json({ error: 'Valor deve ser inteiro positivo em centavos.' }, 400);

  const isCreditCard = !!creditCardId;
  if (!isCreditCard && !accountId)
    return c.json({ error: 'accountId obrigatório para transações sem cartão.' }, 400);

  const numInstallments = installments && parseInt(String(installments), 10) > 1
    ? Math.min(parseInt(String(installments), 10), 48) : 1;
  const installmentGroupId = numInstallments > 1 ? `grp-${Date.now()}` : null;
  const baseId = `tx-usr-${Date.now()}`;
  const stmts: D1Stmt[] = [];

  try {
    if (isCreditCard) {
      const card = await db.first<DbCreditCard>('SELECT * FROM credit_cards WHERE id = ?', [creditCardId]);
      if (!card) return c.json({ error: 'Cartão não encontrado.' }, 404);
      const mapped = mapCreditCard(card);
      const txDate = new Date(date as string);

      for (let i = 0; i < numInstallments; i++) {
        const instDate = new Date(txDate);
        instDate.setMonth(instDate.getMonth() + i);
        const instMonth = `${instDate.getFullYear()}-${String(instDate.getMonth() + 1).padStart(2, '0')}`;
        const instAmount = Math.round(amount / numInstallments);

        const invId = `inv-${creditCardId}-${instMonth.replace('-', '')}`;
        const dueYear  = instDate.getMonth() + 1 === 12 ? instDate.getFullYear() + 1 : instDate.getFullYear();
        const dueMonth = ((instDate.getMonth() + 1) % 12) + 1;
        const dueDate  = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(mapped.dueDay).padStart(2, '0')}`;

        stmts.push({ sql: "INSERT OR IGNORE INTO invoices (id,credit_card_id,month,total_in_cents,status,due_date,created_at) VALUES (?,?,?,0,'open',?,datetime('now'))", params: [invId, creditCardId, instMonth, dueDate] });
        stmts.push({ sql: 'UPDATE invoices SET total_in_cents = total_in_cents + ? WHERE id = ?', params: [instAmount, invId] });

        const txId = numInstallments > 1 ? `${baseId}-${i + 1}` : baseId;
        const desc = numInstallments > 1 ? `${description} (${i + 1}/${numInstallments})` : description;
        stmts.push({
          sql: 'INSERT INTO transactions (id,amount_in_cents,date,type,category,description,account_id,is_synced,credit_card_id,invoice_id,installment_number,installment_total,installment_group_id,document_key,member_id) VALUES (?,?,?,?,?,?,NULL,0,?,?,?,?,?,?,?)',
          params: [txId, instAmount, instDate.toISOString().split('T')[0], type, category, desc,
            creditCardId, invId,
            numInstallments > 1 ? i + 1 : null,
            numInstallments > 1 ? numInstallments : null,
            installmentGroupId,
            i === 0 ? (documentKey ?? null) : null,
            i === 0 ? (memberId ?? null) : null],
        });
      }
    } else {
      stmts.push({
        sql: 'INSERT INTO transactions (id,amount_in_cents,date,type,category,description,account_id,destination_account_id,is_synced,document_key,member_id) VALUES (?,?,?,?,?,?,?,?,0,?,?)',
        params: [baseId, amount, date, type, category, description, accountId, destinationAccountId ?? null, documentKey ?? null, memberId ?? null],
      });
      if (type === 'DES')  stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents - ? WHERE id = ?', params: [amount, accountId] });
      if (type === 'REC')  stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents + ? WHERE id = ?', params: [amount, accountId] });
      if (type === 'TRANS') {
        stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents - ? WHERE id = ?', params: [amount, accountId] });
        stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents + ? WHERE id = ?', params: [amount, destinationAccountId] });
      }
    }

    await db.batch(stmts);
    await recalculateBudgets(db);

    if (type === 'DES' && !isCreditCard) {
      await checkBudgetThresholds(db, String(category), amount);
    }

    return c.json({ id: baseId }, 201);
  } catch (e) {
    return c.json({ error: 'D1 error', details: (e as Error).message }, 500);
  }
});

// ── PUT /api/transactions/:id ─────────────────────────────────────────────────
router.put('/transactions/:id', async (c) => {
  const db  = c.get('db');
  const { id } = c.req.param();
  const body = await c.req.json<Record<string, unknown>>();

  const row = await db.first<DbTransaction>('SELECT * FROM transactions WHERE id = ?', [id]);
  if (!row) return c.json({ error: 'Transação não encontrada.' }, 404);
  const old = mapTransaction(row);

  const newAmount = body.amountInCents
    ? parseInt(String(body.amountInCents), 10)
    : old.amountInCents;
  if (isNaN(newAmount) || newAmount <= 0)
    return c.json({ error: 'Valor inválido.' }, 400);

  const stmts: D1Stmt[] = [{
    sql: 'UPDATE transactions SET amount_in_cents=?,date=?,category=?,description=? WHERE id=?',
    params: [newAmount, (body.date as string) ?? old.date, (body.category as string) ?? old.category, (body.description as string) ?? old.description, id],
  }];

  const diff = newAmount - old.amountInCents;
  if (diff !== 0 && old.accountId) {
    if (old.type === 'DES') stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents - ? WHERE id = ?', params: [diff, old.accountId] });
    else if (old.type === 'REC') stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents + ? WHERE id = ?', params: [diff, old.accountId] });
    else if (old.type === 'TRANS') {
      stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents - ? WHERE id = ?', params: [diff, old.accountId] });
      if (old.destinationAccountId) stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents + ? WHERE id = ?', params: [diff, old.destinationAccountId] });
    }
  }

  await db.batch(stmts);
  await recalculateBudgets(db);
  return c.json({ success: true });
});

// ── DELETE /api/transactions/:id ──────────────────────────────────────────────
router.delete('/transactions/:id', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();

  const row = await db.first<DbTransaction>('SELECT * FROM transactions WHERE id = ?', [id]);
  if (!row) return c.json({ error: 'Transação não encontrada.' }, 404);
  const tx = mapTransaction(row);

  const stmts: D1Stmt[] = [{ sql: 'DELETE FROM transactions WHERE id = ?', params: [id] }];

  if (tx.type === 'DES' && tx.accountId) stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents + ? WHERE id = ?', params: [tx.amountInCents, tx.accountId] });
  else if (tx.type === 'REC' && tx.accountId) stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents - ? WHERE id = ?', params: [tx.amountInCents, tx.accountId] });
  else if (tx.type === 'TRANS') {
    if (tx.accountId) stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents + ? WHERE id = ?', params: [tx.amountInCents, tx.accountId] });
    if (tx.destinationAccountId) stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents - ? WHERE id = ?', params: [tx.amountInCents, tx.destinationAccountId] });
  }

  await db.batch(stmts);
  await recalculateBudgets(db);
  return c.json({ success: true });
});

export default router;
