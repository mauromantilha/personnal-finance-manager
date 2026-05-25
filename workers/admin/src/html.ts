export const ADMIN_HTML = /* html */`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MKS Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>tailwind.config = { darkMode: 'class', theme: { extend: {} } }</script>
  <style>
    body { background: #020617; }
    .section { display: none; }
    .section.active { display: block; }
    .nav-btn { @apply text-sm text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors; }
    .nav-btn.active { @apply text-white bg-slate-800; }
    .card { @apply bg-slate-900 border border-slate-800 rounded-xl p-5; }
    .input { @apply w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:border-indigo-500 focus:outline-none transition-colors; }
    .btn-primary { @apply bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors; }
    .btn-ghost { @apply bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors; }
    .btn-danger { @apply bg-red-900/60 hover:bg-red-800 text-red-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors; }
    .badge-active { @apply text-xs px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-800; }
    .badge-suspended { @apply text-xs px-2 py-0.5 rounded-full bg-amber-900/60 text-amber-300 border border-amber-800; }
    .badge-deleted { @apply text-xs px-2 py-0.5 rounded-full bg-red-900/60 text-red-300 border border-red-800; }
    .badge-free { @apply text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700; }
    .badge-paid { @apply text-xs px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-800; }
    .toast { @apply fixed bottom-6 right-6 px-4 py-3 rounded-xl text-sm font-medium shadow-xl z-50 transition-all duration-300; }
  </style>
</head>
<body class="dark text-slate-100 min-h-screen font-sans">

<!-- Toast -->
<div id="toast" class="toast opacity-0 pointer-events-none"></div>

<!-- Nav -->
<nav class="bg-slate-900/80 backdrop-blur border-b border-slate-800 sticky top-0 z-40">
  <div class="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
    <div class="flex items-center gap-3">
      <div class="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-sm font-bold">M</div>
      <span class="font-semibold text-white">MKS Admin</span>
      <span class="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">Panel</span>
    </div>
    <div class="ml-auto flex gap-1">
      <button onclick="nav('dashboard')"  id="nav-dashboard"  class="nav-btn active">Dashboard</button>
      <button onclick="nav('families')"   id="nav-families"   class="nav-btn">Famílias</button>
      <button onclick="nav('provision')"  id="nav-provision"  class="nav-btn">Provisionar</button>
      <button onclick="nav('migrations')" id="nav-migrations" class="nav-btn">Migrações</button>
    </div>
  </div>
</nav>

<!-- Main -->
<main class="max-w-7xl mx-auto px-6 py-8">

  <!-- Dashboard -->
  <section id="section-dashboard" class="section active">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-white">Dashboard</h1>
      <button onclick="loadDashboard()" class="btn-ghost">Atualizar</button>
    </div>

    <!-- Stat cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div class="card">
        <div class="text-xs text-slate-500 uppercase tracking-wider mb-2">Famílias Ativas</div>
        <div id="stat-families" class="text-4xl font-bold text-indigo-400">—</div>
        <div class="text-xs text-slate-500 mt-1">tenants ativos</div>
      </div>
      <div class="card">
        <div class="text-xs text-slate-500 uppercase tracking-wider mb-2">D1 Free Limit</div>
        <div id="stat-d1" class="text-4xl font-bold text-emerald-400">—</div>
        <div id="stat-d1-bar" class="mt-3 bg-slate-800 rounded-full h-1.5">
          <div id="stat-d1-fill" class="h-1.5 rounded-full bg-emerald-500 transition-all" style="width:0%"></div>
        </div>
      </div>
      <div class="card">
        <div class="text-xs text-slate-500 uppercase tracking-wider mb-2">ZT Users</div>
        <div id="stat-zt" class="text-4xl font-bold text-amber-400">—</div>
        <div id="stat-zt-bar" class="mt-3 bg-slate-800 rounded-full h-1.5">
          <div id="stat-zt-fill" class="h-1.5 rounded-full bg-amber-500 transition-all" style="width:0%"></div>
        </div>
      </div>
    </div>

    <!-- Alerts -->
    <div id="dash-alerts"></div>

    <!-- Recent families table preview -->
    <div class="card mt-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-semibold text-white">Famílias Recentes</h2>
        <button onclick="nav('families')" class="text-xs text-indigo-400 hover:text-indigo-300">Ver todas →</button>
      </div>
      <div id="dash-families">Carregando...</div>
    </div>
  </section>

  <!-- Families -->
  <section id="section-families" class="section">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-white">Famílias</h1>
      <div class="flex gap-2">
        <input type="search" id="family-search" placeholder="Buscar..." class="input w-48"
          oninput="filterFamilies()">
        <button onclick="nav('provision')" class="btn-primary">+ Nova Família</button>
      </div>
    </div>
    <div id="families-container">Carregando...</div>
  </section>

  <!-- Provision -->
  <section id="section-provision" class="section">
    <div class="max-w-lg">
      <h1 class="text-2xl font-bold text-white mb-2">Provisionar Nova Família</h1>
      <p class="text-sm text-slate-400 mb-6">Cria D1, CF Access App e envia email de boas-vindas automaticamente.</p>

      <form id="provision-form" class="card space-y-4" onsubmit="submitProvision(event)">
        <div>
          <label class="block text-xs text-slate-400 mb-1.5">Nome da Família</label>
          <input name="name" type="text" placeholder="Família Silva" required class="input">
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1.5">Subdomínio</label>
          <div class="flex items-center gap-2">
            <input name="subdomain" type="text" placeholder="silva" required
              pattern="[a-z0-9-]+" title="Apenas letras minúsculas, números e hífens"
              oninput="this.value=this.value.toLowerCase()" class="input flex-1">
            <span class="text-slate-500 text-sm whitespace-nowrap">.mksbrasil.com</span>
          </div>
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1.5">Email do Owner</label>
          <input name="ownerEmail" type="email" placeholder="owner@familia.com" required class="input">
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1.5">Plano</label>
          <select name="tier" class="input">
            <option value="1">Free</option>
            <option value="2">Paid</option>
          </select>
        </div>
        <button type="submit" id="provision-btn" class="btn-primary w-full py-2.5">
          Provisionar Família
        </button>
      </form>

      <div id="provision-result" class="mt-4"></div>
    </div>
  </section>

  <!-- Migrations -->
  <section id="section-migrations" class="section">
    <div class="max-w-2xl">
      <h1 class="text-2xl font-bold text-white mb-2">Migrações SQL</h1>
      <p class="text-sm text-slate-400 mb-6">Execute SQL em uma família específica ou em todas as ativas.</p>

      <div class="card space-y-4">
        <div>
          <label class="block text-xs text-slate-400 mb-1.5">
            Família (subdomínio) — <span class="text-slate-500">deixe vazio para aplicar em todas</span>
          </label>
          <input id="mig-subdomain" type="text" placeholder="silva" class="input">
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1.5">SQL</label>
          <textarea id="mig-sql" rows="8"
            placeholder="ALTER TABLE users ADD COLUMN phone TEXT;&#10;CREATE INDEX IF NOT EXISTS ..."
            class="input font-mono text-xs resize-y"></textarea>
        </div>
        <button onclick="applyMigration()" id="mig-btn"
          class="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors">
          Aplicar Migração
        </button>
      </div>

      <div id="mig-result" class="mt-4"></div>
    </div>
  </section>

</main>

<script>
// ── State & helpers ───────────────────────────────────────────────────────────
let allFamilies = [];

function $(id) { return document.getElementById(id); }

function toast(msg, ok = true) {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast ' + (ok ? 'bg-emerald-800 text-emerald-100' : 'bg-red-900 text-red-200');
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 3000);
}

async function api(method, path, body) {
  try {
    const r = await fetch('/api' + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return r.json();
  } catch (e) {
    return { error: e.message };
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────
function nav(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  $('section-' + name).classList.add('active');
  $('nav-' + name).classList.add('active');
  if (name === 'dashboard') loadDashboard();
  if (name === 'families')  loadFamilies();
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const [health, limits] = await Promise.all([api('GET', '/health'), api('GET', '/limits')]);

  const count = health.families ?? 0;
  $('stat-families').textContent = count;

  const d1 = health.limits?.d1;
  if (d1) {
    $('stat-d1').textContent = d1.current + '/' + d1.freeLimit;
    const pct = Math.min((d1.current / d1.freeLimit) * 100, 100);
    $('stat-d1-fill').style.width = pct + '%';
    $('stat-d1-fill').className = 'h-1.5 rounded-full transition-all ' + (pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500');
  }

  const ztLimit = 50;
  const ztCount = health.limits?.zt ? 0 : 0; // populated once ZT count is wired
  $('stat-zt').textContent = ztCount + '/' + ztLimit;

  const alertsEl = $('dash-alerts');
  alertsEl.innerHTML = '';
  (limits.alerts ?? []).forEach(a => {
    alertsEl.innerHTML += '<div class="mb-3 bg-amber-900/20 border border-amber-800/50 rounded-xl px-4 py-3 text-sm text-amber-300">' + a + '</div>';
  });

  // Mini families table
  const data = await api('GET', '/families');
  const fams = (data.families ?? []).slice(0, 5);
  $('dash-families').innerHTML = fams.length
    ? '<table class="w-full text-sm"><tbody class="divide-y divide-slate-800">'
        + fams.map(f => '<tr class="hover:bg-slate-800/30"><td class="py-2.5 font-medium text-white">' + f.name + '</td>'
          + '<td class="py-2.5 text-indigo-400 font-mono text-xs">' + f.subdomain + '</td>'
          + '<td class="py-2.5">' + badge(f.status) + '</td>'
          + '<td class="py-2.5 text-slate-500 text-xs">' + new Date(f.createdAt).toLocaleDateString('pt-BR') + '</td></tr>').join('')
        + '</tbody></table>'
    : '<p class="text-sm text-slate-500">Nenhuma família ainda.</p>';
}

// ── Families ──────────────────────────────────────────────────────────────────
async function loadFamilies() {
  const data = await api('GET', '/families');
  allFamilies = data.families ?? [];
  renderFamilies(allFamilies);
}

function filterFamilies() {
  const q = $('family-search').value.toLowerCase();
  renderFamilies(allFamilies.filter(f =>
    f.name.toLowerCase().includes(q) || f.subdomain.includes(q)
  ));
}

function badge(status) {
  return '<span class="badge-' + status + '">' + status + '</span>';
}

function tierBadge(tier) {
  return tier === 2
    ? '<span class="badge-paid">Paid</span>'
    : '<span class="badge-free">Free</span>';
}

function renderFamilies(families) {
  if (!families.length) {
    $('families-container').innerHTML = '<div class="card text-center py-12 text-slate-500">Nenhuma família encontrada.</div>';
    return;
  }
  $('families-container').innerHTML = '<div class="card overflow-hidden p-0">'
    + '<table class="w-full text-sm">'
    + '<thead><tr class="bg-slate-800/50 text-slate-400 text-xs">'
    + '<th class="text-left px-4 py-3">Nome</th>'
    + '<th class="text-left px-4 py-3">Subdomínio</th>'
    + '<th class="text-left px-4 py-3">Plano</th>'
    + '<th class="text-left px-4 py-3">Status</th>'
    + '<th class="text-left px-4 py-3">Criado</th>'
    + '<th class="text-left px-4 py-3">Ações</th>'
    + '</tr></thead>'
    + '<tbody class="divide-y divide-slate-800">'
    + families.map(f => '<tr class="hover:bg-slate-800/30 group">'
      + '<td class="px-4 py-3 font-medium text-white">' + f.name + '</td>'
      + '<td class="px-4 py-3"><span class="font-mono text-indigo-400 text-xs bg-indigo-900/20 px-2 py-0.5 rounded">' + f.subdomain + '</span></td>'
      + '<td class="px-4 py-3">' + tierBadge(f.tier) + '</td>'
      + '<td class="px-4 py-3">' + badge(f.status) + '</td>'
      + '<td class="px-4 py-3 text-slate-500 text-xs">' + new Date(f.createdAt).toLocaleDateString('pt-BR') + '</td>'
      + '<td class="px-4 py-3">'
        + '<div class="flex gap-1.5 opacity-80 group-hover:opacity-100">'
          + '<a href="https://' + f.subdomain + '.mksbrasil.com" target="_blank" class="btn-ghost">Abrir</a>'
          + (f.status === 'active'
              ? '<button onclick="updateStatus(\'' + f.subdomain + '\',\'suspended\')" class="btn-ghost">Suspender</button>'
              : f.status === 'suspended'
              ? '<button onclick="updateStatus(\'' + f.subdomain + '\',\'active\')" class="btn-ghost text-emerald-400">Reativar</button>'
              : '')
          + (f.status !== 'deleted'
              ? '<button onclick="deleteFamily(\'' + f.subdomain + '\')" class="btn-danger">Excluir</button>'
              : '')
        + '</div>'
      + '</td>'
      + '</tr>').join('')
    + '</tbody></table></div>';
}

async function updateStatus(subdomain, status) {
  const data = await api('PUT', '/families/' + subdomain, { status });
  if (data.success) { toast('Status atualizado.'); loadFamilies(); }
  else toast(data.error ?? 'Erro', false);
}

async function deleteFamily(subdomain) {
  if (!confirm('Excluir família "' + subdomain + '"? A conta será marcada como deleted.')) return;
  const data = await api('DELETE', '/families/' + subdomain);
  if (data.success) { toast('Família excluída.'); loadFamilies(); }
  else toast(data.error ?? 'Erro', false);
}

// ── Provision ─────────────────────────────────────────────────────────────────
async function submitProvision(e) {
  e.preventDefault();
  const btn = $('provision-btn');
  const fd  = new FormData(e.target);
  const body = { name: fd.get('name'), subdomain: fd.get('subdomain'), ownerEmail: fd.get('ownerEmail'), tier: parseInt(fd.get('tier')) };

  btn.disabled = true;
  btn.textContent = 'Provisionando...';
  $('provision-result').innerHTML = '<div class="card text-sm text-slate-400 flex items-center gap-2"><div class="animate-spin w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full"></div> Criando D1, Access App e enviando email...</div>';

  const data = await api('POST', '/provision', body);
  btn.disabled = false;
  btn.textContent = 'Provisionar Família';

  if (data.success) {
    $('provision-result').innerHTML = '<div class="card border-emerald-800 space-y-2">'
      + '<div class="text-emerald-400 font-semibold">Família provisionada!</div>'
      + '<div class="text-sm text-slate-300">URL: <a href="https://' + body.subdomain + '.mksbrasil.com" target="_blank" class="text-indigo-400 underline">https://' + body.subdomain + '.mksbrasil.com</a></div>'
      + '<div class="text-xs text-slate-500 font-mono">D1: ' + data.tenant.d1DatabaseId + '</div>'
      + '<div class="text-xs text-slate-500 font-mono">AUD: ' + data.tenant.accessAppAud.slice(0, 16) + '...</div>'
      + '</div>';
    e.target.reset();
    toast('Família provisionada com sucesso!');
  } else {
    $('provision-result').innerHTML = '<div class="card border-red-900 text-red-400 text-sm">' + (data.error ?? 'Erro desconhecido') + '</div>';
    toast(data.error ?? 'Erro ao provisionar', false);
  }
}

// ── Migrations ────────────────────────────────────────────────────────────────
async function applyMigration() {
  const subdomain = $('mig-subdomain').value.trim();
  const sql       = $('mig-sql').value.trim();
  const btn       = $('mig-btn');

  if (!sql) { toast('SQL é obrigatório.', false); return; }

  btn.disabled = true;
  btn.textContent = 'Aplicando...';
  $('mig-result').innerHTML = '';

  const endpoint = subdomain ? '/migrations/apply' : '/migrations/apply-all';
  const body     = subdomain ? { subdomain, sql } : { sql };
  const data     = await api('POST', endpoint, body);

  btn.disabled = false;
  btn.textContent = 'Aplicar Migração';

  if (data.results) {
    // apply-all
    const entries = Object.entries(data.results);
    $('mig-result').innerHTML = '<div class="card space-y-2 text-sm">'
      + entries.map(([sub, r]) =>
          '<div class="flex items-center gap-2">'
          + '<span class="font-mono text-indigo-400">' + sub + '</span>'
          + '<span class="text-slate-300">' + r.applied + ' stmt(s)</span>'
          + (r.errors.length ? '<span class="text-red-400">' + r.errors.join(' | ') + '</span>' : '<span class="text-emerald-400">✓</span>')
          + '</div>'
        ).join('')
      + '</div>';
    toast(entries.length + ' família(s) migrada(s).');
  } else if (data.success) {
    $('mig-result').innerHTML = '<div class="card text-emerald-400 text-sm">' + data.applied + ' statement(s) aplicado(s).</div>';
    toast('Migração aplicada com sucesso.');
  } else {
    $('mig-result').innerHTML = '<div class="card text-red-400 text-sm space-y-1">'
      + (data.errors ?? []).map(e => '<div>' + e + '</div>').join('')
      + '</div>';
    toast('Erros na migração.', false);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadDashboard();
</script>
</body>
</html>`;
