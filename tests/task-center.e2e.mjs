import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';

import accessPolicy from '../shared/access-policy.cjs';
import { resolveMunicipalTaskCatalog } from '../js/municipal-task-catalog.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
});

function inputFor(role, capabilities = accessPolicy.ROLE_CAPABILITIES[role]) {
  return {
    role,
    variant: accessPolicy.ROLE_HOME_PROFILE[role].variant,
    policyVersion: accessPolicy.ACCESS_POLICY_VERSION,
    capabilities: [...capabilities],
  };
}

function harness() {
  return `<!doctype html>
  <html lang="es-AR" data-theme="dark">
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;background:#07111e;color:#fff;font-family:Arial,sans-serif">
      <main style="width:min(1100px,calc(100% - 24px));margin:18px auto">
        <section class="municipal-task-finder" id="taskHarness" data-municipal-task-finder data-task-finder-mode="workspace"></section>
      </main>
      <script src="/js/municipal-task-center.js"></script>
    </body>
  </html>`;
}

async function createServer(requestLog) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    requestLog.push(url.pathname);
    if (url.pathname === '/harness') {
      response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': CONTENT_TYPES['.html'] });
      response.end(harness());
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice(1));
    const target = path.resolve(ROOT, relative);
    if (!relative || !target.startsWith(`${ROOT}${path.sep}`)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(target);
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': CONTENT_TYPES[path.extname(target)] || 'text/html; charset=utf-8',
      });
      response.end(body);
    } catch {
      response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': CONTENT_TYPES['.html'] });
      response.end('<!doctype html><title>Destino gobernado</title>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function mount(page, input) {
  const mounted = await page.evaluate(value => window.MuniTaskCenter.mount(value), input);
  assert.equal(mounted, true);
  await page.waitForFunction(() => document.querySelector('[data-municipal-task-finder]')?.dataset.municipalTaskMounted === 'true');
}

test('task center projects seven roles, isolates A to B and searches without requests', async t => {
  const requests = [];
  const server = await createServer(requests);
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${baseUrl}/harness`);

  for (const role of Object.keys(accessPolicy.ROLE_CAPABILITIES)) {
    const input = inputFor(role);
    const expected = resolveMunicipalTaskCatalog(input).recommendedTaskIds;
    await mount(page, input);
    assert.deepEqual(
      await page.locator('#taskHarness [data-task-id]').evaluateAll(nodes => nodes.map(node => node.dataset.taskId)),
      expected,
      role,
    );
    const leaked = await page.locator('#taskHarness [data-capability]').evaluateAll((nodes, capabilities) =>
      nodes.map(node => node.dataset.capability).filter(capability => !capabilities.includes(capability)), input.capabilities);
    assert.deepEqual(leaked, [], role);
  }

  await mount(page, inputFor('INTENDENTE'));
  assert.equal(await page.locator('[data-task-id="review-priorities"]').count(), 1);
  await mount(page, inputFor('TENANT_USER'));
  assert.deepEqual(
    await page.locator('#taskHarness [data-task-id]').evaluateAll(nodes => nodes.map(node => node.dataset.taskId)),
    ['locate-territory', 'understand-role'],
  );
  assert.equal(await page.locator('[data-task-id="review-priorities"]').count(), 0);

  await mount(page, inputFor('INTENDENTE'));
  await page.waitForTimeout(50);
  const beforeSearch = requests.length;
  const search = page.locator('#taskHarnessSearch');
  await search.fill('  PERSÓNAL ');
  await page.waitForFunction(() => document.querySelector('#taskHarness')?.dataset.resultCount !== '0');
  assert.equal(requests.length, beforeSearch);
  assert.equal(await page.locator('[data-task-id="review-grh-summary"]').count(), 1);
  await search.fill('no existe esta tarea');
  assert.equal(await page.locator('#taskHarness [data-task-id]').count(), 0);
  assert.equal(await page.locator('#taskHarness .municipal-task-finder__empty').isVisible(), true);
});

test('Ctrl or Command K is keyboard-complete, modal-safe and restores focus', async t => {
  const requests = [];
  const server = await createServer(requests);
  const address = server.address();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://127.0.0.1:${address.port}/harness`);
  await mount(page, inputFor('INTENDENTE'));
  const trigger = page.locator('#taskHarness [data-municipal-task-open]');
  await trigger.focus();
  await page.keyboard.press('Control+K');
  const dialog = page.locator('#municipalTaskPalette');
  await assert.doesNotReject(() => dialog.waitFor({ state: 'visible' }));
  const combobox = page.locator('#municipalTaskPalette .municipal-task-palette__search');
  assert.equal(await combobox.getAttribute('role'), 'combobox');
  assert.equal(await combobox.getAttribute('aria-haspopup'), 'listbox');
  assert.equal(await combobox.getAttribute('aria-controls'), 'municipalTaskPaletteResults');
  assert.equal(await combobox.getAttribute('aria-expanded'), 'true');
  const shortcutFontSizes = await page.locator('.municipal-task-shortcut kbd, .municipal-task-palette kbd')
    .evaluateAll(nodes => nodes.map(node => Number.parseFloat(getComputedStyle(node).fontSize)));
  assert.ok(shortcutFontSizes.length > 0);
  assert.ok(shortcutFontSizes.every(fontSize => fontSize >= 12));
  assert.equal(await page.locator('#municipalTaskPaletteResults [aria-selected="true"]').count(), 1);
  const first = await page.locator('#municipalTaskPaletteResults [aria-selected="true"]').getAttribute('data-task-index');
  await page.keyboard.press('ArrowDown');
  const second = await page.locator('#municipalTaskPaletteResults [aria-selected="true"]').getAttribute('data-task-index');
  assert.notEqual(second, first);
  assert.equal(await combobox.evaluate(node => node === document.activeElement), true);
  const activeDescendant = await combobox.getAttribute('aria-activedescendant');
  assert.ok(activeDescendant);
  assert.equal(await page.locator(`#${activeDescendant}`).getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.querySelector('#municipalTaskPalette').contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#municipalTaskPalette')?.open);
  assert.equal(await combobox.getAttribute('aria-expanded'), 'false');
  assert.equal(await combobox.getAttribute('aria-activedescendant'), null);
  assert.equal(await trigger.evaluate(node => node === document.activeElement), true);

  await page.evaluate(() => {
    const guide = document.createElement('aside');
    guide.id = 'muniGuideDialog';
    guide.setAttribute('aria-modal', 'true');
    guide.textContent = 'MuniGuía abierta';
    document.body.appendChild(guide);
    window.MuniGuia = Object.freeze({
      closeForNavigation() {
        guide.hidden = true;
      },
    });
  });
  await page.keyboard.press('Control+K');
  assert.equal(await page.locator('#muniGuideDialog').isHidden(), true);
  assert.equal(await dialog.evaluate(node => node.open), true);
  await page.keyboard.press('Escape');

  await page.evaluate(() => {
    const blocking = document.createElement('dialog');
    blocking.id = 'blockingDialog';
    blocking.setAttribute('aria-modal', 'true');
    blocking.textContent = 'Otra tarea abierta';
    document.body.appendChild(blocking);
    blocking.showModal();
  });
  await page.keyboard.press('Control+K');
  assert.equal(await dialog.evaluate(node => node.open), false);
  await page.evaluate(() => document.querySelector('#blockingDialog').close());

  await trigger.focus();
  await page.keyboard.press('Meta+K');
  assert.equal(await dialog.evaluate(node => node.open), true);
  const synchronousClose = await page.evaluate(() => {
    window.MuniTaskCenter.close();
    const palette = document.querySelector('#municipalTaskPalette');
    const input = palette.querySelector('.municipal-task-palette__search');
    return {
      open: palette.open,
      expanded: input.getAttribute('aria-expanded'),
      activeDescendant: input.getAttribute('aria-activedescendant'),
      rootOpenClass: document.documentElement.classList.contains('municipal-task-palette-open'),
    };
  });
  assert.deepEqual(synchronousClose, {
    open: false,
    expanded: 'false',
    activeDescendant: null,
    rootOpenClass: false,
  });
  await page.waitForFunction(() => document.querySelector('#taskHarness [data-municipal-task-open]') === document.activeElement);

  await trigger.focus();
  await page.keyboard.press('Control+K');
  assert.equal(
    await page.locator('#municipalTaskPaletteResults [aria-selected="true"]')
      .evaluate(node => new URL(node.href).pathname),
    '/jardines.html',
  );
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/jardines\.html$/);
});

