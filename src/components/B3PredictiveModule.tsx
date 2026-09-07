/**
 * Módulo de Análise Preditiva e Probabilística Bovespa / B3
 * MKS Finanças
 * 
 * Ferramentas implementadas:
 * - Simulação de Monte Carlo com Movimento Browniano Geométrico (1.000 iterações)
 * - Value at Risk (VaR 95% e 99%) & Conditional VaR (CVaR / Expected Shortfall)
 * - Otimização de Portfólio de Markowitz (Fronteira Eficiente)
 * - Métricas de Sensibilidade (Sharpe, Sortino, Drawdown)
 * - Em estrita conformidade com as Resoluções CVM 19/2021 e CVM 20/2021
 */

import { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, Line, ComposedChart,
} from 'recharts';
import {
  TrendingUp, ShieldAlert, Target, BarChart3, HelpCircle,
  Sliders, ArrowUpRight, Scale, Info, Layers, Compass, CheckCircle2,
} from 'lucide-react';
import {
  simulateMonteCarloGBM,
  calculateRiskMetrics,
  calculateEfficientFrontier,
  PortfolioAssetInput,
} from '../lib/quantitative-math';

const DEFAULT_B3_ASSETS: PortfolioAssetInput[] = [
  { symbol: 'IBOV',  name: 'Índice Bovespa (ETF BOVA11)', weight: 0.35, expectedAnnualReturn: 14.5, annualVolatility: 18.0 },
  { symbol: 'PETR4', name: 'Petrobras PN',               weight: 0.20, expectedAnnualReturn: 16.5, annualVolatility: 26.0 },
  { symbol: 'VALE3', name: 'Vale ON',                    weight: 0.15, expectedAnnualReturn: 13.8, annualVolatility: 24.0 },
  { symbol: 'ITUB4', name: 'Itaú Unibanco PN',           weight: 0.15, expectedAnnualReturn: 15.0, annualVolatility: 17.5 },
  { symbol: 'WEGE3', name: 'WEG ON',                     weight: 0.15, expectedAnnualReturn: 17.0, annualVolatility: 22.0 },
];

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function B3PredictiveModule() {
  const [initialAmount, setInitialAmount] = useState<number>(20000);
  const [monthlyContrib, setMonthlyContrib] = useState<number>(1000);
  const [years, setYears] = useState<number>(3);
  const [targetGoal, setTargetGoal] = useState<number>(80000);
  const [activeSubTab, setActiveSubTab] = useState<'monte_carlo' | 'risk_var' | 'markowitz'>('monte_carlo');

  // Ativos e pesos configuráveis
  const [assets, setAssets] = useState<PortfolioAssetInput[]>(DEFAULT_B3_ASSETS);

  // Retorno e volatilidade consolidados da carteira ponderada
  const portfolioStats = useMemo(() => {
    let ret = 0;
    let vol = 0;
    for (const a of assets) {
      ret += a.weight * a.expectedAnnualReturn;
      vol += a.weight * a.annualVolatility; // aproximação linear conservadora para resumo
    }
    return {
      returnAnnual: +ret.toFixed(2),
      volatilityAnnual: +vol.toFixed(2),
    };
  }, [assets]);

  // 1. Simulação Monte Carlo (1.000 iterações)
  const monteCarlo = useMemo(() => {
    return simulateMonteCarloGBM({
      initialAmount,
      monthlyContribution: monthlyContrib,
      expectedAnnualReturnPct: portfolioStats.returnAnnual,
      annualVolatilityPct: portfolioStats.volatilityAnnual,
      months: years * 12,
      simulationsCount: 1000,
      targetAmount: targetGoal > 0 ? targetGoal : undefined,
    });
  }, [initialAmount, monthlyContrib, portfolioStats, years, targetGoal]);

  // Dados formatados para o gráfico Recharts
  const chartData = useMemo(() => {
    return monteCarlo.periods.map((m) => {
      const isYear = m % 12 === 0;
      const label = m === 0 ? 'Início' : isYear ? `${m / 12} ano(s)` : `${m}m`;
      return {
        month: label,
        p10: monteCarlo.percentile10[m],
        p50: monteCarlo.percentile50[m],
        p90: monteCarlo.percentile90[m],
        investido: initialAmount + monthlyContrib * m,
        path1: monteCarlo.samplePaths[0]?.[m],
        path2: monteCarlo.samplePaths[1]?.[m],
        path3: monteCarlo.samplePaths[2]?.[m],
      };
    });
  }, [monteCarlo, initialAmount, monthlyContrib]);

  // 2. Value at Risk (VaR) e Métricas de Risco
  const riskMetrics = useMemo(() => {
    return calculateRiskMetrics({
      portfolioValue: initialAmount,
      expectedAnnualReturnPct: portfolioStats.returnAnnual,
      annualVolatilityPct: portfolioStats.volatilityAnnual,
      riskFreeRatePct: 10.5,
    });
  }, [initialAmount, portfolioStats]);

  // 3. Fronteira Eficiente de Markowitz
  const markowitz = useMemo(() => {
    return calculateEfficientFrontier(assets, 10.5, 15);
  }, [assets]);

  // Handler para ajuste de peso de ativos
  const handleWeightChange = (symbol: string, newWeightPct: number) => {
    const updated = assets.map(a => a.symbol === symbol ? { ...a, weight: Math.max(0, newWeightPct / 100) } : a);
    const sum = updated.reduce((s, a) => s + a.weight, 0);
    if (sum > 0) {
      setAssets(updated.map(a => ({ ...a, weight: +(a.weight / sum).toFixed(4) })));
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Banner Superior ─────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 border border-slate-700/70 shadow-lg relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-[11px] font-bold rounded-full mb-3">
            <Compass className="w-3.5 h-3.5" /> Análise Preditiva Quantitativa B3
          </div>
          <h2 className="text-xl font-black tracking-tight text-white mb-2">
            Simulador Probabilístico de Ações &amp; FIIs
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Utilize modelos quantitativos modernos (Monte Carlo estocástico com Movimento Browniano, Value at Risk e Fronteira de Markowitz) para simular o comportamento estatístico da sua carteira na B3.
          </p>
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none" />
      </div>

      {/* ── Submenu de Ferramentas Preditivas ─────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1">
        {[
          { id: 'monte_carlo', label: '1. Monte Carlo Estocástico', icon: TrendingUp },
          { id: 'risk_var',    label: '2. Value at Risk (VaR & CVaR)', icon: ShieldAlert },
          { id: 'markowitz',   label: '3. Fronteira de Markowitz', icon: Scale },
        ].map(tab => {
          const Icon = tab.icon;
          const isAct = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
                isAct
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Parâmetros de Entrada Interativos ─────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-xs font-black text-slate-800">
            <Sliders className="w-4 h-4 text-indigo-600" />
            <span>Premissas da Simulação da Carteira</span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Retorno ponderado: <strong className="text-emerald-600">{portfolioStats.returnAnnual}% a.a.</strong> · Volatilidade: <strong className="text-slate-700">{portfolioStats.volatilityAnnual}% a.a.</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">Patrimônio Inicial (R$)</label>
            <input
              type="number"
              min="0"
              step="1000"
              value={initialAmount}
              onChange={e => setInitialAmount(Math.max(0, Number(e.target.value)))}
              className="w-full text-xs font-bold px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">Aporte Mensal (R$)</label>
            <input
              type="number"
              min="0"
              step="100"
              value={monthlyContrib}
              onChange={e => setMonthlyContrib(Math.max(0, Number(e.target.value)))}
              className="w-full text-xs font-bold px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">Horizonte Temporal</label>
            <select
              value={years}
              onChange={e => setYears(Number(e.target.value))}
              className="w-full text-xs font-bold px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            >
              <option value="1">1 ano (12 meses)</option>
              <option value="2">2 anos (24 meses)</option>
              <option value="3">3 anos (36 meses)</option>
              <option value="5">5 anos (60 meses)</option>
              <option value="10">10 anos (120 meses)</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">Meta Financeira Alvo (R$)</label>
            <input
              type="number"
              min="0"
              step="5000"
              value={targetGoal}
              onChange={e => setTargetGoal(Math.max(0, Number(e.target.value)))}
              className="w-full text-xs font-bold px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Alocação dos ativos da cesta */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Composição Ponderada da Cesta B3</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {assets.map(asset => (
              <div key={asset.symbol} className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-extrabold text-slate-900">{asset.symbol}</span>
                  <span className="text-[10px] font-bold text-indigo-600">{Math.round(asset.weight * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(asset.weight * 100)}
                  onChange={e => handleWeightChange(asset.symbol, Number(e.target.value))}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                  <span>Ret: {asset.expectedAnnualReturn}%</span>
                  <span>Vol: {asset.annualVolatility}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── ABA 1: Simulação Monte Carlo Estocástica ─────────────────────────── */}
      {activeSubTab === 'monte_carlo' && (
        <div className="space-y-6">
          {/* Cards de Resumo Probabilístico */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Cenário Mediano (P50)</span>
              <p className="text-xl font-black text-slate-900">{fmtBRL(monteCarlo.percentile50[monteCarlo.percentile50.length - 1] || 0)}</p>
              <p className="text-[11px] text-slate-500 mt-1">Retorno esperado mais provável no prazo</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-500 block mb-1">Cenário Estresse (P10)</span>
              <p className="text-xl font-black text-rose-600">{fmtBRL(monteCarlo.percentile10[monteCarlo.percentile10.length - 1] || 0)}</p>
              <p className="text-[11px] text-slate-500 mt-1">90% das trajetórias superam este valor</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 block mb-1">Cenário Otimista (P90)</span>
              <p className="text-xl font-black text-emerald-600">{fmtBRL(monteCarlo.percentile90[monteCarlo.percentile90.length - 1] || 0)}</p>
              <p className="text-[11px] text-slate-500 mt-1">10% das trajetórias mais favoráveis</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 block mb-1">Prob. de Atingir Meta</span>
              <p className="text-xl font-black text-indigo-600">
                {monteCarlo.targetProbability !== undefined ? `${monteCarlo.targetProbability}%` : `${monteCarlo.probPositiveReturn}%`}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {monteCarlo.targetProbability !== undefined
                  ? `Chance de alcançar ${fmtBRL(targetGoal)}`
                  : 'Probabilidade de retorno positivo'}
              </p>
            </div>
          </div>

          {/* Gráfico do Cone de Incerteza Monte Carlo */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
              <div>
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-600" />
                  Cone de Dispersão Estocástica (1.000 Trajetórias Simuladas)
                </h4>
                <p className="text-xs text-slate-500">
                  Envelopes de percentis estatísticos demonstrando a dispersão do patrimônio ao longo dos meses.
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500" /> Otimista (P90)</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-indigo-600" /> Mediana (P50)</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-500/20 border border-rose-500" /> Estresse (P10)</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-slate-400" /> Capital Investido</span>
              </div>
            </div>

            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tickFormatter={v => `R$ ${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip
                    formatter={(val: any, name: any) => [
                      fmtBRL(Number(val)),
                      name === 'p90' ? 'Cenário Otimista (P90)' :
                      name === 'p50' ? 'Cenário Mediano (P50)' :
                      name === 'p10' ? 'Cenário Estresse (P10)' :
                      name === 'investido' ? 'Total Aportado' : String(name ?? ''),
                    ]}
                    contentStyle={{ borderRadius: '12px', fontSize: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  />
                  {/* Faixa P90 */}
                  <Area type="monotone" dataKey="p90" stroke="#10b981" fill="#10b981" fillOpacity={0.12} strokeWidth={1.5} />
                  {/* Faixa P50 */}
                  <Line type="monotone" dataKey="p50" stroke="#4f46e5" strokeWidth={3} dot={false} />
                  {/* Faixa P10 */}
                  <Area type="monotone" dataKey="p10" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.15} strokeWidth={1.5} />
                  {/* Linha de Custo Investido */}
                  <Line type="monotone" dataKey="investido" stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── ABA 2: Value at Risk (VaR) & CVaR ─────────────────────────────────── */}
      {activeSubTab === 'risk_var' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-l-4 border-l-amber-500">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">VaR Mensal 95% (1 Mês)</span>
              <p className="text-2xl font-black text-amber-600">{fmtBRL(riskMetrics.var95Monthly)}</p>
              <p className="text-xs text-slate-600 mt-1 font-semibold">{riskMetrics.var95MonthlyPct}% do patrimônio</p>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                Em 95% dos meses, a perda máxima estimada não excederá este valor em condições normais de mercado.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-l-4 border-l-rose-500">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">VaR Extremo 99% (1 Mês)</span>
              <p className="text-2xl font-black text-rose-600">{fmtBRL(riskMetrics.var99Monthly)}</p>
              <p className="text-xs text-slate-600 mt-1 font-semibold">{riskMetrics.var99MonthlyPct}% do patrimônio</p>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                Limite de perda esperado para os 1% dos meses de maior volatilidade (cenários de crise).
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm border-l-4 border-l-purple-500">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">CVaR 95% (Expected Shortfall)</span>
              <p className="text-2xl font-black text-purple-600">{fmtBRL(riskMetrics.cvar95Monthly)}</p>
              <p className="text-xs text-slate-600 mt-1 font-semibold">{riskMetrics.cvar95MonthlyPct}% do patrimônio</p>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                Média da perda caso o cenário de estresse ultrapasse o limite do VaR 95% (risco de cauda).
              </p>
            </div>
          </div>

          {/* Métricas Adicionais de Qualidade */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h4 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              Métricas Quantitativas de Eficiência e Risco
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Índice Sharpe</span>
                <span className="text-xl font-black text-indigo-600">{riskMetrics.sharpeRatio}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Excedente / Risco</span>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Índice Sortino</span>
                <span className="text-xl font-black text-emerald-600">{riskMetrics.sortinoRatio}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Downside Risk</span>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Volatilidade Anual</span>
                <span className="text-xl font-black text-slate-800">{riskMetrics.annualVolatility}%</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Oscilação esperada</span>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Max Drawdown Est.</span>
                <span className="text-xl font-black text-rose-600">{riskMetrics.maxHistoricalDrawdown}%</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Queda de pico a vale</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ABA 3: Fronteira Eficiente de Markowitz ──────────────────────────── */}
      {activeSubTab === 'markowitz' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Gráfico da Fronteira Eficiente */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h4 className="text-sm font-black text-slate-900 mb-2 flex items-center gap-2">
                <Scale className="w-4 h-4 text-indigo-600" />
                Curva da Fronteira Eficiente (Risco x Retorno)
              </h4>
              <p className="text-xs text-slate-500 mb-4">
                Carteiras ótimas que oferecem o maior retorno esperado para cada nível de risco.
              </p>

              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="volatility" name="Risco (Volatilidade %)" unit="%" tick={{ fontSize: 11 }} label={{ value: 'Volatilidade (%)', position: 'insideBottom', offset: -5, fontSize: 11 }} />
                    <YAxis dataKey="expectedReturn" name="Retorno Esperado (%)" unit="%" tick={{ fontSize: 11 }} label={{ value: 'Retorno (% a.a.)', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                    <Tooltip
                      formatter={(val: any, name: any) => [`${Number(val).toFixed(2)}%`, String(name ?? '')]}
                      contentStyle={{ borderRadius: '12px', fontSize: '12px' }}
                    />
                    <Scatter name="Fronteira Eficiente" data={markowitz.frontier} fill="#6366f1" line={{ stroke: '#6366f1', strokeWidth: 2 }} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Alocação Ótima Recomendada */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <h4 className="text-sm font-black text-slate-900 mb-1 flex items-center gap-2">
                  <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                  Portfólio de Sharpe Máximo (Tangência)
                </h4>
                <p className="text-xs text-slate-500 mb-4">
                  Distribuição de pesos que maximiza a relação retorno por unidade de risco acima da Selic (10,5%).
                </p>

                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-emerald-700 uppercase">Retorno Projetado</span>
                    <p className="text-lg font-black text-emerald-900">{markowitz.maxSharpePoint.expectedReturn}% a.a.</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-emerald-700 uppercase">Volatilidade</span>
                    <p className="text-lg font-black text-emerald-900">{markowitz.maxSharpePoint.volatility}%</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-emerald-700 uppercase">Índice Sharpe</span>
                    <p className="text-lg font-black text-emerald-900">{markowitz.maxSharpePoint.sharpeRatio}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Pesos Recomendados</p>
                  {Object.entries(markowitz.maxSharpePoint.weights).map(([sym, wt]) => (
                    <div key={sym} className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
                      <span className="font-bold text-slate-700">{sym}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${wt}%` }} />
                        </div>
                        <span className="font-mono font-bold text-slate-900 w-10 text-right">{wt}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Otimizado com restrição de não-alavancagem (pesos positivos com soma = 100%).</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Disclaimer Legal Obrigatório CVM 19/20 ───────────────────────────── */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-[11px] text-slate-500 leading-relaxed flex items-start gap-3">
        <Info className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-slate-700 font-bold block mb-0.5">Nota Legal e Regulatória (CVM 19/2021 e CVM 20/2021):</strong>
          As análises quantitativas, simulações de Monte Carlo, cálculos de Value at Risk (VaR) e Fronteira Eficiente apresentados neste módulo têm caráter estritamente educativo e matemático. O sistema não fornece consultoria financeira personalizada nem recomendação de compra/venda de ativos mobiliários. Rentabilidade passada não representa garantia de retorno futuro.
        </div>
      </div>
    </div>
  );
}
