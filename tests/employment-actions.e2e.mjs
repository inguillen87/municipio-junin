import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

import accessPolicy from '../shared/access-policy.cjs';
import {
  GRH_EMPLOYMENT_ACTIONS_SCHEMA_VERSION,
  inspectGrhEmploymentActionsContract,
} from '../api/lib/grh-employment-actions-contract.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND_CONFIG = path.join(REPO, 'frontend', 'vite.config.ts');
const AUTH_CONTRACT = 'municontrol-auth-me-v1';
const CONTRACT_HEADER = 'X-MuniControl-Contract';
const ARTIFACT = JSON.parse(readFileSync(
  path.join(REPO, 'api', '_data', 'grh-employment-actions.json'),
  'utf8',
));
const PWA_SOURCE = readFileSync(path.join(REPO, 'js', 'pwa-register.js'), 'utf8');
const NAVIGATION_SOURCE = readFileSync(path.join(REPO, 'js', 'navigation-catalog.js'), 'utf8');
const EMPLOYMENT_ACTIONS_CLIENT_SOURCE = readFileSync(
  path.join(REPO, 'js', 'grh-employment-actions-data.js'),
  'utf8',
);
const MANIFEST_SOURCE = readFileSync(path.join(REPO, 'manifest.json'), 'utf8');
const AUTH_CLIENT_SOURCE = `
  (() => {
    window.MuniAuth = Object.freeze({
      async fetch(input, init) {
        const url = new URL(input instanceof Request ? input.url : input, window.location.href);
        if (url.origin !== window.location.origin) throw new Error('UNSAFE_ORIGIN');
        return window.fetch(url, init);
      },
      getToken() { return null; },
      isAuthError() { return false; }
    });
    window.MuniAuthReady = Promise.resolve(true);
  })();
`;
const MUNIGUIA_STUB_SOURCE = `
  export async function mountMuniGuia(input) {
    window.__employmentActionsMuniGuia = input;
    return true;
  }
  export function unmountMuniGuia() {}
`;

let scenarioSequence = 0;

assert.deepEqual(inspectGrhEmploymentActionsContract(ARTIFACT), {
  ok: true,
  errors: Object.freeze([]),
});
assert.equal(ARTIFACT.comparison.current.actionEvents, 3_882);
assert.equal(ARTIFACT.comparison.current.distinctPersons, 714);
assert.equal(ARTIFACT.comparison.prior.actionEvents, 3_226);
assert.equal(ARTIFACT.comparison.prior.distinctPersons, 631);

function authorizedSession(includeCapability = true) {
  const base = {
    id: 'employment-actions-intendente-e2e',
    name: 'Intendencia QA',
    role: 'INTENDENTE',
    tenantId: 'tenant-junin-e2e',
  };
  const access = accessPolicy.getSessionAccessForUser(base);
  assert.ok(access, 'INTENDENTE must have an authoritative access projection');
  const capabilities = access.capabilities.filter(capability =>
    includeCapability || capability !== 'navigation.employment-actions'
  );
  return {
    user: {
      ...base,
      capabilities,
      accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
      homeProfile: {
        ...access.homeProfile,
        priorityCapabilities: [...access.homeProfile.priorityCapabilities],
      },
      tenant: { id: base.tenantId, shortName: 'Junín QA' },
    },
  };
}

