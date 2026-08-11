// MuniControl public shell. Authenticated pages and API responses are never cached.
const CACHE_PREFIX = 'municontrol-shell-';
const CACHE_NAME = 'municontrol-shell-v6';
const LEGACY_CACHE_PREFIX = 'municontrol-public-';
const OFFLINE_FALLBACK = '/offline';

// Deliberate allowlist: one public fallback plus presentation assets only.
const PUBLIC_ASSETS = Object.freeze([
  OFFLINE_FALLBACK,
  '/css/dashboard.css',
  '/css/institutional-shell.css',
  '/manifest.json',
  '/img/municontrol-icon-192.png',
  '/img/municontrol-icon-512.png',
]);
const PUBLIC_ASSET_PATHS = new Set(PUBLIC_ASSETS);

function isOwnedCache(cacheName) {
  return cacheName.startsWith(CACHE_PREFIX) || cacheName.startsWith(LEGACY_CACHE_PREFIX);
}

function isCacheablePublicResponse(response) {
  if (!response || !response.ok || response.type !== 'basic') return false;
  const policy = String(response.headers.get('cache-control') || '').toLowerCase();
  return !policy.includes('no-store') && !policy.includes('private');
}

function publicAssetRequest(pathname) {
  return new Request(new URL(pathname, self.location.origin), {
    method: 'GET',
    credentials: 'omit',
    cache: 'reload',
  });
}

async function seedPublicShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(PUBLIC_ASSETS.map(async pathname => {
    const request = publicAssetRequest(pathname);
    const response = await fetch(request);
    if (!isCacheablePublicResponse(response)) {
      throw new Error(`Public shell asset unavailable: ${pathname}`);
    }
    await cache.put(request, response);
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(seedPublicShell());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => isOwnedCache(key) && key !== CACHE_NAME)
        .map(key => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function offlineDocument() {
  const cache = await caches.open(CACHE_NAME);
  return (await cache.match(publicAssetRequest(OFFLINE_FALLBACK))) || Response.error();
}

async function networkFirstNavigation(request) {
  try {
    // Navigation keeps its normal same-origin credentials, but its response is never cached.
    return await fetch(request, { cache: 'no-store' });
  } catch (error) {
    return offlineDocument();
  }
}

async function networkFirstPublicAsset(pathname) {
  const canonicalRequest = publicAssetRequest(pathname);
  try {
    // Each worker version seals its offline assets during install. Runtime reads
    // never recreate a retired cache after a newer worker has activated.
    return await fetch(canonicalRequest);
  } catch (error) {
    const names = await caches.keys();
    if (!names.includes(CACHE_NAME)) return Response.error();
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(canonicalRequest)) || Response.error();
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (
    request.method !== 'GET'
    || request.headers.has('authorization')
    || request.headers.has('range')
  ) return;

  const url = new URL(request.url);
  if (
    url.origin !== self.location.origin
    || url.pathname === '/api'
    || url.pathname.startsWith('/api/')
  ) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (PUBLIC_ASSET_PATHS.has(url.pathname)) {
    event.respondWith(networkFirstPublicAsset(url.pathname));
  }
});
