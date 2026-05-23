/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Shield,
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
  LogOut
} from 'lucide-react';

// Subcomponents imports
import AuthModule from './components/AuthModule';
import CoreFinanceModule from './components/CoreFinanceModule';
import CreditCardModule from './components/CreditCardModule';
import OpenFinanceModule from './components/OpenFinanceModule';
import BudgetsModule from './components/BudgetsModule';
import AnalyticsModule from './components/AnalyticsModule';
import NotificationsModule from './components/NotificationsModule';
import AIAdvisor from './components/AIAdvisor';
import LoginScreen from './components/LoginScreen';

import {
  UserProfile,
  FinancialAccount,
  Transaction,
  BankConnection,
  CategoryBudget,
  FinancialGoal,
  NotificationAlert,
  ChatMessage,
  Category,
  CreditCard,
  Invoice
} from './types';

type TabType = 'DASHBOARD' | 'AUTH' | 'CORE' | 'CREDIT_CARDS' | 'OPEN_FINANCE' | 'BUDGETS' | 'ANALYTICS' | 'NOTIFICATIONS';

export default function App() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<TabType>('DASHBOARD');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Authenticated Profile Simulation
  const [user, setUser] = useState<UserProfile>({
    id: 'user-001',
    name: 'MKS Consultoria e Inovação',
    email: 'comercial@mksbrasil.com',
    mfaEnabled: false,
    mfaPendingSetup: false,
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256&auto=format&fit=crop'
  });

  // State loaded from the backend APIs
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [alerts, setAlerts] = useState<NotificationAlert[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const fetchAllData = useCallback(async () => {
    try {
      const response = await fetch('/api/data');
      if (response.status === 401) { setIsAuthenticated(false); return; }
      if (response.ok) {
        const data = await response.json();
        setAccounts(data.accounts || []);
        setConnections(data.connections || []);
        setTransactions(data.transactions || []);
        setBudgets(data.budgets || []);
        setGoals(data.goals || []);
        setAlerts(data.alerts || []);
        setCategories(data.categories || []);
        setCreditCards(data.creditCards || []);
        setInvoices(data.invoices || []);
        if (data.chatHistory && data.chatHistory.length > 0) {
          setChatHistory(data.chatHistory);
        }
      }
    } catch (e) {
      console.error('Error fetching dashboard database from server:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    async function initialize() {
      try {
        const res = await fetch('/api/auth/status');
        const { authenticated } = await res.json();
        setIsAuthenticated(authenticated);
        if (authenticated) await fetchAllData();
        else setIsLoading(false);
      } catch {
        setIsAuthenticated(false);
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
      console.error(err);
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
    } catch (err) {
      console.error(err);
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
      console.error(err);
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
      console.error(err);
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
      console.error(err);
    }
    return false;
  };

  const handleDeleteTransaction = async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
      if (response.ok) {
        await fetchAllData();
        return true;
      }
    } catch (err) {
      console.error(err);
    }
    return false;
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
    } catch (err) { console.error(err); }
    return false;
  };

  const handleUpdateCreditCard = async (id: string, data: any): Promise<boolean> => {
    try {
      const res = await fetch(`/api/credit-cards/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (res.ok) { await fetchAllData(); return true; }
    } catch (err) { console.error(err); }
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

  const handleTriggerSync = async (bankName: string) => {
    try {
      const response = await fetch('/api/open-finance/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankName })
      });
      if (response.ok) {
        const body = await response.json();
        // Update connections state instantly to syncing
        setConnections(prev => prev.map(c => c.institutionName.toLowerCase() === bankName.toLowerCase() ? { ...c, status: 'SYNCING' } : c));
        return body;
      }
    } catch (err) {
      console.error(err);
    }
    return null;
  };

  const handleSendMessage = async (text: string): Promise<string | null> => {
    const newUserMsg: ChatMessage = {
      id: `m-usr-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatHistory(prev => [...prev, newUserMsg]);

    try {
      const response = await fetch('/api/groq/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      
      if (response.ok) {
        const body = await response.json();
        const responseText = body.reply || "Tivemos um problema para estruturar a análise.";
        
        const newBotMsg: ChatMessage = {
          id: `m-bot-${Date.now()}`,
          sender: 'assistant',
          text: responseText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        
        setChatHistory(prev => [...prev, newBotMsg]);
        return responseText;
      }
    } catch (err) {
      console.error(err);
    }
    return null;
  };

  const handleClearHistory = () => {
    setChatHistory([]);
  };

  const handleResetDB = async () => {
    if (confirm('Deseja reiniciar todas as contas do ledger para o estado original?')) {
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

  const handleLogin = async (password: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (res.ok) {
        setIsAuthenticated(true);
        await fetchAllData();
        return true;
      }
    } catch {
      // ignore network errors
    }
    return false;
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setIsAuthenticated(false);
    setAccounts([]);
    setConnections([]);
    setTransactions([]);
    setBudgets([]);
    setGoals([]);
    setAlerts([]);
    setChatHistory([]);
    setCategories([]);
    setCreditCards([]);
    setInvoices([]);
  };

  // Nav configuration
  const sidebarNavItems: { id: TabType; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'DASHBOARD',    label: 'Estatísticas Gerais',         icon: Building2 },
    { id: 'AUTH',         label: 'Módulo 1: Auth & IAM',        icon: Shield },
    { id: 'CORE',         label: 'Módulo 2: Contas & Ledger',   icon: Database },
    { id: 'CREDIT_CARDS', label: 'Módulo 3: Cartões & Faturas', icon: CreditCardIcon },
    { id: 'OPEN_FINANCE', label: 'Módulo 4: Open Finance',      icon: Network },
    { id: 'BUDGETS',      label: 'Módulo 5: Planejamento',      icon: Target },
    { id: 'ANALYTICS',    label: 'Módulo 6: Relatórios',        icon: BarChart3 },
    { id: 'NOTIFICATIONS',label: 'Módulo 7: Notificações',      icon: Bell, badge: unreadAlertsCount },
  ];

  if (isLoading || isAuthenticated === null) {
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

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col antialiased">
      
      {/* Upper Global Header / Status indicators */}
      <header className="sticky top-0 z-45 bg-white text-slate-800 px-6 md:px-8 py-4 flex items-center justify-between border-b border-slate-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg lg:hidden transition-colors"
            title="Menu lateral"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-lg font-bold shadow-sm">
              M
            </span>
            <div>
              <h1 className="font-black text-xs md:text-sm tracking-widest text-indigo-600 uppercase">MKS OPEN FINANCE</h1>
              <p className="text-[9px] text-slate-400 font-bold leading-none uppercase tracking-wider">Controle de Gastos e Ativos Inteligente</p>
            </div>
          </div>
        </div>

        {/* Aggregate Worth Tracker */}
        <div className="flex items-center gap-4 md:gap-6">
          <div className="hidden sm:block text-right">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block">Ativos Totais Líquidos</span>
            <span className="text-xl font-bold text-slate-900 italic font-mono leading-tight">
              {(netWorthCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>

          {/* User profile dropdown simple info */}
          <div className="flex items-center gap-2.5 pl-4 border-l border-slate-200">
            <img 
              referrerPolicy="no-referrer"
              src={user.avatarUrl} 
              alt={user.name} 
              className="w-8 h-8 rounded-full object-cover border border-slate-300"
            />
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

      {/* Primary body grid */}
      <div className="flex-1 flex relative">
        
        {/* Sidebar Nav section */}
        <aside className={`w-72 bg-slate-900 text-slate-100 border-r border-slate-800 flex flex-col justify-between p-5 absolute lg:relative inset-y-0 left-0 z-40 transition-transform lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          
          <div className="space-y-6">
            <div className="flex items-center justify-between lg:hidden pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Navegar Módulos</span>
              <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-slate-100 p-1 rounded-md hover:bg-slate-800">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <nav className="space-y-1 pt-2">
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
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                      isSelected 
                        ? 'bg-indigo-500/10 text-indigo-400 shadow-xs' 
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4.5 h-4.5 shrink-0 ${isSelected ? 'text-indigo-400' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>

                    {item.badge !== undefined && item.badge > 0 ? (
                      <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-extrabold ${isSelected ? 'bg-indigo-900/50 text-indigo-300' : 'bg-rose-500/20 text-rose-400'}`}>
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Quick config settings inside sidebar bottom */}
          <div className="pt-4 border-t border-slate-800 space-y-3.5">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-400" /> Servidor Ativo: Express JS
            </div>
            
            <button 
              onClick={handleResetDB}
              className="w-full text-left text-[10px] font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-3 py-1.5 rounded-lg transition-all uppercase tracking-widest"
            >
              Excluir Lançamentos Manuais
            </button>
          </div>
        </aside>

        {/* Content canvas container */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
          
          {/* Dashboard Tab Default Landing */}
          {activeTab === 'DASHBOARD' && (
            <div className="space-y-6">
              
              {/* Top Banner Alert / Open Finance connection guide info */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 animate-fadeIn">
                <div className="space-y-1 my-0.5">
                  <span className="text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-700 font-black uppercase px-2 py-0.5 rounded-full">
                    Plataforma Consolidada
                  </span>
                  <h2 className="text-lg font-black text-slate-800 tracking-tight">Visão Consolidada de Caixa</h2>
                  <p className="text-xs text-slate-500 max-w-xl font-medium">
                    Centralize contas correntes, cartões e poupanças de forma unificada no Brasil. Obtenha categorização automatizada de faturas bancárias com auxílio da inteligência analítica Gemini.
                  </p>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button 
                    onClick={() => setActiveTab('OPEN_FINANCE')}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                  >
                    Vincular Novo Banco via Open Finance
                  </button>
                  <button 
                    onClick={() => setActiveTab('CORE')}
                    className="px-3 py-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-xl text-xs font-bold transition-all"
                  >
                    Fazer Lançamento Manual
                  </button>
                </div>
              </div>

              {/* Main stats layout */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                
                {/* 2 Blocks of analytical summaries */}
                <div className="xl:col-span-2 space-y-6">
                  
                  {/* Miniature Analytics preview */}
                  <AnalyticsModule 
                    accounts={accounts}
                    transactions={transactions}
                    budgets={budgets}
                  />

                  {/* Manual / Open Finance Ledger tables preview */}
                  <CoreFinanceModule
                    accounts={accounts}
                    transactions={transactions}
                    categories={categories}
                    creditCards={creditCards}
                    onAddTransaction={handleAddTransaction}
                    onAddAccount={handleAddAccount}
                    onDeleteTransaction={handleDeleteTransaction}
                  />

                </div>

                {/* Right block: AI Advisor Chatbot panel & Alerts summaries */}
                <div className="xl:col-span-1 space-y-6">
                  
                  {/* AI Executive Coach Form */}
                  <AIAdvisor 
                    chatHistory={chatHistory}
                    onSendMessage={handleSendMessage}
                    onClearHistory={handleClearHistory}
                  />

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

          {/* Tab Route Selection pages */}
          {activeTab === 'AUTH' && (
            <AuthModule user={user} onUpdateUser={setUser} />
          )}

          {activeTab === 'CORE' && (
            <CoreFinanceModule
              accounts={accounts}
              transactions={transactions}
              categories={categories}
              creditCards={creditCards}
              onAddTransaction={handleAddTransaction}
              onAddAccount={handleAddAccount}
              onDeleteTransaction={handleDeleteTransaction}
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
            />
          )}

          {activeTab === 'OPEN_FINANCE' && (
            <OpenFinanceModule 
              connections={connections}
              onTriggerSync={handleTriggerSync}
              onRefreshAllData={fetchAllData}
            />
          )}

          {activeTab === 'BUDGETS' && (
            <BudgetsModule 
              budgets={budgets}
              goals={goals}
              onUpdateBudget={handleUpdateBudget}
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
            />
          )}

          {activeTab === 'NOTIFICATIONS' && (
            <NotificationsModule 
              alerts={alerts}
              onMarkAsRead={handleMarkAlertRead}
            />
          )}

        </main>

      </div>

    </div>
  );
}
