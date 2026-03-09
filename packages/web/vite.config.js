import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'frontend',
  build: {
    outDir: '../dist/client',
    emptyOutDir: false  // Don't clear dist folder
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend')
    }
  },
  optimizeDeps: {
    exclude: ['monaco-editor']
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});