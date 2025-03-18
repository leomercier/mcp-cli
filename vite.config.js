import { defineConfig } from 'vite';

export default defineConfig({
  root: './frontend/src',
  publicDir: '../public',
  server: {
    port: 3000,
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});