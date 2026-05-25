#!/usr/bin/env node
/**
 * MKS Finanças — Painel Admin (Etapa 3 + 4)
 * Porta: 3999 | PM2: mks-admin | URL: https://admin.mksbrasil.com
 *
 * Requer ~/.mks-control/admin.env com:
 *   ADMIN_PASSWORD=...
 *   CLOUDFLARE_API_TOKEN=...   (token com D1+R2+Tunnel+DNS)
 *   RESEND_API_KEY=...         (para proxy de e-mail)
 *
 * Inicie com: node admin/server.mjs
 * PM2:        pm2 start admin/server.mjs --name mks-admin
 */

import { createServer }                        from 'http';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname }                       from 'path';
import { fileURLToPath }                       from 'url';
import { randomBytes }                         from 'crypto';
import { spawn, execSync }                      from 'child_process';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const CTRL         = join(process.env.HOME, '.mks-control');
const BASE_DOMAIN  = 'mksbrasil.com';
const PORT         = 3999;

const QUOTA_PATH    = join(CTRL, 'email-quota.json');
const FAMILY_QUOTA  = 200;   // emails/mês por família
const TOTAL_QUOTA   = 2000;  // emails/mês global

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

function saveFamilies(list) {
  writeFileSync(join(CTRL, 'families.json'), JSON.stringify(list, null, 2));
}

// ── Email quota ───────────────────────────────────────────────────────────────

function currentMonth() { return new Date().toISOString().slice(0, 7); }

function loadQuota() {
  if (!existsSync(QUOTA_PATH)) return { month: currentMonth(), total: 0, families: {} };
  const q = JSON.parse(readFileSync(QUOTA_PATH, 'utf8'));
  if (q.month !== currentMonth()) return { month: currentMonth(), total: 0, families: {} };
  return q;
}

function saveQuota(q) { writeFileSync(QUOTA_PATH, JSON.stringify(q, null, 2)); }

