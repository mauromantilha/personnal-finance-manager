// Row → TypeScript mappers (snake_case DB ↔ camelCase TS)

export interface DbUser {
  id: string;
  name: string;
  email: string;
  role: string;
  member_id: string | null;
  is_active: number;
  lgpd_accepted_at: string | null;
  lgpd_policy_version: string | null;
  created_at: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
  memberId: string | null;
  isActive: boolean;
  lgpdAcceptedAt: string | null;
  lgpdPolicyVersion: string | null;
  createdAt: string;
}

export function mapUser(row: DbUser): User {
  return {
    id:                 row.id,
    name:               row.name,
    email:              row.email,
    role:               row.role as 'owner' | 'member',
    memberId:           row.member_id,
    isActive:           row.is_active === 1,
    lgpdAcceptedAt:     row.lgpd_accepted_at,
    lgpdPolicyVersion:  row.lgpd_policy_version,
    createdAt:          row.created_at,
  };
}

// ── Accounts ──────────────────────────────────────────────────────────────────
export interface DbAccount {
  id: string;
  name: string;
  type: string;
  bank_name: string;
  balance_in_cents: number;
  color: string;
  is_linked: number;
}

export interface Account {
  id: string;
  name: string;
  type: string;
  bankName: string;
  balanceInCents: number;
  color: string;
  isLinked: boolean;
}

export function mapAccount(row: DbAccount): Account {
  return {
    id:             row.id,
    name:           row.name,
    type:           row.type,
    bankName:       row.bank_name,
    balanceInCents: row.balance_in_cents,
    color:          row.color,
    isLinked:       row.is_linked === 1,
  };
}

// ── Transactions ──────────────────────────────────────────────────────────────
export interface DbTransaction {
  id: string;
  amount_in_cents: number;
  date: string;
  type: string;
  category: string;
  description: string;
  account_id: string;
  destination_account_id: string | null;
  is_synced: number;
  original_merchant_name: string | null;
  credit_card_id: string | null;
  invoice_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  installment_group_id: string | null;
  document_key: string | null;
  member_id: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  amountInCents: number;
  date: string;
  type: string;
  category: string;
  description: string;
  accountId: string;
  destinationAccountId: string | null;
  isSynced: boolean;
  originalMerchantName: string | null;
  creditCardId: string | null;
  invoiceId: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  installmentGroupId: string | null;
  documentKey: string | null;
  memberId: string | null;
  createdAt: string;
}

export function mapTransaction(row: DbTransaction): Transaction {
  return {
    id:                   row.id,
    amountInCents:        row.amount_in_cents,
    date:                 row.date,
    type:                 row.type,
    category:             row.category,
    description:          row.description,
    accountId:            row.account_id,
    destinationAccountId: row.destination_account_id,
    isSynced:             row.is_synced === 1,
    originalMerchantName: row.original_merchant_name,
    creditCardId:         row.credit_card_id,
    invoiceId:            row.invoice_id,
    installmentNumber:    row.installment_number,
    installmentTotal:     row.installment_total,
    installmentGroupId:   row.installment_group_id,
    documentKey:          row.document_key,
    memberId:             row.member_id,
    createdAt:            row.created_at,
  };
}
