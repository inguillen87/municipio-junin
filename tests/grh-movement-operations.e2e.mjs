import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';

import { chromium } from 'playwright';

import { buildGrhMovementOperationsProjection } from '../api/lib/grh-movement-operations.js';
import accessPolicy from '../shared/access-policy.cjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTRACT = 'grh-movement-operations-v1';
const TENANT_ID = 'tenant-movement-operations-e2e';
const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
});

const SEMANTIC = JSON.parse(await readFile(new URL('../api/_data/grh-semantic.json', import.meta.url), 'utf8'));
const PROJECTION = buildGrhMovementOperationsProjection(SEMANTIC);
const SCREENSHOT_DIR = process.env.GRH_MOVEMENT_SCREENSHOT_DIR || '';

async function capture(page, name) {
  if (!SCREENSHOT_DIR) return;
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), fullPage: true });
}

function authoritativeUser() {
  const access = accessPolicy.getSessionAccessForUser({ role: 'INTENDENTE', tenantId: TENANT_ID });
  return {
    id: 'movement-operations-e2e', name: 'Intendencia QA', email: 'movement-operations@internal.invalid',
    role: 'INTENDENTE', tenantId: TENANT_ID, capabilities: access.capabilities,
    accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION, homeProfile: access.homeProfile,
    tenant: { name: 'Municipalidad de Junín QA', shortName: 'Junín QA' },
  };
}

function fakeToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'movement-operations-e2e', role: 'INTENDENTE', tenantId: TENANT_ID,
    exp: Math.floor(Date.now() / 1000) + 900,
  })}.qa`;
}

async function createFixture() {
  let scenario = 'ok';
  const apiRequests = [];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/api/auth/me') {
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ user: authoritativeUser() }));
      return;
    }
    if (url.pathname === '/api/grh-movement-operations') {
      apiRequests.push({ search: url.search, method: request.method, authorization: request.headers.authorization || '', accept: request.headers.accept || '' });
      if (scenario === 'forbidden') {
        response.writeHead(403, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ code: 'FORBIDDEN' }));
        return;
      }
      if (scenario === 'unavailable') {
        response.writeHead(503, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ code: 'GRH_MOVEMENT_OPERATIONS_UNAVAILABLE' }));
        return;
      }
      const payload = structuredClone(PROJECTION);
      if (scenario === 'invalid-shape') payload.series[0].events = -1;
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store',
        'X-MuniControl-Contract': scenario === 'bad-header' ? 'grh-movement-operations-v0' : CONTRACT,
      });
      response.end(JSON.stringify(payload));
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice(1) || 'movimientos-grh.html');
    const target = path.resolve(ROOT, relative);
    if (!target.startsWith(`${ROOT}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(target);
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    server, apiRequests, baseUrl: `http://127.0.0.1:${server.address().port}`,
    setScenario(value) { scenario = value; },
  };
}

