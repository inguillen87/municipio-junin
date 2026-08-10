import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import accessPolicy from '../shared/access-policy.cjs';

const { ACCESS_POLICY_VERSION, getCapabilitiesForRole, getSessionAccessForUser } = accessPolicy;

const root = path.resolve(import.meta.dirname, '..');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const pages = [
  'inicio.html',
  'configuracion.html',
  'manuales.html',
  'inteligencia.html',
  'exportar.html',
  'auditoria.html',
  'mapa.html',
];
const privateNavCatalog = [
  ['inicio.html', 'navigation.workspace'],
  ['dashboard.html', 'navigation.dashboard'],
  ['reportes.html', 'navigation.reports'],
  ['hacienda.html', 'navigation.hacienda'],
  ['grh-ejecutivo.html', 'navigation.grh-executive'],
  ['control.html', 'navigation.data-quality'],
  ['rrhh.html', 'navigation.rrhh'],
  ['ia.html', 'navigation.ai-assistant'],
  ['auditoria.html', 'navigation.audit'],
  ['exportar.html', 'navigation.export'],
  ['importar.html', 'navigation.import'],
];
const publicNavHrefs = ['cuentas-claras.html', 'ciudadano.html'];
const manualNav = ['manuales.html', 'navigation.help'];
const retiredNavHrefs = [
  'analytics.html',
  'inteligencia.html',
  'presupuesto.html',
  'licitaciones.html',
  'obras.html',
  'mapa.html',
  'vecinos.html',
  'forms.html',
  'whatsapp.html',
  'admin.html',
  'configuracion.html',
];
const bottomCatalog = [
  ['inicio.html', 'navigation.workspace'],
  ['dashboard.html', 'navigation.dashboard'],
  ['reportes.html', 'navigation.reports'],
  ['hacienda.html', 'navigation.hacienda'],
  ['grh-ejecutivo.html', 'navigation.grh-executive'],
  ['control.html', 'navigation.data-quality'],
  ['rrhh.html', 'navigation.rrhh'],
  ['ia.html', 'navigation.ai-assistant'],
  ['auditoria.html', 'navigation.audit'],
  ['exportar.html', 'navigation.export'],
  ['importar.html', 'navigation.import'],
  ['manuales.html', 'navigation.help'],
];

function expectedSidebarHrefs(role) {
  const capabilities = new Set(getCapabilitiesForRole(role));
  return [
    ...privateNavCatalog.filter(([, capability]) => capabilities.has(capability)).map(([href]) => href),
    ...publicNavHrefs,
    ...(capabilities.has(manualNav[1]) ? [manualNav[0]] : []),
  ];
}

function expectedBottomHrefs(role) {
  const access = getSessionAccessForUser({ role, tenantId: 'tenant-junin-test' });
  if (!access) return ['#more'];
  const byCapability = new Map(bottomCatalog.map(([href, capability]) => [capability, href]));
  const quick = access.homeProfile.priorityCapabilities
    .filter(capability => access.capabilities.includes(capability) && byCapability.has(capability))
    .map(capability => byCapability.get(capability));
  return [...quick.slice(0, 4), '#more'];
}

function fakeToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'navigation-layout-qa',
    role: 'TENANT_ADMIN',
    tenantId: 'tenant-junin-test',
    exp: Math.floor(Date.now() / 1000) + 600,
  })}.qa`;
}

async function createServer(options = {}) {
  const authRole = options.authRole || 'TENANT_ADMIN';
  const authTenantId = Object.prototype.hasOwnProperty.call(options, 'authTenantId')
    ? options.authTenantId
    : 'tenant-junin-test';
  const defaultAccess = getSessionAccessForUser({ role: authRole, tenantId: authTenantId });
  const hasCapabilities = Object.prototype.hasOwnProperty.call(options, 'authCapabilities');
  const authCapabilities = hasCapabilities
    ? options.authCapabilities
    : defaultAccess?.capabilities;
  const hasPolicyVersion = Object.prototype.hasOwnProperty.call(options, 'authPolicyVersion');
  const authPolicyVersion = hasPolicyVersion
    ? options.authPolicyVersion
    : ACCESS_POLICY_VERSION;
  const hasHomeProfile = Object.prototype.hasOwnProperty.call(options, 'authHomeProfile');
  const authHomeProfile = hasHomeProfile ? options.authHomeProfile : defaultAccess?.homeProfile;
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/api/auth/me') {
      response.writeHead(200, { 'Content-Type': contentTypes['.json'], 'Cache-Control': 'no-store' });
      const user = {
        id: 'navigation-layout-qa',
        name: 'QA Institucional',
        role: authRole,
        tenantId: authTenantId,
      };
      if (authCapabilities !== undefined) user.capabilities = authCapabilities;
      if (authPolicyVersion !== undefined) user.accessPolicyVersion = authPolicyVersion;
      if (authHomeProfile !== undefined) user.homeProfile = authHomeProfile;
      response.end(JSON.stringify({ user }));
      return;
    }
    if (url.pathname === '/api/audit') {
      const action = url.searchParams.get('action');
      const payload = action === 'overview'
        ? { totalDatasets: 0, totalRows: 0, lastUpload: null, activeModules: [] }
        : { data: [] };
      response.writeHead(200, { 'Content-Type': contentTypes['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(payload));
      return;
    }

    const relative = decodeURIComponent(
      url.pathname === '/dashboard' ? 'dashboard.html' : (url.pathname.slice(1) || 'manuales.html'),
    );
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

async function newPage(browser, viewport, options = {}) {
  const context = await browser.newContext({
    viewport,
    ...(options.colorScheme ? { colorScheme: options.colorScheme } : {}),
    ...(options.reducedMotion ? { reducedMotion: options.reducedMotion } : {}),
    ...(options.forcedColors ? { forcedColors: options.forcedColors } : {}),
  });
  await context.addInitScript(({ token, theme }) => {
    if (sessionStorage.getItem('__muni_navigation_seeded') === 'true') return;
    sessionStorage.setItem('__muni_navigation_seeded', 'true');
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify({
      id: 'navigation-layout-qa',
      name: 'QA Institucional',
      role: 'TENANT_ADMIN',
      tenantId: 'tenant-junin-test',
    }));
    localStorage.removeItem('muni_sidebar_collapsed');
    if (theme) localStorage.setItem('govtech_theme', theme);
  }, { token: fakeToken(), theme: options.theme || null });
  const page = await context.newPage();
  await page.route('https://**/*', route => route.fulfill({ status: 204, body: '' }));
  return { context, page };
}

async function readGeometry(page) {
  return page.evaluate(() => {
    const sidebar = document.querySelector('#sidebar, #sidebar-container');
    const main = document.querySelector('#mainContent, #retired-module-root') || document.querySelector('main');
    const menu = document.querySelector('#menuBtn');
    const sidebarRect = sidebar?.getBoundingClientRect();
    const mainRect = main?.getBoundingClientRect();
    const menuRect = menu?.getBoundingClientRect();
    const mainStyle = main ? getComputedStyle(main) : null;
    return {
      sidebarClass: sidebar?.classList.contains('sidebar') || false,
      sidebarPosition: sidebar ? getComputedStyle(sidebar).position : '',
      sidebarLeft: sidebarRect?.left ?? null,
      sidebarWidth: sidebarRect?.width ?? null,
      mainLeft: mainRect?.left ?? null,
      mainRight: mainRect?.right ?? null,
      mainWidth: mainRect?.width ?? null,
      mainComputedWidth: mainStyle?.width ?? null,
      mainMaxWidth: mainStyle?.maxWidth ?? null,
      mainDisplay: mainStyle?.display ?? null,
      mainTransform: mainStyle?.transform ?? null,
      mainInlineStyle: main?.getAttribute('style') || '',
      menuVisible: Boolean(menuRect && menuRect.width > 0 && menuRect.height > 0),
      menuExpanded: menu?.getAttribute('aria-expanded'),
      navItems: sidebar?.querySelectorAll('a.sb-item').length || 0,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      h1Count: document.querySelectorAll('h1').length,
    };
  });
}

function parseRgb(color) {
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  assert.equal(channels?.length, 3, `expected an RGB color, received ${color}`);
  return channels;
}

function relativeLuminance(color) {
  const channels = parseRgb(color).map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test('enterprise navigation has one fixed desktop rail and no double content offset', async t => {
  const server = await createServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  for (const file of pages) {
    const { context, page } = await newPage(browser, { width: 1440, height: 940 });
    const consoleErrors = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto(`${baseUrl}/${file}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.MuniAuthReady);
    await page.waitForSelector('.sidebar .sb-item');
    assert.equal(
      await page.getByRole('navigation', { name: 'Navegación principal' }).count(),
      1,
      `${file} must expose one named navigation landmark`,
    );
    const currentLinks = page.locator('.sb-nav a[aria-current="page"]');
    if (expectedSidebarHrefs('TENANT_ADMIN').includes(file)) {
      assert.equal(await currentLinks.count(), 1, `${file} must expose one current page`);
      assert.equal(await currentLinks.first().getAttribute('href'), file);
    }
    const geometry = await readGeometry(page);

    assert.equal(geometry.sidebarClass, true, `${file} must normalize its sidebar class`);
    assert.equal(geometry.sidebarPosition, 'fixed', `${file} sidebar must be fixed`);
    assert.ok(Math.abs(geometry.sidebarLeft) <= 1, `${file} sidebar left=${geometry.sidebarLeft}`);
    assert.ok(Math.abs(geometry.sidebarWidth - 260) <= 1, `${file} sidebar width=${geometry.sidebarWidth}`);
    assert.ok(geometry.navItems > 0, `${file} must render authorized navigation items`);
    assert.ok(geometry.mainLeft >= 250 && geometry.mainLeft <= 280, `${file} main left=${geometry.mainLeft}`);
    assert.ok(geometry.mainRight <= 1441, `${file} main right=${geometry.mainRight}`);
    assert.ok(geometry.mainWidth >= 300, `${file} main width=${geometry.mainWidth}`);
    assert.ok(geometry.overflow <= 1, `${file} desktop overflow=${geometry.overflow}`);
    assert.ok(geometry.h1Count >= 1, `${file} must expose a primary heading`);
    assert.deepEqual(consoleErrors, [], `${file} console errors`);
    await page.locator('.sidebar a[href="manuales.html"]').waitFor({ state: 'visible' });
    await context.close();
  }
});

