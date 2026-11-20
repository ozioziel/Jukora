import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Un solo .env en la raíz del monorepo; solo las variables VITE_* llegan al navegador.
  envDir: resolve(__dirname, '../..'),
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@jucumari/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('@stellar/stellar-sdk') || id.includes('stellar-base')) return 'stellar';
          if (id.includes('@creit.tech') || id.includes('@reown') || id.includes('walletconnect')) return 'wallets';
          if (id.includes('@pollar')) return 'pollar';
          if (id.includes('gsap')) return 'gsap';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
