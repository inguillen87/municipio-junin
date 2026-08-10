import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const frontendRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: frontendRoot,
  base: '/',
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../dist', import.meta.url)),
    emptyOutDir: false,
    manifest: '.vite/manifest.json',
    sourcemap: false,
    assetsInlineLimit: 4096,
    rollupOptions: {
      input: {
        calidad: fileURLToPath(new URL('./calidad.html', import.meta.url)),
        ejecutivo: fileURLToPath(new URL('./ejecutivo.html', import.meta.url)),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/chunk-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
