/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import {
  BrainCircuit, RefreshCw, AlertTriangle, Info, CheckCircle2,
  TrendingUp, PieChart, Lightbulb, ClipboardList, Zap, Clock,
  ChevronRight, Shield, MessageSquare, Send, BarChart2, User, Bot,
  Sparkles, Key, ExternalLink, Target, Wallet, FileText, FileSearch, ShieldCheck,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

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
  insufficient_data?: boolean;
  resumo_executivo: string;
  score_saude: ScoreSaude;
  alertas: Alerta[];
  analise_gastos: AnaliseGastos;
  analise_investimentos: AnaliseInvestimentos;
  recomendacoes: Recomendacao[];
  plano_acao: PlanoAcao[];
  generatedAt: string;
}
interface AgentAction {
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
  actions?: AgentAction[];
  needsConfirm?: boolean;
  pendingConfirmText?: string;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function HealthGauge({ score, classificacao }: { score: number; classificacao: string }) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 72;
  const cx = 100; const cy = 90;
  const strokeWidth = 14;
  const circumference = Math.PI * radius;
  const arcLength = (clamped / 100) * circumference;

  const fillColor = clamped >= 80 ? '#10b981' : clamped >= 60 ? '#6366f1' : clamped >= 40 ? '#f59e0b' : '#ef4444';
  const textColor = clamped >= 80 ? 'text-emerald-600' : clamped >= 60 ? 'text-indigo-600' : clamped >= 40 ? 'text-amber-600' : 'text-rose-600';
  const bgColor = clamped >= 80 ? 'bg-emerald-50' : clamped >= 60 ? 'bg-indigo-50' : clamped >= 40 ? 'bg-amber-50' : 'bg-rose-50';

  return (
    <div className={`flex flex-col items-center justify-center p-6 rounded-2xl border border-slate-200 ${bgColor} shadow-sm`}>
      <svg viewBox="0 0 200 110" className="w-48 h-28">
        <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} strokeLinecap="round" />
        <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`} fill="none" stroke={fillColor} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`} style={{ transition: 'stroke-dasharray 0.8s ease' }} />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="28" fontWeight="900" fill={fillColor}>{clamped}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="9" fontWeight="700" fill="#64748b" letterSpacing="2">/100</text>
        <text x={cx - radius + 4} y={cy + 22} fontSize="8" fill="#94a3b8">0</text>
        <text x={cx + radius - 8} y={cy + 22} fontSize="8" fill="#94a3b8">100</text>
      </svg>
      <p className={`text-base font-black uppercase tracking-widest ${textColor} -mt-2`}>{classificacao}</p>
    </div>
  );
}

function AlertCard({ alerta }: { alerta: Alerta }) {
  const s = {
    CRITICO: { border: 'border-rose-200', bg: 'bg-rose-50', icon: <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />, badge: 'bg-rose-100 text-rose-700', text: 'text-rose-800', sub: 'text-rose-600' },
    ATENCAO: { border: 'border-amber-200', bg: 'bg-amber-50', icon: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />, badge: 'bg-amber-100 text-amber-700', text: 'text-amber-800', sub: 'text-amber-600' },
    INFO: { border: 'border-blue-200', bg: 'bg-blue-50', icon: <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />, badge: 'bg-blue-100 text-blue-700', text: 'text-blue-800', sub: 'text-blue-600' },
  }[alerta.nivel] ?? { border: 'border-slate-200', bg: 'bg-slate-50', icon: <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />, badge: 'bg-slate-100 text-slate-600', text: 'text-slate-800', sub: 'text-slate-500' };

  return (
    <div className={`${s.bg} ${s.border} border rounded-xl p-4 space-y-2`}>
      <div className="flex items-start gap-2">
        {s.icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-xs font-bold ${s.text}`}>{alerta.titulo}</p>
            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${s.badge}`}>{alerta.nivel}</span>
          </div>
          <p className={`text-[11px] mt-1 leading-relaxed ${s.sub}`}>{alerta.descricao}</p>
        </div>
      </div>
      {alerta.acao_sugerida && (
        <div className="flex items-start gap-1.5 pl-6">
          <ChevronRight className={`w-3 h-3 ${s.sub} shrink-0 mt-0.5`} />
          <p className={`text-[11px] font-semibold ${s.sub}`}>{alerta.acao_sugerida}</p>
        </div>
      )}
    </div>
  );
}

