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
import { buildGrhExecutiveProjection } from '../api/lib/grh-executive-projection.js';
import { buildGrhQualityProjection } from '../api/lib/grh-quality-projection.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE_PATH = path.join(REPO, 'api', '_data', 'grh-profile.json');
const SEMANTIC_PATH = path.join(REPO, 'api', '_data', 'grh-semantic.json');
const HAS_PRIVATE_GRH = existsSync(PROFILE_PATH) && existsSync(SEMANTIC_PATH);
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
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
    id: 'qa-rrhh',
    name: 'QA RRHH',
    role,
    tenantId,
    capabilities: access.capabilities,
    accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
    homeProfile: access.homeProfile,
  };
}

let projections = null;
if (HAS_PRIVATE_GRH) {
  const [profile, semantic] = await Promise.all([
    readFile(PROFILE_PATH, 'utf8').then(JSON.parse),
    readFile(SEMANTIC_PATH, 'utf8').then(JSON.parse),
  ]);
  projections = Object.freeze({
    executive: buildGrhExecutiveProjection(semantic, { audience: 'interactive' }),
    quality: buildGrhQualityProjection(profile, semantic),
  });
}

function fakeBrowserToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'qa-rrhh',
    role: 'INTENDENTE',
    tenantId: 'tenant-junin-test',
    exp: Math.floor(Date.now() / 1000) + 600,
  })}.qa`;
}

async function createServer(requestLog, availability = { unavailable: false }, options = {}) {
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
    if (PRIVATE_GRH_PATHS.has(url.pathname)) {
      requestLog.push({
        path: url.pathname,
        authorization: request.headers.authorization || '',
        unavailable: availability.unavailable,
      });
      if (url.pathname !== '/api/grh-executive' && url.pathname !== '/api/grh-quality') {
        response.writeHead(410, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: 'Contrato retirado' }));
        return;
      }
      if (availability.unavailable) {
        response.writeHead(503, {
          'Content-Type': CONTENT_TYPES['.json'],
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(JSON.stringify({ code: 'GRH_CONTRACT_UNAVAILABLE' }));
        return;
      }
      const body = url.pathname.endsWith('executive') ? projections.executive : projections.quality;
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES['.json'],
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(JSON.stringify(body));
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

async function seedSession(context) {
  await context.addInitScript(({ token }) => {
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify({
      id: 'qa-rrhh', name: 'QA RRHH', role: 'INTENDENTE', tenantId: 'tenant-junin-test',
    }));
  }, { token: fakeBrowserToken() });
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value);
}

function formatDecimal(value) {
  return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

test('RRHH renders only governed GRH projections on desktop and mobile', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const expectedWorkforce = projections.executive.workforce;
  const expectedQuality = projections.quality;
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

    await page.goto(`${baseUrl}/rrhh.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#rrhhDashboard[aria-busy="false"]:not([hidden])');
    const collapsed = await page.evaluate(() => {
      const dashboard = document.querySelector('#rrhhDashboard');
      const mainText = document.querySelector('main')?.textContent || '';
      const ids = Array.from(document.querySelectorAll('[id]'), node => node.id);
      const protectedLabels = Array.from(
        document.querySelectorAll('.rrhh-bar-row--protected .rrhh-bar-label'),
        node => node.textContent.trim(),
      );
      return {
        legajos: document.querySelector('#kpiLegajos')?.textContent.trim(),
        participants: document.querySelector('#kpiWorkforceParticipants')?.textContent.trim(),
        workforceContext: document.querySelector('#kpiWorkforceContext')?.textContent.trim(),
        quality: document.querySelector('#kpiQuality')?.textContent.trim(),
        quarantine: document.querySelector('#kpiQuarantine')?.textContent.trim(),
        sourceStatus: document.querySelector('#connectionStatusText')?.textContent.trim(),
        schema: document.querySelector('#schemaChip')?.textContent.trim(),
        sourceText: document.querySelector('#sourceMetadata')?.textContent.replace(/\s+/g, ' ').trim(),
        errorVisible: !document.querySelector('#loadError')?.hidden,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        sectorRows: document.querySelectorAll('#sectorBars .rrhh-bar-row').length,
        costRows: document.querySelectorAll('#costBars .rrhh-bar-row').length,
        agreementRows: document.querySelectorAll('#agreementBars .rrhh-bar-row').length,
        protectedLabels,
        topSectorLabel: document.querySelector('#sectorBars .rrhh-bar-label')?.textContent.trim(),
        topCostLabel: document.querySelector('#costBars .rrhh-bar-label')?.textContent.trim(),
        topAgreementLabel: document.querySelector('#agreementBars .rrhh-bar-label')?.textContent.trim(),
        containsSuppressedDisplay: mainText.includes('<10'),
        containsCurrency: /\$|\bARS\b|\bUSD\b/.test(mainText),
        containsEmployeeDirectory: /Directorio de Empleados|Sueldo|Salario|Documento|Domicilio/.test(mainText),
        suppressedChartPoints: document.querySelectorAll('.rrhh-chart-point:not([data-privacy-status="released"])').length,
        unsafeHistoricalPoint: document.querySelectorAll('.rrhh-chart-point[data-period="1991"]').length,
        accessibleCharts: document.querySelectorAll('.rrhh-chart-wrap svg[role="img"][aria-label]').length,
        busy: dashboard?.getAttribute('aria-busy'),
        duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
        revealAnimation: getComputedStyle(document.querySelector('.rrhh-reveal')).animationName,
      };
    });

    assert.equal(collapsed.legajos, formatNumber(expectedQuality.referential.legajo.rows));
    assert.equal(collapsed.participants, expectedWorkforce.bySector.participantDisplay);
    assert.match(collapsed.workforceContext, new RegExp(`^${expectedWorkforce.referencePeriod} .* no es planta activa\\.$`));
    assert.equal(collapsed.quality, `${formatDecimal(expectedQuality.quality.score)}/100`);
    assert.equal(collapsed.quarantine, formatNumber(expectedQuality.temporal.quarantineRows));
    assert.equal(collapsed.sourceStatus, 'Proyecciones verificadas');
    assert.equal(collapsed.schema, 'grh-executive-v2 · grh-quality-v1');
    assert.match(collapsed.sourceText, /grh-profile-v1 · grh-semantic-v2/);
    assert.match(collapsed.sourceText, /Diferencias materiales detectadas/);
    assert.equal(collapsed.errorVisible, false);
    assert.equal(collapsed.overflow, 0, `${viewport.name} must not overflow horizontally`);
    assert.equal(collapsed.sectorRows, 9);
    assert.equal(collapsed.costRows, 9);
    assert.equal(collapsed.agreementRows, 8);
    assert.deepEqual(collapsed.protectedLabels, [
      projections.executive.privacy.protectedBucketLabel,
      projections.executive.privacy.protectedBucketLabel,
    ]);
    assert.equal(collapsed.topSectorLabel, expectedWorkforce.bySector.rows[0].label);
    assert.equal(collapsed.topCostLabel, expectedWorkforce.byCostCenter.rows[0].label);
    assert.equal(collapsed.topAgreementLabel, expectedWorkforce.byAgreement.rows[0].label);
    assert.equal(collapsed.containsSuppressedDisplay, false);
    assert.equal(collapsed.containsCurrency, false);
    assert.equal(collapsed.containsEmployeeDirectory, false);
    assert.equal(collapsed.suppressedChartPoints, 0);
    assert.equal(collapsed.unsafeHistoricalPoint, 0);
    assert.equal(collapsed.accessibleCharts, 2);
    assert.equal(collapsed.busy, 'false');
    assert.deepEqual(collapsed.duplicateIds, []);
    if (viewport.reducedMotion === 'reduce') assert.equal(collapsed.revealAnimation, 'none');

    if (process.env.RRHH_CAPTURE === '1') {
      await page.screenshot({ path: path.join(tmpdir(), `rrhh-dashboard-${viewport.name}.png`), fullPage: true });
    }

    await page.click('#sectorToggle');
    await page.click('#costToggle');
    await page.click('#agreementToggle');
    const expanded = await page.evaluate(() => {
      const summarize = selector => {
        const container = document.querySelector(selector);
        const rows = Array.from(container?.querySelectorAll('.rrhh-bar-row') || []);
        return {
          total: Number(container?.dataset.totalParticipants),
          rows: rows.length,
          participantSum: rows.reduce((sum, row) => sum + Number(row.dataset.participants), 0),
          protectedRows: rows.filter(row => row.dataset.privacyStatus === 'protected_aggregate').length,
          sharesReconcile: rows.every(row => {
            const expected = Number(row.dataset.participants) / Number(container?.dataset.totalParticipants) * 100;
            return Math.abs(Number(row.dataset.sharePct) - expected) < 0.0001;
          }),
        };
      };
      return { sector: summarize('#sectorBars'), cost: summarize('#costBars'), agreement: summarize('#agreementBars') };
    });
    for (const [name, ranking] of [
      ['sector', expectedWorkforce.bySector],
      ['cost', expectedWorkforce.byCostCenter],
      ['agreement', expectedWorkforce.byAgreement],
    ]) {
      assert.equal(expanded[name].total, ranking.totalParticipants, `${name} total`);
      assert.equal(expanded[name].rows, ranking.rows.length, `${name} published groups`);
      assert.equal(expanded[name].participantSum, ranking.totalParticipants, `${name} reconciliation`);
      assert.equal(expanded[name].protectedRows, ranking.privacyStatus === 'partially_suppressed' ? 1 : 0, `${name} privacy bucket`);
      assert.equal(expanded[name].sharesReconcile, true, `${name} shares`);
    }
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(externalRequests, []);
    await context.close();
  }

  assert.equal(requestLog.length, 4);
  assert.deepEqual(requestLog.map(item => item.path).sort(), [
    '/api/grh-executive', '/api/grh-executive', '/api/grh-quality', '/api/grh-quality',
  ]);
  assert.equal(requestLog.every(item => item.authorization.startsWith('Bearer ')), true);
});

