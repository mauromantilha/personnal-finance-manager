/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import {
  TrendingUp, TrendingDown, BarChart3, PieChart as LucidePieChart,
  ArrowUpRight, ArrowDownRight, Download, Heart, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { FinancialAccount, Transaction, CategoryBudget, Recurrence } from '../types';

interface AnalyticsModuleProps {
  accounts: FinancialAccount[];
  transactions: Transaction[];
  budgets: CategoryBudget[];
  recurrences?: Recurrence[];
}

type Period = 'current_month' | 'last_month' | 'last_3_months' | 'year_to_date';

const PERIOD_LABELS: Record<Period, string> = {
  current_month: 'Mês atual',
  last_month: 'Mês anterior',
  last_3_months: 'Últimos 3 meses',
  year_to_date: 'Ano atual',
};

const CHART_COLORS = ['#6366F1', '#EF4444', '#10B981', '#F59E0B', '#3B82F6', '#EC4899', '#6B7280', '#14B8A6'];

const fmt = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtShort = (val: number) =>
  val >= 1000 ? `R$${(val / 1000).toFixed(1)}k` : `R$${val.toFixed(0)}`;

function getPeriodRange(period: Period): { startDate: string; endDate: string; label: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const iso = (d: Date) => d.toISOString().split('T')[0];
  const ptLabel = (d: Date) => d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  switch (period) {
    case 'current_month': { const s = new Date(y, m, 1), e = new Date(y, m + 1, 0); return { startDate: iso(s), endDate: iso(e), label: ptLabel(s) }; }
    case 'last_month':    { const s = new Date(y, m - 1, 1), e = new Date(y, m, 0); return { startDate: iso(s), endDate: iso(e), label: ptLabel(s) }; }
    case 'last_3_months': { const s = new Date(y, m - 2, 1), e = new Date(y, m + 1, 0); return { startDate: iso(s), endDate: iso(e), label: 'Últimos 3 meses' }; }
    case 'year_to_date':  { return { startDate: iso(new Date(y, 0, 1)), endDate: iso(now), label: `Ano ${y}` }; }
  }
}

interface MonthlySummary { month: string; income: number; expense: number; balance: number }

export default function AnalyticsModule({ accounts, transactions, budgets, recurrences = [] }: AnalyticsModuleProps) {
  const [period, setPeriod] = useState<Period>('current_month');
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([]);
  const [downloading, setDownloading] = useState(false);

  const { startDate, endDate, label: periodLabel } = useMemo(() => getPeriodRange(period), [period]);

  // Fetch 6-month summary from server
  useEffect(() => {
    fetch('/api/reports/monthly-summary?months=6')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { if (Array.isArray(data)) setMonthlySummary(data); })
      .catch(() => {});
  }, [transactions]);

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
    const savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;
    return { income, expense, netWorth, balance: income - expense, savingsRate };
  }, [filtered, accounts]);

  // Month-over-month change
  const momChange = useMemo(() => {
    if (monthlySummary.length < 2) return null;
    const cur = monthlySummary[monthlySummary.length - 1];
    const prev = monthlySummary[monthlySummary.length - 2];
    if (!prev.expense) return null;
    const pct = ((cur.expense - prev.expense) / prev.expense) * 100;
    return { pct, up: pct > 0 };
  }, [monthlySummary]);

  const pieData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(t => { if (t.type === 'DES') map[t.category] = (map[t.category] || 0) + t.amountInCents; });
    return Object.entries(map).map(([name, value]) => ({ name, value: value / 100 })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  // Top merchants (by description / originalMerchantName)
  const topMerchants = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.filter(t => t.type === 'DES').forEach(t => {
      const key = t.originalMerchantName || t.description;
      map[key] = (map[key] || 0) + t.amountInCents;
    });
    return Object.entries(map).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [filtered]);

  const lineData = useMemo(() => {
    const days: string[] = [];
    const cur = new Date(startDate), end = new Date(endDate);
    while (cur <= end) { days.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1); }
    const dailyMap = new Map(days.map(d => [d, { rec: 0, des: 0 }]));
    filtered.forEach(t => {
      const e = dailyMap.get(t.date);
      if (!e) return;
      if (t.type === 'REC') e.rec += t.amountInCents;
      else if (t.type === 'DES') e.des += t.amountInCents;
    });
    let running = totals.netWorth - totals.balance;
    const useWeeks = days.length > 45;
    if (useWeeks) {
      const weeks: { label: string; rec: number; des: number }[] = [];
      for (let i = 0; i < days.length; i += 7) {
        const sl = days.slice(i, i + 7);
        weeks.push({ label: sl[0].slice(5).replace('-', '/'), rec: sl.reduce((s, d) => s + (dailyMap.get(d)?.rec ?? 0), 0), des: sl.reduce((s, d) => s + (dailyMap.get(d)?.des ?? 0), 0) });
      }
      return weeks.map(w => { running += w.rec - w.des; return { date: w.label, Patrimônio: running / 100, Receita: w.rec / 100, Despesa: w.des / 100 }; });
    }
    return days.map(d => { const day = dailyMap.get(d)!; running += day.rec - day.des; return { date: d.slice(5).replace('-', '/'), Patrimônio: running / 100, Receita: day.rec / 100, Despesa: day.des / 100 }; });
  }, [filtered, startDate, endDate, totals]);

  // Monthly comparison chart data
  const monthlyChartData = useMemo(() =>
    monthlySummary.map(m => ({
      month: m.month.slice(5) + '/' + m.month.slice(2, 4), // "05/26"
      Receita: m.income / 100,
      Despesa: m.expense / 100,
      Balanço: m.balance / 100,
    })),
    [monthlySummary]
  );

  // Fixed monthly expenses from recurrences (for improved projection)
  const fixedMonthlyCost = useMemo(() =>
    recurrences.filter(r => r.isActive && r.frequency === 'monthly' && r.type === 'DES').reduce((s, r) => s + r.amountInCents, 0),
    [recurrences]
  );
  const fixedMonthlyIncome = useMemo(() =>
    recurrences.filter(r => r.isActive && r.frequency === 'monthly' && r.type === 'REC').reduce((s, r) => s + r.amountInCents, 0),
    [recurrences]
  );

  // Health score (0–100)
  const healthScore = useMemo(() => {
    let score = 50;
    if (totals.savingsRate >= 20) score += 20;
    else if (totals.savingsRate >= 10) score += 10;
    else if (totals.savingsRate < 0) score -= 20;
    const budgetOverruns = budgets.filter(b => b.spentInCents > b.limitInCents).length;
    score -= budgetOverruns * 10;
    const netWorthMonths = totals.netWorth > 0 && fixedMonthlyCost > 0 ? totals.netWorth / fixedMonthlyCost : 0;
    if (netWorthMonths >= 6) score += 20;
    else if (netWorthMonths >= 3) score += 10;
    return Math.max(0, Math.min(100, score));
  }, [totals, budgets, fixedMonthlyCost]);

  const healthLabel = healthScore >= 75 ? { text: 'Excelente', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle2, bar: 'bg-emerald-500' }
    : healthScore >= 50 ? { text: 'Bom', color: 'text-indigo-600', bg: 'bg-indigo-50', icon: TrendingUp, bar: 'bg-indigo-500' }
    : healthScore >= 25 ? { text: 'Atenção', color: 'text-amber-600', bg: 'bg-amber-50', icon: AlertTriangle, bar: 'bg-amber-400' }
    : { text: 'Crítico', color: 'text-rose-600', bg: 'bg-rose-50', icon: AlertTriangle, bar: 'bg-rose-500' };

  const handleDownloadCSV = async (dl_period?: { startDate: string; endDate: string }) => {
    setDownloading(true);
    const params = new URLSearchParams();
    if (dl_period) { params.set('startDate', dl_period.startDate); params.set('endDate', dl_period.endDate); }
    try {
      const res = await fetch(`/api/export/transactions.csv?${params}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'transacoes.csv'; a.click();
      URL.revokeObjectURL(url);
    } finally { setDownloading(false); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            Módulo 7: Relatórios & Inteligência Financeira
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Fluxo de caixa · <span className="font-semibold text-slate-700 capitalize">{periodLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleDownloadCSV({ startDate, endDate })} disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all disabled:opacity-50">
            <Download className="w-3.5 h-3.5" /> {downloading ? 'Exportando…' : 'Exportar CSV'}
          </button>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${period === p ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        {[
          { label: 'Patrimônio Líquido', value: fmt(totals.netWorth), color: 'text-slate-900', icon: '💰', sub: 'Ativos consolidados' },
          { label: 'Receita', value: fmt(totals.income), color: 'text-emerald-600', icon: '📈', sub: <span className="flex items-center gap-1 text-emerald-600"><ArrowUpRight className="w-3 h-3" />Entradas</span> },
          { label: 'Despesas', value: fmt(totals.expense), color: 'text-rose-600', icon: '📉',
            sub: momChange ? (
              <span className={`flex items-center gap-1 ${momChange.up ? 'text-rose-500' : 'text-emerald-500'}`}>
                {momChange.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(momChange.pct).toFixed(1)}% vs mês ant.
              </span>
            ) : 'Saídas' },
          { label: 'Balanço', value: fmt(totals.balance), color: totals.balance >= 0 ? 'text-indigo-600' : 'text-rose-600', icon: '📊', sub: 'Receitas − Despesas' },
          { label: 'Taxa de Poupança', value: `${totals.savingsRate.toFixed(1)}%`, color: totals.savingsRate >= 20 ? 'text-emerald-600' : totals.savingsRate >= 10 ? 'text-amber-600' : 'text-rose-600', icon: '🏦', sub: 'Meta: ≥ 20%' },
        ].map(({ label, value, color, icon, sub }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex justify-between items-center">
            <div className="space-y-1 min-w-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">{label}</span>
              <span className={`text-base font-bold font-mono italic block truncate ${color}`}>{value}</span>
              <span className="text-[10px] text-slate-500 font-medium">{sub}</span>
            </div>
            <span className="text-xl ml-2 shrink-0">{icon}</span>
          </div>
        ))}
      </div>

      {/* Health Score + Monthly Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Health Score */}
        <div className={`lg:col-span-3 rounded-2xl border p-6 shadow-sm flex flex-col justify-between ${healthLabel.bg} border-slate-200`}>
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Heart className={`w-4 h-4 ${healthLabel.color}`} />
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Saúde Financeira</span>
            </div>
            <p className={`text-4xl font-black ${healthLabel.color}`}>{healthScore}</p>
            <p className={`text-sm font-bold mt-1 ${healthLabel.color}`}>{healthLabel.text}</p>
            <div className="w-full bg-white/60 h-2 rounded-full mt-3 overflow-hidden">
              <div style={{ width: `${healthScore}%` }} className={`h-full rounded-full transition-all ${healthLabel.bar}`} />
            </div>
          </div>
          <div className="mt-4 space-y-2 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Taxa de poupança</span>
              <span className={`font-bold ${totals.savingsRate >= 20 ? 'text-emerald-600' : totals.savingsRate >= 10 ? 'text-amber-600' : 'text-rose-600'}`}>{totals.savingsRate.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Reserva (meses)</span>
              <span className="font-bold text-slate-700">{fixedMonthlyCost > 0 ? (totals.netWorth / fixedMonthlyCost).toFixed(1) : '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Orçamentos estourados</span>
              <span className={`font-bold ${budgets.filter(b => b.spentInCents > b.limitInCents).length > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {budgets.filter(b => b.spentInCents > b.limitInCents).length}/{budgets.length}
              </span>
            </div>
            {recurrences.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Fixos/mês</span>
                <span className="font-bold text-rose-600">-{fmt(fixedMonthlyCost)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Monthly comparison 6 months */}
        <div className="lg:col-span-9 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-indigo-500" />
              Comparativo Mensal — Últimos 6 meses
            </h3>
          </div>
          {monthlyChartData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-slate-400">Carregando dados históricos…</div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="month" stroke="#94A3B8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={fmtShort} />
                  <Tooltip
                    formatter={(v, name) => [`R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, name]}
                    contentStyle={{ background: '#0F172A', color: '#fff', borderRadius: '8px', fontSize: '11px', border: 'none' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="Receita" fill="#10B981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Despesa" fill="#EF4444" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Balanço" fill="#6366F1" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Area chart + Pie chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-500" /> Evolução Patrimonial
            </h3>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider capitalize">{periodLabel}</span>
          </div>
          {lineData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-sm text-slate-400">Nenhuma transação no período.</div>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={lineData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="patrimonioGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="date" stroke="#94A3B8" fontSize={10} tickLine={false} interval="preserveStartEnd" />
                  <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={fmtShort} />
                  <Tooltip
                    formatter={(v) => [`R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Patrimônio']}
                    contentStyle={{ background: '#0F172A', color: '#fff', borderRadius: '8px', fontSize: '11px', border: 'none' }}
                  />
                  <Area type="monotone" dataKey="Patrimônio" stroke="#6366F1" strokeWidth={2} fillOpacity={1} fill="url(#patrimonioGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
          <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5 mb-1">
            <LucidePieChart className="w-4 h-4 text-rose-500" /> Gastos por Categoria
          </h3>
          <p className="text-[11px] text-slate-400 mb-3">Distribuição de despesas no período.</p>
          {pieData.length > 0 ? (
            <>
              <div className="h-36 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={55} paddingAngle={3} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={v => [`R$ ${Number(v).toFixed(2)}`, 'Gasto']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <span className="text-[9px] text-slate-400 font-bold uppercase block">Total</span>
                    <span className="text-xs font-extrabold text-slate-700 font-mono">
                      {fmt(totals.expense)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-1 mt-2 flex-1 overflow-y-auto">
                {pieData.slice(0, 6).map((item, i) => (
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
              Adicione despesas no período.
            </div>
          )}
        </div>
      </div>

      {/* Top merchants + Projection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Top merchants */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5 mb-4">
            <TrendingDown className="w-4 h-4 text-rose-500" /> Top Gastos por Estabelecimento
          </h3>
          {topMerchants.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">Nenhum gasto no período.</div>
          ) : (
            <div className="space-y-3">
              {topMerchants.map((m, i) => {
                const pct = totals.expense > 0 ? (m.total / totals.expense) * 100 : 0;
                return (
                  <div key={m.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">{i + 1}</span>
                        <span className="font-semibold text-slate-700 truncate max-w-[180px]">{m.name}</span>
                      </div>
                      <span className="font-mono font-bold text-rose-600">-{fmt(m.total)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} className="h-full rounded-full" />
                      </div>
                      <span className="text-[10px] text-slate-400 w-8 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cashflow projection chart */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-indigo-500" /> Cashflow Projetado — 6 meses
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Baseado em recorrências fixas: <span className="text-rose-600 font-bold font-mono">-{fmt(fixedMonthlyCost)}</span> / <span className="text-emerald-600 font-bold font-mono">+{fmt(fixedMonthlyIncome)}</span> / mês
              </p>
            </div>
            <button onClick={() => handleDownloadCSV()} disabled={downloading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50 shrink-0">
              <Download className="w-3 h-3" /> CSV
            </button>
          </div>
          {(() => {
            const net = fixedMonthlyIncome - fixedMonthlyCost;
            const projData = Array.from({ length: 7 }, (_, i) => {
              const d = new Date();
              d.setMonth(d.getMonth() + i);
              const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
              const balance = (totals.netWorth + net * i) / 100;
              return { label, Saldo: Math.round(balance * 100) / 100 };
            });
            return (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={projData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={net >= 0 ? '#10B981' : '#EF4444'} stopOpacity={0.15} />
                        <stop offset="95%" stopColor={net >= 0 ? '#10B981' : '#EF4444'} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="label" stroke="#94A3B8" fontSize={10} tickLine={false} />
                    <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={fmtShort} />
                    <Tooltip
                      formatter={v => [`R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Saldo']}
                      contentStyle={{ background: '#0F172A', color: '#fff', borderRadius: '8px', fontSize: '11px', border: 'none' }}
                    />
                    <Area type="monotone" dataKey="Saldo" stroke={net >= 0 ? '#10B981' : '#EF4444'} strokeWidth={2} fillOpacity={1} fill="url(#projGrad)" dot={{ r: 3, fill: net >= 0 ? '#10B981' : '#EF4444' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            );
          })()}
        </div>
      </div>

    </div>
  );
}
