// Row → TypeScript mappers (snake_case DB ↔ camelCase TS)

// ── Users ─────────────────────────────────────────────────────────────────────
export interface DbUser {
  id: string; name: string; email: string; role: string;
  member_id: string | null; is_active: number;
  lgpd_accepted_at: string | null; lgpd_policy_version: string | null;
  created_at: string;
}
export interface User {
  id: string; name: string; email: string;
  role: 'owner' | 'member'; memberId: string | null; isActive: boolean;
  lgpdAcceptedAt: string | null; lgpdPolicyVersion: string | null;
  createdAt: string;
}
export function mapUser(r: DbUser): User {
  return {
    id: r.id, name: r.name, email: r.email,
    role: r.role as 'owner' | 'member', memberId: r.member_id,
    isActive: r.is_active === 1,
    lgpdAcceptedAt: r.lgpd_accepted_at, lgpdPolicyVersion: r.lgpd_policy_version,
    createdAt: r.created_at,
  };
}

// ── Accounts ──────────────────────────────────────────────────────────────────
export interface DbAccount {
  id: string; name: string; type: string; bank_name: string;
  balance_in_cents: number; color: string; is_linked: number;
}
export interface Account {
  id: string; name: string; type: string; bankName: string;
  balanceInCents: number; color: string; isLinked: boolean;
}
export function mapAccount(r: DbAccount): Account {
  return {
    id: r.id, name: r.name, type: r.type, bankName: r.bank_name,
    balanceInCents: r.balance_in_cents, color: r.color, isLinked: r.is_linked === 1,
  };
}

// ── Transactions ──────────────────────────────────────────────────────────────
export interface DbTransaction {
  id: string; amount_in_cents: number; date: string; type: string;
  category: string; description: string; account_id: string;
  destination_account_id: string | null; is_synced: number;
  original_merchant_name: string | null; credit_card_id: string | null;
  invoice_id: string | null; installment_number: number | null;
  installment_total: number | null; installment_group_id: string | null;
  document_key: string | null; member_id: string | null; created_at: string;
}
export interface Transaction {
  id: string; amountInCents: number; date: string; type: string;
  category: string; description: string; accountId: string;
  destinationAccountId: string | null; isSynced: boolean;
  originalMerchantName: string | null; creditCardId: string | null;
  invoiceId: string | null; installmentNumber: number | null;
  installmentTotal: number | null; installmentGroupId: string | null;
  documentKey: string | null; memberId: string | null; createdAt: string;
}
export function mapTransaction(r: DbTransaction): Transaction {
  return {
    id: r.id, amountInCents: r.amount_in_cents, date: r.date, type: r.type,
    category: r.category, description: r.description, accountId: r.account_id,
    destinationAccountId: r.destination_account_id,
    isSynced: r.is_synced === 1, originalMerchantName: r.original_merchant_name,
    creditCardId: r.credit_card_id, invoiceId: r.invoice_id,
    installmentNumber: r.installment_number, installmentTotal: r.installment_total,
    installmentGroupId: r.installment_group_id,
    documentKey: r.document_key, memberId: r.member_id, createdAt: r.created_at,
  };
}

// ── Categories ────────────────────────────────────────────────────────────────
export interface DbCategory {
  id: string; name: string; parent_id: string | null;
  icon: string; color: string; type: string;
}
export function mapCategory(r: DbCategory) {
  return { id: r.id, name: r.name, parentId: r.parent_id, icon: r.icon, color: r.color, type: r.type };
}

// ── Credit Cards ──────────────────────────────────────────────────────────────
export interface DbCreditCard {
  id: string; name: string; bank_name: string; last_four: string | null;
  limit_in_cents: number; billing_day: number; due_day: number;
  color: string; is_active: number;
}
export function mapCreditCard(r: DbCreditCard) {
  return {
    id: r.id, name: r.name, bankName: r.bank_name, lastFour: r.last_four,
    limitInCents: r.limit_in_cents, billingDay: r.billing_day, dueDay: r.due_day,
    color: r.color, isActive: r.is_active === 1,
  };
}