function trackEmailSent(subdomain) {
  const q = loadQuota();
  q.total = (q.total || 0) + 1;
  if (!q.families[subdomain]) q.families[subdomain] = { count: 0, lastSent: null };
  q.families[subdomain].count++;
  q.families[subdomain].lastSent = new Date().toISOString();
  saveQuota(q);
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
      <button onclick="setTab('emails')" id="tab-emails"
        class="py-3 px-2 text-sm font-medium text-slate-400 hover:text-white transition-colors border-b-2 border-transparent">
        📧 E-mails
      </button>
      <button onclick="setTab('lgpd')" id="tab-lgpd"
        class="py-3 px-2 text-sm font-medium text-slate-400 hover:text-white transition-colors border-b-2 border-transparent">
        ⚖️ LGPD
      </button>
      <button onclick="setTab('migrations')" id="tab-migrations"
        class="py-3 px-2 text-sm font-medium text-slate-400 hover:text-white transition-colors border-b-2 border-transparent">
        🔧 Migrações
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

    <!-- Emails Pane -->
    <div id="pane-emails" class="hidden fade-in">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-semibold text-white">Monitoramento de E-mails</h2>
        <button onclick="loadEmailQuota()"
          class="bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm px-4 py-2 rounded-lg transition-colors">
          ↻ Atualizar
        </button>
      </div>

      <!-- Quota global -->
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-medium text-white">Cota Global</h3>
          <span id="eq-month" class="text-xs text-slate-500"></span>
        </div>
        <div class="flex items-center justify-between text-sm mb-2">
          <span class="text-slate-400">Enviados este mês</span>
          <span id="eq-total-txt" class="font-semibold text-white">—</span>
        </div>
        <div class="w-full bg-slate-800 rounded-full h-3 mb-1">
          <div id="eq-total-bar" class="h-3 rounded-full transition-all duration-500 bg-indigo-500" style="width:0%"></div>
        </div>
        <p class="text-xs text-slate-500 text-right">Limite: 2 000 e-mails/mês</p>
      </div>

      <!-- Por família -->
      <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <table class="w-full text-sm min-w-[540px]">
          <thead>
            <tr class="text-slate-400 text-xs uppercase tracking-wide border-b border-slate-800">
              <th class="text-left px-4 py-3">Família</th>
              <th class="text-left px-4 py-3">Enviados</th>
              <th class="text-left px-4 py-3 w-48">Uso</th>
              <th class="text-left px-4 py-3">Último envio</th>
            </tr>
          </thead>
          <tbody id="eq-tbody">
            <tr><td colspan="4" class="px-4 py-8 text-slate-500 text-center">Carregando...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- API info -->
      <div class="mt-6 bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 class="font-medium text-white mb-3">Endpoint para instâncias familiares</h3>
        <div class="log-box text-xs leading-relaxed">POST https://admin.mksbrasil.com/api/email/send
Authorization: Bearer {FAMILY_TOKEN}
Content-Type: application/json

{
  "to": "usuario@email.com",
  "subject": "Assunto",
  "html": "&lt;p&gt;Corpo do e-mail&lt;/p&gt;"
}

// Resposta de sucesso:
{ "ok": true, "messageId": "...", "quota": { "familyUsed": 5, "familyLimit": 200, ... } }

// Erros:
{ "ok": false, "error": "quota_exceeded" }       // 429 — limite da família (200/mês)
{ "ok": false, "error": "total_quota_exceeded" }  // 429 — limite global (2000/mês)</div>
      </div>
    </div>

    <!-- LGPD Pane -->
    <div id="pane-lgpd" class="hidden fade-in">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-lg font-semibold text-white">Registro de Aceite LGPD</h2>
          <p class="text-xs text-slate-500 mt-1">Lei nº 13.709/2018 — Política v1.0 · MKS Brasil CNPJ 64.293.212/0001-97</p>
        </div>
        <button onclick="loadLGPD()"
          class="bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm px-4 py-2 rounded-lg transition-colors">
          ↻ Atualizar
        </button>
      </div>

      <!-- Resumo -->
      <div id="lgpd-summary" class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6"></div>

      <!-- Tabela -->
      <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto mb-6">
        <table class="w-full text-sm min-w-[600px]">
          <thead>
            <tr class="text-slate-400 text-xs uppercase tracking-wide border-b border-slate-800">
              <th class="text-left px-4 py-3">Família</th>
              <th class="text-left px-4 py-3">Subdomínio</th>
              <th class="text-left px-4 py-3">Status</th>
              <th class="text-left px-4 py-3">Versão</th>
              <th class="text-left px-4 py-3">Data do Aceite</th>
              <th class="text-left px-4 py-3">Instância</th>
            </tr>
          </thead>
          <tbody id="lgpd-tbody">
            <tr><td colspan="6" class="px-4 py-8 text-slate-500 text-center">Carregando...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Nota legal -->
      <div class="bg-slate-900 border border-slate-700 rounded-xl p-5 text-xs text-slate-400 leading-relaxed space-y-2">
        <p class="font-semibold text-slate-300">⚖️ Nota de Conformidade LGPD</p>
        <p>
          O aceite é registrado diretamente no banco D1 de cada família com <strong class="text-slate-300">timestamp, IP de acesso
          e user-agent</strong> — evidência auditável exigida pelo Art. 8 § 1º da LGPD como prova de que o consentimento
          foi dado de forma livre, informada e inequívoca.
        </p>
        <p>
          O painel admin <strong class="text-slate-300">não acessa dados financeiros</strong> das famílias — consulta apenas
          o endpoint público <code class="text-indigo-400">/api/lgpd/status</code> de cada instância.
        </p>
        <p>
          DPO / Encarregado: <a href="mailto:privacidade@mksbrasil.com" class="text-indigo-400 hover:text-indigo-300">privacidade@mksbrasil.com</a>
          · Prazo de resposta: até 15 dias corridos.
        </p>
      </div>
    </div>

    <!-- Migrations Pane -->
    <div id="pane-migrations" class="hidden fade-in">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-lg font-semibold text-white">Migrações de Schema</h2>
          <p class="text-xs text-slate-500 mt-1">Aplica migrations pendentes em todas as instâncias familiares ativas</p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <!-- Lista de migrations -->
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 class="font-medium text-white mb-4">Arquivos no repositório</h3>
          <ul id="mig-list" class="space-y-1.5 text-sm">
            <li class="text-slate-500">Carregando...</li>
          </ul>
        </div>

        <!-- Runner -->
        <div class="space-y-4">
          <div class="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 class="font-medium text-white mb-4">Aplicar migrações pendentes</h3>
            <div class="space-y-3">
              <div>
                <label class="block text-xs text-slate-400 mb-2 uppercase tracking-wide">Escopo</label>
                <select id="mig-scope"
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Todas as famílias ativas</option>
                  <option value="__loading__" disabled>── carregando famílias ──</option>
                </select>
              </div>
              <div class="flex gap-3">
                <button onclick="runMigrations(false)" id="btn-mig"
                  class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg px-4 py-3 text-sm transition-colors">
                  🔧 Aplicar agora
                </button>
                <button onclick="runMigrations(true)"
                  class="bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg px-4 py-3 text-sm transition-colors">
                  Dry-run
                </button>
              </div>
            </div>
          </div>

          <div id="mig-log-wrap" class="hidden">
            <div class="flex items-center gap-2 mb-2">
              <div id="mig-spinner" class="hidden w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <h3 class="text-sm font-medium text-slate-300">Saída do runner</h3>
            </div>
            <div id="mig-log" class="log-box h-72"></div>
          </div>
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
  ['noc', 'families', 'provision', 'emails', 'lgpd', 'migrations'].forEach(t => {
    document.getElementById('pane-' + t).classList.toggle('hidden', t !== name);
    const btn = document.getElementById('tab-' + t);
    btn.classList.toggle('tab-active', t === name);
  });
  activeTab = name;
  if (name === 'emails')      loadEmailQuota();
  if (name === 'lgpd')        loadLGPD();
  if (name === 'migrations')  loadMigrationList();
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
      const h          = f.health || {};
      const suspended  = h.suspended === true;
      const ok         = h.ok === true;
      const statusColor = suspended ? 'text-slate-400' : ok ? 'text-green-400' : 'text-red-400';
      const borderColor = suspended ? 'border-slate-700'  : ok ? 'border-green-900/40' : 'border-red-900/40';
      const dotColor    = suspended ? 'bg-slate-500'      : ok ? 'bg-green-500'        : 'bg-red-500';
      const statusText  = suspended ? 'Suspensa'          : ok ? 'Online'              : 'Offline';
      const uptime      = h.uptime != null ? fmtUptime(h.uptime) : '—';
      const lgpdBadge   = suspended ? '' : (h.lgpd_accepted === true
        ? '<span class="text-xs bg-green-950 text-green-400 border border-green-900/50 px-1.5 py-0.5 rounded">LGPD ✓</span>'
        : '<span class="text-xs bg-amber-950 text-amber-400 border border-amber-900/50 px-1.5 py-0.5 rounded">LGPD ⏳</span>');
      return \`
        <div class="bg-slate-900 border \${borderColor} rounded-xl p-5 transition-all hover:border-slate-600 \${suspended ? 'opacity-60' : ''}">
          <div class="flex items-start justify-between mb-2">
            <h3 class="font-semibold text-white">\${esc(f.name)}</h3>
            <span class="flex items-center gap-1.5 text-xs \${statusColor}">
              <span class="w-2 h-2 rounded-full \${dotColor} \${ok ? 'pulse-dot' : ''}"></span>
              \${statusText}
            </span>
          </div>
          \${lgpdBadge ? '<div class="mb-3">' + lgpdBadge + '</div>' : '<div class="mb-3"></div>'}
          <p class="text-xs text-slate-400 mb-1">🌐 \${esc(f.subdomain)}.mksbrasil.com</p>
          <p class="text-xs text-slate-500 mb-4">⚙️ porta \${f.port || '—'}</p>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="bg-slate-800 rounded-lg py-2">
              <div class="text-xs text-slate-500 mb-1">D1</div>
              <div>\${suspended ? '⏸' : h.db ? '✅' : (ok === false ? '❌' : '–')}</div>
            </div>
            <div class="bg-slate-800 rounded-lg py-2">
              <div class="text-xs text-slate-500 mb-1">R2</div>
              <div>\${suspended ? '⏸' : h.storage ? '✅' : (ok === false ? '❌' : '–')}</div>
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
      const deleted   = f.status === 'deleted';
      const suspended = f.status === 'suspended';
      const badge = deleted
        ? '<span class="bg-slate-800 text-slate-500 text-xs px-2 py-1 rounded-full">Deletada</span>'
        : suspended
          ? '<span class="bg-slate-800 text-slate-400 border border-slate-700 text-xs px-2 py-1 rounded-full">⏸ Suspensa</span>'
          : '<span class="bg-green-950 text-green-400 border border-green-900/50 text-xs px-2 py-1 rounded-full">Ativa</span>';
      const actions = deleted ? '<span class="text-slate-600">—</span>'
        : suspended ? \`
          <button onclick="doReactivate('\${esc(f.subdomain)}')"
             class="text-green-400 hover:text-green-300 text-xs mr-3 transition-colors">▶ Reativar</button>
          <button onclick="startDelete('\${esc(f.subdomain)}')"
             class="text-red-400 hover:text-red-300 text-xs transition-colors">🗑 Destruir</button>
        \` : \`
          <a href="https://\${esc(f.subdomain)}.mksbrasil.com" target="_blank" rel="noopener"
             class="text-indigo-400 hover:text-indigo-300 text-xs mr-3 transition-colors">↗ Abrir</a>
          <button onclick="doSuspend('\${esc(f.subdomain)}')"
             class="text-amber-400 hover:text-amber-300 text-xs mr-3 transition-colors">⏸ Suspender</button>
          <button onclick="startDelete('\${esc(f.subdomain)}')"
             class="text-red-400 hover:text-red-300 text-xs transition-colors">🗑 Destruir</button>
        \`;
      const created = f.createdAt ? new Date(f.createdAt).toLocaleDateString('pt-BR') : '—';
      const suffix  = f.deletedAt ? ' <span class="text-slate-600">(del. ' + new Date(f.deletedAt).toLocaleDateString('pt-BR') + ')</span>' : '';
      return \`
        <tr class="border-b border-slate-800/50 \${deleted ? 'opacity-40' : suspended ? 'opacity-60' : 'hover:bg-slate-900/50'} transition-colors">
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

async function doSuspend(subdomain) {
  if (!confirm('Suspender "' + subdomain + '"? O processo PM2 será parado mas os dados ficam intactos.')) return;
  const r = await fetch('/api/families/' + subdomain + '/suspend', { method: 'POST' });
  if (r.ok) { await Promise.all([loadFamilies(), refreshHealth()]); }
  else { alert('Erro ao suspender: ' + (await r.json()).error); }
}

async function doReactivate(subdomain) {
  const r = await fetch('/api/families/' + subdomain + '/reactivate', { method: 'POST' });
  if (r.ok) { await Promise.all([loadFamilies(), refreshHealth()]); }
  else { alert('Erro ao reativar: ' + (await r.json()).error); }
}

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

// ── Email Quota ────────────────────────────────────────────────────────────────

async function loadEmailQuota() {
  try {
    const r = await fetch('/api/email/quota');
    const d = await r.json();

    document.getElementById('eq-month').textContent = 'Mês: ' + (d.month || '—');

    const used  = d.total?.used  ?? 0;
    const limit = d.total?.limit ?? 2000;
    const pct   = Math.min(100, Math.round((used / limit) * 100));
    const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-indigo-500';

    document.getElementById('eq-total-txt').textContent = used + ' / ' + limit;
    const bar = document.getElementById('eq-total-bar');
    bar.style.width = pct + '%';
    bar.className = 'h-3 rounded-full transition-all duration-500 ' + barColor;

    const tbody = document.getElementById('eq-tbody');
    if (!d.families?.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-slate-500 text-center">Nenhuma família ativa.</td></tr>';
      return;
    }

    tbody.innerHTML = d.families.map(f => {
      const fpct    = Math.min(100, Math.round((f.used / f.limit) * 100));
      const fcolor  = fpct >= 90 ? 'bg-red-500' : fpct >= 70 ? 'bg-amber-500' : 'bg-green-500';
      const lastSent = f.lastSent
        ? new Date(f.lastSent).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
        : '—';
      return \`
        <tr class="border-b border-slate-800/50 hover:bg-slate-900/50 transition-colors">
          <td class="px-4 py-3 font-medium">\${esc(f.name)}</td>
          <td class="px-4 py-3 text-slate-300">\${f.used} <span class="text-slate-500">/ \${f.limit}</span></td>
          <td class="px-4 py-3">
            <div class="flex items-center gap-2">
              <div class="flex-1 bg-slate-800 rounded-full h-2">
                <div class="\${fcolor} h-2 rounded-full" style="width:\${fpct}%"></div>
              </div>
              <span class="text-xs text-slate-500 w-8 text-right">\${fpct}%</span>
            </div>
          </td>
          <td class="px-4 py-3 text-slate-500 text-xs">\${lastSent}</td>
        </tr>
      \`;
    }).join('');
  } catch (e) {
    document.getElementById('eq-tbody').innerHTML =
      '<tr><td colspan="4" class="px-4 py-4 text-red-400">' + esc(e.message) + '</td></tr>';
  }
}

// ── Migrations ───────────────────────────────────────────────────────────────

async function loadMigrationList() {
  try {
    const [migsRes, famsRes] = await Promise.all([
      fetch('/api/migrations/list'),
      fetch('/api/families'),
    ]);
    const migs  = await migsRes.json();
    const fams  = (await famsRes.json()).filter(f => f.status === 'active');

    // Lista de arquivos
    const list = document.getElementById('mig-list');
    list.innerHTML = migs.map(m =>
      \`<li class="flex items-center gap-2 text-slate-300">
         <span class="text-slate-600 font-mono text-xs w-4 text-center">·</span>
         <span class="font-mono text-xs">\${esc(m)}</span>
       </li>\`
    ).join('');

    // Popula select de famílias
    const sel = document.getElementById('mig-scope');
    const existing = Array.from(sel.options).filter(o => o.value && o.value !== '__loading__');
    existing.forEach(o => sel.removeChild(o));
    sel.innerHTML = '<option value="">Todas as famílias ativas (' + fams.length + ')</option>' +
      fams.map(f => \`<option value="\${esc(f.subdomain)}">\${esc(f.name)} (\${esc(f.subdomain)})</option>\`).join('');
  } catch (e) {
    document.getElementById('mig-list').innerHTML = '<li class="text-red-400">' + esc(e.message) + '</li>';
  }
}

async function runMigrations(dryRun) {
  const scope   = document.getElementById('mig-scope').value;
  const logWrap = document.getElementById('mig-log-wrap');
  const logEl   = document.getElementById('mig-log');
  const spinner = document.getElementById('mig-spinner');
  const btn     = document.getElementById('btn-mig');

  logWrap.classList.remove('hidden');
  logEl.textContent = dryRun ? '[DRY-RUN]\n\n' : '';
  spinner.classList.remove('hidden');
  btn.disabled = true;
  btn.textContent = '⏳ Rodando...';

  try {
    const r = await fetch('/api/migrations/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subdomain: scope || null, dryRun }),
    });
    const reader = r.body.getReader();
    const dec    = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      logEl.textContent += dec.decode(value);
      logEl.scrollTop = logEl.scrollHeight;
    }
  } catch (e) {
    logEl.textContent += '\n❌ Erro: ' + e.message;
  } finally {
    spinner.classList.add('hidden');
    btn.disabled = false;
    btn.textContent = '🔧 Aplicar agora';
  }
}

// ── LGPD ─────────────────────────────────────────────────────────────────────

async function loadLGPD() {
  const summary = document.getElementById('lgpd-summary');
  const tbody   = document.getElementById('lgpd-tbody');
  summary.innerHTML = '';
  tbody.innerHTML   = '<tr><td colspan="6" class="px-4 py-8 text-slate-500 text-center">Consultando instâncias...</td></tr>';

  try {
    const r    = await fetch('/api/lgpd/all');
    const data = await r.json();

    const total    = data.length;
    const accepted = data.filter(f => f.lgpd?.accepted).length;
    const pending  = total - accepted;

    // Resumo cards
    summary.innerHTML = \`
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
        <div class="text-3xl font-bold text-white mb-1">\${total}</div>
        <div class="text-xs text-slate-400">Famílias ativas</div>
      </div>
      <div class="bg-slate-900 border border-green-900/40 rounded-xl p-5 text-center">
        <div class="text-3xl font-bold text-green-400 mb-1">\${accepted}</div>
        <div class="text-xs text-slate-400">Aceite registrado</div>
      </div>
      <div class="bg-slate-900 border \${pending > 0 ? 'border-amber-900/40' : 'border-slate-800'} rounded-xl p-5 text-center">
        <div class="text-3xl font-bold \${pending > 0 ? 'text-amber-400' : 'text-slate-600'} mb-1">\${pending}</div>
        <div class="text-xs text-slate-400">Aguardando aceite</div>
      </div>
    \`;

    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-slate-500 text-center">Nenhuma família ativa.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(f => {
      const lgpd     = f.lgpd || {};
      const ok       = lgpd.accepted === true;
      const badge    = ok
        ? '<span class="bg-green-950 text-green-400 border border-green-900/50 text-xs px-2 py-1 rounded-full">✅ Aceite</span>'
        : '<span class="bg-amber-950 text-amber-400 border border-amber-900/50 text-xs px-2 py-1 rounded-full">⏳ Pendente</span>';
      const acceptedAt = lgpd.acceptedAt
        ? new Date(lgpd.acceptedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
        : '—';
      const version = lgpd.version || (ok ? '1.0' : '—');
      const link    = \`<a href="https://\${esc(f.subdomain)}.mksbrasil.com" target="_blank" rel="noopener"
                          class="text-indigo-400 hover:text-indigo-300 text-xs transition-colors">↗ Abrir</a>\`;
      return \`
        <tr class="border-b border-slate-800/50 hover:bg-slate-900/50 transition-colors \${!ok ? 'bg-amber-950/5' : ''}">
          <td class="px-4 py-3 font-medium text-white">\${esc(f.name)}</td>
          <td class="px-4 py-3 text-slate-400">\${esc(f.subdomain)}</td>
          <td class="px-4 py-3">\${badge}</td>
          <td class="px-4 py-3 text-slate-500">\${version}</td>
          <td class="px-4 py-3 text-slate-400">\${acceptedAt}</td>
          <td class="px-4 py-3">\${link}</td>
        </tr>
      \`;
    }).join('');
  } catch (e) {
    summary.innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-4 text-red-400">' + esc(e.message) + '</td></tr>';
  }
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
    const all        = loadFamilies();
    const active     = all.filter(f => f.status === 'active');
    const suspended  = all.filter(f => f.status === 'suspended');
    const deleted    = all.filter(f => f.status === 'deleted');

    const results = await Promise.all(
      active.map(async f => ({ ...f, health: await checkFamilyHealth(f.subdomain) }))
    );
    const suspendedWithStatus = suspended.map(f => ({
      ...f, health: { ok: false, suspended: true },
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify([...results, ...suspendedWithStatus, ...deleted]));
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

  // ── POST /api/email/send — proxy autenticado por FAMILY_TOKEN ────────────
  if (path === '/api/email/send' && req.method === 'POST') {
    const bearerToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const families    = loadFamilies();
    const family      = families.find(f => f.familyToken === bearerToken && f.status !== 'deleted');

    if (!family) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'invalid_token' }));
    }

    const q  = loadQuota();
    const fq = q.families[family.subdomain] || { count: 0 };

    if (fq.count >= FAMILY_QUOTA) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: false, error: 'quota_exceeded',
        message: `Limite de ${FAMILY_QUOTA} e-mails/mês atingido para esta família`,
      }));
    }
    if ((q.total || 0) >= TOTAL_QUOTA) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: false, error: 'total_quota_exceeded',
        message: `Cota global de ${TOTAL_QUOTA} e-mails/mês atingida`,
      }));
    }

    const body = await readBody(req);
    const { to, subject, html, from } = body;
    if (!to || !subject || !html) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'to, subject, html required' }));
    }

    const resendKey = ENV.RESEND_API_KEY;
    if (!resendKey) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'resend_not_configured' }));
    }

    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: from || `MKS Finanças <financas@${BASE_DOMAIN}>`,
          to: Array.isArray(to) ? to : [to],
          subject,
          html,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || `Resend HTTP ${r.status}`);

      trackEmailSent(family.subdomain);
      const updQ  = loadQuota();
      const updFQ = updQ.families[family.subdomain] || { count: 1 };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true,
        messageId: data.id,
        quota: {
          familyUsed:      updFQ.count,
          familyLimit:     FAMILY_QUOTA,
          familyRemaining: FAMILY_QUOTA - updFQ.count,
          totalUsed:       updQ.total,
          totalLimit:      TOTAL_QUOTA,
          totalRemaining:  TOTAL_QUOTA - updQ.total,
        },
      }));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'send_failed', message: e.message }));
    }
  }

  // ── GET /api/migrations/list — lista arquivos .sql do repositório ─────────
  if (path === '/api/migrations/list' && req.method === 'GET') {
    const { readdirSync: rd } = await import('fs');
    const migsDir = join(PROJECT_ROOT, 'migrations');
    const files   = rd(migsDir).filter(f => f.endsWith('.sql')).sort();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(files));
  }

  // ── POST /api/migrations/run — executa migrate-all.mjs (streaming) ────────
  if (path === '/api/migrations/run' && req.method === 'POST') {
    const body = await readBody(req);
    const { subdomain, dryRun } = body;

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    });

    const args = ['scripts/migrate-all.mjs'];
    if (subdomain) args.push('--subdomain', subdomain);
    if (dryRun)    args.push('--dry-run');

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

  // ── GET /api/lgpd/all — consulta status LGPD de cada família ─────────────
  if (path === '/api/lgpd/all' && req.method === 'GET') {
    const families = loadFamilies().filter(f => f.status !== 'deleted');

    const results = await Promise.all(families.map(async f => {
      try {
        const r = await fetch(`https://${f.subdomain}.${BASE_DOMAIN}/api/lgpd/status`, {
          signal: AbortSignal.timeout(8000),
        });
        const lgpd = r.ok ? await r.json() : { accepted: false, version: null, acceptedAt: null };
        return { ...f, lgpd };
      } catch {
        return { ...f, lgpd: { accepted: false, version: null, acceptedAt: null, unreachable: true } };
      }
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(results));
  }

  // ── GET /api/email/quota — admin session ──────────────────────────────────
  if (path === '/api/email/quota' && req.method === 'GET') {
    const q        = loadQuota();
    const families = loadFamilies().filter(f => f.status !== 'deleted');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      month: q.month,
      total: { used: q.total || 0, limit: TOTAL_QUOTA, remaining: TOTAL_QUOTA - (q.total || 0) },
      families: families.map(f => {
        const fq = q.families[f.subdomain] || { count: 0, lastSent: null };
        return {
          subdomain: f.subdomain,
          name:      f.name,
          used:      fq.count,
          limit:     FAMILY_QUOTA,
          remaining: FAMILY_QUOTA - fq.count,
          lastSent:  fq.lastSent,
        };
      }),
    }));
  }

  // ── POST /api/families/:subdomain/suspend ────────────────────────────────
  const suspendMatch = path.match(/^\/api\/families\/([a-z0-9-]{1,40})\/suspend$/);
  if (suspendMatch && req.method === 'POST') {
    const subdomain = suspendMatch[1];
    const families  = loadFamilies();
    const idx       = families.findIndex(f => f.subdomain === subdomain && f.status === 'active');
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Família ativa não encontrada' }));
    }
    try {
      execSync(`pm2 stop ${families[idx].pm2Name} 2>/dev/null || true`, { stdio: 'pipe' });
      execSync('pm2 save', { stdio: 'pipe' });
    } catch {}
    families[idx].status      = 'suspended';
    families[idx].suspendedAt = new Date().toISOString();
    saveFamilies(families);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  // ── POST /api/families/:subdomain/reactivate ──────────────────────────────
  const reactivateMatch = path.match(/^\/api\/families\/([a-z0-9-]{1,40})\/reactivate$/);
  if (reactivateMatch && req.method === 'POST') {
    const subdomain = reactivateMatch[1];
    const families  = loadFamilies();
    const idx       = families.findIndex(f => f.subdomain === subdomain && f.status === 'suspended');
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Família suspensa não encontrada' }));
    }
    const ecoPath = join(CTRL, 'ecosystems', `${families[idx].pm2Name}.config.cjs`);
    try {
      execSync(`pm2 start "${ecoPath}" 2>/dev/null || pm2 restart ${families[idx].pm2Name}`, { stdio: 'pipe' });
      execSync('pm2 save', { stdio: 'pipe' });
    } catch {}
    families[idx].status      = 'active';
    families[idx].suspendedAt = null;
    saveFamilies(families);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
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
