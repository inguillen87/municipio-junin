import { createHash, createHmac, randomUUID } from 'node:crypto';

const AUDIT_SCHEMA_VERSION = 'security-audit-event-v1';
const DIRECTORY_PERMISSION = 'grh.directory:read';
const GENESIS_HASH = '0'.repeat(64);

const PURPOSES = Object.freeze({
  DIRECTORY_BROWSE: 'DIRECTORY_BROWSE',
  PERSON_LOOKUP: 'PERSON_LOOKUP',
  LEAVE_REVIEW: 'LEAVE_REVIEW',
});

const OPERATIONS = Object.freeze({
  LIST: 'list',
  DETAIL: 'detail',
});

const OUTCOMES = Object.freeze({
  ALLOWED: 'ALLOWED',
  DENIED: 'DENIED',
});

const AUTHORIZATION_MODES = Object.freeze({
  DISABLED: 'disabled',
  SHADOW: 'shadow',
  INTERSECT: 'intersect',
});

const SCOPE_KINDS = Object.freeze({
  NONE: 'NONE',
  TENANT: 'TENANT',
  ORG_UNIT: 'ORG_UNIT',
  ORG_SUBTREE: 'ORG_SUBTREE',
  MIXED: 'MIXED',
});

const RESULT_CODES = Object.freeze({
  COMMITTED: 'AUDIT_EVENT_COMMITTED',
  INPUT_INVALID: 'AUDIT_INPUT_INVALID',
  ADAPTER_INVALID: 'AUDIT_ADAPTER_INVALID',
  CHAIN_DRIFT: 'AUDIT_CHAIN_DRIFT',
  WRITE_FAILED: 'AUDIT_WRITE_FAILED',
});

const INPUT_KEYS = Object.freeze([
  'tenantId',
  'principalHash',
  'purpose',
  'operation',
  'correlationId',
  'authorizationMode',
  'authorizationReason',
  'outcome',
  'policyVersion',
  'assignmentIds',
  'scopeIds',
  'scopeKind',
  'organizationCount',
  'resultCount',
]);
const DEPENDENCY_KEYS = new Set(['queryAdapter', 'clock', 'idFactory']);
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const CORRELATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$/;
const REASON_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

class AuditChainDriftError extends Error {
  constructor() {
    super('Audit chain state is invalid');
    this.name = 'AuditChainDriftError';
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function hasExactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function normalizedInstant(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value !== 'string' || value.length < 20 || value.length > 40) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toISOString();
}

function canonicalize(value, stack) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError('Non-canonical number');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new TypeError('Unsupported canonical value');
  if (stack.has(value)) throw new TypeError('Cyclic canonical value');

  stack.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map(item => canonicalize(item, stack)).join(',')}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Unsupported canonical object');
    }
    return `{${Object.keys(value).sort().map(key => {
      const item = value[key];
      if (item === undefined) throw new TypeError('Undefined canonical value');
      return `${JSON.stringify(key)}:${canonicalize(item, stack)}`;
    }).join(',')}}`;
  } finally {
    stack.delete(value);
  }
}

export function canonicalSecurityAuditJson(value) {
  return canonicalize(value, new Set());
}

export function hashSecurityAuditEvent(value) {
  return createHash('sha256').update(canonicalSecurityAuditJson(value), 'utf8').digest('hex');
}

export function createAuditPrincipalHash({ secret, tenantId, userId } = {}) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32 ||
      typeof tenantId !== 'string' || !IDENTIFIER_PATTERN.test(tenantId) ||
      typeof userId !== 'string' || !IDENTIFIER_PATTERN.test(userId)) {
    throw new TypeError('Invalid audit principal hash input');
  }
  return createHmac('sha256', secret)
    .update(`principal-v1\u0000${tenantId}\u0000${userId}`, 'utf8')
    .digest('hex');
}

