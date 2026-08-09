import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import accessPolicy from '../shared/access-policy.cjs';
import { buildGrhQualityProjection } from '../api/lib/grh-quality-projection.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HAS_PRIVATE_GRH = ['profile', 'semantic'].every(name =>
  existsSync(path.join(REPO, 'api', '_data', `grh-${name}.json`)),
);
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
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
    id: 'qa-grh-quality',
    name: 'QA Calidad GRH',
    role,
    tenantId,
    capabilities: access.capabilities,
    accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
    homeProfile: access.homeProfile,
  };
}

function fakeToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'qa-grh-quality',
    role: 'INTENDENTE',
    tenantId: 'tenant-junin-test',
    exp: Math.floor(Date.now() / 1000) + 600,
  })}.qa`;
}

async function createServer(requestLog, options = {}) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/js/nav.js' && options.navMode) {
      const malformed = options.navMode === 'malformed'
        ? "window.requireCapability = async function () { return { allowed: true }; };"
        : '';
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.js'], 'Cache-Control': 'no-store' });
      response.end(`window.__muniAuthValidated = true; window.MuniAuthReady = Promise.resolve(true); ${malformed}`);
      return;
    }
    if (url.pathname === '/api/auth/me') {
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ user: authoritativeUser(options.authRole || 'INTENDENTE') }));
      return;
    }
    if (PRIVATE_GRH_PATHS.has(url.pathname)) {
      requestLog.push({ endpoint: url.pathname, authorization: request.headers.authorization || '' });
      if (url.pathname !== '/api/grh-quality') {
        response.writeHead(410, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: 'Contrato no utilizado por esta vista' }));
        return;
      }
      if (options.unavailable) {
        response.writeHead(503, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: 'unavailable' }));
        return;
      }
      const [profile, semantic] = await Promise.all([
        readFile(path.join(REPO, 'api', '_data', 'grh-profile.json'), 'utf8').then(JSON.parse),
        readFile(path.join(REPO, 'api', '_data', 'grh-semantic.json'), 'utf8').then(JSON.parse),
      ]);
      const payload = structuredClone(buildGrhQualityProjection(profile, semantic));
      if (options.mutateQuality) options.mutateQuality(payload);
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store, private' });
      response.end(JSON.stringify(payload));
      return;
    }

    const relative = decodeURIComponent(url.pathname.slice(1) || 'control.html');
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

async function seedSession(context) {
  await context.addInitScript(({ token }) => {
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify({
      id: 'qa-grh-quality',
      name: 'QA Calidad GRH',
      role: 'INTENDENTE',
      tenantId: 'tenant-junin-test',
    }));
    localStorage.removeItem('muni_sidebar_collapsed');
  }, { token: fakeToken() });
}

test('Calidad y Linaje renders reconciled private GRH evidence on desktop and mobile', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
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
    await seedSession(context);
    const page = await context.newPage();
    const consoleErrors = [];
    const externalRequests = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('request', request => {
      if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url());
    });

    await page.goto(`${baseUrl}/control.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#dataViews:not([hidden])');
    const result = await page.evaluate(() => {
      const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
      const ids = Array.from(document.querySelectorAll('[id]'), node => node.id);
      const mainText = document.querySelector('main')?.textContent || '';
      const mainRect = document.querySelector('#mainContent')?.getBoundingClientRect();
      const firstAnimated = document.querySelector('#dataViews > *');
      return {
        quality: normalize(document.querySelector('#kpiQuality')?.textContent),
        quarantine: normalize(document.querySelector('#kpiQuarantine')?.textContent),
        reconciliation: normalize(document.querySelector('#kpiReconciliation')?.textContent),
        referential: normalize(document.querySelector('#kpiReferential')?.textContent),
        tables: normalize(document.querySelector('#kpiTables')?.textContent),
        tableNote: normalize(document.querySelector('#kpiTablesNote')?.textContent),
        rowTitle: document.querySelector('#kpiRows')?.title,
        snapshot: normalize(document.querySelector('#snapshotDate')?.textContent),
        sourceFile: normalize(document.querySelector('#sourceFile')?.textContent),
        sourceHash: normalize(document.querySelector('#sourceHash')?.textContent),
        state: normalize(document.querySelector('#connectionStatusText')?.textContent),
        busy: document.querySelector('#trustDashboard')?.getAttribute('aria-busy'),
        qualityComponents: document.querySelectorAll('#qualityBars .trust-bar-row').length,
        temporalDomains: document.querySelectorAll('#quarantineTableBody tr').length,
        coverageFacts: document.querySelectorAll('#coverageTableBody tr').length,
        lineageSteps: document.querySelectorAll('#lineageSteps .trust-lineage-step').length,
        risks: document.querySelectorAll('#riskRegister .trust-risk').length,
        actions: document.querySelectorAll('#actionQueue .trust-action').length,
        dataHidden: document.querySelector('#dataViews')?.hidden,
        errorHidden: document.querySelector('#loadError')?.hidden,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        mainLeft: mainRect?.left,
        duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
        containsCurrencyLabel: /\$|\bARS\b/.test(mainText),
        containsIndividualDirectory: /Directorio de empleados|Ficha individual|Nombre completo|DNI\s*\d/i.test(mainText),
        containsRealtimeClaim: /datos en tiempo real|actualizaci[oó]n en vivo/i.test(mainText),
        animationDuration: firstAnimated ? parseFloat(getComputedStyle(firstAnimated).animationDuration) : null,
        navLabel: normalize(Array.from(document.querySelectorAll('.sidebar a')).find(link => link.getAttribute('href') === 'control.html')?.textContent),
      };
    });

    assert.equal(result.quality, '88,99/100');
    assert.equal(result.quarantine, '20.534');
    assert.equal(result.reconciliation, '63,88/100');
    assert.equal(result.referential, '99,97%');
    assert.equal(result.tables, '257');
    assert.match(result.tableNote, /147 con filas · 110 vacías/);
    assert.equal(result.rowTitle, '6.573.057 filas inventariadas');
    assert.equal(result.snapshot, '6 ago 2026');
    assert.equal(result.sourceFile, 'grh_junin.backup_2026080615_plataforma.sql.gz');
    assert.match(result.sourceHash, /^[a-f0-9]{64}$/);
    assert.equal(result.state, 'Proyección validada');
    assert.equal(result.busy, 'false');
    assert.equal(result.qualityComponents, 4);
    assert.equal(result.temporalDomains, 5);
    assert.equal(result.coverageFacts, 4);
    assert.equal(result.lineageSteps, 4);
    assert.equal(result.risks, 8);
    assert.equal(result.actions, 5);
    assert.equal(result.dataHidden, false);
    assert.equal(result.errorHidden, true);
    assert.ok(result.overflow <= 1, `${viewport.name} overflow=${result.overflow}`);
    if (viewport.name === 'desktop') assert.ok(result.mainLeft >= 250 && result.mainLeft <= 280);
    else assert.ok(Math.abs(result.mainLeft) <= 1);
    assert.deepEqual(result.duplicateIds, []);
    assert.equal(result.containsCurrencyLabel, false);
    assert.equal(result.containsIndividualDirectory, false);
    assert.equal(result.containsRealtimeClaim, false);
    assert.match(result.navLabel, /Calidad y Linaje/);
    if (viewport.reducedMotion === 'reduce') assert.ok(result.animationDuration <= 0.001);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(externalRequests, []);

    if (viewport.name === 'desktop') {
      await page.evaluate(() => {
        document.body.setAttribute('tabindex', '-1');
        document.body.focus();
        document.body.removeAttribute('tabindex');
      });
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('skip-link')), true);
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'mainContent');
    }

    if (process.env.GRH_CONTROL_CAPTURE === '1') {
      await page.screenshot({ path: path.join(tmpdir(), `grh-control-${viewport.name}.png`), fullPage: true });
    }

    if (viewport.name === 'desktop') {
      await page.emulateMedia({ media: 'print' });
      await page.waitForTimeout(50);
      const printGeometry = await page.evaluate(() => {
        const rect = document.querySelector('#mainContent')?.getBoundingClientRect();
        const main = document.querySelector('#mainContent');
        return { left: rect?.left, width: rect?.width, print: matchMedia('print').matches, marginLeft: getComputedStyle(main).marginLeft };
      });
      assert.ok(Math.abs(printGeometry.left) <= 1, JSON.stringify(printGeometry));
      assert.ok(Math.abs(printGeometry.width - 1440) <= 1, JSON.stringify(printGeometry));
    }
    await context.close();
  }

  assert.equal(requestLog.length, 2);
  assert.deepEqual(requestLog.map(item => item.endpoint), ['/api/grh-quality', '/api/grh-quality']);
  assert.equal(requestLog.every(item => item.authorization.startsWith('Bearer ')), true);
});

