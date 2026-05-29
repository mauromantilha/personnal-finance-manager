import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary, ErrorProvider } from './components/ErrorNotifier.tsx';
import './index.css';

// ── CSRF guard: injetar X-Requested-With em toda chamada same-origin para /api/* ──
// Browsers só permitem definir headers customizados em XHR/fetch same-origin (ou via
// CORS preflight). Bloqueia POST/PUT/PATCH/DELETE forjados por <form> cross-site.
const _origFetch = window.fetch.bind(window);
window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let url: string;
  if (typeof input === 'string') url = input;
  else if (input instanceof URL) url = input.href;
  else url = input.url;
  // só aplica a chamadas same-origin para nossa API
  if (url.startsWith('/api/') || url.startsWith(window.location.origin + '/api/')) {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has('X-Requested-With')) headers.set('X-Requested-With', 'fetch');
    return _origFetch(input, { ...init, headers });
  }
  return _origFetch(input, init);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ErrorProvider>
        <App />
      </ErrorProvider>
    </ErrorBoundary>
  </StrictMode>,
);