function validateInput(input) {
  if (!hasExactKeys(input, INPUT_KEYS)) return false;
  if (typeof input.tenantId !== 'string' || !IDENTIFIER_PATTERN.test(input.tenantId)) return false;
  if (typeof input.principalHash !== 'string' || !HASH_PATTERN.test(input.principalHash)) return false;
  if (!Object.values(PURPOSES).includes(input.purpose) ||
      !Object.values(OPERATIONS).includes(input.operation) ||
      !Object.values(OUTCOMES).includes(input.outcome) ||
      !Object.values(AUTHORIZATION_MODES).includes(input.authorizationMode) ||
      !Object.values(SCOPE_KINDS).includes(input.scopeKind)) return false;
  if (typeof input.correlationId !== 'string' || !CORRELATION_PATTERN.test(input.correlationId) ||
      typeof input.authorizationReason !== 'string' || !REASON_PATTERN.test(input.authorizationReason)) {
    return false;
  }
  if (input.policyVersion !== null &&
      (typeof input.policyVersion !== 'string' || !IDENTIFIER_PATTERN.test(input.policyVersion))) return false;
  if (!validateIdentifierArray(input.assignmentIds) || !validateIdentifierArray(input.scopeIds)) return false;
  if (input.assignmentIds.length > 0 && input.policyVersion === null) return false;
  if (!Number.isSafeInteger(input.organizationCount) || input.organizationCount < 0 ||
      input.organizationCount > 1_000_000 || !Number.isSafeInteger(input.resultCount) ||
      input.resultCount < 0 || input.resultCount > 1_000_000) return false;
  if ([SCOPE_KINDS.NONE, SCOPE_KINDS.TENANT].includes(input.scopeKind) &&
      input.organizationCount !== 0) return false;
  if ([SCOPE_KINDS.ORG_UNIT, SCOPE_KINDS.ORG_SUBTREE, SCOPE_KINDS.MIXED].includes(input.scopeKind) &&
      input.organizationCount === 0) return false;
  if (input.scopeKind === SCOPE_KINDS.NONE && input.scopeIds.length !== 0) return false;
  if (input.operation === OPERATIONS.DETAIL && input.resultCount > 1) return false;
  if (input.outcome === OUTCOMES.DENIED && input.resultCount !== 0) return false;
  if (input.authorizationMode === AUTHORIZATION_MODES.INTERSECT &&
      input.outcome === OUTCOMES.ALLOWED &&
      (input.policyVersion === null || input.assignmentIds.length === 0 || input.scopeIds.length === 0)) {
    return false;
  }
  return true;
}

function validateIdentifierArray(value) {
  return Array.isArray(value) && value.length <= 64 &&
    value.every(item => typeof item === 'string' && IDENTIFIER_PATTERN.test(item)) &&
    new Set(value).size === value.length;
}

function validateDependencies(dependencies) {
  if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies) ||
      Object.keys(dependencies).some(key => !DEPENDENCY_KEYS.has(key))) return false;
  if (!dependencies.queryAdapter || typeof dependencies.queryAdapter.connect !== 'function') return false;
  if (dependencies.clock !== undefined && typeof dependencies.clock !== 'function') return false;
  if (dependencies.idFactory !== undefined && typeof dependencies.idFactory !== 'function') return false;
  return true;
}

function failure(code) {
  return deepFreeze({
    ok: false,
    failClosed: true,
    code,
  });
}

function chainPartitionFor(tenantId, occurredAt) {
  return `grh-directory/${tenantId}/${occurredAt.slice(0, 7)}`;
}

function advisoryLockKeys(chainPartition) {
  const digest = createHash('sha256').update(chainPartition, 'utf8').digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)];
}

function previousChainState(result) {
  if (!result || !Array.isArray(result.rows) || result.rows.length > 1) {
    throw new AuditChainDriftError();
  }
  if (result.rows.length === 0) return { chainSequence: 1, previousHash: GENESIS_HASH };

  const row = result.rows[0];
  if (!hasExactKeys(row, ['chain_sequence', 'event_hash'])) throw new AuditChainDriftError();
  const chainSequence = typeof row.chain_sequence === 'string'
    ? Number(row.chain_sequence)
    : row.chain_sequence;
  if (!Number.isSafeInteger(chainSequence) || chainSequence < 1 ||
      chainSequence >= Number.MAX_SAFE_INTEGER ||
      typeof row.event_hash !== 'string' || !HASH_PATTERN.test(row.event_hash)) {
    throw new AuditChainDriftError();
  }
  return { chainSequence: chainSequence + 1, previousHash: row.event_hash };
}

function buildEvent(input, { eventId, occurredAt, chainPartition, chainSequence, previousHash }) {
  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    eventId,
    chainPartition,
    chainSequence,
    previousHash,
    tenantId: input.tenantId,
    principalHash: input.principalHash,
    permission: DIRECTORY_PERMISSION,
    purpose: input.purpose,
    operation: input.operation,
    outcome: input.outcome,
    authorizationMode: input.authorizationMode,
    authorizationReason: input.authorizationReason,
    policyVersion: input.policyVersion,
    assignmentIds: [...input.assignmentIds].sort(),
    scopeIds: [...input.scopeIds].sort(),
    scopeKind: input.scopeKind,
    organizationCount: input.organizationCount,
    resultCount: input.resultCount,
    correlationId: input.correlationId,
    occurredAt,
  };
}

async function rollbackQuietly(client) {
  try {
    await client.query('ROLLBACK');
  } catch {
    // The caller still receives a generic fail-closed result. Payloads and DB errors are never logged.
  }
}

async function releaseQuietly(client) {
  try {
    await client.release();
  } catch {
    // A committed append remains committed even if returning the pooled connection fails.
  }
}

/**
 * Appends one sanitized, hash-chained audit event.
 *
 * Signature:
 *   appendSecurityAuditEvent(input, { queryAdapter, clock?, idFactory? })
 *
 * queryAdapter.connect() must return a dedicated client exposing query(sql, params) and release().
 */
