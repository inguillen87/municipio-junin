import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

import {
  GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
  GRH_WORKFORCE_FINANCE_POLICY_VERSION,
  GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION,
  inspectGrhWorkforceFinanceSourceContract,
} from './grh-workforce-finance-source-contract.js';

export const GRH_WORKFORCE_FINANCE_SNAPSHOT_ACTION =
  'GRH_WORKFORCE_FINANCE_SNAPSHOT_PAYLOAD_V1';
export const GRH_WORKFORCE_FINANCE_SNAPSHOT_ENTITY =
  'GRH_WORKFORCE_FINANCE_SNAPSHOT';
export const GRH_WORKFORCE_FINANCE_SNAPSHOT_KIND =
  'grh.workforce-finance.snapshot.v1';
export const GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_VERSION = 'v1';
export const GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_ENV =
  'GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_V1';

const SNAPSHOT_CIPHER = 'aes-256-gcm';
const SNAPSHOT_COMPRESSION = 'gzip';
const SNAPSHOT_KEY_BYTES = 32;
const SNAPSHOT_NONCE_BYTES = 12;
const SNAPSHOT_AUTH_TAG_BYTES = 16;
const MAX_SNAPSHOT_COMPRESSED_BYTES = 2 * 1024 * 1024;
const MAX_SNAPSHOT_JSON_BYTES = 16 * 1024 * 1024;
const MAX_SNAPSHOT_CACHE_ENTRIES = 4;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TENANT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

const ENVELOPE_KEYS = Object.freeze([
  'kind',
  'sourceSchema',
  'sourceSha256',
  'snapshotAsOf',
  'releaseId',
  'policyVersion',
  'keyVersion',
  'compression',
  'cipher',
  'plaintextBytes',
  'compressedBytes',
  'periodCount',
  'dimensionViewCount',
  'dimensionPeriodCount',
  'cellCount',
  'nonce',
  'ciphertext',
  'authTag',
  'aad',
]);
const AAD_KEYS = Object.freeze([
  'tenantId',
  'sourceSchema',
  'sourceSha256',
  'snapshotAsOf',
  'releaseId',
  'policyVersion',
  'keyVersion',
  'compression',
]);
const snapshotCache = new Map();

export class GrhWorkforceFinanceSnapshotError extends Error {
  constructor(code) {
    super('El snapshot cifrado workforce-finance no esta disponible.');
    this.name = 'GrhWorkforceFinanceSnapshotError';
    this.code = code;
    this.status = 503;
  }
}

function snapshotError(code) {
  return new GrhWorkforceFinanceSnapshotError(code);
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

function safeNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function canonicalDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateTenantId(tenantId) {
  if (typeof tenantId !== 'string' || !TENANT_PATTERN.test(tenantId)) {
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_TENANT_INVALID');
  }
}

function parseCanonicalBase64url(value, {
  exactBytes = null,
  maximumBytes = null,
  code = 'GRH_WORKFORCE_FINANCE_SNAPSHOT_ENVELOPE_INVALID',
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
    code: 'GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_INVALID',
  });
}

function artifactIdentity(artifact) {
  return {
    sourceSchema: artifact.schema_version,
    sourceSha256: artifact.source.sha256,
    snapshotAsOf: artifact.source.snapshot_as_of,
    releaseId: artifact.release_id,
    policyVersion: artifact.policy_version,
  };
}

function artifactCounts(artifact) {
  const views = Array.isArray(artifact.dimension_views) ? artifact.dimension_views : [];
  return {
    periodCount: Array.isArray(artifact.period_totals) ? artifact.period_totals.length : 0,
    dimensionViewCount: views.length,
    dimensionPeriodCount: views.reduce(
      (total, view) => total + (Array.isArray(view.periods) ? view.periods.length : 0),
      0,
    ),
    cellCount: views.reduce(
      (total, view) => total + (Array.isArray(view.periods)
        ? view.periods.reduce(
          (subtotal, period) => subtotal + (Array.isArray(period.cells) ? period.cells.length : 0),
          0,
        )
        : 0),
      0,
    ),
  };
}

