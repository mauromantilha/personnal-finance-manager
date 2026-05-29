import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { mapRecurrence } from '../lib/mappers';
import { processRecurrences, recalculateBudgets } from '../lib/helpers';

const VALID_TYPES = ['REC', 'DES'];
const VALID_FREQ  = ['daily', 'weekly', 'monthly', 'yearly'];

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.get('/recurrences', async (c) => {
  const db = c.get('db');
  const rows = await db.query('SELECT * FROM recurrences ORDER BY day_of_month ASC');
  return c.json(rows.map(mapRecurrence as any));
});

router.post('/recurrences', async (c) => {
  const db = c.get('db');
  const { description, amountInCents, type, category, accountId,
          creditCardId, frequency, dayOfMonth, startDate, endDate } = await c.req.json<any>();

  if (!description || !amountInCents || !type || !category || !frequency || !startDate)
    return c.json({ error: 'Campos obrigatórios: description, amountInCents, type, category, frequency, startDate.' }, 400);
  if (!VALID_TYPES.includes(type))
    return c.json({ error: 'Tipo inválido. Use REC ou DES.' }, 400);
  if (!VALID_FREQ.includes(frequency))
    return c.json({ error: 'Frequência inválida.' }, 400);

  const amount = parseInt(String(amountInCents), 10);
  if (isNaN(amount) || amount <= 0)
    return c.json({ error: 'Valor deve ser inteiro positivo em centavos.' }, 400);

  const id = `rec-usr-${crypto.randomUUID()}`;
  await db.exec(
    'INSERT INTO recurrences (id,description,amount_in_cents,type,category,account_id,credit_card_id,frequency,day_of_month,start_date,end_date,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)',
    [id, description, amount, type, category,
     accountId ?? null, creditCardId ?? null,
     frequency, dayOfMonth ?? null, startDate, endDate ?? null],
  );
  return c.json({ id }, 201);
});

router.put('/recurrences/:id', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();
  const { description, amountInCents, type, category, accountId,
          creditCardId, frequency, dayOfMonth, startDate, endDate, isActive } = await c.req.json<any>();

  const row = await db.first('SELECT id FROM recurrences WHERE id = ?', [id]);
  if (!row) return c.json({ error: 'Recorrência não encontrada.' }, 404);

  await db.exec(
    'UPDATE recurrences SET description=?,amount_in_cents=?,type=?,category=?,account_id=?,credit_card_id=?,frequency=?,day_of_month=?,start_date=?,end_date=?,is_active=? WHERE id=?',
    [description, parseInt(String(amountInCents), 10), type, category,
     accountId ?? null, creditCardId ?? null,
     frequency, dayOfMonth ?? null, startDate, endDate ?? null,
     isActive ? 1 : 0, id],
  );
  return c.json({ success: true });
});

router.delete('/recurrences/:id', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();
  await db.exec('UPDATE recurrences SET is_active = 0 WHERE id = ?', [id]);
  return c.json({ success: true });
});

router.post('/recurrences/process', async (c) => {
  const db = c.get('db');
  await processRecurrences(db);
  await recalculateBudgets(db);
  return c.json({ success: true });
});

export default router;
