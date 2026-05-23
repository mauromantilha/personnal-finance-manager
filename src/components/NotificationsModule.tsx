/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import {
  Bell,
  AlertTriangle,
  CheckCircle,
  Info,
  Eye,
  CheckCheck,
  Trash2,
  Filter,
  Mail,
  MessageSquare
} from 'lucide-react';
import { NotificationAlert } from '../types';

type AlertFilter = 'all' | 'unread' | 'WARNING' | 'SUCCESS' | 'INFO';

interface NotificationsModuleProps {
  alerts: NotificationAlert[];
  onMarkAsRead: (id: string) => void;
  onMarkAllRead: () => Promise<void>;
  onClearRead: () => Promise<void>;
}

export default function NotificationsModule({
  alerts,
  onMarkAsRead,
  onMarkAllRead,
  onClearRead,
}: NotificationsModuleProps) {
  const [filter, setFilter] = useState<AlertFilter>('all');
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const unread = alerts.filter(a => !a.isRead).length;
  const warnings = alerts.filter(a => a.type === 'WARNING').length;
  const successes = alerts.filter(a => a.type === 'SUCCESS').length;
  const infos = alerts.filter(a => a.type === 'INFO').length;
  const readCount = alerts.filter(a => a.isRead).length;

  const filtered = alerts.filter(a => {
    if (filter === 'unread') return !a.isRead;
    if (filter === 'WARNING') return a.type === 'WARNING';
    if (filter === 'SUCCESS') return a.type === 'SUCCESS';
    if (filter === 'INFO') return a.type === 'INFO';
    return true;
  });

  const relativeTime = (iso: string) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'agora';
    if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
    const d = new Date(iso);
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const alertIcon = (type: string) => {
    if (type === 'WARNING') return { Icon: AlertTriangle, ring: 'border-amber-300', bg: 'bg-amber-50', icon: 'text-amber-500' };
    if (type === 'SUCCESS') return { Icon: CheckCircle, ring: 'border-emerald-300', bg: 'bg-emerald-50', icon: 'text-emerald-500' };
    return { Icon: Info, ring: 'border-sky-300', bg: 'bg-sky-50', icon: 'text-sky-500' };
  };

  const typePill = (type: string) => {
    if (type === 'WARNING') return 'bg-amber-100 text-amber-700 border-amber-200';
    if (type === 'SUCCESS') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    return 'bg-sky-100 text-sky-700 border-sky-200';
  };

  const typeLabel = (type: string) => {
    if (type === 'WARNING') return 'Aviso';
    if (type === 'SUCCESS') return 'Sucesso';
    return 'Info';
  };

  const handleMarkAll = async () => {
    setIsMarkingAll(true);
    await onMarkAllRead();
    setIsMarkingAll(false);
  };

  const handleClearRead = async () => {
    setIsClearing(true);
    await onClearRead();
    setIsClearing(false);
  };

  const FILTERS: { key: AlertFilter; label: string; count?: number }[] = [
    { key: 'all', label: 'Todos', count: alerts.length },
    { key: 'unread', label: 'Não lidos', count: unread },
    { key: 'WARNING', label: 'Avisos', count: warnings },
    { key: 'SUCCESS', label: 'Sucessos', count: successes },
    { key: 'INFO', label: 'Info', count: infos },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Bell className="w-5 h-5 text-indigo-600" />
            Módulo 8: Notificações e Alertas
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Central de avisos proativos sobre a saúde financeira — gerados automaticamente pelo sistema.
          </p>
        </div>
        <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full border ${unread > 0 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
          {unread} não {unread === 1 ? 'lido' : 'lidos'}
        </span>
      </div>

      {/* KPI stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: alerts.length, color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200' },
          { label: 'Não Lidos', value: unread, color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200' },
          { label: 'Avisos', value: warnings, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
          { label: 'Sucessos', value: successes, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border rounded-2xl p-4 text-center`}>
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Main feed */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">

          {/* Filter tabs + action buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                    filter === f.key
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                  {f.count !== undefined && f.count > 0 && (
                    <span className={`ml-1 px-1 rounded-full text-[9px] ${filter === f.key ? 'bg-indigo-400 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      {f.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              {unread > 0 && (
                <button
                  onClick={handleMarkAll}
                  disabled={isMarkingAll}
                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-all border border-indigo-200 disabled:opacity-50"
                >
                  <CheckCheck className="w-3 h-3" />
                  {isMarkingAll ? 'Marcando...' : 'Marcar todos'}
                </button>
              )}
              {readCount > 0 && (
                <button
                  onClick={handleClearRead}
                  disabled={isClearing}
                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-all border border-rose-200 disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  {isClearing ? 'Limpando...' : `Limpar lidos (${readCount})`}
                </button>
              )}
            </div>
          </div>

          {/* Alert list */}
          <div className="space-y-2.5">
            {filtered.map(alert => {
              const { Icon, ring, bg, icon } = alertIcon(alert.type);
              return (
                <div
                  key={alert.id}
                  className={`p-4 border-2 rounded-xl flex items-start gap-3.5 transition-all ${
                    alert.isRead
                      ? 'bg-slate-50/60 border-slate-100 opacity-60'
                      : `bg-white ${ring} shadow-sm`
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${bg} ${ring}`}>
                    <Icon className={`w-4.5 h-4.5 ${icon}`} />
                  </div>

                  <div className="flex-1 space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800 leading-tight">{alert.title}</span>
                        <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${typePill(alert.type)}`}>
                          {typeLabel(alert.type)}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono text-slate-400 shrink-0">{relativeTime(alert.date)}</span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{alert.message}</p>

                    {!alert.isRead && (
                      <button
                        onClick={() => onMarkAsRead(alert.id)}
                        className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-indigo-600 hover:text-indigo-800 font-bold"
                      >
                        <Eye className="w-3 h-3" /> Marcar como lido
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="py-16 text-center space-y-3">
                <Bell className="w-10 h-10 text-slate-200 mx-auto" />
                <div>
                  <p className="text-sm font-bold text-slate-400">Nenhum alerta encontrado</p>
                  <p className="text-xs text-slate-300 mt-1">
                    {filter === 'all' ? 'Tudo em ordem! Nenhum alerta gerado ainda.' : `Sem alertas na categoria "${filter}".`}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Side config panel */}
        <div className="lg:col-span-4 space-y-6">

          {/* Channels config */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5 pb-2 border-b border-slate-100">
              <Mail className="w-4 h-4 text-slate-500" />
              Canais de Avisos
            </h3>

            <div className="space-y-3 text-xs">
              {[
                { id: 'email_chk', label: 'E-mail (SendGrid)', desc: 'Alertas imediatos por e-mail ao atingir 80% do orçamento ou limite de cartão.' },
                { id: 'sms_chk', label: 'SMS / WhatsApp (Twilio)', desc: 'Resumos semanais e avisos de segurança.' },
              ].map(ch => (
                <div key={ch.id} className="p-3 border border-slate-200 rounded-xl flex items-start gap-2.5">
                  <input type="checkbox" defaultChecked id={ch.id} className="w-4 h-4 rounded text-indigo-600 border-slate-300 mt-0.5" />
                  <div>
                    <label htmlFor={ch.id} className="font-bold text-slate-700 block">{ch.label}</label>
                    <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{ch.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Engine status */}
          <div className="bg-emerald-900 text-white rounded-2xl p-6 shadow-sm space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4" /> Motor de Alertas Proativos
            </h4>
            <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
              <p>Alertas são gerados automaticamente a cada acesso ao sistema verificando:</p>
              <ul className="list-disc list-inside space-y-1 text-emerald-200 font-medium">
                <li>Saldo negativo em contas</li>
                <li>Limite de cartão acima de 80%</li>
                <li>Faturas vencendo em até 3 dias</li>
                <li>Orçamentos estourados</li>
                <li>Metas financeiras atingidas</li>
              </ul>
            </div>
            <div className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-wider pt-1 border-t border-emerald-800">
              IDEMPOTENTE · SEM DUPLICATAS · EM TEMPO REAL
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
