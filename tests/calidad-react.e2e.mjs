import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND_CONFIG = path.join(REPO, 'frontend', 'vite.config.ts');

function percentage(numerator, denominator) {
  return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(4));
}

function temporalDomain({
  rows,
  quarantineRows,
  validPeriods,
  firstValidPeriod,
  lastValidPeriod,
  dateMonthMismatchRows = 0,
  quarantineReasonOccurrences = quarantineRows,
}) {
  const validRows = rows - quarantineRows;
  return {
    rows,
    validRows,
    quarantineRows,
    validRatePct: percentage(validRows, rows),
    validPeriods,
    firstValidPeriod,
    lastValidPeriod,
    firstValidYear: Number(firstValidPeriod.slice(0, 4)),
    lastValidYear: Number(lastValidPeriod.slice(0, 4)),
    dateMonthMismatchRows,
    quarantineReasonOccurrences,
  };
}

function referentialFact({ rows, orphanRows, distinctEmployeeKeys, validMatchedEmployeeKeys }) {
  const matchedRows = rows - orphanRows;
  return {
    rows,
    matchedRows,
    orphanRows,
    joinIntegrityPct: percentage(matchedRows, rows),
    distinctEmployeeKeys,
    validMatchedEmployeeKeys,
    employeeCoveragePct: percentage(validMatchedEmployeeKeys, 1_000),
  };
}

