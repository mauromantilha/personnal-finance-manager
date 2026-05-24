#!/usr/bin/env node
/**
 * MKS Finanças — Painel Admin (Etapa 3)
 * Porta: 3999 | PM2: mks-admin | URL: https://admin.mksbrasil.com
 *
 * Requer ~/.mks-control/admin.env com:
 *   ADMIN_PASSWORD=...
 *   CLOUDFLARE_API_TOKEN=...   (token com D1+R2+Tunnel+DNS)
 *
 * Inicie com: node admin/server.mjs
 * PM2:        pm2 start admin/server.mjs --name mks-admin
 */

import { createServer }             from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, dirname }            from 'path';
import { fileURLToPath }            from 'url';
import { randomBytes }              from 'crypto';
import { spawn }                    from 'child_process';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const CTRL        = join(process.env.HOME, '.mks-control');
const BASE_DOMAIN = 'mksbrasil.com';
const CF_ACCOUNT  = '9b61f609fee4408fd1c4344feaf9b16a';
const CF_TUNNEL   = '50e41496-a62b-452a-bd9f-d0f08c2a620d';
const PORT        = 3999;

// ── Env ───────────────────────────────────────────────────────────────────────

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8').split('\n')
      .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
  );
}

const adminEnvPath = join(CTRL, 'admin.env');
if (!existsSync(adminEnvPath)) {
  console.error(`\n❌  Faltando ${adminEnvPath}`);
  console.error('   Execute primeiro: node admin/setup.mjs\n');
  process.exit(1);
}

const ENV          = parseEnvFile(adminEnvPath);
const ADMIN_PW     = ENV.ADMIN_PASSWORD;
const CF_TOKEN     = ENV.CLOUDFLARE_API_TOKEN;

if (!ADMIN_PW) { console.error('❌  ADMIN_PASSWORD não definido em admin.env'); process.exit(1); }
if (!CF_TOKEN) { console.error('❌  CLOUDFLARE_API_TOKEN não definido em admin.env'); process.exit(1); }

// ── Session store ─────────────────────────────────────────────────────────────

const sessions = new Map();
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8h

function createSession() {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { createdAt: Date.now() });
  return token;
}

