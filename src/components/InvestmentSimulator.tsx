/**
 * Simulador de Investimentos — MKS Finanças
 * Taxas baseadas em dados públicos das instituições (referência mai/2026).
 * CDI/Selic: ~14,75% a.a.  ·  IPCA estimado: ~5,50% a.a.
 */
import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Calculator, ChevronUp, ChevronDown, Info } from 'lucide-react';

// ─── Referências de mercado mai/2026 (fontes públicas) ────────────────────────
const CDI    = 14.75; // % a.a.
const SELIC  = 14.75; // % a.a.
const IPCA   =  5.50; // % a.a. estimado
const POUPANCA = +(SELIC * 0.70).toFixed(4); // 70% Selic quando Selic > 8,5%

// ─── Tabela IR Regressiva (IOF nos primeiros 30d desprezado para simplificar) ─
function irRate(months: number): number {
  if (months <= 6)  return 0.225;
  if (months <= 12) return 0.200;
  if (months <= 24) return 0.175;
  return 0.150;
}

// ─── Motor de simulação ───────────────────────────────────────────────────────
function simulate(
  initialCents: number,
  monthlyContribCents: number,
  months: number,
  annualRatePct: number,
  irFree: boolean,
) {
  const mr = Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;
  let balance = initialCents;
  let totalContrib = initialCents;
  const curve: number[] = [balance];

  for (let m = 1; m <= months; m++) {
    balance = balance * (1 + mr) + monthlyContribCents;
    totalContrib += monthlyContribCents;
    curve.push(Math.round(balance));
  }

  const grossGain  = balance - totalContrib;
  const irAmount   = (!irFree && grossGain > 0) ? grossGain * irRate(months) : 0;
  const netBalance = Math.round(balance - irAmount);
  const netGain    = netBalance - totalContrib;
  const totalReturn = totalContrib > 0 ? (netGain / totalContrib) * 100 : 0;

  return {
    netBalance, totalContrib, netGain,
    irAmount: Math.round(irAmount),
    grossBalance: Math.round(balance),
    totalReturn, curve,
  };
}

