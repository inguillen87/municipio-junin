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

async function realLinkage() {
  return readFile(path.join(root, 'api', '_data', 'grh-personas-linkage-readiness.json'), 'utf8').then(JSON.parse);
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

function privateReviewSummary() {
  return {
    schemaVersion: 'grh-personas-review-v1',
    status: 'ready',
    source: {
      snapshotAsOf: '2026-08-06',
      grhSourceSha256: 'e'.repeat(64),
      personasSourceSha256: 'f'.repeat(64),
      matcherVersion: 'grh-personas-linkage-matcher-v1',
      evidencePolicyVersion: 'grh-personas-review-evidence-v2',
    },
    permissions: { canRead: true, canDecide: true },
    summary: {
      totalCases: 2349,
      totalOptions: 2185,
      byKind: { candidate: 1699, ambiguous: 157, unmatched: 493 },
      byStatus: { pending: 2349, deferred: 0, approved: 0, rejected: 0 },
      documentConflicts: 23,
      autoApproved: 0,
    },
  };
}

function fakeToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role: user.role, tenantId: user.tenantId, exp: Math.floor(Date.now() / 1000) + 600 })}.qa`;
}

async function createServer(catalog, linkage) {
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
    if (url.pathname === '/api/grh-personas-linkage-readiness') {
      response.writeHead(200, {
        'Content-Type': contentTypes['.json'],
        'Cache-Control': 'no-store',
        'X-MuniControl-Contract': 'grh-personas-linkage-readiness-v1',
      });
      response.end(JSON.stringify(linkage));
      return;
    }
    if (url.pathname === '/api/grh-personas-review' && url.searchParams.get('view') === 'summary') {
      response.writeHead(200, {
        'Content-Type': contentTypes['.json'],
        'Cache-Control': 'no-store',
        'X-MuniControl-Contract': 'grh-personas-review-v1',
      });
      response.end(JSON.stringify(privateReviewSummary()));
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

async function createContractServer({ catalog, catalogStatus = 200, catalogContract = 'grh-domain-catalog-v1', linkage = null, linkageStatus = 503, linkageContract = 'grh-personas-linkage-readiness-v1', reviewCanDecide = true, reportStatus = 200, reportContentType = 'text/html; charset=utf-8' }) {
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
    if (url.pathname === '/api/grh-personas-linkage-readiness') {
      response.writeHead(linkageStatus, {
        'Content-Type': contentTypes['.json'],
        'Cache-Control': 'no-store',
        'X-MuniControl-Contract': linkageContract,
      });
      response.end(JSON.stringify(linkageStatus === 200 ? linkage : {
        error: 'La revisión de vinculación entre GRH y PERSONAS no está disponible.',
        code: 'GRH_PERSONAS_LINKAGE_UNAVAILABLE',
      }));
      return;
    }
    if (url.pathname === '/api/grh-personas-review' && url.searchParams.get('view') === 'summary') {
      const review = privateReviewSummary();
      review.permissions.canDecide = reviewCanDecide;
      response.writeHead(200, {
        'Content-Type': contentTypes['.json'],
        'Cache-Control': 'no-store',
        'X-MuniControl-Contract': 'grh-personas-review-v1',
      });
      response.end(JSON.stringify(review));
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

async function pageFor(browser, viewport, forcedColors = 'none') {
  const context = await browser.newContext({ viewport, colorScheme: 'dark', forcedColors });
  await context.addInitScript(({ token, currentUser }) => {
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify(currentUser));
  }, { token: fakeToken(), currentUser: user });
  const page = await context.newPage();
  return { context, page };
}

test('real governed catalog drives useful sources and publications at desktop and mobile widths', async t => {
  const [catalog, linkage] = await Promise.all([realCatalog(), realLinkage()]);
  const server = await createServer(catalog, linkage);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  for (const scenario of [
    { name: 'desktop', viewport: { width: 1440, height: 980 }, columns: 4 },
    { name: 'tablet', viewport: { width: 800, height: 900 }, columns: 2 },
    { name: 'mobile', viewport: { width: 390, height: 844 }, columns: 1 },
    { name: 'compact forced colors', viewport: { width: 320, height: 720 }, columns: 1, forcedColors: 'active' },
  ]) {
    const { context, page } = await pageFor(browser, scenario.viewport, scenario.forcedColors);
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.goto(`${baseUrl}/auditoria.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#audit-status')?.dataset.state === 'ready');
    await page.waitForFunction(() => document.querySelector('#linkageStatus')?.dataset.state === 'ready');
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
      rawControls: document.querySelectorAll('#mainContent input, #mainContent select, #mainContent textarea, #mainContent [download]').length,
      linkage: {
        figures: [
          document.querySelector('#linkageGrhPeople')?.textContent,
          document.querySelector('#linkageCandidates')?.textContent,
          document.querySelector('#linkageAmbiguous')?.textContent,
          document.querySelector('#linkageUnmatched')?.textContent,
          document.querySelector('#linkagePeopleWithAddress')?.textContent,
          document.querySelector('#linkageAddresses')?.textContent,
          document.querySelector('#linkageGeocoded')?.textContent,
          document.querySelector('#linkageContacts')?.textContent,
        ],
        coverage: document.querySelector('#linkageCoverage')?.textContent,
        defaultText: document.querySelector('#linkageSection')?.innerText,
        technicalText: document.querySelector('.data-linkage-technical')?.textContent,
        detailsOpen: document.querySelector('.data-linkage-technical')?.open,
        columns: getComputedStyle(document.querySelector('.data-linkage-metric-grid')).gridTemplateColumns.split(' ').length,
        summaryHeight: document.querySelector('.data-linkage-technical summary')?.getBoundingClientRect().height,
      },
      forcedColors: matchMedia('(forced-colors: active)').matches,
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
    assert.deepEqual(state.linkage.figures, [
      linkage.reconciliation.grhPersons,
      linkage.reconciliation.candidates,
      linkage.reconciliation.ambiguous,
      linkage.reconciliation.unmatched,
      linkage.source.personas.counts.personsWithAddress,
      linkage.source.personas.counts.addresses,
      linkage.source.personas.counts.geocodedAddresses,
      linkage.source.personas.counts.contacts,
    ].map(value => new Intl.NumberFormat('es-AR').format(value)));
    assert.equal(state.linkage.coverage, `${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(linkage.reconciliation.coveragePct)}% del universo laboral cuenta con una sugerencia; todavía no es un vínculo.`);
    assert.match(state.linkage.defaultText, /Dos bases, una integración en preparación/i);
    assert.match(state.linkage.defaultText, /Todavía no se incorporó información del padrón a las fichas laborales/i);
    assert.match(state.linkage.defaultText, /respaldos históricos y no se actualizan en tiempo real/i);
    assert.match(state.linkage.defaultText, /domicilio puede estar repetido, incompleto o haber quedado antiguo/i);
    assert.match(state.linkage.defaultText, /183 registros con coordenadas no están vinculados de forma verificable a personas/i);
    assert.match(state.linkage.defaultText, /número interno de persona de una base nunca se usa para unirla con la otra/i);
    assert.doesNotMatch(state.linkage.defaultText, /snapshot|cross-source|\bPII\b|\bhash\b|\bk\s*=/i);
    assert.match(state.linkage.technicalText, /[0-9a-f]{64}/i);
    assert.equal(state.linkage.detailsOpen, false);
    assert.equal(state.linkage.columns, scenario.columns, `${scenario.name}: card columns`);
    assert.ok(state.linkage.summaryHeight >= 44, `${scenario.name}: technical disclosure target`);
    assert.equal(state.forcedColors, scenario.forcedColors === 'active');
    assert.ok(state.overflow <= 1, `${scenario.name} sources overflow: ${state.overflow}px`);
    assert.deepEqual(consoleErrors, []);
    await page.screenshot({ path: path.join(os.tmpdir(), `municontrol-fuentes-${scenario.name.replaceAll(' ', '-')}.png`), fullPage: true });
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

