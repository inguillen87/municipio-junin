import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

import accessPolicy from '../shared/access-policy.cjs';
import {
  GRH_ORGANIZATION_ANALYTICS_ACTIONS,
  GRH_ORGANIZATION_ANALYTICS_LIMITS,
  GRH_ORGANIZATION_ANALYTICS_SCHEMA_VERSION,
  inspectGrhOrganizationAnalyticsContract,
} from '../api/lib/grh-organization-analytics-contract.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND_CONFIG = path.join(REPO, 'frontend', 'vite.config.ts');
const CONTRACT_HEADER = 'x-municontrol-contract';
const AUTH_CONTRACT = 'municontrol-auth-me-v1';
const ANALYTICS_CONTRACT = GRH_ORGANIZATION_ANALYTICS_SCHEMA_VERSION;
const MUNIGUIA_STUB_SOURCE = 'export async function mountMuniGuia(){return true} export function unmountMuniGuia(){}';
const PAGE_CAPABILITY = 'navigation.organization-analytics';
const TENANT_ID = 'tenant-structure-e2e';
const SOURCE_SHA = '8cfe17751c48067563a6b609eb75e4ab73512fef131d2bb829ab0bd7364f4c28';
const SNAPSHOT = '2026-08-06';
const SCREENSHOTS = Object.freeze({
  desktop: path.join(tmpdir(), 'municontrol-estructura-1440-dark.png'),
  mobile: path.join(tmpdir(), 'municontrol-estructura-390-light.png'),
  forced: path.join(tmpdir(), 'municontrol-estructura-320-forced-colors.png'),
});

const AUTH_CLIENT_SOURCE = `
  (() => {
    window.MuniAuth = Object.freeze({
      async fetch(input, init = {}) {
        const url = new URL(input instanceof Request ? input.url : input, window.location.href);
        if (url.origin !== window.location.origin) throw new Error('UNSAFE_ORIGIN');
        const headers = new Headers(init.headers || {});
        if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer governed-e2e-token');
        return window.fetch(input, { ...init, headers });
      },
      getToken() { return 'governed-e2e-token'; },
      isAuthError() { return false; }
    });
  })();
`;

const round4 = value => Number(value.toFixed(4));
const share = (value, total) => round4(value / total * 100);

const ORGANIZATION_LABELS = Object.freeze([
  'Servicios Urbanos',
  'Gobierno y Comunidad',
  'Administración General',
  'Desarrollo Territorial',
  'Cultura y Educación',
  'Salud Comunitaria',
  'Producción Local',
  'Ambiente Municipal',
]);
const SECTOR_LABELS = Object.freeze([
  'Servicios Públicos',
  'Administración',
  'Atención Territorial',
  'Obras Públicas',
  'Desarrollo Humano',
  'Cultura',
  'Deportes',
  'Compras',
]);
const REGISTERED_COUNTS = Object.freeze([160, 140, 120, 100, 90, 70, 60, 60]);
const ABSENCE_PEOPLE = Object.freeze([40, 35, 30, 25, 20, 15, 10, 10]);
const ABSENCE_EVENTS = Object.freeze([80, 70, 60, 50, 40, 30, 20, 20]);
const PAYROLL_COUNTS = Object.freeze([180, 140, 120, 100, 90, 70, 60, 40]);

function dimensionRows(labels, protectedCategoryCount = 0) {
  return labels.map((label, index) => ({
    ...(protectedCategoryCount > 0 && index === labels.length - 1
      ? { code: null, label: 'Otros grupos protegidos', privacyStatus: 'protected_aggregate' }
      : { code: index + 1, label, privacyStatus: 'released' }),
    registeredRecords: REGISTERED_COUNTS[index],
    sharePct: share(REGISTERED_COUNTS[index], 800),
    recordsWithAbsence: null,
    absenceEvents: null,
    eventsPerRegisteredRecord: null,
    absencePrivacyStatus: 'protected',
  }));
}

function absenceRows() {
  return ORGANIZATION_LABELS.map((label, index) => ({
    ...(index === ORGANIZATION_LABELS.length - 1
      ? { code: null, label: 'Otros grupos protegidos', privacyStatus: 'protected_aggregate' }
      : { code: index + 1, label, privacyStatus: 'released' }),
    registeredRecords: REGISTERED_COUNTS[index],
    sharePct: share(ABSENCE_EVENTS[index], 370),
    recordsWithAbsence: ABSENCE_PEOPLE[index],
    absenceEvents: ABSENCE_EVENTS[index],
    eventsPerRegisteredRecord: round4(ABSENCE_EVENTS[index] / REGISTERED_COUNTS[index]),
    absencePrivacyStatus: 'released',
  }));
}

function workforceRanking(labels, counts = PAYROLL_COUNTS) {
  return {
    threshold: 10,
    totalParticipants: 800,
    participantDisplay: '800',
    privacyStatus: 'released',
    rows: labels.map((label, index) => ({
      companyCode: 101,
      sourceCode: index + 1,
      label,
      participants: counts[index],
      participantDisplay: String(counts[index]),
      sharePct: share(counts[index], 800),
      privacyStatus: 'released',
    })),
  };
}

function activitySeries({ participantStart, valueStart, valueStep }) {
  return Array.from({ length: 8 }, (_, index) => {
    const participants = participantStart + index * 5;
    return {
      period: String(2019 + index),
      value: valueStart + index * valueStep,
      participantCount: participants,
      participantDisplay: String(participants),
      privacyStatus: 'released',
    };
  });
}

function matrixFixture() {
  const rows = ORGANIZATION_LABELS.slice(0, 5).map((label, index) => ({ code: index + 1, label }));
  const columns = SECTOR_LABELS.slice(0, 5).map((label, index) => ({ code: index + 11, label }));
  const cells = rows.flatMap((row, rowIndex) => columns.map((column, columnIndex) => {
    const notObserved = rowIndex === 4 && columnIndex === 4;
    return {
      organizationCode: row.code,
      sectorCode: column.code,
      registeredRecords: notObserved ? 0 : 10 + rowIndex * 5 + columnIndex,
      privacyStatus: notObserved ? 'not_observed' : 'released',
    };
  }));
  return {
    rowDimension: 'organization',
    columnDimension: 'sector',
    rows,
    columns,
    cells,
    releasedCellCount: 24,
    protectedCellCount: 0,
    maxReleasedRecords: 33,
  };
}

