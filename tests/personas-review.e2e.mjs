import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

import { chromium } from 'playwright';

import accessPolicy from '../shared/access-policy.cjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const REVIEW_CONTRACT = 'grh-personas-review-v1';
const DECISION_CONTRACT = 'grh-personas-review-decision-v1';
const SNAPSHOT = '2026-08-06';
const CASES = Object.freeze({
  PENDING: '1'.repeat(64),
  DEFERRED: '2'.repeat(64),
  APPROVED: '3'.repeat(64),
  REJECTED: '4'.repeat(64),
});
const SECOND_PENDING_CASE = '5'.repeat(64);
const OPTION_KEYS = Object.freeze(['a'.repeat(64), 'b'.repeat(64)]);
const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
});

function clone(value) { return structuredClone(value); }

function summary(overrides = {}) {
  const base = {
    totalCases: 2349,
    totalOptions: 2185,
    byKind: { candidate: 1699, ambiguous: 157, unmatched: 493 },
    byStatus: { pending: 2300, deferred: 10, approved: 20, rejected: 19 },
    documentConflicts: 23,
    autoApproved: 0,
  };
  return { ...base, ...overrides };
}

function source() {
  return {
    snapshotAsOf: SNAPSHOT,
    grhSourceSha256: 'e'.repeat(64),
    personasSourceSha256: 'f'.repeat(64),
    matcherVersion: 'matcher-e2e-v1',
    evidencePolicyVersion: 'evidence-e2e-v1',
  };
}

function baseContract(currentSummary = summary()) {
  return {
    schemaVersion: REVIEW_CONTRACT,
    status: 'ready',
    source: source(),
    permissions: { canRead: true, canDecide: true },
    summary: clone(currentSummary),
  };
}

function queueItem(status, {
  documentConflict = status === 'PENDING',
  birthDateConflict = false,
  caseKey = CASES[status],
} = {}) {
  const isPendingConflict = status === 'PENDING' && documentConflict;
  return {
    caseKey,
    kind: status === 'PENDING' ? 'AMBIGUOUS' : status === 'DEFERRED' ? 'CANDIDATE' : 'UNMATCHED',
    status,
    priority: status === 'PENDING' ? (isPendingConflict ? 'DOCUMENT_CONFLICT' : 'STANDARD') : 'MANUAL_REVIEW',
    version: 1,
    optionCount: status === 'PENDING' ? 2 : status === 'APPROVED' || status === 'DEFERRED' ? 1 : 0,
    flags: {
      documentConflict: isPendingConflict,
      birthDateConflict,
      nameSupport: status !== 'REJECTED',
    },
  };
}

function privatePerson(index) {
  return {
    displayName: index === 0 ? 'PERSONA GRH PRUEBA' : `PERSONA AUXILIAR ${index}`,
    birthDate: index === 2 ? '1981-05-02' : '1981-05-01',
    documents: {
      cuil: index === 0 ? '20-00000001-7' : `20-0000000${index + 1}-5`,
      dni: index === 0 ? '00000001' : `0000000${index + 1}`,
    },
  };
}

function privateIdentity(index) {
  const { documents: _documents, ...identity } = privatePerson(index);
  return identity;
}

function optionsFor(item, {
  optionConflict = item.flags.documentConflict || item.flags.birthDateConflict,
  firstMatchMethod = 'DOCUMENT_CANDIDATE',
  firstNameEvidence = 'MATCH',
  firstBirthDateEvidence = item.flags.birthDateConflict ? 'CONFLICT' : 'MATCH',
} = {}) {
  return Array.from({ length: item.optionCount }, (_, index) => ({
    optionKey: OPTION_KEYS[index],
    rank: index + 1,
    matchMethod: index === 0 ? firstMatchMethod : 'NAME_BIRTHDATE_SIGNAL',
    evidenceLevel: index === 0 ? (optionConflict ? 'CONFLICT' : 'STRONG') : 'ASSISTED',
    evidence: {
      cuil: index === 0 ? (item.flags.documentConflict ? 'CONFLICT' : 'MATCH') : 'MISSING',
      dni: index === 0 ? 'MATCH' : 'MISSING',
      name: index === 0 ? firstNameEvidence : 'MATCH',
      birthDate: index === 0 ? firstBirthDateEvidence : 'CONFLICT',
    },
    person: privateIdentity(index + 1),
    requiresManualCheck: true,
  }));
}

function queueContract(status, currentSummary, options) {
  const { cursor = null, ...itemOptions } = options || {};
  const secondPending = status === 'PENDING' && cursor === CASES.PENDING;
  const item = queueItem(status, {
    ...itemOptions,
    caseKey: secondPending ? SECOND_PENDING_CASE : CASES[status],
  });
  return {
    ...baseContract(currentSummary),
    page: { limit: 1, nextCursor: status === 'PENDING' && cursor === null ? CASES.PENDING : null },
    items: [item],
  };
}

