import { useState, useMemo } from 'react';
import { TrendingUp, Plus, Pencil, Trash2, CheckCircle, AlertCircle, X, Check, BarChart2, PieChart, Calculator, Shield, Briefcase, Building2, ExternalLink, Link2, Clock, ChevronRight, CheckSquare, Sparkles, Upload } from 'lucide-react';
import { PieChart as RechartsPie, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Investment, AssetClass, FinancialAccount } from '../types';
import InvestmentSimulator from './InvestmentSimulator';

interface InvestmentsModuleProps {
  investments: Investment[];
  accounts: FinancialAccount[];
  monthlyIncomeInCents?: number;
  institutionsInSystem?: string[];
  onAdd: (data: Omit<Investment, 'id' | 'createdAt'>) => Promise<boolean>;
  onUpdate: (id: string, data: Partial<Investment>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

const CLASS_META: Record<AssetClass, { label: string; color: string; bg: string; icon: string }> = {
  fixed_income:  { label: 'Renda Fixa',     color: '#0284C7', bg: 'bg-sky-50',     icon: '🏦' },
  stocks:        { label: 'Ações',           color: '#16A34A', bg: 'bg-emerald-50', icon: '📈' },
  fii:           { label: 'FIIs',            color: '#7C3AED', bg: 'bg-violet-50',  icon: '🏢' },
  crypto:        { label: 'Cripto',          color: '#EA580C', bg: 'bg-orange-50',  icon: '₿'  },
  international: { label: 'Internacional',   color: '#0891B2', bg: 'bg-cyan-50',    icon: '🌎' },
  other:         { label: 'Outros',          color: '#6B7280', bg: 'bg-slate-50',   icon: '📦' },
};

const ASSET_CLASSES = Object.keys(CLASS_META) as AssetClass[];

interface AIDraft {
  _id: string;
  _approved: boolean;
  name: string;
  ticker: string | null;
  assetClass: AssetClass;
  institution: string;
  investedInCents: number;
  currentValueInCents: number;
  annualRate: number | null;
  startDate: string;
  maturityDate: string | null;
  notes: string | null;
}

const fmt = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

function compoundProjection(principalCents: number, annualRate: number, months: number): { month: string; value: number }[] {
  const r = annualRate / 100 / 12;
  const now = new Date();
  return Array.from({ length: months + 1 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    return { month: label, value: Math.round(principalCents * Math.pow(1 + r, i)) };
  });
}

export default function InvestmentsModule({ investments, accounts, monthlyIncomeInCents = 0, institutionsInSystem = [], onAdd, onUpdate, onDelete }: InvestmentsModuleProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [mainTab, setMainTab]     = useState<'positions' | 'market' | 'previdencia' | 'bovespa'>('positions');
  const [activeView, setActiveView] = useState<'list' | 'allocation' | 'projection'>('list');
  const [projectionInvId, setProjectionInvId] = useState<string | null>(null);
  const [projectionMonths, setProjectionMonths] = useState(24);

  // AI Import state
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiState, setAiState] = useState<'idle' | 'loading' | 'reviewing' | 'saving'>('idle');
  const [aiDrafts, setAiDrafts] = useState<AIDraft[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiInstitution, setAiInstitution] = useState('');

  // Form state
  const [fName, setFName] = useState('');
  const [fTicker, setFTicker] = useState('');
  const [fClass, setFClass] = useState<AssetClass>('fixed_income');
  const [fInstitution, setFInstitution] = useState('');
  const [fInvested, setFInvested] = useState('');
  const [fCurrent, setFCurrent] = useState('');
  const [fRate, setFRate] = useState('');
  const [fStartDate, setFStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [fMaturity, setFMaturity] = useState('');
  const [fAccountId, setFAccountId] = useState('');
  const [fNotes, setFNotes] = useState('');

  // Inline edit state
  const [eCurrent, setECurrent] = useState('');
  const [eRate, setERate] = useState('');
  const [eNotes, setENotes] = useState('');

  const updateDraft = (id: string, patch: Partial<AIDraft>) =>
    setAiDrafts(prev => prev.map(d => d._id === id ? { ...d, ...patch } : d));

  const handleAIFileSelect = async (file: File) => {
    setAiState('loading');
    setAiError(null);
    try {
      const ab = await file.arrayBuffer();
      const bytes = new Uint8Array(ab);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      const res = await fetch('/api/investments/ai-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType: file.type || 'application/octet-stream' }),
      });
      if (!res.ok) throw new Error(((await res.json()) as any).error ?? 'Erro ao processar arquivo');
      const data = await res.json() as { institution?: string; positions: any[] };
      setAiInstitution(data.institution ?? '');
      const today = new Date().toISOString().split('T')[0];
      setAiDrafts((data.positions ?? []).map((p: any, i: number) => ({
        _id: String(i),
        _approved: true,
        name: p.name ?? '',
        ticker: p.ticker ?? null,
        assetClass: ASSET_CLASSES.includes(p.assetClass) ? p.assetClass : 'other',
        institution: p.institution ?? data.institution ?? '',
        investedInCents: Number(p.investedInCents) || 0,
        currentValueInCents: Number(p.currentValueInCents) || Number(p.investedInCents) || 0,
        annualRate: p.annualRate != null ? Number(p.annualRate) : null,
        startDate: p.startDate ?? today,
        maturityDate: p.maturityDate ?? null,
        notes: p.notes ?? null,
      })));
      setAiState('reviewing');
    } catch (e: any) {
      setAiError(e.message ?? 'Erro inesperado');
      setAiState('idle');
    }
  };

  const handleSaveAIDrafts = async () => {
    const approved = aiDrafts.filter(d => d._approved);
    setAiState('saving');
    let saved = 0;
    for (const d of approved) {
      const ok = await onAdd({
        name: d.name, ticker: d.ticker, assetClass: d.assetClass,
        institution: d.institution, investedInCents: d.investedInCents,
        currentValueInCents: d.currentValueInCents, annualRate: d.annualRate,
        startDate: d.startDate, maturityDate: d.maturityDate,
        accountId: null, notes: d.notes,
      });
      if (ok) saved++;
    }
    notify(`${saved} posição(ões) importada(s) com sucesso!`, 'success');
    setAiState('idle');
    setAiDrafts([]);
    setAiPanelOpen(false);
  };

  const notify = (text: string, type: 'success' | 'error') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const resetForm = () => {
    setFName(''); setFTicker(''); setFClass('fixed_income'); setFInstitution('');
    setFInvested(''); setFCurrent(''); setFRate(''); setFMaturity('');
    setFAccountId(''); setFNotes('');
    setFStartDate(new Date().toISOString().split('T')[0]);
  };

  const handleAdd = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!fName.trim() || !fInstitution.trim() || !fInvested || !fStartDate)
      return notify('Preencha nome, instituição, valor aportado e data.', 'error');
    const investedCents = Math.round(parseFloat(fInvested.replace(',', '.')) * 100);
    const currentCents = fCurrent ? Math.round(parseFloat(fCurrent.replace(',', '.')) * 100) : investedCents;
    if (isNaN(investedCents) || investedCents <= 0) return notify('Valor aportado inválido.', 'error');
    const ok = await onAdd({
      name: fName.trim(), ticker: fTicker.trim() || null, assetClass: fClass,
      institution: fInstitution.trim(), investedInCents: investedCents,
      currentValueInCents: currentCents, annualRate: fRate ? parseFloat(fRate.replace(',', '.')) : null,
      startDate: fStartDate, maturityDate: fMaturity || null,
      accountId: fAccountId || null, notes: fNotes.trim() || null,
    });
    if (ok) { notify('Investimento adicionado!', 'success'); resetForm(); setShowForm(false); }
    else notify('Erro ao adicionar.', 'error');
  };

  const startEdit = (inv: Investment) => {
    setEditingId(inv.id);
    setECurrent((inv.currentValueInCents / 100).toFixed(2).replace('.', ','));
    setERate(inv.annualRate !== null ? String(inv.annualRate) : '');
    setENotes(inv.notes || '');
  };

  const handleSaveEdit = async (id: string) => {
    const currentCents = eCurrent ? Math.round(parseFloat(eCurrent.replace(',', '.')) * 100) : undefined;
    const rate = eRate ? parseFloat(eRate.replace(',', '.')) : undefined;
    const ok = await onUpdate(id, {
      currentValueInCents: currentCents,
      annualRate: rate ?? null,
      notes: eNotes.trim() || null,
    });
    if (ok) { notify('Posição atualizada!', 'success'); setEditingId(null); }
    else notify('Erro ao atualizar.', 'error');
  };

  const handleDelete = async (id: string) => {
    const ok = await onDelete(id);
    if (ok) { notify('Investimento removido.', 'success'); setDeleteConfirmId(null); }
    else notify('Erro ao remover.', 'error');
  };

  // Portfolio summary
  const { totalInvested, totalCurrent, totalGain, gainPct, byClass } = useMemo(() => {
    const totalInvested = investments.reduce((s, i) => s + i.investedInCents, 0);
    const totalCurrent = investments.reduce((s, i) => s + i.currentValueInCents, 0);
    const totalGain = totalCurrent - totalInvested;
    const gainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
    const byClass = ASSET_CLASSES.map(cls => ({
      cls,
      ...CLASS_META[cls],
      total: investments.filter(i => i.assetClass === cls).reduce((s, i) => s + i.currentValueInCents, 0),
      count: investments.filter(i => i.assetClass === cls).length,
    })).filter(c => c.total > 0);
    return { totalInvested, totalCurrent, totalGain, gainPct, byClass };
  }, [investments]);

  const projInv = projectionInvId ? investments.find(i => i.id === projectionInvId) : null;
  const projData = useMemo(() => {
    if (!projInv || !projInv.annualRate) return [];
    return compoundProjection(projInv.currentValueInCents, projInv.annualRate, projectionMonths);
  }, [projInv, projectionMonths]);

  return (
    <div className="space-y-6">

      {/* ── 4 abas principais ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200">
        {([
          ['market',      'Mercado Financeiro', Calculator, 'border-indigo-500 bg-indigo-50 text-indigo-700'],
          ['previdencia', 'Previdência',         Shield,     'border-violet-500 bg-violet-50 text-violet-700'],
          ['bovespa',     'Bovespa / B3',        Building2,  'border-amber-500  bg-amber-50  text-amber-700' ],
          ['positions',   'Posição',             Briefcase,  'border-emerald-500 bg-emerald-50 text-emerald-700'],
        ] as const).map(([id, label, Icon, activeClass]) => (
          <button key={id} onClick={() => setMainTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-all whitespace-nowrap ${mainTab === id ? activeClass : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Icon className="w-3.5 h-3.5" />{label}
            {id === 'previdencia' || id === 'bovespa' ? (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 ml-1">em breve</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── ABA: Simulação Mercado Financeiro ─────────────────────────────────── */}
      {mainTab === 'market' && (
        <InvestmentSimulator monthlyIncomeInCents={monthlyIncomeInCents} institutionsInSystem={institutionsInSystem} />
      )}

      {/* ── ABA: Simulação Previdência ────────────────────────────────────────── */}
      {mainTab === 'previdencia' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200 rounded-2xl p-8 text-center">
            <div className="w-16 h-16 bg-violet-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-violet-500" />
            </div>
            <h3 className="text-lg font-black text-violet-800 mb-2">Simulação de Previdência Privada</h3>
            <p className="text-sm text-violet-600 max-w-lg mx-auto mb-4">
              Compare PGBL vs VGBL, simule benefício fiscal do IR, projete acumulação e renda mensal na aposentadoria considerando tabela progressiva e regressiva.
            </p>
            <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-200 text-violet-700 text-xs font-black rounded-full">
              <Clock className="w-3.5 h-3.5" /> Em desenvolvimento
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: '💼', title: 'PGBL vs VGBL', desc: 'Compare o impacto do benefício fiscal para declarantes do IR completo vs simplificado.' },
              { icon: '📉', title: 'Tabela Regressiva', desc: 'Simulação com IR regressivo (35% → 10%) para quem investe por mais de 10 anos.' },
              { icon: '🎯', title: 'Renda na Aposentadoria', desc: 'Calcule quanto você precisa acumular para ter a renda desejada pelo período estimado.' },
            ].map(f => (
              <div key={f.title} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="text-2xl mb-2">{f.icon}</div>
                <p className="text-xs font-black text-slate-700 mb-1">{f.title}</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ABA: Simulação Bovespa / B3 ───────────────────────────────────────── */}
      {mainTab === 'bovespa' && (
        <div className="space-y-6">
          {/* Hero placeholder */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-8 text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="text-lg font-black text-amber-800 mb-2">Simulação Bovespa &amp; Integração B3</h3>
            <p className="text-sm text-amber-600 max-w-lg mx-auto mb-4">
              Simule carteiras de ações e FIIs com dados históricos, e importe sua posição real via B3 Área do Investidor (API oficial gratuita).
            </p>
            <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-200 text-amber-700 text-xs font-black rounded-full">
              <Clock className="w-3.5 h-3.5" /> Em desenvolvimento
            </span>
          </div>

          {/* Plano de implementação B3 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
              <h4 className="text-sm font-black text-slate-700 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-amber-500" /> Plano de Implementação — B3 Área do Investidor API
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">API oficial e gratuita da B3 para importação automática de carteira</p>
            </div>
            <div className="p-6 space-y-5">

              {/* Como funciona */}
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                <p className="text-xs font-black text-amber-800 mb-2">Como funciona a integração</p>
                <div className="space-y-1.5 text-[11px] text-amber-700">
                  <p>• O usuário autoriza o compartilhamento via <strong>conta gov.br</strong> ou portal da B3</p>
                  <p>• O MKS Finanças recebe token de acesso OAuth 2.0 com escopo do investidor</p>
                  <p>• Importação automática de: <strong>saldo de ações, FIIs, Tesouro Direto</strong> e histórico de proventos</p>
                  <p>• Sincronização periódica (diária) sem necessidade de reautorização</p>
                </div>
              </div>

              {/* Roadmap por fases */}
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Roadmap de Implementação</p>
                <div className="space-y-3">
                  {[
                    {
                      phase: 'Fase 1', label: 'Credenciamento na B3', status: 'pending', color: 'bg-slate-100 text-slate-600',
                      steps: [
                        'Registro como Integrador no portal B3 Área do Investidor (investidor.b3.com.br)',
                        'Obtenção de client_id e client_secret para OAuth 2.0',
                        'Configuração do redirect_uri para o domínio financaslivre.com',
                        'Aprovação do cadastro (prazo estimado: 5–10 dias úteis)',
                      ],
                    },
                    {
                      phase: 'Fase 2', label: 'Flow OAuth + Autorização', status: 'pending', color: 'bg-blue-100 text-blue-700',
                      steps: [
                        'Rota no Finance Worker: GET /api/b3/auth → redireciona para B3 com client_id + scopes',
                        'Callback route: GET /api/b3/callback → troca code por access_token + refresh_token',
                        'Armazenar tokens por tenant criptografados no D1 (tabela b3_tokens)',
                        'UI: botão "Conectar B3" na aba Bovespa que inicia o fluxo OAuth em popup',
                      ],
                    },
                    {
                      phase: 'Fase 3', label: 'Importação de Posições', status: 'pending', color: 'bg-emerald-100 text-emerald-700',
                      steps: [
                        'POST /api/b3/sync → chama B3 API: GET /v1/portfolio/positions (ações + FIIs)',
                        'GET /v1/fixed-income/treasury-bonds → Tesouro Direto',
                        'Mapeamento e upsert na tabela investments com assetClass = "stocks" | "fii"',
                        'Campo b3Synced e syncedAt para controle de atualização',
                      ],
                    },
                    {
                      phase: 'Fase 4', label: 'Proventos e Dividendos', status: 'pending', color: 'bg-violet-100 text-violet-700',
                      steps: [
                        'GET /v1/portfolio/events → histórico de dividendos, JCP, rendimentos FII',
                        'Importar como transações do tipo REC com categoria "Dividendos B3"',
                        'Dashboard de proventos por mês/ativo no módulo de investimentos',
                        'Alertas automáticos quando provento é creditado (via Notifications)',
                      ],
                    },
                    {
                      phase: 'Fase 5', label: 'Simulação com Dados Reais', status: 'pending', color: 'bg-amber-100 text-amber-700',
                      steps: [
                        'Cotação histórica via B3 ou Yahoo Finance (fallback público)',
                        'Simulação de reinvestimento de dividendos (DRIP)',
                        'Projeção de dividend yield e comparativo com renda fixa',
                        'Carteira sugerida por perfil com ativos B3 reais',
                      ],
                    },
                  ].map(f => (
                    <div key={f.phase} className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className={`px-4 py-3 flex items-center justify-between ${f.color}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black uppercase tracking-widest opacity-70">{f.phase}</span>
                          <span className="text-xs font-black">{f.label}</span>
                        </div>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/50">pendente</span>
                      </div>
                      <div className="px-4 py-3 space-y-1">
                        {f.steps.map((s, i) => (
                          <div key={i} className="flex items-start gap-2 text-[11px] text-slate-600">
                            <ChevronRight className="w-3 h-3 text-slate-400 mt-0.5 shrink-0" />
                            <span>{s}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recursos necessários */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-xs font-black text-slate-700 mb-2 flex items-center gap-1.5">
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-500" /> Requisitos técnicos
                  </p>
                  <div className="space-y-1 text-[11px] text-slate-500">
                    <p>• Novo KV entry: <code className="bg-slate-200 px-1 rounded text-[10px]">b3:{"{"}tenantId{"}"}</code> → tokens OAuth</p>
                    <p>• D1: nova migration com tabela <code className="bg-slate-200 px-1 rounded text-[10px]">b3_tokens</code></p>
                    <p>• Finance Worker: rotas <code className="bg-slate-200 px-1 rounded text-[10px]">/api/b3/*</code></p>
                    <p>• Wrangler secret: <code className="bg-slate-200 px-1 rounded text-[10px]">B3_CLIENT_ID</code>, <code className="bg-slate-200 px-1 rounded text-[10px]">B3_CLIENT_SECRET</code></p>
                  </div>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-xs font-black text-slate-700 mb-2 flex items-center gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5 text-blue-500" /> Links oficiais B3
                  </p>
                  <div className="space-y-1 text-[11px] text-slate-500">
                    <p>• Portal: <span className="text-blue-600 font-medium">investidor.b3.com.br</span></p>
                    <p>• Docs API: <span className="text-blue-600 font-medium">b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/area-do-investidor</span></p>
                    <p>• Credenciamento gratuito para plataformas de finanças pessoais</p>
                    <p>• Suporte B3: <span className="text-blue-600 font-medium">investidor@b3.com.br</span></p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ABA: Posição ──────────────────────────────────────────────────────── */}
      {mainTab === 'positions' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                Carteira de Investimentos
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Acompanhe seus ativos, rentabilidade e alocação por classe.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMainTab('bovespa')}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-bold transition-all"
                title="Importar carteira da B3"
              >
                <Building2 className="w-3.5 h-3.5" /> Importar B3
              </button>
              <button
                onClick={() => { setAiPanelOpen(v => !v); if (aiPanelOpen) { setAiState('idle'); setAiDrafts([]); setAiError(null); } }}
                className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-bold transition-all ${aiPanelOpen ? 'bg-violet-600 text-white border-violet-600 shadow-sm' : 'bg-violet-50 hover:bg-violet-100 text-violet-700 border-violet-200'}`}
                title="Importar extrato de posição via IA"
              >
                <Sparkles className="w-3.5 h-3.5" /> Importar via IA
              </button>
              <button
                onClick={() => { setShowForm(!showForm); resetForm(); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Novo Aporte
              </button>
            </div>
          </div>

          {/* AI Import Panel */}
          {aiPanelOpen && (
            <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl border border-indigo-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm font-black text-indigo-800">Importar Extrato via IA</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded-full">Powered by Groq</span>
                </div>
                <button onClick={() => { setAiPanelOpen(false); setAiState('idle'); setAiDrafts([]); setAiError(null); }}
                  className="p-1.5 hover:bg-indigo-100 rounded-lg text-indigo-400 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Idle: file upload */}
              {aiState === 'idle' && (
                <div>
                  {aiError && (
                    <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />{aiError}
                    </div>
                  )}
                  <label className="block cursor-pointer">
                    <input type="file" accept="image/*,.csv,.txt" className="sr-only"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleAIFileSelect(f); e.target.value = ''; }} />
                    <div className="border-2 border-dashed border-indigo-300 rounded-2xl p-12 text-center hover:border-indigo-400 hover:bg-indigo-50/50 transition-all">
                      <Upload className="w-10 h-10 text-indigo-300 mx-auto mb-3" />
                      <p className="text-sm font-black text-indigo-700">Clique ou arraste o arquivo aqui</p>
                      <p className="text-xs text-indigo-400 mt-1">Captura de tela do extrato (PNG/JPG) ou exportação em CSV/TXT</p>
                      <p className="text-[11px] text-indigo-300 mt-2">Compatível com Nubank, XP, BTG, Inter, Itaú, Bradesco e outros</p>
                    </div>
                  </label>
                </div>
              )}

              {/* Loading */}
              {aiState === 'loading' && (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-sm font-black text-indigo-700">IA analisando o extrato...</p>
                  <p className="text-xs text-indigo-400 mt-1">Identificando ativos, valores e datas</p>
                </div>
              )}

              {/* Reviewing */}
              {aiState === 'reviewing' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-indigo-700 font-medium">
                      <strong>{aiDrafts.filter(d => d._approved).length}</strong> de <strong>{aiDrafts.length}</strong> posições selecionadas
                      {aiInstitution ? <span className="text-indigo-400 font-normal"> &middot; {aiInstitution}</span> : null}
                    </p>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setAiDrafts(d => d.map(x => ({ ...x, _approved: true })))}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 px-2 py-1 hover:bg-indigo-100 rounded-lg transition-colors">
                        Selecionar todas
                      </button>
                      <button onClick={() => setAiDrafts(d => d.map(x => ({ ...x, _approved: false })))}
                        className="text-[10px] font-bold text-slate-500 hover:text-slate-700 px-2 py-1 hover:bg-slate-100 rounded-lg transition-colors">
                        Desmarcar todas
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                    {aiDrafts.map((d) => (
                      <div key={d._id}
                        className={`p-4 rounded-xl border transition-all ${d._approved ? 'bg-white border-indigo-200 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-50'}`}>
                        <div className="flex items-start gap-3">
                          <input type="checkbox" checked={d._approved}
                            onChange={e => updateDraft(d._id, { _approved: e.target.checked })}
                            className="mt-1 w-4 h-4 accent-indigo-600 cursor-pointer shrink-0" />
                          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="col-span-2">
                              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nome do ativo</label>
                              <input value={d.name} onChange={e => updateDraft(d._id, { name: e.target.value })}
                                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:border-indigo-400" />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Classe</label>
                              <select value={d.assetClass} onChange={e => updateDraft(d._id, { assetClass: e.target.value as AssetClass })}
                                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400">
                                {ASSET_CLASSES.map(cls => <option key={cls} value={cls}>{CLASS_META[cls].label}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Instituição</label>
                              <input value={d.institution} onChange={e => updateDraft(d._id, { institution: e.target.value })}
                                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400" />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Aportado (R$)</label>
                              <input
                                value={(d.investedInCents / 100).toFixed(2).replace('.', ',')}
                                onChange={e => {
                                  const v = parseFloat(e.target.value.replace(/\./g, '').replace(',', '.'));
                                  updateDraft(d._id, { investedInCents: isNaN(v) ? 0 : Math.round(v * 100) });
                                }}
                                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-indigo-400" />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Valor Atual (R$)</label>
                              <input
                                value={(d.currentValueInCents / 100).toFixed(2).replace('.', ',')}
                                onChange={e => {
                                  const v = parseFloat(e.target.value.replace(/\./g, '').replace(',', '.'));
                                  updateDraft(d._id, { currentValueInCents: isNaN(v) ? 0 : Math.round(v * 100) });
                                }}
                                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-indigo-400" />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Taxa % a.a.</label>
                              <input
                                value={d.annualRate ?? ''}
                                onChange={e => updateDraft(d._id, { annualRate: e.target.value ? parseFloat(e.target.value) : null })}
                                placeholder="—"
                                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-indigo-400" />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Observações</label>
                              <input
                                value={d.notes ?? ''}
                                onChange={e => updateDraft(d._id, { notes: e.target.value || null })}
                                placeholder="—"
                                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400" />
                            </div>
                          </div>
                          <button onClick={() => setAiDrafts(prev => prev.filter(x => x._id !== d._id))}
                            className="p-1.5 text-slate-300 hover:text-rose-400 hover:bg-rose-50 rounded-lg mt-0.5 shrink-0 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-indigo-100">
                    <button onClick={() => { setAiState('idle'); setAiDrafts([]); setAiError(null); }}
                      className="text-xs text-indigo-500 font-bold hover:text-indigo-700 px-3 py-1.5 hover:bg-indigo-50 rounded-lg transition-all">
                      ← Novo arquivo
                    </button>
                    <button onClick={handleSaveAIDrafts}
                      disabled={!aiDrafts.some(d => d._approved)}
                      className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black rounded-xl shadow-sm transition-all">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Salvar {aiDrafts.filter(d => d._approved).length} posição(ões)
                    </button>
                  </div>
                </div>
              )}

              {/* Saving */}
              {aiState === 'saving' && (
                <div className="py-8 text-center">
                  <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-xs font-black text-indigo-700">Salvando posições...</p>
                </div>
              )}
            </div>
          )}

          {statusMsg && (
            <div className={`p-3 rounded-lg flex items-center gap-2 border text-xs font-medium animate-fadeIn ${statusMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
              {statusMsg.type === 'success' ? <CheckCircle className="w-4 h-4 text-green-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
              {statusMsg.text}
            </div>
          )}

          {/* Portfolio KPIs */}
          {investments.length > 0 && (
            <>
              {/* Total de Ativos — destaque */}
              {(() => {
                const accountsTotal = accounts.reduce((s, a) => s + a.balanceInCents, 0);
                const totalAssets = totalCurrent + accountsTotal;
                return (
                  <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-5 shadow-md flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">Total de Ativos</p>
                      <p className="text-2xl font-black font-mono text-white mt-1">{fmt(totalAssets)}</p>
                      <p className="text-[10px] text-indigo-200 mt-1">
                        Portfólio {fmt(totalCurrent)} + Contas {fmt(accountsTotal)}
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="text-[10px] text-indigo-200 font-semibold">Portfólio</div>
                      <div className="text-sm font-black text-white font-mono">{fmt(totalCurrent)}</div>
                      <div className="text-[10px] text-indigo-200 font-semibold mt-1">Contas</div>
                      <div className="text-sm font-black text-white font-mono">{fmt(accountsTotal)}</div>
                    </div>
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {[
                { label: 'Total Aportado',      value: fmt(totalInvested), color: 'text-slate-800',   bg: 'bg-white'       },
                { label: 'Valor Atual',          value: fmt(totalCurrent),  color: 'text-emerald-700', bg: 'bg-emerald-50'  },
                { label: 'Ganho / Perda',        value: fmt(totalGain),     color: totalGain >= 0 ? 'text-emerald-700' : 'text-rose-700', bg: totalGain >= 0 ? 'bg-emerald-50' : 'bg-rose-50' },
                { label: 'Rentabilidade Total',  value: fmtPct(gainPct),    color: gainPct  >= 0 ? 'text-emerald-700' : 'text-rose-700', bg: gainPct  >= 0 ? 'bg-emerald-50' : 'bg-rose-50' },
              ].map(k => (
                <div key={k.label} className={`${k.bg} rounded-2xl border border-slate-200 p-5 shadow-sm`}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{k.label}</p>
                  <p className={`text-lg font-black font-mono mt-1 ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>
            </>
          )}

          {/* Add form */}
          {showForm && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-fadeIn">
              <h3 className="font-semibold text-slate-800 text-sm mb-4">Novo Aporte / Posição</h3>
              <form onSubmit={handleAdd} className="space-y-4">
                {/* Class selector */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Classe de Ativo</label>
                  <div className="flex flex-wrap gap-2">
                    {ASSET_CLASSES.map(cls => (
                      <button key={cls} type="button" onClick={() => setFClass(cls)}
                        className={`px-3 py-1.5 text-[11px] font-bold rounded-lg border-2 transition-all flex items-center gap-1.5 ${fClass === cls ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}>
                        {CLASS_META[cls].icon} {CLASS_META[cls].label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nome do Ativo *</label>
                    <input type="text" value={fName} onChange={e => setFName(e.target.value)}
                      placeholder="Tesouro Selic 2029, PETR4, HGLG11…"
                      className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400" autoFocus />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Ticker / Código</label>
                    <input type="text" value={fTicker} onChange={e => setFTicker(e.target.value.toUpperCase())}
                      placeholder="SELIC, PETR4, BTC…"
                      className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 font-mono uppercase" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Instituição *</label>
                    <input type="text" value={fInstitution} onChange={e => setFInstitution(e.target.value)}
                      placeholder="XP, Nubank, BTG, Binance…"
                      className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Valor Aportado (R$) *</label>
                    <input type="text" inputMode="decimal" value={fInvested} onChange={e => setFInvested(e.target.value)}
                      placeholder="0,00"
                      className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 font-mono" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Valor Atual (R$)</label>
                    <input type="text" inputMode="decimal" value={fCurrent} onChange={e => setFCurrent(e.target.value)}
                      placeholder="igual ao aportado"
                      className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 font-mono" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Taxa % a.a.</label>
                    <input type="text" inputMode="decimal" value={fRate} onChange={e => setFRate(e.target.value)}
                      placeholder="12,5"
                      className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 font-mono" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Data Início *</label>
                    <input type="date" value={fStartDate} onChange={e => setFStartDate(e.target.value)}
                      className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Vencimento</label>
                    <input type="date" value={fMaturity} onChange={e => setFMaturity(e.target.value)}
                      className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Conta Vinculada</label>
                    <select value={fAccountId} onChange={e => setFAccountId(e.target.value)}
                      className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none font-semibold">
                      <option value="">— Nenhuma —</option>
                      {accounts.filter(a => a.type === 'INVESTMENT').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Observações</label>
                    <input type="text" value={fNotes} onChange={e => setFNotes(e.target.value)}
                      placeholder="110% CDI, IPCA+6%, etc."
                      className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400" />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowForm(false)} className="text-xs text-slate-500 font-bold px-3 py-1.5 hover:bg-slate-100 rounded-lg">Cancelar</button>
                  <button type="submit" className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-1.5 rounded-lg">Adicionar Posição</button>
                </div>
              </form>
            </div>
          )}

          {/* Sub-view toggle */}
          {investments.length > 0 && (
            <div className="flex items-center gap-2">
              {([['list', 'Posições', BarChart2], ['allocation', 'Alocação', PieChart], ['projection', 'Projeção', TrendingUp]] as const).map(([v, label, Icon]) => (
                <button key={v} onClick={() => setActiveView(v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border-2 transition-all ${activeView === v ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
            </div>
          )}

          {investments.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-400 shadow-sm">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-semibold">Nenhum investimento cadastrado</p>
              <p className="text-xs mt-1">Clique em <strong>"Novo Aporte"</strong> para adicionar manualmente, ou <strong>"Importar B3"</strong> para conectar sua carteira.</p>
            </div>
          ) : (
            <>
              {/* POSITIONS LIST */}
              {activeView === 'list' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        {['Ativo', 'Classe', 'Aportado', 'Atual', 'Ganho', '%', 'Taxa a.a.', 'Venc.', ''].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {investments.map(inv => {
                        const meta = CLASS_META[inv.assetClass];
                        const gain = inv.currentValueInCents - inv.investedInCents;
                        const gainP = inv.investedInCents > 0 ? (gain / inv.investedInCents) * 100 : 0;
                        const isEditing = editingId === inv.id;
                        return (
                          <tr key={inv.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-4 py-3">
                              {isEditing ? (
                                <div className="space-y-1">
                                  <p className="font-bold text-slate-800">{inv.name}</p>
                                  <input value={eNotes} onChange={e => setENotes(e.target.value)}
                                    placeholder="Observações" className="w-full text-[10px] border border-slate-200 rounded px-2 py-1 focus:outline-none" />
                                </div>
                              ) : (
                                <div>
                                  <p className="font-bold text-slate-800">{inv.name}</p>
                                  {inv.ticker && <p className="text-[10px] font-mono text-slate-400 mt-0.5">{inv.ticker}</p>}
                                  {inv.notes && <p className="text-[10px] text-slate-400 italic mt-0.5">{inv.notes}</p>}
                                  <p className="text-[10px] text-slate-400">{inv.institution}</p>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${meta.bg}`} style={{ color: meta.color }}>
                                {meta.icon} {meta.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono font-bold text-slate-600">{fmt(inv.investedInCents)}</td>
                            <td className="px-4 py-3">
                              {isEditing ? (
                                <input value={eCurrent} onChange={e => setECurrent(e.target.value)} inputMode="decimal"
                                  className="w-28 text-xs font-mono border border-emerald-300 rounded px-2 py-1 focus:outline-none bg-emerald-50" />
                              ) : (
                                <span className="font-mono font-bold text-slate-800">{fmt(inv.currentValueInCents)}</span>
                              )}
                            </td>
                            <td className={`px-4 py-3 font-mono font-bold ${gain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {gain >= 0 ? '+' : ''}{fmt(gain)}
                            </td>
                            <td className={`px-4 py-3 font-mono font-bold text-sm ${gainP >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {fmtPct(gainP)}
                            </td>
                            <td className="px-4 py-3">
                              {isEditing ? (
                                <input value={eRate} onChange={e => setERate(e.target.value)} inputMode="decimal"
                                  placeholder="% a.a."
                                  className="w-20 text-xs font-mono border border-emerald-300 rounded px-2 py-1 focus:outline-none bg-emerald-50" />
                              ) : (
                                <span className="font-mono text-slate-500">{inv.annualRate !== null ? `${inv.annualRate}%` : '—'}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-400">
                              {inv.maturityDate ? new Date(inv.maturityDate + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                {isEditing ? (
                                  <>
                                    <button onClick={() => handleSaveEdit(inv.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg"><Check className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => setEditingId(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-3.5 h-3.5" /></button>
                                  </>
                                ) : (
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                    <button onClick={() => { setProjectionInvId(inv.id); setActiveView('projection'); }}
                                      title="Ver projeção" className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg">
                                      <TrendingUp className="w-3 h-3" />
                                    </button>
                                    <button onClick={() => startEdit(inv)} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg">
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    {deleteConfirmId === inv.id ? (
                                      <>
                                        <button onClick={() => handleDelete(inv.id)} className="text-[8px] bg-rose-600 text-white rounded px-1.5 py-0.5 font-bold">Sim</button>
                                        <button onClick={() => setDeleteConfirmId(null)} className="text-[8px] bg-slate-200 text-slate-600 rounded px-1.5 py-0.5 font-bold">Não</button>
                                      </>
                                    ) : (
                                      <button onClick={() => setDeleteConfirmId(inv.id)} className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg">
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ALLOCATION */}
              {activeView === 'allocation' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Alocação por Classe</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <RechartsPie>
                        <Pie data={byClass} dataKey="total" nameKey="label" cx="50%" cy="50%" outerRadius={100} paddingAngle={3} label={(props: any) => `${props.label} ${((props.percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                          {byClass.map(c => <Cell key={c.cls} fill={c.color} />)}
                        </Pie>
                        <Tooltip formatter={(v) => fmt(Number(v))} />
                      </RechartsPie>
                    </ResponsiveContainer>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Detalhamento</p>
                    {byClass.map(c => {
                      const pctVal = totalCurrent > 0 ? (c.total / totalCurrent) * 100 : 0;
                      return (
                        <div key={c.cls}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-bold text-slate-700 flex items-center gap-1.5">
                              <span>{c.icon}</span>{c.label}
                              <span className="text-[10px] text-slate-400 font-normal">({c.count} posição{c.count > 1 ? 'ões' : ''})</span>
                            </span>
                            <span className="font-mono font-bold text-slate-800">{fmt(c.total)} <span className="text-slate-400 font-normal">({pctVal.toFixed(1)}%)</span></span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pctVal}%`, backgroundColor: c.color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* PROJECTION */}
              {activeView === 'projection' && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Ativo para Projetar</label>
                      <select value={projectionInvId || ''} onChange={e => setProjectionInvId(e.target.value || null)}
                        className="text-xs border border-slate-200 rounded-lg px-3 py-2 font-semibold focus:outline-none min-w-[200px]">
                        <option value="">— Selecionar —</option>
                        {investments.filter(i => i.annualRate !== null).map(i => (
                          <option key={i.id} value={i.id}>{i.name} ({i.annualRate}% a.a.)</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Horizonte: <span className="text-emerald-600">{projectionMonths} meses</span>
                      </label>
                      <input type="range" min={6} max={120} step={6} value={projectionMonths}
                        onChange={e => setProjectionMonths(Number(e.target.value))}
                        className="w-48 accent-emerald-600" />
                    </div>
                    {projInv && projData.length > 0 && (
                      <div className="ml-auto text-right">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Valor Projetado em {projectionMonths}m</p>
                        <p className="text-xl font-black text-emerald-600 font-mono">{fmt(projData[projData.length - 1]?.value || 0)}</p>
                        <p className="text-[10px] text-slate-400">
                          Ganho: {fmt((projData[projData.length - 1]?.value || 0) - (projInv.currentValueInCents))}
                        </p>
                      </div>
                    )}
                  </div>

                  {!projInv && (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>Selecione um ativo com taxa % a.a. para ver a projeção de juros compostos.</p>
                    </div>
                  )}
                  {projInv && !projInv.annualRate && (
                    <div className="py-8 text-center text-amber-600 text-xs font-medium">
                      <AlertCircle className="w-6 h-6 mx-auto mb-2" />
                      <p>Este ativo não possui taxa % a.a. cadastrada. Edite-o para habilitar a projeção.</p>
                    </div>
                  )}
                  {projData.length > 0 && (
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={projData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#16A34A" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#16A34A" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={Math.floor(projectionMonths / 6)} />
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => `R$${(v / 100).toLocaleString('pt-BR', { notation: 'compact' })}`} width={64} />
                        <Tooltip formatter={(v) => fmt(Number(v))} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11 }} />
                        <Area type="monotone" dataKey="value" stroke="#16A34A" strokeWidth={2} fill="url(#projGrad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
