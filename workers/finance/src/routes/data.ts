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

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── GET /api/data — snapshot completo para o frontend ────────────────────────
// Manutenção pesada (gerar recorrências vencidas + alertas proativos) roda no
// máximo 1×/hora por família. Ambas são idempotentes e deduplicam por dia/mês,
// então rodá-las a cada refresh só gera round-trips redundantes ao D1. O gate
// usa um marcador em KV com TTL. `recalculateBudgets` NÃO é gateado: é um único
// UPDATE barato e reflete gastos imediatos.
const MAINT_TTL_SECONDS = 3600;

router.get('/data', async (c) => {
  const db   = c.get('db');
  const user = c.get('user');

  // Auto-heal schema em tenants legados (colunas 0015+, tabelas debts/cards)
  try {
    await ensureTenantSchema(db);
  } catch (e) {
    console.error('[ensureTenantSchema]', (e as Error).message);
  }

  const maintKey = `maint:${c.get('familyId')}`;
  const ranRecently = await c.env.MKS_CACHE.get(maintKey);
  if (!ranRecently) {
    await processRecurrences(db);
    await generateProactiveAlerts(db);
    // best-effort: se o KV falhar, na pior hipótese a manutenção roda de novo
    c.executionCtx.waitUntil(
      c.env.MKS_CACHE.put(maintKey, new Date().toISOString(), { expirationTtl: MAINT_TTL_SECONDS }),
    );
  }
  await recalculateBudgets(db);

  // Membros individuais veem apenas suas próprias transações
  const isMember = user.role !== 'owner';
  const txSql = isMember
    ? 'SELECT * FROM transactions WHERE member_id = ? ORDER BY date DESC, created_at DESC'
    : 'SELECT * FROM transactions ORDER BY date DESC, created_at DESC';
  const txParams: D1Param[] = isMember ? [user.memberId ?? ''] : [];

  const [
    accounts, transactions, budgets, goals, alerts, chatHistory,
    categories, creditCards, invoices, recurrences, familyMembers,
    igRows, igCounts, investments,
  ] = await Promise.all([
    db.query('SELECT * FROM accounts').then(r => r.map(mapAccount as any)),
    db.query(txSql, txParams).then(r => r.map(mapTransaction as any)),
    db.query('SELECT * FROM budgets').then(r => r.map(mapBudget)),
    db.query('SELECT * FROM goals').then(r => r.map(mapGoal)),
    db.query('SELECT * FROM alerts ORDER BY date DESC').then(r => r.map(mapAlert)),
    db.query('SELECT * FROM (SELECT * FROM chat_history ORDER BY rowid DESC LIMIT 200) ORDER BY rowid ASC').then(r => r.map(mapChat)),
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
  ]);

  const paidMap = Object.fromEntries(igCounts.map(r => [r.installment_group_id, r.cnt]));
  const installmentGroups = igRows.map(r => mapInstallmentGroup(r, paidMap[(r as any).id] ?? 0));

  return c.json({ accounts, transactions, budgets, goals, alerts, chatHistory, categories, creditCards, invoices, recurrences, familyMembers, installmentGroups, investments });
});

export default router;