test('Calidad y Linaje keeps municipal values source-backed instead of embedding the current snapshot', async () => {
  const source = await Promise.all([
    readFile(path.join(REPO, 'control.html'), 'utf8'),
    readFile(path.join(REPO, 'js', 'grh-control.js'), 'utf8'),
  ]).then(parts => parts.join('\n'));
  assert.doesNotMatch(source, /\b88[.,]99\b/);
  assert.doesNotMatch(source, /\b20[.]?534\b/);
  assert.doesNotMatch(source, /\b63[.,]8825\b/);
  assert.doesNotMatch(source, /\b6[.]?573[.]?057\b/);
  assert.doesNotMatch(source, /\b1[.]?186[.]?239\b/);
  assert.doesNotMatch(source, /e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9/);
  assert.doesNotMatch(source, /2026-08-06/);
  assert.doesNotMatch(source, /2009-05/);
  assert.doesNotMatch(source, /js\/db\.js|MuniDB/);
  assert.doesNotMatch(source, /\/api\/grh-data|artifact=(?:profile|semantic)/);
  assert.match(source, /MuniGrhData\.loadQuality/);
  assert.match(source, /await window\.requireCapability\('navigation\.data-quality'\)/);
  assert.match(source, /async function init\(\)[\s\S]*if \(!await requirePageCapability\(\)\) return;[\s\S]*await loadDashboard\(\)/);
  assert.match(source, /retryButton\.addEventListener\('click', loadAuthorizedDashboard\)/);
});

