import { useState } from 'react';
import { ShieldCheck, Lock, AlertCircle, Check, X } from 'lucide-react';

export const AI_DISCLAIMER_TEXT =
  'Ao enviar este extrato ou documento, você declara estar ciente e consente expressamente que as informações financeiras e imagens sejam processadas por inteligência artificial exclusivamente para extração e categorização de dados. Você reconhece que dados confidenciais (como CPF, números de cartão e contas) são automaticamente mascarados e isenta a MKS Brasil de quaisquer responsabilidades decorrentes do processamento automatizado, nos termos da LGPD e dos Termos de Uso.';

interface AIDocumentConsentModalProps {
  isOpen: boolean;
  documentType: 'INVOICE' | 'BILL' | 'INVESTMENT_STATEMENT' | 'GENERAL';
  onConsent: () => void;
  onCancel: () => void;
}

const CONSENT_STORAGE_KEY = 'mks_ai_doc_consent_v1';

export function hasSavedConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveConsentChoice(remember: boolean): void {
  try {
    if (remember) {
      localStorage.setItem(CONSENT_STORAGE_KEY, 'true');
    }
  } catch {
    // ignorar falhas de storage local
  }
}

export async function logConsentToServer(documentType: string): Promise<void> {
  try {
    await fetch('/api/consents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consentType: 'AI_DOCUMENT_ANALYSIS',
        documentType,
        disclaimerVersion: '1.0',
        disclaimerText: AI_DISCLAIMER_TEXT,
      }),
    });
  } catch (err) {
    console.warn('[Consent Log] Falha ao registrar log no servidor:', err);
  }
}

export default function AIDocumentConsentModal({
  isOpen,
  documentType,
  onConsent,
  onCancel,
}: AIDocumentConsentModalProps) {
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setLoading(true);
    saveConsentChoice(remember);
    await logConsentToServer(documentType);
    setLoading(false);
    onConsent();
  };

  const docLabel =
    documentType === 'INVOICE'
      ? 'fatura de cartão de crédito'
      : documentType === 'INVESTMENT_STATEMENT'
      ? 'extrato de investimentos'
      : 'documento financeiro';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 animate-scaleUp">
        {/* Top Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-700 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm">
              <ShieldCheck className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Consentimento para Leitura com IA</h3>
              <p className="text-xs text-indigo-100 mt-0.5">Segurança jurídica, LGPD e proteção de dados</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="p-1 text-white/70 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Você está prestes a enviar uma <strong>{docLabel}</strong> para leitura automatizada por
            inteligência artificial de alta precisão (Groq Scout / Llama Vision).
          </p>

          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-2">
            <div className="flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-[11px] text-amber-900 leading-relaxed font-medium">
                <strong>Privacidade Automática:</strong> Nosso sistema mascara ativamente números de CPF,
                números completos de cartão de crédito (PAN), CVVs e dados de agência/conta antes do
                processamento.
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-slate-600 text-[11px] leading-relaxed max-h-32 overflow-y-auto">
            <p className="font-semibold text-slate-800 mb-1">Declaração de Consentimento e Isenção:</p>
            {AI_DISCLAIMER_TEXT}
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-4 h-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs text-slate-600 select-none">
              Lembrar meu consentimento neste navegador para futuros envios
            </span>
          </label>
        </div>

        {/* Footer Buttons */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
          >
            {loading ? (
              'Registrando consentimento…'
            ) : (
              <>
                <Check className="w-4 h-4" />
                Consentir e Processar com IA
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
