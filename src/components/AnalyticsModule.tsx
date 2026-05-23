/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import {
  TrendingUp, TrendingDown, BarChart3, PieChart as LucidePieChart,
  ArrowUpRight, ArrowDownRight, Info
} from 'lucide-react';
import { FinancialAccount, Transaction, CategoryBudget } from '../types';

interface AnalyticsModuleProps {
  accounts: FinancialAccount[];
  transactions: Transaction[];
  budgets: CategoryBudget[];
}

type Period = 'current_month' | 'last_month' | 'last_3_months' | 'year_to_date';

const PERIOD_LABELS: Record<Period, string> = {
  current_month: 'Mês atual',
  last_month: 'Mês anterior',
  last_3_months: 'Últimos 3 meses',
  year_to_date: 'Ano atual',
};

const CHART_COLORS = ['#6366F1', '#EF4444', '#10B981', '#F59E0B', '#3B82F6', '#EC4899', '#6B7280'];

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function getPeriodRange(period: Period): { startDate: string; endDate: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const iso = (d: Date) => d.toISOString().split('T')[0];
  const ptLabel = (d: Date) =>
    d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  switch (period) {
    case 'current_month': {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      return { startDate: iso(start), endDate: iso(end), label: ptLabel(start) };
    }
    case 'last_month': {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return { startDate: iso(start), endDate: iso(end), label: ptLabel(start) };
    }
    case 'last_3_months': {
      const start = new Date(y, m - 2, 1);
      const end = new Date(y, m + 1, 0);
      return { startDate: iso(start), endDate: iso(end), label: 'Últimos 3 meses' };
    }
    case 'year_to_date': {
      const start = new Date(y, 0, 1);
      return { startDate: iso(start), endDate: iso(now), label: `Ano ${y}` };
    }
  }
}

