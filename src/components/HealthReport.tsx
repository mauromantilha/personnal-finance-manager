import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Target, ShieldCheck, Download, Activity } from 'lucide-react';
import { Transaction, CategoryBudget, FinancialGoal, FinancialAccount } from '../types';

interface HealthReportProps {
  transactions: Transaction[];
  budgets: CategoryBudget[];
  goals: FinancialGoal[];
  accounts: FinancialAccount[];
}

const fmt = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

function ScoreArc({ score }: { score: number }) {
  const color = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : score >= 40 ? '#F97316' : '#EF4444';
  const label = score >= 80 ? 'Excelente' : score >= 60 ? 'Bom' : score >= 40 ? 'Regular' : 'Atenção';
  const circumference = 2 * Math.PI * 52;
  const dash = (score / 100) * circumference;
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-36 h-36">
        <svg className="rotate-[-90deg]" viewBox="0 0 120 120" fill="none">
          <circle cx="60" cy="60" r="52" stroke="#E2E8F0" strokeWidth="12" />
          <circle cx="60" cy="60" r="52" stroke={color} strokeWidth="12"
            strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black text-slate-800" style={{ color }}>{score}</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">/ 100</span>
        </div>
      </div>
      <span className="text-sm font-bold mt-1" style={{ color }}>{label}</span>
    </div>
  );
}

