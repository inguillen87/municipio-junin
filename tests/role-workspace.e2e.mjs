import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import accessPolicy from '../shared/access-policy.cjs';
import publishedDemoPolicy from '../shared/published-demo-policy.cjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ROLES = Object.values(accessPolicy.ROLES);
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const VARIANTS = {
  SUPER_ADMIN: 'platform-governance',
  INTENDENTE: 'executive-leadership',
  TENANT_ADMIN: 'municipal-operations',
  TENANT_USER: 'municipal-limited',
  CONTADOR: 'financial-control',
  INSPECTOR: 'territorial-unassigned',
  DEMO: 'controlled-preview',
};
const DECISION_BRIEF = Object.freeze({
  schemaVersion: 'grh-decision-brief-v1',
  policyVersion: 'grh-small-cell-v1',
  source: Object.freeze({
    canonicalSystem: 'GRH Junin',
    sourceFile: 'grh_junin.snapshot_2026-08-06.sql.gz',
    sourceSha256: 'a'.repeat(64),
    snapshotAsOf: '2026-08-06',
    latestValidCalculationPeriod: '2026-07',
    realtime: false,
  }),
  privacy: Object.freeze({
    audience: 'interactive',
    threshold: 10,
    aggregateOnly: true,
    containsPii: false,
    employeeIdentifiersExported: false,
    rawRowsExported: false,
    categoricalLabelsExported: false,
    cellCodesExported: false,
    monetaryAmountsExported: false,
  }),
  period: '2026-07',
  status: 'attention_required',
  situation: Object.freeze({
    participantCount: 856,
    participantDisplay: '856',
    qualityScorePct: 88.99,
    temporalQuarantineRows: 20534,
    runCoveragePct: 100,
    metricExactRatePct: 40,
    valueAgreementPct: 6.5,
    identityWithinRoundingTolerance: true,
  }),
  change: Object.freeze({
    status: 'released',
    previousPeriod: '2026-06',
    participantDelta: 1,
    runCoverageDeltaPctPoints: 0,
    metricExactRateDeltaPctPoints: 0,
    valueAgreementDeltaPctPoints: 5.8,
  }),
  priorities: Object.freeze([
    Object.freeze({
      code: 'cross_source_material_difference',
      severity: 'critical',
      href: 'hacienda.html',
      requiredCapability: 'navigation.hacienda',
    }),
    Object.freeze({
      code: 'temporal_quarantine_present',
      severity: 'warning',
      href: 'control.html',
      requiredCapability: 'navigation.data-quality',
    }),
    Object.freeze({ code: 'historical_snapshot', severity: 'context', href: null, requiredCapability: null }),
  ]),
  limits: Object.freeze([
    'historical_snapshot_not_realtime',
    'calculation_control_not_bank_disbursement',
    'currency_not_declared_in_source',
    'arithmetic_decomposition_not_causal_explanation',
    'snapshot_reconciliation_not_monthly_series',
  ]),
});
const ACTION_CAPABILITIES = new Set([
  'navigation.dashboard',
  'navigation.reports',
  'navigation.hacienda',
  'navigation.grh-executive',
  'navigation.organization-analytics',
  'navigation.territory',
  'navigation.data-quality',
  'navigation.rrhh',
  'navigation.grh-decisions',
  'navigation.ai-assistant',
  'navigation.audit',
  'navigation.export',
  'navigation.import',
  'navigation.help',
]);
const BOTTOM_HREF = new Map([
  ['navigation.workspace', 'inicio.html'],
  ['navigation.dashboard', 'dashboard.html'],
  ['navigation.reports', 'reportes.html'],
  ['navigation.hacienda', 'hacienda.html'],
  ['navigation.grh-executive', '/ejecutivo'],
  ['navigation.organization-analytics', '/estructura'],
  ['navigation.territory', '/territorio'],
  ['navigation.data-quality', '/calidad'],
  ['navigation.rrhh', 'areas-grh.html'],
  ['navigation.grh-decisions', 'decisiones-grh.html'],
  ['navigation.ai-assistant', 'ia.html'],
  ['navigation.audit', 'auditoria.html'],
  ['navigation.export', 'exportar.html'],
  ['navigation.import', 'importar.html'],
  ['navigation.help', 'manuales.html'],
]);

