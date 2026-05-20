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
  amountInCents: number; // Stored strictly as positive integer representing cents (positive for both ingress/egress, identified by 'type')
  date: string; // ISO 8601 YYYY-MM-DD
  type: TransactionType;
  category: string;
  description: string;
  accountId: string;
  destinationAccountId?: string; // For transfers
  isSynced: boolean; // True if loaded via Open Finance
  originalMerchantName?: string; // External original name before intelligent auto-categorization
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