function createQualityFixture() {
  const domains = {
    ausencia: temporalDomain({
      rows: 100,
      quarantineRows: 2,
      validPeriods: 12,
      firstValidPeriod: '2025-01',
      lastValidPeriod: '2025-12',
      dateMonthMismatchRows: 1,
    }),
    calculo: temporalDomain({
      rows: 2_000,
      quarantineRows: 20,
      validPeriods: 12,
      firstValidPeriod: '2025-01',
      lastValidPeriod: '2025-12',
      dateMonthMismatchRows: 4,
      quarantineReasonOccurrences: 22,
    }),
    legamov: temporalDomain({
      rows: 400,
      quarantineRows: 0,
      validPeriods: 8,
      firstValidPeriod: '2025-05',
      lastValidPeriod: '2025-12',
    }),
    licencia: temporalDomain({
      rows: 300,
      quarantineRows: 3,
      validPeriods: 24,
      firstValidPeriod: '2024-01',
      lastValidPeriod: '2025-12',
      dateMonthMismatchRows: 1,
    }),
    totpago: temporalDomain({
      rows: 1_500,
      quarantineRows: 5,
      validPeriods: 12,
      firstValidPeriod: '2025-01',
      lastValidPeriod: '2025-12',
    }),
  };
  const temporal = Object.values(domains).reduce((totals, domain) => ({
    rows: totals.rows + domain.rows,
    validRows: totals.validRows + domain.validRows,
    quarantineRows: totals.quarantineRows + domain.quarantineRows,
    dateMonthMismatchRows: totals.dateMonthMismatchRows + domain.dateMonthMismatchRows,
    quarantineReasonOccurrences:
      totals.quarantineReasonOccurrences + domain.quarantineReasonOccurrences,
  }), {
    rows: 0,
    validRows: 0,
    quarantineRows: 0,
    dateMonthMismatchRows: 0,
    quarantineReasonOccurrences: 0,
  });

  const reconciliation = {
    status: 'material_differences_detected',
    totpagoDiagnosticStatus: 'not_cross_source_reconciled',
    metricStatus: 'calculation_control_not_bank_disbursement',
    currencyStatus: 'not_declared_in_source',
    toleranceCents: 1,
    calculationRuns: 10,
    totpagoRuns: 8,
    unionRuns: 11,
    matchedRuns: 7,
    fullyReconciledRuns: 5,
    runCoveragePct: percentage(7, 11),
    metricExactRatePct: 80,
    valueAgreementPct: 70,
    scorePct: 0,
    absoluteVarianceCents: 0,
  };
  reconciliation.scorePct = Number((
    (reconciliation.runCoveragePct + reconciliation.metricExactRatePct +
      reconciliation.valueAgreementPct) / 3
  ).toFixed(4));

  const components = {
    temporalValidity: { score: percentage(temporal.validRows, temporal.rows), weightPct: 30 },
    referentialIntegrity: { score: 98.75, weightPct: 30 },
    payrollReconciliation: { score: reconciliation.scorePct, weightPct: 25 },
    legajoKeyUniqueness: { score: 100, weightPct: 15 },
  };
  const qualityScore = Number(Object.values(components).reduce(
    (total, component) => total + component.score * component.weightPct / 100,
    0,
  ).toFixed(2));

  return {
    schemaVersion: 'grh-quality-v1',
    source: {
      canonicalSystem: 'GRH Junin synthetic fixture',
      sourceFile: 'grh_junin.synthetic_quality.sql.gz',
      sourceSha256: 'a'.repeat(64),
      snapshotAsOf: '2026-08-01',
      compressedSizeBytes: 12_345_678,
      realtime: false,
      excludedSources: ['personas_junin'],
    },
    lineage: {
      profileSchemaVersion: 'grh-profile-v1',
      semanticSchemaVersion: 'grh-semantic-v2',
      profileGeneratedAt: '2026-08-02T12:00:00Z',
      semanticGeneratedAt: '2026-08-02T12:05:00Z',
    },
    privacy: {
      aggregateOnly: true,
      containsPii: false,
      employeeIdentifiersExported: false,
      rawRowsExported: false,
      categoricalLabelsExported: false,
      cellCodesExported: false,
      monetarySeriesExported: false,
    },
    inventory: {
      all: { totalTables: 8, nonEmptyTables: 7, emptyTables: 1, totalRows: 5_200 },
      focal: { totalTables: 5, nonEmptyTables: 5, emptyTables: 0, totalRows: 5_000 },
      remainder: { totalTables: 3, nonEmptyTables: 2, emptyTables: 1, totalRows: 200 },
    },
    quality: {
      score: qualityScore,
      scope: 'governed_aggregate_extract_not_fitness_of_every_raw_grh_table',
      components,
      risks: {
        rawSourceContainsSensitivePii: true,
        historicalSnapshotNotRealtime: true,
        currencyNotDeclaredInSource: true,
        legacyImportErrorRows: 12,
        quarantinedTemporalRows: temporal.quarantineRows,
        totpagoCrossSourceMismatch: true,
        calculationControlAnomalousPeriods: 2,
        latestCalculationControlWithinRoundingTolerance: true,
        suspiciousTextEncodingLabelCount: 1,
      },
    },
    temporal: {
      ...temporal,
      validRatePct: percentage(temporal.validRows, temporal.rows),
      domains,
    },
    referential: {
      legajo: { rows: 1_000, uniqueKeys: 1_000, uniquenessPct: 100 },
      facts: {
        calculo: referentialFact({
          rows: 2_000,
          orphanRows: 10,
          distinctEmployeeKeys: 900,
          validMatchedEmployeeKeys: 850,
        }),
        legamov: referentialFact({
          rows: 400,
          orphanRows: 0,
          distinctEmployeeKeys: 300,
          validMatchedEmployeeKeys: 250,
        }),
        ausencia: referentialFact({
          rows: 100,
          orphanRows: 2,
          distinctEmployeeKeys: 80,
          validMatchedEmployeeKeys: 70,
        }),
        licencia: referentialFact({
          rows: 300,
          orphanRows: 3,
          distinctEmployeeKeys: 250,
          validMatchedEmployeeKeys: 200,
        }),
      },
    },
    reconciliation,
  };
}

const QUALITY_FIXTURE = createQualityFixture();

function authorizedSession(overrides = {}) {
  return {
    user: {
      id: 'quality-e2e-profile',
      name: 'Perfil ejecutivo QA',
      role: 'INTENDENTE',
      tenantId: 'tenant-quality-e2e',
      capabilities: [
        'session.read',
        'navigation.workspace',
        'navigation.data-quality',
      ],
      tenant: {
        id: 'tenant-quality-e2e',
        shortName: 'Junin QA',
      },
      ...overrides,
    },
  };
}

