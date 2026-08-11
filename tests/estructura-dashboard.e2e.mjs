import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';

import accessPolicy from '../shared/access-policy.cjs';
import {
  GRH_ORGANIZATION_ANALYTICS_ACTIONS,
  GRH_ORGANIZATION_ANALYTICS_LIMITS,
  inspectGrhOrganizationAnalyticsContract,
} from '../api/lib/grh-organization-analytics-contract.js';

const REPO = path.resolve(import.meta.dirname, '..');
const CONTRACT = 'grh-organization-analytics-v1';
const PRIVATE_EMAIL = 'estructura.qa@junin.gob.ar';
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

const round4 = value => Number(value.toFixed(4));

function dimensionRow({ code, label, registeredRecords, denominator, privacyStatus = 'released' }) {
  return {
    code,
    label,
    registeredRecords,
    sharePct: round4(registeredRecords / denominator * 100),
    recordsWithAbsence: null,
    absenceEvents: null,
    eventsPerRegisteredRecord: null,
    absencePrivacyStatus: 'protected',
    privacyStatus,
  };
}

function absenceRow({ code, label, registeredRecords, recordsWithAbsence, absenceEvents, privacyStatus = 'released' }) {
  return {
    code,
    label,
    registeredRecords,
    sharePct: round4(absenceEvents / 80 * 100),
    recordsWithAbsence,
    absenceEvents,
    eventsPerRegisteredRecord: round4(absenceEvents / registeredRecords),
    absencePrivacyStatus: 'released',
    privacyStatus,
  };
}

