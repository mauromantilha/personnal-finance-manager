/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useErrorNotify } from './components/ErrorNotifier';
import {
  Building2,
  Database,
  Network,
  Target,
  BarChart3,
  Bell,
  CreditCard as CreditCardIcon,
  RefreshCw,
  Clock,
  Menu,
  X,
  LogOut,
  Users,
  Tag,
  Layers,
  TrendingUp,
  BrainCircuit,
  FolderOpen,
  ShieldAlert
} from 'lucide-react';

// ── Subcomponents (code-split por aba via React.lazy) ────────────────────────
// Cada módulo vira um chunk JS separado, carregado só quando a aba é aberta.
// Reduz drasticamente o bundle inicial (antes: todos os módulos + recharts +
// motion baixados no primeiro load, mesmo para ver só o Dashboard).
const CoreFinanceModule   = lazy(() => import('./components/CoreFinanceModule'));
const CreditCardModule    = lazy(() => import('./components/CreditCardModule'));
const RecurrencesModule   = lazy(() => import('./components/RecurrencesModule'));
const OFXImportModule     = lazy(() => import('./components/OFXImportModule'));
const BudgetsModule       = lazy(() => import('./components/BudgetsModule'));
const AnalyticsModule     = lazy(() => import('./components/AnalyticsModule'));
const NotificationsModule = lazy(() => import('./components/NotificationsModule'));
const FamilyModule        = lazy(() => import('./components/FamilyModule'));
const CategoriesModule    = lazy(() => import('./components/CategoriesModule'));
const InstallmentsModule  = lazy(() => import('./components/InstallmentsModule'));
const InvestmentsModule   = lazy(() => import('./components/InvestmentsModule'));
const UsersModule         = lazy(() => import('./components/UsersModule'));
const HealthReport        = lazy(() => import('./components/HealthReport'));
const PredictiveAIModule  = lazy(() => import('./components/PredictiveAIModule'));
const MarketWidget        = lazy(() => import('./components/MarketWidget'));
const DocumentsModule     = lazy(() => import('./components/DocumentsModule'));
const DebtModule          = lazy(() => import('./components/DebtModule'));
// Modais leves e sempre potencialmente visíveis — mantidos eager.
import { LGPDModal } from './components/LGPDModal';
import { StorageQuotaModal } from './components/StorageQuotaModal';

import {
  UserProfile,
  FinancialAccount,
  Transaction,
  CategoryBudget,
  FinancialGoal,
  NotificationAlert,
  Category,
  CreditCard,
  Invoice,
  Recurrence,
  FamilyMember,
  InstallmentGroup,
  Investment
} from './types';

type TabType = 'DASHBOARD' | 'CORE' | 'CREDIT_CARDS' | 'RECURRENCES' | 'OPEN_FINANCE' | 'BUDGETS' | 'ANALYTICS' | 'NOTIFICATIONS' | 'FAMILY' | 'CATEGORIES' | 'INSTALLMENTS' | 'INVESTMENTS' | 'PREDICTIVE_AI' | 'USERS' | 'DOCUMENTS' | 'DEBTS';

