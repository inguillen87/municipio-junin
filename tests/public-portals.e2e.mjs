import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

async function createServer(requestLog) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    requestLog.push({ method: request.method, pathname: url.pathname });
    const relative = decodeURIComponent(url.pathname.slice(1));
    const target = path.resolve(REPO, relative || 'landing.html');
    if (!target.startsWith(`${REPO}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(target);
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES[path.extname(target)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

test('public portals render at enterprise breakpoints without network, scripts or misleading actions', async t => {
  const requestLog = [];
  const server = await createServer(requestLog);
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const cases = [
    { filename: 'cuentas-claras.html', status: '#portal-source-status' },
    { filename: 'ciudadano.html', status: '#citizen-source-status' },
  ];
  const viewports = [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ];

  for (const portal of cases) {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport,
        javaScriptEnabled: false,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const consoleErrors = [];
      const externalRequests = [];
      const failedRequests = [];

      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('request', request => {
        if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url());
      });
      page.on('requestfailed', request => failedRequests.push(request.url()));

      await page.goto(`${baseUrl}/${portal.filename}`, { waitUntil: 'networkidle' });
      await page.locator(portal.status).waitFor({ state: 'visible' });

      const state = await page.evaluate(statusSelector => ({
        sourceState: document.querySelector(statusSelector)?.getAttribute('data-source-state'),
        sourceText: document.querySelector(statusSelector)?.textContent || '',
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        h1Count: document.querySelectorAll('h1').length,
        mainPresent: Boolean(document.querySelector('main#contenido')),
        riskyControls: document.querySelectorAll('form, input, select, textarea, button').length,
        scriptCount: document.scripts.length,
        animationDuration: getComputedStyle(document.querySelector('.hero')).animationDuration,
      }), portal.status);

      assert.equal(state.sourceState, 'disconnected');
      assert.match(state.sourceText, /Fuente pública no conectada/i);
      assert.equal(state.overflow, 0, `${portal.filename} ${viewport.name} must not overflow`);
      assert.equal(state.h1Count, 1);
      assert.equal(state.mainPresent, true);
      assert.equal(state.riskyControls, 0);
      assert.equal(state.scriptCount, 0);
      assert.match(state.animationDuration, /^(?:0(?:s|ms)|0[.]0+1(?:s|ms)|1e-)/i);
      assert.deepEqual(consoleErrors, []);
      assert.deepEqual(externalRequests, []);
      assert.deepEqual(failedRequests, []);

      await page.keyboard.press('Tab');
      assert.equal(await page.locator('.skip-link').evaluate(element => document.activeElement === element), true);
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => location.hash), '#contenido');

      await context.close();
    }
  }

  assert.equal(requestLog.every(item => item.method === 'GET'), true);
  assert.equal(requestLog.every(item => ['/cuentas-claras.html', '/ciudadano.html'].includes(item.pathname)), true);
});
