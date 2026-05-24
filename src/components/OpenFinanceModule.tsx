/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Network,
  RotateCw,
  Plus,
  CheckCircle,
  AlertTriangle,
  Unlink,
  RefreshCw,
  ExternalLink,
  Info,
} from 'lucide-react';
import { BankConnection } from '../types';

declare global {
  interface Window {
    PluggyConnect: new (opts: {
      connectToken: string;
      onSuccess: (data: { item: { id: string; connector: { name: string; imageUrl?: string } } }) => void;
      onError: (data: { message: string }) => void;
      onClose: () => void;
    }) => { init: () => void };
  }
}

interface OpenFinanceModuleProps {
  connections: BankConnection[];
  onConnectItem: (itemId: string, institutionName: string, logo: string) => Promise<any>;
  onSyncItem: (itemId: string) => Promise<void>;
  onDeleteConnection: (itemId: string) => Promise<void>;
  onRefreshAllData: () => void;
}

const PLUGGY_SDK_URL = 'https://cdn.pluggy.ai/pluggy-connect/v2.1.1/pluggy-connect.js';

export default function OpenFinanceModule({
  connections,
  onConnectItem,
  onSyncItem,
  onDeleteConnection,
  onRefreshAllData,
}: OpenFinanceModuleProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [syncingItemId, setSyncingItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/open-finance/configured')
      .then(r => r.json())
      .then((d: { configured: boolean }) => setConfigured(d.configured))
      .catch(() => setConfigured(false));
  }, []);

  const loadPluggySdk = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.PluggyConnect) { resolve(); return; }
      const existing = document.getElementById('pluggy-sdk');
      if (existing) { existing.addEventListener('load', () => resolve()); return; }
      const script = document.createElement('script');
      script.id = 'pluggy-sdk';
      script.src = PLUGGY_SDK_URL;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Falha ao carregar Pluggy SDK'));
      document.head.appendChild(script);
    });
  }, []);

  const handleOpenWidget = async () => {
    setWidgetLoading(true);
    try {
      const [tokenResp] = await Promise.all([
        fetch('/api/open-finance/connect-token', { method: 'POST' }).then(r => r.json()),
        loadPluggySdk(),
      ]);
      if (tokenResp.error) {
        alert(`Erro: ${tokenResp.error}`);
        return;
      }
      const widget = new window.PluggyConnect({
        connectToken: tokenResp.connectToken,
        onSuccess: async ({ item }) => {
          await onConnectItem(item.id, item.connector.name, item.connector.imageUrl || '🏦');
          onRefreshAllData();
        },
        onError: ({ message }) => console.error('[Pluggy]', message),
        onClose: () => {},
      });
      widget.init();
    } catch (e: any) {
      alert(`Erro ao abrir widget: ${e.message}`);
    } finally {
      setWidgetLoading(false);
    }
  };

  const handleSync = async (itemId: string) => {
    setSyncingItemId(itemId);
    try {
      await onSyncItem(itemId);
      setTimeout(() => { onRefreshAllData(); setSyncingItemId(null); }, 5000);
    } catch { setSyncingItemId(null); }
  };

  const handleDelete = async (itemId: string, name: string) => {
    if (!confirm(`Desconectar "${name}"? As transações já importadas serão mantidas.`)) return;
    setDeletingItemId(itemId);
    try {
      await onDeleteConnection(itemId);
      onRefreshAllData();
    } finally {
      setDeletingItemId(null);
    }
  };

  const statusBadge = (conn: BankConnection) => {
    if (syncingItemId === conn.itemId || conn.status === 'SYNCING') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
          <RotateCw className="w-2.5 h-2.5 animate-spin" /> Sincronizando
        </span>
      );
    }
    if (conn.status === 'CONNECTED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-teal-50 text-teal-700 border border-teal-200">
          <CheckCircle className="w-2.5 h-2.5" /> Conectado
        </span>
      );
    }
    if (conn.status === 'ERROR') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-red-50 text-red-700 border border-red-200">
          <AlertTriangle className="w-2.5 h-2.5" /> Erro
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-slate-50 text-slate-400 border border-slate-200">
        Desconectado
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Network className="w-5 h-5 text-indigo-600" />
            Módulo 4: Open Finance (Pluggy)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Conecte seus bancos via Open Finance Brasil. Extratos e saldos são importados automaticamente.
          </p>
        </div>
        <button
          onClick={onRefreshAllData}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-lg text-xs font-bold transition-all shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </button>
      </div>

      {/* Not configured warning */}
      {configured === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-4">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-sm font-bold text-amber-900">Credenciais Pluggy não configuradas</p>
            <p className="text-xs text-amber-800 leading-relaxed">
              Para usar o Open Finance real, registre-se em{' '}
              <a
                href="https://dashboard.pluggy.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold inline-flex items-center gap-0.5"
              >
                dashboard.pluggy.ai <ExternalLink className="w-3 h-3" />
              </a>{' '}
              (sandbox gratuito), crie um App e adicione as credenciais no <code className="bg-amber-100 px-1 rounded font-mono">.env</code>:
            </p>
            <pre className="bg-amber-100 text-amber-900 text-[11px] font-mono rounded-lg p-3 leading-relaxed">
{`PLUGGY_CLIENT_ID=seu_client_id
PLUGGY_CLIENT_SECRET=seu_client_secret`}
            </pre>
            <p className="text-xs text-amber-700">Reinicie o servidor após salvar o <code className="font-mono">.env</code>.</p>
          </div>
        </div>
      )}

      {/* Configured: connect button */}
      {configured === true && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
              <Plus className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Conectar Nova Instituição</p>
              <p className="text-xs text-slate-500">Abrirá o widget Pluggy para autenticação segura com seu banco.</p>
            </div>
          </div>
          <button
            onClick={handleOpenWidget}
            disabled={widgetLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
          >
            {widgetLoading ? (
              <><RotateCw className="w-3.5 h-3.5 animate-spin" /> Carregando...</>
            ) : (
              <><Plus className="w-3.5 h-3.5" /> Conectar Banco</>
            )}
          </button>
        </div>
      )}

      {/* Connected institutions */}
      {connections.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Instituições Conectadas</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {connections.map(conn => (
              <div
                key={conn.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-xl">
                      {conn.logo || '🏦'}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">{conn.institutionName}</p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {conn.lastSyncedAt
                          ? `Sinc: ${new Date(conn.lastSyncedAt).toLocaleString('pt-BR')}`
                          : 'Aguardando sincronização'}
                      </p>
                    </div>
                  </div>
                  {statusBadge(conn)}
                </div>

                <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                  <button
                    onClick={() => handleSync(conn.itemId!)}
                    disabled={syncingItemId === conn.itemId || conn.status === 'SYNCING'}
                    className="inline-flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800 disabled:opacity-40 font-bold px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${syncingItemId === conn.itemId ? 'animate-spin' : ''}`} />
                    Sincronizar
                  </button>
                  <button
                    onClick={() => handleDelete(conn.itemId!, conn.institutionName)}
                    disabled={deletingItemId === conn.itemId}
                    className="inline-flex items-center gap-1 text-[10px] text-red-500 hover:text-red-700 disabled:opacity-40 font-bold px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Unlink className="w-3 h-3" />
                    Desconectar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {connections.length === 0 && configured !== false && (
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center">
            <Network className="w-6 h-6 text-slate-300" />
          </div>
          <p className="text-sm font-bold text-slate-500">Nenhum banco conectado</p>
          <p className="text-xs text-slate-400 max-w-xs">
            Clique em "Conectar Banco" para autenticar via Pluggy e importar seu extrato automaticamente.
          </p>
        </div>
      )}

      {/* Info footer */}
      <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl p-4">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-500 leading-relaxed">
          A conexão é intermediada pela{' '}
          <a href="https://pluggy.ai" target="_blank" rel="noopener noreferrer" className="underline font-semibold">
            Pluggy
          </a>{' '}
          — provedor de Open Finance Brasil regulamentado pelo Banco Central. Suas credenciais bancárias nunca são armazenadas neste servidor.
        </p>
      </div>
    </div>
  );
}
