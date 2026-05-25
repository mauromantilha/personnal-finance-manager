import React, { useState } from 'react';
import { Shield, ExternalLink, CheckCircle2 } from 'lucide-react';

interface Props {
  onAccept: () => void;
}

export function LGPDModal({ onAccept }: Props) {
  const [checked, setChecked]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  async function handleAccept() {
    if (!checked || loading) return;
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/lgpd/aceite', { method: 'POST' });
      if (!r.ok) throw new Error('Erro ao registrar aceite.');
      onAccept();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800 shrink-0">
          <div className="w-10 h-10 bg-indigo-600/20 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="font-bold text-white text-lg">Política de Privacidade — LGPD</h2>
            <p className="text-xs text-slate-400">MKS Brasil · Versão 1.0 · Vigente desde 29/03/2026</p>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-5 space-y-4 text-sm text-slate-300 leading-relaxed">

          <p>
            A <strong className="text-white">MKS Brasil Software e Gestão Empresarial Ltda</strong> (CNPJ 64.293.212/0001-97)
            é a <strong className="text-white">controladora</strong> dos dados pessoais tratados na plataforma MKS Finanças,
            nos termos da Lei nº 13.709/2018 — LGPD.
          </p>

          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Dados que coletamos</p>
            <p>Coletamos apenas os dados necessários para operar a plataforma: identificação de acesso
              (e-mail em formato hash), logs técnicos e os dados financeiros que você mesmo insere.
              <strong className="text-white"> Não acessamos o conteúdo financeiro da sua instância.</strong>
            </p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Bases legais (Art. 7 LGPD)</p>
            <ul className="list-disc list-inside space-y-1 text-slate-300">
              <li>Execução de contrato — operação da plataforma</li>
              <li>Cumprimento de obrigação legal ou regulatória</li>
              <li>Legítimo interesse — segurança e auditoria</li>
              <li>Consentimento — comunicações opcionais</li>
            </ul>
          </div>

          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Seus direitos (Art. 18 LGPD)</p>
            <p>
              Você pode a qualquer momento solicitar: <strong className="text-white">acesso, correção, anonimização,
              bloqueio, eliminação, portabilidade</strong> e revogação de consentimento.
              Escreva para{' '}
              <a href="mailto:privacidade@mksbrasil.com"
                className="text-indigo-400 hover:text-indigo-300 transition-colors">
                privacidade@mksbrasil.com
              </a>{' '}
              (prazo de resposta: até 15 dias corridos).
            </p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Retenção e segurança</p>
            <p>
              Dados mantidos enquanto a conta estiver ativa, acrescidos do prazo legal após encerramento.
              Utilizamos criptografia em trânsito e em repouso, controle de acesso por perfil, autenticação
              multifator e trilhas de auditoria. Ao encerrar o acesso, aplicamos descarte seguro e exclusão lógica.
            </p>
          </div>

          <p className="text-xs text-slate-500">
            Ao clicar em <strong className="text-slate-400">"Aceitar e Continuar"</strong> você confirma que leu e concorda
            com esta política. O aceite é registrado com data, hora e IP de acesso como prova de conformidade LGPD.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-slate-800 shrink-0 space-y-4">

          <a href="https://www.mksbrasil.com/politica-de-privacidade"
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
            Ver política completa em mksbrasil.com
          </a>

          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative mt-0.5 shrink-0">
              <input
                type="checkbox"
                checked={checked}
                onChange={e => setChecked(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                ${checked
                  ? 'bg-indigo-600 border-indigo-600'
                  : 'bg-slate-800 border-slate-600 group-hover:border-indigo-500'}`}>
                {checked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
              </div>
            </div>
            <span className="text-sm text-slate-300 leading-snug">
              Li e concordo com a{' '}
              <strong className="text-white">Política de Privacidade e Proteção de Dados</strong>{' '}
              da MKS Brasil (versão 1.0, vigente desde 29/03/2026).
            </span>
          </label>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            onClick={handleAccept}
            disabled={!checked || loading}
            className={`w-full py-3 rounded-xl font-semibold text-sm transition-all
              ${checked && !loading
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer'
                : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
          >
            {loading ? 'Registrando...' : 'Aceitar e Continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}
