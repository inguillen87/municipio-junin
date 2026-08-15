import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GRH_PERSONAS_REVIEW_EVIDENCE_POLICY_VERSION,
  GRH_PERSONAS_REVIEW_DOCUMENT_REVEAL_PURPOSE,
  createGrhPersonasReviewRunDigest,
  parseGrhPersonasReviewContext,
  parseGrhPersonasReviewDecisionBody,
  parseGrhPersonasReviewDocumentRevealContext,
  parseGrhPersonasReviewQuery,
  requiresManualSourceConfirmationForDniReviewOption,
} from '../api/lib/grh-personas-review-contract.js';

const commandId = '11111111-1111-4111-8111-111111111111';
const caseKey = 'a'.repeat(64);
const optionKey = 'b'.repeat(64);

test('review contract requires evidence policy v2 while preserving schema v1', () => {
  assert.equal(GRH_PERSONAS_REVIEW_EVIDENCE_POLICY_VERSION, 'grh-personas-review-evidence-v2');
});

test('GET query contract is exact for summary, queue, opaque detail and document reveal', () => {
  assert.deepEqual(parseGrhPersonasReviewQuery({}), { view: 'summary' });
  assert.deepEqual(parseGrhPersonasReviewQuery({ view: 'queue' }), {
    view: 'queue', status: 'PENDING', kind: null, limit: 25, cursor: null,
  });
  assert.deepEqual(parseGrhPersonasReviewQuery({
    view: 'queue', status: 'DEFERRED', kind: 'AMBIGUOUS', limit: '50', cursor: caseKey,
  }), { view: 'queue', status: 'DEFERRED', kind: 'AMBIGUOUS', limit: 50, cursor: caseKey });
  assert.deepEqual(parseGrhPersonasReviewQuery({ view: 'detail', case: caseKey }), { view: 'detail', caseKey });
  assert.deepEqual(parseGrhPersonasReviewQuery({ view: 'documents', case: caseKey }), { view: 'documents', caseKey });
  for (const query of [
    { view: 'summary', q: 'name' }, { view: 'detail', case: 'raw-id' },
    { view: 'documents', case: caseKey, reveal: 'true' },
    { view: 'queue', limit: '51' }, { view: 'queue', cursor: ['x'] },
  ]) assert.equal(parseGrhPersonasReviewQuery(query), null);
});

test('decision body enforces UUIDv4, optimistic version and command-specific reason/option', () => {
  const approve = { commandId, caseKey, expectedVersion: 1, decision: 'APPROVE', optionKey, reasonCode: 'EVIDENCE_CONFIRMED' };
  assert.deepEqual(parseGrhPersonasReviewDecisionBody(approve), approve);
  assert.ok(parseGrhPersonasReviewDecisionBody({
    ...approve, reasonCode: 'MANUAL_SOURCE_CHECK_CONFIRMED',
  }));
  assert.equal(parseGrhPersonasReviewDecisionBody({ ...approve, optionKey: null }), null);
  assert.equal(parseGrhPersonasReviewDecisionBody({ ...approve, commandId: '11111111-1111-5111-8111-111111111111' }), null);
  assert.equal(parseGrhPersonasReviewDecisionBody({ ...approve, reasonCode: 'NO_MATCH_CONFIRMED' }), null);
  assert.ok(parseGrhPersonasReviewDecisionBody({ ...approve, decision: 'DEFER', optionKey: null, reasonCode: 'INSUFFICIENT_EVIDENCE' }));
  assert.ok(parseGrhPersonasReviewDecisionBody({ ...approve, decision: 'REJECT', optionKey: null, reasonCode: 'DIFFERENT_PERSON' }));
});

