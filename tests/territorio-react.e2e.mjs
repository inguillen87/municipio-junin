import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

import accessPolicy from '../shared/access-policy.cjs';

import {
  MUNICIPAL_TERRITORY_ACCESS_ISSUE,
  MUNICIPAL_TERRITORY_BASEMAPS,
  MUNICIPAL_TERRITORY_LIMITS,
  MUNICIPAL_TERRITORY_LOCALITIES,
  MUNICIPAL_TERRITORY_SCHEMA_VERSION,
  MUNICIPAL_TERRITORY_SOURCE_DESCRIPTORS,
} from '../api/lib/municipal-territory-contract.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND_CONFIG = path.join(REPO, 'frontend', 'vite.config.ts');
const CONTRACT_HEADER = 'x-municontrol-contract';
const AUTH_CONTRACT = 'municontrol-auth-me-v1';
const MUNIGUIA_STUB_SOURCE = 'export async function mountMuniGuia(){return true} export function unmountMuniGuia(){}';
const SCREENSHOTS = Object.freeze({
  desktop: path.join(tmpdir(), 'municontrol-territorio-desktop-dark.png'),
  mobile: path.join(tmpdir(), 'municontrol-territorio-mobile-light.png'),
  forced: path.join(tmpdir(), 'municontrol-territorio-320-forced-colors.png'),
  partial: path.join(tmpdir(), 'municontrol-territorio-1024-partial.png'),
  degraded: path.join(tmpdir(), 'municontrol-territorio-1024-tile-degraded.png'),
});
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const LOCALITY_POINTS = Object.freeze([
  [-68.4123885264046, -33.1278250293367],
  [-68.4872690737808, -33.1465311500985],
  [-68.4804995237419, -33.0989413692546],
  [-68.5688059684624, -33.0996793533624],
  [-68.615165408116, -33.1767732947655],
  [-68.3774928550962, -33.2009807649662],
  [-68.5951625639971, -33.1204426186256],
]);
const BOUNDARY_RING = Object.freeze([
  Object.freeze([-68.75, -33.3]),
  Object.freeze([-68.2, -33.3]),
  Object.freeze([-68.2, -33.0]),
  Object.freeze([-68.75, -33.0]),
  Object.freeze([-68.75, -33.3]),
]);

const AUTH_CLIENT_SOURCE = `
  (() => {
    window.MuniAuth = Object.freeze({
      async fetch(input, init) {
        const url = new URL(input instanceof Request ? input.url : input, window.location.href);
        if (url.origin !== window.location.origin) throw new Error('UNSAFE_ORIGIN');
        return window.fetch(input, init);
      },
      getToken() { return null; },
      isAuthError() { return false; }
    });
  })();
`;

function createTerritoryFixture(status = 'ready') {
  return {
    schemaVersion: MUNICIPAL_TERRITORY_SCHEMA_VERSION,
    status,
    query: {
      queriedAt: '2026-08-11T12:00:00.000Z',
      departmentId: '50035',
      crs: 'EPSG:4326',
    },
    source: {
      boundary: structuredClone(MUNICIPAL_TERRITORY_SOURCE_DESCRIPTORS.boundary),
      localities: {
        ...structuredClone(MUNICIPAL_TERRITORY_SOURCE_DESCRIPTORS.localities),
        status: status === 'ready' ? 'available' : 'unavailable',
      },
    },
    jurisdiction: {
      id: '50035',
      name: 'Junín',
      province: { id: '50', name: 'Mendoza' },
      country: { code: 'AR', name: 'Argentina' },
    },
    boundary: {
      type: 'Feature',
      id: '50035',
      bbox: [-68.75, -33.3, -68.2, -33.0],
      properties: { name: 'Junín', sourceId: 'ign:departamento:50035' },
      geometry: { type: 'MultiPolygon', coordinates: [[BOUNDARY_RING.map(point => [...point])]] },
    },
    localities: status === 'ready' ? MUNICIPAL_TERRITORY_LOCALITIES.map((locality, index) => ({
      ...structuredClone(locality),
      centroid: {
        longitude: LOCALITY_POINTS[index][0],
        latitude: LOCALITY_POINTS[index][1],
      },
    })) : [],
    basemaps: structuredClone(MUNICIPAL_TERRITORY_BASEMAPS),
    accessIssues: status === 'ready' ? [] : [structuredClone(MUNICIPAL_TERRITORY_ACCESS_ISSUE)],
    limits: [...MUNICIPAL_TERRITORY_LIMITS],
  };
}

