import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { mapCreditCard, mapInvoice, DbInvoice } from '../lib/mappers';
import { requireOwner } from '../lib/authz';
import { ensureTenantSchema } from '../lib/ensure-schema';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── Credit Cards ──────────────────────────────────────────────────────────────
router.get('/credit-cards', async (c) => {
  const db = c.get('db');
  const rows = await db.query("SELECT * FROM credit_cards WHERE is_active = 1");
  return c.json(rows.map(mapCreditCard as any));
});

router.post('/credit-cards', requireOwner, async (c) => {
  const db = c.get('db');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'JSON inválido.' }, 400);
  }
  const { name, bankName, lastFour, limitInCents, billingDay, dueDay, color } = body;
  if (!name || !bankName || limitInCents === undefined || limitInCents === null)
    return c.json({ error: 'name, bankName e limitInCents são obrigatórios.' }, 400);

  const limit = parseInt(String(limitInCents), 10);
  if (isNaN(limit) || limit <= 0)
    return c.json({ error: 'Limite deve ser um valor positivo em centavos.' }, 400);

  const bill = parseInt(String(billingDay ?? 1), 10);
  const due  = parseInt(String(dueDay ?? 10), 10);
  if (isNaN(bill) || bill < 1 || bill > 31 || isNaN(due) || due < 1 || due > 31)
    return c.json({ error: 'Dia de fechamento/vencimento deve ser entre 1 e 31.' }, 400);

  try {
    await ensureTenantSchema(db);
  } catch (e) {
    console.error('[ensureTenantSchema]', (e as Error).message);
  }

  const id = `cc-usr-${crypto.randomUUID()}`;
  try {
    await db.exec(
      'INSERT INTO credit_cards (id,name,bank_name,last_four,limit_in_cents,billing_day,due_day,color,is_active) VALUES (?,?,?,?,?,?,?,?,1)',
      [id, name, bankName, lastFour ?? null, limit, bill, due, color ?? '#6366F1'],
    );
    return c.json({
      id,
      card: {
        id, name, bankName, lastFour: lastFour ?? null, limitInCents: limit,
        billingDay: bill, dueDay: due, color: color ?? '#6366F1', isActive: true,
      },
    }, 201);
  } catch (e) {
    return c.json({ error: 'Falha ao criar cartão.', details: (e as Error).message }, 500);
  }
});

router.put('/credit-cards/:id', requireOwner, async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();
  const { name, bankName, lastFour, limitInCents, billingDay, dueDay, color } = await c.req.json<any>();

  if (!name || !bankName)
    return c.json({ error: 'name e bankName são obrigatórios.' }, 400);

  const limit = parseInt(String(limitInCents), 10);
  if (isNaN(limit) || limit <= 0)
    return c.json({ error: 'Limite deve ser um valor positivo em centavos.' }, 400);

  const row = await db.first('SELECT id FROM credit_cards WHERE id = ?', [id]);
  if (!row) return c.json({ error: 'Cartão não encontrado.' }, 404);

  try {
    await db.exec(
      'UPDATE credit_cards SET name=?,bank_name=?,last_four=?,limit_in_cents=?,billing_day=?,due_day=?,color=? WHERE id=?',
      [name, bankName, lastFour ?? null, limit,
       parseInt(String(billingDay ?? 1), 10), parseInt(String(dueDay ?? 10), 10), color ?? '#6366F1', id],
    );
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'Falha ao atualizar cartão.', details: (e as Error).message }, 500);
  }
});

router.delete('/credit-cards/:id', requireOwner, async (c) => {
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

router.post('/invoices/:id/pay', requireOwner, async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();
  const { accountId } = await c.req.json<any>();
  if (!accountId) return c.json({ error: 'accountId obrigatório para pagamento.' }, 400);

  const inv = await db.first<DbInvoice>('SELECT * FROM invoices WHERE id = ?', [id]);
  if (!inv) return c.json({ error: 'Fatura não encontrada.' }, 404);

  const mapped = mapInvoice(inv);
  if (mapped.status === 'paid') return c.json({ error: 'Fatura já está paga.' }, 400);
  if (mapped.totalInCents <= 0) return c.json({ error: 'Fatura sem valor a pagar.' }, 400);

  const account = await db.first('SELECT id FROM accounts WHERE id = ?', [accountId]);
  if (!account) return c.json({ error: 'Conta de pagamento não encontrada.' }, 404);

  const paidAt = new Date().toISOString();
  await db.batch([
    { sql: "UPDATE invoices SET status = 'paid', paid_at = ? WHERE id = ?", params: [paidAt, id] },
    { sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents - ? WHERE id = ?', params: [mapped.totalInCents, accountId] },
  ]);
  return c.json({ success: true });
});

export default router;
