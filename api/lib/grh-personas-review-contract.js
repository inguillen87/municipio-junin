import { createHash } from 'node:crypto';

export const GRH_PERSONAS_REVIEW_SCHEMA_VERSION = 'grh-personas-review-v1';
export const GRH_PERSONAS_REVIEW_DECISION_SCHEMA_VERSION = 'grh-personas-review-decision-v1';
export const GRH_PERSONAS_REVIEW_RUN_SCHEMA_VERSION = 'grh-personas-review-run-v1';
export const GRH_PERSONAS_REVIEW_MATCHER_VERSION = 'grh-personas-linkage-matcher-v1';
export const GRH_PERSONAS_REVIEW_EVIDENCE_POLICY_VERSION = 'grh-personas-review-evidence-v2';
export const GRH_PERSONAS_REVIEW_SNAPSHOT_AS_OF = '2026-08-06';
export const GRH_PERSONAS_REVIEW_GRH_SHA256 = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';
export const GRH_PERSONAS_REVIEW_PERSONAS_SHA256 = '11bf15764488e4fe8a053255f503404f6bca24a1ac47c90647649e2c41d8e39c';
export const GRH_PERSONAS_REVIEW_PURPOSE = 'IDENTITY_LINKAGE_REVIEW';
export const GRH_PERSONAS_REVIEW_DOCUMENT_REVEAL_PURPOSE = 'IDENTITY_DOCUMENT_REVEAL';
export const GRH_PERSONAS_REVIEW_RUN_UUID_NAMESPACE = '3d4bb1eb-8509-5f52-a0b3-5a7d05414d60';

export const GRH_PERSONAS_REVIEW_CURRENT_COUNTS = Object.freeze({
  totalCases: 2349,
  totalOptions: 2185,
  candidate: 1699,
  ambiguous: 157,
  unmatched: 493,
  documentConflicts: 23,
  autoApproved: 0,
});

export const GRH_PERSONAS_REVIEW_KINDS = Object.freeze(['CANDIDATE', 'AMBIGUOUS', 'UNMATCHED']);
export const GRH_PERSONAS_REVIEW_STATUSES = Object.freeze(['PENDING', 'DEFERRED', 'APPROVED', 'REJECTED']);
export const GRH_PERSONAS_REVIEW_PRIORITIES = Object.freeze(['DOCUMENT_CONFLICT', 'MANUAL_REVIEW', 'STANDARD']);
export const GRH_PERSONAS_REVIEW_MATCH_METHODS = Object.freeze([
  'UNIQUE_VALID_CUIL',
  'UNIQUE_DNI_BACKUP',
  'DUPLICATE_VALID_CUIL_NAME',
  'DUPLICATE_DNI_NAME',
  'DOCUMENT_CANDIDATE',
  'NAME_BIRTHDATE_SIGNAL',
  'NAME_ONLY_SIGNAL',
]);
export const GRH_PERSONAS_REVIEW_DNI_ONLY_MATCH_METHODS = Object.freeze([
  'UNIQUE_DNI_BACKUP',
  'DUPLICATE_DNI_NAME',
]);
export const GRH_PERSONAS_REVIEW_EVIDENCE_LEVELS = Object.freeze(['STRONG', 'ASSISTED', 'CONFLICT', 'INSUFFICIENT']);
export const GRH_PERSONAS_REVIEW_DOCUMENT_EVIDENCE = Object.freeze(['MATCH', 'CONFLICT', 'MISSING']);
export const GRH_PERSONAS_REVIEW_NAME_EVIDENCE = Object.freeze(['MATCH', 'DIFFERENT', 'MISSING']);
export const GRH_PERSONAS_REVIEW_DECISIONS = Object.freeze(['APPROVE', 'DEFER', 'REJECT']);
export const GRH_PERSONAS_REVIEW_DOCUMENT_CONFLICT_APPROVAL_REASON =
  'MANUAL_SOURCE_CHECK_CONFIRMED';
export const GRH_PERSONAS_REVIEW_REASON_CODES = Object.freeze([
  'EVIDENCE_CONFIRMED',
  'MANUAL_SOURCE_CHECK_CONFIRMED',
  'INSUFFICIENT_EVIDENCE',
  'SOURCE_DATA_REVIEW_REQUIRED',
  'DIFFERENT_PERSON',
  'NO_MATCH_CONFIRMED',
]);