function authorizedSession(role = 'INTENDENTE', includeCapability = true) {
  const access = accessPolicy.getSessionAccessForUser({ role, tenantId: 'tenant-territory-e2e' });
  assert.ok(access);
  return {
    user: {
      id: `territory-e2e-${role.toLowerCase()}`,
      name: `Perfil ${role} QA`,
      role,
      tenantId: 'tenant-territory-e2e',
      capabilities: access.capabilities.filter(capability =>
        includeCapability || capability !== 'navigation.territory'
      ),
      accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
      homeProfile: access.homeProfile,
      tenant: { id: 'tenant-territory-e2e', shortName: 'Junín QA' },
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
  return {
    name: `territorio-react-e2e-${scenario.name}`,
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url || '/', 'http://127.0.0.1');
        if (url.pathname === '/territorio') {
          request.url = '/territorio.html';
          next();
          return;
        }
        if (url.pathname === '/js/auth-fetch.js') {
          send(response, 200, 'text/javascript; charset=utf-8', AUTH_CLIENT_SOURCE);
          return;
        }
        if (url.pathname === '/js/contextual-help.js') {
          send(response, 200, 'text/javascript; charset=utf-8', MUNIGUIA_STUB_SOURCE);
          return;
        }
        if (url.pathname === '/js/pwa-register.js') {
          send(response, 200, 'text/javascript; charset=utf-8', 'void 0;');
          return;
        }
        if (url.pathname === '/inicio.html') {
          send(response, 200, 'text/html; charset=utf-8', '<!doctype html><html><body><main id="safe-workspace">Inicio seguro</main></body></html>');
          return;
        }
        if (url.pathname === '/api/auth/me') {
          apiLog.push({ path: url.pathname, method: request.method });
          send(response, 200, 'application/json; charset=utf-8', JSON.stringify(
            scenario.authPayload ?? authorizedSession(scenario.role, scenario.includeCapability !== false),
          ), { [CONTRACT_HEADER]: AUTH_CONTRACT });
          return;
        }
        if (url.pathname === '/api/municipal-territory') {
          apiLog.push({ path: url.pathname, method: request.method });
          if (scenario.territoryMode === 'unavailable') {
            send(response, 503, 'application/json; charset=utf-8', JSON.stringify({
              code: 'MUNICIPAL_TERRITORY_UNAVAILABLE',
            }), { [CONTRACT_HEADER]: MUNICIPAL_TERRITORY_SCHEMA_VERSION });
            return;
          }
          const payload = createTerritoryFixture(scenario.territoryMode === 'partial' ? 'partial' : 'ready');
          scenario.mutate?.(payload);
          send(response, 200, 'application/json; charset=utf-8', JSON.stringify(payload), {
            [CONTRACT_HEADER]: scenario.contractHeader ?? MUNICIPAL_TERRITORY_SCHEMA_VERSION,
          });
          return;
        }
        next();
      });
    },
  };
}

