// Public-shell-only service worker. Authenticated/API responses are never cached.
const CACHE_NAME = 'municontrol-public-v4';
const PUBLIC_ASSETS = new Set([
  '/',
  '/ciudadano.html',
  '/mapa.html',
  '/vecinos.html',
  '/css/dashboard.css',
  '/manifest.json',
]);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll([...PUBLIC_ASSETS])).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

function cacheableResponse(response) {
  if (!response || !response.ok || response.type !== 'basic') return false;
  const policy = String(response.headers.get('cache-control') || '').toLowerCase();
  return !policy.includes('no-store') && !policy.includes('private');
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('authorization')) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (!PUBLIC_ASSETS.has(url.pathname)) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (cacheableResponse(response)) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
        }
        return response;
      })
      .catch(async () => (await caches.match(request)) || Response.error())
  );
});
