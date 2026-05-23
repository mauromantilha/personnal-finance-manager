/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FinancialAccount, Transaction, BankConnection, CategoryBudget, FinancialGoal, NotificationAlert } from './types';

export const INITIAL_ACCOUNTS: FinancialAccount[] = [
  {
    id: 'acc-1',
    name: 'Carteira Principal',
    type: 'CASH',
    bankName: 'Dinheiro',
    balanceInCents: 15420, // R$ 154,20
    color: '#EAB308', // Yellow
    isLinked: false,
  },
  {
    id: 'acc-2',
    name: 'Conta Itaú Personalité',
    type: 'CHECKING',
    bankName: 'Banco Itaú',
    balanceInCents: 452090, // R$ 4.520,90
    color: '#0284C7', // Sky Blue
    isLinked: true,
  },
  {
    id: 'acc-3',
    name: 'Poupança Inter',
    type: 'SAVINGS',
    bankName: 'Banco Inter',
    balanceInCents: 1850020, // R$ 18.500,20
    color: '#EA580C', // Orange
    isLinked: true,
  },
  {
    id: 'acc-4',
    name: 'XP Carteira Global',
    type: 'INVESTMENT',
    bankName: 'XP Investimentos',
    balanceInCents: 4210000, // R$ 42.100,00
    color: '#16A34A', // Green
    isLinked: true,
  }
];

export const INITIAL_CONNECTIONS: BankConnection[] = [
  {
    id: 'conn-itau',
    institutionName: 'Banco Itaú',
    logo: '🏦',
    status: 'CONNECTED',
    lastSyncedAt: '2026-05-19T10:00:00Z',
    itemId: 'plg_itau_98522',
  },
  {
    id: 'conn-inter',
    institutionName: 'Banco Inter',
    logo: '🍊',
    status: 'CONNECTED',
    lastSyncedAt: '2026-05-19T09:12:00Z',
    itemId: 'plg_inter_45fff',
  },
  {
    id: 'conn-xp',
    institutionName: 'XP Investimentos',
    logo: '📈',
    status: 'CONNECTED',
    lastSyncedAt: '2026-05-18T18:30:00Z',
    itemId: 'plg_xp_8811c',
  },
  {
    id: 'conn-bradesco',
    institutionName: 'Banco Bradesco',
    logo: '🔴',
    status: 'DISCONNECTED',
    itemId: 'plg_bradesco_22394',
  }
];

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-1',
    amountInCents: 650000, // R$ 6.500,00
    date: '2026-05-01',
    type: 'REC',
    category: 'Receita',
    description: 'Salário Mensal MKS Brasil',
    accountId: 'acc-2',
    isSynced: false
  },
  {
    id: 'tx-2',
    amountInCents: 180000, // R$ 1.800,00
    date: '2026-05-02',
    type: 'DES',
    category: 'Moradia',
    description: 'Aluguel Loft Paulista',
    accountId: 'acc-2',
    isSynced: true,
    originalMerchantName: 'IMOVEIS SAO PAULO S/A'
  },
  {
    id: 'tx-3',
    amountInCents: 38240, // R$ 382,40
    date: '2026-05-05',
    type: 'DES',
    category: 'Alimentação',
    description: 'Supermercado Pão de Açúcar',
    accountId: 'acc-2',
    isSynced: true,
    originalMerchantName: 'Pao de Acucar SP Lojas'
  },
  {
    id: 'tx-4',
    amountInCents: 4500, // R$ 45,00
    date: '2026-05-06',
    type: 'DES',
    category: 'Transporte',
    description: 'Uber Viagem Central',
    accountId: 'acc-2',
    isSynced: true,
    originalMerchantName: 'UBER RIDES BRASIL'
  },
  {
    id: 'tx-5',
    amountInCents: 12000, // R$ 120,00
    date: '2026-05-08',
    type: 'DES',
    category: 'Lazer',
    description: 'Ingresso Cinema Imax',
    accountId: 'acc-1',
    isSynced: false
  },
  {
    id: 'tx-6',
    amountInCents: 120000, // R$ 1.200,00
    date: '2026-05-10',
    type: 'TRANS',
    category: 'Reserva',
    description: 'Aporte Mensal Poupança',
    accountId: 'acc-2',
    destinationAccountId: 'acc-3',
    isSynced: false
  },
  {
    id: 'tx-7',
    amountInCents: 250000, // R$ 2.500,00
    date: '2026-05-12',
    type: 'TRANS',
    category: 'Investimentos',
    description: 'Aporte XP Ações',
    accountId: 'acc-3',
    destinationAccountId: 'acc-4',
    isSynced: false
  },
  {
    id: 'tx-8',
    amountInCents: 18990, // R$ 189,90
    date: '2026-05-13',
    type: 'DES',
    category: 'Saúde',
    description: 'Drogaria São Paulo Medicamentos',
    accountId: 'acc-2',
    isSynced: true,
    originalMerchantName: 'DROP SAO PAULO S/A'
  },
  {
    id: 'tx-9',
    amountInCents: 45000, // R$ 450,00
    date: '2026-05-14',
    type: 'DES',
    category: 'Educação',
    description: 'Livros de Tecnologia e Negócios',
    accountId: 'acc-2',
    isSynced: false
  },
  {
    id: 'tx-10',
    amountInCents: 24000, // R$ 240,00
    date: '2026-05-15',
    type: 'DES',
    category: 'Alimentação',
    description: 'Jantar Coco Bambu',
    accountId: 'acc-2',
    isSynced: true,
    originalMerchantName: 'COCO BAMBU SHOPPING'
  },
  {
    id: 'tx-11',
    amountInCents: 5290, // R$ 52,90
    date: '2026-05-17',
    type: 'DES',
    category: 'Lazer',
    description: 'Assinatura Mensal Netflix',
    accountId: 'acc-2',
    isSynced: true,
    originalMerchantName: 'NETFLIX BRASIL'
  },
  {
    id: 'tx-12',
    amountInCents: 8500, // R$ 85,00
    date: '2026-05-18',
    type: 'DES',
    category: 'Outros',
    description: 'Presente Amigo Secreto',
    accountId: 'acc-1',
    isSynced: false
  }
];

