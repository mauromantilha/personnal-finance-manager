import { useState, useMemo } from 'react';
import { Users, Plus, Trash2, CheckCircle, AlertCircle, TrendingDown, TrendingUp } from 'lucide-react';
import { FamilyMember, Transaction } from '../types';

interface FamilyModuleProps {
  members: FamilyMember[];
  transactions: Transaction[];
  onAddMember: (name: string, avatarColor: string) => Promise<boolean>;
  onDeleteMember: (id: string) => Promise<boolean>;
}

const AVATAR_COLORS = ['#6366F1', '#0284C7', '#059669', '#EA580C', '#DC2626', '#DB2777', '#8B5CF6', '#0891B2', '#EAB308'];

function Avatar({ member, size = 'md' }: { member: FamilyMember; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'lg' ? 'w-12 h-12 text-base' : size === 'sm' ? 'w-7 h-7 text-[11px]' : 'w-9 h-9 text-sm';
  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center font-black text-white shrink-0`}
      style={{ backgroundColor: member.avatarColor }}
    >
      {member.name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function FamilyModule({ members, transactions, onAddMember, onDeleteMember }: FamilyModuleProps) {
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(AVATAR_COLORS[0]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const notify = (text: string, type: 'success' | 'error') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const fmt = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const currentMonth = new Date().toISOString().slice(0, 7);

  // Per-member stats for the current month
  const memberStats = useMemo(() => {
    return members.map(m => {
      const memberTxs = transactions.filter(t => t.memberId === m.id);
      const monthTxs = memberTxs.filter(t => t.date.startsWith(currentMonth));
      const totalExpense = monthTxs.filter(t => t.type === 'DES').reduce((s, t) => s + t.amountInCents, 0);
      const totalIncome = monthTxs.filter(t => t.type === 'REC').reduce((s, t) => s + t.amountInCents, 0);
      const txCount = memberTxs.length;
      const lastTx = memberTxs[0] || null;
      return { member: m, totalExpense, totalIncome, txCount, lastTx };
    });
  }, [members, transactions, currentMonth]);

  // Unassigned transactions this month
  const unassigned = useMemo(() =>
    transactions.filter(t => !t.memberId && t.date.startsWith(currentMonth)),
    [transactions, currentMonth]
  );
  const unassignedExpense = unassigned.filter(t => t.type === 'DES').reduce((s, t) => s + t.amountInCents, 0);

  const handleAdd = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!newName.trim()) { notify('Informe o nome do membro.', 'error'); return; }
    const ok = await onAddMember(newName.trim(), newColor);
    if (ok) { notify(`${newName} adicionado(a)!`, 'success'); setNewName(''); setShowForm(false); }
    else notify('Erro ao adicionar membro.', 'error');
  };

  const handleDelete = async (id: string) => {
    const ok = await onDeleteMember(id);
    if (ok) { notify('Membro removido.', 'success'); setDeleteConfirmId(null); }
    else notify('Não é possível excluir membro com transações.', 'error');
  };

  // Top expense categories per member
  const memberTopCategories = (memberId: string) => {
    const cats = transactions
      .filter(t => t.memberId === memberId && t.type === 'DES' && t.date.startsWith(currentMonth))
      .reduce((acc: Record<string, number>, t) => { acc[t.category] = (acc[t.category] || 0) + t.amountInCents; return acc; }, {});
    return Object.entries(cats).sort(([, a], [, b]) => b - a).slice(0, 3);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            Família & Membros
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Associe gastos a membros da família e acompanhe o consumo individual.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" /> Novo Membro
        </button>
      </div>

      {statusMsg && (
        <div className={`p-3 rounded-lg flex items-center gap-2 border text-xs font-medium animate-fadeIn ${statusMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {statusMsg.type === 'success' ? <CheckCircle className="w-4 h-4 text-green-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
          {statusMsg.text}
        </div>
      )}

      {/* Add member form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-fadeIn">
          <h3 className="font-semibold text-slate-800 text-sm mb-4">Novo Membro da Família</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nome</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Ex: Maria, João, Beatriz…"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Cor do Avatar</label>
              <div className="flex gap-2 flex-wrap">
                {AVATAR_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${newColor === c ? 'scale-125 border-slate-900' : 'border-transparent'}`}
                  />
                ))}
              </div>
            </div>
            {/* Preview */}
            {newName && (
              <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-white text-sm" style={{ backgroundColor: newColor }}>
                  {newName.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-semibold text-slate-700">{newName}</span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="text-xs text-slate-500 font-bold px-3 py-1.5 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button type="submit" className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-1.5 rounded-lg">Adicionar</button>
            </div>
          </form>
        </div>
      )}

      {/* Members grid */}
      {members.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-400 shadow-sm">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Nenhum membro cadastrado</p>
          <p className="text-xs mt-1">Clique em "Novo Membro" para começar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {memberStats.map(({ member, totalExpense, totalIncome, txCount, lastTx }) => {
            const topCats = memberTopCategories(member.id);
            return (
              <div key={member.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="p-5 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${member.avatarColor}18, ${member.avatarColor}08)`, borderBottom: `2px solid ${member.avatarColor}30` }}>
                  <div className="flex items-center gap-3">
                    <Avatar member={member} size="lg" />
                    <div>
                      <p className="font-bold text-slate-800">{member.name}</p>
                      <p className="text-[10px] text-slate-400">{txCount} lançamento{txCount !== 1 ? 's' : ''} no total</p>
                    </div>
                  </div>
                  {deleteConfirmId === member.id ? (
                    <div className="flex gap-1">
                      <button onClick={() => handleDelete(member.id)} className="text-[9px] bg-rose-600 text-white rounded px-2 py-1 font-bold">Sim</button>
                      <button onClick={() => setDeleteConfirmId(null)} className="text-[9px] bg-slate-200 text-slate-600 rounded px-2 py-1 font-bold">Não</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirmId(member.id)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Stats */}
                <div className="p-4 grid grid-cols-2 gap-3">
                  <div className="bg-rose-50 rounded-xl p-3">
                    <div className="flex items-center gap-1 mb-1">
                      <TrendingDown className="w-3 h-3 text-rose-500" />
                      <span className="text-[9px] font-bold text-rose-500 uppercase">Despesas mês</span>
                    </div>
                    <p className="text-sm font-black text-rose-700 font-mono">{fmt(totalExpense)}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-3">
                    <div className="flex items-center gap-1 mb-1">
                      <TrendingUp className="w-3 h-3 text-emerald-500" />
                      <span className="text-[9px] font-bold text-emerald-500 uppercase">Receitas mês</span>
                    </div>
                    <p className="text-sm font-black text-emerald-700 font-mono">{fmt(totalIncome)}</p>
                  </div>
                </div>

                {/* Top categories */}
                {topCats.length > 0 && (
                  <div className="px-4 pb-4 space-y-1.5">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Top categorias (mês)</p>
                    {topCats.map(([cat, val]) => (
                      <div key={cat} className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-600 font-medium">{cat}</span>
                        <span className="font-mono font-bold text-rose-600">{fmt(val)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Last transaction */}
                {lastTx && (
                  <div className="px-4 pb-4 pt-2 border-t border-slate-100">
                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Último lançamento</p>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-600 font-medium truncate max-w-[140px]">{lastTx.description}</span>
                      <span className={`font-mono font-bold ${lastTx.type === 'REC' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {lastTx.type === 'REC' ? '+' : '-'}{fmt(lastTx.amountInCents)}
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-400 mt-0.5">{lastTx.date}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Unassigned banner */}
      {members.length > 0 && unassigned.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {unassigned.length} lançamento{unassigned.length !== 1 ? 's' : ''} sem membro atribuído este mês
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Total: <span className="font-bold">{fmt(unassignedExpense)}</span> em despesas não atribuídas.
              Ao lançar novas transações, selecione o membro responsável.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