function parseBRL(v: string): number {
  return Math.round(parseFloat(v.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')) * 100) || 0;
}

function fmtCents(c: number): string {
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Catálogo de produtos (dados públicos) ────────────────────────────────────
export type Profile = 'conservative' | 'moderate' | 'aggressive';

interface SimProduct {
  id: string; name: string; bank: string; type: string;
  profiles: Profile[];
  rate: number;        // % a.a. efetivo
  rateLabel: string;
  irFree: boolean;
  liquidity: string;
  minMonths: number;   // prazo mínimo de carência
}

const P: SimProduct[] = [
  // POUPANÇA
  { id: 'poupanca', name: 'Poupança', bank: 'Todos os bancos', type: 'Poupança',
    profiles: ['conservative'],
    rate: POUPANCA, rateLabel: `70% da Selic = ${POUPANCA.toFixed(2)}% a.a.`,
    irFree: true, liquidity: 'Diária', minMonths: 0 },

  // CDB liquidez diária / curto prazo
  { id: 'cdb_nu_100',    name: 'CDB 100% CDI',    bank: 'Nubank',           type: 'CDB', profiles: ['conservative'], rate: CDI,                   rateLabel: '100% CDI',              irFree: false, liquidity: 'Diária',   minMonths: 0  },
  { id: 'cdb_inter_100', name: 'CDB 100% CDI',    bank: 'Banco Inter',      type: 'CDB', profiles: ['conservative'], rate: CDI,                   rateLabel: '100% CDI',              irFree: false, liquidity: 'Diária',   minMonths: 0  },
  { id: 'cdb_itau_98',   name: 'CDB 98% CDI',     bank: 'Itaú',             type: 'CDB', profiles: ['conservative'], rate: +(CDI*0.98).toFixed(4), rateLabel: '98% CDI',               irFree: false, liquidity: '30 dias',  minMonths: 1  },
  { id: 'cdb_brad_97',   name: 'CDB 97% CDI',     bank: 'Bradesco',         type: 'CDB', profiles: ['conservative'], rate: +(CDI*0.97).toFixed(4), rateLabel: '97% CDI',               irFree: false, liquidity: '30 dias',  minMonths: 1  },
  { id: 'cdb_sant_96',   name: 'CDB 96% CDI',     bank: 'Santander',        type: 'CDB', profiles: ['conservative'], rate: +(CDI*0.96).toFixed(4), rateLabel: '96% CDI',               irFree: false, liquidity: '30 dias',  minMonths: 1  },
  { id: 'cdb_bb_95',     name: 'CDB 95% CDI',     bank: 'Banco do Brasil',  type: 'CDB', profiles: ['conservative'], rate: +(CDI*0.95).toFixed(4), rateLabel: '95% CDI',               irFree: false, liquidity: '90 dias',  minMonths: 3  },
  { id: 'cdb_cef_93',    name: 'CDB 93% CDI',     bank: 'Caixa Econômica',  type: 'CDB', profiles: ['conservative'], rate: +(CDI*0.93).toFixed(4), rateLabel: '93% CDI',               irFree: false, liquidity: '90 dias',  minMonths: 3  },

  // CDB prazo médio (Moderado)
  { id: 'cdb_btg_110',   name: 'CDB 110% CDI (6m)',  bank: 'BTG Pactual',      type: 'CDB', profiles: ['moderate'], rate: +(CDI*1.10).toFixed(4), rateLabel: '110% CDI',    irFree: false, liquidity: '180 dias', minMonths: 6  },
  { id: 'cdb_inter_110', name: 'CDB 110% CDI (12m)', bank: 'Banco Inter',      type: 'CDB', profiles: ['moderate'], rate: +(CDI*1.10).toFixed(4), rateLabel: '110% CDI',    irFree: false, liquidity: '12 meses', minMonths: 12 },
  { id: 'cdb_xp_115',    name: 'CDB 115% CDI (12m)', bank: 'XP Investimentos', type: 'CDB', profiles: ['moderate'], rate: +(CDI*1.15).toFixed(4), rateLabel: '115% CDI',    irFree: false, liquidity: '12 meses', minMonths: 12 },
  { id: 'cdb_btg_120',   name: 'CDB 120% CDI (12m)', bank: 'BTG Pactual',      type: 'CDB', profiles: ['moderate'], rate: +(CDI*1.20).toFixed(4), rateLabel: '120% CDI',    irFree: false, liquidity: '12 meses', minMonths: 12 },
  { id: 'cdb_nu_120',    name: 'CDB 120% CDI (24m)', bank: 'Nubank',           type: 'CDB', profiles: ['moderate'], rate: +(CDI*1.20).toFixed(4), rateLabel: '120% CDI',    irFree: false, liquidity: '24 meses', minMonths: 24 },

  // CDB longo prazo (Agressivo)
  { id: 'cdb_btg_125',   name: 'CDB 125% CDI (24m)', bank: 'BTG Pactual',      type: 'CDB', profiles: ['aggressive'], rate: +(CDI*1.25).toFixed(4), rateLabel: '125% CDI', irFree: false, liquidity: '24 meses', minMonths: 24 },
  { id: 'cdb_xp_130',    name: 'CDB 130% CDI (36m)', bank: 'XP Investimentos', type: 'CDB', profiles: ['aggressive'], rate: +(CDI*1.30).toFixed(4), rateLabel: '130% CDI', irFree: false, liquidity: '36 meses', minMonths: 36 },
  { id: 'cdb_btg_130',   name: 'CDB 130% CDI (24m)', bank: 'BTG Pactual',      type: 'CDB', profiles: ['aggressive'], rate: +(CDI*1.30).toFixed(4), rateLabel: '130% CDI', irFree: false, liquidity: '24 meses', minMonths: 24 },

  // Tesouro Direto
  { id: 'td_selic',   name: 'Tesouro Selic 2029',       bank: 'Tesouro Nacional', type: 'Tesouro Direto', profiles: ['conservative', 'moderate'],   rate: +(SELIC-0.10).toFixed(4), rateLabel: 'Selic − 0,10%/a.a.',     irFree: false, liquidity: 'D+1', minMonths: 0 },
  { id: 'td_ipca',    name: 'Tesouro IPCA+ 2029',       bank: 'Tesouro Nacional', type: 'Tesouro Direto', profiles: ['moderate', 'aggressive'],     rate: +(IPCA+6.50).toFixed(4),  rateLabel: `IPCA + 6,50% a.a.`,     irFree: false, liquidity: 'D+1', minMonths: 0 },
  { id: 'td_pre',     name: 'Tesouro Prefixado 2029',   bank: 'Tesouro Nacional', type: 'Tesouro Direto', profiles: ['moderate', 'aggressive'],     rate: 12.50,                    rateLabel: '12,50% a.a. fixo',       irFree: false, liquidity: 'D+1', minMonths: 0 },

  // LCI
  { id: 'lci_nu',     name: 'LCI 97% CDI',  bank: 'Nubank',           type: 'LCI', profiles: ['conservative', 'moderate'], rate: +(CDI*0.97).toFixed(4), rateLabel: '97% CDI (IR isento)', irFree: true, liquidity: '90 dias',  minMonths: 3 },
  { id: 'lci_itau',   name: 'LCI 93% CDI',  bank: 'Itaú',             type: 'LCI', profiles: ['conservative', 'moderate'], rate: +(CDI*0.93).toFixed(4), rateLabel: '93% CDI (IR isento)', irFree: true, liquidity: '90 dias',  minMonths: 3 },
  { id: 'lci_bb',     name: 'LCI 92% CDI',  bank: 'Banco do Brasil',  type: 'LCI', profiles: ['conservative', 'moderate'], rate: +(CDI*0.92).toFixed(4), rateLabel: '92% CDI (IR isento)', irFree: true, liquidity: '90 dias',  minMonths: 3 },
  { id: 'lci_brad',   name: 'LCI 91% CDI',  bank: 'Bradesco',         type: 'LCI', profiles: ['conservative'],             rate: +(CDI*0.91).toFixed(4), rateLabel: '91% CDI (IR isento)', irFree: true, liquidity: '180 dias', minMonths: 6 },

  // LCA
  { id: 'lca_nu',     name: 'LCA 95% CDI',  bank: 'Nubank',      type: 'LCA', profiles: ['conservative', 'moderate'], rate: +(CDI*0.95).toFixed(4), rateLabel: '95% CDI (IR isento)', irFree: true, liquidity: '90 dias', minMonths: 3 },
  { id: 'lca_inter',  name: 'LCA 93% CDI',  bank: 'Banco Inter', type: 'LCA', profiles: ['conservative', 'moderate'], rate: +(CDI*0.93).toFixed(4), rateLabel: '93% CDI (IR isento)', irFree: true, liquidity: '90 dias', minMonths: 3 },
  { id: 'lca_sant',   name: 'LCA 90% CDI',  bank: 'Santander',   type: 'LCA', profiles: ['conservative'],             rate: +(CDI*0.90).toFixed(4), rateLabel: '90% CDI (IR isento)', irFree: true, liquidity: '90 dias', minMonths: 3 },

  // Fundos Renda Fixa / DI
  { id: 'fundo_di_bb',   name: 'Fundo DI',          bank: 'Banco do Brasil',  type: 'Fundo DI',  profiles: ['conservative'],             rate: +(CDI*0.95).toFixed(4), rateLabel: '~95% CDI (taxa adm 0,5% a.a.)', irFree: false, liquidity: 'D+0', minMonths: 0 },
  { id: 'fundo_di_cef',  name: 'Fundo DI',          bank: 'Caixa Econômica',  type: 'Fundo DI',  profiles: ['conservative'],             rate: +(CDI*0.93).toFixed(4), rateLabel: '~93% CDI (taxa adm 0,8% a.a.)', irFree: false, liquidity: 'D+1', minMonths: 0 },
  { id: 'fundo_rf_itau', name: 'Fundo Renda Fixa',  bank: 'Itaú',             type: 'Fundo RF',  profiles: ['conservative', 'moderate'], rate: +(CDI*0.96).toFixed(4), rateLabel: '~96% CDI (taxa adm 0,4% a.a.)', irFree: false, liquidity: 'D+1', minMonths: 0 },
  { id: 'fundo_rf_brad', name: 'Fundo Renda Fixa',  bank: 'Bradesco',         type: 'Fundo RF',  profiles: ['conservative', 'moderate'], rate: +(CDI*0.94).toFixed(4), rateLabel: '~94% CDI (taxa adm 0,6% a.a.)', irFree: false, liquidity: 'D+1', minMonths: 0 },

  // Fundos Multimercado (Agressivo)
  { id: 'fundo_mm_btg',   name: 'BTG Pactual Absoluto Advisory', bank: 'BTG Pactual',      type: 'Fundo MM', profiles: ['aggressive'], rate: +(CDI*1.08).toFixed(4), rateLabel: '~108% CDI (taxa adm 2% a.a.)', irFree: false, liquidity: 'D+30', minMonths: 1 },
  { id: 'fundo_mm_xp',    name: 'XP Macro FIC FIM',              bank: 'XP Investimentos', type: 'Fundo MM', profiles: ['aggressive'], rate: +(CDI*1.05).toFixed(4), rateLabel: '~105% CDI (taxa adm 2% a.a.)', irFree: false, liquidity: 'D+30', minMonths: 1 },
  { id: 'fundo_mm_inter', name: 'Inter Achievers FIM',           bank: 'Banco Inter',      type: 'Fundo MM', profiles: ['aggressive'], rate: +(CDI*1.04).toFixed(4), rateLabel: '~104% CDI (taxa adm 1,5% a.a.)', irFree: false, liquidity: 'D+15', minMonths: 1 },
];

const PROFILE_META = {
  conservative: { label: 'Conservador', icon: '🛡️', desc: 'Baixo risco — preservação de capital', color: 'text-sky-700',   border: 'border-sky-400',   bg: 'bg-sky-50'   },
  moderate:     { label: 'Moderado',    icon: '⚖️', desc: 'Risco médio — equilíbrio risco/retorno', color: 'text-amber-700', border: 'border-amber-400', bg: 'bg-amber-50' },
  aggressive:   { label: 'Agressivo',   icon: '🚀', desc: 'Alto risco — maior potencial de retorno', color: 'text-rose-700',  border: 'border-rose-400',  bg: 'bg-rose-50'  },
};

const CHART_COLORS = ['#0284C7', '#16A34A', '#7C3AED', '#EA580C', '#CA8A04'];

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
  monthlyIncomeInCents?: number;
  institutionsInSystem?: string[];
}

export default function InvestmentSimulator({ monthlyIncomeInCents = 0, institutionsInSystem = [] }: Props) {
  const [profile, setProfile]       = useState<Profile>('conservative');
  const [bankFilter, setBankFilter] = useState('');
  const [months, setMonths]         = useState(12);
  const [initialStr, setInitialStr] = useState('1.000,00');
  const [monthlyStr, setMonthlyStr] = useState('');
  const [useIncome, setUseIncome]   = useState(false);
  const [incomePct, setIncomePct]   = useState(20);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortBy, setSortBy]         = useState<'netBalance' | 'totalReturn'>('netBalance');

  const initialCents = parseBRL(initialStr);
  const monthlyContribCents = useIncome && monthlyIncomeInCents > 0
    ? Math.round(monthlyIncomeInCents * incomePct / 100)
    : parseBRL(monthlyStr);

  const allBanks = useMemo(() => [...new Set(P.map(p => p.bank))].sort(), []);

  const filtered = useMemo(() =>
    P.filter(p =>
      p.profiles.includes(profile) &&
      (!bankFilter || p.bank === bankFilter),
    ),
  [profile, bankFilter]);

  const results = useMemo(() => {
    if (initialCents <= 0) return [];
    return filtered
      .map(p => ({ ...p, ...simulate(initialCents, monthlyContribCents, months, p.rate, p.irFree) }))
      .sort((a, b) => b[sortBy] - a[sortBy]);
  }, [filtered, initialCents, monthlyContribCents, months, sortBy]);

  const top5 = results.slice(0, 5);

  const chartData = useMemo(() => {
    if (!top5.length || initialCents <= 0) return [];
    return Array.from({ length: months + 1 }, (_, m) => {
      const row: Record<string, number | string> = {
        label: m === 0 ? 'Início' : m === months ? `${m}m` : m % 6 === 0 ? `${m}m` : '',
        labelFull: `Mês ${m}`,
      };
      top5.forEach(p => { row[p.id] = (p.curve[m] ?? 0) / 100; });
      return row;
    });
  }, [top5, initialCents, months]);

  const best = results[0];

  return (
    <div className="space-y-6">

      {/* Disclaimer */}
      <div className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-700 leading-relaxed">
          <strong>Referências públicas mai/2026:</strong> CDI/Selic {CDI}% a.a. · IPCA estimado {IPCA}% a.a. · Poupança {POUPANCA.toFixed(2)}% a.a.
          Taxas obtidas nos sites das instituições. Simulações são estimativas — rentabilidade passada não garante resultados futuros.
          IR regressivo aplicado sobre ganhos: 22,5% (até 6m) → 20% (7–12m) → 17,5% (13–24m) → 15% (acima de 24m).
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
        <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
          <Calculator className="w-4 h-4 text-indigo-500" /> Parâmetros da Simulação
        </h3>

        {/* Profile */}
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Perfil de Investimento</label>
          <div className="grid grid-cols-3 gap-3">
            {(Object.entries(PROFILE_META) as [Profile, typeof PROFILE_META.conservative][]).map(([key, meta]) => (
              <button key={key} onClick={() => { setProfile(key); setExpandedId(null); }}
                className={`p-3 rounded-xl border-2 text-left transition-all ${profile === key ? `${meta.border} ${meta.bg}` : 'border-slate-200 hover:border-slate-300'}`}>
                <div className="text-xl mb-1">{meta.icon}</div>
                <p className={`text-xs font-black ${profile === key ? meta.color : 'text-slate-700'}`}>{meta.label}</p>
                <p className="text-[10px] text-slate-400 leading-tight">{meta.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Period slider */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase">Período de simulação</label>
            <span className="text-sm font-black text-indigo-600">{months} {months === 1 ? 'mês' : 'meses'}</span>
          </div>
          <input type="range" min={1} max={36} step={1} value={months}
            onChange={e => setMonths(Number(e.target.value))} className="w-full accent-indigo-600" />
          <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
            {[1, 3, 6, 12, 18, 24, 30, 36].map(m => <span key={m}>{m}m</span>)}
          </div>
        </div>

        {/* Amounts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Initial deposit */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Depósito inicial (R$)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">R$</span>
              <input type="text" value={initialStr} onChange={e => setInitialStr(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg pl-8 pr-3 py-2.5 font-mono font-bold focus:outline-none focus:border-indigo-500"
                placeholder="1.000,00" />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Aporte único inicial (pode ser R$ 0)</p>
          </div>

          {/* Monthly contribution */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Aporte mensal (R$)</label>
              {monthlyIncomeInCents > 0 && (
                <button onClick={() => setUseIncome(!useIncome)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${useIncome ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'text-slate-500 border-slate-300 hover:bg-slate-50'}`}>
                  📊 {useIncome ? 'Por receita' : 'Usar receita'}
                </button>
              )}
            </div>
            {useIncome && monthlyIncomeInCents > 0 ? (
              <div className="space-y-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <div className="flex items-center gap-3">
                  <input type="range" min={5} max={50} step={5} value={incomePct}
                    onChange={e => setIncomePct(Number(e.target.value))} className="flex-1 accent-emerald-600" />
                  <span className="text-sm font-black text-emerald-700 w-12 text-right">{incomePct}%</span>
                </div>
                <p className="text-[10px] text-slate-600">
                  {incomePct}% de {fmtCents(monthlyIncomeInCents)} ={' '}
                  <strong className="text-emerald-700">{fmtCents(monthlyContribCents)}/mês</strong>
                </p>
              </div>
            ) : (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">R$</span>
                <input type="text" value={monthlyStr} onChange={e => setMonthlyStr(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg pl-8 pr-3 py-2.5 font-mono font-bold focus:outline-none focus:border-indigo-500"
                  placeholder="0,00 (opcional)" />
              </div>
            )}
          </div>
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Filtrar por banco/instituição</label>
            <select value={bankFilter} onChange={e => { setBankFilter(e.target.value); setExpandedId(null); }}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400">
              <option value="">Todos os bancos</option>
              {allBanks.map(b => (
                <option key={b} value={b}>
                  {institutionsInSystem.some(s => s.toLowerCase().includes(b.toLowerCase())) ? `★ ${b}` : b}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Ordenar por</label>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as 'netBalance' | 'totalReturn')}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400">
              <option value="netBalance">Maior valor líquido</option>
              <option value="totalReturn">Maior retorno %</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPI banner */}
      {best && initialCents > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { l: 'Melhor resultado líquido',  v: fmtCents(best.netBalance),  s: `${best.bank} — ${best.name}`,           c: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
            { l: 'Ganho líquido (melhor)',     v: fmtCents(best.netGain),     s: `IR pago: ${fmtCents(best.irAmount)}`,   c: best.netGain >= 0 ? 'text-emerald-700' : 'text-rose-700', bg: 'bg-white border-slate-200' },
            { l: 'Total investido',            v: fmtCents(best.totalContrib), s: `inicial + ${months - 1} aportes mensais`, c: 'text-slate-700', bg: 'bg-white border-slate-200' },
            { l: 'Retorno % (melhor)',         v: `${best.totalReturn >= 0 ? '+' : ''}${best.totalReturn.toFixed(2)}%`, s: best.irFree ? 'Isento de IR' : `IR: ${(irRate(months)*100).toFixed(1)}%`, c: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' },
          ].map(k => (
            <div key={k.l} className={`${k.bg} border rounded-2xl p-4 shadow-sm`}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">{k.l}</p>
              <p className={`text-base font-black font-mono mt-0.5 ${k.c}`}>{k.v}</p>
              <p className="text-[10px] text-slate-400 truncate mt-0.5">{k.s}</p>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      {chartData.length > 1 && top5.length > 1 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <p className="text-xs font-black text-slate-600 mb-1">📈 Evolução do patrimônio — top {top5.length} opções (valor bruto, sem IR)</p>
          <p className="text-[10px] text-slate-400 mb-4">IR é cobrado apenas no resgate — impacto real no valor líquido final</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickFormatter={v => `R$${Number(v).toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })}`}
                width={72}
              />
              <Tooltip
                labelFormatter={(_l, payload) => payload?.[0] ? (payload[0].payload as any).labelFull : ''}
                formatter={(v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                contentStyle={{ fontSize: 11 }}
              />
              <Legend
                formatter={(id: string) => {
                  const p = top5.find(x => x.id === id);
                  return p ? `${p.bank} · ${p.name}` : id;
                }}
                wrapperStyle={{ fontSize: 10 }}
              />
              {top5.map((p, i) => (
                <Line key={p.id} dataKey={p.id} stroke={CHART_COLORS[i]} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Results table */}
      {results.length > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <p className="text-xs font-black text-slate-600 uppercase tracking-widest">
              {results.length} produto{results.length !== 1 ? 's' : ''} · perfil {PROFILE_META[profile].label}
            </p>
            <p className="text-[10px] text-slate-400">★ = banco do seu sistema</p>
          </div>

          <div className="divide-y divide-slate-100">
            {results.map((r, idx) => (
              <div key={r.id}>
                <div
                  className={`px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition-colors ${idx === 0 ? 'bg-emerald-50/60' : ''}`}
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                >
                  {/* Rank badge */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                    idx === 0 ? 'bg-emerald-500 text-white' : idx === 1 ? 'bg-slate-300 text-slate-700' : idx === 2 ? 'bg-amber-300 text-amber-900' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {idx + 1}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-black text-slate-800">{r.name}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{r.bank}</span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${r.irFree ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {r.type}{r.irFree ? ' · IR isento' : ''}
                      </span>
                      {r.minMonths > months && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">⚠ mín. {r.minMonths}m</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">{r.rateLabel} · Liquidez: {r.liquidity}</p>
                  </div>

                  {/* Result */}
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-black font-mono ${r.netGain >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {fmtCents(r.netBalance)}
                    </p>
                    <p className={`text-[10px] font-bold ${r.totalReturn >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {r.totalReturn >= 0 ? '+' : ''}{r.totalReturn.toFixed(2)}% líq.
                    </p>
                  </div>

                  {expandedId === r.id
                    ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </div>

                {/* Expanded detail */}
                {expandedId === r.id && (
                  <div className="px-6 pb-5 pt-1 bg-slate-50/80 border-t border-slate-100">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3">
                      {[
                        { l: 'Total Investido',   v: fmtCents(r.totalContrib) },
                        { l: 'Valor Bruto Final', v: fmtCents(r.grossBalance) },
                        { l: 'IR Descontado',     v: r.irFree ? '— Isento —' : fmtCents(r.irAmount) },
                        { l: 'Ganho Líquido',     v: fmtCents(r.netGain) },
                      ].map(d => (
                        <div key={d.l} className="bg-white rounded-xl p-3 border border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase">{d.l}</p>
                          <p className="text-xs font-black text-slate-700 font-mono">{d.v}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
                      <strong>IR:</strong> {r.irFree ? 'Isento (LCI/LCA/Poupança)' : `${(irRate(months)*100).toFixed(1)}% sobre ganhos reais (${months <= 6 ? 'até 6 meses' : months <= 12 ? '7–12 meses' : months <= 24 ? '13–24 meses' : 'acima de 24 meses'})`}
                      &nbsp;·&nbsp;<strong>Taxa a.a.:</strong> {r.rate.toFixed(4)}%
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : initialCents > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400 text-sm shadow-sm">
          <Calculator className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p>Nenhum produto encontrado para os filtros selecionados.</p>
          <p className="text-xs mt-1">Tente mudar o banco ou o período.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-indigo-100 p-8 text-center shadow-sm">
          <Calculator className="w-10 h-10 mx-auto mb-3 text-indigo-300" />
          <p className="text-sm font-bold text-slate-600">Informe o valor do depósito inicial para simular</p>
          <p className="text-xs text-slate-400 mt-1">Os resultados aparecem automaticamente conforme você preenche</p>
        </div>
      )}
    </div>
  );
}
