import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import accessPolicy from '../shared/access-policy.cjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ROLE_TOUR_PATH = path.join(ROOT, 'roles.html');
const LOGIN_PATH = path.join(ROOT, 'login.html');

async function createServer(requests) {
  const [roleTour, login] = await Promise.all([
    readFile(ROLE_TOUR_PATH),
    readFile(LOGIN_PATH),
  ]);
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    requests.push({ method: request.method, path: url.pathname });
    if ((url.pathname === '/roles' || url.pathname === '/roles.html') && request.method === 'GET') {
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(roleTour);
      return;
    }
    if ((url.pathname === '/login' || url.pathname === '/login.html' || url.pathname === '/') && request.method === 'GET') {
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
      });
      response.end(login);
      return;
    }
    response.writeHead(404, { 'Cache-Control': 'no-store' });
    response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

test('public role tour is inert, self-contained and exposes no private destination', async () => {
  const source = await readFile(ROLE_TOUR_PATH, 'utf8');
  assert.match(source, /data-role-tour-contract="public-role-tour-v1"/);
  assert.match(source, new RegExp(`data-access-policy-version="${accessPolicy.ACCESS_POLICY_VERSION.replaceAll('.', '\\.')}"`));
  assert.match(source, /Recorrido visual/);
  assert.match(source, /No inicia sesi[oó]n, no accede a datos municipales y no prueba autorizaci[oó]n/i);
  assert.match(source, /href="\/login"/);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/);
  assert.doesNotMatch(source, /(?:local|session)Storage|Authorization|Bearer\s|mjunin_token|password|contrase[nñ]a/i);
  assert.doesNotMatch(source, /<script\b[^>]*\bsrc=|<link\b[^>]*\brel=["']stylesheet|https?:\/\//i);
  assert.doesNotMatch(source, /href=["'](?:dashboard|inicio|grh|hacienda|reportes|control|rrhh|ia|auditoria|importar|exportar)(?:\.html)?["']/i);

  const inlineScripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  assert.equal(inlineScripts.length, 1);
  assert.doesNotThrow(() => new Function(inlineScripts[0]));
});

test('tour renders the exact seven policy profiles without granting navigation', async t => {
  const requests = [];
  const server = await createServer(requests);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const externalRequests = [];
  page.on('request', request => {
    if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url());
  });
  await page.goto(`${baseUrl}/roles`, { waitUntil: 'networkidle' });

  const renderedRoles = await page.locator('[role="tab"][data-role]').evaluateAll(nodes => nodes.map(node => node.dataset.role));
  assert.deepEqual(new Set(renderedRoles), new Set(Object.values(accessPolicy.ROLES)));
  assert.equal(renderedRoles.length, 7);

  for (const role of Object.values(accessPolicy.ROLES)) {
    const expected = accessPolicy.ROLE_HOME_PROFILE[role];
    await page.locator(`[role="tab"][data-role="${role}"]`).click();
    const rendered = await page.locator('#profilePanel').evaluate(panel => ({
      activeRole: panel.dataset.activeRole,
      activeVariant: panel.dataset.activeVariant,
      priorityCapabilities: [...panel.querySelectorAll('[data-priority-capability]')]
        .map(node => node.dataset.priorityCapability),
    }));
    assert.equal(rendered.activeRole, role);
    assert.equal(rendered.activeVariant, expected.variant);
    assert.deepEqual(rendered.priorityCapabilities, expected.priorityCapabilities.filter(value => value !== 'navigation.workspace'));
    assert.equal(await page.locator('a').filter({ has: page.locator(`[data-role="${role}"]`) }).count(), 0);
  }

  const hrefs = await page.locator('a[href]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
  assert.ok(hrefs.every(href => ['#roleTour', '/login'].includes(href)), `unexpected link: ${hrefs.join(', ')}`);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(requests, [{ method: 'GET', path: '/roles' }]);
});

test('tour is responsive, keyboard-operable and reduced-motion safe', async t => {
  const requests = [];
  const server = await createServer(requests);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  for (const viewport of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 900 },
    { name: 'desktop', width: 1440, height: 900 },
  ]) {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto(`${baseUrl}/roles`, { waitUntil: 'networkidle' });

    const metrics = await page.evaluate(() => {
      const times = [...document.querySelectorAll('*')].flatMap(node => {
        const style = getComputedStyle(node);
        return [...style.animationDuration.split(','), ...style.transitionDuration.split(',')];
      });
      const toMilliseconds = value => {
        const numeric = Number.parseFloat(value);
        if (!Number.isFinite(numeric)) return 0;
        return value.trim().endsWith('ms') ? numeric : numeric * 1000;
      };
      return {
        h1: document.querySelectorAll('h1').length,
        main: document.querySelectorAll('main').length,
        maxCssTimeMs: Math.max(0, ...times.map(toMilliseconds)),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        tabHeights: [...document.querySelectorAll('[role="tab"]')].map(node => node.getBoundingClientRect().height),
        linkHeights: [...document.querySelectorAll('a:not(.skip-link)')].map(node => node.getBoundingClientRect().height),
      };
    });
    assert.equal(metrics.h1, 1, `${viewport.name}: one h1`);
    assert.equal(metrics.main, 1, `${viewport.name}: one main`);
    assert.ok(metrics.overflow <= 1, `${viewport.name}: no horizontal overflow`);
    assert.ok(metrics.tabHeights.every(value => value >= 44), `${viewport.name}: role targets >=44px`);
    assert.ok(metrics.linkHeights.every(value => value >= 44), `${viewport.name}: visible link targets >=44px`);
    assert.ok(metrics.maxCssTimeMs <= 0.02, `${viewport.name}: reduced motion is bounded`);
    assert.deepEqual(consoleErrors, [], `${viewport.name}: no console errors`);

    await page.locator('[data-role="SUPER_ADMIN"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.role), 'TENANT_ADMIN');
    assert.equal(await page.getAttribute('[data-role="TENANT_ADMIN"]', 'aria-selected'), 'true');
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.role), 'DEMO');
    assert.equal(await page.getAttribute('[data-role="DEMO"]', 'aria-selected'), 'true');
    await context.close();
  }
});

test('login offers the public tour without changing the authentication path', async t => {
  const requests = [];
  const server = await createServer(requests);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  const tourLink = page.locator('a.tour-link');
  assert.equal(await tourLink.getAttribute('href'), '/roles');
  assert.match(await tourLink.textContent(), /Ver recorrido p[uú]blico por perfiles/);
  await Promise.all([
    page.waitForURL(`${baseUrl}/roles`),
    tourLink.click(),
  ]);
  assert.equal(await page.getAttribute('body', 'data-role-tour-contract'), 'public-role-tour-v1');
  assert.equal(requests.some(entry => entry.path.startsWith('/api/')), false);
});
