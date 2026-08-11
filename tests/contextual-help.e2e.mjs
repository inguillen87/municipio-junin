import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import accessPolicy from '../shared/access-policy.cjs';
import { MUNIGUIA_CATALOG } from '../js/contextual-help-catalog.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function colorChannels(value) {
  const match = String(value).match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/);
  return match ? match.slice(1, 4).map(Number) : null;
}

function relativeLuminance(value) {
  const channels = colorChannels(value);
  if (!channels) return null;
  const linear = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  if (first === null || second === null) return 0;
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function fakeToken(subject) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: subject,
    exp: Math.floor(Date.now() / 1000) + 900,
  })}.qa`;
}

function tokenSubject(request) {
  const value = String(request.headers.authorization || '');
  try {
    return JSON.parse(Buffer.from(value.slice(7).split('.')[1], 'base64url').toString('utf8')).sub;
  } catch {
    return null;
  }
}

function authoritativeUser(subject, role, tenantId = 'tenant-junin-guide') {
  const access = accessPolicy.getSessionAccessForUser({ role, tenantId });
  return {
    id: subject,
    name: `Perfil ${role}`,
    email: `${role.toLowerCase()}@internal.invalid`,
    role,
    tenantId,
    tenant: tenantId ? { name: 'Municipalidad de Junín', shortName: 'Junín' } : null,
    capabilities: access.capabilities,
    accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
    homeProfile: access.homeProfile,
  };
}

async function createServer(users, requestLog) {
  let failNextGuideStylesheet = false;
  const cleanPages = new Map([
    ['/inicio', 'inicio.html'],
    ['/dashboard', 'dashboard.html'],
    ['/reportes', 'reportes.html'],
    ['/hacienda', 'hacienda.html'],
    ['/ejecutivo', 'grh-ejecutivo.html'],
    ['/grh-ejecutivo', 'grh-ejecutivo.html'],
    ['/estructura', 'inicio.html'],
    ['/territorio', 'inicio.html'],
    ['/calidad', 'control.html'],
    ['/control', 'control.html'],
    ['/rrhh', 'rrhh.html'],
    ['/ia', 'ia.html'],
    ['/auditoria', 'auditoria.html'],
    ['/exportar', 'exportar.html'],
    ['/importar', 'importar.html'],
    ['/manuales', 'manuales.html'],
    ['/roles', 'roles.html'],
  ]);
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.searchParams.get('fail_guide_css_once') === '1') failNextGuideStylesheet = true;
    requestLog.push({ method: request.method, path: url.pathname, query: url.search });
    if (url.pathname === '/api/auth/me') {
      const user = users.get(tokenSubject(request));
      if (!user) {
        response.writeHead(401, { 'Cache-Control': 'no-store', 'Content-Type': CONTENT_TYPES['.json'] });
        response.end(JSON.stringify({ error: 'not authorized' }));
        return;
      }
      response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': CONTENT_TYPES['.json'] });
      response.end(JSON.stringify({ user }));
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      response.writeHead(418, { 'Cache-Control': 'no-store', 'Content-Type': CONTENT_TYPES['.json'] });
      response.end(JSON.stringify({ error: 'MuniGuía must not call private APIs' }));
      return;
    }

    const referer = String(request.headers.referer || '');
    if (url.pathname === '/css/contextual-help.css' && failNextGuideStylesheet) {
      failNextGuideStylesheet = false;
      response.writeHead(503, {
        'Cache-Control': 'no-store',
        'Content-Type': CONTENT_TYPES['.html'],
        'X-Content-Type-Options': 'nosniff',
      });
      response.end('<!doctype html><title>intentional stylesheet failure</title>');
      return;
    }
    if (url.pathname === '/css/contextual-help.css' && referer.includes('delay_guide_css=1')) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    let relative;
    if (url.searchParams.get('guide_fixture') === 'workspace') {
      relative = 'inicio.html';
    } else {
      relative = cleanPages.get(url.pathname) || decodeURIComponent(url.pathname.slice(1) || 'inicio.html');
    }
    const target = path.resolve(ROOT, relative);
    if (!target.startsWith(`${ROOT}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      let body = await readFile(target);
      if (url.pathname === '/territorio') {
        body = Buffer.from(body.toString('utf8').replace('</main>', [
          '<section id="territoryMap" aria-label="Mapa territorial"></section>',
          '<section id="territoryLocalities" aria-label="Localidades oficiales"></section>',
          '<section id="territorySources" aria-label="Fuentes territoriales"></section>',
          '</main>',
        ].join('')));
      }
      if (url.pathname === '/estructura') {
        body = Buffer.from(body.toString('utf8').replace('</main>', [
          '<section id="organizationSnapshotStatus" aria-label="Estado del snapshot"></section>',
          '<section id="organizationExplorer" aria-label="Explorador de dotación"></section>',
          '<section id="absenceRiskPanel" aria-label="Historial de ausencias"></section>',
          '</main>',
        ].join('')));
      }
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': CONTENT_TYPES[path.extname(target)] || 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404, { 'Cache-Control': 'no-store' }).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function authenticatedPage(browser, baseUrl, subject, role, options = {}) {
  const access = accessPolicy.getSessionAccessForUser({ role, tenantId: options.tenantId ?? 'tenant-junin-guide' });
  const context = await browser.newContext({
    forcedColors: options.forcedColors || 'none',
    reducedMotion: options.reducedMotion || 'reduce',
    viewport: options.viewport || { width: 1440, height: 900 },
  });
  await context.addInitScript(({ token, roleValue, accessValue, policyVersion }) => {
    if (/\/login(?:\.html)?$/.test(window.location.pathname)) return;
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify({
      id: 'stale-guide-user',
      name: '<img src=x onerror=alert(1)>',
      email: 'stale-secret@invalid.example',
      role: roleValue,
      tenantId: 'stale-tenant',
      capabilities: accessValue.capabilities,
      accessPolicyVersion: policyVersion,
      homeProfile: accessValue.homeProfile,
    }));
    localStorage.removeItem('muni_sidebar_collapsed');
    const storagePrototype = Object.getPrototypeOf(sessionStorage);
    const storageAccessLog = [];
    Object.defineProperty(window, '__muniStorageAccessLog', {
      configurable: false,
      value: storageAccessLog,
      writable: false,
    });
    ['getItem', 'setItem', 'removeItem'].forEach((method) => {
      const original = storagePrototype[method];
      Object.defineProperty(storagePrototype, method, {
        configurable: true,
        writable: true,
        value(key, ...args) {
          storageAccessLog.push({ method, key: String(key), stack: new Error().stack || '' });
          return original.call(this, key, ...args);
        },
      });
    });
  }, {
    token: fakeToken(subject),
    roleValue: role,
    accessValue: access,
    policyVersion: accessPolicy.ACCESS_POLICY_VERSION,
  });
  const page = await context.newPage();
  return { context, page };
}