test('linkage failure publishes no figures and keeps a healthy read-only review entry available', async t => {
  const catalog = await realCatalog();
  const server = await createContractServer({ catalog, linkageStatus: 503, reviewCanDecide: false });
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const { context, page } = await pageFor(browser, { width: 390, height: 844 });
  t.after(() => context.close());
  await page.goto(`http://127.0.0.1:${server.address().port}/auditoria.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#audit-status')?.dataset.state === 'ready');
  await page.waitForFunction(() => document.querySelector('#linkageStatus')?.dataset.state === 'error');
  await page.waitForFunction(() => document.querySelector('#linkageReviewCta')?.hidden === false);
  const state = await page.evaluate(() => ({
    catalogCards: document.querySelectorAll('.data-domain-card').length,
    linkageHidden: document.querySelector('#linkageContent')?.hidden,
    linkageText: document.querySelector('#linkageSection')?.innerText,
    reviewEntry: document.querySelector('#linkageReviewCta')?.innerText,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  assert.equal(state.catalogCards, catalog.domains.length);
  assert.equal(state.linkageHidden, true);
  assert.match(state.linkageText, /no está disponible/i);
  assert.match(state.reviewEntry, /Consultar la cola de revisión[\s\S]*modo lectura/i);
  assert.doesNotMatch(state.linkageText, /2\.349|1\.699|157|493|90\.365|273\.314|183|350/);
  assert.ok(state.overflow <= 1, `unavailable linkage overflow: ${state.overflow}px`);
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
