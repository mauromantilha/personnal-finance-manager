import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import {
  mapAccount, mapTransaction, mapCategory, mapCreditCard, mapInvoice,
  mapRecurrence, mapBudget, mapGoal, mapAlert, mapFamilyMember,
  mapInstallmentGroup, mapInvestment, mapChat,
} from '../lib/mappers';
import { processRecurrences, recalculateBudgets, generateProactiveAlerts } from '../lib/helpers';
import { ensureTenantSchema } from '../lib/ensure-schema';
import type { D1Param } from '../lib/d1';
import { isOwner } from '../lib/authz';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

const MAINT_TTL_SECONDS = 3600;
/** Janela padrão de transações no snapshot (meses). */
const DEFAULT_TX_MONTHS = 24;
const MAX_TX_MONTHS = 120;

function monthsAgoIso(months: number): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

router.get('/data', async (c) => {
  const db   = c.get('db');
  const user = c.get('user');
  const owner = isOwner(user);

  // Auto-heal schema em tenants legados (colunas 0015+, tabelas debts/cards)
  try {
    await ensureTenantSchema(db);
  } catch (e) {
    console.error('[ensureTenantSchema]', (e as Error).message);
  }

  const all = c.req.query('all') === '1';
  let months = DEFAULT_TX_MONTHS;
  const monthsRaw = c.req.query('months');
  if (monthsRaw) {
    const n = parseInt(monthsRaw, 10);
    if (Number.isFinite(n) && n >= 1 && n <= MAX_TX_MONTHS) months = n;
  }
  const fromDate = all ? null : monthsAgoIso(months);

  if (owner) {
    const maintKey = `maint:${c.get('familyId')}`;
    const ranRecently = await c.env.MKS_CACHE.get(maintKey);
    if (!ranRecently) {
      await processRecurrences(db);
      await generateProactiveAlerts(db);
      c.executionCtx.waitUntil(
        c.env.MKS_CACHE.put(maintKey, new Date().toISOString(), { expirationTtl: MAINT_TTL_SECONDS }),
      );
    }
  }
  await recalculateBudgets(db);

  let txSql: string;
  let txParams: D1Param[];
  if (owner) {
    if (fromDate) {
      txSql = 'SELECT * FROM transactions WHERE date >= ? ORDER BY date DESC, created_at DESC';
      txParams = [fromDate];
    } else {
      txSql = 'SELECT * FROM transactions ORDER BY date DESC, created_at DESC';
      txParams = [];
    }
  } else {
    if (fromDate) {
      txSql = 'SELECT * FROM transactions WHERE member_id = ? AND date >= ? ORDER BY date DESC, created_at DESC';
      txParams = [user.memberId ?? '', fromDate];
    } else {
      txSql = 'SELECT * FROM transactions WHERE member_id = ? ORDER BY date DESC, created_at DESC';
      txParams = [user.memberId ?? ''];
    }
  }

  const olderExistsPromise = fromDate
    ? (owner
        ? db.first<{ c: number }>('SELECT 1 AS c FROM transactions WHERE date < ? LIMIT 1', [fromDate])
        : db.first<{ c: number }>('SELECT 1 AS c FROM transactions WHERE member_id = ? AND date < ? LIMIT 1', [user.memberId ?? '', fromDate]))
    : Promise.resolve(null);

  const [
    accounts, transactions, budgets, goals, alerts, chatHistory,
    categories, creditCards, invoices, recurrences, familyMembers,
    igRows, igCounts, investments, olderRow,
  ] = await Promise.all([
    db.query('SELECT * FROM accounts').then(r => r.map(mapAccount as any)),
    db.query(txSql, txParams).then(r => r.map(mapTransaction as any)),
    db.query('SELECT * FROM budgets').then(r => r.map(mapBudget)),
    db.query('SELECT * FROM goals').then(r => r.map(mapGoal)),
    db.query('SELECT * FROM alerts ORDER BY date DESC').then(r => r.map(mapAlert)),
    owner
      ? db.query('SELECT * FROM (SELECT * FROM chat_history ORDER BY rowid DESC LIMIT 200) ORDER BY rowid ASC').then(r => r.map(mapChat))
      : Promise.resolve([]),
    db.query('SELECT * FROM categories ORDER BY (parent_id IS NOT NULL), parent_id, name').then(r => r.map(mapCategory as any)),
    db.query("SELECT * FROM credit_cards WHERE is_active = 1").then(r => r.map(mapCreditCard as any)),
    db.query('SELECT * FROM invoices ORDER BY month DESC').then(r => r.map(mapInvoice as any)),
    db.query('SELECT * FROM recurrences WHERE is_active = 1 ORDER BY day_of_month ASC').then(r => r.map(mapRecurrence as any)),
    db.query('SELECT * FROM family_members ORDER BY created_at ASC').then(r => r.map(mapFamilyMember)),
    db.query('SELECT * FROM installment_groups ORDER BY start_date DESC'),
    db.query<{ installment_group_id: string; cnt: number }>(
      "SELECT installment_group_id, COUNT(*) as cnt FROM transactions WHERE installment_group_id IS NOT NULL AND date <= date('now') GROUP BY installment_group_id",
    ),
    db.query('SELECT * FROM investments ORDER BY start_date DESC').then(r => r.map(mapInvestment)),
    olderExistsPromise,
  ]);

  const paidMap = Object.fromEntries(igCounts.map(r => [r.installment_group_id, r.cnt]));
  const installmentGroups = igRows.map(r => mapInstallmentGroup(r, paidMap[(r as any).id] ?? 0));

  return c.json({
    accounts,
    transactions,
    budgets,
    goals,
    alerts,
    chatHistory,
    categories,
    creditCards,
    invoices,
    recurrences,
    familyMembers,
    installmentGroups,
    investments,
    meta: {
      transactionsWindow: all
        ? { all: true as const, truncated: false }
        : {
            all: false as const,
            from: fromDate,
            months,
            truncated: !!olderRow,
          },
    },
  });
});

export default router;
