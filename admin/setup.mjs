#!/usr/bin/env node
/**
 * MKS Finanças — Setup do Painel Admin (executar uma única vez)
 *
 * O que faz:
 *   1. Cria ~/.mks-control/admin.env com ADMIN_PASSWORD + CF token
 *   2. Configura rota no Cloudflare Tunnel: admin.financaslivre.com → localhost:3999
 *   3. Cria registro DNS CNAME admin.financaslivre.com
 *   4. Inicia processo PM2 mks-admin
 *
 * Uso:
 *   node admin/setup.mjs
 *   node admin/setup.mjs --dry-run
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createInterface } from 'readline';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const CTRL        = join(process.env.HOME, '.mks-control');
const CF_ACCOUNT  = '9b61f609fee4408fd1c4344feaf9b16a';
const CF_TUNNEL   = '50e41496-a62b-452a-bd9f-d0f08c2a620d';
const BASE_DOMAIN = 'financaslivre.com';
const ADMIN_SUB   = 'admin';
const ADMIN_PORT  = 3999;

const args   = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

function ok(msg)   { console.log(`   ✓ ${msg}`); }
function warn(msg) { console.log(`   ⚠  ${msg}`); }
function log(icon, msg) { console.log(`\n${icon}  ${msg}`); }

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8').split('\n')
      .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
  );
}

async function ask(question) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

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

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  MKS Finanças — Setup Painel Admin');
  if (dryRun) console.log('  [DRY-RUN — nenhuma alteração real]');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // ── 1. Obter credenciais ──────────────────────────────────────────────────
  log('🔑', 'Configurando credenciais...');

  // CF token — lê do .env principal se disponível
  const mainEnv   = parseEnvFile(join(PROJECT_ROOT, '.env'));
  const adminEnvP = join(CTRL, 'admin.env');
  const existingAdminEnv = existsSync(adminEnvP) ? parseEnvFile(adminEnvP) : {};

  const cfToken = mainEnv.CLOUDFLARE_API_TOKEN || existingAdminEnv.CLOUDFLARE_API_TOKEN;
  if (!cfToken) {
    console.error('❌  CLOUDFLARE_API_TOKEN não encontrado em .env');
    process.exit(1);
  }
  ok(`CF token: ${cfToken.slice(0, 10)}...`);

  // Admin password
  let adminPw = existingAdminEnv.ADMIN_PASSWORD;
  if (!adminPw) {
    adminPw = await ask('   Defina uma senha para o painel admin: ');
    if (!adminPw || adminPw.length < 8) {
      console.error('\n❌  Senha deve ter pelo menos 8 caracteres'); process.exit(1);
    }
  } else {
    ok('Senha admin já configurada (mantida)');
  }

  // Resend key (opcional)
  const resendKey = mainEnv.RESEND_API_KEY || existingAdminEnv.RESEND_API_KEY || '';

  // ── 2. Escrever admin.env ─────────────────────────────────────────────────
  log('💾', `Escrevendo ${adminEnvP}...`);
  mkdirSync(CTRL, { recursive: true });

  const adminEnvContent = [
    '# MKS Finanças — Admin Panel env',
    `ADMIN_PASSWORD=${adminPw}`,
    `CLOUDFLARE_API_TOKEN=${cfToken}`,
    resendKey ? `RESEND_API_KEY=${resendKey}` : '# RESEND_API_KEY=',
    '',
  ].join('\n');

  if (!dryRun) writeFileSync(adminEnvP, adminEnvContent, { mode: 0o600 });
  ok(`admin.env ${dryRun ? '[dry-run]' : 'escrito'} (modo 600)`);

  // ── 3. Cloudflare Tunnel — rota admin ─────────────────────────────────────
  log('🌐', `Adicionando rota tunnel: ${ADMIN_SUB}.${BASE_DOMAIN} → localhost:${ADMIN_PORT}...`);
  const hostname = `${ADMIN_SUB}.${BASE_DOMAIN}`;
  try {
    const cfg     = await cf(`/accounts/${CF_ACCOUNT}/cfd_tunnel/${CF_TUNNEL}/configurations`, 'GET', null, cfToken);
    const ingress = (cfg?.config?.ingress || []).filter(r => r.hostname !== hostname);

    // Remove catch-all, vai ser re-adicionado no final
    const catchAll = ingress.find(r => !r.hostname) || { service: 'http_status:404' };
    const routes   = ingress.filter(r => r.hostname);

    routes.unshift({ hostname, service: `http://localhost:${ADMIN_PORT}` });
    routes.push(catchAll);

    if (!dryRun) {
      await cf(
        `/accounts/${CF_ACCOUNT}/cfd_tunnel/${CF_TUNNEL}/configurations`,
        'PUT',
        { config: { ingress: routes } },
        cfToken
      );
    }
    ok(`Rota ${hostname} ${dryRun ? '[dry-run]' : 'adicionada'}`);
  } catch (e) {
    warn(`Tunnel: ${e.message}`);
    warn('Adicione manualmente: Zero Trust → Tunnels → Configure → Public Hostnames');
    warn(`  Hostname: ${hostname}  →  http://localhost:${ADMIN_PORT}`);
  }

  // ── 4. DNS CNAME ──────────────────────────────────────────────────────────
  log('🔗', `Criando CNAME ${hostname}...`);
  try {
    const zones = await cf(`/zones?name=${BASE_DOMAIN}`, 'GET', null, cfToken);
    if (!zones?.length) throw new Error('Zona DNS não encontrada');

    const zoneId  = zones[0].id;
    const records = await cf(`/zones/${zoneId}/dns_records?name=${hostname}&type=CNAME`, 'GET', null, cfToken);

    if (records?.length) {
      ok(`CNAME já existe para ${hostname}`);
    } else {
      if (!dryRun) {
        await cf(`/zones/${zoneId}/dns_records`, 'POST', {
          type: 'CNAME',
          name: hostname,
          content: `${CF_TUNNEL}.cfargotunnel.com`,
          proxied: true,
          ttl: 1,
        }, cfToken);
      }
      ok(`CNAME ${hostname} ${dryRun ? '[dry-run]' : 'criado'}`);
    }
  } catch (e) {
    warn(`DNS: ${e.message}`);
    warn(`Crie manualmente: CNAME ${hostname} → ${CF_TUNNEL}.cfargotunnel.com (proxied)`);
  }

  // ── 5. PM2 ────────────────────────────────────────────────────────────────
  log('⚙️ ', 'Iniciando processo PM2 (mks-admin)...');
  const ecosystemPath = join(CTRL, 'ecosystems', 'mks-admin.config.cjs');
  mkdirSync(join(CTRL, 'ecosystems'), { recursive: true });

  const ecosystem = `module.exports = {
  apps: [{
    name: 'mks-admin',
    script: '${join(PROJECT_ROOT, 'admin', 'server.mjs')}',
    interpreter: 'node',
    env: {
      HOME: '${process.env.HOME}',
      PATH: '${process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'}',
      NODE_ENV: 'production',
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    error_file: '${join(CTRL, 'logs', 'admin-error.log')}',
    out_file: '${join(CTRL, 'logs', 'admin-out.log')}',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
`;

  mkdirSync(join(CTRL, 'logs'), { recursive: true });
  if (!dryRun) writeFileSync(ecosystemPath, ecosystem);
  ok(`Ecosystem escrito: ${ecosystemPath}`);

  if (!dryRun) {
    try {
      execSync(`pm2 delete mks-admin 2>/dev/null || true`, { stdio: 'pipe' });
      execSync(`pm2 start ${ecosystemPath}`, { stdio: 'inherit' });
      execSync('pm2 save', { stdio: 'pipe' });
      ok('PM2 processo mks-admin iniciado');
    } catch (e) {
      warn(`PM2: ${e.message}`);
      warn(`Inicie manualmente: pm2 start ${ecosystemPath}`);
    }
  } else {
    ok('[dry-run] PM2 seria iniciado');
  }

  // ── Resumo ────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ✅  Painel Admin ${dryRun ? '(dry-run) ' : ''}configurado!`);
  console.log(`\n  🌐  https://${hostname}`);
  console.log(`  🖥️   http://localhost:${ADMIN_PORT}`);
  if (dryRun) console.log('\n  ⚠️  Dry-run — nenhuma alteração foi aplicada.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(e => { console.error('\n❌ ', e.message); process.exit(1); });
