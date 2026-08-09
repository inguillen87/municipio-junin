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
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function authoritativeUser() {
  const user = {
    id: 'import-contract-qa',
    name: 'QA Importaciones',
    role: 'TENANT_ADMIN',
    tenantId: 'tenant-junin-test'
  };
  const access = accessPolicy.getSessionAccessForUser(user);
  assert.ok(access, 'missing authorized import fixture projection');
  return {
    ...user,
    capabilities: [...access.capabilities],
    accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
    homeProfile: {
      ...access.homeProfile,
      priorityCapabilities: [...access.homeProfile.priorityCapabilities]
    }
  };
}

const AUTHORIZED_USER = authoritativeUser();

function fakeToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: AUTHORIZED_USER.id,
    role: AUTHORIZED_USER.role,
    tenantId: AUTHORIZED_USER.tenantId,
    exp: Math.floor(Date.now() / 1000) + 600
  })}.qa`;
}

function importPayload(kind) {
  const base = {
    success: true,
    parsed: true,
    persisted: true,
    datasetId: `dataset-${kind}`,
    id: `dataset-${kind}`,
    module: 'rrhh',
    period: '2026-07',
    limit: 5000
  };
  if (kind === 'successsheet') {
    return { ...base, status: 'success', partial: false, sourceRowCount: 2, parsedRows: 2, rowCount: 2, insertedRows: 2, persistedRows: 2, rejectedRows: 0, truncated: false };
  }
  if (kind === 'partialsheet') {
    return { ...base, status: 'partial', partial: true, sourceRowCount: 5, parsedRows: 5, rowCount: 4, insertedRows: 4, persistedRows: 4, rejectedRows: 1, truncated: false };
  }
  if (kind === 'truncatedsheet') {
    return { ...base, status: 'partial', partial: true, sourceRowCount: 5002, parsedRows: 5002, rowCount: 5000, insertedRows: 5000, persistedRows: 5000, rejectedRows: 2, truncated: true };
  }
  if (kind === 'incoherentsheet') {
    return { ...base, status: 'success', partial: false, sourceRowCount: 5000, parsedRows: 5000, rowCount: 5000, insertedRows: 5000, persistedRows: 5000, rejectedRows: 2, truncated: false };
  }
  return { error: 'La hoja fue rechazada por la fuente', parsed: false, persisted: false };
}

async function createServer() {
  const googleRequests = [];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/api/auth/me') {
      response.writeHead(200, { 'Content-Type': contentTypes['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({
        user: AUTHORIZED_USER
      }));
      return;
    }
    if (url.pathname === '/api/audit') {
      response.writeHead(200, { 'Content-Type': contentTypes['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ datasets: [] }));
      return;
    }
    if (url.pathname === '/api/google-sheets') {
      let rawBody = '';
      for await (const chunk of request) rawBody += chunk;
      const body = JSON.parse(rawBody || '{}');
      const match = String(body.sheetUrl || '').match(/\/d\/([a-zA-Z0-9_-]+)/);
      const kind = match?.[1] || 'rejectsheet';
      googleRequests.push({ kind, authorization: request.headers.authorization, body });
      const rejected = kind === 'rejectsheet';
      const partial = kind === 'partialsheet' || kind === 'truncatedsheet';
      response.writeHead(rejected ? 422 : partial ? 207 : 200, {
        'Content-Type': contentTypes['.json'],
        'Cache-Control': 'no-store'
      });
      response.end(JSON.stringify(importPayload(kind)));
      return;
    }

    const relative = decodeURIComponent(url.pathname.slice(1) || 'importar.html');
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
  return { server, googleRequests };
}

async function submitSheet(page, kind, expectedState) {
  await page.locator('#importPeriod').fill('2026-07');
  await page.locator('#gdriveInput').fill(`https://docs.google.com/spreadsheets/d/${kind}/edit`);
  await page.locator('#panel-gdrive .btn-connect').click();
  await page.waitForFunction(state => document.querySelector('#panel-gdrive [data-google-import-status]')?.dataset.state === state, expectedState);
  return page.locator('#panel-gdrive [data-google-import-status]').evaluate(node => ({
    state: node.dataset.state,
    text: node.textContent,
    buttonDisabled: document.querySelector('#panel-gdrive .btn-connect').disabled,
    buttonBusy: document.querySelector('#panel-gdrive .btn-connect').getAttribute('aria-busy')
  }));
}

test('Google Sheets UI renders success, partial, truncation and rejection from the strict server contract', async t => {
  const { server, googleRequests } = await createServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(({ token, user }) => {
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify(user));
  }, { token: fakeToken(), user: AUTHORIZED_USER });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => {
    if (message.type() === 'error' && !/Failed to load resource.*422/i.test(message.text())) consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`${baseUrl}/importar.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.MuniAuthReady);
  await page.locator('#src-gdrive').click();

  const success = await submitSheet(page, 'successsheet', 'success');
  assert.match(success.text, /2 de 2 filas persistidas/i);

  const partial = await submitSheet(page, 'partialsheet', 'partial');
  assert.match(partial.text, /Importación parcial.*4 de 5.*1 rechazadas/i);

  const truncated = await submitSheet(page, 'truncatedsheet', 'truncated');
  assert.match(truncated.text, /Importación truncada.*5\.000.*5\.002.*2 no se guardaron/i);

  const rejected = await submitSheet(page, 'rejectsheet', 'rejected');
  assert.match(rejected.text, /Importación rechazada.*hoja fue rechazada/i);

  const incoherent = await submitSheet(page, 'incoherentsheet', 'rejected');
  assert.match(incoherent.text, /contrato coherente.*No se declaró éxito/i);
  assert.equal(incoherent.buttonDisabled, false);
  assert.equal(incoherent.buttonBusy, 'false');

  assert.equal(googleRequests.length, 5);
  assert.ok(googleRequests.every(item => /^Bearer\s+/.test(item.authorization || '')));
  assert.ok(googleRequests.every(item => item.body.module === 'rrhh'));
  assert.ok(googleRequests.every(item => item.body.period === '2026-07'));
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  await context.close();
});
