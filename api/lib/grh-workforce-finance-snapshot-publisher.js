import { createHash, randomUUID } from 'node:crypto';
import {
  GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
  GRH_WORKFORCE_FINANCE_APPROVED_SOURCE,
  GRH_WORKFORCE_FINANCE_POLICY_VERSION,
  GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION,
  inspectGrhWorkforceFinanceSourceContract,
} from './grh-workforce-finance-source-contract.js';
import {
  createGrhWorkforceFinanceSnapshotEnvelope,
  decryptGrhWorkforceFinanceSnapshotEnvelope,
  GRH_WORKFORCE_FINANCE_SNAPSHOT_ACTION,
  GRH_WORKFORCE_FINANCE_SNAPSHOT_ENTITY,
} from './grh-workforce-finance-snapshot.js';

export const GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_ACTION =
  'GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISHED_V1';
export const GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_CONTRACT =
  'grh-workforce-finance-snapshot-publish-v1';
export const GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_DATABASE_ENV =
  'GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_DATABASE_URL';

const MAX_ARTIFACT_FILE_BYTES = 16 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TENANT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const RECEIPT_KEYS = Object.freeze([
  'artifactSha256',
  'envelopeSha256',
  'ciphertextSha256',
  'plaintextBytes',
  'compressedBytes',
  'periodCount',
  'dimensionViewCount',
  'dimensionPeriodCount',
  'cellCount',
]);
const EVENT_DETAIL_KEYS = Object.freeze([
  'contract',
  'operationId',
  'entityId',
  'sourceSchema',
  'sourceSha256',
  'snapshotAsOf',
  'releaseId',
  'policyVersion',
  'keyVersion',
  'compression',
  ...RECEIPT_KEYS,
]);

export const FIND_GRH_WORKFORCE_FINANCE_SNAPSHOT_OPERATION_SQL = `SELECT "entityId" AS entity_id,
       details
  FROM audit_logs
 WHERE "tenantId" = $1
   AND action = $2
   AND entity = $3
   AND ("entityId" = $4 OR details ->> 'operationId' = $5)
 ORDER BY "createdAt" DESC, id DESC
 FOR UPDATE`;

export const INSERT_GRH_WORKFORCE_FINANCE_SNAPSHOT_PAYLOAD_SQL = `INSERT INTO audit_logs
  (id, "tenantId", action, entity, "entityId", details, "createdAt")
VALUES ($1, $2, $3, $4, $5, $6::jsonb, clock_timestamp())`;

export const INSERT_GRH_WORKFORCE_FINANCE_SNAPSHOT_EVENT_SQL =
  INSERT_GRH_WORKFORCE_FINANCE_SNAPSHOT_PAYLOAD_SQL;

export const READ_BACK_GRH_WORKFORCE_FINANCE_SNAPSHOT_SQL = `SELECT details
  FROM audit_logs
 WHERE id = $1
   AND "tenantId" = $2
   AND action = $3
   AND entity = $4
   AND "entityId" = $5
 LIMIT 1`;

export const READ_ACTIVE_GRH_WORKFORCE_FINANCE_SNAPSHOT_SQL = `SELECT id,
       "entityId" AS entity_id,
       details
  FROM audit_logs
 WHERE "tenantId" = $1
   AND action = $2
   AND entity = $3
 ORDER BY "createdAt" DESC, id DESC
 LIMIT 1`;

const ADVISORY_LOCK_SQL = 'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))';

export class GrhWorkforceFinanceSnapshotPublisherError extends Error {
  constructor(code) {
    super('No se pudo publicar el snapshot workforce-finance.');
    this.name = 'GrhWorkforceFinanceSnapshotPublisherError';
    this.code = code;
  }
}

function publisherError(code) {
  return new GrhWorkforceFinanceSnapshotPublisherError(code);
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected) {
  if (!plainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index]);
}