function detailContract(status, currentSummary, options = {}) {
  const item = queueItem(status, options);
  return {
    ...baseContract(currentSummary),
    documentsRevealed: false,
    case: {
      caseKey: item.caseKey,
      kind: item.kind,
      status: item.status,
      priority: item.priority,
      version: item.version,
      flags: clone(item.flags),
      person: privateIdentity(0),
      options: optionsFor(item, options),
      decision: status === 'APPROVED' || status === 'REJECTED'
        ? {
            status,
            selectedOptionKey: status === 'APPROVED' ? OPTION_KEYS[0] : null,
            reasonCode: status === 'APPROVED' ? 'EVIDENCE_CONFIRMED' : 'NO_MATCH_CONFIRMED',
            decidedAt: '2026-08-13T14:00:00.000Z',
          }
        : null,
    },
  };
}

function statusForCaseKey(caseKey) {
  if (caseKey === SECOND_PENDING_CASE) return 'PENDING';
  return Object.keys(CASES).find(key => CASES[key] === caseKey);
}

function documentsContract(status, caseKey = CASES[status]) {
  const item = queueItem(status, { caseKey });
  return {
    schemaVersion: REVIEW_CONTRACT,
    status: 'ready',
    source: source(),
    permissions: { canRead: true, canDecide: true },
    documentsRevealed: true,
    documents: {
      case: { caseKey: item.caseKey, documents: clone(privatePerson(0).documents) },
      options: Array.from({ length: item.optionCount }, (_, index) => ({
        optionKey: OPTION_KEYS[index],
        documents: clone(privatePerson(index + 1).documents),
      })),
    },
  };
}

