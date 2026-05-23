/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import {
  Target,
  Settings,
  DollarSign,
  CheckCircle,
  TrendingUp,
  Sliders,
  Calendar,
  Trash2,
  Plus
} from 'lucide-react';
import { CategoryBudget, Category, FinancialGoal } from '../types';

interface BudgetsModuleProps {
  budgets: CategoryBudget[];
  goals: FinancialGoal[];
  categories: Category[];
  onUpdateBudget: (category: string, limitInCents: number) => Promise<boolean>;
  onDeleteBudget: (id: string) => Promise<boolean>;
  onDepositGoal: (id: string, amountInCents: number) => Promise<boolean>;
  onCreateGoal: (goalData: { name: string; targetInCents: number; targetDate: string; color?: string; currentInCents?: number }) => Promise<boolean>;
  onDeleteGoal: (id: string) => Promise<boolean>;
}

export default function BudgetsModule({
  budgets,
  goals,
  categories,
  onUpdateBudget,
  onDeleteBudget,
  onDepositGoal,
  onCreateGoal,
  onDeleteGoal,
}: BudgetsModuleProps) {

  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [newBudgetLimit, setNewBudgetLimit] = useState('');

  const [selectedGoalId, setSelectedGoalId] = useState('');
  const [goalDepositAmount, setGoalDepositAmount] = useState('');

  const [showGoalForm, setShowGoalForm] = useState(false);
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalTarget, setNewGoalTarget] = useState('');
  const [newGoalCurrent, setNewGoalCurrent] = useState('');
  const [newGoalDate, setNewGoalDate] = useState('');
  const [newGoalColor, setNewGoalColor] = useState('#6366F1');

  const [showAddBudget, setShowAddBudget] = useState(false);
  const [newBudgetCategory, setNewBudgetCategory] = useState('');
  const [newBudgetValue, setNewBudgetValue] = useState('');

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteBudgetConfirmId, setDeleteBudgetConfirmId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const GOAL_COLORS = ['#6366F1', '#0284C7', '#EA580C', '#10B981', '#EC4899', '#8B5CF6'];

  // Parent categories from D1 (no parentId) for budget category selector
  const parentCategories = categories.filter(c => !c.parentId);
  // Fall back to a static list if D1 categories haven't loaded yet
  const categoryOptions = parentCategories.length > 0
    ? parentCategories.map(c => c.name)
    : ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Educação', 'Outros'];

  const formatBRL = (cents: number) =>
    (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const fb = (text: string, type: 'success' | 'error') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 4500);
  };

  const handleBudgetSubmit = async (e: { preventDefault(): void }, category: string) => {
    e.preventDefault();
    const parsed = parseFloat(newBudgetLimit.replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) { fb('Insira um valor limite válido maior que zero.', 'error'); return; }
    const success = await onUpdateBudget(category, Math.round(parsed * 100));
    if (success) { fb(`Orçamento de "${category}" ajustado!`, 'success'); setEditingCategory(null); setNewBudgetLimit(''); }
    else fb('Erro ao persistir limite.', 'error');
  };

  const handleAddBudget = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!newBudgetCategory) { fb('Selecione uma categoria.', 'error'); return; }
    const parsed = parseFloat(newBudgetValue.replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) { fb('Insira um valor limite válido.', 'error'); return; }
    const success = await onUpdateBudget(newBudgetCategory, Math.round(parsed * 100));
    if (success) { fb(`Orçamento de "${newBudgetCategory}" criado!`, 'success'); setShowAddBudget(false); setNewBudgetCategory(''); setNewBudgetValue(''); }
    else fb('Erro ao criar orçamento.', 'error');
  };

  const handleGoalDeposit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!selectedGoalId || !goalDepositAmount) { fb('Escolha um objetivo e insira um valor.', 'error'); return; }
    const parsed = parseFloat(goalDepositAmount.replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) { fb('Insira um valor válido.', 'error'); return; }
    const success = await onDepositGoal(selectedGoalId, Math.round(parsed * 100));
    if (success) { fb('Aporte realizado com sucesso!', 'success'); setGoalDepositAmount(''); setSelectedGoalId(''); }
    else fb('Falha ao registrar aporte.', 'error');
  };

  const handleCreateGoalSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!newGoalName.trim()) { fb('Insira o nome da meta.', 'error'); return; }
    const targetParsed = parseFloat(newGoalTarget.replace(',', '.'));
    if (isNaN(targetParsed) || targetParsed <= 0) { fb('Insira um valor alvo válido.', 'error'); return; }
    if (!newGoalDate) { fb('Selecione uma data alvo.', 'error'); return; }
    const currentParsed = newGoalCurrent ? parseFloat(newGoalCurrent.replace(',', '.')) : 0;
    const success = await onCreateGoal({
      name: newGoalName, targetInCents: Math.round(targetParsed * 100),
      targetDate: newGoalDate, color: newGoalColor,
      currentInCents: isNaN(currentParsed) ? 0 : Math.round(currentParsed * 100),
    });
    if (success) {
      fb(`Meta "${newGoalName}" criada!`, 'success');
      setShowGoalForm(false); setNewGoalName(''); setNewGoalTarget(''); setNewGoalCurrent(''); setNewGoalDate(''); setNewGoalColor('#6366F1');
    } else fb('Erro ao criar meta.', 'error');
  };

  // Categories with used budgets (to exclude from "add" selector)
  const usedCategories = new Set(budgets.map(b => b.category.toLowerCase()));
  const availableForNew = categoryOptions.filter(c => !usedCategories.has(c.toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <Target className="w-5 h-5 text-indigo-600" />
          Módulo 6: Planejamento & Orçamentos
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Defina tetos de gasto por categoria e acompanhe metas de patrimônio com alertas inteligentes.
        </p>
      </div>

      {feedback && (
        <div className={`p-3 rounded-lg border text-xs font-semibold animate-fadeIn ${
          feedback.type === 'success' ? 'bg-indigo-50 border-indigo-200 text-indigo-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Budget section */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-slate-500" />
              Tetos de Gastos por Categoria
            </h3>
            {availableForNew.length > 0 && (
              <button
                onClick={() => setShowAddBudget(!showAddBudget)}
                className="flex items-center gap-1 text-[10px] font-extrabold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-all"
              >
                <Plus className="w-3 h-3" />
                {showAddBudget ? 'Fechar' : 'Adicionar'}
              </button>
            )}
          </div>

          {/* Add new budget inline form */}
          {showAddBudget && (
            <form onSubmit={handleAddBudget} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 animate-fadeIn">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Novo Teto de Categoria</h4>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] text-slate-400 uppercase font-semibold mb-1">Categoria</label>
                  <select
                    value={newBudgetCategory}
                    onChange={e => setNewBudgetCategory(e.target.value)}
                    className="w-full bg-white border border-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 font-semibold"
                    required
                  >
                    <option value="">Selecione...</option>
                    {availableForNew.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] text-slate-400 uppercase font-semibold mb-1">Teto (R$)</label>
                  <input
                    type="text"
                    placeholder="500,00"
                    value={newBudgetValue}
                    onChange={e => setNewBudgetValue(e.target.value)}
                    className="w-full bg-white border border-slate-200 text-xs font-mono font-bold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAddBudget(false)} className="w-1/2 py-1.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg">Cancelar</button>
                <button type="submit" className="w-1/2 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg">Criar Teto</button>
              </div>
            </form>
          )}

          {/* Budget rows */}
          <div className="space-y-4">
            {budgets.map(b => {
              const fraction = b.limitInCents > 0 ? b.spentInCents / b.limitInCents : 0;
              const percentage = Math.round(fraction * 100);
              const remaining = b.limitInCents - b.spentInCents;

              let barColor = 'bg-emerald-500';
              let badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
              if (fraction >= 1.0) { barColor = 'bg-rose-600'; badgeColor = 'bg-rose-50 text-rose-700 border-rose-200'; }
              else if (fraction >= 0.8) { barColor = 'bg-amber-500'; badgeColor = 'bg-amber-50 text-amber-700 border-amber-200'; }

              const catMeta = parentCategories.find(c => c.name.toLowerCase() === b.category.toLowerCase());

              return (
                <div key={b.id} className="p-3.5 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors space-y-2 group relative">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {catMeta && <span className="text-base leading-none">{catMeta.icon}</span>}
                      <div>
                        <span className="text-xs font-semibold text-slate-700">{b.category}</span>
                        <span className="text-[10px] text-slate-400 font-medium ml-2">
                          Gasto: <span className="font-mono font-bold">{formatBRL(b.spentInCents)}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase border ${badgeColor}`}>
                        {percentage}% {fraction >= 1.0 ? 'Estourado' : fraction >= 0.8 ? 'Atenção' : 'OK'}
                      </span>

                      <button
                        onClick={() => { setEditingCategory(b.category); setNewBudgetLimit((b.limitInCents / 100).toString()); }}
                        className="text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-all"
                        title="Editar teto"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>

                      {deleteBudgetConfirmId === b.id ? (
                        <div className="flex items-center gap-1 animate-fadeIn">
                          <button onClick={async () => { await onDeleteBudget(b.id); setDeleteBudgetConfirmId(null); fb(`Orçamento de "${b.category}" removido.`, 'success'); }} className="text-[8px] uppercase font-extrabold bg-rose-600 text-white rounded px-1.5 py-0.5">Sim</button>
                          <button onClick={() => setDeleteBudgetConfirmId(null)} className="text-[8px] uppercase font-extrabold bg-slate-200 text-slate-600 rounded px-1.5 py-0.5">Não</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteBudgetConfirmId(b.id)} className="text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-all p-0.5" title="Remover orçamento">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div style={{ width: `${Math.min(percentage, 100)}%` }} className={`${barColor} h-full transition-all duration-300`} />
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
                    <span>Teto: <span className="font-mono font-bold text-slate-500">{formatBRL(b.limitInCents)}</span></span>
                    {remaining >= 0
                      ? <span>Sobra <span className="font-mono font-bold">R$ {(remaining / 100).toFixed(2)}</span></span>
                      : <span className="text-rose-500 font-bold">Estouro de <span className="font-mono">R$ {Math.abs(remaining / 100).toFixed(2)}</span></span>
                    }
                  </div>

                  {editingCategory === b.category && (
                    <form onSubmit={e => handleBudgetSubmit(e, b.category)} className="bg-slate-50/70 p-3 rounded-lg border border-slate-200 gap-2 flex items-center justify-between mt-2 animate-fadeIn">
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-slate-500 uppercase">Novo Teto R$</span>
                        <input type="text" value={newBudgetLimit} onChange={e => setNewBudgetLimit(e.target.value)} className="w-24 text-xs font-mono font-bold bg-white border border-slate-200 rounded-lg px-2 py-0.5 focus:outline-none" />
                      </div>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => setEditingCategory(null)} className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-lg text-[10px] font-bold">Sair</button>
                        <button type="submit" className="bg-indigo-600 text-white px-2 py-0.5 rounded-lg text-[10px] font-bold">Salvar</button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}

            {budgets.length === 0 && (
              <div className="py-10 text-center text-slate-400 text-xs space-y-2">
                <DollarSign className="w-8 h-8 text-slate-200 mx-auto" />
                <p>Nenhum orçamento cadastrado. Clique em "Adicionar" para criar o primeiro teto.</p>
              </div>
            )}
          </div>
        </div>

        {/* Goals section */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                <Target className="w-4 h-4 text-slate-500" />
                Metas de Poupança
              </h3>
              <button onClick={() => setShowGoalForm(!showGoalForm)} className="text-[10px] uppercase font-extrabold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg flex items-center gap-1 transition-all">
                <Plus className="w-3 h-3" />
                {showGoalForm ? 'Fechar' : 'Nova Meta'}
              </button>
            </div>

            {showGoalForm && (
              <form onSubmit={handleCreateGoalSubmit} className="bg-slate-50/70 p-4 border border-slate-200 rounded-xl space-y-3 animate-fadeIn my-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Definir Nova Meta</h4>
                <div className="space-y-2">
                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase font-semibold">Nome da Meta</label>
                    <input type="text" placeholder="Ex: Viagem Europa" value={newGoalName} onChange={e => setNewGoalName(e.target.value)} className="w-full bg-white text-slate-800 border border-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 font-semibold" required />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] text-slate-400 uppercase font-semibold">Alvo (R$)</label>
                      <input type="text" placeholder="1500,00" value={newGoalTarget} onChange={e => setNewGoalTarget(e.target.value)} className="w-full bg-white border border-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none font-mono font-bold" required />
                    </div>
                    <div>
                      <label className="block text-[9px] text-slate-400 uppercase font-semibold">Já Poupado</label>
                      <input type="text" placeholder="0,00" value={newGoalCurrent} onChange={e => setNewGoalCurrent(e.target.value)} className="w-full bg-white border border-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none font-mono font-bold" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase font-semibold">Prazo</label>
                    <input type="date" value={newGoalDate} onChange={e => setNewGoalDate(e.target.value)} className="w-full bg-white border border-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none font-semibold" required />
                  </div>
                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase font-semibold mb-1">Cor</label>
                    <div className="flex items-center gap-1.5">
                      {GOAL_COLORS.map(color => (
                        <button key={color} type="button" onClick={() => setNewGoalColor(color)} style={{ backgroundColor: color }} className={`w-5 h-5 rounded-full border-2 transition-all ${newGoalColor === color ? 'border-slate-800 scale-110' : 'border-transparent opacity-70'}`} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setShowGoalForm(false)} className="w-1/2 py-1.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg">Cancelar</button>
                  <button type="submit" className="w-1/2 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg shadow">Salvar Meta</button>
                </div>
              </form>
            )}

            <div className="space-y-4">
              {goals.map(goal => {
                const fraction = goal.targetInCents > 0 ? goal.currentInCents / goal.targetInCents : 0;
                const pct = Math.round(fraction * 100);
                return (
                  <div key={goal.id} className="border border-slate-200 rounded-xl p-3.5 space-y-2 hover:border-slate-300 transition-all group relative">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">{goal.name}</h4>
                        <p className="text-[9px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {new Date(goal.targetDate).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {pct >= 100 && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                        {deleteConfirmId === goal.id ? (
                          <div className="flex items-center gap-1 animate-fadeIn">
                            <button onClick={async () => { await onDeleteGoal(goal.id); setDeleteConfirmId(null); fb(`Meta "${goal.name}" removida.`, 'success'); }} className="text-[8px] uppercase font-extrabold bg-rose-600 text-white rounded px-1.5 py-0.5">Sim</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="text-[8px] uppercase font-extrabold bg-slate-200 text-slate-600 rounded px-1.5 py-0.5">Não</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirmId(goal.id)} className="text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-all p-1 rounded hover:bg-slate-50">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <span style={{ color: goal.color }} className="text-xs font-bold font-mono italic">{pct}%</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: goal.color }} className="h-full transition-all duration-500" />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                      <span>Poupado: <strong className="font-mono">{formatBRL(goal.currentInCents)}</strong></span>
                      <span>Alvo: <span className="font-mono font-bold">{formatBRL(goal.targetInCents)}</span></span>
                    </div>
                  </div>
                );
              })}
              {goals.length === 0 && (
                <div className="py-8 text-center text-slate-400 text-xs space-y-2">
                  <Target className="w-8 h-8 text-slate-200 mx-auto" />
                  <p>Nenhuma meta cadastrada ainda.</p>
                </div>
              )}
            </div>
          </div>

          {/* Aporte widget */}
          <div className="bg-indigo-950 text-white rounded-2xl p-6 shadow-sm">
            <h3 className="font-semibold text-xs uppercase tracking-wider text-indigo-300 flex items-center gap-1.5 mb-3.5">
              <TrendingUp className="w-4 h-4" />
              Realizar Aporte em Meta
            </h3>
            <form onSubmit={handleGoalDeposit} className="space-y-3.5">
              <div>
                <label className="block text-[10px] text-slate-300 uppercase font-semibold mb-1">Destinar para:</label>
                <select value={selectedGoalId} onChange={e => setSelectedGoalId(e.target.value)} className="w-full bg-indigo-900 text-indigo-100 border border-indigo-800 text-xs rounded-xl px-3 py-1.5 focus:outline-none">
                  <option value="">Selecione uma meta...</option>
                  {goals.map(g => <option key={g.id} value={g.id}>{g.name} ({formatBRL(g.targetInCents)})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-300 uppercase font-semibold mb-1">Valor do Aporte (R$)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-300 font-bold text-xs font-mono">R$</span>
                  <input type="text" placeholder="120,00" value={goalDepositAmount} onChange={e => setGoalDepositAmount(e.target.value)} className="w-full bg-indigo-900 border border-indigo-800 text-white font-mono font-bold text-xs rounded-xl pl-9 pr-3 py-1.5 focus:outline-none placeholder-indigo-400" />
                </div>
              </div>
              <button type="submit" className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-colors shadow-lg">
                Efetuar Aporte
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
