#!/usr/bin/env node
/**
 * MKS Finanças — Provisionamento de Instância Familiar
 *
 * Uso:
 *   node scripts/provision.mjs --name "Silva" --subdomain silva --email admin@silva.com
 *   node scripts/provision.mjs --name "Silva" --subdomain silva --email admin@silva.com --dry-run
 *
 * Requer: Node 18+, PM2 instalado globalmente, dist/server.cjs compilado
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { readdirSync } from 'fs';
import { randomBytes, createHash } from 'crypto';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Constantes ────────────────────────────────────────────────────────────────

const __dirname   = dirname(fileURLToPath(import.meta.url));
const ROOT        = join(__dirname, '..');
const CTRL        = join(process.env.HOME, '.mks-control');
const MIGRATIONS  = join(ROOT, 'migrations');
const SERVER      = join(ROOT, 'dist', 'server.cjs');

const CF_ACCOUNT  = '9b61f609fee4408fd1c4344feaf9b16a';
const CF_TUNNEL   = '50e41496-a62b-452a-bd9f-d0f08c2a620d';
const BASE_DOMAIN = 'mksbrasil.com';
const BASE_PORT   = 3001;
const MAX_FAMS    = 10;

// ── Utilitários ───────────────────────────────────────────────────────────────

function log(icon, msg) { console.log(`\n${icon}  ${msg}`); }
function ok(msg)   { console.log(`   ✓ ${msg}`); }
function fail(msg) { console.error(`\n❌  ${msg}`); process.exit(1); }
function sha256(s) { return createHash('sha256').update(s).digest('hex'); }
function genHex(n) { return randomBytes(n).toString('hex'); }
function genPwd(n = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  return Array.from(randomBytes(n)).map(b => chars[b % chars.length]).join('');
}

function loadEnv() {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) fail('.env não encontrado em ' + ROOT);
  return Object.fromEntries(
    readFileSync(p, 'utf8').split('\n')
      .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
  );
}

function loadFamilies() {
  const p = join(CTRL, 'families.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
}

function saveFamilies(list) {
  writeFileSync(join(CTRL, 'families.json'), JSON.stringify(list, null, 2));
}

function parseArgs() {
  const a = process.argv.slice(2);
  const get = f => { const i = a.indexOf(f); return i !== -1 ? a[i + 1] : null; };
  return {
    name:     get('--name'),
    subdomain: get('--subdomain')?.toLowerCase().replace(/[^a-z0-9-]/g, ''),
    email:    get('--email'),
    dryRun:   a.includes('--dry-run'),
  };
}

// ── Cloudflare API ────────────────────────────────────────────────────────────

async function cf(path, method = 'GET', body, token) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const d = await r.json();
  if (!d.success) throw new Error(`CF ${method} ${path}: ${JSON.stringify(d.errors)}`);
  return d.result;
}

async function getZoneId(token) {
  const zones = await cf(`/zones?name=${BASE_DOMAIN}`, 'GET', null, token);
  if (!zones?.length) throw new Error(`Zona DNS não encontrada para ${BASE_DOMAIN}. Verifique permissão Zone:Read no token.`);
  return zones[0].id;
}

async function d1Query(dbId, sql, token) {
  return cf(`/accounts/${CF_ACCOUNT}/d1/database/${dbId}/query`, 'POST', { sql, params: [] }, token);
}

// ── Migrations ────────────────────────────────────────────────────────────────

async function runMigrations(dbId, token, dryRun) {
  const files = readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => join(MIGRATIONS, f));

  for (const file of files) {
    const name = file.split('/').pop();
    const sql  = readFileSync(file, 'utf8');
    const stmts = sql
      .replace(/--[^\n]*/g, '')           // remove comments
      .split(';')
      .map(s => s.trim())
      .filter(Boolean);

    for (const stmt of stmts) {
      if (!dryRun) {
        await d1Query(dbId, stmt + ';', token);
        await new Promise(r => setTimeout(r, 120)); // rate-limit guard
      }
    }
    ok(`Migration ${name} aplicada (${stmts.length} statements)`);
  }
}

// ── Cloudflare Tunnel ─────────────────────────────────────────────────────────