test('MuniGuía projects the seven authoritative role contexts at 390 and 1440 without extra data requests', async (t) => {
  const users = new Map();
  for (const role of Object.values(accessPolicy.ROLES)) users.set(`guide-${role}`, authoritativeUser(`guide-${role}`, role));
  const requestLog = [];
  const server = await createServer(users, requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  });

  for (const role of Object.values(accessPolicy.ROLES)) {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      const { context, page } = await authenticatedPage(browser, baseUrl, `guide-${role}`, role, { viewport });
      const external = [];
      const consoleErrors = [];
      page.on('request', (request) => {
        if (!request.url().startsWith(baseUrl)) external.push(request.url());
      });
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      await page.goto(`${baseUrl}/inicio.html`, { waitUntil: 'networkidle' });
      await page.locator('#muniGuideTrigger').waitFor({ state: 'visible' });
      const before = requestLog.length;
      const storageBefore = await page.evaluate(() => ({
        accessCount: window.__muniStorageAccessLog.length,
        guideReads: window.__muniStorageAccessLog.filter((entry) =>
          entry.method === 'getItem' && /getValidatedSession|ensureMuniGuia/.test(entry.stack)
        ),
        local: Object.keys(localStorage).sort(),
        session: Object.keys(sessionStorage).sort(),
      }));
      assert.deepEqual(storageBefore.guideReads, [], `${role}:${viewport.width}:guide storage read`);
      await page.locator('#muniGuideTrigger').click();
      await page.locator('#muniGuideDialog.is-open').waitFor();
      const state = await page.evaluate(() => ({
        contract: document.querySelector('#muniGuideDialog')?.dataset.contract,
        externalTriggerVisible: !document.querySelector('[data-muniguia-open]')?.hidden,
        label: document.querySelector('.muni-guide-eyebrow')?.textContent,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        progress: document.querySelector('.muni-guide-progress')?.textContent,
        privateText: document.querySelector('#muniGuideDialog')?.textContent.includes('stale-secret@invalid.example'),
        triggerSize: (() => {
          const rect = document.querySelector('#muniGuideTrigger').getBoundingClientRect();
          return { height: rect.height, width: rect.width };
        })(),
      }));
      assert.equal(state.contract, 'muniguia-contextual-v1');
      assert.match(state.label, new RegExp(MUNIGUIA_CATALOG.roles[role].label, 'i'));
      assert.equal(state.progress, 'Paso 1 de 3');
      assert.equal(state.privateText, false);
      assert.equal(state.externalTriggerVisible, true);
      assert.ok(state.triggerSize.height >= 44 && state.triggerSize.width >= 44);
      assert.ok(state.overflow <= 1, `${role}:${viewport.width}:overflow=${state.overflow}`);
      if (process.env.MUNIGUIA_VISUAL_DIR && role === 'INTENDENTE') {
        await mkdir(process.env.MUNIGUIA_VISUAL_DIR, { recursive: true });
        await page.screenshot({
          path: path.join(process.env.MUNIGUIA_VISUAL_DIR, `muniguia-${viewport.width}.png`),
          fullPage: false,
        });
      }
      await page.locator('.muni-guide-close').click();
      await page.locator('#muniGuideDialog').waitFor({ state: 'hidden' });
      const storageAfter = await page.evaluate(() => ({
        accessCount: window.__muniStorageAccessLog.length,
        local: Object.keys(localStorage).sort(),
        session: Object.keys(sessionStorage).sort(),
      }));
      assert.equal(storageAfter.accessCount, storageBefore.accessCount);
      assert.deepEqual(storageAfter.local, storageBefore.local);
      assert.deepEqual(storageAfter.session, storageBefore.session);
      assert.equal(requestLog.length, before, `${role}:${viewport.width}:interaction network delta`);
      assert.deepEqual(external, []);
      assert.deepEqual(consoleErrors, []);
      await context.close();
    }
  }
  assert.equal(requestLog.some((entry) => /^\/api\/(?!auth\/me)/.test(entry.path)), false);
});