const PAYLOAD = Object.freeze({
  schemaVersion: CONTRACT,
  source: {
    canonicalSystem: 'GRH Junín · snapshot gobernado',
    sourceFile: 'GRH_JUNIN_2026-07.sql.gz',
    sourceSha256: '8cfe17751c48067563a6b609eb75e4ab73512fef131d2bb829ab0bd7364f4c28',
    snapshotAsOf: '2026-07-31',
  },
  privacy: {
    threshold: 10,
    containsPii: false,
    identifiersExported: false,
    labelsProtectedBeforeRanking: true,
    complementarySuppression: true,
  },
  coverage: {
    registeredRecords: 100,
    withOrganization: { records: 90, sharePct: 90 },
    withSector: { records: 85, sharePct: 85 },
    withOrganizationAndSector: { records: 80, sharePct: 80 },
    withAbsenceHistory: { records: 40, sharePct: 40 },
    absenceEvents: 80,
  },
  organizations: {
    dimension: 'organization',
    denominatorRecords: 90,
    categoryCount: 5,
    releasedCategoryCount: 3,
    protectedCategoryCount: 2,
    rows: [
      dimensionRow({ code: 101, label: 'Servicios Urbanos', registeredRecords: 35, recordsWithAbsence: 15, absenceEvents: 30, denominator: 90 }),
      dimensionRow({ code: 202, label: 'Gobierno y Comunidad', registeredRecords: 25, recordsWithAbsence: 10, absenceEvents: 20, denominator: 90 }),
      dimensionRow({ code: 303, label: 'Administración General', registeredRecords: 15, recordsWithAbsence: null, absenceEvents: null, denominator: 90 }),
      dimensionRow({ code: null, label: 'Otros grupos protegidos', registeredRecords: 15, recordsWithAbsence: 10, absenceEvents: 15, denominator: 90, privacyStatus: 'protected_aggregate' }),
    ],
  },
  sectors: {
    dimension: 'sector',
    denominatorRecords: 85,
    categoryCount: 4,
    releasedCategoryCount: 3,
    protectedCategoryCount: 1,
    rows: [
      dimensionRow({ code: 11, label: 'Servicios Públicos', registeredRecords: 40, recordsWithAbsence: 18, absenceEvents: 35, denominator: 85 }),
      dimensionRow({ code: 22, label: 'Administración', registeredRecords: 25, recordsWithAbsence: 10, absenceEvents: 20, denominator: 85 }),
      dimensionRow({ code: 33, label: 'Atención territorial', registeredRecords: 10, recordsWithAbsence: null, absenceEvents: null, denominator: 85 }),
      dimensionRow({ code: null, label: 'Otros grupos protegidos', registeredRecords: 10, recordsWithAbsence: null, absenceEvents: null, denominator: 85, privacyStatus: 'suppressed' }),
    ],
  },
  matrix: {
    rowDimension: 'organization',
    columnDimension: 'sector',
    rows: [
      { code: 101, label: 'Servicios Urbanos' },
      { code: 202, label: 'Gobierno y Comunidad' },
      { code: 303, label: 'Administración General' },
    ],
    columns: [
      { code: 11, label: 'Servicios Públicos' },
      { code: 22, label: 'Administración' },
      { code: 33, label: 'Atención territorial' },
    ],
    cells: [
      { organizationCode: 101, sectorCode: 11, registeredRecords: null, privacyStatus: 'primary_suppressed' },
      { organizationCode: 101, sectorCode: 22, registeredRecords: null, privacyStatus: 'complementary_suppressed' },
      { organizationCode: 101, sectorCode: 33, registeredRecords: 20, privacyStatus: 'released' },
      { organizationCode: 202, sectorCode: 11, registeredRecords: null, privacyStatus: 'complementary_suppressed' },
      { organizationCode: 202, sectorCode: 22, registeredRecords: null, privacyStatus: 'primary_suppressed' },
      { organizationCode: 202, sectorCode: 33, registeredRecords: 10, privacyStatus: 'released' },
      { organizationCode: 303, sectorCode: 11, registeredRecords: 12, privacyStatus: 'released' },
      { organizationCode: 303, sectorCode: 22, registeredRecords: 11, privacyStatus: 'released' },
      { organizationCode: 303, sectorCode: 33, registeredRecords: 0, privacyStatus: 'not_observed' },
    ],
    releasedCellCount: 4,
    protectedCellCount: 4,
    maxReleasedRecords: 20,
  },
  absenceRanking: {
    historical: true,
    denominatorRecords: 100,
    recordsWithAbsence: 40,
    absenceEvents: 80,
    rows: [
      absenceRow({ code: 101, label: 'Servicios Urbanos', registeredRecords: 35, recordsWithAbsence: 15, absenceEvents: 25 }),
      absenceRow({ code: null, label: 'Otros grupos protegidos', registeredRecords: 40, recordsWithAbsence: 15, absenceEvents: 35, privacyStatus: 'protected_aggregate' }),
      absenceRow({ code: 202, label: 'Gobierno y Comunidad', registeredRecords: 25, recordsWithAbsence: 10, absenceEvents: 20 }),
    ],
  },
  dataQuality: {
    missingOrganizationRecords: 10,
    missingSectorRecords: 15,
    missingBothRecords: 5,
    invalidEmployeeKeyRows: 2,
    unmatchedPersonRecords: 3,
    validAbsenceEvents: 85,
    quarantinedAbsenceEvents: 4,
    linkedAbsenceEvents: 80,
    unlinkedValidAbsenceEvents: 5,
    codedPositionRecords: 70,
    positionObservationRecords: 60,
    futureEffectivePositionObservationRecords: 5,
    firstFuturePositionDate: '2026-08-15',
    lastFuturePositionDate: '2026-12-01',
  },
  actions: GRH_ORGANIZATION_ANALYTICS_ACTIONS.map(action => ({ ...action })),
  limits: [...GRH_ORGANIZATION_ANALYTICS_LIMITS],
});

function clonePayload() {
  return structuredClone(PAYLOAD);
}