function authoritativeUser(subject, role) {
  const access = accessPolicy.getSessionAccessForUser({ role, tenantId: 'tenant-personas-review-e2e' });
  return {
    id: subject,
    name: `Perfil ${role}`,
    email: `${subject}@internal.invalid`,
    role,
    tenantId: 'tenant-personas-review-e2e',
    tenant: { name: 'Municipalidad de Junín', shortName: 'Junín' },
    capabilities: access.capabilities,
    accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
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
    ['intendente-private', authoritativeUser('intendente-private', 'INTENDENTE')],
    ['tenant-admin-private', authoritativeUser('tenant-admin-private', 'TENANT_ADMIN')],
  ]);
  let currentSummary = summary();
  let reviewStatus = 0;
  let reviewContractHeader = REVIEW_CONTRACT;
  let detailStatus = 0;
  let decisionStatus = 0;
  let pendingDocumentConflict = true;
  let pendingBirthDateConflict = false;
  let pendingOptionConflict = null;
  let pendingFirstMatchMethod;
  let pendingFirstNameEvidence;
  let pendingFirstBirthDateEvidence;
  let canDecide = true;
  const requests = [];

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/api/auth/me') {
      const user = users.get(tokenSubject(request));
      if (!user) {
        response.writeHead(401, { 'Content-Type': CONTENT_TYPES['.json'] });
        response.end(JSON.stringify({ code: 'AUTH_REQUIRED' }));
        return;
      }
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ user }));
      return;
    }

    if (url.pathname === '/api/grh-personas-review') {
      const view = url.searchParams.get('view') || 'summary';
      const status = url.searchParams.get('status') || 'PENDING';
      requests.push({
        method: request.method,
        path: url.pathname,
        query: url.search,
        authorization: request.headers.authorization || '',
        purpose: request.headers['x-municontrol-purpose'] || '',
        correlationId: request.headers['x-correlation-id'] || '',
      });
      const fault = view === 'detail' || view === 'documents' ? detailStatus : reviewStatus;
      if (fault) {
        response.writeHead(fault, {
          'Content-Type': CONTENT_TYPES['.json'],
          'X-MuniControl-Contract': REVIEW_CONTRACT,
          'Cache-Control': 'no-store, private, max-age=0',
        });
        response.end(JSON.stringify({ code: `GRH_PERSONAS_REVIEW_${fault}` }));
        return;
      }
      let payload;
      if (view === 'summary') payload = baseContract(currentSummary);
      else if (view === 'queue') payload = queueContract(status, currentSummary, {
        documentConflict: status === 'PENDING' && pendingDocumentConflict,
        birthDateConflict: status === 'PENDING' && pendingBirthDateConflict,
        cursor: url.searchParams.get('cursor'),
      });
      else if (view === 'detail') {
        const requestedCase = url.searchParams.get('case');
        const caseStatus = statusForCaseKey(requestedCase);
        payload = detailContract(caseStatus, currentSummary, {
          caseKey: requestedCase,
          documentConflict: caseStatus === 'PENDING' && pendingDocumentConflict,
          birthDateConflict: caseStatus === 'PENDING' && pendingBirthDateConflict,
          optionConflict: caseStatus === 'PENDING' && pendingOptionConflict !== null
            ? pendingOptionConflict
            : undefined,
          firstMatchMethod: caseStatus === 'PENDING' ? pendingFirstMatchMethod : undefined,
          firstNameEvidence: caseStatus === 'PENDING' ? pendingFirstNameEvidence : undefined,
          firstBirthDateEvidence: caseStatus === 'PENDING' ? pendingFirstBirthDateEvidence : undefined,
        });
      }
      else if (view === 'documents') {
        const requestedCase = url.searchParams.get('case');
        const caseStatus = statusForCaseKey(requestedCase);
        payload = documentsContract(caseStatus, requestedCase);
      }
      else payload = { schemaVersion: REVIEW_CONTRACT };
      if (payload.permissions) payload.permissions.canDecide = canDecide;
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES['.json'],
        'X-MuniControl-Contract': reviewContractHeader,
        'Cache-Control': 'no-store, private, max-age=0',
        Pragma: 'no-cache',
        Vary: 'Authorization',
      });
      response.end(JSON.stringify(payload));
      return;
    }

    if (url.pathname === '/api/grh-personas-review-decision') {
      const body = await requestBody(request);
      requests.push({
        method: request.method,
        path: url.pathname,
        body,
        authorization: request.headers.authorization || '',
        purpose: request.headers['x-municontrol-purpose'] || '',
        correlationId: request.headers['x-correlation-id'] || '',
        contentType: request.headers['content-type'] || '',
      });
      if (decisionStatus) {
        response.writeHead(decisionStatus, {
          'Content-Type': CONTENT_TYPES['.json'],
          'X-MuniControl-Contract': DECISION_CONTRACT,
        });
        response.end(JSON.stringify({ code: `GRH_PERSONAS_REVIEW_DECISION_${decisionStatus}` }));
        return;
      }
      currentSummary = summary({
        byStatus: {
          pending: currentSummary.byStatus.pending - 1,
          deferred: currentSummary.byStatus.deferred,
          approved: currentSummary.byStatus.approved + 1,
          rejected: currentSummary.byStatus.rejected,
        },
      });
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES['.json'],
        'X-MuniControl-Contract': DECISION_CONTRACT,
        'Cache-Control': 'no-store, private, max-age=0',
      });
      response.end(JSON.stringify({
        schemaVersion: DECISION_CONTRACT,
        status: 'recorded',
        replayed: false,
        decision: {
          caseKey: body.caseKey,
          status: body.decision === 'APPROVE' ? 'APPROVED' : body.decision === 'DEFER' ? 'DEFERRED' : 'REJECTED',
          version: body.expectedVersion + 1,
          selectedOptionKey: body.optionKey,
          reasonCode: body.reasonCode,
          decidedAt: '2026-08-13T15:30:00.000Z',
        },
      }));
      return;
    }

    const relative = decodeURIComponent(url.pathname.slice(1) || 'revision-personas.html');
    const target = path.resolve(ROOT, relative);
    if (!target.startsWith(`${ROOT}${path.sep}`)) { response.writeHead(403).end(); return; }
    try {
      const body = await readFile(target);
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES[path.extname(target)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    requests,
    setReviewStatus(value) { reviewStatus = value; },
    setDetailStatus(value) { detailStatus = value; },
    setDecisionStatus(value) { decisionStatus = value; },
    setPendingDocumentConflict(value) { pendingDocumentConflict = value; },
    setPendingBirthDateConflict(value) { pendingBirthDateConflict = value; },
    setPendingOptionConflict(value) { pendingOptionConflict = value; },
    setPendingDniEvidence(matchMethod, nameEvidence, birthDateEvidence) {
      pendingFirstMatchMethod = matchMethod;
      pendingFirstNameEvidence = nameEvidence;
      pendingFirstBirthDateEvidence = birthDateEvidence;
    },
    setReviewContractHeader(value) { reviewContractHeader = value; },
    setCanDecide(value) { canDecide = value; },
  };
}

