import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';

import { chromium } from 'playwright';

import { validateGrhActionLedgerContract } from '../api/lib/grh-action-ledger-contract.js';
import accessPolicy from '../shared/access-policy.cjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTRACT = 'grh-action-ledger-v1';
const NOW = '2026-08-11T12:00:00.000Z';
const SHA = 'a'.repeat(64);
const HISTORICAL_SHA = 'd'.repeat(64);
const CROSS_ID = '11111111-1111-4111-8111-111111111111';
const TEMPORAL_ID = '22222222-2222-4222-8222-222222222222';
const HISTORICAL_ID = '33333333-3333-4333-8333-333333333333';
const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
});

const LIMITS = Object.freeze([
  'human_creation_required', 'new_commitments_current_brief_only', 'no_automatic_assignment',
  'no_approval_or_delegation', 'snapshot_evidence_not_realtime', 'no_free_text_v1',
]);

function clone(value) { return structuredClone(value); }

function source(digest, { sourceSha256 = SHA, snapshotAsOf = '2026-08-06', period = '2026-07' } = {}) {
  return {
    schemaVersion: 'grh-decision-brief-v1',
    policyVersion: 'grh-small-cell-v1',
    sourceSha256,
    snapshotAsOf,
    period,
    evidenceDigest: digest.repeat(64),
  };
}

function createEvent({ dueOn, priority = 'cross' } = {}) {
  return {
    sequence: 1,
    command: 'create',
    fromState: null,
    toState: 'open',
    actorRole: 'INTENDENTE',
    isCurrentUser: true,
    reasonCode: null,
    dueOn,
    outcomeCode: null,
    resultingVersion: 1,
    occurredAt: priority === 'cross' ? '2026-08-01T12:00:00.000Z' : '2026-08-11T12:05:00.000Z',
  };
}

function baseContract({ readOnly = false } = {}) {
  const canMutate = !readOnly;
  const commitment = {
    id: CROSS_ID,
    version: 1,
    priorityCode: 'cross_source_material_difference',
    severity: 'critical',
    actionCode: 'review_cross_source_reconciliation',
    state: 'open',
    assignee: { role: 'CONTADOR', isCurrentUser: false },
    dueOn: '2026-08-10',
    overdue: true,
    outcomeCode: null,
    source: source('b'),
    availableTransitions: canMutate ? ['reschedule', 'cancel'] : [],
    events: [createEvent({ dueOn: '2026-08-10' })],
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
  };
  const contract = {
    schemaVersion: CONTRACT,
    currentBrief: {
      schemaVersion: 'grh-decision-brief-v1', sourceSha256: SHA,
      snapshotAsOf: '2026-08-06', period: '2026-07', status: 'attention_required',
    },
    permissions: {
      canRead: true, canCreate: canMutate, canUpdate: canMutate,
      canCancel: canMutate, canReschedule: canMutate,
    },
    summary: { total: 1, open: 1, inProgress: 0, blocked: 0, completed: 0, canceled: 0, overdue: 1 },
    suggestions: [
      {
        priorityCode: 'cross_source_material_difference', severity: 'critical',
        actionCode: 'review_cross_source_reconciliation', defaultAssigneeRole: 'CONTADOR',
        available: false, existingCommitmentId: CROSS_ID, href: 'hacienda.html',
      },
      {
        priorityCode: 'temporal_quarantine_present', severity: 'warning',
        actionCode: 'review_temporal_quarantine', defaultAssigneeRole: 'TENANT_ADMIN',
        available: canMutate, existingCommitmentId: null, href: 'control.html',
      },
    ],
    commitments: [commitment],
    limits: [...LIMITS],
  };
  assert.equal(validateGrhActionLedgerContract(contract), true);
  return contract;
}

function capacityContract() {
  const contract = baseContract();
  const template = contract.commitments[0];
  for (let index = 1; index < 100; index += 1) {
    const historical = clone(template);
    historical.id = `historical-capacity-${String(index).padStart(3, '0')}`;
    historical.source = source((index % 10).toString(16), {
      sourceSha256: HISTORICAL_SHA,
      snapshotAsOf: '2025-07-06',
      period: '2025-06',
    });
    contract.commitments.push(historical);
  }
  contract.suggestions[1].available = false;
  contract.summary = { total: 100, open: 100, inProgress: 0, blocked: 0, completed: 0, canceled: 0, overdue: 100 };
  assert.equal(validateGrhActionLedgerContract(contract), true);
  return contract;
}