export async function appendSecurityAuditEvent(input = {}, dependencies = {}) {
  try {
    if (!validateInput(input)) return failure(RESULT_CODES.INPUT_INVALID);
  } catch {
    return failure(RESULT_CODES.INPUT_INVALID);
  }
  try {
    if (!validateDependencies(dependencies)) return failure(RESULT_CODES.ADAPTER_INVALID);
  } catch {
    return failure(RESULT_CODES.ADAPTER_INVALID);
  }

  const clock = dependencies.clock || (() => new Date());
  const idFactory = dependencies.idFactory || randomUUID;
  let occurredAt;
  let eventId;
  try {
    occurredAt = normalizedInstant(clock());
    eventId = idFactory();
  } catch {
    return failure(RESULT_CODES.INPUT_INVALID);
  }
  if (!occurredAt || typeof eventId !== 'string' || !UUID_PATTERN.test(eventId)) {
    return failure(RESULT_CODES.INPUT_INVALID);
  }

  let client;
  let transactionStarted = false;
  try {
    client = await dependencies.queryAdapter.connect();
    if (!client || typeof client.query !== 'function' || typeof client.release !== 'function') {
      return failure(RESULT_CODES.ADAPTER_INVALID);
    }

    await client.query('BEGIN');
    transactionStarted = true;

    const chainPartition = chainPartitionFor(input.tenantId, occurredAt);
    const lockKeys = advisoryLockKeys(chainPartition);
    await client.query(
      'SELECT pg_advisory_xact_lock($1::integer, $2::integer)',
      lockKeys,
    );
    const previousResult = await client.query(
      `SELECT chain_sequence, event_hash
         FROM security_audit_events
        WHERE chain_partition = $1
        ORDER BY chain_sequence DESC
        LIMIT 1
        FOR UPDATE`,
      [chainPartition],
    );
    const { chainSequence, previousHash } = previousChainState(previousResult);
    const event = buildEvent(input, {
      eventId,
      occurredAt,
      chainPartition,
      chainSequence,
      previousHash,
    });
    const eventHash = hashSecurityAuditEvent(event);

    const insertResult = await client.query(
      `INSERT INTO security_audit_events (
         event_id, chain_partition, chain_sequence, previous_hash, event_hash,
         schema_version, tenant_id, principal_hash, permission, purpose, operation,
         outcome, authorization_mode, authorization_reason, policy_version,
         assignment_ids, scope_ids, scope_kind, organization_count, result_count,
         correlation_id, occurred_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10, $11,
         $12, $13, $14, $15,
         $16, $17, $18, $19, $20,
         $21, $22
       )`,
      [
        event.eventId,
        event.chainPartition,
        event.chainSequence,
        event.previousHash,
        eventHash,
        event.schemaVersion,
        event.tenantId,
        event.principalHash,
        event.permission,
        event.purpose,
        event.operation,
        event.outcome,
        event.authorizationMode,
        event.authorizationReason,
        event.policyVersion,
        event.assignmentIds,
        event.scopeIds,
        event.scopeKind,
        event.organizationCount,
        event.resultCount,
        event.correlationId,
        event.occurredAt,
      ],
    );
    if (!insertResult || insertResult.rowCount !== 1) throw new Error('Audit append not acknowledged');

    await client.query('COMMIT');
    transactionStarted = false;
    return deepFreeze({
      ok: true,
      failClosed: false,
      code: RESULT_CODES.COMMITTED,
      eventId,
      eventHash,
      previousHash,
      chainPartition,
      chainSequence,
      correlationId: input.correlationId,
      occurredAt,
    });
  } catch (error) {
    if (client && transactionStarted) await rollbackQuietly(client);
    return failure(error instanceof AuditChainDriftError
      ? RESULT_CODES.CHAIN_DRIFT
      : RESULT_CODES.WRITE_FAILED);
  } finally {
    if (client && typeof client.release === 'function') await releaseQuietly(client);
  }
}

export function requireCommittedSecurityAudit(result) {
  if (result?.ok === true && result?.failClosed === false &&
      result?.code === RESULT_CODES.COMMITTED) return result;
  const error = new Error('Security audit append is required');
  error.code = 'SECURITY_AUDIT_REQUIRED';
  error.status = 503;
  throw error;
}

export {
  AUDIT_SCHEMA_VERSION as SECURITY_AUDIT_SCHEMA_VERSION,
  AUTHORIZATION_MODES as SECURITY_AUDIT_AUTHORIZATION_MODES,
  GENESIS_HASH as SECURITY_AUDIT_GENESIS_HASH,
  INPUT_KEYS as SECURITY_AUDIT_INPUT_KEYS,
  OPERATIONS as SECURITY_AUDIT_OPERATIONS,
  OUTCOMES as SECURITY_AUDIT_OUTCOMES,
  PURPOSES as SECURITY_AUDIT_PURPOSES,
  RESULT_CODES as SECURITY_AUDIT_RESULT_CODES,
  SCOPE_KINDS as SECURITY_AUDIT_SCOPE_KINDS,
};
