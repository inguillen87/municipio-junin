import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const frontendRoot = fileURLToPath(new URL('.', import.meta.url));
const navigationCatalogPath = fileURLToPath(new URL('../js/navigation-catalog.js', import.meta.url));

function serveNavigationCatalog() {
  return {
    name: 'municontrol-navigation-catalog',
    configureServer(server: { middlewares: { use(handler: (
      request: { url?: string },
      response: { end(body: string): void; setHeader(name: string, value: string): void; statusCode: number },
      next: () => void,
    ) => void): void } }) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        if (pathname !== '/js/navigation-catalog.js') {
          next();
          return;
        }
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.end(readFileSync(navigationCatalogPath, 'utf8'));
      });
    },
  };
}

export default defineConfig({
  root: frontendRoot,
  base: '/',
  publicDir: false,
  plugins: [serveNavigationCatalog(), react()],
  build: {
    outDir: fileURLToPath(new URL('../dist', import.meta.url)),
    emptyOutDir: false,
    manifest: '.vite/manifest.json',
    sourcemap: false,
    assetsInlineLimit: 4096,
    rollupOptions: {
      input: {
        calidad: fileURLToPath(new URL('./calidad.html', import.meta.url)),
        'conceptos-fijos': fileURLToPath(new URL('./conceptos-fijos.html', import.meta.url)),
        'corridas-grh': fileURLToPath(new URL('./corridas-grh.html', import.meta.url)),
        ejecutivo: fileURLToPath(new URL('./ejecutivo.html', import.meta.url)),
        estructura: fileURLToPath(new URL('./estructura.html', import.meta.url)),
        gestiones: fileURLToPath(new URL('./gestiones.html', import.meta.url)),
        jardines: fileURLToPath(new URL('./jardines.html', import.meta.url)),
        trayectoria: fileURLToPath(new URL('./trayectoria.html', import.meta.url)),
        territorio: fileURLToPath(new URL('./territorio.html', import.meta.url)),
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