async function openPage(browser, fixture, subject = 'intendente-private', options = {}) {
  const width = options.width || 1440;
  const height = options.height || 960;
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: options.theme || 'dark' });
  const role = subject === 'tenant-admin-private' ? 'TENANT_ADMIN' : 'INTENDENTE';
  const user = authoritativeUser(subject, role);
  await context.addInitScript(({ token, storedUser }) => {
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify(storedUser));
  }, { token: fakeToken(subject), storedUser: user });
  const page = await context.newPage();
  await page.goto(`${fixture.baseUrl}/revision-personas.html`, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

async function waitReady(page) {
  await page.locator('#personasContent:not([hidden])').waitFor();
  await page.locator('#personasCase:not([hidden])').waitFor();
}

test('S16B client is strict, private and contains no production counts or browser persistence', async () => {
  const [html, css, dataScript, uiScript, auditoria, dataOperations, webContract] = await Promise.all([
    readFile(path.join(ROOT, 'revision-personas.html'), 'utf8'),
    readFile(path.join(ROOT, 'css/personas-review.css'), 'utf8'),
    readFile(path.join(ROOT, 'js/personas-review-data.js'), 'utf8'),
    readFile(path.join(ROOT, 'js/personas-review.js'), 'utf8'),
    readFile(path.join(ROOT, 'auditoria.html'), 'utf8'),
    readFile(path.join(ROOT, 'js/data-operations.js'), 'utf8'),
    readFile(path.join(ROOT, 'build/public-web-contract.mjs'), 'utf8'),
  ]);

  for (const id of [
    'personasSummaryTitle', 'summaryPending', 'summaryPostponed', 'summaryResolved', 'summaryAmbiguous',
    'documentConflictAlert', 'tabPending', 'tabPostponed', 'tabApproved', 'tabRejected', 'personasCase', 'grhEvidence',
    'personasEvidence', 'evidenceSummary', 'toggleDocuments', 'personasPreviousCase', 'personasNextCase',
    'personasDecisionDialog', 'personasReceipt', 'personasNext',
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));

  assert.match(html, /Nada se une automáticamente/i);
  assert.match(html, /modifica la ficha laboral de GRH/i);
  assert.match(html, /data-page-capability="navigation\.audit"/);
  assert.match(auditoria, /id="linkageReviewCta"[\s\S]*revision-personas\.html/);
  assert.match(dataOperations, /client\.loadSummary\(\)[\s\S]*permissions\.canDecide/);
  assert.match(webContract, /'revision-personas\.html'/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /@media \(max-width: 390px\)/);
  assert.doesNotMatch(dataScript, /\b(?:157|23|2349|1699|493)\b/);
  assert.doesNotMatch(`${dataScript}\n${uiScript}`, /(?:localStorage|sessionStorage)\s*\./);
  assert.match(dataScript, /X-MuniControl-Purpose['"]:\s*PURPOSE/);
  assert.match(dataScript, /X-Correlation-Id['"]:\s*createCommandId\(\)/);

  const scope = {
    window: {
      AbortController,
      URLSearchParams,
      crypto: { randomUUID: () => '11111111-1111-4111-8111-111111111111' },
    },
  };
  runInNewContext(dataScript, scope);
  const client = scope.window.MuniPersonasReviewData;
  assert.equal(client.validateSummary(baseContract()), true);
  assert.equal(client.validateQueue(queueContract('PENDING', summary())), true);
  assert.equal(client.validateDetail(detailContract('PENDING', summary())), true);
  assert.equal(client.validateDocuments(documentsContract('PENDING')), true);
  const leakedQueue = queueContract('PENDING', summary());
  leakedQueue.items[0].person = privatePerson(0);
  assert.equal(client.validateQueue(leakedQueue), false, 'summary/queue cannot carry nominal data');
  const rawIdentifier = detailContract('PENDING', summary());
  rawIdentifier.case.sourceId = 'legacy-id';
  assert.equal(client.validateDetail(rawIdentifier), false, 'detail rejects uncontracted source identifiers');
  const leakedDocuments = detailContract('PENDING', summary());
  leakedDocuments.case.options[0].person.documents = privatePerson(1).documents;
  assert.equal(client.validateDetail(leakedDocuments), false, 'initial detail rejects documents before explicit reveal');
  const mismatchedReveal = documentsContract('PENDING');
  mismatchedReveal.documents.options[0].optionKey = 'c'.repeat(64);
  mismatchedReveal.documents.options[1].optionKey = 'c'.repeat(64);
  assert.equal(client.validateDocuments(mismatchedReveal), false, 'document reveal rejects duplicate option identities');
});

test('private Intendente reviews one case, reveals documents only on request and records an approval receipt', async (t) => {
  const fixture = await createFixture();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => fixture.server.close(resolve));
  });
  const { context, page } = await openPage(browser, fixture);
  t.after(() => context.close());
  await waitReady(page);
  const desktopCaseTop = await page.locator('#personasCase').evaluate(node => node.getBoundingClientRect().top);
  assert.ok(desktopCaseTop <= 320, `desktop active case starts at ${desktopCaseTop}px, beyond the 320px operational target`);

  assert.match(await page.locator('#personasSummaryCopy').textContent(), /2\.349 casos privados[\s\S]*1\.699[\s\S]*157 ambiguos[\s\S]*493/i);
  assert.equal(await page.locator('#documentConflictCount').textContent(), '23');
  assert.match(await page.locator('#personasCaseReason').textContent(), /documentos informados son distintos/i);
  assert.equal(await page.locator('.personas-document-row:visible').count(), 0);
  assert.equal(await page.locator('.personas-document-evidence:visible').count(), 0);
  assert.equal((await page.content()).includes(privatePerson(0).documents.dni), false);
  assert.equal((await page.content()).includes(privatePerson(1).documents.cuil), false);
  assert.equal(fixture.requests.filter(request => /view=documents/.test(request.query)).length, 0);

  await page.locator('#toggleDocuments').click();
  await page.locator('.personas-document-row').first().waitFor({ state: 'visible' });
  assert.equal(await page.locator('.personas-document-row:visible').count(), 4);
  const revealed = await page.locator('#personasCase').innerText();
  assert.equal(revealed.includes(privatePerson(0).documents.dni), true);
  assert.equal(revealed.includes(privatePerson(1).documents.cuil), true);
  assert.match(revealed, /Coincide[\s\S]*Distinto/i);
  assert.match(revealed, /DNI \(si falta, obtenido del CUIL válido\)/i);
  const revealRequest = fixture.requests.find(request => /view=documents/.test(request.query));
  assert.equal(revealRequest.purpose, 'IDENTITY_DOCUMENT_REVEAL');
  assert.match(revealRequest.correlationId, /^[0-9a-f-]{36}$/i);
  assert.match(revealRequest.authorization, /^Bearer /);
  await page.locator('#personasNextOption').click();
  assert.equal(await page.locator('.personas-document-row:visible').count(), 0);
  assert.equal((await page.content()).includes(privatePerson(0).documents.dni), false);
  await page.locator('#personasPreviousOption').click();
  assert.equal(fixture.requests.filter(request => /view=documents/.test(request.query)).length, 1);
  await page.locator('#toggleDocuments').click();
  await page.locator('.personas-document-row').first().waitFor({ state: 'visible' });
  assert.equal(fixture.requests.filter(request => /view=documents/.test(request.query)).length, 2);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hiddenAgain = await page.content();
  assert.equal(hiddenAgain.includes(privatePerson(0).documents.dni), false);
  assert.equal(hiddenAgain.includes(privatePerson(1).documents.cuil), false);
  assert.equal(await page.locator('.personas-document-row:visible').count(), 0);
  await page.evaluate(() => { delete document.hidden; });
  await page.locator('#toggleDocuments').click();
  await page.locator('.personas-document-row').first().waitFor({ state: 'visible' });
  assert.equal(fixture.requests.filter(request => /view=documents/.test(request.query)).length, 3);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  assert.equal(await page.locator('.personas-document-row:visible').count(), 0);
  assert.equal((await page.content()).includes(privatePerson(0).documents.dni), false);

  await page.locator('[data-decision="approve"]').click();
  await page.locator('#personasDecisionDialog[open]').waitFor();
  assert.equal(await page.locator('#personasReasonField').isVisible(), true);
  assert.match(await page.locator('#personasDialogTitle').textContent(), /verificación manual/i);
  assert.match(await page.locator('#personasDialogCopy').textContent(), /documentos de GRH y PERSONAS son distintos[\s\S]*fuente municipal[\s\S]*misma persona/i);
  assert.match(await page.locator('#personasReasonLabel').textContent(), /Motivo obligatorio/i);
  assert.equal(await page.locator('#personasReason').inputValue(), 'MANUAL_SOURCE_CHECK_CONFIRMED');
  assert.equal(await page.locator('#personasReason option').count(), 1);
  assert.equal(await page.locator('#personasReason option[value="EVIDENCE_CONFIRMED"]').count(), 0);

  await page.locator('#personasReason').evaluate((select) => {
    const unsafe = document.createElement('option');
    unsafe.value = 'EVIDENCE_CONFIRMED';
    unsafe.textContent = 'Motivo genérico no permitido';
    select.appendChild(unsafe);
    select.value = unsafe.value;
  });
  await page.locator('#personasDecisionSubmit').click();
  assert.match(await page.locator('#personasFormError').textContent(), /comprobaste manualmente la fuente municipal/i);
  assert.equal(fixture.requests.filter(request => request.method === 'POST').length, 0);
  await page.locator('#personasReason').selectOption('MANUAL_SOURCE_CHECK_CONFIRMED');
  await page.locator('#personasDecisionSubmit').click();
  assert.match(await page.locator('#personasFormError').textContent(), /Confirmá que revisaste/i);
  await page.locator('#personasApprovalChecked').check();
  await page.locator('#personasDecisionSubmit').click();
  await page.locator('#personasReceipt:not([hidden])').waitFor();
  assert.match(await page.locator('#personasReceipt').innerText(), /Vínculo aprobado[\s\S]*no fue modificada/i);
  assert.equal(await page.locator('#personasCase').isHidden(), true);

  const detailRequest = fixture.requests.find(request => /view=detail/.test(request.query));
  assert.equal(detailRequest.purpose, 'IDENTITY_LINKAGE_REVIEW');
  assert.match(detailRequest.correlationId, /^[0-9a-f-]{36}$/i);
  const post = fixture.requests.find(request => request.method === 'POST');
  assert.equal(post.purpose, 'IDENTITY_LINKAGE_REVIEW');
  assert.match(post.correlationId, /^[0-9a-f-]{36}$/i);
  assert.match(post.authorization, /^Bearer /);
  assert.equal(post.contentType, 'application/json');
  assert.deepEqual(post.body, {
    commandId: post.body.commandId,
    caseKey: CASES.PENDING,
    expectedVersion: 1,
    decision: 'APPROVE',
    optionKey: OPTION_KEYS[0],
    reasonCode: 'MANUAL_SOURCE_CHECK_CONFIRMED',
  });
  assert.match(post.body.commandId, /^[0-9a-f-]{36}$/i);
});

test('approval without a document conflict keeps the generic evidence reason', async (t) => {
  const fixture = await createFixture();
  fixture.setPendingDocumentConflict(false);
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => fixture.server.close(resolve));
  });
  const { context, page } = await openPage(browser, fixture);
  t.after(() => context.close());
  await waitReady(page);

  assert.doesNotMatch(await page.locator('#personasCaseReason').textContent(), /documentos informados son distintos/i);
  await page.locator('[data-decision="approve"]').click();
  await page.locator('#personasDecisionDialog[open]').waitFor();
  assert.equal(await page.locator('#personasReasonField').isHidden(), true);
  assert.match(await page.locator('#personasDialogCopy').textContent(), /No cambia la ficha laboral/i);
  assert.equal(await page.locator('#personasReason').inputValue(), 'EVIDENCE_CONFIRMED');
  await page.locator('#personasApprovalChecked').check();
  await page.locator('#personasDecisionSubmit').click();
  await page.locator('#personasReceipt:not([hidden])').waitFor();

  const post = fixture.requests.find(request => request.method === 'POST');
  assert.equal(post.body.decision, 'APPROVE');
  assert.equal(post.body.reasonCode, 'EVIDENCE_CONFIRMED');
});

