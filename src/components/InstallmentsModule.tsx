import { useState, useMemo } from 'react';
import { CreditCard, Plus, Trash2, CheckCircle, AlertCircle, Calendar, TrendingDown } from 'lucide-react';
import { InstallmentGroup, FinancialAccount, FamilyMember, Category } from '../types';

interface InstallmentsModuleProps {
  installmentGroups: InstallmentGroup[];
  accounts: FinancialAccount[];
  members: FamilyMember[];
  categories: Category[];
  onAddInstallment: (data: {
    description: string; totalInCents: number; installmentCount: number;
    startDate: string; accountId?: string; creditCardId?: string; category: string; memberId?: string;
  }) => Promise<boolean>;
  onCancelInstallment: (groupId: string) => Promise<boolean>;
}

const fmt = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function InstallmentsModule({
  installmentGroups, accounts, members, categories,
  onAddInstallment, onCancelInstallment,
}: InstallmentsModuleProps) {
  const [showForm, setShowForm] = useState(false);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form state
  const [desc, setDesc] = useState('');
  const [totalStr, setTotalStr] = useState('');
  const [count, setCount] = useState(12);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [accountId, setAccountId] = useState('');
  const [category, setCategory] = useState('Compras');
  const [memberId, setMemberId] = useState('');

  const expenseCategories = useMemo(() =>
    categories.filter(c => c.type === 'expense' || c.type === 'both'),
    [categories]
  );

  const notify = (text: string, type: 'success' | 'error') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleAdd = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    const totalRaw = parseFloat(totalStr.replace(',', '.'));
    if (!desc.trim()) return notify('Informe a descrição.', 'error');
    if (isNaN(totalRaw) || totalRaw <= 0) return notify('Valor total inválido.', 'error');
    if (!accountId) return notify('Selecione a conta.', 'error');
    const totalInCents = Math.round(totalRaw * 100);
    const ok = await onAddInstallment({
      description: desc.trim(), totalInCents, installmentCount: count,
      startDate, accountId: accountId || undefined, category, memberId: memberId || undefined,
    });
    if (ok) {
      notify(`Parcelamento criado! ${count}x de ${fmt(Math.round(totalInCents / count))}`, 'success');
      setDesc(''); setTotalStr(''); setCount(12); setAccountId(''); setMemberId('');
      setShowForm(false);
    } else notify('Erro ao criar parcelamento.', 'error');
  };

  const handleCancel = async (id: string) => {
    const ok = await onCancelInstallment(id);
    if (ok) { notify('Parcelas futuras canceladas.', 'success'); setCancelConfirmId(null); }
    else notify('Erro ao cancelar.', 'error');
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-violet-600" />
            Compras Parceladas
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Registre compras parceladas e acompanhe o progresso de cada grupo.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" /> Nova Compra Parcelada
        </button>
      </div>

      {statusMsg && (
        <div className={`p-3 rounded-lg flex items-center gap-2 border text-xs font-medium animate-fadeIn ${statusMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {statusMsg.type === 'success' ? <CheckCircle className="w-4 h-4 text-green-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
          {statusMsg.text}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-fadeIn">
          <h3 className="font-semibold text-slate-800 text-sm mb-4">Nova Compra Parcelada</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Descrição</label>
                <input type="text" value={desc} onChange={e => setDesc(e.target.value)}
                  placeholder="Ex: TV Samsung, Notebook, Móveis…"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400" autoFocus />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Valor Total (R$)</label>
                <input type="text" inputMode="decimal" value={totalStr} onChange={e => setTotalStr(e.target.value)}
                  placeholder="0,00"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400 font-mono" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Parcelas: <span className="text-violet-600">{count}x</span>
                  {totalStr && !isNaN(parseFloat(totalStr.replace(',', '.'))) && (
                    <span className="ml-1 text-slate-400">= {fmt(Math.round(parseFloat(totalStr.replace(',', '.')) * 100 / count))} /mês</span>
                  )}
                </label>
                <input type="range" min={2} max={48} step={1} value={count} onChange={e => setCount(Number(e.target.value))}
                  className="w-full accent-violet-600" />
                <div className="flex justify-between text-[9px] text-slate-400 mt-0.5"><span>2x</span><span>48x</span></div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">1ª Parcela em</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Conta Débito</label>
                <select value={accountId} onChange={e => setAccountId(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none font-semibold">
                  <option value="">— Selecionar —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Categoria</label>
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none font-semibold">
                  {expenseCategories.length > 0
                    ? expenseCategories.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)
                    : ['Compras', 'Eletrônicos', 'Móveis', 'Vestuário', 'Saúde', 'Educação', 'Outros'].map(c => <option key={c} value={c}>{c}</option>)
                  }
                </select>
              </div>
              {members.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Membro</label>
                  <select value={memberId} onChange={e => setMemberId(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none font-semibold">
                    <option value="">— Todos —</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="text-xs text-slate-500 font-bold px-3 py-1.5 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button type="submit" className="text-xs bg-violet-600 hover:bg-violet-700 text-white font-bold px-4 py-1.5 rounded-lg">Criar Parcelamento</button>
            </div>
          </form>
        </div>
      )}

      {/* Groups list */}
      {installmentGroups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-400 shadow-sm">
          <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Nenhuma compra parcelada</p>
          <p className="text-xs mt-1">Clique em "Nova Compra Parcelada" para começar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {installmentGroups.map(group => {
            const remaining = group.installmentCount - group.paidCount;
            const progressPct = Math.round((group.paidCount / group.installmentCount) * 100);
            const isComplete = remaining <= 0;
            const lastInstallDate = (() => {
              const d = new Date(group.startDate + 'T12:00:00');
              d.setMonth(d.getMonth() + group.installmentCount - 1);
              return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
            })();
            const member = members.find(m => m.id === group.memberId);

            return (
              <div key={group.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Header */}
                <div className={`p-4 border-b border-slate-100 ${isComplete ? 'bg-emerald-50' : 'bg-violet-50/40'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{group.description}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Até {lastInstallDate}
                        {member && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: member.avatarColor }}>
                            {member.name}
                          </span>
                        )}
                      </p>
                    </div>
                    {isComplete ? (
                      <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">Quitado</span>
                    ) : cancelConfirmId === group.id ? (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => handleCancel(group.id)} className="text-[9px] bg-rose-600 text-white rounded px-2 py-1 font-bold">Sim</button>
                        <button onClick={() => setCancelConfirmId(null)} className="text-[9px] bg-slate-200 text-slate-600 rounded px-2 py-1 font-bold">Não</button>
                      </div>
                    ) : (
                      <button onClick={() => setCancelConfirmId(group.id)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress */}
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium">{group.paidCount} de {group.installmentCount} parcelas pagas</span>
                    <span className={`font-bold ${isComplete ? 'text-emerald-600' : 'text-violet-600'}`}>{progressPct}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isComplete ? 'bg-emerald-500' : 'bg-violet-500'}`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="text-center">
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Total</p>
                      <p className="text-xs font-black text-slate-700 font-mono">{fmt(group.totalInCents)}</p>
                    </div>
                    <div className="text-center border-x border-slate-100">
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Por mês</p>
                      <p className="text-xs font-black text-violet-600 font-mono">{fmt(group.installmentAmountInCents)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Restante</p>
                      <p className={`text-xs font-black font-mono ${isComplete ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isComplete ? '—' : fmt(remaining * group.installmentAmountInCents)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                    <TrendingDown className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] text-slate-400">{group.category}</span>
                    {!isComplete && remaining > 0 && (
                      <span className="ml-auto text-[10px] font-bold text-rose-600">
                        {remaining} parcela{remaining !== 1 ? 's' : ''} restante{remaining !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Next payment */}
                  {!isComplete && (() => {
                    const nextNum = group.paidCount + 1;
                    const d = new Date(group.startDate + 'T12:00:00');
                    d.setMonth(d.getMonth() + nextNum - 1);
                    const nextDateStr = d.toISOString().split('T')[0];
                    const isOverdue = nextDateStr < today;
                    return (
                      <div className={`rounded-xl p-2.5 text-[10px] font-medium ${isOverdue ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'}`}>
                        {isOverdue ? '⚠️ Vencida: ' : '📅 Próxima: '}
                        <span className="font-bold">{d.toLocaleDateString('pt-BR')}</span>
                        {' — '}{fmt(group.installmentAmountInCents)}
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
