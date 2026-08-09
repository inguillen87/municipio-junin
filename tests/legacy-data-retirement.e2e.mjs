import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import accessPolicy from '../shared/access-policy.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
    id: 'legacy-retirement-qa',
    name: 'QA Ejecutivo',
    role: 'INTENDENTE',
    tenantId: 'tenant-junin-test'
  };
  const access = accessPolicy.getSessionAccessForUser(user);
  assert.ok(access, 'missing authorized retired-surface fixture projection');
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

function fakeBrowserToken() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: AUTHORIZED_USER.id,
    role: AUTHORIZED_USER.role,
    tenantId: AUTHORIZED_USER.tenantId,
    exp: Math.floor(Date.now() / 1000) + 600
  })}.qa`;
}

async function createStaticServer() {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/api/auth/me') {
      response.writeHead(200, { 'Content-Type': contentTypes['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({
        user: AUTHORIZED_USER
      }));
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice(1) || 'analytics.html');
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

test('retired modules remain explicit, blocked and responsive', async (t) => {
  const server = await createStaticServer();
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  });

  for (const scenario of [
    { page: 'analytics.html', width: 1440, height: 960, title: 'Analítica transversal' },
    { page: 'vecinos.html', width: 390, height: 844, title: 'Atención vecinal' }
  ]) {
    const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height } });
    await context.addInitScript(({ token, user }) => {
      sessionStorage.setItem('mjunin_token', token);
      sessionStorage.setItem('mjunin_user', JSON.stringify(user));
    }, { token: fakeBrowserToken(), user: AUTHORIZED_USER });
    const browserPage = await context.newPage();
    const consoleErrors = [];
    const externalRequests = [];
    browserPage.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    browserPage.on('request', (request) => {
      if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url());
    });

    await browserPage.goto(`${baseUrl}/${scenario.page}`, { waitUntil: 'networkidle' });
    await browserPage.waitForSelector('[data-source-status="SOURCE_NOT_CONNECTED"]');
    const state = await browserPage.evaluate(() => ({
      bodyState: document.body.dataset.sourceState,
      title: document.querySelector('#retired-module-title')?.textContent.trim(),
      status: document.querySelector('.retired-module-kicker')?.textContent.trim(),
      disabled: document.querySelector('.retired-module-disabled')?.disabled,
      inputs: document.querySelectorAll('input, form, canvas, table').length,
      navItems: document.querySelectorAll('#sidebar a.sb-item').length,
      menuDisplay: getComputedStyle(document.querySelector('#menuBtn')).display,
      syntheticStorageKeys: Object.keys(localStorage).filter((key) => key.startsWith('muni_db_')).length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));

    assert.equal(state.bodyState, 'not-connected');
    assert.equal(state.title, scenario.title);
    assert.match(state.status, /Sin fuente conectada.*no operativo/i);
    assert.equal(state.disabled, true);
    assert.equal(state.inputs, 0);
    assert.ok(state.navItems > 0, `navigation was not preserved on ${scenario.page}`);
    if (scenario.width <= 900) assert.notEqual(state.menuDisplay, 'none');
    assert.equal(state.syntheticStorageKeys, 0);
    assert.ok(state.overflow <= 1, `horizontal overflow on ${scenario.page}: ${state.overflow}px`);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(externalRequests, []);
    await context.close();
  }
});