function fakeToken(role = 'INTENDENTE') {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'estructura-dashboard-qa',
    role,
    tenantId: 'tenant-junin-test',
    exp: Math.floor(Date.now() / 1000) + 600,
  })}.qa`;
}

async function createServer() {
  const state = {
    mode: 'success',
    role: 'INTENDENTE',
    analyticsRequests: [],
  };
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/api/auth/me') {
      const access = accessPolicy.getSessionAccessForUser({
        role: state.role,
        tenantId: 'tenant-junin-test',
        email: PRIVATE_EMAIL,
      });
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({
        user: {
          id: 'estructura-dashboard-qa',
          name: 'Control Ejecutivo QA',
          email: PRIVATE_EMAIL,
          role: state.role,
          tenantId: 'tenant-junin-test',
          capabilities: access.capabilities,
          accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
          homeProfile: access.homeProfile,
        },
      }));
      return;
    }
    if (url.pathname === '/api/grh-organization-analytics') {
      state.analyticsRequests.push({
        method: request.method,
        authorization: request.headers.authorization,
        accept: request.headers.accept,
        cacheControl: request.headers['cache-control'],
      });
      if (state.mode === 'forbidden') {
        response.writeHead(403, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: 'forbidden' }));
        return;
      }
      if (state.mode === 'unavailable') {
        response.writeHead(503, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: 'unavailable' }));
        return;
      }
      const payload = clonePayload();
      if (state.mode === 'missing-cell') payload.matrix.cells.pop();
      if (state.mode === 'coverage-drift') payload.dataQuality.missingOrganizationRecords += 1;
      if (state.mode === 'absence-drift') payload.absenceRanking.absenceEvents += 1;
      if (state.mode === 'dimension-absence-leak') {
        payload.organizations.rows[0].absencePrivacyStatus = 'released';
        payload.organizations.rows[0].recordsWithAbsence = 10;
        payload.organizations.rows[0].absenceEvents = 20;
        payload.organizations.rows[0].eventsPerRegisteredRecord = round4(20 / payload.organizations.rows[0].registeredRecords);
      }
      const contractHeader = state.mode === 'wrong-header' ? 'grh-organization-analytics-v0' : CONTRACT;
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES['.json'],
        'Cache-Control': 'no-store',
        'X-MuniControl-Contract': contractHeader,
      });
      response.end(JSON.stringify(payload));
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      response.writeHead(404, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
      response.end('{}');
      return;
    }

    const relative = url.pathname === '/estructura'
      ? 'estructura.html'
      : (url.pathname.slice(1) || 'estructura.html');
    const target = path.resolve(REPO, decodeURIComponent(relative));
    if (!target.startsWith(`${REPO}${path.sep}`)) {
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
  return { server, state, origin: `http://127.0.0.1:${server.address().port}` };
}

async function openDashboard(browser, origin, {
  viewport = { width: 1440, height: 1000 },
  role = 'INTENDENTE',
  versionedTheme = 'dark',
  legacyTheme = 'light',
} = {}) {
  const context = await browser.newContext({ viewport, colorScheme: versionedTheme });
  await context.addInitScript(({ token, roleName, canonicalTheme, oldTheme }) => {
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify({
      id: 'estructura-dashboard-qa',
      name: 'Control Ejecutivo QA',
      email: 'estructura.qa@junin.gob.ar',
      role: roleName,
      tenantId: 'tenant-junin-test',
    }));
    localStorage.setItem('municontrol-color-theme:v1', canonicalTheme);
    localStorage.setItem('govtech_theme', oldTheme);
    localStorage.removeItem('muni_sidebar_collapsed');
  }, {
    token: fakeToken(role),
    roleName: role,
    canonicalTheme: versionedTheme,
    oldTheme: legacyTheme,
  });
  const page = await context.newPage();
  const externalRequests = [];
  page.on('request', request => {
    if (new URL(request.url()).origin !== origin) externalRequests.push(request.url());
  });
  await page.goto(`${origin}/estructura`, { waitUntil: 'domcontentloaded' });
  return { context, page, externalRequests };
}

