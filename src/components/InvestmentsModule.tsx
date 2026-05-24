import { useState, useMemo } from 'react';
import { TrendingUp, Plus, Pencil, Trash2, CheckCircle, AlertCircle, X, Check, BarChart2, PieChart } from 'lucide-react';
import { PieChart as RechartsPie, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Investment, AssetClass, FinancialAccount } from '../types';

interface InvestmentsModuleProps {
  investments: Investment[];
  accounts: FinancialAccount[];
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

export default function InvestmentsModule({ investments, accounts, onAdd, onUpdate, onDelete }: InvestmentsModuleProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [activeView, setActiveView] = useState<'list' | 'allocation' | 'projection'>('list');
  const [projectionInvId, setProjectionInvId] = useState<string | null>(null);
  const [projectionMonths, setProjectionMonths] = useState(24);

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
        <button
          onClick={() => { setShowForm(!showForm); resetForm(); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" /> Novo Aporte
        </button>
      </div>

      {statusMsg && (
        <div className={`p-3 rounded-lg flex items-center gap-2 border text-xs font-medium animate-fadeIn ${statusMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {statusMsg.type === 'success' ? <CheckCircle className="w-4 h-4 text-green-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
          {statusMsg.text}
        </div>
      )}

      {/* Portfolio KPIs */}
      {investments.length > 0 && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Total Aportado', value: fmt(totalInvested), color: 'text-slate-800', bg: 'bg-white' },
            { label: 'Valor Atual', value: fmt(totalCurrent), color: 'text-emerald-700', bg: 'bg-emerald-50' },
            { label: 'Ganho / Perda', value: fmt(totalGain), color: totalGain >= 0 ? 'text-emerald-700' : 'text-rose-700', bg: totalGain >= 0 ? 'bg-emerald-50' : 'bg-rose-50' },
            { label: 'Rentabilidade Total', value: fmtPct(gainPct), color: gainPct >= 0 ? 'text-emerald-700' : 'text-rose-700', bg: gainPct >= 0 ? 'bg-emerald-50' : 'bg-rose-50' },
          ].map(k => (
            <div key={k.label} className={`${k.bg} rounded-2xl border border-slate-200 p-5 shadow-sm`}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{k.label}</p>
              <p className={`text-lg font-black font-mono mt-1 ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
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

      {investments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-400 shadow-sm">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Nenhum investimento cadastrado</p>
          <p className="text-xs mt-1">Clique em "Novo Aporte" para começar a sua carteira.</p>
        </div>
      ) : (
        <>
          {/* View toggle */}
          <div className="flex items-center gap-2">
            {([['list', 'Posições', BarChart2], ['allocation', 'Alocação', PieChart], ['projection', 'Projeção', TrendingUp]] as const).map(([v, label, Icon]) => (
              <button key={v} onClick={() => setActiveView(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border-2 transition-all ${activeView === v ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>

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
                    <Tooltip formatter={(v: number) => fmt(v)} />
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
                    <Tooltip formatter={(v: number) => fmt(v)} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="value" stroke="#16A34A" strokeWidth={2} fill="url(#projGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