// ── Invoices ──────────────────────────────────────────────────────────────────
export interface DbInvoice {
  id: string; credit_card_id: string; month: string; total_in_cents: number;
  status: string; due_date: string | null; paid_at: string | null; created_at: string;
}
export function mapInvoice(r: DbInvoice) {
  return {
    id: r.id, creditCardId: r.credit_card_id, month: r.month,
    totalInCents: r.total_in_cents, status: r.status,
    dueDate: r.due_date, paidAt: r.paid_at, createdAt: r.created_at,
  };
}

// ── Recurrences ───────────────────────────────────────────────────────────────
export interface DbRecurrence {
  id: string; description: string; amount_in_cents: number;
  type: string; category: string; account_id: string | null;
  credit_card_id: string | null; frequency: string; day_of_month: number | null;
  start_date: string; end_date: string | null; last_generated_date: string | null;
  is_active: number; created_at: string;
}
export interface Recurrence {
  id: string; description: string; amountInCents: number; type: string;
  category: string; accountId: string | null; creditCardId: string | null;
  frequency: string; dayOfMonth: number | null; startDate: string;
  endDate: string | null; lastGeneratedDate: string | null;
  isActive: boolean; createdAt: string;
}
export function mapRecurrence(r: DbRecurrence): Recurrence {
  return {
    id: r.id, description: r.description, amountInCents: r.amount_in_cents,
    type: r.type, category: r.category,
    accountId: r.account_id, creditCardId: r.credit_card_id,
    frequency: r.frequency, dayOfMonth: r.day_of_month,
    startDate: r.start_date, endDate: r.end_date,
    lastGeneratedDate: r.last_generated_date,
    isActive: r.is_active === 1, createdAt: r.created_at,
  };
}

// ── Budgets ───────────────────────────────────────────────────────────────────
export function mapBudget(r: Record<string, unknown>) {
  return { id: r.id, category: r.category, limitInCents: r.limit_in_cents, spentInCents: r.spent_in_cents };
}

// ── Goals ─────────────────────────────────────────────────────────────────────
export function mapGoal(r: Record<string, unknown>) {
  return { id: r.id, name: r.name, targetInCents: r.target_in_cents, currentInCents: r.current_in_cents, targetDate: r.target_date, color: r.color };
}

// ── Alerts ────────────────────────────────────────────────────────────────────
export function mapAlert(r: Record<string, unknown>) {
  return { id: r.id, type: r.type, title: r.title, message: r.message, date: r.date, isRead: r.is_read === 1 };
}

// ── Connections ───────────────────────────────────────────────────────────────
export function mapConnection(r: Record<string, unknown>) {
  return { id: r.id, institutionName: r.institution_name, logo: r.logo, status: r.status, itemId: r.item_id ?? null, lastSyncedAt: r.last_synced_at ?? null };
}

// ── Family Members ────────────────────────────────────────────────────────────
export function mapFamilyMember(r: Record<string, unknown>) {
  return { id: r.id, name: r.name, avatarColor: r.avatar_color, createdAt: r.created_at };
}

// ── Investments ───────────────────────────────────────────────────────────────
export function mapInvestment(r: Record<string, unknown>) {
  return {
    id: r.id, name: r.name, ticker: r.ticker ?? null, assetClass: r.asset_class,
    institution: r.institution, investedInCents: r.invested_in_cents,
    currentValueInCents: r.current_value_in_cents, annualRate: r.annual_rate ?? null,
    startDate: r.start_date, maturityDate: r.maturity_date ?? null,
    accountId: r.account_id ?? null, notes: r.notes ?? null, createdAt: r.created_at,
  };
}

// ── Installment Groups ────────────────────────────────────────────────────────
export function mapInstallmentGroup(r: Record<string, unknown>, paidCount: number) {
  return {
    id: r.id, description: r.description, totalInCents: r.total_in_cents,
    installmentCount: r.installment_count, installmentAmountInCents: r.installment_amount_in_cents,
    category: r.category, accountId: r.account_id ?? null, creditCardId: r.credit_card_id ?? null,
    memberId: r.member_id ?? null, startDate: r.start_date, createdAt: r.created_at, paidCount,
  };
}

// ── Chat ──────────────────────────────────────────────────────────────────────
export function mapChat(r: Record<string, unknown>) {
  return { id: r.id, sender: r.sender, text: r.text, timestamp: r.timestamp };
}