const PAYLOAD = Object.freeze({
  schemaVersion: ANALYTICS_CONTRACT,
  source: {
    canonicalSystem: 'GRH Junín',
    sourceFile: 'grh_junin.backup_2026080615_plataforma.sql.gz',
    sourceSha256: SOURCE_SHA,
    snapshotAsOf: SNAPSHOT,
  },
  privacy: {
    threshold: 10,
    containsPii: false,
    identifiersExported: false,
    labelsProtectedBeforeRanking: true,
    complementarySuppression: true,
  },
  coverage: {
    registeredRecords: 800,
    withOrganization: { records: 800, sharePct: 100 },
    withSector: { records: 800, sharePct: 100 },
    withOrganizationAndSector: { records: 800, sharePct: 100 },
    withAbsenceHistory: { records: 185, sharePct: 23.125 },
    absenceEvents: 370,
  },
  organizations: {
    dimension: 'organization',
    denominatorRecords: 800,
    categoryCount: 10,
    releasedCategoryCount: 7,
    protectedCategoryCount: 3,
    rows: dimensionRows(ORGANIZATION_LABELS, 3),
  },
  sectors: {
    dimension: 'sector',
    denominatorRecords: 800,
    categoryCount: 9,
    releasedCategoryCount: 7,
    protectedCategoryCount: 2,
    rows: dimensionRows(SECTOR_LABELS, 2),
  },
  matrix: matrixFixture(),
  absenceRanking: {
    historical: true,
    denominatorRecords: 800,
    recordsWithAbsence: 185,
    absenceEvents: 370,
    rows: absenceRows(),
  },
  dataQuality: {
    missingOrganizationRecords: 0,
    missingSectorRecords: 0,
    missingBothRecords: 0,
    invalidEmployeeKeyRows: 2,
    unmatchedPersonRecords: 3,
    validAbsenceEvents: 390,
    quarantinedAbsenceEvents: 5,
    linkedAbsenceEvents: 370,
    unlinkedValidAbsenceEvents: 20,
    codedPositionRecords: 620,
    positionObservationRecords: 150,
    futureEffectivePositionObservationRecords: 0,
    firstFuturePositionDate: null,
    lastFuturePositionDate: null,
  },
  payrollCohort: {
    definition: 'Participantes distintos del último cálculo válido; no representa planta contractual activa.',
    referencePeriod: '2026-07',
    payrollParticipants: 800,
    bySector: workforceRanking(SECTOR_LABELS, REGISTERED_COUNTS),
    byCostCenter: workforceRanking([
      'Servicios operativos',
      'Gobierno municipal',
      'Administración central',
      'Obras y mantenimiento',
      'Desarrollo comunitario',
      'Educación y cultura',
      'Deporte local',
      'Abastecimiento',
    ]),
    byAgreement: workforceRanking([
      'Régimen municipal A',
      'Régimen municipal B',
      'Régimen municipal C',
      'Régimen municipal D',
      'Régimen municipal E',
      'Régimen municipal F',
      'Régimen municipal G',
      'Régimen municipal H',
    ]),
  },
  activity: {
    absence: {
      sourceTable: 'ausencia',
      metric: 'valid_rows_by_year',
      series: activitySeries({ participantStart: 40, valueStart: 80, valueStep: 10 }),
    },
    movements: {
      sourceTable: 'legamov',
      metric: 'valid_rows_by_year',
      series: activitySeries({ participantStart: 50, valueStart: 120, valueStep: 20 }),
    },
  },
  actions: GRH_ORGANIZATION_ANALYTICS_ACTIONS.map(action => ({ ...action })),
  limits: [...GRH_ORGANIZATION_ANALYTICS_LIMITS],
});

const CONTRACT_MUTATIONS = Object.freeze({
  'source-mismatch': payload => {
    payload.source.sourceFile = 'fuente_no_gobernada.csv';
  },
  'small-workforce-cell': payload => {
    const first = payload.payrollCohort.byCostCenter.rows[0];
    const last = payload.payrollCohort.byCostCenter.rows.at(-1);
    first.participants += 31;
    first.participantDisplay = String(first.participants);
    first.sharePct = share(first.participants, 800);
    last.participants = 9;
    last.participantDisplay = '9';
    last.sharePct = share(9, 800);
  },
  'workforce-total-drift': payload => {
    const row = payload.payrollCohort.byCostCenter.rows[0];
    row.participants -= 1;
    row.participantDisplay = String(row.participants);
    row.sharePct = share(row.participants, 800);
  },
  'cross-view-small-complement': payload => {
    const ranking = payload.payrollCohort.bySector;
    const released = ranking.rows[0];
    const protectedAggregate = ranking.rows[1];
    released.participants -= 9;
    released.participantDisplay = String(released.participants);
    released.sharePct = share(released.participants, 800);
    protectedAggregate.companyCode = null;
    protectedAggregate.sourceCode = null;
    protectedAggregate.label = 'Otros (celdas protegidas)';
    protectedAggregate.participants += 9;
    protectedAggregate.participantDisplay = String(protectedAggregate.participants);
    protectedAggregate.sharePct = share(protectedAggregate.participants, 800);
    protectedAggregate.privacyStatus = 'protected_aggregate';
    ranking.privacyStatus = 'partially_suppressed';
  },
  'amount-reinjection': payload => {
    payload.activity.absence.series[0].amounts = { grossCents: 1 };
  },
  'leave-reinjection': payload => {
    payload.activity.leave = structuredClone(payload.activity.absence);
  },
  'nested-extra-key': payload => {
    payload.payrollCohort.byAgreement.rows[0].rawLabel = 'campo no permitido';
  },
  'top-extra-key': payload => {
    payload.debug = true;
  },
  'invalid-series': payload => {
    payload.activity.movements.series[1].period = payload.activity.movements.series[0].period;
  },
  'released-matrix-cell-below-threshold': payload => {
    payload.matrix.cells[0].registeredRecords = 9;
  },
});

