import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Separa dependências pesadas em chunks próprios (cacheáveis entre deploys
          // e fora do bundle inicial). recharts/motion só carregam quando um módulo
          // que os usa é aberto.
          // recharts é o maior peso (~120 kB gzip) e só é usado por módulos lazy —
          // isolá-lo garante que fique fora do bundle inicial. lucide-react (ícones)
          // é usado no shell, então vira um vendor cacheável próprio.
          manualChunks: {
            'vendor-charts': ['recharts'],
            'vendor-icons':  ['lucide-react'],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Paridade com prod: /api → Finance Worker (wrangler dev :8787). Ver npm run dev.
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: true,
        },
      },
    },
  };
});
