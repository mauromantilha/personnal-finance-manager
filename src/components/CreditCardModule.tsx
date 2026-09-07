import React, { useState, useRef } from 'react';
import { CreditCard as CreditCardIcon, Plus, Trash2, CheckCircle, AlertCircle, Receipt, TrendingUp, ScanLine, X, Upload } from 'lucide-react';
import { CreditCard, Invoice, FinancialAccount, Transaction } from '../types';
import { parseMoneyToCents } from './CoreFinanceModule.utils';
import AIDocumentConsentModal, { hasSavedConsent } from './AIDocumentConsentModal';

interface InvoiceLineItem {
  date: string;
  merchant: string;
  amountInCents: number;
  category: string;
  checked: boolean;
}

interface CreditCardModuleProps {
  creditCards: CreditCard[];
  invoices: Invoice[];
  accounts: FinancialAccount[];
  transactions: Transaction[];
  onAddCard: (data: any) => Promise<boolean>;
  onUpdateCard: (id: string, data: any) => Promise<boolean>;
  onDeleteCard: (id: string) => Promise<boolean>;
  onPayInvoice: (invoiceId: string, accountId: string) => Promise<boolean>;
  onAnalyzeInvoice: (base64: string, mimeType: string, creditCardId: string) => Promise<{ lineItems?: Omit<InvoiceLineItem, 'checked'>[]; dueDate?: string; totalAmountInCents?: number }>;
  onImportInvoice: (items: Omit<InvoiceLineItem, 'checked'>[], creditCardId: string) => Promise<{ imported: number; errors: string[] }>;
}

const CARD_COLORS = ['#6366F1', '#8B5CF6', '#0284C7', '#059669', '#DC2626', '#EA580C', '#DB2777', '#0891B2'];
const CATEGORIES = ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Educação', 'Vestuário', 'Outros'];