function clonePayload() {
  return structuredClone(PAYLOAD);
}

function singleProtectedSectorPayload() {
  const payload = clonePayload();
  payload.sectors.categoryCount = 8;
  payload.sectors.protectedCategoryCount = 1;
  payload.sectors.rows.at(-1).privacyStatus = 'suppressed';
  return payload;
}

function authorizedSession(role = 'INTENDENTE', includeCapability = true) {
  const access = accessPolicy.getSessionAccessForUser({ role, tenantId: TENANT_ID });
  const capabilities = includeCapability
    ? access.capabilities
    : access.capabilities.filter(capability => capability !== PAGE_CAPABILITY);
  return {
    user: {
      id: `structure-e2e-${role.toLowerCase()}`,
      name: `Perfil ${role} QA`,
      role,
      tenantId: TENANT_ID,
      capabilities,
      accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
      homeProfile: access.homeProfile,
      tenant: { id: TENANT_ID, shortName: 'Junín QA' },
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
  let analyticsAttempt = 0;
  return {
    name: `estructura-react-e2e-${scenario.name}`,
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url || '/', 'http://127.0.0.1');
        if (url.pathname === '/estructura') {
          request.url = '/estructura.html';
          next();
          return;
        }
        if (url.pathname === '/js/auth-fetch.js') {
          send(response, 200, 'text/javascript; charset=utf-8', AUTH_CLIENT_SOURCE);
          return;
        }
        if (url.pathname === '/js/contextual-help.js') {
          send(response, 200, 'text/javascript; charset=utf-8', MUNIGUIA_STUB_SOURCE);
          return;
        }
        if (url.pathname === '/js/pwa-register.js') {
          send(response, 200, 'text/javascript; charset=utf-8', 'void 0;');
          return;
        }
        if (url.pathname === '/inicio.html') {
          send(response, 200, 'text/html; charset=utf-8',
            '<!doctype html><html lang="es"><body><main id="safe-workspace">Espacio seguro</main></body></html>');
          return;
        }
        if (url.pathname === '/api/auth/me') {
          apiLog.push({
            path: url.pathname,
            method: request.method,
            accept: request.headers.accept,
            authorization: request.headers.authorization,
            cacheControl: request.headers['cache-control'],
          });
          send(response, 200, 'application/json; charset=utf-8', JSON.stringify(
            scenario.authPayload ?? authorizedSession(scenario.role, scenario.includeCapability !== false),
          ), { [CONTRACT_HEADER]: AUTH_CONTRACT });
          return;
        }
        if (url.pathname === '/api/grh-organization-analytics') {
          apiLog.push({
            path: url.pathname,
            method: request.method,
            accept: request.headers.accept,
            authorization: request.headers.authorization,
            cacheControl: request.headers['cache-control'],
          });
          const sequence = scenario.analyticsSequence ?? [scenario.analyticsMode ?? 'success'];
          const mode = sequence[Math.min(analyticsAttempt, sequence.length - 1)];
          analyticsAttempt += 1;
          if (mode === 'forbidden') {
            send(response, 403, 'application/json; charset=utf-8', JSON.stringify({ error: 'forbidden' }), {
              [CONTRACT_HEADER]: ANALYTICS_CONTRACT,
            });
            return;
          }
          if (mode === 'unavailable') {
            send(response, 503, 'application/json; charset=utf-8', JSON.stringify({ error: 'unavailable' }), {
              [CONTRACT_HEADER]: ANALYTICS_CONTRACT,
            });
            return;
          }
          const payload = scenario.analyticsPayload
            ? structuredClone(scenario.analyticsPayload)
            : clonePayload();
          CONTRACT_MUTATIONS[mode]?.(payload);
          send(response, 200, 'application/json; charset=utf-8', JSON.stringify(payload), {
            [CONTRACT_HEADER]: mode === 'wrong-header' ? 'grh-organization-analytics-v1' : ANALYTICS_CONTRACT,
          });
          return;
        }
        if (url.pathname.startsWith('/api/')) {
          apiLog.push({ path: url.pathname, method: request.method });
          send(response, 404, 'application/json; charset=utf-8', '{}');
          return;
        }
        next();
      });
    },
  };
}

async function withScenario(scenario, run) {
  const apiLog = [];
  const server = await createViteServer({
    configFile: FRONTEND_CONFIG,
    logLevel: 'error',
    plugins: [scenarioPlugin(scenario, apiLog)],
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run({ apiLog, baseUrl });
  } finally {
    await server.close();
  }
}

function monitorPage(page, baseUrl) {
  const consoleErrors = [];
  const pageErrors = [];
  const externalRequests = [];
  const requestedPaths = [];
  const origin = new URL(baseUrl).origin;
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    const requestUrl = request.url();
    if (/^(?:data|blob):/u.test(requestUrl)) return;
    const parsed = new URL(requestUrl);
    requestedPaths.push(parsed.pathname);
    if (parsed.origin !== origin) externalRequests.push(requestUrl);
  });
  return { consoleErrors, pageErrors, externalRequests, requestedPaths };
}

async function newMonitoredPage(browser, baseUrl, contextOptions = {}) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  return { context, page, diagnostics: monitorPage(page, baseUrl) };
}

async function seedTheme(context, theme) {
  await context.addInitScript(selectedTheme => {
    localStorage.setItem('municontrol-color-theme:v1', selectedTheme);
    localStorage.setItem('govtech_theme', selectedTheme === 'dark' ? 'light' : 'dark');
  }, theme);
}

async function waitReady(page) {
  await page.locator('[data-testid="workforce-panel"]').waitFor({ state: 'visible' });
  await page.locator('[data-testid="organization-explorer"]').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('.structure-kpi').length === 6);
}

function apiPaths(apiLog, start = 0) {
  return apiLog.slice(start).map(entry => entry.path);
}

function assertNoPrivateDirectory(apiLog, diagnostics) {
  const forbidden = value => /(?:grh-(?:directory|person|people)|people-directory|private-directory)/iu.test(value);
  assert.equal(apiLog.some(entry => forbidden(entry.path)), false, JSON.stringify(apiLog));
  assert.equal(diagnostics.requestedPaths.some(forbidden), false, JSON.stringify(diagnostics.requestedPaths));
}

