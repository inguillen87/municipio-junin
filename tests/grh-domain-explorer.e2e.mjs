import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';

import { chromium } from 'playwright';

import { buildGrhDomainCatalogProjection } from '../api/lib/grh-domain-catalog.js';
import accessPolicy from '../shared/access-policy.cjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTRACT = 'grh-domain-catalog-v1';
const TENANT_ID = 'tenant-grh-explorer-e2e';
const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
});

async function realProjection() {
  const [profile, semantic] = await Promise.all([
    readFile(new URL('../api/_data/grh-profile.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../api/_data/grh-semantic.json', import.meta.url), 'utf8').then(JSON.parse),
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

const PROJECTION = await realProjection();

function authoritativeUser() {
  const access = accessPolicy.getSessionAccessForUser({ role: 'INTENDENTE', tenantId: TENANT_ID });
  return {
    id: 'grh-explorer-e2e',
    name: 'Intendencia QA',
    email: 'grh-explorer@internal.invalid',
    role: 'INTENDENTE',
    tenantId: TENANT_ID,
    capabilities: access.capabilities,
    accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
    homeProfile: access.homeProfile,
    tenant: { name: 'Municipalidad de Junín QA', shortName: 'Junín QA' },
  };
}

function fakeToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'grh-explorer-e2e',
    role: 'INTENDENTE',
    tenantId: TENANT_ID,
    exp: Math.floor(Date.now() / 1000) + 900,
  })}.qa`;
}

function mutatedProjection(href) {
  const payload = structuredClone(PROJECTION);
  payload.domains[0].actions[0].href = href;
  return payload;
}

function mutatedCapability() {
  const payload = structuredClone(PROJECTION);
  payload.domains[0].actions[0].requiredCapability = 'navigation.does-not-exist';
  return payload;
}

async function createFixture() {
  let scenario = 'ok';
  const apiRequests = [];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/api/auth/me') {
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ user: authoritativeUser() }));
      return;
    }
    if (url.pathname === '/api/grh-domain-catalog') {
      apiRequests.push({
        scenario,
        search: url.search,
        authorization: request.headers.authorization || '',
        accept: request.headers.accept || '',
      });
      if (scenario === 'forbidden') {
        response.writeHead(403, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ code: 'FORBIDDEN' }));
        return;
      }
      if (scenario === 'unavailable') {
        response.writeHead(503, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ code: 'GRH_DOMAIN_CATALOG_UNAVAILABLE' }));
        return;
      }
      const headers = {
        'Content-Type': CONTENT_TYPES['.json'],
        'Cache-Control': 'no-store',
        'X-MuniControl-Contract': scenario === 'bad-header' ? 'grh-domain-catalog-v0' : CONTRACT,
      };
      const payload = scenario === 'protocol-relative'
        ? mutatedProjection('//evil.example/path')
        : scenario === 'backslash-relative'
          ? mutatedProjection('/\\evil.example/path')
          : scenario === 'unknown-capability'
            ? mutatedCapability()
            : PROJECTION;
      response.writeHead(200, headers);
      response.end(JSON.stringify(payload));
      return;
    }

    const relative = decodeURIComponent(url.pathname.slice(1) || 'areas-grh.html');
    const target = path.resolve(ROOT, relative);
    if (!target.startsWith(`${ROOT}${path.sep}`)) {
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
  return {
    server,
    apiRequests,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    setScenario(value) { scenario = value; },
  };
}

async function newPage(browser, baseUrl, viewport, theme = 'dark') {
  const context = await browser.newContext({ viewport, colorScheme: theme });
  const user = authoritativeUser();
  await context.addInitScript(({ token, storedUser, storedTheme }) => {
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify(storedUser));
    localStorage.setItem('municontrol-color-theme:v1', storedTheme);
    localStorage.setItem('govtech_theme', storedTheme);
  }, { token: fakeToken(), storedUser: user, storedTheme: theme });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/areas-grh.html?domain=nomina_control`, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

async function waitForReady(page) {
  await page.locator('#grhExplorerContent:not([hidden])').waitFor();
  await page.locator('.grh-domain-card').first().waitFor();
}

