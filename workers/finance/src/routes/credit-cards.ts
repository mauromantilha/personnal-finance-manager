import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { mapCreditCard, mapInvoice, DbInvoice } from '../lib/mappers';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── Credit Cards ──────────────────────────────────────────────────────────────
router.get('/credit-cards', async (c) => {
  const db = c.get('db');
  const rows = await db.query("SELECT * FROM credit_cards WHERE is_active = 1");
  return c.json(rows.map(mapCreditCard as any));
});

router.post('/credit-cards', async (c) => {
  const db = c.get('db');
  const { name, bankName, lastFour, limitInCents, billingDay, dueDay, color } = await c.req.json<any>();
  if (!name || !bankName || !limitInCents)
    return c.json({ error: 'name, bankName e limitInCents são obrigatórios.' }, 400);

  const id = `cc-usr-${crypto.randomUUID()}`;
  await db.exec('INSERT INTO credit_cards VALUES (?,?,?,?,?,?,?,?,1)',
    [id, name, bankName, lastFour ?? null,
     parseInt(String(limitInCents), 10),
     billingDay ?? 1, dueDay ?? 10, color ?? '#6366F1']);
  return c.json({ id }, 201);
});

router.put('/credit-cards/:id', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();
  const { name, bankName, lastFour, limitInCents, billingDay, dueDay, color } = await c.req.json<any>();

  const row = await db.first('SELECT id FROM credit_cards WHERE id = ?', [id]);
  if (!row) return c.json({ error: 'Cartão não encontrado.' }, 404);

  await db.exec(
    'UPDATE credit_cards SET name=?,bank_name=?,last_four=?,limit_in_cents=?,billing_day=?,due_day=?,color=? WHERE id=?',
    [name, bankName, lastFour ?? null,
     parseInt(String(limitInCents), 10),
     billingDay ?? 1, dueDay ?? 10, color ?? '#6366F1', id],
  );
  return c.json({ success: true });
});

router.delete('/credit-cards/:id', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();
  await db.exec('UPDATE credit_cards SET is_active = 0 WHERE id = ?', [id]);
  return c.json({ success: true });
});

// ── Invoices ──────────────────────────────────────────────────────────────────
router.get('/invoices', async (c) => {
  const db = c.get('db');
  const creditCardId = c.req.query('creditCardId');
  const month        = c.req.query('month');

  let sql = 'SELECT * FROM invoices WHERE 1=1';
  const params: string[] = [];
  if (creditCardId) { sql += ' AND credit_card_id = ?'; params.push(creditCardId); }
  if (month)        { sql += ' AND month = ?'; params.push(month); }
  sql += ' ORDER BY month DESC';

  const rows = await db.query(sql, params);
  return c.json(rows.map(mapInvoice as any));
});

router.post('/invoices/:id/pay', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();
  const { accountId } = await c.req.json<any>();
  if (!accountId) return c.json({ error: 'accountId obrigatório para pagamento.' }, 400);

  const inv = await db.first<DbInvoice>('SELECT * FROM invoices WHERE id = ?', [id]);
  if (!inv) return c.json({ error: 'Fatura não encontrada.' }, 404);

  const mapped = mapInvoice(inv);
  if (mapped.status === 'paid') return c.json({ error: 'Fatura já está paga.' }, 400);

  const paidAt = new Date().toISOString();
  await db.batch([
    { sql: "UPDATE invoices SET status = 'paid', paid_at = ? WHERE id = ?", params: [paidAt, id] },
    { sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents - ? WHERE id = ?', params: [mapped.totalInCents, accountId] },
  ]);
  return c.json({ success: true });
});

export default router;
