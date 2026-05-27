/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useRef } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Plus,
  Database,
  FileText,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Trash2,
  Pencil,
  Search,
  X,
  ChevronDown,
  Upload,
  ClipboardList,
  ScanLine,
  Paperclip,
  Eye,
  Banknote,
  Landmark,
  BookOpen,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { FinancialAccount, Transaction, AccountType, TransactionType, Category, CreditCard, FamilyMember } from '../types';

interface CoreFinanceModuleProps {
  accounts: FinancialAccount[];
  transactions: Transaction[];
  categories: Category[];
  creditCards: CreditCard[];
  onAddTransaction: (tx: any) => Promise<boolean>;
  onEditTransaction: (id: string, data: any) => Promise<boolean>;
  onAddAccount: (acc: Omit<FinancialAccount, 'id' | 'isLinked'>) => Promise<boolean>;
  onEditAccount: (id: string, data: any) => Promise<boolean>;
  onDeleteAccount: (id: string) => Promise<boolean>;
  onDeleteTransaction: (id: string) => Promise<boolean>;
  onImportCSV: (csv: string, accountId: string) => Promise<{ imported: number; errors: string[] }>;
  onAnalyzeDocument: (base64: string, mimeType: string) => Promise<{ description?: string; amountInCents?: number; dueDate?: string; documentKey?: string }>;
  members: FamilyMember[];
  userRole?: 'owner' | 'member';
  userMemberId?: string | null;
}

type PeriodFilter = 'this_month' | 'last_month' | '30d' | '90d' | 'all';

const PAGE_SIZE = 25;

