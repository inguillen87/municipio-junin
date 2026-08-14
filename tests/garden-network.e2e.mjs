import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

import {
  GRH_GARDEN_NETWORK_SCHEMA_VERSION,
  inspectGrhGardenNetworkContract,
} from '../api/lib/grh-garden-network-contract.js';
import accessPolicy from '../shared/access-policy.cjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND_CONFIG = path.join(REPO, 'frontend', 'vite.config.ts');
const AUTH_CONTRACT = 'municontrol-auth-me-v1';
const CONTRACT_HEADER = 'X-MuniControl-Contract';
const REQUIRED_CAPABILITY = 'navigation.organization-analytics';
const ARTIFACT = JSON.parse(readFileSync(
  path.join(REPO, 'api', '_data', 'grh-garden-network.json'),
  'utf8',
));
const STATIC_SOURCES = Object.freeze({
  '/js/pwa-register.js': readFileSync(path.join(REPO, 'js', 'pwa-register.js'), 'utf8'),
  '/js/navigation-catalog.js': readFileSync(path.join(REPO, 'js', 'navigation-catalog.js'), 'utf8'),
  '/js/grh-garden-network-data.js': readFileSync(path.join(REPO, 'js', 'grh-garden-network-data.js'), 'utf8'),
  '/js/municipal-task-center.js': readFileSync(path.join(REPO, 'js', 'municipal-task-center.js'), 'utf8'),
  '/js/municipal-task-catalog.js': readFileSync(path.join(REPO, 'js', 'municipal-task-catalog.js'), 'utf8'),
  '/js/contextual-help-catalog.js': readFileSync(path.join(REPO, 'js', 'contextual-help-catalog.js'), 'utf8'),
  '/css/task-center.css': readFileSync(path.join(REPO, 'css', 'task-center.css'), 'utf8'),
});
const ICON_SOURCE = readFileSync(path.join(REPO, 'img', 'municontrol-icon.jpg'));
const MANIFEST_SOURCE = readFileSync(path.join(REPO, 'manifest.json'), 'utf8');
const AUTH_CLIENT_SOURCE = `
  (() => {
    window.MuniAuth = Object.freeze({
      async fetch(input, init) {
        const url = new URL(input instanceof Request ? input.url : input, window.location.href);
        if (url.origin !== window.location.origin) throw new Error('UNSAFE_ORIGIN');
        return window.fetch(url, init);
      },
      getToken() { return null; },
      isAuthError() { return false; }
    });
    window.MuniAuthReady = Promise.resolve(true);
  })();
`;
const MUNIGUIA_STUB_SOURCE = `
  export async function mountMuniGuia() { return true; }
  export function unmountMuniGuia() {}
`;

let scenarioSequence = 0;

assert.equal(inspectGrhGardenNetworkContract(ARTIFACT).ok, true);
assert.equal(Object.hasOwn(ARTIFACT.quality, 'assignedPeople'), false);
assert.equal(Object.hasOwn(ARTIFACT.quality, 'unassignedPeople'), false);
assert.equal(Object.hasOwn(ARTIFACT.summary, 'assignedPeople'), false);
assert.equal(Object.hasOwn(ARTIFACT.summary, 'unassignedPeople'), false);

function authorizedSession(includeCapability = true, role = 'INTENDENTE') {
  const base = {
    id: `garden-network-${role.toLowerCase()}-e2e`,
    name: 'Red de Jardines QA',
    role,
    tenantId: 'tenant-junin-e2e',
  };
  const access = accessPolicy.getSessionAccessForUser(base);
  assert.ok(access);
  const capabilities = access.capabilities.filter(capability =>
    includeCapability || capability !== REQUIRED_CAPABILITY);
  return {
    user: {
      ...base,
      capabilities,
      accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
      homeProfile: {
        ...access.homeProfile,
        priorityCapabilities: access.homeProfile.priorityCapabilities.filter(capability =>
          capabilities.includes(capability)),
      },
      tenant: { id: base.tenantId, shortName: 'Junín QA' },
    },
  };
}