function buildAad({
  tenantId,
  sourceSchema,
  sourceSha256,
  snapshotAsOf,
  releaseId,
  policyVersion,
  keyVersion,
}) {
  return {
    tenantId,
    sourceSchema,
    sourceSha256,
    snapshotAsOf,
    releaseId,
    policyVersion,
    keyVersion,
    compression: SNAPSHOT_COMPRESSION,
  };
}

function aadBytes(aad) {
  return Buffer.from(JSON.stringify(aad), 'utf8');
}

function assertArtifact(artifact) {
  if (!inspectGrhWorkforceFinanceSourceContract(artifact).ok) {
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_ARTIFACT_INVALID');
  }
}

function assertPins(identity, {
  expectedSourceSha256 = null,
  expectedSnapshotAsOf = null,
  expectedReleaseId = GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
  expectedPolicyVersion = GRH_WORKFORCE_FINANCE_POLICY_VERSION,
} = {}) {
  if (identity.releaseId !== GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID) {
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PIN_MISMATCH');
  }
  const checks = [
    [expectedSourceSha256, identity.sourceSha256],
    [expectedSnapshotAsOf, identity.snapshotAsOf],
    [expectedReleaseId, identity.releaseId],
    [expectedPolicyVersion, identity.policyVersion],
  ];
  if (checks.some(([expected, actual]) => expected !== null && expected !== actual)) {
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PIN_MISMATCH');
  }
}

