import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { r2Put, r2Delete } from '../lib/r2';
import { mapAccount, mapTransaction, mapBudget, mapGoal, mapAlert } from '../lib/mappers';
import { D1Stmt } from '../lib/d1';
import { recalculateBudgets } from '../lib/helpers';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Seed mínimo de categorias após reset (espelha 0003 — pais principais). */
const CATEGORY_SEED: D1Stmt[] = [
  { sql: "INSERT OR IGNORE INTO categories VALUES ('cat-alimentacao','Alimentação',NULL,'🍽️','#EA580C','expense')" },
  { sql: "INSERT OR IGNORE INTO categories VALUES ('cat-transporte','Transporte',NULL,'🚗','#0284C7','expense')" },
  { sql: "INSERT OR IGNORE INTO categories VALUES ('cat-moradia','Moradia',NULL,'🏠','#7C3AED','expense')" },
  { sql: "INSERT OR IGNORE INTO categories VALUES ('cat-saude','Saúde',NULL,'❤️','#DC2626','expense')" },
  { sql: "INSERT OR IGNORE INTO categories VALUES ('cat-educacao','Educação',NULL,'📚','#0891B2','expense')" },
  { sql: "INSERT OR IGNORE INTO categories VALUES ('cat-lazer','Lazer',NULL,'🎮','#16A34A','expense')" },
  { sql: "INSERT OR IGNORE INTO categories VALUES ('cat-vestuario','Vestuário',NULL,'👕','#DB2777','expense')" },
  { sql: "INSERT OR IGNORE INTO categories VALUES ('cat-investimentos','Investimentos',NULL,'📈','#059669','both')" },
  { sql: "INSERT OR IGNORE INTO categories VALUES ('cat-receita','Receita',NULL,'💰','#EAB308','income')" },
  { sql: "INSERT OR IGNORE INTO categories VALUES ('cat-outros','Outros',NULL,'📦','#6B7280','both')" },
];

async function wipeR2Prefix(bucket: R2Bucket, prefix: string): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix: `${prefix}/`, cursor, limit: 500 });
    const keys = listed.objects.map(o => o.key);
    if (keys.length) {
      await Promise.all(keys.map(k => r2Delete(bucket, k)));
      deleted += keys.length;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return deleted;
}

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

// ── POST /api/reset — apaga dados financeiros (mantém users/lgpd) ─────────────
router.post('/reset', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({ error: 'Apenas o owner pode resetar os dados.' }, 403);

  const db     = c.get('db');
  const tenant = c.get('tenant');

  const stmts: D1Stmt[] = [
    { sql: 'DELETE FROM transactions' },
    { sql: 'DELETE FROM invoices' },
    { sql: 'DELETE FROM credit_cards' },
    { sql: 'DELETE FROM accounts' },
    { sql: 'DELETE FROM connections' },
    { sql: 'DELETE FROM budgets' },
    { sql: 'DELETE FROM goals' },
    { sql: 'DELETE FROM alerts' },
    { sql: 'DELETE FROM chat_history' },
    { sql: 'DELETE FROM recurrences' },
    { sql: 'DELETE FROM installment_groups' },
    { sql: 'DELETE FROM investments' },
    { sql: 'DELETE FROM debts' },
    { sql: 'DELETE FROM family_members' },
    { sql: 'DELETE FROM categories' },
    { sql: 'DELETE FROM invites' },
    // users + lgpd_aceites preservados de propósito
  ];

  await db.batch(stmts);
  await db.batch(CATEGORY_SEED);
  await recalculateBudgets(db);

  let r2Deleted = 0;
  try {
    r2Deleted = await wipeR2Prefix(c.env.MKS_DOCUMENTS, tenant.r2Prefix);
  } catch (e) {
    console.error('[reset] R2 wipe:', (e as Error).message);
  }

  return c.json({ success: true, r2Deleted });
});

export default router;
