/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FinancialAccount, Transaction, CategoryBudget, FinancialGoal, NotificationAlert, Category, CreditCard, Invoice, Recurrence } from './types';

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
  },
  {
    id: 'b-5',
    category: 'Saúde',
    limitInCents: 40000, // R$ 400,00
    spentInCents: 18990, // R$ 189,90
  },
  {
    id: 'b-6',
    category: 'Educação',
    limitInCents: 60000, // R$ 600,00
    spentInCents: 45000, // R$ 450,00
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

export const INITIAL_CATEGORIES: Category[] = [
  { id: 'cat-alimentacao',   name: 'Alimentação',   parentId: null,              icon: '🍽️', color: '#EA580C', type: 'expense' },
  { id: 'cat-transporte',    name: 'Transporte',    parentId: null,              icon: '🚗',  color: '#0284C7', type: 'expense' },
  { id: 'cat-moradia',       name: 'Moradia',       parentId: null,              icon: '🏠',  color: '#7C3AED', type: 'expense' },
  { id: 'cat-saude',         name: 'Saúde',         parentId: null,              icon: '❤️', color: '#DC2626', type: 'expense' },
  { id: 'cat-educacao',      name: 'Educação',      parentId: null,              icon: '📚',  color: '#0891B2', type: 'expense' },
  { id: 'cat-lazer',         name: 'Lazer',         parentId: null,              icon: '🎮',  color: '#16A34A', type: 'expense' },
  { id: 'cat-vestuario',     name: 'Vestuário',     parentId: null,              icon: '👕',  color: '#DB2777', type: 'expense' },
  { id: 'cat-investimentos', name: 'Investimentos', parentId: null,              icon: '📈',  color: '#059669', type: 'both' },
  { id: 'cat-receita',       name: 'Receita',       parentId: null,              icon: '💰',  color: '#EAB308', type: 'income' },
  { id: 'cat-outros',        name: 'Outros',        parentId: null,              icon: '📦',  color: '#6B7280', type: 'both' },
  { id: 'cat-supermercado',  name: 'Supermercado',  parentId: 'cat-alimentacao', icon: '🛒',  color: '#EA580C', type: 'expense' },
  { id: 'cat-restaurante',   name: 'Restaurante',   parentId: 'cat-alimentacao', icon: '🍴',  color: '#F97316', type: 'expense' },
  { id: 'cat-delivery',      name: 'Delivery',      parentId: 'cat-alimentacao', icon: '🛵',  color: '#FB923C', type: 'expense' },
  { id: 'cat-uber',          name: 'Uber/99',       parentId: 'cat-transporte',  icon: '📱',  color: '#0284C7', type: 'expense' },
  { id: 'cat-combustivel',   name: 'Combustível',   parentId: 'cat-transporte',  icon: '⛽',  color: '#0369A1', type: 'expense' },
  { id: 'cat-aluguel',       name: 'Aluguel',       parentId: 'cat-moradia',     icon: '🔑',  color: '#7C3AED', type: 'expense' },
  { id: 'cat-farmacia',      name: 'Farmácia',      parentId: 'cat-saude',       icon: '💊',  color: '#DC2626', type: 'expense' },
  { id: 'cat-streaming',     name: 'Streaming',     parentId: 'cat-lazer',       icon: '📺',  color: '#16A34A', type: 'expense' },
  { id: 'cat-viagem',        name: 'Viagem',        parentId: 'cat-lazer',       icon: '✈️', color: '#15803D', type: 'expense' },
  { id: 'cat-salario',       name: 'Salário',       parentId: 'cat-receita',     icon: '💼',  color: '#EAB308', type: 'income' },
  { id: 'cat-aporte',        name: 'Aporte',        parentId: 'cat-investimentos',icon: '💸', color: '#059669', type: 'expense' },
];

export const INITIAL_CREDIT_CARDS: CreditCard[] = [
  { id: 'cc-1', name: 'Nubank Ultravioleta', bankName: 'Nubank',     lastFour: '4531', limitInCents: 1500000, billingDay: 12, dueDay: 19, color: '#8B5CF6', isActive: true },
  { id: 'cc-2', name: 'Itaú Personnalité',   bankName: 'Banco Itaú', lastFour: '8872', limitInCents: 2000000, billingDay: 20, dueDay: 27, color: '#0284C7', isActive: true },
];

export const INITIAL_INVOICES: Invoice[] = [
  { id: 'inv-cc1-2605', creditCardId: 'cc-1', month: '2026-05', totalInCents: 89740,  status: 'open', dueDate: '2026-06-19', paidAt: null, createdAt: '2026-05-01T00:00:00Z' },
  { id: 'inv-cc2-2605', creditCardId: 'cc-2', month: '2026-05', totalInCents: 245300, status: 'open', dueDate: '2026-06-27', paidAt: null, createdAt: '2026-05-01T00:00:00Z' },
  { id: 'inv-cc1-2604', creditCardId: 'cc-1', month: '2026-04', totalInCents: 112500, status: 'paid', dueDate: '2026-05-19', paidAt: '2026-05-19T10:30:00Z', createdAt: '2026-04-01T00:00:00Z' },
];

export const INITIAL_RECURRENCES: Recurrence[] = [
  { id: 'rec-1', description: 'Salário Mensal MKS Brasil', amountInCents: 650000, type: 'REC', category: 'Receita',       accountId: 'acc-2', creditCardId: null, frequency: 'monthly', dayOfMonth: 1,  startDate: '2026-01-01', endDate: null, lastGeneratedDate: '2026-05-01', isActive: true, createdAt: new Date().toISOString() },
  { id: 'rec-2', description: 'Aluguel Loft Paulista',     amountInCents: 180000, type: 'DES', category: 'Moradia',       accountId: 'acc-2', creditCardId: null, frequency: 'monthly', dayOfMonth: 2,  startDate: '2026-01-01', endDate: null, lastGeneratedDate: '2026-05-02', isActive: true, createdAt: new Date().toISOString() },
  { id: 'rec-3', description: 'Netflix',                   amountInCents: 5290,   type: 'DES', category: 'Lazer',         accountId: 'acc-2', creditCardId: null, frequency: 'monthly', dayOfMonth: 17, startDate: '2026-01-01', endDate: null, lastGeneratedDate: '2026-05-17', isActive: true, createdAt: new Date().toISOString() },
  { id: 'rec-4', description: 'Spotify',                   amountInCents: 2190,   type: 'DES', category: 'Lazer',         accountId: 'acc-2', creditCardId: null, frequency: 'monthly', dayOfMonth: 20, startDate: '2026-01-01', endDate: null, lastGeneratedDate: null,          isActive: true, createdAt: new Date().toISOString() },
  { id: 'rec-5', description: 'Plano de Saúde Bradesco',   amountInCents: 48000,  type: 'DES', category: 'Saúde',         accountId: 'acc-2', creditCardId: null, frequency: 'monthly', dayOfMonth: 10, startDate: '2026-01-01', endDate: null, lastGeneratedDate: '2026-05-10', isActive: true, createdAt: new Date().toISOString() },
  { id: 'rec-6', description: 'Condomínio',                amountInCents: 32000,  type: 'DES', category: 'Moradia',       accountId: 'acc-2', creditCardId: null, frequency: 'monthly', dayOfMonth: 15, startDate: '2026-01-01', endDate: null, lastGeneratedDate: '2026-05-15', isActive: true, createdAt: new Date().toISOString() },
  { id: 'rec-7', description: 'Aporte Mensal Poupança',    amountInCents: 120000, type: 'DES', category: 'Investimentos', accountId: 'acc-2', creditCardId: null, frequency: 'monthly', dayOfMonth: 10, startDate: '2026-01-01', endDate: null, lastGeneratedDate: '2026-05-10', isActive: true, createdAt: new Date().toISOString() },
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
    message: 'Seus dados foram sincronizados com sucesso via importação OFX.',
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