test('birth-date conflicts and conflict-marked options also require a manual source check', async (t) => {
  const fixture = await createFixture();
  fixture.setPendingDocumentConflict(false);
  fixture.setPendingBirthDateConflict(true);
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => fixture.server.close(resolve));
  });

  const birthConflict = await openPage(browser, fixture);
  t.after(() => birthConflict.context.close());
  await waitReady(birthConflict.page);
  await birthConflict.page.locator('[data-decision="approve"]').click();
  await birthConflict.page.locator('#personasDecisionDialog[open]').waitFor();
  assert.match(await birthConflict.page.locator('#personasDialogCopy').textContent(), /fechas de nacimiento informadas son distintas[\s\S]*verificá[\s\S]*fuente municipal/i);
  assert.equal(await birthConflict.page.locator('#personasReasonField').isVisible(), true);
  assert.equal(await birthConflict.page.locator('#personasReason').inputValue(), 'MANUAL_SOURCE_CHECK_CONFIRMED');
  await birthConflict.context.close();

  fixture.setPendingBirthDateConflict(false);
  fixture.setPendingOptionConflict(true);
  const optionConflict = await openPage(browser, fixture);
  t.after(() => optionConflict.context.close());
  await waitReady(optionConflict.page);
  await optionConflict.page.locator('[data-decision="approve"]').click();
  await optionConflict.page.locator('#personasDecisionDialog[open]').waitFor();
  assert.match(await optionConflict.page.locator('#personasDialogCopy').textContent(), /persona sugerida tiene señales en conflicto[\s\S]*verificá manualmente[\s\S]*fuente municipal/i);
  assert.equal(await optionConflict.page.locator('#personasReasonField').isVisible(), true);
  assert.equal(await optionConflict.page.locator('#personasReason').inputValue(), 'MANUAL_SOURCE_CHECK_CONFIRMED');
  assert.equal(fixture.requests.filter(request => request.method === 'POST').length, 0);
});

