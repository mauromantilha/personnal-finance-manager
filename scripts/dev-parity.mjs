#!/usr/bin/env node
/**
 * Dev parity: Vite (frontend) + wrangler finance (API em :8787).
 * Proxy /api → 8787 configurado em vite.config.ts.
 *
 * Uso: npm run dev
 * Legado BFF Express: npm run dev:bff
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = [];

function run(name, command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[dev-parity] ${name} saiu (code=${code}, signal=${signal}) — encerrando.`);
    shutdown(code ?? 1);
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try { c.kill('SIGTERM'); } catch { /* ignore */ }
  }
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('Dev parity: Vite → http://localhost:5173  |  Finance Worker → http://127.0.0.1:8787');
console.log('Pluggy / auth local do BFF: use npm run dev:bff\n');

run('finance', 'npx', ['wrangler', 'dev', '--port', '8787', '--ip', '127.0.0.1'], path.join(root, 'workers/finance'));
run('vite', 'npx', ['vite', '--host', '0.0.0.0', '--port', '5173'], root);
