/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Plus,
  Database,
  FileText,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Trash2
} from 'lucide-react';
import { FinancialAccount, Transaction, AccountType, TransactionType } from '../types';

interface CoreFinanceModuleProps {
  accounts: FinancialAccount[];
  transactions: Transaction[];
  onAddTransaction: (tx: Omit<Transaction, 'id' | 'isSynced'>) => Promise<boolean>;
  onAddAccount: (acc: Omit<FinancialAccount, 'id' | 'isLinked'>) => Promise<boolean>;
  onDeleteTransaction: (id: string) => Promise<boolean>;
}

export default function CoreFinanceModule({
  accounts,
  transactions,
  onAddTransaction,
  onAddAccount,
  onDeleteTransaction
}: CoreFinanceModuleProps) {
  
  // Wallet Creation form state
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<AccountType>('CHECKING');
  const [accBank, setAccBank] = useState('Banco Itaú');
  const [accBalance, setAccBalance] = useState(''); // String read as Real, e.g. "1250,50" -> converted to integers
  const [accColor, setAccColor] = useState('#0284C7');

  // Transaction form state
  const [txType, setTxType] = useState<TransactionType>('DES');
  const [txAmount, setTxAmount] = useState(''); // E.g. "150,00"
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [txCategory, setTxCategory] = useState('Alimentação');
  const [txDesc, setTxDesc] = useState('');
  const [txOriginAcc, setTxOriginAcc] = useState('');
  const [txDestAcc, setTxDestAcc] = useState('');

  // Info message
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Categories preset
  const CATEGORIES = ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Educação', 'Receitas', 'Investimento/Metas', 'Outros'];

  // Formatter helper
  const formatBRL = (cents: number) => {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handleCreateAccount = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!accName || !accBalance) {
      setStatusMsg({ text: 'Por favor, preencha todos os dados da carteira.', type: 'error' });
      return;
    }

    // Convert balance Real string to Cents integer
    const parsedReal = parseFloat(accBalance.replace(',', '.'));
    if (isNaN(parsedReal)) {
      setStatusMsg({ text: 'Valor de saldo inválido.', type: 'error' });
      return;
    }
    const balanceInCents = Math.round(parsedReal * 100);

    const result = await onAddAccount({
      name: accName,
      type: accType,
      bankName: accBank,
      balanceInCents,
      color: accColor
    });

    if (result) {
      setStatusMsg({ text: `Carteira "${accName}" criada com sucesso no Ledger!`, type: 'success' });
      setAccName('');
      setAccBalance('');
      setShowAccountForm(false);
    } else {
      setStatusMsg({ text: 'Erro ao cadastrar conta no servidor.', type: 'error' });
    }
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleCreateTransaction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!txAmount || !txDesc || !txOriginAcc) {
      setStatusMsg({ text: 'Compreenda todos os parâmetros obrigatórios da transação.', type: 'error' });
      return;
    }

    if (txType === 'TRANS' && !txDestAcc) {
      setStatusMsg({ text: 'Transferências exigem uma conta de destino.', type: 'error' });
      return;
    }

    const parsedReal = parseFloat(txAmount.replace(',', '.'));
    if (isNaN(parsedReal) || parsedReal <= 0) {
      setStatusMsg({ text: 'Digite um montante monetário válido maior que zero.', type: 'error' });
      return;
    }
    const amountInCents = Math.round(parsedReal * 100);

    const result = await onAddTransaction({
      amountInCents,
      date: txDate,
      type: txType,
      category: txType === 'REC' ? 'Receitas' : txCategory,
      description: txDesc,
      accountId: txOriginAcc,
      destinationAccountId: txType === 'TRANS' ? txDestAcc : undefined
    });

    if (result) {
      setStatusMsg({ text: 'Transação adicionada com sucesso na conta!', type: 'success' });
      setTxAmount('');
      setTxDesc('');
    } else {
      setStatusMsg({ text: 'Falha ao processar as regras de transação.', type: 'error' });
    }
    setTimeout(() => setStatusMsg(null), 4000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <Database className="w-5 h-5 text-emerald-600" />
          Módulo 2: Gestão de Contas & Transações (Core Finance)
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Lançamentos de carteiras e livros de fluxo de caixa em tempo real. Valores estritamente persistidos como números inteiros para conformidade contábil.
        </p>
      </div>

      {statusMsg && (
        <div className={`p-3 rounded-lg flex items-center gap-2 border text-xs font-medium animate-bounce ${
          statusMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {statusMsg.type === 'success' ? <CheckCircle className="w-4 h-4 text-green-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
          {statusMsg.text}
        </div>
      )}

      {/* Grid containing accounts listing and transaction entries */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Wallet sidebar */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-slate-500" />
                Minhas Carteiras & Bancos
              </h3>
              <button 
                onClick={() => {
                  setShowAccountForm(!showAccountForm);
                  if (txOriginAcc === '') setTxOriginAcc(accounts[0]?.id || '');
                }}
                className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold px-2 py-1 rounded flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3 h-3" /> Nova Carteira
              </button>
            </div>

            {/* Wallet Creation form */}
            {showAccountForm && (
              <form onSubmit={handleCreateAccount} className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 space-y-3 animate-fadeIn">
                <p className="text-xs font-bold text-slate-700">Nova Carteira Ledger</p>
                <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase">Apelido da Conta</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Carteira Dinheiro, Inter Corrente" 
                      value={accName}
                      onChange={(e) => setAccName(e.target.value)}
                      className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none bg-white font-medium"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase">Tipo</label>
                      <select 
                        value={accType}
                        onChange={(e) => setAccType(e.target.value as AccountType)}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white font-medium focus:outline-none"
                      >
                        <option value="CHECKING">Conta Corrente</option>
                        <option value="SAVINGS">Poupança</option>
                        <option value="CASH">Dinheiro Físico</option>
                        <option value="INVESTMENT">Investimentos</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase">Instituição</label>
                      <input 
                        type="text" 
                        placeholder="Ex: Itaú, Nubank, XP" 
                        value={accBank}
                        onChange={(e) => setAccBank(e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white font-medium focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase">Saldo Inicial (R$)</label>
                      <input 
                        type="text" 
                        placeholder="0,00" 
                        value={accBalance}
                        onChange={(e) => setAccBalance(e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white font-mono focus:outline-none font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase">Cor do Tema</label>
                      <div className="flex gap-1.5 items-center mt-1">
                        {['#0284C7', '#EA580C', '#16A34A', '#EAB308', '#8B5CF6', '#EC4899', '#6B7280'].map(c => (
                          <button 
                            key={c}
                            type="button"
                            onClick={() => setAccColor(c)}
                            style={{ backgroundColor: c }}
                            className={`w-5 h-5 rounded-full border-2 transition-transform ${accColor === c ? 'scale-125 border-slate-900' : 'border-transparent'}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button 
                    type="button" 
                    onClick={() => setShowAccountForm(false)} 
                    className="text-[11px] text-slate-500 font-bold px-2 py-1 hover:bg-slate-200 rounded"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    className="text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1 rounded"
                  >
                    Salvar Carteira
                  </button>
                </div>
              </form>
            )}

            {/* Wallets collection list */}
            <div className="space-y-3">
              {accounts.map(acc => (
                <div key={acc.id} className="border border-slate-200 rounded-xl p-3 hover:bg-slate-50 transition-colors flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span 
                      style={{ backgroundColor: acc.color }}
                      className="w-1.5 h-10 rounded-full shrink-0"
                    />
                    <div>
                      <p className="text-xs font-semibold text-slate-700">{acc.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium">Inst: {acc.bankName} • {acc.type === 'CASH' ? 'Dinheiro' : acc.type === 'SAVINGS' ? 'Poupança' : acc.type === 'INVESTMENT' ? 'Aplicações' : 'Conta Corrente'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-800 font-mono italic">{formatBRL(acc.balanceInCents)}</p>
                    <span className={`text-[8px] font-bold px-1 rounded uppercase ${acc.isLinked ? 'bg-teal-50 text-teal-700 border border-teal-100' : 'bg-slate-100 text-slate-500'}`}>
                      {acc.isLinked ? 'Pluggy Open Finance' : 'Manual'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Transaction Creation Box */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5 mb-4">
              <Plus className="w-4 h-4 text-indigo-500" />
              Lançamento Manual em Centavos
            </h3>

            {/* Quick warning text explaining money floating issues */}
            <div className="mb-4 text-[11px] bg-indigo-50 text-indigo-900 border border-indigo-100 p-3 rounded-lg flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Regra Contábil Crítica Ativa:</span> Para evitar falhas de precisão binária inerentes a valores de ponto flutuante, todos os lançamentos inseridos na tela em Reais (e.g., R$ 12,54) são transmitidos via JSON e gravados no banco de dados como inteiros equivalentes em centavos (e.g., <code className="font-mono bg-indigo-100 px-1 py-0.5 rounded text-indigo-700">1254</code>).
              </div>
            </div>

            <form onSubmit={handleCreateTransaction} className="space-y-4">
              {/* Type selector */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Qual o tipo de lançamento?</label>
                <div className="grid grid-cols-3 gap-2">
                  <button 
                    type="button"
                    onClick={() => { setTxType('DES'); setTxCategory('Alimentação'); }}
                    className={`py-2 text-xs font-semibold rounded-lg border-2 flex items-center justify-center gap-1.5 transition-all ${
                      txType === 'DES' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-100 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4 text-rose-500" /> Despesa (-)
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setTxType('REC'); setTxCategory('Receita'); }}
                    className={`py-2 text-xs font-semibold rounded-lg border-2 flex items-center justify-center gap-1.5 transition-all ${
                      txType === 'REC' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <ArrowDownLeft className="w-4 h-4 text-emerald-500" /> Receita (+)
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setTxType('TRANS'); setTxCategory('Investimento/Metas'); }}
                    className={`py-2 text-xs font-semibold rounded-lg border-2 flex items-center justify-center gap-1.5 transition-all ${
                      txType === 'TRANS' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-100 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <ArrowLeftRight className="w-4 h-4 text-indigo-500" /> Transferência
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Montante Unitário (R$)</label>
                  <input 
                    type="text" 
                    placeholder="E.g. 52,90"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    className="w-full text-xs font-bold font-mono border border-slate-200 rounded-lg px-3 py-2 bg-slate-50/50 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Data da Efetivação</label>
                  <div className="relative">
                    <input 
                      type="date"
                      value={txDate}
                      onChange={(e) => setTxDate(e.target.value)}
                      className="w-full text-xs font-mono border border-slate-200 rounded-lg px-3 py-2 bg-slate-50/50 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Categoria Contábil</label>
                  <select 
                    value={txCategory}
                    disabled={txType === 'REC'}
                    onChange={(e) => setTxCategory(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-indigo-500 font-semibold"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    {txType === 'TRANS' ? 'Carteira de Origem' : 'Conta de Débito/Crédito'}
                  </label>
                  <select 
                    value={txOriginAcc}
                    onChange={(e) => setTxOriginAcc(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-indigo-500 font-semibold"
                  >
                    <option value="">Selecione uma conta...</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} ({formatBRL(acc.balanceInCents)})</option>
                    ))}
                  </select>
                </div>
              </div>

              {txType === 'TRANS' && (
                <div className="animate-slideDown">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Carteira de Destino</label>
                  <select 
                    value={txDestAcc}
                    onChange={(e) => setTxDestAcc(e.target.value)}
                    className="w-full text-xs border border-teal-200 rounded-lg px-3 py-2 bg-emerald-50/20 focus:bg-white focus:outline-none focus:border-teal-500 font-semibold"
                  >
                    <option value="">Selecione uma conta destino...</option>
                    {accounts.filter(a => a.id !== txOriginAcc).map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} ({formatBRL(acc.balanceInCents)})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Descrição Comercial</label>
                <input 
                  type="text" 
                  placeholder="E.g. Compra de supermercado pão de açúcar paulista"
                  value={txDesc}
                  onChange={(e) => setTxDesc(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button 
                  type="submit"
                  className="w-full md:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1"
                >
                  Confirmar Lançamento Ledger
                </button>
              </div>
            </form>
          </div>
        </div>

      </div>

      {/* Embedded Transactions list */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5 mb-3">
          <FileText className="w-4 h-4 text-slate-500" />
          Livro-Razão Contábil (Últimas Transações)
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-semibold">
                <th className="py-2.5 px-3">Data</th>
                <th className="py-2.5 px-3">Descrição Comercial</th>
                <th className="py-2.5 px-3">Categoria</th>
                <th className="py-2.5 px-3">Canal</th>
                <th className="py-2.5 px-3">Origem</th>
                <th className="py-2.5 px-3 text-right">Valor Consolidado</th>
                <th className="py-2.5 px-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
              {transactions.map(tx => {
                const acc = accounts.find(a => a.id === tx.accountId);
                const destAcc = tx.destinationAccountId ? accounts.find(a => a.id === tx.destinationAccountId) : null;
                return (
                  <tr key={tx.id} className="hover:bg-slate-55/60 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">{tx.date}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-800">{tx.description}</div>
                      {tx.originalMerchantName && (
                        <div className="text-[10px] font-mono text-slate-400">Orig: {tx.originalMerchantName}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200 text-[10px]">
                        {tx.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                        tx.isSynced ? 'bg-teal-50 text-teal-700 border border-teal-100' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {tx.isSynced ? 'Open Finance' : 'Manual'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-500">
                      {acc ? acc.name : 'Outro'} 
                      {destAcc && <span className="text-slate-400 font-normal"> → {destAcc.name}</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-[13px] font-mono whitespace-nowrap">
                      {tx.type === 'REC' ? (
                        <span className="text-emerald-600 font-bold italic font-mono">+{formatBRL(tx.amountInCents)}</span>
                      ) : tx.type === 'DES' ? (
                        <span className="text-rose-600 font-bold italic font-mono">-{formatBRL(tx.amountInCents)}</span>
                      ) : (
                        <span className="text-indigo-600 font-bold italic font-mono">⇄ {formatBRL(tx.amountInCents)}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      <button
                        onClick={() => onDeleteTransaction(tx.id)}
                        title="Excluir lançamento"
                        className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {transactions.length === 0 && (
            <div className="py-10 text-center text-slate-400">Nenhum lançamento adicionado até o momento.</div>
          )}
        </div>
      </div>
    </div>
  );
}