test('DNI-based suggestions without name or birth-date support require a manual source check', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  for (const matchMethod of ['UNIQUE_DNI_BACKUP', 'DUPLICATE_DNI_NAME']) {
    const fixture = await createFixture();
    fixture.setPendingDocumentConflict(false);
    fixture.setPendingDniEvidence(matchMethod, 'MISSING', 'MISSING');
    const { context, page } = await openPage(browser, fixture);
    try {
      await waitReady(page);
      await page.locator('[data-decision="approve"]').click();
      await page.locator('#personasDecisionDialog[open]').waitFor();
      assert.match(await page.locator('#personasDialogCopy').textContent(), /se apoya en el DNI[\s\S]*no coincide por nombre ni por fecha de nacimiento[\s\S]*comprobá la fuente municipal/i);
      assert.equal(await page.locator('#personasReasonField').isVisible(), true);
      assert.equal(await page.locator('#personasReason').inputValue(), 'MANUAL_SOURCE_CHECK_CONFIRMED');
      assert.equal(await page.locator('#personasReason option').count(), 1);
      assert.equal(await page.locator('#personasReason option[value="EVIDENCE_CONFIRMED"]').count(), 0);

      await page.locator('#personasReason').evaluate((select) => {
        const unsafe = document.createElement('option');
        unsafe.value = 'EVIDENCE_CONFIRMED';
        unsafe.textContent = 'Motivo genérico no permitido';
        select.appendChild(unsafe);
        select.value = unsafe.value;
      });
      await page.locator('#personasDecisionSubmit').click();
      assert.match(await page.locator('#personasFormError').textContent(), /comprobaste manualmente la fuente municipal/i);
      assert.equal(fixture.requests.filter(request => request.method === 'POST').length, 0);

      await page.locator('#personasReason').selectOption('MANUAL_SOURCE_CHECK_CONFIRMED');
      await page.locator('#personasApprovalChecked').check();
      await page.locator('#personasDecisionSubmit').click();
      await page.locator('#personasReceipt:not([hidden])').waitFor();
      const post = fixture.requests.find(request => request.method === 'POST');
      assert.equal(post.body.reasonCode, 'MANUAL_SOURCE_CHECK_CONFIRMED');
      assert.equal(post.body.optionKey, OPTION_KEYS[0]);
    } finally {
      await context.close();
      await new Promise((resolve) => fixture.server.close(resolve));
    }
  }
});

