/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Lock, Eye, EyeOff, Smartphone, ArrowLeft } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (email: string, password: string, totpCode?: string) => Promise<{ ok: boolean; requiresTOTP?: boolean; error?: string }>;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [requiresTOTP, setRequiresTOTP] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    const result = await onLogin(email, password, requiresTOTP ? totpCode : undefined);
    setIsLoading(false);
    if (result.requiresTOTP) {
      setRequiresTOTP(true);
    } else if (!result.ok) {
      setError(result.error || 'Credenciais inválidas. Tente novamente.');
    }
  };

  const handleBack = () => {
    setRequiresTOTP(false);
    setTotpCode('');
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6">
        <div className="flex flex-col items-center gap-3">
          <span className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-xl font-bold shadow-sm">
            M
          </span>
          <div className="text-center">
            <h1 className="font-black text-sm tracking-widest text-indigo-600 uppercase">Finanças Livre</h1>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">
              {requiresTOTP ? 'Verificação 2FA' : 'Acesso Seguro'}
            </p>
          </div>
        </div>

        {requiresTOTP ? (
          /* ── TOTP step ── */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-start gap-2 bg-indigo-50 border border-indigo-100 rounded-xl p-3">
              <Smartphone className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <p className="text-xs text-indigo-700">
                Abra seu aplicativo autenticador (Google Authenticator, Authy) e insira o código de 6 dígitos.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Código 2FA
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                autoFocus
                className="w-full text-center text-2xl font-mono tracking-[0.5em] py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}

            <button
              type="submit"
              disabled={totpCode.length !== 6 || isLoading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50"
            >
              {isLoading ? 'Verificando...' : 'Verificar'}
            </button>

            <button
              type="button"
              onClick={handleBack}
              className="w-full flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-700 font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao login
            </button>
          </form>
        ) : (
          /* ── Login step ── */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email — optional (blank = admin login) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Email <span className="font-normal text-slate-400">(deixe vazio para admin)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@email.com"
                autoFocus
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <Lock className="w-4 h-4 text-slate-400" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  className="w-full pl-9 pr-10 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}

            <button
              type="submit"
              disabled={!password || isLoading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50"
            >
              {isLoading ? 'Autenticando...' : 'Entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
