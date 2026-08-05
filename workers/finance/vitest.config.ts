import { defineConfig } from 'vitest/config';

// Config local do Vitest. Sem isto, o Vitest sobe a árvore de diretórios e
// carrega o vite.config.ts da raiz do repo, que importa @tailwindcss/vite —
// pacote que NÃO existe no node_modules deste worker (só hono/vitest/wrangler).
// Isso quebrava `npm test` no CID do Finance Worker (working-directory isolado).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // tinypool threads estoura stack neste ambiente (CI/sandbox); forks é estável
    pool: 'forks',
  },
});