function fakeToken(subject) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: subject,
    role: 'SUPER_ADMIN',
    tenantId: 'stale-tenant',
    exp: Math.floor(Date.now() / 1000) + 900,
  })}.qa`;
}

function tokenSubject(request) {
  const value = String(request.headers.authorization || '');
  const token = value.startsWith('Bearer ') ? value.slice(7) : '';
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).sub;
  } catch {
    return null;
  }
}

function authoritativeUser(
  id,
  role,
  tenantId = 'tenant-junin-e2e',
  email = `${role.toLowerCase()}@internal.invalid`,
) {
  const access = accessPolicy.getSessionAccessForUser({ role, tenantId, email });
  return {
    id,
    name: `Perfil ${role}`,
    email,
    role,
    tenantId,
    tenant: tenantId ? { name: 'Municipalidad de Junín', shortName: 'Junín' } : null,
    capabilities: access.capabilities,
    accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
    homeProfile: access.homeProfile,
  };
}

async function createServer(users, requestLog, { decisionBriefStatus = 200 } = {}) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const subject = tokenSubject(request);
    requestLog.push({ method: request.method, path: url.pathname, subject });

    if (url.pathname === '/api/auth/me') {
      const user = users.get(subject);
      if (!user) {
        response.writeHead(401, { 'Cache-Control': 'no-store', 'Content-Type': CONTENT_TYPES['.json'] });
        response.end(JSON.stringify({ error: 'not authorized' }));
        return;
      }
      response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': CONTENT_TYPES['.json'] });
      response.end(JSON.stringify({ user }));
      return;
    }

    if (url.pathname === '/api/grh-decision-brief') {
      const user = users.get(subject);
      if (!user || !user.capabilities.includes('navigation.dashboard')) {
        response.writeHead(403, { 'Cache-Control': 'no-store', 'Content-Type': CONTENT_TYPES['.json'] });
        response.end(JSON.stringify({ error: 'not authorized' }));
        return;
      }
      if (decisionBriefStatus !== 200) {
        response.writeHead(decisionBriefStatus, {
          'Cache-Control': 'no-store',
          'Content-Type': CONTENT_TYPES['.json'],
          'X-MuniControl-Contract': 'grh-decision-brief-v1',
        });
        response.end(JSON.stringify({ error: 'temporarily unavailable' }));
        return;
      }
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': CONTENT_TYPES['.json'],
        'X-MuniControl-Contract': 'grh-decision-brief-v1',
      });
      response.end(JSON.stringify(DECISION_BRIEF));
      return;
    }

    if (/^\/api\/(?:grh|municipal-territory|ai|reports|pdf)/.test(url.pathname)) {
      response.writeHead(418, { 'Cache-Control': 'no-store', 'Content-Type': CONTENT_TYPES['.json'] });
      response.end(JSON.stringify({ error: 'workspace must never request this endpoint' }));
      return;
    }

    const relative = decodeURIComponent(url.pathname.slice(1) || 'inicio.html');
    const target = path.resolve(ROOT, relative);
    if (!target.startsWith(`${ROOT}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(target);
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': CONTENT_TYPES[path.extname(target)] || 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404, { 'Cache-Control': 'no-store' }).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function workspacePage(browser, baseUrl, subject, viewport, contextOptions = {}) {
  const staleAccess = accessPolicy.getSessionAccessForUser({ role: 'SUPER_ADMIN', tenantId: 'stale-tenant' });
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport, ...contextOptions });
  await context.addInitScript(({ token, access, accessPolicyVersion }) => {
    if (sessionStorage.getItem('__muni_workspace_seeded') === 'true') return;
    sessionStorage.setItem('__muni_workspace_seeded', 'true');
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify({
      id: 'stale-browser-user',
      name: 'Sesión anterior',
      role: 'SUPER_ADMIN',
      tenantId: 'stale-tenant',
      capabilities: access.capabilities,
      accessPolicyVersion: accessPolicyVersion,
      homeProfile: access.homeProfile,
    }));
    localStorage.removeItem('muni_sidebar_collapsed');
  }, {
    token: fakeToken(subject),
    access: staleAccess,
    accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
  });
  const page = await context.newPage();
  return { context, page };
}

