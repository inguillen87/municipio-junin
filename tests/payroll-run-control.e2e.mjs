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
  GRH_PAYROLL_RUN_CONTROL_SCHEMA_VERSION,
  inspectGrhPayrollRunControlContract,
} from '../api/lib/grh-payroll-run-control-contract.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND_CONFIG = path.join(REPO, 'frontend', 'vite.config.ts');
const AUTH_CONTRACT = 'municontrol-auth-me-v1';
const CONTRACT_HEADER = 'X-MuniControl-Contract';
const ARTIFACT = JSON.parse(readFileSync(
  path.join(REPO, 'api', '_data', 'grh-payroll-run-control.json'),
  'utf8',
));
const STATIC_SOURCES = Object.freeze({
  '/js/pwa-register.js': readFileSync(path.join(REPO, 'js', 'pwa-register.js'), 'utf8'),
  '/js/navigation-catalog.js': readFileSync(path.join(REPO, 'js', 'navigation-catalog.js'), 'utf8'),
  '/js/grh-payroll-run-control-data.js': readFileSync(path.join(REPO, 'js', 'grh-payroll-run-control-data.js'), 'utf8'),
  '/js/municipal-task-center.js': readFileSync(path.join(REPO, 'js', 'municipal-task-center.js'), 'utf8'),
  '/js/municipal-task-catalog.js': readFileSync(path.join(REPO, 'js', 'municipal-task-catalog.js'), 'utf8'),
  '/js/contextual-help-catalog.js': readFileSync(path.join(REPO, 'js', 'contextual-help-catalog.js'), 'utf8'),
  '/css/task-center.css': readFileSync(path.join(REPO, 'css', 'task-center.css'), 'utf8'),
});
const ICON_SOURCE = readFileSync(path.join(REPO, 'img', 'municontrol-icon.jpg'));
const PWA_ICON_SOURCES = Object.freeze({
  '/img/municontrol-icon-192.png': readFileSync(path.join(REPO, 'img', 'municontrol-icon-192.png')),
  '/img/municontrol-icon-512.png': readFileSync(path.join(REPO, 'img', 'municontrol-icon-512.png')),
});
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

assert.equal(inspectGrhPayrollRunControlContract(ARTIFACT).ok, true);