function afterCreate(body) {
  const contract = baseContract();
  const created = {
    id: TEMPORAL_ID,
    version: 1,
    priorityCode: 'temporal_quarantine_present',
    severity: 'warning',
    actionCode: 'review_temporal_quarantine',
    state: 'open',
    assignee: { role: body.assigneeRole, isCurrentUser: false },
    dueOn: body.dueOn,
    overdue: false,
    outcomeCode: null,
    source: source('c'),
    availableTransitions: ['reschedule', 'cancel'],
    events: [createEvent({ dueOn: body.dueOn, priority: 'temporal' })],
    createdAt: '2026-08-11T12:05:00.000Z',
    updatedAt: '2026-08-11T12:05:00.000Z',
  };
  contract.commitments.unshift(created);
  contract.suggestions[1].available = false;
  contract.suggestions[1].existingCommitmentId = TEMPORAL_ID;
  contract.summary = { total: 2, open: 2, inProgress: 0, blocked: 0, completed: 0, canceled: 0, overdue: 1 };
  assert.equal(validateGrhActionLedgerContract(contract), true);
  return contract;
}

function historicalContract({ rescheduled = false } = {}) {
  const contract = baseContract();
  const historical = {
    id: HISTORICAL_ID,
    version: rescheduled ? 2 : 1,
    priorityCode: 'temporal_quarantine_present',
    severity: 'warning',
    actionCode: 'review_temporal_quarantine',
    state: 'open',
    assignee: { role: 'CONTADOR', isCurrentUser: false },
    dueOn: rescheduled ? '2026-09-05' : '2026-08-30',
    overdue: false,
    outcomeCode: null,
    source: source('e', {
      sourceSha256: HISTORICAL_SHA,
      snapshotAsOf: '2025-07-06',
      period: '2025-06',
    }),
    availableTransitions: ['reschedule', 'cancel'],
    events: [createEvent({ dueOn: '2026-08-30', priority: 'temporal' })],
    createdAt: '2026-08-11T12:05:00.000Z',
    updatedAt: rescheduled ? '2026-08-11T12:20:00.000Z' : '2026-08-11T12:05:00.000Z',
  };
  if (rescheduled) {
    historical.events.push({
      sequence: 2, command: 'reschedule', fromState: 'open', toState: 'open',
      actorRole: 'INTENDENTE', isCurrentUser: true, reasonCode: null, dueOn: '2026-09-05',
      outcomeCode: null, resultingVersion: 2, occurredAt: '2026-08-11T12:20:00.000Z',
    });
  }
  contract.commitments.push(historical);
  contract.summary = { total: 2, open: 2, inProgress: 0, blocked: 0, completed: 0, canceled: 0, overdue: 1 };
  assert.equal(validateGrhActionLedgerContract(contract), true);
  return contract;
}

function crossRescheduledContract(dueOn) {
  const contract = baseContract();
  const row = contract.commitments[0];
  row.version = 2;
  row.dueOn = dueOn;
  row.overdue = false;
  row.events.push({
    sequence: 2, command: 'reschedule', fromState: 'open', toState: 'open',
    actorRole: 'INTENDENTE', isCurrentUser: true, reasonCode: null, dueOn,
    outcomeCode: null, resultingVersion: 2, occurredAt: '2026-08-11T12:20:00.000Z',
  });
  row.updatedAt = '2026-08-11T12:20:00.000Z';
  contract.summary.overdue = 0;
  assert.equal(validateGrhActionLedgerContract(contract), true);
  return contract;
}

function tenantProjection(contract, stage = 'open') {
  const value = clone(contract);
  value.permissions = { canRead: true, canCreate: false, canUpdate: true, canCancel: false, canReschedule: false };
  value.suggestions.forEach((suggestion) => { suggestion.available = false; });
  value.commitments.forEach((row) => {
    row.assignee.isCurrentUser = false;
    row.events.forEach((event) => { event.isCurrentUser = false; });
    row.availableTransitions = [];
  });
  const row = value.commitments.find((item) => item.id === TEMPORAL_ID);
  if (stage === 'open') row.availableTransitions = ['claim'];
  if (stage === 'claimed') {
    row.version = 2;
    row.state = 'in_progress';
    row.assignee.isCurrentUser = true;
    row.availableTransitions = ['block', 'complete'];
    row.events.push({
      sequence: 2, command: 'claim', fromState: 'open', toState: 'in_progress',
      actorRole: 'TENANT_ADMIN', isCurrentUser: true, reasonCode: null, dueOn: null,
      outcomeCode: null, resultingVersion: 2, occurredAt: '2026-08-11T12:10:00.000Z',
    });
    row.updatedAt = '2026-08-11T12:10:00.000Z';
    value.summary = { total: 2, open: 1, inProgress: 1, blocked: 0, completed: 0, canceled: 0, overdue: 1 };
  }
  if (stage === 'completed') {
    const claimed = tenantProjection(contract, 'claimed');
    const terminal = claimed.commitments.find((item) => item.id === TEMPORAL_ID);
    terminal.version = 3;
    terminal.state = 'completed';
    terminal.outcomeCode = 'review_completed';
    terminal.availableTransitions = [];
    terminal.events.push({
      sequence: 3, command: 'complete', fromState: 'in_progress', toState: 'completed',
      actorRole: 'TENANT_ADMIN', isCurrentUser: true, reasonCode: null, dueOn: null,
      outcomeCode: 'review_completed', resultingVersion: 3, occurredAt: '2026-08-11T12:15:00.000Z',
    });
    terminal.updatedAt = '2026-08-11T12:15:00.000Z';
    claimed.summary = { total: 2, open: 1, inProgress: 0, blocked: 0, completed: 1, canceled: 0, overdue: 1 };
    assert.equal(validateGrhActionLedgerContract(claimed), true);
    return claimed;
  }
  assert.equal(validateGrhActionLedgerContract(value), true);
  return value;
}