export default function AnalyticsModule({ accounts, transactions, budgets }: AnalyticsModuleProps) {
  const [period, setPeriod] = useState<Period>('current_month');

  const { startDate, endDate, label: periodLabel } = useMemo(() => getPeriodRange(period), [period]);

  const filtered = useMemo(
    () => transactions.filter(t => t.date >= startDate && t.date <= endDate),
    [transactions, startDate, endDate]
  );

  const totals = useMemo(() => {
    let income = 0, expense = 0;
    filtered.forEach(t => {
      if (t.type === 'REC') income += t.amountInCents;
      else if (t.type === 'DES') expense += t.amountInCents;
    });
    const netWorth = accounts.reduce((s, a) => s + a.balanceInCents, 0);
    return { income, expense, netWorth, balance: income - expense };
  }, [filtered, accounts]);

  const pieData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(t => {
      if (t.type === 'DES') map[t.category] = (map[t.category] || 0) + t.amountInCents;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: value / 100 }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  // Build daily series across the selected period
  const lineData = useMemo(() => {
    const days: string[] = [];
    const cur = new Date(startDate);
    const end = new Date(endDate);
    while (cur <= end) {
      days.push(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 1);
    }

    const dailyMap = new Map(days.map(d => [d, { rec: 0, des: 0 }]));
    filtered.forEach(t => {
      const entry = dailyMap.get(t.date);
      if (!entry) return;
      if (t.type === 'REC') entry.rec += t.amountInCents;
      else if (t.type === 'DES') entry.des += t.amountInCents;
    });

    // Start from estimated balance at the beginning of the period
    let running = totals.netWorth - totals.balance;

    // For longer periods, aggregate by week to keep chart readable
    const useWeeks = days.length > 45;
    if (useWeeks) {
      const weeks: Array<{ label: string; rec: number; des: number }> = [];
      for (let i = 0; i < days.length; i += 7) {
        const slice = days.slice(i, i + 7);
        const rec = slice.reduce((s, d) => s + (dailyMap.get(d)?.rec ?? 0), 0);
        const des = slice.reduce((s, d) => s + (dailyMap.get(d)?.des ?? 0), 0);
        weeks.push({ label: slice[0].slice(5).replace('-', '/'), rec, des });
      }
      return weeks.map(w => {
        running += w.rec - w.des;
        return { date: w.label, Patrimonio: running / 100, Receita: w.rec / 100, Despesa: w.des / 100 };
      });
    }

    return days.map(d => {
      const day = dailyMap.get(d)!;
      running += day.rec - day.des;
      return {
        date: d.slice(5).replace('-', '/'),
        Patrimonio: running / 100,
        Receita: day.rec / 100,
        Despesa: day.des / 100
      };
    });
  }, [filtered, startDate, endDate, totals]);

  const projection = useMemo(() => {
    const daysInPeriod = lineData.length || 1;
    const dailySpeed = (totals.expense / 100) / daysInPeriod;
    return {
      dailySpeed,
      futureExpense: dailySpeed * 30,
      futureBalance: (totals.netWorth / 100) - dailySpeed * 30
    };
  }, [totals, lineData.length]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            Módulo 5: Relatórios e Inteligência
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Análise do fluxo de caixa · <span className="font-semibold text-slate-700 capitalize">{periodLabel}</span>
          </p>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                period === p
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Patrimônio Líquido', value: formatBRL(totals.netWorth), color: 'text-slate-900', icon: '💰', sub: 'Ativos consolidados' },
          { label: 'Receita Total', value: formatBRL(totals.income), color: 'text-emerald-600', icon: '📈', sub: <span className="flex items-center gap-1 text-emerald-600"><ArrowUpRight className="w-3 h-3" />Entradas no período</span> },
          { label: 'Despesas', value: formatBRL(totals.expense), color: 'text-rose-600', icon: '📉', sub: <span className="flex items-center gap-1 text-rose-600"><ArrowDownRight className="w-3 h-3" />Saídas no período</span> },
          { label: 'Balanço', value: formatBRL(totals.balance), color: totals.balance >= 0 ? 'text-indigo-600' : 'text-rose-600', icon: '📊', sub: 'Receitas − Despesas' },
        ].map(({ label, value, color, icon, sub }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex justify-between items-center">
            <div className="space-y-1 min-w-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">{label}</span>
              <span className={`text-lg font-bold font-mono italic block truncate ${color}`}>{value}</span>
              <span className="text-[10px] text-slate-500 font-medium">{sub}</span>
            </div>
            <span className="text-2xl ml-2 shrink-0">{icon}</span>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Area chart */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              Evolução Patrimonial
            </h3>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider capitalize">{periodLabel}</span>
          </div>
          {lineData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-slate-400">
              Nenhuma transação no período selecionado.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={lineData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="patrimonioGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="date" stroke="#94A3B8" fontSize={10} tickLine={false} interval="preserveStartEnd" />
                  <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false}
                    tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v) => [`R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Patrimônio']}
                    contentStyle={{ background: '#0F172A', color: '#fff', borderRadius: '8px', fontSize: '11px', border: 'none' }}
                  />
                  <Area type="monotone" dataKey="Patrimonio" stroke="#6366F1" strokeWidth={2}
                    fillOpacity={1} fill="url(#patrimonioGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Pie chart */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
          <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5 mb-1">
            <LucidePieChart className="w-4 h-4 text-rose-500" />
            Gastos por Categoria
          </h3>
          <p className="text-[11px] text-slate-400 mb-3">Distribuição proporcional de despesas no período.</p>

          {pieData.length > 0 ? (
            <>
              <div className="h-40 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={60}
                      paddingAngle={3} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={v => `R$ ${Number(v).toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <span className="text-[9px] text-slate-400 font-bold uppercase block">Total</span>
                    <span className="text-xs font-extrabold text-slate-700 font-mono">
                      R$ {(totals.expense / 100).toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-1 mt-2">
                {pieData.slice(0, 5).map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="truncate max-w-[100px]">{item.name}</span>
                    </div>
                    <span className="font-mono text-slate-800">R$ {item.value.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-400 text-center">
              Adicione despesas no período para visualizar a distribuição.
            </div>
          )}
        </div>
      </div>

      {/* Projection + Bar chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-2">
            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold">
              Projeção de Caixa — 30 dias
            </span>
            <h4 className="text-sm font-bold">Previsão baseada no ritmo atual</h4>
            <p className="text-xs text-slate-400 leading-normal">
              Taxa média de gastos no período:{' '}
              <span className="font-bold font-mono text-white">R$ {projection.dailySpeed.toFixed(2)}/dia</span>
            </p>
          </div>
          <div className="border-t border-slate-800 pt-4 mt-4 grid grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Gastos Estimados</span>
              <span className="text-sm font-bold text-rose-400 font-mono italic">
                - R$ {projection.futureExpense.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Saldo Estimado</span>
              <span className={`text-sm font-bold font-mono italic ${projection.futureBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                R$ {projection.futureBalance.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5 mb-1">
            <Info className="w-4 h-4 text-violet-500" />
            Balanço do Período
          </h3>
          <p className="text-[11px] text-slate-400 mb-4">Receitas vs despesas consolidadas.</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'Receita', Valor: totals.income / 100 },
                { name: 'Despesa', Valor: totals.expense / 100 }
              ]}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="name" fontSize={10} tickLine={false} />
                <YAxis fontSize={10} axisLine={false} tickLine={false}
                  tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={v => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
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