const HEX_64 = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const QUERY_KEYS = new Set(['view', 'status', 'kind', 'limit', 'cursor', 'case']);
const BODY_KEYS = Object.freeze(['caseKey', 'commandId', 'decision', 'expectedVersion', 'optionKey', 'reasonCode']);

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value, expected) {
  if (!plainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

export function requiresManualSourceConfirmationForDniReviewOption(option) {
  if (!exactKeys(option, [
    'birthDateEvidence', 'cuilEvidence', 'dniEvidence', 'matchMethod', 'nameEvidence',
  ]) || !GRH_PERSONAS_REVIEW_MATCH_METHODS.includes(option.matchMethod) ||
      !GRH_PERSONAS_REVIEW_DOCUMENT_EVIDENCE.includes(option.cuilEvidence) ||
      !GRH_PERSONAS_REVIEW_DOCUMENT_EVIDENCE.includes(option.dniEvidence) ||
      !GRH_PERSONAS_REVIEW_NAME_EVIDENCE.includes(option.nameEvidence) ||
      !GRH_PERSONAS_REVIEW_DOCUMENT_EVIDENCE.includes(option.birthDateEvidence)) {
    throw new TypeError('Invalid review option evidence');
  }
  const dniOnlySupport = GRH_PERSONAS_REVIEW_DNI_ONLY_MATCH_METHODS.includes(option.matchMethod) ||
    (option.dniEvidence === 'MATCH' && option.cuilEvidence !== 'MATCH');
  const lacksIndependentSupport = option.nameEvidence !== 'MATCH' &&
    option.birthDateEvidence !== 'MATCH';
  return dniOnlySupport && lacksIndependentSupport;
}

function scalar(value) {
  return typeof value === 'string' ? value : null;
}

function exactPositiveInteger(value, fallback = null) {
  const text = scalar(value);
  if (text === null || !/^[1-9][0-9]*$/u.test(text)) return fallback;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

export function parseGrhPersonasReviewQuery(query = {}) {
  if (!plainObject(query) || Reflect.ownKeys(query).some(key => typeof key !== 'string' || !QUERY_KEYS.has(key))) {
    return null;
  }
  if (Object.values(query).some(value => typeof value !== 'string')) return null;
  const view = query.view || 'summary';
  if (!['summary', 'queue', 'detail', 'documents'].includes(view)) return null;

  if (view === 'summary') {
    return Object.keys(query).every(key => key === 'view') ? Object.freeze({ view }) : null;
  }
  if (view === 'detail' || view === 'documents') {
    if (!exactKeys(query, ['view', 'case']) || !HEX_64.test(query.case)) return null;
    return Object.freeze({ view, caseKey: query.case });
  }

  const allowedQueueKeys = new Set(['view', 'status', 'kind', 'limit', 'cursor']);
  if (Object.keys(query).some(key => !allowedQueueKeys.has(key))) return null;
  const status = query.status || 'PENDING';
  const kind = query.kind || null;
  const limit = query.limit === undefined ? 25 : exactPositiveInteger(query.limit);
  const cursor = query.cursor || null;
  if (!GRH_PERSONAS_REVIEW_STATUSES.includes(status) ||
      (kind !== null && !GRH_PERSONAS_REVIEW_KINDS.includes(kind)) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 50 ||
      (cursor !== null && !HEX_64.test(cursor))) return null;
  return Object.freeze({ view, status, kind, limit, cursor });
}

function parseContextForPurpose(headers, expectedPurpose) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return null;
  if ((Object.hasOwn(headers, 'x-municontrol-purpose') && Object.hasOwn(headers, 'X-MuniControl-Purpose')) ||
      (Object.hasOwn(headers, 'x-correlation-id') && Object.hasOwn(headers, 'X-Correlation-Id'))) return null;
  const purpose = headers['x-municontrol-purpose'] ?? headers['X-MuniControl-Purpose'];
  const correlationId = headers['x-correlation-id'] ?? headers['X-Correlation-Id'];
  if (purpose !== expectedPurpose || typeof correlationId !== 'string' ||
      !UUID_V4.test(correlationId)) return null;
  return Object.freeze({ purpose, correlationId });
}

export function parseGrhPersonasReviewContext(headers = {}) {
  return parseContextForPurpose(headers, GRH_PERSONAS_REVIEW_PURPOSE);
}

export function parseGrhPersonasReviewDocumentRevealContext(headers = {}) {
  return parseContextForPurpose(headers, GRH_PERSONAS_REVIEW_DOCUMENT_REVEAL_PURPOSE);
}

export function parseGrhPersonasReviewDecisionBody(body) {
  if (!exactKeys(body, BODY_KEYS) || !UUID_V4.test(body.commandId || '') ||
      !HEX_64.test(body.caseKey || '') || !Number.isSafeInteger(body.expectedVersion) ||
      body.expectedVersion < 1 || !GRH_PERSONAS_REVIEW_DECISIONS.includes(body.decision) ||
      !GRH_PERSONAS_REVIEW_REASON_CODES.includes(body.reasonCode)) return null;
  const optionKey = body.optionKey;
  const rules = {
    APPROVE: optionKey !== null && HEX_64.test(optionKey || '') &&
      ['EVIDENCE_CONFIRMED', 'MANUAL_SOURCE_CHECK_CONFIRMED'].includes(body.reasonCode),
    DEFER: optionKey === null &&
      ['INSUFFICIENT_EVIDENCE', 'SOURCE_DATA_REVIEW_REQUIRED'].includes(body.reasonCode),
    REJECT: optionKey === null &&
      ['DIFFERENT_PERSON', 'NO_MATCH_CONFIRMED'].includes(body.reasonCode),
  };
  if (!rules[body.decision]) return null;
  return Object.freeze({
    commandId: body.commandId.toLowerCase(),
    caseKey: body.caseKey,
    expectedVersion: body.expectedVersion,
    decision: body.decision,
    optionKey,
    reasonCode: body.reasonCode,
  });
}

function canonicalize(value, stack = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError('Non-canonical number');
    return JSON.stringify(value);
  }
  if (!plainObject(value) || stack.has(value)) throw new TypeError('Non-canonical value');
  stack.add(value);
  try {
    return `{${Object.keys(value).sort().map(key => {
      if (value[key] === undefined) throw new TypeError('Undefined canonical value');
      return `${JSON.stringify(key)}:${canonicalize(value[key], stack)}`;
    }).join(',')}}`;
  } finally {
    stack.delete(value);
  }
}

export function canonicalGrhPersonasReviewJson(value) {
  return canonicalize(value);
}

export function createGrhPersonasReviewRunDigest({
  tenantId,
  snapshotAsOf = GRH_PERSONAS_REVIEW_SNAPSHOT_AS_OF,
  grhSourceSha256 = GRH_PERSONAS_REVIEW_GRH_SHA256,
  personasSourceSha256 = GRH_PERSONAS_REVIEW_PERSONAS_SHA256,
  matcherVersion = GRH_PERSONAS_REVIEW_MATCHER_VERSION,
  evidencePolicyVersion = GRH_PERSONAS_REVIEW_EVIDENCE_POLICY_VERSION,
  semanticDigest,
  counts,
} = {}) {
  if (typeof tenantId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(tenantId) ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(snapshotAsOf || '') || !HEX_64.test(grhSourceSha256 || '') ||
      !HEX_64.test(personasSourceSha256 || '') || typeof matcherVersion !== 'string' ||
      typeof evidencePolicyVersion !== 'string' || !HEX_64.test(semanticDigest || '') ||
      !plainObject(counts)) throw new TypeError('Invalid review run identity');
  const normalizedCounts = {
    ambiguousCaseCount: counts.ambiguousCaseCount,
    autoApprovedCount: counts.autoApprovedCount,
    candidateCaseCount: counts.candidateCaseCount,
    documentConflictCount: counts.documentConflictCount,
    totalCaseCount: counts.totalCaseCount,
    totalOptionCount: counts.totalOptionCount,
    unmatchedCaseCount: counts.unmatchedCaseCount,
  };
  if (Object.values(normalizedCounts).some(value => !Number.isSafeInteger(value) || value < 0) ||
      normalizedCounts.candidateCaseCount + normalizedCounts.ambiguousCaseCount +
        normalizedCounts.unmatchedCaseCount !== normalizedCounts.totalCaseCount ||
      normalizedCounts.documentConflictCount > normalizedCounts.totalCaseCount ||
      normalizedCounts.autoApprovedCount !== 0) {
    throw new TypeError('Invalid review run counts');
  }
  return createHash('sha256').update(canonicalGrhPersonasReviewJson({
    ...normalizedCounts,
    evidencePolicyVersion,
    grhSourceSha256,
    matcherVersion,
    personasSourceSha256,
    schemaVersion: GRH_PERSONAS_REVIEW_RUN_SCHEMA_VERSION,
    semanticDigest,
    snapshotAsOf,
    tenantId,
  }), 'utf8').digest('hex');
}

export function parseGrhPersonasReviewAllowlist(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ids = value.split(',').map(item => item.trim());
  if (ids.some(id => !/^[A-Za-z0-9_-]{1,128}$/u.test(id)) || new Set(ids).size !== ids.length) return null;
  return new Set(ids);
}

export function isOpaqueReviewKey(value) {
  return typeof value === 'string' && HEX_64.test(value);
}

export function isReviewUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

export function isReviewUuidV4(value) {
  return typeof value === 'string' && UUID_V4.test(value);
}