function send(response, status, contentType, body = '', headers = {}) {
  response.statusCode = status;
  response.setHeader('Content-Type', contentType);
  response.setHeader('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(body);
}

function scenarioPlugin(scenario, apiLog) {
  let actionRequestCount = 0;
  return {
    name: `employment-actions-e2e-${scenario.name}`,
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url || '/', 'http://127.0.0.1');
        if (url.pathname === '/trayectoria') {
          request.url = '/trayectoria.html';
          next();
          return;
        }
        if (url.pathname === '/js/auth-fetch.js') {
          send(response, 200, 'text/javascript; charset=utf-8', AUTH_CLIENT_SOURCE);
          return;
        }
        if (url.pathname === '/js/pwa-register.js') {
          send(response, 200, 'text/javascript; charset=utf-8', PWA_SOURCE);
          return;
        }
        if (url.pathname === '/js/navigation-catalog.js') {
          send(response, 200, 'text/javascript; charset=utf-8', NAVIGATION_SOURCE);
          return;
        }
        if (url.pathname === '/js/grh-employment-actions-data.js') {
          send(response, 200, 'text/javascript; charset=utf-8', EMPLOYMENT_ACTIONS_CLIENT_SOURCE);
          return;
        }
        if (url.pathname === '/js/contextual-help.js') {
          send(response, 200, 'text/javascript; charset=utf-8', MUNIGUIA_STUB_SOURCE);
          return;
        }
        if (url.pathname === '/manifest.json') {
          send(response, 200, 'application/manifest+json; charset=utf-8', MANIFEST_SOURCE);
          return;
        }
        if (url.pathname === '/inicio.html') {
          send(
            response,
            200,
            'text/html; charset=utf-8',
            '<!doctype html><html lang="es"><title>Inicio seguro</title><body><main id="safe-workspace">Inicio seguro</main></body></html>',
          );
          return;
        }
        if (url.pathname === '/api/auth/me') {
          apiLog.push({ method: request.method, path: url.pathname, status: 200 });
          send(
            response,
            200,
            'application/json; charset=utf-8',
            JSON.stringify(scenario.authPayload ?? authorizedSession(scenario.includeCapability !== false)),
            { [CONTRACT_HEADER]: AUTH_CONTRACT },
          );
          return;
        }
        if (url.pathname === '/api/grh-employment-actions') {
          const statuses = scenario.actionStatuses ?? [200];
          const status = statuses[Math.min(actionRequestCount, statuses.length - 1)];
          actionRequestCount += 1;
          apiLog.push({ method: request.method, path: url.pathname, status });
          if (status !== 200) {
            send(
              response,
              status,
              'application/json; charset=utf-8',
              JSON.stringify({ code: status === 403 ? 'FORBIDDEN' : 'GRH_EMPLOYMENT_ACTIONS_UNAVAILABLE' }),
              { [CONTRACT_HEADER]: GRH_EMPLOYMENT_ACTIONS_SCHEMA_VERSION },
            );
            return;
          }
          send(
            response,
            200,
            'application/json; charset=utf-8',
            JSON.stringify(ARTIFACT),
            { [CONTRACT_HEADER]: GRH_EMPLOYMENT_ACTIONS_SCHEMA_VERSION },
          );
          return;
        }
        next();
      });
    },
  };
}

async function withScenario(scenario, callback) {
  const apiLog = [];
  scenarioSequence += 1;
  const server = await createViteServer({
    configFile: FRONTEND_CONFIG,
    cacheDir: path.join(
      tmpdir(),
      `municontrol-employment-actions-vite-${process.pid}-${scenarioSequence}`,
    ),
    logLevel: 'error',
    plugins: [scenarioPlugin(scenario, apiLog)],
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await callback({ apiLog, baseUrl });
  } finally {
    await server.close();
  }
}

function monitorPage(page, baseUrl) {
  const consoleErrors = [];
  const pageErrors = [];
  const externalRequests = [];
  const origin = new URL(baseUrl).origin;
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    const requestUrl = request.url();
    if (/^(?:data|blob):/u.test(requestUrl)) return;
    if (new URL(requestUrl).origin !== origin) externalRequests.push(requestUrl);
  });
  return { consoleErrors, pageErrors, externalRequests };
}

async function newPage(browser, baseUrl, {
  width = 1_440,
  height = 1_000,
  theme = 'dark',
  forcedColors = 'none',
} = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: theme,
    forcedColors,
    reducedMotion: width <= 800 ? 'reduce' : 'no-preference',
  });
  await context.addInitScript(selectedTheme => {
    localStorage.setItem('municontrol-color-theme:v1', selectedTheme);
    localStorage.setItem('govtech_theme', selectedTheme);
    window.__pwaRegistrations = [];
    window.__pwaUpdates = 0;
    const serviceWorkerMock = {
      controller: null,
      async register(url, options) {
        window.__pwaRegistrations.push({ url, options });
        return {
          waiting: null,
          installing: null,
          addEventListener() {},
          async update() { window.__pwaUpdates += 1; },
        };
      },
    };
    Object.defineProperty(Navigator.prototype, 'serviceWorker', {
      configurable: true,
      get: () => serviceWorkerMock,
    });
  }, theme);
  const page = await context.newPage();
  return { context, page, diagnostics: monitorPage(page, baseUrl) };
}