function authorizedSession(includeCapability = true) {
  const base = {
    id: 'payroll-run-control-contador-e2e',
    name: 'Contaduría QA',
    role: 'CONTADOR',
    tenantId: 'tenant-junin-e2e',
  };
  const access = accessPolicy.getSessionAccessForUser(base);
  assert.ok(access, 'CONTADOR must have an authoritative access projection');
  const capabilities = access.capabilities.filter(capability =>
    includeCapability || capability !== 'navigation.hacienda'
  );
  return {
    user: {
      ...base,
      capabilities,
      accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
      homeProfile: {
        ...access.homeProfile,
        priorityCapabilities: [...access.homeProfile.priorityCapabilities],
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
  let runRequestCount = 0;
  return {
    name: `payroll-run-control-e2e-${scenario.name}`,
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url || '/', 'http://127.0.0.1');
        if (url.pathname === '/corridas-grh') {
          request.url = '/corridas-grh.html';
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
        if (Object.hasOwn(PWA_ICON_SOURCES, url.pathname)) {
          send(response, 200, 'image/png', PWA_ICON_SOURCES[url.pathname]);
          return;
        }
        if (url.pathname === '/inicio.html') {
          send(response, 200, 'text/html; charset=utf-8',
            '<!doctype html><html lang="es"><title>Inicio seguro</title><body><main id="safe-workspace">Inicio seguro</main></body></html>');
          return;
        }
        if (url.pathname === '/api/auth/me') {
          apiLog.push({ method: request.method, path: url.pathname, status: 200 });
          send(response, 200, 'application/json; charset=utf-8',
            JSON.stringify(authorizedSession(scenario.includeCapability !== false)),
            { [CONTRACT_HEADER]: AUTH_CONTRACT });
          return;
        }
        if (url.pathname === '/api/grh-payroll-run-control') {
          const statuses = scenario.runStatuses ?? [200];
          const status = statuses[Math.min(runRequestCount, statuses.length - 1)];
          runRequestCount += 1;
          apiLog.push({ method: request.method, path: url.pathname, status });
          if (status !== 200) {
            send(response, status, 'application/json; charset=utf-8',
              JSON.stringify({ code: status === 403 ? 'FORBIDDEN' : 'GRH_PAYROLL_RUN_CONTROL_UNAVAILABLE' }),
              { [CONTRACT_HEADER]: GRH_PAYROLL_RUN_CONTROL_SCHEMA_VERSION });
            return;
          }
          send(response, 200, 'application/json; charset=utf-8', JSON.stringify(ARTIFACT),
            { [CONTRACT_HEADER]: GRH_PAYROLL_RUN_CONTROL_SCHEMA_VERSION });
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
    cacheDir: path.join(tmpdir(), `municontrol-payroll-run-vite-${process.pid}-${scenarioSequence}`),
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
  const httpErrors = [];
  const origin = new URL(baseUrl).origin;
  page.on('console', message => {
    if (message.type() === 'error' && !/Failed to load resource.*(?:403|503)/u.test(message.text())) {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    const requestUrl = request.url();
    if (/^(?:data|blob):/u.test(requestUrl)) return;
    if (new URL(requestUrl).origin !== origin) externalRequests.push(requestUrl);
  });
  page.on('response', response => {
    if (response.status() >= 400) httpErrors.push([response.status(), new URL(response.url()).pathname]);
  });
  return { consoleErrors, pageErrors, externalRequests, httpErrors };
}

test('S20 payroll-run control renders real aggregates responsively and fails closed', {
  timeout: 240_000,
}, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  await t.test('renders exact current-year, history, quarantine and aggregate logs on desktop and mobile', async () => {
    await withScenario({ name: 'real-artifact' }, async ({ apiLog, baseUrl }) => {
      for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
        const context = await browser.newContext({ viewport, colorScheme: 'dark' });
        const page = await context.newPage();
        const diagnostics = monitorPage(page, baseUrl);
        const requestStart = apiLog.length;
        try {
          await page.goto(`${baseUrl}/corridas-grh`, { waitUntil: 'domcontentloaded' });
          await page.locator('#payrollRunSummary').waitFor({ state: 'visible' });

          assert.equal(new URL(page.url()).pathname, '/corridas-grh');
          assert.match(await page.locator('#payrollRunCurrentYear').textContent(), /Corridas 2026/u);
          assert.equal(await page.locator('.run-current__grid article').count(), 3);
          assert.deepEqual(
            await page.locator('.run-current__grid article strong').allTextContents(),
            ['26', '26', '26'],
          );
          assert.equal(await page.locator('.run-month').count(), 24);
          await page.getByRole('button', { name: 'Todo el historial' }).click();
          assert.equal(await page.locator('.run-month').count(), 217);
          assert.match(await page.locator('#payrollRunReview').textContent(), /612/u);
          assert.match(await page.locator('#payrollRunReview').textContent(), /13 corridas requieren saneamiento/u);
          assert.match(await page.locator('#payrollRunReview').textContent(), /20\.270 filas de cálculo/u);
          assert.match(await page.locator('.run-log').textContent(), /122/u);
          assert.match(await page.locator('.run-log').textContent(), /100,00%/u);
          assert.doesNotMatch(await page.locator('#contenido-principal').textContent(), /DNI|CUIL|legajo|importe|condición individual/iu);
          assert.equal(await page.locator('.topbar__nav a[aria-current="page"]').getAttribute('href'), '/corridas-grh');
          assert.equal(await page.locator('.topbar__nav a[aria-current="page"]').textContent(), 'Corridas');
          const taskTrigger = page.locator('[data-municipal-task-open="true"]');
          await taskTrigger.waitFor({ state: 'visible' });
          assert.equal(await taskTrigger.count(), 1);

          const audit = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            buttons: [...document.querySelectorAll('.run-window button')].map(button => ({
              width: button.getBoundingClientRect().width,
              height: button.getBoundingClientRect().height,
            })),
          }));
          assert.ok(audit.overflow <= 1, `horizontal overflow=${audit.overflow}`);
          assert.ok(audit.buttons.every(button => button.width >= 44 && button.height >= 44));
          assert.deepEqual(apiLog.slice(requestStart).map(entry => [entry.path, entry.status]), [
            ['/api/auth/me', 200],
            ['/api/grh-payroll-run-control', 200],
          ]);
          assert.deepEqual(diagnostics.consoleErrors, [], JSON.stringify(diagnostics.httpErrors));
          assert.deepEqual(diagnostics.httpErrors, []);
          assert.deepEqual(diagnostics.pageErrors, []);
          assert.deepEqual(diagnostics.externalRequests, []);
        } finally {
          await context.close();
        }
      }
    });
  });

  await t.test('publishes no replacement numbers on 503 and recovers only after retry', async () => {
    await withScenario({ name: 'retry', runStatuses: [503, 200] }, async ({ apiLog, baseUrl }) => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      try {
        await page.goto(`${baseUrl}/corridas-grh`, { waitUntil: 'domcontentloaded' });
        const blocked = page.locator('.run-state--blocked');
        await blocked.waitFor({ state: 'visible' });
        assert.match(await blocked.textContent(), /No pudimos verificar el control de corridas/u);
        assert.doesNotMatch(await page.locator('#contenido-principal').textContent(), /20\.270|612|625/u);
        await page.getByRole('button', { name: 'Reintentar' }).click();
        await page.locator('#payrollRunSummary').waitFor({ state: 'visible' });
        assert.deepEqual(apiLog.map(entry => [entry.path, entry.status]), [
          ['/api/auth/me', 200],
          ['/api/grh-payroll-run-control', 503],
          ['/api/auth/me', 200],
          ['/api/grh-payroll-run-control', 200],
        ]);
      } finally {
        await context.close();
      }
    });
  });

  await t.test('redirects a session without Hacienda before requesting payroll data', async () => {
    await withScenario({ name: 'no-capability', includeCapability: false }, async ({ apiLog, baseUrl }) => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      try {
        await page.goto(`${baseUrl}/corridas-grh`, { waitUntil: 'domcontentloaded' });
        await page.waitForURL(`${baseUrl}/inicio.html`);
        assert.equal(await page.locator('#safe-workspace').textContent(), 'Inicio seguro');
        assert.deepEqual(apiLog.map(entry => entry.path), ['/api/auth/me']);
      } finally {
        await context.close();
      }
    });
  });

  await t.test('keeps one clean Production rewrite', () => {
    const vercel = JSON.parse(readFileSync(path.join(REPO, 'vercel.json'), 'utf8'));
    assert.deepEqual(
      vercel.rewrites.filter(rewrite => rewrite.source === '/corridas-grh'),
      [{ source: '/corridas-grh', destination: '/corridas-grh.html' }],
    );
  });
});