test('mobile finder and command palette fit 390px with touch-sized controls', async t => {
  const requests = [];
  const server = await createServer(requests);
  const address = server.address();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${address.port}/harness`);
  await mount(page, inputFor('CONTADOR'));
  const finderMetrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    inputHeight: document.querySelector('#taskHarnessSearch').getBoundingClientRect().height,
    triggerHeight: document.querySelector('#taskHarness [data-municipal-task-open]').getBoundingClientRect().height,
    cardWidths: Array.from(document.querySelectorAll('.municipal-task-card')).map(node => node.getBoundingClientRect().width),
  }));
  assert.ok(finderMetrics.scrollWidth <= finderMetrics.innerWidth);
  assert.ok(finderMetrics.inputHeight >= 44);
  assert.ok(finderMetrics.triggerHeight >= 44);
  assert.ok(finderMetrics.cardWidths.every(width => width <= 360));
  await page.locator('#taskHarness [data-municipal-task-open]').click();
  const paletteMetrics = await page.evaluate(() => {
    const dialog = document.querySelector('#municipalTaskPalette');
    const rect = dialog.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width, viewport: window.innerWidth };
  });
  assert.ok(paletteMetrics.left >= 0);
  assert.ok(paletteMetrics.right <= paletteMetrics.viewport);
  assert.ok(paletteMetrics.width <= 374);
});
