import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

import { buildGrhExecutiveProjection } from '../api/lib/grh-executive-projection.js';
import { buildGrhQualityProjection } from '../api/lib/grh-quality-projection.js';
import {
  MUNICIPAL_TERRITORY_BASEMAPS,
  MUNICIPAL_TERRITORY_LIMITS,
  MUNICIPAL_TERRITORY_LOCALITIES,
  MUNICIPAL_TERRITORY_SCHEMA_VERSION,
  MUNICIPAL_TERRITORY_SOURCE_DESCRIPTORS,
} from '../api/lib/municipal-territory-contract.js';
import { MUNIGUIA_CATALOG } from '../js/contextual-help-catalog.js';
import accessPolicy from '../shared/access-policy.cjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND_CONFIG = path.join(REPO, 'frontend', 'vite.config.ts');
const AUTH_CONTRACT = 'municontrol-auth-me-v1';
const CONTRACT_HEADER = 'x-municontrol-contract';
const GUIDE_RUNTIME_PATH = '/js/contextual-help.js';
const GUIDE_CATALOG_PATH = '/js/contextual-help-catalog.js';
const GUIDE_STYLES_PATH = '/css/contextual-help.css';
const GUIDE_SOURCE = readFileSync(path.join(REPO, 'js', 'contextual-help.js'), 'utf8');
const GUIDE_CATALOG_SOURCE = readFileSync(path.join(REPO, 'js', 'contextual-help-catalog.js'), 'utf8');
const GUIDE_STYLES_SOURCE = readFileSync(path.join(REPO, 'css', 'contextual-help.css'), 'utf8');
const WORKFORCE_FINANCE_CLIENT_SOURCE = readFileSync(
  path.join(REPO, 'js', 'grh-workforce-finance-data.js'),
  'utf8',
);
const IMPORT_QUALITY_HISTORY_CLIENT_SOURCE = readFileSync(
  path.join(REPO, 'js', 'grh-import-quality-history-data.js'),
  'utf8',
);
const IMPORT_QUALITY_HISTORY_FIXTURE = JSON.parse(readFileSync(
  path.join(REPO, 'api', '_data', 'grh-import-quality-history.json'),
  'utf8',
));
const PROFILE = JSON.parse(readFileSync(path.join(REPO, 'api', '_data', 'grh-profile.json'), 'utf8'));
const SEMANTIC = JSON.parse(readFileSync(path.join(REPO, 'api', '_data', 'grh-semantic.json'), 'utf8'));
const { createOrganizationAnalyticsContract } = await import(
  '../frontend/src/domain/organization-analytics-test-fixture.ts'
);

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
  })();
