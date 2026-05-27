/**
 * Sistema global de notificação de erros.
 *
 * Captura:
 *  - Erros de renderização React (ErrorBoundary)
 *  - Erros JS não tratados (window.onerror)
 *  - Rejeições de Promise não tratadas (unhandledrejection)
 *  - Respostas HTTP 5xx de qualquer fetch (interceptor)
 *
 * Uso:
 *   const { showError } = useErrorNotify();
 *   showError(); // mensagem padrão
 *   showError('Falha ao salvar transação');
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

// ── Contexto ──────────────────────────────────────────────────────────────────

interface ErrorContextValue {
  showError: (message?: string) => void;
}

const ErrorContext = createContext<ErrorContextValue>({ showError: () => {} });

export function useErrorNotify() {
  return useContext(ErrorContext);
}

// ── Toast UI ──────────────────────────────────────────────────────────────────

interface ToastState {
  id: number;
  message: string;
}

function ErrorToast({ toasts, onDismiss }: { toasts: ToastState[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-start gap-3 bg-white border border-red-200 shadow-xl rounded-xl p-4 animate-fade-in"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex-shrink-0 mt-0.5 bg-red-100 rounded-full p-1.5">
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">Ops, algo deu errado</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              {toast.message}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Nossa equipe técnica foi notificada e já está trabalhando na correção.
            </p>
          </div>
          <button
            onClick={() => onDismiss(toast.id)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors mt-0.5"
            aria-label="Fechar notificação"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────

let _toastIdCounter = 0;

export function ErrorProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const t = timersRef.current.get(id);
    if (t) { clearTimeout(t); timersRef.current.delete(id); }
  }, []);

  const showError = useCallback((message?: string) => {
    const id = ++_toastIdCounter;
    const text = message
      ?? 'Não foi possível concluir a operação. Tente novamente em instantes.';

    setToasts(prev => {
      // Evitar duplicatas consecutivas com a mesma mensagem
      if (prev.some(t => t.message === text)) return prev;
      return [...prev.slice(-2), { id, message: text }]; // máx 3 toasts
    });

    const timer = setTimeout(() => dismiss(id), 10_000);
    timersRef.current.set(id, timer);
  }, [dismiss]);

  // Capturar erros JS globais
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      // Ignorar erros de extensões de browser ou scripts externos
      if (event.filename && !event.filename.includes(location.origin)) return;
      showError();
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      // Ignorar AbortError (cancelamentos intencionais)
      if (reason?.name === 'AbortError') return;
      const msg = typeof reason?.message === 'string' ? reason.message : undefined;
      showError(msg && msg.length < 120 ? msg : undefined);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [showError]);

  // Interceptar fetch para capturar 5xx automaticamente
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status >= 500) {
        // Clonar para não consumir o body do chamador
        const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
        const path = url.replace(location.origin, '').split('?')[0];
        showError(`Erro no servidor ao acessar ${path} (${response.status}).`);
      }
      return response;
    };
    return () => { window.fetch = originalFetch; };
  }, [showError]);

  return (
    <ErrorContext.Provider value={{ showError }}>
      {children}
      <ErrorToast toasts={toasts} onDismiss={dismiss} />
    </ErrorContext.Provider>
  );
}

// ── Error Boundary ────────────────────────────────────────────────────────────

interface BoundaryProps {
  children: React.ReactNode;
}

interface BoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { hasError: true, errorMessage: error.message ?? 'Erro desconhecido' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-red-100 p-8 max-w-md w-full text-center">
          <div className="bg-red-100 rounded-full w-14 h-14 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            Ops, algo inesperado aconteceu
          </h2>
          <p className="text-sm text-gray-500 mb-1">
            Pedimos desculpas pelo inconveniente. Nosso time técnico foi notificado
            e está trabalhando na correção.
          </p>
          <p className="text-xs text-gray-400 mb-6">
            Você pode tentar recarregar a página ou voltar em alguns instantes.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Tentar novamente
            </button>
            <button
              onClick={() => location.reload()}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              Recarregar página
            </button>
          </div>
        </div>
      </div>
    );
  }
}
