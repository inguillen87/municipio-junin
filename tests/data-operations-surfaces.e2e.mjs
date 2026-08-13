import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import accessPolicy from '../shared/access-policy.cjs';
import { buildGrhDomainCatalogProjection } from '../api/lib/grh-domain-catalog.js';

const root = path.resolve(import.meta.dirname, '..');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

async function realCatalog() {
  const [profile, semantic] = await Promise.all([
    readFile(path.join(root, 'api', '_data', 'grh-profile.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'api', '_data', 'grh-semantic.json'), 'utf8').then(JSON.parse),
  ]);
  return buildGrhDomainCatalogProjection({
    profile,
    semantic,
    provenance: {
      profileSchemaVersion: profile.schema_version,
      semanticSchemaVersion: semantic.schema_version,
      sourceFile: profile.source,
      sourceSha256: profile.sha256,
      approvedSourceSha256: profile.sha256,
      snapshotAsOf: profile.snapshot_as_of,
    },
  });
}

function authorizedUser() {
  const base = { id: 'data-operations-qa', name: 'QA Institucional', role: 'TENANT_ADMIN', tenantId: 'tenant-junin-test' };
  const access = accessPolicy.getSessionAccessForUser(base);
  assert.ok(access);
  return {
    ...base,
    capabilities: [...access.capabilities],
    accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
    homeProfile: { ...access.homeProfile, priorityCapabilities: [...access.homeProfile.priorityCapabilities] },
  };
}

const user = authorizedUser();

function fakeToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role: user.role, tenantId: user.tenantId, exp: Math.floor(Date.now() / 1000) + 600 })}.qa`;
}

async function createServer(catalog) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/api/auth/me') {
      response.writeHead(200, { 'Content-Type': contentTypes['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ user }));
      return;
    }
    if (url.pathname === '/api/grh-domain-catalog') {
      response.writeHead(200, {
        'Content-Type': contentTypes['.json'],
        'Cache-Control': 'no-store',
        'X-MuniControl-Contract': 'grh-domain-catalog-v1',
      });
      response.end(JSON.stringify(catalog));
      return;
    }
    if (url.pathname === '/api/pdf-report') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end('<!doctype html><html lang="es"><title>Informe ejecutivo GRH</title><body><h1>Informe ejecutivo GRH</h1><p>Salida agregada de prueba.</p></body></html>');
      return;
    }

    const relative = decodeURIComponent(url.pathname.slice(1) || 'auditoria.html');
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(target);
      response.writeHead(200, { 'Content-Type': contentTypes[path.extname(target)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function createContractServer({ catalog, catalogStatus = 200, catalogContract = 'grh-domain-catalog-v1', reportStatus = 200, reportContentType = 'text/html; charset=utf-8' }) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/api/auth/me') {
      response.writeHead(200, { 'Content-Type': contentTypes['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ user }));
      return;
    }
    if (url.pathname === '/api/grh-domain-catalog') {
      response.writeHead(catalogStatus, {
        'Content-Type': contentTypes['.json'],
        'Cache-Control': 'no-store',
        'X-MuniControl-Contract': catalogContract,
      });
      response.end(JSON.stringify(catalogStatus === 200 ? catalog : { code: catalogStatus === 403 ? 'FORBIDDEN' : 'UNAVAILABLE' }));
      return;
    }
    if (url.pathname === '/api/pdf-report') {
      response.writeHead(reportStatus, { 'Content-Type': reportContentType, 'Cache-Control': 'no-store' });
      response.end(reportStatus === 200 && reportContentType.startsWith('text/html')
        ? '<!doctype html><html lang="es"><title>Informe ejecutivo GRH</title><body>Informe</body></html>'
        : JSON.stringify({ code: 'GRH_PRINTABLE_CONTRACT_UNAVAILABLE' }));
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice(1) || 'auditoria.html');
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end();
    try {
      const body = await readFile(target);
      response.writeHead(200, { 'Content-Type': contentTypes[path.extname(target)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function pageFor(browser, viewport) {
  const context = await browser.newContext({ viewport, colorScheme: 'dark' });
  await context.addInitScript(({ token, currentUser }) => {
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify(currentUser));
  }, { token: fakeToken(), currentUser: user });
  const page = await context.newPage();
  return { context, page };
}

test('real governed catalog drives useful sources and publications at desktop and mobile widths', async t => {
  const catalog = await realCatalog();
  const server = await createServer(catalog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  {
    const { context, page } = await pageFor(browser, { width: 1440, height: 980 });
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.goto(`${baseUrl}/auditoria.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#audit-status')?.dataset.state === 'ready');
    const state = await page.evaluate(() => ({
      status: document.querySelector('#audit-status')?.textContent,
      source: document.querySelector('#sourceName')?.textContent,
      cut: document.querySelector('#sourceCut')?.textContent,
      metrics: [
        document.querySelector('#metricNonEmpty')?.textContent,
        document.querySelector('#metricRows')?.textContent,
        document.querySelector('#metricDomains')?.textContent,
      ],
      domainCards: document.querySelectorAll('.data-domain-card').length,
      domainRows: document.querySelectorAll('#datasets-table tbody tr').length,
      rawControls: document.querySelectorAll('input, select, textarea, [download]').length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    assert.match(state.status, /Fuente verificada/i);
    assert.equal(state.source, catalog.source.canonicalSystem);
    assert.match(state.cut, /ago.*2026/i);
    assert.deepEqual(state.metrics, [
      new Intl.NumberFormat('es-AR').format(catalog.counts.nonEmptyTables),
      new Intl.NumberFormat('es-AR').format(catalog.counts.totalRows),
      new Intl.NumberFormat('es-AR').format(catalog.counts.domainCount),
    ]);
    assert.equal(state.domainCards, catalog.domains.length);
    assert.equal(state.domainRows, catalog.domains.length);
    assert.equal(state.rawControls, 0);
    assert.ok(state.overflow <= 1, `sources desktop overflow: ${state.overflow}px`);
    assert.deepEqual(consoleErrors, []);
    await page.screenshot({ path: path.join(os.tmpdir(), 'municontrol-fuentes-desktop.png'), fullPage: true });
    await context.close();
  }

  {
    const { context, page } = await pageFor(browser, { width: 390, height: 844 });
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.goto(`${baseUrl}/exportar.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#publicationStatus')?.dataset.state === 'ready');
    const state = await page.evaluate(() => ({
      cards: document.querySelectorAll('.data-publication-card').length,
      activeActions: document.querySelectorAll('.data-publication-card .data-button:not([aria-disabled="true"])').length,
      disabled: document.querySelectorAll('.data-publication-card button:disabled').length,
      text: document.querySelector('#mainContent')?.textContent,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    assert.equal(state.cards, 4);
    assert.equal(state.activeActions, 4);
    assert.equal(state.disabled, 0);
    assert.match(state.text, /Informe ejecutivo GRH/);
    assert.match(state.text, /Las planillas con datos personales no están habilitadas/);
    assert.doesNotMatch(state.text, /snapshot|CSV\/XLSX nominal|huella|Calidad y trazabilidad|conciliación/i);
    assert.doesNotMatch(state.text, /Registros RRHH importados|Evolución de planta|Historial persistido: no disponible/);
    assert.ok(state.overflow <= 1, `publications mobile overflow: ${state.overflow}px`);
    await page.screenshot({ path: path.join(os.tmpdir(), 'municontrol-publicaciones-mobile.png'), fullPage: true });

    const popupPromise = page.waitForEvent('popup');
    await page.locator('[data-publication="executive-print"]').click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => document.querySelectorAll('#recentTable tr').length === 1 && !document.querySelector('#recentEmpty'));
    assert.equal(await popup.title(), 'Informe ejecutivo GRH');
    assert.match(await page.locator('#recentTable').textContent(), /Generada · revisar antes de circular/i);
    assert.deepEqual(consoleErrors, []);
    await context.close();
  }
});

test('invalid catalog periods, denied or unavailable sources and invalid report content publish nothing', async t => {
  const original = await realCatalog();
  const cases = [
    {
      name: 'invalid period month',
      catalog: (() => { const value = structuredClone(original); value.domains[0].periods.first = '2026-99'; value.domains[0].periods.last = '2026-99'; return value; })(),
      catalogStatus: 200,
    },
    { name: 'denied catalog', catalog: original, catalogStatus: 403 },
    { name: 'unavailable catalog', catalog: original, catalogStatus: 503 },
    { name: 'invalid catalog header', catalog: original, catalogStatus: 200, catalogContract: 'grh-domain-catalog-v0' },
  ];
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  for (const scenario of cases) {
    const server = await createContractServer(scenario);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const { context, page } = await pageFor(browser, { width: 390, height: 844 });
    await page.goto(`${baseUrl}/exportar.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#publicationStatus')?.dataset.state === 'error', null, { timeout: 5000 });
    const state = await page.evaluate(() => ({
      cards: document.querySelectorAll('.data-publication-card').length,
      printButtons: document.querySelectorAll('[data-publication="executive-print"]').length,
      summaryHidden: document.querySelector('#publicationSummary')?.hidden,
    }));
    assert.deepEqual(state, { cards: 0, printButtons: 0, summaryHidden: true }, scenario.name);
    await context.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }

  for (const report of [
    { reportStatus: 503, reportContentType: 'application/json; charset=utf-8' },
    { reportStatus: 200, reportContentType: 'application/json; charset=utf-8' },
  ]) {
    const server = await createContractServer({ catalog: original, ...report });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const { context, page } = await pageFor(browser, { width: 390, height: 844 });
    await page.addInitScript(() => { window.open = () => null; });
    await page.goto(`${baseUrl}/exportar.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#publicationStatus')?.dataset.state === 'ready', null, { timeout: 5000 });
    await page.locator('[data-publication="executive-print"]').click();
    await page.waitForFunction(() => !document.querySelector('#publicationToast')?.hidden, null, { timeout: 5000 });
    assert.match(await page.locator('#publicationToast').textContent(), /No se pudo verificar y generar/i);
    assert.equal(await page.locator('#recentTable tr').count(), 1);
    assert.equal(await page.locator('#recentEmpty').count(), 1);
    assert.match(await page.locator('#recentEmpty').textContent(), /Todavía no generaste/i);
    await context.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