function assertCleanDiagnostics(diagnostics, label) {
  assert.deepEqual(diagnostics.consoleErrors, [], `${label} console: ${diagnostics.consoleErrors.join(' | ')}`);
  assert.deepEqual(diagnostics.pageErrors, [], `${label} page: ${diagnostics.pageErrors.join(' | ')}`);
  assert.deepEqual(diagnostics.externalRequests, [], `${label} external: ${diagnostics.externalRequests.join(' | ')}`);
}

async function readyDiagnostics(page) {
  return page.evaluate(() => {
    const text = String(document.querySelector('main')?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      kpis: document.querySelectorAll('.structure-kpi').length,
      workforceRows: document.querySelectorAll('[data-testid="workforce-sector-bars"] .structure-bar').length,
      absenceRows: document.querySelectorAll('[data-testid="absence-ranking"] > li').length,
      explorerOptions: document.querySelectorAll('[data-testid="organization-explorer-list"] button').length,
      explorerProtectedSummary: document.querySelector('[data-testid="organization-explorer-protected-organization"]')
        ?.textContent?.replace(/\s+/g, ' ').trim() || '',
      explorerTitle: document.querySelector('#organization-explorer-detail-title')?.textContent?.trim() || '',
      explorerMetrics: document.querySelectorAll('.structure-explorer__metrics > div').length,
      explorerDirectoryHref: document.querySelector('[data-testid="organization-explorer-directory-action"]')?.getAttribute('href') || '',
      explorerHaciendaAction: Boolean(document.querySelector('[data-testid="organization-explorer-hacienda-action"]')),
      explorerAssistantAction: Boolean(document.querySelector('[data-testid="organization-explorer-assistant-action"]')),
      activityFigures: document.querySelectorAll('[data-testid^="activity-"]').length,
      activityPlots: document.querySelectorAll('.activity-plot').length,
      activityPoints: Array.from(document.querySelectorAll('[data-testid^="activity-"]')).map(figure =>
        Array.from(figure.querySelectorAll('.activity-plot')).map(plot => plot.querySelectorAll('.activity-point').length)),
      heatmapRows: document.querySelectorAll('.structure-heatmap__row').length,
      heatmapColumns: document.querySelectorAll('.structure-heatmap__column').length,
      heatmapCells: document.querySelectorAll('.structure-heatmap__cell').length,
      comparator: Boolean(document.querySelector('[data-testid="registry-comparator"]')),
      actions: Array.from(document.querySelectorAll('a[data-testid^="structure-action-"]')).map(node => ({
        testId: node.getAttribute('data-testid'),
        href: node.getAttribute('href'),
      })),
      hasSkipLink: Boolean(document.querySelector('a.skip-link[href="#contenido-principal"]')),
      duplicateIds: Array.from(document.querySelectorAll('[id]')).map(node => node.id)
        .filter((id, index, ids) => ids.indexOf(id) !== index),
      fixtureLeak: /display_name|company_code|grossCents|"amounts"|\bDNI\s*[:#-]\s*\d|\blegajo\s*[:#-]\s*\d|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text),
      monetaryLeak: /\b(?:importe|monto|remuneraci[oó]n|salario|sueldo)\b/i.test(text),
      leaveLeak: /\b(?:leave|licencia individual)\b/i.test(text),
      unsafeNominalDeepLinkLeak: /(?:company|legajo)=|hasAbsence=/i.test(document.documentElement.innerHTML),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

async function blockedDiagnostics(page) {
  return page.evaluate(() => {
    const text = String(document.querySelector('main')?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      heading: document.querySelector('.blocked-state h1')?.textContent?.trim() || '',
      readyMounted: Boolean(document.querySelector('[data-testid="workforce-panel"]')),
      kpis: document.querySelectorAll('.structure-kpi').length,
      sourceBackedValueLeak: /Servicios Urbanos|800|2019|2026-07/.test(text),
      syntheticDemoLanguage: /demo|simulad|fictici|mock/i.test(text),
    };
  });
}

async function exerciseReadyControls(page) {
  const themeToggle = page.locator('button.theme-toggle');
  const originalTheme = await page.locator('html').getAttribute('data-theme');
  await themeToggle.click();
  await page.waitForFunction(theme => document.documentElement.dataset.theme !== theme, originalTheme);
  await themeToggle.click();
  await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, originalTheme);

  for (const key of ['costCenter', 'agreement']) {
    await page.locator(`[data-testid="workforce-tab-${key}"]`).click();
    assert.equal(await page.locator(`[data-testid="workforce-${key}-bars"]`).isVisible(), true, key);
  }
  const sectorTab = page.locator('[data-testid="workforce-tab-sector"]');
  await sectorTab.focus();
  await sectorTab.press('Space');
  assert.equal(await sectorTab.getAttribute('aria-pressed'), 'true');

  const toggles = [
    ['workforce-sector-toggle', 'workforce-sector-bars', '.structure-bar'],
    ['absence-ranking-toggle', 'absence-ranking', 'li'],
  ];
  for (const [toggleId, collectionId, rowSelector] of toggles) {
    const toggle = page.locator(`[data-testid="${toggleId}"]`);
    const rows = page.locator(`[data-testid="${collectionId}"] ${rowSelector}`);
    assert.equal(await rows.count(), 6, `${toggleId} collapsed`);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true', toggleId);
    assert.equal(await rows.count(), 8, `${toggleId} expanded`);
    await toggle.click();
    assert.equal(await rows.count(), 6, `${toggleId} collapsed again`);
  }

  const dimension = page.locator('[data-testid="comparator-dimension"]');
  const before = await page.locator('.structure-comparator__result').innerText();
  await dimension.selectOption('sector');
  const afterDimension = await page.locator('.structure-comparator__result').innerText();
  assert.notEqual(afterDimension, before);
  const right = page.locator('[data-testid="comparator-right"]');
  const alternatives = await right.locator('option:not([disabled])').evaluateAll(options =>
    options.map(option => option.value));
  assert.ok(alternatives.length >= 2);
  const resultBefore = await page.locator('.structure-comparator__result').innerText();
  await right.selectOption(alternatives.at(-1));
  assert.notEqual(await page.locator('.structure-comparator__result').innerText(), resultBefore);

  const explorerSearch = page.locator('[data-testid="organization-explorer-search"]');
  await explorerSearch.fill('Cultura');
  assert.equal(await page.locator('[data-testid="organization-explorer-list"] button').count(), 1);
  assert.match(await page.locator('[data-testid="organization-explorer-list"]').innerText(), /Cultura y Educación/u);
  await explorerSearch.fill('');
  assert.equal(await page.locator('[data-testid="organization-explorer-list"] button').count(), 7);
  assert.match(await page.locator('[data-testid="organization-explorer-protected-organization"]').innerText(),
    /Otros grupos protegidos.*3 categorías.*60.*7,5%/isu);
  assert.equal(await page.locator('[data-testid="organization-explorer-protected-organization"] button').count(), 0);

  const fifthOrganization = page.locator('[data-testid="organization-explorer-option-organization-5"]');
  await fifthOrganization.focus();
  await fifthOrganization.press('Enter');
  assert.equal(await page.locator('#organization-explorer-detail-title').innerText(), 'Cultura y Educación');
  assert.equal(new URL(page.url()).search, '?dimension=organization&code=5');
  assert.match(await page.locator('[data-testid="organization-explorer-cross"]').innerText(),
    /Sin observación en este cruce/u);

  await page.locator('[data-testid="organization-explorer-dimension-sector"]').click();
  assert.equal(await page.locator('#organization-explorer-detail-title').innerText(), 'Servicios Públicos');
  assert.equal(new URL(page.url()).search, '?dimension=sector&code=1');
  assert.equal(await page.locator('[data-testid="organization-explorer-directory-action"]').getAttribute('href'),
    '/rrhh?sector=1#peopleDirectory');
  assert.equal(await page.locator('[data-testid="organization-explorer-hacienda-action"]').getAttribute('href'),
    '/hacienda?cohort=sector&company=101&code=1#cohortContext');
  const assistantHref = await page.locator('[data-testid="organization-explorer-assistant-action"]').getAttribute('href');
  assert.ok(assistantHref);
  const assistantUrl = new URL(assistantHref, page.url());
  assert.equal(assistantUrl.pathname, '/ia.html');
  assert.equal(assistantUrl.searchParams.get('question'), 'Mostrá el neto de Servicios Públicos por sector');

  await page.locator('[data-testid="organization-explorer-option-sector-2"]').click();
  assert.equal(await page.locator('#organization-explorer-detail-title').innerText(), 'Administración');
  await page.goBack();
  await page.waitForFunction(() => document.querySelector('#organization-explorer-detail-title')?.textContent?.trim() ===
    'Servicios Públicos');
  assert.equal(new URL(page.url()).search, '?dimension=sector&code=1');

  const buttons = await page.locator('button:visible').evaluateAll(nodes => nodes.map(node => ({
    testId: node.getAttribute('data-testid'),
    className: node.className,
    label: node.getAttribute('aria-label') || node.textContent.trim(),
  })));
  assert.ok(buttons.length >= 14, JSON.stringify(buttons));
  assert.equal(buttons.every(button => button.label.length > 0), true, JSON.stringify(buttons));

  await page.locator('a.skip-link').focus();
  assert.equal(await page.locator('a.skip-link').evaluate(node => document.activeElement === node), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return false;
    const rect = active.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }), true);
  for (const region of [
    '[data-testid="activity-absence"] .activity-chart__scroll',
    '[data-testid="activity-movements"] .activity-chart__scroll',
    '[data-testid="organization-sector-heatmap"]',
  ]) {
    const locator = page.locator(region);
    assert.equal(await locator.getAttribute('tabindex'), '0', region);
    await locator.focus();
    assert.equal(await locator.evaluate(node => document.activeElement === node), true, region);
  }
}

async function visualAudit(page) {
  return page.evaluate(() => {
    for (const section of document.querySelectorAll('.structure-section, .structure-two-column--uneven')) {
      section.style.contentVisibility = 'visible';
    }
    const parseColor = value => {
      if (!value || value === 'none' || value === 'transparent') return [0, 0, 0, 0];
      const match = String(value).match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const parts = match[1].replace('/', ' ').split(/[\s,]+/).filter(Boolean).map(Number);
      return [parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1];
    };
    const composite = (front, back) => {
      const alpha = front[3] + back[3] * (1 - front[3]);
      if (!alpha) return [0, 0, 0, 0];
      return [0, 1, 2].map(index =>
        (front[index] * front[3] + back[index] * back[3] * (1 - front[3])) / alpha).concat(alpha);
    };
    const luminance = color => color.slice(0, 3).map(channel => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const ratio = (first, second) => {
      const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    const background = node => {
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
    const backgroundCandidates = node => {
      const hero = node.closest?.('.structure-hero');
      if (!hero) return [background(node)];
      const colors = String(getComputedStyle(hero).backgroundImage)
        .match(/rgba?\([^)]+\)/gi)?.map(parseColor).filter(color => color && color[3] >= 0.999) ?? [];
      if (colors.length === 0) return [background(node)];
      const layers = [];
      let current = node;
      while (current instanceof Element && current !== hero) {
        const color = parseColor(getComputedStyle(current).backgroundColor);
        if (color && color[3] > 0) layers.push(color);
        current = current.parentElement;
      }
      return colors.map(base => {
        let resolved = base;
        for (let index = layers.length - 1; index >= 0; index -= 1) {
          resolved = composite(layers[index], resolved);
        }
        return resolved;
      });
    };
    const visible = node => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return node.getClientRects().length > 0 && rect.width > 0 && rect.height > 0 &&
        style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 &&
        !node.closest('.sr-only');
    };
    const ownsText = node => Array.from(node.childNodes).some(child =>
      child.nodeType === Node.TEXT_NODE && child.textContent.trim());
    const selector = node => `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}.${
      typeof node.className === 'string' ? node.className.trim().replace(/\s+/g, '.') : ''}`;
    const textNodes = Array.from(document.querySelectorAll('body *')).filter(node =>
      visible(node) && !node.matches('script, style, title, option') && ownsText(node));
    const textViolations = textNodes.map(node => {
      const style = getComputedStyle(node);
      const front = parseColor(style.color);
      const candidates = backgroundCandidates(node);
      return {
        selector: selector(node),
        text: node.textContent.trim().slice(0, 80),
        value: front ? Number(Math.min(...candidates.map(back =>
          ratio(composite(front, back), back))).toFixed(2)) : 0,
      };
    }).filter(item => item.value < 4.49);
    const fontViolations = textNodes.map(node => ({
      selector: selector(node),
      text: node.textContent.trim().slice(0, 80),
      size: Number.parseFloat(getComputedStyle(node).fontSize),
    })).filter(item => item.size < 11.99);
    const controls = Array.from(document.querySelectorAll([
      '.theme-toggle',
      '.structure-segmented',
      '.structure-disclosure',
      '.structure-comparator select',
      '.structure-action',
      '.structure-explorer__dimension',
      '.structure-explorer__search input',
      '.structure-explorer__list button',
    ].join(','))).filter(visible);
    const boundaryViolations = controls.map(node => {
      const style = getComputedStyle(node);
      const border = parseColor(style.borderTopColor);
      const outsideCandidates = backgroundCandidates(node.parentElement || node);
      return {
        selector: selector(node),
        value: border ? Number(Math.min(...outsideCandidates.map(outside =>
          ratio(composite(border, outside), outside))).toFixed(2)) : 0,
        width: Number.parseFloat(style.borderTopWidth),
      };
    }).filter(item => item.width < 1 || item.value < 2.99);
    return {
      theme: document.documentElement.dataset.theme,
      canonicalTheme: localStorage.getItem('municontrol-color-theme:v1'),
      legacyTheme: localStorage.getItem('govtech_theme'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      textViolations,
      fontViolations,
      boundaryViolations,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      forcedColors: matchMedia('(forced-colors: active)').matches,
    };
  });
}

test('Sala de situación GRH React v2 is governed, actionable and fail-closed', {
  timeout: 360_000,
}, async t => {
  const fixtureInspection = inspectGrhOrganizationAnalyticsContract(PAYLOAD, {
    expectedSourceSha256: SOURCE_SHA,
    expectedSnapshotAsOf: SNAPSHOT,
  });
  assert.deepEqual(fixtureInspection.errors, [], fixtureInspection.errors.join(', '));
  assert.equal(fixtureInspection.ok, true);
  for (const [name, mutate] of Object.entries(CONTRACT_MUTATIONS)) {
    const payload = clonePayload();
    mutate(payload);
    assert.equal(inspectGrhOrganizationAnalyticsContract(payload, {
      expectedSourceSha256: SOURCE_SHA,
      expectedSnapshotAsOf: SNAPSHOT,
    }).ok, false, `server inspector must reject ${name}`);
  }

  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  await t.test('renders six KPIs, the operational explorer and every visible control acts locally', async () => {
    await withScenario({ name: 'ready-desktop', role: 'INTENDENTE' }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 1_440, height: 1_000 },
      });
      try {
        await seedTheme(context, 'dark');
        const responsePromise = page.waitForResponse(response =>
          new URL(response.url()).pathname === '/api/grh-organization-analytics');
        await page.goto(`${baseUrl}/estructura`, { waitUntil: 'domcontentloaded' });
        const response = await responsePromise;
        assert.equal(response.status(), 200);
        assert.equal(response.headers()[CONTRACT_HEADER], ANALYTICS_CONTRACT);
        assert.equal(response.headers()['cache-control'], 'no-store');
        await waitReady(page);

        const ready = await readyDiagnostics(page);
        assert.equal(ready.kpis, 6);
        assert.equal(ready.workforceRows, 6);
        assert.equal(ready.absenceRows, 6);
        assert.equal(ready.explorerOptions, 7);
        assert.match(ready.explorerProtectedSummary, /Otros grupos protegidos.*3 categorías.*60.*7,5%/iu);
        assert.equal(ready.explorerTitle, 'Servicios Urbanos');
        assert.equal(ready.explorerMetrics, 5);
        assert.equal(ready.explorerDirectoryHref, '/rrhh?organization=1#peopleDirectory');
        assert.equal(ready.explorerHaciendaAction, false);
        assert.equal(ready.explorerAssistantAction, false);
        assert.equal(ready.activityFigures, 2);
        assert.equal(ready.activityPlots, 4);
        assert.deepEqual(ready.activityPoints, [[8, 8], [8, 8]]);
        assert.equal(ready.heatmapRows, 5);
        assert.equal(ready.heatmapColumns, 5);
        assert.equal(ready.heatmapCells, 25);
        assert.equal(ready.comparator, true);
        assert.deepEqual(ready.actions, [
          { testId: 'structure-action-open_workforce_dashboard', href: '/rrhh' },
          { testId: 'structure-action-open_executive_summary', href: '/ejecutivo' },
          { testId: 'structure-action-open_data_quality', href: '/calidad' },
          { testId: 'structure-action-export_executive_report', href: '/reportes' },
        ]);
        assert.equal(ready.hasSkipLink, true);
        assert.deepEqual(ready.duplicateIds, []);
        assert.equal(ready.fixtureLeak, false);
        assert.equal(ready.monetaryLeak, false);
        assert.equal(ready.leaveLeak, false);
        assert.equal(ready.unsafeNominalDeepLinkLeak, false);
        assert.ok(ready.overflow <= 1, `desktop overflow=${ready.overflow}`);

        await exerciseReadyControls(page);
        assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-organization-analytics']);
        assert.equal(apiLog[1].method, 'GET');
        assert.equal(apiLog[1].accept, 'application/json');
        assert.match(apiLog[1].authorization || '', /^Bearer /u);
        assert.match(apiLog[1].cacheControl || '', /no-cache|no-store/u);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'desktop ready');
        await page.screenshot({ path: SCREENSHOTS.desktop, fullPage: true });
      } finally {
        await context.close();
      }
    });
  });

  await t.test('resolves exact explorer deep links and never refetches when the selection changes', async () => {
    await withScenario({ name: 'deep-link-sector', role: 'INTENDENTE' }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 1_440, height: 900 },
      });
      try {
        await page.goto(
          `${baseUrl}/estructura?dimension=sector&code=2#organizationExplorer`,
          { waitUntil: 'domcontentloaded' },
        );
        await waitReady(page);
        assert.equal(await page.locator('#organization-explorer-detail-title').innerText(), 'Administración');
        assert.equal(await page.locator('[data-testid="organization-explorer-directory-action"]').getAttribute('href'),
          '/rrhh?sector=2#peopleDirectory');
        assert.equal(await page.locator('[data-testid="organization-explorer-hacienda-action"]').getAttribute('href'),
          '/hacienda?cohort=sector&company=101&code=2#cohortContext');
        const assistantHref = await page.locator('[data-testid="organization-explorer-assistant-action"]').getAttribute('href');
        assert.equal(new URL(assistantHref, baseUrl).searchParams.get('question'),
          'Mostrá el neto de Administración por sector');
        assert.match(await page.locator('[data-testid="organization-explorer-absence-unavailable"]').innerText(),
          /Sin desglose publicado.*no publica ausencias por sector informado/isu);

        await page.locator('[data-testid="organization-explorer-option-sector-3"]').click();
        assert.equal(await page.locator('#organization-explorer-detail-title').innerText(), 'Atención Territorial');
        assert.equal(new URL(page.url()).search, '?dimension=sector&code=3');
        assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-organization-analytics']);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'deep link sector');
      } finally {
        await context.close();
      }
    });
  });

  await t.test('keeps an unpublished deep link scoped and empty until an exact row is selected', async () => {
    await withScenario({ name: 'deep-link-invalid', role: 'INTENDENTE' }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 390, height: 844 },
        reducedMotion: 'reduce',
      });
      try {
        await page.goto(
          `${baseUrl}/estructura?dimension=organization&code=999#organizationExplorer`,
          { waitUntil: 'domcontentloaded' },
        );
        await waitReady(page);
        const invalid = page.locator('[data-testid="organization-explorer-invalid-link"]');
        await invalid.waitFor({ state: 'visible' });
        assert.match(await invalid.textContent() || '', /no identifica.*no se muestran cifras/isu);
        assert.equal(await page.locator('.structure-explorer__metrics').count(), 0);
        assert.equal(await page.locator('[data-testid="organization-explorer-directory-action"]').count(), 0);
        assert.equal(await page.locator('[data-testid="organization-explorer-hacienda-action"]').count(), 0);
        assert.equal(await page.locator('[data-testid="organization-explorer-assistant-action"]').count(), 0);
        assert.doesNotMatch(await page.locator('[data-testid="organization-explorer-detail"]').innerText(),
          /Servicios Urbanos|800|160/u);

        await page.locator('[data-testid="organization-explorer-option-organization-1"]').click();
        assert.equal(await invalid.count(), 0);
        assert.equal(await page.locator('#organization-explorer-detail-title').innerText(), 'Servicios Urbanos');
        assert.equal(await page.locator('.structure-explorer__metrics > div').count(), 5);
        assert.equal(new URL(page.url()).search, '?dimension=organization&code=1');
        assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-organization-analytics']);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'invalid explorer link');
      } finally {
        await context.close();
      }
    });
  });

  await t.test('keeps a single suppressed category visible as a non-selectable distribution summary', async () => {
    const analyticsPayload = singleProtectedSectorPayload();
    assert.equal(inspectGrhOrganizationAnalyticsContract(analyticsPayload, {
      expectedSourceSha256: SOURCE_SHA,
      expectedSnapshotAsOf: SNAPSHOT,
    }).ok, true);
    await withScenario({
      name: 'single-protected-sector',
      role: 'INTENDENTE',
      analyticsPayload,
    }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 390, height: 844 },
      });
      try {
        await page.goto(
          `${baseUrl}/estructura?dimension=sector&code=1#organizationExplorer`,
          { waitUntil: 'domcontentloaded' },
        );
        await waitReady(page);
        const summary = page.locator('[data-testid="organization-explorer-protected-sector"]');
        assert.match(await summary.textContent(), /Grupo protegido.*1 categoría.*60.*7,5%/isu);
        assert.equal(await summary.locator('button, a').count(), 0);
        assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-organization-analytics']);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'single protected sector');
      } finally {
        await context.close();
      }
    });
  });

  await t.test('meets contrast, font, keyboard and overflow gates at 1440, 390 and forced 320', async () => {
    await withScenario({ name: 'visual-matrix', role: 'INTENDENTE' }, async ({ apiLog, baseUrl }) => {
      for (const viewport of [
        { name: 'desktop-dark', width: 1_440, height: 1_000, theme: 'dark' },
        { name: 'mobile-light', width: 390, height: 844, theme: 'light', reducedMotion: 'reduce' },
        {
          name: 'compact-forced',
          width: 320,
          height: 720,
          theme: 'dark',
          reducedMotion: 'reduce',
          forcedColors: 'active',
        },
      ]) {
        const start = apiLog.length;
        const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
          viewport: { width: viewport.width, height: viewport.height },
          reducedMotion: viewport.reducedMotion ?? 'no-preference',
          forcedColors: viewport.forcedColors ?? 'none',
        });
        try {
          await seedTheme(context, viewport.theme);
          await page.goto(`${baseUrl}/estructura`, { waitUntil: 'domcontentloaded' });
          await waitReady(page);
          const audit = await visualAudit(page);
          assert.equal(audit.theme, viewport.theme, viewport.name);
          assert.equal(audit.canonicalTheme, viewport.theme, `${viewport.name} canonical`);
          assert.equal(audit.legacyTheme, viewport.theme, `${viewport.name} synchronized legacy`);
          assert.ok(audit.overflow <= 1, `${viewport.name} overflow=${audit.overflow}`);
          assert.deepEqual(audit.textViolations, [], `${viewport.name} text ${JSON.stringify(audit.textViolations)}`);
          assert.deepEqual(audit.fontViolations, [], `${viewport.name} font ${JSON.stringify(audit.fontViolations)}`);
          assert.deepEqual(audit.boundaryViolations, [], `${viewport.name} controls ${JSON.stringify(audit.boundaryViolations)}`);
          assert.equal(audit.reducedMotion, viewport.reducedMotion === 'reduce', viewport.name);
          assert.equal(audit.forcedColors, viewport.forcedColors === 'active', viewport.name);
          assert.deepEqual(apiPaths(apiLog, start), ['/api/auth/me', '/api/grh-organization-analytics']);
          assertNoPrivateDirectory(apiLog.slice(start), diagnostics);
          assertCleanDiagnostics(diagnostics, viewport.name);
          const screenshot = viewport.name === 'desktop-dark'
            ? SCREENSHOTS.desktop
            : viewport.name === 'mobile-light' ? SCREENSHOTS.mobile : SCREENSHOTS.forced;
          await page.screenshot({ path: screenshot, fullPage: true });
        } finally {
          await context.close();
        }
      }
    });
  });

  await t.test('enforces the exact published six-role matrix before private analytics', async () => {
    const matrix = [
      { role: 'TENANT_ADMIN', allowed: true },
      { role: 'INTENDENTE', allowed: true },
      { role: 'CONTADOR', allowed: true },
      { role: 'TENANT_USER', allowed: false },
      { role: 'INSPECTOR', allowed: false },
      { role: 'DEMO', allowed: false },
    ];
    for (const row of matrix) {
      await withScenario({ name: `role-${row.role.toLowerCase()}`, role: row.role }, async ({ apiLog, baseUrl }) => {
        const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
          viewport: { width: 390, height: 844 },
          reducedMotion: 'reduce',
        });
        try {
          await page.goto(`${baseUrl}/estructura`, { waitUntil: 'domcontentloaded' });
          if (row.allowed) {
            await waitReady(page);
            assert.equal(await page.locator('.structure-kpi').count(), 6, row.role);
            assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-organization-analytics'], row.role);
          } else {
            await page.waitForURL(`${baseUrl}/inicio.html`);
            await page.waitForSelector('#safe-workspace');
            assert.deepEqual(apiPaths(apiLog), ['/api/auth/me'], row.role);
          }
          assertNoPrivateDirectory(apiLog, diagnostics);
          assertCleanDiagnostics(diagnostics, row.role);
        } finally {
          await context.close();
        }
      });
    }
  });

  await t.test('requires the exact page capability and redirects before the data request', async () => {
    await withScenario({
      name: 'missing-exact-capability',
      role: 'INTENDENTE',
      includeCapability: false,
    }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 1_024, height: 768 },
      });
      try {
        await page.goto(`${baseUrl}/estructura`, { waitUntil: 'domcontentloaded' });
        await page.waitForURL(`${baseUrl}/inicio.html`);
        assert.deepEqual(apiPaths(apiLog), ['/api/auth/me']);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'missing exact capability');
      } finally {
        await context.close();
      }
    });
  });

  await t.test('blocks every figure for header, provenance, privacy and shape mutations', async () => {
    for (const analyticsMode of ['wrong-header', ...Object.keys(CONTRACT_MUTATIONS)]) {
      await withScenario({ name: `mutation-${analyticsMode}`, analyticsMode }, async ({ apiLog, baseUrl }) => {
        const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
          viewport: { width: 1_024, height: 768 },
        });
        try {
          await page.goto(`${baseUrl}/estructura`, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('.blocked-state[role="alert"]');
          const blocked = await blockedDiagnostics(page);
          assert.match(blocked.heading, /Sala de situación bloqueada/i, analyticsMode);
          assert.equal(blocked.readyMounted, false, analyticsMode);
          assert.equal(blocked.kpis, 0, analyticsMode);
          assert.equal(blocked.sourceBackedValueLeak, false, analyticsMode);
          assert.equal(blocked.syntheticDemoLanguage, false, analyticsMode);
          assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-organization-analytics'], analyticsMode);
          assertNoPrivateDirectory(apiLog, diagnostics);
          assertCleanDiagnostics(diagnostics, analyticsMode);
        } finally {
          await context.close();
        }
      });
    }
  });

  await t.test('keeps 403 and 503 empty, then reauthenticates and refetches exactly once on retry', async () => {
    for (const failureMode of ['forbidden', 'unavailable']) {
      await withScenario({
        name: `${failureMode}-retry`,
        analyticsSequence: [failureMode, 'success'],
      }, async ({ apiLog, baseUrl }) => {
        const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
          viewport: { width: 1_440, height: 900 },
        });
        try {
          await page.goto(`${baseUrl}/estructura`, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('.blocked-state[role="alert"]');
          let blocked = await blockedDiagnostics(page);
          assert.equal(blocked.readyMounted, false, failureMode);
          assert.equal(blocked.kpis, 0, failureMode);
          assert.equal(blocked.sourceBackedValueLeak, false, failureMode);
          assert.equal(blocked.syntheticDemoLanguage, false, failureMode);
          assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-organization-analytics']);

          await page.locator('.blocked-state .button--primary').click();
          await waitReady(page);
          assert.equal(await page.locator('.structure-kpi').count(), 6);
          assert.deepEqual(apiPaths(apiLog), [
            '/api/auth/me',
            '/api/grh-organization-analytics',
            '/api/auth/me',
            '/api/grh-organization-analytics',
          ]);
          assertNoPrivateDirectory(apiLog, diagnostics);
          assert.deepEqual(diagnostics.pageErrors, [], failureMode);
          assert.deepEqual(diagnostics.externalRequests, [], failureMode);
          assert.ok(diagnostics.consoleErrors.length <= 1 && diagnostics.consoleErrors.every(message =>
            new RegExp(`Failed to load resource.*${failureMode === 'forbidden' ? '403' : '503'}`, 'i').test(message)),
          `${failureMode} console: ${diagnostics.consoleErrors.join(' | ')}`);
        } finally {
          await context.close();
        }
      });
    }
  });
});