function ignorableHttpErrors(errors, status) {
  return errors.filter(message =>
    !message.includes(`Failed to load resource: the server responded with a status of ${status}`)
  );
}

async function waitForReady(page) {
  await page.locator('#employmentActionsSummary').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('.actions-category').length === 14);
}

async function responsiveAudit(page) {
  return page.evaluate(() => {
    const visibleTargets = [...document.querySelectorAll([
      '.actions-hero nav a',
      '.actions-more > summary',
      '.actions-technical > summary',
      '.global-menu-trigger',
      '.theme-toggle',
    ].join(','))].filter(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
        style.visibility !== 'hidden';
    });
    const columns = selector => getComputedStyle(document.querySelector(selector))
      .gridTemplateColumns.split(' ').filter(Boolean).length;
    return {
      theme: document.documentElement.dataset.theme,
      forcedColors: matchMedia('(forced-colors: active)').matches,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      heroColumns: columns('.actions-hero'),
      periodColumns: columns('.actions-period-grid'),
      categoryColumns: columns('.actions-category-grid'),
      targets: visibleTargets.map(element => ({
        height: element.getBoundingClientRect().height,
        label: element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName,
        width: element.getBoundingClientRect().width,
      })),
      bars: [...document.querySelectorAll('.actions-category:not(.actions-category--protected) .actions-category__bar')]
        .map(bar => ({
          ariaLabel: bar.getAttribute('aria-label'),
          kind: bar.querySelector('span')?.textContent?.trim(),
          value: bar.querySelector('b')?.textContent?.trim(),
          width: Number.parseFloat(bar.querySelector('i')?.style.width || '0'),
        })),
    };
  });
}

