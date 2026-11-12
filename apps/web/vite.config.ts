import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies API/docs to a local API so the browser stays same-origin.
const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/docs': { target: apiTarget, changeOrigin: false },
      '/health': { target: apiTarget, changeOrigin: false },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
