import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND_CONFIG = path.join(REPO, 'frontend', 'vite.config.ts');
const CONTRACT_HEADER = 'x-municontrol-contract';
const AUTH_CONTRACT = 'municontrol-auth-me-v1';
const EXECUTIVE_CONTRACT = 'grh-executive-v2';
const PROTECTED_BUCKET = 'Otros (celdas protegidas)';
const EXPECTED_COLLECTIONS = ['absence', 'leave', 'movements', 'payroll', 'sector'];

let scenarioSequence = 0;

function percentage(participants, total) {
  return Number(((participants / total) * 100).toFixed(4));
}

function ranking(rows) {
  const totalParticipants = rows.reduce((total, row) => total + row.participants, 0);
  const hasProtected = rows.some(row => row.protected === true);
  return {
    threshold: 5,
    totalParticipants,
    participantDisplay: String(totalParticipants),
    privacyStatus: hasProtected ? 'partially_suppressed' : 'released',
    rows: rows.map((row, index) => row.protected ? {
      companyCode: null,
      sourceCode: null,
      label: PROTECTED_BUCKET,
      participants: row.participants,
      participantDisplay: String(row.participants),
      sharePct: percentage(row.participants, totalParticipants),
      privacyStatus: 'protected_aggregate',
    } : {
      companyCode: `C${index + 1}`,
      sourceCode: `S${index + 1}`,
      label: row.label,
      participants: row.participants,
      participantDisplay: String(row.participants),
      sharePct: percentage(row.participants, totalParticipants),
      privacyStatus: 'released',
    }),
  };
}

function monetaryRow(period, participantCount, netPayrollCents) {
  return {
    period,
    participantCount,
    participantDisplay: String(participantCount),
    privacyStatus: 'released',
    amounts: {
      grossWithFamilyAllowancesCents: netPayrollCents + 30_000_000,
      employeeWithholdingsCents: 20_000_000,
      netPayrollCents,
      employerContributionsCents: 10_000_000,
    },
  };
}

function sensitiveDomain(sourceTable, rows) {
  return {
    sourceTable,
    metric: 'valid_rows_by_year',
    series: rows.map(row => ({
      period: row.period,
      value: row.value,
      participantCount: row.participantCount,
      participantDisplay: String(row.participantCount),
      privacyStatus: 'released',
    })),
  };
}

function createExecutiveFixture() {
  return {
    schemaVersion: EXECUTIVE_CONTRACT,
    policyVersion: 'grh-small-cell-v1',
    source: {
      canonicalSystem: 'GRH Junin synthetic executive fixture',
      sourceFile: 'grh_junin.synthetic_executive.sql.gz',
      sourceSha256: 'c'.repeat(64),
      snapshotAsOf: '2026-08-01',
      realtime: false,
    },
    privacy: {
      audience: 'interactive',
      interactiveThreshold: 5,
      sensitiveThreshold: 10,
      portableThreshold: 10,
      protectedBucketLabel: PROTECTED_BUCKET,
    },
    workforce: {
      definition: 'Claves de legajo con calculo valido en el periodo de referencia.',
      referencePeriod: '2026-07',
      payrollParticipants: 100,
      bySector: ranking([
        { label: 'Sector Norte sintetico', participants: 50 },
        { label: 'Sector Centro sintetico', participants: 30 },
        { participants: 20, protected: true },
      ]),
      byCostCenter: ranking([
        { label: 'Centro operativo sintetico', participants: 55 },
        { label: 'Centro administrativo sintetico', participants: 45 },
      ]),
      byAgreement: ranking([
        { label: 'Convenio A sintetico', participants: 65 },
        { label: 'Convenio B sintetico', participants: 35 },
      ]),
    },
    compensation: {
      currency: 'not_declared_in_source',
      amountUnit: 'source_currency_cents',
      metricStatus: 'calculation_control_not_bank_disbursement',
      series: [
        monetaryRow('2026-05', 90, 90_000_000),
        monetaryRow('2026-06', 95, 100_000_000),
        monetaryRow('2026-07', 100, 125_000_000),
      ],
    },
    absence: sensitiveDomain('ausencia', [
      { period: '2024', value: 200, participantCount: 40 },
      { period: '2025', value: 320, participantCount: 50 },
      { period: '2026', value: 100, participantCount: 30 },
    ]),
    leave: sensitiveDomain('licencia', [
      { period: '2024', value: 80, participantCount: 20 },
      { period: '2025', value: 90, participantCount: 25 },
    ]),
    movements: sensitiveDomain('legamov', [
      { period: '2024', value: 500, participantCount: 70 },
      { period: '2025', value: 750, participantCount: 80 },
      { period: '2026', value: 900, participantCount: 90 },
    ]),
  };
}

