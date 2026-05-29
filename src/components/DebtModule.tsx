import { useState, useEffect } from 'react';
import {
  ShieldAlert, Plus, Trash2, Pencil, BrainCircuit, ExternalLink,
  X, CheckCircle2, AlertTriangle, Clock, RefreshCw, ChevronDown,
  ChevronUp, Key,
} from 'lucide-react';
import type { Debt, DebtType, DebtStatus } from '../types';

// ── Constants ──────────────────────────────────────────────────────────────────

const DEBT_TYPES: { value: DebtType; label: string }[] = [
  { value: 'cartao',        label: 'Cartão de Crédito' },
  { value: 'banco',         label: 'Banco / Empréstimo' },
  { value: 'financiamento', label: 'Financiamento' },
  { value: 'aluguel',       label: 'Aluguel' },
  { value: 'outros',        label: 'Outros' },
];

const TYPE_BADGE: Record<DebtType, string> = {
  cartao:        'bg-rose-100 text-rose-700 border border-rose-200',
  banco:         'bg-blue-100 text-blue-700 border border-blue-200',
  financiamento: 'bg-violet-100 text-violet-700 border border-violet-200',
  aluguel:       'bg-amber-100 text-amber-700 border border-amber-200',
  outros:        'bg-slate-100 text-slate-600 border border-slate-200',
};

const STATUS_BADGE: Record<DebtStatus, string> = {
  ativo:      'bg-rose-50 text-rose-700 border border-rose-200',
  negociando: 'bg-amber-50 text-amber-700 border border-amber-200',
  quitado:    'bg-emerald-50 text-emerald-700 border border-emerald-200',
};

const STATUS_LABELS: Record<DebtStatus, string> = {
  ativo: 'Ativo', negociando: 'Negociando', quitado: 'Quitado',
};

