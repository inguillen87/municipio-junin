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
import { buildGrhCloseProjection } from '../api/lib/grh-close-projection.js';

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
    close: buildGrhCloseProjection(semantic),
  };
})() : null;

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const PRIVATE_DATA_PATHS = new Set([
  '/api/grh-executive',
  '/api/grh-quality',
  '/api/grh-close',
  '/api/grh-data',
  '/api/reports',
  '/api/ai-analyze',
  '/api/raw',
]);

function authoritativeUser(role = 'INTENDENTE', malformedProjection = false) {
  const tenantId = 'tenant-junin-test';
  const access = accessPolicy.getSessionAccessForUser({ role, tenantId });
  assert.ok(access, `missing test access projection for ${role}`);
  const user = {
    id: 'qa-hacienda',
    name: 'QA Hacienda',
    role,
    tenantId,
    capabilities: access.capabilities,
    accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
    homeProfile: access.homeProfile,
  };
  return malformedProjection ? { ...user, capabilities: 'navigation.hacienda' } : user;
}

function fakeBrowserToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'qa-hacienda',
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
    if (PRIVATE_DATA_PATHS.has(url.pathname)) {
      const contract = url.pathname.slice('/api/grh-'.length);
      requestLog.push({
        contract,
        pathname: url.pathname,
        authorization: request.headers.authorization || '',
      });
      if (!['/api/grh-executive', '/api/grh-quality', '/api/grh-close'].includes(url.pathname)) {
        response.writeHead(410, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: 'Contrato no utilizado por Hacienda' }));
        return;
      }
      if (options.failContract === contract) {
        response.writeHead(503, {
          'Content-Type': CONTENT_TYPES['.json'],
          'Cache-Control': 'no-store',
        });
        response.end(JSON.stringify({ error: 'Contrato gobernado no disponible' }));
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
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES['.json'],
        'Cache-Control': 'no-store',
      });
      response.end(JSON.stringify({ user: authoritativeUser(
        options.authRole || 'INTENDENTE',
        options.malformedProjection === true,
      ) }));
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
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES[path.extname(target)] || 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function authenticatedContext(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: viewport.reducedMotion,
  });
  await context.addInitScript(({ token }) => {
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify({
      id: 'qa-hacienda',
      name: 'QA Hacienda',
      role: 'INTENDENTE',
      tenantId: 'tenant-junin-test',
    }));
  }, { token: fakeBrowserToken() });
  return context;
}

test('Hacienda source uses only the secure GRH experience client and compiles inline scripts', async () => {
  const html = await readFile(path.join(REPO, 'hacienda.html'), 'utf8');
  assert.doesNotMatch(html, /\/api\/grh-data|artifact=semantic|MuniAuth\.fetch|calculation_control_series|cross_source_reconciliation/);
  assert.match(html, /<script src="js\/auth-fetch\.js"><\/script>\s*<script src="js\/grh-secure-data\.js"><\/script>/);
  assert.match(html, /<script src="js\/grh-close-data\.js"><\/script>/);
  assert.match(html, /MuniGrhData\.loadExperience\(\{\s*timeoutMs:\s*10000\s*\}\)/);
  assert.match(html, /MuniGrhClose\.load\(\{\s*timeoutMs:\s*10000\s*\}\)/);
  assert.match(html, /await window\.requireCapability\('navigation\.hacienda'\)/);
  assert.match(html, /async function init\(\)[\s\S]*if \(!await requirePageCapability\(\)\) return;[\s\S]*await loadExperience\(\)/);
  assert.match(html, /retryLoad\.addEventListener\('click', loadAuthorizedExperience\)/);
  assert.match(html, /row\.privacyStatus !== 'released'/);
  assert.match(html, /La reconciliación es global/);

  const inlineScripts = [...html.matchAll(
    /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi,
  )].map(match => match[1]);
  assert.ok(inlineScripts.length >= 2);
  inlineScripts.forEach(script => assert.doesNotThrow(() => new Function(script)));
});