export default function CreditCardModule({
  creditCards, invoices, accounts, transactions,
  onAddCard, onUpdateCard, onDeleteCard, onPayInvoice,
  onAnalyzeInvoice, onImportInvoice,
}: CreditCardModuleProps) {
  const [showForm, setShowForm] = useState(false);
  const [editCard, setEditCard] = useState<CreditCard | null>(null);
  const [payInvoiceId, setPayInvoiceId] = useState<string | null>(null);
  const [payAccountId, setPayAccountId] = useState('');

  // Invoice AI import state
  const [importCardId, setImportCardId] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [analyzingInvoice, setAnalyzingInvoice] = useState(false);
  const [importingInvoice, setImportingInvoice] = useState(false);
  const [invoiceResult, setInvoiceResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const invoiceFileRef = useRef<HTMLInputElement>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [pendingInvoiceFile, setPendingInvoiceFile] = useState<File | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [bankName, setBankName] = useState('');
  const [lastFour, setLastFour] = useState('');
  const [limitBRL, setLimitBRL] = useState('');
  const [billingDay, setBillingDay] = useState('12');
  const [dueDay, setDueDay] = useState('19');
  const [color, setColor] = useState('#6366F1');

  const fmt = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function openNew() {
    setEditCard(null);
    setName(''); setBankName(''); setLastFour(''); setLimitBRL('');
    setBillingDay('12'); setDueDay('19'); setColor('#6366F1');
    setShowForm(true);
  }

  function openEdit(card: CreditCard) {
    setEditCard(card);
    setName(card.name); setBankName(card.bankName); setLastFour(card.lastFour || '');
    setLimitBRL((card.limitInCents / 100).toFixed(2).replace('.', ','));
    setBillingDay(String(card.billingDay)); setDueDay(String(card.dueDay)); setColor(card.color);
    setShowForm(true);
  }

  const notify = (text: string, type: 'success' | 'error') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const processInvoiceFile = (file: File) => {
    setAnalyzingInvoice(true);
    notify('IA lendo a fatura…', 'success');
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const result = await onAnalyzeInvoice(base64, file.type, importCardId!);
      const items: InvoiceLineItem[] = (result.lineItems || []).map(item => ({ ...item, checked: true }));
      setLineItems(items);
      setAnalyzingInvoice(false);
      if (items.length === 0) notify('Nenhum lançamento encontrado. Tente outra imagem.', 'error');
      else notify(`${items.length} lançamentos extraídos. Revise e confirme.`, 'success');
    };
    reader.readAsDataURL(file);
    if (invoiceFileRef.current) invoiceFileRef.current.value = '';
  };

  const handleFileForInvoice = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !importCardId) return;
    if (!file.type.startsWith('image/')) { notify('Use uma imagem (JPG, PNG, WEBP).', 'error'); return; }

    if (!hasSavedConsent()) {
      setPendingInvoiceFile(file);
      setShowConsentModal(true);
      return;
    }

    processInvoiceFile(file);
  };

  const handleImportConfirm = async () => {
    if (!importCardId) return;
    const selected = lineItems.filter(i => i.checked).map(({ checked: _, ...rest }) => rest);
    if (selected.length === 0) { notify('Selecione pelo menos um lançamento.', 'error'); return; }
    setImportingInvoice(true);
    const result = await onImportInvoice(selected, importCardId);
    setInvoiceResult(result);
    setImportingInvoice(false);
    if (result.imported > 0) {
      notify(`${result.imported} lançamentos importados!`, 'success');
      setLineItems([]);
      setImportCardId(null);
    } else notify('Nenhum lançamento importado.', 'error');
  };

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    const limitInCents = parseMoneyToCents(limitBRL);
    if (!name.trim() || !bankName.trim() || isNaN(limitInCents) || limitInCents <= 0) {
      return notify('Preencha nome, banco e limite corretamente.', 'error');
    }
    const bill = parseInt(billingDay, 10);
    const due = parseInt(dueDay, 10);
    if (isNaN(bill) || bill < 1 || bill > 31 || isNaN(due) || due < 1 || due > 31) {
      return notify('Dias de fechamento/vencimento devem ser entre 1 e 31.', 'error');
    }
    const data = {
      name: name.trim(),
      bankName: bankName.trim(),
      lastFour: lastFour || null,
      limitInCents,
      billingDay: bill,
      dueDay: due,
      color,
    };
    const ok = editCard ? await onUpdateCard(editCard.id, data) : await onAddCard(data);
    if (ok) { setShowForm(false); notify(editCard ? 'Cartão atualizado!' : 'Cartão adicionado!', 'success'); }
    else notify('Erro ao salvar cartão.', 'error');
  };

  const handleDelete = async (id: string, cardName: string) => {
    if (!confirm(`Desativar cartão "${cardName}"?`)) return;
    const ok = await onDeleteCard(id);
    if (ok) notify('Cartão desativado.', 'success');
    else notify('Erro ao desativar cartão.', 'error');
  };

  const handlePay = async () => {
    if (!payInvoiceId || !payAccountId) return notify('Selecione uma conta para débito.', 'error');
    const ok = await onPayInvoice(payInvoiceId, payAccountId);
    if (ok) { setPayInvoiceId(null); setPayAccountId(''); notify('Fatura paga com sucesso!', 'success'); }
    else notify('Erro ao pagar fatura.', 'error');
  };

  const currentMonth = new Date().toISOString().slice(0, 7);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <CreditCardIcon className="w-5 h-5 text-violet-600" />
            Módulo 3: Cartões de Crédito & Faturas
          </h2>
          <p className="text-sm text-slate-500 mt-1">Gerencie seus cartões, acompanhe faturas e lance compras parceladas.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm">
          <Plus className="w-3.5 h-3.5" /> Novo Cartão
        </button>
      </div>

      {statusMsg && (
        <div className={`p-3 rounded-lg flex items-center gap-2 border text-xs font-medium ${statusMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {statusMsg.type === 'success' ? <CheckCircle className="w-4 h-4 text-green-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
          {statusMsg.text}
        </div>
      )}

      {/* Card Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-fadeIn">
          <h3 className="font-semibold text-slate-800 text-sm mb-4">{editCard ? 'Editar Cartão' : 'Novo Cartão de Crédito'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nome do Cartão</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Nubank Ultravioleta"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Banco Emissor</label>
                <input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Ex: Nubank, Itaú"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">4 Últimos Dígitos</label>
                <input value={lastFour} onChange={e => setLastFour(e.target.value)} placeholder="4531" maxLength={4}
                  className="w-full text-xs font-mono border border-slate-200 rounded-lg px-3 py-2 focus:outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Limite (R$)</label>
                <input value={limitBRL} onChange={e => setLimitBRL(e.target.value)} placeholder="5.000,00"
                  className="w-full text-xs font-mono font-bold border border-slate-200 rounded-lg px-3 py-2 focus:outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fechamento (dia)</label>
                <input type="number" min={1} max={31} value={billingDay} onChange={e => setBillingDay(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Vencimento (dia)</label>
                <input type="number" min={1} max={31} value={dueDay} onChange={e => setDueDay(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Cor do Cartão</label>
              <div className="flex gap-2 flex-wrap">
                {CARD_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c ? 'scale-125 border-slate-900' : 'border-transparent'}`} />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowForm(false)} className="text-xs text-slate-500 font-bold px-3 py-1.5 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button type="submit" className="text-xs bg-violet-600 hover:bg-violet-700 text-white font-bold px-4 py-1.5 rounded-lg">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {creditCards.map(card => {
          const cardInvoices = invoices.filter(i => i.creditCardId === card.id);
          const currentInv = cardInvoices.find(i => i.month === currentMonth);
          const currentMonthUsedCents = currentInv?.totalInCents || 0;

          // Limite comprometido = todas as faturas não pagas (mês atual + parcelas futuras + meses anteriores em aberto)
          const unpaidInvoices = cardInvoices.filter(i => i.status !== 'paid');
          const totalCommittedCents = unpaidInvoices.reduce((sum, inv) => sum + inv.totalInCents, 0);
          const availCents = Math.max(0, card.limitInCents - totalCommittedCents);
          const usedPct = card.limitInCents > 0 ? Math.min(100, (totalCommittedCents / card.limitInCents) * 100) : 0;
          const cardTxs = transactions.filter(t => t.creditCardId === card.id && t.date.startsWith(currentMonth));

          return (
            <div key={card.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Card visual header */}
              <div className="p-5 text-white relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${card.color}, ${card.color}cc)` }}>
                <div className="absolute right-4 top-4 opacity-20 text-7xl font-black">💳</div>
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">{card.bankName}</p>
                      <p className="text-base font-black">{card.name}</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(card)} className="p-1 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-[10px] font-bold">✏️</button>
                      <button onClick={() => handleDelete(card.id, card.name)} className="p-1 bg-white/20 hover:bg-white/30 rounded-lg transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <p className="font-mono text-sm tracking-widest opacity-90">•••• •••• •••• {card.lastFour || '????'}</p>
                  <div className="flex justify-between text-[10px] opacity-80">
                    <span>Fecha dia {card.billingDay} · Vence dia {card.dueDay}</span>
                  </div>
                </div>
              </div>

              {/* Usage bar */}
              <div className="px-5 pt-4 pb-2 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 font-medium">Comprometido Total</span>
                  <span className="font-bold text-slate-700">{fmt(totalCommittedCents)} <span className="text-slate-400 font-normal">/ {fmt(card.limitInCents)}</span></span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div style={{ width: `${usedPct}%`, backgroundColor: card.color }}
                    className={`h-full transition-all ${usedPct >= 90 ? 'bg-rose-500' : ''}`} />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>{Math.round(usedPct)}% do limite usado</span>
                  <span className="text-emerald-600 font-semibold">Disponível Real: {fmt(availCents)}</span>
                </div>
              </div>

              {/* Current invoice */}
              {currentInv && (
                <div className="px-5 pb-4">
                  <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                        <Receipt className="w-3 h-3" /> Fatura {currentInv.month}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${currentInv.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : currentInv.status === 'closed' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {currentInv.status === 'paid' ? 'Paga' : currentInv.status === 'closed' ? 'Fechada' : 'Aberta'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-slate-800">{fmt(currentInv.totalInCents)}</span>
                      {currentInv.dueDate && <span className="text-[10px] text-slate-400">Vence {new Date(currentInv.dueDate).toLocaleDateString('pt-BR')}</span>}
                    </div>
                    {currentInv.status !== 'paid' && accounts.length > 0 && (
                      payInvoiceId === currentInv.id ? (
                        <div className="space-y-2 animate-fadeIn">
                          <select value={payAccountId} onChange={e => setPayAccountId(e.target.value)}
                            className="w-full text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none font-semibold">
                            <option value="">Débitar de qual conta?</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({fmt(a.balanceInCents)})</option>)}
                          </select>
                          <div className="flex gap-2">
                            <button onClick={() => setPayInvoiceId(null)} className="flex-1 text-[11px] font-bold text-slate-500 py-1 hover:bg-slate-100 rounded-lg">Cancelar</button>
                            <button onClick={handlePay} className="flex-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white py-1 rounded-lg">Confirmar Pagamento</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setPayInvoiceId(currentInv.id)} className="w-full text-[11px] font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-lg py-1.5 transition-colors">
                          Pagar Fatura
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Recent card transactions */}
              {cardTxs.length > 0 && (
                <div className="px-5 pb-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Lançamentos do mês
                  </p>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {cardTxs.slice(0, 8).map(tx => (
                      <div key={tx.id} className="flex items-center justify-between text-[11px]">
                        <div>
                          <span className="font-medium text-slate-700">{tx.description}</span>
                          {tx.installmentTotal && tx.installmentTotal > 1 && (
                            <span className="ml-1 text-[9px] text-violet-500 font-bold">{tx.installmentNumber}/{tx.installmentTotal}x</span>
                          )}
                        </div>
                        <span className="font-mono font-bold text-rose-600">-{fmt(tx.amountInCents)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Import invoice button */}
              <div className="px-5 pb-4 pt-2 border-t border-slate-100 mt-2">
                <button
                  onClick={() => { setImportCardId(card.id); setLineItems([]); setInvoiceResult(null); invoiceFileRef.current?.click(); }}
                  disabled={analyzingInvoice && importCardId === card.id}
                  className="w-full flex items-center justify-center gap-2 py-1.5 text-[11px] font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  {analyzingInvoice && importCardId === card.id ? 'Lendo fatura…' : 'Importar Fatura com IA'}
                </button>
              </div>
            </div>
          );
        })}

        {creditCards.length === 0 && (
          <div className="md:col-span-2 xl:col-span-3 py-16 text-center text-slate-400">
            <CreditCardIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">Nenhum cartão cadastrado</p>
            <p className="text-xs mt-1">Clique em "Novo Cartão" para começar.</p>
          </div>
        )}
      </div>

      {/* Invoice history */}
      {invoices.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5 mb-4">
            <Receipt className="w-4 h-4 text-slate-500" />
            Histórico de Faturas
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-semibold">
                  <th className="py-2 px-3 text-left">Cartão</th>
                  <th className="py-2 px-3 text-left">Mês</th>
                  <th className="py-2 px-3 text-left">Status</th>
                  <th className="py-2 px-3 text-left">Vencimento</th>
                  <th className="py-2 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-600">
                {[...invoices].sort((a, b) => b.month.localeCompare(a.month)).map(inv => {
                  const card = creditCards.find(c => c.id === inv.creditCardId);
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-semibold">{card?.name || '—'}</td>
                      <td className="py-2.5 px-3 font-mono">{inv.month}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${inv.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : inv.status === 'closed' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                          {inv.status === 'paid' ? 'Paga' : inv.status === 'closed' ? 'Fechada' : 'Aberta'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 font-mono">
                        {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold font-mono">{fmt(inv.totalInCents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hidden file input for invoice AI */}
      <input
        ref={invoiceFileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileForInvoice}
      />

      {/* Invoice import modal */}
      {importCardId && lineItems.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fadeIn" onClick={() => { setImportCardId(null); setLineItems([]); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <Upload className="w-4 h-4 text-violet-500" /> Lançamentos Extraídos da Fatura
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{lineItems.filter(i => i.checked).length} de {lineItems.length} selecionados</p>
              </div>
              <button onClick={() => { setImportCardId(null); setLineItems([]); }} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-2">
              {lineItems.map((item, idx) => (
                <div key={idx} className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${item.checked ? 'border-violet-200 bg-violet-50/40' : 'border-slate-200 bg-slate-50 opacity-50'}`}>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => setLineItems(prev => prev.map((li, i) => i === idx ? { ...li, checked: !li.checked } : li))}
                    className="accent-violet-600 w-3.5 h-3.5 shrink-0"
                  />
                  <span className="text-[10px] font-mono text-slate-400 w-20 shrink-0">{item.date}</span>
                  <span className="text-xs font-semibold text-slate-700 flex-1 truncate">{item.merchant}</span>
                  <select
                    value={item.category}
                    onChange={e => setLineItems(prev => prev.map((li, i) => i === idx ? { ...li, category: e.target.value } : li))}
                    className="text-[10px] border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none font-semibold shrink-0"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <span className="text-xs font-bold font-mono text-rose-600 w-24 text-right shrink-0">-{fmt(item.amountInCents)}</span>
                </div>
              ))}
            </div>

            {invoiceResult && (
              <div className={`mx-6 mb-2 p-3 rounded-xl text-[11px] font-semibold flex items-center gap-2 ${invoiceResult.imported > 0 ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                {invoiceResult.imported > 0 ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
                {invoiceResult.imported > 0 ? `${invoiceResult.imported} lançamentos importados com sucesso!` : 'Nenhum lançamento importado.'}
                {invoiceResult.errors.length > 0 && <span className="ml-1 text-red-600">{invoiceResult.errors.length} erro(s).</span>}
              </div>
            )}

            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button onClick={() => { setImportCardId(null); setLineItems([]); }} className="flex-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl py-2.5 transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleImportConfirm}
                disabled={importingInvoice || lineItems.filter(i => i.checked).length === 0}
                className="flex-1 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl py-2.5 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {importingInvoice ? 'Importando…' : `Lançar ${lineItems.filter(i => i.checked).length} Selecionados`}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Consentimento de IA e Isenção MKS Brasil */}
      <AIDocumentConsentModal
        isOpen={showConsentModal}
        documentType="INVOICE"
        onConsent={() => {
          setShowConsentModal(false);
          if (pendingInvoiceFile) {
            processInvoiceFile(pendingInvoiceFile);
            setPendingInvoiceFile(null);
          }
        }}
        onCancel={() => {
          setShowConsentModal(false);
          setPendingInvoiceFile(null);
          if (invoiceFileRef.current) invoiceFileRef.current.value = '';
        }}
      />
    </div>
  );
}