test('enterprise explorer renders the real governed projection and keeps filter and keyboard state coherent', async t => {
  const fixture = await createFixture();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => fixture.server.close(resolve));
  });

  const { context, page } = await newPage(browser, fixture.baseUrl, { width: 1440, height: 940 });
  t.after(async () => context.close());
  await waitForReady(page);
  await page.locator('.muni-guide-trigger').waitFor();
  assert.equal(await page.locator('.muni-guide-trigger').getAttribute('aria-label'), 'Abrir ayuda de pantalla para Mapa de datos GRH');
  await page.locator('.muni-guide-trigger').click();
  assert.equal(await page.locator('.muni-guide-title').textContent(), 'Mapa de datos GRH');
  assert.match(await page.locator('.muni-guide-dialog').innerText(), /Confirmá fuente y corte/);
  await page.keyboard.press('Escape');
  await page.locator('.muni-guide-dialog').waitFor({ state: 'hidden' });

  assert.equal(fixture.apiRequests.length, 1);
  assert.equal(fixture.apiRequests[0].search, '');
  assert.match(fixture.apiRequests[0].authorization, /^Bearer /);
  assert.match(fixture.apiRequests[0].accept, /application\/json/);
  assert.deepEqual(
    await page.locator('.grh-kpi strong').allTextContents(),
    ['8', '257', '147', '6.573.057', '53', '6.354.042'],
  );
  assert.equal(await page.locator('.grh-domain-card').count(), 8);
  assert.equal(await page.locator('.grh-domain-card[aria-current="true"]').count(), 1);
  assert.equal(await page.locator('.grh-domain-card[tabindex="0"]').count(), 1);
  assert.equal(await page.locator('#grhDomainTitle').textContent(), 'Nómina y control de cálculo');
  assert.equal(await page.locator('#grhEvidenceBody tr').count(), PROJECTION.domains[5].tables.length);
  assert.equal(await page.locator('#grhQuestionList li').count(), PROJECTION.domains[5].questions.length);
  assert.equal(await page.locator('#grhQuestionList .grh-question-link').count(), PROJECTION.domains[5].questions.length);
  assert.deepEqual(
    await page.locator('#grhQuestionList .grh-question-link').evaluateAll(links => links.map(link => ({
      question: link.querySelector('strong')?.textContent,
      label: link.querySelector('span')?.textContent,
      href: link.getAttribute('href'),
    }))),
    PROJECTION.domains[5].questions.map(question => ({
      question,
      label: 'Preguntar al BOT IA',
      href: `/ia.html?question=${encodeURIComponent(question)}`,
    })),
  );
  assert.deepEqual(
    await page.locator('#grhDomainActions a').evaluateAll(links => links.map(link => link.getAttribute('href'))),
    PROJECTION.domains[5].actions.map(action => action.href),
  );
  assert.equal(await page.locator('#grhDomainActions a').evaluateAll(links => links.every(link => (
    new URL(link.href).origin === window.location.origin
  ))), true);

  const current = page.locator('.grh-domain-card[aria-current="true"]');
  await current.press('ArrowLeft');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.domainId), 'relaciones_laborales');
  await page.keyboard.press('Enter');
  await page.locator('#grhDomainTitle').filter({ hasText: 'Relaciones laborales' }).waitFor();
  assert.equal(await page.locator('.grh-domain-card[aria-current="true"]').getAttribute('data-domain-id'), 'relaciones_laborales');

  await page.locator('#grhDomainSearch').fill('Licencias y salud laboral');
  assert.equal(await page.locator('.grh-domain-card').count(), 1);
  assert.deepEqual(await page.locator('.grh-domain-card').evaluate(button => ({
    tag: button.tagName,
    role: button.getAttribute('role'),
    current: button.getAttribute('aria-current'),
    tabIndex: button.tabIndex,
  })), { tag: 'BUTTON', role: null, current: 'true', tabIndex: 0 });
  assert.equal(await page.locator('#grhDomainTitle').textContent(), 'Licencias y salud laboral');
  assert.equal(await page.locator('#grhDomainDetail').isHidden(), false);

  await page.locator('#grhDomainSearch').fill('dominio-que-no-existe');
  assert.equal(await page.locator('.grh-domain-card').count(), 0);
  assert.equal(await page.locator('#grhDomainDetail').isHidden(), true);
  assert.equal(await page.locator('#grhDomainEmpty').isVisible(), true);
  assert.equal(await page.locator('.grh-domain-card[aria-current="true"], .grh-domain-card[tabindex="0"]').count(), 0);

  await page.locator('#grhDomainSearch').fill('');
  assert.equal(await page.locator('.grh-domain-card').count(), 8);
  assert.equal(await page.locator('.grh-domain-card[aria-current="true"]').count(), 1);
  assert.equal(await page.locator('.grh-domain-card[tabindex="0"]').count(), 1);

  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    detailVisible: !document.querySelector('#grhDomainDetail').hidden,
    sidebarCurrent: document.querySelector('.sidebar [aria-current="page"]')?.getAttribute('href') || '',
  }));
  assert.ok(layout.overflow <= 1, `desktop overflow=${layout.overflow}`);
  assert.equal(layout.detailVisible, true);
  assert.equal(layout.sidebarCurrent, 'areas-grh.html');

  const mobile = await newPage(browser, fixture.baseUrl, { width: 390, height: 844 }, 'light');
  t.after(async () => mobile.context.close());
  await waitForReady(mobile.page);
  const mobileLayout = await mobile.page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    theme: document.documentElement.getAttribute('data-theme'),
    cardsVisible: getComputedStyle(document.querySelector('#grhEvidenceCards')).display !== 'none',
    tableVisible: getComputedStyle(document.querySelector('.grh-table-wrap')).display !== 'none',
  }));
  assert.ok(mobileLayout.overflow <= 1, `mobile overflow=${mobileLayout.overflow}`);
  assert.equal(mobileLayout.theme, 'light');
  assert.equal(mobileLayout.cardsVisible, true);
  assert.equal(mobileLayout.tableVisible, false);
});

test('explorer fails closed for authorization, availability, header and unsafe action href drift', async t => {
  const fixture = await createFixture();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => fixture.server.close(resolve));
  });

  const scenarios = [
    { id: 'forbidden', title: 'Acceso no habilitado' },
    { id: 'unavailable', title: 'Catálogo GRH no verificable' },
    { id: 'bad-header', title: 'Catálogo GRH no verificable' },
    { id: 'protocol-relative', title: 'Catálogo GRH no verificable' },
    { id: 'backslash-relative', title: 'Catálogo GRH no verificable' },
    { id: 'unknown-capability', title: 'Catálogo GRH no verificable' },
  ];
  for (const scenario of scenarios) {
    fixture.setScenario(scenario.id);
    const { context, page } = await newPage(browser, fixture.baseUrl, { width: 1280, height: 800 });
    await page.locator('#grhErrorState:not([hidden])').waitFor();
    assert.equal(await page.locator('#grhErrorTitle').textContent(), scenario.title, scenario.id);
    assert.equal(await page.locator('#grhExplorerContent').isHidden(), true, scenario.id);
    assert.equal(await page.locator('.grh-domain-card').count(), 0, scenario.id);
    await context.close();
  }
  assert.deepEqual(fixture.apiRequests.map(request => request.scenario), scenarios.map(scenario => scenario.id));
});
