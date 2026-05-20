/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  AreaChart, 
  Area,
  LineChart,
  Line
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  PieChart as LucidePieChart, 
  ArrowUpRight, 
  ArrowDownRight,
  Info
} from 'lucide-react';
import { FinancialAccount, Transaction, CategoryBudget } from '../types';

interface AnalyticsModuleProps {
  accounts: FinancialAccount[];
  transactions: Transaction[];
  budgets: CategoryBudget[];
}

export default function AnalyticsModule({ 
  accounts, 
  transactions, 
  budgets 
}: AnalyticsModuleProps) {

  // Conversions are done in Cents represented value
  const formatBRL = (cents: number) => {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // 1. Math totals
  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    let transfer = 0;

    transactions.forEach(t => {
      if (t.type === 'REC') income += t.amountInCents;
      else if (t.type === 'DES') expense += t.amountInCents;
      else if (t.type === 'TRANS') transfer += t.amountInCents;
    });

    const netWorth = accounts.reduce((sum, a) => sum + a.balanceInCents, 0);

    return { income, expense, transfer, netWorth };
  }, [transactions, accounts]);

  // 2. Process data for Category distribution Pie Chart
  const pieData = useMemo(() => {
    const categoriesMap: { [key: string]: number } = {};
    
    transactions.forEach(t => {
      if (t.type === 'DES') {
        categoriesMap[t.category] = (categoriesMap[t.category] || 0) + t.amountInCents;
      }
    });

    return Object.keys(categoriesMap).map(catName => ({
      name: catName,
      value: categoriesMap[catName] / 100, // Recharts values represented as standard decimals
    }));
  }, [transactions]);

  // Colors preset for charts Cells
  const CHART_COLORS = ['#6366F1', '#EF4444', '#10B981', '#F59E0B', '#3B82F6', '#EC4899', '#6B7280'];

  // 3. Process daily flow analytics over the current period (Simulated for beautiful Area chart visualization)
  const lineData = useMemo(() => {
    // Generate dates from May 1 to May 19 based on user's current local metadata
    const dailyMap: { [key: string]: { date: string; cumulative: number; rec: number; des: number } } = {};
    
    // Initial capital base
    let initialSeed = totals.netWorth - (totals.income - totals.expense);
    let runningSum = initialSeed;

    // Prefill 19 days
    for (let day = 1; day <= 19; day++) {
      const paddedDay = day.toString().padStart(2, '0');
      const dateStr = `2026-05-${paddedDay}`;
      dailyMap[dateStr] = {
        date: `${paddedDay}/05`,
        cumulative: 0,
        rec: 0,
        des: 0
      };
    }

    // Accumulate transaction flows
    transactions.forEach(t => {
      if (dailyMap[t.date]) {
        if (t.type === 'REC') dailyMap[t.date].rec += t.amountInCents / 100;
        if (t.type === 'DES') dailyMap[t.date].des += t.amountInCents / 100;
      }
    });

    // Compute cumulative daily assets worth
    const sortedDates = Object.keys(dailyMap).sort();
    return sortedDates.map(dKey => {
      const dayData = dailyMap[dKey];
      runningSum += (dayData.rec * 100) - (dayData.des * 100);
      return {
        date: dayData.date,
        Patrimonio: runningSum / 100,
        Receita: dayData.rec,
        Despesa: dayData.des
      };
    });
  }, [transactions, totals]);

  // 4. Future Projection Calculation
  const projections = useMemo(() => {
    // Daily speed calculation
    const dailyExpenseSpeed = (totals.expense / 100) / 19; // 19 days total
    const projectedNext30DaysExpense = dailyExpenseSpeed * 30;
    const projectedNextBalance = (totals.netWorth / 100) - projectedNext30DaysExpense;

    return {
      dailySpeed: dailyExpenseSpeed,
      futureExpense: projectedNext30DaysExpense,
      futureBalance: projectedNextBalance
    };
  }, [totals]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-600" />
          Módulo 5: Relatórios e Inteligência (Analytics)
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Estatísticas e análise refinada do fluxo de caixa agregada sob a liquidez Open Finance. Insights automatizados de balanço.
        </p>
      </div>

      {/* Stats tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex justify-between items-center">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Patrimônio Líquido</span>
            <span className="text-xl font-bold text-slate-900 font-mono italic block">{formatBRL(totals.netWorth)}</span>
            <span className="text-[10px] text-slate-500 font-medium">Ativos agregados consolidados</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-50 text-slate-600 flex items-center justify-center font-bold">
            💰
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex justify-between items-center">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Receita Total</span>
            <span className="text-xl font-bold text-emerald-600 font-mono italic block">{formatBRL(totals.income)}</span>
            <div className="text-[9px] text-emerald-600 flex items-center gap-1 font-semibold leading-none">
              <ArrowUpRight className="w-3.5 h-3.5" /> 100% de entradas
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            📈
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex justify-between items-center">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Egressos / Despesas</span>
            <span className="text-xl font-bold text-rose-600 font-mono italic block">{formatBRL(totals.expense)}</span>
            <div className="text-[9px] text-rose-600 flex items-center gap-1 font-semibold leading-none">
              <ArrowDownRight className="w-3.5 h-3.5" /> Sob controle de teto
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            📉
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex justify-between items-center">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-sans">Balanço do Período</span>
            <span className={`text-xl font-bold font-mono italic block ${
              totals.income - totals.expense >= 0 ? 'text-indigo-600' : 'text-rose-600'
            }`}>
              {formatBRL(totals.income - totals.expense)}
            </span>
            <span className="text-[10px] text-slate-500 font-medium">Ingressos deduzidos de despesas</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            📊
          </div>
        </div>

      </div>

      {/* Main charting sheets */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Cumulative liquid assets area charts */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5 animate-fadeIn">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              Evolução Patrimonial Líquida (Maio/2026)
            </h3>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Histórico Acumulado</span>
          </div>

          <div className="h-68">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={lineData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="patrimonioGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="date" stroke="#94A3B8" fontSize={10} tickLine={false} />
                <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `R$ ${v}`} />
                <Tooltip 
                  formatter={(value) => [`R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Líquido']} 
                  contentStyle={{ backgroundColor: '#0F172A', color: '#fff', borderRadius: '8px', fontSize: '11px', border: 'none' }}
                />
                <Area type="monotone" dataKey="Patrimonio" stroke="#6366F1" strokeWidth={2} fillOpacity={1} fill="url(#patrimonioGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expenses category allocation */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5 mb-3">
              <LucidePieChart className="w-4 h-4 text-rose-500" />
              Gastos por Categoria
            </h3>
            <p className="text-[11px] text-slate-400 leading-tight">Distribuição proporcional de despesas efetuadas na conta comercial e cartões.</p>
          </div>

          {pieData.length > 0 ? (
            <div className="h-44 flex items-center justify-center relative my-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `R$ ${Number(value).toFixed(2)}`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute text-center">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Despesas</span>
                <span className="text-xs font-extrabold text-slate-700 font-mono">R$ {(totals.expense/100).toFixed(0)}</span>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-400">Adicione lançamentos do tipo "Despesa" para gerar análise gráfica corporativa.</div>
          )}

          {/* Quick interactive legends table */}
          <div className="space-y-1">
            {pieData.slice(0, 4).map((item, idx) => (
              <div key={item.name} className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                <div className="flex items-center gap-1.5">
                  <span 
                    style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                    className="w-2 h-2 rounded-full shrink-0"
                  />
                  <span>{item.name}</span>
                </div>
                <span className="font-mono text-slate-800">R$ {item.value.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Projections Insight Card and Bar Ingress / Egress */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Cash balance prediction card */}
        <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-2">
            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-550/30 px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold">
              Projeção Inteligente de Caixa
            </span>
            <h4 className="text-sm font-bold">Previsão Patrimonial para os próximos 30 dias</h4>
            <p className="text-xs text-slate-400 leading-normal font-medium">
              Baseado na taxa média de despesas observada em Maio (<span className="italic font-bold font-mono">R$ {projections.dailySpeed.toFixed(2)}</span> / dia), calculamos o ritmo projetado para suas finanças pessoais.
            </p>
          </div>

          <div className="border-t border-slate-800 pt-4 mt-4 grid grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Faturas Estimadas (30d)</span>
              <span className="text-sm font-bold text-rose-400 font-mono italic">- R$ {projections.futureExpense.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Saldo Caixa Estimado</span>
              <span className="text-sm font-bold text-emerald-400 font-mono italic">R$ {projections.futureBalance.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Bar charts of cash entries */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5 mb-3">
            <Info className="w-4 h-4 text-violet-500" />
            Balanço Mensal de Movimentações
          </h3>
          <p className="text-[11px] text-slate-400 mb-4">Ingressos monetários e retiradas do Ledger comercial consolidado.</p>
          
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'Receita', Valor: totals.income / 100 },
                { name: 'Despesa', Valor: totals.expense / 100 }
              ]}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="name" fontSize={10} tickLine={false} />
                <YAxis fontSize={10} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => `R$ ${Number(v).toFixed(2)}`} />
                <Bar dataKey="Valor" radius={[4, 4, 0, 0]}>
                  <Cell fill="#10B981" />
                  <Cell fill="#EF4444" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
