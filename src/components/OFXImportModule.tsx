/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  Upload, FileText, CheckCircle, AlertTriangle, X,
  RotateCw, ArrowDownToLine, Trash2,
} from 'lucide-react';
import { FinancialAccount } from '../types';

interface ParsedTrn {
  fitid: string;
  type: 'CREDIT' | 'DEBIT';
  date: string;
  amountCents: number;
  memo: string;
  selected: boolean;
}

interface OFXImportModuleProps {
  accounts: FinancialAccount[];
  onRefreshAllData: () => void;
}

// ── OFX parser ────────────────────────────────────────────────────────────────

function extractTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i'));
  return m ? m[1].trim() : '';
}

function parseOFXDate(raw: string): string {
  const d = raw.replace(/\[.*$/, '').trim().slice(0, 8);
  if (d.length < 8) return new Date().toISOString().split('T')[0];
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function parseTrnBlock(block: string, idx: number): ParsedTrn | null {
  const fitid = extractTag(block, 'FITID') || `ofx-${idx}-${Date.now()}`;
  const trnType = extractTag(block, 'TRNTYPE').toUpperCase();
  const dtPosted = extractTag(block, 'DTPOSTED');
  const trnAmt = extractTag(block, 'TRNAMT');
  const memo = extractTag(block, 'MEMO') || extractTag(block, 'NAME') || 'Transação';

  const amount = parseFloat(trnAmt.replace(',', '.') || '0');
  const DEBIT_TYPES = ['DEBIT', 'PAYMENT', 'ATM', 'POS', 'CASH', 'DIRECTDEBIT', 'CHECK', 'SRVCHG', 'FEE'];
  const isDebit = amount < 0 || DEBIT_TYPES.includes(trnType);

  return {
    fitid,
    type: isDebit ? 'DEBIT' : 'CREDIT',
    date: parseOFXDate(dtPosted),
    amountCents: Math.abs(Math.round(amount * 100)),
    memo,
    selected: true,
  };
}

function parseOFX(content: string): ParsedTrn[] {
  // Find <OFX> tag (case insensitive)
  const ofxIdx = content.search(/<OFX>/i);
  if (ofxIdx === -1) throw new Error('Tag <OFX> não encontrada. Verifique se o arquivo é OFX/QFX válido.');
  const body = content.slice(ofxIdx);

  const results: ParsedTrn[] = [];
  const re = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(body)) !== null) {
    const trn = parseTrnBlock(m[1], idx++);
    if (trn && trn.amountCents > 0) results.push(trn);
  }

  if (!results.length) throw new Error('Nenhuma transação encontrada no arquivo OFX.');
  return results;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OFXImportModule({ accounts, onRefreshAllData }: OFXImportModuleProps) {
  const [transactions, setTransactions] = useState<ParsedTrn[]>([]);
  const [fileName, setFileName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    setParseError('');
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = parseOFX(content);
        setTransactions(parsed);
        setFileName(file.name);
      } catch (err: any) {
        setParseError(err.message);
        setTransactions([]);
        setFileName('');
      }
    };
    reader.readAsText(file, 'latin1');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const toggleAll = (val: boolean) => setTransactions(t => t.map(tx => ({ ...tx, selected: val })));
  const toggleOne = (fitid: string) => setTransactions(t => t.map(tx => tx.fitid === fitid ? { ...tx, selected: !tx.selected } : tx));

  const selectedCount = transactions.filter(t => t.selected).length;
  const totalCents = transactions.filter(t => t.selected).reduce((s, t) => s + t.amountCents, 0);

  const handleImport = async () => {
    if (!accountId) { alert('Selecione uma conta de destino.'); return; }
    const selected = transactions.filter(t => t.selected);
    if (!selected.length) { alert('Selecione ao menos uma transação.'); return; }
    setIsImporting(true);
    try {
      const res = await fetch('/api/import/ofx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: selected, accountId }),
      });
      const data = await res.json();
      if (data.success) {
        setImportResult({ imported: data.imported, skipped: data.skipped });
        setTransactions([]);
        setFileName('');
        onRefreshAllData();
      } else {
        setParseError(data.error || 'Erro ao importar.');
      }
    } catch {
      setParseError('Falha de rede ao importar.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setTransactions([]);
    setFileName('');
    setParseError('');
    setImportResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const fmt = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <ArrowDownToLine className="w-5 h-5 text-indigo-600" />
          Módulo 4: Importar Extrato OFX / QFX
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Exporte o extrato do seu banco em formato OFX ou QFX e importe as transações diretamente.
        </p>
      </div>

      {/* Success feedback */}
      {importResult && (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-teal-900">Importação concluída!</p>
            <p className="text-xs text-teal-700 mt-0.5">
              {importResult.imported} transação(ões) importada(s).
              {importResult.skipped > 0 && ` ${importResult.skipped} já existiam e foram ignoradas.`}
            </p>
            <button onClick={handleReset} className="mt-2 text-xs text-teal-700 underline font-semibold">Importar outro arquivo</button>
          </div>
        </div>
      )}

      {/* Drop zone (only if no transactions parsed yet) */}
      {!transactions.length && !importResult && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-12 flex flex-col items-center gap-4 cursor-pointer transition-all ${
            isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'
          }`}
        >
          <div className="w-14 h-14 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center">
            <Upload className="w-7 h-7 text-slate-400" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-bold text-slate-700">Arraste o arquivo OFX / QFX aqui</p>
            <p className="text-xs text-slate-400">ou clique para selecionar — exportado pelo seu banco</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".ofx,.qfx,.OFX,.QFX"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 font-medium">{parseError}</p>
        </div>
      )}

      {/* Preview table */}
      {transactions.length > 0 && (
        <div className="space-y-4">
          {/* File name + controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-bold text-slate-700">{fileName}</span>
              <span className="text-[10px] text-slate-400">— {transactions.length} transações</span>
            </div>
            <button onClick={handleReset} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 font-semibold">
              <Trash2 className="w-3.5 h-3.5" /> Limpar
            </button>
          </div>

          {/* Account selector */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-xs font-bold text-slate-600 shrink-0">Importar para a conta:</label>
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="flex-1 text-xs font-semibold border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">Selecione uma conta...</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.bankName})</option>
              ))}
            </select>
          </div>

          {/* Select all / deselect */}
          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              <button onClick={() => toggleAll(true)} className="text-xs text-indigo-600 font-bold hover:underline">Selecionar tudo</button>
              <button onClick={() => toggleAll(false)} className="text-xs text-slate-500 font-bold hover:underline">Desmarcar tudo</button>
            </div>
            <span className="text-xs text-slate-500">
              {selectedCount} selecionada(s) — total {fmt(totalCents)}
            </span>
          </div>

          {/* Transaction rows */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left w-8"></th>
                    <th className="px-4 py-3 text-left font-bold text-slate-600">Data</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-600">Descrição</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-600">Tipo</th>
                    <th className="px-4 py-3 text-right font-bold text-slate-600">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((tx) => (
                    <tr
                      key={tx.fitid}
                      onClick={() => toggleOne(tx.fitid)}
                      className={`cursor-pointer transition-colors ${tx.selected ? 'bg-white' : 'bg-slate-50 opacity-50'} hover:bg-indigo-50`}
                    >
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={tx.selected}
                          onChange={() => toggleOne(tx.fitid)}
                          onClick={e => e.stopPropagation()}
                          className="rounded accent-indigo-600"
                        />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-600">{tx.date}</td>
                      <td className="px-4 py-2.5 text-slate-700 max-w-xs truncate" title={tx.memo}>{tx.memo}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                          tx.type === 'CREDIT'
                            ? 'bg-teal-50 text-teal-700 border border-teal-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                          {tx.type === 'CREDIT' ? 'Receita' : 'Despesa'}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-bold font-mono ${tx.type === 'CREDIT' ? 'text-teal-700' : 'text-red-700'}`}>
                        {tx.type === 'DEBIT' ? '- ' : '+ '}{fmt(tx.amountCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Import button */}
          <div className="flex justify-end">
            <button
              onClick={handleImport}
              disabled={isImporting || !selectedCount || !accountId}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
            >
              {isImporting ? (
                <><RotateCw className="w-4 h-4 animate-spin" /> Importando...</>
              ) : (
                <><ArrowDownToLine className="w-4 h-4" /> Importar {selectedCount} transação(ões)</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* How to export guide */}
      {!transactions.length && !importResult && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Como exportar o OFX do seu banco</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
            {[
              { bank: 'Nubank', path: 'Perfil → Extrato → Exportar → OFX' },
              { bank: 'Inter', path: 'Extrato → Exportar → OFX' },
              { bank: 'Itaú', path: 'Extrato → Baixar Extrato → OFX' },
              { bank: 'Bradesco', path: 'Internet Banking → Conta Corrente → Extrato → OFX' },
              { bank: 'Banco do Brasil', path: 'Extratos → Exportar → OFX/OFXS' },
              { bank: 'Sicredi / Sicoob', path: 'Autoatendimento → Extrato → OFX' },
            ].map(b => (
              <div key={b.bank} className="flex gap-2">
                <span className="font-bold text-slate-800 shrink-0">{b.bank}:</span>
                <span>{b.path}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