function validateSession(token) {
  if (!token) return false;
  const s = sessions.get(token);
  if (!s) return false;
  if (Date.now() - s.createdAt > SESSION_TTL) { sessions.delete(token); return false; }
  return true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCookies(req) {
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) cookies[k.trim()] = v.join('=');
  });
  return cookies;
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100_000) reject(new Error('body too large')); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function loadFamilies() {
  const p = join(CTRL, 'families.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
}

async function checkFamilyHealth(subdomain) {
  try {
    const r = await fetch(`https://${subdomain}.${BASE_DOMAIN}/api/health`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { ok: false, httpStatus: r.status };
    return await r.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── HTML (inline SPA) ─────────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MKS Finanças — Admin</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; }
  .pulse-dot { animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
  .log-box { font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.5;
    background: #0f172a; color: #94a3b8; padding: 16px; border-radius: 8px;
    max-height: 420px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; }
  .tab-active { border-bottom: 2px solid #6366f1 !important; color: #818cf8 !important; }
  .fade-in { animation: fadeIn .25s ease; }
  @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
  ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #1e293b; }
  ::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
</style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen">

<!-- LOGIN -->
<div id="login" class="flex items-center justify-center min-h-screen px-4">
  <div class="bg-slate-900 border border-slate-800 rounded-2xl p-10 w-full max-w-sm shadow-2xl">
    <div class="text-center mb-8">
      <div class="text-5xl mb-3">🏛️</div>
      <h1 class="text-xl font-bold text-white">MKS Finanças</h1>
      <p class="text-slate-400 text-sm mt-1">Painel Administrativo</p>
    </div>
    <input id="pw" type="password" placeholder="Senha do painel"
      class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500
             focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4" />
    <button onclick="doLogin()"
      class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg px-4 py-3 transition-colors">
      Entrar
    </button>
    <p id="login-err" class="text-red-400 text-sm text-center mt-3 hidden">Senha incorreta</p>
  </div>
</div>

<!-- APP -->
<div id="app" class="hidden flex flex-col min-h-screen">

  <!-- Header -->
  <header class="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
    <div class="flex items-center gap-3">
      <span class="text-2xl">🏛️</span>
      <div>
        <h1 class="font-bold text-white leading-tight">MKS Finanças Admin</h1>
        <p class="text-xs text-slate-500">admin.mksbrasil.com</p>
      </div>
    </div>
    <div class="flex items-center gap-4">
      <span id="hdr-stat" class="text-xs text-slate-400 hidden sm:block"></span>
      <button onclick="doLogout()"
        class="text-slate-400 hover:text-white text-sm transition-colors">Sair</button>
    </div>
  </header>

  <!-- Tabs -->
  <div class="bg-slate-900 border-b border-slate-800 px-6">
    <nav class="flex gap-2 -mb-px">
      <button onclick="setTab('noc')" id="tab-noc"
        class="py-3 px-2 text-sm font-medium text-slate-400 hover:text-white transition-colors border-b-2 border-transparent tab-active">
        🟢 NOC
      </button>
      <button onclick="setTab('families')" id="tab-families"
        class="py-3 px-2 text-sm font-medium text-slate-400 hover:text-white transition-colors border-b-2 border-transparent">
        👨‍👩‍👧 Famílias
      </button>
      <button onclick="setTab('provision')" id="tab-provision"
        class="py-3 px-2 text-sm font-medium text-slate-400 hover:text-white transition-colors border-b-2 border-transparent">
        ➕ Provisionar
      </button>
    </nav>
  </div>

  <!-- Content -->
  <main class="flex-1 p-6 max-w-7xl mx-auto w-full">

    <!-- NOC Pane -->
    <div id="pane-noc" class="fade-in">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-semibold text-white">Status das Famílias</h2>
        <div class="flex items-center gap-3">
          <span id="noc-last" class="text-xs text-slate-500"></span>
          <button onclick="refreshHealth()"
            class="bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm px-4 py-2 rounded-lg transition-colors">
            ↻ Atualizar
          </button>
        </div>
      </div>
      <div id="noc-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <p class="text-slate-500 text-sm">Carregando...</p>
      </div>
    </div>

    <!-- Families Pane -->
    <div id="pane-families" class="hidden fade-in">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-semibold text-white">Famílias</h2>
        <button onclick="loadFamilies()"
          class="bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm px-4 py-2 rounded-lg transition-colors">
          ↻ Recarregar
        </button>
      </div>
      <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <table class="w-full text-sm min-w-[640px]">
          <thead>
            <tr class="text-slate-400 text-xs uppercase tracking-wide border-b border-slate-800">
              <th class="text-left px-4 py-3">Família</th>
              <th class="text-left px-4 py-3">Subdomínio</th>
              <th class="text-left px-4 py-3">Porta</th>
              <th class="text-left px-4 py-3">Status</th>
              <th class="text-left px-4 py-3">Criada em</th>
              <th class="text-left px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody id="fam-tbody">
            <tr><td colspan="6" class="px-4 py-8 text-slate-500 text-center">Carregando...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Provision Pane -->
    <div id="pane-provision" class="hidden fade-in">
      <h2 class="text-lg font-semibold text-white mb-6">Provisionar Nova Família</h2>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <div class="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div class="space-y-4">
            <div>
              <label class="block text-xs text-slate-400 mb-2 uppercase tracking-wide">Nome da Família *</label>
              <input id="p-name" type="text" placeholder="Ex: Silva"
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label class="block text-xs text-slate-400 mb-2 uppercase tracking-wide">Subdomínio *</label>
              <div class="flex items-center gap-2">
                <input id="p-sub" type="text" placeholder="silva"
                  class="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <span class="text-slate-400 text-sm whitespace-nowrap">.mksbrasil.com</span>
              </div>
              <p class="text-xs text-slate-500 mt-1">Apenas letras minúsculas, números e hífen</p>
            </div>
            <div>
              <label class="block text-xs text-slate-400 mb-2 uppercase tracking-wide">E-mail do Responsável *</label>
              <input id="p-email" type="email" placeholder="responsavel@familia.com"
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div class="flex gap-3 pt-2">
              <button onclick="doProvision(false)" id="btn-prov"
                class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg px-4 py-3 transition-colors">
                🚀 Provisionar
              </button>
              <button onclick="doProvision(true)"
                class="bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg px-4 py-3 transition-colors">
                Dry-run
              </button>
            </div>
          </div>
        </div>

        <div id="prov-log-wrap" class="hidden">
          <div class="flex items-center gap-2 mb-3">
            <div id="prov-spinner" class="hidden w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <h3 class="text-sm font-medium text-slate-300">Log em tempo real</h3>
          </div>
          <div id="prov-log" class="log-box h-[380px]"></div>
        </div>

      </div>
    </div>

  </main>
</div>

<!-- Confirm Delete Modal -->
<div id="modal-del" class="hidden fixed inset-0 bg-black/75 flex items-center justify-center z-50 px-4">
  <div class="bg-slate-900 border border-slate-800 rounded-2xl p-8 w-full max-w-md shadow-2xl">
    <h3 class="text-lg font-bold text-white mb-2">⚠️ Destruir Família</h3>
    <p id="modal-desc" class="text-slate-400 text-sm mb-4">
      Esta ação é <strong class="text-red-400">irreversível</strong>: D1, R2, PM2 e todos os dados serão destruídos.<br><br>
      Digite o subdomínio para confirmar:
    </p>
    <input id="modal-inp" type="text"
      class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
      placeholder="subdomínio" />
    <div class="flex gap-3">
      <button onclick="closeDelModal()"
        class="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg py-3 transition-colors">
        Cancelar
      </button>
      <button onclick="confirmDelete()"
        class="flex-1 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg py-3 transition-colors">
        Destruir tudo
      </button>
    </div>
  </div>
</div>

<!-- Deprovision Progress Modal -->
<div id="modal-deprov" class="hidden fixed inset-0 bg-black/75 flex items-center justify-center z-50 px-4">
  <div class="bg-slate-900 border border-slate-800 rounded-2xl p-8 w-full max-w-2xl shadow-2xl">
    <div class="flex items-center justify-between mb-4">
      <h3 id="deprov-title" class="text-lg font-bold text-white">Destruindo família...</h3>
      <div id="deprov-spin" class="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
    <div id="deprov-log" class="log-box h-72"></div>
    <button onclick="closeDeprovModal()" id="deprov-close"
      class="hidden mt-4 w-full bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg py-3 transition-colors">
      Fechar
    </button>
  </div>
</div>

<script>
'use strict';

let activeTab = 'noc';
let pendingDelete = null;
let pollTimer = null;

// ── Auth ─────────────────────────────────────────────────────────────────────

async function doLogin() {
  const pw = document.getElementById('pw').value;
  const r = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw }),
  });
  if (r.ok) {
    document.getElementById('login').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    await init();
  } else {
    document.getElementById('login-err').classList.remove('hidden');
    setTimeout(() => document.getElementById('login-err').classList.add('hidden'), 3000);
  }
}

document.getElementById('pw').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

async function doLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.reload();
}

