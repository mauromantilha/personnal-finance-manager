import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  TrendingUp,
  Percent,
  Calendar,
  AlertCircle,
  HelpCircle,
  PiggyBank,
  Briefcase,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Filter,
  CheckCircle2,
  Building2,
  Info,
  Scale,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import {
  calculatePrevidencia,
  getRegressiveTaxRate,
  PrevidenciaInputs,
} from '../lib/previdencia-math';
import {
  PREVIDENCIA_FUNDS_CATALOG,
  PrevidenciaFund,
  PrevidenciaRiskProfile,
} from '../lib/previdencia-catalog';

export const PrevidenciaSimulator: React.FC = () => {
  // Entradas da simulação
  const [currentAge, setCurrentAge] = useState<number>(35);
  const [retirementAge, setRetirementAge] = useState<number>(65);
  const [annualGrossIncome, setAnnualGrossIncome] = useState<number>(180000); // R$ 15.000/mês
  const [monthlyContribution, setMonthlyContribution] = useState<number>(1800); // Aporte mensal
  const [initialBalance, setInitialBalance] = useState<number>(25000);
  const [taxDeclarationType, setTaxDeclarationType] = useState<'completo' | 'simplificado'>('completo');
  const [expectedAnnualRealReturnPct, setExpectedAnnualRealReturnPct] = useState<number>(11.5);
  const [managementFeePct, setManagementFeePct] = useState<number>(0.7);
  const [withdrawalType, setWithdrawalType] = useState<'monthly_fixed' | 'monthly_life' | 'unique'>('monthly_fixed');
  const [withdrawalYears, setWithdrawalYears] = useState<number>(25);

  // Filtro do catálogo de fundos
  const [selectedProfile, setSelectedProfile] = useState<PrevidenciaRiskProfile | 'all'>('all');
  const [selectedFundId, setSelectedFundId] = useState<string | null>(null);

  // Cálculo reativo da simulação
  const simulationInputs: PrevidenciaInputs = useMemo(() => ({
    currentAge,
    retirementAge,
    annualGrossIncome,
    monthlyContribution,
    initialBalance,
    taxDeclarationType,
    expectedAnnualRealReturnPct,
    managementFeePct,
    withdrawalType,
    withdrawalYears,
  }), [
    currentAge,
    retirementAge,
    annualGrossIncome,
    monthlyContribution,
    initialBalance,
    taxDeclarationType,
    expectedAnnualRealReturnPct,
    managementFeePct,
    withdrawalType,
    withdrawalYears,
  ]);

  const result = useMemo(() => calculatePrevidencia(simulationInputs), [simulationInputs]);

  // Fundos filtrados
  const filteredFunds = useMemo(() => {
    if (selectedProfile === 'all') return PREVIDENCIA_FUNDS_CATALOG;
    return PREVIDENCIA_FUNDS_CATALOG.filter(f => f.profile === selectedProfile);
  }, [selectedProfile]);

  // Aplicar parâmetros de um fundo selecionado
  const handleApplyFund = (fund: PrevidenciaFund) => {
    setSelectedFundId(fund.id);
    setExpectedAnnualRealReturnPct(fund.expectedAnnualReturnPct);
    setManagementFeePct(fund.managementFeePct);
  };

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Cálculo percentual do teto de 12%
  const annualContrib = monthlyContribution * 12;
  const pgblPctOfIncome = annualGrossIncome > 0 ? (annualContrib / annualGrossIncome) * 100 : 0;
  const isOver12Pct = pgblPctOfIncome > 12;

  return (
    <div className="space-y-8">
      {/* ─── Hero Header ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-700/80 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950/70 p-6 md:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              Previdência Privada Inteligente (PGBL vs. VGBL)
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
              Planejador de Aposentadoria & Eficiência Fiscal
            </h2>
            <p className="text-slate-400 mt-2 text-sm md:text-base max-w-2xl">
              Simule a alavancagem tributária do PGBL com restituição reinvestida, analise o regime ideal (Regressivo vs. Progressivo conforme a Lei nº 14.803/2024) e explore os melhores fundos abertos credenciados pela SUSEP.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end gap-2 shrink-0">
            <span className="text-xs text-slate-400 font-medium">Marco Regulatório Atual</span>
            <div className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-mono text-cyan-300 flex items-center gap-1.5 shadow-sm">
              <Scale className="w-3.5 h-3.5 text-cyan-400" />
              Lei nº 14.803/2024 Válida
            </div>
          </div>
        </div>
      </div>

      {/* ─── Painel de Parâmetros da Simulação ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna 1: Dados Pessoais & Renda */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <PiggyBank className="w-5 h-5 text-indigo-400" />
            <h3 className="font-semibold text-white text-base">Perfil & Capacidade de Aporte</h3>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">
              Idade Atual vs. Aposentadoria
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-slate-500">Idade Atual: {currentAge} anos</span>
                <input
                  type="range"
                  min="18"
                  max="75"
                  value={currentAge}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setCurrentAge(v);
                    if (v >= retirementAge) setRetirementAge(v + 5);
                  }}
                  className="w-full accent-indigo-500 mt-1 cursor-pointer"
                />
              </div>
              <div>
                <span className="text-[11px] text-slate-500">Aposentadoria: {retirementAge} anos</span>
                <input
                  type="range"
                  min={currentAge + 1}
                  max="85"
                  value={retirementAge}
                  onChange={(e) => setRetirementAge(Number(e.target.value))}
                  className="w-full accent-indigo-500 mt-1 cursor-pointer"
                />
              </div>
            </div>
            <p className="text-[11px] text-indigo-300 mt-1">
              Tempo de acumulação: <strong className="text-white">{result.accumulationYears} anos</strong> ({result.accumulationYears * 12} meses)
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">
              Renda Bruta Tributável Anual (IRPF)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-slate-500">R$</span>
              <input
                type="number"
                min="0"
                step="5000"
                value={annualGrossIncome}
                onChange={(e) => setAnnualGrossIncome(Math.max(0, Number(e.target.value)))}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <span className="text-[11px] text-slate-500">
              Equivale a ~{formatBRL(annualGrossIncome / 12)}/mês
            </span>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">
              Aporte Mensal Planejado
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-slate-500">R$</span>
              <input
                type="number"
                min="100"
                step="100"
                value={monthlyContribution}
                onChange={(e) => setMonthlyContribution(Math.max(0, Number(e.target.value)))}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <span className="text-[11px] text-slate-500">
              Total por ano: {formatBRL(monthlyContribution * 12)}
            </span>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">
              Saldo Atual em Previdência (Opcional)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-slate-500">R$</span>
              <input
                type="number"
                min="0"
                step="5000"
                value={initialBalance}
                onChange={(e) => setInitialBalance(Math.max(0, Number(e.target.value)))}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Coluna 2: Regime Tributário & Premissas de Mercado */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Scale className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-white text-base">Declaração & Rentabilidade</h3>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1.5">
              Modelo de Declaração de IRPF
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTaxDeclarationType('completo')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border transition ${
                  taxDeclarationType === 'completo'
                    ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                Completa (Dedução 12%)
              </button>
              <button
                type="button"
                onClick={() => setTaxDeclarationType('simplificado')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border transition ${
                  taxDeclarationType === 'simplificado'
                    ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                Simplificada (Sem PGBL)
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              {taxDeclarationType === 'completo'
                ? 'Permite abater aportes em PGBL até 12% da renda bruta anual tributável.'
                : 'Na simplificada, o desconto padrão de 20% é aplicado. O VGBL é a escolha ideal.'}
            </p>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-medium text-slate-400">
                Rentabilidade Nominal Esperada
              </label>
              <span className="text-xs font-semibold text-emerald-400">
                {expectedAnnualRealReturnPct}% a.a.
              </span>
            </div>
            <input
              type="range"
              min="6"
              max="18"
              step="0.5"
              value={expectedAnnualRealReturnPct}
              onChange={(e) => setExpectedAnnualRealReturnPct(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>6% (Super Conservador)</span>
              <span>12% (Moderado)</span>
              <span>18% (Agressivo)</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-medium text-slate-400">
                Taxa de Administração do Fundo
              </label>
              <span className="text-xs font-semibold text-amber-400">
                {managementFeePct}% a.a.
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="2.5"
              step="0.05"
              value={managementFeePct}
              onChange={(e) => setManagementFeePct(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <span className="text-[11px] text-slate-500 block">
              Retorno líquido descontada a taxa: <strong className="text-slate-300">{(expectedAnnualRealReturnPct - managementFeePct).toFixed(2)}% a.a.</strong>
            </span>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">
              Forma de Desfrute na Aposentadoria
            </label>
            <select
              value={withdrawalType}
              onChange={(e) => setWithdrawalType(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="monthly_fixed">Renda Mensal por Prazo Determinado</option>
              <option value="monthly_life">Renda Mensal Vitalícia Estimada (25 anos)</option>
              <option value="unique">Resgate Único Total</option>
            </select>
          </div>

          {withdrawalType === 'monthly_fixed' && (
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">
                Prazo de Pagamento da Renda: {withdrawalYears} anos
              </label>
              <input
                type="range"
                min="10"
                max="35"
                step="1"
                value={withdrawalYears}
                onChange={(e) => setWithdrawalYears(Number(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* Coluna 3: Card Dourado - Teto Fiscal PGBL 12% */}
        <div className="bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/30 rounded-xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-amber-500/20 pb-3">
              <div className="flex items-center gap-2">
                <Percent className="w-5 h-5 text-amber-400" />
                <h3 className="font-semibold text-amber-200 text-base">Benefício Fiscal do PGBL</h3>
              </div>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Teto 12%
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <span className="text-xs text-slate-400 block">Teto Anual Dedutível (12% da Renda):</span>
                <span className="text-xl font-bold text-amber-300">
                  {formatBRL(result.maxPgblAnnualDeduction)}
                </span>
                <span className="text-[11px] text-slate-500 block">
                  (Máximo de {formatBRL(result.maxPgblAnnualDeduction / 12)}/mês para dedução integral)
                </span>
              </div>

              <div>
                <span className="text-xs text-slate-400 block">Seu Aporte Anual Planejado:</span>
                <div className="flex items-center gap-2">
                  <span className={`text-base font-semibold ${isOver12Pct ? 'text-amber-400' : 'text-slate-200'}`}>
                    {formatBRL(annualContrib)}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded font-mono ${
                    isOver12Pct ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {pgblPctOfIncome.toFixed(1)}% da renda
                  </span>
                </div>
                {isOver12Pct && (
                  <p className="text-[11px] text-amber-300/90 mt-1 flex items-start gap-1">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Recomendação mista: Alocar até R$ {formatBRL(result.maxPgblAnnualDeduction)} em PGBL e o excedente ({formatBRL(annualContrib - result.maxPgblAnnualDeduction)}) em VGBL para não pagar bitributação!
                  </p>
                )}
              </div>

              <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/30">
                <span className="text-xs text-emerald-400 font-medium block">
                  Restituição Imediata Estimada no IRPF:
                </span>
                <span className="text-2xl font-black text-emerald-300">
                  {taxDeclarationType === 'completo' ? formatBRL(result.annualTaxRefundImmediate) : 'R$ 0,00'}
                  <span className="text-xs font-normal text-emerald-400/80 ml-1">/ano</span>
                </span>
                <p className="text-[11px] text-slate-400 mt-1">
                  Se você reinvestir essa restituição no próprio plano, ativará a <strong>alavancagem de juros sobre imposto diferido</strong>.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400">
            Requisito legal: Contribuinte da Previdência Oficial (INSS ou RPPS).
          </div>
        </div>
      </div>

      {/* ─── Cards de Resultados & Comparativo PGBL x VGBL ────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Aportado */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Total do seu Bolso Aportado</div>
          <div className="text-xl font-bold text-white mt-1">
            {formatBRL(result.totalInvested)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Ao longo de {result.accumulationYears} anos
          </div>
        </div>

        {/* Saldo Bruto Acumulado */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Saldo Bruto Projetado</div>
          <div className="text-xl font-bold text-indigo-400 mt-1">
            {formatBRL(result.grossAccumulatedBalance)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Juros compostos de +{formatBRL(result.grossAccumulatedBalance - result.totalInvested)}
          </div>
        </div>

        {/* PGBL c/ Restituição Reinvestida */}
        <div className="p-4 rounded-xl bg-slate-900 border border-emerald-500/40 bg-gradient-to-b from-emerald-950/20 to-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-400 font-medium">PGBL c/ Restituição Reinvestida</span>
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-black text-emerald-300 mt-1">
            {formatBRL(result.pgblWithReinvestNetRegressive)}
          </div>
          <div className="text-[11px] text-emerald-400/90 mt-0.5">
            Líquido na Regressiva (+{formatBRL(result.taxAdvantageReinvestmentBRL)} vs VGBL)
          </div>
        </div>

        {/* Renda Mensal Líquida Projetada */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Renda Mensal Líquida Futura</div>
          <div className="text-xl font-bold text-cyan-300 mt-1">
            {formatBRL(result.estimatedMonthlyNetIncomeRegressive)}
            <span className="text-xs font-normal text-slate-400">/mês</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {withdrawalType === 'monthly_life' ? 'Vitalícia estimada' : `Por ${withdrawalYears} anos`}
          </div>
        </div>
      </div>

      {/* ─── Comparativo Detalhado: PGBL vs VGBL & Regressivo vs Progressivo ─── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-white text-base">
              Comparativo de Resgate Líquido: Regressivo vs. Progressivo
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Com a <strong>Lei nº 14.803/2024</strong>, você não precisa decidir agora: a escolha do regime tributário pode ser feita no primeiro resgate.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Alíquota Regressiva no Resgate:</span>
            <span className="px-2.5 py-1 rounded bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold font-mono">
              {result.regressiveTaxRateAtRetirement}%
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-medium">
              <tr>
                <th className="py-3 px-4">Modalidade do Plano</th>
                <th className="py-3 px-4">Saldo Bruto Acumulado</th>
                <th className="py-3 px-4">Regime Regressivo ({result.regressiveTaxRateAtRetirement}%)</th>
                <th className="py-3 px-4">Regime Progressivo (~20%)</th>
                <th className="py-3 px-4">Renda Mensal Líquida</th>
                <th className="py-3 px-4 text-right">Diagnóstico</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {/* PGBL com Reinvestimento */}
              <tr className="bg-emerald-950/20 font-medium">
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span className="font-semibold text-white">PGBL (Restituição Reinvestida)</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                      MELHOR RETORNO
                    </span>
                  </div>
                </td>
                <td className="py-3.5 px-4 font-mono">{formatBRL(result.pgblBalanceWithReinvestedRefund)}</td>
                <td className="py-3.5 px-4 text-emerald-300 font-bold font-mono">
                  {formatBRL(result.pgblWithReinvestNetRegressive)}
                </td>
                <td className="py-3.5 px-4 font-mono">{formatBRL(result.pgblWithReinvestNetProgressive)}</td>
                <td className="py-3.5 px-4 text-cyan-300 font-semibold font-mono">
                  {formatBRL(result.estimatedMonthlyNetIncomeRegressive)}/mês
                </td>
                <td className="py-3.5 px-4 text-right text-emerald-400 font-semibold">
                  Alavancagem máxima de juros
                </td>
              </tr>

              {/* PGBL Padrão */}
              <tr>
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                    <span>PGBL (Sem Reinvestir Restituição)</span>
                  </div>
                </td>
                <td className="py-3.5 px-4 font-mono">{formatBRL(result.pgblGrossBalance)}</td>
                <td className="py-3.5 px-4 font-mono">{formatBRL(result.pgblNetBalanceRegressive)}</td>
                <td className="py-3.5 px-4 font-mono">{formatBRL(result.pgblNetBalanceProgressive)}</td>
                <td className="py-3.5 px-4 font-mono">
                  {formatBRL(Math.round(result.estimatedMonthlyNetIncomeRegressive * (result.pgblNetBalanceRegressive / (result.pgblWithReinvestNetRegressive || 1))))}/mês
                </td>
                <td className="py-3.5 px-4 text-right text-slate-400">
                  IR sobre montante integral
                </td>
              </tr>

              {/* VGBL Padrão */}
              <tr>
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                    <span>VGBL (Tributa apenas o Lucro)</span>
                  </div>
                </td>
                <td className="py-3.5 px-4 font-mono">{formatBRL(result.vgblGrossBalance)}</td>
                <td className="py-3.5 px-4 font-mono text-white font-semibold">{formatBRL(result.vgblNetBalanceRegressive)}</td>
                <td className="py-3.5 px-4 font-mono">{formatBRL(result.vgblNetBalanceProgressive)}</td>
                <td className="py-3.5 px-4 font-mono">
                  {formatBRL(Math.round(result.estimatedMonthlyNetIncomeRegressive * (result.vgblNetBalanceRegressive / (result.pgblWithReinvestNetRegressive || 1))))}/mês
                </td>
                <td className="py-3.5 px-4 text-right text-cyan-400">
                  Ideal para declaração simplificada
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Gráfico de Evolução Patrimonial ────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-white text-base">
              Projeção de Evolução Patrimonial (Acumulação Temporal)
            </h3>
            <p className="text-xs text-slate-400">
              Acompanhe a curva de crescimento e a diferença gerada pelo reinvestimento da restituição de IRPF ao longo dos anos.
            </p>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={result.timeline} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorInvested" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#64748b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#64748b" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorGross" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorReinvest" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis
                dataKey="age"
                stroke="#94a3b8"
                tick={{ fontSize: 11 }}
                tickFormatter={(val) => `${val} anos`}
              />
              <YAxis
                stroke="#94a3b8"
                tick={{ fontSize: 11 }}
                tickFormatter={(val) => {
                  if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toFixed(1)}M`;
                  if (val >= 1_000) return `R$ ${(val / 1_000).toFixed(0)}k`;
                  return `R$ ${val}`;
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '0.5rem',
                  fontSize: '12px',
                }}
                formatter={(value: any, name: any) => {
                  const key = String(name ?? '');
                  const labels: Record<string, string> = {
                    invested: 'Total Aportado',
                    pgblGross: 'Saldo Padrão (PGBL/VGBL)',
                    pgblWithReinvestment: 'PGBL c/ Restituição Reinvestida',
                  };
                  return [formatBRL(Number(value)), labels[key] || key];
                }}
                labelFormatter={(label) => `Idade: ${label} anos`}
              />
              <Legend
                verticalAlign="top"
                height={36}
                formatter={(val) => {
                  const labels: Record<string, string> = {
                    invested: 'Total Aportado (Bolso)',
                    pgblGross: 'Saldo Padrão PGBL/VGBL',
                    pgblWithReinvestment: 'PGBL + Restituição Reinvestida',
                  };
                  return <span className="text-xs text-slate-300">{labels[val] || val}</span>;
                }}
              />
              <Area
                type="monotone"
                dataKey="invested"
                stroke="#94a3b8"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorInvested)"
              />
              <Area
                type="monotone"
                dataKey="pgblGross"
                stroke="#6366f1"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorGross)"
              />
              <Area
                type="monotone"
                dataKey="pgblWithReinvestment"
                stroke="#10b981"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorReinvest)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── Catálogo Curado de Fundos de Previdência ─────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-400" />
              <h3 className="font-bold text-white text-lg">
                Catálogo de Fundos de Previdência Qualificados
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Fundos abertos das principais entidades de previdência brasileiras (Brasilprev, Bradesco, Itaú, Icatu, XP, BTG Pactual e SulAmérica).
            </p>
          </div>

          {/* Filtro por perfil de risco */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setSelectedProfile('all')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                selectedProfile === 'all'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos ({PREVIDENCIA_FUNDS_CATALOG.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedProfile('conservative')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                selectedProfile === 'conservative'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Conservador
            </button>
            <button
              type="button"
              onClick={() => setSelectedProfile('moderate')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                selectedProfile === 'moderate'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Moderado
            </button>
            <button
              type="button"
              onClick={() => setSelectedProfile('aggressive')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                selectedProfile === 'aggressive'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Agressivo
            </button>
          </div>
        </div>

        {/* Grid de Fundos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFunds.map((fund) => {
            const isSelected = selectedFundId === fund.id;
            const profileConfig = {
              conservative: {
                label: 'Conservador',
                badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
              },
              moderate: {
                label: 'Moderado',
                badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
              },
              aggressive: {
                label: 'Agressivo',
                badge: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
              },
            }[fund.profile];

            return (
              <div
                key={fund.id}
                className={`flex flex-col justify-between p-4 rounded-xl border transition-all duration-200 ${
                  isSelected
                    ? 'bg-slate-800/90 border-indigo-500 ring-1 ring-indigo-500/50 shadow-md'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[11px] font-semibold text-slate-400 truncate">
                      {fund.institution}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border shrink-0 ${profileConfig.badge}`}>
                      {profileConfig.label}
                    </span>
                  </div>

                  <h4 className="font-bold text-white text-sm leading-snug line-clamp-2 mb-1.5">
                    {fund.name}
                  </h4>
                  
                  <div className="text-[11px] text-indigo-300 font-medium mb-2">
                    {fund.categoryLabel}
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-3 mb-3 leading-relaxed">
                    {fund.description}
                  </p>

                  <div className="grid grid-cols-2 gap-2 py-2 border-y border-slate-800/80 text-xs mb-3">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Benchmark</span>
                      <span className="font-semibold text-slate-200">{fund.benchmark}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Taxa Adm. / Carreg.</span>
                      <span className="font-semibold text-slate-200">
                        {fund.managementFeePct.toFixed(2)}% / {fund.loadingFeePct}%
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Retorno 12m</span>
                      <span className="font-semibold text-emerald-400">+{fund.return12mPct.toFixed(2)}%</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Retorno 36m</span>
                      <span className="font-semibold text-indigo-400">+{fund.return36mPct.toFixed(2)}%</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-3">
                    <span>Aporte mín.: {formatBRL(fund.minInitialInvestmentBRL)}</span>
                    <span>Teto ações: {fund.equityAllocationMaxPct}%</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleApplyFund(fund)}
                  className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                >
                  {isSelected ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Simulando com este Fundo
                    </>
                  ) : (
                    <>
                      Simular com este Fundo
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Aviso Legal & Regulatório (CVM / SUSEP) ─────────────────── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-300">
            Aviso Legal e Informações Regulatórias (SUSEP & CVM 175)
          </p>
          <p className="text-[11px] leading-relaxed text-slate-400">
            Esta ferramenta destina-se exclusivamente a fins educacionais e de simulação atuarial/tributária, não constituindo recomendação personalizada de investimento nem oferta de valores mobiliários nos termos da Instrução CVM nº 19/2021 e 20/2021. Os fundos listados são geridos por instituições financeiras credenciadas junto à ANBIMA e fiscalizados pela SUSEP. Rentabilidade passada não representa garantia de rentabilidade futura. A adesão ao regime tributário regressivo ou progressivo é irretratável no momento do resgate inicial, conforme faculdade da Lei nº 14.803/2024.
          </p>
        </div>
      </div>
    </div>
  );
};