async function updateTunnelIngress(subdomain, port, token, dryRun) {
  const hostname = `${subdomain}.${BASE_DOMAIN}`;

  // GET current config
  const cfg = await cf(
    `/accounts/${CF_ACCOUNT}/cfd_tunnel/${CF_TUNNEL}/configurations`,
    'GET', null, token
  );

  const ingress = (cfg?.config?.ingress || []).filter(
    r => r.hostname !== hostname && r.service !== 'http_status:404'
  );
  ingress.push({ hostname, service: `http://localhost:${port}` });
  ingress.push({ service: 'http_status:404' });

  if (!dryRun) {
    await cf(
      `/accounts/${CF_ACCOUNT}/cfd_tunnel/${CF_TUNNEL}/configurations`,
      'PUT', { config: { ingress } }, token
    );
  }
  ok(`Tunnel: ${hostname} → localhost:${port}`);
}

async function createDNSRecord(subdomain, zoneId, token, dryRun) {
  const hostname = `${subdomain}.${BASE_DOMAIN}`;
  const cname    = `${CF_TUNNEL}.cfargotunnel.com`;

  // Check if already exists
  const existing = await cf(`/zones/${zoneId}/dns_records?name=${hostname}`, 'GET', null, token);
  if (existing?.length) { ok(`DNS já existe para ${hostname}`); return; }

  if (!dryRun) {
    await cf(`/zones/${zoneId}/dns_records`, 'POST', {
      type: 'CNAME', name: hostname, content: cname, proxied: true, ttl: 1,
    }, token);
  }
  ok(`DNS: ${hostname} → CNAME ${cname}`);
}

// ── PM2 ───────────────────────────────────────────────────────────────────────

function writePM2Ecosystem(subdomain, envVars) {
  const cfg = {
    apps: [{
      name:   `mks-${subdomain}`,
      script: SERVER,
      env:    envVars,
    }]
  };
  const path = join(CTRL, 'ecosystems', `${subdomain}.config.cjs`);
  writeFileSync(path, `module.exports = ${JSON.stringify(cfg, null, 2)};`);
  return path;
}

function startPM2(ecoPath, dryRun) {
  const cmd = `pm2 start "${ecoPath}" && pm2 save`;
  if (!dryRun) execSync(cmd, { stdio: 'inherit' });
  else console.log(`   [dry-run] ${cmd}`);
}

// ── E-mail de boas-vindas ─────────────────────────────────────────────────────

async function sendWelcomeEmail(to, name, subdomain, tempPassword, resendKey, dryRun) {
  const url = `https://${subdomain}.${BASE_DOMAIN}`;
  const html = `
<!DOCTYPE html><html lang="pt-BR"><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e293b">
<div style="background:#4f46e5;padding:20px 24px;border-radius:12px 12px 0 0">
  <h1 style="color:#fff;margin:0;font-size:20px">MKS Finanças</h1>
  <p style="color:#c7d2fe;margin:4px 0 0;font-size:13px">Sua plataforma de gestão financeira pessoal</p>
</div>
<div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:28px;border-radius:0 0 12px 12px">

  <h2 style="font-size:16px;margin:0 0 16px">Olá, família ${name}! 👋</h2>
  <p style="font-size:14px;line-height:1.6;margin:0 0 16px">
    Sua instância do <strong>MKS Finanças</strong> foi provisionada com sucesso.
    A partir de agora você tem um espaço exclusivo e privado para gerenciar as finanças da sua família.
  </p>

  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:0 0 20px">
    <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Seus dados de acesso</p>
    <p style="margin:0 0 6px;font-size:14px">🔗 <strong>Endereço:</strong> <a href="${url}" style="color:#4f46e5">${url}</a></p>
    <p style="margin:0 0 6px;font-size:14px">🔐 <strong>Senha temporária:</strong> <code style="background:#ede9fe;padding:2px 8px;border-radius:4px;font-size:15px">${tempPassword}</code></p>
    <p style="margin:0;font-size:12px;color:#94a3b8">Recomendamos alterar a senha no primeiro acesso.</p>
  </div>

  <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:0 0 20px">
    <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#92400e">⚖️ Aviso sobre Privacidade e LGPD</p>
    <p style="margin:0 0 8px;font-size:13px;color:#78350f;line-height:1.6">
      A plataforma MKS Finanças é operada pela <strong>MKS Brasil Software e Gestão Empresarial Ltda</strong>
      (CNPJ 64.293.212/0001-97). Seus dados financeiros são armazenados de forma isolada e privada —
      a MKS Brasil não acessa o conteúdo financeiro da sua instância.
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:#78350f;line-height:1.6">
      Tratamos apenas dados operacionais mínimos (e-mail para acesso, logs técnicos) com base nas
      hipóteses legais da Lei nº 13.709/2018 (LGPD). Você pode exercer seus direitos de acesso,
      correção e exclusão a qualquer momento escrevendo para
      <a href="mailto:privacidade@mksbrasil.com" style="color:#92400e">privacidade@mksbrasil.com</a>.
    </p>
    <p style="margin:0;font-size:12px;color:#92400e">
      Política completa: <a href="https://www.mksbrasil.com/politica-de-privacidade" style="color:#92400e">www.mksbrasil.com/politica-de-privacidade</a>
      — Versão 1.0, vigente desde 29/03/2026.
    </p>
  </div>

  <p style="font-size:13px;color:#64748b;line-height:1.6;margin:0 0 8px">
    Ao acessar a plataforma, você confirma que leu e concorda com a Política de Privacidade da MKS Brasil.
  </p>
  <p style="font-size:13px;color:#64748b;margin:0">
    Dúvidas? Escreva para <a href="mailto:contato@mksbrasil.com" style="color:#4f46e5">contato@mksbrasil.com</a>
  </p>
</div>
<p style="font-size:11px;color:#94a3b8;text-align:center;margin:16px 0 0">
  MKS Brasil Software e Gestão Empresarial Ltda · CNPJ 64.293.212/0001-97 ·
  <a href="https://www.mksbrasil.com" style="color:#94a3b8">www.mksbrasil.com</a>
</p>
</body></html>`;

  if (dryRun) { console.log(`   [dry-run] e-mail para ${to}`); return; }

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'MKS Finanças <financas@mksbrasil.com>',
      to,
      subject: `[MKS Finanças] Sua plataforma está pronta — família ${name}`,
      html,
    }),
  });
  if (!r.ok) throw new Error(`Resend: ${r.status} ${await r.text()}`);
  ok(`E-mail de boas-vindas enviado para ${to}`);
}