function send(response, status, contentType, body = '') {
  response.statusCode = status;
  response.setHeader('Content-Type', contentType);
  response.setHeader('Cache-Control', 'no-store');
  response.end(body);
}

function testApiPlugin(scenario, apiLog) {
  return {
    name: `calidad-react-e2e-${scenario.name}`,
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url || '/', 'http://127.0.0.1');

        if (url.pathname === '/calidad') {
          request.url = `/calidad.html${url.search}`;
          next();
          return;
        }

        if (url.pathname === '/js/auth-fetch.js') {
          send(response, 200, 'text/javascript; charset=utf-8', `
            window.MuniAuth = Object.freeze({
              fetch(input, init) { return window.fetch(input, init); }
            });
          `);
          return;
        }

        if (url.pathname === '/img/municontrol-icon.jpg') {
          send(response, 204, 'image/jpeg');
          return;
        }

        if (url.pathname === '/inicio.html') {
          send(response, 200, 'text/html; charset=utf-8',
            '<!doctype html><html lang="es"><title>Inicio seguro</title>' +
            '<body><main id="safe-workspace">Espacio de trabajo seguro</main></body></html>');
          return;
        }

        if (url.pathname === '/api/auth/me') {
          apiLog.push({ path: url.pathname, method: request.method });
          const payload = scenario.authPayload ?? authorizedSession();
          send(response, 200, 'application/json; charset=utf-8', JSON.stringify(payload));
          return;
        }

        if (url.pathname === '/api/grh-quality') {
          apiLog.push({ path: url.pathname, method: request.method });
          if (scenario.qualityMode === 'unavailable') {
            send(response, 503, 'application/json; charset=utf-8',
              JSON.stringify({ error: 'quality_contract_unavailable' }));
            return;
          }

          const payload = structuredClone(QUALITY_FIXTURE);
          if (scenario.qualityMode === 'mutated') payload.quality.score = 99;
          send(response, 200, 'application/json; charset=utf-8', JSON.stringify(payload));
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
    appType: 'mpa',
    cacheDir: path.join(tmpdir(), `municontrol-calidad-vite-${process.pid}`),
    clearScreen: false,
    logLevel: 'silent',
    plugins: [testApiPlugin(scenario, apiLog)],
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
      hmr: false,
    },
  });

  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    return await run({ apiLog, baseUrl });
  } finally {
    await server.close();
  }
}

function monitorPage(page, baseUrl) {
  const consoleErrors = [];
  const externalRequests = [];
  const origin = new URL(baseUrl).origin;

  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('request', request => {
    const requestUrl = request.url();
    if (/^(?:data|blob):/.test(requestUrl)) return;
    if (new URL(requestUrl).origin !== origin) externalRequests.push(requestUrl);
  });

  return { consoleErrors, externalRequests };
}

async function newMonitoredPage(browser, baseUrl, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  return { context, page, diagnostics: monitorPage(page, baseUrl) };
}

function apiPaths(apiLog, start = 0) {
  return apiLog.slice(start).map(entry => entry.path);
}

