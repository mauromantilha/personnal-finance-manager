/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Bell, 
  AlertTriangle, 
  CheckCircle, 
  Info, 
  Mail, 
  MessageSquare,
  HelpCircle,
  Eye
} from 'lucide-react';
import { NotificationAlert } from '../types';

interface NotificationsModuleProps {
  alerts: NotificationAlert[];
  onMarkAsRead: (id: string) => void;
}

export default function NotificationsModule({ 
  alerts, 
  onMarkAsRead 
}: NotificationsModuleProps) {

  // Helper date
  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return `${d.toLocaleDateString()} ás ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Bell className="w-5 h-5 text-indigo-600" />
            Módulo 6: Notificações e Alertas (Communications)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Central de avisos em tempo real integrando canais de e-mail (SendGrid) e SMS (Twilio) sobre a saúde contábil.
          </p>
        </div>

        <span className="text-xs bg-indigo-50 border border-indigo-100 font-extrabold text-indigo-700 px-2.5 py-1 rounded-full">
          {alerts.filter(a => !a.isRead).length} Alertas Não Lidos
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Alerts Feed */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5 mb-4">
            <Bell className="w-4 h-4 text-slate-500" />
            Feed de Notificações Ativas
          </h3>

          <div className="space-y-3">
            {alerts.map((alert) => {
              let IconComp = Info;
              let iconColor = 'text-sky-500 bg-sky-50 border-sky-200';
              if (alert.type === 'WARNING') {
                IconComp = AlertTriangle;
                iconColor = 'text-amber-500 bg-amber-50 border-amber-200';
              } else if (alert.type === 'SUCCESS') {
                IconComp = CheckCircle;
                iconColor = 'text-emerald-500 bg-emerald-50 border-emerald-200';
              }

              return (
                <div 
                  key={alert.id} 
                  className={`p-4 border rounded-xl flex items-start gap-3.5 transition-all ${
                    alert.isRead 
                      ? 'bg-slate-50/50 border-slate-200 opacity-65' 
                      : 'bg-white border-slate-250 shadow-sm ring-4 ring-indigo-50/30'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl border-2 flex items-center justify-center shrink-0 ${iconColor}`}>
                    <IconComp className="w-4 h-4" />
                  </div>

                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-800">{alert.title}</span>
                      <span className="text-[9px] font-mono text-slate-400">{formatTime(alert.date)}</span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed font-semibold">{alert.message}</p>
                    
                    {!alert.isRead && (
                      <button 
                        onClick={() => onMarkAsRead(alert.id)}
                        className="inline-flex items-center gap-1 mt-2 text-[10px] text-indigo-600 hover:text-indigo-800 font-extrabold"
                      >
                        <Eye className="w-3.5 h-3.5" /> Marcar como Visualizado
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {alerts.length === 0 && (
              <div className="py-12 text-center text-slate-400 text-xs">Sem alertas pendentes no momento. Bom trabalho!</div>
            )}
          </div>
        </div>

        {/* Channels Configuration */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5 pb-2 border-b border-slate-100">
              <Mail className="w-4 h-4 text-slate-500" />
              Canais de Avisos Externos
            </h3>

            <div className="space-y-3.5 text-xs text-slate-600 font-medium">
              <div className="p-3 border border-slate-200 rounded-xl flex items-start gap-2.5">
                <input 
                  type="checkbox" 
                  defaultChecked 
                  id="email_chk"
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300 mt-0.5 focus:ring-opacity-40" 
                />
                <div>
                  <label htmlFor="email_chk" className="font-bold text-slate-700 block">Notificações por E-mail (SendGrid)</label>
                  <p className="text-[10px] text-slate-400 leading-tight">Envia alertas imediatamente ao celular caso a fatura do cartão ou os limites de categoria extrapolem 80% do valor estipulado.</p>
                </div>
              </div>

              <div className="p-3 border border-slate-200 rounded-xl flex items-start gap-2.5">
                <input 
                  type="checkbox" 
                  defaultChecked 
                  id="sms_chk"
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300 mt-0.5 focus:ring-opacity-40" 
                />
                <div>
                  <label htmlFor="sms_chk" className="font-bold text-slate-700 block">Mensagem SMS / WhatsApp (Twilio)</label>
                  <p className="text-[10px] text-slate-400 leading-tight">Envio de resumos patrimoniais semanais e avisos de segurança MFA.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-emerald-900 text-white rounded-2xl p-6 shadow-sm space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4" /> Resumo Semanal Integrado
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              O agendador envia toda segunda-feira um compilado PDF consolidando despesas, saldos de investimentos e progresso de metas para o e-mail cadastrado.
            </p>
            <div className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-wider">
              PRÓXIMO ENVIO: SEGUNDA, 08:00
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
