import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import accessPolicy from '../shared/access-policy.cjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTRACT = 'municipal-source-intake-v1';
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function authoritativeUser(id, role, { published = false } = {}) {
  const tenantId = 'tenant-source-intake-e2e';
  const access = accessPolicy.getSessionAccessForUser({ role, tenantId });
  assert.ok(access);
  return {
    id: published ? 'published-evaluation:administrador' : id,
    name: published ? 'Evaluación Administrador' : `Perfil ${role}`,
    email: published ? '' : `${id}@internal.invalid`,
    role,
    tenantId,
    tenant: { name: 'Municipalidad de Junín', shortName: 'Junín' },
    capabilities: [...access.capabilities],
    accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
    homeProfile: {
      ...access.homeProfile,
      priorityCapabilities: [...access.homeProfile.priorityCapabilities],
    },
  };
}

function fakeToken(subject) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: subject,
    role: 'TENANT_ADMIN',
    tenantId: 'tenant-source-intake-e2e',
    exp: Math.floor(Date.now() / 1000) + 900,
  })}.qa`;
}

function tokenSubject(request) {
  const authorization = String(request.headers.authorization || '');
  try {
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).sub;
  } catch {
    return null;
  }
}

function receipt({
  persisted,
  id = persisted ? 'source-intake-e2e-private' : `preview:${'a'.repeat(64)}`,
  createdAt = '2026-08-14T18:00:00.000Z',
  attention = false,
} = {}) {
  const checks = [
    { code: 'metadata_validated', status: 'passed', severity: 'info', label: 'Metadatos contractuales validados.' },
    { code: 'file_within_limit', status: 'passed', severity: 'info', label: 'Archivo dentro del límite de 4 MiB.' },
    { code: 'format_parsed', status: 'passed', severity: 'info', label: 'Formato interpretado para perfil estructural.' },
    { code: 'authority_owner_confirmed', status: 'passed', severity: 'info', label: 'Autoridad de origen declarada como confirmada.' },
    { code: 'personal_data_not_declared', status: 'passed', severity: 'info', label: 'La fuente fue declarada sin datos personales.' },
    { code: 'original_not_retained', status: 'blocked', severity: 'high', label: 'El original no se conserva en este flujo.' },
    { code: 'antimalware_not_run', status: 'blocked', severity: 'high', label: 'No se ejecutó un control antimalware.' },
  ];
  const result = {
    id,
    status: 'quarantined',
    createdAt,
    persisted,
    source: {
      label: 'Novedades de personal de julio',
      domain: 'hr',
      referencePeriod: '2026-07',
      ownerOffice: 'Dirección de Recursos Humanos',
      purpose: 'operational_analysis',
      classification: 'internal',
      authority: 'owner_confirmed',
      currency: 'not_applicable',
      containsPersonalData: false,
    },
    file: { extension: 'csv', kind: 'structured', sizeBytes: 48, sha256: 'a'.repeat(64) },
    profile: {
      schemaVersion: 'municipal-source-intake-profile-v1',
      schemaDigest: 'b'.repeat(64),
      rowCount: 3,
      columnCount: 2,
      emptyCellRatePct: 16.6667,
      duplicateRowRatePct: 0,
      pageCount: null,
      lineCount: null,
      textBytes: null,
    },
    quality: { status: 'blocked', checks, passedCount: 5, blockedCount: 2 },
    limits: [
      { code: 'original_not_retained', text: 'El archivo original no se conserva después del diagnóstico.' },
      { code: 'antimalware_not_run', text: 'No se ejecutó un control antimalware sobre el archivo.' },
      { code: 'quarantine_not_publication', text: 'La cuarentena no integra ni publica la fuente.' },
    ],
  };
  if (attention) {
    result.source = {
      ...result.source,
      label: 'Ejecución presupuestaria pendiente de respaldo',
      domain: 'budget',
      referencePeriod: '2026-06',
      ownerOffice: 'Secretaría de Hacienda',
      purpose: 'reconciliation',
      classification: 'confidential',
      authority: 'unverified',
      currency: 'ARS',
      containsPersonalData: true,
    };
    result.quality.checks = result.quality.checks.map(check => {
      if (check.code === 'authority_owner_confirmed') {
        return { code: 'authority_unverified', status: 'blocked', severity: 'high', label: 'La autoridad de origen todavía no fue confirmada.' };
      }
      if (check.code === 'personal_data_not_declared') {
        return { code: 'personal_data_declared', status: 'blocked', severity: 'high', label: 'La fuente fue declarada con datos personales.' };
      }
      return check;
    });
    result.quality.passedCount = 3;
    result.quality.blockedCount = 4;
  }
  return result;
}

async function createServer(users, requestLog, {
  mutateReceiptBySubject = new Map(),
  mutateHistoryBySubject = new Map(),
} = {}) {
  const multipartBodies = [];
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

    if (url.pathname === '/api/source-intake') {
      const user = users.get(subject);
      const published = user?.id.startsWith('published-evaluation:');
      if (published && request.method === 'POST') {
        response.writeHead(403, { 'Cache-Control': 'no-store', 'Content-Type': CONTENT_TYPES['.json'], 'X-MuniControl-Contract': CONTRACT });
        response.end(JSON.stringify({ error: 'read only', code: 'SOURCE_INTAKE_PUBLISHED_PREVIEW_DISABLED' }));
        return;
      }
      if (!user || !['GET', 'POST'].includes(request.method) || !user.capabilities.includes('navigation.import')) {
        response.writeHead(403, { 'Cache-Control': 'no-store', 'Content-Type': CONTENT_TYPES['.json'], 'X-MuniControl-Contract': CONTRACT });
        response.end(JSON.stringify({ error: 'denied', code: 'SOURCE_INTAKE_DENIED' }));
        return;
      }
      if (request.method === 'GET') {
        const history = published ? [] : [
          receipt({ persisted: true }),
          receipt({
            persisted: true,
            id: 'source-intake-e2e-attention',
            createdAt: '2026-08-13T17:00:00.000Z',
            attention: true,
          }),
        ];
        const envelope = {
          schemaVersion: CONTRACT,
          mode: published ? 'evaluation_preview' : 'persistent_receipts',
          writeEnabled: !published,
          maxFileBytes: 4_194_304,
          allowedExtensions: ['csv', 'json', 'pdf', 'txt', 'xls', 'xlsx'],
          receipts: history,
        };
        const mutateHistory = mutateHistoryBySubject.get(subject);
        if (mutateHistory) mutateHistory(envelope);
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': CONTENT_TYPES['.json'],
          'X-MuniControl-Contract': CONTRACT,
        });
        response.end(JSON.stringify(envelope));
        return;
      }
      let body = Buffer.alloc(0);
      for await (const chunk of request) body = Buffer.concat([body, chunk]);
      multipartBodies.push({
        authorization: request.headers.authorization,
        contentType: request.headers['content-type'],
        raw: body.toString('utf8'),
        subject,
      });
      const responseReceipt = receipt({ persisted: !published });
      const mutateReceipt = mutateReceiptBySubject.get(subject);
      if (mutateReceipt) mutateReceipt(responseReceipt);
      response.writeHead(published ? 200 : 201, {
        'Cache-Control': 'no-store',
        'Content-Type': CONTENT_TYPES['.json'],
        'X-MuniControl-Contract': CONTRACT,
      });
      response.end(JSON.stringify({
        schemaVersion: CONTRACT,
        mode: published ? 'evaluation_preview' : 'persistent_receipts',
        writeEnabled: !published,
        maxFileBytes: 4_194_304,
        allowedExtensions: ['csv', 'json', 'pdf', 'txt', 'xls', 'xlsx'],
        receipt: responseReceipt,
      }));
      return;
    }

    if (/^\/api\/(?:upload-handler|google-sheets|external-connector|ai-analyze)/.test(url.pathname)) {
      response.writeHead(418, { 'Cache-Control': 'no-store', 'Content-Type': CONTENT_TYPES['.json'] });
      response.end(JSON.stringify({ error: 'retired endpoint must not be called' }));
      return;
    }

    const relative = decodeURIComponent(url.pathname.slice(1) || 'importar.html');
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
  return { server, multipartBodies };
}

async function intakePage(browser, baseUrl, subject, user, viewport, extraOptions = {}) {
  const { themePreference = 'dark', ...contextOptions } = extraOptions;
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', ...contextOptions });
  await context.addInitScript(({ token, seededUser, theme }) => {
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify(seededUser));
    localStorage.setItem('municontrol-color-theme:v1', theme);
  }, { token: fakeToken(subject), seededUser: user, theme: themePreference });
  return { context, page: await context.newPage() };
}

async function completeForm(page) {
  await page.locator('#sourceLabel').fill('Novedades de personal de julio');
  await page.locator('#sourceDomain').selectOption('hr');
  await page.locator('#referencePeriod').fill('2026-07');
  await page.locator('#ownerOffice').fill('Dirección de Recursos Humanos');
  await page.locator('#sourcePurpose').selectOption('operational_analysis');
  await page.locator('#sourceClassification').selectOption('internal');
  await page.locator('#sourceCurrency').selectOption('not_applicable');
  await page.locator('#sourceAuthority').selectOption('owner_confirmed');
  await page.locator('input[name="containsPersonalData"][value="false"]').check();
  await page.locator('#sourceFile').setInputFiles({
    name: 'novedades-julio.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('legajo_privado,valor_privado\nALFA_SECRETA,10\nBETA_SECRETA,20\n'),
  });
}

test('private Admin completes the governed intake at 1440, 390, and 320 without value preview or legacy calls', async t => {
  const privateUser = authoritativeUser('private-admin', 'TENANT_ADMIN');
  const users = new Map([['private-admin', privateUser]]);
  const requestLog = [];
  const { server, multipartBodies } = await createServer(users, requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    const beforeBodies = multipartBodies.length;
    const { context, page } = await intakePage(
      browser,
      baseUrl,
      'private-admin',
      privateUser,
      viewport,
      { themePreference: viewport.width === 390 ? 'light' : 'dark' },
    );
    const consoleErrors = [];
    const pageErrors = [];
    const externalRequests = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => { if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url()); });
    await page.goto(`${baseUrl}/importar.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#sourceIntakeApp[data-state="ready"]:not([hidden])');
    await page.waitForSelector('#sourceIntakeHistory[data-state="ready"]:not([hidden])');
    const historyState = await page.evaluate(() => ({
      authority: document.querySelector('#sourceIntakeHistoryAuthority').textContent,
      heading: document.querySelector('#sourceIntakeTitle').textContent,
      historySelected: document.querySelector('#sourceIntakeHistoryTab').getAttribute('aria-selected'),
      items: document.querySelectorAll('#sourceIntakeHistoryList > li').length,
      mode: document.querySelector('#sourceIntakeApp').dataset.mode,
      newPanelHidden: document.querySelector('#sourceIntakeNewPanel').hidden,
      personal: document.querySelector('#sourceIntakeHistoryPersonal').textContent,
      total: document.querySelector('#sourceIntakeHistoryTotal').textContent,
    }));
    assert.deepEqual(historyState, {
      authority: '1',
      heading: 'Fuentes en cuarentena',
      historySelected: 'true',
      items: 2,
      mode: 'private_operational',
      newPanelHidden: true,
      personal: '1',
      total: '2',
    });
    if (viewport.width <= 390) {
      await page.locator('#muniGuideTrigger').waitFor({ state: 'visible' });
      const mobileLayout = await page.evaluate(() => {
        const heading = document.querySelector('#sourceIntakeHistoryTitle').getBoundingClientRect();
        const guide = document.querySelector('#muniGuideTrigger').getBoundingClientRect();
        return {
          headingBottom: heading.bottom,
          innerHeight: window.innerHeight,
          overlapsGuide: heading.left < guide.right && heading.right > guide.left &&
            heading.top < guide.bottom && heading.bottom > guide.top,
        };
      });
      assert.ok(mobileLayout.headingBottom <= mobileLayout.innerHeight,
        `${viewport.width}: quarantine heading is outside the first viewport`);
      assert.equal(mobileLayout.overlapsGuide, false,
        `${viewport.width}: help trigger overlaps the quarantine heading`);
    }
    await page.locator('#sourceIntakeHistorySearch').fill('Hacienda');
    assert.equal(await page.locator('#sourceIntakeHistoryList > li').count(), 1);
    assert.match(await page.locator('#sourceIntakeHistoryStatus').textContent(), /Mostrando 1 de 2/);
    await page.locator('#sourceIntakeHistorySearch').fill('');
    await page.locator('#sourceIntakeHistoryAttention').selectOption('attention');
    assert.equal(await page.locator('#sourceIntakeHistoryList > li').count(), 1);
    assert.match(await page.locator('#sourceIntakeHistoryList > li').first().textContent(), /4 bloqueos de control/);
    await page.locator('#sourceIntakeHistoryClear').click();
    assert.equal(await page.locator('#sourceIntakeHistoryList > li').count(), 2);
    assert.equal(await page.locator('#sourceIntakeHistoryAttention').inputValue(), '');
    const firstHistory = page.locator('#sourceIntakeHistoryList details').first();
    const secondHistory = page.locator('#sourceIntakeHistoryList details').nth(1);
    await firstHistory.locator('summary').click();
    assert.equal(await firstHistory.getAttribute('open'), '');
    assert.match(await firstHistory.textContent(), /Perfil técnico agregado/);
    assert.equal(await firstHistory.locator('.source-intake-history__controls').first().locator('li').count(), 7);
    assert.equal(await firstHistory.locator('.source-intake-history__limits li').count(), 3);
    await secondHistory.locator('summary').click();
    await page.waitForFunction(() => !document.querySelector('#sourceIntakeHistoryList details')?.open);
    assert.equal(await firstHistory.getAttribute('open'), null);
    assert.equal(await secondHistory.getAttribute('open'), '');
    await secondHistory.press('Escape');
    assert.equal(await secondHistory.getAttribute('open'), null);
    await page.locator('#sourceIntakeHistoryTab').focus();
    await page.locator('#sourceIntakeHistoryTab').press('ArrowRight');
    assert.equal(await page.locator('#sourceIntakeNewTab').getAttribute('aria-selected'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'sourceIntakeNewTab');
    await completeForm(page);
    await page.locator('#sourceIntakeSubmit').click();
    await page.waitForSelector('#sourceIntakeResult[data-state="quarantined"]:not([hidden])');

    const state = await page.evaluate(() => ({
      active: document.activeElement?.id,
      contract: document.querySelector('#sourceIntakeApp').dataset.contract,
      evaluationHidden: document.querySelector('#sourceIntakeEvaluation').hidden,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      profileTerms: [...document.querySelectorAll('#sourceIntakeProfile dt')].map(node => node.textContent),
      result: document.querySelector('#sourceIntakeResult').textContent,
      secretVisible: /ALFA_SECRETA|BETA_SECRETA|legajo_privado|valor_privado/.test(document.body.textContent),
      theme: document.documentElement.dataset.theme,
      touchTargets: [...document.querySelectorAll(
        '#sourceIntakeApp button:not([hidden]), #sourceIntakeApp a:not([hidden]), #sourceIntakeApp select, #sourceIntakeApp input:not([type="radio"]), #sourceIntakeApp .source-intake-choice label'
      )].filter(node => node.getClientRects().length).map(node => node.getBoundingClientRect().height),
    }));

    assert.equal(state.contract, CONTRACT);
    assert.equal(state.active, 'sourceIntakeResult');
    assert.equal(state.evaluationHidden, true);
    assert.ok(state.overflow <= 1, `${viewport.width}: overflow=${state.overflow}`);
    assert.match(state.result, /Quedó en cuarentena/i);
    assert.match(state.result, /archivo no se conservó/i);
    assert.match(state.result, /ningún dato fue integrado ni publicado/i);
    assert.match(state.result, new RegExp('a'.repeat(64)));
    assert.deepEqual(state.profileTerms, [
      'Filas detectadas', 'Columnas detectadas', 'Celdas vacías', 'Filas duplicadas', 'Huella del esquema',
    ]);
    assert.equal(state.secretVisible, false);
    assert.equal(state.theme, viewport.width === 390 ? 'light' : 'dark');
    assert.ok(state.touchTargets.every(height => height >= 44), `${viewport.width}: touch target below 44px`);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(externalRequests, []);
    assert.equal(multipartBodies.length, beforeBodies + 1);
    await page.locator('#sourceIntakeHistoryTab').click();
    assert.equal(await page.locator('#sourceIntakeHistoryTotal').textContent(), '2');
    assert.equal(await page.locator('#sourceIntakeHistoryList > li').count(), 2);
    assert.match(await page.locator('#sourceIntakeHistoryList > li').first().textContent(), /Novedades de personal de julio/);
    await context.close();
  }

  assert.equal(requestLog.filter(entry => entry.path === '/api/source-intake' && entry.method === 'GET').length, 3);
  assert.equal(requestLog.filter(entry => entry.path === '/api/source-intake' && entry.method === 'POST').length, 3);

  for (const body of multipartBodies) {
    assert.match(body.authorization || '', /^Bearer\s+/u);
    assert.match(body.contentType || '', /^multipart\/form-data;\s*boundary=/iu);
    const names = [...body.raw.matchAll(/;\sname="([^"]+)"/gu)].map(match => match[1]).sort();
    assert.deepEqual(names, [
      'authority', 'classification', 'containsPersonalData', 'currency', 'domain', 'file',
      'ownerOffice', 'purpose', 'referencePeriod', 'sourceLabel',
    ]);
    assert.match(body.raw, /name="containsPersonalData"\r\n\r\nfalse\r\n/u);
    assert.match(body.raw, /name="file"; filename="novedades-julio\.csv"/u);
  }
  assert.equal(requestLog.some(entry => /^\/api\/(?:upload-handler|google-sheets|external-connector|ai-analyze)$/.test(entry.path)), false);
});