test('React Calidad canary validates governed evidence and fails closed', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  await t.test('renders the authorized synthetic contract on desktop and mobile', async () => {
    await withScenario({ name: 'authorized' }, async ({ apiLog, baseUrl }) => {
      for (const viewport of [
        { name: 'desktop', width: 1_440, height: 1_000, reducedMotion: 'no-preference' },
        { name: 'mobile', width: 390, height: 844, reducedMotion: 'reduce' },
      ]) {
        const start = apiLog.length;
        const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
          viewport: { width: viewport.width, height: viewport.height },
          reducedMotion: viewport.reducedMotion,
        });

        try {
          await page.goto(`${baseUrl}/calidad`, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('#page-title');

          const result = await page.evaluate(() => {
            const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
            const ids = Array.from(document.querySelectorAll('[id]'), element => element.id);
            const main = document.querySelector('main');
            const mainText = normalize(main?.textContent);
            const progress = document.querySelector('.metric-progress__fill');
            const transitionDuration = progress
              ? Number.parseFloat(getComputedStyle(progress).transitionDuration)
              : null;

            return {
              path: window.location.pathname,
              busy: main?.getAttribute('aria-busy'),
              kpiValues: Array.from(document.querySelectorAll('.kpi-card__value'), element =>
                normalize(element.textContent)),
              kpiTitles: Array.from(document.querySelectorAll('.kpi-card'), element =>
                element.getAttribute('title')),
              sourceFile: normalize(document.querySelector('.source-status__details dd')?.textContent),
              sourceHash: normalize(document.querySelector('.source-status__hash')?.textContent),
              qualityComponents: document.querySelectorAll('.metric-stack > .metric-progress').length,
              temporalDomains: document.querySelectorAll('[aria-label="Validez temporal por dominio GRH"] tbody tr').length,
              coverageFacts: document.querySelectorAll('[aria-label="Cobertura referencial de legajos"] tbody tr').length,
              lineageSteps: document.querySelectorAll('.lineage-list .lineage-item').length,
              risks: document.querySelectorAll('.risk-list .risk-item').length,
              actions: document.querySelectorAll('.action-queue .action-item').length,
              tableRegions: document.querySelectorAll('.table-region').length,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
              containsEmail: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(mainText),
              containsDni: /\bDNI\s*[:#-]?\s*\d/i.test(mainText),
              containsMoneyLabel: /[$â‚¬Â£]|\b(?:ARS|USD|EUR)\b/i.test(mainText),
              containsRealtimeClaim: /datos en tiempo real|actualizaci[oÃ³]n en vivo|conexi[oÃ³]n en vivo/i.test(mainText),
              exposesRawContract: /absoluteVarianceCents|currencyStatus|sourceSha256/.test(mainText),
              transitionDuration,
              hasSkipLink: Boolean(document.querySelector('a.skip-link[href="#contenido-principal"]')),
              hasThemeToggle: Boolean(document.querySelector('button.theme-toggle')),
            };
          });

          assert.equal(result.path, '/calidad');
          assert.equal(result.busy, 'false');
          assert.deepEqual(result.kpiValues.slice(0, 5), [
            '92,22/100',
            '30',
            '71,21/100',
            '98,75%',
            '8',
          ]);
          assert.ok(result.kpiTitles.includes('5.200 filas inventariadas'));
          assert.equal(result.sourceFile, 'grh_junin.synthetic_quality.sql.gz');
          assert.equal(result.sourceHash, 'a'.repeat(64));
          assert.equal(result.qualityComponents, 4);
          assert.equal(result.temporalDomains, 5);
          assert.equal(result.coverageFacts, 4);
          assert.equal(result.lineageSteps, 4);
          assert.equal(result.risks, 8);
          assert.equal(result.actions, 5);
          assert.equal(result.tableRegions, 2);
          assert.ok(result.overflow <= 1, `${viewport.name} overflow=${result.overflow}`);
          assert.deepEqual(result.duplicateIds, []);
          assert.equal(result.containsEmail, false);
          assert.equal(result.containsDni, false);
          assert.equal(result.containsMoneyLabel, false);
          assert.equal(result.containsRealtimeClaim, false);
          assert.equal(result.exposesRawContract, false);
          assert.equal(result.hasSkipLink, true);
          assert.equal(result.hasThemeToggle, true);
          if (viewport.reducedMotion === 'reduce') {
            assert.ok(result.transitionDuration !== null && result.transitionDuration <= 0.001);
          }
          assert.deepEqual(apiPaths(apiLog, start), ['/api/auth/me', '/api/grh-quality']);
          assert.deepEqual(diagnostics.consoleErrors, []);
          assert.deepEqual(diagnostics.externalRequests, []);
        } finally {
          await context.close();
        }
      }
    });
  });

  await t.test('redirects low and malformed identities before requesting quality', async () => {
    for (const scenario of [
      {
        name: 'low-role',
        authPayload: authorizedSession({ role: 'DEMO' }),
      },
      {
        name: 'malformed-auth',
        authPayload: authorizedSession({ tenantId: '' }),
      },
    ]) {
      await withScenario(scenario, async ({ apiLog, baseUrl }) => {
        const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
          viewport: { width: 390, height: 844 },
          reducedMotion: 'reduce',
        });
        try {
          await page.goto(`${baseUrl}/calidad`, { waitUntil: 'domcontentloaded' });
          await page.waitForURL(`${baseUrl}/inicio.html`);
          await page.waitForSelector('#safe-workspace');
          assert.deepEqual(apiPaths(apiLog), ['/api/auth/me'], scenario.name);
          assert.equal(apiLog.some(entry => entry.path === '/api/grh-quality'), false, scenario.name);
          assert.match(
            await page.evaluate(() => sessionStorage.getItem('mjunin_access_notice') || ''),
            /no tiene habilitada/i,
          );
          assert.deepEqual(diagnostics.consoleErrors, []);
          assert.deepEqual(diagnostics.externalRequests, []);
        } finally {
          await context.close();
        }
      });
    }
  });

  await t.test('keeps every figure hidden on 503 and authenticates again before retry', async () => {
    await withScenario({ name: 'unavailable', qualityMode: 'unavailable' }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 1_440, height: 900 },
      });
      try {
        await page.goto(`${baseUrl}/calidad`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.blocked-state[role="alert"]');
        assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-quality']);

        const retryAuth = page.waitForResponse(response =>
          new URL(response.url()).pathname === '/api/auth/me');
        const retryQuality = page.waitForResponse(response =>
          new URL(response.url()).pathname === '/api/grh-quality' && response.status() === 503);
        await page.click('.blocked-state .button--primary');
        await Promise.all([retryAuth, retryQuality]);
        await page.waitForSelector('.blocked-state[role="alert"]');

        const blocked = await page.evaluate(() => ({
          heading: document.querySelector('.blocked-state h1')?.textContent?.trim(),
          figuresMounted: Boolean(document.querySelector('.page-hero, .kpi-grid, .dashboard-grid')),
          kpis: document.querySelectorAll('.kpi-card').length,
          fixtureValuesVisible: /92,22|71,21|98,75|5\.200/.test(document.querySelector('main')?.textContent || ''),
        }));
        assert.match(blocked.heading || '', /Evidencia bloqueada/i);
        assert.equal(blocked.figuresMounted, false);
        assert.equal(blocked.kpis, 0);
        assert.equal(blocked.fixtureValuesVisible, false);
        assert.deepEqual(apiPaths(apiLog), [
          '/api/auth/me',
          '/api/grh-quality',
          '/api/auth/me',
          '/api/grh-quality',
        ]);
        assert.ok(
          diagnostics.consoleErrors.length === 2 && diagnostics.consoleErrors.every(message =>
            /Failed to load resource.*503 \(Service Unavailable\)/i.test(message)),
          `only the two expected 503 browser diagnostics are allowed: ${diagnostics.consoleErrors.join(' | ')}`,
        );
        assert.deepEqual(diagnostics.externalRequests, []);
      } finally {
        await context.close();
      }
    });
  });

  await t.test('rejects a mutated contract without mounting any municipal figure', async () => {
    await withScenario({ name: 'mutated', qualityMode: 'mutated' }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 390, height: 844 },
        reducedMotion: 'reduce',
      });
      try {
        await page.goto(`${baseUrl}/calidad`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.blocked-state[role="alert"]');
        const blocked = await page.evaluate(() => ({
          figuresMounted: Boolean(document.querySelector('.page-hero, .kpi-grid, .dashboard-grid')),
          figureText: Array.from(document.querySelectorAll('.kpi-card__value'), node => node.textContent),
          fixtureValuesVisible: /92,22|71,21|98,75|5\.200/.test(document.querySelector('main')?.textContent || ''),
        }));
        assert.equal(blocked.figuresMounted, false);
        assert.deepEqual(blocked.figureText, []);
        assert.equal(blocked.fixtureValuesVisible, false);
        assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-quality']);
        assert.deepEqual(diagnostics.consoleErrors, []);
        assert.deepEqual(diagnostics.externalRequests, []);
      } finally {
        await context.close();
      }
    });
  });
});
