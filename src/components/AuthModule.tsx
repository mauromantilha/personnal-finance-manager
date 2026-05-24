/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import {
  Shield, Plus, Trash2, RotateCw, CheckCircle,
  UserPlus, Mail, Smartphone, AlertTriangle, X,
} from 'lucide-react';

interface ManagedUser {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  has2fa: boolean;
  createdAt: string;
}

export default function AuthModule() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Create user form
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [form2FA, setForm2FA] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // QR code modal (shown after creating user with 2FA)
  const [qrModal, setQrModal] = useState<{ name: string; email: string; qrDataUrl: string } | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const handleCreateUser = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setFormError('');
    if (!formName.trim() || !formEmail.trim()) { setFormError('Nome e email são obrigatórios.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim(), email: formEmail.trim(), with2fa: form2FA }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Erro ao criar usuário.'); return; }
      if (data.qrDataUrl) {
        setQrModal({ name: formName.trim(), email: formEmail.trim(), qrDataUrl: data.qrDataUrl });
      }
      setShowForm(false);
      setFormName('');
      setFormEmail('');
      setForm2FA(false);
      await loadUsers();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (id: string, name: string) => {
    if (!confirm(`Remover usuário "${name}"? Esta ação não pode ser desfeita.`)) return;
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    await loadUsers();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            Módulo 12: Gestão de Usuários
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Crie usuários e envie convites por e-mail. 2FA via app autenticador é opcional.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setFormError(''); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
        >
          <UserPlus className="w-4 h-4" /> Novo Usuário
        </button>
      </div>

      {/* Create user form */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-500" /> Criar Novo Usuário
            </h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Nome completo"
                  required
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  placeholder="usuario@email.com"
                  required
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* 2FA toggle */}
            <div
              onClick={() => setForm2FA(v => !v)}
              className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all select-none ${
                form2FA
                  ? 'border-indigo-300 bg-indigo-50'
                  : 'border-slate-200 bg-slate-50 hover:border-slate-300'
              }`}
            >
              <div className={`w-9 h-5 rounded-full relative transition-colors ${form2FA ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form2FA ? 'left-4' : 'left-0.5'}`} />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5" /> Habilitar 2FA com Autenticador
                </p>
                <p className="text-[11px] text-slate-500">
                  {form2FA
                    ? 'Um QR Code será gerado para configurar o Google Authenticator / Authy.'
                    : 'O usuário poderá acessar apenas com email e senha.'}
                </p>
              </div>
            </div>

            {/* Info */}
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg p-3">
              <Mail className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-700">
                Um e-mail de convite será enviado para <strong>{formEmail || 'o endereço informado'}</strong> com o link para criar a senha.
                {form2FA && ' O QR Code do autenticador aparecerá aqui para você compartilhar com o usuário.'}
              </p>
            </div>

            {formError && (
              <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> {formError}
              </p>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors"
              >
                {submitting ? (
                  <><RotateCw className="w-3.5 h-3.5 animate-spin" /> Criando...</>
                ) : (
                  <><UserPlus className="w-3.5 h-3.5" /> Criar e Enviar Convite</>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* QR Code modal */}
      {qrModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-indigo-600" /> QR Code 2FA — {qrModal.name}
              </h3>
              <button onClick={() => setQrModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Compartilhe o QR Code abaixo com <strong>{qrModal.name}</strong> para configurar o autenticador (Google Authenticator, Authy, etc.).
            </p>
            <div className="flex justify-center p-4 bg-white border border-slate-200 rounded-xl">
              <img src={qrModal.qrDataUrl} alt="QR Code 2FA" className="w-52 h-52" />
            </div>
            <p className="text-[11px] text-slate-500 text-center">
              O convite por e-mail também foi enviado para <strong>{qrModal.email}</strong>.
            </p>
            <button
              onClick={() => setQrModal(null)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* User list */}
      {loading ? (
        <div className="flex justify-center py-10">
          <RotateCw className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : users.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center">
            <Shield className="w-6 h-6 text-slate-300" />
          </div>
          <p className="text-sm font-bold text-slate-500">Nenhum usuário cadastrado</p>
          <p className="text-xs text-slate-400">Clique em "Novo Usuário" para criar o primeiro acesso.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Usuários ({users.length})</h3>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left font-bold text-slate-600">Nome</th>
                  <th className="px-5 py-3 text-left font-bold text-slate-600">Email</th>
                  <th className="px-5 py-3 text-left font-bold text-slate-600">2FA</th>
                  <th className="px-5 py-3 text-left font-bold text-slate-600">Criado em</th>
                  <th className="px-5 py-3 text-right font-bold text-slate-600"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-semibold text-slate-800">{u.name}</td>
                    <td className="px-5 py-3 text-slate-600 font-mono">{u.email}</td>
                    <td className="px-5 py-3">
                      {u.has2fa ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Smartphone className="w-2.5 h-2.5" /> Ativo
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-400 font-mono">
                      {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => handleDeleteUser(u.id, u.name)}
                        className="text-red-400 hover:text-red-600 transition-colors p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl p-4">
        <CheckCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-500 leading-relaxed">
          O acesso de <strong>administrador</strong> (sua senha atual) continua funcionando normalmente. Usuários criados aqui fazem login com email + senha definida via convite.
        </p>
      </div>
    </div>
  );
}
