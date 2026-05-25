import { D1Client, D1Stmt } from './d1';
import { mapBudget, mapRecurrence, DbRecurrence, Recurrence } from './mappers';

export function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Recalculate budgets spent_in_cents from current month transactions ────────
export async function recalculateBudgets(db: D1Client): Promise<void> {
  await db.exec(
    `UPDATE budgets
     SET spent_in_cents = (
       SELECT COALESCE(SUM(t.amount_in_cents), 0)
       FROM transactions t
       WHERE t.type = 'DES'
         AND LOWER(t.category) = LOWER(budgets.category)
         AND t.date LIKE ?
     )`,
    [`${getCurrentMonth()}%`],
  );
}

// ── Raise alerts when a new expense crosses 80% / 100% budget threshold ───────
export async function checkBudgetThresholds(
  db: D1Client,
  category: string,
  newAmountCents: number,
): Promise<void> {
  const row = await db.first<Record<string, number>>(
    'SELECT limit_in_cents, spent_in_cents FROM budgets WHERE LOWER(category) = LOWER(?)',
    [category],
  );
  if (!row) return;

  const spent  = row.spent_in_cents as number;
  const limit  = row.limit_in_cents as number;
  if (limit <= 0) return;

  const ratioBefore = (spent - newAmountCents) / limit;
  const ratioAfter  = spent / limit;
  const pct         = Math.round(ratioAfter * 100);
  const limitFmt    = (limit / 100).toFixed(2);

  if (ratioAfter >= 1.0 && ratioBefore < 1.0) {
    await db.exec(
      'INSERT INTO alerts VALUES (?,?,?,?,?,?)',
      [`alert-ovr-${Date.now()}`, 'WARNING',
        `Orçamento Estourado: ${category}`,
        `Você ultrapassou 100% em ${category}. Gasto: R$ ${(spent / 100).toFixed(2)} de R$ ${limitFmt}.`,
        new Date().toISOString(), 0],
    );
  } else if (ratioAfter >= 0.8 && ratioBefore < 0.8) {
    await db.exec(
      'INSERT INTO alerts VALUES (?,?,?,?,?,?)',
      [`alert-warn-${Date.now()}`, 'WARNING',
        `Alerta de Gastos: ${category}`,
        `Você atingiu ${pct}% do limite de ${category}. Teto: R$ ${limitFmt}.`,
        new Date().toISOString(), 0],
    );
  }
}

// ── Recurrence engine ─────────────────────────────────────────────────────────
function nextOccurrence(rec: Recurrence, after: Date): Date | null {
  const d = new Date(after);
  switch (rec.frequency) {
    case 'daily':   d.setDate(d.getDate() + 1); break;
    case 'weekly':  d.setDate(d.getDate() + 7); break;
    case 'monthly': {
      d.setMonth(d.getMonth() + 1);
      if (rec.dayOfMonth) {
        const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(rec.dayOfMonth, maxDay));
      }
      break;
    }
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
  }
  if (rec.endDate && d > new Date(rec.endDate)) return null;
  return d;
}

export async function processRecurrences(db: D1Client): Promise<void> {
  const rows = await db.query<DbRecurrence>('SELECT * FROM recurrences WHERE is_active = 1');
  if (!rows.length) return;

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const stmts: D1Stmt[] = [];

  for (const row of rows) {
    const rec = mapRecurrence(row);
    const startDate = new Date(rec.startDate);
    if (startDate > today) continue;

    let cursor = rec.lastGeneratedDate
      ? new Date(rec.lastGeneratedDate)
      : (() => { const d = new Date(startDate); d.setDate(d.getDate() - 1); return d; })();
    cursor.setHours(0, 0, 0, 0);

    let generated = 0;
    while (generated < 12) {
      const next = nextOccurrence(rec, cursor);
      if (!next || next > today) break;

      const txDate = next.toISOString().split('T')[0];
      const txId   = `tx-rec-${rec.id}-${txDate.replace(/-/g, '')}`;

      const exists = await db.first('SELECT id FROM transactions WHERE id = ?', [txId]);
      if (!exists) {
        stmts.push({
          sql: 'INSERT INTO transactions (id,amount_in_cents,date,type,category,description,account_id,destination_account_id,is_synced) VALUES (?,?,?,?,?,?,?,NULL,0)',
          params: [txId, rec.amountInCents, txDate, rec.type, rec.category, rec.description, rec.accountId],
        });
        if (rec.accountId) {
          if (rec.type === 'DES') stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents - ? WHERE id = ?', params: [rec.amountInCents, rec.accountId] });
          else if (rec.type === 'REC') stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents + ? WHERE id = ?', params: [rec.amountInCents, rec.accountId] });
        }
      }
      stmts.push({ sql: 'UPDATE recurrences SET last_generated_date = ? WHERE id = ?', params: [txDate, rec.id] });
      cursor = next;
      generated++;
    }
  }

  if (stmts.length) {
    await db.batch(stmts);
    await recalculateBudgets(db);
  }
}

// ── Proactive alerts: invoice due, low balance ────────────────────────────────
export async function generateProactiveAlerts(db: D1Client): Promise<void> {
  const now    = new Date();
  const YYYYMM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Invoices due in the next 5 days
  const dueDate5 = new Date(now);
  dueDate5.setDate(now.getDate() + 5);

  const invoices = await db.query<Record<string, string>>(
    `SELECT i.id, i.total_in_cents, i.due_date, c.name as card_name
     FROM invoices i JOIN credit_cards c ON c.id = i.credit_card_id
     WHERE i.status = 'open' AND i.due_date <= ? AND i.total_in_cents > 0`,
    [dueDate5.toISOString().split('T')[0]],
  );

  for (const inv of invoices) {
    const alertId = `alert-inv-${YYYYMM}-${inv.id}`;
    const existing = await db.first('SELECT id FROM alerts WHERE id = ?', [alertId]);
    if (!existing) {
      await db.exec(
        'INSERT INTO alerts VALUES (?,?,?,?,?,?)',
        [alertId, 'INFO',
          `Fatura próxima: ${inv.card_name}`,
          `Fatura de R$ ${(Number(inv.total_in_cents) / 100).toFixed(2)} vence em ${inv.due_date}.`,
          now.toISOString(), 0],
      );
    }
  }

  // Accounts with negative balance
  const negAccounts = await db.query<Record<string, string | number>>(
    'SELECT id, name, balance_in_cents FROM accounts WHERE balance_in_cents < 0',
  );
  for (const acc of negAccounts) {
    const alertId = `alert-neg-${YYYYMM}-${acc.id}`;
    const existing = await db.first('SELECT id FROM alerts WHERE id = ?', [alertId]);
    if (!existing) {
      await db.exec(
        'INSERT INTO alerts VALUES (?,?,?,?,?,?)',
        [alertId, 'WARNING',
          `Saldo Negativo: ${acc.name}`,
          `A conta "${acc.name}" está com saldo negativo de R$ ${(Number(acc.balance_in_cents) / 100).toFixed(2)}.`,
          now.toISOString(), 0],
      );
    }
  }
}
