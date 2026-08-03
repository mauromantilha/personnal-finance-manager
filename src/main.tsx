import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary, ErrorProvider } from './components/ErrorNotifier.tsx';
import './index.css';

// ── CSRF guard + recuperação de sessão Cloudflare Access ─────────────────────
// Browsers só permitem definir headers customizados em XHR/fetch same-origin (ou via
// CORS preflight). Bloqueia POST/PUT/PATCH/DELETE forjados por <form> cross-site.
//
// Se a sessão Access expirou, o edge devolve 302 → *.cloudflareaccess.com.
// Com redirect:follow o browser tenta o hop cross-origin e a CSP (ou CORS) quebra
// com "Failed to fetch". Usamos redirect:manual e forçamos navegação completa
// para o login OTP — senão criar conta / API parece "morta".
const _origFetch = window.fetch.bind(window);
window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let url: string;
  if (typeof input === 'string') url = input;
  else if (input instanceof URL) url = input.href;
  else url = input.url;

  const isApi = url.startsWith('/api/') || url.startsWith(window.location.origin + '/api/');
  if (!isApi) return _origFetch(input, init);

  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (!headers.has('X-Requested-With')) headers.set('X-Requested-With', 'fetch');

  return _origFetch(input, { ...init, headers, redirect: 'manual' }).then((res) => {
    // 302/303/307 do Access (Location aponta para cloudflareaccess.com)
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('Location') ?? '';
      if (loc.includes('cloudflareaccess.com') || loc.includes('/cdn-cgi/access/')) {
        window.location.assign(loc.startsWith('http') ? loc : new URL(loc, window.location.origin).href);
        return new Promise<Response>(() => { /* navega embora */ });
      }
    }
    // Alguns setups devolvem a página de login Access como 200 HTML
    const ct = res.headers.get('content-type') ?? '';
    if (res.ok && ct.includes('text/html')) {
      window.location.reload();
      return new Promise<Response>(() => { /* recarrega */ });
    }
    return res;
  });
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