function Metric({ label, value, delta, icon: Icon, color }: {
  label: string; value: string; delta?: number; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-black text-slate-800 mt-0.5">{value}</p>
        {delta !== undefined && (
          <p className={`text-[10px] font-bold mt-0.5 flex items-center gap-0.5 ${delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {delta >= 0 ? '+' : ''}{delta.toFixed(1)}% vs mês anterior
          </p>
        )}
      </div>
    </div>
  );
}

export default function HealthReport({ transactions, budgets, goals, accounts }: HealthReportProps) {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  // Sem contas e sem lançamentos = nada a pontuar (evita score inventado)
  const hasData = accounts.length > 0 || transactions.length > 0;

  const { thisIncome, thisExpense, lastIncome, lastExpense, savingsRate, lastSavingsRate } = useMemo(() => {
    const thisM = transactions.filter(t => t.date.startsWith(thisMonth));
    const lastM = transactions.filter(t => t.date.startsWith(lastMonth));
    const thisIncome = thisM.filter(t => t.type === 'REC').reduce((s, t) => s + t.amountInCents, 0);
    const thisExpense = thisM.filter(t => t.type === 'DES').reduce((s, t) => s + t.amountInCents, 0);
    const lastIncome = lastM.filter(t => t.type === 'REC').reduce((s, t) => s + t.amountInCents, 0);
    const lastExpense = lastM.filter(t => t.type === 'DES').reduce((s, t) => s + t.amountInCents, 0);
    const savingsRate = thisIncome > 0 ? ((thisIncome - thisExpense) / thisIncome) * 100 : 0;
    const lastSavingsRate = lastIncome > 0 ? ((lastIncome - lastExpense) / lastIncome) * 100 : 0;
    return { thisIncome, thisExpense, lastIncome, lastExpense, savingsRate, lastSavingsRate };
  }, [transactions, thisMonth, lastMonth]);

  // Score só com dados reais — sem pontos “de consolação” por ausência de orçamento/meta
  const { score, breakdown } = useMemo(() => {
    if (!hasData) {
      return {
        score: 0,
        breakdown: [
          { label: 'Taxa de Poupança', got: 0, max: 35, detail: 'Sem dados' },
          { label: 'Orçamentos no Verde', got: 0, max: 30, detail: 'Sem dados' },
          { label: 'Progresso de Metas', got: 0, max: 20, detail: 'Sem dados' },
          { label: 'Patrimônio Positivo', got: 0, max: 15, detail: 'Sem dados' },
        ],
      };
    }

    // 1. Savings rate (0–35): exige receita no mês; sem receita = 0
    const savingsScore = thisIncome > 0
      ? Math.min(35, Math.max(0, savingsRate * 1.75))
      : 0;

    // 2. Budget compliance (0–30): sem orçamentos = 0 (não inventa 15)
    const totalBudgets = budgets.length;
    const compliantBudgets = budgets.filter(b => b.limitInCents > 0 && b.spentInCents <= b.limitInCents).length;
    const budgetScore = totalBudgets > 0 ? (compliantBudgets / totalBudgets) * 30 : 0;

    // 3. Goals progress (0–20): sem metas = 0 (não inventa 10)
    const goalScore = goals.length > 0
      ? (goals.reduce((s, g) => s + Math.min(1, g.targetInCents > 0 ? g.currentInCents / g.targetInCents : 0), 0) / goals.length) * 20
      : 0;

    // 4. Positive net worth (0–15): zero patrimônio = 0 (não inventa 7)
    const netWorth = accounts.reduce((s, a) => s + a.balanceInCents, 0);
    const netWorthScore = netWorth > 0 ? 15 : 0;

    const total = Math.round(savingsScore + budgetScore + goalScore + netWorthScore);
    return {
      score: Math.min(100, Math.max(0, total)),
      breakdown: [
        {
          label: 'Taxa de Poupança',
          got: Math.round(savingsScore),
          max: 35,
          detail: thisIncome > 0 ? `${savingsRate.toFixed(1)}%` : 'Sem receita no mês',
        },
        {
          label: 'Orçamentos no Verde',
          got: Math.round(budgetScore),
          max: 30,
          detail: totalBudgets > 0 ? `${compliantBudgets}/${totalBudgets}` : 'Sem orçamentos',
        },
        {
          label: 'Progresso de Metas',
          got: Math.round(goalScore),
          max: 20,
          detail: goals.length > 0 ? `${goals.length} meta${goals.length > 1 ? 's' : ''}` : 'Sem metas',
        },
        {
          label: 'Patrimônio Positivo',
          got: Math.round(netWorthScore),
          max: 15,
          detail: fmt(netWorth),
        },
      ],
    };
  }, [hasData, savingsRate, thisIncome, budgets, goals, accounts]);

  const hasLastMonthActivity = lastIncome > 0 || lastExpense > 0;
  const expenseDelta = hasLastMonthActivity && lastExpense > 0
    ? ((thisExpense - lastExpense) / lastExpense) * 100
    : undefined;
  const incomeDelta = hasLastMonthActivity && lastIncome > 0
    ? ((thisIncome - lastIncome) / lastIncome) * 100
    : undefined;
  const savingsDelta = hasLastMonthActivity && lastIncome > 0
    ? savingsRate - lastSavingsRate
    : undefined;
  const netWorth = accounts.reduce((s, a) => s + a.balanceInCents, 0);

  const handleExportCSV = () => {
    const rows = [
      ['Métrica', 'Valor'],
      ['Mês', thisMonth],
      ['Receita', fmt(thisIncome)],
      ['Despesas', fmt(thisExpense)],
      ['Saldo do Mês', fmt(thisIncome - thisExpense)],
      ['Taxa de Poupança', `${savingsRate.toFixed(1)}%`],
      ['Score de Saúde', String(score)],
      ['Patrimônio Líquido', fmt(netWorth)],
      ...budgets.map(b => [`Orçamento ${b.category}`, `${fmt(b.spentInCents)} / ${fmt(b.limitInCents)} (${pct(b.spentInCents, b.limitInCents)}%)`]),
      ...goals.map(g => [`Meta ${g.name}`, `${fmt(g.currentInCents)} / ${fmt(g.targetInCents)} (${pct(g.currentInCents, g.targetInCents)}%)`]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-saude-${thisMonth}.csv`;
    a.click();
  };

  if (!hasData) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-600" />
          <span className="font-bold text-slate-800 text-sm">Score de Saúde Financeira</span>
        </div>
        <div className="px-6 py-10 text-center">
          <p className="text-sm font-bold text-slate-700">Sem dados para calcular o score</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Cadastre contas e lançamentos reais. O score não usa valores fictícios nem pontos por ausência de orçamento/meta.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-600" />
          <span className="font-bold text-slate-800 text-sm">Score de Saúde Financeira</span>
          <span className="text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-600 px-1.5 py-0.5 rounded-full font-bold uppercase">{thisMonth}</span>
        </div>
        <button onClick={handleExportCSV}
          className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors border border-slate-200">
          <Download className="w-3.5 h-3.5" /> Exportar CSV
        </button>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Score */}
          <div className="flex flex-col items-center justify-center gap-4">
            <ScoreArc score={score} />
            <div className="w-full space-y-2">
              {breakdown.map(b => (
                <div key={b.label}>
                  <div className="flex items-center justify-between text-[10px] mb-0.5">
                    <span className="text-slate-500 font-medium">{b.label}</span>
                    <span className="font-bold text-slate-700">{b.got}/{b.max} · {b.detail}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${b.got >= b.max * 0.7 ? 'bg-emerald-500' : b.got >= b.max * 0.4 ? 'bg-amber-400' : 'bg-rose-500'}`}
                      style={{ width: `${(b.got / b.max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Metrics grid */}
          <div className="lg:col-span-2 grid grid-cols-2 gap-3">
            <Metric label="Receita do Mês" value={fmt(thisIncome)} delta={incomeDelta}
              icon={TrendingUp} color="bg-emerald-50 text-emerald-600" />
            <Metric label="Despesas do Mês" value={fmt(thisExpense)} delta={expenseDelta !== undefined ? -expenseDelta : undefined}
              icon={TrendingDown} color="bg-rose-50 text-rose-600" />
            <Metric label="Taxa de Poupança" value={thisIncome > 0 ? `${savingsRate.toFixed(1)}%` : '—'}
              delta={savingsDelta}
              icon={ShieldCheck} color="bg-indigo-50 text-indigo-600" />
            <Metric label="Patrimônio Líquido" value={fmt(netWorth)}
              icon={Target} color="bg-violet-50 text-violet-600" />

            {/* Budget overview */}
            {budgets.length > 0 && (
              <div className="col-span-2 bg-slate-50 rounded-xl p-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Orçamentos — mês atual</p>
                <div className="space-y-2">
                  {budgets.slice(0, 5).map(b => {
                    const ratio = b.limitInCents > 0 ? b.spentInCents / b.limitInCents : 0;
                    const barColor = ratio >= 1 ? 'bg-rose-500' : ratio >= 0.8 ? 'bg-amber-400' : 'bg-emerald-500';
                    return (
                      <div key={b.id}>
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span className="text-slate-600 font-medium">{b.category}</span>
                          <span className="font-bold text-slate-700">{fmt(b.spentInCents)} / {fmt(b.limitInCents)}</span>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
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
    </div>
  );
}
