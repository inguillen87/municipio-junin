// ============================================================
// sw.js — Service Worker PWA v4
// Municipalidad de Junín — MuniControl
// Strategy: Cache-first for assets, Network-first for data
// ============================================================

const CACHE_VERSION = 'v4';
const CACHE_NAME    = `junin-municipal-${CACHE_VERSION}`;
const API_CACHE     = `junin-api-${CACHE_VERSION}`;

// App shell — always cached
const PRECACHE_URLS = [
  '/',
  '/login.html',
  '/index.html',
  '/ia.html',
  '/vecinos.html',
  '/licitaciones.html',
  '/mapa.html',
  '/control.html',
  '/rrhh.html',
  '/presupuesto.html',
  '/analytics.html',
  '/exportar.html',
  '/whatsapp.html',
  '/hacienda.html',
  '/cuentas-claras.html',
  '/landing.html',
  '/css/dashboard.css',
  '/css/shared.css',
  '/js/nav.js',
  '/js/toast.js',
  '/js/db.js',
  '/js/permissions.js',
  '/js/charts-premium.js',
  '/js/ux-improvements.js',
  '/js/bottom-nav.js',
  '/js/hf-client.js',
  '/manifest.json',
  '/favicon.ico',
];

// CDN resources to cache
const CDN_CACHE = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800;900&family=Outfit:wght@700;800;900&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
];

// ── INSTALL ────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW v4] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW v4] Pre-cache failed for some URLs:', err))
  );
});

// ── ACTIVATE ──────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW v4] Activating...');
  event.waitUntil(
    Promise.all([
      // Delete old caches
      caches.keys().then(keys =>
        Promise.all(keys
          .filter(k => k !== CACHE_NAME && k !== API_CACHE)
          .map(k => { console.log('[SW v4] Deleting old cache:', k); return caches.delete(k); })
        )
      ),
      self.clients.claim()
    ])
  );
});

// ── FETCH ─────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and non-http(s)
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Skip HuggingFace API calls (always fresh)
  if (url.hostname.includes('huggingface.co')) return;

  // Skip analytics and external APIs
  if (url.hostname.includes('google-analytics') || url.hostname.includes('vercel.live')) return;

  // Cache-first for same-origin assets (CSS, JS, fonts, images)
  if (url.origin === self.location.origin || CDN_CACHE.some(cdn => request.url.startsWith(cdn.split('/').slice(0,3).join('/')))) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        }).catch(() => {
          // Offline fallback for HTML
          if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/login.html');
          }
        });
      })
    );
    return;
  }

  // Network-first for everything else
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(API_CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ── BACKGROUND SYNC (push notifications placeholder) ──────
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data === 'clearCache') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
    event.ports[0]?.postMessage('Cache cleared');
  }
});

console.log('[SW v4] Registered — MuniControl PWA');
