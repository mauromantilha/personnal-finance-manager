/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Target, 
  Settings, 
  PlusSquare, 
  DollarSign, 
  CheckCircle,
  HelpCircle,
  TrendingUp,
  Sliders,
  Calendar,
  Trash2
} from 'lucide-react';
import { CategoryBudget, FinancialGoal } from '../types';

interface BudgetsModuleProps {
  budgets: CategoryBudget[];
  goals: FinancialGoal[];
  onUpdateBudget: (category: string, limitInCents: number) => Promise<boolean>;
  onDepositGoal: (id: string, amountInCents: number) => Promise<boolean>;
  onCreateGoal: (goalData: { name: string; targetInCents: number; targetDate: string; color?: string; currentInCents?: number }) => Promise<boolean>;
  onDeleteGoal: (id: string) => Promise<boolean>;
}

export default function BudgetsModule({ 
  budgets, 
  goals, 
  onUpdateBudget, 
  onDepositGoal,
  onCreateGoal,
  onDeleteGoal
}: BudgetsModuleProps) {
  
  // States
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [newBudgetLimit, setNewBudgetLimit] = useState('');
  
  const [selectedGoalId, setSelectedGoalId] = useState('');
  const [goalDepositAmount, setGoalDepositAmount] = useState('');

  // Goal creation states
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalTarget, setNewGoalTarget] = useState('');
  const [newGoalCurrent, setNewGoalCurrent] = useState('');
  const [newGoalDate, setNewGoalDate] = useState('');
  const [newGoalColor, setNewGoalColor] = useState('#6366F1');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const GOAL_COLORS = [
    '#6366F1', // Indigo
    '#0284C7', // Sky Blue
    '#EA580C', // Orange
    '#10B981', // Emerald Green
    '#EC4899', // Pink
    '#8B5CF6', // Purple
  ];

  // Constants
  const CATEGORIES = ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Educação', 'Outros'];

  const formatBRL = (cents: number) => {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handleBudgetSubmit = async (e: React.FormEvent, category: string) => {
    e.preventDefault();
    const parsed = parseFloat(newBudgetLimit.replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) {
      setFeedback({ text: 'Insira um valor limite de teto válido maior que zero.', type: 'error' });
      return;
    }

    const cents = Math.round(parsed * 100);
    const success = await onUpdateBudget(category, cents);
    if (success) {
      setFeedback({ text: `Orçamento da categoria "${category}" ajustado com sucesso!`, type: 'success' });
      setEditingCategory(null);
      setNewBudgetLimit('');
    } else {
      setFeedback({ text: 'Erro ao persistir novo limite contábil.', type: 'error' });
    }
    setTimeout(() => setFeedback(null), 4500);
  };

  const handleGoalDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGoalId || !goalDepositAmount) {
      setFeedback({ text: 'Escolha um objetivo e insira um valor válido de aporte.', type: 'error' });
      return;
    }

    const parsed = parseFloat(goalDepositAmount.replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) {
      setFeedback({ text: 'Insira um montante de aporte válido.', type: 'error' });
      return;
    }

    const cents = Math.round(parsed * 100);
    const success = await onDepositGoal(selectedGoalId, cents);
    if (success) {
      setFeedback({ text: 'Aporte realizado com sucesso! Sua meta de economia subiu de patamar.', type: 'success' });
      setGoalDepositAmount('');
      setSelectedGoalId('');
    } else {
      setFeedback({ text: 'Falha ao registrar aporte no servidor.', type: 'error' });
    }
    setTimeout(() => setFeedback(null), 4500);
  };

  const handleCreateGoalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalName.trim()) {
      setFeedback({ text: 'Por favor, insira o nome da meta.', type: 'error' });
      return;
    }
    const targetParsed = parseFloat(newGoalTarget.replace(',', '.'));
    if (isNaN(targetParsed) || targetParsed <= 0) {
      setFeedback({ text: 'Por favor, insira um valor alvo válido maior que zero.', type: 'error' });
      return;
    }
    if (!newGoalDate) {
      setFeedback({ text: 'Por favor, selecione uma data alvo.', type: 'error' });
      return;
    }

    const currentParsed = newGoalCurrent ? parseFloat(newGoalCurrent.replace(',', '.')) : 0;
    const currentCents = isNaN(currentParsed) ? 0 : Math.round(currentParsed * 100);
    const targetCents = Math.round(targetParsed * 100);

    const success = await onCreateGoal({
      name: newGoalName,
      targetInCents: targetCents,
      targetDate: newGoalDate,
      color: newGoalColor,
      currentInCents: currentCents
    });

    if (success) {
      setFeedback({ text: `Meta "${newGoalName}" criada com sucesso!`, type: 'success' });
      setShowGoalForm(false);
      setNewGoalName('');
      setNewGoalTarget('');
      setNewGoalCurrent('');
      setNewGoalDate('');
      setNewGoalColor('#6366F1');
    } else {
      setFeedback({ text: 'Ocorreu um erro ao criar a meta no servidor.', type: 'error' });
    }
    setTimeout(() => setFeedback(null), 4500);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <Target className="w-5 h-5 text-indigo-600" />
          Módulo 4: Planejamento & Orçamentos (Budgets & Goals)
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Defina regras rígidas de consumo e poupança. Receba alertas inteligentes de teto e acompanhe metas de patrimônio para o futuro.
        </p>
      </div>

      {feedback && (
        <div className={`p-3 rounded-lg border text-xs font-semibold animate-fadeIn ${
          feedback.type === 'success' ? 'bg-indigo-50 border-indigo-200 text-indigo-850' : 'bg-red-50 border-red-200 text-red-850'
        }`}>
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Category Budget Section */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-slate-500" />
              Tetos de Gastos por Categoria
            </h3>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ajustáveis</span>
          </div>

          <div className="space-y-4">
            {budgets.map(b => {
              const fraction = b.limitInCents > 0 ? b.spentInCents / b.limitInCents : 0;
              const percentage = Math.round(fraction * 100);
              const remaining = b.limitInCents - b.spentInCents;

              // Color metrics
              let barColor = 'bg-emerald-500';
              let badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
              if (fraction >= 1.0) {
                barColor = 'bg-rose-600';
                badgeColor = 'bg-rose-50 text-rose-700 border-rose-200';
              } else if (fraction >= 0.8) {
                barColor = 'bg-amber-500';
                badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
              }

              return (
                <div key={b.id} className="p-3.5 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-700">{b.category}</span>
                      <span className="text-[10px] text-slate-400 font-medium ml-2">Consumido: <span className="font-mono italic font-bold">{formatBRL(b.spentInCents)}</span></span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-extrabold px-1.5 rounded uppercase border ${badgeColor}`}>
                        {percentage}% {fraction >= 1.0 ? 'Estourado' : fraction >= 0.8 ? 'Quase Extrapolado' : 'Seguro'}
                      </span>
                      
                      <button 
                        onClick={() => {
                          setEditingCategory(b.category);
                          setNewBudgetLimit((b.limitInCents / 100).toString());
                        }}
                        className="text-slate-400 hover:text-slate-600 text-xs font-semibold"
                        title="Configurar Teto"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div 
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                      className={`${barColor} h-full transition-all duration-300`}
                    />
                  </div>

                  {/* Limit guidelines */}
                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
                    <span>Teto Estipulado: <span className="font-mono italic font-bold text-slate-500">{formatBRL(b.limitInCents)}</span></span>
                    {remaining >= 0 ? (
                      <span className="text-slate-500 block">Sobra <span className="font-mono italic font-bold">R$ {(remaining / 100).toFixed(2)}</span></span>
                    ) : (
                      <span className="text-rose-500 font-bold block">Estouro por <span className="font-mono italic">R$ {Math.abs(remaining / 100).toFixed(2)}</span></span>
                    )}
                  </div>

                  {/* Quick Inline Edit form */}
                  {editingCategory === b.category && (
                    <form onSubmit={(e) => handleBudgetSubmit(e, b.category)} className="bg-slate-50/70 p-3 rounded-lg border border-slate-200 gap-2 flex items-center justify-between mt-2 animate-fadeIn">
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-slate-500 uppercase">Novo Teto R$</span>
                        <input 
                          type="text" 
                          value={newBudgetLimit}
                          onChange={(e) => setNewBudgetLimit(e.target.value)}
                          className="w-24 text-xs font-mono font-bold bg-white border border-slate-200 rounded-lg px-2 py-0.5 focus:outline-none"
                        />
                      </div>
                      <div className="flex gap-1">
                        <button 
                          type="button" 
                          onClick={() => setEditingCategory(null)} 
                          className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-lg text-[10px] font-bold"
                        >
                          Sair
                        </button>
                        <button 
                          type="submit" 
                          className="bg-indigo-600 text-white px-2 py-0.5 rounded-lg text-[10px] font-bold"
                        >
                          Salvar
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Financial savings goals section */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                <Target className="w-4 h-4 text-slate-500" />
                Minhas Metas de Poupança
              </h3>
              <button 
                onClick={() => setShowGoalForm(!showGoalForm)}
                className="text-[10px] uppercase font-extrabold text-indigo-650 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-all flex items-center gap-1"
              >
                {showGoalForm ? 'Fechar' : 'Nova Meta'}
              </button>
            </div>

            {showGoalForm && (
              <form onSubmit={handleCreateGoalSubmit} className="bg-slate-50/70 hover:bg-slate-50 p-4 border border-slate-200 rounded-xl space-y-3 animate-fadeIn my-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Definir Nova Meta</h4>
                
                <div className="space-y-2">
                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase font-semibold">Nome da Meta</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Reforma da Casa, Câmbio" 
                      value={newGoalName}
                      onChange={(e) => setNewGoalName(e.target.value)}
                      className="w-full bg-white text-slate-800 border border-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 font-semibold"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] text-slate-400 uppercase font-semibold">Alvo (R$)</label>
                      <input 
                        type="text" 
                        placeholder="Ex: 1500,00" 
                        value={newGoalTarget}
                        onChange={(e) => setNewGoalTarget(e.target.value)}
                        className="w-full bg-white text-slate-800 border border-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-505 font-mono font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-slate-400 uppercase font-semibold">Início Poupança</label>
                      <input 
                        type="text" 
                        placeholder="R$ 0,00" 
                        value={newGoalCurrent}
                        onChange={(e) => setNewGoalCurrent(e.target.value)}
                        className="w-full bg-white text-slate-800 border border-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-505 font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase font-semibold">Prazo Alvo / Data Limite</label>
                    <input 
                      type="date" 
                      value={newGoalDate}
                      onChange={(e) => setNewGoalDate(e.target.value)}
                      className="w-full bg-white text-slate-850 border border-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-505 font-semibold"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase font-semibold mb-1">Destaque de Cor</label>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      {GOAL_COLORS.map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setNewGoalColor(color)}
                          style={{ backgroundColor: color }}
                          className={`w-5 h-5 rounded-full border-2 transition-all ${
                            newGoalColor === color ? 'border-slate-800 scale-110' : 'border-transparent opacity-80'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-1.5">
                  <button 
                    type="button" 
                    onClick={() => setShowGoalForm(false)}
                    className="w-1/2 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold rounded-lg transition-colors"
                  >
                    Sair
                  </button>
                  <button 
                    type="submit"
                    className="w-1/2 py-1.5 bg-indigo-650 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg transition-colors shadow"
                  >
                    Salvar Meta
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-4">
              {goals.map(goal => {
                const fraction = goal.targetInCents > 0 ? goal.currentInCents / goal.targetInCents : 0;
                const percentage = Math.round(fraction * 100);

                return (
                  <div key={goal.id} className="border border-slate-200 rounded-xl p-3.5 space-y-2 hover:border-slate-300 transition-all group relative">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">{goal.name}</h4>
                        <p className="text-[9px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Prazo Final: {new Date(goal.targetDate).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {deleteConfirmId === goal.id ? (
                          <div className="flex items-center gap-1 animate-fadeIn">
                            <button
                              onClick={async () => {
                                await onDeleteGoal(goal.id);
                                setDeleteConfirmId(null);
                                setFeedback({ text: `Meta "${goal.name}" removida com sucesso.`, type: 'success' });
                              }}
                              className="text-[8px] tracking-wider uppercase font-extrabold bg-rose-600 hover:bg-rose-700 text-white rounded px-1.5 py-0.5"
                            >
                              Sim
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="text-[8px] tracking-wider uppercase font-extrabold bg-slate-200 hover:bg-slate-300 text-slate-600 rounded px-1.5 py-0.5"
                            >
                              Não
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(goal.id)}
                            className="text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-all p-1 rounded hover:bg-slate-50"
                            title="Remover Meta"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <span 
                          style={{ color: goal.color }}
                          className="text-xs font-bold font-mono italic"
                        >
                          {percentage}%
                        </span>
                      </div>
                    </div>

                    {/* Progress track */}
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        style={{ width: `${Math.min(percentage, 100)}%`, backgroundColor: goal.color }}
                        className="h-full transition-all duration-550"
                      />
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
                      <span>Poupado: <strong className="text-slate-650 font-mono italic">{formatBRL(goal.currentInCents)}</strong></span>
                      <span>Alvo: <span className="font-mono italic font-bold">{formatBRL(goal.targetInCents)}</span></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick saving topup aporte widget */}
          <div className="bg-indigo-950 text-white rounded-2xl p-6 shadow-sm">
            <h3 className="font-semibold text-xs uppercase tracking-wider text-indigo-300 flex items-center gap-1.5 mb-3.5">
              <TrendingUp className="w-4 h-4" />
              Realizar Novo Aporte de Economia
            </h3>

            <form onSubmit={handleGoalDeposit} className="space-y-3.5">
              <div>
                <label className="block text-[10px] text-slate-300 uppercase font-semibold mb-1">Destinar para qual Objetivo?</label>
                <select 
                  value={selectedGoalId}
                  onChange={(e) => setSelectedGoalId(e.target.value)}
                  className="w-full bg-indigo-900 text-indigo-100 border border-indigo-800 text-xs rounded-xl px-3 py-1.5 focus:outline-none"
                >
                  <option value="">Selecione a Meta correspondente...</option>
                  {goals.map(g => (
                    <option key={g.id} value={g.id}>{g.name} (Meta: {formatBRL(g.targetInCents)})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-slate-300 uppercase font-semibold mb-1">Valor do Aporte Real (R$)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-300 font-bold text-xs font-mono italic">R$</span>
                  <input 
                    type="text" 
                    placeholder="120,00" 
                    value={goalDepositAmount}
                    onChange={(e) => setGoalDepositAmount(e.target.value)}
                    className="w-full bg-indigo-900 border border-indigo-800 text-white font-mono font-bold text-xs rounded-xl pl-9 pr-3 py-1.5 focus:outline-none placeholder-indigo-400"
                  />
                </div>
              </div>

              <button 
                type="submit"
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-colors shadow-lg flex items-center justify-center gap-1"
              >
                Efetuar Aporte Contábil
              </button>
            </form>
          </div>

        </div>
      </div>

    </div>
  );
}
