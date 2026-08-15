import assert from 'node:assert/strict';
import test from 'node:test';

import { createGrhPersonasReviewHandler } from '../api/grh-personas-review.js';
import { createGrhPersonasReviewDecisionHandler } from '../api/grh-personas-review-decision.js';
import { sealGrhPersonasReviewEvidence } from '../api/lib/grh-personas-review-crypto.js';

const tenantId = 'tenant-junin';
const runId = '11111111-1111-4111-8111-111111111111';
const correlationId = '22222222-2222-4222-8222-222222222222';
const caseKey = 'a'.repeat(64);
const optionKey = 'b'.repeat(64);
const environment = {
  GRH_TENANT_ID: tenantId,
  GRH_DIRECTORY_ALLOWED_USER_IDS: 'official-1',
  GRH_PERSONAS_REVIEW_READ_ALLOWED_USER_IDS: 'official-1',
  GRH_PERSONAS_REVIEW_DECISION_ALLOWED_USER_IDS: 'official-1',
  GRH_PERSONAS_REVIEW_EVIDENCE_KEY_V1: Buffer.alloc(32, 7).toString('base64url'),
};

function response() {
  return {
    headers: {}, statusCode: 0, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function source() {
  return {
    snapshotAsOf: '2026-08-06',
    grhSourceSha256: 'c'.repeat(64), personasSourceSha256: 'd'.repeat(64),
    matcherVersion: 'grh-personas-linkage-matcher-v1',
    evidencePolicyVersion: 'grh-personas-review-evidence-v2',
  };
}

function summary() {
  return {
    totalCases: 2349, totalOptions: 2185,
    byKind: { candidate: 1699, ambiguous: 157, unmatched: 493 },
    byStatus: { pending: 2349, deferred: 0, approved: 0, rejected: 0 },
    documentConflicts: 23, autoApproved: 0,
  };
}

function caller(role = 'INTENDENTE', overrides = {}) {
  return { id: 'official-1', tenantId, role, email: 'official@junin.gob.ar', authMethod: 'jwt-db', ...overrides };
}

function caseEnvelope() {
  return sealGrhPersonasReviewEvidence({
    tenantId, runId, recordType: 'case', stableKey: caseKey, environment,
    evidence: {
      schemaVersion: 'grh-personas-review-case-evidence-v1',
      person: { displayName: 'PERSONA GRH PRUEBA', birthDate: '1988-08-08', documents: { cuil: '20999999999', dni: '99999999' } },
    },
  });
}

function optionEnvelope() {
  return sealGrhPersonasReviewEvidence({
    tenantId, runId, recordType: 'option', stableKey: optionKey, environment,
    evidence: {
      schemaVersion: 'grh-personas-review-option-evidence-v1',
      person: { displayName: 'PERSONA AUXILIAR PRUEBA', birthDate: '1988-08-08', documents: { cuil: '20999999999', dni: '99999999' } },
    },
  });
}

test('summary and queue remain non-nominal and expose the truthful 2349-case universe', async () => {
  const handler = createGrhPersonasReviewHandler({
    requireCapabilityImpl: async () => caller(),
    requireDatasetTenantImpl: () => true,
    environment,
    storeImpl: {
      summary: async () => ({ runId, source: source(), summary: summary() }),
      queue: async () => ({
        runId, source: source(), summary: summary(), page: { limit: 25, nextCursor: null },
        items: [{
          caseKey, kind: 'AMBIGUOUS', status: 'PENDING', priority: 'DOCUMENT_CONFLICT',
          version: 1, optionCount: 2,
          flags: { documentConflict: true, birthDateConflict: false, nameSupport: true },
        }],
      }),
    },
  });
  const summaryRes = response();
  await handler({ method: 'GET', query: {}, headers: {} }, summaryRes);
  assert.equal(summaryRes.statusCode, 200);
  assert.deepEqual(summaryRes.payload.summary, summary());
  assert.equal(JSON.stringify(summaryRes.payload).includes('PERSONA GRH PRUEBA'), false);
  const queueRes = response();
  await handler({ method: 'GET', query: { view: 'queue' }, headers: {} }, queueRes);
  assert.equal(queueRes.statusCode, 200);
  assert.equal(JSON.stringify(queueRes.payload).includes('displayName'), false);
  assert.equal(queueRes.payload.permissions.canDecide, true);
  assert.equal(queueRes.headers['Cache-Control'], 'no-store, private, max-age=0');
});

test('detail commits a minimal audit before decrypting and never serializes DNI or CUIL', async () => {
  const calls = [];
  const reviewCase = {
    caseKey, kind: 'AMBIGUOUS', status: 'PENDING', priority: 'DOCUMENT_CONFLICT',
    version: 1, optionCount: 1,
    flags: { documentConflict: true, birthDateConflict: false, nameSupport: true },
    decision: null,
    options: [{
      optionKey, rank: 1, matchMethod: 'DOCUMENT_CANDIDATE', evidenceLevel: 'CONFLICT',
      evidence: { cuil: 'CONFLICT', dni: 'MATCH', name: 'MATCH', birthDate: 'MATCH' },
      requiresManualCheck: true,
      get evidenceEnvelope() { calls.push('decrypt-option'); return optionEnvelope(); },
    }],
  };
  Object.defineProperty(reviewCase, 'evidenceEnvelope', {
    enumerable: true,
    get() { calls.push('decrypt-case'); return caseEnvelope(); },
  });
  const handler = createGrhPersonasReviewHandler({
    requireCapabilityImpl: async () => caller(), requireDatasetTenantImpl: () => true, environment,
    storeImpl: {
      detail: async () => ({
        runId, source: source(), summary: summary(),
        case: reviewCase,
      }),
      recordDetailRead: async input => { calls.push('audit-committed'); calls.push(input); return true; },
    },
  });
  const res = response();
  await handler({
    method: 'GET', query: { view: 'detail', case: caseKey },
    headers: { 'x-municontrol-purpose': 'IDENTITY_LINKAGE_REVIEW', 'x-correlation-id': correlationId },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls[0], 'audit-committed');
  assert.equal(calls[2], 'decrypt-case');
  assert.equal(calls[3], 'decrypt-option');
  assert.equal(calls[1].optionCount, 1);
  assert.equal(res.payload.case.optionCount, undefined);
  assert.equal(res.payload.documentsRevealed, false);
  assert.equal(Object.hasOwn(res.payload.case.person, 'documents'), false);
  assert.equal(Object.hasOwn(res.payload.case.options[0].person, 'documents'), false);
  assert.equal(res.payload.case.options[0].person.displayName, 'PERSONA AUXILIAR PRUEBA');
  assert.equal(JSON.stringify(res.payload).includes('20999999999'), false);
  assert.equal(JSON.stringify(res.payload).includes('99999999'), false);
  assert.equal(JSON.stringify(res.payload).includes('evidenceEnvelope'), false);
});

test('document reveal uses a distinct purpose, commits audit first and returns only keyed documents', async () => {
  const calls = [];
  const reviewCase = {
    caseKey, optionCount: 1,
    options: [{
      optionKey,
      get evidenceEnvelope() { calls.push('decrypt-option'); return optionEnvelope(); },
    }],
  };
  Object.defineProperty(reviewCase, 'evidenceEnvelope', {
    enumerable: true,
    get() { calls.push('decrypt-case'); return caseEnvelope(); },
  });
  let auditInput = null;
  const handler = createGrhPersonasReviewHandler({
    requireCapabilityImpl: async () => caller(), requireDatasetTenantImpl: () => true, environment,
    storeImpl: {
      detail: async () => ({ runId, source: source(), summary: summary(), case: reviewCase }),
      recordDocumentReveal: async input => {
        auditInput = input;
        calls.push('audit-committed');
        return true;
      },
    },
  });
  const res = response();
  await handler({
    method: 'GET', query: { view: 'documents', case: caseKey },
    headers: { 'x-municontrol-purpose': 'IDENTITY_DOCUMENT_REVEAL', 'x-correlation-id': correlationId },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, ['audit-committed', 'decrypt-case', 'decrypt-option']);
  assert.equal(auditInput.purpose, 'IDENTITY_DOCUMENT_REVEAL');
  assert.equal(auditInput.correlationId, correlationId);
  assert.equal(res.payload.documentsRevealed, true);
  assert.deepEqual(res.payload.documents, {
    case: { caseKey, documents: { cuil: '20999999999', dni: '99999999' } },
    options: [{ optionKey, documents: { cuil: '20999999999', dni: '99999999' } }],
  });
  assert.equal(res.payload.permissions.canRead, true);
  assert.equal(res.payload.source.snapshotAsOf, '2026-08-06');
  assert.equal(JSON.stringify(res.payload).includes('displayName'), false);
  assert.equal(JSON.stringify(res.payload).includes('birthDate'), false);
  assert.equal(JSON.stringify(res.payload).includes('evidenceEnvelope'), false);
  assert.equal(res.headers['Cache-Control'], 'no-store, private, max-age=0');
});

test('detail and document reveal fail closed for cross-purpose context or uncommitted audit', async () => {
  let detailCalls = 0;
  const storeImpl = {
    detail: async () => { detailCalls += 1; return {
      runId, source: source(), summary: summary(),
      case: { caseKey, optionCount: 0, evidenceEnvelope: caseEnvelope(), options: [] },
    }; },
    recordDetailRead: async () => { const error = new Error(); error.code = 'GRH_PERSONAS_REVIEW_AUDIT_UNAVAILABLE'; throw error; },
    recordDocumentReveal: async () => false,
  };
  const handler = createGrhPersonasReviewHandler({
    requireCapabilityImpl: async () => caller(), requireDatasetTenantImpl: () => true, environment, storeImpl,
  });
  const invalid = response();
  await handler({ method: 'GET', query: { view: 'detail', case: caseKey }, headers: {} }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(detailCalls, 0);
  const failedAudit = response();
  await handler({
    method: 'GET', query: { view: 'detail', case: caseKey },
    headers: { 'x-municontrol-purpose': 'IDENTITY_LINKAGE_REVIEW', 'x-correlation-id': correlationId },
  }, failedAudit);
  assert.equal(failedAudit.statusCode, 503);
  assert.equal(failedAudit.payload.code, 'GRH_PERSONAS_REVIEW_UNAVAILABLE');

  const readsBeforeWrongPurpose = detailCalls;
  const wrongPurpose = response();
  await handler({
    method: 'GET', query: { view: 'documents', case: caseKey },
    headers: { 'x-municontrol-purpose': 'IDENTITY_LINKAGE_REVIEW', 'x-correlation-id': correlationId },
  }, wrongPurpose);
  assert.equal(wrongPurpose.statusCode, 400);
  assert.equal(wrongPurpose.payload.code, 'GRH_PERSONAS_REVIEW_DOCUMENT_REVEAL_CONTEXT_INVALID');
  assert.equal(detailCalls, readsBeforeWrongPurpose);

  const failedReveal = response();
  await handler({
    method: 'GET', query: { view: 'documents', case: caseKey },
    headers: { 'x-municontrol-purpose': 'IDENTITY_DOCUMENT_REVEAL', 'x-correlation-id': correlationId },
  }, failedReveal);
  assert.equal(failedReveal.statusCode, 503);
  assert.equal(JSON.stringify(failedReveal.payload).includes('20999999999'), false);
});

test('private guard denies published, non-allowlisted, tenantless superadmin and contador', async () => {
  for (const deniedCaller of [
    caller('CONTADOR'), caller('SUPER_ADMIN', { tenantId: null }),
    caller('INTENDENTE', { id: 'not-allowed' }),
    caller('INTENDENTE', { email: '' }),
    caller('INTENDENTE', { authMethod: 'published-evaluation-jwt-db' }),
  ]) {
    let calls = 0;
    const handler = createGrhPersonasReviewHandler({
      requireCapabilityImpl: async () => deniedCaller, requireDatasetTenantImpl: () => true, environment,
      storeImpl: { summary: async () => { calls += 1; } },
    });
    const res = response();
    await handler({ method: 'GET', query: {}, headers: {} }, res);
    assert.equal(res.statusCode, 403, deniedCaller.role);
    assert.equal(calls, 0);
  }
});

test('read and decision allowlists stay separated and the legacy directory list grants nothing', async () => {
  const splitEnvironment = {
    ...environment,
    GRH_DIRECTORY_ALLOWED_USER_IDS: 'directory-only',
    GRH_PERSONAS_REVIEW_READ_ALLOWED_USER_IDS: 'reader-1',
    GRH_PERSONAS_REVIEW_DECISION_ALLOWED_USER_IDS: 'decider-1',
  };
  let summaryCalls = 0;
  const storeImpl = {
    summary: async () => {
      summaryCalls += 1;
      return { runId, source: source(), summary: summary() };
    },
  };
  const readerHandler = createGrhPersonasReviewHandler({
    requireCapabilityImpl: async () => caller('INTENDENTE', { id: 'reader-1' }),
    requireDatasetTenantImpl: () => true,
    environment: splitEnvironment,
    storeImpl,
  });
  const reader = response();
  await readerHandler({ method: 'GET', query: {}, headers: {} }, reader);
  assert.equal(reader.statusCode, 200);
  assert.deepEqual(reader.payload.permissions, { canRead: true, canDecide: false });

  for (const id of ['decider-1', 'directory-only']) {
    const handler = createGrhPersonasReviewHandler({
      requireCapabilityImpl: async () => caller('INTENDENTE', { id }),
      requireDatasetTenantImpl: () => true,
      environment: splitEnvironment,
      storeImpl,
    });
    const res = response();
    await handler({ method: 'GET', query: {}, headers: {} }, res);
    assert.equal(res.statusCode, 403, id);
  }
  assert.equal(summaryCalls, 1);

  for (const id of ['reader-1', 'decider-1', 'directory-only']) {
    let decideCalls = 0;
    const handler = createGrhPersonasReviewDecisionHandler({
      requireCapabilityImpl: async () => caller('INTENDENTE', { id }),
      requireDatasetTenantImpl: () => true,
      environment: splitEnvironment,
      storeImpl: { decide: async () => { decideCalls += 1; } },
    });
    const res = response();
    await handler({ method: 'POST', query: {}, url: '/api/grh-personas-review-decision', body: {}, headers: {} }, res);
    assert.equal(res.statusCode, 403, id);
    assert.equal(decideCalls, 0, id);
  }

  const dualEnvironment = {
    ...splitEnvironment,
    GRH_PERSONAS_REVIEW_READ_ALLOWED_USER_IDS: 'reviewer-1',
    GRH_PERSONAS_REVIEW_DECISION_ALLOWED_USER_IDS: 'reviewer-1',
  };
  let dualCalls = 0;
  const dualHandler = createGrhPersonasReviewDecisionHandler({
    requireCapabilityImpl: async () => caller('INTENDENTE', { id: 'reviewer-1' }),
    requireDatasetTenantImpl: () => true,
    environment: dualEnvironment,
    storeImpl: { decide: async () => { dualCalls += 1; } },
  });
  const dual = response();
  await dualHandler({
    method: 'POST', query: {}, url: '/api/grh-personas-review-decision', body: {}, headers: {},
  }, dual);
  assert.equal(dual.statusCode, 400);
  assert.equal(dualCalls, 0);
});

test('decision requires private capability plus purpose/correlation and preserves exact response', async () => {
  let input = null;
  const handler = createGrhPersonasReviewDecisionHandler({
    requireCapabilityImpl: async () => caller('TENANT_ADMIN'), requireDatasetTenantImpl: () => true,
    environment,
    storeImpl: { decide: async value => { input = value; return {
      replayed: false,
      decision: { caseKey, status: 'APPROVED', version: 2, selectedOptionKey: optionKey,
        reasonCode: 'EVIDENCE_CONFIRMED', decidedAt: '2026-08-13T12:00:00.000Z' },
    }; } },
  });
  const body = { commandId: correlationId, caseKey, expectedVersion: 1, decision: 'APPROVE', optionKey, reasonCode: 'EVIDENCE_CONFIRMED' };
  const noContext = response();
  await handler({ method: 'POST', query: {}, url: '/api/grh-personas-review-decision', body, headers: {} }, noContext);
  assert.equal(noContext.statusCode, 400);
  assert.equal(input, null);
  const res = response();
  await handler({
    method: 'POST', query: {}, url: '/api/grh-personas-review-decision', body,
    headers: { 'x-municontrol-purpose': 'IDENTITY_LINKAGE_REVIEW', 'x-correlation-id': correlationId },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(input.purpose, 'IDENTITY_LINKAGE_REVIEW');
  assert.equal(res.payload.schemaVersion, 'grh-personas-review-decision-v1');
  assert.equal(res.payload.status, 'recorded');
  assert.equal(res.headers['X-MuniControl-Contract'], 'grh-personas-review-decision-v1');
});

test('decision returns 400 when a document-conflict case uses the ordinary evidence reason', async () => {
  const handler = createGrhPersonasReviewDecisionHandler({
    requireCapabilityImpl: async () => caller('INTENDENTE'),
    requireDatasetTenantImpl: () => true,
    environment,
    storeImpl: {
      decide: async () => {
        const error = new Error('document-conflict reason rejected');
        error.code = 'GRH_PERSONAS_REVIEW_INPUT_INVALID';
        throw error;
      },
    },
  });
  const res = response();
  await handler({
    method: 'POST', query: {}, url: '/api/grh-personas-review-decision',
    body: {
      commandId: correlationId, caseKey, expectedVersion: 1, decision: 'APPROVE', optionKey,
      reasonCode: 'EVIDENCE_CONFIRMED',
    },
    headers: {
      'x-municontrol-purpose': 'IDENTITY_LINKAGE_REVIEW',
      'x-correlation-id': correlationId,
    },
  }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.code, 'GRH_PERSONAS_REVIEW_INPUT_INVALID');
});

test('decision returns a non-nominal 400 when DNI-only evidence lacks corroboration', async () => {
  let calls = 0;
  const handler = createGrhPersonasReviewDecisionHandler({
    requireCapabilityImpl: async () => caller('INTENDENTE'),
    requireDatasetTenantImpl: () => true,
    environment,
    storeImpl: {
      decide: async () => {
        calls += 1;
        const error = new Error('DNI-only evidence requires manual source confirmation');
        error.code = 'GRH_PERSONAS_REVIEW_INPUT_INVALID';
        throw error;
      },
    },
  });
  const res = response();
  await handler({
    method: 'POST', query: {}, url: '/api/grh-personas-review-decision',
    body: {
      commandId: correlationId, caseKey, expectedVersion: 1, decision: 'APPROVE', optionKey,
      reasonCode: 'EVIDENCE_CONFIRMED',
    },
    headers: {
      'x-municontrol-purpose': 'IDENTITY_LINKAGE_REVIEW',
      'x-correlation-id': correlationId,
    },
  }, res);
  assert.equal(calls, 1);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, {
    error: 'La decision no cumple el contrato.',
    code: 'GRH_PERSONAS_REVIEW_INPUT_INVALID',
  });
  assert.equal(JSON.stringify(res.payload).includes('DNI-only'), false);
});
