import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { mapInvestment } from '../lib/mappers';

const VALID_CLASSES = ['fixed_income', 'stocks', 'fii', 'crypto', 'international', 'other'];
const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.get('/investments', async (c) => {
  const db = c.get('db');
  const rows = await db.query('SELECT * FROM investments ORDER BY start_date DESC');
  return c.json(rows.map(mapInvestment));
});

router.post('/investments', async (c) => {
  const db = c.get('db');
  const { name, ticker, assetClass, institution, investedInCents,
          currentValueInCents, annualRate, startDate, maturityDate, accountId, notes } = await c.req.json<any>();

  if (!name || !institution || !startDate)
    return c.json({ error: 'name, institution e startDate são obrigatórios.' }, 400);

  const invested = parseInt(String(investedInCents ?? 0), 10);
  const current  = parseInt(String(currentValueInCents ?? invested), 10);
  const cls      = VALID_CLASSES.includes(assetClass) ? assetClass : 'other';
  const id       = `inv-${Date.now()}`;

  await db.exec(
    'INSERT INTO investments (id,name,ticker,asset_class,institution,invested_in_cents,current_value_in_cents,annual_rate,start_date,maturity_date,account_id,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [id, String(name).trim(), ticker?.trim() ?? null, cls, String(institution).trim(),
     invested, current, annualRate ?? null,
     startDate, maturityDate ?? null, accountId ?? null, notes?.trim() ?? null],
  );
  return c.json({ id }, 201);
});

router.put('/investments/:id', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();
  const { name, ticker, institution, currentValueInCents, annualRate, maturityDate, notes } = await c.req.json<any>();

  const row = await db.first('SELECT id FROM investments WHERE id = ?', [id]);
  if (!row) return c.json({ error: 'Investimento não encontrado.' }, 404);

  await db.exec(
    `UPDATE investments SET
       name                 = COALESCE(?, name),
       ticker               = COALESCE(?, ticker),
       institution          = COALESCE(?, institution),
       current_value_in_cents = COALESCE(?, current_value_in_cents),
       annual_rate          = COALESCE(?, annual_rate),
       maturity_date        = COALESCE(?, maturity_date),
       notes                = COALESCE(?, notes)
     WHERE id = ?`,
    [name?.trim() ?? null, ticker?.trim() ?? null, institution?.trim() ?? null,
     currentValueInCents !== undefined ? parseInt(String(currentValueInCents), 10) : null,
     annualRate ?? null, maturityDate ?? null, notes?.trim() ?? null, id],
  );
  return c.json({ success: true });
});

router.delete('/investments/:id', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();
  const row = await db.first('SELECT id FROM investments WHERE id = ?', [id]);
  if (!row) return c.json({ error: 'Investimento não encontrado.' }, 404);
  await db.exec('DELETE FROM investments WHERE id = ?', [id]);
  return c.json({ success: true });
});

export default router;