function expectedBottom(access) {
  return [
    ...access.homeProfile.priorityCapabilities
      .filter(capability => access.capabilities.includes(capability) && BOTTOM_HREF.has(capability))
      .map(capability => BOTTOM_HREF.get(capability))
      .slice(0, 4),
    '#more',
  ];
}

function expectedWorkspaceActions(access) {
  const capabilities = access.homeProfile.priorityCapabilities
    .filter(capability => capability !== 'navigation.workspace' && ACTION_CAPABILITIES.has(capability));
  if (access.capabilities.includes('navigation.organization-analytics') &&
      !capabilities.includes('navigation.organization-analytics')) {
    const dataQualityIndex = capabilities.indexOf('navigation.data-quality');
    capabilities.splice(dataQualityIndex === -1 ? capabilities.length : dataQualityIndex, 0, 'navigation.organization-analytics');
  }
  if (access.capabilities.includes('navigation.grh-decisions') &&
      !capabilities.includes('navigation.grh-decisions')) {
    capabilities.push('navigation.grh-decisions');
  }
  return capabilities.slice(0, 4);
}

test('safe workspace renders seven role variants and gives Intendencia one governed executive brief', async t => {
  const users = new Map();
  for (const role of ROLES) users.set(`matrix-${role}`, authoritativeUser(`matrix-${role}`, role));
  const requestLog = [];
  const server = await createServer(users, requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  for (const role of ROLES) {
    const expectedAccess = accessPolicy.getSessionAccessForUser({ role, tenantId: 'tenant-junin-e2e' });
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 940 }]) {
      const subject = `matrix-${role}`;
      const before = requestLog.length;
      const { context, page } = await workspacePage(browser, baseUrl, subject, viewport);
      const consoleErrors = [];
      const externalRequests = [];
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('request', request => { if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url()); });
      await page.goto(`${baseUrl}/inicio.html`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#workspaceViews:not([hidden])');

      const result = await page.evaluate(() => {
        const privateLinks = [...document.querySelectorAll('#workspaceActions a[data-capability]')];
        const targets = [...document.querySelectorAll('#workspaceActions a, .ws-public a, #executiveSummaryActions a')]
          .map(link => ({ height: link.getBoundingClientRect().height, width: link.getBoundingClientRect().width }));
        return {
          actionCapabilities: privateLinks.map(link => link.dataset.capability),
          actionsBeforeGuide: Boolean(
            document.querySelector('#workspaceActions').compareDocumentPosition(document.querySelector('#journeyList')) &
            Node.DOCUMENT_POSITION_FOLLOWING
          ),
          bottom: [...document.querySelectorAll('.bottom-nav a, .bottom-nav button')]
            .map(item => item.matches('button.bottom-nav-more') ? '#more' : item.getAttribute('href')),
          busy: document.querySelector('#workspaceMain').getAttribute('aria-busy'),
          errorHidden: document.querySelector('#workspaceError').hidden,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          policy: document.querySelector('#policyVersion').textContent,
          role: JSON.parse(sessionStorage.getItem('mjunin_user')).role,
          territoryAction: document.querySelector('#workspaceActions a[data-capability="navigation.territory"]')
            ? {
                href: document.querySelector('#workspaceActions a[data-capability="navigation.territory"]').getAttribute('href'),
                text: document.querySelector('#workspaceActions a[data-capability="navigation.territory"]').textContent,
              }
            : null,
          targets,
          text: document.querySelector('#workspaceViews').textContent,
          title: document.querySelector('#workspaceTitle').textContent,
          variant: document.body.dataset.roleVariant,
          executiveSummary: document.querySelector('#executiveSummary').hidden ? null : {
            bottom: document.querySelector('#executiveSummary').getBoundingClientRect().bottom,
            firstViewportLimit: document.querySelector('.bottom-nav')
              ? document.querySelector('.bottom-nav').getBoundingClientRect().top
              : window.innerHeight,
            facts: [...document.querySelectorAll('.ws-executive-fact strong')].map(item => item.textContent),
            links: [...document.querySelectorAll('#executiveSummaryActions a')].map(link => ({
              capability: link.dataset.capability,
              href: link.getAttribute('href'),
            })),
            state: document.querySelector('#executiveSummary').dataset.state,
            text: document.querySelector('#executiveSummary').textContent,
          },
        };
      });

      const expectedActions = expectedWorkspaceActions(expectedAccess);
      assert.equal(result.variant, VARIANTS[role], `${role}:${viewport.width}:variant`);
      assert.equal(result.role, role, `${role}:${viewport.width}:server role must replace stale browser role`);
      assert.equal(result.busy, 'false');
      assert.equal(result.errorHidden, true);
      assert.equal(result.actionsBeforeGuide, true, `${role}:${viewport.width}:primary actions appear before guidance`);
      assert.match(result.title, /^Hola(?:[,.]|$)/, `${role}:${viewport.width}:role greeting`);
      assert.ok(result.overflow <= 1, `${role}:${viewport.width}:overflow=${result.overflow}`);
      assert.deepEqual([...result.actionCapabilities].sort(), [...expectedActions].sort(), `${role}:${viewport.width}:actions`);
      if (['TENANT_USER', 'INSPECTOR', 'DEMO'].includes(role)) {
        assert.equal(result.territoryAction?.href, '/territorio', `${role}:${viewport.width}:territory href`);
        assert.match(result.territoryAction?.text || '', /Junín, Mendoza, con sus localidades/i, `${role}:${viewport.width}:territory copy`);
      }
      assert.ok(result.actionCapabilities.every(capability => expectedAccess.capabilities.includes(capability)));
      assert.match(result.policy, new RegExp(accessPolicy.ACCESS_POLICY_VERSION.replaceAll('.', '\\.')));
      assert.doesNotMatch(result.text, /@internal\.invalid|tenant-junin-e2e|personas_junin/i);
      assert.doesNotMatch(result.text, /\b(?:snapshot|capabilities|datasets?|contrato|PII|gobernado|cross-source|tenant)\b/i);
      assert.ok(result.actionCapabilities.length <= 4, `${role}:${viewport.width}:summary-first actions`);
      assert.ok(result.targets.every(target => target.height >= 44 && target.width >= 44), `${role}:${viewport.width}:touch targets`);
      if (role === 'INTENDENTE') {
        assert.equal(result.executiveSummary?.state, 'attention', `${role}:${viewport.width}:brief state`);
        assert.deepEqual(result.executiveSummary?.facts, ['856', '88,99/100', '6,5%']);
        assert.match(result.executiveSummary?.text || '', /respaldo del 6 ago 2026/i);
        assert.match(result.executiveSummary?.text || '', /Hay diferencias entre las dos fuentes/i);
        assert.deepEqual(result.executiveSummary?.links, [
          { capability: 'navigation.hacienda', href: 'hacienda.html' },
          { capability: 'navigation.ai-assistant', href: 'ia.html' },
        ]);
        assert.ok(
          result.executiveSummary.bottom <= result.executiveSummary.firstViewportLimit,
          `${role}:${viewport.width}:summary in unobscured first viewport`,
        );
      } else {
        assert.equal(result.executiveSummary, null, `${role}:${viewport.width}:no executive data`);
      }
      if (viewport.width <= 900) assert.deepEqual(result.bottom, expectedBottom(expectedAccess), `${role}:bottom priorities`);
      else assert.deepEqual(result.bottom, [], `${role}:desktop has no bottom nav`);
      assert.deepEqual(consoleErrors, [], `${role}:${viewport.width}:console`);
      assert.deepEqual(externalRequests, [], `${role}:${viewport.width}:external requests`);

      const currentRequests = requestLog.slice(before).map(entry => entry.path);
      assert.equal(currentRequests.filter(pathname => pathname === '/api/auth/me').length, 1, `${role}:${viewport.width}:one authoritative session lookup`);
      assert.deepEqual(
        currentRequests.filter(pathname => /^\/api\/(?:grh|municipal-territory|ai|reports|pdf)/.test(pathname)),
        role === 'INTENDENTE' ? ['/api/grh-decision-brief'] : [],
        `${role}:${viewport.width}:role-scoped data APIs`,
      );

      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('ws-skip')), true, `${role}:${viewport.width}:skip link first`);
      await context.close();
    }
  }
});