export default function App() {
  const { showError } = useErrorNotify();

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<TabType>('DASHBOARD');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // User profile — populated from /api/auth/status on load
  const [user, setUser] = useState<UserProfile>({
    id: '', name: '', email: '',
    role: 'member', memberId: null,
    mfaEnabled: false, mfaPendingSetup: false, avatarUrl: '',
  });

  // State loaded from the backend APIs
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [alerts, setAlerts] = useState<NotificationAlert[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [recurrences, setRecurrences] = useState<Recurrence[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [installmentGroups, setInstallmentGroups] = useState<InstallmentGroup[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const PRESET_AVATARS = [
    'https://api.dicebear.com/9.x/avataaars/svg?seed=Felix',
    'https://api.dicebear.com/9.x/avataaars/svg?seed=Ana',
    'https://api.dicebear.com/9.x/avataaars/svg?seed=Carlos',
    'https://api.dicebear.com/9.x/avataaars/svg?seed=Sofia',
    'https://api.dicebear.com/9.x/bottts/svg?seed=Robot1',
    'https://api.dicebear.com/9.x/bottts/svg?seed=Robot2',
    'https://api.dicebear.com/9.x/bottts/svg?seed=Bot3',
    'https://api.dicebear.com/9.x/fun-emoji/svg?seed=Smile',
    'https://api.dicebear.com/9.x/fun-emoji/svg?seed=Cool',
    'https://api.dicebear.com/9.x/fun-emoji/svg?seed=Happy',
    'https://api.dicebear.com/9.x/lorelei/svg?seed=Luna',
    'https://api.dicebear.com/9.x/lorelei/svg?seed=Mars',
    'https://api.dicebear.com/9.x/micah/svg?seed=Micah1',
    'https://api.dicebear.com/9.x/micah/svg?seed=Micah2',
    'https://api.dicebear.com/9.x/pixel-art/svg?seed=Pixel1',
    'https://api.dicebear.com/9.x/pixel-art/svg?seed=Pixel2',
    'https://api.dicebear.com/9.x/pixel-art/svg?seed=Pixel3',
    'https://api.dicebear.com/9.x/open-peeps/svg?seed=Peep1',
    'https://api.dicebear.com/9.x/open-peeps/svg?seed=Peep2',
    'https://api.dicebear.com/9.x/open-peeps/svg?seed=Peep3',
  ];

  // Receita média mensal (últimos 3 meses) para o simulador de investimentos
  const avgMonthlyIncomeInCents = useMemo(() => {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const recTxs = (transactions as any[]).filter((t: any) =>
      t.type === 'REC' && new Date(t.date) >= threeMonthsAgo,
    );
    return recTxs.length > 0
      ? Math.round(recTxs.reduce((s: number, t: any) => s + t.amountInCents, 0) / 3)
      : 0;
  }, [transactions]);

  // Instituições únicas já cadastradas em investimentos
  const investmentInstitutions = useMemo(
    () => [...new Set((investments as any[]).map((i: any) => i.institution).filter(Boolean))] as string[],
    [investments],
  );
  const [lgpdAccepted, setLgpdAccepted] = useState<boolean | null>(null);

  // ── Storage quota modal ──────────────────────────────────────────────────────
  const [storageQuota, setStorageQuota] = useState<{
    usedFormatted: string; limitFormatted: string; percentage: number;
    upgradePrice: number; upgradeLimitBytes: number;
  } | null>(null);

  // Auto-logout por inatividade — 20 minutos
  useEffect(() => {
    const TIMEOUT_MS = 20 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { handleLogout(); }, TIMEOUT_MS);
    };
    const events = ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'];
    events.forEach(ev => window.addEventListener(ev, reset, true));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach(ev => window.removeEventListener(ev, reset, true));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefetch em idle dos chunks das abas mais prováveis (o Dashboard já carrega
  // Core/Analytics/Market). Warma os módulos após o primeiro paint sem inflar o
  // bundle inicial — a troca de aba fica instantânea. Vite deduplica por specifier.
  useEffect(() => {
    const warm = () => {
      import('./components/CreditCardModule');
      import('./components/BudgetsModule');
      import('./components/InvestmentsModule');
      import('./components/PredictiveAIModule');
      import('./components/RecurrencesModule');
      import('./components/DebtModule');
    };
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    const id = w.requestIdleCallback
      ? w.requestIdleCallback(warm, { timeout: 3000 })
      : window.setTimeout(warm, 1500);
    return () => {
      const wc = window as typeof window & { cancelIdleCallback?: (id: number) => void };
      if (wc.cancelIdleCallback) wc.cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, []);

  const fetchAllData = useCallback(async () => {
    try {
      const response = await fetch('/api/data');
      if (response.ok) {
        const data = await response.json();
        setAccounts(data.accounts || []);
        setTransactions(data.transactions || []);
        setBudgets(data.budgets || []);
        setGoals(data.goals || []);
        setAlerts(data.alerts || []);
        setCategories(data.categories || []);
        setCreditCards(data.creditCards || []);
        setInvoices(data.invoices || []);
        setRecurrences(data.recurrences || []);
        setFamilyMembers(data.familyMembers || []);
        setInstallmentGroups(data.installmentGroups || []);
        setInvestments(data.investments || []);
      }
    } catch (e) {
      console.error('Erro ao buscar dados:', e);
      showError('Falha ao carregar os dados. Verifique sua conexão.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    async function initialize() {
      try {
        // CF Access handles auth — just check user + LGPD status
        const res = await fetch('/api/auth/status');
        if (!res.ok) {
          // 401/403 = JWT ausente ou inválido para este subdomínio → redireciona ao login CF Access
          if (res.status === 401 || res.status === 403) {
            window.location.href = window.location.origin + '/cdn-cgi/access/login';
            return;
          }
          setIsLoading(false);
          return;
        }
        const data = await res.json();
        setUser(prev => ({ ...prev, id: data.user.id, name: data.user.name, email: data.user.email, role: data.user.role ?? 'member', memberId: data.user.memberId ?? null, avatarUrl: data.user.avatarUrl ?? '' }));
        if (data.lgpdRequired) {
          setLgpdAccepted(false);
          setIsLoading(false);
        } else {
          setLgpdAccepted(true);
          await fetchAllData();
        }
      } catch {
        setIsLoading(false);
      }
    }
    initialize();
  }, [fetchAllData]);

  // Total balance helper
  const netWorthCents = accounts.reduce((sum, a) => sum + a.balanceInCents, 0);

  // Total unread notifications
  const unreadAlertsCount = alerts.filter(a => !a.isRead).length;

  // Actions trigger handshakes
  const handleAddTransaction = async (txData: any): Promise<boolean> => {
    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(txData)
      });
      if (response.ok) {
        await fetchAllData();
        return true;
      }
    } catch (err) {
      console.error(err); showError();
    }
    return false;
  };

  const handleAddAccount = async (accData: any): Promise<boolean> => {
    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accData)
      });
      if (response.ok) {
        await fetchAllData();
        return true;
      }
      const body = await response.json().catch(() => ({} as any));
      showError(body.error || body.details || 'Erro ao cadastrar conta.');
    } catch (err) {
      console.error(err); showError();
    }
    return false;
  };

  const handleUpdateBudget = async (category: string, limitInCents: number): Promise<boolean> => {
    try {
      const response = await fetch('/api/budgets/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, limitInCents })
      });
      if (response.ok) {
        await fetchAllData();
        return true;
      }
    } catch (err) {
      console.error(err); showError();
    }
    return false;
  };

  const handleDepositGoal = async (id: string, amountToAdd: number): Promise<boolean> => {
    try {
      const response = await fetch('/api/goals/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, amountToAdd })
      });
      if (response.ok) {
        await fetchAllData();
        return true;
      }
    } catch (err) {
      console.error(err); showError();
    }
    return false;
  };

  const handleCreateGoal = async (goalData: { name: string; targetInCents: number; targetDate: string; color?: string; currentInCents?: number }): Promise<boolean> => {
    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(goalData)
      });
      if (response.ok) {
        await fetchAllData();
        return true;
      }
    } catch (err) {
      console.error(err); showError();
    }
    return false;
  };

  const handleDeleteTransaction = async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
      if (response.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); showError(); }
    return false;
  };

  const handleEditTransaction = async (id: string, data: any): Promise<boolean> => {
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (res.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); showError(); }
    return false;
  };

  const handleEditAccount = async (id: string, data: any): Promise<boolean> => {
    try {
      const res = await fetch(`/api/accounts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (res.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); showError(); }
    return false;
  };

  const handleDeleteAccount = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
      if (res.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); showError(); }
    return false;
  };

  const handleImportCSV = async (csv: string, accountId: string): Promise<{ imported: number; errors: string[] }> => {
    try {
      const res = await fetch('/api/import/csv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv, accountId }) });
      if (res.ok) { const data = await res.json(); await fetchAllData(); return data; }
    } catch (err) { console.error(err); }
    return { imported: 0, errors: ['Erro de conexão com o servidor.'] };
  };

  /** Exibe o modal de cota se a resposta for 402 QUOTA_EXCEEDED. */
  async function handleQuota402(res: Response): Promise<boolean> {
    if (res.status !== 402) return false;
    try {
      const data = await res.json() as any;
      if (data.code === 'QUOTA_EXCEEDED') {
        setStorageQuota({
          usedFormatted:     data.usedFormatted   ?? `${data.usedBytes} B`,
          limitFormatted:    data.limitFormatted  ?? `${data.limitBytes} B`,
          percentage:        data.limitBytes > 0 ? Math.min(100, (data.usedBytes / data.limitBytes) * 100) : 100,
          upgradePrice:      data.upgradePrice    ?? 5,
          upgradeLimitBytes: data.upgradeLimitBytes ?? 1_073_741_824,
        });
      }
    } catch { /* ignore */ }
    return true;
  }

  const handleAnalyzeDocument = async (base64: string, mimeType: string): Promise<{ description?: string; amountInCents?: number; dueDate?: string; documentKey?: string }> => {
    try {
      const res = await fetch('/api/documents/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType, documentType: 'BILL' }),
      });
      if (await handleQuota402(res)) return {};
      if (res.ok) return await res.json();
    } catch (err) { console.error(err); }
    return {};
  };

  const handleAnalyzeInvoice = async (base64: string, mimeType: string, creditCardId: string): Promise<{ lineItems?: any[]; dueDate?: string; totalAmountInCents?: number }> => {
    try {
      const res = await fetch('/api/documents/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType, documentType: 'INVOICE', creditCardId }),
      });
      if (await handleQuota402(res)) return {};
      if (res.ok) return await res.json();
    } catch (err) { console.error(err); }
    return {};
  };

  const handleImportInvoice = async (items: any[], creditCardId: string): Promise<{ imported: number; errors: string[] }> => {
    try {
      const res = await fetch('/api/import/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, creditCardId }),
      });
      if (res.ok) { const data = await res.json(); await fetchAllData(); return data; }
    } catch (err) { console.error(err); }
    return { imported: 0, errors: ['Erro de conexão com o servidor.'] };
  };

  const handleDeleteGoal = async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/goals/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        await fetchAllData();
        return true;
      }
    } catch (err) {
      console.error(err);
    }
    return false;
  };

  const handleAddCreditCard = async (data: any): Promise<boolean> => {
    try {
      const res = await fetch('/api/credit-cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (res.ok) { await fetchAllData(); return true; }
      const body = await res.json().catch(() => ({} as any));
      showError(body.error || body.details || 'Erro ao cadastrar cartão.');
    } catch (err) { console.error(err); showError(); }
    return false;
  };

  const handleUpdateCreditCard = async (id: string, data: any): Promise<boolean> => {
    try {
      const res = await fetch(`/api/credit-cards/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (res.ok) { await fetchAllData(); return true; }
      const body = await res.json().catch(() => ({} as any));
      showError(body.error || body.details || 'Erro ao atualizar cartão.');
    } catch (err) { console.error(err); showError(); }
    return false;
  };

  const handleDeleteCreditCard = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/credit-cards/${id}`, { method: 'DELETE' });
      if (res.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); }
    return false;
  };

  const handlePayInvoice = async (invoiceId: string, accountId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId }) });
      if (res.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); }
    return false;
  };

  const handleAddRecurrence = async (data: any): Promise<boolean> => {
    try {
      const res = await fetch('/api/recurrences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (res.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); }
    return false;
  };

  const handleUpdateRecurrence = async (id: string, data: any): Promise<boolean> => {
    try {
      const res = await fetch(`/api/recurrences/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (res.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); }
    return false;
  };

  const handleDeleteRecurrence = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/recurrences/${id}`, { method: 'DELETE' });
      if (res.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); }
    return false;
  };

  const handleProcessRecurrences = async (): Promise<void> => {
    try {
      await fetch('/api/recurrences/process', { method: 'POST' });
      await fetchAllData();
    } catch (err) { console.error(err); }
  };

  const handleDeleteBudget = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/budgets/${id}`, { method: 'DELETE' });
      if (res.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); }
    return false;
  };

  const handleMarkAllAlertsRead = async (): Promise<void> => {
    try {
      await fetch('/api/alerts/read-all', { method: 'POST' });
      await fetchAllData();
    } catch (err) { console.error(err); }
  };

  const handleClearReadAlerts = async (): Promise<void> => {
    try {
      await fetch('/api/alerts/clear-read', { method: 'DELETE' });
      await fetchAllData();
    } catch (err) { console.error(err); }
  };

  const handleMarkAlertRead = async (id: string) => {
    try {
      const response = await fetch('/api/alerts/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (response.ok) {
        setAlerts(prev => prev.map(a => a.id === id ? { ...a, isRead: true } : a));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetDB = async () => {
    if (confirm('Isso apagará TODOS os dados (contas, transações, metas, investimentos, etc.). Deseja continuar?')) {
      try {
        const response = await fetch('/api/reset', { method: 'POST' });
        if (response.ok) {
          await fetchAllData();
          setActiveTab('DASHBOARD');
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleLogout = () => {
    // Team-level logout invalida a sessão compartilhada do CF Access em todos os subdomínios.
    // O cookie de sessão fica no team domain, não no subdomínio — por isso o /cdn-cgi/access/logout
    // relativo retorna "No Access cookie found".
    window.location.href = 'https://mks-personnal-finance-manager.cloudflareaccess.com/cdn-cgi/access/logout';
  };

  const handleAddFamilyMember = async (name: string, avatarColor: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/family', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, avatarColor })
      });
      if (res.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); }
    return false;
  };

  const handleDeleteFamilyMember = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/family/${id}`, { method: 'DELETE' });
      if (res.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); }
    return false;
  };

  const handleAddCategory = async (data: { name: string; icon: string; color: string; type: string; parentId?: string }): Promise<boolean> => {
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); }
    return false;
  };

  const handleEditCategory = async (id: string, data: { name: string; icon: string; color: string }): Promise<boolean> => {
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); }
    return false;
  };

  const handleDeleteCategory = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
      if (res.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); }
    return false;
  };

  const handleAddInstallment = async (data: {
    description: string; totalInCents: number; installmentCount: number;
    startDate: string; accountId?: string; creditCardId?: string; category: string; memberId?: string;
  }): Promise<boolean> => {
    try {
      const res = await fetch('/api/installments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); }
    return false;
  };

  const handleCancelInstallment = async (groupId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/installments/${groupId}`, { method: 'DELETE' });
      if (res.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); }
    return false;
  };

  const handleAddInvestment = async (data: Omit<Investment, 'id' | 'createdAt'>): Promise<boolean> => {
    try {
      const res = await fetch('/api/investments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name, ticker: data.ticker, assetClass: data.assetClass,
          institution: data.institution, investedInCents: data.investedInCents,
          currentValueInCents: data.currentValueInCents, annualRate: data.annualRate,
          startDate: data.startDate, maturityDate: data.maturityDate,
          accountId: data.accountId, notes: data.notes,
        })
      });
      if (res.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); }
    return false;
  };

  const handleUpdateInvestment = async (id: string, data: Partial<Investment>): Promise<boolean> => {
    try {
      const res = await fetch(`/api/investments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); }
    return false;
  };

  const handleDeleteInvestment = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/investments/${id}`, { method: 'DELETE' });
      if (res.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); }
    return false;
  };

  // Nav configuration
  const sidebarNavItems: { id: TabType; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'DASHBOARD',    label: 'Dashboard',                    icon: Building2 },
    { id: 'PREDICTIVE_AI', label: 'IA Preditiva',               icon: BrainCircuit },
    { id: 'CORE',         label: 'Módulo 1: Contas & Ledger',    icon: Database },
    { id: 'CREDIT_CARDS', label: 'Módulo 2: Cartões & Faturas',  icon: CreditCardIcon },
    { id: 'RECURRENCES',  label: 'Módulo 3: Recorrências',       icon: RefreshCw },
    { id: 'OPEN_FINANCE', label: 'Módulo 4: Importar OFX',       icon: Network },
    { id: 'BUDGETS',      label: 'Módulo 5: Planejamento',       icon: Target },
    { id: 'ANALYTICS',    label: 'Módulo 6: Relatórios',         icon: BarChart3 },
    { id: 'NOTIFICATIONS',label: 'Módulo 7: Notificações',       icon: Bell, badge: unreadAlertsCount },
    { id: 'FAMILY',       label: 'Módulo 8: Família',            icon: Users },
    { id: 'CATEGORIES',   label: 'Módulo 9: Categorias',         icon: Tag },
    { id: 'INSTALLMENTS', label: 'Módulo 10: Parcelamentos',     icon: Layers },
    { id: 'INVESTMENTS',  label: 'Módulo 11: Investimentos',     icon: TrendingUp },
    { id: 'USERS',        label: 'Módulo 12: Usuários',          icon: Users },
    { id: 'DOCUMENTS',    label: 'Documentos',                   icon: FolderOpen },
    { id: 'DEBTS',        label: 'Crédito & CPF',                icon: ShieldAlert },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
          <div className="space-y-1">
            <h1 className="font-extrabold text-slate-800 text-lg tracking-tight">Consolidando MKS Open Finance</h1>
            <p className="text-xs text-slate-400 font-medium">Buscando livros contábeis em centavos no servidor...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-slate-50 text-slate-900 font-sans antialiased">
      {lgpdAccepted === false && (
        <LGPDModal onAccept={async () => {
          await fetch('/api/lgpd/accept', { method: 'POST' });
          setLgpdAccepted(true);
          await fetchAllData();
        }} />
      )}

      {/* Storage quota modal — exibido quando upload retorna 402 QUOTA_EXCEEDED */}
      {storageQuota && (
        <StorageQuotaModal
          {...storageQuota}
          onClose={() => setStorageQuota(null)}
        />
      )}

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar — full height from top */}
      <aside className={`${sidebarCollapsed ? 'w-16' : 'w-72'} bg-slate-900 text-slate-100 border-r border-slate-800 flex flex-col fixed lg:static h-screen z-40 transition-all duration-200 lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>

        {/* Branding */}
        <div className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-5'} py-4 border-b border-slate-800 shrink-0`}>
          {sidebarCollapsed ? (
            <button
              onClick={() => setSidebarCollapsed(v => !v)}
              className="hidden lg:flex p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
              title="Expandir sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
          ) : (
            <>
              <span className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-base font-black shadow-sm shrink-0">F</span>
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm text-white leading-tight">Finanças Livre</p>
                <p className="text-[10px] text-slate-400 leading-tight">Gestão financeira inteligente</p>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 shrink-0">
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSidebarCollapsed(v => !v)}
                className="hidden lg:flex p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all shrink-0"
                title="Recolher sidebar"
              >
                <Menu className="w-5 h-5" />
              </button>
            </>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-3 space-y-0.5 px-2">
              {sidebarNavItems.map(item => {
                const Icon = item.icon;
                const isSelected = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id as TabType);
                      setSidebarOpen(false);
                    }}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={`w-full flex items-center ${
                      sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-3'
                    } py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                      isSelected 
                        ? 'bg-indigo-500/10 text-indigo-400 shadow-xs' 
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className={`flex items-center ${sidebarCollapsed ? '' : 'gap-3'}`}>
                      <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-indigo-400' : 'text-slate-400'}`} />
                      {!sidebarCollapsed && <span>{item.label}</span>}
                    </div>
                    {!sidebarCollapsed && item.badge !== undefined && item.badge > 0 && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-extrabold ${isSelected ? 'bg-indigo-900/50 text-indigo-300' : 'bg-rose-500/20 text-rose-400'}`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
        </nav>

        {/* Sidebar footer */}
        <div className={`pt-3 border-t border-slate-800 shrink-0 ${sidebarCollapsed ? 'px-2 pb-3 space-y-1' : 'px-5 pb-5 space-y-3'}`}>
            {!sidebarCollapsed && (
              <>
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" /> Cloudflare Workers
                </div>
                <button 
                  onClick={handleResetDB}
                  className="w-full text-left text-[10px] font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-3 py-1.5 rounded-lg transition-all uppercase tracking-widest"
                >
                  Limpar Todos os Dados
                </button>
              </>
            )}
          </div>
      </aside>

      {/* Right column: header + scrollable content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Slim top bar */}
        <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex items-center justify-between shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg lg:hidden transition-colors"
            title="Menu lateral"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4 md:gap-6 ml-auto">
            <div className="hidden sm:block text-right">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block">Ativos Totais Líquidos</span>
              <span className="text-xl font-bold text-slate-900 italic font-mono leading-tight">
                {(netWorthCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>

            <div className="flex items-center gap-2.5 pl-4 border-l border-slate-200">
              <div className="relative">
                <label className="relative cursor-pointer group" title="Alterar foto de perfil">
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]; if (!file) return;
                      const fd = new FormData(); fd.append('avatar', file);
                      const r = await fetch('/api/users/me/avatar', { method: 'PUT', body: fd });
                      if (r.ok) setUser(prev => ({ ...prev, avatarUrl: `/api/users/me/avatar?t=${Date.now()}` }));
                      e.target.value = '';
                    }}
                  />
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.name}
                      className="w-8 h-8 rounded-full object-cover border border-slate-300 group-hover:opacity-70 transition-opacity" />
                  ) : user.name ? (
                    <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold border border-slate-300 group-hover:opacity-70 transition-opacity select-none">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center border border-slate-300 group-hover:opacity-70 transition-opacity">
                      <Users className="w-4 h-4" />
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[8px] text-white bg-black/60 rounded-full px-1 py-0.5 font-bold leading-none">foto</span>
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowAvatarPicker(v => !v)}
                  title="Escolher avatar"
                  className="absolute -bottom-1 -right-1 w-4 h-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full flex items-center justify-center text-[8px] font-bold transition-colors"
                >✦</button>
                {showAvatarPicker && (
                  <div className="absolute top-10 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-56">
                    <p className="text-[10px] font-bold text-slate-600 uppercase mb-2">Escolher Avatar</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {PRESET_AVATARS.map((url, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={async () => {
                            const r = await fetch('/api/users/me/avatar-url', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ avatarUrl: url }),
                            });
                            if (r.ok) { setUser(prev => ({ ...prev, avatarUrl: url })); setShowAvatarPicker(false); }
                          }}
                          className={`w-9 h-9 rounded-lg overflow-hidden border-2 transition-all hover:scale-110 ${user.avatarUrl === url ? 'border-indigo-500' : 'border-transparent hover:border-indigo-300'}`}
                        >
                          <img src={url} alt={`avatar ${i + 1}`} className="w-full h-full" />
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAvatarPicker(false)}
                      className="mt-2 w-full text-[10px] text-slate-400 hover:text-slate-600 font-semibold"
                    >Fechar</button>
                  </div>
                )}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-[10px] font-bold text-slate-700 leading-none">{user.name}</p>
                <p className="text-[9px] text-slate-400 font-mono mt-0.5">{user.email}</p>
              </div>
            </div>

            <button
              onClick={fetchAllData}
              title="Sincronizar Ledger com Servidor"
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={handleLogout}
              title="Sair"
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 pb-24 lg:pb-8">
          <Suspense fallback={
            <div className="flex items-center justify-center py-24 text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm font-medium">Carregando módulo…</span>
            </div>
          }>

          {/* Dashboard Tab Default Landing */}
          {activeTab === 'DASHBOARD' && (
            <div className="space-y-6">
              
              {/* Dashboard KPI bar */}
              {(() => {
                const now = new Date();
                const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                const monthTxs = transactions.filter(t => t.date.startsWith(monthPrefix));
                const monthIncome = monthTxs.filter(t => t.type === 'REC').reduce((s, t) => s + t.amountInCents, 0);
                const monthExpense = monthTxs.filter(t => t.type === 'DES').reduce((s, t) => s + t.amountInCents, 0);
                const savingsRate = monthIncome > 0 ? ((monthIncome - monthExpense) / monthIncome) * 100 : 0;
                const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                const kpis = [
                  { label: 'Patrimônio Líquido', value: brl(netWorthCents), color: 'text-slate-900', bg: 'bg-white', icon: '💰' },
                  { label: 'Receita (mês)', value: brl(monthIncome), color: 'text-emerald-600', bg: 'bg-emerald-50', icon: '📈' },
                  { label: 'Despesas (mês)', value: brl(monthExpense), color: 'text-rose-600', bg: 'bg-rose-50', icon: '📉' },
                  { label: 'Taxa de Poupança', value: `${savingsRate.toFixed(1)}%`, color: savingsRate >= 20 ? 'text-emerald-600' : savingsRate >= 10 ? 'text-amber-600' : 'text-rose-600', bg: savingsRate >= 20 ? 'bg-emerald-50' : savingsRate >= 10 ? 'bg-amber-50' : 'bg-rose-50', icon: '🏦' },
                ];
                return (
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                    {kpis.map(k => (
                      <div key={k.label} className={`${k.bg} rounded-2xl border border-slate-200 p-5 shadow-sm flex items-center justify-between gap-3`}>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{k.label}</p>
                          <p className={`text-lg font-black font-mono mt-0.5 ${k.color}`}>{k.value}</p>
                        </div>
                        <span className="text-2xl shrink-0">{k.icon}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Quick actions bar */}
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setActiveTab('CORE')} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm">
                  + Lançamento Manual
                </button>
                <button onClick={() => setActiveTab('OPEN_FINANCE')} className="px-3 py-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-xl text-xs font-bold transition-all">
                  Importar Extrato OFX
                </button>
                <button onClick={() => setActiveTab('ANALYTICS')} className="px-3 py-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-xl text-xs font-bold transition-all">
                  Ver Relatórios
                </button>
              </div>

              {/* Market widget — full width */}
              <MarketWidget />

              {/* Main stats layout */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                
                {/* 2 Blocks of analytical summaries */}
                <div className="xl:col-span-2 space-y-6">
                  
                  {/* Health Score Report */}
                  <HealthReport
                    transactions={transactions}
                    budgets={budgets}
                    goals={goals}
                    accounts={accounts}
                  />

                  {/* Miniature Analytics preview */}
                  <AnalyticsModule
                    accounts={accounts}
                    transactions={transactions}
                    budgets={budgets}
                    recurrences={recurrences}
                  />

                  {/* Manual / Open Finance Ledger tables preview */}
                  <CoreFinanceModule
                    accounts={accounts}
                    transactions={transactions}
                    categories={categories}
                    creditCards={creditCards}
                    members={familyMembers}
                    userRole={user.role}
                    userMemberId={user.memberId}
                    onAddTransaction={handleAddTransaction}
                    onEditTransaction={handleEditTransaction}
                    onAddAccount={handleAddAccount}
                    onEditAccount={handleEditAccount}
                    onDeleteAccount={handleDeleteAccount}
                    onDeleteTransaction={handleDeleteTransaction}
                    onImportCSV={handleImportCSV}
                    onAnalyzeDocument={handleAnalyzeDocument}
                  />

                </div>

                {/* Right block: Budgets, Recurrences, Credit Cards */}
                <div className="xl:col-span-1 space-y-6">

                  {/* IA Preditiva teaser */}
                  <div
                    onClick={() => setActiveTab('PREDICTIVE_AI')}
                    className="cursor-pointer bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl p-5 shadow-sm text-white space-y-2 hover:from-indigo-700 hover:to-violet-700 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BrainCircuit className="w-5 h-5 text-white/80" />
                        <p className="text-xs font-black uppercase tracking-wider">IA Preditiva</p>
                      </div>
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-white/20 rounded-full">Novo</span>
                    </div>
                    <p className="text-[11px] text-white/80 leading-relaxed">
                      Analista financeiro IA com acesso a todos os seus dados. Score de saúde, alertas e recomendações personalizadas sem alucinações.
                    </p>
                    <p className="text-[10px] font-bold text-white/60">Clique para abrir →</p>
                  </div>

                  {/* Active budgets sliders small panel */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                    <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider flex items-center justify-between pb-2 border-b border-slate-50">
                      <span>Orçamentos & Alertas</span>
                      <button onClick={() => setActiveTab('BUDGETS')} className="text-indigo-600 hover:text-indigo-800 text-[10px] lowercase font-bold">
                        Ajustar tetos →
                      </button>
                    </h3>

                    <div className="space-y-3 text-xs">
                      {budgets.slice(0, 4).map(b => {
                        const ratio = b.limitInCents > 0 ? b.spentInCents / b.limitInCents : 0;
                        const percent = Math.min(Math.round(ratio * 100), 100);
                        return (
                          <div key={b.id} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-700">{b.category}</span>
                              <span className="font-mono text-[11px] font-bold">
                                R$ {(b.spentInCents / 100).toFixed(0)} de R$ {(b.limitInCents / 100).toFixed(0)}
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${percent}%` }}
                                className={`h-full ${ratio >= 1.0 ? 'bg-rose-500' : ratio >= 0.8 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Upcoming recurrences widget */}
                  {recurrences.length > 0 && (() => {
                    const today = new Date(); today.setHours(0,0,0,0);
                    const upcoming = recurrences
                      .filter(r => {
                        if (!r.isActive) return false;
                        const last = r.lastGeneratedDate ? new Date(r.lastGeneratedDate) : new Date(r.startDate);
                        last.setDate(last.getDate() - 1);
                        const next = new Date(last);
                        if (r.frequency === 'monthly') { next.setMonth(next.getMonth()+1); if (r.dayOfMonth) next.setDate(r.dayOfMonth); }
                        else if (r.frequency === 'weekly') next.setDate(next.getDate()+7);
                        else if (r.frequency === 'daily') next.setDate(next.getDate()+1);
                        else next.setFullYear(next.getFullYear()+1);
                        const diff = Math.ceil((next.getTime()-today.getTime())/86400000);
                        return diff <= 7;
                      })
                      .slice(0, 4);
                    if (!upcoming.length) return null;
                    return (
                      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                        <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider flex items-center justify-between pb-2 border-b border-slate-50">
                          <span className="flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5 text-teal-500" /> Próximos 7 dias</span>
                          <button onClick={() => setActiveTab('RECURRENCES')} className="text-teal-600 hover:text-teal-800 text-[10px] lowercase font-bold">Ver todas →</button>
                        </h3>
                        <div className="space-y-2">
                          {upcoming.map(r => (
                            <div key={r.id} className="flex items-center justify-between text-xs">
                              <span className="font-medium text-slate-700 truncate max-w-[140px]">{r.description}</span>
                              <span className={`font-bold font-mono ${r.type === 'REC' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {r.type === 'REC' ? '+' : '-'}{(r.amountInCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Credit cards summary widget */}
                  {creditCards.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                      <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider flex items-center justify-between pb-2 border-b border-slate-50">
                        <span>💳 Cartões de Crédito</span>
                        <button onClick={() => setActiveTab('CREDIT_CARDS')} className="text-violet-600 hover:text-violet-800 text-[10px] lowercase font-bold">
                          Gerenciar →
                        </button>
                      </h3>
                      <div className="space-y-3">
                        {creditCards.map(card => {
                          const currentMonth = new Date().toISOString().slice(0, 7);
                          const inv = invoices.find(i => i.creditCardId === card.id && i.month === currentMonth);
                          const used = inv?.totalInCents || 0;
                          const pct = card.limitInCents > 0 ? Math.min((used / card.limitInCents) * 100, 100) : 0;
                          return (
                            <div key={card.id} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: card.color }} />
                                  {card.name}
                                </span>
                                <span className="font-mono text-[11px] font-bold text-rose-600">
                                  {(used / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </span>
                              </div>
                              <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                <div style={{ width: `${pct}%`, backgroundColor: card.color }} className="h-full transition-all" />
                              </div>
                              <div className="text-[10px] text-slate-400 flex justify-between">
                                <span>{Math.round(pct)}% do limite</span>
                                <span className="text-emerald-600">Disponível: {((card.limitInCents - used) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </div>

              </div>

            </div>
          )}

          {activeTab === 'CORE' && (
            <CoreFinanceModule
              accounts={accounts}
              transactions={transactions}
              categories={categories}
              creditCards={creditCards}
              members={familyMembers}
              userRole={user.role}
              userMemberId={user.memberId}
              onAddTransaction={handleAddTransaction}
              onEditTransaction={handleEditTransaction}
              onAddAccount={handleAddAccount}
              onEditAccount={handleEditAccount}
              onDeleteAccount={handleDeleteAccount}
              onDeleteTransaction={handleDeleteTransaction}
              onImportCSV={handleImportCSV}
              onAnalyzeDocument={handleAnalyzeDocument}
            />
          )}

          {activeTab === 'CREDIT_CARDS' && (
            <CreditCardModule
              creditCards={creditCards}
              invoices={invoices}
              accounts={accounts}
              transactions={transactions}
              onAddCard={handleAddCreditCard}
              onUpdateCard={handleUpdateCreditCard}
              onDeleteCard={handleDeleteCreditCard}
              onPayInvoice={handlePayInvoice}
              onAnalyzeInvoice={handleAnalyzeInvoice}
              onImportInvoice={handleImportInvoice}
            />
          )}

          {activeTab === 'RECURRENCES' && (
            <RecurrencesModule
              recurrences={recurrences}
              accounts={accounts}
              categories={categories}
              onAdd={handleAddRecurrence}
              onUpdate={handleUpdateRecurrence}
              onDelete={handleDeleteRecurrence}
              onProcessNow={handleProcessRecurrences}
            />
          )}

          {activeTab === 'OPEN_FINANCE' && (
            <OFXImportModule
              accounts={accounts}
              onRefreshAllData={fetchAllData}
            />
          )}

          {activeTab === 'BUDGETS' && (
            <BudgetsModule
              budgets={budgets}
              goals={goals}
              categories={categories}
              onUpdateBudget={handleUpdateBudget}
              onDeleteBudget={handleDeleteBudget}
              onDepositGoal={handleDepositGoal}
              onCreateGoal={handleCreateGoal}
              onDeleteGoal={handleDeleteGoal}
            />
          )}

          {activeTab === 'ANALYTICS' && (
            <AnalyticsModule
              accounts={accounts}
              transactions={transactions}
              budgets={budgets}
              recurrences={recurrences}
            />
          )}

          {activeTab === 'NOTIFICATIONS' && (
            <NotificationsModule
              alerts={alerts}
              onMarkAsRead={handleMarkAlertRead}
              onMarkAllRead={handleMarkAllAlertsRead}
              onClearRead={handleClearReadAlerts}
            />
          )}

          {activeTab === 'FAMILY' && (
            <FamilyModule
              members={familyMembers}
              transactions={transactions}
              onAddMember={handleAddFamilyMember}
              onDeleteMember={handleDeleteFamilyMember}
            />
          )}

          {activeTab === 'CATEGORIES' && (
            <CategoriesModule
              categories={categories}
              onAddCategory={handleAddCategory}
              onEditCategory={handleEditCategory}
              onDeleteCategory={handleDeleteCategory}
            />
          )}

          {activeTab === 'INSTALLMENTS' && (
            <InstallmentsModule
              installmentGroups={installmentGroups}
              accounts={accounts}
              members={familyMembers}
              categories={categories}
              onAddInstallment={handleAddInstallment}
              onCancelInstallment={handleCancelInstallment}
            />
          )}

          {activeTab === 'INVESTMENTS' && (
            <InvestmentsModule
              investments={investments}
              accounts={accounts}
              monthlyIncomeInCents={avgMonthlyIncomeInCents}
              institutionsInSystem={investmentInstitutions}
              onAdd={handleAddInvestment}
              onUpdate={handleUpdateInvestment}
              onDelete={handleDeleteInvestment}
            />
          )}

          {activeTab === 'PREDICTIVE_AI' && (
            <PredictiveAIModule />
          )}

          {activeTab === 'USERS' && (
            <UsersModule
              members={familyMembers}
              userRole={user.role}
              currentUserId={user.id}
            />
          )}

          {activeTab === 'DOCUMENTS' && (
            <DocumentsModule />
          )}

          {activeTab === 'DEBTS' && (
            <DebtModule />
          )}

          </Suspense>
        </main>

        {/* Mobile bottom navigation — app-like UX em telas pequenas */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 flex items-center justify-around px-1 py-1 z-40 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
          {([
            { id: 'DASHBOARD',    label: 'Início',    icon: Building2 },
            { id: 'CORE',         label: 'Contas',    icon: Database },
            { id: 'CREDIT_CARDS', label: 'Cartões',   icon: CreditCardIcon },
            { id: 'ANALYTICS',    label: 'Gráficos',  icon: BarChart3 },
            { id: 'PREDICTIVE_AI',label: 'IA',        icon: BrainCircuit },
          ] as { id: TabType; label: string; icon: React.ElementType }[]).map(item => {
            const Icon = item.icon;
            const isSelected = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-0 ${isSelected ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="text-[9px] font-bold truncate">{item.label}</span>
              </button>
            );
          })}
          {/* More button opens sidebar */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all text-slate-400 hover:text-slate-600"
          >
            <Menu className="w-5 h-5 shrink-0" />
            <span className="text-[9px] font-bold">Mais</span>
          </button>
        </nav>

      </div>

    </div>
  );
}
