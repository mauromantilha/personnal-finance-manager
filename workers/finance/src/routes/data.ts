import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import {
  mapAccount, mapTransaction, mapCategory, mapCreditCard, mapInvoice,
  mapRecurrence, mapBudget, mapGoal, mapAlert, mapConnection, mapFamilyMember,
  mapInstallmentGroup, mapInvestment, mapChat,
} from '../lib/mappers';
import { processRecurrences, recalculateBudgets, generateProactiveAlerts } from '../lib/helpers';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── GET /api/data — snapshot completo para o frontend ────────────────────────
router.get('/data', async (c) => {
  const db = c.get('db');

  await processRecurrences(db);
  await recalculateBudgets(db);
  await generateProactiveAlerts(db);

  const [
    accounts, connections, transactions, budgets, goals, alerts, chatHistory,
    categories, creditCards, invoices, recurrences, familyMembers,
    igRows, igCounts, investments,
  ] = await Promise.all([
    db.query('SELECT * FROM accounts').then(r => r.map(mapAccount as any)),
    db.query('SELECT * FROM connections').then(r => r.map(mapConnection)),
    db.query('SELECT * FROM transactions ORDER BY date DESC, created_at DESC').then(r => r.map(mapTransaction as any)),
    db.query('SELECT * FROM budgets').then(r => r.map(mapBudget)),
    db.query('SELECT * FROM goals').then(r => r.map(mapGoal)),
    db.query('SELECT * FROM alerts ORDER BY date DESC').then(r => r.map(mapAlert)),
    db.query('SELECT * FROM chat_history ORDER BY rowid ASC').then(r => r.map(mapChat)),
    db.query('SELECT * FROM categories ORDER BY parent_id ASC NULLS FIRST, name ASC').then(r => r.map(mapCategory as any)),
    db.query("SELECT * FROM credit_cards WHERE is_active = 1").then(r => r.map(mapCreditCard as any)),
    db.query('SELECT * FROM invoices ORDER BY month DESC').then(r => r.map(mapInvoice as any)),
    db.query('SELECT * FROM recurrences WHERE is_active = 1 ORDER BY day_of_month ASC').then(r => r.map(mapRecurrence as any)),
    db.query('SELECT * FROM family_members ORDER BY created_at ASC').then(r => r.map(mapFamilyMember)),
    db.query('SELECT * FROM installment_groups ORDER BY start_date DESC'),
    db.query<{ installment_group_id: string; cnt: number }>(
      "SELECT installment_group_id, COUNT(*) as cnt FROM transactions WHERE installment_group_id IS NOT NULL AND date <= date('now') GROUP BY installment_group_id",
    ),
    db.query('SELECT * FROM investments ORDER BY start_date DESC').then(r => r.map(mapInvestment)),
  ]);

  const paidMap = Object.fromEntries(igCounts.map(r => [r.installment_group_id, r.cnt]));
  const installmentGroups = igRows.map(r => mapInstallmentGroup(r, paidMap[(r as any).id] ?? 0));

  return c.json({ accounts, connections, transactions, budgets, goals, alerts, chatHistory, categories, creditCards, invoices, recurrences, familyMembers, installmentGroups, investments });
});

export default router;