const fmtCents = (n: number) =>
  `R$ ${(n / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const parseBRL = (s: string) =>
  Math.round(parseFloat(s.replace(/\./g, '').replace(',', '.')) * 100) || 0;

// ── Simple markdown renderer ───────────────────────────────────────────────────

function InlineBold({ text }: { text: string }) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? <strong key={i} className="font-semibold text-slate-800">{p}</strong> : p
      )}
    </>
  );
}

function SimpleMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('## '))
          return <h3 key={i} className="text-sm font-bold text-slate-800 mt-4 first:mt-0 pb-1 border-b border-slate-100">{line.slice(3)}</h3>;
        if (line.startsWith('### '))
          return <h4 key={i} className="text-xs font-bold text-slate-700 mt-3 first:mt-0">{line.slice(4)}</h4>;
        if (line.startsWith('- ') || line.startsWith('* '))
          return (
            <div key={i} className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed">
              <span className="text-indigo-400 shrink-0 mt-0.5">•</span>
              <span><InlineBold text={line.slice(2)} /></span>
            </div>
          );
        if (line.trim() === '') return <div key={i} className="h-1.5" />;
        return <p key={i} className="text-xs text-slate-700 leading-relaxed"><InlineBold text={line} /></p>;
      })}
    </div>
  );
}

// ── Groq key panel ─────────────────────────────────────────────────────────────

function GroqKeyPanel({ onSave }: { onSave: (k: string) => void }) {
  const [val, setVal] = useState('');
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Key className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-xs font-bold text-amber-800">Chave Groq necessária</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            Insira sua chave Groq gratuita para usar a análise com IA.
          </p>
          <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 underline underline-offset-2">
            Obter em console.groq.com <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
      <div className="flex gap-2">
        <input type="password" placeholder="gsk_..." value={val} onChange={e => setVal(e.target.value)}
          className="flex-1 text-xs border border-amber-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400" />
        <button
          disabled={!val.startsWith('gsk_') || val.length < 20}
          onClick={() => { sessionStorage.setItem('__userGroqKey', val); onSave(val); }}
          className="px-3 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap">
          Salvar
        </button>
      </div>
    </div>
  );
}

// ── Form defaults ──────────────────────────────────────────────────────────────

const emptyForm = () => ({
  creditor: '',
  type: 'cartao' as DebtType,
  originalAmountStr: '',
  currentAmountStr: '',
  dueDate: '',
  monthsOverdue: '0',
  status: 'ativo' as DebtStatus,
  notes: '',
});

// ── Main component ─────────────────────────────────────────────────────────────

export default function DebtModule() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchDebts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/debts');
      if (res.ok) { const data = await res.json(); setDebts(data.debts ?? []); }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDebts(); }, []);

  // ── Form helpers ───────────────────────────────────────────────────────────

  const openAdd = () => { setForm(emptyForm()); setEditingId(null); setShowForm(true); };

  const openEdit = (d: Debt) => {
    setForm({
      creditor: d.creditor,
      type: d.type as DebtType,
      originalAmountStr: (d.originalAmountInCents / 100).toFixed(2).replace('.', ','),
      currentAmountStr:  (d.currentAmountInCents  / 100).toFixed(2).replace('.', ','),
      dueDate:       d.dueDate ?? '',
      monthsOverdue: String(d.monthsOverdue),
      status:        d.status as DebtStatus,
      notes:         d.notes ?? '',
    });
    setEditingId(d.id);
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(emptyForm()); };

  const saveDebt = async () => {
    if (!form.creditor.trim() || !form.originalAmountStr || !form.currentAmountStr) return;
    setSaving(true);
    const payload = {
      creditor:             form.creditor.trim(),
      type:                 form.type,
      originalAmountInCents: parseBRL(form.originalAmountStr),
      currentAmountInCents:  parseBRL(form.currentAmountStr),
      dueDate:       form.dueDate || null,
      monthsOverdue: parseInt(form.monthsOverdue, 10) || 0,
      status:        form.status,
      notes:         form.notes || null,
    };
    try {
      const url    = editingId ? `/api/debts/${editingId}` : '/api/debts';
      const method = editingId ? 'PUT' : 'POST';
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      await fetchDebts();
      closeForm();
    } finally {
      setSaving(false);
    }
  };

  const deleteDebt = async (id: string) => {
    if (!confirm('Excluir esta dívida?')) return;
    setDeleting(id);
    try {
      await fetch(`/api/debts/${id}`, { method: 'DELETE' });
      setDebts(prev => prev.filter(d => d.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  // ── AI analysis ────────────────────────────────────────────────────────────

  const runAnalysis = async (retryKey?: string) => {
    setAnalyzing(true);
    setAnalyzeError('');
    setShowKeyPanel(false);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const groqKey = retryKey ?? sessionStorage.getItem('__userGroqKey') ?? '';
    if (groqKey) headers['X-Groq-Api-Key'] = groqKey;
    try {
      const res  = await fetch('/api/debts/analyze', { method: 'POST', headers });
      const data = await res.json();
      if (res.status === 401 || data.error === 'GROQ_KEY_MISSING') { setShowKeyPanel(true); return; }
      if (res.status === 429 || data.error === 'RATE_LIMIT')        { setShowKeyPanel(true); return; }
      if (!res.ok) { setAnalyzeError('Erro na análise. Tente novamente.'); return; }
      setAnalysis(data.analysis ?? '');
      setShowAnalysis(true);
    } catch {
      setAnalyzeError('Erro de conexão. Tente novamente.');
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Derived stats ──────────────────────────────────────────────────────────

  const activeDebts   = debts.filter(d => d.status !== 'quitado');
  const totalActive   = activeDebts.reduce((s, d) => s + d.currentAmountInCents, 0);
  const maxOverdue    = activeDebts.reduce((m, d) => Math.max(m, d.monthsOverdue), 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-500" />
            Crédito & Saúde do CPF
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Gerencie dívidas, simule estratégias de negociação e consulte sua situação no Serasa.
          </p>
        </div>
        <button onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm shrink-0">
          <Plus className="w-4 h-4" /> Adicionar Dívida
        </button>
      </div>

      {/* Summary cards */}
      {activeDebts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total em dívida</p>
            <p className="text-xl font-black text-rose-600 mt-1">{fmtCents(totalActive)}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dívidas ativas</p>
            <p className="text-xl font-black text-slate-800 mt-1">{activeDebts.length}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm col-span-2 sm:col-span-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Maior atraso</p>
            <p className="text-xl font-black text-amber-600 mt-1">{maxOverdue} {maxOverdue === 1 ? 'mês' : 'meses'}</p>
          </div>
        </div>
      )}

      {/* Debt list */}
      {loading ? (
        <div className="flex justify-center py-10">
          <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
        </div>
      ) : debts.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 flex flex-col items-center gap-4 text-center">
          <ShieldAlert className="w-10 h-10 text-slate-300" />
          <div>
            <p className="text-sm font-bold text-slate-600">Nenhuma dívida cadastrada</p>
            <p className="text-xs text-slate-400 mt-1">Registre suas dívidas para obter estratégias personalizadas de negociação.</p>
          </div>
          <button onClick={openAdd}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors">
            <Plus className="w-3.5 h-3.5" /> Adicionar primeira dívida
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {debts.map(d => (
            <div key={d.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-800">{d.creditor}</p>
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${TYPE_BADGE[d.type as DebtType] ?? 'bg-slate-100 text-slate-600'}`}>
                      {DEBT_TYPES.find(t => t.value === d.type)?.label ?? d.type}
                    </span>
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${STATUS_BADGE[d.status as DebtStatus] ?? ''}`}>
                      {STATUS_LABELS[d.status as DebtStatus] ?? d.status}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>Valor atual: <strong className="text-rose-600">{fmtCents(d.currentAmountInCents)}</strong></span>
                    <span>Original: <strong className="text-slate-700">{fmtCents(d.originalAmountInCents)}</strong></span>
                    {d.monthsOverdue > 0 && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <Clock className="w-3 h-3" />{d.monthsOverdue} {d.monthsOverdue === 1 ? 'mês' : 'meses'} em atraso
                      </span>
                    )}
                    {d.dueDate && <span>Venc.: {new Date(d.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                  </div>
                  {d.notes && <p className="mt-1.5 text-[11px] text-slate-400 italic">{d.notes}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(d)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteDebt(d.id)} disabled={deleting === d.id}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI Analysis section */}
      {activeDebts.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <button
              onClick={() => runAnalysis()}
              disabled={analyzing}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition-all shadow-sm">
              {analyzing
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Analisando dívidas...</>
                : <><BrainCircuit className="w-4 h-4" /> Analisar Dívidas com IA</>}
            </button>
            {analysis && !analyzing && (
              <button onClick={() => setShowAnalysis(v => !v)}
                className="inline-flex items-center gap-1.5 text-xs text-indigo-600 font-semibold hover:underline">
                {showAnalysis ? <><ChevronUp className="w-3.5 h-3.5" /> Recolher análise</> : <><ChevronDown className="w-3.5 h-3.5" /> Ver análise</>}
              </button>
            )}
          </div>

          {showKeyPanel && <GroqKeyPanel onSave={k => runAnalysis(k)} />}

          {analyzeError && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl p-3">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <p className="text-xs text-rose-700">{analyzeError}</p>
            </div>
          )}

          {analysis && showAnalysis && (
            <div className="bg-white border border-indigo-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                <BrainCircuit className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-800">Estratégias de Negociação — IA Especialista</h3>
                <span className="ml-auto text-[10px] text-slate-400 font-medium">llama-3.3-70b</span>
              </div>
              <SimpleMarkdown text={analysis} />
              <p className="mt-4 text-[10px] text-slate-400 border-t border-slate-50 pt-3">
                Análise baseada nos seus dados reais + conhecimento sobre práticas de negociação no Brasil. Não substitui consultoria jurídica ou financeira profissional.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Serasa CTA */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-slate-700">Consulte seu CPF no Serasa</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Veja dívidas negativadas, score e ofertas de renegociação.</p>
        </div>
        <a
          href="https://www.serasaconsumidor.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-xs font-bold rounded-xl transition-all shrink-0 shadow-sm">
          Acessar Serasa <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Add/Edit form — sidesheet */}
      {/* Backdrop */}
      <div
        onClick={closeForm}
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${showForm ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      />

      {/* Panel */}
      <div className={`fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${showForm ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h3 className="text-sm font-bold text-slate-800">
            {editingId ? 'Editar Dívida' : 'Nova Dívida'}
          </h3>
          <button onClick={closeForm} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 [&::-webkit-scrollbar]:w-0 [scrollbar-width:none]">
          {/* Creditor */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Credor *</label>
            <input
              type="text" placeholder="Ex: Nubank, Itaú, Casas Bahia..."
              value={form.creditor}
              onChange={e => setForm(f => ({ ...f, creditor: e.target.value }))}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Type + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Tipo *</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as DebtType }))}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500 bg-white">
                {DEBT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as DebtStatus }))}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500 bg-white">
                <option value="ativo">Ativo</option>
                <option value="negociando">Negociando</option>
                <option value="quitado">Quitado</option>
              </select>
            </div>
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Valor Original * (R$)</label>
              <input type="text" placeholder="0,00" value={form.originalAmountStr}
                onChange={e => setForm(f => ({ ...f, originalAmountStr: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Valor Atual/Corrigido * (R$)</label>
              <input type="text" placeholder="0,00" value={form.currentAmountStr}
                onChange={e => setForm(f => ({ ...f, currentAmountStr: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Due date + Months overdue */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Data de Vencimento</label>
              <input type="date" value={form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Meses em Atraso</label>
              <input type="number" min="0" placeholder="0" value={form.monthsOverdue}
                onChange={e => setForm(f => ({ ...f, monthsOverdue: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Observações</label>
            <textarea rows={4} placeholder="Ex: dívida já negativada, em cobrança, aguardando proposta..."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>
        </div>

        {/* Footer actions — pinned to bottom */}
        <div className="shrink-0 flex gap-3 px-6 py-4 border-t border-slate-100 bg-white">
          <button onClick={closeForm}
            className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={saveDebt}
            disabled={saving || !form.creditor.trim() || !form.originalAmountStr || !form.currentAmountStr}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors">
            {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Adicionar dívida'}
          </button>
        </div>
      </div>
    </div>
  );
}
