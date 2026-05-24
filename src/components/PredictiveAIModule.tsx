/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import {
  BrainCircuit, RefreshCw, AlertTriangle, Info, CheckCircle2,
  TrendingUp, PieChart, Lightbulb, ClipboardList, Zap, Clock,
  ChevronRight, Shield
} from 'lucide-react';

interface ScoreSaude {
  valor: number;
  classificacao: 'Excelente' | 'Bom' | 'Regular' | 'Crítico';
  justificativa: string;
}

interface Alerta {
  nivel: 'CRITICO' | 'ATENCAO' | 'INFO';
  titulo: string;
  descricao: string;
  acao_sugerida: string;
}

interface AnaliseGastos {
  resumo: string;
  ponto_atencao: string | null;
  top_categorias: { categoria: string; valor: string; avaliacao: string }[];
}

interface AnaliseInvestimentos {
  resumo: string;
  diversificacao: 'Boa' | 'Média' | 'Fraca' | 'Sem investimentos';
  pontos: string[];
  sugestoes: string[];
}

interface Recomendacao {
  prioridade: number;
  titulo: string;
  descricao: string;
  impacto: 'Alto' | 'Médio' | 'Baixo';
  prazo: string;
}

interface PlanoAcao {
  ordem: number;
  acao: string;
  motivo: string;
}

interface AnalysisResult {
  resumo_executivo: string;
  score_saude: ScoreSaude;
  alertas: Alerta[];
  analise_gastos: AnaliseGastos;
  analise_investimentos: AnaliseInvestimentos;
  recomendacoes: Recomendacao[];
  plano_acao: PlanoAcao[];
  generatedAt: string;
}