async function renderedAudit(page) {
  return page.evaluate(() => {
    const parseColor = value => {
      const match = String(value || '').match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const parts = match[1].replace('/', ' ').split(/[\s,]+/).filter(Boolean).map(Number);
      return [parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1];
    };
    const composite = (front, back) => {
      const alpha = front[3] + back[3] * (1 - front[3]);
      if (!alpha) return [0, 0, 0, 0];
      return [0, 1, 2].map(index =>
        (front[index] * front[3] + back[index] * back[3] * (1 - front[3])) / alpha
      ).concat(alpha);
    };
    const luminance = color => color.slice(0, 3).map(channel => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const ratio = (first, second) => {
      const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    const effectiveBackground = node => {
      const layers = [];
      let current = node;
      while (current instanceof Element) {
        const color = parseColor(getComputedStyle(current).backgroundColor);
        if (color && color[3] > 0) layers.push(color);
        if (color && color[3] >= 1) break;
        current = current.parentElement;
      }
      let result = [255, 255, 255, 1];
      for (let index = layers.length - 1; index >= 0; index -= 1) result = composite(layers[index], result);
      return result;
    };
    const visible = node => {
      const style = getComputedStyle(node);
      return node.getClientRects().length > 0 && style.display !== 'none' &&
        style.visibility !== 'hidden' && Number(style.opacity) > 0;
    };
    const selectorFor = node => `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${
      typeof node.className === 'string' && node.className.trim()
        ? `.${node.className.trim().replace(/\s+/g, '.')}`
        : ''
    }`;
    const textNodes = Array.from(document.querySelectorAll('body.structure-page *')).filter(node => {
      if (!visible(node) || node.matches('script, style, title, option, .structure-skip')) return false;
      return Array.from(node.childNodes).some(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
    });
    const textAudit = textNodes.map(node => {
      const style = getComputedStyle(node);
      const background = effectiveBackground(node);
      const rawColor = parseColor(style.color);
      const color = rawColor ? composite(rawColor, background) : null;
      return {
        selector: selectorFor(node),
        text: node.textContent.trim().slice(0, 60),
        contrast: color ? Number(ratio(color, background).toFixed(2)) : 0,
        fontSize: Number.parseFloat(style.fontSize),
      };
    });
    const boundarySelector = [
      '.structure-menu', '.structure-theme', '.structure-status', '.structure-kpi', '.structure-panel',
      '.structure-matrix-cell:not(.structure-matrix-column)', '.structure-absence-item',
      '.structure-quality-item', '.structure-alert', '.structure-comparison-card',
      '.structure-field select', '.structure-action', '.structure-retry'
    ].join(',');
    const boundaryAudit = Array.from(document.querySelectorAll(boundarySelector)).filter(visible).map(node => {
      const style = getComputedStyle(node);
      const outside = effectiveBackground(node.parentElement || node);
      const border = parseColor(style.borderTopColor);
      const resolved = border ? composite(border, outside) : outside;
      return {
        selector: selectorFor(node),
        width: Number.parseFloat(style.borderTopWidth) || 0,
        contrast: Number(ratio(resolved, outside).toFixed(2)),
        border: style.borderTopColor,
        outside,
        background: style.backgroundColor,
      };
    });
    return {
      theme: document.documentElement.dataset.theme,
      canonicalTheme: localStorage.getItem('municontrol-color-theme:v1'),
      legacyTheme: localStorage.getItem('govtech_theme'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      textContrastViolations: textAudit.filter(item => item.contrast < 4.49),
      fontFloorViolations: textAudit.filter(item => item.fontSize < 12),
      boundaryViolations: boundaryAudit.filter(item => item.width < 1 || item.contrast < 2.99),
      bottomDebug: (() => {
        const label = document.querySelector('.bottom-nav-label');
        const nav = document.querySelector('[data-muni-shell="bottom-nav"]');
        return label && nav ? {
          labelColor: getComputedStyle(label).color,
          itemColor: getComputedStyle(label.parentElement).color,
          itemBackground: getComputedStyle(label.parentElement).backgroundColor,
          navBackground: getComputedStyle(nav).backgroundColor,
          effective: effectiveBackground(label),
        } : null;
      })(),
    };
  });
}

async function waitForDashboard(page) {
  await page.locator('#structureDashboard').waitFor({ state: 'visible' });
  await page.locator('#organizationSnapshotStatus[data-state="ready"]').waitFor({ state: 'visible' });
}

test('fixture and browser client enforce the exact source-backed organization contract', async t => {
  const inspection = inspectGrhOrganizationAnalyticsContract(PAYLOAD);
  assert.deepEqual(inspection.errors, [], `fixture must remain canonical: ${inspection.errors.join(', ')}`);
  assert.equal(inspection.ok, true);

  const source = await readFile(path.join(REPO, 'js', 'grh-organization-analytics.js'), 'utf8');
  assert.match(source, /PAGE_CAPABILITY = 'navigation\.organization-analytics'/);
  assert.match(source, /MuniAuth\.fetch\(ENDPOINT,\s*\{[\s\S]*?method: 'GET'[\s\S]*?cache: 'no-store'[\s\S]*?redirect: 'error'/);
  assert.doesNotMatch(source, /method:\s*'(?:POST|PUT|PATCH|DELETE)'/);

  const { server, state, origin } = await createServer();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  await t.test('desktop renders metrics, privacy, comparison and capability-bound actions', async () => {
    state.mode = 'success';
    state.role = 'INTENDENTE';
    state.analyticsRequests.length = 0;
    const { context, page, externalRequests } = await openDashboard(browser, origin, {
      viewport: { width: 1440, height: 1000 },
      versionedTheme: 'dark',
      legacyTheme: 'light',
    });
    try {
      await waitForDashboard(page);
      assert.deepEqual(await page.locator('.structure-kpi-value').allTextContents(), ['100', '90%', '85%', '80%', '40%']);
      assert.equal(await page.locator('#organizationRanking .structure-bar').count(), 4);
      assert.equal(await page.locator('#sectorRanking .structure-bar').count(), 4);
      assert.equal(await page.locator('#organizationSectorMatrix [role="gridcell"]').count(), 9);
      assert.equal(await page.locator('#organizationSectorMatrix [role="gridcell"]', { hasText: 'Protegido' }).count(), 4);
      assert.equal(await page.locator('#organizationSectorMatrix [role="gridcell"]', { hasText: '—' }).count(), 0);
      assert.equal(await page.locator('#absenceRanking .structure-absence-item').count(), 3);
      assert.equal(await page.locator('#qualityPanel .structure-quality-item').count(), 7);
      assert.equal(await page.locator('#futureObservationPanel').isVisible(), true);
      assert.match(await page.locator('#futureObservationAlerts').innerText(), /5 observaciones posteriores al corte/);

      const organizationLink = page.locator('[data-analytics-deep-link="organization"][data-group-code="101"]').first();
      assert.equal(await organizationLink.getAttribute('href'), 'rrhh.html?organization=101&hasAbsence=true#peopleDirectory');
      const actionHrefs = await page.locator('#organizationAnalyticsActions a').evaluateAll(nodes =>
        nodes.map(node => node.getAttribute('href'))
      );
      assert.deepEqual(actionHrefs, [
        '/rrhh#peopleDirectory',
        '/rrhh?hasAbsence=true#peopleDirectory',
        '/calidad',
        '/reportes',
      ]);

      await page.locator('#comparisonDimension').selectOption('sector');
      await page.locator('#comparisonLeft').selectOption('33');
      await page.locator('#comparisonRight').selectOption('11');
      const comparisonText = await page.locator('#comparisonResult').innerText();
      assert.match(comparisonText, /Atención territorial/);
      assert.match(comparisonText, /Servicios Públicos/);
      assert.match(comparisonText, /Datos históricos de ausencia protegidos/);
      assert.equal(
        await page.locator('#comparisonResult [data-group-code="33"]').getAttribute('href'),
        'rrhh.html?sector=33&hasAbsence=true#peopleDirectory',
      );

      assert.equal(state.analyticsRequests.length, 1);
      assert.deepEqual([...new Set(state.analyticsRequests.map(request => request.method))], ['GET']);
      assert.match(state.analyticsRequests[0].authorization, /^Bearer /);
      assert.equal(state.analyticsRequests[0].accept, 'application/json');
      assert.equal(externalRequests.length, 0, `unexpected external requests: ${externalRequests.join(', ')}`);

      const audit = await renderedAudit(page);
      assert.equal(audit.theme, 'dark');
      assert.equal(audit.canonicalTheme, 'dark');
      assert.equal(audit.legacyTheme, 'dark');
      assert.equal(audit.overflow, 0);
      assert.deepEqual(audit.textContrastViolations, [], JSON.stringify(audit));
      assert.deepEqual(audit.fontFloorViolations, [], JSON.stringify(audit.fontFloorViolations));
      assert.deepEqual(audit.boundaryViolations, [], JSON.stringify(audit.boundaryViolations));
    } finally {
      await context.close();
    }
  });

  await t.test('mobile light theme keeps the document bounded and canonical theme wins over legacy', async () => {
    state.mode = 'success';
    state.role = 'INTENDENTE';
    const { context, page, externalRequests } = await openDashboard(browser, origin, {
      viewport: { width: 390, height: 844 },
      versionedTheme: 'light',
      legacyTheme: 'dark',
    });
    try {
      await waitForDashboard(page);
      assert.equal(await page.locator('#organizationExplorer').isVisible(), true);
      assert.equal(await page.locator('#absenceRiskPanel').isVisible(), true);
      assert.equal(await page.locator('#organizationCompare').isVisible(), true);
      const audit = await renderedAudit(page);
      assert.equal(audit.theme, 'light');
      assert.equal(audit.canonicalTheme, 'light');
      assert.equal(audit.legacyTheme, 'light');
      assert.equal(audit.overflow, 0);
      assert.deepEqual(audit.textContrastViolations, [], JSON.stringify(audit));
      assert.deepEqual(audit.fontFloorViolations, [], JSON.stringify(audit.fontFloorViolations));
      assert.deepEqual(audit.boundaryViolations, [], JSON.stringify(audit.boundaryViolations));
      assert.equal(externalRequests.length, 0, `unexpected external requests: ${externalRequests.join(', ')}`);
    } finally {
      await context.close();
    }
  });

  for (const [mode, label] of [
    ['wrong-header', 'header adulterado'],
    ['missing-cell', 'celda omitida'],
    ['coverage-drift', 'total de cobertura desalineado'],
    ['absence-drift', 'total histórico desalineado'],
    ['dimension-absence-leak', 'métrica histórica solapada'],
  ]) {
    await t.test(`fails closed for ${label}`, async () => {
      state.mode = mode;
      state.role = 'INTENDENTE';
      const { context, page } = await openDashboard(browser, origin);
      try {
        await page.locator('#organizationAnalyticsError').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#structureDashboard').isVisible(), false);
        assert.equal(await page.locator('#organizationAnalyticsErrorTitle').innerText(), 'Respuesta no verificable');
      } finally {
        await context.close();
      }
    });
  }

  await t.test('403 and 503 expose manual retry and never substitute demo values', async () => {
    for (const entry of [
      ['forbidden', 'Acceso no habilitado'],
      ['unavailable', 'Fuente temporalmente no disponible'],
    ]) {
      state.mode = entry[0];
      state.role = 'INTENDENTE';
      const { context, page } = await openDashboard(browser, origin);
      try {
        await page.locator('#organizationAnalyticsError').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#organizationAnalyticsErrorTitle').innerText(), entry[1]);
        assert.equal(await page.locator('#structureDashboard').isVisible(), false);
        state.mode = 'success';
        await page.locator('#organizationAnalyticsRetry').click();
        await waitForDashboard(page);
        assert.equal(await page.locator('.structure-kpi-value').first().innerText(), '100');
      } finally {
        await context.close();
      }
    }
  });

  await t.test('missing page capability redirects before requesting organization data', async () => {
    state.mode = 'success';
    state.role = 'TENANT_USER';
    state.analyticsRequests.length = 0;
    const { context, page } = await openDashboard(browser, origin, { role: 'TENANT_USER' });
    try {
      await page.waitForURL(/\/inicio\.html$/);
      assert.equal(state.analyticsRequests.length, 0);
    } finally {
      await context.close();
    }
  });
});
