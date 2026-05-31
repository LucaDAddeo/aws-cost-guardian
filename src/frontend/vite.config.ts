import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Fix for @aws-amplify/auth ESM resolution with Vite
      './runtimeConfig': './runtimeConfig.browser',
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/ws': {
        target: 'ws://localhost:4001',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      // @aws-amplify packages have a version mismatch (auth@6.4.0 vs core@6.16.3)
      // Mark as external for production builds; in deployment, use compatible versions
      external: [/^@aws-amplify\//],
    },
  },
  optimizeDeps: {
    exclude: ['@aws-amplify/auth', '@aws-amplify/core'],
  },
});