test('enterprise navigation becomes an accessible mobile drawer without shrinking content', async t => {
  const server = await createServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  for (const file of pages) {
    const { context, page } = await newPage(browser, { width: 390, height: 844 });
    await page.goto(`${baseUrl}/${file}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.MuniAuthReady);
    await page.waitForSelector('.sidebar .sb-item');
    await page.waitForSelector('.bottom-nav');
    const closed = await readGeometry(page);

    assert.equal(closed.sidebarClass, true, `${file} must normalize its sidebar class`);
    assert.ok(closed.sidebarLeft <= -250, `${file} closed drawer left=${closed.sidebarLeft}`);
    assert.ok(Math.abs(closed.mainLeft) <= 1, `${file} mobile main left=${closed.mainLeft}`);
    assert.ok(closed.mainRight <= 391, `${file} mobile main right=${closed.mainRight}`);
    assert.ok(closed.mainWidth >= 360, `${file} mobile geometry=${JSON.stringify(closed)}`);
    assert.equal(closed.menuVisible, true, `${file} must expose the menu button`);
    assert.equal(closed.menuExpanded, 'false');
    assert.ok(closed.navItems > 0, `${file} must retain authorized navigation items`);
    assert.ok(closed.overflow <= 1, `${file} mobile overflow=${closed.overflow}`);

    await page.locator('#menuBtn').click();
    await page.waitForSelector('.sidebar.mobile-open');
    await page.waitForFunction(() => {
      const sidebar = document.querySelector('.sidebar.mobile-open');
      return sidebar && Math.abs(sidebar.getBoundingClientRect().left) <= 1;
    });
    const opened = await readGeometry(page);
    assert.ok(Math.abs(opened.sidebarLeft) <= 1, `${file} opened drawer geometry=${JSON.stringify(opened)}`);
    assert.equal(opened.menuExpanded, 'true');

    const moreButton = page.locator('.bottom-nav [href="#more"]');
    if (await moreButton.count()) {
      await page.locator('#sidebarCollapseBtn').click();
      await page.waitForFunction(() => {
        const sidebar = document.querySelector('.sidebar');
        return sidebar && !sidebar.classList.contains('mobile-open') && sidebar.getBoundingClientRect().left <= -250;
      });
      await moreButton.click();
      await page.waitForFunction(() => {
        const sidebar = document.querySelector('.sidebar.mobile-open');
        return sidebar && Math.abs(sidebar.getBoundingClientRect().left) <= 1;
      });
      assert.equal(await page.locator('#menuBtn').getAttribute('aria-expanded'), 'true');
    }
    await context.close();
  }
});

test('mobile drawer traps keyboard focus and restores the page on every close path', async t => {
  const server = await createServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const { context, page } = await newPage(browser, { width: 390, height: 844 });
  t.after(async () => context.close());
  await page.goto(`${baseUrl}/inicio.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.MuniAuthReady);
  await page.waitForSelector('.sidebar .sb-item');

  const menuButton = page.locator('#menuBtn');
  await menuButton.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.sidebar.mobile-open');

  assert.equal(await page.evaluate(() => document.activeElement?.id), 'sidebarCollapseBtn');
  assert.equal(await page.locator('#sidebarCollapseBtn').getAttribute('aria-label'), 'Cerrar navegación principal');
  assert.equal(await menuButton.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('.sidebar').getAttribute('aria-hidden'), null);
  assert.equal(await page.locator('.sidebar').evaluate(element => element.inert), false);

  const isolatedBackgrounds = await page.evaluate(() =>
    [...document.querySelectorAll('#mainContent, #retired-module-root, .main-content, main, [role="main"], .bottom-nav')]
      .filter((element, index, all) => all.indexOf(element) === index)
      .filter(element => !element.closest('.sidebar'))
      .map(element => ({
        inert: element.inert || element.hasAttribute('inert'),
        ariaHidden: element.getAttribute('aria-hidden'),
      })),
  );
  assert.ok(isolatedBackgrounds.length > 0, 'the page must expose a background region');
  assert.ok(
    isolatedBackgrounds.some(state => state.inert || state.ariaHidden === 'true'),
    `the background must be isolated while open: ${JSON.stringify(isolatedBackgrounds)}`,
  );
  const exposedBackgroundControls = await page.evaluate(() => {
    const sidebar = document.querySelector('[data-muni-shell="primary-nav"]');
    return [...document.querySelectorAll([
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(','))]
      .filter(element => !sidebar?.contains(element) && element.id !== 'menuBtn')
      .filter(element => !element.closest('[inert]') && !element.closest('[aria-hidden="true"]'))
      .filter(element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })
      .map(element => element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName);
  });
  assert.deepEqual(
    exposedBackgroundControls,
    [],
    `the modal drawer must isolate every background control: ${JSON.stringify(exposedBackgroundControls)}`,
  );
  assert.equal(
    await page.locator('.ws-skip').evaluate(element => Boolean(element.closest('[inert], [aria-hidden="true"]'))),
    true,
    'the top-level skip link must leave the accessibility tree while the drawer is open',
  );

  await page.keyboard.press('Shift+Tab');
  assert.equal(
    await page.evaluate(() => document.activeElement?.classList.contains('sb-logout-btn')),
    true,
    'Shift+Tab from the first control must wrap to the last drawer control',
  );
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'sidebarCollapseBtn');

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.sidebar')?.classList.contains('mobile-open'));
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'menuBtn');
  assert.equal(await menuButton.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('.sidebar').getAttribute('aria-hidden'), 'true');
  assert.equal(await page.locator('.sidebar').evaluate(element => element.inert), true);
  assert.equal(
    await page.evaluate(() =>
      [...document.querySelectorAll('#mainContent, #retired-module-root, .main-content, main, [role="main"], .bottom-nav')]
        .filter(element => !element.closest('.sidebar'))
        .every(element => !element.inert && !element.hasAttribute('inert') && element.getAttribute('aria-hidden') !== 'true'),
    ),
    true,
    'Escape must clean background isolation',
  );
  assert.equal(
    await page.locator('.ws-skip').evaluate(element => Boolean(element.closest('[inert], [aria-hidden="true"]'))),
    false,
    'Escape must restore the top-level skip link',
  );

  await page.keyboard.press('Enter');
  await page.waitForSelector('.sidebar.mobile-open');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'sidebarCollapseBtn');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('.sidebar')?.classList.contains('mobile-open'));
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'menuBtn');
  assert.equal(await menuButton.getAttribute('aria-expanded'), 'false');
});