function send(response, status, contentType, body = '', headers = {}) {
  response.statusCode = status;
  response.setHeader('Content-Type', contentType);
  response.setHeader('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(body);
}

function scenarioPlugin(scenario, apiLog) {
  let dataRequestCount = 0;
  return {
    name: `garden-network-e2e-${scenario.name}`,
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url || '/', 'http://127.0.0.1');
        if (url.pathname === '/jardines') {
          request.url = '/jardines.html';
          next();
          return;
        }
        if (url.pathname === '/js/auth-fetch.js') {
          send(response, 200, 'text/javascript; charset=utf-8', AUTH_CLIENT_SOURCE);
          return;
        }
        if (Object.hasOwn(STATIC_SOURCES, url.pathname)) {
          const contentType = url.pathname.endsWith('.css')
            ? 'text/css; charset=utf-8'
            : 'text/javascript; charset=utf-8';
          send(response, 200, contentType, STATIC_SOURCES[url.pathname]);
          return;
        }
        if (url.pathname === '/js/contextual-help.js') {
          send(response, 200, 'text/javascript; charset=utf-8', MUNIGUIA_STUB_SOURCE);
          return;
        }
        if (url.pathname === '/manifest.json') {
          send(response, 200, 'application/manifest+json; charset=utf-8', MANIFEST_SOURCE);
          return;
        }
        if (url.pathname === '/sw.js') {
          send(response, 200, 'text/javascript; charset=utf-8',
            'self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));');
          return;
        }
        if (url.pathname === '/img/municontrol-icon.jpg') {
          send(response, 200, 'image/jpeg', ICON_SOURCE);
          return;
        }
        if (url.pathname === '/inicio.html') {
          send(response, 200, 'text/html; charset=utf-8',
            '<!doctype html><html lang="es"><title>Inicio seguro</title><body><main id="safe-workspace">Inicio seguro</main></body></html>');
          return;
        }
        if (url.pathname === '/api/auth/me') {
          apiLog.push({ path: url.pathname, status: 200 });
          send(response, 200, 'application/json; charset=utf-8',
            JSON.stringify(authorizedSession(scenario.includeCapability !== false, scenario.role)),
            { [CONTRACT_HEADER]: AUTH_CONTRACT });
          return;
        }
        if (url.pathname === '/api/grh-garden-network') {
          const statuses = scenario.dataStatuses ?? [200];
          const status = statuses[Math.min(dataRequestCount, statuses.length - 1)];
          dataRequestCount += 1;
          apiLog.push({ path: url.pathname, status });
          if (status !== 200) {
            send(response, status, 'application/json; charset=utf-8', JSON.stringify({
              code: status === 403 ? 'FORBIDDEN' : 'GRH_GARDEN_NETWORK_UNAVAILABLE',
            }), { [CONTRACT_HEADER]: GRH_GARDEN_NETWORK_SCHEMA_VERSION });
            return;
          }
          send(response, 200, 'application/json; charset=utf-8', JSON.stringify(ARTIFACT),
            { [CONTRACT_HEADER]: GRH_GARDEN_NETWORK_SCHEMA_VERSION });
          return;
        }
        next();
      });
    },
  };
}