export default function CoreFinanceModule({
  accounts,
  transactions,
  categories,
  creditCards,
  onAddTransaction,
  onEditTransaction,
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
  onDeleteTransaction,
  onImportCSV,
  onAnalyzeDocument,
  members,
  userRole,
  userMemberId,
}: CoreFinanceModuleProps) {

  // ── Account form state ──────────────────────────────────────────────────────
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<AccountType>('CHECKING');
  const [accBank, setAccBank] = useState('Banco Itaú');
  const [accBalance, setAccBalance] = useState('');
  const [accColor, setAccColor] = useState('#0284C7');
  const [accBranch, setAccBranch] = useState('');
  const [accNumber, setAccNumber] = useState('');
  const [accDigit, setAccDigit] = useState('');
  const [accManagerName, setAccManagerName] = useState('');
  const [accManagerPhone, setAccManagerPhone] = useState('');

  // Account edit state
  const [editingAccId, setEditingAccId] = useState<string | null>(null);
  const [editAccName, setEditAccName] = useState('');
  const [editAccBank, setEditAccBank] = useState('');
  const [editAccType, setEditAccType] = useState<AccountType>('CHECKING');
  const [editAccColor, setEditAccColor] = useState('#0284C7');
  const [deleteAccConfirmId, setDeleteAccConfirmId] = useState<string | null>(null);

  // ── Transaction form state ──────────────────────────────────────────────────
  const [txType, setTxType] = useState<TransactionType>('DES');
  const [txAmount, setTxAmount] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [txCategory, setTxCategory] = useState('');
  const [txDesc, setTxDesc] = useState('');
  const [txOriginAcc, setTxOriginAcc] = useState('');
  const [txDestAcc, setTxDestAcc] = useState('');
  const [txCreditCardId, setTxCreditCardId] = useState('');
  const [txInstallments, setTxInstallments] = useState('1');
  const [useCard, setUseCard] = useState(false);

  // Transaction edit state
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editTxAmount, setEditTxAmount] = useState('');
  const [editTxDate, setEditTxDate] = useState('');
  const [editTxCategory, setEditTxCategory] = useState('');
  const [editTxDesc, setEditTxDesc] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // ── AI Document state ───────────────────────────────────────────────────────
  const [aiLoading, setAiLoading] = useState(false);
  const [pendingDocKey, setPendingDocKey] = useState<string | null>(null);
  const [viewDocKey, setViewDocKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── CSV import state ────────────────────────────────────────────────────────
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importAccountId, setImportAccountId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);

  // Preview: parse first 5 non-header lines client-side
  const csvPreview = useMemo(() => {
    if (!csvText) return [];
    return csvText.split('\n').map(l => l.trim()).filter(Boolean)
      .filter(l => !/^(data|date|dia)/i.test(l))
      .slice(0, 5)
      .map(line => {
        const cols = line.replace(/^﻿/, '').split(/[,;]/).map(c => c.trim().replace(/^"|"$/g, ''));
        return { date: cols[0] || '', desc: cols[1] || '', amount: cols[2] || '' };
      });
  }, [csvText]);

  const handleImport = async () => {
    if (!csvText.trim() || !importAccountId) { fb('Cole o CSV e selecione a conta.', 'error'); return; }
    setImporting(true);
    const result = await onImportCSV(csvText, importAccountId);
    setImportResult(result);
    setImporting(false);
    if (result.imported > 0) { fb(`${result.imported} lançamentos importados com sucesso!`, 'success'); setCsvText(''); }
  };

  // ── Transaction member ──────────────────────────────────────────────────────
  const [txMemberId, setTxMemberId] = useState('');

  // ── Ledger filters ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'REC' | 'DES' | 'TRANS'>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('this_month');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [memberFilter, setMemberFilter] = useState('');
  const [page, setPage] = useState(1);

  // ── Ledger & section tab state ─────────────────────────────────────────────
  const [ledgerTab, setLedgerTab] = useState<'ledger' | 'receitas' | 'impostos'>('ledger');

  // ── Income form state ───────────────────────────────────────────────────────
  const [incomeType, setIncomeType] = useState('salary');
  const [incomePayer, setIncomePayer] = useState('');
  const [incomeProfession, setIncomeProfession] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeDate, setIncomeDate] = useState(new Date().toISOString().split('T')[0]);
  const [incomeDesc, setIncomeDesc] = useState('');
  const [incomeAccountId, setIncomeAccountId] = useState('');
  const [incomeAiState, setIncomeAiState] = useState<'idle' | 'loading' | 'reviewing'>('idle');
  const [incomeAiError, setIncomeAiError] = useState('');
  const incomeFileRef = useRef<HTMLInputElement>(null);

  // ── Tax form state ──────────────────────────────────────────────────────────
  const [taxEntryType, setTaxEntryType] = useState<'payment' | 'refund' | 'installment'>('payment');
  const [taxYear, setTaxYear] = useState(new Date().getFullYear().toString());
  const [taxAmount, setTaxAmount] = useState('');
  const [taxDate, setTaxDate] = useState(new Date().toISOString().split('T')[0]);
  const [taxDesc, setTaxDesc] = useState('');
  const [taxAccountId, setTaxAccountId] = useState('');
  const [taxInstallmentN, setTaxInstallmentN] = useState('1');
  const [taxInstallmentTotal, setTaxInstallmentTotal] = useState('8');

  // ── Feedback ────────────────────────────────────────────────────────────────
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const FALLBACK_CATS = ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Educação', 'Receita', 'Investimentos', 'Outros'];
  const parentCategories = categories.filter(c => !c.parentId);
  const categoryNames = parentCategories.length > 0 ? parentCategories.map(c => c.name) : FALLBACK_CATS;
  const defaultCategory = categoryNames[0] || 'Alimentação';

  const formatBRL = (cents: number) =>
    (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const fb = (text: string, type: 'success' | 'error') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  // ── Period boundary helper ──────────────────────────────────────────────────
  const periodBounds = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const pad = (n: number) => String(n).padStart(2, '0');

    if (periodFilter === 'this_month') {
      return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-31` };
    }
    if (periodFilter === 'last_month') {
      const lm = m === 0 ? 12 : m;
      const ly = m === 0 ? y - 1 : y;
      return { from: `${ly}-${pad(lm)}-01`, to: `${ly}-${pad(lm)}-31` };
    }
    if (periodFilter === '30d') {
      const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
      return { from: d30.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
    }
    if (periodFilter === '90d') {
      const d90 = new Date(now); d90.setDate(d90.getDate() - 90);
      return { from: d90.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
    }
    return { from: '', to: '' };
  }, [periodFilter]);

  // ── Filtered + paginated transactions ──────────────────────────────────────
  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (categoryFilter && tx.category !== categoryFilter) return false;
      if (accountFilter && tx.accountId !== accountFilter) return false;
      if (search && !tx.description.toLowerCase().includes(search.toLowerCase())) return false;
      if (memberFilter === '__none__' && tx.memberId) return false;
      if (memberFilter && memberFilter !== '__none__' && tx.memberId !== memberFilter) return false;
      if (periodFilter !== 'all') {
        if (periodBounds.from && tx.date < periodBounds.from) return false;
        if (periodBounds.to && tx.date > periodBounds.to) return false;
      }
      return true;
    });
  }, [transactions, typeFilter, categoryFilter, accountFilter, search, periodFilter, periodBounds]);

  const paginated = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = paginated.length < filtered.length;

  // ── Account handlers ────────────────────────────────────────────────────────
  const handleCreateAccount = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!accName || !accBalance) { fb('Preencha todos os dados da carteira.', 'error'); return; }
    const parsedReal = parseFloat(accBalance.replace(',', '.'));
    if (isNaN(parsedReal)) { fb('Saldo inválido.', 'error'); return; }
    const result = await onAddAccount({
      name: accName, type: accType, bankName: accBank,
      balanceInCents: Math.round(parsedReal * 100), color: accColor,
      branch: accBranch || null, accountNumber: accNumber || null, accountDigit: accDigit || null,
      managerName: accManagerName || null, managerPhone: accManagerPhone || null,
    } as any);
    if (result) {
      fb(`Carteira "${accName}" criada!`, 'success');
      setAccName(''); setAccBalance(''); setAccBranch(''); setAccNumber(''); setAccDigit(''); setAccManagerName(''); setAccManagerPhone('');
      setShowAccountForm(false);
    } else fb('Erro ao cadastrar conta.', 'error');
  };

  const startEditAcc = (acc: FinancialAccount) => {
    setEditingAccId(acc.id);
    setEditAccName(acc.name);
    setEditAccBank(acc.bankName);
    setEditAccType(acc.type);
    setEditAccColor(acc.color);
  };

  const handleSaveAcc = async (id: string) => {
    const result = await onEditAccount(id, { name: editAccName, bankName: editAccBank, type: editAccType, color: editAccColor });
    if (result) { fb('Conta atualizada!', 'success'); setEditingAccId(null); }
    else fb('Erro ao atualizar conta.', 'error');
  };

  const handleDeleteAcc = async (id: string) => {
    const result = await onDeleteAccount(id);
    if (result) { fb('Conta removida.', 'success'); setDeleteAccConfirmId(null); }
    else fb('Não é possível excluir conta com transações.', 'error');
  };

  // ── AI document handler ─────────────────────────────────────────────────────
  const handleFileForAI = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { fb('Use uma imagem (JPG, PNG, WEBP).', 'error'); return; }
    setAiLoading(true);
    fb('Lendo documento com IA…', 'success');
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const result = await onAnalyzeDocument(base64, file.type);
      if (result.description) setTxDesc(result.description);
      if (result.amountInCents) setTxAmount((result.amountInCents / 100).toFixed(2).replace('.', ','));
      if (result.dueDate) setTxDate(result.dueDate);
      if (result.documentKey) setPendingDocKey(result.documentKey);
      setAiLoading(false);
      fb('IA extraiu os dados! Revise e confirme.', 'success');
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Transaction handlers ────────────────────────────────────────────────────
  const handleCreateTransaction = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!txAmount || !txDesc) { fb('Preencha todos os campos obrigatórios.', 'error'); return; }
    if (useCard && !txCreditCardId) { fb('Selecione o cartão.', 'error'); return; }
    if (!useCard && !txOriginAcc) { fb('Selecione a conta.', 'error'); return; }
    if (txType === 'TRANS' && !txDestAcc) { fb('Transferências exigem conta de destino.', 'error'); return; }
    const parsedReal = parseFloat(txAmount.replace(',', '.'));
    if (isNaN(parsedReal) || parsedReal <= 0) { fb('Valor inválido.', 'error'); return; }
    const amountInCents = Math.round(parsedReal * 100);
    const cat = txType === 'REC' ? (txCategory || 'Receita') : (txCategory || defaultCategory);
    const payload: any = { amountInCents, date: txDate, type: txType, category: cat, description: txDesc };
    if (pendingDocKey) payload.documentKey = pendingDocKey;
    if (txMemberId) payload.memberId = txMemberId;
    if (useCard && txType === 'DES') { payload.creditCardId = txCreditCardId; payload.installments = parseInt(txInstallments, 10) || 1; }
    else { payload.accountId = txOriginAcc; if (txType === 'TRANS') payload.destinationAccountId = txDestAcc; }
    const result = await onAddTransaction(payload);
    if (result) { fb('Transação adicionada!', 'success'); setTxAmount(''); setTxDesc(''); setTxInstallments('1'); setPendingDocKey(null); }
    else fb('Falha ao processar a transação.', 'error');
  };

  const startEditTx = (tx: Transaction) => {
    setEditingTxId(tx.id);
    setEditTxAmount((tx.amountInCents / 100).toFixed(2).replace('.', ','));
    setEditTxDate(tx.date);
    setEditTxCategory(tx.category);
    setEditTxDesc(tx.description);
  };

  const handleSaveTx = async (id: string) => {
    const parsedReal = parseFloat(editTxAmount.replace(',', '.'));
    if (isNaN(parsedReal) || parsedReal <= 0) { fb('Valor inválido.', 'error'); return; }
    const result = await onEditTransaction(id, { amountInCents: Math.round(parsedReal * 100), date: editTxDate, category: editTxCategory, description: editTxDesc });
    if (result) { fb('Lançamento atualizado!', 'success'); setEditingTxId(null); }
    else fb('Erro ao atualizar lançamento.', 'error');
  };

  const handleCreateIncome = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!incomeAmount || !incomeDesc || !incomeAccountId) { fb('Preencha valor, descrição e conta.', 'error'); return; }
    const parsedReal = parseFloat(incomeAmount.replace(',', '.'));
    if (isNaN(parsedReal) || parsedReal <= 0) { fb('Valor inválido.', 'error'); return; }
    const INCOME_TYPE_CATS: Record<string, string> = {
      salary: 'Salário/CLT', freelance: 'Autônomo/MEI', pro_labore: 'Pró-Labore',
      rent: 'Aluguel', dividends: 'Dividendos', investment_return: 'Aplicação Financeira',
      inheritance: 'Herança/Doação', other: 'Receita',
    };
    const payload: any = {
      amountInCents: Math.round(parsedReal * 100),
      date: incomeDate, type: 'REC',
      category: INCOME_TYPE_CATS[incomeType] || 'Receita',
      description: incomeDesc, accountId: incomeAccountId,
      incomeType, payer: incomePayer || null, profession: incomeProfession || null,
    };
    const result = await onAddTransaction(payload);
    if (result) { fb('Receita registrada!', 'success'); setIncomeAmount(''); setIncomeDesc(''); setIncomePayer(''); setIncomeAiState('idle'); }
    else fb('Erro ao registrar receita.', 'error');
  };

  const handleIncomeAIFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { fb('Use uma imagem (JPG, PNG, WEBP).', 'error'); return; }
    setIncomeAiState('loading');
    setIncomeAiError('');
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1];
        const res = await fetch('/api/transactions/ai-income-parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, mimeType: file.type }),
        });
        if (!res.ok) throw new Error('Falha na API');
        const data = await res.json() as any;
        if (data.amountInCents) setIncomeAmount((data.amountInCents / 100).toFixed(2).replace('.', ','));
        if (data.date) setIncomeDate(data.date);
        if (data.description) setIncomeDesc(data.description);
        if (data.payer) setIncomePayer(data.payer);
        if (data.profession) setIncomeProfession(data.profession);
        if (data.incomeType) setIncomeType(data.incomeType);
        setIncomeAiState('reviewing');
      } catch {
        setIncomeAiError('Falha ao processar documento. Verifique a imagem.');
        setIncomeAiState('idle');
      }
    };
    reader.readAsDataURL(file);
    if (incomeFileRef.current) incomeFileRef.current.value = '';
  };

  const handleCreateTaxEntry = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!taxAmount || !taxAccountId) { fb('Preencha valor e conta.', 'error'); return; }
    const parsedReal = parseFloat(taxAmount.replace(',', '.'));
    if (isNaN(parsedReal) || parsedReal <= 0) { fb('Valor inválido.', 'error'); return; }
    const type = taxEntryType === 'refund' ? 'REC' : 'DES';
    const category = taxEntryType === 'refund' ? 'Restituição IRPF' : taxEntryType === 'installment' ? 'IRPF - Parcela' : 'IRPF';
    const defaultDesc = taxEntryType === 'refund'
      ? `Restituição IR ${taxYear}`
      : taxEntryType === 'installment'
        ? `IRPF ${taxYear} - Parcela ${taxInstallmentN}/${taxInstallmentTotal}`
        : `DARF IRPF ${taxYear}`;
    const payload: any = {
      amountInCents: Math.round(parsedReal * 100), date: taxDate, type,
      category, description: taxDesc || defaultDesc, accountId: taxAccountId,
    };
    const result = await onAddTransaction(payload);
    if (result) { fb('Lançamento fiscal criado!', 'success'); setTaxAmount(''); setTaxDesc(''); }
    else fb('Erro ao criar lançamento fiscal.', 'error');
  };

  const ACC_COLORS = ['#0284C7', '#EA580C', '#16A34A', '#EAB308', '#8B5CF6', '#EC4899', '#6B7280'];

  const PERIOD_LABELS: Record<PeriodFilter, string> = {
    this_month: 'Este mês', last_month: 'Mês anterior', '30d': 'Últimos 30 dias', '90d': 'Últimos 90 dias', all: 'Todas'
  };

  // Totals for filtered set
  const filteredIncome = filtered.filter(t => t.type === 'REC').reduce((s, t) => s + t.amountInCents, 0);
  const filteredExpense = filtered.filter(t => t.type === 'DES').reduce((s, t) => s + t.amountInCents, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <Database className="w-5 h-5 text-emerald-600" />
          Módulo 2: Gestão de Contas & Transações
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Lançamentos e livros de fluxo de caixa em tempo real. Valores persistidos como inteiros em centavos para conformidade contábil.
        </p>
      </div>

      {statusMsg && (
        <div className={`p-3 rounded-lg flex items-center gap-2 border text-xs font-medium animate-fadeIn ${
          statusMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {statusMsg.type === 'success' ? <CheckCircle className="w-4 h-4 text-green-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
          {statusMsg.text}
        </div>
      )}

      {/* Accounts + Transaction form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Accounts */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-slate-500" />
                Carteiras & Bancos
              </h3>
              <button
                onClick={() => setShowAccountForm(!showAccountForm)}
                className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold px-2 py-1 rounded flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3 h-3" /> Nova
              </button>
            </div>

            {showAccountForm && (
              <form onSubmit={handleCreateAccount} className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 space-y-3 animate-fadeIn">
                <p className="text-xs font-bold text-slate-700">Nova Carteira</p>
                <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase">Apelido</label>
                    <input type="text" placeholder="Ex: Inter Corrente" value={accName} onChange={e => setAccName(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none bg-white font-medium" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase">Tipo</label>
                      <select value={accType} onChange={e => setAccType(e.target.value as AccountType)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white font-medium focus:outline-none">
                        <option value="CHECKING">Corrente</option>
                        <option value="SAVINGS">Poupança</option>
                        <option value="CASH">Dinheiro</option>
                        <option value="INVESTMENT">Investimentos</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase">Banco</label>
                      <input type="text" placeholder="Itaú, Nubank..." value={accBank} onChange={e => setAccBank(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white font-medium focus:outline-none" />
                    </div>
                  </div>
                  {/* Agência / Conta / Dígito */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase">Agência</label>
                      <input type="text" placeholder="0001" value={accBranch} onChange={e => setAccBranch(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white font-mono focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase">Conta Nº</label>
                      <input type="text" placeholder="12345" value={accNumber} onChange={e => setAccNumber(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white font-mono focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase">Dígito</label>
                      <input type="text" placeholder="6" value={accDigit} onChange={e => setAccDigit(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white font-mono focus:outline-none" />
                    </div>
                  </div>
                  {/* Gerente */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase">Gerente</label>
                      <input type="text" placeholder="Nome do gerente" value={accManagerName} onChange={e => setAccManagerName(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white font-medium focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase">WhatsApp</label>
                      <input type="text" placeholder="(11) 99999-9999" value={accManagerPhone} onChange={e => setAccManagerPhone(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white font-mono focus:outline-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase">Saldo Inicial (R$)</label>
                      <input type="text" placeholder="0,00" value={accBalance} onChange={e => setAccBalance(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white font-mono focus:outline-none font-bold" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Cor</label>
                      <div className="flex gap-1 items-center mt-1">
                        {ACC_COLORS.map(c => (
                          <button key={c} type="button" onClick={() => setAccColor(c)} style={{ backgroundColor: c }} className={`w-5 h-5 rounded-full border-2 transition-transform ${accColor === c ? 'scale-125 border-slate-900' : 'border-transparent'}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setShowAccountForm(false)} className="text-[11px] text-slate-500 font-bold px-2 py-1 hover:bg-slate-200 rounded">Cancelar</button>
                  <button type="submit" className="text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1 rounded">Salvar</button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {accounts.map(acc => (
                <div key={acc.id} className="border border-slate-200 rounded-xl p-3 hover:bg-slate-50 transition-colors group">
                  {editingAccId === acc.id ? (
                    <div className="space-y-2 animate-fadeIn">
                      <div className="grid grid-cols-2 gap-2">
                        <input value={editAccName} onChange={e => setEditAccName(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-400 font-medium" placeholder="Nome" />
                        <input value={editAccBank} onChange={e => setEditAccBank(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-400 font-medium" placeholder="Banco" />
                      </div>
                      <div className="grid grid-cols-2 gap-2 items-center">
                        <select value={editAccType} onChange={e => setEditAccType(e.target.value as AccountType)} className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none">
                          <option value="CHECKING">Corrente</option>
                          <option value="SAVINGS">Poupança</option>
                          <option value="CASH">Dinheiro</option>
                          <option value="INVESTMENT">Investimentos</option>
                        </select>
                        <div className="flex gap-1">
                          {ACC_COLORS.map(c => <button key={c} type="button" onClick={() => setEditAccColor(c)} style={{ backgroundColor: c }} className={`w-4 h-4 rounded-full border-2 ${editAccColor === c ? 'border-slate-800 scale-110' : 'border-transparent'}`} />)}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => setEditingAccId(null)} className="flex-1 text-[10px] bg-slate-200 text-slate-600 rounded-lg py-1 font-bold">Cancelar</button>
                        <button onClick={() => handleSaveAcc(acc.id)} className="flex-1 text-[10px] bg-indigo-600 text-white rounded-lg py-1 font-bold">Salvar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span style={{ backgroundColor: acc.color }} className="w-1.5 h-10 rounded-full shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-slate-700">{acc.name}</p>
                          <p className="text-[10px] text-slate-400 font-medium">{acc.bankName} · {acc.type === 'CASH' ? 'Dinheiro' : acc.type === 'SAVINGS' ? 'Poupança' : acc.type === 'INVESTMENT' ? 'Aplicações' : 'Corrente'}</p>
                          {(acc.branch || acc.accountNumber) && (
                            <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                              {acc.branch ? `Ag ${acc.branch}` : ''}{acc.branch && acc.accountNumber ? ' · ' : ''}{acc.accountNumber ? `C/C ${acc.accountNumber}${acc.accountDigit ? `-${acc.accountDigit}` : ''}` : ''}
                            </p>
                          )}
                          {acc.managerName && (
                            <p className="text-[9px] text-slate-400 mt-0.5 flex items-center gap-1">
                              <span>{acc.managerName}</span>
                              {acc.managerPhone && (
                                <a
                                  href={`https://wa.me/55${acc.managerPhone.replace(/\D/g,'')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="text-[9px] bg-green-100 text-green-700 font-bold px-1 py-0.5 rounded hover:bg-green-200 transition-colors"
                                  title={`WhatsApp: ${acc.managerPhone}`}
                                >
                                  WhatsApp
                                </a>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-2">
                        <div>
                          <p className="text-xs font-bold text-slate-800 font-mono italic">{formatBRL(acc.balanceInCents)}</p>
                          <span className={`text-[8px] font-bold px-1 rounded uppercase ${acc.isLinked ? 'bg-teal-50 text-teal-700 border border-teal-100' : 'bg-slate-100 text-slate-500'}`}>
                            {acc.isLinked ? 'Open Finance' : 'Manual'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => startEditAcc(acc)} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"><Pencil className="w-3 h-3" /></button>
                          {deleteAccConfirmId === acc.id ? (
                            <div className="flex gap-1">
                              <button onClick={() => handleDeleteAcc(acc.id)} className="text-[8px] bg-rose-600 text-white rounded px-1 py-0.5 font-bold">Sim</button>
                              <button onClick={() => setDeleteAccConfirmId(null)} className="text-[8px] bg-slate-200 text-slate-600 rounded px-1 py-0.5 font-bold">Não</button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteAccConfirmId(acc.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 className="w-3 h-3" /></button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Transaction form */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-indigo-500" />
                Lançamento Manual
              </h3>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={aiLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 text-[11px] font-bold rounded-lg transition-all disabled:opacity-50"
              >
                <ScanLine className="w-3.5 h-3.5" />
                {aiLoading ? 'Lendo…' : 'Ler com IA'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileForAI}
              />
            </div>
            {pendingDocKey && (
              <div className="mb-3 flex items-center gap-2 text-[11px] bg-violet-50 border border-violet-200 text-violet-700 px-3 py-2 rounded-lg font-semibold">
                <Paperclip className="w-3.5 h-3.5 shrink-0" />
                Documento anexado — será vinculado ao lançamento
                <button type="button" onClick={() => setPendingDocKey(null)} className="ml-auto text-violet-400 hover:text-violet-700"><X className="w-3 h-3" /></button>
              </div>
            )}

            <div className="mb-4 text-[11px] bg-indigo-50 text-indigo-900 border border-indigo-100 p-3 rounded-lg flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Regra Contábil:</span> Valores em Reais são gravados como inteiros em centavos para evitar falhas de ponto flutuante (e.g., R$ 12,54 → <code className="font-mono bg-indigo-100 px-1 rounded text-indigo-700">1254</code>).
              </div>
            </div>

            <form onSubmit={handleCreateTransaction} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tipo</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setTxType('DES'); setUseCard(false); setTxCategory(defaultCategory); }} className={`py-2 text-xs font-semibold rounded-lg border-2 flex items-center justify-center gap-1.5 transition-all ${txType === 'DES' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-100 hover:bg-slate-50 text-slate-600'}`}>
                    <ArrowUpRight className="w-4 h-4 text-rose-500" /> Despesa (-)
                  </button>
                  <button type="button" onClick={() => { setTxType('TRANS'); setUseCard(false); setTxCategory('Investimentos'); }} className={`py-2 text-xs font-semibold rounded-lg border-2 flex items-center justify-center gap-1.5 transition-all ${txType === 'TRANS' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-100 hover:bg-slate-50 text-slate-600'}`}>
                    <ArrowLeftRight className="w-4 h-4 text-indigo-500" /> Transferência
                  </button>
                </div>
              </div>

              {txType === 'DES' && creditCards.length > 0 && (
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setUseCard(!useCard)} className={`px-3 py-1.5 text-[11px] font-bold rounded-lg border-2 transition-all flex items-center gap-1.5 ${useCard ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                    💳 {useCard ? 'Cartão selecionado' : 'Pagar com cartão'}
                  </button>
                  {useCard && (
                    <select value={txCreditCardId} onChange={e => setTxCreditCardId(e.target.value)} className="flex-1 text-xs border border-violet-200 rounded-lg px-3 py-1.5 bg-violet-50/30 focus:outline-none font-semibold">
                      <option value="">Selecione...</option>
                      {creditCards.map(c => <option key={c.id} value={c.id}>{c.name}{c.lastFour ? ` •••• ${c.lastFour}` : ''}</option>)}
                    </select>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Valor (R$)</label>
                  <input type="text" placeholder="52,90" value={txAmount} onChange={e => setTxAmount(e.target.value)} className="w-full text-xs font-bold font-mono border border-slate-200 rounded-lg px-3 py-2 bg-slate-50/50 focus:bg-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Data</label>
                  <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} className="w-full text-xs font-mono border border-slate-200 rounded-lg px-3 py-2 bg-slate-50/50 focus:bg-white focus:outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Categoria</label>
                  <select value={txCategory} disabled={txType === 'REC'} onChange={e => setTxCategory(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-indigo-500 font-semibold">
                    {categoryNames.map((cat: string) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                {!useCard ? (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{txType === 'TRANS' ? 'Conta Origem' : 'Conta'}</label>
                    <select value={txOriginAcc} onChange={e => setTxOriginAcc(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-indigo-500 font-semibold">
                      <option value="">Selecione...</option>
                      {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({formatBRL(acc.balanceInCents)})</option>)}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Parcelas</label>
                    <select value={txInstallments} onChange={e => setTxInstallments(e.target.value)} className="w-full text-xs border border-violet-200 rounded-lg px-3 py-2 bg-violet-50/20 focus:outline-none font-semibold">
                      {[1,2,3,4,5,6,7,8,9,10,11,12,18,24].map(n => <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x`}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {txType === 'TRANS' && !useCard && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Conta Destino</label>
                  <select value={txDestAcc} onChange={e => setTxDestAcc(e.target.value)} className="w-full text-xs border border-teal-200 rounded-lg px-3 py-2 bg-emerald-50/20 focus:bg-white focus:outline-none focus:border-teal-500 font-semibold">
                    <option value="">Selecione...</option>
                    {accounts.filter(a => a.id !== txOriginAcc).map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({formatBRL(acc.balanceInCents)})</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Descrição</label>
                <input type="text" placeholder="Ex: Supermercado Pão de Açúcar" value={txDesc} onChange={e => setTxDesc(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-indigo-500" />
              </div>

              {/* Membro da família: obrigatório para owner quando há membros; fixo para member users */}
              {userRole === 'member' && userMemberId ? (
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-2">
                  <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">Lançamento para:</span>
                  <span className="text-xs font-bold text-indigo-800">
                    {members.find(m => m.id === userMemberId)?.name ?? 'Você'}
                  </span>
                </div>
              ) : members.length > 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                  <label className="block text-[10px] font-black text-amber-700 uppercase tracking-wider">👤 Para quem é este lançamento?</label>
                  <select value={txMemberId} onChange={e => setTxMemberId(e.target.value)} className="w-full text-xs border border-amber-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-indigo-500 font-semibold">
                    <option value="">Admin / Família (Geral)</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              ) : null}

              <div className="flex justify-end pt-1">
                <button type="submit" className="w-full md:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1">
                  Confirmar Lançamento
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* CSV Import panel */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => { setShowImport(!showImport); setImportResult(null); }}
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-semibold text-slate-800">Importar Extrato CSV</span>
            <span className="text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-600 px-1.5 py-0.5 rounded-full font-bold uppercase">Novo</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showImport ? 'rotate-180' : ''}`} />
        </button>

        {showImport && (
          <div className="px-6 pb-6 space-y-4 border-t border-slate-100 pt-4 animate-fadeIn">
            {/* Format guide */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Formato aceito (CSV)</span>
              </div>
              <code className="block text-[10px] font-mono text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2 leading-relaxed">
                data,descricao,valor<br />
                2026-05-01,Supermercado Extra,-245.80<br />
                2026-05-05,Salário Maio,5000.00<br />
                01/05/2026,Netflix,-39.90,débito
              </code>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Aceita vírgula ou ponto-e-vírgula · Datas: AAAA-MM-DD ou DD/MM/AAAA · Negativo = despesa, positivo = receita · Coluna "tipo" opcional (crédito/débito) · Categorias geradas automaticamente.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cole o conteúdo CSV aqui</label>
                <textarea
                  value={csvText}
                  onChange={e => { setCsvText(e.target.value); setImportResult(null); }}
                  rows={7}
                  placeholder={"data,descricao,valor\n2026-05-01,Supermercado,-150.00\n2026-05-05,Salário,5000.00"}
                  className="w-full text-xs font-mono border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-400 bg-slate-50 resize-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">{csvText.split('\n').filter(Boolean).length} linhas detectadas</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Conta de destino</label>
                  <select
                    value={importAccountId}
                    onChange={e => setImportAccountId(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-400 bg-white font-semibold"
                  >
                    <option value="">Selecione a conta...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>

                {/* Preview */}
                {csvPreview.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Prévia (5 primeiras linhas)</span>
                    <div className="space-y-1">
                      {csvPreview.map((row, i) => (
                        <div key={i} className="flex items-center justify-between text-[10px] bg-slate-50 rounded-lg px-2 py-1 font-mono">
                          <span className="text-slate-500">{row.date}</span>
                          <span className="text-slate-700 truncate max-w-[80px] mx-1">{row.desc}</span>
                          <span className={parseFloat(row.amount.replace(',', '.')) < 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>{row.amount}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleImport}
                  disabled={importing || !csvText.trim() || !importAccountId}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {importing ? 'Importando…' : 'Confirmar Importação'}
                </button>

                {importResult && (
                  <div className={`p-3 rounded-xl text-xs border space-y-1 ${importResult.imported > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                    <p className="font-bold">{importResult.imported} lançamentos importados</p>
                    {importResult.errors.length > 0 && (
                      <p className="text-[10px] text-amber-700">{importResult.errors.length} linha(s) ignorada(s)</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Ledger / Receitas / Impostos tab navigation */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
        {([
          { key: 'ledger' as const, label: 'Livro-Razão', Icon: BookOpen },
          { key: 'receitas' as const, label: 'Receitas', Icon: Banknote },
          { key: 'impostos' as const, label: 'Impostos & IR', Icon: Landmark },
        ]).map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setLedgerTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all ${
              ledgerTab === key ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Ledger */}
      {ledgerTab === 'ledger' && (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-slate-500" />
            Livro-Razão Contábil
          </h3>
          {filtered.length > 0 && (
            <div className="flex items-center gap-4 text-xs">
              <span className="text-emerald-600 font-bold font-mono">+{formatBRL(filteredIncome)}</span>
              <span className="text-rose-600 font-bold font-mono">-{formatBRL(filteredExpense)}</span>
              <span className={`font-bold font-mono ${filteredIncome - filteredExpense >= 0 ? 'text-slate-700' : 'text-rose-600'}`}>
                ={formatBRL(filteredIncome - filteredExpense)}
              </span>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por descrição..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full text-xs border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-indigo-400 bg-slate-50"
            />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3 h-3" /></button>}
          </div>

          {/* Type filter */}
          <div className="flex gap-1">
            {([['all', 'Todos'], ['REC', 'Receita'], ['DES', 'Despesa'], ['TRANS', 'Transfer.']] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => { setTypeFilter(val); setPage(1); }}
                className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-all ${typeFilter === val ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Period */}
          <div className="relative">
            <select
              value={periodFilter}
              onChange={e => { setPeriodFilter(e.target.value as PeriodFilter); setPage(1); }}
              className="text-[10px] font-bold border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none appearance-none pr-7 text-slate-600"
            >
              {(Object.entries(PERIOD_LABELS) as [PeriodFilter, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
          </div>

          {/* Category filter */}
          {categoryNames.length > 0 && (
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}
                className="text-[10px] font-bold border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none appearance-none pr-7 text-slate-600"
              >
                <option value="">Todas categorias</option>
                {categoryNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>
          )}

          {/* Account filter */}
          {accounts.length > 0 && (
            <div className="relative">
              <select
                value={accountFilter}
                onChange={e => { setAccountFilter(e.target.value); setPage(1); }}
                className="text-[10px] font-bold border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none appearance-none pr-7 text-slate-600"
              >
                <option value="">Todas contas</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>
          )}

          {/* Member filter */}
          {members.length > 0 && (
            <div className="relative">
              <select
                value={memberFilter}
                onChange={e => { setMemberFilter(e.target.value); setPage(1); }}
                className="text-[10px] font-bold border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none appearance-none pr-7 text-slate-600"
              >
                <option value="">Todos os membros</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                <option value="__none__">Sem membro</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>
          )}

          <span className="text-[10px] text-slate-400 font-medium ml-auto">{filtered.length} lançamentos</span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-semibold">
                <th className="py-2.5 px-3">Data</th>
                <th className="py-2.5 px-3">Descrição</th>
                <th className="py-2.5 px-3">Categoria</th>
                <th className="py-2.5 px-3">Canal</th>
                <th className="py-2.5 px-3">Conta</th>
                <th className="py-2.5 px-3 text-right">Valor</th>
                <th className="py-2.5 px-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
              {paginated.map(tx => {
                const acc = accounts.find(a => a.id === tx.accountId);
                const destAcc = tx.destinationAccountId ? accounts.find(a => a.id === tx.destinationAccountId) : null;
                const isEditing = editingTxId === tx.id;

                if (isEditing) {
                  return (
                    <tr key={tx.id} className="bg-indigo-50/40">
                      <td className="py-2 px-3">
                        <input type="date" value={editTxDate} onChange={e => setEditTxDate(e.target.value)} className="w-full text-xs font-mono border border-indigo-200 rounded px-1.5 py-1 focus:outline-none bg-white" />
                      </td>
                      <td className="py-2 px-3" colSpan={2}>
                        <input type="text" value={editTxDesc} onChange={e => setEditTxDesc(e.target.value)} className="w-full text-xs border border-indigo-200 rounded px-2 py-1 focus:outline-none bg-white mb-1 font-medium" placeholder="Descrição" />
                        <select value={editTxCategory} onChange={e => setEditTxCategory(e.target.value)} className="w-full text-xs border border-indigo-200 rounded px-2 py-1 focus:outline-none bg-white font-medium">
                          {categoryNames.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="py-2 px-3" colSpan={2}>
                        <input type="text" value={editTxAmount} onChange={e => setEditTxAmount(e.target.value)} className="w-full text-xs font-mono font-bold border border-indigo-200 rounded px-2 py-1 focus:outline-none bg-white" placeholder="Valor R$" />
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex gap-1">
                          <button onClick={() => setEditingTxId(null)} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded" title="Cancelar"><X className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleSaveTx(tx.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded" title="Salvar"><CheckCircle className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={tx.id} className="hover:bg-slate-50/60 transition-colors group">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">{tx.date}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-800 truncate max-w-[180px] flex items-center gap-1">
                        {tx.description}
                        {tx.documentKey && (
                          <button
                            onClick={() => setViewDocKey(tx.documentKey!)}
                            title="Ver documento"
                            className="shrink-0 text-violet-400 hover:text-violet-700 transition-colors"
                          >
                            <Paperclip className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {tx.installmentNumber && <div className="text-[9px] text-violet-500 font-bold">{tx.installmentNumber}/{tx.installmentTotal}x</div>}
                      {tx.originalMerchantName && <div className="text-[10px] font-mono text-slate-400 truncate max-w-[180px]">{tx.originalMerchantName}</div>}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200 text-[10px] whitespace-nowrap">{tx.category}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${tx.isSynced ? 'bg-teal-50 text-teal-700 border border-teal-100' : 'bg-slate-100 text-slate-500'}`}>
                        {tx.isSynced ? 'Open Finance' : 'Manual'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-500 text-[11px]">
                      {acc ? acc.name : tx.creditCardId ? '💳 Cartão' : '—'}
                      {destAcc && <span className="text-slate-400 font-normal"> → {destAcc.name}</span>}
                      {tx.memberId && (() => { const m = members.find(mb => mb.id === tx.memberId); return m ? <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: m.avatarColor }}>{m.name.charAt(0)}</span> : null; })()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold font-mono whitespace-nowrap">
                      {tx.type === 'REC' ? <span className="text-emerald-600">+{formatBRL(tx.amountInCents)}</span>
                        : tx.type === 'DES' ? <span className="text-rose-600">-{formatBRL(tx.amountInCents)}</span>
                        : <span className="text-indigo-600">⇄ {formatBRL(tx.amountInCents)}</span>}
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => startEditTx(tx)} title="Editar" className="p-1 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                          <Pencil className="w-3 h-3" />
                        </button>
                        {deleteConfirmId === tx.id ? (
                          <>
                            <button onClick={async () => { await onDeleteTransaction(tx.id); setDeleteConfirmId(null); }} className="text-[8px] bg-rose-600 text-white rounded px-1 py-0.5 font-bold">Sim</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="text-[8px] bg-slate-200 text-slate-600 rounded px-1 py-0.5 font-bold">Não</button>
                          </>
                        ) : (
                          <button onClick={() => setDeleteConfirmId(tx.id)} title="Excluir" className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="py-12 text-center text-slate-400 text-xs space-y-2">
              <FileText className="w-8 h-8 text-slate-200 mx-auto" />
              <p>{search || typeFilter !== 'all' || categoryFilter || accountFilter ? 'Nenhum lançamento encontrado com esses filtros.' : 'Nenhum lançamento adicionado.'}</p>
            </div>
          )}
        </div>

        {hasMore && (
          <div className="text-center pt-2">
            <button onClick={() => setPage(p => p + 1)} className="px-5 py-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:bg-indigo-50 rounded-xl transition-all">
              Carregar mais ({filtered.length - paginated.length} restantes)
            </button>
          </div>
        )}
      </div>
      )} {/* end ledger tab */}

      {/* Receitas tab */}
      {ledgerTab === 'receitas' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                <Banknote className="w-4 h-4 text-emerald-500" />
                Gestão de Receitas
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Salários, aluguéis, dividendos, pró-labore e todas as fontes de renda.</p>
            </div>
          </div>
          <div className="p-6 space-y-6">
            {/* KPIs */}
            {(() => {
              const now = new Date();
              const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
              const incomeThisMonth = transactions.filter(t => t.type === 'REC' && t.date.startsWith(thisMonth)).reduce((s,t) => s+t.amountInCents, 0);
              const incomeSources = new Set(transactions.filter(t => t.type === 'REC').map(t => t.payer || t.category)).size;
              const allMonths = [...new Set(transactions.filter(t => t.type === 'REC').map(t => t.date.slice(0,7)))].length;
              const totalIncome = transactions.filter(t => t.type === 'REC').reduce((s,t) => s+t.amountInCents, 0);
              const avgMonthly = allMonths > 0 ? Math.round(totalIncome / allMonths) : 0;
              return (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Este mês</p>
                    <p className="text-lg font-black text-emerald-700 font-mono mt-1">{formatBRL(incomeThisMonth)}</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Fontes de renda</p>
                    <p className="text-lg font-black text-blue-700 font-mono mt-1">{incomeSources}</p>
                  </div>
                  <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wider">Média mensal</p>
                    <p className="text-lg font-black text-violet-700 font-mono mt-1">{formatBRL(avgMonthly)}</p>
                  </div>
                </div>
              );
            })()}

            {/* Income form */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-700">Registrar Nova Receita</h4>
                <div className="flex items-center gap-2">
                  {incomeAiState === 'reviewing' && (
                    <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-bold">✓ IA preencheu — revise e salve</span>
                  )}
                  <button
                    type="button"
                    onClick={() => incomeFileRef.current?.click()}
                    disabled={incomeAiState === 'loading'}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 text-[11px] font-bold rounded-lg transition-all disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {incomeAiState === 'loading' ? 'Lendo…' : 'Ler com IA'}
                  </button>
                  <input ref={incomeFileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleIncomeAIFile} />
                </div>
              </div>
              {incomeAiError && <p className="text-xs text-rose-600 font-medium bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{incomeAiError}</p>}
              <form onSubmit={handleCreateIncome} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tipo de renda</label>
                    <select value={incomeType} onChange={e => setIncomeType(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none font-semibold">
                      <option value="salary">💼 Salário / CLT</option>
                      <option value="freelance">🧾 Autônomo / MEI</option>
                      <option value="pro_labore">🤝 Pró-Labore</option>
                      <option value="rent">🏠 Aluguel de Imóvel</option>
                      <option value="dividends">📈 Dividendos</option>
                      <option value="investment_return">💰 Aplicação Financeira</option>
                      <option value="inheritance">🎁 Herança / Doação</option>
                      <option value="other">🎯 Outros</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Pagador / Fonte</label>
                    <input type="text" placeholder="Ex: Empresa ABC, Imobiliária XYZ…" value={incomePayer} onChange={e => setIncomePayer(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none font-medium" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Profissão / Cargo</label>
                    <input type="text" placeholder="Ex: Engenheiro, Médico, Analista…" value={incomeProfession} onChange={e => setIncomeProfession(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none font-medium" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Valor líquido (R$)</label>
                    <input type="text" placeholder="5.200,00" value={incomeAmount} onChange={e => setIncomeAmount(e.target.value)} className="w-full text-xs font-bold font-mono border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Data</label>
                    <input type="date" value={incomeDate} onChange={e => setIncomeDate(e.target.value)} className="w-full text-xs font-mono border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Conta de crédito</label>
                    <select value={incomeAccountId} onChange={e => setIncomeAccountId(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none font-semibold">
                      <option value="">Selecione…</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Descrição</label>
                  <input type="text" placeholder="Ex: Salário Outubro 2025, Aluguel Apto 301…" value={incomeDesc} onChange={e => setIncomeDesc(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none font-medium" />
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Registrar Receita
                  </button>
                </div>
              </form>
            </div>

            {/* Income list */}
            {(() => {
              const incomeTxs = transactions.filter(t => t.type === 'REC').sort((a, b) => b.date.localeCompare(a.date));
              const INCOME_LABEL: Record<string, string> = {
                salary: '💼 Salário', freelance: '🧾 Autônomo', pro_labore: '🤝 Pró-Labore',
                rent: '🏠 Aluguel', dividends: '📈 Dividendos', investment_return: '💰 Aplicação',
                inheritance: '🎁 Herança', other: '🎯 Outros',
              };
              return incomeTxs.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" /> Histórico de Receitas
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-400 font-semibold text-[10px] uppercase">
                          <th className="px-3 py-2.5 text-left">Data</th>
                          <th className="px-3 py-2.5 text-left">Descrição</th>
                          <th className="px-3 py-2.5 text-left">Tipo</th>
                          <th className="px-3 py-2.5 text-left">Pagador</th>
                          <th className="px-3 py-2.5 text-left">Profissão</th>
                          <th className="px-3 py-2.5 text-right">Valor</th>
                          <th className="px-3 py-2.5 w-8" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {incomeTxs.slice(0, 40).map(tx => (
                          <tr key={tx.id} className="hover:bg-emerald-50/40 transition-colors group">
                            <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400">{tx.date}</td>
                            <td className="px-3 py-2.5 font-medium text-slate-700 truncate max-w-[160px]">{tx.description}</td>
                            <td className="px-3 py-2.5">
                              <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                                {INCOME_LABEL[tx.incomeType ?? ''] || tx.category}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-500 text-[11px] truncate max-w-[120px]">{tx.payer || '—'}</td>
                            <td className="px-3 py-2.5 text-slate-500 text-[11px] truncate max-w-[100px]">{tx.profession || '—'}</td>
                            <td className="px-3 py-2.5 text-right font-bold font-mono text-emerald-600">+{formatBRL(tx.amountInCents)}</td>
                            <td className="px-3 py-2.5">
                              <button onClick={async () => { await onDeleteTransaction(tx.id); }} className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-all">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center text-slate-400 text-xs space-y-2">
                  <Banknote className="w-8 h-8 text-slate-200 mx-auto" />
                  <p>Nenhuma receita registrada. Use o formulário acima ou importe com IA.</p>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Impostos tab */}
      {ledgerTab === 'impostos' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
              <Landmark className="w-4 h-4 text-indigo-500" />
              Impostos & Imposto de Renda
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">Controle de pagamentos DARF, parcelas IRPF e restituições.</p>
          </div>
          <div className="p-6 space-y-6">
            {/* Annual KPIs */}
            {(() => {
              const TAX_CATS = ['IRPF', 'IRPF - Parcela', 'Restituição IRPF'];
              const thisYear = new Date().getFullYear().toString();
              const taxTxs = transactions.filter(t => TAX_CATS.includes(t.category));
              const paidThisYear = taxTxs.filter(t => t.type === 'DES' && t.date.startsWith(thisYear)).reduce((s,t) => s + t.amountInCents, 0);
              const refundThisYear = taxTxs.filter(t => t.type === 'REC' && t.date.startsWith(thisYear)).reduce((s,t) => s + t.amountInCents, 0);
              const paidAllTime = taxTxs.filter(t => t.type === 'DES').reduce((s,t) => s + t.amountInCents, 0);
              const netBalance = refundThisYear - paidThisYear;
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-rose-50 border border-rose-100 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-rose-500 uppercase">Pago {thisYear}</p>
                    <p className="text-base font-black text-rose-700 font-mono mt-1">{formatBRL(paidThisYear)}</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase">Restituição {thisYear}</p>
                    <p className="text-base font-black text-emerald-700 font-mono mt-1">{formatBRL(refundThisYear)}</p>
                  </div>
                  <div className={`border rounded-xl p-4 ${netBalance >= 0 ? 'bg-teal-50 border-teal-100' : 'bg-amber-50 border-amber-100'}`}>
                    <p className={`text-[10px] font-bold uppercase ${netBalance >= 0 ? 'text-teal-500' : 'text-amber-500'}`}>Saldo {thisYear}</p>
                    <p className={`text-base font-black font-mono mt-1 ${netBalance >= 0 ? 'text-teal-700' : 'text-amber-700'}`}>{netBalance >= 0 ? '+' : ''}{formatBRL(netBalance)}</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Total pago (hist.)</p>
                    <p className="text-base font-black text-slate-700 font-mono mt-1">{formatBRL(paidAllTime)}</p>
                  </div>
                </div>
              );
            })()}

            {/* Tax entry form */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-700">Novo Lançamento Fiscal</h4>
              <form onSubmit={handleCreateTaxEntry} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tipo</label>
                    <select value={taxEntryType} onChange={e => setTaxEntryType(e.target.value as 'payment' | 'refund' | 'installment')} className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none font-semibold">
                      <option value="payment">🏦 Pagamento IR (DARF)</option>
                      <option value="installment">📅 Parcela IRPF</option>
                      <option value="refund">💚 Restituição IR</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Ano de referência</label>
                    <input type="text" placeholder="2025" value={taxYear} onChange={e => setTaxYear(e.target.value)} className="w-full text-xs font-mono font-bold border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none" />
                  </div>
                  {taxEntryType === 'installment' && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Parcela (ex: 3 de 8)</label>
                      <div className="flex gap-1.5 items-center">
                        <input type="text" placeholder="1" value={taxInstallmentN} onChange={e => setTaxInstallmentN(e.target.value)} className="w-full text-xs font-mono font-bold border border-slate-200 rounded-lg px-2 py-2 bg-white focus:outline-none" />
                        <span className="text-slate-400 text-xs shrink-0">de</span>
                        <input type="text" placeholder="8" value={taxInstallmentTotal} onChange={e => setTaxInstallmentTotal(e.target.value)} className="w-full text-xs font-mono font-bold border border-slate-200 rounded-lg px-2 py-2 bg-white focus:outline-none" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Valor (R$)</label>
                    <input type="text" placeholder="2.800,00" value={taxAmount} onChange={e => setTaxAmount(e.target.value)} className="w-full text-xs font-bold font-mono border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Data</label>
                    <input type="date" value={taxDate} onChange={e => setTaxDate(e.target.value)} className="w-full text-xs font-mono border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Conta</label>
                    <select value={taxAccountId} onChange={e => setTaxAccountId(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none font-semibold">
                      <option value="">Selecione…</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Descrição (opcional)</label>
                  <input type="text" placeholder="Ex: DARF IRPF 2025, Cota 3/8…" value={taxDesc} onChange={e => setTaxDesc(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none font-medium" />
                </div>
                <div className="flex justify-end">
                  <button type="submit" className={`px-5 py-2 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${taxEntryType === 'refund' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                    <Plus className="w-3.5 h-3.5" />
                    {taxEntryType === 'refund' ? 'Registrar Restituição' : taxEntryType === 'installment' ? 'Registrar Parcela' : 'Registrar Pagamento IR'}
                  </button>
                </div>
              </form>
            </div>

            {/* Tax list */}
            {(() => {
              const TAX_CATS = ['IRPF', 'IRPF - Parcela', 'Restituição IRPF'];
              const taxTxs = transactions.filter(t => TAX_CATS.includes(t.category)).sort((a, b) => b.date.localeCompare(a.date));
              return taxTxs.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Histórico Fiscal</h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-400 font-semibold text-[10px] uppercase">
                          <th className="px-3 py-2.5 text-left">Data</th>
                          <th className="px-3 py-2.5 text-left">Descrição</th>
                          <th className="px-3 py-2.5 text-left">Categoria</th>
                          <th className="px-3 py-2.5 text-left">Conta</th>
                          <th className="px-3 py-2.5 text-right">Valor</th>
                          <th className="px-3 py-2.5 w-8" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {taxTxs.map(tx => {
                          const acc = accounts.find(a => a.id === tx.accountId);
                          return (
                            <tr key={tx.id} className="hover:bg-indigo-50/30 transition-colors group">
                              <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400">{tx.date}</td>
                              <td className="px-3 py-2.5 font-medium text-slate-700">{tx.description}</td>
                              <td className="px-3 py-2.5">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${tx.type === 'REC' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>
                                  {tx.category}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-slate-500 text-[11px]">{acc ? acc.name : '—'}</td>
                              <td className="px-3 py-2.5 text-right font-bold font-mono">
                                {tx.type === 'REC'
                                  ? <span className="text-emerald-600">+{formatBRL(tx.amountInCents)}</span>
                                  : <span className="text-rose-600">-{formatBRL(tx.amountInCents)}</span>}
                              </td>
                              <td className="px-3 py-2.5">
                                <button onClick={async () => { await onDeleteTransaction(tx.id); }} className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-all">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center text-slate-400 text-xs space-y-2">
                  <Landmark className="w-8 h-8 text-slate-200 mx-auto" />
                  <p>Nenhum lançamento fiscal encontrado. Use o formulário acima para registrar pagamentos, parcelas ou restituições.</p>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Document viewer modal */}
      {viewDocKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fadeIn" onClick={() => setViewDocKey(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Eye className="w-4 h-4 text-violet-500" /> Documento Anexado
              </span>
              <button onClick={() => setViewDocKey(null)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden bg-slate-100">
              <img
                src={`/api/documents/${viewDocKey}`}
                alt="Documento"
                className="w-full h-full object-contain max-h-[80vh]"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
