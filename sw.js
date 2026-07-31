// ============================================================
// sw.js — Service Worker PWA
// Municipalidad de Junín — GovTech v2.0
// Estrategia: Cache First para assets, Network First para API
// ============================================================

const CACHE_NAME    = 'junin-municipal-v2';
const CACHE_TIMEOUT = 3000; // 3s timeout para network

// Recursos a pre-cachear (shell de la app)
const PRECACHE_URLS = [
  '/login.html',
  '/index.html',
  '/ia.html',
  '/vecinos.html',
  '/licitaciones.html',
  '/mapa.html',
  '/control.html',
  '/rrhh.html',
  '/css/dashboard.css',
  '/css/shared.css',
  '/js/nav.js',
  '/js/data.js',
  '/js/toast.js',
  '/js/ia.js',
  '/manifest.json',
];

// ── INSTALL: Pre-cachear el shell ────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Pre-cache parcial:', err.message))
  );
});

// ── ACTIVATE: Limpiar caches viejos ─────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: Estrategia inteligente ────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // API → Network First (no cachear datos sensibles)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // CDN externas (Leaflet, Chart.js, Fonts) → Cache First
  if (url.origin !== location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Assets locales → Stale-While-Revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// ── ESTRATEGIAS ──────────────────────────────────────────────

async function networkFirst(request) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CACHE_TIMEOUT);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || offlineFallback();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineFallback();
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    }
    return response;
  }).catch(() => null);
  return cached || fetchPromise || offlineFallback();
}

function offlineFallback() {
  return new Response(
    `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Sin conexión</title>
    <style>body{background:#060b18;color:#f0f4ff;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}
    .wrap{max-width:400px;padding:40px}.icon{font-size:64px;margin-bottom:20px}h1{font-size:24px;margin-bottom:10px}p{color:rgba(148,163,184,0.8);font-size:14px;line-height:1.6}
    button{background:linear-gradient(135deg,#3b82f6,#6366f1);border:none;color:white;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;margin-top:20px}
    </style></head><body>
    <div class="wrap"><div class="icon">📡</div>
    <h1>Sin conexión</h1>
    <p>El sistema requiere conexión para cargar datos actualizados.<br>Verificá tu conexión a internet y volvé a intentar.</p>
    <button onclick="location.reload()">🔄 Reintentar</button></div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// ── PUSH NOTIFICATIONS (preparado para futuras notificaciones) ──
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  const title = data.title || '🏛️ Municipio de Junín';
  const options = {
    body:    data.body || 'Hay nuevas notificaciones en el sistema',
    icon:    '/favicon.ico',
    badge:   '/favicon.ico',
    tag:     data.tag || 'junin-alert',
    data:    data.url || '/',
    actions: [
      { action: 'open',    title: 'Ver en el sistema' },
      { action: 'dismiss', title: 'Descartar' },
    ],
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action !== 'dismiss') {
    event.waitUntil(clients.openWindow(event.notification.data || '/'));
  }
});