function validateEnvelopeShape(envelope, tenantId, expectedPins) {
  if (!exactKeys(envelope, ENVELOPE_KEYS) || !exactKeys(envelope?.aad, AAD_KEYS) ||
      envelope.kind !== GRH_WORKFORCE_FINANCE_SNAPSHOT_KIND ||
      envelope.sourceSchema !== GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION ||
      !SHA256_PATTERN.test(envelope.sourceSha256 || '') ||
      !canonicalDate(envelope.snapshotAsOf) ||
      envelope.releaseId !== GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID ||
      envelope.policyVersion !== GRH_WORKFORCE_FINANCE_POLICY_VERSION ||
      envelope.keyVersion !== GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_VERSION ||
      envelope.compression !== SNAPSHOT_COMPRESSION ||
      envelope.cipher !== SNAPSHOT_CIPHER ||
      !safeNonNegativeInteger(envelope.plaintextBytes) || envelope.plaintextBytes === 0 ||
      envelope.plaintextBytes > MAX_SNAPSHOT_JSON_BYTES ||
      !safeNonNegativeInteger(envelope.compressedBytes) || envelope.compressedBytes === 0 ||
      envelope.compressedBytes > MAX_SNAPSHOT_COMPRESSED_BYTES ||
      !safeNonNegativeInteger(envelope.periodCount) ||
      !safeNonNegativeInteger(envelope.dimensionViewCount) ||
      !safeNonNegativeInteger(envelope.dimensionPeriodCount) ||
      !safeNonNegativeInteger(envelope.cellCount)) {
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_ENVELOPE_INVALID');
  }
  const identity = {
    sourceSchema: envelope.sourceSchema,
    sourceSha256: envelope.sourceSha256,
    snapshotAsOf: envelope.snapshotAsOf,
    releaseId: envelope.releaseId,
    policyVersion: envelope.policyVersion,
  };
  assertPins(identity, expectedPins);
  const expectedAad = buildAad({ tenantId, ...identity, keyVersion: envelope.keyVersion });
  if (!AAD_KEYS.every(key => envelope.aad[key] === expectedAad[key])) {
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_AAD_INVALID');
  }
  return expectedAad;
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (plainObject(value)) {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function cacheIdentity(tenantId, envelope, key) {
  const envelopeHash = createHash('sha256')
    .update(canonicalJson(envelope), 'utf8')
    .digest('hex');
  const keyHash = createHash('sha256').update(key).digest('hex');
  return `${tenantId}:${envelopeHash}:${keyHash}`;
}

function cacheGet(identity) {
  const artifact = snapshotCache.get(identity);
  if (!artifact) return null;
  snapshotCache.delete(identity);
  snapshotCache.set(identity, artifact);
  return artifact;
}

function cacheSet(identity, artifact) {
  snapshotCache.set(identity, artifact);
  while (snapshotCache.size > MAX_SNAPSHOT_CACHE_ENTRIES) {
    snapshotCache.delete(snapshotCache.keys().next().value);
  }
}

export function isGrhWorkforceFinanceSnapshotEnabled(environment = process.env) {
  return typeof environment?.[GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_ENV] === 'string' &&
    environment[GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_ENV].length > 0;
}

export function createGrhWorkforceFinanceSnapshotEnvelope({
  tenantId,
  artifact,
  key,
  keyVersion = GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_VERSION,
  nonce = randomBytes(SNAPSHOT_NONCE_BYTES),
  expectedSourceSha256 = null,
  expectedSnapshotAsOf = null,
  expectedReleaseId = GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
  expectedPolicyVersion = GRH_WORKFORCE_FINANCE_POLICY_VERSION,
} = {}) {
  validateTenantId(tenantId);
  assertArtifact(artifact);
  if (keyVersion !== GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_VERSION) {
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_VERSION_INVALID');
  }
  const identity = artifactIdentity(artifact);
  assertPins(identity, {
    expectedSourceSha256,
    expectedSnapshotAsOf,
    expectedReleaseId,
    expectedPolicyVersion,
  });
  const encryptionKey = parseSnapshotKey(key);
  if (!Buffer.isBuffer(nonce) || nonce.length !== SNAPSHOT_NONCE_BYTES) {
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_NONCE_INVALID');
  }
  const plaintext = Buffer.from(JSON.stringify(artifact), 'utf8');
  if (plaintext.length === 0 || plaintext.length > MAX_SNAPSHOT_JSON_BYTES) {
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_SIZE_INVALID');
  }
  const compressed = gzipSync(plaintext, { level: 9 });
  if (compressed.length === 0 || compressed.length > MAX_SNAPSHOT_COMPRESSED_BYTES) {
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_SIZE_INVALID');
  }
  const aad = buildAad({ tenantId, ...identity, keyVersion });
  const cipher = createCipheriv(SNAPSHOT_CIPHER, encryptionKey, nonce, {
    authTagLength: SNAPSHOT_AUTH_TAG_BYTES,
  });
  cipher.setAAD(aadBytes(aad));
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  if (ciphertext.length !== compressed.length ||
      ciphertext.length > MAX_SNAPSHOT_COMPRESSED_BYTES) {
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_SIZE_INVALID');
  }
  return {
    kind: GRH_WORKFORCE_FINANCE_SNAPSHOT_KIND,
    ...identity,
    keyVersion,
    compression: SNAPSHOT_COMPRESSION,
    cipher: SNAPSHOT_CIPHER,
    plaintextBytes: plaintext.length,
    compressedBytes: compressed.length,
    ...artifactCounts(artifact),
    nonce: nonce.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
    aad,
  };
}

export function decryptGrhWorkforceFinanceSnapshotEnvelope({
  tenantId,
  envelope,
  key,
  expectedSourceSha256 = null,
  expectedSnapshotAsOf = null,
  expectedReleaseId = GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
  expectedPolicyVersion = GRH_WORKFORCE_FINANCE_POLICY_VERSION,
} = {}) {
  validateTenantId(tenantId);
  const encryptionKey = parseSnapshotKey(key);
  const expectedPins = {
    expectedSourceSha256,
    expectedSnapshotAsOf,
    expectedReleaseId,
    expectedPolicyVersion,
  };
  const aad = validateEnvelopeShape(envelope, tenantId, expectedPins);
  const nonce = parseCanonicalBase64url(envelope.nonce, {
    exactBytes: SNAPSHOT_NONCE_BYTES,
  });
  const authTag = parseCanonicalBase64url(envelope.authTag, {
    exactBytes: SNAPSHOT_AUTH_TAG_BYTES,
  });
  const ciphertext = parseCanonicalBase64url(envelope.ciphertext, {
    maximumBytes: MAX_SNAPSHOT_COMPRESSED_BYTES,
  });
  if (ciphertext.length !== envelope.compressedBytes) {
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_SIZE_INVALID');
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
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_AUTH_INVALID');
  }
  if (compressed.length !== envelope.compressedBytes ||
      compressed.length > MAX_SNAPSHOT_COMPRESSED_BYTES ||
      compressed[0] !== 0x1f || compressed[1] !== 0x8b) {
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_COMPRESSION_INVALID');
  }

  let plaintext;
  try {
    plaintext = gunzipSync(compressed, { maxOutputLength: MAX_SNAPSHOT_JSON_BYTES });
  } catch (error) {
    throw snapshotError(error?.code === 'ERR_BUFFER_TOO_LARGE'
      ? 'GRH_WORKFORCE_FINANCE_SNAPSHOT_SIZE_INVALID'
      : 'GRH_WORKFORCE_FINANCE_SNAPSHOT_COMPRESSION_INVALID');
  }
  if (plaintext.length !== envelope.plaintextBytes ||
      plaintext.length > MAX_SNAPSHOT_JSON_BYTES) {
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_SIZE_INVALID');
  }

  let artifact;
  try {
    artifact = JSON.parse(plaintext.toString('utf8'));
  } catch {
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_ARTIFACT_INVALID');
  }
  assertArtifact(artifact);
  const artifactMetadata = artifactIdentity(artifact);
  if (!Object.keys(artifactMetadata).every(key => artifactMetadata[key] === envelope[key])) {
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_ARTIFACT_INVALID');
  }
  const counts = artifactCounts(artifact);
  if (!Object.keys(counts).every(key => counts[key] === envelope[key])) {
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_COUNT_MISMATCH');
  }
  assertPins(artifactMetadata, expectedPins);
  freezeDeep(artifact);
  cacheSet(identity, artifact);
  return artifact;
}

export const READ_GRH_WORKFORCE_FINANCE_SNAPSHOT_SQL = `SELECT details
  FROM audit_logs
 WHERE "tenantId" = $1
   AND action = $2
   AND entity = $3
 ORDER BY "createdAt" DESC, id DESC
 LIMIT 1`;

export async function loadGrhWorkforceFinanceSnapshotArtifact({
  tenantId,
  key,
  queryImpl,
  expectedSourceSha256 = null,
  expectedSnapshotAsOf = null,
  expectedReleaseId = GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
  expectedPolicyVersion = GRH_WORKFORCE_FINANCE_POLICY_VERSION,
} = {}) {
  validateTenantId(tenantId);
  // Reject a missing or malformed independent snapshot key before touching
  // persistence, so this source cannot degrade into an unauthenticated read.
  parseSnapshotKey(key);
  if (typeof queryImpl !== 'function') {
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_DATABASE_UNAVAILABLE');
  }
  let result;
  try {
    result = await queryImpl(READ_GRH_WORKFORCE_FINANCE_SNAPSHOT_SQL, [
      tenantId,
      GRH_WORKFORCE_FINANCE_SNAPSHOT_ACTION,
      GRH_WORKFORCE_FINANCE_SNAPSHOT_ENTITY,
    ]);
  } catch {
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_DATABASE_UNAVAILABLE');
  }
  if (!result || !Array.isArray(result.rows) || result.rows.length !== 1 ||
      !exactKeys(result.rows[0], ['details'])) {
    throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_SOURCE_UNAVAILABLE');
  }
  let envelope = result.rows[0].details;
  if (typeof envelope === 'string') {
    try {
      envelope = JSON.parse(envelope);
    } catch {
      throw snapshotError('GRH_WORKFORCE_FINANCE_SNAPSHOT_ENVELOPE_INVALID');
    }
  }
  return decryptGrhWorkforceFinanceSnapshotEnvelope({
    tenantId,
    envelope,
    key,
    expectedSourceSha256,
    expectedSnapshotAsOf,
    expectedReleaseId,
    expectedPolicyVersion,
  });
}

export function clearGrhWorkforceFinanceSnapshotCache() {
  snapshotCache.clear();
}