test('discard and postpone require an explicit human reason and never submit the default option', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const scenarios = [
    { kind: 'reject', expected: 'NO_MATCH_CONFIRMED', title: /por qué no corresponde/i },
    { kind: 'postpone', expected: 'SOURCE_DATA_REVIEW_REQUIRED', title: /qué falta verificar/i },
  ];
  for (const scenario of scenarios) {
    const fixture = await createFixture();
    const { context, page } = await openPage(browser, fixture);
    try {
      await waitReady(page);
      await page.locator(`[data-decision="${scenario.kind}"]`).click();
      await page.locator('#personasDecisionDialog[open]').waitFor();
      assert.match(await page.locator('#personasDialogTitle').textContent(), scenario.title);
      assert.equal(await page.locator('#personasReasonField').isVisible(), true);
      assert.equal(await page.locator('#personasReason').inputValue(), '');
      assert.equal(await page.locator('#personasReason option').count(), 3);
      await page.locator('#personasDecisionSubmit').click();
      assert.match(await page.locator('#personasFormError').textContent(), /Seleccioná un motivo/i);
      assert.equal(fixture.requests.filter(request => request.method === 'POST').length, 0);
      await page.locator('#personasReason').selectOption(scenario.expected);
      await page.locator('#personasDecisionSubmit').click();
      await page.locator('#personasReceipt:not([hidden])').waitFor();
      const post = fixture.requests.find(request => request.method === 'POST');
      assert.equal(post.body.reasonCode, scenario.expected);
    } finally {
      await context.close();
      await new Promise((resolve) => fixture.server.close(resolve));
    }
  }
});

test('read-only reviewer can inspect the queue while all mutation actions remain unavailable', async (t) => {
  const fixture = await createFixture();
  fixture.setCanDecide(false);
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => fixture.server.close(resolve));
  });
  const { context, page } = await openPage(browser, fixture);
  t.after(() => context.close());
  await waitReady(page);
  assert.equal(await page.locator('#personasCase').isVisible(), true);
  assert.equal(await page.locator('#personasCaseActions').isHidden(), true);
  assert.equal(await page.locator('#personasPreviousCase').isDisabled(), true);
  assert.equal(await page.locator('#personasNextCase').isEnabled(), true);
  await page.locator('#personasNextCase').click();
  await page.waitForFunction(() => document.getElementById('personasQueuePosition')?.textContent.includes('Caso 2'));
  assert.equal(await page.locator('#personasPreviousCase').isEnabled(), true);
  assert.equal(await page.locator('#personasNextCase').isDisabled(), true);
  assert.ok(fixture.requests.some(request => request.query.includes(`cursor=${CASES.PENDING}`)));
  assert.ok(fixture.requests.some(request => request.query.includes(`case=${SECOND_PENDING_CASE}`)));
  await page.locator('#personasPreviousCase').click();
  await page.waitForFunction(() => document.getElementById('personasQueuePosition')?.textContent.includes('Caso 1'));
  assert.equal(fixture.requests.filter(request => request.method === 'POST').length, 0);
});

