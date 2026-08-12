import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

import {
  GRH_DIRECTORY_SCHEMA_VERSION,
  inspectGrhDirectoryArtifact,
} from './grh-directory-contract.js';

export const GRH_DIRECTORY_SNAPSHOT_ACTION = 'GRH_DIRECTORY_SNAPSHOT_PAYLOAD_V1';
export const GRH_DIRECTORY_SNAPSHOT_ENTITY = 'GRH_DIRECTORY_SNAPSHOT';
export const GRH_DIRECTORY_SNAPSHOT_KIND = 'grh.directory.snapshot.v3';
export const GRH_DIRECTORY_SNAPSHOT_KEY_VERSION = 'v1';

const SNAPSHOT_CIPHER = 'aes-256-gcm';
const SNAPSHOT_COMPRESSION = 'gzip';
const SNAPSHOT_KEY_BYTES = 32;
const SNAPSHOT_NONCE_BYTES = 12;
const SNAPSHOT_AUTH_TAG_BYTES = 16;
const MAX_SNAPSHOT_CIPHERTEXT_BYTES = 4 * 1024 * 1024;
const MAX_SNAPSHOT_GZIP_BYTES = 4 * 1024 * 1024;
const MAX_SNAPSHOT_JSON_BYTES = 32 * 1024 * 1024;
const MAX_SNAPSHOT_CACHE_ENTRIES = 4;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TENANT_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const ENVELOPE_KEYS = Object.freeze([
  'kind',
  'schemaVersion',
  'keyVersion',
  'compression',
  'cipher',
  'sourceSha256',
  'snapshotAsOf',
  'recordCount',
  'absenceRecordCount',
  'leaveRecordCount',
  'movementPeriodCount',
  'positionObservationCount',
  'nonce',
  'ciphertext',
  'authTag',
  'aad',
]);
const AAD_KEYS = Object.freeze([
  'tenantId',
  'schemaVersion',
  'sourceSha256',
  'snapshotAsOf',
  'keyVersion',
  'compression',
  'absenceRecordCount',
  'movementPeriodCount',
]);
const snapshotCache = new Map();

