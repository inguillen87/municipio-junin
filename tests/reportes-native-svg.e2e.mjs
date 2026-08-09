import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import accessPolicy from '../shared/access-policy.cjs';

const root = path.resolve(import.meta.dirname, '..');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const availablePeriods = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07'];
const participants = [820, 830, 840, 850, 856];
const approvedSha256 = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';
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
    id: 'reports-svg-qa',
    name: 'QA Reportes',
    role,
    tenantId,
    capabilities: access.capabilities,
    accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
    homeProfile: access.homeProfile,
  };
  return malformedProjection ? { ...user, capabilities: 'navigation.reports' } : user;
}

function fakeToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'reports-svg-qa',
    role: 'INTENDENTE',
    tenantId: 'tenant-junin-test',
    exp: Math.floor(Date.now() / 1000) + 600,
  })}.qa`;
}

function availableReport(requestedPeriod = '2026-07') {
  const index = availablePeriods.indexOf(requestedPeriod);
  const period = index >= 0 ? requestedPeriod : '2026-07';
  const selectedIndex = availablePeriods.indexOf(period);
  const participantCount = participants[selectedIndex];
  const distributionAvailable = period === '2026-07';
  return {
    schemaVersion: 'grh-executive-report-v2',
    period,
    generatedAt: '2026-08-08T12:00:00.000Z',
    availablePeriods,
    availablePeriodRange: { first: '2026-03', last: '2026-07', count: 5 },
    source: {
      canonicalSystem: 'GRH Junin',
      approvedSha256,
      profileSchemaVersion: 'grh-profile-v1',
      semanticSchemaVersion: 'grh-semantic-v2',
      executiveSchemaVersion: 'grh-executive-v2',
      qualitySchemaVersion: 'grh-quality-v1',
      privacyPolicyVersion: 'grh-small-cell-v1',
      portableThreshold: 10,
      snapshotAsOf: '2026-08-06',
      realtime: false,
      aggregateOnly: true,
      containsPii: false,
      excludedSources: ['personas_junin'],
    },
    dataStatus: {
      available: true,
      source: 'grh-executive-portable',
      freshness: 'historical_snapshot',
      period,
      snapshotAsOf: '2026-08-06',
      realtime: false,
      warning: 'Snapshot historico GRH: no es una conexion en tiempo real.',
    },
    definitions: {
      workforce: 'Participantes de calculo; no dotacion contractual activa.',
      calculationControl: 'Control agregado de liquidacion.',
      amountUnit: 'source_currency_cents',
      currency: 'not_declared_in_source',
      metricStatus: 'calculation_control_not_bank_disbursement',
      totpagoStatus: 'totpago_diagnostic_only',
    },
    executiveSummary: [
      `${participantCount} participantes distintos aparecen en calculos validos del periodo ${period}.`,
      'El control queda dentro de la tolerancia; no evidencia un pago bancario.',
      'El score de calidad corresponde al extracto agregado gobernado.',
    ],
    participantTrend: availablePeriods.slice(0, selectedIndex + 1).map((item, itemIndex) => ({
      period: item,
      participants: participants[itemIndex],
    })),
    workforce: {
      referencePeriod: '2026-07',
      payrollParticipants: participantCount,
      matchedLegajoParticipants: distributionAvailable ? 856 : null,
      legajoMatchRatePct: distributionAvailable ? 100 : null,
      distributionBySector: {
        available: distributionAvailable,
        reason: distributionAvailable ? null : 'distribution_only_available_for_workforce_reference_period',
        referencePeriod: '2026-07',
        privacyStatus: distributionAvailable ? 'partially_suppressed' : undefined,
        threshold: distributionAvailable ? 10 : undefined,
        participants: distributionAvailable ? [
          { label: 'Servicios publicos', participants: 420, sharePct: 49.07, privacyStatus: 'released' },
          { label: 'Administracion', participants: 300, sharePct: 35.05, privacyStatus: 'released' },
          { label: 'Otros (celdas protegidas)', participants: 136, sharePct: 15.88, privacyStatus: 'protected_aggregate' },
        ] : [],
      },
    },
    calculationControl: {
      period,
      privacyStatus: 'released',
      distinctPayrollParticipants: participantCount,
      participantDisplay: String(participantCount),
      amountUnit: 'source_currency_cents',
      currency: 'not_declared_in_source',
      metricStatus: 'calculation_control_not_bank_disbursement',
      components: [
        { key: 'gross_with_family_allowances_cents', label: 'Bruto con asignaciones', valueCents: 120_824_127_214 },
        { key: 'employee_withholdings_cents', label: 'Retenciones del agente', valueCents: 25_686_069_786 },
        { key: 'net_payroll_cents', label: 'Neto de control', valueCents: 95_138_057_279 },
        { key: 'employer_contributions_cents', label: 'Contribuciones patronales', valueCents: 18_942_849_015 },
      ],
      identityWithinRoundingTolerance: period === '2026-07' ? true : null,
    },
    quality: {
      scorePct: 88.99,
      scope: 'extracto agregado gobernado',
      components: [
        { key: 'temporal_validity', label: 'Validez temporal', scorePct: 99, weightPct: 30 },
        { key: 'referential_integrity', label: 'Integridad referencial', scorePct: 95, weightPct: 25 },
        { key: 'payroll_reconciliation', label: 'Conciliacion de controles', scorePct: 62, weightPct: 35 },
        { key: 'legajo_key_uniqueness', label: 'Unicidad de legajos', scorePct: 100, weightPct: 10 },
      ],
      riskFlags: {
        historicalSnapshotNotRealtime: true,
        currencyNotDeclared: true,
        totpagoCrossSourceMismatch: true,
        quarantinedTemporalRows: 12,
        calculationControlAnomalousPeriods: 4,
      },
    },
    recommendedNextSteps: ['Declarar moneda y unidad antes de interpretar importes.'],
    furtherQuestions: ['Que maestro definira el estado contractual activo?'],
    caveats: [
      'Snapshot historico; realtime=false.',
      'personas_junin esta excluida.',
      'Control de calculo; no pago bancario.',
    ],
  };
}

async function createServer(mode, requestLog = [], options = {}) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/js/nav.js' && options.navMode) {
      const malformed = options.navMode === 'malformed'
        ? "window.requireCapability = async function () { return { allowed: true }; };"
        : '';
      response.writeHead(200, { 'Content-Type': contentTypes['.js'], 'Cache-Control': 'no-store' });
      response.end(`window.__muniAuthValidated = true; window.MuniAuthReady = Promise.resolve(true); ${malformed}`);
      return;
    }
    if (url.pathname === '/api/auth/me') {
      response.writeHead(200, { 'Content-Type': contentTypes['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ user: authoritativeUser(
        options.authRole || 'INTENDENTE',
        options.malformedProjection === true,
      ) }));
      return;
    }
    if (PRIVATE_DATA_PATHS.has(url.pathname)) {
      requestLog.push({
        pathname: url.pathname,
        authorization: request.headers.authorization || '',
      });
      if (url.pathname !== '/api/reports') {
        response.writeHead(410, { 'Content-Type': contentTypes['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: 'Contrato no utilizado por Reportes' }));
        return;
      }
      const requestedPeriod = url.searchParams.get('period') || '2026-07';
      response.writeHead(mode === 'available' ? 200 : 503, { 'Content-Type': contentTypes['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(mode === 'available'
        ? availableReport(requestedPeriod)
        : {
            error: 'Contrato GRH no disponible',
            dataStatus: {
              available: false,
              source: 'grh-executive-portable',
              warning: 'No hay evidencia GRH agregada y validada disponible para este informe.',
            },
          }));
      return;
    }

    const relative = decodeURIComponent(url.pathname.slice(1) || 'reportes.html');
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(target);
      response.writeHead(200, { 'Content-Type': contentTypes[path.extname(target)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function openAuthenticatedReport(browser, baseUrl, viewport, contextOptions = {}) {
  const context = await browser.newContext({ viewport, ...contextOptions });
  await context.addInitScript(({ token }) => {
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify({
      id: 'reports-svg-qa',
      name: 'QA Reportes',
      role: 'INTENDENTE',
      tenantId: 'tenant-junin-test',
    }));
  }, { token: fakeToken() });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto(`${baseUrl}/reportes.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.MuniAuthReady);
  return { context, page, consoleErrors };
}