test('Actuaciones laborales S18 renders the exact GRH evidence, responsive PWA navigation and fail-closed states', {
  timeout: 300_000,
}, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  await t.test('renders the real aggregate and protected categories at 1440, 800, 390 and forced-color 320', async () => {
    await withScenario({ name: 'responsive-real-artifact' }, async ({ apiLog, baseUrl }) => {
      const scenarios = [
        { name: 'desktop-dark', width: 1_440, height: 1_000, theme: 'dark', hero: 2, periods: 3, categories: 2 },
        { name: 'tablet-light', width: 800, height: 900, theme: 'light', hero: 1, periods: 2, categories: 2 },
        { name: 'mobile-dark', width: 390, height: 844, theme: 'dark', hero: 1, periods: 1, categories: 1 },
        { name: 'compact-light-forced', width: 320, height: 720, theme: 'light', forcedColors: 'active', hero: 1, periods: 1, categories: 1 },
      ];

      for (const scenario of scenarios) {
        const requestStart = apiLog.length;
        const { context, page, diagnostics } = await newPage(browser, baseUrl, scenario);
        try {
          await page.goto(`${baseUrl}/trayectoria`, { waitUntil: 'domcontentloaded' });
          await waitForReady(page);

          assert.equal(new URL(page.url()).pathname, '/trayectoria', scenario.name);
          assert.equal(await page.locator('.actions-period--current h2').textContent(), '3.882 actuaciones');
          assert.equal(await page.locator('.actions-period--current strong').textContent(), '714 personas');
          assert.equal(await page.locator('.actions-period--prior h2').textContent(), '3.226 actuaciones');
          assert.equal(await page.locator('.actions-period--prior strong').textContent(), '631 personas');
          assert.equal(await page.locator('.actions-period--delta h2').textContent(), '+656 actuaciones');
          assert.equal(await page.locator('.actions-period--delta strong').textContent(), '+83 personas');
          assert.match(await page.locator('#employmentActionsPeriods').textContent(), /972 días/u);

          assert.equal(await page.locator('.actions-category:not(.actions-category--protected)').count(), 13);
          assert.equal(await page.locator('.actions-category__bar').count(), 26);
          const category = page.locator('.actions-category', { hasText: 'Categoría laboral' });
          assert.match(await category.textContent(), /Actual622Anterior502/u);
          assert.match(await category.textContent(), /\+120/u);
          const workplace = page.locator('.actions-category', { hasText: 'Lugar de trabajo' });
          assert.match(await workplace.textContent(), /Actual365Anterior148/u);
          assert.match(await workplace.textContent(), /\+217/u);
          const structure = page.locator('.actions-category', { hasText: 'Estructura de cargos' });
          assert.match(await structure.textContent(), /Actual347Anterior417/u);
          assert.match(await structure.textContent(), /(?:−|-)70/u);

          const protectedCategory = page.locator('.actions-category--protected');
          const protectedText = await protectedCategory.textContent();
          assert.equal(await protectedCategory.locator('.actions-category__bar').count(), 0);
          assert.match(protectedText, /Otras actuaciones protegidas/u);
          assert.match(protectedText, /Grupo pequeño/u);
          assert.doesNotMatch(protectedText, /\b135\b|\b101\b|\b179\b|(?:−|-)44|(?:−|-)34/u);
          assert.doesNotMatch(protectedText, /0 actuaciones|0 personas|Actual\s*0|Anterior\s*0/u);

          assert.equal(await page.locator('.actions-evidence article').count(), 3);
          assert.match(await page.locator('.actions-evidence').textContent(), /9\.478/u);
          assert.match(await page.locator('.actions-evidence').textContent(), /100,0%/u);
          assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'), '/manifest.json');
          await page.waitForFunction(() => window.__pwaRegistrations?.length === 1);
          assert.deepEqual(await page.evaluate(() => window.__pwaRegistrations), [{
            url: '/sw.js',
            options: { scope: '/', updateViaCache: 'none' },
          }]);
          assert.equal(
            await page.locator('.topbar__nav a[aria-current="page"]').getAttribute('href'),
            '/trayectoria',
          );
          assert.equal(
            await page.locator('.topbar__nav a[aria-current="page"]').textContent(),
            'Trayectoria',
          );

          const audit = await responsiveAudit(page);
          assert.equal(audit.theme, scenario.theme, scenario.name);
          assert.equal(audit.forcedColors, scenario.forcedColors === 'active', scenario.name);
          assert.ok(audit.overflow <= 1, `${scenario.name}: horizontal overflow=${audit.overflow}`);
          assert.equal(audit.heroColumns, scenario.hero, `${scenario.name}: hero columns`);
          assert.equal(audit.periodColumns, scenario.periods, `${scenario.name}: period columns`);
          assert.equal(audit.categoryColumns, scenario.categories, `${scenario.name}: category columns`);
          assert.equal(audit.targets.length, 6, `${scenario.name}: core actionable targets`);
          for (const target of audit.targets) {
            assert.ok(target.width >= 44, `${scenario.name}: ${target.label} width=${target.width}`);
            assert.ok(target.height >= 44, `${scenario.name}: ${target.label} height=${target.height}`);
          }
          assert.equal(audit.bars.length, 26, `${scenario.name}: released comparison bars`);
          for (const bar of audit.bars) {
            assert.match(bar.ariaLabel || '', /actuaciones en el período (?:actual|anterior)$/u);
            assert.ok(bar.kind === 'Actual' || bar.kind === 'Anterior');
            assert.match(bar.value || '', /^\d{1,3}(?:\.\d{3})*$/u);
            assert.ok(bar.width >= 3 && bar.width <= 100, `${scenario.name}: bar width=${bar.width}`);
          }

          if (scenario.forcedColors === 'active') {
            await page.locator('.global-menu-trigger').click();
            const dialog = page.locator('#muni-global-navigation-dialog');
            await dialog.waitFor({ state: 'visible' });
            const activeRoute = dialog.locator('[data-nav-id="trayectoria"]');
            assert.equal(await activeRoute.getAttribute('aria-current'), 'page');
            assert.equal(await activeRoute.getAttribute('href'), '/trayectoria');
            const menuTargets = await dialog.locator([
              '.global-navigation__close',
              '.global-navigation__group-toggle',
              '.global-navigation__link',
            ].join(',')).evaluateAll(elements => elements.filter(element =>
              element.getClientRects().length > 0
            ).map(element => ({
              height: element.getBoundingClientRect().height,
              width: element.getBoundingClientRect().width,
            })));
            assert.ok(menuTargets.length > 0);
            assert.equal(menuTargets.every(target => target.width >= 44 && target.height >= 44), true);
            await page.keyboard.press('Escape');
          }

          assert.deepEqual(
            apiLog.slice(requestStart).map(entry => [entry.method, entry.path, entry.status]),
            [
              ['GET', '/api/auth/me', 200],
              ['GET', '/api/grh-employment-actions', 200],
            ],
            scenario.name,
          );
          assert.deepEqual(diagnostics.consoleErrors, [], scenario.name);
          assert.deepEqual(diagnostics.pageErrors, [], scenario.name);
          assert.deepEqual(diagnostics.externalRequests, [], scenario.name);
        } finally {
          await context.close();
        }
      }
    });
  });

  await t.test('isolates a 503, publishes no replacement numbers and recovers only after retry', async () => {
    await withScenario({ name: 'retry-503', actionStatuses: [503, 200] }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newPage(browser, baseUrl, {
        width: 390,
        height: 844,
        theme: 'light',
      });
      try {
        await page.goto(`${baseUrl}/trayectoria`, { waitUntil: 'domcontentloaded' });
        const blocked = page.locator('.actions-state--blocked');
        await blocked.waitFor({ state: 'visible' });
        assert.match(await blocked.textContent(), /No pudimos verificar las actuaciones/u);
        assert.equal(await page.locator('.actions-category').count(), 0);
        assert.doesNotMatch(await page.locator('#contenido-principal').textContent(), /3\.882|3\.226|714|631/u);
        assert.deepEqual(apiLog.map(entry => entry.status), [200, 503]);

        await page.getByRole('button', { name: 'Reintentar' }).click();
        await waitForReady(page);
        assert.equal(await page.locator('.actions-period--current h2').textContent(), '3.882 actuaciones');
        assert.deepEqual(
          apiLog.map(entry => [entry.path, entry.status]),
          [
            ['/api/auth/me', 200],
            ['/api/grh-employment-actions', 503],
            ['/api/auth/me', 200],
            ['/api/grh-employment-actions', 200],
          ],
        );
        assert.deepEqual(ignorableHttpErrors(diagnostics.consoleErrors, 503), []);
        assert.deepEqual(diagnostics.pageErrors, []);
        assert.deepEqual(diagnostics.externalRequests, []);
      } finally {
        await context.close();
      }
    });
  });

  await t.test('keeps a 403 blocked and redirects an invalid session before requesting data', async () => {
    await withScenario({ name: 'forbidden-actions', actionStatuses: [403] }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newPage(browser, baseUrl, {
        width: 390,
        height: 844,
      });
      try {
        await page.goto(`${baseUrl}/trayectoria`, { waitUntil: 'domcontentloaded' });
        await page.locator('.actions-state--blocked').waitFor({ state: 'visible' });
        assert.equal(new URL(page.url()).pathname, '/trayectoria');
        assert.equal(await page.locator('.actions-category').count(), 0);
        assert.doesNotMatch(await page.locator('#contenido-principal').textContent(), /3\.882|3\.226|714|631/u);
        assert.deepEqual(apiLog.map(entry => [entry.path, entry.status]), [
          ['/api/auth/me', 200],
          ['/api/grh-employment-actions', 403],
        ]);
        assert.deepEqual(ignorableHttpErrors(diagnostics.consoleErrors, 403), []);
        assert.deepEqual(diagnostics.pageErrors, []);
        assert.deepEqual(diagnostics.externalRequests, []);
      } finally {
        await context.close();
      }
    });

    await withScenario({ name: 'invalid-session', includeCapability: false }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newPage(browser, baseUrl, {
        width: 390,
        height: 844,
      });
      try {
        await page.goto(`${baseUrl}/trayectoria`, { waitUntil: 'domcontentloaded' });
        await page.waitForURL(`${baseUrl}/inicio.html`);
        assert.equal(await page.locator('#safe-workspace').textContent(), 'Inicio seguro');
        assert.deepEqual(apiLog.map(entry => entry.path), ['/api/auth/me']);
        assert.match(
          await page.evaluate(() => sessionStorage.getItem('mjunin_access_notice') || ''),
          /no tiene habilitada la superficie/u,
        );
        assert.deepEqual(diagnostics.consoleErrors, []);
        assert.deepEqual(diagnostics.pageErrors, []);
        assert.deepEqual(diagnostics.externalRequests, []);
      } finally {
        await context.close();
      }
    });
  });

  await t.test('keeps the clean Production route declared in Vercel', () => {
    const vercel = JSON.parse(readFileSync(path.join(REPO, 'vercel.json'), 'utf8'));
    assert.deepEqual(
      vercel.rewrites.filter(rewrite => rewrite.source === '/trayectoria'),
      [{ source: '/trayectoria', destination: '/trayectoria.html' }],
    );
  });
});