test('Hacienda capability preflight redirects denied or malformed clients before every private contract', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  for (const scenario of [
    { name: 'low role denied by authoritative /me', authRole: 'DEMO' },
    { name: 'malformed authoritative projection', malformedProjection: true },
    { name: 'missing capability helper', navMode: 'missing' },
    { name: 'malformed capability helper', navMode: 'malformed' },
  ]) {
    const requestLog = [];
    const server = await createServer(requestLog, scenario);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const context = await authenticatedContext(browser, {
        width: 390,
        height: 844,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/hacienda.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(`${baseUrl}/inicio.html`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(75);
      assert.deepEqual(requestLog, [], `${scenario.name} must issue zero private requests`);
      await context.close();
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }
});

test('Hacienda renders released compensation and global quality on desktop, mobile and print', {
  skip: !HAS_PRIVATE_GRH,
}, async t => {
  const requestLog = [];
  const server = await createServer(requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const releasedRows = PROJECTIONS.executive.compensation.series.filter(
    row => row.privacyStatus === 'released',
  );
  const suppressedRows = PROJECTIONS.executive.compensation.series.filter(
    row => row.privacyStatus !== 'released',
  );
  const releasedCloseRows = PROJECTIONS.close.series.filter(
    row => row.privacyStatus === 'released',
  );
  const latestClose = releasedCloseRows.at(-1);

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000, reducedMotion: 'no-preference' },
    { name: 'mobile', width: 390, height: 844, reducedMotion: 'reduce' },
  ]) {
    const context = await authenticatedContext(browser, viewport);
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const externalRequests = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
      if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url());
    });

    await page.goto(`${baseUrl}/hacienda.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#haciendaDashboard[aria-busy="false"]');
    const result = await page.evaluate(() => ({
      dataHidden: document.querySelector('#haciendaDataViews')?.hidden,
      errorHidden: document.querySelector('#loadError')?.hidden,
      source: document.querySelector('#topbarSourceText')?.textContent.trim(),
      sourceFile: document.querySelector('#sourceFile')?.textContent.trim(),
      sourceHash: document.querySelector('#sourceHash')?.textContent.trim(),
      published: document.querySelector('#periodCountChip')?.textContent.trim(),
      protectedCount: document.querySelector('#protectedPeriodChip')?.textContent.trim(),
      protectedNote: document.querySelector('#protectedPeriodsNote')?.textContent.trim(),
      quality: document.querySelector('#equationGross')?.textContent.trim(),
      reconciliation: document.querySelector('#kpiReconciliation')?.textContent.trim(),
      reconciliationNote: document.querySelector('#kpiReconciliationNote')?.textContent.trim(),
      kpiGross: document.querySelector('#kpiGross')?.textContent.trim(),
      tableRows: document.querySelectorAll('#periodRows tr').length,
      qualityBars: document.querySelectorAll('#compositionBars [role="progressbar"]').length,
      chartPaths: document.querySelectorAll('#payrollChart path').length,
      chartCircles: document.querySelectorAll('#payrollChart circle').length,
      closeOptions: document.querySelectorAll('#closePeriodSelect option').length,
      closeYearGroups: document.querySelectorAll('#closePeriodSelect optgroup').length,
      closeSelected: document.querySelector('#closePeriodSelect')?.value,
      closeBars: document.querySelectorAll('#closeBridge rect').length,
      closeViewBoxWidth: Number(document.querySelector('#closeBridge svg')?.getAttribute('viewBox')?.split(' ')[2]),
      closeLabelHeight: document.querySelector('#closeBridge svg text:last-of-type')?.getBoundingClientRect().height,
      closeParticipants: document.querySelector('#closeParticipants')?.textContent.trim(),
      closeCoverage: document.querySelector('#closeCoverage')?.textContent.trim(),
      closeExactRate: document.querySelector('#closeExactRate')?.textContent.trim(),
      closeValueAgreement: document.querySelector('#closeValueAgreement')?.textContent.trim(),
      closeDeltas: document.querySelectorAll('#closeDeltaList .hac-close-delta').length,
      closeCopy: document.querySelector('#closeReconciliationCopy')?.textContent.trim(),
      pageText: document.querySelector('#haciendaDataViews')?.innerText || '',
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));

    assert.equal(result.dataHidden, false);
    assert.equal(result.errorHidden, true);
    assert.match(result.source, /GRH.*proyecciones conciliadas.*calidad/i);
    assert.equal(result.sourceFile, PROJECTIONS.executive.source.sourceFile);
    assert.equal(result.sourceHash, PROJECTIONS.executive.source.sourceSha256);
    assert.equal(result.published, releasedRows.length.toLocaleString('es-AR'));
    assert.equal(result.protectedCount, suppressedRows.length.toLocaleString('es-AR'));
    assert.match(result.protectedNote, new RegExp(`${suppressedRows.length} períodos.*k=10.*omiten`, 'i'));
    assert.equal(result.quality, '88,99/100');
    assert.equal(result.reconciliation, '63,9%');
    assert.match(result.reconciliationNote, /Global.*acuerdo de valores.*no certifica pago/i);
    assert.match(result.kpiGross, /u\.m\.$/);
    assert.equal(result.tableRows, Math.min(10, releasedRows.length));
    assert.equal(result.qualityBars, 4);
    assert.equal(result.chartPaths, 3);
    assert.equal(result.chartCircles, Math.min(12, releasedRows.length) * 3);
    assert.equal(result.closeOptions, releasedCloseRows.length);
    assert.equal(result.closeYearGroups, new Set(releasedCloseRows.map(row => row.period.slice(0, 4))).size);
    assert.equal(result.closeSelected, latestClose.period);
    assert.equal(result.closeBars, 5);
    assert.ok(result.closeViewBoxWidth <= Math.min(760, viewport.width - 56) + 1);
    assert.ok(result.closeLabelHeight >= 7, `${viewport.name} close chart labels must remain legible`);
    assert.equal(result.closeParticipants, latestClose.participantCount.toLocaleString('es-AR'));
    assert.equal(result.closeCoverage, `${latestClose.reconciliation.runCoveragePct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`);
    assert.equal(result.closeExactRate, `${latestClose.reconciliation.metricExactRatePct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`);
    assert.equal(result.closeValueAgreement, `${latestClose.reconciliation.valueAgreementPct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`);
    assert.equal(result.closeDeltas, PROJECTIONS.close.comparison.status === 'released' ? 9 : 0);
    assert.match(result.closeCopy, /No reutiliza el score global/i);
    assert.equal(result.pageText.includes('<10'), false);
    for (const row of suppressedRows) {
      if (row.period) assert.equal(result.pageText.includes(row.period), false);
    }
    assert.equal(result.overflow, 0, `${viewport.name} must not overflow horizontally`);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(externalRequests, []);

    const previousClose = releasedCloseRows.at(-2);
    await page.selectOption('#closePeriodSelect', previousClose.period);
    await page.waitForFunction(expected =>
      document.querySelector('#closeValueAgreement')?.textContent.trim() === expected,
    `${previousClose.reconciliation.valueAgreementPct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`);
    assert.match(
      await page.locator('#closeBridgeCaption').textContent(),
      new RegExp(previousClose.period.slice(0, 4)),
    );

    await page.selectOption('#periodRange', '24');
    await page.waitForFunction(expected =>
      document.querySelectorAll('#payrollChart circle').length === expected,
    Math.min(24, releasedRows.length) * 3);

    await page.emulateMedia({ media: 'print' });
    const printState = await page.evaluate(() => ({
      dataVisible: getComputedStyle(document.querySelector('#haciendaDataViews')).display !== 'none',
      sidebarHidden: getComputedStyle(document.querySelector('#sidebar')).display === 'none',
      simulatorHidden: getComputedStyle(document.querySelector('.hac-simulator')).display === 'none',
      sourceVisible: document.querySelector('#sourceHash')?.getClientRects().length > 0,
    }));
    assert.deepEqual(printState, {
      dataVisible: true,
      sidebarHidden: true,
      simulatorHidden: true,
      sourceVisible: true,
    });
    await context.close();
  }

  assert.equal(requestLog.length, 6);
  assert.deepEqual(
    requestLog.map(item => item.contract).sort(),
    ['close', 'close', 'executive', 'executive', 'quality', 'quality'],
  );
  assert.equal(requestLog.every(item => item.authorization.startsWith('Bearer ')), true);
  assert.equal(requestLog.some(item => /grh-data|profile|semantic/i.test(item.pathname)), false);
});

test('Hacienda fails closed and retries when the monthly close projection returns 503', {
  skip: !HAS_PRIVATE_GRH,
}, async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { failContract: 'close' });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await authenticatedContext(browser, {
    width: 390,
    height: 844,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/hacienda.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#haciendaDashboard[aria-busy="false"]');
  const result = await page.evaluate(() => ({
    dataHidden: document.querySelector('#haciendaDataViews')?.hidden,
    kpiVisible: document.querySelector('#kpiGross')?.getClientRects().length > 0,
    errorHidden: document.querySelector('#loadError')?.hidden,
    error: document.querySelector('#loadErrorMessage')?.textContent.trim(),
    source: document.querySelector('#topbarSourceText')?.textContent.trim(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));

  assert.equal(result.dataHidden, true);
  assert.equal(result.kpiVisible, false);
  assert.equal(result.errorHidden, false);
  assert.match(result.error, /No se muestran datos parciales, antiguos ni simulados/i);
  assert.doesNotMatch(result.error, /grh-data|profile|semantic/i);
  assert.match(result.source, /proyecciones GRH no disponibles/i);
  assert.ok(result.overflow <= 1);
  assert.ok(
    consoleErrors.every(message => /503|Service Unavailable/i.test(message)),
    `only the expected 503 browser diagnostic is allowed: ${consoleErrors.join(' | ')}`,
  );
  assert.deepEqual(pageErrors, []);

  const requestsBeforeRetry = requestLog.length;
  const retryResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/grh-close' && response.status() === 503
  );
  await page.click('#retryLoad');
  await retryResponse;
  await page.waitForSelector('#loadError:not([hidden])');
  assert.ok(requestLog.length > requestsBeforeRetry);
  assert.equal(requestLog.every(item => item.authorization.startsWith('Bearer ')), true);
  assert.equal(requestLog.some(item => /grh-data|profile|semantic/i.test(item.pathname)), false);
  await context.close();
});