function authoritativeUser(subject, role) {
  const access = accessPolicy.getSessionAccessForUser({ role, tenantId: 'tenant-action-ledger-e2e' });
  return {
    id: subject, name: `Perfil ${role}`, email: `${subject}@internal.invalid`, role,
    tenantId: 'tenant-action-ledger-e2e', tenant: { name: 'Municipalidad de Junín', shortName: 'Junín' },
    capabilities: access.capabilities, accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
    homeProfile: access.homeProfile,
  };
}

function fakeToken(subject) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: subject, exp: 2_000_000_000 })}.qa`;
}

function tokenSubject(request) {
  try {
    return JSON.parse(Buffer.from(String(request.headers.authorization).slice(7).split('.')[1], 'base64url').toString('utf8')).sub;
  } catch { return null; }
}

async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
}

async function createFixture() {
  const users = new Map([
    ['executive', authoritativeUser('executive', 'INTENDENTE')],
    ['tenant-admin', authoritativeUser('tenant-admin', 'TENANT_ADMIN')],
  ]);
  let contract = baseContract();
  let getStatus = 0;
  let postUnavailableOnce = true;
  let replayCommandId = null;
  const seenPostCommands = new Set();
  const patchStatuses = [];
  const patchFaults = [];
  const requests = [];

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/api/auth/me') {
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ user: users.get(tokenSubject(request)) }));
      return;
    }
    if (url.pathname === '/api/grh-action-ledger') {
      const body = request.method === 'GET' ? null : await requestBody(request);
      let successStatus = 200;
      requests.push({
        method: request.method, body, authorization: request.headers.authorization || '',
        accept: request.headers.accept || '', contentType: request.headers['content-type'] || '',
      });
      if (request.method === 'GET' && getStatus) {
        response.writeHead(getStatus, { 'Content-Type': CONTENT_TYPES['.json'], 'X-MuniControl-Contract': CONTRACT });
        response.end(JSON.stringify({ code: `HTTP_${getStatus}` }));
        return;
      }
      if (request.method === 'POST') {
        const seen = seenPostCommands.has(body.commandId);
        if (postUnavailableOnce && !seen) {
          postUnavailableOnce = false;
          replayCommandId = body.commandId;
          seenPostCommands.add(body.commandId);
          contract = afterCreate(body);
          response.writeHead(503, { 'Content-Type': CONTENT_TYPES['.json'], 'X-MuniControl-Contract': CONTRACT });
          response.end(JSON.stringify({ code: 'GRH_ACTION_LEDGER_UNAVAILABLE' }));
          return;
        }
        if (seen) {
          if (replayCommandId !== null) assert.equal(body.commandId, replayCommandId);
        } else {
          seenPostCommands.add(body.commandId);
          contract = afterCreate(body);
          successStatus = 201;
        }
      }
      if (request.method === 'PATCH' && patchFaults.length) {
        const fault = patchFaults.shift();
        if (fault === 'network-reject') {
          request.socket.destroy();
          return;
        }
        if (fault === 'server-500') {
          response.writeHead(500, { 'Content-Type': CONTENT_TYPES['.json'], 'X-MuniControl-Contract': CONTRACT });
          response.end(JSON.stringify({ code: 'GRH_ACTION_LEDGER_UNAVAILABLE' }));
          return;
        }
        if (fault === 'client-invalid-receipt') {
          response.writeHead(422, { 'Content-Type': CONTENT_TYPES['.json'], 'X-MuniControl-Contract': CONTRACT });
          response.end(JSON.stringify({ error: 'Unverifiable client failure' }));
          return;
        }
        if (fault === 'success-invalid-header') {
          response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.json'], 'X-MuniControl-Contract': 'wrong-contract-v1' });
          response.end(JSON.stringify(contract));
          return;
        }
        if (fault === 'success-invalid-body') {
          response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.json'], 'X-MuniControl-Contract': CONTRACT });
          response.end(JSON.stringify({ schemaVersion: CONTRACT }));
          return;
        }
        throw new Error(`Unknown patch fault: ${fault}`);
      }
      if (request.method === 'PATCH' && patchStatuses.length) {
        const status = patchStatuses.shift();
        response.writeHead(status, { 'Content-Type': CONTENT_TYPES['.json'], 'X-MuniControl-Contract': CONTRACT });
        response.end(JSON.stringify({ code: `HTTP_${status}` }));
        return;
      }
      response.writeHead(successStatus, {
        'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store',
        'X-MuniControl-Contract': CONTRACT, 'X-Content-Type-Options': 'nosniff', Vary: 'Authorization',
      });
      response.end(JSON.stringify(contract));
      return;
    }

    const relative = decodeURIComponent(url.pathname.slice(1) || 'decisiones-grh.html');
    const target = path.resolve(ROOT, relative);
    if (!target.startsWith(`${ROOT}${path.sep}`)) { response.writeHead(403).end(); return; }
    try {
      const body = await readFile(target);
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    requests,
    setContract(value) { contract = clone(value); },
    getContract() { return clone(contract); },
    setGetStatus(value) { getStatus = value; },
    setPostUnavailableOnce(value) { postUnavailableOnce = value; },
    queuePatchStatuses(...values) { patchStatuses.push(...values); },
    queuePatchFaults(...values) { patchFaults.push(...values); },
  };
}

async function openPage(browser, fixture, subject, { width = 1440, height = 940, theme = 'dark' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
  const storedUser = subject === 'tenant-admin'
    ? authoritativeUser(subject, 'TENANT_ADMIN')
    : authoritativeUser(subject, 'INTENDENTE');
  await context.addInitScript(({ token, storedTheme, now, user }) => {
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify(user));
    localStorage.setItem('municontrol-color-theme:v1', storedTheme);
    localStorage.setItem('govtech_theme', storedTheme);
    globalThis.__grhLedgerNow = now;
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [globalThis.__grhLedgerNow])); }
      static now() { return NativeDate.parse(globalThis.__grhLedgerNow); }
    }
    Object.defineProperty(window, 'Date', { value: FixedDate });
  }, { token: fakeToken(subject), storedTheme: theme, now: NOW, user: storedUser });
  const page = await context.newPage();
  await page.goto(`${fixture.baseUrl}/decisiones-grh.html`, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

async function waitReady(page) {
  await page.locator('#decisionContent:not([hidden])').waitFor();
  await page.locator('#decisionStatus[data-state="ready"]').waitFor();
}

test('action ledger surface integrations stay discoverable and capability-bound', async () => {
  const [html, nav, home, dashboard, guide, manual, webContract] = await Promise.all([
    readFile(path.join(ROOT, 'decisiones-grh.html'), 'utf8'),
    readFile(path.join(ROOT, 'js/nav.js'), 'utf8'),
    readFile(path.join(ROOT, 'inicio.html'), 'utf8'),
    readFile(path.join(ROOT, 'dashboard.html'), 'utf8'),
    readFile(path.join(ROOT, 'js/contextual-help-catalog.js'), 'utf8'),
    readFile(path.join(ROOT, 'manuales.html'), 'utf8'),
    readFile(path.join(ROOT, 'build/public-web-contract.mjs'), 'utf8'),
  ]);
  for (const id of ['decisionLedger', 'decisionSummary', 'decisionSuggestions', 'decisionCommitments', 'decisionFilters', 'decisionDrawer', 'decisionTimeline', 'decisionDialog', 'decisionAssigneeRole', 'decisionDueOn', 'decisionSubmit', 'decisionStatus', 'decisionRetry']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(nav, /decisiones-grh\.html[\s\S]{0,160}navigation\.grh-decisions/);
  assert.match(home, /navigation\.grh-decisions[\s\S]{0,200}decisiones-grh\.html/);
  assert.match(dashboard, /id="decisionLedgerCta"[^>]+href="decisiones-grh\.html"/);
  assert.match(guide, /manualAnchor:\s*'decisiones-compromisos'/);
  assert.match(manual, /id="decisiones-compromisos"[\s\S]{0,1800}POST \/api\/grh-action-ledger[\s\S]{0,1200}PATCH \/api\/grh-action-ledger/);
  assert.match(manual, /GET \/api\/grh-action-ledger<\/code> consulta[\s\S]{0,180}<code>POST<\/code> crea[\s\S]{0,120}<code>PATCH<\/code> registra/);
  assert.equal((html.match(/type="button" data-close-dialog/g) || []).length, 2);
  assert.match(webContract, /'decisiones-grh\.html'/);
});

test('enterprise ledger creates idempotently, exposes evidence and timeline, and maps mutation failures without replacing state', async (t) => {
  const fixture = await createFixture();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => fixture.server.close(resolve));
  });
  const { context, page } = await openPage(browser, fixture, 'executive');
  t.after(() => context.close());
  const consoleErrors = [];
  const external = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('request', (request) => { if (!request.url().startsWith(fixture.baseUrl)) external.push(request.url()); });
  await waitReady(page);
  assert.equal(await page.locator('#decisionLoading').isVisible(), false);
  assert.equal(await page.locator('#decisionError').isVisible(), false);
  if (process.env.GRH_ACTION_LEDGER_SCREENSHOT_DIR) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(process.env.GRH_ACTION_LEDGER_SCREENSHOT_DIR, 'grh-decisions-1440-dark.png'), fullPage: true });
  }

  assert.deepEqual(await page.locator('#decisionSummary strong').allTextContents(), ['1', '1', '0', '0', '1', '0', '0']);
  assert.equal(await page.locator('#decisionSuggestions a').evaluateAll((links) => links.map((link) => link.getAttribute('href')).join(',')), 'hacienda.html,control.html');
  assert.ok(await page.locator('#decisionLedger').evaluate((node) => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1 && node.getAttribute('aria-busy') === 'false'));

  await page.locator('#muniGuideTrigger').click();
  await page.locator('#muniGuideDialog.is-open').waitFor();
  assert.equal(await page.locator('.muni-guide-progress').textContent(), 'Paso 1 de 3');
  assert.match(await page.locator('.muni-guide-link').first().getAttribute('href'), /manuales\.html#decisiones-compromisos$/);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  assert.doesNotMatch(await page.locator('.muni-guide-step-copy').textContent(), /Creá|crear|Convertí/i);
  await page.keyboard.press('Escape');

  const requestsBeforeCancel = fixture.requests.length;
  await page.locator('[data-create-priority="temporal_quarantine_present"]').click();
  await page.locator('#decisionDialog [aria-label="Cerrar formulario"]').click();
  await page.locator('#decisionDialog').waitFor({ state: 'hidden' });
  assert.equal(fixture.requests.length, requestsBeforeCancel, 'dialog X must not submit');
  await page.locator('[data-create-priority="temporal_quarantine_present"]').click();
  await page.locator('#decisionDialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.locator('#decisionDialog').waitFor({ state: 'hidden' });
  assert.equal(fixture.requests.length, requestsBeforeCancel, 'dialog Cancelar must not submit');

  await page.locator('[data-create-priority="temporal_quarantine_present"]').click();
  assert.equal(await page.locator('#decisionDueOn').getAttribute('min'), '2026-08-11');
  assert.equal(await page.locator('#decisionDueOn').getAttribute('max'), '2027-02-07');
  await page.locator('#decisionAssigneeRole').selectOption('TENANT_ADMIN');
  await page.locator('#decisionDueOn').fill('2026-08-11');
  await page.locator('#decisionSubmit').click();
  await page.locator('#decisionFormError').filter({ hasText: /confirmar|mismo comando/i }).waitFor();
  assert.equal(await page.locator('#decisionCommitments .decision-commitment').count(), 1, '503 keeps the prior projection visible');
  await page.evaluate(() => { globalThis.__grhLedgerNow = '2026-08-12T12:00:00.000Z'; });
  assert.equal(await page.locator('#decisionDueOn').isDisabled(), true, 'an uncertain command is locked for exact replay');
  await page.locator('#decisionSubmit').click();
  await page.locator('#decisionDialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#decisionCommitments .decision-commitment').count(), 2);
  assert.equal(await page.locator('#decisionSummary strong').first().textContent(), '2');

  const posts = fixture.requests.filter((request) => request.method === 'POST');
  assert.equal(posts.length, 2);
  assert.deepEqual(posts[0].body, posts[1].body, 'ambiguous retry must reuse the exact command');
  assert.deepEqual(Object.keys(posts[0].body).sort(), ['assigneeRole', 'brief', 'commandId', 'dueOn']);
  assert.deepEqual(Object.keys(posts[0].body.brief).sort(), ['period', 'priorityCode', 'schemaVersion', 'snapshotAsOf', 'sourceSha256']);
  assert.match(posts[0].body.commandId, /^[0-9a-f-]{36}$/);
  assert.match(posts[0].authorization, /^Bearer /);
  assert.equal(posts[0].contentType, 'application/json');

  await page.locator(`[data-open-commitment="${CROSS_ID}"]`).first().click();
  await page.locator('#decisionDrawer:not([hidden])').waitFor();
  assert.equal(await page.locator('#decisionTimeline .decision-event').count(), 1);
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('decision-drawer')), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#decisionDrawer').evaluate((node) => node.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#decisionDrawer').isHidden(), true);

  await page.locator(`[data-open-commitment="${CROSS_ID}"]`).first().click();
  await page.locator('[data-transition="reschedule"]').click();
  await page.locator('#decisionDueOn').fill('2026-09-01');
  fixture.queuePatchStatuses(422, 403, 409, 503);
  const expectedMessages = [/transición|evidencia/i, /permiso/i, /conflicto|cambió/i, /confirmar|mismo comando/i];
  for (const [index, message] of expectedMessages.entries()) {
    await page.locator('#decisionSubmit').click();
    await page.locator('#decisionFormError').filter({ hasText: message }).waitFor();
    assert.equal(await page.locator('#decisionDueOn').isDisabled(), index === 3,
      index === 3 ? '5xx freezes the exact replay body' : 'verified 4xx remains editable');
  }
  const failedPatches = fixture.requests.filter((request) => request.method === 'PATCH');
  assert.equal(failedPatches.length, 4);
  assert.equal(new Set(failedPatches.map((request) => request.body.commandId)).size, 1);
  assert.ok(failedPatches.every((request) => Object.keys(request.body).sort().join(',') === 'command,commandId,commitmentId,dueOn,expectedVersion,outcomeCode,reasonCode'));
  await page.locator('#decisionDialog [data-close-dialog]').first().click();
  await page.keyboard.press('Escape');
  assert.equal(consoleErrors.length, 5, 'each deliberate HTTP failure is surfaced by Chromium once');
  assert.ok(consoleErrors.every((message) => /Failed to load resource/.test(message)));
  assert.deepEqual(external, []);
});

test('every uncertain mutation outcome replays one immutable command while verified 4xx stays editable', async (t) => {
  const fixture = await createFixture();
  fixture.queuePatchFaults('server-500', 'client-invalid-receipt', 'success-invalid-header', 'success-invalid-body');
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => fixture.server.close(resolve));
  });
  const { context, page } = await openPage(browser, fixture, 'executive');
  t.after(() => context.close());
  const observedPatchBodies = [];
  let abortNextPatch = true;
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && new URL(request.url()).pathname === '/api/grh-action-ledger') {
      observedPatchBodies.push(request.postDataJSON());
    }
  });
  await page.route('**/api/grh-action-ledger', async (route) => {
    if (route.request().method() === 'PATCH' && abortNextPatch) {
      abortNextPatch = false;
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  await waitReady(page);
  await page.locator(`[data-open-commitment="${CROSS_ID}"]`).first().click();
  await page.locator('[data-transition="reschedule"]').click();
  await page.locator('#decisionDueOn').fill('2026-08-11');

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.locator('#decisionSubmit').click();
    const settled = await page.waitForFunction(() => {
      const submit = document.getElementById('decisionSubmit');
      return submit && !submit.disabled && submit.textContent === 'Reintentar';
    }, null, { timeout: 5000 }).then(() => true, () => false);
    assert.equal(settled, true, `uncertain attempt ${attempt + 1} did not return to replay state; requests=${fixture.requests.filter((request) => request.method === 'PATCH').length}; button=${await page.locator('#decisionSubmit').textContent()}; disabled=${await page.locator('#decisionSubmit').isDisabled()}; error=${await page.locator('#decisionFormError').textContent()}`);
    assert.match(await page.locator('#decisionFormError').textContent(), /confirmar[\s\S]*mismo comando/i);
    assert.equal(await page.locator('#decisionDueOn').isDisabled(), true);
    if (attempt === 0) {
      await page.evaluate(() => { globalThis.__grhLedgerNow = '2026-08-12T12:00:00.000Z'; });
    }
  }

  fixture.setContract(crossRescheduledContract('2026-08-11'));
  await page.locator('#decisionSubmit').click();
  await page.locator('#decisionDialog').waitFor({ state: 'hidden' });
  assert.equal(observedPatchBodies.length, 6);
  assert.ok(observedPatchBodies.every((body) => JSON.stringify(body) === JSON.stringify(observedPatchBodies[0])),
    'network, 5xx and invalid 2xx responses must replay the exact serialized command');
  assert.equal(new Set(observedPatchBodies.map((body) => body.commandId)).size, 1);
  assert.equal(observedPatchBodies[0].dueOn, '2026-08-11');
  assert.equal(await page.locator('#decisionTimeline .decision-event').count(), 2);
});

test('assignee can claim and complete while read-only and HTTP failure states stay explicit on desktop and mobile', async (t) => {
  const fixture = await createFixture();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => fixture.server.close(resolve));
  });
  const created = afterCreate({ assigneeRole: 'TENANT_ADMIN', dueOn: '2026-08-25' });
  fixture.setContract(tenantProjection(created, 'open'));
  const tenant = await openPage(browser, fixture, 'tenant-admin');
  t.after(() => tenant.context.close());
  await waitReady(tenant.page);
  await tenant.page.locator('#muniGuideTrigger').click();
  await tenant.page.locator('#muniGuideDialog.is-open').waitFor();
  const tenantGuideCopy = [await tenant.page.locator('.muni-guide-objective').textContent()];
  for (let step = 0; step < 3; step += 1) {
    tenantGuideCopy.push(await tenant.page.locator('.muni-guide-step-title').textContent());
    tenantGuideCopy.push(await tenant.page.locator('.muni-guide-step-copy').textContent());
    if (step < 2) await tenant.page.getByRole('button', { name: 'Siguiente' }).click();
  }
  assert.doesNotMatch(tenantGuideCopy.join(' '), /Creá|crear|Convertí/i);
  await tenant.page.keyboard.press('Escape');
  assert.equal(await tenant.page.locator('[data-create-priority]').count(), 0);
  assert.equal(await tenant.page.locator('button:has-text("Creación no habilitada")').count(), 0, 'existing priorities open their commitment');
  await tenant.page.locator(`[data-open-commitment="${TEMPORAL_ID}"]`).first().click();
  assert.equal(await tenant.page.locator('[data-transition="claim"]').count(), 1);
  fixture.setContract(tenantProjection(created, 'claimed'));
  await tenant.page.locator('[data-transition="claim"]').click();
  await tenant.page.locator('#decisionSubmit').click();
  await tenant.page.locator('#decisionDialog').waitFor({ state: 'hidden' });
  assert.equal(await tenant.page.locator('#decisionTimeline .decision-event').count(), 2);
  fixture.setContract(tenantProjection(created, 'completed'));
  await tenant.page.locator('[data-transition="complete"]').click();
  await tenant.page.locator('#decisionOutcomeCode').selectOption('review_completed');
  await tenant.page.locator('#decisionSubmit').click();
  await tenant.page.locator('#decisionDialog').waitFor({ state: 'hidden' });
  assert.equal(await tenant.page.locator('#decisionTimeline .decision-event').count(), 3);
  assert.match(await tenant.page.locator('#decisionDrawerMeta').innerText(), /Completado[\s\S]*Revisión realizada/);

  const successfulPatches = fixture.requests.filter((request) => request.method === 'PATCH');
  assert.deepEqual(successfulPatches.map((request) => request.body.command), ['claim', 'complete']);
  assert.deepEqual(successfulPatches[0].body, {
    commandId: successfulPatches[0].body.commandId, commitmentId: TEMPORAL_ID, expectedVersion: 1,
    command: 'claim', reasonCode: null, dueOn: null, outcomeCode: null,
  });
  assert.equal(successfulPatches[1].body.outcomeCode, 'review_completed');

  fixture.setGetStatus(503);
  const unavailable = await openPage(browser, fixture, 'executive', { width: 390, height: 844, theme: 'light' });
  t.after(() => unavailable.context.close());
  await unavailable.page.locator('#decisionError:not([hidden])').waitFor();
  assert.match(await unavailable.page.locator('#decisionErrorTitle').textContent(), /temporalmente/i);
  assert.equal(await unavailable.page.locator('#decisionRetry').isVisible(), true);
  fixture.setGetStatus(0);
  fixture.setContract(baseContract({ readOnly: true }));
  await unavailable.page.locator('#decisionRetry').click();
  await waitReady(unavailable.page);
  assert.equal(await unavailable.page.locator('#decisionLoading').isVisible(), false);
  assert.equal(await unavailable.page.locator('#decisionError').isVisible(), false);
  if (process.env.GRH_ACTION_LEDGER_SCREENSHOT_DIR) {
    await unavailable.page.evaluate(() => window.scrollTo(0, 0));
    await unavailable.page.screenshot({ path: path.join(process.env.GRH_ACTION_LEDGER_SCREENSHOT_DIR, 'grh-decisions-390-light.png'), fullPage: true });
  }
  assert.equal(await unavailable.page.locator('[data-create-priority]').count(), 0);
  assert.equal(await unavailable.page.locator('[data-transition]').count(), 0);
  assert.ok(await unavailable.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1));
  assert.equal(await unavailable.page.locator('html').getAttribute('data-theme'), 'light');

  fixture.setGetStatus(403);
  const forbidden = await openPage(browser, fixture, 'executive');
  t.after(() => forbidden.context.close());
  await forbidden.page.locator('#decisionError:not([hidden])').waitFor();
  assert.match(await forbidden.page.locator('#decisionErrorTitle').textContent(), /Acceso no habilitado/i);
  assert.equal(await forbidden.page.locator('#decisionRetry').isHidden(), true);
});

test('historical commitments remain visible and operable without occupying the current brief suggestion', async (t) => {
  const fixture = await createFixture();
  const initial = historicalContract();
  fixture.setContract(initial);
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => fixture.server.close(resolve));
  });
  const { context, page } = await openPage(browser, fixture, 'executive');
  t.after(() => context.close());
  await waitReady(page);

  assert.equal(await page.locator('#decisionSummary strong').first().textContent(), '2');
  assert.equal(await page.locator('[data-create-priority="temporal_quarantine_present"]').count(), 1,
    'a historical commitment does not occupy the current brief suggestion');
  const historical = page.locator(`[data-open-commitment="${HISTORICAL_ID}"][data-source-context="histórico"]`);
  assert.equal(await historical.count(), 1);
  assert.match(await historical.innerText(), /Histórico[\s\S]*jun 2025[\s\S]*6 jul 2025/i);

  const invalidReference = clone(initial);
  invalidReference.suggestions[1].available = false;
  invalidReference.suggestions[1].existingCommitmentId = HISTORICAL_ID;
  assert.equal(await page.evaluate((value) => window.MuniGrhActionLedger.inspectContract(value), invalidReference), null,
    'a suggestion cannot reference a commitment from a historical source');

  await historical.click();
  await page.locator('#decisionDrawer:not([hidden])').waitFor();
  assert.match(await page.locator('#decisionDrawerMeta').innerText(), /Histórico[\s\S]*jun 2025[\s\S]*6 jul 2025/i);
  await page.locator('[data-transition="reschedule"]').click();
  await page.locator('#decisionDueOn').fill('2026-09-05');
  fixture.setContract(historicalContract({ rescheduled: true }));
  await page.locator('#decisionSubmit').click();
  await page.locator('#decisionDialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#decisionTimeline .decision-event').count(), 2);
  assert.match(await page.locator('#decisionDrawerMeta').innerText(), /5 sept 2026/i);
  const patchRequest = fixture.requests.find((request) => request.method === 'PATCH');
  assert.deepEqual(patchRequest.body, {
    commandId: patchRequest.body.commandId,
    commitmentId: HISTORICAL_ID,
    expectedVersion: 1,
    command: 'reschedule',
    reasonCode: null,
    dueOn: '2026-09-05',
    outcomeCode: null,
  });
});

test('capacity exhaustion disables creation and a fresh human command returns 201', async (t) => {
  const fixture = await createFixture();
  fixture.setPostUnavailableOnce(false);
  fixture.setContract(capacityContract());
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => fixture.server.close(resolve));
  });

  const capacity = await openPage(browser, fixture, 'executive');
  t.after(() => capacity.context.close());
  await waitReady(capacity.page);
  assert.equal(await capacity.page.locator('#decisionPermissionChip').textContent(), 'Creación habilitada');
  assert.equal(await capacity.page.locator('[data-create-priority="temporal_quarantine_present"]').count(), 0);
  assert.equal(await capacity.page.getByRole('button', { name: 'Creación no habilitada' }).count(), 1);

  fixture.setContract(baseContract());
  const create = await openPage(browser, fixture, 'executive');
  t.after(() => create.context.close());
  await waitReady(create.page);
  await create.page.locator('[data-create-priority="temporal_quarantine_present"]').click();
  await create.page.locator('#decisionAssigneeRole').selectOption('CONTADOR');
  await create.page.evaluate(() => { globalThis.__grhLedgerNow = '2026-08-12T12:00:00.000Z'; });
  await create.page.locator('#decisionDueOn').fill('2026-08-11');
  const postsBeforeExpiredCreate = fixture.requests.filter((request) => request.method === 'POST').length;
  await create.page.locator('#decisionSubmit').click();
  await create.page.locator('#decisionFormError').filter({ hasText: /entre hoy/i }).waitFor();
  assert.equal(fixture.requests.filter((request) => request.method === 'POST').length, postsBeforeExpiredCreate,
    'a new unsent command cannot bypass the current-day bound');
  await create.page.locator('#decisionDueOn').fill('2026-08-30');
  const responsePromise = create.page.waitForResponse((response) =>
    response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/grh-action-ledger');
  await create.page.locator('#decisionSubmit').click();
  const response = await responsePromise;
  assert.equal(response.status(), 201);
  await create.page.locator('#decisionDialog').waitFor({ state: 'hidden' });
  assert.equal(await create.page.locator('#decisionCommitments .decision-commitment').count(), 2);
});