function HealthGauge({ score, classificacao }: { score: number; classificacao: string }) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 72;
  const cx = 100;
  const cy = 90;
  const strokeWidth = 14;
  const circumference = Math.PI * radius;
  const arcLength = (clamped / 100) * circumference;

  const trackColor = '#e2e8f0';
  const fillColor =
    clamped >= 80 ? '#10b981' :
    clamped >= 60 ? '#6366f1' :
    clamped >= 40 ? '#f59e0b' : '#ef4444';

  const textColor =
    clamped >= 80 ? 'text-emerald-600' :
    clamped >= 60 ? 'text-indigo-600' :
    clamped >= 40 ? 'text-amber-600' : 'text-rose-600';

  const bgColor =
    clamped >= 80 ? 'bg-emerald-50' :
    clamped >= 60 ? 'bg-indigo-50' :
    clamped >= 40 ? 'bg-amber-50' : 'bg-rose-50';

  return (
    <div className={`flex flex-col items-center justify-center p-6 rounded-2xl border border-slate-200 ${bgColor} shadow-sm`}>
      <svg viewBox="0 0 200 110" className="w-48 h-28">
        {/* Track */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Fill — uses dashoffset trick on a semicircle */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={fillColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
        {/* Score text */}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="28" fontWeight="900" fill={fillColor}>
          {clamped}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="9" fontWeight="700" fill="#64748b" letterSpacing="2">
          /100
        </text>
        {/* Labels */}
        <text x={cx - radius + 4} y={cy + 22} fontSize="8" fill="#94a3b8">0</text>
        <text x={cx + radius - 8} y={cy + 22} fontSize="8" fill="#94a3b8">100</text>
      </svg>
      <p className={`text-base font-black uppercase tracking-widest ${textColor} -mt-2`}>{classificacao}</p>
    </div>
  );
}

function AlertCard({ alerta }: { alerta: Alerta }) {
  const styles = {
    CRITICO: {
      border: 'border-rose-200',
      bg: 'bg-rose-50',
      icon: <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />,
      badge: 'bg-rose-100 text-rose-700',
      text: 'text-rose-800',
      sub: 'text-rose-600',
    },
    ATENCAO: {
      border: 'border-amber-200',
      bg: 'bg-amber-50',
      icon: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />,
      badge: 'bg-amber-100 text-amber-700',
      text: 'text-amber-800',
      sub: 'text-amber-600',
    },
    INFO: {
      border: 'border-blue-200',
      bg: 'bg-blue-50',
      icon: <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />,
      badge: 'bg-blue-100 text-blue-700',
      text: 'text-blue-800',
      sub: 'text-blue-600',
    },
  }[alerta.nivel] ?? {
    border: 'border-slate-200', bg: 'bg-slate-50',
    icon: <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />,
    badge: 'bg-slate-100 text-slate-600', text: 'text-slate-800', sub: 'text-slate-500',
  };

  return (
    <div className={`${styles.bg} ${styles.border} border rounded-xl p-4 space-y-2`}>
      <div className="flex items-start gap-2">
        {styles.icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-xs font-bold ${styles.text}`}>{alerta.titulo}</p>
            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${styles.badge}`}>{alerta.nivel}</span>
          </div>
          <p className={`text-[11px] mt-1 leading-relaxed ${styles.sub}`}>{alerta.descricao}</p>
        </div>
      </div>
      {alerta.acao_sugerida && (
        <div className="flex items-start gap-1.5 pl-6">
          <ChevronRight className={`w-3 h-3 ${styles.sub} shrink-0 mt-0.5`} />
          <p className={`text-[11px] font-semibold ${styles.sub}`}>{alerta.acao_sugerida}</p>
        </div>
      )}
    </div>
  );
}

function ImpactBadge({ impacto }: { impacto: string }) {
  const cls =
    impacto === 'Alto' ? 'bg-rose-100 text-rose-700' :
    impacto === 'Médio' ? 'bg-amber-100 text-amber-700' :
    'bg-emerald-100 text-emerald-700';
  return <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${cls}`}>{impacto}</span>;
}

function PrazoBadge({ prazo }: { prazo: string }) {
  const cls =
    prazo === 'Imediato' ? 'bg-rose-50 text-rose-600 border-rose-200' :
    prazo === '30 dias' ? 'bg-amber-50 text-amber-600 border-amber-200' :
    prazo === '90 dias' ? 'bg-blue-50 text-blue-600 border-blue-200' :
    'bg-slate-50 text-slate-500 border-slate-200';
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>{prazo}</span>;
}

export default function PredictiveAIModule() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runAnalysis = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ai/predictive', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro na análise.'); return; }
      setResult(data);
    } catch (e: any) {
      setError(e.message || 'Erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-indigo-600" />
            IA Preditiva — Analista Financeiro
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Análise completa e personalizada baseada em todos os dados do sistema. Sem alucinações — só dados reais.
          </p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition-colors shadow-sm shrink-0"
        >
          {loading
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Analisando...</>
            : result
              ? <><RefreshCw className="w-4 h-4" /> Atualizar Análise</>
              : <><Zap className="w-4 h-4" /> Executar Análise Completa</>
          }
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl p-4">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <p className="text-xs text-rose-700 font-medium">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 shadow-sm flex flex-col items-center gap-5 text-center">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
            <BrainCircuit className="w-6 h-6 text-indigo-600 absolute inset-0 m-auto" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-800">Processando análise completa...</p>
            <p className="text-xs text-slate-400">Consultando contas, transações, investimentos, orçamentos e cartões.</p>
            <p className="text-xs text-slate-400">O modelo LLM está gerando insights. Pode levar até 30 segundos.</p>
          </div>
          <div className="flex gap-1.5">
            {['Patrimônio', 'Gastos', 'Investimentos', 'Metas', 'Recomendações'].map((s, i) => (
              <span
                key={s}
                className="text-[9px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100 animate-pulse"
                style={{ animationDelay: `${i * 0.2}s` }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !result && !error && (
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 flex flex-col items-center gap-5 text-center shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
            <BrainCircuit className="w-8 h-8 text-indigo-400" />
          </div>
          <div className="space-y-2 max-w-md">
            <p className="text-base font-bold text-slate-700">Pronto para analisar suas finanças</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Clique em <strong>"Executar Análise Completa"</strong> para receber um diagnóstico financeiro profissional
              baseado em todos os seus dados: contas, transações, investimentos, orçamentos e cartões de crédito.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-lg">
            {[
              { icon: Shield, label: 'Score de Saúde', color: 'text-indigo-500' },
              { icon: AlertTriangle, label: 'Alertas', color: 'text-amber-500' },
              { icon: TrendingUp, label: 'Investimentos', color: 'text-emerald-500' },
              { icon: Lightbulb, label: 'Recomendações', color: 'text-violet-500' },
            ].map(({ icon: Icon, label, color }) => (
              <div key={label} className="flex flex-col items-center gap-1.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <Icon className={`w-5 h-5 ${color}`} />
                <span className="text-[10px] font-bold text-slate-500">{label}</span>
              </div>
            ))}
          </div>
          <button
            onClick={runAnalysis}
            className="mt-2 inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
          >
            <Zap className="w-4 h-4" /> Executar Análise Completa
          </button>
        </div>
      )}

      {/* Analysis result */}
      {!loading && result && (
        <div className="space-y-6">

          {/* Timestamp */}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            <span>Análise gerada em {new Date(result.generatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
          </div>

          {/* Score + Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <HealthGauge score={result.score_saude.valor} classificacao={result.score_saude.classificacao} />
            <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <BrainCircuit className="w-3.5 h-3.5 text-indigo-500" /> Resumo Executivo
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed font-medium">{result.resumo_executivo}</p>
              <div className="pt-2 border-t border-slate-50">
                <p className="text-[11px] text-slate-500 leading-relaxed">{result.score_saude.justificativa}</p>
              </div>
            </div>
          </div>

          {/* Alertas */}
          {result.alertas?.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Alertas & Pontos de Atenção
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {result.alertas.map((a, i) => (
                  <AlertCard key={i} alerta={a} />
                ))}
              </div>
            </div>
          )}

          {/* Análise de Gastos */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 pb-2 border-b border-slate-50">
              <PieChart className="w-3.5 h-3.5 text-rose-500" /> Análise de Gastos
            </h3>
            <p className="text-xs text-slate-700 leading-relaxed">{result.analise_gastos?.resumo}</p>
            {result.analise_gastos?.ponto_atencao && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg p-3">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700">{result.analise_gastos.ponto_atencao}</p>
              </div>
            )}
            {result.analise_gastos?.top_categorias?.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Top categorias de gasto (90 dias)</p>
                <div className="space-y-1.5">
                  {result.analise_gastos.top_categorias.map((c, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-slate-50 rounded-lg text-xs">
                      <span className="font-semibold text-slate-700">{c.categoria}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-rose-600">{c.valor}</span>
                        <span className="text-[10px] text-slate-400">{c.avaliacao}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Análise de Investimentos */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-50">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Carteira de Investimentos
              </h3>
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                result.analise_investimentos?.diversificacao === 'Boa' ? 'bg-emerald-100 text-emerald-700' :
                result.analise_investimentos?.diversificacao === 'Média' ? 'bg-amber-100 text-amber-700' :
                result.analise_investimentos?.diversificacao === 'Fraca' ? 'bg-rose-100 text-rose-700' :
                'bg-slate-100 text-slate-500'
              }`}>
                Diversificação: {result.analise_investimentos?.diversificacao}
              </span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">{result.analise_investimentos?.resumo}</p>
            {result.analise_investimentos?.pontos?.length > 0 && (
              <div className="space-y-1.5">
                {result.analise_investimentos.pontos.map((p, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span className="text-slate-600">{p}</span>
                  </div>
                ))}
              </div>
            )}
            {result.analise_investimentos?.sugestoes?.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-50">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sugestões</p>
                {result.analise_investimentos.sugestoes.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-slate-600">{s}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recomendações */}
          {result.recomendacoes?.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-violet-500" /> Recomendações Prioritárias
              </h3>
              <div className="space-y-3">
                {result.recomendacoes.sort((a, b) => a.prioridade - b.prioridade).map((r, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                          {r.prioridade}
                        </span>
                        <p className="text-xs font-bold text-slate-800">{r.titulo}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <ImpactBadge impacto={r.impacto} />
                        <PrazoBadge prazo={r.prazo} />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed pl-8">{r.descricao}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Plano de Ação */}
          {result.plano_acao?.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 pb-2 border-b border-slate-50">
                <ClipboardList className="w-3.5 h-3.5 text-teal-500" /> Plano de Ação
              </h3>
              <div className="space-y-3">
                {result.plano_acao.sort((a, b) => a.ordem - b.ordem).map((p, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-0.5 shrink-0">
                      <div className="w-6 h-6 rounded-full bg-teal-50 border-2 border-teal-200 text-teal-700 text-[10px] font-black flex items-center justify-center">
                        {p.ordem}
                      </div>
                      {i < result.plano_acao.length - 1 && (
                        <div className="w-0.5 h-4 bg-slate-100" />
                      )}
                    </div>
                    <div className="flex-1 pb-1">
                      <p className="text-xs font-bold text-slate-800">{p.acao}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{p.motivo}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Esta análise é gerada por IA com base <strong>exclusivamente nos dados financeiros registrados no sistema</strong>.
              Não constitui consultoria financeira regulamentada (CVM). Para decisões de grande impacto, consulte um profissional certificado (CFP/CEA).
            </p>
          </div>

        </div>
      )}
    </div>
  );
}