test('tabs, 390/320 layouts, 44px controls and forced colors remain usable for private municipal accounts', async (t) => {
  const fixture = await createFixture();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => fixture.server.close(resolve));
  });

  for (const width of [390, 320]) {
    const opened = await openPage(browser, fixture, 'tenant-admin-private', { width, height: 844, theme: 'light' });
    t.after(() => opened.context.close());
    await waitReady(opened.page);
    const firstCaseTop = await opened.page.locator('#personasCase').evaluate(node => node.getBoundingClientRect().top);
    assert.ok(firstCaseTop <= 360, `the active case starts at ${firstCaseTop}px, beyond the 360px operational target at ${width}px`);
    assert.match(await opened.page.locator('#personasSourceContext').textContent(), /Datos al 6(?: de)? ago(?: de)? 2026 · respaldo histórico · no se actualiza en tiempo real/i);
    assert.ok(await opened.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1));
    const undersized = await opened.page.locator('#personasReview button:visible, #personasReview a:visible').evaluateAll((nodes) =>
      nodes.filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.height < 44 || rect.width < 44);
      }).map(node => ({ id: node.id, text: node.textContent.trim(), rect: node.getBoundingClientRect().toJSON() }))
    );
    assert.deepEqual(undersized, [], `all visible review controls meet 44px at ${width}px`);
    await opened.page.locator('#tabPostponed').click();
    await opened.page.locator('#personasCaseStatus').getByText('Postergada').waitFor();
    assert.equal(await opened.page.locator('#tabPostponed').getAttribute('aria-selected'), 'true');
    await opened.page.locator('#tabApproved').click();
    await opened.page.locator('#personasCaseStatus').getByText('Vínculo aprobado').waitFor();
    assert.equal(await opened.page.locator('#personasCaseActions').isHidden(), true);
    await opened.page.locator('#tabRejected').click();
    await opened.page.locator('#personasCaseStatus').getByText('Sugerencia descartada').waitFor();
    assert.equal(await opened.page.locator('#personasCaseActions').isHidden(), true);
  }

  const forced = await openPage(browser, fixture, 'intendente-private', { width: 390, height: 844 });
  t.after(() => forced.context.close());
  await forced.page.emulateMedia({ forcedColors: 'active' });
  await waitReady(forced.page);
  assert.equal(await forced.page.evaluate(() => matchMedia('(forced-colors: active)').matches), true);
  assert.ok(await forced.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1));
});

test('403, unverifiable detail and 409 decision fail closed without leaving private evidence visible', async (t) => {
  const fixture = await createFixture();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => fixture.server.close(resolve));
  });

  fixture.setReviewStatus(403);
  const forbidden = await openPage(browser, fixture);
  t.after(() => forbidden.context.close());
  await forbidden.page.locator('#personasError:not([hidden])').waitFor();
  assert.match(await forbidden.page.locator('#personasErrorTitle').textContent(), /no tiene acceso/i);
  assert.equal(await forbidden.page.locator('#personasContent').isHidden(), true);
  assert.equal((await forbidden.page.content()).includes(privatePerson(0).documents.dni), false);

  fixture.setReviewStatus(0);
  fixture.setDetailStatus(503);
  const unavailable = await openPage(browser, fixture);
  t.after(() => unavailable.context.close());
  await unavailable.page.locator('#personasError:not([hidden])').waitFor();
  assert.match(await unavailable.page.locator('#personasErrorMessage').textContent(), /No mostramos datos personales/i);
  assert.equal((await unavailable.page.content()).includes(privatePerson(0).documents.dni), false);

  fixture.setDetailStatus(0);
  fixture.setDecisionStatus(409);
  const stale = await openPage(browser, fixture);
  t.after(() => stale.context.close());
  await waitReady(stale.page);
  await stale.page.locator('[data-decision="approve"]').click();
  await stale.page.locator('#personasApprovalChecked').check();
  await stale.page.locator('#personasDecisionSubmit').click();
  await stale.page.locator('#personasError:not([hidden])').waitFor();
  assert.match(await stale.page.locator('#personasErrorTitle').textContent(), /cambió mientras lo revisabas/i);
  assert.equal(await stale.page.locator('#personasContent').isHidden(), true);
  assert.equal((await stale.page.content()).includes(privatePerson(0).documents.dni), false);

  fixture.setDecisionStatus(0);
  fixture.setReviewContractHeader('wrong-contract-v1');
  const drift = await openPage(browser, fixture);
  t.after(() => drift.context.close());
  await drift.page.locator('#personasError:not([hidden])').waitFor();
  assert.match(await drift.page.locator('#personasErrorMessage').textContent(), /No mostramos casos parciales/i);
  assert.equal(await drift.page.locator('#personasContent').isHidden(), true);
});
