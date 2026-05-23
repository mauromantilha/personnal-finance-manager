import React, { useState } from 'react';
import { RefreshCw, Plus, Trash2, CheckCircle, AlertCircle, Edit2, Calendar } from 'lucide-react';
import { Recurrence, RecurrenceFrequency, FinancialAccount, Category } from '../types';

interface RecurrencesModuleProps {
  recurrences: Recurrence[];
  accounts: FinancialAccount[];
  categories: Category[];
  onAdd: (data: any) => Promise<boolean>;
  onUpdate: (id: string, data: any) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onProcessNow: () => Promise<void>;
}

const FREQ_LABEL: Record<RecurrenceFrequency, string> = {
  daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal', yearly: 'Anual',
};

const FREQ_ICON: Record<RecurrenceFrequency, string> = {
  daily: '📅', weekly: '📆', monthly: '🗓️', yearly: '📊',
};

function nextDueDate(rec: Recurrence): string {
  if (!rec.isActive) return '—';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last = rec.lastGeneratedDate ? new Date(rec.lastGeneratedDate) : new Date(rec.startDate);
  last.setDate(last.getDate() - 1);

  let next = new Date(last);
  switch (rec.frequency) {
    case 'daily':   next.setDate(next.getDate() + 1); break;
    case 'weekly':  next.setDate(next.getDate() + 7); break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      if (rec.dayOfMonth) next.setDate(Math.min(rec.dayOfMonth, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
      break;
    case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
  }
  if (rec.endDate && next > new Date(rec.endDate)) return 'Encerrada';
  const diff = Math.ceil((next.getTime() - today.getTime()) / 86400000);
  const label = next.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  if (diff < 0) return `Atrasada (${label})`;
  if (diff === 0) return `Hoje (${label})`;
  if (diff === 1) return `Amanhã (${label})`;
  return `Em ${diff} dias (${label})`;
}

function nextDueDiff(rec: Recurrence): number {
  if (!rec.isActive) return 9999;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const last = rec.lastGeneratedDate ? new Date(rec.lastGeneratedDate) : new Date(rec.startDate);
  last.setDate(last.getDate() - 1);
  const next = new Date(last);
  switch (rec.frequency) {
    case 'daily':   next.setDate(next.getDate() + 1); break;
    case 'weekly':  next.setDate(next.getDate() + 7); break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      if (rec.dayOfMonth) next.setDate(Math.min(rec.dayOfMonth, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
      break;
    case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
  }
  return Math.ceil((next.getTime() - today.getTime()) / 86400000);
}

export default function RecurrencesModule({ recurrences, accounts, categories, onAdd, onUpdate, onDelete, onProcessNow }: RecurrencesModuleProps) {
  const [showForm, setShowForm] = useState(false);
  const [editRec, setEditRec] = useState<Recurrence | null>(null);
  const [processing, setProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form state
  const [desc, setDesc] = useState('');
  const [amountBRL, setAmountBRL] = useState('');
  const [txType, setTxType] = useState<'REC' | 'DES'>('DES');
  const [category, setCategory] = useState('');
  const [accountId, setAccountId] = useState('');
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');

  const fmt = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const notify = (text: string, type: 'success' | 'error') => { setStatusMsg({ text, type }); setTimeout(() => setStatusMsg(null), 4000); };

  const parentCats = categories.filter(c => !c.parentId).map(c => c.name);
  const catOptions = parentCats.length > 0 ? parentCats : ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Educação', 'Receita', 'Investimentos', 'Outros'];

  function openNew() {
    setEditRec(null);
    setDesc(''); setAmountBRL(''); setTxType('DES'); setCategory(catOptions[0] || 'Outros');
    setAccountId(accounts[0]?.id || ''); setFrequency('monthly'); setDayOfMonth('1');
    setStartDate(new Date().toISOString().split('T')[0]); setEndDate('');
    setShowForm(true);
  }

  function openEdit(r: Recurrence) {
    setEditRec(r);
    setDesc(r.description); setAmountBRL((r.amountInCents / 100).toFixed(2).replace('.', ','));
    setTxType(r.type); setCategory(r.category); setAccountId(r.accountId || '');
    setFrequency(r.frequency); setDayOfMonth(String(r.dayOfMonth || 1));
    setStartDate(r.startDate); setEndDate(r.endDate || '');
    setShowForm(true);
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = parseFloat(amountBRL.replace(',', '.'));
    if (!desc || isNaN(parsed) || parsed <= 0 || !accountId)
      return notify('Preencha descrição, valor e conta corretamente.', 'error');
    const data = {
      description: desc, amountInCents: Math.round(parsed * 100), type: txType, category,
      accountId, frequency, dayOfMonth: frequency === 'monthly' ? parseInt(dayOfMonth) : null,
      startDate, endDate: endDate || null, isActive: true,
    };
    const ok = editRec ? await onUpdate(editRec.id, data) : await onAdd(data);
    if (ok) { setShowForm(false); notify(editRec ? 'Recorrência atualizada!' : 'Recorrência criada!', 'success'); }
    else notify('Erro ao salvar recorrência.', 'error');
  };

  const handleDelete = async (id: string, description: string) => {
    if (!confirm(`Desativar recorrência "${description}"?`)) return;
    const ok = await onDelete(id);
    if (ok) notify('Recorrência desativada.', 'success');
    else notify('Erro ao desativar.', 'error');
  };

  const handleProcessNow = async () => {
    setProcessing(true);
    await onProcessNow();
    setProcessing(false);
    notify('Recorrências processadas com sucesso!', 'success');
  };

  // Sort by next due date
  const sorted = [...recurrences].sort((a, b) => nextDueDiff(a) - nextDueDiff(b));
  const upcoming = sorted.filter(r => nextDueDiff(r) <= 7);
  const expenses = recurrences.filter(r => r.type === 'DES');
  const income = recurrences.filter(r => r.type === 'REC');
  const monthlyExpense = expenses.filter(r => r.frequency === 'monthly').reduce((s, r) => s + r.amountInCents, 0);
  const monthlyIncome = income.filter(r => r.frequency === 'monthly').reduce((s, r) => s + r.amountInCents, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-teal-600" />
            Módulo 4: Transações Recorrentes & Assinaturas
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Configure despesas e receitas fixas. O sistema as lança automaticamente nas datas certas.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleProcessNow} disabled={processing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${processing ? 'animate-spin' : ''}`} /> Processar agora
          </button>
          <button onClick={openNew} className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm">
            <Plus className="w-3.5 h-3.5" /> Nova Recorrência
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className={`p-3 rounded-lg flex items-center gap-2 border text-xs font-medium ${statusMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {statusMsg.type === 'success' ? <CheckCircle className="w-4 h-4 text-green-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
          {statusMsg.text}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Despesas fixas/mês</p>
          <p className="text-2xl font-black text-rose-600 mt-1 font-mono">{fmt(monthlyExpense)}</p>
          <p className="text-[11px] text-slate-400 mt-1">{expenses.length} recorrência{expenses.length !== 1 ? 's' : ''} ativa{expenses.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Receitas fixas/mês</p>
          <p className="text-2xl font-black text-emerald-600 mt-1 font-mono">{fmt(monthlyIncome)}</p>
          <p className="text-[11px] text-slate-400 mt-1">{income.length} recorrência{income.length !== 1 ? 's' : ''} ativa{income.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Saldo fixo líquido/mês</p>
          <p className={`text-2xl font-black mt-1 font-mono ${monthlyIncome - monthlyExpense >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {fmt(monthlyIncome - monthlyExpense)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">{upcoming.length} vence em até 7 dias</p>
        </div>
      </div>

      {/* Upcoming this week */}
      {upcoming.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5 mb-3">
            <Calendar className="w-3.5 h-3.5" /> Próximos 7 dias
          </h3>
          <div className="space-y-2">
            {upcoming.map(r => {
              const diff = nextDueDiff(r);
              return (
                <div key={r.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 border border-amber-100">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{FREQ_ICON[r.frequency]}</span>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">{r.description}</p>
                      <p className="text-[10px] text-slate-400">{r.category} · {FREQ_LABEL[r.frequency]}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-bold font-mono ${r.type === 'REC' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {r.type === 'REC' ? '+' : '-'}{fmt(r.amountInCents)}
                    </p>
                    <p className={`text-[10px] font-semibold ${diff <= 0 ? 'text-rose-500' : diff <= 2 ? 'text-amber-600' : 'text-slate-400'}`}>
                      {nextDueDate(r)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-fadeIn">
          <h3 className="font-semibold text-slate-800 text-sm mb-4">{editRec ? 'Editar Recorrência' : 'Nova Recorrência'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Descrição</label>
                <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ex: Netflix, Aluguel, Salário"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tipo</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setTxType('DES')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border-2 transition-all ${txType === 'DES' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-100 text-slate-500'}`}>
                    Despesa
                  </button>
                  <button type="button" onClick={() => setTxType('REC')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border-2 transition-all ${txType === 'REC' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 text-slate-500'}`}>
                    Receita
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Valor (R$)</label>
                <input value={amountBRL} onChange={e => setAmountBRL(e.target.value)} placeholder="0,00"
                  className="w-full text-xs font-mono font-bold border border-slate-200 rounded-lg px-3 py-2 focus:outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Categoria</label>
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none font-semibold">
                  {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Conta</label>
                <select value={accountId} onChange={e => setAccountId(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none font-semibold">
                  <option value="">Selecione...</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Frequência</label>
                <select value={frequency} onChange={e => setFrequency(e.target.value as RecurrenceFrequency)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none font-semibold">
                  <option value="daily">Diário</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensal</option>
                  <option value="yearly">Anual</option>
                </select>
              </div>
              {frequency === 'monthly' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Dia do mês</label>
                  <input type="number" min={1} max={31} value={dayOfMonth} onChange={e => setDayOfMonth(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none" />
                </div>
              )}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Data de início</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Data de encerramento (opcional)</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowForm(false)} className="text-xs text-slate-500 font-bold px-3 py-1.5 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button type="submit" className="text-xs bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-1.5 rounded-lg">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {/* Full list */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5 mb-4">
          <RefreshCw className="w-4 h-4 text-slate-500" /> Todas as Recorrências
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-semibold">
                <th className="py-2 px-3 text-left">Descrição</th>
                <th className="py-2 px-3 text-left">Categoria</th>
                <th className="py-2 px-3 text-left">Frequência</th>
                <th className="py-2 px-3 text-left">Próximo</th>
                <th className="py-2 px-3 text-right">Valor</th>
                <th className="py-2 px-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sorted.map(r => {
                const diff = nextDueDiff(r);
                return (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <span>{FREQ_ICON[r.frequency]}</span> {r.description}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Conta: {r.accountId ? (r.accountId) : '—'} · Início: {r.startDate}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-[10px]">{r.category}</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">{FREQ_LABEL[r.frequency]}{r.dayOfMonth ? ` (dia ${r.dayOfMonth})` : ''}</td>
                    <td className="py-2.5 px-3">
                      <span className={`text-[11px] font-semibold ${diff <= 0 ? 'text-rose-500' : diff <= 3 ? 'text-amber-500' : 'text-slate-400'}`}>
                        {nextDueDate(r)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold font-mono">
                      <span className={r.type === 'REC' ? 'text-emerald-600' : 'text-rose-600'}>
                        {r.type === 'REC' ? '+' : '-'}{fmt(r.amountInCents)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEdit(r)} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(r.id, r.description)} className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {recurrences.length === 0 && (
            <div className="py-12 text-center text-slate-400">
              <RefreshCw className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-semibold">Nenhuma recorrência configurada</p>
              <p className="text-xs mt-1">Adicione salário, aluguel, assinaturas e o sistema lança automaticamente.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