`;

const ROUTES = Object.freeze([
  Object.freeze({
    id: 'organizationAnalytics',
    path: '/estructura',
    html: '/estructura.html',
    capability: 'navigation.organization-analytics',
    dataPath: '/api/grh-organization-analytics',
    contract: 'grh-organization-analytics-v2',
    role: 'INTENDENTE',
    readySelector: '#structure-title',
  }),
  Object.freeze({
    id: 'grhExecutive',
    path: '/ejecutivo',
    html: '/ejecutivo.html',
    capability: 'navigation.grh-executive',
    dataPath: '/api/grh-executive',
    contract: 'grh-executive-v2',
    role: 'CONTADOR',
    readySelector: '#page-title',
  }),
  Object.freeze({
    id: 'quality',
    path: '/calidad',
    html: '/calidad.html',
    capability: 'navigation.data-quality',
    dataPath: '/api/grh-quality',
    contract: 'grh-quality-v1',
    role: 'TENANT_ADMIN',
    readySelector: '#snapshotMeta',
  }),
  Object.freeze({
    id: 'territory',
    path: '/territorio',
    html: '/territorio.html',
    capability: 'navigation.territory',
    dataPath: '/api/municipal-territory',
    contract: MUNICIPAL_TERRITORY_SCHEMA_VERSION,
    role: 'INSPECTOR',
    readySelector: '[data-territory-status="ready"]',
  }),
]);

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

function territoryFixture() {
  return {
    schemaVersion: MUNICIPAL_TERRITORY_SCHEMA_VERSION,
    status: 'ready',
    query: {
      queriedAt: '2026-08-11T12:00:00.000Z',
      departmentId: '50035',
      crs: 'EPSG:4326',
    },
    source: {
      boundary: structuredClone(MUNICIPAL_TERRITORY_SOURCE_DESCRIPTORS.boundary),
      localities: {
        ...structuredClone(MUNICIPAL_TERRITORY_SOURCE_DESCRIPTORS.localities),
        status: 'available',
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
    localities: MUNICIPAL_TERRITORY_LOCALITIES.map((locality, index) => ({
      ...structuredClone(locality),
      centroid: {
        longitude: LOCALITY_POINTS[index][0],
        latitude: LOCALITY_POINTS[index][1],
      },
    })),
    basemaps: structuredClone(MUNICIPAL_TERRITORY_BASEMAPS),
    accessIssues: [],
    limits: [...MUNICIPAL_TERRITORY_LIMITS],
  };
}

const FIXTURES = Object.freeze({
  '/api/grh-organization-analytics': createOrganizationAnalyticsContract(),
  '/api/grh-executive': buildGrhExecutiveProjection(SEMANTIC, { audience: 'portable' }),
  '/api/grh-quality': buildGrhQualityProjection(PROFILE, SEMANTIC),
  '/api/grh-import-quality-history': IMPORT_QUALITY_HISTORY_FIXTURE,
  '/api/municipal-territory': territoryFixture(),
});

function routeForPath(pathname) {
  return ROUTES.find(route => route.path === pathname || route.html === pathname) ?? null;
}

function scenarioFromRequest(request) {
  try {
    const referer = new URL(String(request.headers.referer || ''));
    return {
      includeHelp: referer.searchParams.get('help') !== 'off',
      role: referer.searchParams.get('role') || 'INTENDENTE',
      trace: referer.searchParams.get('trace') || 'untraced',
    };
  } catch {
    return { includeHelp: true, role: 'INTENDENTE', trace: 'untraced' };
  }
}

function authoritativeSession(role, includeHelp = true) {
  const tenantId = 'tenant-react-muniguia-e2e';
  const access = accessPolicy.getSessionAccessForUser({ role, tenantId });
  assert.ok(access, `authoritative access for ${role}`);
  const capabilities = access.capabilities.filter(capability => includeHelp || capability !== 'navigation.help');
  return {
    user: {
      id: `react-muniguia-${role.toLowerCase()}`,
      name: `Perfil ${role} QA`,
      email: `${role.toLowerCase()}@internal.invalid`,
      role,
      tenantId,
      tenant: { id: tenantId, shortName: 'Junín QA' },
      capabilities,
      accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
      homeProfile: access.homeProfile,
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

function instrumentGuideRuntime(source) {
  const marker = 'export async function mountMuniGuia(input) {';
  assert.ok(source.includes(marker), 'guide runtime mount export');
  const instrumented = source.replace(
    marker,
    `${marker}\n  window.__muniGuideMountInputs = [...(window.__muniGuideMountInputs || []), structuredClone(input)];`,
  );
  return `${instrumented}\nwindow.__muniGuideTestRuntime = Object.freeze({ mountMuniGuia, unmountMuniGuia });\n`;
}

function instrumentReactRoot(code) {
  const marker = 'createRoot(rootElement).render(';
  if (!code.includes(marker)) return null;
  return code.replace(
    marker,
    'const __muniTestRoot = createRoot(rootElement); globalThis.__muniReactRoot = __muniTestRoot; __muniTestRoot.render(',
  );
}

function e2ePlugin(apiLog, assetLog) {
  return {
    name: 'react-muniguia-e2e',
    enforce: 'pre',
    transform(code, id) {
      if (!/[\\/](?:structure-main|executive-main|territory-main|main)\.tsx(?:\?|$)/.test(id)) return null;
      const transformed = instrumentReactRoot(code);
      return transformed === null ? null : { code: transformed, map: null };
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url || '/', 'http://127.0.0.1');
        const route = routeForPath(url.pathname);
        if (route && url.pathname === route.path) {
          request.url = `${route.html}${url.search}`;
          next();
          return;
        }

        if (url.pathname === '/js/pwa-register.js') {
          send(response, 200, 'text/javascript; charset=utf-8', 'void 0;');
          return;
        }
        if (url.pathname === '/js/auth-fetch.js') {
          send(response, 200, 'text/javascript; charset=utf-8', AUTH_CLIENT_SOURCE);
          return;
        }
        if (url.pathname === '/js/grh-workforce-finance-data.js') {
          send(response, 200, 'text/javascript; charset=utf-8', WORKFORCE_FINANCE_CLIENT_SOURCE);
          return;
        }
        if (url.pathname === '/js/grh-import-quality-history-data.js') {
          send(response, 200, 'text/javascript; charset=utf-8', IMPORT_QUALITY_HISTORY_CLIENT_SOURCE);
          return;
        }
        if (url.pathname === '/img/municontrol-icon.jpg') {
          send(response, 204, 'image/jpeg');
          return;
        }
        if (url.pathname === GUIDE_RUNTIME_PATH) {
          assetLog.push({ path: url.pathname, ...scenarioFromRequest(request) });
          send(response, 200, 'text/javascript; charset=utf-8', instrumentGuideRuntime(GUIDE_SOURCE));
          return;
        }
        if (url.pathname === GUIDE_CATALOG_PATH) {
          assetLog.push({ path: url.pathname, ...scenarioFromRequest(request) });
          send(response, 200, 'text/javascript; charset=utf-8', GUIDE_CATALOG_SOURCE);
          return;
        }
        if (url.pathname === GUIDE_STYLES_PATH) {
          assetLog.push({ path: url.pathname, ...scenarioFromRequest(request) });
          send(response, 200, 'text/css; charset=utf-8', GUIDE_STYLES_SOURCE);
          return;
        }
        if (url.pathname === '/inicio.html') {
          send(response, 200, 'text/html; charset=utf-8', '<!doctype html><html lang="es"><body><main id="safe-workspace">Inicio seguro</main></body></html>');
          return;
        }

        if (url.pathname === '/api/auth/me') {
          const scenario = scenarioFromRequest(request);
          apiLog.push({ method: request.method, path: url.pathname, ...scenario });
          send(response, 200, 'application/json; charset=utf-8', JSON.stringify(
            authoritativeSession(scenario.role, scenario.includeHelp),
          ), { [CONTRACT_HEADER]: AUTH_CONTRACT });
          return;
        }

        const fixture = FIXTURES[url.pathname];
        if (fixture) {
          const scenario = scenarioFromRequest(request);
          const matchingRoute = ROUTES.find(candidate => candidate.dataPath === url.pathname);
          const contract = url.pathname === '/api/grh-import-quality-history'
            ? 'grh-import-quality-history-v1'
            : matchingRoute?.contract ?? '';
          apiLog.push({ method: request.method, path: url.pathname, ...scenario });
          send(response, 200, 'application/json; charset=utf-8', JSON.stringify(fixture), {
            [CONTRACT_HEADER]: contract,
          });
          return;
        }
        next();
      });
    },
  };
}

async function createHarness() {
  const apiLog = [];
  const assetLog = [];
  const server = await createViteServer({
    configFile: FRONTEND_CONFIG,
    logLevel: 'error',
    plugins: [e2ePlugin(apiLog, assetLog)],
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === 'object');
  return {
    apiLog,
    assetLog,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => server.close(),
  };
}

function monitorPage(page, baseUrl) {
  const consoleErrors = [];
  const externalRequests = [];
  const pageErrors = [];
  const origin = new URL(baseUrl).origin;
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    const requestUrl = request.url();
    if (/^(?:data|blob):/.test(requestUrl)) return;
    if (new URL(requestUrl).origin !== origin) externalRequests.push(requestUrl);
  });
  return { consoleErrors, externalRequests, pageErrors };
}

async function createPage(browser, baseUrl, { forcedColors, theme, viewport }) {
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    viewport,
    ...(forcedColors ? { forcedColors } : {}),
  });
  await context.addInitScript(selectedTheme => {
    localStorage.setItem('municontrol-color-theme:v1', selectedTheme);
    localStorage.setItem('govtech_theme', selectedTheme);

    const storageLog = [];
    Object.defineProperty(window, '__muniStorageLog', { value: storageLog, configurable: false });
    const storagePrototype = Object.getPrototypeOf(localStorage);
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      const original = storagePrototype[method];
      Object.defineProperty(storagePrototype, method, {
        configurable: true,
        writable: true,
        value(key, ...args) {
          storageLog.push({ method, key: String(key), stack: new Error().stack || '' });
          return original.call(this, key, ...args);
        },
      });
    }

    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (descriptor?.get && descriptor?.set) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set(value) {
          if (typeof value === 'string' && value.startsWith('https://wms.ign.gob.ar/')) {
            queueMicrotask(() => this.dispatchEvent(new Event('error')));
            return;
          }
          descriptor.set.call(this, value);
        },
      });
    }
  }, theme);
  const page = await context.newPage();
  return { context, diagnostics: monitorPage(page, baseUrl), page };
}

function colorChannels(value) {
  const match = String(value).match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/);
  return match ? match.slice(1, 4).map(Number) : null;
}

function relativeLuminance(value) {
  const channels = colorChannels(value);
  if (!channels) return null;
  const linear = channels.map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  if (first === null || second === null) return 0;
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

async function storageSnapshot(page) {
  return page.evaluate(() => ({
    local: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])),
    session: Object.fromEntries(Object.keys(sessionStorage).sort().map(key => [key, sessionStorage.getItem(key)])),
  }));
}

function entriesForTrace(entries, trace) {
  return entries.filter(entry => entry.trace === trace);
}

function expectedDataPaths(route) {
  return [route.dataPath, ...(route.id === 'quality' ? ['/api/grh-import-quality-history'] : [])];
}

async function assertReadyGuide({
  apiLog,
  assetLog,
  baseUrl,
  browser,
  profile,
  role,
  route,
  trace,
  verifyCleanup = false,
}) {
  const startApi = apiLog.length;
  const startAssets = assetLog.length;
  const { context, diagnostics, page } = await createPage(browser, baseUrl, profile);
  try {
    await page.goto(`${baseUrl}${route.path}?role=${role}&trace=${trace}`, { waitUntil: 'domcontentloaded' });
    await page.locator(route.readySelector).waitFor({ state: 'visible' });
    await page.locator('#muniGuideTrigger').waitFor({ state: 'visible' });

    const access = accessPolicy.getSessionAccessForUser({ role, tenantId: 'tenant-react-muniguia-e2e' });
    assert.ok(access);
    const mountInputs = await page.evaluate(() => window.__muniGuideMountInputs || []);
    assert.equal(mountInputs.length, 1, `${trace}: one guide mount`);
    assert.deepEqual(Object.keys(mountInputs[0]).sort(), [
      'capabilities', 'pathname', 'policyVersion', 'role', 'variant',
    ]);
    assert.deepEqual(mountInputs[0], {
      role,
      capabilities: access.capabilities,
      variant: access.homeProfile.variant,
      policyVersion: accessPolicy.ACCESS_POLICY_VERSION,
      pathname: route.path,
    });

    const pageCatalog = MUNIGUIA_CATALOG.pages[route.id];
    assert.ok(pageCatalog, `${trace}: catalog page`);
    const storageBefore = await storageSnapshot(page);
    const interactionApiStart = apiLog.length;
    const interactionAssetStart = assetLog.length;

    await page.locator('#muniGuideTrigger').click();
    await page.locator('#muniGuideDialog.is-open').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('muni-guide-close')), true);
    assert.equal(await page.locator('#muniGuideDialog').getAttribute('aria-modal'), 'true');
    assert.equal(await page.locator('#root').evaluate(element => element.inert), true);
    assert.match(await page.locator('.muni-guide-eyebrow').textContent(), new RegExp(MUNIGUIA_CATALOG.roles[role].label, 'i'));
    assert.equal(await page.locator('.muni-guide-title').textContent(), pageCatalog.label);

    for (const [index, step] of pageCatalog.steps.entries()) {
      assert.equal(await page.locator('.muni-guide-progress').textContent(), `Paso ${index + 1} de ${pageCatalog.steps.length}`);
      assert.equal(await page.locator('.muni-guide-step-title').textContent(), step.title);
      assert.equal(await page.locator(step.selector).count(), 1, `${trace}:${step.selector}`);
      assert.equal(await page.locator('.muni-guide-locate').isVisible(), true, `${trace}: locate ${step.selector}`);
      if (index < pageCatalog.steps.length - 1) await page.locator('.muni-guide-button.primary').click();
    }

    const manual = page.locator('.muni-guide-link').first();
    assert.equal(await manual.isVisible(), true);
    const manualUrl = new URL(await manual.getAttribute('href'), page.url());
    assert.equal(manualUrl.origin, new URL(baseUrl).origin);
    assert.equal(manualUrl.pathname, '/manuales.html');
    assert.ok(manualUrl.hash.length > 1);

    const lastSelector = pageCatalog.steps.at(-1).selector;
    await page.locator('.muni-guide-locate').click();
    await page.locator('#muniGuideDialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator(lastSelector).evaluate(element => element.classList.contains('muni-guide-target')), true);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'muniGuideTrigger');

    await page.locator('#muniGuideTrigger').click();
    await page.locator('#muniGuideDialog.is-open').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.locator('#muniGuideDialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'muniGuideTrigger');
    assert.equal(await page.locator('#root').evaluate(element => element.inert), false);

    const presentation = await page.evaluate(() => {
      const trigger = document.querySelector('#muniGuideTrigger');
      const dialog = document.querySelector('#muniGuideDialog');
      const objective = document.querySelector('.muni-guide-objective');
      const triggerRect = trigger.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      const dialogStyle = getComputedStyle(dialog);
      const objectiveStyle = getComputedStyle(objective);
      return {
        theme: document.documentElement.dataset.theme,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        trigger: { height: triggerRect.height, width: triggerRect.width },
        dialog: { left: dialogRect.left, right: dialogRect.right },
        foreground: objectiveStyle.color,
        background: dialogStyle.backgroundColor,
        fontSize: Number.parseFloat(objectiveStyle.fontSize),
      };
    });
    assert.equal(presentation.theme, profile.theme);
    assert.ok(presentation.overflow <= 1, `${trace}: overflow=${presentation.overflow}`);
    assert.ok(presentation.trigger.height >= 44 && presentation.trigger.width >= 44, JSON.stringify(presentation.trigger));
    assert.ok(presentation.dialog.left >= -1 && presentation.dialog.right <= profile.viewport.width + 1);
    assert.ok(presentation.fontSize >= 12);
    assert.ok(contrastRatio(presentation.foreground, presentation.background) >= 4.5, JSON.stringify(presentation));

    assert.deepEqual(await storageSnapshot(page), storageBefore);
    const guideStorageAccess = await page.evaluate(() => window.__muniStorageLog.filter(entry =>
      /contextual-help|MuniGuiaBridge|muniguia-runtime/i.test(entry.stack)
    ));
    assert.deepEqual(guideStorageAccess, []);
    assert.equal(apiLog.length, interactionApiStart, `${trace}: guide API delta`);
    assert.equal(assetLog.length, interactionAssetStart, `${trace}: guide asset delta`);

    if (verifyCleanup) {
      await page.locator('#muniGuideTrigger').click();
      await page.locator('#muniGuideDialog.is-open').waitFor({ state: 'visible' });
      await page.evaluate(() => window.__muniReactRoot.unmount());
      await page.waitForFunction(() => !document.querySelector('#muniGuideTrigger') &&
        !document.querySelector('#muniGuideDialog') && !document.querySelector('#muniGuideOverlay'));
      const cleanup = await page.evaluate(() => ({
        api: window.MuniGuia,
        openClass: document.documentElement.classList.contains('muni-guide-open'),
        stylesheetCount: document.querySelectorAll('link[data-muni-guide-asset="v1"]').length,
      }));
      assert.equal(cleanup.api, undefined);
      assert.equal(cleanup.openClass, false);
      assert.equal(cleanup.stylesheetCount, 1);

      const remount = await page.evaluate(async () => {
        const runtime = window.__muniGuideTestRuntime;
        const mounted = await runtime.mountMuniGuia(window.__muniGuideMountInputs[0]);
        const result = {
          mounted,
          triggerCount: document.querySelectorAll('#muniGuideTrigger').length,
          dialogCount: document.querySelectorAll('#muniGuideDialog').length,
          stylesheetCount: document.querySelectorAll('link[data-muni-guide-asset="v1"]').length,
        };
        runtime.unmountMuniGuia();
        return result;
      });
      assert.deepEqual(remount, {
        mounted: true,
        triggerCount: 1,
        dialogCount: 1,
        stylesheetCount: 1,
      });
      assert.equal(await page.locator('#muniGuideTrigger, #muniGuideDialog, #muniGuideOverlay').count(), 0);
    }

    const apiEntries = apiLog.slice(startApi);
    assert.deepEqual(apiEntries.map(entry => [entry.method, entry.path]), [
      ['GET', '/api/auth/me'],
      ['GET', route.dataPath],
      ...expectedDataPaths(route).slice(1).map(dataPath => ['GET', dataPath]),
    ]);
    assert.deepEqual(entriesForTrace(apiEntries, trace), apiEntries);
    const assets = assetLog.slice(startAssets).map(entry => entry.path);
    assert.deepEqual(assets, [GUIDE_RUNTIME_PATH, GUIDE_CATALOG_PATH, GUIDE_STYLES_PATH]);
    assert.deepEqual(diagnostics.consoleErrors, []);
    assert.deepEqual(diagnostics.pageErrors, []);
    assert.deepEqual(diagnostics.externalRequests, []);
  } finally {
    await context.close();
  }
}

test('MuniGuía on React is governed, local, responsive and disposable', { timeout: 120_000 }, async t => {
  const harness = await createHarness();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await harness.close();
  });

  await t.test('mounts the exact role and page contract on all four React surfaces across 1440, 390, dark and light', async () => {
    const profiles = new Map([
      ['organizationAnalytics', { theme: 'dark', viewport: { width: 1440, height: 900 } }],
      ['grhExecutive', { theme: 'light', viewport: { width: 1440, height: 900 } }],
      ['quality', { theme: 'dark', viewport: { width: 390, height: 844 } }],
      ['territory', { theme: 'light', viewport: { width: 390, height: 844 } }],
    ]);
    for (const [index, route] of ROUTES.entries()) {
      const profile = profiles.get(route.id);
      assert.ok(profile);
      await assertReadyGuide({
        ...harness,
        browser,
        profile,
        role: route.role,
        route,
        trace: `ready-${route.id}-${profile.viewport.width}-${profile.theme}`,
        verifyCleanup: index === 0,
      });
    }
  });

  await t.test('projects all seven authoritative role variants without an extra auth or data request', async () => {
    const route = ROUTES.find(candidate => candidate.id === 'territory');
    assert.ok(route);
    for (const role of Object.values(accessPolicy.ROLES)) {
      const trace = `role-${role.toLowerCase()}`;
      const startApi = harness.apiLog.length;
      const startAssets = harness.assetLog.length;
      const { context, diagnostics, page } = await createPage(browser, harness.baseUrl, {
        theme: 'dark',
        viewport: { width: 390, height: 844 },
      });
      try {
        await page.goto(`${harness.baseUrl}${route.path}?role=${role}&trace=${trace}`, { waitUntil: 'domcontentloaded' });
        await page.locator(route.readySelector).waitFor({ state: 'visible' });
        await page.locator('#muniGuideTrigger').waitFor({ state: 'visible' });
        const access = accessPolicy.getSessionAccessForUser({ role, tenantId: 'tenant-react-muniguia-e2e' });
        assert.ok(access);
        const inputs = await page.evaluate(() => window.__muniGuideMountInputs || []);
        assert.equal(inputs.length, 1, trace);
        assert.equal(inputs[0].role, role);
        assert.equal(inputs[0].variant, access.homeProfile.variant);
        assert.equal(inputs[0].policyVersion, accessPolicy.ACCESS_POLICY_VERSION);
        assert.equal(inputs[0].pathname, route.path);
        assert.deepEqual(inputs[0].capabilities, access.capabilities);

        await page.locator('#muniGuideTrigger').click();
        await page.locator('#muniGuideDialog.is-open').waitFor({ state: 'visible' });
        assert.match(
          await page.locator('.muni-guide-eyebrow').textContent(),
          new RegExp(MUNIGUIA_CATALOG.roles[role].label, 'i'),
        );
        await page.keyboard.press('Escape');
        await page.locator('#muniGuideDialog').waitFor({ state: 'hidden' });

        assert.deepEqual(harness.apiLog.slice(startApi).map(entry => entry.path), ['/api/auth/me', ...expectedDataPaths(route)]);
        assert.deepEqual(harness.assetLog.slice(startAssets).map(entry => entry.path), [
          GUIDE_RUNTIME_PATH, GUIDE_CATALOG_PATH, GUIDE_STYLES_PATH,
        ]);
        assert.deepEqual(diagnostics.consoleErrors, []);
        assert.deepEqual(diagnostics.pageErrors, []);
        assert.deepEqual(diagnostics.externalRequests, []);
      } finally {
        await context.close();
      }
    }
  });

  await t.test('does not load or render help without navigation.help while the dashboard stays ready', async () => {
    const route = ROUTES[0];
    const trace = 'without-help';
    const startApi = harness.apiLog.length;
    const startAssets = harness.assetLog.length;
    const { context, diagnostics, page } = await createPage(browser, harness.baseUrl, {
      theme: 'dark',
      viewport: { width: 1440, height: 900 },
    });
    try {
      await page.goto(`${harness.baseUrl}${route.path}?role=INTENDENTE&help=off&trace=${trace}`, { waitUntil: 'networkidle' });
      await page.locator(route.readySelector).waitFor({ state: 'visible' });
      assert.equal(await page.locator('#muniGuideTrigger').count(), 0);
      assert.deepEqual(harness.apiLog.slice(startApi).map(entry => entry.path), ['/api/auth/me', ...expectedDataPaths(route)]);
      assert.equal(harness.assetLog.length, startAssets);
      assert.deepEqual(diagnostics.consoleErrors, []);
      assert.deepEqual(diagnostics.pageErrors, []);
      assert.deepEqual(diagnostics.externalRequests, []);
    } finally {
      await context.close();
    }
  });

  await t.test('denies a role without the surface capability before data and before help assets', async () => {
    const route = ROUTES[0];
    const startApi = harness.apiLog.length;
    const startAssets = harness.assetLog.length;
    const { context, diagnostics, page } = await createPage(browser, harness.baseUrl, {
      theme: 'light',
      viewport: { width: 390, height: 844 },
    });
    try {
      await page.goto(`${harness.baseUrl}${route.path}?role=DEMO&trace=denied-surface`, { waitUntil: 'networkidle' });
      await page.locator('#safe-workspace').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#muniGuideTrigger').count(), 0);
      assert.deepEqual(harness.apiLog.slice(startApi).map(entry => entry.path), ['/api/auth/me']);
      assert.equal(harness.assetLog.length, startAssets);
      assert.deepEqual(diagnostics.consoleErrors, []);
      assert.deepEqual(diagnostics.pageErrors, []);
      assert.deepEqual(diagnostics.externalRequests, []);
    } finally {
      await context.close();
    }
  });

  await t.test('fails closed when the contextual module is absent without blocking the ready React surface', async () => {
    const route = ROUTES[2];
    const startApi = harness.apiLog.length;
    const startAssets = harness.assetLog.length;
    const { context, diagnostics, page } = await createPage(browser, harness.baseUrl, {
      theme: 'light',
      viewport: { width: 390, height: 844 },
    });
    const runtimeRequests = [];
    await context.route('**/js/contextual-help.js*', async intercepted => {
      runtimeRequests.push(intercepted.request().url());
      await intercepted.fulfill({
        status: 404,
        contentType: 'text/javascript; charset=utf-8',
        body: '',
      });
    });
    try {
      await page.goto(`${harness.baseUrl}${route.path}?role=TENANT_ADMIN&trace=missing-runtime`, { waitUntil: 'networkidle' });
      await page.locator(route.readySelector).waitFor({ state: 'visible' });
      await page.waitForTimeout(100);
      assert.equal(await page.locator('#muniGuideTrigger').count(), 0);
      assert.equal(await page.locator('.governed-state--loading').count(), 0);
      assert.deepEqual(harness.apiLog.slice(startApi).map(entry => entry.path), ['/api/auth/me', ...expectedDataPaths(route)]);
      assert.equal(harness.assetLog.length, startAssets);
      assert.equal(runtimeRequests.length, 1);
      assert.deepEqual(diagnostics.pageErrors, []);
      assert.deepEqual(diagnostics.externalRequests, []);
    } finally {
      await context.close();
    }
  });
});

test('global React navigation projects the catalog across all four governed rooms', { timeout: 120_000 }, async t => {
  const harness = await createHarness();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await harness.close();
  });

  for (const [index, route] of ROUTES.entries()) {
    const viewport = index % 2 === 0 ? { width: 1440, height: 900 } : { width: 390, height: 844 };
    const { context, diagnostics, page } = await createPage(browser, harness.baseUrl, {
      theme: index % 2 === 0 ? 'dark' : 'light',
      viewport,
    });
    try {
      const startApi = harness.apiLog.length;
      const startAssets = harness.assetLog.length;
      await page.goto(
        `${harness.baseUrl}${route.path}?role=${route.role}&trace=global-nav-${route.id}`,
        { waitUntil: 'domcontentloaded' },
      );
      await page.locator(route.readySelector).waitFor({ state: 'visible' });
      const trigger = page.locator('.global-menu-trigger');
      await trigger.waitFor({ state: 'visible' });
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
      assert.equal(await trigger.getAttribute('aria-haspopup'), 'dialog');

      await trigger.focus();
      await page.keyboard.press('Enter');
      const dialog = page.locator('#muni-global-navigation-dialog');
      await dialog.waitFor({ state: 'visible' });
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
      assert.equal(await dialog.getAttribute('role'), 'dialog');
      assert.equal(await dialog.getAttribute('aria-modal'), 'true');
      assert.equal(
        await page.locator('#contenido-principal').evaluate(element => Boolean(element.closest('[inert]'))),
        true,
      );

      const access = accessPolicy.getSessionAccessForUser({
        role: route.role,
        tenantId: 'tenant-react-muniguia-e2e',
      });
      assert.ok(access);
      const capabilities = new Set(access.capabilities);
      const expectedGroupIds = [
        ['executive', ['navigation.dashboard', 'navigation.grh-executive', 'navigation.grh-decisions', 'navigation.ai-assistant', 'navigation.reports']],
        ['people', ['navigation.hacienda', 'navigation.organization-analytics', 'navigation.rrhh']],
        ['territory', ['navigation.territory', 'public']],
        ['data', ['navigation.import', 'navigation.audit', 'navigation.data-quality', 'navigation.export']],
      ].filter(([, required]) => required.some(capability => capability === 'public' || capabilities.has(capability)))
        .map(([groupId]) => groupId);
      const groups = page.locator('.global-navigation__group');
      assert.deepEqual(await groups.evaluateAll(elements => elements.map(element => element.dataset.groupId)), expectedGroupIds);
      assert.equal(await page.locator('.global-navigation__group-toggle[aria-expanded="true"]').count(), 1);
      assert.equal(await page.locator('.global-navigation__group-panel:not([hidden])').count(), 1);
      assert.equal(await page.locator(`.global-navigation__link[data-nav-id="${route.id === 'organizationAnalytics' ? 'estructura' : route.id === 'grhExecutive' ? 'grh-ejecutivo' : route.id === 'quality' ? 'control' : 'territorio'}"]`).getAttribute('aria-current'), 'page');

      if (expectedGroupIds.length > 1) {
        const expandedGroup = await page.locator('.global-navigation__group-toggle[aria-expanded="true"]')
          .evaluate(element => element.closest('[data-group-id]')?.getAttribute('data-group-id'));
        const targetGroup = expectedGroupIds.find(groupId => groupId !== expandedGroup);
        assert.ok(targetGroup);
        const target = page.locator(`.global-navigation__group[data-group-id="${targetGroup}"] .global-navigation__group-toggle`);
        await target.focus();
        await page.keyboard.press('Space');
        assert.equal(await target.getAttribute('aria-expanded'), 'true');
        assert.equal(await page.locator('.global-navigation__group-toggle[aria-expanded="true"]').count(), 1);
      }

      await page.keyboard.press('Escape');
      await page.locator('.global-navigation').waitFor({ state: 'detached' });
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
      assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('global-menu-trigger')), true);
      assert.equal(
        await page.locator('#contenido-principal').evaluate(element => Boolean(element.closest('[inert]'))),
        false,
      );
      assert.deepEqual(
        harness.apiLog.slice(startApi).map(entry => entry.path),
        ['/api/auth/me', ...expectedDataPaths(route)],
        `${route.id}: opening navigation does not fetch data`,
      );
      assert.deepEqual(
        harness.assetLog.slice(startAssets).map(entry => entry.path),
        [GUIDE_RUNTIME_PATH, GUIDE_CATALOG_PATH, GUIDE_STYLES_PATH],
      );
      assert.deepEqual(diagnostics.consoleErrors, []);
      assert.deepEqual(diagnostics.pageErrors, []);
      assert.deepEqual(diagnostics.externalRequests, []);
    } finally {
      await context.close();
    }
  }

  const route = ROUTES.find(candidate => candidate.id === 'territory');
  assert.ok(route);
  const { context, diagnostics, page } = await createPage(browser, harness.baseUrl, {
    forcedColors: 'active',
    theme: 'light',
    viewport: { width: 320, height: 720 },
  });
  try {
    await page.goto(
      `${harness.baseUrl}${route.path}?role=${route.role}&trace=global-nav-320-forced`,
      { waitUntil: 'domcontentloaded' },
    );
    await page.locator(route.readySelector).waitFor({ state: 'visible' });
    await page.locator('.global-menu-trigger').click();
    await page.locator('#muni-global-navigation-dialog').waitFor({ state: 'visible' });
    const compact = await page.evaluate(() => {
      const targets = [...document.querySelectorAll([
        '.global-navigation__close',
        '.global-navigation__group-toggle',
        '.global-navigation__link',
      ].join(','))].filter(element => element.getClientRects().length > 0);
      return {
        forcedColors: matchMedia('(forced-colors: active)').matches,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        targets: targets.map(element => ({
          height: element.getBoundingClientRect().height,
          width: element.getBoundingClientRect().width,
        })),
      };
    });
    assert.equal(compact.forcedColors, true);
    assert.ok(compact.overflow <= 1, `320 forced-colors overflow=${compact.overflow}`);
    assert.ok(compact.targets.length > 0);
    for (const target of compact.targets) {
      assert.ok(target.height >= 44, `320 forced-colors target height=${target.height}`);
      assert.ok(target.width >= 44, `320 forced-colors target width=${target.width}`);
    }
    assert.deepEqual(diagnostics.consoleErrors, []);
    assert.deepEqual(diagnostics.pageErrors, []);
    assert.deepEqual(diagnostics.externalRequests, []);
  } finally {
    await context.close();
  }
});
