import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { mapInstallmentGroup, mapCreditCard, DbCreditCard } from '../lib/mappers';
import { recalculateBudgets } from '../lib/helpers';
import { D1Stmt } from '../lib/d1';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.get('/installments', async (c) => {
  const db = c.get('db');
  const [igRows, igCounts] = await Promise.all([
    db.query('SELECT * FROM installment_groups ORDER BY start_date DESC'),
    db.query<{ installment_group_id: string; cnt: number }>(
      "SELECT installment_group_id, COUNT(*) as cnt FROM transactions WHERE installment_group_id IS NOT NULL AND date <= date('now') GROUP BY installment_group_id",
    ),
  ]);
  const paidMap = Object.fromEntries(igCounts.map(r => [r.installment_group_id, r.cnt]));
  return c.json(igRows.map(r => mapInstallmentGroup(r, paidMap[(r as any).id] ?? 0)));
});

router.post('/installments', async (c) => {
  const db = c.get('db');
  const { description, totalInCents, installmentCount, category,
          accountId, creditCardId, startDate, memberId } = await c.req.json<any>();

  if (!description || !totalInCents || !installmentCount || !startDate)
    return c.json({ error: 'Campos obrigatórios: description, totalInCents, installmentCount, startDate.' }, 400);

  const total    = parseInt(String(totalInCents), 10);
  const count    = Math.min(parseInt(String(installmentCount), 10), 48);
  const instAmt  = Math.round(total / count);
  const groupId  = `grp-usr-${crypto.randomUUID()}`;
  const baseId   = `tx-inst-${crypto.randomUUID()}`;

  const stmts: D1Stmt[] = [{
    sql: 'INSERT INTO installment_groups (id,description,total_in_cents,installment_count,installment_amount_in_cents,category,account_id,credit_card_id,member_id,start_date,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime(\'now\'))',
    params: [groupId, description, total, count, instAmt, category ?? 'Compras', accountId ?? null, creditCardId ?? null, memberId ?? null, startDate],
  }];

  const isCreditCard = !!creditCardId && !accountId;
  let card = isCreditCard
    ? await db.first<DbCreditCard>('SELECT * FROM credit_cards WHERE id = ?', [creditCardId])
    : null;
  const mappedCard = card ? mapCreditCard(card) : null;

  const txBase = new Date(startDate as string);
  for (let i = 0; i < count; i++) {
    const instDate = new Date(txBase);
    instDate.setMonth(instDate.getMonth() + i);
    const txDate   = instDate.toISOString().split('T')[0];
    const txId     = `${baseId}-${i + 1}`;
    const desc     = `${description} (${i + 1}/${count})`;

    if (isCreditCard && mappedCard) {
      const instMonth = `${instDate.getFullYear()}-${String(instDate.getMonth() + 1).padStart(2, '0')}`;
      const invId     = `inv-${creditCardId}-${instMonth.replace('-', '')}`;
      const dueYear   = instDate.getMonth() + 1 === 12 ? instDate.getFullYear() + 1 : instDate.getFullYear();
      const dueMonth  = ((instDate.getMonth() + 1) % 12) + 1;
      const dueDate   = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(mappedCard.dueDay).padStart(2, '0')}`;

      stmts.push({ sql: "INSERT OR IGNORE INTO invoices (id,credit_card_id,month,total_in_cents,status,due_date,created_at) VALUES (?,?,?,0,'open',?,datetime('now'))", params: [invId, creditCardId, instMonth, dueDate] });
      stmts.push({ sql: 'UPDATE invoices SET total_in_cents = total_in_cents + ? WHERE id = ?', params: [instAmt, invId] });
      stmts.push({
        sql: 'INSERT INTO transactions (id,amount_in_cents,date,type,category,description,account_id,is_synced,credit_card_id,invoice_id,installment_number,installment_total,installment_group_id,member_id) VALUES (?,?,?,\'DES\',?,?,NULL,0,?,?,?,?,?,?)',
        params: [txId, instAmt, txDate, category ?? 'Compras', desc, creditCardId, invId, i + 1, count, groupId, memberId ?? null],
      });
    } else {
      stmts.push({
        sql: 'INSERT INTO transactions (id,amount_in_cents,date,type,category,description,account_id,is_synced,installment_number,installment_total,installment_group_id,member_id) VALUES (?,?,?,\'DES\',?,?,?,0,?,?,?,?)',
        params: [txId, instAmt, txDate, category ?? 'Compras', desc, accountId, i + 1, count, groupId, memberId ?? null],
      });
      stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents - ? WHERE id = ?', params: [instAmt, accountId] });
    }
  }

  await db.batch(stmts);
  await recalculateBudgets(db);
  return c.json({ id: groupId }, 201);
});

router.delete('/installments/:groupId', async (c) => {
  const db = c.get('db');
  const { groupId } = c.req.param();

  const txRows = await db.query<{ id: string; type: string; amount_in_cents: number; account_id: string | null; invoice_id: string | null }>(
    'SELECT id, type, amount_in_cents, account_id, invoice_id FROM transactions WHERE installment_group_id = ?',
    [groupId],
  );

  const stmts: D1Stmt[] = [];
  for (const tx of txRows) {
    stmts.push({ sql: 'DELETE FROM transactions WHERE id = ?', params: [tx.id] });
    if (tx.account_id) stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents + ? WHERE id = ?', params: [tx.amount_in_cents, tx.account_id] });
    if (tx.invoice_id) stmts.push({ sql: 'UPDATE invoices SET total_in_cents = total_in_cents - ? WHERE id = ?', params: [tx.amount_in_cents, tx.invoice_id] });
  }
  stmts.push({ sql: 'DELETE FROM installment_groups WHERE id = ?', params: [groupId] });

  await db.batch(stmts);
  await recalculateBudgets(db);
  return c.json({ success: true });
});

export default router;