async function openPage(browser, fixture, { viewport = { width: 1440, height: 940 }, query = '', theme = 'dark' } = {}) {
  const context = await browser.newContext({ viewport, colorScheme: theme });
  await context.addInitScript(({ token, user, storedTheme }) => {
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify(user));
    localStorage.setItem('municontrol-color-theme:v1', storedTheme);
    localStorage.setItem('govtech_theme', storedTheme);
  }, { token: fakeToken(), user: authoritativeUser(), storedTheme: theme });
  const page = await context.newPage();
  await page.goto(`${fixture.baseUrl}/movimientos-grh.html${query}`, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

async function waitReady(page) {
  await page.locator('#movementContent:not([hidden])').waitFor();
  await page.locator('#movementTableBody tr').first().waitFor();
}

test('movement center renders the real contract and changes metrics, window and comparisons without refetch', async t => {
  const fixture = await createFixture();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await new Promise(resolve => fixture.server.close(resolve)); });
  const { context, page } = await openPage(browser, fixture);
  t.after(() => context.close());
  await waitReady(page);

  assert.equal(fixture.apiRequests.length, 1);
  assert.equal(fixture.apiRequests[0].search, '');
  assert.equal(fixture.apiRequests[0].method, 'GET');
  assert.match(fixture.apiRequests[0].authorization, /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.qa$/);
  assert.equal(fixture.apiRequests[0].accept, 'application/json');
  assert.equal(await page.locator('#movementValidRows').textContent(), PROJECTION.coverage.validRows.toLocaleString('es-AR'));
  assert.equal(await page.locator('#movementLatestYear').textContent(), PROJECTION.summary.latestCompleteYear);
  assert.equal(await page.locator('#movementTableBody tr').count(), PROJECTION.series.length);
  assert.match(await page.locator('#movementOperations').innerText(), /movimientos registrados, no altas\/bajas\/rotación/i);
  assert.deepEqual(await page.locator('#movementActions a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))), [
    '/ia.html?question=Compar%C3%A1%20movimientos%202024%20y%202025', '/estructura', '/calidad',
  ]);
  assert.equal(await page.locator('.sidebar [aria-current="page"]').getAttribute('href'), 'movimientos-grh.html');

  const initialBars = await page.locator('.movement-chart-item').count();
  assert.equal(initialBars, 5);
  await page.locator('#movementMetric').selectOption('intensity');
  await page.locator('#movementWindow').selectOption('10');
  assert.equal(await page.locator('.movement-chart-item').count(), 10);
  assert.match(await page.locator('#movementChartDefinition').textContent(), /Cociente/);
  assert.equal(fixture.apiRequests.length, 1, 'client-side controls must not refetch');

  await page.locator('#movementCompareFrom').selectOption('2023');
  await page.locator('#movementCompareTo').selectOption('2025');
  assert.equal(fixture.apiRequests.length, 1);
  assert.match(page.url(), /metric=intensity&window=10&from=2023&to=2025/);
  assert.notEqual(await page.locator('#movementEventsDelta').textContent(), '—');
  await page.locator('#movementCompareFrom').selectOption('2025');
  assert.equal(await page.locator('#movementCompareFrom').inputValue(), '2024');
  assert.equal(await page.locator('#movementCompareTo').inputValue(), '2025');
  assert.equal(await page.locator('#movementDeepLinkNotice').isVisible(), true);
  assert.match(await page.locator('#movementDeepLinkNotice').textContent(), /combinación elegida/i);
  await page.locator('#movementMetric').focus();
  await page.locator('#movementMetric').press('ArrowUp');
  assert.equal(await page.locator('#movementMetric').evaluate(node => node === document.activeElement), true);

  const diagnostics = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    duplicateIds: Array.from(document.querySelectorAll('[id]'), node => node.id).filter((id, index, values) => values.indexOf(id) !== index),
    externalActions: Array.from(document.querySelectorAll('#movementActions a'), node => new URL(node.href).origin).filter(origin => origin !== location.origin),
  }));
  assert.ok(diagnostics.overflow <= 1, `desktop overflow=${diagnostics.overflow}`);
  assert.deepEqual(diagnostics.duplicateIds, []);
  assert.deepEqual(diagnostics.externalActions, []);
  await capture(page, 'movimientos-grh-1440.png');
});

test('deep links are allowlisted, never reach the API query, and responsive layout stays closed', async t => {
  const fixture = await createFixture();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await new Promise(resolve => fixture.server.close(resolve)); });

  const valid = await openPage(browser, fixture, {
    viewport: { width: 390, height: 844 }, theme: 'light',
    query: '?metric=participants&window=all&from=2024&to=2025',
  });
  t.after(() => valid.context.close());
  await waitReady(valid.page);
  assert.equal(await valid.page.locator('#movementMetric').inputValue(), 'participants');
  assert.equal(await valid.page.locator('#movementWindow').inputValue(), 'all');
  assert.equal(await valid.page.locator('#movementCompareFrom').inputValue(), '2024');
  assert.equal(await valid.page.locator('#movementCompareTo').inputValue(), '2025');
  assert.equal(await valid.page.locator('#movementDeepLinkNotice').isHidden(), true);
  assert.ok(await valid.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1);
  assert.equal(fixture.apiRequests.at(-1).search, '');
  await capture(valid.page, 'movimientos-grh-390.png');

  const invalid = await openPage(browser, fixture, { query: '?metric=salary&window=all&from=2025&to=2024&scope=all' });
  t.after(() => invalid.context.close());
  await waitReady(invalid.page);
  assert.equal(await invalid.page.locator('#movementMetric').inputValue(), 'events');
  assert.equal(await invalid.page.locator('#movementWindow').inputValue(), '5');
  assert.equal(await invalid.page.locator('#movementDeepLinkNotice').isVisible(), true);
  assert.equal(fixture.apiRequests.at(-1).search, '');
  assert.equal(fixture.apiRequests.length, 2, 'one fixed API request per page');
});

test('movement center fails closed for 403, 503, header drift and invalid payload', async t => {
  const fixture = await createFixture();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await new Promise(resolve => fixture.server.close(resolve)); });
  for (const scenario of [
    ['forbidden', 'Acceso no habilitado'],
    ['unavailable', 'Centro de movimientos no disponible'],
    ['bad-header', 'Serie de movimientos no verificable'],
    ['invalid-shape', 'Serie de movimientos no verificable'],
  ]) {
    fixture.setScenario(scenario[0]);
    const { context, page } = await openPage(browser, fixture);
    await page.locator('#movementError:not([hidden])').waitFor();
    assert.equal(await page.locator('#movementErrorTitle').textContent(), scenario[1]);
    assert.equal(await page.locator('#movementContent').isHidden(), true);
    assert.equal(await page.locator('.movement-chart-item').count(), 0);
    assert.equal(await page.locator('#movementTableBody tr').count(), 0);
    await context.close();
  }
});