async function withScenario(scenario, callback) {
  const apiLog = [];
  const server = await createViteServer({
    configFile: FRONTEND_CONFIG,
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
  const externalRequests = [];
  const origin = new URL(baseUrl).origin;
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('request', request => {
    const requestUrl = request.url();
    if (/^(?:data|blob):/.test(requestUrl)) return;
    if (new URL(requestUrl).origin !== origin) externalRequests.push(requestUrl);
  });
  return { consoleErrors, externalRequests };
}

async function newPage(browser, baseUrl, options = {}, tileMode = 'available') {
  const context = await browser.newContext(options);
  await context.route('https://wms.ign.gob.ar/**', async route => {
    if (tileMode === 'degraded') await route.abort('failed');
    else await route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  });
  const page = await context.newPage();
  return { context, page, diagnostics: monitorPage(page, baseUrl) };
}

function assertOnlyOfficialTiles(externalRequests) {
  assert.ok(externalRequests.length > 0, 'authorized map should request at least one base tile');
  assert.equal(externalRequests.every(requestUrl => {
    const url = new URL(requestUrl);
    return url.protocol === 'https:' && url.hostname === 'wms.ign.gob.ar' &&
      url.pathname.startsWith('/geoserver/gwc/service/tms/1.0.0/');
  }), true, JSON.stringify(externalRequests));
}

async function seedTheme(context, theme) {
  await context.addInitScript(selectedTheme => {
    localStorage.setItem('govtech_theme', selectedTheme);
    localStorage.setItem('municontrol-color-theme:v1', selectedTheme);
  }, theme);
}

async function visualAudit(page) {
  return page.evaluate(() => {
    const parseColor = value => {
      if (!value || value === 'none' || value === 'transparent') return [0, 0, 0, 0];
      const match = String(value).match(/rgba?\(([^)]+)\)/i);
      if (match) {
        const parts = match[1].replace('/', ' ').split(/[\s,]+/).filter(Boolean).map(Number);
        return [parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1];
      }
      const srgb = String(value).match(/color\(srgb\s+([^)]+)\)/i);
      if (!srgb) return null;
      const parts = srgb[1].replace('/', ' ').split(/[\s,]+/).filter(Boolean);
      const channel = part => part.endsWith('%') ? Number.parseFloat(part) * 2.55 : Number(part) * 255;
      const alpha = parts[3]?.endsWith('%') ? Number.parseFloat(parts[3]) / 100 : Number(parts[3]);
      return [channel(parts[0]), channel(parts[1]), channel(parts[2]), Number.isFinite(alpha) ? alpha : 1];
    };
    const composite = (front, back) => {
      const alpha = front[3] + back[3] * (1 - front[3]);
      if (!alpha) return [0, 0, 0, 0];
      return [0, 1, 2].map(index => (
        (front[index] * front[3] + back[index] * back[3] * (1 - front[3])) / alpha
      )).concat(alpha);
    };
    const luminance = color => color.slice(0, 3).map(channel => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const ratio = (first, second) => {
      const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    const background = node => {
      const layers = [];
      let current = node;
      while (current instanceof Element) {
        const color = parseColor(getComputedStyle(current).backgroundColor);
        if (color && color[3] > 0) layers.push(color);
        if (color && color[3] >= 1) break;
        current = current.parentElement;
      }
      let result = [255, 255, 255, 1];
      for (let index = layers.length - 1; index >= 0; index -= 1) result = composite(layers[index], result);
      return result;
    };
    const visible = node => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return node.getClientRects().length > 0 && rect.width > 0 && rect.height > 0 &&
        style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 &&
        !node.closest('.sr-only');
    };
    const ownsText = node => Array.from(node.childNodes).some(child =>
      child.nodeType === Node.TEXT_NODE && child.textContent.trim()
    );
    const label = node => `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}.${
      typeof node.className === 'string' ? node.className.trim().replace(/\s+/g, '.') : ''
    }`;
    const textNodes = Array.from(document.querySelectorAll('body *')).filter(node =>
      visible(node) && !node.matches('script, style, title, option') && ownsText(node)
    );
    const textViolations = textNodes.map(node => {
      const style = getComputedStyle(node);
      const back = background(node);
      const frontRaw = parseColor(style.color);
      return { selector: label(node), text: node.textContent.trim().slice(0, 60), value: frontRaw ? ratio(composite(frontRaw, back), back) : 0 };
    }).filter(item => item.value < 4.49);
    const fontViolations = textNodes.map(node => ({
      selector: label(node),
      size: Number.parseFloat(getComputedStyle(node).fontSize),
    })).filter(item => item.size < 11.99);
    const controls = Array.from(document.querySelectorAll(
      '.theme-toggle, .territory-map-button, .territory-toggle, .territory-select select, .territory-search input, .territory-localities__list button, .territory-locality-detail button',
    )).filter(visible);
    const boundaryViolations = controls.map(node => {
      const style = getComputedStyle(node);
      const outside = background(node.parentElement || node);
      const borderRaw = parseColor(style.borderTopColor);
      return { selector: label(node), value: borderRaw ? ratio(composite(borderRaw, outside), outside) : 0 };
    }).filter(item => item.value < 2.99);
    return {
      theme: document.documentElement.dataset.theme,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      textViolations,
      fontViolations,
      boundaryViolations,
    };
  });
}

test('Centro Territorial React is governed, interactive, responsive and fail-closed', {
  timeout: 300_000,
}, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  await t.test('renders the map-first ready contract and all controls on desktop', async () => {
    await withScenario({ name: 'ready-desktop', role: 'INTENDENTE' }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newPage(browser, baseUrl, {
        viewport: { width: 1_440, height: 1_000 },
      });
      try {
        await page.goto(`${baseUrl}/territorio`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#territoryMap.leaflet-container');
        await page.waitForFunction(() => document.querySelector('.territory-map-state')?.getAttribute('data-state') === 'available');
        assert.equal(await page.locator('.territory-kpis .kpi-card').count(), 3);
        assert.deepEqual(await page.locator('.territory-kpis .kpi-card__label').allTextContents(), [
          'Jurisdicción',
          'Localidades oficiales',
          'Fuentes disponibles',
        ]);
        assert.equal(await page.locator('#territoryMap').getAttribute('role'), 'region');
        assert.equal(await page.locator('#territoryLocalities [data-locality-id]').count(), 7);
        assert.equal(await page.locator('#territorySources article').count(), 3);
        assert.equal(await page.locator('select[aria-label="Seleccionar mapa base IGN"] option').count(), 4);
        assert.equal(await page.locator('.territory-map-attribution a').last().textContent(), 'Instituto Geográfico Nacional · Argenmap');
        assert.match(await page.locator('#territorySources').textContent(), /GeoRef/);
        const defaultText = await page.locator('main').textContent();
        assert.match(defaultText, /no es tiempo real/i);
        assert.match(defaultText, /Mapa oficial del departamento · límite y localidades/i);
        assert.match(defaultText, /Centro Territorial Junín · Mendoza/);
        assert.match(defaultText, /Departamento de Junín/);
        assert.match(defaultText, /Mendoza · Argentina/);
        assert.doesNotMatch(defaultText, /Buenos Aires|Partido de Junín|Ajustar partido/i);
        assert.doesNotMatch(defaultText, /datos en tiempo real|obras ejecutadas|reclamos activos|dotación activa/i);
        assert.doesNotMatch(defaultText, /EPSG|\bsegundos?\b/i);

        const overlayCount = await page.locator('#territoryMap .leaflet-overlay-pane path').count();
        assert.equal(overlayCount, 8, 'one boundary plus seven official locality markers');
        await page.getByLabel('Límite').uncheck();
        assert.equal(await page.locator('#territoryMap .leaflet-overlay-pane path').count(), 7);
        await page.getByLabel('Límite').check();
        assert.equal(await page.locator('#territoryMap .leaflet-overlay-pane path').count(), 8);

        const search = page.locator('#territory-locality-search');
        await search.fill('barriales');
        assert.equal(await page.locator('#territoryLocalities [data-locality-id]').count(), 1);
        await page.locator('#territoryLocalities [data-locality-id]').press('Enter');
        assert.match(await page.locator('.territory-locality-detail').textContent(), /Los Barriales/);
        assert.equal(await page.locator('[data-locality-id="50035040"]').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('#territoryMap path[fill="#f59e0b"]').count(), 1);
        await page.locator('button.theme-toggle').click();
        assert.equal(await page.locator('#territoryMap path[fill="#f59e0b"]').count(), 1, 'theme change preserves selected marker');

        await Promise.all([
          page.waitForRequest(request => request.url().includes('argenmap_oscuro')),
          page.selectOption('select[aria-label="Seleccionar mapa base IGN"]', 'oscuro'),
        ]);
        await page.getByRole('button', { name: 'Restablecer' }).click();
        assert.equal(await search.inputValue(), '');
        assert.equal(await page.locator('select[aria-label="Seleccionar mapa base IGN"]').inputValue(), 'argenmap');
        assert.equal(await page.locator('[data-locality-id][aria-pressed="true"]').count(), 0);

        assert.deepEqual(apiLog.map(entry => entry.path), ['/api/auth/me', '/api/municipal-territory']);
        assert.deepEqual(diagnostics.consoleErrors, []);
        assertOnlyOfficialTiles(diagnostics.externalRequests);
      } finally {
        await context.close();
      }
    });
  });

  await t.test('keeps light and dark themes legible without overflow at 1440, 390 and 320 pixels', async () => {
    await withScenario({ name: 'visual-matrix', role: 'DEMO' }, async ({ baseUrl }) => {
      for (const viewport of [
        { name: 'desktop-dark', width: 1_440, height: 1_000, theme: 'dark' },
        { name: 'mobile-light', width: 390, height: 844, theme: 'light' },
        { name: 'compact-forced', width: 320, height: 720, theme: 'dark', forcedColors: 'active' },
      ]) {
        const { context, page, diagnostics } = await newPage(browser, baseUrl, {
          viewport: { width: viewport.width, height: viewport.height },
          reducedMotion: viewport.width < 1_000 ? 'reduce' : 'no-preference',
          forcedColors: viewport.forcedColors ?? 'none',
        });
        try {
          await seedTheme(context, viewport.theme);
          await page.goto(`${baseUrl}/territorio`, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('#territoryMap.leaflet-container');
          const audit = await visualAudit(page);
          assert.equal(audit.theme, viewport.theme, viewport.name);
          assert.ok(audit.overflow <= 1, `${viewport.name} overflow ${audit.overflow}`);
          assert.deepEqual(audit.textViolations, [], `${viewport.name} text ${JSON.stringify(audit.textViolations)}`);
          assert.deepEqual(audit.fontViolations, [], `${viewport.name} font ${JSON.stringify(audit.fontViolations)}`);
          assert.deepEqual(audit.boundaryViolations, [], `${viewport.name} boundaries ${JSON.stringify(audit.boundaryViolations)}`);
          assert.deepEqual(diagnostics.consoleErrors, [], viewport.name);
          assertOnlyOfficialTiles(diagnostics.externalRequests);
          if (viewport.name === 'desktop-dark') {
            await page.screenshot({ path: SCREENSHOTS.desktop, fullPage: true });
          } else if (viewport.name === 'mobile-light') {
            await page.screenshot({ path: SCREENSHOTS.mobile, fullPage: true });
          } else if (viewport.name === 'compact-forced') {
            await page.screenshot({ path: SCREENSHOTS.forced, fullPage: true });
          }
        } finally {
          await context.close();
        }
      }
    });
  });

  await t.test('authorizes the full published role matrix, including Inspector and Demo', async () => {
    const scenario = { name: 'role-matrix', role: 'SUPER_ADMIN' };
    await withScenario(scenario, async ({ apiLog, baseUrl }) => {
      for (const role of ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'TENANT_USER', 'CONTADOR', 'INSPECTOR', 'DEMO']) {
        scenario.role = role;
        const logStart = apiLog.length;
        const { context, page, diagnostics } = await newPage(browser, baseUrl, {
          viewport: { width: 390, height: 844 },
          reducedMotion: 'reduce',
        });
        try {
          await page.goto(`${baseUrl}/territorio`, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('#page-title');
          assert.equal(await page.locator('#territoryMap').count(), 1, role);
          assert.deepEqual(apiLog.slice(logStart).map(entry => entry.path), ['/api/auth/me', '/api/municipal-territory'], role);
          assert.deepEqual(diagnostics.consoleErrors, [], role);
          assertOnlyOfficialTiles(diagnostics.externalRequests);
        } finally {
          await context.close();
        }
      }
    });
  });

  await t.test('redirects a session without the capability before requesting territorial data', async () => {
    await withScenario({ name: 'denied-capability', role: 'DEMO', includeCapability: false }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newPage(browser, baseUrl, { viewport: { width: 390, height: 844 } });
      try {
        await page.goto(`${baseUrl}/territorio`, { waitUntil: 'domcontentloaded' });
        await page.waitForURL(`${baseUrl}/inicio.html`, { timeout: 60_000 });
        assert.deepEqual(apiLog.map(entry => entry.path), ['/api/auth/me']);
        assert.deepEqual(diagnostics.externalRequests, []);
        assert.deepEqual(diagnostics.consoleErrors, []);
      } finally {
        await context.close();
      }
    });
  });

  await t.test('renders an honest partial state without locality substitutes', async () => {
    await withScenario({ name: 'partial', role: 'INSPECTOR', territoryMode: 'partial' }, async ({ baseUrl }) => {
      const { context, page, diagnostics } = await newPage(browser, baseUrl, { viewport: { width: 1_024, height: 800 } });
      try {
        await page.goto(`${baseUrl}/territorio`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-territory-status="partial"] #territoryMap');
        assert.match(await page.locator('.territory-notice').textContent(), /Localidades temporalmente no disponibles/);
        assert.equal(await page.locator('[data-locality-id]').count(), 0);
        assert.equal(await page.locator('#territory-locality-search').isDisabled(), true);
        assert.match(await page.locator('.territory-locality-detail').textContent(), /Localidades no disponibles/);
        assert.match(await page.locator('.territory-locality-detail').textContent(), /GeoRef no respondió; no se muestran sustitutos/);
        assert.doesNotMatch(await page.locator('.territory-locality-detail').textContent(), /Seleccioná|Usá el buscador/);
        assert.equal(await page.locator('#territoryMap .leaflet-overlay-pane path').count(), 1, 'only required boundary remains');
        await page.screenshot({ path: SCREENSHOTS.partial, fullPage: true });
        assert.deepEqual(diagnostics.consoleErrors, []);
        assertOnlyOfficialTiles(diagnostics.externalRequests);
      } finally {
        await context.close();
      }
    });
  });

  await t.test('keeps official vectors usable when IGN tiles fail', async () => {
    await withScenario({ name: 'tile-degraded', role: 'INTENDENTE' }, async ({ baseUrl }) => {
      const { context, page, diagnostics } = await newPage(
        browser,
        baseUrl,
        { viewport: { width: 1_024, height: 800 }, reducedMotion: 'reduce' },
        'degraded',
      );
      try {
        await page.goto(`${baseUrl}/territorio`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.territory-map-state[data-state="degraded"]');
        assert.match(await page.locator('.territory-map-state').textContent(), /límite y las localidades oficiales continúan visibles/i);
        assert.equal(await page.locator('#territoryMap .leaflet-overlay-pane path').count(), 8);
        await page.locator('#territory-locality-search').fill('junín');
        await page.locator('[data-locality-id="50035020"]').click();
        assert.match(await page.locator('.territory-locality-detail').textContent(), /Junín/);
        await page.screenshot({ path: SCREENSHOTS.degraded, fullPage: true });
        assert.equal(diagnostics.consoleErrors.every(message => /ERR_FAILED|Failed to load resource/i.test(message)), true);
        assertOnlyOfficialTiles(diagnostics.externalRequests);
      } finally {
        await context.close();
      }
    });
  });

  await t.test('blocks all figures for mutated contracts and a 503', async () => {
    const mutations = [
      { name: 'top-shape', mutate: value => { value.extra = true; } },
      { name: 'locality-identity', mutate: value => { value.localities[0].name = 'Localidad inventada'; } },
      { name: 'bbox', mutate: value => { value.boundary.bbox[0] += 0.01; } },
      { name: 'basemap-attribution', mutate: value => { value.basemaps[0].attribution = 'Fuente desconocida'; } },
      { name: 'source-endpoint', mutate: value => { value.source.boundary.endpoint = 'https://attacker.invalid/ows'; } },
      { name: 'wrong-department', mutate: value => { value.query.departmentId = '06413'; } },
      { name: 'wrong-province', mutate: value => { value.jurisdiction.province = { id: '06', name: 'Buenos Aires' }; } },
    ];
    for (const mutation of mutations) {
      await withScenario({ name: `mutated-${mutation.name}`, role: 'INTENDENTE', mutate: mutation.mutate }, async ({ baseUrl }) => {
        const { context, page, diagnostics } = await newPage(browser, baseUrl, { viewport: { width: 390, height: 844 } });
        try {
          await page.goto(`${baseUrl}/territorio`, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('.blocked-state[role="alert"]');
          assert.equal(await page.locator('#territoryMap, .territory-kpis').count(), 0, mutation.name);
          assert.equal(await page.locator('.blocked-state h1').textContent(), 'Cartografía no disponible');
          assert.match(await page.locator('.blocked-state').textContent(), /No pudimos verificar la fuente territorial necesaria/i);
          assert.deepEqual(diagnostics.externalRequests, []);
          assert.deepEqual(diagnostics.consoleErrors, []);
        } finally {
          await context.close();
        }
      });
    }

    await withScenario({ name: 'api-503', role: 'INTENDENTE', territoryMode: 'unavailable' }, async ({ baseUrl }) => {
      const { context, page, diagnostics } = await newPage(browser, baseUrl, { viewport: { width: 390, height: 844 } });
      try {
        await page.goto(`${baseUrl}/territorio`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.blocked-state[role="alert"]');
        assert.equal(await page.locator('#territoryMap, .territory-kpis').count(), 0);
        assert.deepEqual(diagnostics.externalRequests, []);
        assert.ok(diagnostics.consoleErrors.every(message => /503 \(Service Unavailable\)/i.test(message)));
      } finally {
        await context.close();
      }
    });
  });

  await t.test('ships local Leaflet assets without CDN script or stylesheet tags', () => {
    const html = readFileSync(path.join(REPO, 'frontend', 'territorio.html'), 'utf8');
    const main = readFileSync(path.join(REPO, 'frontend', 'src', 'territory-main.tsx'), 'utf8');
    assert.doesNotMatch(html, /<(?:script|link)[^>]+https?:\/\//i);
    assert.match(main, /import ['"]leaflet\/dist\/leaflet\.css['"]/);
    assert.match(main, /from ['"]\.\/territory\/TerritoryApp['"]/);
  });
});