test('RRHH source uses one secure experience and contains no raw contract access or source-backed literals', async () => {
  const [html, script] = await Promise.all([
    readFile(path.join(REPO, 'rrhh.html'), 'utf8'),
    readFile(path.join(REPO, 'js', 'rrhh.js'), 'utf8'),
  ]);
  const source = `${html}\n${script}`;
  const authIndex = html.indexOf('src="js/auth-fetch.js"');
  const secureIndex = html.indexOf('src="js/grh-secure-data.js"');
  const pageIndex = html.indexOf('src="js/rrhh.js"');
  assert.ok(authIndex >= 0 && authIndex < secureIndex && secureIndex < pageIndex);
  assert.match(script, /await global\.requireCapability\('navigation\.rrhh'\)/);
  assert.match(script, /async function init\(\)[\s\S]*if \(!await requirePageCapability\(\)\) return;[\s\S]*await loadDashboard\(\)/);
  assert.match(script, /retryButton\.addEventListener\('click', loadAuthorizedDashboard\)/);
  assert.match(script, /MuniGrhData\.loadExperience\(\{ timeoutMs: 10000 \}\)/);
  assert.doesNotMatch(script, /MuniGrhData\.(?:loadExecutive|loadQuality)/);
  assert.doesNotMatch(source, /\/api\/grh-data|artifact=(?:profile|semantic)|grh-semantic-v[01]/);
  assert.doesNotMatch(script, /\bfetch\s*\(|MuniAuth\.fetch|localStorage/);
  assert.equal((script.match(/sessionStorage/g) || []).length, 2, 'session storage is limited to preserving the denied-access notice');
  assert.match(script, /sessionStorage\.getItem\('mjunin_access_notice'\)[\s\S]*sessionStorage\.setItem\('mjunin_access_notice'/);
  assert.doesNotMatch(source, /\b856\b|\b88[.,]99\b|\b2026-07\b|\b2\.450\b|\b20\.534\b/);
  assert.doesNotMatch(html, /https?:\/\//i);
});

test('RRHH capability preflight redirects denied or malformed clients before every private contract', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  for (const scenario of [
    { name: 'low role denied by authoritative /me', authRole: 'DEMO' },
    { name: 'missing capability helper', navMode: 'missing' },
    { name: 'malformed capability helper', navMode: 'malformed' },
  ]) {
    const requestLog = [];
    const server = await createServer(requestLog, { unavailable: false }, scenario);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await seedSession(context);
      const page = await context.newPage();
      await page.goto(`${baseUrl}/rrhh.html`, { waitUntil: 'domcontentloaded' });
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

test('RRHH fails closed on 503 and retry recovers only after both projections return', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const availability = { unavailable: true };
  const server = await createServer(requestLog, availability);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await seedSession(context);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/rrhh.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loadError:not([hidden])');
  const failed = await page.evaluate(() => ({
    dashboardHidden: document.querySelector('#rrhhDashboard')?.hidden,
    title: document.querySelector('#errorTitle')?.textContent.trim(),
    message: document.querySelector('#errorMessage')?.textContent.trim(),
    displayedNumbers: Array.from(document.querySelectorAll('.rrhh-kpi-value'), node => node.textContent.trim()),
    publishedRows: document.querySelectorAll('.rrhh-bar-row, .rrhh-chart-point, #quarantineTableBody tr').length,
  }));
  assert.equal(failed.dashboardHidden, true);
  assert.equal(failed.title, 'Snapshot GRH no disponible');
  assert.match(failed.message, /No se muestran valores de ejemplo, datos crudos ni un corte anterior/);
  assert.equal(failed.displayedNumbers.every(value => value === '—'), true);
  assert.equal(failed.publishedRows, 0);
  assert.deepEqual(requestLog.map(item => item.path).sort(), ['/api/grh-executive', '/api/grh-quality']);

  availability.unavailable = false;
  await page.click('#retryButton');
  await page.waitForSelector('#rrhhDashboard[aria-busy="false"]:not([hidden])');
  const recovered = await page.evaluate(() => ({
    status: document.querySelector('#connectionStatusText')?.textContent.trim(),
    errorHidden: document.querySelector('#loadError')?.hidden,
    participants: document.querySelector('#kpiWorkforceParticipants')?.textContent.trim(),
  }));
  assert.equal(recovered.status, 'Proyecciones verificadas');
  assert.equal(recovered.errorHidden, true);
  assert.equal(recovered.participants, projections.executive.workforce.bySector.participantDisplay);
  assert.equal(requestLog.length, 4);
  assert.deepEqual(requestLog.slice(2).map(item => item.path).sort(), ['/api/grh-executive', '/api/grh-quality']);
  await context.close();
});
