import { useState } from 'react';
import { HardDrive, ArrowUpCircle, X, CheckCircle, AlertTriangle } from 'lucide-react';

interface StorageQuotaModalProps {
  usedFormatted:        string;
  limitFormatted:       string;
  percentage:           number;
  upgradePrice:         number;
  upgradeLimitBytes:    number;
  onClose:              () => void;
}

export function StorageQuotaModal({
  usedFormatted, limitFormatted, percentage, upgradePrice, upgradeLimitBytes, onClose,
}: StorageQuotaModalProps) {
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [msg, setMsg]           = useState('');
  const [error, setError]       = useState('');

  const upgradeLimitFormatted = upgradeLimitBytes >= 1_073_741_824
    ? `${(upgradeLimitBytes / 1_073_741_824).toFixed(0)} GB`
    : `${(upgradeLimitBytes / (1024 * 1024)).toFixed(0)} MB`;

  async function handleUpgrade() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/storage/upgrade', { method: 'POST' });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (res.ok && data.ok) {
        setDone(true);
        setMsg(data.message ?? 'Solicitação enviada! Entraremos em contato em breve.');
      } else {
        setError(data.error ?? data.message ?? 'Erro ao enviar solicitação.');
      }
    } catch {
      setError('Falha de rede. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const barColor = percentage >= 90 ? 'bg-red-500' : percentage >= 70 ? 'bg-amber-500' : 'bg-indigo-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {done ? (
          <div className="text-center py-4">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-800 mb-2">Solicitação enviada!</h3>
            <p className="text-sm text-slate-500 leading-relaxed">{msg}</p>
            <button
              onClick={onClose}
              className="mt-5 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Fechar
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <HardDrive className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 leading-tight">Armazenamento esgotado</h3>
                <p className="text-xs text-slate-500">Limite do plano gratuito atingido</p>
              </div>
            </div>

            {/* Barra de uso */}
            <div className="mb-5">
              <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                <span>Uso atual: <strong className="text-slate-700">{usedFormatted}</strong></span>
                <span>Limite: <strong className="text-slate-700">{limitFormatted}</strong></span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${Math.min(100, percentage)}%` }}
                />
              </div>
              <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {percentage.toFixed(0)}% utilizado — novos uploads bloqueados
              </p>
            </div>

            {/* Oferta de upgrade */}
            <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 p-4 mb-5">
              <div className="flex items-center gap-2 mb-2">
                <ArrowUpCircle className="w-5 h-5 text-indigo-600" />
                <span className="text-sm font-bold text-indigo-800">Upgrade para {upgradeLimitFormatted}</span>
              </div>
              <ul className="text-xs text-indigo-700 space-y-1 mb-3">
                <li>✓ {upgradeLimitFormatted} de armazenamento</li>
                <li>✓ Documentos, extratos e backups ilimitados</li>
                <li>✓ Ativação em até 24 horas</li>
              </ul>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-indigo-700">
                  R$ {upgradePrice.toFixed(2).replace('.', ',')}
                </span>
                <span className="text-xs text-indigo-500">/mês</span>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600 mb-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
              >
                Agora não
              </button>
              <button
                onClick={handleUpgrade}
                disabled={loading}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <ArrowUpCircle className="w-4 h-4" />
                )}
                {loading ? 'Enviando…' : `Fazer upgrade`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