test('administration mobile shell renders its rail and Más opens the governed drawer', async t => {
  const server = await createServer({ authRole: 'SUPER_ADMIN', authTenantId: null });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const { context, page } = await newPage(browser, { width: 390, height: 844 });
  t.after(async () => context.close());
  await page.goto(`${baseUrl}/admin.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.MuniAuthReady);
  await page.waitForSelector('[data-muni-shell="primary-nav"] .sb-item');
  await page.waitForSelector('[data-muni-shell="bottom-nav"] [href="#more"]');
  assert.equal(await page.locator('[data-muni-shell="primary-nav"]').count(), 1);
  assert.equal(await page.locator('nav[aria-label="Navegación principal"]').count(), 1);
  await page.locator('[data-muni-shell="bottom-nav"] [href="#more"]').click();
  await page.waitForSelector('[data-muni-shell="primary-nav"].mobile-open');
  assert.equal(await page.locator('#menuBtn').getAttribute('aria-expanded'), 'true');
});

test('public 404 never mounts an authenticated bottom bar or inert Más control', async t => {
  const server = await createServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const { context, page } = await newPage(browser, { width: 390, height: 844 });
  t.after(async () => context.close());
  await page.goto(`${baseUrl}/404.html`, { waitUntil: 'load' });
  assert.equal(await page.locator('[data-muni-shell="primary-nav"], .bottom-nav, #menuBtn').count(), 0);
  const dashboardHref = await page.getByRole('link', { name: /Ir al Dashboard/i }).getAttribute('href');
  assert.equal(dashboardHref, '/dashboard');
  assert.equal(new URL(dashboardHref, `${baseUrl}/foo/bar`).pathname, '/dashboard');
  assert.equal(new URL(await page.locator('link[rel="stylesheet"]').getAttribute('href'), `${baseUrl}/foo/bar`).pathname, '/css/dashboard.css');
  assert.equal(new URL(await page.locator('link[rel="icon"]').getAttribute('href'), `${baseUrl}/foo/bar`).pathname, '/favicon.jpg');
  assert.equal(new URL(await page.locator('script[src]').getAttribute('src'), `${baseUrl}/foo/bar`).pathname, '/js/theme-switcher.js');
});

test('clean dashboard URL keeps the physical bottom-nav link active', async t => {
  const server = await createServer({ authRole: 'INTENDENTE' });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const { context, page } = await newPage(browser, { width: 390, height: 844 });
  t.after(async () => context.close());
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.MuniAuthReady);
  const dashboardItem = page.locator('.bottom-nav a[href="dashboard.html"]');
  await dashboardItem.waitFor();
  assert.equal(await dashboardItem.getAttribute('aria-current'), 'page');
  assert.equal(await dashboardItem.evaluate(element => element.classList.contains('active')), true);
});

test('institutional shell is local, AA-readable and motion-safe at focal viewports', async t => {
  const server = await createServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const scenarios = [
    { name: 'desktop-dark', viewport: { width: 1440, height: 940 }, theme: 'dark' },
    { name: 'tablet-light', viewport: { width: 1024, height: 768 }, theme: 'light' },
    {
      name: 'mobile-reduced',
      viewport: { width: 390, height: 844 },
      theme: 'dark',
      reducedMotion: 'reduce',
    },
  ];

  for (const scenario of scenarios) {
    const { context, page } = await newPage(browser, scenario.viewport, {
      theme: scenario.theme,
      colorScheme: scenario.theme,
      reducedMotion: scenario.reducedMotion,
    });
    const externalRequests = [];
    page.on('request', request => {
      if (new URL(request.url()).origin !== new URL(baseUrl).origin) externalRequests.push(request.url());
    });
    await page.goto(`${baseUrl}/inicio.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.MuniAuthReady);
    await page.waitForSelector('[data-muni-shell="primary-nav"] .sb-item');
    await page.waitForFunction(() => (
      getComputedStyle(document.documentElement).getPropertyValue('--muni-shell-rail-width').trim() === '260px'
    ));

    const state = await page.evaluate(() => {
      const visibleTargets = [...document.querySelectorAll([
        '[data-muni-shell="primary-nav"] .sb-collapse-btn',
        '[data-muni-shell="primary-nav"] .sb-logout-btn',
        '[data-muni-shell="primary-nav"] .sb-item',
        '[data-muni-shell="bottom-nav"] .bottom-nav-item',
        '[data-muni-shell-control="menu"]',
        '.theme-toggle-btn',
      ].join(','))].filter(element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });
      const durationInSeconds = value => Math.max(...value.split(',').map(part => {
        const duration = Number.parseFloat(part) || 0;
        return part.trim().endsWith('ms') ? duration / 1000 : duration;
      }));
      const sidebar = document.querySelector('[data-muni-shell="primary-nav"]');
      const sectionLabel = sidebar.querySelector('.sb-section-label');
      const bottomNav = document.querySelector('[data-muni-shell="bottom-nav"]');
      const bottomItem = bottomNav?.querySelector('.bottom-nav-item');
      return {
        shellClass: document.documentElement.classList.contains('muni-shell-v1'),
        theme: document.documentElement.getAttribute('data-theme'),
        stylesheetCount: document.querySelectorAll(
          'link[href$="css/dashboard.css"],link[href$="css/institutional-shell.css"]',
        ).length,
        stylesheetHref: document.querySelector(
          'link[href$="css/dashboard.css"],link[href$="css/institutional-shell.css"]',
        )?.href || '',
        runtimeSidebarStyle: Boolean(document.getElementById('sidebarNavCSS')),
        brandImageCount: sidebar.querySelectorAll('.sb-logo img').length,
        brandMark: sidebar.querySelector('.sb-brand-mark')?.textContent?.trim() || '',
        wordmark: sidebar.querySelector('.sb-logo-name')?.textContent?.trim() || '',
        sidebarSvgCount: sidebar.querySelectorAll('.sb-item-icon svg').length,
        sidebarItemCount: sidebar.querySelectorAll('.sb-item-icon').length,
        bottomSvgCount: bottomNav?.querySelectorAll('.nav-icon svg').length || 0,
        bottomItemCount: bottomNav?.querySelectorAll('.nav-icon').length || 0,
        targetSizes: visibleTargets.map(element => ({
          label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 30) || element.className,
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height,
        })),
        maxTransitionSeconds: Math.max(
          durationInSeconds(getComputedStyle(sidebar).transitionDuration),
          ...visibleTargets.map(element => durationInSeconds(getComputedStyle(element).transitionDuration)),
        ),
        sidebarColors: {
          foreground: getComputedStyle(sectionLabel).color,
          background: getComputedStyle(sidebar).backgroundColor,
        },
        bottomColors: bottomItem ? {
          foreground: getComputedStyle(bottomItem).color,
          background: getComputedStyle(bottomNav).backgroundColor,
        } : null,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    assert.equal(state.shellClass, true, `${scenario.name}: shell namespace`);
    assert.equal(state.theme, scenario.theme, `${scenario.name}: theme`);
    assert.equal(state.stylesheetCount, 1, `${scenario.name}: one shell stylesheet`);
    assert.match(
      state.stylesheetHref,
      /\/css\/(?:dashboard|institutional-shell)\.css$/,
      `${scenario.name}: local stylesheet owner`,
    );
    assert.equal(state.runtimeSidebarStyle, false, `${scenario.name}: runtime sidebar CSS removed`);
    assert.equal(state.brandImageCount, 0, `${scenario.name}: no provisional image crest`);
    assert.equal(state.brandMark, 'MC', `${scenario.name}: typographic brand mark`);
    assert.equal(state.wordmark, 'MuniControl', `${scenario.name}: institutional wordmark`);
    assert.equal(state.sidebarSvgCount, state.sidebarItemCount, `${scenario.name}: desktop SVG catalog`);
    assert.equal(state.bottomSvgCount, state.bottomItemCount, `${scenario.name}: mobile SVG catalog`);
    assert.ok(state.targetSizes.length > 0, `${scenario.name}: measurable controls`);
    for (const target of state.targetSizes) {
      assert.ok(target.width >= 44, `${scenario.name}: ${target.label} width=${target.width}`);
      assert.ok(target.height >= 44, `${scenario.name}: ${target.label} height=${target.height}`);
    }
    assert.ok(
      contrastRatio(state.sidebarColors.foreground, state.sidebarColors.background) >= 4.5,
      `${scenario.name}: sidebar muted text contrast ${JSON.stringify(state.sidebarColors)}`,
    );
    if (state.bottomColors) {
      assert.ok(
        contrastRatio(state.bottomColors.foreground, state.bottomColors.background) >= 4.5,
        `${scenario.name}: bottom navigation contrast ${JSON.stringify(state.bottomColors)}`,
      );
    }
    if (scenario.reducedMotion === 'reduce') {
      assert.ok(state.maxTransitionSeconds <= 0.000001, `${scenario.name}: transition=${state.maxTransitionSeconds}s`);
    }
    assert.ok(state.overflow <= 1, `${scenario.name}: overflow=${state.overflow}`);
    assert.deepEqual(externalRequests, [], `${scenario.name}: external requests`);
    await context.close();
  }

  const { context, page } = await newPage(browser, { width: 1024, height: 768 }, {
    theme: 'light',
    colorScheme: 'light',
    forcedColors: 'active',
  });
  await page.goto(`${baseUrl}/manuales.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.MuniAuthReady);
  const firstLink = page.locator('[data-muni-shell="primary-nav"] .sb-item').first();
  await firstLink.focus();
  const forcedFocus = await firstLink.evaluate(element => ({
    matches: element.matches(':focus-visible'),
    outlineStyle: getComputedStyle(element).outlineStyle,
    outlineWidth: Number.parseFloat(getComputedStyle(element).outlineWidth),
  }));
  assert.equal(forcedFocus.matches, true, 'forced colors must retain keyboard focus visibility');
  assert.notEqual(forcedFocus.outlineStyle, 'none', 'forced colors focus outline must remain visible');
  assert.ok(forcedFocus.outlineWidth >= 2, `forced colors outline=${forcedFocus.outlineWidth}px`);
  await context.close();
});

test('desktop and mobile navigation project the exact role matrix without duplicates', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  for (const role of ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR', 'TENANT_USER', 'INSPECTOR', 'DEMO']) {
    const server = await createServer({ authRole: role });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      for (const viewport of [{ width: 1440, height: 940 }, { width: 390, height: 844 }]) {
        const { context, page } = await newPage(browser, viewport);
        await page.goto(`${baseUrl}/manuales.html`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => window.MuniAuthReady);
        await page.waitForSelector('.sidebar .sb-item');

        const sidebarItems = await page.locator('.sidebar a.sb-item').evaluateAll(links =>
          links.map(link => ({
            href: link.getAttribute('href'),
            label: link.querySelector('.sb-item-label')?.textContent?.trim() || '',
          })),
        );
        const sidebarHrefs = sidebarItems.map(item => item.href);
        const sidebarLabels = sidebarItems.map(item => item.label);

        assert.deepEqual(sidebarHrefs, expectedSidebarHrefs(role), `${role}:${viewport.width}:sidebar`);
        assert.equal(new Set(sidebarHrefs).size, sidebarHrefs.length, `${role}: duplicate sidebar href`);
        assert.equal(new Set(sidebarLabels).size, sidebarLabels.length, `${role}: duplicate sidebar label`);
        for (const retiredHref of retiredNavHrefs) {
          assert.equal(sidebarHrefs.includes(retiredHref), false, `${role} exposes ${retiredHref}`);
        }

        if (viewport.width <= 900) {
          await page.waitForSelector('.bottom-nav');
          const bottomItems = await page.locator('.bottom-nav a').evaluateAll(links =>
            links.map(link => ({
              href: link.getAttribute('href'),
              label: link.getAttribute('aria-label') || '',
            })),
          );
          const bottomHrefs = bottomItems.map(item => item.href);
          const bottomLabels = bottomItems.map(item => item.label);
          assert.deepEqual(bottomHrefs, expectedBottomHrefs(role), `${role}:mobile:bottom`);
          assert.equal(new Set(bottomHrefs).size, bottomHrefs.length, `${role}: duplicate bottom href`);
          assert.equal(new Set(bottomLabels).size, bottomLabels.length, `${role}: duplicate bottom label`);
          for (const retiredHref of retiredNavHrefs) {
            assert.equal(bottomHrefs.includes(retiredHref), false, `${role} bottom exposes ${retiredHref}`);
          }
        } else {
          assert.equal(await page.locator('.bottom-nav').count(), 0, `${role}: desktop bottom nav must stay absent`);
        }

        await context.close();
      }
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }
});

test('private navigation fails closed when server capabilities are absent, malformed or unknown', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  for (const scenario of [
    { name: 'missing', authRole: 'TENANT_ADMIN', authCapabilities: undefined },
    {
      name: 'missing-version',
      authRole: 'TENANT_ADMIN',
      authCapabilities: getCapabilitiesForRole('TENANT_ADMIN'),
      authPolicyVersion: undefined,
    },
    { name: 'malformed', authRole: 'TENANT_ADMIN', authCapabilities: 'navigation.dashboard' },
    {
      name: 'malformed-profile',
      authRole: 'TENANT_ADMIN',
      authHomeProfile: { variant: 'municipal-operations', defaultPath: 'https://example.test' },
    },
    { name: 'unknown-role', authRole: 'TESORERIA', authCapabilities: getCapabilitiesForRole('TESORERIA') },
  ]) {
    const server = await createServer(scenario);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const { context, page } = await newPage(browser, { width: 390, height: 844 });
      await page.goto(`${baseUrl}/manuales.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(/\/login\.html\?reason=session_invalid$/);
      const state = await page.evaluate(() => ({
        pending: document.documentElement.classList.contains('muni-auth-pending'),
        pendingStyle: Boolean(document.getElementById('muniAuthPendingStyle')),
        token: sessionStorage.getItem('mjunin_token'),
        user: sessionStorage.getItem('mjunin_user'),
      }));
      assert.deepEqual(state, {
        pending: false,
        pendingStyle: false,
        token: null,
        user: null,
      }, `${scenario.name} must clear the malformed session projection`);
      await context.close();
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }
});

test('legacy role checks return denied users to the safe workspace instead of the GRH panel', async t => {
  const server = await createServer({ authRole: 'CONTADOR' });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const { context, page } = await newPage(browser, { width: 390, height: 844 });
  t.after(async () => context.close());
  await page.goto(`${baseUrl}/manuales.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.MuniAuthReady);
  assert.equal(await page.evaluate(() => window.requireRole(['SUPER_ADMIN'])), false);
  await page.waitForURL(`${baseUrl}/inicio.html`);
  await page.waitForSelector('#workspaceViews:not([hidden])');
  assert.match(await page.textContent('#accessNotice'), /no tiene habilitada/i);
  assert.equal(await page.locator('#loadStatus, #executiveDashboard').count(), 0, 'safe workspace must not mount GRH');
});