test('published Admin can inspect a read-only intake flow with disabled controls and zero POST', async t => {
  const user = authoritativeUser('published-admin', 'TENANT_ADMIN', { published: true });
  const users = new Map([['published-admin', user]]);
  const requestLog = [];
  const { server, multipartBodies } = await createServer(users, requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const { context, page } = await intakePage(
    browser,
    baseUrl,
    'published-admin',
    user,
    { width: 390, height: 844 },
    { forcedColors: 'active', themePreference: 'light' },
  );
  t.after(async () => context.close());
  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto(`${baseUrl}/importar.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#sourceIntakeEvaluation:not([hidden])');
  const state = await page.evaluate(() => {
    const form = document.querySelector('#sourceIntakeForm');
    const event = new Event('submit', { bubbles: true, cancelable: true });
    const dispatchResult = form.dispatchEvent(event);
    return {
      ariaDisabled: form.getAttribute('aria-disabled'),
      controls: [...form.querySelectorAll('input, select, textarea, button')].map(control => ({
        disabled: control.disabled,
        id: control.id,
      })),
      dispatchResult,
      mode: document.querySelector('#sourceIntakeApp').dataset.mode,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      session: document.querySelector('#sourceIntakeSession').textContent,
      submitText: document.querySelector('#sourceIntakeSubmit').textContent,
    };
  });
  assert.match(await page.locator('#sourceIntakeEvaluation').textContent(), /sólo lectura/i);
  assert.match(await page.locator('#sourceIntakeEvaluation').textContent(), /no envía ni analiza archivos/i);
  assert.equal(state.mode, 'evaluation_read_only');
  assert.equal(state.ariaDisabled, 'true');
  assert.equal(state.dispatchResult, false);
  assert.ok(state.controls.length > 0 && state.controls.every(control => control.disabled));
  assert.match(state.session, /sólo lectura/i);
  assert.match(state.submitText, /sólo con acceso privado/i);
  assert.ok(state.overflow <= 1, `390px forced-colors overflow=${state.overflow}`);
  await page.waitForTimeout(50);
  assert.equal(requestLog.some(entry => entry.path === '/api/source-intake'), false);
  assert.equal(multipartBodies.length, 0);
  assert.deepEqual(consoleErrors, []);
});

test('private history rejects a corrupted receipt list and retries only after an explicit action', async t => {
  const user = authoritativeUser('history-drift', 'TENANT_ADMIN');
  const users = new Map([['history-drift', user]]);
  const requestLog = [];
  const mutations = new Map([['history-drift', envelope => {
    envelope.receipts.push(structuredClone(envelope.receipts[0]));
  }]]);
  const { server, multipartBodies } = await createServer(users, requestLog, {
    mutateHistoryBySubject: mutations,
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const { context, page } = await intakePage(browser, baseUrl, 'history-drift', user, { width: 390, height: 844 });
  t.after(async () => context.close());
  await page.goto(`${baseUrl}/importar.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#sourceIntakeHistory[data-state="error"]:not([hidden])');
  assert.equal(await page.locator('#sourceIntakeHistoryError:not([hidden])').count(), 1);
  assert.equal(await page.locator('#sourceIntakeHistoryList > li').count(), 0);
  assert.equal(await page.locator('#sourceIntakeHistorySummary:not([hidden])').count(), 0);
  assert.equal(requestLog.filter(entry => entry.path === '/api/source-intake' && entry.method === 'GET').length, 1);
  await page.locator('#sourceIntakeHistoryReload').click();
  await page.waitForFunction(() => document.querySelector('#sourceIntakeHistory').dataset.state === 'error' &&
    document.querySelector('#sourceIntakeHistoryReload').disabled === false);
  assert.equal(requestLog.filter(entry => entry.path === '/api/source-intake' && entry.method === 'GET').length, 2);
  await page.locator('#sourceIntakeNewTab').click();
  assert.equal(await page.locator('#sourceLabel').isEnabled(), true);
  assert.deepEqual(multipartBodies, []);
  assert.equal(requestLog.some(entry => entry.path === '/api/source-intake' && entry.method === 'POST'), false);
});

test('a role without navigation.import redirects before mounting or posting data', async t => {
  const user = authoritativeUser('limited-user', 'TENANT_USER');
  const users = new Map([['limited-user', user]]);
  const requestLog = [];
  const { server, multipartBodies } = await createServer(users, requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const { context, page } = await intakePage(browser, baseUrl, 'limited-user', user, { width: 320, height: 720 });
  t.after(async () => context.close());
  await page.goto(`${baseUrl}/importar.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(`${baseUrl}/inicio.html`);
  assert.equal(await page.locator('#sourceIntakeApp').count(), 0);
  assert.deepEqual(multipartBodies, []);
  assert.equal(requestLog.some(entry => entry.path === '/api/source-intake'), false);
});

test('the client rejects 200 envelopes with semantic drift and never renders a false success', async t => {
  const mutationSubjects = ['unknown-enum', 'missing-check', 'extra-limit'];
  const users = new Map(mutationSubjects.map(subject => [
    subject,
    authoritativeUser(subject, 'TENANT_ADMIN'),
  ]));
  const mutations = new Map([
    ['unknown-enum', value => { value.source.domain = 'future_domain'; }],
    ['missing-check', value => {
      value.quality.checks = value.quality.checks.filter(check => check.code !== 'antimalware_not_run');
      value.quality.blockedCount -= 1;
    }],
    ['extra-limit', value => {
      value.limits.push({ code: 'future_limit', text: 'Un límite desconocido no puede ampliar el contrato.' });
    }],
  ]);
  const requestLog = [];
  const { server, multipartBodies } = await createServer(users, requestLog, {
    mutateReceiptBySubject: mutations,
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  for (const subject of mutationSubjects) {
    const user = users.get(subject);
    const { context, page } = await intakePage(browser, baseUrl, subject, user, { width: 390, height: 844 });
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(`${baseUrl}/importar.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#sourceIntakeApp[data-state="ready"]:not([hidden])');
    await page.waitForSelector('#sourceIntakeHistory[data-state="ready"]:not([hidden])');
    await page.locator('#sourceIntakeNewTab').click();
    await completeForm(page);
    await page.locator('#sourceIntakeSubmit').click();
    await page.waitForSelector('#sourceIntakeError:not([hidden])');

    assert.match(await page.locator('#sourceIntakeError').textContent(), /no confirmó el contrato municipal-source-intake-v1/iu);
    assert.equal(await page.locator('#sourceIntakeResult:not([hidden])').count(), 0);
    assert.equal(await page.locator('#sourceIntakeApp').getAttribute('data-state'), 'error');
    assert.deepEqual(consoleErrors, [], subject);
    assert.deepEqual(pageErrors, [], subject);
    await context.close();
  }

  assert.equal(multipartBodies.length, mutationSubjects.length);
  assert.deepEqual(
    requestLog.filter(entry => entry.path === '/api/source-intake' && entry.method === 'POST').map(entry => entry.subject),
    mutationSubjects,
  );
});