test('DNI-only evidence contract requires independent name or birth-date support', () => {
  const base = {
    matchMethod: 'UNIQUE_DNI_BACKUP', cuilEvidence: 'MISSING', dniEvidence: 'MATCH',
    nameEvidence: 'MISSING', birthDateEvidence: 'MISSING',
  };
  assert.equal(requiresManualSourceConfirmationForDniReviewOption(base), true);
  assert.equal(requiresManualSourceConfirmationForDniReviewOption({
    ...base, matchMethod: 'DUPLICATE_DNI_NAME', nameEvidence: 'DIFFERENT',
  }), true);
  assert.equal(requiresManualSourceConfirmationForDniReviewOption({
    ...base, matchMethod: 'DOCUMENT_CANDIDATE',
  }), true);
  assert.equal(requiresManualSourceConfirmationForDniReviewOption({
    ...base, nameEvidence: 'MATCH',
  }), false);
  assert.equal(requiresManualSourceConfirmationForDniReviewOption({
    ...base, birthDateEvidence: 'MATCH',
  }), false);
  assert.equal(requiresManualSourceConfirmationForDniReviewOption({
    ...base, matchMethod: 'DOCUMENT_CANDIDATE', cuilEvidence: 'MATCH',
  }), false);
  assert.throws(() => requiresManualSourceConfirmationForDniReviewOption({
    ...base, nameEvidence: 'UNKNOWN',
  }), TypeError);
});

test('nominal and document-reveal contexts have distinct exact purposes and require UUIDv4', () => {
  assert.deepEqual(parseGrhPersonasReviewContext({
    'x-municontrol-purpose': 'IDENTITY_LINKAGE_REVIEW',
    'x-correlation-id': commandId,
  }), { purpose: 'IDENTITY_LINKAGE_REVIEW', correlationId: commandId });
  assert.equal(parseGrhPersonasReviewContext({
    'x-municontrol-purpose': 'PERSON_LOOKUP', 'x-correlation-id': commandId,
  }), null);
  assert.equal(parseGrhPersonasReviewContext({
    'x-municontrol-purpose': 'IDENTITY_LINKAGE_REVIEW', 'x-correlation-id': 'contains-person-name',
  }), null);
  assert.equal(GRH_PERSONAS_REVIEW_DOCUMENT_REVEAL_PURPOSE, 'IDENTITY_DOCUMENT_REVEAL');
  assert.deepEqual(parseGrhPersonasReviewDocumentRevealContext({
    'x-municontrol-purpose': 'IDENTITY_DOCUMENT_REVEAL',
    'x-correlation-id': commandId,
  }), { purpose: 'IDENTITY_DOCUMENT_REVEAL', correlationId: commandId });
  assert.equal(parseGrhPersonasReviewDocumentRevealContext({
    'x-municontrol-purpose': 'IDENTITY_LINKAGE_REVIEW',
    'x-correlation-id': commandId,
  }), null);
  assert.equal(parseGrhPersonasReviewContext({
    'x-municontrol-purpose': 'IDENTITY_DOCUMENT_REVEAL',
    'x-correlation-id': commandId,
  }), null);
  assert.equal(parseGrhPersonasReviewDocumentRevealContext({
    'x-municontrol-purpose': 'IDENTITY_DOCUMENT_REVEAL',
    'x-correlation-id': '11111111-1111-5111-8111-111111111111',
  }), null);
  assert.equal(parseGrhPersonasReviewDocumentRevealContext({
    'x-municontrol-purpose': 'IDENTITY_DOCUMENT_REVEAL',
    'X-MuniControl-Purpose': 'IDENTITY_DOCUMENT_REVEAL',
    'x-correlation-id': commandId,
  }), null);
});

test('run digest is source-, count- and semantic-content-bound', () => {
  const input = {
    tenantId: 'tenant-junin',
    semanticDigest: 'c'.repeat(64),
    counts: {
      totalCaseCount: 2349, totalOptionCount: 2185, candidateCaseCount: 1699,
      ambiguousCaseCount: 157, unmatchedCaseCount: 493, documentConflictCount: 23,
      autoApprovedCount: 0,
    },
  };
  const baseline = createGrhPersonasReviewRunDigest(input);
  assert.match(baseline, /^[a-f0-9]{64}$/);
  assert.notEqual(createGrhPersonasReviewRunDigest({ ...input, semanticDigest: 'd'.repeat(64) }), baseline);
  assert.notEqual(createGrhPersonasReviewRunDigest({
    ...input,
    counts: { ...input.counts, documentConflictCount: 24 },
  }), baseline);
});
