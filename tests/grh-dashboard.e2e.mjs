import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import accessPolicy from '../shared/access-policy.cjs';
import { buildGrhExecutiveProjection } from '../api/lib/grh-executive-projection.js';
import { buildGrhQualityProjection } from '../api/lib/grh-quality-projection.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HAS_PRIVATE_GRH = ['profile', 'semantic'].every(name =>
  existsSync(path.join(REPO, 'api', '_data', `grh-${name}.json`))
);
const PROJECTIONS = HAS_PRIVATE_GRH ? await (async () => {
  const [profile, semantic] = await Promise.all([
    readFile(path.join(REPO, 'api', '_data', 'grh-profile.json'), 'utf8').then(JSON.parse),
    readFile(path.join(REPO, 'api', '_data', 'grh-semantic.json'), 'utf8').then(JSON.parse),
  ]);
  return {
    executive: buildGrhExecutiveProjection(semantic, { audience: 'interactive' }),
    quality: buildGrhQualityProjection(profile, semantic),
  };
})() : null;
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const PRIVATE_GRH_PATHS = new Set([
  '/api/grh-executive',
  '/api/grh-quality',
  '/api/grh-close',
  '/api/grh-data',
]);

function authoritativeUser(role = 'INTENDENTE') {
  const tenantId = 'tenant-junin-test';
  const access = accessPolicy.getSessionAccessForUser({ role, tenantId });
  assert.ok(access, `missing test access projection for ${role}`);
  return {
    id: 'qa',
    name: 'QA Ejecutivo',
    role,
    tenantId,
    capabilities: access.capabilities,
    accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
    homeProfile: access.homeProfile,
  };
}

test('GRH dashboard never presents snapshot reconciliation as a monthly metric', async () => {
  const source = await readFile(path.join(REPO, 'grh-ejecutivo.html'), 'utf8');

  assert.doesNotMatch(source, /reconciliationRate/);
  assert.doesNotMatch(source, /<th[^>]*>Conciliación<\/th>/);
  assert.match(source, /Conciliación global/);
  assert.match(source, /esta vista no lo atribuye a meses individuales/);
  assert.match(source, /quality\.reconciliation\.valueAgreementPct/);
  assert.match(source, /await window\.requireCapability\('navigation\.grh-executive'\)/);
  assert.match(source, /async function init\(\)[\s\S]*if \(!await requirePageCapability\(\)\) return;[\s\S]*await loadContracts\(\)/);
  assert.match(source, /retryLoad\.addEventListener\('click', loadAuthorizedContracts\)/);
});

test('GRH capability preflight redirects denied or malformed clients before every private contract', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  for (const scenario of [
    { name: 'low role denied by authoritative /me', authRole: 'DEMO' },
    { name: 'missing capability helper', navMode: 'missing' },
    { name: 'malformed capability helper', navMode: 'malformed' },
    { name: 'throwing capability helper', navMode: 'throws' },
  ]) {
    const requestLog = [];
    const server = await createServer(requestLog, scenario);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addInitScript(({ token }) => {
        sessionStorage.setItem('mjunin_token', token);
        sessionStorage.setItem('mjunin_user', JSON.stringify({
          id: 'stale-qa', name: 'Stale QA', role: 'INTENDENTE', tenantId: 'tenant-junin-test',
        }));
      }, { token: fakeBrowserToken() });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/grh-ejecutivo.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(`${baseUrl}/inicio.html`);
      await page.waitForSelector('#accessNotice:not([hidden])');
      await page.waitForFunction(() => document.activeElement?.id === 'accessNotice');
      assert.match(await page.textContent('#accessNotice'), /no tiene habilitada/i, scenario.name);
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'accessNotice', scenario.name);
      assert.deepEqual(requestLog, [], `${scenario.name} must issue zero private GRH requests`);
      await context.close();
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }
});

function fakeBrowserToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'qa',
    role: 'INTENDENTE',
    tenantId: 'tenant-junin-test',
    exp: Math.floor(Date.now() / 1000) + 600,
  })}.qa`;
}

async function createServer(requestLog, options = {}) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const pageReferrer = request.headers.referer ? new URL(request.headers.referer).pathname : '';
    if (url.pathname === '/js/nav.js' && options.navMode && pageReferrer === '/grh-ejecutivo.html') {
      const fallback = options.navMode === 'malformed'
        ? "window.requireCapability = async function () { return { allowed: true }; };"
        : options.navMode === 'throws'
          ? "window.requireCapability = async function () { throw new Error('capability helper unavailable'); };"
        : '';
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.js'], 'Cache-Control': 'no-store' });
      response.end(`window.__muniAuthValidated = true; window.MuniAuthReady = Promise.resolve(true); ${fallback}`);
      return;
    }
    if (PRIVATE_GRH_PATHS.has(url.pathname)) {
      const contract = url.pathname === '/api/grh-executive' ? 'executive' : 'quality';
      requestLog.push({
        contract,
        pathname: url.pathname,
        authorization: request.headers.authorization || '',
      });
      if (url.pathname !== '/api/grh-executive' && url.pathname !== '/api/grh-quality') {
        response.writeHead(410, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: 'Contrato retirado' }));
        return;
      }
      if (options.failGrh) {
        response.writeHead(503, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: 'Contrato GRH no disponible' }));
        return;
      }
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES['.json'],
        'Cache-Control': 'no-store, private',
      });
      response.end(JSON.stringify(PROJECTIONS[contract]));
      return;
    }
    if (url.pathname === '/api/auth/me') {
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ user: authoritativeUser(options.authRole || 'INTENDENTE') }));
      return;
    }

    const relative = url.pathname === '/' ? 'login.html' : decodeURIComponent(url.pathname.slice(1));
    const target = path.resolve(REPO, relative);
    if (!target.startsWith(`${REPO}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(target);
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(target)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