function parseJsonObject(value, code) {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      throw publisherError(code);
    }
  }
  if (!plainObject(value)) throw publisherError(code);
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (plainObject(value)) {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function artifactBytes(artifact) {
  return Buffer.from(canonicalJson(artifact), 'utf8');
}

function validateInputs({
  tenantId,
  operationId,
  entityId,
  artifact,
  key,
  expectedSourceSha256,
  expectedSnapshotAsOf,
  expectedReleaseId,
  expectedPolicyVersion,
  client,
}) {
  let decodedKey = null;
  if (typeof key === 'string' && /^[A-Za-z0-9_-]+$/.test(key)) {
    decodedKey = Buffer.from(key, 'base64url');
  }
  if (typeof tenantId !== 'string' || !TENANT_PATTERN.test(tenantId) ||
      !UUID_PATTERN.test(operationId || '') || !UUID_PATTERN.test(entityId || '') ||
      !decodedKey || decodedKey.length !== 32 || decodedKey.toString('base64url') !== key ||
      !SHA256_PATTERN.test(expectedSourceSha256 || '') ||
      typeof expectedSnapshotAsOf !== 'string' || !DATE_PATTERN.test(expectedSnapshotAsOf) ||
      !SHA256_PATTERN.test(expectedReleaseId || '') ||
      expectedReleaseId !== GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID ||
      expectedPolicyVersion !== GRH_WORKFORCE_FINANCE_POLICY_VERSION ||
      typeof client?.query !== 'function') {
    throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_INPUT_INVALID');
  }
  if (!inspectGrhWorkforceFinanceSourceContract(artifact).ok) {
    throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_ARTIFACT_INVALID');
  }
  if (artifact.schema_version !== GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION ||
      artifact.source.canonical_system !==
        GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.canonicalSystem ||
      artifact.source.file !== GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.sourceFile ||
      artifact.source.compressed_size_bytes !==
        GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.compressedSizeBytes ||
      artifact.source.sha256 !== GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.sourceSha256 ||
      artifact.source.snapshot_as_of !== GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.snapshotAsOf ||
      artifact.release_id !== GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID ||
      artifact.source.sha256 !== expectedSourceSha256 ||
      artifact.source.snapshot_as_of !== expectedSnapshotAsOf ||
      artifact.release_id !== expectedReleaseId ||
      artifact.policy_version !== expectedPolicyVersion) {
    throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_PIN_MISMATCH');
  }
  const bytes = artifactBytes(artifact);
  if (bytes.length === 0 || bytes.length > MAX_ARTIFACT_FILE_BYTES) {
    throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_SIZE_INVALID');
  }
  return bytes;
}

function receiptFromEnvelope(envelope, artifactHash) {
  return {
    artifactSha256: artifactHash,
    envelopeSha256: sha256(Buffer.from(canonicalJson(envelope), 'utf8')),
    ciphertextSha256: sha256(Buffer.from(envelope.ciphertext, 'base64url')),
    plaintextBytes: envelope.plaintextBytes,
    compressedBytes: envelope.compressedBytes,
    periodCount: envelope.periodCount,
    dimensionViewCount: envelope.dimensionViewCount,
    dimensionPeriodCount: envelope.dimensionPeriodCount,
    cellCount: envelope.cellCount,
  };
}

function eventDetails({ operationId, entityId, envelope, receipt }) {
  return {
    contract: GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_CONTRACT,
    operationId,
    entityId,
    sourceSchema: envelope.sourceSchema,
    sourceSha256: envelope.sourceSha256,
    snapshotAsOf: envelope.snapshotAsOf,
    releaseId: envelope.releaseId,
    policyVersion: envelope.policyVersion,
    keyVersion: envelope.keyVersion,
    compression: envelope.compression,
    ...receipt,
  };
}

function validateStoredEvent(details, {
  operationId,
  entityId,
  artifactHash,
  expectedSourceSha256,
  expectedSnapshotAsOf,
  expectedReleaseId,
  expectedPolicyVersion,
}) {
  const event = parseJsonObject(
    details,
    'GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_EVENT_INVALID',
  );
  if (!exactKeys(event, EVENT_DETAIL_KEYS) ||
      event.contract !== GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_CONTRACT ||
      event.operationId !== operationId || event.entityId !== entityId ||
      event.sourceSchema !== GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION ||
      event.sourceSha256 !== expectedSourceSha256 ||
      event.snapshotAsOf !== expectedSnapshotAsOf ||
      event.releaseId !== expectedReleaseId ||
      event.policyVersion !== expectedPolicyVersion ||
      event.keyVersion !== 'v1' || event.compression !== 'gzip' ||
      event.artifactSha256 !== artifactHash ||
      !RECEIPT_KEYS.slice(0, 3).every(key => SHA256_PATTERN.test(event[key] || '')) ||
      !RECEIPT_KEYS.slice(3).every(key => Number.isSafeInteger(event[key]) && event[key] >= 0)) {
    throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_EVENT_INVALID');
  }
  return event;
}

async function acquireIdempotencyLocks(client, tenantId, operationId, entityId) {
  // This lock is the activation sequence for the tenant. It must be acquired
  // before operation/entity locks so concurrent releases cannot race the
  // latest-snapshot ordering contract.
  await client.query(ADVISORY_LOCK_SQL, [
    `workforce-finance-snapshot:active:${tenantId}`,
  ]);
  const identities = [
    `workforce-finance-snapshot:entity:${tenantId}:${entityId}`,
    `workforce-finance-snapshot:operation:${tenantId}:${operationId}`,
  ].sort();
  for (const identity of identities) {
    await client.query(ADVISORY_LOCK_SQL, [identity]);
  }
}

function verifyStoredEnvelope({
  details,
  tenantId,
  key,
  expectedSourceSha256,
  expectedSnapshotAsOf,
  expectedReleaseId,
  expectedPolicyVersion,
  artifactHash,
}) {
  const envelope = parseJsonObject(
    details,
    'GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_READBACK_INVALID',
  );
  const decrypted = decryptGrhWorkforceFinanceSnapshotEnvelope({
    tenantId,
    envelope,
    key,
    expectedSourceSha256,
    expectedSnapshotAsOf,
    expectedReleaseId,
    expectedPolicyVersion,
  });
  if (!inspectGrhWorkforceFinanceSourceContract(decrypted).ok ||
      sha256(artifactBytes(decrypted)) !== artifactHash) {
    throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_READBACK_INVALID');
  }
  return envelope;
}

async function readAndVerifyPayload({
  client,
  query,
  values,
  tenantId,
  key,
  expectedSourceSha256,
  expectedSnapshotAsOf,
  expectedReleaseId,
  expectedPolicyVersion,
  artifactHash,
}) {
  const result = await client.query(query, values);
  if (!result || !Array.isArray(result.rows) || result.rows.length !== 1 ||
      !exactKeys(result.rows[0], ['details'])) {
    throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_READBACK_INVALID');
  }
  return verifyStoredEnvelope({
    details: result.rows[0].details,
    tenantId,
    key,
    expectedSourceSha256,
    expectedSnapshotAsOf,
    expectedReleaseId,
    expectedPolicyVersion,
    artifactHash,
  });
}

async function readAndVerifyActivePayload({
  client,
  tenantId,
  entityId,
  expectedPayloadLogId = null,
  key,
  expectedSourceSha256,
  expectedSnapshotAsOf,
  expectedReleaseId,
  expectedPolicyVersion,
  artifactHash,
}) {
  const result = await client.query(READ_ACTIVE_GRH_WORKFORCE_FINANCE_SNAPSHOT_SQL, [
    tenantId,
    GRH_WORKFORCE_FINANCE_SNAPSHOT_ACTION,
    GRH_WORKFORCE_FINANCE_SNAPSHOT_ENTITY,
  ]);
  if (!result || !Array.isArray(result.rows) || result.rows.length !== 1 ||
      !exactKeys(result.rows[0], ['id', 'entity_id', 'details'])) {
    throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_ACTIVE_INVALID');
  }
  const row = result.rows[0];
  if (row.entity_id !== entityId ||
      (expectedPayloadLogId !== null && row.id !== expectedPayloadLogId)) {
    throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_NOT_ACTIVE');
  }
  return verifyStoredEnvelope({
    details: row.details,
    tenantId,
    key,
    expectedSourceSha256,
    expectedSnapshotAsOf,
    expectedReleaseId,
    expectedPolicyVersion,
    artifactHash,
  });
}

export async function publishGrhWorkforceFinanceSnapshot({
  tenantId,
  operationId,
  entityId,
  artifact,
  key,
  expectedSourceSha256,
  expectedSnapshotAsOf,
  expectedReleaseId,
  expectedPolicyVersion,
  client,
  nonce,
  randomUuidImpl = randomUUID,
} = {}) {
  const raw = validateInputs({
    tenantId,
    operationId,
    entityId,
    artifact,
    key,
    expectedSourceSha256,
    expectedSnapshotAsOf,
    expectedReleaseId,
    expectedPolicyVersion,
    client,
  });
  const artifactHash = sha256(raw);
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    await acquireIdempotencyLocks(client, tenantId, operationId, entityId);
    const existing = await client.query(FIND_GRH_WORKFORCE_FINANCE_SNAPSHOT_OPERATION_SQL, [
      tenantId,
      GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_ACTION,
      GRH_WORKFORCE_FINANCE_SNAPSHOT_ENTITY,
      entityId,
      operationId,
    ]);
    if (!existing || !Array.isArray(existing.rows) || existing.rows.length > 1) {
      throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_IDEMPOTENCY_INVALID');
    }
    if (existing.rows.length === 1) {
      const row = existing.rows[0];
      if (!exactKeys(row, ['entity_id', 'details']) || row.entity_id !== entityId) {
        throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_IDEMPOTENCY_CONFLICT');
      }
      const preliminaryEvent = parseJsonObject(
        row.details,
        'GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_EVENT_INVALID',
      );
      if (preliminaryEvent.operationId !== operationId || preliminaryEvent.entityId !== entityId) {
        throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_IDEMPOTENCY_CONFLICT');
      }
      const storedEvent = validateStoredEvent(row.details, {
        operationId,
        entityId,
        artifactHash,
        expectedSourceSha256,
        expectedSnapshotAsOf,
        expectedReleaseId,
        expectedPolicyVersion,
      });
      const envelope = await readAndVerifyActivePayload({
        client,
        tenantId,
        entityId,
        key,
        expectedSourceSha256,
        expectedSnapshotAsOf,
        expectedReleaseId,
        expectedPolicyVersion,
        artifactHash,
      });
      const receipt = receiptFromEnvelope(envelope, artifactHash);
      if (!RECEIPT_KEYS.every(receiptKey => receipt[receiptKey] === storedEvent[receiptKey])) {
        throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_IDEMPOTENCY_INVALID');
      }
      await client.query('COMMIT');
      transactionOpen = false;
      return Object.freeze({ ...receipt, createdCount: 0, reusedCount: 1 });
    }

    const envelope = createGrhWorkforceFinanceSnapshotEnvelope({
      tenantId,
      artifact,
      key,
      nonce,
      expectedSourceSha256,
      expectedSnapshotAsOf,
      expectedReleaseId,
      expectedPolicyVersion,
    });
    const receipt = receiptFromEnvelope(envelope, artifactHash);
    const details = eventDetails({ operationId, entityId, envelope, receipt });
    const payloadLogId = randomUuidImpl();
    const eventLogId = randomUuidImpl();
    if (!UUID_PATTERN.test(payloadLogId || '') || !UUID_PATTERN.test(eventLogId || '') ||
        payloadLogId === eventLogId) {
      throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_ID_INVALID');
    }
    await client.query(INSERT_GRH_WORKFORCE_FINANCE_SNAPSHOT_PAYLOAD_SQL, [
      payloadLogId,
      tenantId,
      GRH_WORKFORCE_FINANCE_SNAPSHOT_ACTION,
      GRH_WORKFORCE_FINANCE_SNAPSHOT_ENTITY,
      entityId,
      JSON.stringify(envelope),
    ]);
    await client.query(INSERT_GRH_WORKFORCE_FINANCE_SNAPSHOT_EVENT_SQL, [
      eventLogId,
      tenantId,
      GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_ACTION,
      GRH_WORKFORCE_FINANCE_SNAPSHOT_ENTITY,
      entityId,
      JSON.stringify(details),
    ]);
    const readBackEnvelope = await readAndVerifyPayload({
      client,
      query: READ_BACK_GRH_WORKFORCE_FINANCE_SNAPSHOT_SQL,
      values: [
        payloadLogId,
        tenantId,
        GRH_WORKFORCE_FINANCE_SNAPSHOT_ACTION,
        GRH_WORKFORCE_FINANCE_SNAPSHOT_ENTITY,
        entityId,
      ],
      tenantId,
      key,
      expectedSourceSha256,
      expectedSnapshotAsOf,
      expectedReleaseId,
      expectedPolicyVersion,
      artifactHash,
    });
    const readBackReceipt = receiptFromEnvelope(readBackEnvelope, artifactHash);
    if (!RECEIPT_KEYS.every(receiptKey => readBackReceipt[receiptKey] === receipt[receiptKey])) {
      throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_READBACK_INVALID');
    }
    const activeEnvelope = await readAndVerifyActivePayload({
      client,
      tenantId,
      entityId,
      expectedPayloadLogId: payloadLogId,
      key,
      expectedSourceSha256,
      expectedSnapshotAsOf,
      expectedReleaseId,
      expectedPolicyVersion,
      artifactHash,
    });
    const activeReceipt = receiptFromEnvelope(activeEnvelope, artifactHash);
    if (!RECEIPT_KEYS.every(receiptKey => activeReceipt[receiptKey] === receipt[receiptKey])) {
      throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_ACTIVE_INVALID');
    }
    await client.query('COMMIT');
    transactionOpen = false;
    return Object.freeze({ ...receipt, createdCount: 1, reusedCount: 0 });
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // The original fail-closed error is more useful and never includes payload material.
      }
    }
    if (error instanceof GrhWorkforceFinanceSnapshotPublisherError ||
        error?.name === 'GrhWorkforceFinanceSnapshotError') {
      throw error;
    }
    throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_DATABASE_ERROR');
  }
}