function ImpactBadge({ impacto }: { impacto: string }) {
  const cls = impacto === 'Alto' ? 'bg-rose-100 text-rose-700' : impacto === 'Médio' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
  return <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${cls}`}>{impacto}</span>;
}
function PrazoBadge({ prazo }: { prazo: string }) {
  const cls = prazo === 'Imediato' ? 'bg-rose-50 text-rose-600 border-rose-200' : prazo === '30 dias' ? 'bg-amber-50 text-amber-600 border-amber-200' : prazo === '90 dias' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200';
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>{prazo}</span>;
}

// ── Chat tab ───────────────────────────────────────────────────────────────

const QUICK_STARTERS = [
  'Crie meta de reserva de emergência de R$ 15.000',
  'Registre despesa de R$ 120 em Alimentação hoje',
  'Configure orçamento de Lazer em R$ 500/mês',
  'Liste meus documentos salvos',
  'Crie meta de viagem de R$ 8.000 para dezembro',
  'Registre receita de salário de R$ 5.000 hoje',
  'Configure orçamento de Transporte em R$ 400',
  'Analise minha saúde financeira',
];


// ── ActionCard — shows what the agent did ────────────────────────────────────

function ActionCard({ action }: { action: AgentAction }) {
  const fmtCents = (n: number) => `R$ ${(n / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  const res  = action.result as any;
  const args = action.args as any;
  const dryRun = res?.dryRun === true;
  const success = !res?.error;
  const proposed = (res?.proposed ?? args) as any;

  let label = action.tool;
  let detail = '';
  let Icon = CheckCircle2;

  if (action.tool === 'create_transaction') {
    label = dryRun
      ? (proposed.type === 'REC' ? 'Proposta: receita' : 'Proposta: despesa')
      : (args.type === 'REC' ? 'Receita registrada' : 'Despesa registrada');
    detail = `${proposed.description ?? args.description} — ${fmtCents(proposed.amountInCents ?? args.amountInCents)} · ${proposed.category ?? args.category}`;
    Icon = (proposed.type ?? args.type) === 'REC' ? Wallet : TrendingUp;
  } else if (action.tool === 'create_goal') {
    label = dryRun ? 'Proposta: meta' : 'Meta criada';
    detail = `${proposed.name ?? args.name} — alvo ${fmtCents(proposed.targetInCents ?? args.targetInCents)} até ${proposed.targetDate ?? args.targetDate}`;
    Icon = Target;
  } else if (action.tool === 'create_budget') {
    label = dryRun ? 'Proposta: orçamento' : (res?.action === 'updated' ? 'Orçamento atualizado' : 'Orçamento criado');
    detail = `${proposed.category ?? args.category} — limite ${fmtCents(proposed.limitInCents ?? args.limitInCents)}/mês`;
    Icon = PieChart;
  } else if (action.tool === 'list_documents') {
    label = 'Documentos listados';
    detail = `${(res?.documents ?? []).length} documento(s) encontrado(s)`;
    Icon = FileText;
  } else if (action.tool === 'read_document') {
    label = success ? 'Documento lido' : 'Erro ao ler documento';
    detail = success ? 'Conteúdo extraído com visão IA' : (res?.error ?? '');
    Icon = FileSearch;
  }

  const tone = !success ? 'rose' : dryRun ? 'amber' : 'emerald';
  const toneCls = {
    rose:    { box: 'bg-rose-50 border-rose-200', icon: 'text-rose-500', title: 'text-rose-800', body: 'text-rose-700' },
    amber:   { box: 'bg-amber-50 border-amber-200', icon: 'text-amber-600', title: 'text-amber-900', body: 'text-amber-800' },
    emerald: { box: 'bg-emerald-50 border-emerald-200', icon: 'text-emerald-500', title: 'text-emerald-800', body: 'text-emerald-700' },
  }[tone];

  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-[11px] mt-1 ${toneCls.box}`}>
      <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${toneCls.icon}`} />
      <div className="min-w-0">
        <p className={`font-bold ${toneCls.title}`}>{label}</p>
        <p className={`break-words ${toneCls.body}`}>{detail}</p>
      </div>
    </div>
  );
}

// ── GroqKeyPanel — used by both Chat and Analysis tabs ────────────────────────
interface GroqKeyPanelProps {
  onSave: (key: string) => void;
}
function GroqKeyPanel({ onSave }: GroqKeyPanelProps) {
  const [val, setVal] = useState('');
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Key className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-xs font-bold text-amber-800">Limite gratuito da Groq atingido</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            Insira sua própria chave Groq para continuar. É gratuita, sem cartão de crédito.
          </p>
          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 underline underline-offset-2"
          >
            Obter chave em console.groq.com <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          placeholder="gsk_..."
          value={val}
          onChange={e => setVal(e.target.value)}
          className="flex-1 text-xs border border-amber-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          disabled={!val.startsWith('gsk_') || val.length < 20}
          onClick={() => { sessionStorage.setItem('__userGroqKey', val); onSave(val); }}
          className="px-3 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
        >
          Salvar e tentar
        </button>
      </div>
    </div>
  );
}

function ChatTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const [userGroqKey, setUserGroqKey] = useState(() => sessionStorage.getItem('__userGroqKey') ?? '');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const send = async (text: string, opts?: { confirm?: boolean; skipUserBubble?: boolean }) => {
    if (!text.trim() || loading) return;
    const confirm = opts?.confirm === true;
    const trimmed = text.trim();
    if (!opts?.skipUserBubble) {
      const userMsg: ChatMessage = {
        role: 'user',
        content: confirm ? `Confirmar: ${trimmed}` : trimmed,
        ts: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, userMsg]);
    }
    setInput('');
    setLoading(true);
    setError('');
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const groqKey = sessionStorage.getItem('__userGroqKey') ?? userGroqKey;
      if (groqKey) headers['X-Groq-Api-Key'] = groqKey;
      const res = await fetch('/api/ai/agent-chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: trimmed, history, confirm }),
      });
      const data = await res.json();
      if (res.status === 429 || data.error === 'RATE_LIMIT') { setShowKeyPanel(true); setError(''); return; }
      if (res.status === 401 || data.error === 'GROQ_KEY_MISSING') { setShowKeyPanel(true); setError(''); return; }
      if (!res.ok) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Sua solicitação não pode ser atendida agora. Tente novamente em instantes ou realize a ação manualmente nos módulos do aplicativo.',
          ts: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          actions: [],
        }]);
        return;
      }
      setMessages(prev => [...prev.map(m => ({ ...m, needsConfirm: false })), {
        role: 'assistant',
        content: data.reply,
        ts: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        actions: data.actions ?? [],
        needsConfirm: data.needsConfirm === true,
        pendingConfirmText: data.needsConfirm === true ? trimmed : undefined,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sua solicitação não pode ser atendida agora. Tente novamente em instantes ou realize a ação manualmente nos módulos do aplicativo.',
        ts: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        actions: [],
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ height: '70vh' }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center py-8">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-indigo-500" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <p className="text-sm font-bold text-slate-700">MKS Finance AI</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Agente financeiro inteligente. Crie metas, registre despesas, configure orçamentos e leia documentos — tudo em linguagem natural.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full max-w-md">
              {QUICK_STARTERS.map(q => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="text-left text-[11px] font-medium text-indigo-700 bg-white border border-indigo-100 hover:border-indigo-300 hover:bg-indigo-50 rounded-xl px-3 py-2 transition-all leading-snug"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex items-end gap-2 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${m.role === 'user' ? 'bg-indigo-600' : 'bg-white border border-slate-200'}`}>
              {m.role === 'user' ? <User className="w-3.5 h-3.5 text-white" /> : <Bot className="w-3.5 h-3.5 text-indigo-600" />}
            </div>
            <div className={`max-w-[78%] ${m.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
              <div className={`rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm'
              }`}>
                {m.content}
              </div>
              {m.role === 'assistant' && m.actions && m.actions.length > 0 && (
                <div className="w-full space-y-1">
                  {m.actions.map((a, ai) => <ActionCard key={ai} action={a} />)}
                </div>
              )}
              {m.role === 'assistant' && m.needsConfirm && m.pendingConfirmText && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => send(m.pendingConfirmText!, { confirm: true })}
                  className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white transition-colors"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Confirmar e gravar
                </button>
              )}
              <span className="text-[10px] text-slate-400 px-1">{m.ts}</span>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-end gap-2">
            <div className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1 items-center">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl p-3">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <p className="text-xs text-rose-700">{error}</p>
          </div>
        )}
        {showKeyPanel && (
          <GroqKeyPanel onSave={k => { setUserGroqKey(k); setShowKeyPanel(false); }} />
        )}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Crie metas, registre despesas, leia documentos ou pergunte sobre finanças..."
          disabled={loading}
          className="flex-1 text-sm border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-60 bg-white"
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      <p className="text-[10px] text-slate-400 text-center mt-2">
        Criação de metas, despesas e orçamentos exige confirmação antes de gravar. Para cotações ao vivo, use o widget.
      </p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function PredictiveAIModule() {
  const [activeSection, setActiveSection] = useState<'analysis' | 'chat'>('analysis');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const [userGroqKey, setUserGroqKey] = useState(() => sessionStorage.getItem('__userGroqKey') ?? '');

  const runAnalysis = async (retryKey?: string) => {
    setLoading(true);
    setError('');
    setShowKeyPanel(false);
    try {
      const headers: Record<string, string> = {};
      const groqKey = retryKey ?? sessionStorage.getItem('__userGroqKey') ?? userGroqKey;
      if (groqKey) headers['X-Groq-Api-Key'] = groqKey;
      const res = await fetch('/api/ai/predictive', { method: 'POST', headers });
      const data = await res.json();
      if (res.status === 429 || data.error === 'RATE_LIMIT') { setShowKeyPanel(true); return; }
      if (!res.ok) { setError(data.error || 'Erro na análise.'); return; }
      setResult(data);
    } catch (e: any) {
      setError(e.message || 'Erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-indigo-600" />
            IA Preditiva — Analista Financeiro
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Diagnóstico completo + agente IA que executa ações: cria metas, despesas, orçamentos e lê documentos.
          </p>
        </div>
        {activeSection === 'analysis' && (
          <button
            onClick={() => runAnalysis()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition-colors shadow-sm shrink-0"
          >
            {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Analisando...</>
              : result ? <><RefreshCw className="w-4 h-4" /> Atualizar Análise</>
              : <><Zap className="w-4 h-4" /> Executar Análise Completa</>}
          </button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        <button
          onClick={() => setActiveSection('analysis')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSection === 'analysis' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <BarChart2 className="w-3.5 h-3.5" /> Análise Completa
        </button>
        <button
          onClick={() => setActiveSection('chat')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSection === 'chat' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Bot className="w-3.5 h-3.5" /> Agente IA
        </button>
      </div>

      {/* ── CHAT TAB ── */}
      {activeSection === 'chat' && <ChatTab />}

      {/* ── ANALYSIS TAB ── */}
      {activeSection === 'analysis' && (
        <div className="space-y-6">
          {error && (
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl p-4">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-700 font-medium">{error}</p>
            </div>
          )}
          {showKeyPanel && (
            <GroqKeyPanel onSave={k => { setUserGroqKey(k); runAnalysis(k); }} />
          )}

          {loading && (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 shadow-sm flex flex-col items-center gap-5 text-center">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
                <BrainCircuit className="w-6 h-6 text-indigo-600 absolute inset-0 m-auto" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-800">Processando análise completa...</p>
                <p className="text-xs text-slate-400">Consultando contas, transações, investimentos, orçamentos e cartões.</p>
              </div>
              <div className="flex gap-1.5 flex-wrap justify-center">
                {['Patrimônio', 'Gastos', 'Investimentos', 'Metas', 'Recomendações'].map((s, i) => (
                  <span key={s} className="text-[9px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {!loading && !result && !error && (
            <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 flex flex-col items-center gap-5 text-center shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                <BrainCircuit className="w-8 h-8 text-indigo-400" />
              </div>
              <div className="space-y-2 max-w-md">
                <p className="text-base font-bold text-slate-700">Pronto para analisar suas finanças</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Clique em <strong>"Executar Análise Completa"</strong> para receber um diagnóstico profissional baseado em todos os seus dados reais.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-lg">
                {[{ icon: Shield, label: 'Score de Saúde', color: 'text-indigo-500' }, { icon: AlertTriangle, label: 'Alertas', color: 'text-amber-500' }, { icon: TrendingUp, label: 'Investimentos', color: 'text-emerald-500' }, { icon: Lightbulb, label: 'Recomendações', color: 'text-violet-500' }].map(({ icon: Icon, label, color }) => (
                  <div key={label} className="flex flex-col items-center gap-1.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <Icon className={`w-5 h-5 ${color}`} />
                    <span className="text-[10px] font-bold text-slate-500">{label}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => runAnalysis()} className="mt-2 inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm">
                <Zap className="w-4 h-4" /> Executar Análise Completa
              </button>
            </div>
          )}

          {!loading && result && (
            <div className="space-y-6">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Clock className="w-3.5 h-3.5" />
                <span>Análise gerada em {new Date(result.generatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>

              {/* Score + Resumo */}
              <div className={`grid gap-4 ${result.insufficient_data ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'}`}>
                {!result.insufficient_data && (
                  <HealthGauge score={result.score_saude.valor} classificacao={result.score_saude.classificacao} />
                )}
                <div className={`${result.insufficient_data ? '' : 'md:col-span-2'} bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-3`}>
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
                    {result.alertas.map((a, i) => <AlertCard key={i} alerta={a} />)}
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
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Top categorias (90 dias)</p>
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
                  }`}>Diversif.: {result.analise_investimentos?.diversificacao}</span>
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
                    {[...result.recomendacoes].sort((a, b) => a.prioridade - b.prioridade).map((r, i) => (
                      <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">{r.prioridade}</span>
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
                    {[...result.plano_acao].sort((a, b) => a.ordem - b.ordem).map((p, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="flex flex-col items-center gap-0.5 shrink-0">
                          <div className="w-6 h-6 rounded-full bg-teal-50 border-2 border-teal-200 text-teal-700 text-[10px] font-black flex items-center justify-center">{p.ordem}</div>
                          {i < result.plano_acao.length - 1 && <div className="w-0.5 h-4 bg-slate-100" />}
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

              <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl p-4">
                <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Análise gerada por IA baseada <strong>exclusivamente nos dados registrados no sistema</strong>. Não constitui consultoria financeira regulamentada (CVM). Para decisões de grande impacto, consulte um CFP/CEA certificado.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