export const INITIAL_BUDGETS: CategoryBudget[] = [
  {
    id: 'b-1',
    category: 'Alimentação',
    limitInCents: 80000, // R$ 800,00
    spentInCents: 62240, // R$ 622,40
  },
  {
    id: 'b-2',
    category: 'Transporte',
    limitInCents: 30000, // R$ 300,00
    spentInCents: 4500, // R$ 45,00
  },
  {
    id: 'b-3',
    category: 'Moradia',
    limitInCents: 220000, // R$ 2.200,00
    spentInCents: 180000, // R$ 1.800,00
  },
  {
    id: 'b-4',
    category: 'Lazer',
    limitInCents: 50000, // R$ 500,00
    spentInCents: 17290, // R$ 172,90
  }
];

export const INITIAL_GOALS: FinancialGoal[] = [
  {
    id: 'g-1',
    name: 'Reserva de Emergência',
    targetInCents: 3000000, // R$ 30.000,00
    currentInCents: 1850000, // R$ 18.500,00
    targetDate: '2026-12-31',
    color: '#0284C7', // Sky Blue
  },
  {
    id: 'g-2',
    name: 'Viagem de Férias Japão',
    targetInCents: 2500000, // R$ 25.000,00
    currentInCents: 1000000, // R$ 10.000,00
    targetDate: '2027-05-15',
    color: '#EA580C', // Orange
  }
];

export const INITIAL_ALERTS: NotificationAlert[] = [
  {
    id: 'alt-1',
    title: 'Orçamento de Alimentação quase estourado',
    message: 'Você atingiu 77.8% do seu limite estipulado de R$ 800,00 para Alimentação.',
    type: 'WARNING',
    date: '2026-05-19T10:00:00Z',
    isRead: false
  },
  {
    id: 'alt-2',
    title: 'Integração de Sincronização Concluída',
    message: 'Seus dados do Banco Itaú e Inter foram sincronizados com sucesso via Pluggy Open Finance.',
    type: 'SUCCESS',
    date: '2026-05-19T09:12:00Z',
    isRead: false
  },
  {
    id: 'alt-3',
    title: 'Planejamento de Metas',
    message: 'Sua meta de Poupança subiu 5% desde o começo do mês. Continue firme!',
    type: 'INFO',
    date: '2026-05-18T18:30:00Z',
    isRead: true
  }
];
