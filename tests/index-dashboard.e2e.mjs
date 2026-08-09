import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { buildGrhCloseProjection } from '../api/lib/grh-close-projection.js';
import { buildGrhExecutiveProjection } from '../api/lib/grh-executive-projection.js';
import { buildGrhQualityProjection } from '../api/lib/grh-quality-projection.js';
import accessPolicy from '../shared/access-policy.cjs';

const { ACCESS_POLICY_VERSION, getSessionAccessForUser } = accessPolicy;

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
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function fakeBrowserToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'qa-index',
    role: 'INTENDENTE',
    tenantId: 'tenant-junin-test',
    exp: Math.floor(Date.now() / 1000) + 600,
  })}.qa`;
}

function projectedUser(role = 'INTENDENTE', tenantId = 'tenant-junin-test') {
  const base = {
    id: `qa-index-${role.toLowerCase()}`,
    name: `${role} QA`,
    email: `${role.toLowerCase()}@qa.invalid`,
    role,
    tenantId,
    tenant: tenantId ? { id: tenantId, name: 'Municipio QA', shortName: 'QA' } : null,
  };
  const access = getSessionAccessForUser(base);
  assert.ok(access, `expected a governed session projection for ${role}`);
  return {
    ...base,
    capabilities: [...access.capabilities],
    accessPolicyVersion: ACCESS_POLICY_VERSION,
    homeProfile: {
      variant: access.homeProfile.variant,
      defaultPath: access.homeProfile.defaultPath,
      priorityCapabilities: [...access.homeProfile.priorityCapabilities],
    },
  };
}

function contrastRatio(foreground, background) {
  const luminance = value => {
    const channels = String(value).match(/[\d.]+/g)?.slice(0, 3).map(Number);
    assert.equal(channels?.length, 3, `expected an RGB color, received ${value}`);
    const linear = channels.map(channel => {
      const normalized = channel / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

async function createServer(requestLog, options = {}) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const governedContracts = {
      '/api/grh-executive': 'executive',
      '/api/grh-quality': 'quality',
      '/api/grh-close': 'close',
    };
    const contract = governedContracts[url.pathname];
    if (contract) {
      requestLog.push({
        contract,
        pathname: url.pathname,
        requestTarget: request.url,
        authorization: request.headers.authorization || '',
      });
      if (options[`${contract}Unavailable`]) {
        response.writeHead(503, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: `${contract} projection unavailable` }));
        return;
      }
      let payload = PROJECTIONS[contract];
      if (contract === 'close' && options.closeSourceMismatch) {
        payload = JSON.parse(JSON.stringify(payload));
        payload.source.sourceSha256 = 'f'.repeat(64);
      }
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store, private' });
      response.end(JSON.stringify(payload));
      return;
    }
    if (url.pathname === '/api/auth/me') {
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({
        user: options.authUser || projectedUser(),
      }));
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
      id: 'qa-index', name: 'Intendencia QA', role: 'INTENDENTE', tenantId: 'tenant-junin-test',
    }));
  }, { token: fakeBrowserToken() });
}

test('main executive dashboard renders only source-backed GRH contracts', { skip: !HAS_PRIVATE_GRH }, async t => {
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
    const rawContractRequests = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('request', request => {
      if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url());
      const pathname = new URL(request.url()).pathname;
      if (/\/api\/(?:grh-data|.*profile|.*semantic)/i.test(pathname)) rawContractRequests.push(pathname);
    });

    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#executiveDashboard[aria-busy="false"]');
    const result = await page.evaluate(() => ({
      snapshot: document.querySelector('#snapshotChip')?.textContent.trim(),
      participants: document.querySelector('#kpiParticipants')?.textContent.trim(),
      quality: document.querySelector('#kpiQuality')?.textContent.trim(),
      cross: document.querySelector('#kpiCrossScore')?.textContent.trim(),
      agreement: document.querySelector('#kpiAgreement')?.textContent.trim(),
      coverage: document.querySelector('#kpiCoverage')?.textContent.trim(),
      sourceCount: document.querySelector('#sourceCountChip')?.textContent.trim(),
      closePrivacy: document.querySelector('#monthlyCloseBrief')?.dataset.privacyThreshold,
      closePeriod: document.querySelector('#closePeriodBadge')?.textContent.trim(),
      closeParticipants: document.querySelector('#closeParticipants')?.textContent.trim(),
      closeControl: document.querySelector('#closeControlStatus')?.textContent.trim(),
      closeControlNote: document.querySelector('#closeControlNote')?.textContent.trim(),
      closeCoverage: document.querySelector('#closeCoverage')?.textContent.trim(),
      closeExactness: document.querySelector('#closeExactness')?.textContent.trim(),
      closeAgreement: document.querySelector('#closeAgreement')?.textContent.trim(),
      closeComparison: document.querySelector('#closeComparisonTitle')?.textContent.trim(),
      closeParticipantDelta: document.querySelector('#closeParticipantDelta')?.textContent.trim(),
      closeCoverageDelta: document.querySelector('#closeCoverageDelta')?.textContent.trim(),
      closeExactnessDelta: document.querySelector('#closeExactnessDelta')?.textContent.trim(),
      closeAgreementDelta: document.querySelector('#closeAgreementDelta')?.textContent.trim(),
      closeBriefText: document.querySelector('#monthlyCloseBrief')?.textContent.replace(/\s+/g, ' ').trim(),
      globalLabels: Array.from(document.querySelectorAll('.exec-stat-label')).map(node => node.textContent.trim()),
      kpiCount: document.querySelectorAll('.exec-stat').length,
      chartCount: document.querySelectorAll('#calculationChart svg').length,
      costRows: document.querySelectorAll('#costCenterRanks .exec-rank-item').length,
      sectorRows: document.querySelectorAll('#sectorRanks .exec-rank-item').length,
      costProtected: document.querySelector('#costCenterRanks [data-privacy-status="protected_aggregate"] .exec-rank-label')?.textContent.trim(),
      sectorProtected: document.querySelector('#sectorRanks [data-privacy-status="protected_aggregate"] .exec-rank-label')?.textContent.trim(),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      errorVisible: !document.querySelector('#loadError')?.hidden,
    }));

    assert.equal(result.snapshot, '6 ago 2026');
    assert.equal(result.participants, '856');
    assert.equal(result.quality, '88,99/100');
    assert.equal(result.cross, '63,9%');
    assert.equal(result.agreement, '19,0%');
    assert.equal(result.coverage, '97,8%');
    assert.equal(result.sourceCount, '3/3');
    assert.equal(result.closePrivacy, '10');
    assert.equal(result.closePeriod, 'jul 2026 · k≥10');
    assert.equal(result.closeParticipants, '856');
    assert.equal(result.closeControl, 'Dentro de tolerancia');
    assert.equal(result.closeControlNote, 'No exacta; permanece dentro del umbral.');
    assert.equal(result.closeCoverage, '100,0%');
    assert.equal(result.closeExactness, '40,0%');
    assert.equal(result.closeAgreement, '6,5%');
    assert.equal(result.closeComparison, 'jun 2026 → jul 2026');
    assert.equal(result.closeParticipantDelta, '+1');
    assert.equal(result.closeCoverageDelta, '0,0 pp');
    assert.equal(result.closeExactnessDelta, '0,0 pp');
    assert.equal(result.closeAgreementDelta, '+5,8 pp');
    assert.equal(result.globalLabels.includes('Score cross-source global'), true);
    assert.equal(result.globalLabels.includes('Acuerdo de valores global'), true);
    assert.equal(result.globalLabels.includes('Cobertura global de corridas'), true);
    assert.doesNotMatch(result.closeBriefText, /(?:\$|\bARS\b|\bCBU\b|\bCUIL\b|\bDNI\b|nombre|apellido|companyCode|sourceCode|\blabel\b|concepto|u\. fuente|causa|pago|contable)/i);
    assert.equal(result.kpiCount, 6);
    assert.equal(result.chartCount, 1);
    assert.equal(result.costRows, 6);
    assert.equal(result.sectorRows, 6);
    assert.equal(result.costProtected, 'Otros (celdas protegidas)');
    assert.equal(result.sectorProtected, 'Otros (celdas protegidas)');
    assert.equal(result.overflow, 0, `${viewport.name} must not overflow horizontally`);
    assert.equal(result.errorVisible, false);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(rawContractRequests, []);

    await page.click('#execThemeToggle');
    await page.waitForFunction(() => {
      const summary = document.querySelector('.exec-close-summary');
      const eyebrow = document.querySelector('.exec-close-eyebrow');
      return document.documentElement.getAttribute('data-theme') === 'light' &&
        getComputedStyle(summary).color !== 'rgb(131, 148, 173)' &&
        getComputedStyle(eyebrow).color !== 'rgb(80, 211, 196)';
    });
    const lightTheme = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      mutedVariable: getComputedStyle(document.documentElement).getPropertyValue('--exec-muted').trim(),
      tealVariable: getComputedStyle(document.documentElement).getPropertyValue('--exec-teal').trim(),
      summaryColor: getComputedStyle(document.querySelector('.exec-close-summary')).color,
      eyebrowColor: getComputedStyle(document.querySelector('.exec-close-eyebrow')).color,
      labelColor: getComputedStyle(document.querySelector('.exec-close-metric span')).color,
    }));
    assert.equal(lightTheme.theme, 'light');
    const conservativeLightBackground = 'rgb(234, 245, 244)';
    assert.ok(
      contrastRatio(lightTheme.summaryColor, conservativeLightBackground) >= 4.5,
      `summary contrast must pass AA: ${JSON.stringify(lightTheme)}`
    );
    assert.ok(
      contrastRatio(lightTheme.eyebrowColor, conservativeLightBackground) >= 4.5,
      `eyebrow contrast must pass AA: ${JSON.stringify(lightTheme)}`
    );
    assert.ok(
      contrastRatio(lightTheme.labelColor, conservativeLightBackground) >= 4.5,
      `label contrast must pass AA: ${JSON.stringify(lightTheme)}`
    );
    await context.close();
  }

  assert.equal(requestLog.length, 6);
  assert.deepEqual(requestLog.map(item => item.contract).sort(), ['close', 'close', 'executive', 'executive', 'quality', 'quality']);
  assert.deepEqual([...new Set(requestLog.map(item => item.pathname))].sort(), [
    '/api/grh-close',
    '/api/grh-executive',
    '/api/grh-quality',
  ]);
  assert.equal(requestLog.every(item => item.requestTarget === item.pathname), true, 'governed requests must use exact endpoints without query variants');
  assert.equal(requestLog.every(item => item.authorization.startsWith('Bearer ')), true);
  assert.equal(requestLog.some(item => /grh-data|profile|semantic/i.test(item.pathname)), false);
});

test('main executive dashboard performs zero GRH requests for a role without dashboard capability', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { authUser: projectedUser('TENANT_USER') });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await seedSession(context);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(`${baseUrl}/inicio.html`);
  await page.waitForSelector('#workspaceMain[aria-busy="false"]');

  assert.deepEqual(requestLog, []);
  assert.equal(await page.locator('[data-capability="navigation.dashboard"]').count(), 0);
  await context.close();
});

test('main executive dashboard revalidates dashboard capability before every retry', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  for (const override of ['missing', 'truthy-malformed', 'throws']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await seedSession(context);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#executiveDashboard[aria-busy="false"]');
    const requestsBeforeRetry = requestLog.length;
    await page.evaluate(mode => {
      window.requireCapability = mode === 'missing'
        ? undefined
        : mode === 'throws'
          ? async function () { throw new Error('capability helper unavailable'); }
          : async function () { return { allowed: true }; };
    }, override);
    await page.locator('#retryLoad').dispatchEvent('click');
    await page.waitForURL(`${baseUrl}/inicio.html`);
    await page.waitForSelector('#accessNotice:not([hidden])');
    await page.waitForFunction(() => document.activeElement?.id === 'accessNotice');
    assert.match(await page.textContent('#accessNotice'), /no tiene habilitada/i, override);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'accessNotice', override);
    assert.equal(requestLog.length, requestsBeforeRetry, `${override} retry must issue zero new GRH requests`);
    await context.close();
  }
});

test('main executive dashboard fails closed and retries when the monthly close returns 503', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { closeUnavailable: true });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await seedSession(context);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loadError:not([hidden])');
  const result = await page.evaluate(() => ({
    dataHidden: document.querySelector('#dataViews')?.hidden,
    busy: document.querySelector('#executiveDashboard')?.getAttribute('aria-busy'),
    error: document.querySelector('#loadErrorMessage')?.textContent.trim(),
  }));
  assert.equal(result.dataHidden, true);
  assert.equal(result.busy, 'false');
  assert.match(result.error, /proyecciones|GRH|disponible/i);
  const requestsBeforeRetry = requestLog.length;
  const retryResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/grh-close' && response.status() === 503
  );
  await page.click('#retryLoad');
  await retryResponse;
  await page.waitForSelector('#loadError:not([hidden])');
  assert.ok(requestLog.length > requestsBeforeRetry, 'retry must start a new governed projection request');
  assert.equal(requestLog.filter(item => item.contract === 'close').length >= 2, true);
  assert.equal(requestLog.every(item => item.requestTarget === item.pathname), true);
  assert.equal(requestLog.some(item => /grh-data|profile|semantic/i.test(item.pathname)), false);
  await context.close();
});

test('main executive dashboard fails closed when close provenance mismatches the executive source', { skip: !HAS_PRIVATE_GRH }, async t => {
  const requestLog = [];
  const server = await createServer(requestLog, { closeSourceMismatch: true });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await seedSession(context);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loadError:not([hidden])');
  const result = await page.evaluate(() => ({
    dataHidden: document.querySelector('#dataViews')?.hidden,
    busy: document.querySelector('#executiveDashboard')?.getAttribute('aria-busy'),
    error: document.querySelector('#loadErrorMessage')?.textContent.trim(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  assert.equal(result.dataHidden, true);
  assert.equal(result.busy, 'false');
  assert.match(result.error, /misma fuente|mismo corte|proyecciones GRH/i);
  assert.equal(result.overflow, 0);
  assert.deepEqual(requestLog.map(item => item.contract).sort(), ['close', 'executive', 'quality']);
  assert.equal(requestLog.every(item => item.requestTarget === item.pathname), true);
  assert.equal(requestLog.every(item => item.authorization.startsWith('Bearer ')), true);
  assert.equal(requestLog.some(item => /grh-data|profile|semantic/i.test(item.pathname)), false);
  await context.close();
});
