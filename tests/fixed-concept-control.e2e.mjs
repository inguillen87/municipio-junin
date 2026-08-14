import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

import {
  GRH_FIXED_CONCEPT_CONTROL_SCHEMA_VERSION,
  inspectGrhFixedConceptControlContract,
} from '../api/lib/grh-fixed-concept-control-contract.js';
import accessPolicy from '../shared/access-policy.cjs';
import publishedDemoPolicy from '../shared/published-demo-policy.cjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND_CONFIG = path.join(REPO, 'frontend', 'vite.config.ts');
const AUTH_CONTRACT = 'municontrol-auth-me-v1';
const CONTRACT_HEADER = 'X-MuniControl-Contract';
const ARTIFACT = JSON.parse(readFileSync(
  path.join(REPO, 'api', '_data', 'grh-fixed-concept-control.json'),
  'utf8',
));
const STATIC_SOURCES = Object.freeze({
  '/js/pwa-register.js': readFileSync(path.join(REPO, 'js', 'pwa-register.js'), 'utf8'),
  '/js/navigation-catalog.js': readFileSync(path.join(REPO, 'js', 'navigation-catalog.js'), 'utf8'),
  '/js/grh-fixed-concept-control-data.js': readFileSync(path.join(REPO, 'js', 'grh-fixed-concept-control-data.js'), 'utf8'),
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

assert.equal(inspectGrhFixedConceptControlContract(ARTIFACT).ok, true);

function authorizedSession(includeCapability = true, role = 'CONTADOR', published = false) {
  const base = {
    id: `fixed-concept-control-${role.toLowerCase()}-e2e`,
    name: 'Contaduría QA',
    role,
    tenantId: 'tenant-junin-e2e',
  };
  const access = accessPolicy.getSessionAccessForUser(base);
  assert.ok(access);
  const publishedCapabilities = published
    ? access.capabilities.filter(capability =>
      publishedDemoPolicy.PUBLISHED_DEMO_CAPABILITIES.includes(capability))
    : access.capabilities;
  const capabilities = publishedCapabilities.filter(capability =>
    includeCapability || capability !== 'navigation.hacienda');
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
    name: `fixed-concept-control-e2e-${scenario.name}`,
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url || '/', 'http://127.0.0.1');
        if (url.pathname === '/conceptos-fijos') {
          request.url = '/conceptos-fijos.html';
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
            JSON.stringify(authorizedSession(
              scenario.includeCapability !== false,
              scenario.role,
              scenario.published === true,
            )),
            { [CONTRACT_HEADER]: AUTH_CONTRACT });
          return;
        }
        if (url.pathname === '/api/grh-fixed-concept-control') {
          const statuses = scenario.dataStatuses ?? [200];
          const status = statuses[Math.min(dataRequestCount, statuses.length - 1)];
          dataRequestCount += 1;
          apiLog.push({ path: url.pathname, status });
          if (status !== 200) {
            send(response, status, 'application/json; charset=utf-8', JSON.stringify({
              code: status === 403
                ? 'FORBIDDEN'
                : 'GRH_FIXED_CONCEPT_CONTROL_UNAVAILABLE',
            }), { [CONTRACT_HEADER]: GRH_FIXED_CONCEPT_CONTROL_SCHEMA_VERSION });
            return;
          }
          send(response, 200, 'application/json; charset=utf-8', JSON.stringify(ARTIFACT),
            { [CONTRACT_HEADER]: GRH_FIXED_CONCEPT_CONTROL_SCHEMA_VERSION });
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
    cacheDir: path.join(tmpdir(), `municontrol-fixed-concept-vite-${process.pid}-${scenarioSequence}`),
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

test('S21 fixed-concept control is summary-first, responsive, accessible and fail-closed', {
  timeout: 240_000,
}, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  await t.test('renders the governed three-state truth on desktop, mobile, narrow and forced colors', async () => {
    await withScenario({ name: 'real-artifact' }, async ({ apiLog, baseUrl }) => {
      const scenarios = [
        { width: 1440, height: 1000, forcedColors: 'none' },
        { width: 390, height: 844, forcedColors: 'none' },
        { width: 320, height: 720, forcedColors: 'none' },
        { width: 390, height: 844, forcedColors: 'active' },
      ];
      for (const viewport of scenarios) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          colorScheme: 'dark',
          forcedColors: viewport.forcedColors,
        });
        const page = await context.newPage();
        const diagnostics = monitorPage(page, baseUrl);
        const requestStart = apiLog.length;
        try {
          await page.goto(`${baseUrl}/conceptos-fijos`, { waitUntil: 'domcontentloaded' });
          await page.locator('#fixedConceptControl').waitFor({ state: 'visible' });

          const stateRows = ARTIFACT.reconciliation.states.map(state => String(state.rows));
          assert.deepEqual(await page.locator('.fixed-state > strong').allTextContents(),
            stateRows.map(value => `${value} filas`));
          assert.equal(await page.locator('.fixed-state-bar span').count(), 3);
          assert.match(await page.locator('#fixedConceptComparison').textContent(), /972 días/u);
          assert.match(await page.locator('#fixedConceptQuality').textContent(), /Requiere revisión/u);
          assert.doesNotMatch(await page.locator('#contenido-principal').textContent(),
            /FIJO_ID|CODI_01|LEGA_12|CODI_27|importe individual|instrumento legal individual/iu);
          assert.equal(await page.locator('.topbar__nav a[aria-current="page"]').getAttribute('href'),
            '/conceptos-fijos');

          const audit = await page.evaluate(() => {
            const reconciliation = document.querySelector('#fixedConceptReconciliation')?.getBoundingClientRect();
            const bar = document.querySelector('.fixed-state-bar')?.getBoundingClientRect();
            return {
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              reconciliationTop: reconciliation?.top ?? Number.POSITIVE_INFINITY,
              barTop: bar?.top ?? Number.POSITIVE_INFINITY,
              viewportHeight: window.innerHeight,
            };
          });
          assert.ok(audit.overflow <= 1,
            `width=${viewport.width}:forced=${viewport.forcedColors}:overflow=${audit.overflow}`);
          assert.ok(audit.reconciliationTop < audit.viewportHeight,
            `width=${viewport.width}: reconciliation must begin in first viewport`);
          assert.ok(audit.barTop < audit.viewportHeight,
            `width=${viewport.width}: barTop=${audit.barTop}: three-state bar must be visible in first viewport`);
          assert.deepEqual(apiLog.slice(requestStart).map(entry => [entry.path, entry.status]), [
            ['/api/auth/me', 200],
            ['/api/grh-fixed-concept-control', 200],
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

  await t.test('shows no replacement values on 503 and recovers only after a manual retry', async () => {
    await withScenario({ name: 'retry', dataStatuses: [503, 200] }, async ({ apiLog, baseUrl }) => {
      const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
      const page = await context.newPage();
      try {
        await page.goto(`${baseUrl}/conceptos-fijos`, { waitUntil: 'domcontentloaded' });
        const blocked = page.locator('.blocked-state');
        await blocked.waitFor({ state: 'visible' });
        assert.match(await blocked.textContent(), /no mostramos cifras parciales ni valores de reemplazo/iu);
        assert.doesNotMatch(await page.locator('#contenido-principal').textContent(), /94|19|78|193|187/u);
        await page.getByRole('button', { name: 'Volver a intentar' }).click();
        await page.locator('#fixedConceptControl').waitFor({ state: 'visible' });
        assert.deepEqual(apiLog.map(entry => [entry.path, entry.status]), [
          ['/api/auth/me', 200],
          ['/api/grh-fixed-concept-control', 503],
          ['/api/auth/me', 200],
          ['/api/grh-fixed-concept-control', 200],
        ]);
      } finally {
        await context.close();
      }
    });
  });

  await t.test('accepts the exact published Administrador session projection', async () => {
    await withScenario({
      name: 'published-administrator',
      role: 'TENANT_ADMIN',
      published: true,
    }, async ({ apiLog, baseUrl }) => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      try {
        await page.goto(`${baseUrl}/conceptos-fijos`, { waitUntil: 'domcontentloaded' });
        await page.locator('#fixedConceptControl').waitFor({ state: 'visible' });
        assert.equal(new URL(page.url()).pathname, '/conceptos-fijos');
        assert.deepEqual(apiLog.map(entry => [entry.path, entry.status]), [
          ['/api/auth/me', 200],
          ['/api/grh-fixed-concept-control', 200],
        ]);
      } finally {
        await context.close();
      }
    });
  });

  await t.test('denies the surface before reading data when Hacienda is absent', async () => {
    await withScenario({ name: 'no-capability', includeCapability: false }, async ({ apiLog, baseUrl }) => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      try {
        await page.goto(`${baseUrl}/conceptos-fijos`, { waitUntil: 'domcontentloaded' });
        await page.waitForURL(`${baseUrl}/inicio.html`);
        assert.equal(await page.locator('#safe-workspace').textContent(), 'Inicio seguro');
        assert.deepEqual(apiLog.map(entry => entry.path), ['/api/auth/me']);
      } finally {
        await context.close();
      }
    });
  });
});