test('all fourteen exact clean paths mount their capability-bound guide and unknown or public paths stay empty', async (t) => {
  const subject = 'guide-super';
  const users = new Map([[subject, authoritativeUser(subject, 'SUPER_ADMIN')]]);
  const requestLog = [];
  const server = await createServer(users, requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  });

  const { context, page } = await authenticatedPage(browser, baseUrl, subject, 'SUPER_ADMIN');
  for (const pageDefinition of Object.values(MUNIGUIA_CATALOG.pages)) {
    const cleanPath = pageDefinition.aliases[0];
    await page.goto(`${baseUrl}${cleanPath}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#muniGuideTrigger').waitFor({ state: 'visible' });
    assert.match(await page.locator('#muniGuideTrigger').getAttribute('aria-label'), new RegExp(pageDefinition.label, 'i'));
    for (const step of pageDefinition.steps) {
      assert.equal(await page.locator(step.selector).count(), 1, `${pageDefinition.id}:${step.selector}`);
    }
  }

  const assetsBeforeUnknown = requestLog.filter((entry) => /contextual-help/.test(entry.path)).length;
  await page.goto(`${baseUrl}/unknown?guide_fixture=workspace`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('#muniGuideTrigger').count(), 0);
  assert.equal(requestLog.filter((entry) => /contextual-help/.test(entry.path)).length, assetsBeforeUnknown);
  await page.goto(`${baseUrl}/roles`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('#muniGuideTrigger').count(), 0);
  assert.equal(await page.locator('script[src*="contextual-help"],link[href*="contextual-help"]').count(), 0);
  await context.close();
});

test('dialog is keyboard-safe, mutually exclusive with mobile navigation and restores focus and background state', async (t) => {
  const subject = 'guide-intendente';
  const users = new Map([[subject, authoritativeUser(subject, 'INTENDENTE')]]);
  const requestLog = [];
  const server = await createServer(users, requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  });

  const { context, page } = await authenticatedPage(browser, baseUrl, subject, 'INTENDENTE', {
    reducedMotion: 'reduce',
    viewport: { width: 390, height: 844 },
  });
  await page.goto(`${baseUrl}/inicio.html`, { waitUntil: 'networkidle' });
  await page.locator('#muniGuideTrigger').waitFor({ state: 'visible' });
  const before = requestLog.length;

  await page.locator('#menuBtn').click();
  await page.locator('.sidebar.mobile-open').waitFor();
  await page.evaluate(() => window.MuniGuia.open());
  await page.locator('#muniGuideDialog.is-open').waitFor();
  assert.equal(await page.locator('.sidebar.mobile-open').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('muni-guide-close')), true);
  assert.equal(await page.locator('#muniGuideDialog').getAttribute('aria-modal'), 'true');
  assert.equal(await page.locator('#mainContent').evaluate((element) => element.inert), true);
  const targetSizes = await page.locator('#muniGuideDialog a, #muniGuideDialog button:not([hidden])').evaluateAll((elements) =>
    elements.filter((element) => getComputedStyle(element).display !== 'none').map((element) => {
      const rect = element.getBoundingClientRect();
      return { height: rect.height, width: rect.width };
    })
  );
  assert.ok(targetSizes.every((size) => size.height >= 44 && size.width >= 44), JSON.stringify(targetSizes));

  await page.locator('.muni-guide-button.primary').click();
  assert.equal(await page.locator('.muni-guide-progress').textContent(), 'Paso 2 de 3');
  await page.locator('.muni-guide-button.primary').click();
  assert.equal(await page.locator('.muni-guide-progress').textContent(), 'Paso 3 de 3');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.querySelector('#muniGuideDialog').contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  await page.locator('#muniGuideDialog').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'muniGuideTrigger');
  assert.equal(await page.locator('#mainContent').evaluate((element) => element.inert), false);

  await page.locator('#muniGuideTrigger').click();
  await page.locator('#muniGuideDialog.is-open').waitFor();
  await page.evaluate(() => window.openMobileSidebar());
  await page.locator('.sidebar.mobile-open').waitFor();
  const reverseExclusion = await page.evaluate(() => ({
    guideAriaHidden: document.querySelector('#muniGuideDialog').getAttribute('aria-hidden'),
    guideHidden: document.querySelector('#muniGuideDialog').hidden,
    guideRootOpen: document.documentElement.classList.contains('muni-guide-open'),
    navOpen: document.body.classList.contains('muni-drawer-open'),
    focusInNav: document.querySelector('.sidebar').contains(document.activeElement),
    triggerVisibility: getComputedStyle(document.querySelector('#muniGuideTrigger')).visibility,
  }));
  assert.deepEqual(reverseExclusion, {
    guideAriaHidden: 'true',
    guideHidden: true,
    guideRootOpen: false,
    navOpen: true,
    focusInNav: true,
    triggerVisibility: 'hidden',
  });
  await page.evaluate(() => window.closeMobileSidebar());
  assert.equal(await page.locator('#muniGuideTrigger').evaluate((element) => getComputedStyle(element).visibility), 'visible');

  const cta = page.locator('[data-muniguia-open]');
  await cta.click();
  await page.locator('#muniGuideDialog.is-open').waitFor();
  await page.locator('.muni-guide-locate').click();
  await page.locator('#muniGuideDialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#roleChip').evaluate((element) => element.classList.contains('muni-guide-target')), true);
  assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-muniguia-open]')), true);

  const durations = await page.evaluate(() => ({
    dialog: getComputedStyle(document.querySelector('#muniGuideDialog')).transitionDuration,
    overlay: getComputedStyle(document.querySelector('#muniGuideOverlay')).transitionDuration,
  }));
  assert.match(durations.dialog, /^(?:0s|1e-06s|0\.000001s|0\.001ms)$/);
  assert.match(durations.overlay, /^(?:0s|1e-06s|0\.000001s|0\.001ms)$/);
  assert.equal(requestLog.length, before);
  await context.close();
});

test('animated close keeps dialog semantics and focus valid until the surface is hidden', async (t) => {
  const subject = 'guide-animation';
  const users = new Map([[subject, authoritativeUser(subject, 'INTENDENTE')]]);
  const requestLog = [];
  const server = await createServer(users, requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  });

  const { context, page } = await authenticatedPage(browser, baseUrl, subject, 'INTENDENTE', {
    reducedMotion: 'no-preference',
    viewport: { width: 1440, height: 900 },
  });
  await page.goto(`${baseUrl}/inicio.html`, { waitUntil: 'networkidle' });
  await page.locator('#muniGuideTrigger').click();
  await page.locator('#muniGuideDialog.is-open').waitFor();
  const duringClose = await page.evaluate(() => {
    document.querySelector('.muni-guide-close').click();
    const dialog = document.querySelector('#muniGuideDialog');
    return {
      activeInside: dialog.contains(document.activeElement),
      ariaHidden: dialog.getAttribute('aria-hidden'),
      hidden: dialog.hidden,
      mainInert: document.querySelector('#mainContent').inert,
    };
  });
  assert.deepEqual(duringClose, {
    activeInside: true,
    ariaHidden: 'false',
    hidden: false,
    mainInert: true,
  });
  await page.locator('#muniGuideDialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#muniGuideDialog').getAttribute('aria-hidden'), 'true');
  assert.equal(await page.locator('#mainContent').evaluate((element) => element.inert), false);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'muniGuideTrigger');
  assert.equal(requestLog.some((entry) => /^\/api\/(?!auth\/me)/.test(entry.path)), false);
  await context.close();
});

test('runtime unmount is complete, idempotent and cancels a mount waiting for its stylesheet', async (t) => {
  const subject = 'guide-lifecycle';
  const users = new Map([[subject, authoritativeUser(subject, 'INTENDENTE')]]);
  const requestLog = [];
  const server = await createServer(users, requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  });

  const mountedPage = await authenticatedPage(browser, baseUrl, subject, 'INTENDENTE', {
    reducedMotion: 'reduce',
  });
  const lifecyclePageErrors = [];
  mountedPage.page.on('pageerror', (error) => lifecyclePageErrors.push(error.message));
  await mountedPage.page.goto(`${baseUrl}/inicio.html`, { waitUntil: 'networkidle' });
  await mountedPage.page.locator('#muniGuideTrigger').waitFor({ state: 'visible' });
  await mountedPage.page.locator('[data-muniguia-open]').click();
  await mountedPage.page.locator('.muni-guide-locate').click();
  assert.equal(
    await mountedPage.page.locator('#roleChip').evaluate((element) => element.classList.contains('muni-guide-target')),
    true,
  );
  await mountedPage.page.locator('#muniGuideTrigger').click();
  await mountedPage.page.locator('#muniGuideDialog.is-open').waitFor();

  const afterUnmount = await mountedPage.page.evaluate(async () => {
    const runtime = await import('/js/contextual-help.js');
    runtime.unmountMuniGuia();
    runtime.unmountMuniGuia();
    const external = document.querySelector('[data-muniguia-open]');
    external.click();
    return {
      bodyInert: Array.from(document.body.children).some((element) => element.inert),
      external: {
        ariaControls: external.getAttribute('aria-controls'),
        ariaExpanded: external.getAttribute('aria-expanded'),
        ariaHaspopup: external.getAttribute('aria-haspopup'),
        hidden: external.hidden,
      },
      guideNodes: document.querySelectorAll('#muniGuideTrigger, #muniGuideOverlay, #muniGuideDialog').length,
      highlighted: document.querySelector('#roleChip').classList.contains('muni-guide-target'),
      rootOpen: document.documentElement.classList.contains('muni-guide-open'),
      runtime: typeof window.MuniGuia,
    };
  });
  assert.deepEqual(afterUnmount, {
    bodyInert: false,
    external: {
      ariaControls: null,
      ariaExpanded: null,
      ariaHaspopup: null,
      hidden: true,
    },
    guideNodes: 0,
    highlighted: false,
    rootOpen: false,
    runtime: 'undefined',
  });

  const remounted = await mountedPage.page.evaluate(async (policyVersion) => {
    const runtime = await import('/js/contextual-help.js');
    const projection = window.MuniAccess.getValidatedSession();
    return runtime.mountMuniGuia({
      role: projection.user.role,
      capabilities: [...projection.capabilities],
      variant: projection.homeProfile.variant,
      policyVersion,
      pathname: window.location.pathname,
    });
  }, accessPolicy.ACCESS_POLICY_VERSION);
  assert.equal(remounted, true);
  assert.equal(await mountedPage.page.locator('#muniGuideTrigger').count(), 1);
  assert.equal(await mountedPage.page.locator('[data-muniguia-open]').getAttribute('aria-expanded'), 'false');
  const queuedOpen = await mountedPage.page.evaluate(() => {
    let nextFrameId = 10_000;
    const callbacks = new Map();
    window.requestAnimationFrame = (callback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      callbacks.set(frameId, callback);
      return frameId;
    };
    window.cancelAnimationFrame = (frameId) => callbacks.delete(frameId);
    window.__muniGuideQueuedFrames = callbacks;
    document.querySelector('#muniGuideTrigger').click();
    return {
      dialogUnhidden: !document.querySelector('#muniGuideDialog').hidden,
      pendingFrames: callbacks.size,
      rootOpen: document.documentElement.classList.contains('muni-guide-open'),
    };
  });
  assert.deepEqual(queuedOpen, { dialogUnhidden: true, pendingFrames: 1, rootOpen: true });
  const afterFrameUnmount = await mountedPage.page.evaluate(async () => {
    const runtime = await import('/js/contextual-help.js');
    runtime.unmountMuniGuia();
    return {
      guideNodes: document.querySelectorAll('#muniGuideTrigger, #muniGuideOverlay, #muniGuideDialog').length,
      pendingFrames: window.__muniGuideQueuedFrames.size,
      rootOpen: document.documentElement.classList.contains('muni-guide-open'),
    };
  });
  assert.deepEqual(afterFrameUnmount, { guideNodes: 0, pendingFrames: 0, rootOpen: false });
  assert.deepEqual(lifecyclePageErrors, []);
  await mountedPage.context.close();

  const racingPage = await authenticatedPage(browser, baseUrl, subject, 'INTENDENTE', {
    reducedMotion: 'reduce',
  });
  const stylesheetRequest = racingPage.page.waitForRequest((request) =>
    new URL(request.url()).pathname === '/css/contextual-help.css'
  );
  await Promise.all([
    racingPage.page.goto(`${baseUrl}/inicio.html?delay_guide_css=1`, { waitUntil: 'domcontentloaded' }),
    stylesheetRequest,
  ]);
  const cancelled = await racingPage.page.evaluate(async (policyVersion) => {
    const runtime = await import('/js/contextual-help.js');
    const projection = window.MuniAccess.getValidatedSession();
    const pending = runtime.mountMuniGuia({
      role: projection.user.role,
      capabilities: [...projection.capabilities],
      variant: projection.homeProfile.variant,
      policyVersion,
      pathname: window.location.pathname,
    });
    runtime.unmountMuniGuia();
    return pending;
  }, accessPolicy.ACCESS_POLICY_VERSION);
  assert.equal(cancelled, false);
  assert.deepEqual(await racingPage.page.evaluate(() => ({
    externalHidden: document.querySelector('[data-muniguia-open]').hidden,
    guideNodes: document.querySelectorAll('#muniGuideTrigger, #muniGuideOverlay, #muniGuideDialog').length,
    rootOpen: document.documentElement.classList.contains('muni-guide-open'),
    runtime: typeof window.MuniGuia,
  })), {
    externalHidden: true,
    guideNodes: 0,
    rootOpen: false,
    runtime: 'undefined',
  });

  const recovered = await racingPage.page.evaluate(async (policyVersion) => {
    const runtime = await import('/js/contextual-help.js');
    const projection = window.MuniAccess.getValidatedSession();
    return runtime.mountMuniGuia({
      role: projection.user.role,
      capabilities: [...projection.capabilities],
      variant: projection.homeProfile.variant,
      policyVersion,
      pathname: window.location.pathname,
    });
  }, accessPolicy.ACCESS_POLICY_VERSION);
  assert.equal(recovered, true);
  assert.equal(await racingPage.page.locator('#muniGuideTrigger').count(), 1);
  assert.equal(requestLog.some((entry) => /^\/api\/(?!auth\/me)/.test(entry.path)), false);
  await racingPage.context.close();
});

test('a failed guide stylesheet is discarded and one concurrent retry recovers without losing loaded CSS', async (t) => {
  const subject = 'guide-css-retry';
  const users = new Map([[subject, authoritativeUser(subject, 'INTENDENTE')]]);
  const requestLog = [];
  const server = await createServer(users, requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  });

  const { context, page } = await authenticatedPage(browser, baseUrl, subject, 'INTENDENTE', {
    reducedMotion: 'reduce',
  });
  const failedStylesheet = page.waitForRequest((request) =>
    new URL(request.url()).pathname === '/css/contextual-help.css'
  );
  await Promise.all([
    page.goto(`${baseUrl}/inicio.html?fail_guide_css_once=1`, { waitUntil: 'domcontentloaded' }),
    failedStylesheet,
  ]);
  await page.waitForTimeout(250);
  const failedLinkState = await page.evaluate(() => {
    const link = document.querySelector('link[data-muni-guide-asset="v1"],link[href$="css/contextual-help.css"]');
    return link ? {
      connected: link.isConnected,
      guideState: link.dataset.muniGuideState || null,
      sheet: Boolean(link.sheet),
    } : null;
  });
  assert.equal(failedLinkState, null);
  assert.equal(await page.locator('#muniGuideTrigger').count(), 0);

  const retried = await page.evaluate(async (policyVersion) => {
    const runtime = await import('/js/contextual-help.js');
    const projection = window.MuniAccess.getValidatedSession();
    const input = {
      role: projection.user.role,
      capabilities: [...projection.capabilities],
      variant: projection.homeProfile.variant,
      policyVersion,
      pathname: window.location.pathname,
    };
    return Promise.all([runtime.mountMuniGuia(input), runtime.mountMuniGuia(input)]);
  }, accessPolicy.ACCESS_POLICY_VERSION);
  assert.deepEqual(retried, [true, true]);
  await page.locator('#muniGuideTrigger').waitFor({ state: 'visible' });
  assert.equal(
    requestLog.filter((entry) => entry.path === '/css/contextual-help.css').length,
    2,
  );

  const retainedAndRemounted = await page.evaluate(async (policyVersion) => {
    const runtime = await import('/js/contextual-help.js');
    runtime.unmountMuniGuia();
    const retainedLink = document.querySelector('link[data-muni-guide-asset="v1"]');
    const projection = window.MuniAccess.getValidatedSession();
    const mounted = await runtime.mountMuniGuia({
      role: projection.user.role,
      capabilities: [...projection.capabilities],
      variant: projection.homeProfile.variant,
      policyVersion,
      pathname: window.location.pathname,
    });
    return {
      linkConnected: Boolean(retainedLink?.isConnected),
      linkReady: Boolean(retainedLink?.sheet),
      mounted,
    };
  }, accessPolicy.ACCESS_POLICY_VERSION);
  assert.deepEqual(retainedAndRemounted, { linkConnected: true, linkReady: true, mounted: true });
  assert.equal(
    requestLog.filter((entry) => entry.path === '/css/contextual-help.css').length,
    2,
  );
  assert.equal(await page.locator('#muniGuideTrigger').count(), 1);
  assert.equal(requestLog.some((entry) => /^\/api\/(?!auth\/me)/.test(entry.path)), false);
  await context.close();
});

test('logout invalidates the authoritative in-memory projection before asynchronous cleanup', async (t) => {
  const subject = 'guide-logout';
  const users = new Map([[subject, authoritativeUser(subject, 'INTENDENTE')]]);
  const requestLog = [];
  const server = await createServer(users, requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  });

  const { context, page } = await authenticatedPage(browser, baseUrl, subject, 'INTENDENTE');
  await page.goto(`${baseUrl}/inicio.html`, { waitUntil: 'networkidle' });
  await page.locator('#muniGuideTrigger').waitFor({ state: 'visible' });
  const state = await page.evaluate(() => {
    window.caches.keys = () => new Promise(() => {});
    window.doLogout();
    return {
      authValidated: window.__muniAuthValidated,
      projection: window.MuniAccess.getValidatedSession(),
      storedToken: sessionStorage.getItem('mjunin_token'),
      storedUser: sessionStorage.getItem('mjunin_user'),
    };
  });
  assert.deepEqual(state, {
    authValidated: false,
    projection: null,
    storedToken: null,
    storedUser: null,
  });
  await page.waitForURL(/\/login\.html$/);
  const afterNavigation = await page.evaluate(() => ({
    storedToken: sessionStorage.getItem('mjunin_token'),
    storedUser: sessionStorage.getItem('mjunin_user'),
  }));
  assert.deepEqual(afterNavigation, { storedToken: null, storedUser: null });
  assert.equal(requestLog.some((entry) => /^\/api\/(?!auth\/me)/.test(entry.path)), false);
  await context.close();
});

test('light theme contrast and forced-colors presentation keep the guide readable and operable', async (t) => {
  const subject = 'guide-visual';
  const users = new Map([[subject, authoritativeUser(subject, 'INTENDENTE')]]);
  const requestLog = [];
  const server = await createServer(users, requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  });

  const light = await authenticatedPage(browser, baseUrl, subject, 'INTENDENTE', {
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 900 },
  });
  await light.page.goto(`${baseUrl}/inicio.html`, { waitUntil: 'networkidle' });
  await light.page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await light.page.locator('#muniGuideTrigger').click();
  const lightColors = await light.page.evaluate(() => {
    const dialog = document.querySelector('#muniGuideDialog');
    const objective = document.querySelector('.muni-guide-objective');
    const intent = document.querySelector('.muni-guide-role-intent');
    return {
      dialogBackground: getComputedStyle(dialog).backgroundColor,
      intentBackground: getComputedStyle(intent).backgroundColor,
      intentColor: getComputedStyle(intent).color,
      objectiveColor: getComputedStyle(objective).color,
    };
  });
  assert.ok(contrastRatio(lightColors.objectiveColor, lightColors.dialogBackground) >= 4.5, JSON.stringify(lightColors));
  assert.ok(contrastRatio(lightColors.intentColor, lightColors.intentBackground) >= 4.5, JSON.stringify(lightColors));
  await light.context.close();

  const forced = await authenticatedPage(browser, baseUrl, subject, 'INTENDENTE', {
    forcedColors: 'active',
    reducedMotion: 'reduce',
    viewport: { width: 390, height: 844 },
  });
  await forced.page.goto(`${baseUrl}/inicio.html`, { waitUntil: 'networkidle' });
  await forced.page.locator('#muniGuideTrigger').click();
  const forcedState = await forced.page.evaluate(() => ({
    border: getComputedStyle(document.querySelector('#muniGuideDialog')).borderLeftStyle,
    dialogVisible: document.querySelector('#muniGuideDialog').getClientRects().length > 0,
    focusOutline: getComputedStyle(document.querySelector('.muni-guide-close')).outlineStyle,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  assert.equal(forcedState.dialogVisible, true);
  assert.equal(forcedState.border, 'solid');
  assert.ok(forcedState.overflow <= 1);
  await forced.page.keyboard.press('Escape');
  await forced.page.locator('#muniGuideDialog').waitFor({ state: 'hidden' });
  await forced.context.close();
});

test('tenantless SUPER_ADMIN and malformed projections fail closed without private guidance', async (t) => {
  const tenantlessSubject = 'guide-tenantless';
  const malformedSubject = 'guide-malformed';
  const tenantless = authoritativeUser(tenantlessSubject, 'SUPER_ADMIN', null);
  const malformed = {
    ...authoritativeUser(malformedSubject, 'INTENDENTE'),
    homeProfile: { variant: 'controlled-preview', defaultPath: 'inicio.html', priorityCapabilities: ['navigation.workspace'] },
  };
  const users = new Map([[tenantlessSubject, tenantless], [malformedSubject, malformed]]);
  const requestLog = [];
  const server = await createServer(users, requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  });

  const tenantlessPage = await authenticatedPage(browser, baseUrl, tenantlessSubject, 'SUPER_ADMIN', { tenantId: null });
  await tenantlessPage.page.goto(`${baseUrl}/inicio.html`, { waitUntil: 'networkidle' });
  await tenantlessPage.page.locator('#muniGuideTrigger').click();
  await tenantlessPage.page.locator('#muniGuideDialog.is-open').waitFor();
  assert.equal(await tenantlessPage.page.locator('.muni-guide-link.related').count(), 0);
  assert.equal((await tenantlessPage.page.locator('.muni-guide-links a').allTextContents()).length, 1);
  await tenantlessPage.context.close();

  const malformedPage = await authenticatedPage(browser, baseUrl, malformedSubject, 'INTENDENTE');
  await malformedPage.page.goto(`${baseUrl}/inicio.html`, { waitUntil: 'domcontentloaded' });
  await malformedPage.page.waitForURL(/login\.html\?reason=session_invalid/);
  assert.equal(await malformedPage.page.locator('#muniGuideTrigger').count(), 0);
  assert.equal(requestLog.some((entry) => /^\/api\/(?!auth\/me)/.test(entry.path)), false);
  await malformedPage.context.close();
});
