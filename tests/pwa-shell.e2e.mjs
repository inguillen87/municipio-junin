import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRIVATE_PATHS = Object.freeze([
  '/login',
  '/login.html',
  '/inicio',
  '/inicio.html',
  '/private-probe.html',
  '/authorized-probe',
]);
const PUBLIC_CACHE_PATHS = Object.freeze([
  '/offline',
  '/css/dashboard.css',
  '/css/institutional-shell.css',
  '/manifest.json',
  '/img/municontrol-icon-192.png',
  '/img/municontrol-icon-512.png',
]);
const PUBLIC_CACHE_PATH_SET = new Set(PUBLIC_CACHE_PATHS);

const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
});

function cacheNameFrom(source) {
  const match = source.match(/\b(?:CACHE_NAME|SHELL_CACHE)\s*=\s*['"]([^'"]+)['"]/);
  assert.ok(match, 'sw.js debe declarar el nombre versionado del cache en una constante');
  return match[1];
}

function nextCacheName(current) {
  const match = current.match(/^(.*?)(\d+)$/);
  assert.ok(match, `el cache ${current} debe terminar en una versión numérica`);
  return `${match[1]}${Number(match[2]) + 1}-e2e`;
}

function responseHeaders(filePath, pathname) {
  const extension = path.extname(filePath);
  const privateDocument = PRIVATE_PATHS.includes(pathname);
  return {
    'Cache-Control': privateDocument ? 'private, no-store' : 'no-cache',
    'Content-Type': CONTENT_TYPES[extension] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    ...(pathname === '/offline' || pathname === '/offline.html'
      ? { 'X-MuniControl-Offline-Shell': 'offline.html' }
      : {}),
  };
}

async function createPwaServer() {
  const originalWorker = await readFile(path.join(REPO, 'sw.js'), 'utf8');
  const initialCacheName = cacheNameFrom(originalWorker);
  const updatedCacheName = nextCacheName(initialCacheName);
  const state = {
    apiCalls: 0,
    networkFirstCalls: 0,
    networkFirstVersion: 'online-v1',
    serveUpdatedWorker: false,
  };
  const requests = [];
  const routeFiles = new Map([
    ['/', 'login.html'],
    ['/login', 'login.html'],
    ['/login.html', 'login.html'],
    ['/inicio', 'inicio.html'],
    ['/inicio.html', 'inicio.html'],
    ['/ciudadano', 'ciudadano.html'],
    ['/ciudadano.html', 'ciudadano.html'],
    ['/offline', 'offline.html'],
    ['/offline.html', 'offline.html'],
    ['/manifest.json', 'manifest.json'],
    ['/js/pwa-register.js', 'js/pwa-register.js'],
    ['/css/dashboard.css', 'css/dashboard.css'],
    ['/css/institutional-shell.css', 'css/institutional-shell.css'],
    ['/css/motion-system.css', 'css/motion-system.css'],
    ['/img/municontrol-icon-192.png', 'img/municontrol-icon-192.png'],
    ['/img/municontrol-icon-512.png', 'img/municontrol-icon-512.png'],
    ['/favicon.jpg', 'favicon.jpg'],
  ]);

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    requests.push({
      authorization: Boolean(request.headers.authorization),
      method: request.method,
      pathname: url.pathname,
    });

    if (url.pathname === '/sw.js') {
      const body = state.serveUpdatedWorker
        ? originalWorker.split(initialCacheName).join(updatedCacheName)
        : originalWorker;
      response.writeHead(200, {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': CONTENT_TYPES['.js'],
        'Service-Worker-Allowed': '/',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(body);
      return;
    }

    if (url.pathname === '/api/cache-probe' || url.pathname === '/api/auth/session') {
      state.apiCalls += 1;
      response.writeHead(200, {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify({ call: state.apiCalls, source: 'network-only' }));
      return;
    }

    if (url.pathname === '/network-first') {
      state.networkFirstCalls += 1;
      response.writeHead(200, {
        'Cache-Control': 'no-cache',
        'Content-Type': CONTENT_TYPES['.html'],
      });
      response.end(`<!doctype html><html lang="es"><title>Red primero</title><body><main id="networkVersion">${state.networkFirstVersion}</main></body></html>`);
      return;
    }

    if (url.pathname === '/private-probe.html') {
      response.writeHead(200, {
        'Cache-Control': 'private, no-store',
        'Content-Type': CONTENT_TYPES['.html'],
      });
      response.end('<!doctype html><html lang="es"><body><main>documento-privado-e2e</main></body></html>');
      return;
    }

    if (url.pathname === '/authorized-probe') {
      response.writeHead(200, {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      response.end(request.headers.authorization ? 'authorized-network-response' : 'missing-authorization');
      return;
    }

    const relativePath = routeFiles.get(url.pathname);
    if (relativePath) {
      try {
        const body = await readFile(path.join(REPO, relativePath));
        response.writeHead(200, responseHeaders(relativePath, url.pathname));
        response.end(body);
      } catch (error) {
        response.writeHead(error?.code === 'ENOENT' ? 404 : 500, {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        });
        response.end('fixture-not-found');
      }
      return;
    }

    response.writeHead(404, {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    });
    response.end('not-found');
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    initialCacheName,
    requests,
    server,
    state,
    updatedCacheName,
  };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
}

async function cacheSnapshot(page) {
  return page.evaluate(async () => {
    const result = {};
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      result[name] = (await cache.keys()).map(request => new URL(request.url).pathname).sort();
    }
    return result;
  });
}

async function waitForControlledWorker(page) {
  await page.waitForFunction(() => 'serviceWorker' in navigator);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return registration;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('controllerchange timeout')), 8_000);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
    });
    return registration;
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

