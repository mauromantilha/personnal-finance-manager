#!/usr/bin/env node
/**
 * MKS Finanças — Migra families.json para CF KV (MKS_TENANTS)
 *
 * Uso:
 *   node scripts/migrate-families-to-kv.mjs           # migra todas
 *   node scripts/migrate-families-to-kv.mjs --dry-run # simula sem escrever
 *
 * Pré-requisitos:
 *   - CLOUDFLARE_API_TOKEN no .env com permissão KV:Write
 *   - ~/.mks-control/families.json existente
 *   - KV namespace MKS_TENANTS já criado (ID em wrangler.toml)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const CTRL      = join(process.env.HOME, '.mks-control');

const CF_ACCOUNT    = '9b61f609fee4408fd1c4344feaf9b16a';
const KV_TENANTS_ID = '6017e7ceeaa84a0fa7d7c798ce22bce8';

const args   = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8').split('\n')
      .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
  );
}

function sha256(str) {
  return createHash('sha256').update(str.toLowerCase().trim()).digest('hex');
}

function generateULID() {
  // ULID simplificado para IDs de família
  const ts  = Date.now().toString(36).toUpperCase().padStart(10, '0');
  const rnd = Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map(b => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[b % 32]).join('');
  return ts + rnd;
}

async function kvPut(key, value, token) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/storage/kv/namespaces/${KV_TENANTS_ID}/values/${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  const d = await r.json();
  if (!d.success) throw new Error(`KV PUT ${key}: ${JSON.stringify(d.errors)}`);
}

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  MKS Finanças — Migrar families.json → KV');
  if (dryRun) console.log('  [DRY-RUN — nenhuma alteração real]');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const mainEnv = parseEnvFile(join(ROOT, '.env'));
  const token   = mainEnv.CLOUDFLARE_API_TOKEN;
  if (!token) { console.error('❌  CLOUDFLARE_API_TOKEN não encontrado no .env'); process.exit(1); }

  const familiesPath = join(CTRL, 'families.json');
  if (!existsSync(familiesPath)) { console.error('❌  families.json não encontrado'); process.exit(1); }

  const families = JSON.parse(readFileSync(familiesPath, 'utf8'));
  console.log(`  Famílias encontradas: ${families.length}`);

  if (families.length === 0) {
    console.log('  Nenhuma família para migrar — KV começa limpo.\n');

    // Inicializa contador mesmo assim
    if (!dryRun) {
      await kvPut('tenants:count', '0', token);
      await kvPut('tenants:index', [], token);
    }
    console.log(`  ${dryRun ? '[dry-run] ' : ''}✓ tenants:count = 0`);
    console.log(`  ${dryRun ? '[dry-run] ' : ''}✓ tenants:index = []`);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ✅  Concluído (sem famílias)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    return;
  }

  const index = [];

  for (const f of families) {
    const familyId = generateULID();

    // Lê .env da família para obter d1DatabaseId do token da família
    const envPath  = join(CTRL, 'envs', `${f.subdomain}.env`);
    const familyEnv = parseEnvFile(envPath);

    const tenant = {
      name:           f.name,
      subdomain:      f.subdomain,
      familyId,
      tier:           1,
      d1DatabaseId:   f.d1DatabaseId || familyEnv.D1_DATABASE_ID || '',
      r2Bucket:       'mks-documents',           // bucket único compartilhado
      r2Prefix:       familyId,                  // /{familyId}/documentos/...
      accessAppId:    f.accessAppId    || '',    // preenchido no provisionamento
      accessPolicyId: f.accessPolicyId || '',
      ownerEmailHash: f.emailHash      || '',
      status:         f.status         || 'active',
      createdAt:      f.createdAt      || new Date().toISOString(),
      // Legacy: porta do processo PM2 (não usada no Workers)
      legacyPort:     f.port           || null,
    };

    console.log(`\n  → tenant:${f.subdomain}`);
    console.log(`    familyId:     ${familyId}`);
    console.log(`    d1DatabaseId: ${tenant.d1DatabaseId || '(não encontrado)'}`);
    console.log(`    status:       ${tenant.status}`);

    if (!dryRun) {
      await kvPut(`tenant:${f.subdomain}`, tenant, token);
    }
    console.log(`    ${dryRun ? '[dry-run] ' : ''}✓ tenant:${f.subdomain} gravado`);

    index.push(f.subdomain);
  }

  // Grava índice e contador
  if (!dryRun) {
    await kvPut('tenants:index', index, token);
    await kvPut('tenants:count', String(families.length), token);
  }

  console.log(`\n  ${dryRun ? '[dry-run] ' : ''}✓ tenants:index = [${index.join(', ')}]`);
  console.log(`  ${dryRun ? '[dry-run] ' : ''}✓ tenants:count  = ${families.length}`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ✅  ${families.length} família(s) migrada(s) para KV`);
  if (dryRun) console.log('  ⚠️  Dry-run — nenhuma alteração foi aplicada.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(e => { console.error('\n❌ ', e.message); process.exit(1); });