function snapshotError(code) {
  const error = new Error('El snapshot privado GRH no esta disponible.');
  error.code = code;
  error.status = 503;
  return error;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function parseCanonicalBase64url(value, {
  exactBytes = null,
  maximumBytes = null,
  code = 'GRH_DIRECTORY_SNAPSHOT_ENVELOPE_INVALID',
} = {}) {
  if (typeof value !== 'string' || !value || !BASE64URL_PATTERN.test(value)) {
    throw snapshotError(code);
  }
  if (maximumBytes !== null && value.length > Math.ceil(maximumBytes * 4 / 3)) {
    throw snapshotError(code);
  }
  let decoded;
  try {
    decoded = Buffer.from(value, 'base64url');
  } catch {
    throw snapshotError(code);
  }
  if (decoded.toString('base64url') !== value ||
      (exactBytes !== null && decoded.length !== exactBytes) ||
      (maximumBytes !== null && decoded.length > maximumBytes)) {
    throw snapshotError(code);
  }
  return decoded;
}

function parseSnapshotKey(value) {
  return parseCanonicalBase64url(value, {
    exactBytes: SNAPSHOT_KEY_BYTES,
    code: 'GRH_DIRECTORY_SNAPSHOT_KEY_INVALID',
  });
}

function positiveOrZeroInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function buildAad({
  tenantId,
  sourceSha256,
  snapshotAsOf,
  keyVersion,
  absenceRecordCount,
  movementPeriodCount,
}) {
  return {
    tenantId,
    schemaVersion: GRH_DIRECTORY_SCHEMA_VERSION,
    sourceSha256,
    snapshotAsOf,
    keyVersion,
    compression: SNAPSHOT_COMPRESSION,
    absenceRecordCount,
    movementPeriodCount,
  };
}

function aadBytes(aad) {
  return Buffer.from(JSON.stringify(aad), 'utf8');
}

function artifactCounts(artifact) {
  return {
    recordCount: artifact.records.length,
    absenceRecordCount: artifact.records.reduce(
      (total, record) => total + record.absence_history.length,
      0,
    ),
    leaveRecordCount: artifact.records.reduce(
      (total, record) => total + record.leave_history.length,
      0,
    ),
    movementPeriodCount: artifact.records.reduce(
      (total, record) => total + record.movement_history.length,
      0,
    ),
    positionObservationCount: artifact.records.reduce(
      (total, record) => total + (record.position_observation ? 1 : 0),
      0,
    ),
  };
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

function validateTenantId(tenantId) {
  if (typeof tenantId !== 'string' || !TENANT_PATTERN.test(tenantId)) {
    throw snapshotError('GRH_DIRECTORY_SNAPSHOT_TENANT_INVALID');
  }
}

function validateEnvelopeShape(envelope, tenantId) {
  if (!exactKeys(envelope, ENVELOPE_KEYS) || !exactKeys(envelope?.aad, AAD_KEYS) ||
      envelope.kind !== GRH_DIRECTORY_SNAPSHOT_KIND ||
      envelope.schemaVersion !== GRH_DIRECTORY_SCHEMA_VERSION ||
      envelope.keyVersion !== GRH_DIRECTORY_SNAPSHOT_KEY_VERSION ||
      envelope.compression !== SNAPSHOT_COMPRESSION ||
      envelope.cipher !== SNAPSHOT_CIPHER ||
      !SHA256_PATTERN.test(envelope.sourceSha256 || '') ||
      !DATE_PATTERN.test(envelope.snapshotAsOf || '') ||
      !positiveOrZeroInteger(envelope.recordCount) ||
      !positiveOrZeroInteger(envelope.absenceRecordCount) ||
      !positiveOrZeroInteger(envelope.leaveRecordCount) ||
      !positiveOrZeroInteger(envelope.movementPeriodCount) ||
      !positiveOrZeroInteger(envelope.positionObservationCount)) {
    throw snapshotError('GRH_DIRECTORY_SNAPSHOT_ENVELOPE_INVALID');
  }
  const expectedAad = buildAad({
    tenantId,
    sourceSha256: envelope.sourceSha256,
    snapshotAsOf: envelope.snapshotAsOf,
    keyVersion: envelope.keyVersion,
    absenceRecordCount: envelope.absenceRecordCount,
    movementPeriodCount: envelope.movementPeriodCount,
  });
  if (!AAD_KEYS.every(key => envelope.aad[key] === expectedAad[key])) {
    throw snapshotError('GRH_DIRECTORY_SNAPSHOT_AAD_INVALID');
  }
  return expectedAad;
}

function cacheIdentity(tenantId, envelope, key) {
  const envelopeDigest = createHash('sha256')
    .update(JSON.stringify({
      kind: envelope.kind,
      schemaVersion: envelope.schemaVersion,
      keyVersion: envelope.keyVersion,
      compression: envelope.compression,
      cipher: envelope.cipher,
      sourceSha256: envelope.sourceSha256,
      snapshotAsOf: envelope.snapshotAsOf,
      recordCount: envelope.recordCount,
      absenceRecordCount: envelope.absenceRecordCount,
      leaveRecordCount: envelope.leaveRecordCount,
      movementPeriodCount: envelope.movementPeriodCount,
      positionObservationCount: envelope.positionObservationCount,
      nonce: envelope.nonce,
      ciphertext: envelope.ciphertext,
      authTag: envelope.authTag,
      aad: buildAad({
        tenantId,
        sourceSha256: envelope.sourceSha256,
        snapshotAsOf: envelope.snapshotAsOf,
        keyVersion: envelope.keyVersion,
        absenceRecordCount: envelope.absenceRecordCount,
        movementPeriodCount: envelope.movementPeriodCount,
      }),
    }), 'utf8')
    .digest('hex');
  const keyDigest = createHash('sha256').update(key).digest('hex');
  return [tenantId, envelope.sourceSha256, envelopeDigest, keyDigest].join(':');
}

function cacheGet(identity) {
  const cached = snapshotCache.get(identity);
  if (!cached) return null;
  snapshotCache.delete(identity);
  snapshotCache.set(identity, cached);
  return cached;
}

function cacheSet(identity, artifact) {
  snapshotCache.set(identity, artifact);
  while (snapshotCache.size > MAX_SNAPSHOT_CACHE_ENTRIES) {
    snapshotCache.delete(snapshotCache.keys().next().value);
  }
}

export function isGrhDirectorySnapshotEnabled(environment = process.env) {
  return typeof environment?.GRH_DIRECTORY_SNAPSHOT_KEY_V1 === 'string' &&
    environment.GRH_DIRECTORY_SNAPSHOT_KEY_V1.length > 0;
}

export function createGrhDirectorySnapshotEnvelope({
  tenantId,
  artifact,
  key,
  keyVersion = GRH_DIRECTORY_SNAPSHOT_KEY_VERSION,
  nonce = randomBytes(SNAPSHOT_NONCE_BYTES),
} = {}) {
  validateTenantId(tenantId);
  if (keyVersion !== GRH_DIRECTORY_SNAPSHOT_KEY_VERSION || !inspectGrhDirectoryArtifact(artifact).ok) {
    throw snapshotError('GRH_DIRECTORY_SNAPSHOT_ARTIFACT_INVALID');
  }
  const encryptionKey = parseSnapshotKey(key);
  if (!Buffer.isBuffer(nonce) || nonce.length !== SNAPSHOT_NONCE_BYTES) {
    throw snapshotError('GRH_DIRECTORY_SNAPSHOT_NONCE_INVALID');
  }
  const plaintext = Buffer.from(JSON.stringify(artifact), 'utf8');
  if (plaintext.length === 0 || plaintext.length > MAX_SNAPSHOT_JSON_BYTES) {
    throw snapshotError('GRH_DIRECTORY_SNAPSHOT_SIZE_INVALID');
  }
  const compressed = gzipSync(plaintext, { level: 9 });
  if (compressed.length === 0 || compressed.length > MAX_SNAPSHOT_GZIP_BYTES) {
    throw snapshotError('GRH_DIRECTORY_SNAPSHOT_SIZE_INVALID');
  }
  const counts = artifactCounts(artifact);
  const aad = buildAad({
    tenantId,
    sourceSha256: artifact.source.sha256,
    snapshotAsOf: artifact.source.snapshot_as_of,
    keyVersion,
    absenceRecordCount: counts.absenceRecordCount,
    movementPeriodCount: counts.movementPeriodCount,
  });
  const cipher = createCipheriv(SNAPSHOT_CIPHER, encryptionKey, nonce, {
    authTagLength: SNAPSHOT_AUTH_TAG_BYTES,
  });
  cipher.setAAD(aadBytes(aad));
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  if (ciphertext.length > MAX_SNAPSHOT_CIPHERTEXT_BYTES) {
    throw snapshotError('GRH_DIRECTORY_SNAPSHOT_SIZE_INVALID');
  }
  return {
    kind: GRH_DIRECTORY_SNAPSHOT_KIND,
    schemaVersion: GRH_DIRECTORY_SCHEMA_VERSION,
    keyVersion,
    compression: SNAPSHOT_COMPRESSION,
    cipher: SNAPSHOT_CIPHER,
    sourceSha256: artifact.source.sha256,
    snapshotAsOf: artifact.source.snapshot_as_of,
    ...counts,
    nonce: nonce.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
    aad,
  };
}

export function decryptGrhDirectorySnapshotEnvelope({ tenantId, envelope, key } = {}) {
  validateTenantId(tenantId);
  const encryptionKey = parseSnapshotKey(key);
  const aad = validateEnvelopeShape(envelope, tenantId);
  const nonce = parseCanonicalBase64url(envelope.nonce, {
    exactBytes: SNAPSHOT_NONCE_BYTES,
  });
  const authTag = parseCanonicalBase64url(envelope.authTag, {
    exactBytes: SNAPSHOT_AUTH_TAG_BYTES,
  });
  const ciphertext = parseCanonicalBase64url(envelope.ciphertext, {
    maximumBytes: MAX_SNAPSHOT_CIPHERTEXT_BYTES,
  });
  if (ciphertext.length === 0 || ciphertext.length > MAX_SNAPSHOT_GZIP_BYTES) {
    throw snapshotError('GRH_DIRECTORY_SNAPSHOT_SIZE_INVALID');
  }
  const identity = cacheIdentity(tenantId, envelope, encryptionKey);
  const cached = cacheGet(identity);
  if (cached) return cached;

  let compressed;
  try {
    const decipher = createDecipheriv(SNAPSHOT_CIPHER, encryptionKey, nonce, {
      authTagLength: SNAPSHOT_AUTH_TAG_BYTES,
    });
    decipher.setAAD(aadBytes(aad));
    decipher.setAuthTag(authTag);
    compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw snapshotError('GRH_DIRECTORY_SNAPSHOT_AUTH_INVALID');
  }
  if (compressed.length === 0 || compressed.length > MAX_SNAPSHOT_GZIP_BYTES) {
    throw snapshotError('GRH_DIRECTORY_SNAPSHOT_SIZE_INVALID');
  }

  let plaintext;
  try {
    plaintext = gunzipSync(compressed, { maxOutputLength: MAX_SNAPSHOT_JSON_BYTES });
  } catch {
    throw snapshotError('GRH_DIRECTORY_SNAPSHOT_COMPRESSION_INVALID');
  }
  if (plaintext.length === 0 || plaintext.length > MAX_SNAPSHOT_JSON_BYTES) {
    throw snapshotError('GRH_DIRECTORY_SNAPSHOT_SIZE_INVALID');
  }

  let artifact;
  try {
    artifact = JSON.parse(plaintext.toString('utf8'));
  } catch {
    throw snapshotError('GRH_DIRECTORY_SNAPSHOT_ARTIFACT_INVALID');
  }
  if (!inspectGrhDirectoryArtifact(artifact).ok ||
      artifact.schema_version !== envelope.schemaVersion ||
      artifact.source.sha256 !== envelope.sourceSha256 ||
      artifact.source.snapshot_as_of !== envelope.snapshotAsOf) {
    throw snapshotError('GRH_DIRECTORY_SNAPSHOT_ARTIFACT_INVALID');
  }
  const counts = artifactCounts(artifact);
  if (counts.recordCount !== envelope.recordCount ||
      counts.absenceRecordCount !== envelope.absenceRecordCount ||
      counts.leaveRecordCount !== envelope.leaveRecordCount ||
      counts.movementPeriodCount !== envelope.movementPeriodCount ||
      counts.positionObservationCount !== envelope.positionObservationCount) {
    throw snapshotError('GRH_DIRECTORY_SNAPSHOT_COUNT_MISMATCH');
  }
  freezeDeep(artifact);
  cacheSet(identity, artifact);
  return artifact;
}

export function buildGrhDirectorySnapshotSql() {
  return `SELECT details
    FROM audit_logs
   WHERE "tenantId" = $1
     AND action = $2
     AND entity = $3
   ORDER BY "createdAt" DESC, id DESC
   LIMIT 1`;
}

export async function loadGrhDirectorySnapshotArtifact({ tenantId, key, queryImpl } = {}) {
  validateTenantId(tenantId);
  if (typeof queryImpl !== 'function') {
    throw snapshotError('GRH_DIRECTORY_SNAPSHOT_DATABASE_UNAVAILABLE');
  }
  const result = await queryImpl(buildGrhDirectorySnapshotSql(), [
    tenantId,
    GRH_DIRECTORY_SNAPSHOT_ACTION,
    GRH_DIRECTORY_SNAPSHOT_ENTITY,
  ]);
  let envelope = result?.rows?.[0]?.details;
  if (typeof envelope === 'string') {
    try {
      envelope = JSON.parse(envelope);
    } catch {
      throw snapshotError('GRH_DIRECTORY_SNAPSHOT_ENVELOPE_INVALID');
    }
  }
  if (!envelope) throw snapshotError('GRH_DIRECTORY_SNAPSHOT_SOURCE_UNAVAILABLE');
  return decryptGrhDirectorySnapshotEnvelope({ tenantId, envelope, key });
}

export function clearGrhDirectorySnapshotCache() {
  snapshotCache.clear();
}
