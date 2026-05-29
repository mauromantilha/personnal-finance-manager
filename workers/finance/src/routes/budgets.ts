import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { recalculateBudgets } from '../lib/helpers';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── Budgets ───────────────────────────────────────────────────────────────────
router.post('/budgets/update', async (c) => {
  const db = c.get('db');
  const { limitInCents, category } = await c.req.json<any>();
  const limit = parseInt(String(limitInCents), 10);
  if (isNaN(limit) || limit <= 0) return c.json({ error: 'Limite deve ser positivo em centavos.' }, 400);

  const existing = await db.first('SELECT id FROM budgets WHERE LOWER(category) = LOWER(?)', [category]);
  if (existing) {
    await db.exec('UPDATE budgets SET limit_in_cents = ? WHERE LOWER(category) = LOWER(?)', [limit, category]);
  } else {
    await db.exec('INSERT INTO budgets VALUES (?,?,?,0)', [`b-usr-${crypto.randomUUID()}`, category, limit]);
  }
  await recalculateBudgets(db);
  return c.json({ success: true });
});

router.delete('/budgets/:id', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();
  const row = await db.first('SELECT id FROM budgets WHERE id = ?', [id]);
  if (!row) return c.json({ error: 'Orçamento não encontrado.' }, 404);
  await db.exec('DELETE FROM budgets WHERE id = ?', [id]);
  return c.json({ success: true });
});

// ── Goals ─────────────────────────────────────────────────────────────────────
router.post('/goals', async (c) => {
  const db = c.get('db');
  const { name, targetInCents, targetDate, color, currentInCents } = await c.req.json<any>();
  if (!name || !targetInCents || parseInt(String(targetInCents), 10) <= 0 || !targetDate)
    return c.json({ error: 'Parâmetros inválidos para criação da meta.' }, 400);

  const id = `g-usr-${crypto.randomUUID()}`;
  await db.exec('INSERT INTO goals VALUES (?,?,?,?,?,?)',
    [id, name, parseInt(String(targetInCents), 10),
     currentInCents ? parseInt(String(currentInCents), 10) : 0,
     targetDate, color ?? '#6366F1']);
  return c.json({ id });
});

router.post('/goals/update', async (c) => {
  const db = c.get('db');
  const { id, amountToAdd } = await c.req.json<any>();
  const amount = parseInt(String(amountToAdd), 10);
  if (isNaN(amount) || amount <= 0) return c.json({ error: 'Valor deve ser positivo em centavos.' }, 400);

  const row = await db.first('SELECT id FROM goals WHERE id = ?', [id]);
  if (!row) return c.json({ error: 'Meta não encontrada.' }, 404);
  await db.exec('UPDATE goals SET current_in_cents = current_in_cents + ? WHERE id = ?', [amount, id]);
  return c.json({ success: true });
});

router.delete('/goals/:id', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();
  const row = await db.first('SELECT id FROM goals WHERE id = ?', [id]);
  if (!row) return c.json({ error: 'Meta não encontrada.' }, 404);
  await db.exec('DELETE FROM goals WHERE id = ?', [id]);
  return c.json({ success: true });
});

// ── Alerts ────────────────────────────────────────────────────────────────────
router.post('/alerts/read', async (c) => {
  const db = c.get('db');
  const { id } = await c.req.json<any>();
  await db.exec('UPDATE alerts SET is_read = 1 WHERE id = ?', [id]);
  return c.json({ success: true });
});

router.post('/alerts/read-all', async (c) => {
  const db = c.get('db');
  await db.exec('UPDATE alerts SET is_read = 1');
  return c.json({ success: true });
});

router.delete('/alerts/clear-read', async (c) => {
  const db = c.get('db');
  await db.exec('DELETE FROM alerts WHERE is_read = 1');
  return c.json({ success: true });
});

export default router;