const EXECUTIVE_FIXTURE = createExecutiveFixture();

function authorizedSession(role = 'INTENDENTE', overrides = {}) {
  return {
    user: {
      id: `executive-e2e-${role.toLowerCase()}`,
      name: `Perfil ${role} QA`,
      role,
      tenantId: 'tenant-executive-e2e',
      capabilities: [
        'session.read',
        'navigation.workspace',
        'navigation.grh-executive',
      ],
      tenant: {
        id: 'tenant-executive-e2e',
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

const AUTH_CLIENT_SOURCE = `
  (() => {
    class TestAuthError extends Error {
      constructor(code, status) {
        super(code);
        this.name = 'AuthError';
        this.code = code;
        this.status = status;
      }
    }
    window.MuniAuth = Object.freeze({
      async fetch(input, init) {
        const url = new URL(input instanceof Request ? input.url : input, window.location.href);
        if (url.origin !== window.location.origin) throw new TestAuthError('UNSAFE_ORIGIN', 0);
        const response = await window.fetch(input, init);
        if (response.status === 401) {
          window.location.replace('/login.html');
          throw new TestAuthError('AUTH_EXPIRED', 401);
        }
        return response;
      },
      getToken() { return null; },
      isAuthError(error) {
        return Boolean(error && (error.code === 'AUTH_REQUIRED' || error.code === 'AUTH_EXPIRED'));
      }
    });
  })();
`;

function testApiPlugin(scenario, apiLog) {
  return {
    name: `ejecutivo-react-e2e-${scenario.name}`,
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url || '/', 'http://127.0.0.1');

        if (url.pathname === '/ejecutivo') {
          request.url = `/ejecutivo.html${url.search}`;
          next();
          return;
        }

        if (url.pathname === '/js/auth-fetch.js') {
          send(response, 200, 'text/javascript; charset=utf-8', AUTH_CLIENT_SOURCE);
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

        if (url.pathname === '/login.html') {
          send(response, 200, 'text/html; charset=utf-8',
            '<!doctype html><html lang="es"><title>Acceso seguro</title>' +
            '<body><main id="safe-login">Inicio de sesion seguro</main></body></html>');
          return;
        }

        if (url.pathname === '/grh-ejecutivo.html') {
          send(response, 200, 'text/html; charset=utf-8',
            '<!doctype html><html lang="es"><title>Centro GRH estable</title>' +
            '<body><main id="stable-executive">Centro GRH estable</main></body></html>');
          return;
        }

        if (url.pathname === '/api/auth/me') {
          apiLog.push({ method: request.method, path: url.pathname });
          if (scenario.authStatus === 401) {
            send(response, 401, 'application/json; charset=utf-8', JSON.stringify({ error: 'unauthorized' }), {
              [CONTRACT_HEADER]: AUTH_CONTRACT,
            });
            return;
          }
          const payload = scenario.authPayload ?? authorizedSession(scenario.role);
          send(response, 200, 'application/json; charset=utf-8', JSON.stringify(payload), {
            [CONTRACT_HEADER]: AUTH_CONTRACT,
          });
          return;
        }

        if (url.pathname === '/api/grh-executive') {
          apiLog.push({ method: request.method, path: url.pathname });
          if (scenario.executiveMode === 'unavailable') {
            send(response, 503, 'application/json; charset=utf-8',
              JSON.stringify({ error: 'executive_contract_unavailable' }),
              { [CONTRACT_HEADER]: EXECUTIVE_CONTRACT });
            return;
          }
          if (scenario.executiveMode === 'not-json') {
            send(response, 200, 'text/html; charset=utf-8', '<h1>unexpected document</h1>',
              { [CONTRACT_HEADER]: EXECUTIVE_CONTRACT });
            return;
          }
          if (scenario.executiveMode === 'invalid-json') {
            send(response, 200, 'application/json; charset=utf-8', '{"schemaVersion":',
              { [CONTRACT_HEADER]: EXECUTIVE_CONTRACT });
            return;
          }

          const payload = structuredClone(EXECUTIVE_FIXTURE);
          if (scenario.executiveMode === 'mutated') payload.source.realtime = true;
          const contractHeader = scenario.executiveMode === 'wrong-contract-header'
            ? 'grh-executive-v1'
            : EXECUTIVE_CONTRACT;
          send(response, 200, 'application/json; charset=utf-8', JSON.stringify(payload), {
            [CONTRACT_HEADER]: contractHeader,
          });
          return;
        }

        if (url.pathname.startsWith('/api/')) {
          apiLog.push({ method: request.method, path: url.pathname });
          send(response, 404, 'application/json; charset=utf-8', JSON.stringify({ error: 'not_found' }));
          return;
        }

        next();
      });
    },
  };
}

async function withScenario(scenario, run) {
  scenarioSequence += 1;
  const apiLog = [];
  const server = await createViteServer({
    configFile: FRONTEND_CONFIG,
    appType: 'mpa',
    cacheDir: path.join(tmpdir(), `municontrol-ejecutivo-vite-${process.pid}-${scenarioSequence}`),
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

async function newMonitoredPage(browser, baseUrl, options = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  return { context, page, diagnostics: monitorPage(page, baseUrl) };
}

function apiPaths(apiLog, start = 0) {
  return apiLog.slice(start).map(entry => entry.path);
}

function assertNoLegacyDataEndpoint(apiLog) {
  assert.equal(apiLog.some(entry => /\/api\/(?:_data|grh-data)(?:\/|$)/.test(entry.path)), false);
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
      '.theme-toggle, .button, .executive-hero__actions a',
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

async function readyDiagnostics(page) {
  return page.evaluate(expectedCollections => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const main = document.querySelector('main');
    const mainText = normalize(main?.textContent);
    const ids = Array.from(document.querySelectorAll('[id]'), element => element.id);
    const collections = Array.from(
      document.querySelectorAll('[data-executive-collection]'),
      element => element.getAttribute('data-executive-collection'),
    ).filter(Boolean).sort();

    return {
      path: window.location.pathname,
      busy: main?.getAttribute('aria-busy'),
      kpiValues: Array.from(
        document.querySelectorAll('.kpi-grid > .kpi-card .kpi-card__value'),
        element => normalize(element.textContent),
      ),
      collections,
      expectedCollections,
      sourceVisible: mainText.includes('grh_junin.synthetic_executive.sql.gz'),
      sourceHashVisible: mainText.includes('c'.repeat(64)),
      noRealtimeQualifier: /no es tiempo real/i.test(mainText),
      positiveRealtimeClaim: /datos en tiempo real|actualizaci\u00f3n en vivo|conexi\u00f3n en vivo/i.test(mainText),
      hasArsClaim: /\bARS\b|pesos argentinos/i.test(mainText),
      noPaymentQualifier: /no (?:equivale|acredita)[^.]{0,80}pago bancario/i.test(mainText),
      noActiveQualifier: /no (?:implica|representa)[^.]{0,100}(?:dotaci\u00f3n|personas?) activ/i.test(mainText),
      noRateQualifier: /no (?:es |son )?(?:una |un |las )?tasas?\b/i.test(mainText),
      noCauseQualifier: /no (?:explican?|demuestra)[^.]{0,50}causa/i.test(mainText),
      positivePaymentClaim: /sueldos? pagados?|pago (?:realizado|efectuado|acreditado)/i.test(mainText),
      positiveActiveClaim: /(?:son|representan?) (?:empleados|personas|personal) activ/i.test(mainText),
      causalClaim: /(?:causado|originado|provocado) por/i.test(mainText),
      exposesRawContract: /netPayrollCents|sourceSha256|participantCount|privacyStatus/.test(mainText),
      containsEmail: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(mainText),
      containsDni: /\bDNI\s*[:#-]?\s*\d/i.test(mainText),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      forcedColors: window.matchMedia('(forced-colors: active)').matches,
      hasSkipLink: Boolean(document.querySelector('a.skip-link[href="#contenido-principal"]')),
      hasThemeToggle: Boolean(document.querySelector('button.theme-toggle')),
    };
  }, EXPECTED_COLLECTIONS);
}

async function blockedDiagnostics(page) {
  return page.evaluate(() => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const main = document.querySelector('main');
    const mainText = normalize(main?.textContent);
    return {
      heading: normalize(document.querySelector('.blocked-state h1')?.textContent),
      readyMounted: Boolean(document.querySelector('#page-title, .kpi-grid, [data-executive-collection]')),
      kpis: document.querySelectorAll('.kpi-card').length,
      fixtureLeak: /synthetic_executive|Sector Norte sintetico|1\.250\.000|2\.150/.test(mainText) ||
        mainText.includes('c'.repeat(64)),
    };
  });
}

test('React Ejecutivo validates the governed synthetic contract and fails closed', {
  timeout: 240_000,
}, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  await t.test('renders five KPIs and five governed collections at every target viewport', async () => {
    await withScenario({ name: 'authorized-intendente', role: 'INTENDENTE' }, async ({ apiLog, baseUrl }) => {
      for (const viewport of [
        {
          name: 'desktop',
          context: { viewport: { width: 1_440, height: 1_000 }, reducedMotion: 'no-preference' },
        },
        {
          name: 'mobile',
          context: { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' },
        },
        {
          name: 'compact-forced-colors',
          context: {
            viewport: { width: 320, height: 720 },
            reducedMotion: 'reduce',
            forcedColors: 'active',
          },
        },
      ]) {
        const start = apiLog.length;
        const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, viewport.context);
        try {
          const executiveResponsePromise = page.waitForResponse(response =>
            new URL(response.url()).pathname === '/api/grh-executive');
          await page.goto(`${baseUrl}/ejecutivo`, { waitUntil: 'domcontentloaded' });
          const executiveResponse = await executiveResponsePromise;
          assert.equal(executiveResponse.status(), 200);
          assert.equal(executiveResponse.headers()[CONTRACT_HEADER], EXECUTIVE_CONTRACT);
          await page.waitForSelector('#page-title');

          const result = await readyDiagnostics(page);
          assert.equal(result.path, '/ejecutivo');
          assert.equal(result.busy, 'false');
          assert.equal(result.kpiValues.length, 5);
          assert.deepEqual(result.collections, EXPECTED_COLLECTIONS);
          assert.deepEqual(result.expectedCollections, EXPECTED_COLLECTIONS);
          assert.equal(result.sourceVisible, true);
          assert.equal(result.sourceHashVisible, true);
          assert.equal(result.noRealtimeQualifier, true);
          assert.equal(result.positiveRealtimeClaim, false);
          assert.equal(result.hasArsClaim, true);
          assert.equal(result.noPaymentQualifier, true);
          assert.equal(result.noActiveQualifier, true);
          assert.equal(result.noRateQualifier, true);
          assert.equal(result.noCauseQualifier, true);
          assert.equal(result.positivePaymentClaim, false);
          assert.equal(result.positiveActiveClaim, false);
          assert.equal(result.causalClaim, false);
          assert.equal(result.exposesRawContract, false);
          assert.equal(result.containsEmail, false);
          assert.equal(result.containsDni, false);
          assert.ok(result.overflow <= 1, `${viewport.name} overflow=${result.overflow}`);
          assert.deepEqual(result.duplicateIds, []);
          assert.equal(result.hasSkipLink, true);
          assert.equal(result.hasThemeToggle, true);
          assert.equal(result.reducedMotion, viewport.context.reducedMotion === 'reduce');
          assert.equal(result.forcedColors, viewport.context.forcedColors === 'active');
          assert.deepEqual(apiPaths(apiLog, start), ['/api/auth/me', '/api/grh-executive']);
          assert.deepEqual(diagnostics.consoleErrors, []);
          assert.deepEqual(diagnostics.externalRequests, []);
        } finally {
          await context.close();
        }
      }
      assertNoLegacyDataEndpoint(apiLog);
    });
  });

  await t.test('keeps both themes legible and persists a real toggle on desktop and mobile', async () => {
    await withScenario({ name: 'visual-themes', role: 'INTENDENTE' }, async ({ baseUrl }) => {
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
          await page.goto(`${baseUrl}/ejecutivo`, { waitUntil: 'domcontentloaded' });
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

      const { context, page } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 1_440, height: 1_000 },
      });
      try {
        await context.addInitScript(() => {
          if (sessionStorage.getItem('municontrol-theme-conflict-seeded') === '1') return;
          localStorage.setItem('govtech_theme', 'dark');
          localStorage.setItem('municontrol-color-theme:v1', 'light');
          sessionStorage.setItem('municontrol-theme-conflict-seeded', '1');
        });
        await page.goto(`${baseUrl}/ejecutivo`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#page-title');
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'light', 'versioned key wins conflicts');
        assert.deepEqual(await page.evaluate(() => ({
          legacy: localStorage.getItem('govtech_theme'),
          versioned: localStorage.getItem('municontrol-color-theme:v1'),
        })), { legacy: 'light', versioned: 'light' }, 'AppShell synchronizes conflicting keys');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#page-title');
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'light', 'canonical theme survives reload');
      } finally {
        await context.close();
      }
    });
  });

  await t.test('authorizes all four governed high roles', async () => {
    for (const role of ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']) {
      await withScenario({ name: `high-role-${role.toLowerCase()}`, role }, async ({ apiLog, baseUrl }) => {
        const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
          viewport: { width: 1_024, height: 768 },
        });
        try {
          const executiveResponsePromise = page.waitForResponse(response =>
            new URL(response.url()).pathname === '/api/grh-executive');
          await page.goto(`${baseUrl}/ejecutivo`, { waitUntil: 'domcontentloaded' });
          assert.equal((await executiveResponsePromise).status(), 200, role);
          await page.waitForSelector('#page-title');
          assert.equal(await page.locator('.kpi-grid > .kpi-card').count(), 5, role);
          assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-executive'], role);
          assertNoLegacyDataEndpoint(apiLog);
          assert.deepEqual(diagnostics.consoleErrors, [], role);
          assert.deepEqual(diagnostics.externalRequests, [], role);
        } finally {
          await context.close();
        }
      });
    }
  });

  await t.test('enforces the published six-role matrix before any executive request', async () => {
    const matrix = [
      { role: 'INTENDENTE', allowed: true },
      { role: 'TENANT_ADMIN', allowed: true },
      { role: 'CONTADOR', allowed: true },
      { role: 'DEMO', allowed: false },
      { role: 'INSPECTOR', allowed: false },
      { role: 'TENANT_USER', allowed: false },
    ];

    for (const row of matrix) {
      await withScenario({ name: `published-${row.role.toLowerCase()}`, role: row.role }, async ({ apiLog, baseUrl }) => {
        const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
          viewport: { width: 390, height: 844 },
          reducedMotion: 'reduce',
        });
        try {
          const executiveResponsePromise = row.allowed
            ? page.waitForResponse(response => new URL(response.url()).pathname === '/api/grh-executive')
            : null;
          await page.goto(`${baseUrl}/ejecutivo`, { waitUntil: 'domcontentloaded' });
          if (row.allowed) {
            assert.equal((await executiveResponsePromise).status(), 200, row.role);
            await page.waitForSelector('#page-title');
            assert.equal(await page.locator('.kpi-grid > .kpi-card').count(), 5, row.role);
            assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-executive'], row.role);
          } else {
            await page.waitForURL(`${baseUrl}/inicio.html`);
            await page.waitForSelector('#safe-workspace');
            assert.deepEqual(apiPaths(apiLog), ['/api/auth/me'], row.role);
            assert.equal(apiLog.some(entry => entry.path === '/api/grh-executive'), false, row.role);
          }
          assertNoLegacyDataEndpoint(apiLog);
          assert.deepEqual(diagnostics.consoleErrors, [], row.role);
          assert.deepEqual(diagnostics.externalRequests, [], row.role);
        } finally {
          await context.close();
        }
      });
    }
  });

  await t.test('redirects a 401 to login and a malformed 200 session to the safe workspace', async () => {
    for (const scenario of [
      { name: 'auth-401', authStatus: 401, expectedPath: '/login.html', expectedSelector: '#safe-login' },
      {
        name: 'malformed-session',
        authPayload: authorizedSession('INTENDENTE', { tenantId: '' }),
        expectedPath: '/inicio.html',
        expectedSelector: '#safe-workspace',
      },
    ]) {
      await withScenario(scenario, async ({ apiLog, baseUrl }) => {
        const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
          viewport: { width: 390, height: 844 },
          reducedMotion: 'reduce',
        });
        try {
          await page.goto(`${baseUrl}/ejecutivo`, { waitUntil: 'domcontentloaded' });
          await page.waitForURL(`${baseUrl}${scenario.expectedPath}`);
          await page.waitForSelector(scenario.expectedSelector);
          assert.deepEqual(apiPaths(apiLog), ['/api/auth/me'], scenario.name);
          assert.equal(apiLog.some(entry => entry.path === '/api/grh-executive'), false, scenario.name);
          assertNoLegacyDataEndpoint(apiLog);
          if (scenario.authStatus === 401) {
            assert.ok(diagnostics.consoleErrors.every(message =>
              /Failed to load resource.*401 \(Unauthorized\)/i.test(message)),
            diagnostics.consoleErrors.join(' | '));
          } else {
            assert.deepEqual(diagnostics.consoleErrors, []);
          }
          assert.deepEqual(diagnostics.externalRequests, []);
        } finally {
          await context.close();
        }
      });
    }
  });

  await t.test('blocks every figure for JSON, header and contract failures', async () => {
    for (const executiveMode of [
      'not-json',
      'invalid-json',
      'wrong-contract-header',
      'mutated',
    ]) {
      await withScenario({ name: `failure-${executiveMode}`, executiveMode }, async ({ apiLog, baseUrl }) => {
        const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
          viewport: { width: 390, height: 844 },
          reducedMotion: 'reduce',
        });
        try {
          await page.goto(`${baseUrl}/ejecutivo`, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('.blocked-state[role="alert"]');
          const blocked = await blockedDiagnostics(page);
          assert.match(blocked.heading, /Evidencia bloqueada/i, executiveMode);
          assert.equal(blocked.readyMounted, false, executiveMode);
          assert.equal(blocked.kpis, 0, executiveMode);
          assert.equal(blocked.fixtureLeak, false, executiveMode);
          assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-executive'], executiveMode);
          assertNoLegacyDataEndpoint(apiLog);
          assert.deepEqual(diagnostics.consoleErrors, [], executiveMode);
          assert.deepEqual(diagnostics.externalRequests, [], executiveMode);
        } finally {
          await context.close();
        }
      });
    }
  });

  await t.test('keeps figures blocked on 503 and reauthenticates before retry', async () => {
    await withScenario({ name: 'unavailable-retry', executiveMode: 'unavailable' }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 1_440, height: 900 },
      });
      try {
        await page.goto(`${baseUrl}/ejecutivo`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.blocked-state[role="alert"]');
        assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-executive']);
        let blocked = await blockedDiagnostics(page);
        assert.equal(blocked.readyMounted, false);
        assert.equal(blocked.kpis, 0);
        assert.equal(blocked.fixtureLeak, false);

        const retryAuth = page.waitForResponse(response =>
          new URL(response.url()).pathname === '/api/auth/me');
        const retryExecutive = page.waitForResponse(response =>
          new URL(response.url()).pathname === '/api/grh-executive' && response.status() === 503);
        await page.click('.blocked-state .button--primary');
        await Promise.all([retryAuth, retryExecutive]);
        await page.waitForSelector('.blocked-state[role="alert"]');

        blocked = await blockedDiagnostics(page);
        assert.equal(blocked.readyMounted, false);
        assert.equal(blocked.kpis, 0);
        assert.equal(blocked.fixtureLeak, false);
        assert.deepEqual(apiPaths(apiLog), [
          '/api/auth/me',
          '/api/grh-executive',
          '/api/auth/me',
          '/api/grh-executive',
        ]);
        assertNoLegacyDataEndpoint(apiLog);
        assert.ok(
          diagnostics.consoleErrors.length === 2 && diagnostics.consoleErrors.every(message =>
            /Failed to load resource.*503 \(Service Unavailable\)/i.test(message)),
          `only the two expected 503 diagnostics are allowed: ${diagnostics.consoleErrors.join(' | ')}`,
        );
        assert.deepEqual(diagnostics.externalRequests, []);
      } finally {
        await context.close();
      }
    });
  });
});