test('protected GRH dashboard renders source-backed desktop and mobile views', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog);
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000, reducedMotion: 'no-preference' },
    { name: 'mobile', width: 390, height: 844, reducedMotion: 'reduce' },
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: viewport.reducedMotion });
    await context.addInitScript(({ token }) => {
      sessionStorage.setItem('mjunin_token', token);
      sessionStorage.setItem('mjunin_user', JSON.stringify({
        id: 'qa', name: 'QA Ejecutivo', role: 'INTENDENTE', tenantId: 'tenant-junin-test',
      }));
    }, { token: fakeBrowserToken() });
    const page = await context.newPage();
    const consoleErrors = [];
    const externalRequests = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('request', request => {
      if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url());
    });

    await page.goto(`${baseUrl}/grh-ejecutivo.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#grhDashboard[aria-busy="false"]');
    const result = await page.evaluate(() => ({
      quality: document.querySelector('#kpiQuality')?.textContent.trim(),
      quarantine: document.querySelector('#quarantineChip')?.textContent.trim(),
      source: document.querySelector('#topbarSourceText')?.textContent.trim(),
      sourceFile: document.querySelector('#sourceFile')?.textContent.trim(),
      sourceHash: document.querySelector('#sourceHash')?.textContent.trim(),
      protectedBucket: document.querySelector('#sectorList [data-privacy-status="protected_aggregate"] .grh-sector-meta span')?.textContent.trim(),
      suppressedVisible: document.querySelector('#grhDataViews')?.innerText.includes('<10'),
      releasedPeriods: document.querySelectorAll('#periodRows tr').length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      errorVisible: !document.querySelector('#loadError')?.hidden,
    }));

    assert.equal(result.quality, '88,99/100');
    assert.equal(result.quarantine, '20.534');
    assert.match(result.source, /GRH.*proyecciones conciliadas/i);
    assert.equal(result.sourceFile, 'grh_junin.backup_2026080615_plataforma.sql.gz');
    assert.equal(result.sourceHash, 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9');
    assert.equal(result.protectedBucket, 'Otros (celdas protegidas)');
    assert.equal(result.suppressedVisible, false);
    assert.ok(result.releasedPeriods > 0);
    assert.equal(result.overflow, 0, `${viewport.name} must not overflow horizontally`);
    assert.equal(result.errorVisible, false);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(externalRequests, []);
    await context.close();
  }

  assert.equal(requestLog.length, 4);
  assert.deepEqual(requestLog.map(item => item.contract).sort(), ['executive', 'executive', 'quality', 'quality']);
  assert.equal(requestLog.every(item => item.authorization.startsWith('Bearer ')), true);
  assert.equal(requestLog.some(item => /grh-data|profile|semantic/i.test(item.pathname)), false);
});

test('GRH hides every loading view and retries when a governed projection returns 503', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { failGrh: true });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  for (const scenario of [{
    page: 'grh-ejecutivo.html',
    dashboard: '#grhDashboard',
    dataViews: '#grhDataViews',
    probe: '#kpiQuality',
    source: '#topbarSourceText',
  }]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(({ token }) => {
      sessionStorage.setItem('mjunin_token', token);
      sessionStorage.setItem('mjunin_user', JSON.stringify({
        id: 'qa', name: 'QA Ejecutivo', role: 'INTENDENTE', tenantId: 'tenant-junin-test',
      }));
    }, { token: fakeBrowserToken() });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto(`${baseUrl}/${scenario.page}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`${scenario.dashboard}[aria-busy="false"]`);
    const result = await page.evaluate(({ dataViews, probe, source }) => ({
      dataHidden: document.querySelector(dataViews)?.hidden,
      probeVisible: document.querySelector(probe)?.getClientRects().length > 0,
      errorHidden: document.querySelector('#loadError')?.hidden,
      source: document.querySelector(source)?.textContent.trim(),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }), scenario);

    assert.equal(result.dataHidden, true, `${scenario.page} must hide stale loading views`);
    assert.equal(result.probeVisible, false, `${scenario.page} must not expose a loading KPI`);
    assert.equal(result.errorHidden, false, `${scenario.page} must expose a terminal error`);
    assert.match(result.source, /no disponible/i);
    assert.ok(result.overflow <= 1, `${scenario.page} error state must not overflow`);
    assert.deepEqual(pageErrors, []);
    assert.ok(consoleErrors.every(message => /503|proyecciones gobernadas|GRH/i.test(message)));
    const requestsBeforeRetry = requestLog.length;
    const retryResponse = page.waitForResponse(response =>
      /\/api\/grh-(?:executive|quality)$/.test(new URL(response.url()).pathname) && response.status() === 503
    );
    await page.click('#retryLoad');
    await retryResponse;
    await page.waitForSelector('#loadError:not([hidden])');
    assert.ok(requestLog.length > requestsBeforeRetry, 'retry must start a new governed projection request');
    await context.close();
  }

  assert.ok(requestLog.length >= 2);
  assert.equal(requestLog.every(item => item.authorization.startsWith('Bearer ')), true);
  assert.equal(requestLog.some(item => /grh-data|profile|semantic/i.test(item.pathname)), false);
});
