/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Network, 
  RotateCw, 
  Plus, 
  CheckCircle, 
  Clock, 
  Smartphone, 
  AlertTriangle, 
  Layers, 
  Cpu, 
  Terminal, 
  X,
  CreditCard
} from 'lucide-react';
import { BankConnection } from '../types';

interface OpenFinanceModuleProps {
  connections: BankConnection[];
  onTriggerSync: (bankName: string) => Promise<any>;
  onRefreshAllData: () => void;
}

export default function OpenFinanceModule({ 
  connections, 
  onTriggerSync, 
  onRefreshAllData 
}: OpenFinanceModuleProps) {
  const [showConnectWidget, setShowConnectWidget] = useState(false);
  const [selectedBank, setSelectedBank] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);

  // Sync state machine
  const [activeSyncingBank, setActiveSyncingBank] = useState<string | null>(null);
  const [syncStep, setSyncStep] = useState(0);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [syncProgress, setSyncProgress] = useState(0);

  // Available bank presets in Brazil / Latin America
  const BANK_PRESETS = [
    { name: 'Banco Itaú', logo: '🏦', theme: 'bg-orange-500 text-white', desc: 'Líder em Open Finance com suporte a PIX e cartões Black.' },
    { name: 'Banco Inter', logo: '🍊', theme: 'bg-orange-600 text-white', desc: 'Conta digital completa com integração de investimentos.' },
    { name: 'XP Investimentos', logo: '📈', theme: 'bg-yellow-500 text-black', desc: 'Sincronização imediata de saldos e relatórios patrimoniais.' },
    { name: 'Banco Bradesco', logo: '🔴', theme: 'bg-red-600 text-white', desc: 'Garante o fluxo de todas as faturas Visa/Mastercard.' },
    { name: 'Nubank', logo: '🟣', theme: 'bg-purple-600 text-white', desc: 'Sincronize o roxinho instantaneamente via canais digitais.' }
  ];

  // Steps labels
  const STEPS_LABELS = [
    'Conectando com o gateway Pluggy / Belvo API...',
    'Estabelecendo conexão SSL criptografada com canal bancário...',
    'Enfileirando tarefa [sync-historical-data] no Redis Queue...',
    'Baixando extratos contábeis e faturas dos últimos 90 dias...',
    'Invocando Inteligência Artificial (Gemini SDK) para normalização mercantil...',
    'Inserindo novos registros no PostgreSQL Ledger e atualizando orçamentos...',
    'Concluído! Notificação em tempo real enviada via WebSockets.'
  ];

  const handleOpenConnect = (bankName: string) => {
    setSelectedBank(bankName);
    setShowConnectWidget(true);
  };

  const handleSubmitConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setIsFormSubmitting(true);
    
    // Step 1: Open Finance gateway simulation
    setTimeout(async () => {
      setIsFormSubmitting(false);
      setShowConnectWidget(false);
      
      // Start background sync
      setActiveSyncingBank(selectedBank);
      setSyncStep(0);
      setSyncProgress(5);
      setSyncLogs([`[Client] Solicitando conexão para ${selectedBank}`]);
      
      // Hit actual server connection sync endpoint!
      try {
        const responseData = await onTriggerSync(selectedBank);
        if (responseData && responseData.success) {
          // Success triggered
        }
      } catch (err) {
        console.error(err);
      }

      setUsername('');
      setPassword('');
    }, 1500);
  };

  // Run the visual step machine simulation linked with logs
  useEffect(() => {
    if (!activeSyncingBank) return;

    const interval = setInterval(() => {
      setSyncStep(prev => {
        const next = prev + 1;
        if (next >= STEPS_LABELS.length) {
          clearInterval(interval);
          setActiveSyncingBank(null);
          // Auto-trigger clean parent reload to fetch new items
          onRefreshAllData();
          return prev;
        }

        // Add matching server lookalike logging rows
        setSyncLogs(logs => [
          ...logs,
          `[Redis Job] ${new Date().toLocaleTimeString()} - Task sync-historical-data step ${next}: ${STEPS_LABELS[next]}`,
          `[Server] Guardando referências no DB com item_id gerado.`
        ]);

        setSyncProgress(next * 16.6);
        return next;
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [activeSyncingBank]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Network className="w-5 h-5 text-indigo-600" />
            Módulo 3: Integração e Conciliação Bancária (Open Finance)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Conexão automatizada multi-bancos. Centralize extratos, poupança e faturas eliminando lançamentos manuais repetitivos.
          </p>
        </div>

        <button 
          onClick={onRefreshAllData}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-lg text-xs font-bold transition-all shadow-xs"
        >
          <RotateCw className="w-3.5 h-3.5" /> Forçar Varredura Total
        </button>
      </div>

      {/* Grid of banks connection status */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {BANK_PRESETS.map(bank => {
          const activeConn = connections.find(c => c.institutionName.toLowerCase() === bank.name.toLowerCase());
          return (
            <div key={bank.name} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center text-xl border border-slate-200">
                    {bank.logo}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-xs">{bank.name}</h3>
                    <p className="text-[10px] text-slate-400 font-medium leading-none">LatAm Open Finance</p>
                  </div>
                </div>

                <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                  activeConn?.status === 'CONNECTED' 
                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                    : activeConn?.status === 'SYNCING' || activeSyncingBank === bank.name
                    ? 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
                    : 'bg-slate-50 text-slate-400 border border-slate-200'
                }`}>
                  {activeSyncingBank === bank.name ? 'Sincronizando' : activeConn?.status || 'Não Conectado'}
                </span>
              </div>

              <p className="text-[11px] text-slate-500 leading-tight">
                {bank.desc}
              </p>

              <div className="pt-2 border-t border-slate-105 flex items-center justify-between">
                <span className="text-[9px] text-slate-400 font-medium font-mono">
                  {activeConn?.lastSyncedAt 
                    ? `Sinc: ${new Date(activeConn.lastSyncedAt).toLocaleDateString()}` 
                    : 'Nunca conectado'}
                </span>

                {activeConn?.status === 'CONNECTED' ? (
                  <button 
                    onClick={() => handleOpenConnect(bank.name)}
                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold"
                  >
                    Reconectar
                  </button>
                ) : (
                  <button 
                    disabled={activeSyncingBank !== null}
                    onClick={() => handleOpenConnect(bank.name)}
                    className="inline-flex items-center gap-1 text-[10px] bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Conectar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sync simulation execution and logs panel */}
      {activeSyncingBank && (
        <div className="bg-slate-950 text-slate-100 rounded-2xl p-6 shadow-md border border-slate-800 space-y-4 animate-slideDown">
          <div className="first-letter:flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-400 animate-spin" />
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">Background Worker Ativo</span>
                <h4 className="text-[11px] text-slate-400">Processando fila no Redis: <code className="font-mono text-white bg-slate-900 px-1 py-0.5 rounded">sync-historical-data</code> de {activeSyncingBank}</h4>
              </div>
            </div>
            
            <span className="text-xs font-mono font-bold text-indigo-400">{Math.round(syncProgress)}%</span>
          </div>

          {/* Progress bar container */}
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div 
              style={{ width: `${syncProgress}%` }}
              className="bg-indigo-500 h-full transition-all duration-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Steps feedback list */}
            <div className="md:col-span-7 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Etapas de Consolidação</span>
              <div className="space-y-1.5">
                {STEPS_LABELS.map((stepLabel, idx) => {
                  const isCurrent = idx === syncStep;
                  const isPassed = idx < syncStep;
                  return (
                    <div 
                      key={idx} 
                      className={`text-[11px] flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all ${
                        isCurrent 
                          ? 'bg-indigo-950/40 border-indigo-500 text-indigo-100 font-semibold'
                          : isPassed
                          ? 'bg-slate-900 border-transparent text-emerald-400'
                          : 'border-transparent text-slate-600'
                      }`}
                    >
                      {isPassed ? (
                        <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                      ) : isCurrent ? (
                        <RotateCw className="w-3.5 h-3.5 animate-spin shrink-0 text-indigo-400" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 shrink-0 text-slate-700" />
                      )}
                      <span>{stepLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Simulated Server Console Shell */}
            <div className="md:col-span-5 bg-slate-900 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5" /> Terminal de Eventos do Monólito NestJS
                </span>
                
                <div className="font-mono text-[9px] text-slate-400 space-y-1 max-h-[160px] overflow-y-auto leading-normal">
                  <div className="text-slate-500">// Redis queue client inicializado</div>
                  {syncLogs.map((logLine, idx) => (
                    <div key={idx} className={logLine.includes('[Client]') ? 'text-indigo-300' : 'text-slate-400'}>
                      {logLine}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-2.5 rounded text-[10px] font-semibold text-slate-300 flex items-center gap-2 mt-2">
                <Smartphone className="w-4 h-4 text-slate-400" />
                <span>WebHook Status: <code className="text-emerald-400 font-mono">Listening on port 3000</code></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Connect Bank Credentials overlay simulation model */}
      {showConnectWidget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-zoomIn">
            {/* Header bank identity */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-white flex items-center justify-center text-lg shadow-sm font-bold text-slate-900">
                  ⚡
                </div>
                <div>
                  <h3 className="font-bold text-sm">Widget de Conexão Segura</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Pluggy Intermediador Open Finance</p>
                </div>
              </div>

              <button 
                onClick={() => setShowConnectWidget(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Widget layout forms */}
            <form onSubmit={handleSubmitConnect} className="p-6 space-y-4">
              <div className="text-center space-y-1">
                <h4 className="font-bold text-slate-800 text-xs">Autorize o compartilhamento para o MKS Finanças</h4>
                <p className="text-[11px] text-slate-500">Insira suas credenciais comuns de internet banking para o parceiro <span className="font-bold text-slate-800">{selectedBank}</span> de forma isolada.</p>
              </div>

              <div className="bg-emerald-50 text-emerald-900 border border-emerald-100 rounded-lg p-3 text-[10px] space-y-1 flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Protocolo Seguro Ativo:</span> Suas senhas são transmitidas via criptografia AES-256 fim-a-fim. O MKS Finanças só possui permissões de leitura do extrato contábil, sem qualquer capacidade de transferências ou saques.
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Usuário / CPF de Acesso</label>
                  <input 
                    type="text" 
                    placeholder="e.g. 123.456.789-00" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="w-full text-xs font-semibold border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Chave / Assinatura Eletrônica</label>
                  <input 
                    type="password" 
                    placeholder="••••••••" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full text-xs font-mono border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowConnectWidget(false)}
                  className="w-1/2 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isFormSubmitting}
                  className="w-1/2 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  {isFormSubmitting ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" /> Conectando...
                    </>
                  ) : (
                    <>
                      Autorizar Conexão
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
