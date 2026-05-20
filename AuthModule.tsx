/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Shield, Key, Eye, EyeOff, Smartphone, Monitor, MapPin, CheckCircle2, AlertTriangle, LogIn } from 'lucide-react';
import { UserProfile } from '../types';

interface AuthModuleProps {
  user: UserProfile;
  onUpdateUser: (updated: UserProfile) => void;
}

export default function AuthModule({ user, onUpdateUser }: AuthModuleProps) {
  const [password, setPassword] = useState('●●●●●●●●●●●');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaSecret, setMfaSecret] = useState('MKS8 F3BB 9A20 FF1C');
  const [verificationCode, setVerificationCode] = useState('');
  const [isSettingUpMfa, setIsSettingUpMfa] = useState(false);
  const [mfaSuccess, setMfaSuccess] = useState(false);

  // Active sessions mock
  const [activeSessions, setActiveSessions] = useState([
    { id: '1', device: 'MacBook Pro (Chrome)', location: 'São Paulo, BR', current: true, date: 'Ativo agora' },
    { id: '2', device: 'iPhone 15 Pro (Safari)', location: 'Rio de Janeiro, BR', current: false, date: '12 horas atrás' },
    { id: '3', device: 'Windows Desktop (Firefox)', location: 'Belo Horizonte, BR', current: false, date: '3 dias atrás' },
  ]);

  const handleVerify2FA = (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationCode.length === 6) {
      setMfaSuccess(true);
      setTimeout(() => {
        onUpdateUser({
          ...user,
          mfaEnabled: true,
          mfaPendingSetup: false
        });
        setIsSettingUpMfa(false);
        setMfaSuccess(false);
        setVerificationCode('');
      }, 1500);
    }
  };

  const terminateSession = (id: string) => {
    setActiveSessions(activeSessions.filter(s => s.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            Módulo 1: Autenticação & Segurança (Auth & IAM)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Controle de dados sensíveis, MFA de duas etapas e gestão de sessões criptografadas com AES-256.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile and Password Profile */}
        <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-xs space-y-5">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Key className="w-4 h-4 text-slate-500" />
            Perfil e Criptografia de Credenciais
          </h3>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Nome Cadastrado</label>
              <input 
                type="text" 
                value={user.name} 
                disabled 
                className="w-full text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">E-mail Corporativo</label>
              <input 
                type="text" 
                value={user.email} 
                disabled 
                className="w-full text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Senha (Criptografada na Camada DB)</label>
              <div className="relative">
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full text-sm font-mono text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:border-indigo-500"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex text-xs bg-slate-50 text-slate-600 border border-slate-100 rounded-lg p-3 gap-2">
            <Shield className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-700">Segurança de Dados ACID:</span> Todas as credenciais de login e dados sensíveis de transações bancárias são Hasheadas no PostgreSQL local e protegidas por chaves AES-256 criptográficas.
            </div>
          </div>
        </div>

        {/* MFA / 2FA Status Card */}
        <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-slate-500" />
                Autenticação de Dois Fatores (MFA / 2FA)
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${user.mfaEnabled ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700 flex items-center gap-1'}`}>
                {user.mfaEnabled ? 'MFA Ativo' : 'MFA Desativado'}
              </span>
            </div>

            {user.mfaEnabled ? (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-slate-600">
                  Proteção por OTP (Senha Única Temporal) ativa em seu cadastro. Qualquer nova sessão ou transação suspeita Open Finance exigirá validação por celular.
                </p>
                <div className="flex items-center gap-3 p-3 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span className="text-xs font-medium">Sua conta atende aos requisitos máximos de segurança PCI-DSS.</span>
                </div>
                <button 
                  onClick={() => onUpdateUser({ ...user, mfaEnabled: false })}
                  className="text-xs text-rose-600 hover:text-rose-800 font-medium underline"
                >
                  Desativar Autenticação de 2 Fatores temporariamente
                </button>
              </div>
            ) : !isSettingUpMfa ? (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-slate-600 mb-2">
                  Ative o MFA para triplicar a segurança da sua consolidação bancária contra ataques de engenharia social. Compatível com Google Authenticator ou Authy.
                </p>
                <button 
                  onClick={() => setIsSettingUpMfa(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Ativar MFA por QRCode
                </button>
              </div>
            ) : (
              <form onSubmit={handleVerify2FA} className="mt-4 space-y-4">
                <div className="flex gap-4 items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                  {/* Mock Qrcode generated */}
                  <div className="w-20 h-20 bg-slate-200 flex items-center justify-center font-mono text-center text-[10px] p-2 leading-tight rounded border border-slate-300">
                    ■□■■□□<br />
                    □■■□■■<br />
                    ■■■■■□<br />
                    □□■□■■
                  </div>
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-slate-700">Chave de Pareamento:</p>
                    <code className="text-slate-500 font-mono text-[11px] block">{mfaSecret}</code>
                    <p className="text-slate-400">Escaneie o código ou insira manualmente no App.</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-500">Insira o código de 6 dígitos gerado:</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="e.g. 123456" 
                      maxLength={6}
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full text-sm font-mono tracking-widest text-center border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
                    />
                    <button 
                      type="submit"
                      disabled={verificationCode.length !== 6 || mfaSuccess}
                      className="px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      Verificar
                    </button>
                  </div>
                </div>

                {mfaSuccess && (
                  <p className="text-xs text-emerald-600 font-semibold animate-pulse">
                    Código válido! Ativando MFA...
                  </p>
                )}
              </form>
            )}
          </div>
          
          <div className="text-[10px] text-slate-400 mt-2">
            Última alteração de credenciais: 26 minutos atrás • Ativado por Clerk Auth Gate.
          </div>
        </div>
      </div>

      {/* Active Clic Security Sessions */}
      <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Monitor className="w-4 h-4 text-slate-500" />
            Gerenciamento de Sessões Ativas (Segurança IAM)
          </h3>
          <span className="text-xs text-slate-500">Histórico de acessos na conta de {user.name}</span>
        </div>

        <div className="divide-y divide-slate-100">
          {activeSessions.map((session) => (
            <div key={session.id} className="flex items-center justify-between py-3 transition-colors hover:bg-slate-50 px-2 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 border border-slate-100">
                  <Monitor className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700">{session.device}</span>
                    {session.current && (
                      <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 rounded px-1.5 py-0.2 text-[9px] font-bold uppercase">
                        Sessão Atual
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 text-[10px] flex items-center gap-1 leading-none mt-1">
                    <MapPin className="w-3 h-3 text-slate-300" />
                    {session.location} • {session.date}
                  </p>
                </div>
              </div>
              
              {!session.current && (
                <button 
                  onClick={() => terminateSession(session.id)}
                  className="text-[11px] text-rose-500 hover:text-rose-700 font-semibold transition-colors border border-rose-100 hover:bg-rose-50 px-2 py-0.5 rounded"
                >
                  Derrubar Dispositivo
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