// Check existing session on load
(async () => {
  try {
    const r = await fetch('/api/auth/session');
    if (r.ok) {
      document.getElementById('login').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      await init();
    }
  } catch {}
})();

async function init() {
  await Promise.all([refreshHealth(), loadFamilies()]);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refreshHealth, 5 * 60 * 1000);
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function setTab(name) {
  ['noc', 'families', 'provision'].forEach(t => {
    document.getElementById('pane-' + t).classList.toggle('hidden', t !== name);
    const btn = document.getElementById('tab-' + t);
    btn.classList.toggle('tab-active', t === name);
  });
  activeTab = name;
}

// ── NOC ───────────────────────────────────────────────────────────────────────

async function refreshHealth() {
  const grid = document.getElementById('noc-grid');
  try {
    const r = await fetch('/api/health/all');
    const data = await r.json();
    document.getElementById('noc-last').textContent =
      'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');

    const active = data.filter(f => f.status !== 'deleted');
    if (active.length === 0) {
      grid.innerHTML = '<p class="col-span-full text-slate-500 text-sm py-12 text-center">Nenhuma família ativa. Use a aba <strong>Provisionar</strong>.</p>';
      document.getElementById('hdr-stat').textContent = '';
      return;
    }

    const onlineCount = active.filter(f => f.health?.ok).length;
    document.getElementById('hdr-stat').textContent = onlineCount + '/' + active.length + ' online';
    document.getElementById('hdr-stat').classList.remove('hidden');

    grid.innerHTML = active.map(f => {
      const h = f.health || {};
      const ok = h.ok === true;
      const statusColor = ok ? 'text-green-400' : 'text-red-400';
      const borderColor = ok ? 'border-green-900/40' : 'border-red-900/40';
      const dotColor    = ok ? 'bg-green-500' : 'bg-red-500';
      const statusText  = ok ? 'Online' : 'Offline';
      const uptime      = h.uptime != null ? fmtUptime(h.uptime) : '—';
      return \`
        <div class="bg-slate-900 border \${borderColor} rounded-xl p-5 transition-all hover:border-slate-600">
          <div class="flex items-start justify-between mb-3">
            <h3 class="font-semibold text-white">\${esc(f.name)}</h3>
            <span class="flex items-center gap-1.5 text-xs \${statusColor}">
              <span class="w-2 h-2 rounded-full \${dotColor} \${ok ? 'pulse-dot' : ''}"></span>
              \${statusText}
            </span>
          </div>
          <p class="text-xs text-slate-400 mb-1">🌐 \${esc(f.subdomain)}.mksbrasil.com</p>
          <p class="text-xs text-slate-500 mb-4">⚙️ porta \${f.port || '—'}</p>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="bg-slate-800 rounded-lg py-2">
              <div class="text-xs text-slate-500 mb-1">D1</div>
              <div>\${h.db ? '✅' : (ok === false ? '❌' : '–')}</div>
            </div>
            <div class="bg-slate-800 rounded-lg py-2">
              <div class="text-xs text-slate-500 mb-1">R2</div>
              <div>\${h.storage ? '✅' : (ok === false ? '❌' : '–')}</div>
            </div>
            <div class="bg-slate-800 rounded-lg py-2">
              <div class="text-xs text-slate-500 mb-1">Uptime</div>
              <div class="text-xs text-slate-300">\${uptime}</div>
            </div>
          </div>
        </div>
      \`;
    }).join('');
  } catch (e) {
    grid.innerHTML = '<p class="text-red-400 text-sm">' + esc(e.message) + '</p>';
  }
}

function fmtUptime(s) {
  if (s < 60)    return s + 's';
  if (s < 3600)  return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}

// ── Families ──────────────────────────────────────────────────────────────────

async function loadFamilies() {
  const tbody = document.getElementById('fam-tbody');
  try {
    const r = await fetch('/api/families');
    const data = await r.json();

    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-slate-500 text-center">Nenhuma família cadastrada.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(f => {
      const deleted  = f.status === 'deleted';
      const badge    = deleted
        ? '<span class="bg-slate-800 text-slate-500 text-xs px-2 py-1 rounded-full">Deletada</span>'
        : '<span class="bg-green-950 text-green-400 border border-green-900/50 text-xs px-2 py-1 rounded-full">Ativa</span>';
      const actions  = deleted ? '<span class="text-slate-600">—</span>' : \`
        <a href="https://\${esc(f.subdomain)}.mksbrasil.com" target="_blank" rel="noopener"
           class="text-indigo-400 hover:text-indigo-300 text-xs mr-3 transition-colors">↗ Abrir</a>
        <button onclick="startDelete('\${esc(f.subdomain)}')"
           class="text-red-400 hover:text-red-300 text-xs transition-colors">🗑 Destruir</button>
      \`;
      const created = f.createdAt ? new Date(f.createdAt).toLocaleDateString('pt-BR') : '—';
      const suffix  = f.deletedAt ? ' <span class="text-slate-600">(del. ' + new Date(f.deletedAt).toLocaleDateString('pt-BR') + ')</span>' : '';
      return \`
        <tr class="border-b border-slate-800/50 \${deleted ? 'opacity-40' : 'hover:bg-slate-900/50'} transition-colors">
          <td class="px-4 py-3 font-medium">\${esc(f.name)}</td>
          <td class="px-4 py-3 text-slate-400">\${esc(f.subdomain)}\${suffix}</td>
          <td class="px-4 py-3 text-slate-500">\${f.port || '—'}</td>
          <td class="px-4 py-3">\${badge}</td>
          <td class="px-4 py-3 text-slate-500">\${created}</td>
          <td class="px-4 py-3">\${actions}</td>
        </tr>
      \`;
    }).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-4 text-red-400">' + esc(e.message) + '</td></tr>';
  }
}

// ── Provision ─────────────────────────────────────────────────────────────────

async function doProvision(dryRun) {
  const name  = document.getElementById('p-name').value.trim();
  const sub   = document.getElementById('p-sub').value.trim().toLowerCase();
  const email = document.getElementById('p-email').value.trim();

  if (!name || !sub || !email) { alert('Preencha todos os campos.'); return; }
  if (!/^[a-z0-9-]+$/.test(sub)) { alert('Subdomínio: apenas letras minúsculas, números e hífen.'); return; }

  const logWrap = document.getElementById('prov-log-wrap');
  const logEl   = document.getElementById('prov-log');
  const spinner = document.getElementById('prov-spinner');
  const btn     = document.getElementById('btn-prov');

  logWrap.classList.remove('hidden');
  logEl.textContent = dryRun ? '[DRY-RUN] Simulando provisionamento...\\n\\n' : '';
  spinner.classList.remove('hidden');
  btn.disabled = true;
  btn.textContent = '⏳ Provisionando...';

  try {
    const r = await fetch('/api/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, subdomain: sub, email, dryRun }),
    });

    const reader = r.body.getReader();
    const dec    = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      logEl.textContent += dec.decode(value);
      logEl.scrollTop = logEl.scrollHeight;
    }
    if (!dryRun) await Promise.all([loadFamilies(), refreshHealth()]);
  } catch (e) {
    logEl.textContent += '\\n❌ Erro: ' + e.message;
  } finally {
    spinner.classList.add('hidden');
    btn.disabled = false;
    btn.textContent = '🚀 Provisionar';
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

function startDelete(subdomain) {
  pendingDelete = subdomain;
  document.getElementById('modal-inp').value = '';
  document.getElementById('modal-del').classList.remove('hidden');
  setTimeout(() => document.getElementById('modal-inp').focus(), 80);
}

function closeDelModal() {
  pendingDelete = null;
  document.getElementById('modal-del').classList.add('hidden');
}

async function confirmDelete() {
  const typed = document.getElementById('modal-inp').value.trim();
  if (typed !== pendingDelete) {
    document.getElementById('modal-inp').classList.add('ring-2', 'ring-red-500');
    setTimeout(() => document.getElementById('modal-inp').classList.remove('ring-2', 'ring-red-500'), 1200);
    return;
  }

  const sub = pendingDelete;
  closeDelModal();

  document.getElementById('deprov-title').textContent = 'Destruindo ' + sub + '...';
  document.getElementById('deprov-log').textContent = '';
  document.getElementById('deprov-spin').classList.remove('hidden');
  document.getElementById('deprov-close').classList.add('hidden');
  document.getElementById('modal-deprov').classList.remove('hidden');

  try {
    const r = await fetch('/api/families/' + sub, { method: 'DELETE' });
    const reader = r.body.getReader();
    const dec    = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      document.getElementById('deprov-log').textContent += dec.decode(value);
      document.getElementById('deprov-log').scrollTop = document.getElementById('deprov-log').scrollHeight;
    }
    document.getElementById('deprov-title').textContent = 'Família ' + sub + ' destruída';
    await Promise.all([loadFamilies(), refreshHealth()]);
  } catch (e) {
    document.getElementById('deprov-log').textContent += '\\n❌ Erro: ' + e.message;
  } finally {
    document.getElementById('deprov-spin').classList.add('hidden');
    document.getElementById('deprov-close').classList.remove('hidden');
  }
}

function closeDeprovModal() {
  document.getElementById('modal-deprov').classList.add('hidden');
}

// Close modal on backdrop click
document.getElementById('modal-del').addEventListener('click', e => { if (e.target === e.currentTarget) closeDelModal(); });
document.getElementById('modal-deprov').addEventListener('click', e => { if (e.target === e.currentTarget) closeDeprovModal(); });

// ── Utils ─────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
</script>
</body>
</html>`;

// ── HTTP Server ───────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url     = new URL(req.url, `http://localhost`);
  const path    = url.pathname;
  const cookies = parseCookies(req);
  const authed  = validateSession(cookies['mks-admin']);

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  // ── Public: HTML ──────────────────────────────────────────────────────────
  if (path === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(HTML);
  }

  // ── Auth endpoints (public) ───────────────────────────────────────────────
  if (path === '/api/auth/login' && req.method === 'POST') {
    const body = await readBody(req);
    if (body.password && body.password === ADMIN_PW) {
      const token = createSession();
      res.setHeader('Set-Cookie', `mks-admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Unauthorized' }));
  }

  if (path === '/api/auth/logout' && req.method === 'POST') {
    sessions.delete(cookies['mks-admin']);
    res.setHeader('Set-Cookie', 'mks-admin=; Path=/; Max-Age=0');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (path === '/api/auth/session' && req.method === 'GET') {
    res.writeHead(authed ? 200 : 401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: authed }));
  }

  // ── Require auth ──────────────────────────────────────────────────────────
  if (!authed) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Not authenticated' }));
  }

  // ── GET /api/families ─────────────────────────────────────────────────────
  if (path === '/api/families' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(loadFamilies()));
  }

  // ── GET /api/health/all ───────────────────────────────────────────────────
  if (path === '/api/health/all' && req.method === 'GET') {
    const all     = loadFamilies();
    const active  = all.filter(f => f.status !== 'deleted');
    const deleted = all.filter(f => f.status === 'deleted');

    const results = await Promise.all(
      active.map(async f => ({ ...f, health: await checkFamilyHealth(f.subdomain) }))
    );

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify([...results, ...deleted]));
  }

  // ── POST /api/provision (streaming stdout) ────────────────────────────────
  if (path === '/api/provision' && req.method === 'POST') {
    const body = await readBody(req);
    const { name, subdomain, email, dryRun } = body;

    if (!name || !subdomain || !email) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'name, subdomain, email required' }));
    }

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    });

    const args = [
      'scripts/provision.mjs',
      '--name', name,
      '--subdomain', subdomain,
      '--email', email,
    ];
    if (dryRun) args.push('--dry-run');

    const proc = spawn('node', args, {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
    });

    proc.stdout.on('data', d => res.write(d));
    proc.stderr.on('data', d => res.write(d));
    proc.on('close', code => {
      res.write(`\n━━━ Processo encerrado (código ${code}) ━━━\n`);
      res.end();
    });
    return;
  }

  // ── DELETE /api/families/:subdomain (streaming stdout) ────────────────────
  const delMatch = path.match(/^\/api\/families\/([a-z0-9-]{1,40})$/);
  if (delMatch && req.method === 'DELETE') {
    const subdomain = delMatch[1];

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    });

    const proc = spawn('node', [
      'scripts/deprovision.mjs',
      '--subdomain', subdomain,
      '--force',
    ], {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
    });

    proc.stdout.on('data', d => res.write(d));
    proc.stderr.on('data', d => res.write(d));
    proc.on('close', code => {
      res.write(`\n━━━ Processo encerrado (código ${code}) ━━━\n`);
      res.end();
    });
    return;
  }

  // ── 404 ───────────────────────────────────────────────────────────────────
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🏛️  MKS Finanças — Painel Admin');
  console.log(`  http://localhost:${PORT}`);
  console.log(`  https://admin.${BASE_DOMAIN}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});