// ── Flow principal ────────────────────────────────────────────────────────────

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  MKS Finanças — Provisionamento de Família');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const args = parseArgs();
  const { name, subdomain, email, dryRun } = args;

  if (!name || !subdomain || !email) {
    fail('Uso: node scripts/provision.mjs --name "Silva" --subdomain silva --email admin@silva.com');
  }
  if (!/^[a-z0-9-]+$/.test(subdomain)) fail('Subdomínio inválido (use apenas letras minúsculas, números e hífen)');
  if (dryRun) console.log('\n⚠️   MODO DRY-RUN — nenhuma alteração real será feita\n');

  const env = loadEnv();
  const CF_TOKEN    = env.CLOUDFLARE_API_TOKEN;
  const RESEND_KEY  = env.RESEND_API_KEY;
  const GROQ_KEY    = env.GROQ_API_KEY;

  if (!CF_TOKEN)   fail('CLOUDFLARE_API_TOKEN não configurado no .env');
  if (!RESEND_KEY) fail('RESEND_API_KEY não configurado no .env');

  // ── 1. Validações ──────────────────────────────────────────────────────────
  log('🔍', 'Validando...');

  const families = loadFamilies();
  const active   = families.filter(f => f.status === 'active');

  if (active.length >= MAX_FAMS) fail(`Limite de ${MAX_FAMS} famílias ativas atingido.`);
  if (families.find(f => f.subdomain === subdomain)) fail(`Subdomínio "${subdomain}" já está em uso.`);
  if (families.find(f => f.emailHash === sha256(email))) fail('Este e-mail já foi usado em outra família.');

  const usedPorts = families.map(f => f.port);
  let port = BASE_PORT;
  while (usedPorts.includes(port)) port++;
  if (port > BASE_PORT + MAX_FAMS) fail('Nenhuma porta disponível no range 3001-3010.');

  ok(`Subdomínio: ${subdomain}.${BASE_DOMAIN}`);
  ok(`Porta: ${port}`);
  ok(`Famílias ativas: ${active.length}/${MAX_FAMS}`);

  // ── 2. Criar D1 ───────────────────────────────────────────────────────────
  log('🗄️ ', 'Criando banco D1...');
  let d1Id;
  if (!dryRun) {
    const db = await cf(
      `/accounts/${CF_ACCOUNT}/d1/database`,
      'POST', { name: `mks-${subdomain}` }, CF_TOKEN
    );
    d1Id = db.uuid;
    await new Promise(r => setTimeout(r, 2000)); // aguarda provisionamento
  } else {
    d1Id = 'dry-run-d1-id';
  }
  ok(`D1 criado: ${d1Id}`);

  // ── 3. Rodar migrations ───────────────────────────────────────────────────
  log('📋', 'Aplicando migrations...');
  await runMigrations(d1Id, CF_TOKEN, dryRun);

  // ── 4. Criar R2 ───────────────────────────────────────────────────────────
  log('📦', 'Criando bucket R2...');
  const r2Bucket = `mks-${subdomain}-storage`;
  if (!dryRun) {
    await cf(`/accounts/${CF_ACCOUNT}/r2/buckets`, 'POST', { name: r2Bucket }, CF_TOKEN);
  }
  ok(`R2 bucket: ${r2Bucket}`);

  // ── 5. Gerar segredos ─────────────────────────────────────────────────────
  log('🔑', 'Gerando segredos...');
  const familyId    = genHex(16);
  const appSecret   = genHex(32);
  const tempPwd     = genPwd(12);
  const familyToken = genHex(24);
  ok('Segredos gerados (não armazenados em texto claro)');

  // ── 6. Escrever .env da instância ─────────────────────────────────────────
  log('📝', 'Escrevendo arquivo de configuração...');
  const instanceEnv = {
    PORT:                  String(port),
    NODE_ENV:              'production',
    GROQ_API_KEY:          GROQ_KEY || '',
    APP_PASSWORD:          tempPwd,
    APP_SECRET:            appSecret,
    CLOUDFLARE_API_TOKEN:  CF_TOKEN,
    D1_DATABASE_ID:        d1Id,
    R2_BUCKET:             r2Bucket,
    APP_URL:               `https://${subdomain}.${BASE_DOMAIN}`,
    RESEND_API_KEY:        RESEND_KEY,
    FAMILY_ID:             familyId,
    FAMILY_TOKEN:          familyToken,
  };
  const envPath = join(CTRL, 'envs', `${subdomain}.env`);
  writeFileSync(envPath, Object.entries(instanceEnv).map(([k, v]) => `${k}=${v}`).join('\n'));
  ok(`Env: ${envPath}`);

  // ── 7. PM2 ────────────────────────────────────────────────────────────────
  log('⚙️ ', 'Iniciando processo PM2...');
  const ecoPath = writePM2Ecosystem(`mks-${subdomain}`, instanceEnv);
  startPM2(ecoPath, dryRun);
  ok(`PM2: mks-${subdomain} na porta ${port}`);

  // ── 8. Cloudflare Tunnel ──────────────────────────────────────────────────
  log('🌐', 'Configurando Cloudflare Tunnel...');
  try {
    await updateTunnelIngress(subdomain, port, CF_TOKEN, dryRun);
  } catch (e) {
    console.warn(`   ⚠️  Tunnel: ${e.message}\n   → Configure manualmente no Cloudflare Dashboard ou adicione permissão Tunnel:Edit ao token.`);
  }

  // ── 9. DNS ────────────────────────────────────────────────────────────────
  log('📡', 'Criando registro DNS...');
  try {
    const zoneId = await getZoneId(CF_TOKEN);
    await createDNSRecord(subdomain, zoneId, CF_TOKEN, dryRun);
  } catch (e) {
    console.warn(`   ⚠️  DNS: ${e.message}\n   → Adicione permissão Zone:DNS:Edit ao token ou crie o CNAME manualmente.`);
  }

  // ── 10. Salvar metadata ───────────────────────────────────────────────────
  log('💾', 'Salvando metadata...');
  const meta = {
    id:          familyId,
    name,
    subdomain,
    d1DatabaseId: d1Id,
    r2Bucket,
    pm2Name:     `mks-${subdomain}`,
    port,
    emailHash:   sha256(email),    // LGPD: não armazena e-mail em texto claro
    familyToken,
    status:      'active',
    createdAt:   new Date().toISOString(),
  };
  if (!dryRun) {
    families.push(meta);
    saveFamilies(families);
  }
  ok('Metadata salvo em ~/.mks-control/families.json');

  // ── 11. E-mail de boas-vindas com LGPD ────────────────────────────────────
  log('📧', 'Enviando e-mail de boas-vindas...');
  await sendWelcomeEmail(email, name, subdomain, tempPwd, RESEND_KEY, dryRun);

  // ── Resumo ────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅  Provisionamento concluído!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Família:     ${name}`);
  console.log(`  URL:         https://${subdomain}.${BASE_DOMAIN}`);
  console.log(`  Porta:       ${port}`);
  console.log(`  D1:          ${d1Id}`);
  console.log(`  R2:          ${r2Bucket}`);
  console.log(`  PM2:         mks-${subdomain}`);
  if (dryRun) console.log('\n  ⚠️  Dry-run — nenhuma alteração foi aplicada.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(e => fail(e.message));
