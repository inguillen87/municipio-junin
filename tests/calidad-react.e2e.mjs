import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND_CONFIG = path.join(REPO, 'frontend', 'vite.config.ts');
const PWA_REGISTER_SOURCE = readFileSync(path.join(REPO, 'js', 'pwa-register.js'), 'utf8');
const PWA_TEST_WORKER_SOURCE = "self.addEventListener('install', () => self.skipWaiting()); self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));";

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

function send(response, status, contentType, body = '', headers = {}) {
  response.statusCode = status;
  response.setHeader('Content-Type', contentType);
  response.setHeader('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(body);
}

function testApiPlugin(scenario, apiLog, pwaLog) {
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

        if (url.pathname === '/js/pwa-register.js') {
          pwaLog.push(url.pathname);
          send(response, 200, 'text/javascript; charset=utf-8', PWA_REGISTER_SOURCE);
          return;
        }

        if (url.pathname === '/sw.js') {
          pwaLog.push(url.pathname);
          send(response, 200, 'text/javascript; charset=utf-8', PWA_TEST_WORKER_SOURCE, {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Service-Worker-Allowed': '/',
          });
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
          send(response, 200, 'application/json; charset=utf-8', JSON.stringify(payload), {
            'x-municontrol-contract': 'municontrol-auth-me-v1',
          });
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
  const pwaLog = [];
  const server = await createViteServer({
    configFile: FRONTEND_CONFIG,
    appType: 'mpa',
    cacheDir: path.join(tmpdir(), `municontrol-calidad-vite-${process.pid}`),
    clearScreen: false,
    logLevel: 'silent',
    plugins: [testApiPlugin(scenario, apiLog, pwaLog)],
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
    return await run({ apiLog, baseUrl, pwaLog });
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

async function assertDirectPwaRegistration(page, baseUrl, pwaLog, start, label) {
  await page.waitForFunction(() => navigator.serviceWorker?.getRegistration('/').then(registration => (
    registration?.active?.state === 'activated'
  )));
  const registration = await page.evaluate(async () => {
    const current = await navigator.serviceWorker.ready;
    return {
      scope: current.scope,
      scriptPath: new URL(current.active.scriptURL).pathname,
      updateViaCache: current.updateViaCache,
    };
  });
  const paths = pwaLog.slice(start);
  assert.ok(paths.includes('/js/pwa-register.js'), `${label}: direct entry requests the local PWA register`);
  assert.ok(paths.includes('/sw.js'), `${label}: PWA register executes service-worker registration`);
  assert.equal(registration.scope, `${baseUrl}/`, `${label}: root PWA scope`);
  assert.equal(registration.scriptPath, '/sw.js', `${label}: registered worker path`);
  assert.equal(registration.updateViaCache, 'none', `${label}: worker update bypasses HTTP cache`);
}

async function seedTheme(context, theme) {
  await context.addInitScript(selectedTheme => {
    if (sessionStorage.getItem('municontrol-visual-theme-seeded') === '1') return;
    localStorage.setItem('govtech_theme', selectedTheme);
    localStorage.setItem('municontrol-color-theme:v1', selectedTheme);
    sessionStorage.setItem('municontrol-visual-theme-seeded', '1');
  }, theme);
}

async function readVisualAudit(page) {
  return page.evaluate(() => {
    const parseColor = value => {
      if (!value || value === 'none' || value === 'transparent') return [0, 0, 0, 0];
      const rgbMatch = String(value).match(/rgba?\(([^)]+)\)/i);
      if (rgbMatch) {
        const parts = rgbMatch[1].replace('/', ' ').split(/[\s,]+/).filter(Boolean).map(Number);
        return [parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1];
      }
      const srgbMatch = String(value).match(/color\(srgb\s+([^)]+)\)/i);
      if (!srgbMatch) return null;
      const parts = srgbMatch[1].replace('/', ' ').split(/[\s,]+/).filter(Boolean);
      const channel = part => part.endsWith('%') ? Number.parseFloat(part) * 2.55 : Number(part) * 255;
      const alpha = parts[3]?.endsWith('%') ? Number.parseFloat(parts[3]) / 100 : Number(parts[3]);
      return [channel(parts[0]), channel(parts[1]), channel(parts[2]), Number.isFinite(alpha) ? alpha : 1];
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
    const contrastRatio = (first, second) => {
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
      for (let index = layers.length - 1; index >= 0; index -= 1) {
        result = composite(layers[index], result);
      }
      return result;
    };
    const selectorFor = node => {
      const className = typeof node.className === 'string' ? node.className : node.className?.baseVal || '';
      return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${
        className ? `.${className.trim().replace(/\s+/g, '.')}` : ''
      }`;
    };
    const visible = node => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return node.getClientRects().length > 0 && rect.width > 0 && rect.height > 0 &&
        style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 &&
        !node.closest('.sr-only');
    };
    const ownsVisibleText = node => node instanceof SVGTextElement || Array.from(node.childNodes).some(child =>
      child.nodeType === Node.TEXT_NODE && child.textContent.trim()
    );
    const textNodes = Array.from(document.querySelectorAll('body *')).filter(node =>
      visible(node) && !node.matches('script, style, title, desc, option') && ownsVisibleText(node)
    );
    const textViolations = textNodes.map(node => {
      const style = getComputedStyle(node);
      const background = effectiveBackground(node);
      const rawColor = parseColor(node instanceof SVGTextElement && style.fill !== 'none' ? style.fill : style.color);
      const textColor = rawColor ? composite(rawColor, background) : null;
      return {
        selector: selectorFor(node),
        text: node.textContent.trim().slice(0, 80),
        ratio: textColor ? contrastRatio(textColor, background) : 0,
        foreground: node instanceof SVGTextElement ? style.fill : style.color,
        background: `rgb(${background.slice(0, 3).map(Math.round).join(', ')})`,
      };
    }).filter(result => result.ratio < 4.5 - 0.01);
    const fontFloorViolations = textNodes.map(node => ({
      selector: selectorFor(node),
      text: node.textContent.trim().slice(0, 80),
      size: Number.parseFloat(getComputedStyle(node).fontSize),
    })).filter(result => result.size < 12 - 0.01);
    const controlBoundaryViolations = Array.from(document.querySelectorAll(
      '.theme-toggle, .button',
    )).filter(visible).map(node => {
      const style = getComputedStyle(node);
      const outside = effectiveBackground(node.parentElement || node);
      const rawBorder = parseColor(style.borderTopColor);
      const border = rawBorder ? composite(rawBorder, outside) : outside;
      return {
        selector: selectorFor(node),
        ratio: Number.parseFloat(style.borderTopWidth) > 0 ? contrastRatio(border, outside) : 1,
      };
    }).filter(result => result.ratio < 3 - 0.01);

    return {
      theme: document.documentElement.dataset.theme,
      colorScheme: document.documentElement.style.colorScheme,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      textViolations,
      fontFloorViolations,
      controlBoundaryViolations,
    };
  });
}

function assertVisualAudit(audit, expectedTheme, viewportName) {
  assert.equal(audit.theme, expectedTheme, `${viewportName} active theme`);
  assert.equal(audit.colorScheme, expectedTheme, `${viewportName} browser color scheme`);
  assert.deepEqual(
    audit.textViolations,
    [],
    `${viewportName} visible text must meet 4.5:1: ${JSON.stringify(audit.textViolations)}`,
  );
  assert.deepEqual(
    audit.fontFloorViolations,
    [],
    `${viewportName} operational text must render at 12px or larger: ${JSON.stringify(audit.fontFloorViolations)}`,
  );
  assert.deepEqual(
    audit.controlBoundaryViolations,
    [],
    `${viewportName} control boundaries must meet 3:1: ${JSON.stringify(audit.controlBoundaryViolations)}`,
  );
  assert.ok(audit.overflow <= 1, `${viewportName} overflow=${audit.overflow}`);
}

test('React Calidad canary validates governed evidence and fails closed', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  await t.test('renders the authorized synthetic contract on desktop and mobile', async () => {
    await withScenario({ name: 'authorized' }, async ({ apiLog, baseUrl, pwaLog }) => {
      for (const viewport of [
        { name: 'desktop', width: 1_440, height: 1_000, reducedMotion: 'no-preference' },
        { name: 'mobile', width: 390, height: 844, reducedMotion: 'reduce' },
      ]) {
        const start = apiLog.length;
        const pwaStart = pwaLog.length;
        const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
          viewport: { width: viewport.width, height: viewport.height },
          reducedMotion: viewport.reducedMotion,
        });

        try {
          await page.goto(`${baseUrl}/calidad`, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('#page-title');
          await assertDirectPwaRegistration(page, baseUrl, pwaLog, pwaStart, viewport.name);

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

  await t.test('keeps both themes legible and persists a real toggle on desktop and mobile', async () => {
    await withScenario({ name: 'visual-themes' }, async ({ baseUrl }) => {
      for (const viewport of [
        { name: 'desktop-dark', width: 1_440, height: 1_000, theme: 'dark' },
        { name: 'desktop-light', width: 1_440, height: 1_000, theme: 'light' },
        { name: 'mobile-dark', width: 390, height: 844, theme: 'dark' },
        { name: 'mobile-light', width: 390, height: 844, theme: 'light' },
      ]) {
        const { context, page } = await newMonitoredPage(browser, baseUrl, {
          viewport: { width: viewport.width, height: viewport.height },
          reducedMotion: viewport.width === 390 ? 'reduce' : 'no-preference',
        });
        try {
          await seedTheme(context, viewport.theme);
          await page.goto(`${baseUrl}/calidad`, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('#page-title');
          assertVisualAudit(await readVisualAudit(page), viewport.theme, viewport.name);

          const nextTheme = viewport.theme === 'dark' ? 'light' : 'dark';
          await page.locator('button.theme-toggle').click();
          await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, nextTheme);
          const persisted = await page.evaluate(() => ({
            legacy: localStorage.getItem('govtech_theme'),
            versioned: localStorage.getItem('municontrol-color-theme:v1'),
          }));
          assert.deepEqual(persisted, { legacy: nextTheme, versioned: nextTheme }, `${viewport.name} storage`);

          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForSelector('#page-title');
          assert.equal(await page.locator('html').getAttribute('data-theme'), nextTheme, `${viewport.name} reload`);
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
