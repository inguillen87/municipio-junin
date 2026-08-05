// Service Worker for MuniControl Junín PWA
const CACHE_NAME = 'municontrol-junin-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/ciudadano.html',
  '/mapa.html',
  '/vecinos.html',
  '/css/dashboard.css',
  '/js/nav.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Ignore non-http(s) requests (e.g. chrome-extension://...)
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) return;

  // Network first, fallback to cache for GET requests
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200 && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone).catch(() => {});
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
