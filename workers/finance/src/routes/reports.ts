import { Hono } from 'hono';
import type { Env, Variables } from '../index';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── GET /api/reports/monthly-summary ─────────────────────────────────────────
router.get('/reports/monthly-summary', async (c) => {
  const db     = c.get('db');
  const months = Math.min(parseInt(c.req.query('months') ?? '6', 10), 24);

  const monthKeys: string[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const monthData = await Promise.all(
    monthKeys.map(m =>
      db.query<{ type: string; total: number }>(
        "SELECT type, SUM(amount_in_cents) as total FROM transactions WHERE date LIKE ? AND type IN ('REC','DES') GROUP BY type",
        [`${m}%`],
      ),
    ),
  );

  const results = monthKeys.map((month, i) => {
    let income = 0, expense = 0;
    for (const row of monthData[i]) {
      if (row.type === 'REC') income  = row.total;
      if (row.type === 'DES') expense = row.total;
    }
    return { month, income, expense, balance: income - expense };
  });

  return c.json(results);
});

// ── GET /api/export/transactions.csv ─────────────────────────────────────────
router.get('/export/transactions.csv', async (c) => {
  const db        = c.get('db');
  const startDate = c.req.query('startDate');
  const endDate   = c.req.query('endDate');
  const type      = c.req.query('type');

  let sql = 'SELECT t.*, a.name as account_name FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id WHERE 1=1';
  const params: string[] = [];
  if (startDate) { sql += ' AND t.date >= ?'; params.push(startDate); }
  if (endDate)   { sql += ' AND t.date <= ?'; params.push(endDate); }
  if (type)      { sql += ' AND t.type = ?';  params.push(type); }
  sql += ' ORDER BY t.date DESC';

  const rows = await db.query<Record<string, unknown>>(sql, params);

  const header = 'Data,Tipo,Categoria,Descrição,Valor (R$),Conta\n';
  const lines  = rows.map(r =>
    [r.date, r.type, r.category, `"${String(r.description).replace(/"/g, '""')}"`,
     (Number(r.amount_in_cents) / 100).toFixed(2), r.account_name ?? ''].join(','),
  );

  return new Response(header + lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="transacoes.csv"',
    },
  });
});

export default router;