test('executive first viewport remains readable at 320px with forced colors and no horizontal overflow', async t => {
  const users = new Map([
    ['executive-320', authoritativeUser('executive-320', 'INTENDENTE')],
  ]);
  const requestLog = [];
  const server = await createServer(users, requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const { context, page } = await workspacePage(
    browser,
    baseUrl,
    'executive-320',
    { width: 320, height: 844 },
    { forcedColors: 'active' },
  );
  t.after(async () => context.close());
  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto(`${baseUrl}/inicio.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#executiveSummary[data-state="attention"]');

  const result = await page.evaluate(() => {
    const summary = document.querySelector('#executiveSummary');
    const bottomNav = document.querySelector('.bottom-nav');
    return {
      actionTargets: [...document.querySelectorAll('#executiveSummaryActions a')]
        .map(link => ({ height: link.getBoundingClientRect().height, width: link.getBoundingClientRect().width })),
      facts: [...document.querySelectorAll('.ws-executive-fact strong')].map(item => item.textContent),
      navTop: bottomNav ? bottomNav.getBoundingClientRect().top : window.innerHeight,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      summaryBottom: summary.getBoundingClientRect().bottom,
    };
  });

  assert.ok(result.overflow <= 1, `320px overflow=${result.overflow}`);
  assert.deepEqual(result.facts, ['856', '88,99/100', '6,5%']);
  assert.ok(result.summaryBottom <= result.navTop, `summary ${result.summaryBottom} must clear bottom navigation ${result.navTop}`);
  assert.ok(result.actionTargets.every(target => target.height >= 44 && target.width >= 44));
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(
    requestLog.filter(entry => entry.path.startsWith('/api/')).map(entry => entry.path),
    ['/api/auth/me', '/api/grh-decision-brief'],
  );
});

test('executive brief failure stays honest and leaves only authorized recovery links', async t => {
  const users = new Map([
    ['executive-fallback', authoritativeUser('executive-fallback', 'INTENDENTE')],
  ]);
  const requestLog = [];
  const server = await createServer(users, requestLog, { decisionBriefStatus: 503 });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const { context, page } = await workspacePage(
    browser,
    baseUrl,
    'executive-fallback',
    { width: 390, height: 844 },
  );
  t.after(async () => context.close());
  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto(`${baseUrl}/inicio.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#executiveSummary[data-state="unavailable"]');

  const result = await page.evaluate(() => ({
    facts: [...document.querySelectorAll('.ws-executive-fact strong')].map(item => item.textContent),
    links: [...document.querySelectorAll('#executiveSummaryActions a')].map(link => ({
      capability: link.dataset.capability,
      href: link.getAttribute('href'),
      text: link.textContent,
    })),
    text: document.querySelector('#executiveSummary').textContent,
  }));

  assert.deepEqual(result.facts, ['—', '—', '—']);
  assert.deepEqual(result.links, [
    {
      capability: 'navigation.dashboard',
      href: 'dashboard.html',
      text: 'Abrir panorama de personal',
    },
    {
      capability: 'navigation.ai-assistant',
      href: 'ia.html',
      text: 'Preguntarle al asistente',
    },
  ]);
  assert.match(result.text, /No pudimos actualizar el resumen/i);
  assert.doesNotMatch(result.text, /\b856\b|88,99|6,5%/);
  assert.ok(
    consoleErrors.length <= 1 && consoleErrors.every(message => /503|Failed to load resource/i.test(message)),
    `unexpected diagnostics: ${consoleErrors.join(' | ')}`,
  );
  assert.deepEqual(
    requestLog.filter(entry => entry.path.startsWith('/api/')).map(entry => entry.path),
    ['/api/auth/me', '/api/grh-decision-brief'],
  );
});

test('published high roles discover the aggregate staffing room in navigation and Inicio while low roles do not', async t => {
  const users = new Map(publishedDemoPolicy.PUBLISHED_DEMO_PROFILES.map((profile, index) => [
    `published-structure-${index}`,
    authoritativeUser(
      `published-structure-${index}`,
      profile.role,
      'tenant-junin-e2e',
      profile.email,
    ),
  ]));
  const requestLog = [];
  const server = await createServer(users, requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  for (const [index, profile] of publishedDemoPolicy.PUBLISHED_DEMO_PROFILES.entries()) {
    const subject = `published-structure-${index}`;
    const { context, page } = await workspacePage(browser, baseUrl, subject, { width: 1440, height: 940 });
    await page.goto(`${baseUrl}/inicio.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#workspaceViews:not([hidden])');

    const surface = await page.evaluate(() => ({
      action: document.querySelector('#workspaceActions a[data-capability="navigation.organization-analytics"]')?.getAttribute('href') || null,
      actionText: document.querySelector('#workspaceActions a[data-capability="navigation.organization-analytics"]')?.textContent || '',
      nav: document.querySelector('.sidebar a[href="/estructura"]')?.getAttribute('href') || null,
      navText: document.querySelector('.sidebar a[href="/estructura"]')?.textContent || '',
    }));
    const expected = ['TENANT_ADMIN', 'INTENDENTE', 'CONTADOR'].includes(profile.role);
    assert.equal(surface.nav, expected ? '/estructura' : null, `${profile.email}:navigation`);
    assert.equal(surface.action, expected ? '/estructura' : null, `${profile.email}:Inicio CTA`);
    if (expected) {
      assert.match(surface.navText, /Estructura y áreas de costo/);
      assert.match(surface.actionText, /Estructura y áreas/);
      assert.match(surface.actionText, /Compará dos áreas/i);
      assert.match(surface.actionText, /últimos 24 meses/i);
    }
    await context.close();
  }

  assert.deepEqual(
    requestLog
      .filter(entry => /^\/api\/(?:grh|municipal-territory|ai|reports|pdf)/.test(entry.path))
      .map(entry => entry.path),
    ['/api/grh-decision-brief'],
  );
});

test('tenantless SUPER_ADMIN receives only workspace and help in the authoritative projection', async t => {
  const users = new Map([
    ['tenantless-super', authoritativeUser('tenantless-super', 'SUPER_ADMIN', null)],
  ]);
  const requestLog = [];
  const server = await createServer(users, requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const { context, page } = await workspacePage(browser, baseUrl, 'tenantless-super', { width: 390, height: 844 });
  t.after(async () => context.close());
  await page.goto(`${baseUrl}/inicio.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#workspaceViews:not([hidden])');

  const result = await page.evaluate(() => ({
    actions: [...document.querySelectorAll('#workspaceActions a[data-capability]')].map(link => link.dataset.capability),
    bottom: [...document.querySelectorAll('.bottom-nav a, .bottom-nav button')]
      .map(item => item.matches('button.bottom-nav-more') ? '#more' : item.getAttribute('href')),
    capabilities: JSON.parse(sessionStorage.getItem('mjunin_user')).capabilities,
    sidebar: [...document.querySelectorAll('.sidebar a.sb-item')].map(link => link.getAttribute('href')),
  }));
  assert.deepEqual(result.capabilities, ['session.read', 'navigation.workspace', 'navigation.help']);
  assert.deepEqual(result.actions, []);
  assert.deepEqual(result.bottom, ['inicio.html', '#more']);
  assert.deepEqual(result.sidebar, ['inicio.html', 'cuentas-claras.html', 'ciudadano.html', 'manuales.html']);
  assert.equal(requestLog.some(entry => /^\/api\/(?:grh|municipal-territory|ai|reports|pdf)/.test(entry.path)), false);
});

test('malformed and unknown authoritative projections fail closed before workspace render', async t => {
  const valid = authoritativeUser('valid-template', 'INTENDENTE');
  const users = new Map([
    ['unknown-role', { ...valid, id: 'unknown-role', role: 'TESORERIA' }],
    ['stale-version', { ...valid, id: 'stale-version', accessPolicyVersion: '2026-08-08.4' }],
    ['missing-capabilities', { ...valid, id: 'missing-capabilities', capabilities: undefined }],
    ['unknown-capability', { ...valid, id: 'unknown-capability', capabilities: [...valid.capabilities, 'navigation.future'] }],
    ['malformed-profile', { ...valid, id: 'malformed-profile', homeProfile: { ...valid.homeProfile, defaultPath: 'https://attacker.example/' } }],
  ]);
  const requestLog = [];
  const server = await createServer(users, requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  for (const subject of users.keys()) {
    const { context, page } = await workspacePage(browser, baseUrl, subject, { width: 390, height: 844 });
    await page.goto(`${baseUrl}/inicio.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/login\.html\?reason=session_invalid$/);
    const state = await page.evaluate(() => ({
      pending: document.documentElement.classList.contains('muni-auth-pending'),
      privateLinks: document.querySelectorAll('[data-capability]').length,
      token: sessionStorage.getItem('mjunin_token'),
      user: sessionStorage.getItem('mjunin_user'),
    }));
    assert.deepEqual(state, { pending: false, privateLinks: 0, token: null, user: null }, subject);
    await context.close();
  }
  assert.equal(requestLog.some(entry => /^\/api\/(?:grh|municipal-territory|ai|reports|pdf)/.test(entry.path)), false);
});

test('async capability denial returns to inicio with an accessible notice and never authorizes', async t => {
  const users = new Map([
    ['contador-denied', authoritativeUser('contador-denied', 'CONTADOR')],
  ]);
  const requestLog = [];
  const server = await createServer(users, requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const { context, page } = await workspacePage(browser, baseUrl, 'contador-denied', { width: 390, height: 844 });
  t.after(async () => context.close());
  await page.goto(`${baseUrl}/manuales.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.MuniAuthReady);
  await page.evaluate(() => { void window.requireCapability('navigation.import'); });
  await page.waitForURL(`${baseUrl}/inicio.html`);
  await page.waitForSelector('#accessNotice:not([hidden])');
  await page.waitForFunction(() => document.activeElement?.id === 'accessNotice');
  assert.match(await page.textContent('#accessNotice'), /no tiene habilitada/i);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'accessNotice');
  assert.equal(requestLog.some(entry => /^\/api\/(?:grh|municipal-territory|ai|reports|pdf)/.test(entry.path)), false);
});
