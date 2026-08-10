import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import accessPolicy from '../shared/access-policy.cjs';

const root = path.resolve(import.meta.dirname, '..');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function authoritativeUser() {
  const user = {
    id: 'surface-truth-qa',
    name: 'QA Institucional',
    role: 'TENANT_ADMIN',
    tenantId: 'tenant-junin-test'
  };
  const access = accessPolicy.getSessionAccessForUser(user);
  assert.ok(access, 'missing authorized surface-truth fixture projection');
  return {
    ...user,
    capabilities: [...access.capabilities],
    accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
    homeProfile: {
      ...access.homeProfile,
      priorityCapabilities: [...access.homeProfile.priorityCapabilities]
    },
    presentation: {
      schemaVersion: 'tenant-presentation-v1',
      locale: 'es-AR',
      timeZone: 'America/Argentina/Buenos_Aires',
      displayCurrencyCode: 'ARS',
      displayCurrencyBasis: 'tenant_configuration',
      displayCurrencyEffectiveOn: '2026-08-10',
      sourceCurrencyStatus: 'not_declared_in_source'
    }
  };
}

const AUTHORIZED_USER = authoritativeUser();

function fakeToken() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: AUTHORIZED_USER.id,
    role: AUTHORIZED_USER.role,
    tenantId: AUTHORIZED_USER.tenantId,
    exp: Math.floor(Date.now() / 1000) + 600
  })}.qa`;
}

async function createServer() {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/api/auth/me') {
      response.writeHead(200, { 'Content-Type': contentTypes['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({
        user: AUTHORIZED_USER
      }));
      return;
    }
    if (url.pathname === '/api/reports') {
      response.writeHead(503, { 'Content-Type': contentTypes['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({
        error: 'Fuente no disponible',
        dataStatus: { available: false, warning: 'No hay datos municipales actuales y verificados para este reporte.' }
      }));
      return;
    }
    if (url.pathname === '/api/audit') {
      response.writeHead(503, { 'Content-Type': contentTypes['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: 'Inventario no disponible' }));
      return;
    }

    const relative = decodeURIComponent(url.pathname.slice(1) || 'manuales.html');
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
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function authenticatedPage(browser, baseUrl, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(({ token, user }) => {
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify(user));
  }, { token: fakeToken(), user: AUTHORIZED_USER });
  const page = await context.newPage();
  await page.route('https://**/*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  });
  return { context, page, baseUrl };
}

test('blocked and retired surfaces stay honest and responsive', async (t) => {
  const server = await createServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  });

  for (const scenario of [
    { page: 'configuracion.html', width: 390, height: 844, state: 'blocked', marker: 'data-config-contract' },
    { page: 'inteligencia.html', width: 1440, height: 940, state: 'retired', marker: 'data-retirement-code' },
    { page: 'manuales.html', width: 390, height: 844, state: null, marker: 'data-doc-version' }
  ]) {
    const { context, page } = await authenticatedPage(browser, baseUrl, { width: scenario.width, height: scenario.height });
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto(`${baseUrl}/${scenario.page}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.MuniAuthReady);
    const result = await page.evaluate(({ state, marker }) => ({
      state: document.body.dataset.surfaceState || null,
      marker: document.body.getAttribute(marker),
      forms: document.querySelectorAll('form, input, textarea, select').length,
      fakeVisuals: document.querySelectorAll('canvas, [id^="kpi"]').length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      stateExpected: state
    }), scenario);
    assert.equal(result.state, scenario.state);
    assert.ok(result.marker);
    assert.equal(result.forms, 0);
    assert.equal(result.fakeVisuals, 0);
    assert.ok(result.overflow <= 1, `${scenario.page} horizontal overflow: ${result.overflow}px`);
    assert.deepEqual(consoleErrors, []);
    await context.close();
  }
});

test('reports and audit remain empty when authenticated sources return 503', async (t) => {
  const server = await createServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  });

  {
    const { context, page } = await authenticatedPage(browser, baseUrl, { width: 1440, height: 940 });
    await page.goto(`${baseUrl}/reportes.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#data-status')?.textContent.includes('No hay datos municipales'));
    const reportState = await page.evaluate(() => ({
      status: document.querySelector('#data-status').textContent,
      period: document.querySelector('#period-table-body').textContent,
      control: document.querySelector('#control-table-body').textContent,
      svgCount: document.querySelectorAll('.chart-container svg').length,
      path: location.pathname
    }));
    assert.match(reportState.status, /No hay datos municipales actuales y verificados/i);
    assert.match(reportState.period, /Sin evidencia GRH validada/i);
    assert.match(reportState.control, /Sin evidencia GRH validada/i);
    assert.equal(reportState.svgCount, 0);
    assert.equal(reportState.path, '/reportes.html');
    await context.close();
  }

  {
    const { context, page } = await authenticatedPage(browser, baseUrl, { width: 390, height: 844 });
    await page.goto(`${baseUrl}/auditoria.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#audit-status')?.textContent.includes('No se pudo verificar'));
    const auditState = await page.evaluate(() => ({
      status: document.querySelector('#audit-status').textContent,
      kpis: [...document.querySelectorAll('[id^="kpi-"]')].map((node) => node.textContent.trim()),
      connectionDisabled: document.querySelector('button[title*="contrato auditado"]')?.disabled,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    assert.match(auditState.status, /No se pudo verificar el inventario/i);
    assert.ok(auditState.kpis.every((value) => value === '—'));
    assert.equal(auditState.connectionDisabled, true);
    assert.ok(auditState.overflow <= 1, `audit mobile overflow: ${auditState.overflow}px`);
    await context.close();
  }
});