test('Calidad y Linaje capability preflight redirects denied or malformed clients before private contracts', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  for (const scenario of [
    { name: 'low role denied by authoritative /me', authRole: 'INSPECTOR' },
    { name: 'missing capability helper', navMode: 'missing' },
    { name: 'malformed capability helper', navMode: 'malformed' },
  ]) {
    const requestLog = [];
    const server = await createServer(requestLog, scenario);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await seedSession(context);
      const page = await context.newPage();
      await page.goto(`${baseUrl}/control.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(`${baseUrl}/inicio.html`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(75);
      assert.deepEqual(requestLog, [], `${scenario.name} must issue zero private GRH requests`);
      await context.close();
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }
});

test('Calidad y Linaje fails closed on schema, privacy, score and inventory mutations', { skip: !HAS_PRIVATE_GRH }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const scenarios = [
    {
      name: 'quality schema downgrade',
      mutateQuality: quality => { quality.schemaVersion = 'grh-quality-v0'; },
    },
    {
      name: 'semantic lineage downgrade',
      mutateQuality: quality => { quality.lineage.semanticSchemaVersion = 'semantic-unknown'; },
    },
    {
      name: 'privacy regression',
      mutateQuality: quality => { quality.privacy.containsPii = true; },
    },
    {
      name: 'score weight drift',
      mutateQuality: quality => { quality.quality.components.temporalValidity.weightPct = 20; },
    },
    {
      name: 'dictionary drift',
      mutateQuality: quality => { quality.inventory.all.totalRows += 1; },
    },
    {
      name: 'unexpected raw payload',
      mutateQuality: quality => { quality.rawEmployee = { employeeName: 'No debe pasar' }; },
    },
  ];

  for (const scenario of scenarios) {
    const requestLog = [];
    const server = await createServer(requestLog, scenario);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await seedSession(context);
      const page = await context.newPage();
      await page.goto(`${baseUrl}/control.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#loadError:not([hidden])');
      const result = await page.evaluate(() => ({
        message: document.querySelector('#errorMessage')?.textContent.trim(),
        dataHidden: document.querySelector('#dataViews')?.hidden,
        kpis: Array.from(document.querySelectorAll('.trust-kpi-value'), node => node.textContent.trim()),
        state: document.querySelector('#connectionStatusText')?.textContent.trim(),
      }));
      assert.equal(result.dataHidden, true, scenario.name);
      assert.equal(result.kpis.every(value => value === '—'), true, scenario.name);
      assert.equal(result.state, 'Evidencia bloqueada', scenario.name);
      assert.equal(
        result.message,
        'La proyección privada no está disponible o no supera su contrato. No se muestran cifras.',
        scenario.name,
      );
      assert.equal(requestLog.length, 1, scenario.name);
      await context.close();
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }
});

test('Calidad y Linaje exposes an explicit retry while private artifacts are unavailable', async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { unavailable: true });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await seedSession(context);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/control.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loadError:not([hidden])');
  assert.equal(await page.locator('#dataViews').getAttribute('hidden'), '');
  assert.match(await page.locator('#errorMessage').textContent(), /No se muestran cifras/);
  assert.equal(await page.locator('#retryButton').isVisible(), true);
  await page.locator('#retryButton').click();
  await page.waitForFunction(() => document.querySelector('#connectionStatusText')?.textContent === 'Evidencia bloqueada' && document.querySelector('#trustDashboard')?.getAttribute('aria-busy') === 'false');
  assert.equal(requestLog.length, 2);
  await context.close();
});
