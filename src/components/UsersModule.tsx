import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Trash2, Shield, User, Link2, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { AppUser, FamilyMember } from '../types';

interface UsersModuleProps {
  members: FamilyMember[];
  userRole: 'owner' | 'member';
  currentUserId: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Administrador',
  member: 'Membro Individual',
};

export default function UsersModule({ members, userRole, currentUserId }: UsersModuleProps) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'owner' | 'member'>('member');
  const [memberId, setMemberId] = useState('');
  const [relationship, setRelationship] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const notify = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 5000);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      if (res.ok) setUsers(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) { notify('Nome e email são obrigatórios.', 'error'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { notify('Email inválido.', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), role, memberId: memberId || null, relationship: relationship || null }),
      });
      const data = await res.json();
      if (res.ok) {
        notify(`Usuário "${name}" criado! Acesso no Zero Trust liberado automaticamente.`, 'success');
        setName(''); setEmail(''); setRole('member'); setMemberId(''); setRelationship('');
        setShowForm(false);
        await fetchUsers();
      } else {
        notify(data.error || 'Erro ao criar usuário.', 'error');
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      if (res.ok) { notify('Usuário removido.', 'success'); await fetchUsers(); }
      else { const d = await res.json(); notify(d.error || 'Erro ao remover.', 'error'); }
    } finally { setDeleteConfirm(null); }
  };

  const handleLinkMember = async (userId: string, mId: string) => {
    try {
      const res = await fetch(`/api/users/${userId}/member`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: mId || null }),
      });
      if (res.ok) { notify('Vínculo atualizado!', 'success'); await fetchUsers(); }
      else { const d = await res.json(); notify(d.error || 'Erro ao vincular.', 'error'); }
    } catch { notify('Erro de conexão.', 'error'); }
  };

  const isOwner = userRole === 'owner';

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="font-black text-slate-800 text-base">Gerenciar Usuários</h2>
              <p className="text-xs text-slate-500">Contas de acesso ao portal financeiro</p>
            </div>
          </div>
          {isOwner && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo Usuário
            </button>
          )}
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
          <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-[11px] text-blue-700 leading-relaxed">
            <strong>Como funciona:</strong> Administradores veem todos os lançamentos. Membros individuais veem apenas seus próprios lançamentos (consolidados no painel do admin).
            Ao criar um novo usuário, o acesso no <strong>Cloudflare Zero Trust</strong> é liberado automaticamente pelo sistema.
          </div>
        </div>
      </div>

      {/* Status */}
      {statusMsg && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border text-sm font-semibold ${
          statusMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
          statusMsg.type === 'info' ? 'bg-blue-50 border-blue-200 text-blue-700' :
          'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          {statusMsg.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /> :
           statusMsg.type === 'info' ? <Info className="w-4 h-4 shrink-0 mt-0.5" /> :
           <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          {statusMsg.text}
        </div>
      )}

      {/* Create form */}
      {showForm && isOwner && (
        <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-6 space-y-4">
          <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
            <Plus className="w-4 h-4 text-indigo-500" /> Adicionar Usuário
          </h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nome</label>
                <input
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Ex: Maria Silva"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Email (CF Access)</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="maria@email.com"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Papel / Permissão</label>
                <select
                  value={role} onChange={e => setRole(e.target.value as 'owner' | 'member')}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
                >
                  <option value="member">Membro Individual (vê só seus gastos)</option>
                  <option value="owner">Administrador (vê tudo)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Relação com o Admin</label>
                <select
                  value={relationship} onChange={e => setRelationship(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
                >
                  <option value="">— Selecionar —</option>
                  <option value="Titular">Titular</option>
                  <option value="Esposa">Esposa / Cônjuge</option>
                  <option value="Esposo">Esposo / Cônjuge</option>
                  <option value="Filho">Filho</option>
                  <option value="Filha">Filha</option>
                  <option value="Pai">Pai</option>
                  <option value="Mãe">Mãe</option>
                  <option value="Irmão">Irmão</option>
                  <option value="Irmã">Irmã</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Vincular a Membro da Família</label>
                <select
                  value={memberId} onChange={e => setMemberId(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 font-semibold"
                >
                  <option value="">— Sem vínculo —</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-700">
              <strong>✅ Acesso automático:</strong> Ao criar, o sistema libera o acesso no Cloudflare Zero Trust automaticamente. O usuário já pode logar com o email <strong>{email || '...'}</strong>.
            </div>

            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-all">Cancelar</button>
              <button type="submit" disabled={saving} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50">
                {saving ? 'Criando...' : 'Criar Usuário'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Usuários Cadastrados</p>
        </div>

        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Nenhum usuário cadastrado.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {users.map(u => {
              const linkedMember = members.find(m => m.id === u.memberId);
              const isMe = u.id === currentUserId;
              return (
                <div key={u.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                    {u.role === 'owner'
                      ? <Shield className="w-4 h-4 text-indigo-600" />
                      : <User className="w-4 h-4 text-slate-500" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-800 truncate">{u.name}</p>
                      {isMe && <span className="text-[9px] font-black px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded-full uppercase tracking-wider">você</span>}
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        u.role === 'owner' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono">{u.email}</p>
                    {u.relationship && (
                      <p className="text-[10px] text-violet-600 font-semibold mt-0.5">{u.relationship}</p>
                    )}
                    {linkedMember && (
                      <p className="text-[10px] text-teal-600 font-semibold flex items-center gap-1 mt-0.5">
                        <Link2 className="w-3 h-3" />
                        Vinculado a: {linkedMember.name}
                      </p>
                    )}
                  </div>

                  {/* Link member dropdown (owner can edit other members) */}
                  {isOwner && !isMe && (
                    <select
                      value={u.memberId ?? ''}
                      onChange={e => handleLinkMember(u.id, e.target.value)}
                      className="text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 focus:outline-none focus:border-indigo-400 font-semibold text-slate-600"
                      title="Vincular a membro da família"
                    >
                      <option value="">— Sem vínculo —</option>
                      {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  )}

                  {isOwner && !isMe && (
                    deleteConfirm === u.id ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => handleDelete(u.id)} className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold transition-all">Confirmar</button>
                        <button onClick={() => setDeleteConfirm(null)} className="px-3 py-1.5 text-slate-500 hover:bg-slate-100 rounded-lg text-[10px] font-bold transition-all">Cancelar</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(u.id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all shrink-0" title="Remover usuário">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Privacy note for members */}
      {userRole === 'member' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-slate-700 mb-1">Privacidade dos seus dados</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                Como usuário membro, você visualiza e gerencia apenas seus próprios lançamentos. Seus dados são consolidados no painel do administrador familiar, mas outros membros não têm acesso às suas informações financeiras.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