async function withScenario(scenario, callback) {
  const apiLog = [];
  scenarioSequence += 1;
  const server = await createViteServer({
    configFile: FRONTEND_CONFIG,
    cacheDir: path.join(tmpdir(), `municontrol-garden-network-vite-${process.pid}-${scenarioSequence}`),
    logLevel: 'error',
    plugins: [scenarioPlugin(scenario, apiLog)],
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await callback({ apiLog, baseUrl });
  } finally {
    await server.close();
  }
}

function monitorPage(page, baseUrl) {
  const consoleErrors = [];
  const pageErrors = [];
  const externalRequests = [];
  const origin = new URL(baseUrl).origin;
  page.on('console', message => {
    if (message.type() === 'error' && !/Failed to load resource.*(?:403|503)/u.test(message.text())) {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (/^(?:data|blob):/u.test(request.url())) return;
    if (new URL(request.url()).origin !== origin) externalRequests.push(request.url());
  });
  return { consoleErrors, pageErrors, externalRequests };
}

test('S24 garden network is source-backed, responsive, private and fail-closed', {
  timeout: 240_000,
}, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  await t.test('renders the real 24-month network at 1440, 390, 320 and forced colors', async () => {
    await withScenario({ name: 'real-artifact' }, async ({ apiLog, baseUrl }) => {
      const viewports = [
        { width: 1440, height: 1000, colorScheme: 'dark', forcedColors: 'none', reducedMotion: 'no-preference' },
        { width: 390, height: 844, colorScheme: 'light', forcedColors: 'none', reducedMotion: 'reduce' },
        { width: 320, height: 720, colorScheme: 'dark', forcedColors: 'none', reducedMotion: 'no-preference' },
        { width: 390, height: 844, colorScheme: 'dark', forcedColors: 'active', reducedMotion: 'reduce' },
      ];
      for (const viewport of viewports) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          colorScheme: viewport.colorScheme,
          forcedColors: viewport.forcedColors,
          reducedMotion: viewport.reducedMotion,
        });
        const page = await context.newPage();
        const diagnostics = monitorPage(page, baseUrl);
        const requestStart = apiLog.length;
        try {
          await page.goto(`${baseUrl}/jardines`, { waitUntil: 'domcontentloaded' });
          await page.locator('#gardenNetworkOverview').waitFor({ state: 'visible' });

          assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
          assert.match(await page.locator('.garden-hero__metric').textContent(), /107.*personas observadas/isu);
          assert.match(await page.locator('.garden-trust-strip').textContent(), /16.*45.*62/su);
          assert.match(
            await page.locator('.garden-trust-strip').textContent(),
            /personas en 4 unidades publicables/iu,
          );
          assert.equal(await page.locator('.garden-unit-card').count(), 4);
          assert.deepEqual(
            await page.locator('.garden-unit-card > strong').evaluateAll(nodes =>
              nodes.map(node => node.textContent?.trim().split(/\s/u)[0])),
            ['12', '12', '11', '10'],
          );
          assert.equal(await page.locator('.garden-trend__points circle').count(), 24);
          assert.equal(await page.locator('.garden-trend__table tbody tr').count(), 24);
          assert.match(await page.locator('.garden-trend__summary').textContent(), /90\s*→\s*107/u);
          assert.equal(await page.locator('.garden-technical[open], .garden-map-readiness[open]').count(), 0);
          assert.equal(
            await page.locator('.topbar__nav a[aria-current="page"]').getAttribute('href'),
            '/jardines',
          );
          assert.equal(await page.locator('svg[aria-labelledby="garden-trend-chart-title garden-trend-chart-description"]').count(), 1);
          assert.equal(await page.locator('[class*="map"] canvas, [class*="map"] img, .leaflet-container').count(), 0);
          assert.doesNotMatch(await page.locator('#gardenNetworkOverview').textContent(), /\b58\b/u);
          assert.doesNotMatch(
            await page.locator('.garden-protected').textContent(),
            /assignedPeople|unassignedPeople|personas con unidad|sin unidad informada/iu,
          );
          assert.equal(await page.locator('.garden-protected dl').count(), 0);
          assert.doesNotMatch(
            await page.locator('.garden-quality-card').textContent(),
            /assignedPeople|unassignedPeople|personas con unidad|sin unidad informada/iu,
          );

          if (process.env.MUNICONTROL_CAPTURE_S24 === '1') {
            await page.screenshot({
              path: path.join(
                tmpdir(),
                `municontrol-s24-${viewport.width}-${viewport.colorScheme}-${viewport.forcedColors}.png`,
              ),
              fullPage: true,
            });
          }

          await page.locator('.garden-map-readiness > summary').first().click();
          assert.match(
            await page.locator('.garden-map-readiness').first().textContent(),
            /no aporta domicilios ni geolocalización oficial/iu,
          );

          const audit = await page.evaluate(() => {
            const controls = Array.from(document.querySelectorAll(
              '.garden-button, .garden-trend__table > summary, .garden-map-readiness > summary, .garden-technical > summary, .theme-toggle, .global-menu-trigger',
            )).filter(element => {
              const style = getComputedStyle(element);
              const box = element.getBoundingClientRect();
              return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
            }).map(element => ({
              label: element.textContent?.trim() || element.getAttribute('aria-label') || element.className,
              height: element.getBoundingClientRect().height,
            }));
            return {
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              controls,
              theme: document.documentElement.dataset.theme,
            };
          });
          assert.ok(audit.overflow <= 1, `width=${viewport.width}:overflow=${audit.overflow}`);
          for (const control of audit.controls) {
            assert.ok(control.height >= 43.5, `${control.label}:height=${control.height}`);
          }
          if (viewport.forcedColors === 'none') assert.equal(audit.theme, viewport.colorScheme);
          assert.deepEqual(apiLog.slice(requestStart).map(entry => [entry.path, entry.status]), [
            ['/api/auth/me', 200],
            ['/api/grh-garden-network', 200],
          ]);
          assert.deepEqual(diagnostics.consoleErrors, []);
          assert.deepEqual(diagnostics.pageErrors, []);
          assert.deepEqual(diagnostics.externalRequests, []);
        } finally {
          await context.close();
        }
      }
    });
  });

  await t.test('shows no replacement values on 503 and recovers only after manual retry', async () => {
    await withScenario({ name: 'retry', dataStatuses: [503, 200] }, async ({ apiLog, baseUrl }) => {
      const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
      const page = await context.newPage();
      try {
        await page.goto(`${baseUrl}/jardines`, { waitUntil: 'domcontentloaded' });
        const blocked = page.locator('.blocked-state');
        await blocked.waitFor({ state: 'visible' });
        assert.match(await blocked.textContent(), /no mostramos cifras parciales, unidades pequeñas ni valores de reemplazo/iu);
        assert.doesNotMatch(await page.locator('#contenido-principal').textContent(), /Amanecer|Manitos de Colores|\b107\b/u);
        await page.getByRole('button', { name: 'Volver a intentar' }).click();
        await page.locator('#gardenNetworkOverview').waitFor({ state: 'visible' });
        assert.deepEqual(apiLog.map(entry => [entry.path, entry.status]), [
          ['/api/auth/me', 200],
          ['/api/grh-garden-network', 503],
          ['/api/auth/me', 200],
          ['/api/grh-garden-network', 200],
        ]);
      } finally {
        await context.close();
      }
    });
  });

  await t.test('keeps a backend 403 closed without exposing the artifact', async () => {
    await withScenario({ name: 'backend-forbidden', dataStatuses: [403] }, async ({ apiLog, baseUrl }) => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      try {
        await page.goto(`${baseUrl}/jardines`, { waitUntil: 'domcontentloaded' });
        await page.locator('.blocked-state').waitFor({ state: 'visible' });
        assert.doesNotMatch(await page.locator('#contenido-principal').textContent(), /Amanecer|Pata Garabata|\b107\b/u);
        await page.waitForTimeout(100);
        assert.deepEqual(apiLog.map(entry => [entry.path, entry.status]), [
          ['/api/auth/me', 200],
          ['/api/grh-garden-network', 403],
        ]);
      } finally {
        await context.close();
      }
    });
  });

  await t.test('denies low roles before reading garden data', async () => {
    await withScenario({
      name: 'no-capability',
      includeCapability: false,
      role: 'TENANT_USER',
    }, async ({ apiLog, baseUrl }) => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      try {
        await page.goto(`${baseUrl}/jardines`, { waitUntil: 'domcontentloaded' });
        await page.waitForURL(`${baseUrl}/inicio.html`);
        assert.equal(await page.locator('#safe-workspace').textContent(), 'Inicio seguro');
        assert.deepEqual(apiLog.map(entry => entry.path), ['/api/auth/me']);
      } finally {
        await context.close();
      }
    });
  });
});
