/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  mfaEnabled: boolean;
  mfaPendingSetup: boolean;
  avatarUrl: string;
}

export type AccountType = 'CASH' | 'CHECKING' | 'SAVINGS' | 'INVESTMENT';

export interface FinancialAccount {
  id: string;
  name: string;
  type: AccountType;
  bankName: string;
  balanceInCents: number;
  color: string;
  isLinked: boolean;
}

export type TransactionType = 'REC' | 'DES' | 'TRANS';

export interface Transaction {
  id: string;
  amountInCents: number;
  date: string; // ISO 8601 YYYY-MM-DD
  type: TransactionType;
  category: string;
  description: string;
  accountId: string;
  destinationAccountId?: string;
  isSynced: boolean;
  originalMerchantName?: string;
  // Credit card + installments
  creditCardId?: string;
  invoiceId?: string;
  installmentNumber?: number;
  installmentTotal?: number;
  installmentGroupId?: string;
  documentKey?: string;
  memberId?: string;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  icon: string;
  color: string;
  type: 'income' | 'expense' | 'both';
  children?: Category[];
}

export interface CreditCard {
  id: string;
  name: string;
  bankName: string;
  lastFour: string | null;
  limitInCents: number;
  billingDay: number;
  dueDay: number;
  color: string;
  isActive: boolean;
}

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Recurrence {
  id: string;
  description: string;
  amountInCents: number;
  type: 'REC' | 'DES';
  category: string;
  accountId: string | null;
  creditCardId: string | null;
  frequency: RecurrenceFrequency;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  lastGeneratedDate: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Invoice {
  id: string;
  creditCardId: string;
  month: string; // 'YYYY-MM'
  totalInCents: number;
  status: 'open' | 'closed' | 'paid';
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface BankConnection {
  id: string;
  institutionName: string;
  logo: string;
  status: 'CONNECTED' | 'SYNCING' | 'ERROR' | 'DISCONNECTED';
  lastSyncedAt?: string;
  itemId?: string; // Belvo / Pluggy simulated identifier
}

export interface CategoryBudget {
  id: string;
  category: string;
  limitInCents: number;
  spentInCents: number;
}

export interface FinancialGoal {
  id: string;
  name: string;
  targetInCents: number;
  currentInCents: number;
  targetDate: string;
  color: string;
}

export interface NotificationAlert {
  id: string;
  title: string;
  message: string;
  type: 'WARNING' | 'INFO' | 'SUCCESS';
  date: string;
  isRead: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export interface FamilyMember {
  id: string;
  name: string;
  avatarColor: string;
  createdAt: string;
}

export interface InstallmentGroup {
  id: string;
  description: string;
  totalInCents: number;
  installmentCount: number;
  installmentAmountInCents: number;
  category: string;
  accountId: string | null;
  creditCardId: string | null;
  memberId: string | null;
  startDate: string;
  createdAt: string;
  paidCount: number;
}
