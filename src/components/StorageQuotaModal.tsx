import { useState, useEffect, useRef } from 'react';
import { HardDrive, ArrowUpCircle, X, CheckCircle, AlertTriangle, Copy, Check, QrCode, RefreshCw } from 'lucide-react';

interface StorageQuotaModalProps {
  usedFormatted:        string;
  limitFormatted:       string;
  percentage:           number;
  upgradePrice:         number;
  upgradeLimitBytes:    number;
  onClose:              () => void;
}

interface PixData {
  paymentId:    string;
  encodedImage: string;
  payload:      string;
  expirationDate?: string;
}

export function StorageQuotaModal({
  usedFormatted, limitFormatted, percentage, upgradePrice, upgradeLimitBytes, onClose,
}: StorageQuotaModalProps) {
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [msg, setMsg]           = useState('');
  const [error, setError]       = useState('');
  const [pixData, setPixData]   = useState<PixData | null>(null);
  const [copied, setCopied]     = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const pollTimerRef            = useRef<any>(null);

  const upgradeLimitFormatted = upgradeLimitBytes >= 1_073_741_824
    ? `${(upgradeLimitBytes / 1_073_741_824).toFixed(0)} GB`
    : `${(upgradeLimitBytes / (1024 * 1024)).toFixed(0)} MB`;

  // Limpa o timer de polling ao desmontar
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  async function handleCheckout() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/storage/checkout', { method: 'POST' });
      const data = await res.json() as any;

      if (res.ok && data.success && data.encodedImage && data.payload) {
        setPixData({
          paymentId: data.paymentId,
          encodedImage: data.encodedImage,
          payload: data.payload,
          expirationDate: data.expirationDate,
        });
        startPaymentPolling(data.paymentId);
      } else if (res.ok && data.fallback) {
        // Fallback quando Asaas API key não estiver configurada no tenant
        setDone(true);
        setMsg(data.message ?? 'Solicitação de upgrade registrada! Entraremos em contato.');
      } else {
        setError(data.error ?? data.message ?? 'Erro ao gerar cobrança PIX.');
      }
    } catch {
      setError('Falha de conexão com o servidor. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  function startPaymentPolling(paymentId: string) {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    pollTimerRef.current = setInterval(async () => {
      try {
        setCheckingPayment(true);
        const res = await fetch(`/api/storage/check-payment/${paymentId}`);
        const check = await res.json() as any;
        if (res.ok && (check.status === 'RECEIVED' || check.status === 'CONFIRMED' || check.active)) {
          clearInterval(pollTimerRef.current);
          setDone(true);
          setMsg('Pagamento via PIX confirmado! Seu armazenamento adicional de +1 GB foi ativado com sucesso.');
        }
      } catch {
        // Silêncio em falha de polling pontual
      } finally {
        setCheckingPayment(false);
      }
    }, 4000);
  }

  async function handleCopyPix() {
    if (!pixData?.payload) return;
    try {
      await navigator.clipboard.writeText(pixData.payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback manual
    }
  }

  const barColor = percentage >= 90 ? 'bg-red-500' : percentage >= 70 ? 'bg-amber-500' : 'bg-indigo-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {done ? (
          <div className="text-center py-4">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-800 mb-2">Armazenamento Liberado!</h3>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">{msg}</p>
            <button
              onClick={() => { onClose(); window.location.reload(); }}
              className="mt-3 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
            >
              Continuar
            </button>
          </div>
        ) : pixData ? (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                <QrCode className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 leading-tight">Pagar via PIX</h3>
                <p className="text-xs text-slate-500">Ativação instantânea de +1 GB</p>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center bg-slate-50 rounded-xl p-4 border border-slate-200 mb-4">
              {pixData.encodedImage ? (
                <img
                  src={`data:image/png;base64,${pixData.encodedImage}`}
                  alt="QR Code PIX"
                  className="w-48 h-48 rounded-lg shadow-sm bg-white p-2 border border-slate-200"
                />
              ) : null}

              <div className="flex items-center gap-2 mt-3 text-xs text-slate-500">
                <RefreshCw className={`w-3.5 h-3.5 text-violet-600 ${checkingPayment ? 'animate-spin' : ''}`} />
                <span>Aguardando confirmação do pagamento...</span>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">PIX Copia e Cola:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={pixData.payload}
                  className="w-full text-xs font-mono bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 select-all"
                />
                <button
                  onClick={handleCopyPix}
                  className="px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg shrink-0 flex items-center gap-1.5 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 leading-relaxed mb-4">
              💡 Abra o app do seu banco, escolha <strong>PIX &gt; Pagar com QR Code</strong> ou <strong>Copia e Cola</strong> e conclua a transferência. Seu espaço será liberado automaticamente.
            </div>

            <button
              onClick={onClose}
              className="w-full py-2 text-slate-500 hover:text-slate-700 text-xs font-medium transition-colors"
            >
              Fechar e pagar mais tarde
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
                <li>✓ +1 GB (1.024 MB) de armazenamento extra</li>
                <li>✓ Liberação de extratos bancários, faturas e OCR por IA</li>
                <li>✓ Ativação imediata via PIX automático</li>
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
                onClick={handleCheckout}
                disabled={loading}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                {loading ? (
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <QrCode className="w-4 h-4" />
                )}
                {loading ? 'Gerando PIX…' : `Pagar com PIX`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