test('manifest and login expose a mobile standalone PWA without an automatic install prompt', async () => {
  const [manifestSource, loginSource, offlineSource, registerSource, vercelSource] = await Promise.all([
    readFile(path.join(REPO, 'manifest.json'), 'utf8'),
    readFile(path.join(REPO, 'login.html'), 'utf8'),
    readFile(path.join(REPO, 'offline.html'), 'utf8'),
    readFile(path.join(REPO, 'js', 'pwa-register.js'), 'utf8'),
    readFile(path.join(REPO, 'vercel.json'), 'utf8'),
  ]);
  const manifest = JSON.parse(manifestSource);
  const vercel = JSON.parse(vercelSource);

  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/login');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.lang, 'es-AR');
  assert.equal(manifest.display, 'standalone');
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
  assert.ok(Array.isArray(manifest.icons));
  assert.ok(manifest.icons.some(icon => /(^|\s)192x192(\s|$)/.test(icon.sizes)));
  assert.ok(manifest.icons.some(icon => /(^|\s)512x512(\s|$)/.test(icon.sizes)));

  assert.match(loginSource, /<meta\s+name="viewport"\s+content="[^"]*width=device-width/i);
  assert.match(loginSource, /<link\s+rel="manifest"\s+href="\/manifest\.json"/i);
  assert.match(loginSource, /<script\s+src="\/js\/pwa-register\.js"/i);
  assert.match(loginSource, /data-pwa-install[^>]*hidden/i);
  assert.match(loginSource, /data-pwa-install-status[^>]*role="status"/i);
  assert.match(registerSource, /beforeinstallprompt/);
  assert.match(registerSource, /\.prompt\s*\(/);
  assert.match(registerSource, /addEventListener\(['"]click['"]/);
  assert.match(registerSource, /document\.readyState === 'complete'/);
  assert.match(registerSource, /updateViaCache: 'none'/);
  assert.doesNotMatch(registerSource, /beforeinstallprompt[\s\S]{0,400}\.prompt\s*\(\s*\)/);
  assert.match(offlineSource, /function retryOriginalNavigation\(\)[\s\S]*window\.location\.reload\(\)/);
  assert.match(offlineSource, /addEventListener\('online', retryOriginalNavigation/);
  assert.doesNotMatch(offlineSource, /location\.(?:href|replace|assign)[\s\S]{0,80}dashboard/i);

  const configuredHeaders = Object.fromEntries(vercel.headers.map(entry => [
    entry.source,
    Object.fromEntries(entry.headers.map(header => [header.key.toLowerCase(), header.value])),
  ]));
  assert.equal(configuredHeaders['/sw.js']?.['cache-control'], 'no-cache, no-store, must-revalidate');
  assert.equal(configuredHeaders['/sw.js']?.['content-type'], 'application/javascript; charset=utf-8');
  assert.equal(configuredHeaders['/sw.js']?.['service-worker-allowed'], '/');
  assert.equal(configuredHeaders['/manifest.json']?.['content-type'], 'application/manifest+json; charset=utf-8');
  assert.match(configuredHeaders['/manifest.json']?.['cache-control'] || '', /no-cache/);
  assert.doesNotMatch(configuredHeaders['/offline']?.['cache-control'] || '', /no-store|private/i);
});

test('PWA shell installs, updates and stays fail-closed for private traffic and offline navigation', { timeout: 45_000 }, async t => {
  const fixture = await createPwaServer();
  t.after(() => closeServer(fixture.server));

  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    isMobile: true,
    viewport: { height: 844, width: 390 },
  });
  const externalRequests = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== fixture.baseUrl) {
      externalRequests.push(url.href);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const loginResponse = await page.goto(`${fixture.baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  assert.equal(loginResponse?.status(), 200);
  await waitForControlledWorker(page);

  const registration = await page.evaluate(async () => {
    const current = await navigator.serviceWorker.ready;
    return {
      activeState: current.active?.state || null,
      controllerState: navigator.serviceWorker.controller?.state || null,
      scope: current.scope,
      scriptPath: new URL(current.active?.scriptURL || '', location.href).pathname,
      updateViaCache: current.updateViaCache,
    };
  });
  assert.equal(registration.activeState, 'activated');
  assert.equal(registration.controllerState, 'activated');
  assert.equal(registration.scope, `${fixture.baseUrl}/`);
  assert.equal(registration.scriptPath, '/sw.js');
  assert.equal(registration.updateViaCache, 'none');

  const browserMetadata = await page.evaluate(() => ({
    manifestPath: new URL(document.querySelector('link[rel="manifest"]')?.href || '', location.href).pathname,
    themeColor: document.querySelector('meta[name="theme-color"]')?.content || '',
    viewport: document.querySelector('meta[name="viewport"]')?.content || '',
  }));
  assert.equal(browserMetadata.manifestPath, '/manifest.json');
  assert.match(browserMetadata.themeColor, /^#[0-9a-f]{6}$/i);
  assert.match(browserMetadata.viewport, /width=device-width/i);
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(mobileOverflow <= 1, `login PWA desborda ${mobileOverflow}px en viewport móvil`);

  const installButton = page.locator('[data-pwa-install]');
  assert.equal(await installButton.isVisible(), false, 'el CTA de instalación debe iniciar oculto');
  const installEvent = await page.evaluate(async () => {
    window.__pwaPromptCalls = 0;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperties(event, {
      platforms: { value: ['web'] },
      prompt: {
        value: async () => {
          window.__pwaPromptCalls += 1;
        },
      },
      userChoice: {
        value: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
      },
    });
    window.dispatchEvent(event);
    await new Promise(resolve => setTimeout(resolve, 100));
    return { defaultPrevented: event.defaultPrevented, promptCalls: window.__pwaPromptCalls };
  });
  assert.equal(installEvent.defaultPrevented, true);
  assert.equal(installEvent.promptCalls, 0, 'la aplicación no debe abrir el prompt sin gesto del usuario');
  assert.equal(await installButton.isVisible(), true);
  await installButton.click();
  await page.waitForFunction(() => window.__pwaPromptCalls === 1);
  assert.ok((await page.locator('[data-pwa-install-status]').innerText()).trim().length > 0);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await page.waitForFunction(() => document.querySelector('[data-pwa-install]')?.hidden === true);

  const initialCaches = await cacheSnapshot(page);
  assert.ok(Object.hasOwn(initialCaches, fixture.initialCacheName));
  assert.deepEqual(initialCaches[fixture.initialCacheName], [...PUBLIC_CACHE_PATHS].sort());
  for (const cachedPath of initialCaches[fixture.initialCacheName]) {
    assert.ok(PUBLIC_CACHE_PATH_SET.has(cachedPath), `el shell no debe precachear ${cachedPath}`);
  }

  await page.goto(`${fixture.baseUrl}/network-first`, { waitUntil: 'domcontentloaded' });
  assert.equal(await page.locator('#networkVersion').innerText(), 'online-v1');
  fixture.state.networkFirstVersion = 'online-v2';
  const networkSecondResponse = await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(networkSecondResponse?.status(), 200);
  assert.equal(await page.locator('#networkVersion').innerText(), 'online-v2');
  assert.equal(fixture.state.networkFirstCalls, 2, 'cada navegación online debe consultar la red');

  await page.goto(`${fixture.baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await Promise.all([
    page.evaluate(() => fetch('/api/cache-probe').then(response => response.json())),
    page.evaluate(() => fetch('/api/auth/session').then(response => response.json())),
    page.evaluate(() => fetch('/private-probe.html').then(response => response.text())),
    page.evaluate(() => fetch('/authorized-probe', {
      headers: { Authorization: 'Bearer e2e-redacted' },
    }).then(response => response.text())),
  ]);
  const authorizedRequest = fixture.requests.find(request => request.pathname === '/authorized-probe');
  assert.equal(authorizedRequest?.authorization, true);

  const cachesAfterPrivateTraffic = await cacheSnapshot(page);
  const cachedPaths = Object.values(cachesAfterPrivateTraffic).flat();
  for (const sensitivePath of [...PRIVATE_PATHS, '/api/cache-probe', '/api/auth/session', '/network-first']) {
    assert.equal(cachedPaths.includes(sensitivePath), false, `${sensitivePath} no debe ingresar a CacheStorage`);
  }

  await page.evaluate(async initialName => {
    await caches.open('municontrol-shell-v1-retired-e2e');
    await caches.open('third-party-cache-e2e');
    if (!(await caches.keys()).includes(initialName)) throw new Error('cache inicial ausente');
    window.__pwaControllerChanges = 0;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.__pwaControllerChanges += 1;
    });
  }, fixture.initialCacheName);
  fixture.state.serveUpdatedWorker = true;
  await page.evaluate(async () => {
    const current = await navigator.serviceWorker.getRegistration('/');
    await current.update();
  });
  await page.waitForFunction(() => window.__pwaControllerChanges > 0, null, { timeout: 10_000 });
  await page.evaluate(async ({ expected, initial, retired }) => {
    const deadline = Date.now() + 10_000;
    let consecutiveMatches = 0;
    let lastKeys = [];
    while (Date.now() < deadline) {
      lastKeys = await caches.keys();
      const clean = lastKeys.includes(expected) && !lastKeys.includes(initial) && !lastKeys.includes(retired);
      consecutiveMatches = clean ? consecutiveMatches + 1 : 0;
      if (consecutiveMatches >= 3) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`cache cleanup timeout: ${lastKeys.join(',')}`);
  }, {
    expected: fixture.updatedCacheName,
    initial: fixture.initialCacheName,
    retired: 'municontrol-shell-v1-retired-e2e',
  });

  const updatedCaches = await cacheSnapshot(page);
  assert.ok(Object.hasOwn(updatedCaches, fixture.updatedCacheName));
  assert.equal(Object.hasOwn(updatedCaches, fixture.initialCacheName), false);
  assert.equal(Object.hasOwn(updatedCaches, 'municontrol-shell-v1-retired-e2e'), false);
  assert.equal(Object.hasOwn(updatedCaches, 'third-party-cache-e2e'), true, 'no debe borrar caches ajenos a MuniControl');

  const cleanCitizenResponse = await page.goto(`${fixture.baseUrl}/ciudadano`, { waitUntil: 'domcontentloaded' });
  assert.equal(cleanCitizenResponse?.status(), 200);
  assert.equal(new URL(page.url()).pathname, '/ciudadano');
  assert.equal(await page.locator('#citizen-source-status').count(), 1);
  const cleanOfflineResponse = await page.goto(`${fixture.baseUrl}/offline`, { waitUntil: 'domcontentloaded' });
  assert.equal(cleanOfflineResponse?.status(), 200);
  assert.equal(new URL(page.url()).pathname, '/offline');
  assert.equal(cleanOfflineResponse?.headers()['x-municontrol-offline-shell'], 'offline.html');

  await context.setOffline(true);
  const offlineFetchAudit = await page.evaluate(async () => {
    const probes = [
      ['/api/cache-probe', {}],
      ['/api/auth/session', {}],
      ['/private-probe.html', {}],
      ['/authorized-probe', { headers: { Authorization: 'Bearer e2e-redacted' } }],
    ];
    return Promise.all(probes.map(async ([url, options]) => {
      try {
        await fetch(url, options);
        return { rejected: false, url };
      } catch {
        return { rejected: true, url };
      }
    }));
  });
  assert.ok(offlineFetchAudit.every(result => result.rejected), JSON.stringify(offlineFetchAudit));

  for (const pathname of ['/login', '/inicio']) {
    const response = await page.goto(`${fixture.baseUrl}${pathname}`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200);
    assert.equal(response?.fromServiceWorker(), true);
    assert.equal(response?.headers()['x-municontrol-offline-shell'], 'offline.html');
    assert.ok(
      [pathname, '/offline'].includes(new URL(page.url()).pathname),
      `la navegación offline terminó en una ruta inesperada: ${page.url()}`,
    );
    assert.match(await page.locator('body').innerText(), /Se necesita conexión segura/i);
  }

  const offlineShellResponse = await page.goto(`${fixture.baseUrl}/offline`, { waitUntil: 'domcontentloaded' });
  assert.equal(offlineShellResponse?.status(), 200);
  assert.equal(offlineShellResponse?.fromServiceWorker(), true);
  assert.equal(offlineShellResponse?.headers()['x-municontrol-offline-shell'], 'offline.html');

  const offlineRequestsBeforeReconnect = fixture.requests.filter(request => request.pathname === '/offline').length;
  await context.setOffline(false);
  await page.waitForFunction(() => navigator.onLine === true);
  if (fixture.requests.filter(request => request.pathname === '/offline').length <= offlineRequestsBeforeReconnect) {
    await page.locator('#offlineRetry').click();
    await page.waitForLoadState('domcontentloaded');
  }
  assert.ok(
    fixture.requests.filter(request => request.pathname === '/offline').length > offlineRequestsBeforeReconnect,
    'el evento online debe recargar la ruta offline actual sin redirigir a una vista privada',
  );
  assert.equal(new URL(page.url()).pathname, '/offline');
  assert.deepEqual(externalRequests, [], `se bloquearon solicitudes externas: ${externalRequests.join(', ')}`);
  assert.deepEqual(consoleErrors.filter(message => !/Failed to load resource|ERR_INTERNET_DISCONNECTED/i.test(message)), []);
});
