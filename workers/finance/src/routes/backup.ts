import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { r2Put } from '../lib/r2';
import { mapAccount, mapTransaction, mapBudget, mapGoal, mapAlert } from '../lib/mappers';
import { D1Stmt } from '../lib/d1';
import { recalculateBudgets } from '../lib/helpers';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── POST /api/backup — snapshot para R2 ──────────────────────────────────────
router.post('/backup', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({ error: 'Apenas o owner pode criar backups.' }, 403);

  const db     = c.get('db');
  const tenant = c.get('tenant');

  const [accounts, transactions, budgets, goals, alerts] = await Promise.all([
    db.query('SELECT * FROM accounts').then(r => r.map(mapAccount as any)),
    db.query('SELECT * FROM transactions ORDER BY date DESC').then(r => r.map(mapTransaction as any)),
    db.query('SELECT * FROM budgets').then(r => r.map(mapBudget)),
    db.query('SELECT * FROM goals').then(r => r.map(mapGoal)),
    db.query('SELECT * FROM alerts').then(r => r.map(mapAlert)),
  ]);

  const snapshot = { exportedAt: new Date().toISOString(), accounts, transactions, budgets, goals, alerts };
  const ts  = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `${tenant.r2Prefix}/backups/${ts}.json`;

  await r2Put(c.env.MKS_DOCUMENTS, key, JSON.stringify(snapshot, null, 2));
  return c.json({ success: true, key, records: { accounts: (accounts as any[]).length, transactions: (transactions as any[]).length } });
});

// ── POST /api/reset — apaga todos os dados (owner only) ───────────────────────
router.post('/reset', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({ error: 'Apenas o owner pode resetar os dados.' }, 403);

  const db = c.get('db');
  const stmts: D1Stmt[] = [
    { sql: 'DELETE FROM transactions' },
    { sql: 'DELETE FROM accounts' },
    { sql: 'DELETE FROM connections' },
    { sql: 'DELETE FROM budgets' },
    { sql: 'DELETE FROM goals' },
    { sql: 'DELETE FROM alerts' },
    { sql: 'DELETE FROM chat_history' },
    { sql: 'DELETE FROM credit_cards' },
    { sql: 'DELETE FROM invoices' },
    { sql: 'DELETE FROM recurrences' },
    { sql: 'DELETE FROM installment_groups' },
    { sql: 'DELETE FROM investments' },
    { sql: 'DELETE FROM debts' },
  ];

  await db.batch(stmts);
  await recalculateBudgets(db);
  return c.json({ success: true });
});

export default router;