test('reportes guards initial, period and retry loaders with the exact report capability', async () => {
  const html = await readFile(path.join(root, 'reportes.html'), 'utf8');
  assert.match(html, /await window\.requireCapability\('navigation\.reports'\)/);
  assert.match(html, /async function initReportes\(\)[\s\S]*if \(!await requirePageCapability\(\)\) return;[\s\S]*await loadReport\(false\)/);
  assert.match(html, /retry-report'[\s\S]*loadAuthorizedReport/);
  assert.match(html, /period-selector'[\s\S]*loadAuthorizedReport/);
});

test('reportes capability preflight redirects denied or malformed clients before private requests', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  for (const scenario of [
    { name: 'low role denied by authoritative /me', authRole: 'TENANT_USER' },
    { name: 'malformed authoritative projection', malformedProjection: true },
    { name: 'missing capability helper', navMode: 'missing' },
    { name: 'malformed capability helper', navMode: 'malformed' },
  ]) {
    const requestLog = [];
    const server = await createServer('available', requestLog, scenario);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addInitScript(({ token }) => {
        sessionStorage.setItem('mjunin_token', token);
        sessionStorage.setItem('mjunin_user', JSON.stringify({
          id: 'stale-reports-svg-qa',
          name: 'Stale QA Reportes',
          role: 'INTENDENTE',
          tenantId: 'tenant-junin-test',
        }));
      }, { token: fakeToken() });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/reportes.html`, { waitUntil: 'domcontentloaded' });
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

test('reportes renders accessible governed GRH SVG charts at their visible desktop and mobile widths', async t => {
  const server = await createServer('available');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  for (const viewport of [{ width: 1440, height: 940 }, { width: 390, height: 844 }]) {
    const { context, page, consoleErrors } = await openAuthenticatedReport(browser, baseUrl, viewport);
    await page.waitForFunction(() => document.querySelector('#chart-participantes')?.dataset.chartState === 'ready');

    const result = await page.evaluate(() => ({
      status: document.querySelector('#data-status')?.textContent,
      selectedPeriod: document.querySelector('#period-selector')?.value,
      periodOptions: [...document.querySelectorAll('#period-selector option')].map(option => option.value),
      visibleText: document.querySelector('main')?.textContent,
      skipTarget: document.querySelector('.skip-link')?.getAttribute('href'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));

    assert.equal(result.selectedPeriod, '2026-07');
    assert.deepEqual([...result.periodOptions].sort(), [...availablePeriods].sort());
    assert.match(result.status, /GRH canónico.*linaje e7403da1d036…8250b3d9.*agregado sin PII.*no tiempo real.*personas_junin excluida/i);
    assert.equal(result.skipTarget, '#main-content');
    assert.match(result.visibleText, /moneda no (?:está )?declarada/i);
    assert.match(result.visibleText, /no evidencia un pago bancario|ningún valor acredita .*pago bancario/i);
    assert.match(result.visibleText, /e7403da1d036…8250b3d9/i);
    assert.doesNotMatch(result.visibleText, new RegExp(approvedSha256, 'i'));
    assert.doesNotMatch(result.visibleText, /Visualización no habilitada|\bARS\b|\$\s*\d|data_points/i);
    assert.ok(result.overflow <= 1, `reportes horizontal overflow at ${viewport.width}px: ${result.overflow}px`);

    await page.locator('.skip-link').focus();
    assert.ok(await page.locator('.skip-link').evaluate(node => node.getBoundingClientRect().top >= 0));

    const chartByTab = {
      resumen: 'chart-participantes',
      dotacion: 'chart-sectores',
      control: 'chart-control',
      calidad: 'chart-calidad',
    };
    const renderedCharts = [];
    for (const [tab, chartId] of Object.entries(chartByTab)) {
      await page.locator(`.tab-btn[data-tab="${tab}"]`).click();
      await page.waitForFunction(id => document.getElementById(id)?.dataset.chartState === 'ready', chartId);
      const bounds = await page.evaluate(({ tab, chartId }) => {
        const panel = document.querySelector('.report-panel.active');
        const card = panel.querySelector('.report-card').getBoundingClientRect();
        const button = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
        const container = document.getElementById(chartId);
        const svg = container.querySelector('svg');
        const viewBox = svg.viewBox.baseVal;
        const label = svg.querySelector('.chart-label, .chart-axis-label');
        const cssFontSize = Number.parseFloat(getComputedStyle(label).fontSize);
        return {
          viewportWidth: document.documentElement.clientWidth,
          left: card.left,
          right: card.right,
          activeTab: document.querySelector('.tab-btn.active')?.dataset.tab,
          activeTabIndex: button.tabIndex,
          panelLabelledBy: panel.getAttribute('aria-labelledby'),
          buttonId: button.id,
          state: container.dataset.chartState,
          source: container.dataset.source,
          svgRole: svg.getAttribute('role'),
          labelledBy: svg.getAttribute('aria-labelledby'),
          title: svg.querySelector('title')?.textContent,
          description: svg.querySelector('desc')?.textContent,
          note: container.querySelector('.chart-meta')?.textContent,
          containerWidth: container.getBoundingClientRect().width,
          svgWidth: svg.getBoundingClientRect().width,
          viewBoxWidth: viewBox.width,
          effectiveLabelPx: cssFontSize * (svg.getBoundingClientRect().width / viewBox.width),
        };
      }, { tab, chartId });
      assert.equal(bounds.activeTab, tab);
      assert.equal(bounds.activeTabIndex, 0);
      assert.equal(bounds.panelLabelledBy, bounds.buttonId);
      assert.equal(bounds.state, 'ready');
      assert.equal(bounds.source, 'grh-executive-portable');
      assert.equal(bounds.svgRole, 'img');
      assert.equal(bounds.labelledBy?.split(' ').length, 2);
      assert.ok(bounds.title && bounds.description && bounds.note);
      assert.ok(bounds.left >= -1, `${tab} starts outside the ${viewport.width}px viewport: ${bounds.left}px`);
      assert.ok(bounds.right <= bounds.viewportWidth + 1, `${tab} exceeds the ${viewport.width}px viewport: ${bounds.right}px`);
      assert.ok(Math.abs(bounds.viewBoxWidth - Math.max(320, Math.round(bounds.containerWidth))) <= 2,
        `${tab} rendered against hidden/fallback width ${bounds.viewBoxWidth} for ${bounds.containerWidth}px`);
      assert.ok(bounds.effectiveLabelPx >= 9,
        `${tab} effective SVG label is too small at ${viewport.width}px: ${bounds.effectiveLabelPx}px`);
      renderedCharts.push(bounds);
    }
    assert.equal(renderedCharts.length, 4);

    if (viewport.width === 1440) {
      await page.locator('#tab-btn-resumen').focus();
      await page.keyboard.press('End');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'tab-btn-calidad');
      await page.keyboard.press('Home');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'tab-btn-resumen');
      await page.keyboard.press('ArrowLeft');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'tab-btn-calidad');
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'tab-btn-resumen');
      assert.deepEqual(
        await page.locator('.tab-btn').evaluateAll(nodes => nodes.map(node => node.tabIndex)),
        [0, -1, -1, -1],
      );

      await page.locator('#period-selector').selectOption('2026-06');
      await page.waitForFunction(() => document.querySelector('#data-status')?.textContent.includes('jun 2026'));
      assert.equal(await page.locator('#period-selector').inputValue(), '2026-06');
      await page.locator('#tab-btn-dotacion').click();
      await page.waitForFunction(() => document.querySelector('#chart-sectores')?.dataset.chartState === 'empty');
      assert.equal(await page.locator('#chart-sectores').getAttribute('data-chart-state'), 'empty');
      assert.match(await page.locator('#sector-insight').textContent(), /sin inventar una composición histórica/i);
    }

    assert.deepEqual(consoleErrors, []);
    await context.close();
  }
});

test('reportes honors the operating-system reduced-motion preference', async t => {
  const server = await createServer('available');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const { context, page } = await openAuthenticatedReport(
    browser,
    baseUrl,
    { width: 390, height: 844 },
    { reducedMotion: 'reduce' },
  );
  await page.waitForFunction(() => document.querySelector('#chart-participantes')?.dataset.chartState === 'ready');
  const motion = await page.evaluate(() => {
    const durationToMs = value => value.split(',').reduce((maximum, item) => {
      const token = item.trim();
      const milliseconds = token.endsWith('ms') ? Number.parseFloat(token) : Number.parseFloat(token) * 1000;
      return Math.max(maximum, milliseconds);
    }, 0);
    const style = getComputedStyle(document.querySelector('.tab-btn'));
    return {
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      transitionMs: durationToMs(style.transitionDuration),
      animationMs: durationToMs(style.animationDuration),
    };
  });
  assert.equal(motion.reduced, true);
  assert.ok(motion.transitionMs <= 0.01, `transition remains ${motion.transitionMs}ms`);
  assert.ok(motion.animationMs <= 0.01, `animation remains ${motion.animationMs}ms`);
  await context.close();
});

test('reportes creates no SVG metrics and offers retry when the governed source is unavailable', async t => {
  const server = await createServer('unavailable');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const { context, page, consoleErrors } = await openAuthenticatedReport(browser, baseUrl, { width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelectorAll('.chart-container[data-chart-state="empty"]').length === 4);
  const result = await page.evaluate(() => ({
    status: document.querySelector('#data-status')?.textContent,
    svgCount: document.querySelectorAll('.chart-container svg').length,
    states: [...document.querySelectorAll('.chart-container')].map(container => container.dataset.chartState),
    emptyMessages: [...document.querySelectorAll('.chart-empty')].map(node => node.textContent),
    tableMessages: [...document.querySelectorAll('tbody')].map(node => node.textContent),
    retryVisible: document.querySelector('#retry-report')?.classList.contains('visible'),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));

  assert.match(result.status, /No hay evidencia GRH agregada y validada/i);
  assert.equal(result.svgCount, 0);
  assert.deepEqual(result.states, ['empty', 'empty', 'empty', 'empty']);
  assert.ok(result.emptyMessages.every(message => /Sin evidencia GRH agregada y validada/i.test(message)));
  assert.ok(result.tableMessages.every(message => /Sin evidencia GRH validada/i.test(message)));
  assert.equal(result.retryVisible, true);
  assert.ok(consoleErrors.every(message => /503 \(Service Unavailable\)/i.test(message)));
  assert.ok(result.overflow <= 1, `reportes unavailable mobile overflow: ${result.overflow}px`);
  await context.close();
});
