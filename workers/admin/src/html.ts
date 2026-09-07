export function adminHtml(baseDomain: string, nonce: string): string { return /* html */`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MKS Admin Console</title>
  <script nonce="${nonce}">const BASE_DOMAIN = '${baseDomain}';</script>
  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    :root{
      /* main area - light */
      --bg:#f0f2f7;--surf:#ffffff;--card:#ffffff;--hov:#f0f4ff;
      --bdr:#e2e6f0;--bdr2:#c8d0e6;
      --t1:#1a2340;--t2:#4a5878;--t3:#8a96b0;
      --acc:#4f70f7;--acc2:#3a5ae8;--glow:rgba(79,112,247,.12);
      --ok:#0aad68;--warn:#e09210;--err:#d93535;
      --r:10px;
      /* sidebar specific - dark */
      --sb-bg:#0c1022;--sb-surf:#0f1628;--sb-bdr:#1c2a4a;
      --sb-t1:#dce4f8;--sb-t2:#8494bb;--sb-t3:#4d5e82;
      --sb-acc:#4f70f7;--sb-acc2:#7090ff;--sb-hov:#172038;--sb-glow:rgba(79,112,247,.18);
    }
    *{box-sizing:border-box;margin:0;padding:0;}
    html,body{height:100%;}
    body{background:var(--bg);color:var(--t1);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;display:flex;height:100vh;overflow:hidden;font-size:14px;-webkit-font-smoothing:antialiased;}
    a{color:inherit;text-decoration:none;}
    button{font-family:inherit;cursor:pointer;}

    /* SIDEBAR - dark */
    #sb{width:220px;min-width:220px;background:var(--sb-bg);border-right:1px solid var(--sb-bdr);display:flex;flex-direction:column;overflow:hidden;}
    .sb-logo{padding:16px 16px 14px;border-bottom:1px solid var(--sb-bdr);display:flex;align-items:center;gap:10px;}
    .sb-icon{width:31px;height:31px;border-radius:8px;background:linear-gradient(135deg,#4f70f7,#8b5cf6);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;color:#fff;flex-shrink:0;}
    .sb-name{font-size:13px;font-weight:700;color:var(--sb-t1);}
    .sb-ver{font-size:9px;color:var(--sb-t3);text-transform:uppercase;letter-spacing:.6px;margin-top:1px;}
    .sb-nav{flex:1;overflow-y:auto;padding:4px 0 8px;}
    .sb-sec{font-size:9px;font-weight:700;color:var(--sb-t3);text-transform:uppercase;letter-spacing:1.1px;padding:14px 16px 5px;}
    .sb-item{display:flex;align-items:center;gap:9px;padding:8px 16px;cursor:pointer;color:var(--sb-t2);font-size:13px;font-weight:500;border-left:3px solid transparent;transition:all .12s;user-select:none;}
    .sb-item:hover{background:rgba(255,255,255,.05);color:var(--sb-t1);}
    .sb-item.active{border-left-color:var(--sb-acc);background:var(--sb-glow);color:var(--sb-acc2);}
    .sb-ico{font-size:14px;width:17px;text-align:center;flex-shrink:0;opacity:.85;}
    .sb-foot{padding:10px 16px;border-top:1px solid var(--sb-bdr);}
    .sb-live{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--sb-t3);}
    .sb-dot{width:6px;height:6px;border-radius:50%;background:#0ec97e;box-shadow:0 0 5px #0ec97e;flex-shrink:0;}
    .sb-ts{font-size:10px;color:var(--sb-t3);margin-top:3px;}
    .sb-logout{margin-top:8px;width:100%;text-align:left;background:rgba(240,75,75,.08);border:1px solid rgba(240,75,75,.18);color:#f04b4b;padding:7px 11px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;display:flex;align-items:center;gap:6px;}
    .sb-logout:hover{background:rgba(240,75,75,.16);border-color:rgba(240,75,75,.35);}

    /* MAIN */
    #main{flex:1;overflow-y:auto;display:flex;flex-direction:column;background:var(--bg);}
    .topbar{padding:12px 24px;background:var(--surf);border-bottom:1px solid var(--bdr);display:flex;align-items:center;gap:10px;flex-shrink:0;position:sticky;top:0;z-index:20;box-shadow:0 1px 4px rgba(0,0,0,.06);}
    .topbar-title{font-size:15px;font-weight:700;color:var(--t1);flex:1;}
    .tb-pill{font-size:10px;padding:3px 9px;border-radius:20px;background:var(--hov);border:1px solid var(--bdr2);color:var(--t3);}
    .tb-btn{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;padding:5px 11px;border-radius:7px;background:var(--hov);color:var(--t2);border:1px solid var(--bdr);cursor:pointer;transition:all .12s;font-family:inherit;}
    .tb-btn:hover{color:var(--t1);border-color:var(--bdr2);}

    /* PAGE */
    .page{padding:20px 24px 48px;display:none;}
    .page.active{display:block;}

    /* KPI ROW */
    .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px;}
    .kpi{background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);padding:16px 18px;transition:border-color .2s;}
    .kpi:hover{border-color:var(--bdr2);}
    .kpi-lbl{font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:9px;}
    .kpi-val{font-size:28px;font-weight:800;color:var(--t1);line-height:1;margin-bottom:5px;font-variant-numeric:tabular-nums;}
    .kpi-meta{font-size:11px;color:var(--t2);}
    .kpi-bar{height:3px;background:rgba(255,255,255,.05);border-radius:2px;margin-top:10px;overflow:hidden;}
    .kpi-fill{height:100%;border-radius:2px;transition:width .6s ease;}

    /* CHARTS */
    .chart-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;}
    .chart-card{background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);padding:18px 20px;}
    .chart-wrap{position:relative;height:200px;}
    .chart-ttl{font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px;}

    /* TABLE CARD */
    .tbl-card{background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);overflow:hidden;margin-bottom:18px;}
    .tbl-head{padding:11px 16px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;}
    .tbl-ttl{font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.5px;}
    table{width:100%;border-collapse:collapse;}
    thead th{padding:8px 14px;text-align:left;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.7px;background:rgba(255,255,255,.02);border-bottom:1px solid var(--bdr);white-space:nowrap;}
    tbody tr{border-bottom:1px solid var(--bdr);transition:background .1s;}
    tbody tr:last-child{border-bottom:none;}
    tbody tr:hover{background:var(--hov);cursor:pointer;}
    td{padding:9px 14px;font-size:13px;color:var(--t1);}

    /* BADGES */
    .bdg{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;letter-spacing:.2px;white-space:nowrap;}
    .bdg::before{content:'';width:5px;height:5px;border-radius:50%;flex-shrink:0;}
    .bdg-active{background:rgba(14,201,126,.1);color:var(--ok);border:1px solid rgba(14,201,126,.25);}
    .bdg-active::before{background:var(--ok);}
    .bdg-suspended{background:rgba(245,166,35,.1);color:var(--warn);border:1px solid rgba(245,166,35,.25);}
    .bdg-suspended::before{background:var(--warn);}
    .bdg-deleted{background:rgba(240,75,75,.1);color:var(--err);border:1px solid rgba(240,75,75,.25);}
    .bdg-deleted::before{background:var(--err);}
    .bdg-free{background:rgba(148,163,184,.08);color:var(--t2);border:1px solid rgba(148,163,184,.15);}
    .bdg-paid{background:rgba(79,112,247,.1);color:var(--acc2);border:1px solid rgba(79,112,247,.25);}

    /* BUTTONS */
    .btn{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:5px 11px;border-radius:7px;border:none;cursor:pointer;transition:all .12s;font-family:inherit;white-space:nowrap;}
    .btn-pri{background:var(--acc);color:#fff;}
    .btn-pri:hover{background:var(--acc2);box-shadow:0 4px 10px rgba(79,112,247,.3);}
    .btn-pri:disabled{opacity:.4;pointer-events:none;}
    .btn-sec{background:var(--hov);color:var(--t2);border:1px solid var(--bdr);}
    .btn-sec:hover{color:var(--t1);border-color:var(--bdr2);}
    .btn-ok{background:rgba(14,201,126,.1);color:var(--ok);border:1px solid rgba(14,201,126,.2);}
    .btn-ok:hover{background:rgba(14,201,126,.18);}
    .btn-warn{background:rgba(245,166,35,.1);color:var(--warn);border:1px solid rgba(245,166,35,.2);}
    .btn-warn:hover{background:rgba(245,166,35,.18);}
    .btn-err{background:rgba(240,75,75,.1);color:var(--err);border:1px solid rgba(240,75,75,.2);}
    .btn-err:hover{background:rgba(240,75,75,.18);}
    .btn-lg{padding:10px 20px;font-size:13px;border-radius:9px;justify-content:center;}

    /* FORM */
    .fc{width:100%;background:var(--surf);border:1px solid var(--bdr);border-radius:8px;padding:9px 12px;font-size:13px;color:var(--t1);outline:none;transition:border-color .15s,box-shadow .15s;font-family:inherit;}
    .fc:focus{border-color:var(--acc);box-shadow:0 0 0 3px var(--glow);}
    .fc::placeholder{color:var(--t3);}
    select.fc{appearance:none;cursor:pointer;}
    .fc-lbl{display:block;font-size:11px;font-weight:600;color:var(--t2);margin-bottom:5px;letter-spacing:.2px;}
    .fc-hint{font-size:11px;color:var(--t3);margin-top:4px;}
    .fg{margin-bottom:15px;}

    /* MODAL */
    .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.78);backdrop-filter:blur(5px);z-index:80;display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;pointer-events:none;transition:opacity .2s;}
    .modal-bg.open{opacity:1;pointer-events:all;}
    .modal{background:var(--card);border:1px solid var(--bdr2);border-radius:14px;width:100%;max-width:530px;box-shadow:0 24px 60px rgba(0,0,0,.6);transform:translateY(18px) scale(.98);transition:transform .22s;}
    .modal-bg.open .modal{transform:translateY(0) scale(1);}
    .mhdr{padding:16px 20px;border-bottom:1px solid var(--bdr);display:flex;align-items:flex-start;justify-content:space-between;}
    .m-ttl{font-size:15px;font-weight:700;color:var(--t1);}
    .m-sub{font-size:11px;color:var(--t3);margin-top:3px;}
    .m-x{width:26px;height:26px;border-radius:6px;background:var(--hov);border:1px solid var(--bdr);color:var(--t2);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .1s;flex-shrink:0;}
    .m-x:hover{color:var(--t1);}
    .mbdy{padding:16px 20px;max-height:58vh;overflow-y:auto;}
    .mftr{padding:12px 20px;border-top:1px solid var(--bdr);display:flex;gap:8px;align-items:center;}

    /* INFO GRID */
    .ig{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;}
    .ig-item{background:var(--surf);border:1px solid var(--bdr);border-radius:8px;padding:9px 11px;}
    .ig-lbl{font-size:9px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.7px;margin-bottom:3px;}
    .ig-val{font-size:12px;color:var(--t1);font-weight:500;word-break:break-all;}

    /* NOC */
    .noc-kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px;}
    .noc-card{background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);padding:15px 17px;}
    .noc-lbl{font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:7px;}
    .noc-val{font-size:26px;font-weight:800;color:var(--t1);font-variant-numeric:tabular-nums;}
    .noc-hint{font-size:11px;color:var(--t2);margin-top:3px;}

    /* PROV */
    .prov-wrap{display:grid;grid-template-columns:minmax(0,500px) 1fr;gap:20px;align-items:start;}
    .prov-card{background:var(--card);border:1px solid var(--bdr);border-radius:14px;padding:24px;}
    .info-panel{display:flex;flex-direction:column;gap:14px;}
    .info-box{background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:18px;}

    /* CHECKLIST */
    .chk{display:flex;flex-direction:column;gap:9px;}
    .chk-i{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:var(--t2);}
    .chk-ico{color:var(--ok);flex-shrink:0;}

    /* D1 MINI BAR */
    .d1-bar{height:3px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden;margin-top:5px;}
    .d1-fill{height:100%;border-radius:2px;background:var(--acc);}

    /* ALERTS */
    .alr{display:flex;align-items:flex-start;gap:8px;padding:10px 13px;border-radius:8px;font-size:12px;margin-bottom:10px;}
    .alr-warn{background:rgba(245,166,35,.07);border:1px solid rgba(245,166,35,.2);color:var(--warn);}
    .alr-err{background:rgba(240,75,75,.07);border:1px solid rgba(240,75,75,.2);color:var(--err);}
    .alr-ok{background:rgba(14,201,126,.07);border:1px solid rgba(14,201,126,.2);color:var(--ok);}

    /* MISC */
    @keyframes spin{to{transform:rotate(360deg);}}
    .spin{animation:spin .7s linear infinite;display:inline-block;}
    #toast{position:fixed;bottom:22px;right:22px;padding:11px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:200;opacity:0;pointer-events:none;transition:opacity .3s;box-shadow:0 8px 24px rgba(0,0,0,.15);max-width:300px;}
    ::-webkit-scrollbar{width:4px;height:4px;}
    ::-webkit-scrollbar-track{background:transparent;}
    ::-webkit-scrollbar-thumb{background:var(--bdr2);border-radius:3px;}
    .mono{font-family:'SF Mono','Fira Code','Cascadia Code',Consolas,monospace;}
    .sql-ed{font-family:'SF Mono','Fira Code',Consolas,monospace;font-size:12px;line-height:1.65;resize:vertical;min-height:140px;}
    .row-fam-name{font-weight:600;}
    .empty{padding:48px;text-align:center;color:var(--t3);}
    .empty-ico{font-size:30px;margin-bottom:10px;}
  </style>
</head>
<body>

<!-- ── SIDEBAR ──────────────────────────────────────────────────── -->
<aside id="sb">
  <div class="sb-logo">
    <div class="sb-icon">M</div>
    <div>
      <div class="sb-name">MKS Admin</div>
      <div class="sb-ver">Console</div>
    </div>
  </div>
  <nav class="sb-nav">
    <div class="sb-sec">Visão Geral</div>
    <div class="sb-item active" id="nav-dashboard" data-nav="dashboard">
      <span class="sb-ico">▣</span>Dashboard
    </div>
    <div class="sb-item" id="nav-noc" data-nav="noc">
      <span class="sb-ico">◈</span>Infraestrutura
    </div>
    <div class="sb-sec">Gestão</div>
    <div class="sb-item" id="nav-families" data-nav="families">
      <span class="sb-ico">⊞</span>Famílias
    </div>
    <div class="sb-item" id="nav-provision" data-nav="provision">
      <span class="sb-ico">⊕</span>Provisionar
    </div>
    <div class="sb-sec">Operações</div>
    <div class="sb-item" id="nav-communications" data-nav="communications">
      <span class="sb-ico">✉</span>Comunicados
    </div>
    <div class="sb-item" id="nav-storage-upgrades" data-nav="storage-upgrades">
      <span class="sb-ico">💾</span>Upgrades Storage
    </div>
    <div class="sb-sec">Observabilidade</div>
    <div class="sb-item" id="nav-telemetry" data-nav="telemetry">
      <span class="sb-ico">◎</span>Telemetria
    </div>
    <div class="sb-item" id="nav-security" data-nav="security">
      <span class="sb-ico">🛡</span>Segurança
    </div>
    <div class="sb-item" id="nav-fam-telemetry" data-nav="fam-telemetry" style="display:none;">
      <span class="sb-ico">▦</span><span id="nav-fam-tel-lbl">Família</span>
    </div>
  </nav>
  <div class="sb-foot">
    <div class="sb-live"><span class="sb-dot"></span>Worker Ativo</div>
    <div class="sb-ts" id="sb-ts">—</div>
    <button class="sb-logout" id="btn-logout" type="button" title="Encerrar sessão">↪ Sair</button>
  </div>
</aside>

<!-- ── MAIN ─────────────────────────────────────────────────────── -->
<div id="main">
  <header class="topbar">
    <div class="topbar-title" id="topbar-title">Dashboard</div>
    <span class="tb-pill">Produção</span>
    <button class="tb-btn" id="refresh-btn">↺ Atualizar</button>
  </header>

  <!-- DASHBOARD ───────────────────────────────────────────────── -->
  <div class="page active" id="page-dashboard">
    <div class="kpi-row" style="margin-top:6px;">
      <div class="kpi">
        <div class="kpi-lbl">Famílias Cadastradas</div>
        <div class="kpi-val" id="kpi-fam">—</div>
        <div class="kpi-meta" id="kpi-fam-meta">Carregando…</div>
        <div class="kpi-bar"><div class="kpi-fill" id="kpi-fam-fill" style="width:0;background:var(--acc)"></div></div>
      </div>
      <div class="kpi">
        <div class="kpi-lbl">Bancos D1 Usados</div>
        <div class="kpi-val" id="kpi-d1">—</div>
        <div class="kpi-meta" id="kpi-d1-meta">Carregando…</div>
        <div class="kpi-bar"><div class="kpi-fill" id="kpi-d1-fill" style="width:0;background:var(--ok)"></div></div>
      </div>
      <div class="kpi">
        <div class="kpi-lbl">Usuários Zero Trust</div>
        <div class="kpi-val" id="kpi-zt">—</div>
        <div class="kpi-meta" id="kpi-zt-meta">Carregando…</div>
        <div class="kpi-bar"><div class="kpi-fill" id="kpi-zt-fill" style="width:0;background:var(--warn)"></div></div>
      </div>
      <div class="kpi">
        <div class="kpi-lbl">Taxa de Ativação</div>
        <div class="kpi-val" id="kpi-rate">—</div>
        <div class="kpi-meta" id="kpi-rate-meta">% famílias ativas</div>
        <div class="kpi-bar"><div class="kpi-fill" id="kpi-rate-fill" style="width:0;background:var(--ok)"></div></div>
      </div>
    </div>

    <div id="dash-alerts"></div>

    <div class="chart-row">
      <div class="chart-card">
        <div class="chart-ttl">Status das Famílias</div>
        <div class="chart-wrap"><canvas id="chart-status"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-ttl">Capacidade de Recursos</div>
        <div class="chart-wrap"><canvas id="chart-res"></canvas></div>
      </div>
    </div>

    <div class="tbl-card">
      <div class="tbl-head">
        <span class="tbl-ttl">Famílias Recentes</span>
        <button class="btn btn-sec" style="font-size:11px;padding:4px 10px;" data-nav="families">Ver todas →</button>
      </div>
      <div id="dash-fam-table"></div>
    </div>
  </div>

  <!-- NOC / INFRAESTRUTURA ────────────────────────────────────── -->
  <div class="page" id="page-noc">
    <div id="noc-wrap" style="margin-top:6px;">
      <div class="empty"><div class="spin" style="font-size:22px;">⟳</div><div style="margin-top:10px;">Consultando infraestrutura Cloudflare…</div></div>
    </div>
  </div>

  <!-- FAMÍLIAS ────────────────────────────────────────────────── -->
  <div class="page" id="page-families">
    <div style="display:flex;align-items:center;gap:10px;margin-top:6px;margin-bottom:18px;flex-wrap:wrap;">
      <div style="position:relative;flex:1;min-width:220px;max-width:320px;">
        <span style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--t3);font-size:13px;pointer-events:none;">⌕</span>
        <input type="text" id="fam-search" class="fc" placeholder="Buscar família ou subdomínio…" style="padding-left:32px;">
      </div>
      <select id="fam-status" class="fc" style="width:150px;">
        <option value="">Todos os status</option>
        <option value="active">Ativas</option>
        <option value="suspended">Suspensas</option>
        <option value="deleted">Excluídas</option>
      </select>
      <select id="fam-tier" class="fc" style="width:130px;">
        <option value="">Todos os planos</option>
        <option value="1">Free</option>
        <option value="2">Paid</option>
      </select>
      <button class="btn btn-pri" data-nav="provision">+ Nova Família</button>
    </div>
    <div id="families-container"></div>
  </div>

  <!-- PROVISIONAR ─────────────────────────────────────────────── -->
  <div class="page" id="page-provision">
    <div class="prov-wrap" style="margin-top:6px;">
      <div class="prov-card">
        <div style="margin-bottom:20px;">
          <div style="font-size:16px;font-weight:700;color:var(--t1);margin-bottom:4px;">Provisionar Nova Família</div>
          <div style="font-size:12px;color:var(--t3);">Cria banco D1, política de acesso e envia convite ao administrador da família.</div>
        </div>
        <form id="prov-form" autocomplete="off">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px;">
            <div class="fg" style="grid-column:1/-1;">
              <label class="fc-lbl">Nome da Família <span style="color:var(--err)">*</span></label>
              <input name="name" type="text" class="fc" placeholder="Ex: Silva, Pereira, Costa…" required>
              <div class="fc-hint">Nome exibido na interface da família</div>
            </div>
            <div class="fg">
              <label class="fc-lbl">Subdomínio <span style="color:var(--err)">*</span></label>
              <div style="display:flex;">
                <input name="subdomain" id="prov-subdomain" type="text" class="fc" placeholder="silva" required
                  style="border-radius:8px 0 0 8px;border-right:none;"
                  pattern="[a-z0-9-]+" title="Apenas letras minúsculas, números e hífens">
                <span style="background:var(--hov);border:1px solid var(--bdr);border-left:none;border-radius:0 8px 8px 0;padding:9px 10px;font-size:11px;color:var(--t3);white-space:nowrap;">.${baseDomain}</span>
              </div>
              <div class="fc-hint">Letras minúsculas, números e hífens</div>
            </div>
            <div class="fg">
              <label class="fc-lbl">Plano</label>
              <select name="tier" class="fc">
                <option value="1">Free — até 10 bancos D1</option>
                <option value="2">Paid — até 50.000 bancos D1</option>
              </select>
            </div>
            <div class="fg" style="grid-column:1/-1;">
              <label class="fc-lbl">E-mail do Administrador <span style="color:var(--err)">*</span></label>
              <input name="ownerEmail" type="email" class="fc" placeholder="admin@familia.com" required>
              <div class="fc-hint">Receberá convite e link de acesso via e-mail</div>
            </div>
          </div>
          <button type="submit" id="prov-btn" class="btn btn-pri btn-lg" style="width:100%;margin-top:4px;">
            Provisionar Família
          </button>
        </form>
        <div id="prov-result" style="margin-top:14px;"></div>
      </div>

      <div class="info-panel">
        <div class="info-box">
          <div style="font-size:12px;font-weight:700;color:var(--t1);margin-bottom:12px;">O que é criado automaticamente</div>
          <div class="chk">
            <div class="chk-i"><span class="chk-ico">✓</span><span>Banco D1 exclusivo com schema completo</span></div>
            <div class="chk-i"><span class="chk-ico">✓</span><span>Aplicação no Cloudflare Access com política por e-mail</span></div>
            <div class="chk-i"><span class="chk-ico">✓</span><span>Registro de roteamento no KV (subdomínio → D1)</span></div>
            <div class="chk-i"><span class="chk-ico">✓</span><span>Todas as migrações SQL aplicadas automaticamente</span></div>
            <div class="chk-i"><span class="chk-ico">✓</span><span>E-mail de boas-vindas com link de acesso seguro</span></div>
          </div>
        </div>
        <div class="alr alr-warn" style="margin-bottom:0;">
          <span>⚠</span>
          <span>O processo leva até 30 segundos. Não feche a aba durante o provisionamento.</span>
        </div>
        <div id="prov-limits" class="info-box" style="display:none;"></div>
      </div>
    </div>
  </div>

  <!-- COMUNICADOS ─────────────────────────────────────────────── -->
  <div class="page" id="page-communications">
    <div class="prov-wrap" style="margin-top:6px;">
      <div class="prov-card">
        <div style="margin-bottom:20px;">
          <div style="font-size:16px;font-weight:700;color:var(--t1);margin-bottom:4px;">Novo Comunicado</div>
          <div style="font-size:12px;color:var(--t3);">Envie um email operacional para os responsáveis das famílias cadastradas.</div>
        </div>
        <div class="fg">
          <label class="fc-lbl">Tipo</label>
          <select id="comm-level" class="fc">
            <option value="info">ℹ️ Informativo</option>
            <option value="maintenance">🔧 Manutenção Programada</option>
            <option value="incident">🔴 Indisponibilidade</option>
            <option value="news">🚀 Novidade</option>
          </select>
        </div>
        <div class="fg">
          <label class="fc-lbl">Destinatários</label>
          <select id="comm-target" class="fc">
            <option value="all">Todas as famílias ativas</option>
          </select>
        </div>
        <div class="fg">
          <label class="fc-lbl">Assunto <span style="color:var(--err)">*</span></label>
          <input id="comm-subject" type="text" class="fc" placeholder="Ex: Manutenção programada — sábado 14h–16h">
        </div>
        <div class="fg">
          <label class="fc-lbl">Mensagem <span style="color:var(--err)">*</span></label>
          <textarea id="comm-message" class="fc" rows="8" style="resize:vertical;" placeholder="Escreva o comunicado aqui. Seja claro e objetivo.&#10;&#10;Ex: Realizaremos uma manutenção programada no sábado das 14h às 16h. Durante esse período o sistema ficará temporariamente indisponível."></textarea>
        </div>
        <button type="button" data-action="send-comm" id="comm-btn" class="btn btn-pri btn-lg" style="width:100%;">✉ Enviar Comunicado</button>
        <div id="comm-result" style="margin-top:14px;"></div>
      </div>

      <div style="display:flex;flex-direction:column;gap:14px;">
        <div class="tbl-card">
          <div class="tbl-head">
            <span class="tbl-ttl">Histórico</span>
            <button type="button" class="btn btn-sec" style="font-size:11px;padding:4px 9px;" data-action="refresh-comms">↺ Atualizar</button>
          </div>
          <div id="comm-history"><div class="empty">Carregando…</div></div>
        </div>
        <div class="alr alr-ok" style="margin-bottom:0;flex-direction:column;align-items:flex-start;gap:8px;padding:14px;">
          <div style="font-weight:700;font-size:12px;">Quando usar cada tipo</div>
          <div style="font-size:12px;color:var(--t2);display:flex;flex-direction:column;gap:5px;">
            <div>🔧 <strong>Manutenção</strong> — janela programada para updates</div>
            <div>🔴 <strong>Indisponibilidade</strong> — falha em produção ativa</div>
            <div>🚀 <strong>Novidade</strong> — novo recurso disponível</div>
            <div>ℹ️ <strong>Informativo</strong> — avisos gerais</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- STORAGE UPGRADES ─────────────────────────────────────── -->
  <div class="page" id="page-storage-upgrades">
    <div style="margin-top:6px;">
      <div class="tbl-card">
        <div class="tbl-head">
          <span class="tbl-ttl">💾 Pedidos de Upgrade de Armazenamento</span>
          <button type="button" class="btn btn-sec" style="font-size:11px;padding:4px 9px;" data-action="refresh-storage">↺ Atualizar</button>
        </div>
        <div style="padding:10px 16px;font-size:12px;color:var(--t2);border-bottom:1px solid var(--bdr);">
          Famílias que solicitaram upgrade do plano Free (300 MB) para o Paid (1 GB) por R$5,00/mês.
          Ao aprovar, o limite é imediatamente liberado. Confirme o pagamento externamente antes.
        </div>
        <div id="storage-upgrades-list"><div class="empty" style="padding:18px 16px;">Carregando…</div></div>
      </div>
    </div>
  </div>

  <!-- TELEMETRIA GLOBAL ─────────────────────────────────────── -->
  <div class="page" id="page-telemetry">
    <div style="margin-top:6px;">
      <div class="kpi-row" style="grid-template-columns:repeat(4,1fr);">
        <div class="kpi"><div class="kpi-lbl">Famílias Ativas</div><div class="kpi-val" id="tel-fam">—</div><div class="kpi-meta" id="tel-fam-meta">de todas as famílias</div><div class="kpi-bar"><div class="kpi-fill" id="tel-fam-fill" style="width:0;background:var(--ok)"></div></div></div>
        <div class="kpi"><div class="kpi-lbl">Usuários no Sistema</div><div class="kpi-val" id="tel-users">—</div><div class="kpi-meta">total entre famílias</div><div class="kpi-bar"><div class="kpi-fill" id="tel-users-fill" style="width:0;background:var(--acc)"></div></div></div>
        <div class="kpi"><div class="kpi-lbl">Req. Workers (24h)</div><div class="kpi-val" id="tel-req">—</div><div class="kpi-meta" id="tel-err">carregando…</div><div class="kpi-bar"><div class="kpi-fill" id="tel-req-fill" style="width:0;background:var(--warn)"></div></div></div>
        <div class="kpi"><div class="kpi-lbl">D1 Total Usado</div><div class="kpi-val" id="tel-d1">—</div><div class="kpi-meta">MB nos bancos ativos</div><div class="kpi-bar"><div class="kpi-fill" id="tel-d1-fill" style="width:0;background:var(--acc2)"></div></div></div>
      </div>
      <div class="chart-row">
        <div class="chart-card" style="grid-column:1/-1;">
          <div class="chart-ttl">Requisições Workers — últimas 24h (por meia hora)</div>
          <div class="chart-wrap" style="height:180px;"><canvas id="chart-tel-req"></canvas></div>
        </div>
      </div>
      <div class="tbl-card">
        <div class="tbl-head"><span class="tbl-ttl">Uso por Família</span><button type="button" class="btn btn-sec" style="font-size:11px;padding:4px 9px;" data-action="refresh-telemetry">↺ Atualizar</button></div>
        <div id="tel-fam-table"><div class="empty">Carregando…</div></div>
      </div>
    </div>
  </div>

  <!-- TELEMETRIA FAMÍLIA ──────────────────────────────────────── -->
  <div class="page" id="page-fam-telemetry">
    <div style="margin-top:6px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <button type="button" class="btn btn-sec" data-nav="families">← Voltar</button>
        <div style="font-size:15px;font-weight:700;" id="ftel-title">—</div>
        <button class="btn btn-sec" style="font-size:11px;" id="ftel-refresh">↺ Atualizar</button>
      </div>
      <div class="kpi-row" style="grid-template-columns:repeat(4,1fr);">
        <div class="kpi"><div class="kpi-lbl">Usuários</div><div class="kpi-val" id="ftel-users">—</div><div class="kpi-meta">ativos no banco</div></div>
        <div class="kpi"><div class="kpi-lbl">Transações</div><div class="kpi-val" id="ftel-tx">—</div><div class="kpi-meta">total</div></div>
        <div class="kpi"><div class="kpi-lbl">Tamanho D1</div><div class="kpi-val" id="ftel-d1">—</div><div class="kpi-meta">MB</div></div>
        <div class="kpi"><div class="kpi-lbl">Arquivos R2</div><div class="kpi-val" id="ftel-r2">—</div><div class="kpi-meta" id="ftel-r2-meta">objetos</div></div>
      </div>
      <div class="chart-row">
        <div class="chart-card">
          <div class="chart-ttl">Transações — últimos 7 dias</div>
          <div class="chart-wrap" style="height:180px;"><canvas id="chart-ftel-tx"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-ttl">Tabelas — contagem de registros</div>
          <div class="chart-wrap" style="height:180px;"><canvas id="chart-ftel-tables"></canvas></div>
        </div>
      </div>
      <div class="tbl-card">
        <div class="tbl-head"><span class="tbl-ttl">Usuários da Família</span></div>
        <div id="ftel-users-table"><div class="empty">Carregando…</div></div>
      </div>
    </div>
  </div>

  <!-- SEGURANÇA ───────────────────────────────────────────────── -->
  <div class="page" id="page-security">
    <div style="margin-top:6px;">
      <div class="kpi-row" style="grid-template-columns:repeat(4,1fr);">
        <div class="kpi"><div class="kpi-lbl">Bloqueados (24h)</div><div class="kpi-val" id="sec-blocked">—</div><div class="kpi-meta">pelo firewall CF</div><div class="kpi-bar"><div class="kpi-fill" id="sec-blocked-fill" style="width:0;background:var(--err)"></div></div></div>
        <div class="kpi"><div class="kpi-lbl">IPs em Rate Limit</div><div class="kpi-val" id="sec-rl">—</div><div class="kpi-meta">ativos no KV</div><div class="kpi-bar"><div class="kpi-fill" id="sec-rl-fill" style="width:0;background:var(--warn)"></div></div></div>
        <div class="kpi"><div class="kpi-lbl">Hits Rate Limit Total</div><div class="kpi-val" id="sec-rl-total">—</div><div class="kpi-meta">tentativas bloqueadas</div></div>
        <div class="kpi"><div class="kpi-lbl">Países Atacantes</div><div class="kpi-val" id="sec-countries">—</div><div class="kpi-meta">no período</div></div>
      </div>
      <div class="chart-row">
        <div class="chart-card">
          <div class="chart-ttl">Firewall — Ações (24h)</div>
          <div class="chart-wrap" style="height:180px;"><canvas id="chart-sec-actions"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-ttl">Requisições HTTP — por hora</div>
          <div class="chart-wrap" style="height:180px;"><canvas id="chart-sec-http"></canvas></div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;">
        <div class="tbl-card">
          <div class="tbl-head"><span class="tbl-ttl">Top IPs Bloqueados</span></div>
          <div id="sec-ips-table"><div class="empty">Carregando…</div></div>
        </div>
        <div class="tbl-card">
          <div class="tbl-head"><span class="tbl-ttl">IPs em Rate Limit (KV)</span></div>
          <div id="sec-rl-table"><div class="empty">Carregando…</div></div>
        </div>
      </div>
      <div class="tbl-card">
        <div class="tbl-head"><span class="tbl-ttl">Países de Origem (Ataques)</span><button type="button" class="btn btn-sec" style="font-size:11px;padding:4px 9px;" data-action="refresh-security">↺ Atualizar</button></div>
        <div id="sec-countries-table"><div class="empty">Carregando…</div></div>
      </div>
    </div>
  </div>

</div><!-- /main -->

<!-- ── MODAL: Detalhe da Família ─────────────────────────────── -->
<div class="modal-bg" id="modal-bg">
  <div class="modal">
    <div class="mhdr">
      <div>
        <div class="m-ttl" id="m-name">—</div>
        <div id="m-badges" style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;"></div>
      </div>
      <button class="m-x" id="modal-close">×</button>
    </div>
    <div class="mbdy">
      <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.7px;margin-bottom:9px;">Banco de Dados D1</div>
      <div id="m-stats"></div>
      <div style="font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.7px;margin:16px 0 9px;">📜 Auditoria de Consentimentos & Isenção de IA (LGPD)</div>
      <div id="m-consents" style="max-height:220px;overflow-y:auto;"></div>
    </div>
    <div class="mftr">
      <a id="m-link" href="#" target="_blank" rel="noopener noreferrer" class="btn btn-sec" style="font-size:11px;padding:5px 10px;">↗ Abrir Site</a>
      <button id="m-toggle" class="btn btn-warn" style="font-size:11px;padding:5px 10px;"></button>
      <div style="flex:1;"></div>
      <button id="m-delete" class="btn btn-err" style="font-size:11px;padding:5px 10px;">Excluir</button>
    </div>
  </div>
</div>

<!-- TOAST -->
<div id="toast"></div>

<script nonce="${nonce}">
// ── State ─────────────────────────────────────────────────────────
var allFams     = [];
var nocLoaded   = false;
var modalSub    = null;
var modalTenant = null;
var charts      = {};

// ── Helpers ───────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

// HTML escape — aplicar em TODO dado vindo de tenants/usuários antes de injetar via innerHTML.
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmt(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  var k = 1024, sz = ['B','KB','MB','GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + '\xA0' + sz[i];
}

function fmtN(n) { return Number(n).toLocaleString('pt-BR'); }

function fmtDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' });
}

function badge(s) { var e = esc(s); return '<span class="bdg bdg-' + e + '">' + e + '</span>'; }

function tierBadge(t) {
  return t === 2 ? '<span class="bdg bdg-paid">Paid</span>' : '<span class="bdg bdg-free">Free</span>';
}

function spinner(msg) {
  return '<div style="display:flex;align-items:center;gap:8px;color:var(--t2);font-size:13px;padding:8px 0;">'
       + '<span class="spin">⟳</span>' + (msg || 'Carregando…') + '</div>';
}

function err(msg) {
  return '<div class="alr alr-err"><span>⚠</span><span>' + msg + '</span></div>';
}

function showToast(msg, ok) {
  var e = el('toast');
  e.textContent = msg;
  e.style.background = ok === false ? 'rgba(240,75,75,.15)' : 'rgba(14,201,126,.15)';
  e.style.border = ok === false ? '1px solid rgba(240,75,75,.35)' : '1px solid rgba(14,201,126,.35)';
  e.style.color  = ok === false ? '#f04b4b' : '#0ec97e';
  e.style.opacity = '1';
  clearTimeout(e._tid);
  e._tid = setTimeout(function() { e.style.opacity = '0'; }, 3500);
}

// ── API ───────────────────────────────────────────────────────────
async function api(method, path, body, ms, extraHeaders) {
  if (ms === undefined) ms = 15000;
  var ctrl = new AbortController();
  var tid  = setTimeout(function() { ctrl.abort(); }, ms);
  try {
    var headers = body ? { 'Content-Type': 'application/json' } : {};
    // CSRF guard — header customizado em todas as chamadas (idempotente para GET)
    headers['X-Requested-With'] = 'fetch';
    if (extraHeaders) {
      for (var k in extraHeaders) headers[k] = extraHeaders[k];
    }
    var r = await fetch('/api' + path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    var ct = r.headers.get('content-type') || '';
    if (!ct.includes('json')) {
      if (r.url && r.url.includes('cloudflareaccess.com'))
        return { error: 'Sessão expirada. Recarregue a página.' };
      return { error: 'Resposta inesperada (' + r.status + '). Recarregue a página.' };
    }
    return await r.json();
  } catch (e) {
    clearTimeout(tid);
    if (e && e.name === 'AbortError') return { error: 'Timeout após ' + (ms/1000) + 's.' };
    return { error: String((e && e.message) || e) };
  }
}

// ── Navigation ────────────────────────────────────────────────────
var PAGE_TITLES = {
  dashboard: 'Dashboard',
  noc: 'Infraestrutura NOC',
  families: 'Famílias',
  provision: 'Provisionar Nova Família',
  communications: 'Comunicados',
  'storage-upgrades': 'Upgrades de Storage',
  telemetry: 'Telemetria Global',
  'fam-telemetry': 'Telemetria da Família',
  security: 'Segurança & Ataques'
};

function nav(name) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.sb-item').forEach(function(b) { b.classList.remove('active'); });
  var page = el('page-' + name);
  var navBtn = el('nav-' + name);
  if (page) page.classList.add('active');
  if (navBtn) navBtn.classList.add('active');
  el('topbar-title').textContent = PAGE_TITLES[name] || name;
  if (name === 'dashboard') loadDashboard();
  if (name === 'noc' && !nocLoaded) loadNOC();
  if (name === 'families') loadFamilies();
  if (name === 'telemetry') loadTelemetry();
  if (name === 'security') loadSecurity();
  if (name === 'communications') loadCommunications();
  if (name === 'storage-upgrades') loadStorageUpgrades();
}

function refreshCurrent() {
  var active = document.querySelector('.sb-item.active');
  if (!active) return;
  var name = active.dataset.nav;
  if (name === 'noc') { nocLoaded = false; }
  nav(name);
}

// ── Charts ────────────────────────────────────────────────────────
function initStatusChart(active, suspended, deleted) {
  var canvas = el('chart-status');
  if (!canvas || typeof Chart === 'undefined') return;
  if (charts.status) { charts.status.destroy(); charts.status = null; }
  var total = active + suspended + deleted;
  charts.status = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Ativas', 'Suspensas', 'Excluídas'],
      datasets: [{
        data: [active, suspended, deleted],
        backgroundColor: ['rgba(14,201,126,.7)', 'rgba(245,166,35,.7)', 'rgba(240,75,75,.65)'],
        borderColor:      ['#0ec97e', '#f5a623', '#f04b4b'],
        borderWidth: 1.5, borderRadius: 7, borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 500 },
      scales: {
        x: { ticks: { color: '#4a5878', font: { size: 12, weight: '600' } },
             grid: { display: false }, border: { display: false } },
        y: { beginAtZero: true,
             ticks: { color: '#8a96b0', font: { size: 10 }, stepSize: 1 },
             grid: { color: 'rgba(0,0,0,.06)' }, border: { display: false } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function(ctx) {
          return ' ' + ctx.raw + ' (' + (total > 0 ? Math.round(ctx.raw/total*100) : 0) + '%)';
        }}}
      }
    }
  });
}

function initResourceChart(d1Cur, d1Lim, ztCur, ztLim) {
  var canvas = el('chart-res');
  if (!canvas || typeof Chart === 'undefined') return;
  if (charts.res) { charts.res.destroy(); charts.res = null; }
  var d1Pct = d1Lim > 0 ? Math.min(d1Cur / d1Lim * 100, 100) : 0;
  var ztPct = ztLim > 0 ? Math.min(ztCur / ztLim * 100, 100) : 0;
  var cfg = {
    type: 'bar',
    data: {
      labels: ['Bancos D1', 'Usuários ZT'],
      datasets: [
        { label: 'Usado', data: [d1Pct, ztPct],
          backgroundColor: ['rgba(79,112,247,.65)', 'rgba(245,166,35,.65)'],
          borderColor: ['#4f70f7','#f5a623'], borderWidth: 1.5, borderRadius: 4
        },
        { label: 'Disponível', data: [100 - d1Pct, 100 - ztPct],
          backgroundColor: ['rgba(255,255,255,.04)', 'rgba(255,255,255,.04)'],
          borderColor: ['rgba(255,255,255,.06)', 'rgba(255,255,255,.06)'], borderWidth: 1, borderRadius: 4
        }
      ]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      animation: { duration: 600 },
      scales: {
        x: { stacked: true, max: 100, display: true,
          ticks: { color: '#8a96b0', font: { size: 10 }, callback: function(v) { return v + '%'; } },
          grid: { color: 'rgba(0,0,0,.06)' }, border: { display: false }
        },
        y: { stacked: true, ticks: { color: '#4a5878', font: { size: 12 } }, grid: { display: false }, border: { display: false } }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: function(ctx) {
            if (ctx.datasetIndex !== 0) return null;
            var idx = ctx.dataIndex;
            var cur = idx === 0 ? d1Cur : ztCur;
            var lim = idx === 0 ? d1Lim : ztLim;
            return ' ' + cur + ' / ' + lim + ' (' + Math.round(ctx.raw) + '%)';
          }}
        }
      }
    }
  };
  charts.res = new Chart(canvas, cfg);
}

// ── Dashboard ─────────────────────────────────────────────────────
async function loadDashboard() {
  el('kpi-fam').textContent = '—';
  el('kpi-d1').textContent  = '—';
  el('kpi-zt').textContent  = '—';
  el('kpi-rate').textContent = '—';
  el('dash-fam-table').innerHTML = spinner('Carregando dados…');

  var results = await Promise.all([api('GET', '/health'), api('GET', '/families')]);
  var health = results[0], famData = results[1];

  if (health.error) {
    el('kpi-fam').textContent = 'Erro';
    el('dash-fam-table').innerHTML = '<div class="empty"><div class="alr alr-err" style="display:inline-flex;gap:6px;align-items:center;">⚠ ' + esc(health.error) + '</div></div>';
    return;
  }

  var fams = famData.families || [];
  allFams = fams;

  var total   = fams.length;
  var active  = fams.filter(function(f) { return f.status === 'active'; }).length;
  var susp    = fams.filter(function(f) { return f.status === 'suspended'; }).length;
  var deleted = fams.filter(function(f) { return f.status === 'deleted'; }).length;

  el('kpi-fam').textContent    = total;
  el('kpi-fam-meta').textContent = active + ' ativas, ' + susp + ' suspensas';
  el('kpi-fam-fill').style.width = Math.min(total / 50 * 100, 100) + '%';

  var d1 = (health.limits && health.limits.d1) || {};
  var d1Cur = d1.current || 0, d1Lim = d1.freeLimit || 10;
  el('kpi-d1').textContent = d1Cur;
  el('kpi-d1-meta').textContent = d1Cur + ' / ' + d1Lim + ' (' + Math.round(d1Cur/d1Lim*100) + '%)';
  var d1Pct = Math.min(d1Cur / d1Lim * 100, 100);
  el('kpi-d1-fill').style.width = d1Pct + '%';
  el('kpi-d1-fill').style.background = d1Pct > 80 ? 'var(--err)' : d1Pct > 60 ? 'var(--warn)' : 'var(--ok)';

  var zt = (health.limits && health.limits.zt) || {};
  var ztCur = zt.current || 0, ztLim = zt.freeLimit || 50;
  el('kpi-zt').textContent = ztCur;
  el('kpi-zt-meta').textContent = ztCur + ' / ' + ztLim + ' usuários ZT';
  el('kpi-zt-fill').style.width = Math.min(ztCur/ztLim*100, 100) + '%';

  var rate = total > 0 ? Math.round(active / total * 100) : 0;
  el('kpi-rate').textContent = rate + '%';
  el('kpi-rate-meta').textContent = active + ' de ' + total + ' famílias';
  el('kpi-rate-fill').style.width = rate + '%';
  el('kpi-rate-fill').style.background = rate > 80 ? 'var(--ok)' : rate > 50 ? 'var(--warn)' : 'var(--err)';

  // Alerts
  var alertsEl = el('dash-alerts');
  alertsEl.innerHTML = '';
  var alerts = (famData.alerts || (health.alerts) || []);
  alerts.forEach(function(a) {
    alertsEl.innerHTML += '<div class="alr alr-warn"><span>⚠</span><span>' + esc(a) + '</span></div>';
  });

  // Charts
  setTimeout(function() {
    initStatusChart(active, susp, deleted);
    initResourceChart(d1Cur, d1Lim, ztCur, ztLim);
  }, 50);

  // Recent table
  var recent = fams.slice(0, 8);
  if (!recent.length) {
    el('dash-fam-table').innerHTML = '<div class="empty"><div class="empty-ico">👥</div><div>Nenhuma família cadastrada ainda.</div></div>';
    return;
  }
  var rows = recent.map(function(f) {
    return '<tr data-action="detail" data-sub="' + esc(f.subdomain) + '">'
      + '<td class="row-fam-name">' + esc(f.name) + '</td>'
      + '<td><span class="mono" style="color:var(--acc2);font-size:12px;">' + esc(f.subdomain) + '</span></td>'
      + '<td>' + tierBadge(f.tier) + '</td>'
      + '<td>' + badge(f.status) + '</td>'
      + '<td style="color:var(--t2);font-size:12px;">' + fmtDate(f.createdAt) + '</td>'
      + '</tr>';
  }).join('');
  el('dash-fam-table').innerHTML = '<table>'
    + '<thead><tr><th>Nome</th><th>Subdomínio</th><th>Plano</th><th>Status</th><th>Criação</th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table>';

  // Update timestamp
  el('sb-ts').textContent = 'Atualizado ' + new Date().toLocaleTimeString('pt-BR');
}

// ── NOC ───────────────────────────────────────────────────────────
async function loadNOC() {
  nocLoaded = false;
  el('noc-wrap').innerHTML = '<div class="empty"><div class="spin" style="font-size:22px;">⟳</div><div style="margin-top:10px;">Consultando infraestrutura Cloudflare…</div></div>';
  var data = await api('GET', '/noc', null, 35000);
  if (data.error) {
    el('noc-wrap').innerHTML = '<div class="alr alr-err"><span>⚠</span><span>' + esc(data.error) + '</span></div>';
    return;
  }
  nocLoaded = true;
  renderNOC(data);
}

function renderNOC(data) {
  var s   = data.summary || {};
  var dbs = data.databases || [];
  var r2  = data.r2Buckets || [];

  // KPI cards
  var kpiHtml = '<div class="noc-kpi">'
    + nocCard('D1 Total (Bytes)', fmt(s.totalD1Bytes || 0), 'Armazenamento usado')
    + nocCard('Famílias Ativas', s.active || 0, 'Bancos acessíveis')
    + nocCard('Famílias Suspensas', s.suspended || 0, 'Acesso bloqueado')
    + nocCard('R2 Buckets', r2.length, 'Armazenamento de arquivos')
    + '</div>';

  // D1 chart — só renderiza se houver pelo menos um banco com tamanho conhecido
  var hasD1Size = dbs.some(function(db) { return (db.fileSize || 0) > 0; });
  var chartHtml = '';
  if (dbs.length > 0 && hasD1Size) {
    var chartH = Math.min(dbs.length, 15) * 32 + 20;
    chartHtml = '<div class="chart-card" style="margin-bottom:18px;">'
      + '<div class="chart-ttl">Armazenamento D1 por Família (Top ' + Math.min(dbs.length, 15) + ')</div>'
      + '<div style="position:relative;height:' + chartH + 'px;">'
      + '<canvas id="chart-noc-d1"></canvas>'
      + '</div></div>';
  } else if (dbs.length > 0) {
    chartHtml = '<div class="alr alr-ok" style="margin-bottom:18px;">'
      + '<span>ℹ</span><span>A CF D1 API reporta tamanho 0 para bancos pequenos (&lt; 1 MB). '
      + 'O armazenamento real existe mas não é quantificável via API de gestão neste nível.</span></div>';
  }

  // D1 Table
  var tableRows = dbs.map(function(db) {
    var pct = s.totalD1Bytes > 0 ? Math.min(db.fileSize / s.totalD1Bytes * 100, 100) : 0;
    var sizeColor = db.fileSize > 5000000 ? 'color:var(--warn)' : db.fileSize > 1000000 ? 'color:var(--t1)' : 'color:var(--t2)';
    return '<tr data-action="detail" data-sub="' + esc(db.subdomain) + '">'
      + '<td class="row-fam-name">' + esc(db.name)
        + (db.error ? ' <span style="color:var(--err);font-size:10px;" title="' + esc(db.error) + '">⚠</span>' : '') + '</td>'
      + '<td><span class="mono" style="color:var(--acc2);font-size:11px;">' + esc(db.subdomain) + '</span></td>'
      + '<td><span class="mono" style="color:var(--t3);font-size:10px;">' + esc(db.dbId ? db.dbId.slice(0,12) + '…' : '—') + '</span></td>'
      + '<td style="' + sizeColor + '">' + (db.fileSize > 0 ? fmt(db.fileSize) : '<span style="color:var(--t3);font-size:11px;">< 1 KB</span>')
        + '<div class="d1-bar" style="width:80px;"><div class="d1-fill" style="width:' + pct.toFixed(1) + '%"></div></div></td>'
      + '<td style="color:var(--t2);">' + (db.numTables || 0) + ' tabelas</td>'
      + '<td>' + badge(db.status) + '</td>'
      + '</tr>';
  }).join('');

  var tableHtml = '<div class="tbl-card" style="margin-bottom:18px;">'
    + '<div class="tbl-head"><span class="tbl-ttl">Bancos D1</span>'
    + '<button type="button" class="btn btn-sec" style="font-size:11px;padding:4px 9px;" data-action="refresh-noc">↺ Atualizar</button>'
    + '</div>'
    + (dbs.length > 0
      ? '<table><thead><tr><th>Família</th><th>Subdomínio</th><th>D1 ID</th><th>Tamanho</th><th>Tabelas</th><th>Status</th></tr></thead>'
        + '<tbody>' + tableRows + '</tbody></table>'
      : '<div class="empty">Nenhum banco encontrado.</div>')
    + '</div>';

  // R2
  var r2Html = '<div class="tbl-card">'
    + '<div class="tbl-head"><span class="tbl-ttl">R2 Buckets</span></div>'
    + '<div style="padding:14px 16px;display:flex;flex-wrap:wrap;gap:10px;">'
    + (r2.length > 0
      ? r2.map(function(b) {
          return '<div style="background:var(--surf);border:1px solid var(--bdr);border-radius:9px;padding:11px 14px;min-width:180px;">'
            + '<div style="font-size:13px;font-weight:600;color:var(--t1);">' + esc(b.name) + '</div>'
            + '<div style="font-size:11px;color:var(--t3);margin-top:3px;">' + (b.creation_date ? fmtDate(b.creation_date) : '—') + '</div>'
            + '</div>';
        }).join('')
      : '<div style="color:var(--t3);font-size:13px;padding:8px 0;">Nenhum bucket encontrado. Verifique permissões R2:Read do token.</div>')
    + '</div></div>';

  el('noc-wrap').innerHTML = kpiHtml + chartHtml + tableHtml + r2Html;

  // NOC D1 chart
  if (dbs.length > 0 && hasD1Size) {
    var top = dbs.slice(0, 15);
    var labels = top.map(function(db) { return db.subdomain; });
    var values = top.map(function(db) { return Math.round((db.fileSize || 0) / 1024); });
    setTimeout(function() {
      var canvas = el('chart-noc-d1');
      if (!canvas || typeof Chart === 'undefined') return;
      if (charts.d1) { charts.d1.destroy(); charts.d1 = null; }
      charts.d1 = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{ label: 'KB', data: values,
            backgroundColor: 'rgba(79,112,247,.6)', borderColor: '#4f70f7',
            borderWidth: 1, borderRadius: 4
          }]
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          animation: { duration: 500 },
          scales: {
            x: { ticks: { color:'#8a96b0', font:{size:10}, callback: function(v) { return v + ' KB'; } },
              grid: { color:'rgba(0,0,0,.06)' }, border:{display:false} },
            y: { ticks: { color:'#4a5878', font:{size:11} }, grid:{display:false}, border:{display:false} }
          },
          plugins: { legend:{display:false},
            tooltip: { callbacks: { label: function(ctx) { return ' ' + fmt(ctx.raw * 1024); } } }
          }
        }
      });
    }, 60);
  }
}

function nocCard(label, val, hint) {
  return '<div class="noc-card"><div class="noc-lbl">' + label + '</div>'
       + '<div class="noc-val">' + val + '</div>'
       + '<div class="noc-hint">' + hint + '</div></div>';
}

// ── Families ──────────────────────────────────────────────────────
async function loadFamilies() {
  el('families-container').innerHTML = spinner('Carregando famílias…');
  var data = await api('GET', '/families');
  if (data.error) {
    el('families-container').innerHTML = err(esc(data.error));
    return;
  }
  allFams = data.families || [];
  renderFamilies(allFams);
}

function filterFamilies() {
  var q   = el('fam-search').value.toLowerCase();
  var st  = el('fam-status').value;
  var tr  = el('fam-tier').value;
  renderFamilies(allFams.filter(function(f) {
    var matchQ  = !q  || f.name.toLowerCase().includes(q) || f.subdomain.includes(q);
    var matchSt = !st || f.status === st;
    var matchTr = !tr || String(f.tier) === tr;
    return matchQ && matchSt && matchTr;
  }));
}

function renderFamilies(fams) {
  if (!fams.length) {
    el('families-container').innerHTML = '<div class="empty"><div class="empty-ico">⊞</div><div>Nenhuma família encontrada.</div></div>';
    return;
  }
  var rows = fams.map(function(f) {
    var sub = esc(f.subdomain);
    var actions = '<button class="btn btn-sec" style="font-size:11px;padding:4px 9px;" data-action="detail" data-sub="' + sub + '">Detalhes</button>';
    if (f.status === 'active')    actions += ' <button class="btn btn-warn" style="font-size:11px;padding:4px 9px;" data-action="suspend" data-sub="' + sub + '">Suspender</button>';
    if (f.status === 'suspended') actions += ' <button class="btn btn-ok" style="font-size:11px;padding:4px 9px;" data-action="activate" data-sub="' + sub + '">Reativar</button>';
    if (f.status === 'active')    actions += ' <button class="btn btn-sec" style="font-size:11px;padding:4px 9px;" data-action="wipe" data-sub="' + sub + '" title="Apaga contas, lançamentos, cartões e seed demo">Limpar dados</button>';
    if (f.status !== 'deleted')   actions += ' <button class="btn btn-err" style="font-size:11px;padding:4px 9px;" data-action="delete" data-sub="' + sub + '">Excluir</button>';
    actions += ' <button class="btn" style="font-size:11px;padding:4px 9px;background:rgba(79,112,247,.1);color:var(--acc2);border:1px solid rgba(79,112,247,.25);" data-action="telemetry" data-sub="' + sub + '">◎ Stats</button>';
    return '<tr>'
      + '<td class="row-fam-name" style="cursor:pointer;" data-action="detail" data-sub="' + sub + '">' + esc(f.name) + '</td>'
      + '<td><span class="mono" style="color:var(--acc2);font-size:12px;">' + sub + '</span></td>'
      + '<td>' + tierBadge(f.tier) + '</td>'
      + '<td>' + badge(f.status) + '</td>'
      + '<td style="color:var(--t2);font-size:12px;">' + fmtDate(f.createdAt) + '</td>'
      + '<td style="text-align:right;">' + actions + '</td>'
      + '</tr>';
  }).join('');
  el('families-container').innerHTML = '<div class="tbl-card"><table>'
    + '<thead><tr><th>Nome</th><th>Subdomínio</th><th>Plano</th><th>Status</th><th>Criação</th><th style="text-align:right;">Ações</th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table>'
    + '<div style="padding:10px 16px;font-size:11px;color:var(--t3);">' + fams.length + ' família(s) encontrada(s)</div>'
    + '</div>';
}

async function updateStatus(sub, status) {
  var data = await api('PUT', '/families/' + sub, { status: status });
  if (data.success) {
    showToast(status === 'active' ? 'Família reativada.' : 'Família suspensa.');
    loadFamilies();
  } else { showToast(data.error || 'Erro ao atualizar.', false); }
}

async function deleteFamily(sub) {
  if (!confirm('Excluir família "' + sub + '"? A família será marcada como excluída.')) return;
  var data = await api('DELETE', '/families/' + sub, null, 30000, { 'X-Confirm-Subdomain': sub });
  if (data.success) { showToast('Família excluída.'); loadFamilies(); }
  else showToast(data.error || 'Erro ao excluir.', false);
}

async function wipeFamilyData(sub) {
  if (!confirm('Limpar TODOS os dados financeiros de "' + sub + '"?\\n\\nRemove contas, lançamentos, cartões, orçamentos, metas e seed demo.\\nMantém usuários, categorias e aceite LGPD.')) return;
  if (!confirm('Confirma limpeza de "' + sub + '"? Esta ação não tem desfazer.')) return;
  var data = await api('POST', '/families/' + sub + '/wipe-data', {}, 60000, { 'X-Confirm-Subdomain': sub });
  if (data.success) showToast('Dados de "' + sub + '" limpos. Família pronta para uso.');
  else showToast(data.error || ('Limpeza parcial: ' + ((data.errors || []).join('; ') || 'erro')), false);
}

// ── Telemetria Global ─────────────────────────────────────────────
async function loadTelemetry() {
  el('tel-fam').textContent = '—'; el('tel-users').textContent = '—';
  el('tel-req').textContent = '—'; el('tel-d1').textContent = '—';
  el('tel-fam-table').innerHTML = spinner('Carregando telemetria…');
  var d = await api('GET', '/telemetry/global', null, 45000);
  if (d.error) { el('tel-fam-table').innerHTML = err(esc(d.error)); return; }
  var s = d.summary || {};
  el('tel-fam').textContent  = s.activeFamilies ?? '—';
  el('tel-fam-meta').textContent = (s.totalFamilies || 0) + ' total (' + (s.suspendedFamilies || 0) + ' susp / ' + (s.deletedFamilies || 0) + ' del)';
  setFill('tel-fam-fill', s.activeFamilies, s.totalFamilies);
  el('tel-users').textContent = s.totalUsers ?? '—';
  setFill('tel-users-fill', s.totalUsers, 100);
  var req = d.workers || {};
  el('tel-req').textContent = fmtNum(req.totalRequests);
  el('tel-err').textContent = 'Erros: ' + fmtNum(req.totalErrors) + ' (' + (req.errorRate || '0.00') + '%)';
  setFill('tel-req-fill', req.totalErrors, req.totalRequests);
  var mb = ((s.totalD1Bytes || 0) / 1048576).toFixed(1);
  el('tel-d1').textContent = mb + ' MB';
  setFill('tel-d1-fill', s.totalD1Bytes, 1073741824); // 1 GB reference

  // Sparkline chart
  var tl = req.requestsTimeline || {};
  var labels = Object.keys(tl).sort();
  var vals   = labels.map(function(k) { return tl[k]; });
  drawSparkline('chart-tel-req', labels, vals, '#4f70f7', 'Requests');

  // Families usage table
  var fams = d.families || [];
  if (!fams.length) { el('tel-fam-table').innerHTML = '<div class="empty">Sem dados de famílias.</div>'; return; }
  var maxD1 = Math.max.apply(null, fams.map(function(f) { return f.d1FileSizeBytes || 0; }));
  var rows = fams.map(function(f) {
    var mb = ((f.d1FileSizeBytes || 0) / 1048576).toFixed(2);
    var pct = maxD1 > 0 ? Math.round((f.d1FileSizeBytes || 0) / maxD1 * 100) : 0;
    var bar = '<div style="background:rgba(79,112,247,.12);border-radius:4px;height:8px;width:100%;margin-top:3px;">'
            + '<div style="background:var(--acc);border-radius:4px;height:8px;width:' + pct + '%;"></div></div>';
    var sub = esc(f.subdomain);
    return '<tr>'
      + '<td style="cursor:pointer;" data-action="telemetry" data-sub="' + sub + '">' + esc(f.name) + '</td>'
      + '<td><span class="mono" style="font-size:12px;color:var(--acc2);">' + sub + '</span></td>'
      + '<td style="color:var(--t2);font-size:12px;">' + (f.users | 0) + '</td>'
      + '<td style="color:var(--t2);font-size:12px;">' + (f.txLast24h | 0) + '</td>'
      + '<td style="min-width:120px;"><div style="font-size:11px;color:var(--t2);">' + mb + ' MB</div>' + bar + '</td>'
      + '<td style="text-align:right;"><button class="btn" style="font-size:11px;padding:3px 8px;background:rgba(79,112,247,.1);color:var(--acc2);border:1px solid rgba(79,112,247,.25);" data-action="telemetry" data-sub="' + sub + '">Detalhes</button></td>'
      + '</tr>';
  }).join('');
  el('tel-fam-table').innerHTML = '<table>'
    + '<thead><tr><th>Família</th><th>Subdomínio</th><th>Usuários</th><th>TX(24h)</th><th>D1</th><th style="text-align:right;">Ação</th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table>';
}

// ── Telemetria por Família ────────────────────────────────────────
async function openFamilyTelemetry(sub) {
  var navItem = el('nav-fam-telemetry');
  var fam = (allFams || []).find(function(f) { return f.subdomain === sub; });
  var name = fam ? fam.name : sub;
  if (navItem) { navItem.style.display = ''; el('nav-fam-tel-lbl').textContent = name; }
  nav('fam-telemetry');
  el('ftel-title').textContent = name + ' — ' + sub;
  el('ftel-users').textContent = '—'; el('ftel-tx').textContent = '—';
  el('ftel-d1').textContent = '—'; el('ftel-r2').textContent = '—';
  el('ftel-users-table').innerHTML = spinner('Carregando…');
  el('ftel-refresh').onclick = function() { openFamilyTelemetry(sub); };
  var d = await api('GET', '/telemetry/family/' + sub);
  if (d.error) { el('ftel-users-table').innerHTML = err(esc(d.error)); return; }
  var d1 = d.d1 || {}; var r2 = d.r2 || {};
  el('ftel-users').textContent = (d1.tables || {}).users || 0;
  el('ftel-tx').textContent    = fmtNum((d1.tables || {}).transactions || 0);
  el('ftel-d1').textContent    = ((d1.fileSizeBytes || 0) / 1048576).toFixed(2) + ' MB';
  el('ftel-r2').textContent    = r2.objects || 0;
  el('ftel-r2-meta').textContent = ((r2.bytes || 0) / 1048576).toFixed(2) + ' MB';

  // 7-day TX chart
  var tl = d.txTimeline || [];
  drawSparkline('chart-ftel-tx', tl.map(function(r) { return r.day; }), tl.map(function(r) { return r.n; }), '#0ec97e', 'Transações');

  // Tables bar chart
  var tables = d1.tables || {};
  var tKeys = Object.keys(tables);
  var tVals = tKeys.map(function(k) { return tables[k]; });
  drawBars('chart-ftel-tables', tKeys, tVals);

  // Users table
  var users = d.recentUsers || [];
  if (!users.length) { el('ftel-users-table').innerHTML = '<div class="empty">Nenhum usuário.</div>'; return; }
  var uRows = users.map(function(u) {
    var roleClass = u.role === 'admin' ? 'warn' : 'ok';
    return '<tr>'
      + '<td>' + esc(u.name || '—') + '</td>'
      + '<td style="color:var(--t2);font-size:12px;">' + esc(u.email || '—') + '</td>'
      + '<td><span class="badge badge-' + roleClass + '">' + esc(u.role || 'user') + '</span></td>'
      + '<td style="color:var(--t3);font-size:12px;">' + fmtDate(u.created_at) + '</td>'
      + '</tr>';
  }).join('');
  el('ftel-users-table').innerHTML = '<table>'
    + '<thead><tr><th>Nome</th><th>Email</th><th>Role</th><th>Criação</th></tr></thead>'
    + '<tbody>' + uRows + '</tbody></table>';
}

// ── Segurança ────────────────────────────────────────────────────
async function loadSecurity() {
  el('sec-blocked').textContent = '—'; el('sec-rl').textContent = '—';
  el('sec-rl-total').textContent = '—'; el('sec-countries').textContent = '—';
  el('sec-ips-table').innerHTML = spinner('Carregando…');
  el('sec-rl-table').innerHTML = spinner('Carregando…');
  el('sec-countries-table').innerHTML = spinner('Carregando…');
  var d = await api('GET', '/telemetry/security', null, 30000);
  if (d.error) { el('sec-ips-table').innerHTML = err(esc(d.error)); return; }
  var fw = d.firewall || {}; var rl = d.rateLimits || {};

  el('sec-blocked').textContent  = fmtNum(fw.totalBlocked || 0);
  setFill('sec-blocked-fill', fw.totalBlocked || 0, 1000);
  el('sec-rl').textContent       = (rl.activeIPs || []).length;
  setFill('sec-rl-fill', (rl.activeIPs || []).length, 50);
  el('sec-rl-total').textContent = fmtNum(rl.totalHits || 0);
  el('sec-countries').textContent = Object.keys(fw.byAction || {}).length;

  // Firewall actions chart
  var actions = fw.byAction || {};
  var aKeys = Object.keys(actions);
  var aVals = aKeys.map(function(k) { return actions[k]; });
  drawBars('chart-sec-actions', aKeys, aVals);

  // HTTP timeline chart
  var tl = d.httpTimeline || [];
  drawSparkline('chart-sec-http',
    tl.map(function(r) { return r.hour ? r.hour.slice(11, 16) : ''; }),
    tl.map(function(r) { return r.requests; }),
    '#f5a623', 'Requisições');

  // Top blocked IPs
  var ips = (fw.topBlockedIPs || []).slice(0, 15);
  if (!ips.length) { el('sec-ips-table').innerHTML = '<div class="empty">Nenhum IP bloqueado registrado.</div>'; }
  else {
    var maxC = Math.max.apply(null, ips.map(function(i) { return i.count; }));
    el('sec-ips-table').innerHTML = '<table>'
      + '<thead><tr><th>IP</th><th>Bloqueios</th></tr></thead>'
      + '<tbody>' + ips.map(function(i) {
          var pct = maxC > 0 ? Math.round(i.count / maxC * 100) : 0;
          return '<tr><td class="mono" style="font-size:12px;color:var(--err);">' + esc(i.ip) + '</td>'
            + '<td style="width:160px;">'
            + '<div style="font-size:11px;color:var(--t2);">' + (i.count | 0) + '</div>'
            + '<div style="background:rgba(240,75,75,.12);border-radius:3px;height:6px;"><div style="background:var(--err);border-radius:3px;height:6px;width:' + pct + '%;"></div></div>'
            + '</td></tr>';
        }).join('') + '</tbody></table>';
  }

  // Rate limit IPs
  var rlIPs = (rl.activeIPs || []).filter(function(i) { return i.count > 0; }).slice(0, 20);
  if (!rlIPs.length) { el('sec-rl-table').innerHTML = '<div class="empty">Nenhuma entrada de rate-limit.</div>'; }
  else {
    el('sec-rl-table').innerHTML = '<table>'
      + '<thead><tr><th>Chave</th><th>Contagem</th></tr></thead>'
      + '<tbody>' + rlIPs.map(function(i) {
          return '<tr><td class="mono" style="font-size:12px;color:var(--warn);">' + esc(i.key) + '</td>'
            + '<td style="font-size:12px;color:var(--t2);">' + (i.count | 0) + '</td></tr>';
        }).join('') + '</tbody></table>';
  }

  // Countries table
  var countries = fw.topCountries || [];
  if (!countries.length) { el('sec-countries-table').innerHTML = '<div class="empty">Sem dados de países.</div>'; return; }
  var maxCnt = Math.max.apply(null, countries.map(function(c) { return c.count; }));
  el('sec-countries-table').innerHTML = '<table>'
    + '<thead><tr><th>País</th><th>Eventos</th></tr></thead>'
    + '<tbody>' + countries.map(function(c) {
        var pct = maxCnt > 0 ? Math.round(c.count / maxCnt * 100) : 0;
        return '<tr><td style="font-size:13px;">' + esc(c.country) + '</td>'
          + '<td style="width:180px;">'
          + '<div style="font-size:11px;color:var(--t2);">' + (c.count | 0) + '</div>'
          + '<div style="background:rgba(245,166,35,.12);border-radius:3px;height:6px;"><div style="background:var(--warn);border-radius:3px;height:6px;width:' + pct + '%;"></div></div>'
          + '</td></tr>';
      }).join('') + '</tbody></table>';
}

// ── Chart helpers ────────────────────────────────────────────────
function drawSparkline(canvasId, labels, data, color, label) {
  var canvas = el(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  if (charts[canvasId]) { charts[canvasId].destroy(); delete charts[canvasId]; }
  if (!labels.length) return;
  charts[canvasId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{ label: label, data: data, fill: true,
        backgroundColor: color.replace(')', ',.12)').replace('rgb','rgba'),
        borderColor: color, borderWidth: 2, tension: 0.35,
        pointRadius: 0, pointHoverRadius: 3 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
      scales: {
        x: { ticks: { color: '#8a96b0', font: { size: 10 }, maxTicksLimit: 12, maxRotation: 0 },
             grid: { display: false }, border: { display: false } },
        y: { beginAtZero: true, ticks: { color: '#8a96b0', font: { size: 10 } },
             grid: { color: 'rgba(0,0,0,.06)' }, border: { display: false } }
      }
    }
  });
}

function drawBars(canvasId, labels, data) {
  var canvas = el(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  if (charts[canvasId]) { charts[canvasId].destroy(); delete charts[canvasId]; }
  if (!labels.length) return;
  var colors = [
    'rgba(79,112,247,.65)', 'rgba(14,201,126,.65)', 'rgba(245,166,35,.65)',
    'rgba(240,75,75,.65)',  'rgba(167,139,250,.65)', 'rgba(52,211,153,.65)',
    'rgba(251,113,133,.65)','rgba(96,165,250,.65)'
  ];
  charts[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{ data: data,
        backgroundColor: labels.map(function(_,i) { return colors[i % colors.length]; }),
        borderRadius: 4, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#8a96b0', font: { size: 10 }, maxRotation: 30 }, grid: { display: false }, border: { display: false } },
        y: { beginAtZero: true, ticks: { color: '#8a96b0', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,.06)' }, border: { display: false } }
      }
    }
  });
}

function setFill(id, val, max) {
  var el2 = el(id);
  if (!el2) return;
  var pct = max > 0 ? Math.min(Math.round((val || 0) / max * 100), 100) : 0;
  el2.style.width = pct + '%';
}

function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

// ── Family Detail Modal ───────────────────────────────────────────
async function openModal(sub) {
  modalSub    = sub;
  modalTenant = allFams.find(function(f) { return f.subdomain === sub; }) || null;

  el('m-name').textContent = modalTenant ? (modalTenant.name || '') : sub;
  el('m-badges').innerHTML = modalTenant ? (badge(modalTenant.status) + ' ' + tierBadge(modalTenant.tier)) : spinner();
  el('m-info').innerHTML   = spinner();
  el('m-stats').innerHTML  = spinner('Consultando D1…');
  el('m-link').href        = '#';
  el('m-toggle').textContent = '…';
  el('modal-bg').classList.add('open');
  document.body.style.overflow = 'hidden';

  if (!modalTenant) {
    var td = await api('GET', '/families/' + sub);
    if (td.error || !td.tenant) {
      el('m-info').innerHTML = '<div class="alr alr-err"><span>⚠</span><span>' + esc(td.error || 'Família não encontrada.') + '</span></div>';
      return;
    }
    modalTenant = td.tenant;
  }

  el('m-name').textContent  = modalTenant.name || '';
  el('m-badges').innerHTML  = badge(modalTenant.status) + ' ' + tierBadge(modalTenant.tier);
  // m-link.href: validar subdomain ([a-z0-9-]) antes para evitar javascript:/data:
  var safeSub = String(modalTenant.subdomain || '').replace(/[^a-z0-9-]/g, '');
  el('m-link').href         = 'https://' + safeSub + '.' + BASE_DOMAIN;
  el('m-toggle').textContent = modalTenant.status === 'active' ? 'Suspender' : 'Reativar';
  el('m-toggle').className = 'btn ' + (modalTenant.status === 'active' ? 'btn-warn' : 'btn-ok') + ' btn-sm';

  el('m-info').innerHTML =
    igItem('Subdomínio',    '<span class="mono" style="color:var(--acc2);">' + esc(modalTenant.subdomain) + '.' + esc(BASE_DOMAIN) + '</span>') +
    igItem('Plano',         tierBadge(modalTenant.tier)) +
    igItem('Status',        badge(modalTenant.status)) +
    igItem('Criação',       fmtDate(modalTenant.createdAt)) +
    igItem('Família ID',    '<span class="mono" style="font-size:11px;color:var(--t2);">' + esc(modalTenant.familyId || '—') + '</span>') +
    igItem('D1 Database',   '<span class="mono" style="font-size:10px;color:var(--t2);">' + esc((modalTenant.d1DatabaseId || '').slice(0,20) + (modalTenant.d1DatabaseId ? '…' : '—')) + '</span>');

  loadModalStats(sub);
  loadModalConsents(sub);
}

function igItem(label, val) {
  return '<div class="ig-item"><div class="ig-lbl">' + label + '</div><div class="ig-val">' + val + '</div></div>';
}

async function loadModalStats(sub) {
  var data = await api('GET', '/families/' + sub + '/stats', null, 25000);
  if (data.error) {
    el('m-stats').innerHTML = '<div class="alr alr-err"><span>⚠</span><span>' + esc(data.error) + '</span></div>';
    return;
  }
  var rows = data.rows || {};
  var d1   = data.d1   || {};
  var labels = [
    ['transactions','Transações'],['accounts','Contas'],['credit_cards','Cartões'],
    ['categories','Categorias'],['investments','Investimentos'],['users','Usuários'],
    ['goals','Metas'],['recurrences','Recorrências']
  ];
  var statsGrid = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;">'
    + '<div style="background:var(--surf);border:1px solid var(--bdr);border-radius:8px;padding:10px 12px;">'
    + '<div class="ig-lbl">Tamanho D1</div><div style="font-size:16px;font-weight:700;color:var(--t1);">' + fmt(d1.fileSize || 0) + '</div></div>'
    + '<div style="background:var(--surf);border:1px solid var(--bdr);border-radius:8px;padding:10px 12px;">'
    + '<div class="ig-lbl">Tabelas</div><div style="font-size:16px;font-weight:700;color:var(--t1);">' + (d1.numTables || '—') + '</div></div>'
    + '</div>';
  var counters = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">';
  labels.forEach(function(pair) {
    var n = rows[pair[0]];
    var val = n === undefined || n === -1 ? '—' : fmtN(n);
    counters += '<div style="display:flex;align-items:center;justify-content:space-between;background:var(--surf);border:1px solid var(--bdr);border-radius:6px;padding:7px 10px;">'
      + '<span style="font-size:11px;color:var(--t2);">' + pair[1] + '</span>'
      + '<span style="font-size:13px;font-weight:700;color:var(--t1);">' + val + '</span>'
      + '</div>';
  });
  el('m-stats').innerHTML = statsGrid + counters + '</div>';
}

async function loadModalConsents(sub) {
  var container = el('m-consents');
  if (!container) return;
  container.innerHTML = spinner('Buscando logs de consentimento…');
  var data = await api('GET', '/families/' + sub + '/consents', null, 25000);
  if (data.error || !data.consents) {
    container.innerHTML = '<div style="font-size:11px;color:var(--t3);padding:8px 0;">Nenhum consentimento registrado ou tabela não criada ainda.</div>';
    return;
  }
  var list = data.consents || [];
  if (!list.length) {
    container.innerHTML = '<div style="font-size:11px;color:var(--t3);padding:8px 0;">Nenhum registro de consentimento para leitura de IA encontrado.</div>';
    return;
  }
  var rows = list.map(function(c) {
    var dt = c.accepted_at ? new Date(c.accepted_at).toLocaleString('pt-BR') : '—';
    var user = esc(c.user_email || c.user_id || '—');
    var type = esc(c.document_type || c.consent_type || 'IA');
    var ip = esc(c.ip_address || '—');
    return '<tr style="font-size:11px;border-bottom:1px solid var(--bdr);">'
      + '<td style="padding:6px 8px;white-space:nowrap;color:var(--t2);">' + dt + '</td>'
      + '<td style="padding:6px 8px;font-weight:600;color:var(--t1);">' + user + '</td>'
      + '<td style="padding:6px 8px;"><span class="badge" style="background:rgba(14,201,126,.15);color:#0ec97e;font-size:10px;">' + type + '</span></td>'
      + '<td style="padding:6px 8px;font-family:monospace;color:var(--t3);font-size:10px;">' + ip + '</td>'
      + '<td style="padding:6px 8px;text-align:right;"><button class="btn btn-sec" style="font-size:10px;padding:2px 7px;" onclick="alert(\'Snapshot do Termo Aceito:\\n\\n\' + decodeURIComponent(\'' + encodeURIComponent(c.disclaimer_text || '') + '\'))">Ver Termo</button></td>'
      + '</tr>';
  }).join('');
  container.innerHTML = '<div style="border:1px solid var(--bdr);border-radius:6px;background:var(--surf);overflow-x:auto;">'
    + '<table style="width:100%;border-collapse:collapse;">'
    + '<thead><tr style="font-size:10px;color:var(--t3);text-align:left;border-bottom:1px solid var(--bdr);background:rgba(0,0,0,.03);">'
    + '<th style="padding:6px 8px;">Data/Hora</th><th style="padding:6px 8px;">Usuário</th><th style="padding:6px 8px;">Tipo</th><th style="padding:6px 8px;">IP</th><th style="padding:6px 8px;text-align:right;">Prova</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function closeModal() {
  el('modal-bg').classList.remove('open');
  document.body.style.overflow = '';
  modalSub = null; modalTenant = null;
}

async function modalToggle() {
  if (!modalTenant) return;
  var ns = modalTenant.status === 'active' ? 'suspended' : 'active';
  var data = await api('PUT', '/families/' + modalSub, { status: ns });
  if (data.success) { showToast(ns === 'active' ? 'Família reativada.' : 'Família suspensa.'); closeModal(); loadFamilies(); }
  else showToast(data.error || 'Erro.', false);
}

async function modalDelete() {
  if (!modalTenant) return;
  if (!confirm('Excluir família "' + modalTenant.name + '"?')) return;
  var data = await api('DELETE', '/families/' + modalSub, null, 30000, { 'X-Confirm-Subdomain': modalSub });
  if (data.success) { showToast('Família excluída.'); closeModal(); loadFamilies(); }
  else showToast(data.error || 'Erro ao excluir.', false);
}

// ── Provision ─────────────────────────────────────────────────────
async function submitProvision(e) {
  e.preventDefault();
  var btn  = el('prov-btn');
  var fd   = new FormData(e.target);
  var body = { name: fd.get('name'), subdomain: fd.get('subdomain'), ownerEmail: fd.get('ownerEmail'), tier: parseInt(fd.get('tier')) };
  btn.disabled = true;
  btn.textContent = '⟳  Provisionando…';
  el('prov-result').innerHTML = '<div class="alr alr-ok"><span class="spin">⟳</span><span>Criando banco D1, configurando acesso e enviando e-mail…</span></div>';
  var data = await api('POST', '/provision', body, 60000);
  btn.disabled = false;
  btn.textContent = 'Provisionar Família';
  if (data.success) {
    var safeSub = String(body.subdomain || '').replace(/[^a-z0-9-]/g, '');
    el('prov-result').innerHTML =
      '<div class="alr alr-ok" style="flex-direction:column;align-items:flex-start;gap:8px;padding:14px 16px;">'
      + '<div style="font-weight:700;font-size:13px;">✓ Família provisionada com sucesso!</div>'
      + '<div style="font-size:12px;color:var(--t2);">URL: <a href="https://' + safeSub + '.' + esc(BASE_DOMAIN) + '" target="_blank" rel="noopener noreferrer" style="color:var(--acc2);">https://' + safeSub + '.' + esc(BASE_DOMAIN) + '</a></div>'
      + '<div class="mono" style="font-size:11px;color:var(--t3);">D1: ' + esc(data.tenant.d1DatabaseId) + '</div>'
      + '</div>';
    e.target.reset();
    showToast('Família provisionada com sucesso!');
    allFams = [];
    nocLoaded = false;
  } else {
    el('prov-result').innerHTML = '<div class="alr alr-err"><span>⚠</span><span>' + esc(data.error || 'Erro desconhecido') + '</span></div>';
    showToast(data.error || 'Erro ao provisionar.', false);
  }
}

// ── Comunicados ───────────────────────────────────────────────────
var commFamsLoaded = false;

async function loadCommunications() {
  // Populate target select with active families (once)
  if (!commFamsLoaded && allFams.length > 0) {
    var sel = el('comm-target');
    allFams.filter(function(f) { return f.status === 'active'; }).forEach(function(f) {
      var opt = document.createElement('option');
      opt.value = f.subdomain;
      // textContent já escapa — safe
      opt.textContent = (f.name || '') + ' (' + (f.subdomain || '') + ')';
      sel.appendChild(opt);
    });
    commFamsLoaded = true;
  }

  el('comm-history').innerHTML = spinner('Carregando histórico…');
  var d = await api('GET', '/communications');
  if (d.error) { el('comm-history').innerHTML = err(esc(d.error)); return; }
  var items = d.items || [];
  if (!items.length) {
    el('comm-history').innerHTML = '<div class="empty">Nenhum comunicado enviado ainda.</div>';
    return;
  }
  var lvlIcons  = { maintenance:'🔧', incident:'🔴', news:'🚀', info:'ℹ️' };
  var html = items.map(function(item) {
    var icon = lvlIcons[item.level] || 'ℹ️';
    return '<div style="padding:12px 16px;border-bottom:1px solid var(--bdr);">'
      + '<div style="display:flex;align-items:center;gap:7px;margin-bottom:4px;">'
      + '<span style="font-size:14px;">' + icon + '</span>'
      + '<span style="font-size:12px;font-weight:600;color:var(--t1);">' + esc(item.subject) + '</span>'
      + '</div>'
      + '<div style="font-size:11px;color:var(--t3);">' + fmtDate(item.sentAt)
      + ' · ' + (item.sent ? item.sent.length : 0) + ' enviado(s)'
      + (item.errors && item.errors.length ? ' · <span style="color:var(--err);">' + item.errors.length + ' erro(s)</span>' : '')
      + '</div>'
      + '</div>';
  }).join('');
  el('comm-history').innerHTML = html;
}

async function sendCommunication() {
  var level   = el('comm-level').value;
  var target  = el('comm-target').value;
  var subject = el('comm-subject').value.trim();
  var message = el('comm-message').value.trim();
  var btn = el('comm-btn');
  if (!subject || !message) { showToast('Assunto e mensagem são obrigatórios.', false); return; }
  if (!confirm('Enviar comunicado para ' + (target === 'all' ? 'todas as famílias ativas' : target) + '?')) return;
  btn.disabled = true;
  btn.textContent = '⟳ Enviando…';
  el('comm-result').innerHTML = spinner('Enviando comunicado…');
  var data = await api('POST', '/communications/send', { level, target, subject, message }, 30000);
  btn.disabled = false;
  btn.textContent = '✉ Enviar Comunicado';
  if (data.success) {
    el('comm-result').innerHTML = '<div class="alr alr-ok"><span>✓</span><span>' + (data.sent | 0) + ' email(s) enviado(s) com sucesso.' + (data.errors && data.errors.length ? ' (' + (data.errors.length | 0) + ' erro(s))' : '') + '</span></div>';
    showToast(data.sent + ' comunicado(s) enviado(s).');
    el('comm-subject').value = '';
    el('comm-message').value = '';
    loadCommunications();
  } else {
    el('comm-result').innerHTML = '<div class="alr alr-err"><span>⚠</span><span>' + esc(data.error || 'Erro ao enviar.') + '</span></div>';
    showToast(data.error || 'Erro ao enviar.', false);
  }
}

// ── Event Delegation ──────────────────────────────────────────────
document.addEventListener('click', function(e) {
  // Sidebar nav
  var sbItem = e.target.closest('.sb-item[data-nav]');
  if (sbItem) { nav(sbItem.dataset.nav); return; }

  // Buttons with data-nav
  var navBtn = e.target.closest('[data-nav]');
  if (navBtn && !navBtn.classList.contains('sb-item')) { nav(navBtn.dataset.nav); return; }

  // Row/button actions
  var actionEl = e.target.closest('[data-action]');
  if (actionEl) {
    var action = actionEl.dataset.action;
    var sub    = actionEl.dataset.sub;
    if (action === 'detail')    { openModal(sub); return; }
    if (action === 'telemetry') { e.stopPropagation(); openFamilyTelemetry(sub); return; }
    if (action === 'suspend')   { e.stopPropagation(); updateStatus(sub, 'suspended'); return; }
    if (action === 'activate')  { e.stopPropagation(); updateStatus(sub, 'active'); return; }
    if (action === 'delete')    { e.stopPropagation(); deleteFamily(sub); return; }
    if (action === 'wipe')      { e.stopPropagation(); wipeFamilyData(sub); return; }
    if (action === 'send-comm') { sendCommunication(); return; }
    if (action === 'refresh-comms') { loadCommunications(); return; }
    if (action === 'refresh-storage') { loadStorageUpgrades(); return; }
    if (action === 'refresh-telemetry') { loadTelemetry(); return; }
    if (action === 'refresh-security') { loadSecurity(); return; }
    if (action === 'refresh-noc') { nocLoaded = false; loadNOC(); return; }
    if (action === 'approve-upgrade') { e.stopPropagation(); approveUpgrade(sub); return; }
  }

  // Logout
  if (e.target.id === 'btn-logout' || e.target.closest('#btn-logout')) { doLogout(); return; }

  // Refresh button
  if (e.target.id === 'refresh-btn' || e.target.closest('#refresh-btn')) { refreshCurrent(); return; }

  // Modal close
  if (e.target.id === 'modal-bg') { closeModal(); return; }
  if (e.target.id === 'modal-close' || e.target.closest('#modal-close')) { closeModal(); return; }

  // Modal actions
  if (e.target.id === 'm-toggle' || e.target.closest('#m-toggle')) { modalToggle(); return; }
  if (e.target.id === 'm-delete' || e.target.closest('#m-delete')) { modalDelete(); return; }
});

// Families filters + provision subdomain sanitize
document.addEventListener('input', function(e) {
  if (e.target.id === 'fam-search') filterFamilies();
  if (e.target.id === 'prov-subdomain') {
    e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
  }
});
document.addEventListener('change', function(e) {
  if (e.target.id === 'fam-status' || e.target.id === 'fam-tier') filterFamilies();
});
document.addEventListener('submit', function(e) {
  if (e.target.id === 'prov-form') { submitProvision(e); }
});

// Keyboard
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeModal();
});

// ── Logout ────────────────────────────────────────────────────────
function doLogout() {
  window.location.href = 'https://mks-personnal-finance-manager.cloudflareaccess.com/cdn-cgi/access/logout';
}

// ── Auto-logout por inatividade (20 min) ──────────────────────────
(function() {
  var TIMEOUT = 20 * 60 * 1000;
  var _tid;
  function reset() {
    clearTimeout(_tid);
    _tid = setTimeout(function() {
      alert('Sessão encerrada por inatividade.');
      doLogout();
    }, TIMEOUT);
  }
  ['click','keydown','mousemove','touchstart','scroll'].forEach(function(ev) {
    document.addEventListener(ev, reset, true);
  });
  reset();
})();

// ── Storage Upgrade Requests ─────────────────────────────────────
async function loadStorageUpgrades() {
  el('storage-upgrades-list').innerHTML = spinner('Carregando pedidos…');
  var d = await api('GET', '/storage/upgrade-requests');
  if (d.error) { el('storage-upgrades-list').innerHTML = err(esc(d.error)); return; }
  var requests = d.requests || [];
  var pending = requests.filter(function(r) { return r.status === 'pending'; });
  if (!requests.length) {
    el('storage-upgrades-list').innerHTML = '<div class="empty" style="padding:18px 16px;">Nenhum pedido de upgrade registrado.</div>';
    return;
  }
  var rows = requests.map(function(r) {
    var isPending = r.status === 'pending';
    var statusBadge = isPending
      ? '<span class="bdg" style="background:rgba(224,146,16,.15);color:#e09210;border:1px solid rgba(224,146,16,.3);">Pendente</span>'
      : '<span class="bdg bdg-active">Aprovado</span>';
    var mb = r.usedBytes ? (r.usedBytes / (1024*1024)).toFixed(1) + ' MB' : '—';
    return '<tr>'
      + '<td class="row-fam-name">' + esc(r.tenantName || r.subdomain) + '</td>'
      + '<td><span class="mono" style="font-size:12px;color:var(--acc2);">' + esc(r.subdomain || '') + '</span></td>'
      + '<td style="font-size:12px;">' + esc(r.userEmail || '—') + '</td>'
      + '<td style="font-size:12px;color:var(--t2);">' + mb + '</td>'
      + '<td style="font-size:12px;color:var(--ok);font-weight:600;">R$ ' + ((r.price || 5).toFixed(2)) + '/mês</td>'
      + '<td>' + statusBadge + '</td>'
      + '<td style="font-size:11px;color:var(--t3);">' + (r.requestedAt ? fmtDate(r.requestedAt) : '—') + '</td>'
      + '<td style="text-align:right;">'
      + (isPending
        ? '<button type="button" class="btn btn-ok" style="font-size:11px;padding:4px 9px;" data-action="approve-upgrade" data-sub="' + esc(r.subdomain) + '">✓ Aprovar</button>'
        : '<span style="font-size:11px;color:var(--t3);">Aprovado em ' + (r.approvedAt ? fmtDate(r.approvedAt) : '—') + '</span>')
      + '</td>'
      + '</tr>';
  }).join('');
  el('storage-upgrades-list').innerHTML = '<div style="padding:8px 16px;font-size:11px;color:var(--t2);">'
    + pending.length + ' pendente(s) · ' + requests.length + ' total'
    + '</div>'
    + '<table><thead><tr><th>Família</th><th>Subdomínio</th><th>Email</th><th>Uso</th><th>Valor</th><th>Status</th><th>Solicitado em</th><th style="text-align:right;">Ação</th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table>';
}

async function approveUpgrade(sub) {
  if (!confirm('Aprovar upgrade de 1 GB para "' + sub + '"? Confirme que o pagamento foi processado.')) return;
  var data = await api('POST', '/storage/upgrade-requests/' + sub + '/approve');
  if (data.success) {
    showToast('Upgrade aprovado! Família "' + sub + '" agora tem 1 GB.');
    loadStorageUpgrades();
  } else {
    showToast(data.error || 'Erro ao aprovar.', false);
  }
}

// ── Init ──────────────────────────────────────────────────────────
nav('dashboard');
</script>
</body>
</html>`; }
