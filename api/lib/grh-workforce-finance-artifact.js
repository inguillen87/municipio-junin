import { readFile } from 'node:fs/promises';
import { promisify, TextDecoder } from 'node:util';
import { gunzip as gunzipCallback } from 'node:zlib';

import pg from 'pg';

import databaseUrlPolicy from '../../shared/database-url-policy.cjs';
import {
  GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
  GRH_WORKFORCE_FINANCE_ARTIFACT_KEY,
  GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION,
} from './grh-workforce-finance-source-contract.js';
import {
  GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_ENV,
  loadGrhWorkforceFinanceSnapshotArtifact,
} from './grh-workforce-finance-snapshot.js';

export {
  GRH_WORKFORCE_FINANCE_ARTIFACT_KEY,
  GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION,
};

const { Pool } = pg;
const { inspectDatabaseUrl } = databaseUrlPolicy;

const ARTIFACT_SOURCES = new Set(['database', 'encrypted_snapshot', 'local', 'sealed']);
const ENVELOPE_KEYS = Object.freeze([
  'artifact',
  'payload',
  'schemaVersion',
  'snapshotAsOf',
  'sourceSha256',
  'tenantId',
]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const TENANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SEALED_COMPRESSED_BYTES = 1024 * 1024;
const MAX_SEALED_EXPANDED_BYTES = 16 * 1024 * 1024;
const MAX_SEALED_BASE64_LENGTH = Math.ceil(MAX_SEALED_COMPRESSED_BYTES / 3) * 4;
const gunzip = promisify(gunzipCallback);
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

export const READ_ACTIVE_GRH_WORKFORCE_FINANCE_SQL = `SELECT tenant_id,
       artifact,
       schema_version,
       TO_CHAR(snapshot_as_of, 'YYYY-MM-DD') AS snapshot_as_of,
       BTRIM(source_sha256) AS source_sha256,
       payload
  FROM grh_workforce_finance_artifacts
 WHERE tenant_id = $1
   AND artifact = 'workforce_finance'
   AND active = TRUE`;

let pool;

export class GrhWorkforceFinanceArtifactError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GrhWorkforceFinanceArtifactError';
    this.code = code;
  }
}

function artifactError(code, message) {
  return new GrhWorkforceFinanceArtifactError(code, message);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expectedKeys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function isCanonicalIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function configuredArtifactSource(environment) {
  const source = environment.GRH_WORKFORCE_FINANCE_ARTIFACT_SOURCE;
  if (source === undefined || source === '') {
    throw artifactError(
      'GRH_WORKFORCE_FINANCE_SOURCE_REQUIRED',
      'La fuente workforce-finance no esta configurada.',
    );
  }
  if (typeof source !== 'string' || !ARTIFACT_SOURCES.has(source)) {
    throw artifactError(
      'GRH_WORKFORCE_FINANCE_SOURCE_INVALID',
      'La fuente workforce-finance no usa un modo permitido.',
    );
  }
  if (source === 'local' && (
    environment.NODE_ENV === 'production' ||
    environment.ALLOW_LOCAL_GRH_WORKFORCE_FINANCE_ARTIFACTS !== 'true'
  )) {
    throw artifactError(
      'GRH_WORKFORCE_FINANCE_LOCAL_FORBIDDEN',
      'La fuente local workforce-finance no esta habilitada.',
    );
  }
  return source;
}

function assertExpectedIdentity({
  tenantId,
  expectedSourceSha256,
  expectedSnapshotAsOf,
  expectedReleaseId,
}) {
  if (typeof tenantId !== 'string' || !TENANT_ID_PATTERN.test(tenantId)) {
    throw artifactError('GRH_WORKFORCE_FINANCE_TENANT_INVALID', 'Tenant workforce-finance invalido.');
  }
  if (typeof expectedSourceSha256 !== 'string' || !SHA256_PATTERN.test(expectedSourceSha256)) {
    throw artifactError(
      'GRH_WORKFORCE_FINANCE_SOURCE_SHA256_INVALID',
      'Pin workforce-finance invalido.',
    );
  }
  if (!isCanonicalIsoDate(expectedSnapshotAsOf)) {
    throw artifactError(
      'GRH_WORKFORCE_FINANCE_SNAPSHOT_INVALID',
      'Snapshot workforce-finance invalido.',
    );
  }
  if (expectedReleaseId !== GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID) {
    throw artifactError(
      'GRH_WORKFORCE_FINANCE_RELEASE_ID_INVALID',
      'Release workforce-finance no aprobado.',
    );
  }
}

export function inspectGrhWorkforceFinanceArtifactEnvelope(value, {
  tenantId,
  expectedSourceSha256,
  expectedSnapshotAsOf,
} = {}) {
  const errors = [];
  if (!hasExactKeys(value, ENVELOPE_KEYS)) {
    errors.push('envelope.keys');
  } else {
    if (value.tenantId !== tenantId || !TENANT_ID_PATTERN.test(value.tenantId)) {
      errors.push('envelope.tenantId');
    }
    if (value.artifact !== GRH_WORKFORCE_FINANCE_ARTIFACT_KEY) {
      errors.push('envelope.artifact');
    }
    if (value.schemaVersion !== GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION) {
      errors.push('envelope.schemaVersion');
    }
    if (!SHA256_PATTERN.test(value.sourceSha256) ||
        value.sourceSha256 !== expectedSourceSha256) {
      errors.push('envelope.sourceSha256');
    }
    if (!isCanonicalIsoDate(value.snapshotAsOf) ||
        value.snapshotAsOf !== expectedSnapshotAsOf) {
      errors.push('envelope.snapshotAsOf');
    }
    if (!isPlainObject(value.payload)) errors.push('envelope.payload');
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function assertEnvelope(value, expectedIdentity) {
  const inspection = inspectGrhWorkforceFinanceArtifactEnvelope(value, expectedIdentity);
  if (!inspection.ok) {
    throw artifactError(
      'GRH_WORKFORCE_FINANCE_ENVELOPE_INVALID',
      'El artefacto workforce-finance no coincide con la fuente activa.',
    );
  }
  return Object.freeze({
    artifact: value.artifact,
    schemaVersion: value.schemaVersion,
    tenantId: value.tenantId,
    snapshotAsOf: value.snapshotAsOf,
    sourceSha256: value.sourceSha256,
    payload: value.payload,
  });
}

function envelopeFromDatabaseResult(result) {
  if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) {
    throw artifactError(
      'GRH_WORKFORCE_FINANCE_DATABASE_ARTIFACT_UNAVAILABLE',
      'El artefacto workforce-finance activo no esta disponible.',
    );
  }
  const row = result.rows[0];
  if (!hasExactKeys(row, [
    'tenant_id',
    'artifact',
    'schema_version',
    'snapshot_as_of',
    'source_sha256',
    'payload',
  ])) {
    throw artifactError(
      'GRH_WORKFORCE_FINANCE_DATABASE_ROW_INVALID',
      'La fila workforce-finance no cumple el contrato.',
    );
  }
  return {
    tenantId: row.tenant_id,
    artifact: row.artifact,
    schemaVersion: row.schema_version,
    snapshotAsOf: row.snapshot_as_of,
    sourceSha256: row.source_sha256,
    payload: row.payload,
  };
}

function sealedBase64Payload(environment) {
  if (environment.GRH_WORKFORCE_FINANCE_SEALED_BASE64 !== undefined) {
    return environment.GRH_WORKFORCE_FINANCE_SEALED_BASE64;
  }
  const rawParts = environment.GRH_WORKFORCE_FINANCE_SEALED_PARTS;
  if (typeof rawParts !== 'string' || !/^(?:[2-9]|1[0-6])$/.test(rawParts)) {
    throw artifactError(
      'GRH_WORKFORCE_FINANCE_SEALED_PARTS_INVALID',
      'La cantidad de partes workforce-finance no es valida.',
    );
  }
  const fragments = [];
  let totalLength = 0;
  for (let index = 1; index <= Number(rawParts); index += 1) {
    const name = `GRH_WORKFORCE_FINANCE_SEALED_${String(index).padStart(2, '0')}`;
    const fragment = environment[name];
    if (typeof fragment !== 'string' || fragment.length === 0) {
      throw artifactError(
        'GRH_WORKFORCE_FINANCE_SEALED_PART_INVALID',
        'Falta una parte workforce-finance requerida.',
      );
    }
    totalLength += fragment.length;
    if (totalLength > MAX_SEALED_BASE64_LENGTH) {
      throw artifactError(
        'GRH_WORKFORCE_FINANCE_SEALED_COMPRESSED_LIMIT',
        'El artefacto workforce-finance excede el limite comprimido.',
      );
    }
    fragments.push(fragment);
  }
  return fragments.join('');
}

function decodeBase64Payload(payload) {
  if (typeof payload !== 'string' || payload.length === 0 ||
      payload.length > MAX_SEALED_BASE64_LENGTH || payload.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload)) {
    throw artifactError(
      'GRH_WORKFORCE_FINANCE_SEALED_ENCODING_INVALID',
      'El artefacto workforce-finance sellado no tiene una codificacion valida.',
    );
  }
  const paddingBytes = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  const decodedLength = (payload.length / 4) * 3 - paddingBytes;
  if (decodedLength === 0 || decodedLength > MAX_SEALED_COMPRESSED_BYTES) {
    throw artifactError(
      'GRH_WORKFORCE_FINANCE_SEALED_COMPRESSED_LIMIT',
      'El artefacto workforce-finance excede el limite comprimido.',
    );
  }
  const decoded = Buffer.from(payload, 'base64');
  if (decoded.toString('base64') !== payload) {
    throw artifactError(
      'GRH_WORKFORCE_FINANCE_SEALED_ENCODING_INVALID',
      'El artefacto workforce-finance sellado no tiene una codificacion valida.',
    );
  }
  return decoded;
}

async function readSealedEnvelope(environment) {
  const compressed = decodeBase64Payload(sealedBase64Payload(environment));
  if (compressed.length < 18 || compressed[0] !== 0x1f || compressed[1] !== 0x8b) {
    throw artifactError(
      'GRH_WORKFORCE_FINANCE_SEALED_COMPRESSION_INVALID',
      'El artefacto workforce-finance sellado no usa gzip valido.',
    );
  }
  let expanded;
  try {
    expanded = await gunzip(compressed, { maxOutputLength: MAX_SEALED_EXPANDED_BYTES });
  } catch (error) {
    throw artifactError(
      error?.code === 'ERR_BUFFER_TOO_LARGE'
        ? 'GRH_WORKFORCE_FINANCE_SEALED_EXPANSION_LIMIT'
        : 'GRH_WORKFORCE_FINANCE_SEALED_COMPRESSION_INVALID',
      'El artefacto workforce-finance sellado no se pudo expandir.',
    );
  }
  try {
    return JSON.parse(utf8Decoder.decode(expanded));
  } catch {
    throw artifactError(
      'GRH_WORKFORCE_FINANCE_SEALED_JSON_INVALID',
      'El artefacto workforce-finance sellado no contiene JSON valido.',
    );
  }
}

async function readLocalSourceArtifact() {
  return JSON.parse(await readFile(
    new URL('../_data/grh-workforce-finance.json', import.meta.url),
    'utf8',
  ));
}

function envelopeFromLocalSource(payload, tenantId) {
  return {
    tenantId,
    artifact: GRH_WORKFORCE_FINANCE_ARTIFACT_KEY,
    schemaVersion: payload?.schema_version,
    snapshotAsOf: payload?.source?.snapshot_as_of,
    sourceSha256: payload?.source?.sha256,
    payload,
  };
}

function databasePool(environment) {
  if (!environment.DATABASE_URL) return null;
  const inspected = inspectDatabaseUrl(environment.DATABASE_URL, {
    nodeEnv: environment.NODE_ENV,
    environment,
  });
  pool ??= new Pool({ connectionString: inspected.connectionString });
  return pool;
}

export async function loadGrhWorkforceFinanceArtifact({
  tenantId,
  expectedSourceSha256,
  expectedSnapshotAsOf,
  expectedReleaseId = GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
  environment = process.env,
  queryImpl = null,
  readLocalSourceArtifactImpl = readLocalSourceArtifact,
} = {}) {
  const expectedIdentity = {
    tenantId,
    expectedSourceSha256,
    expectedSnapshotAsOf,
    expectedReleaseId,
  };
  assertExpectedIdentity(expectedIdentity);
  const source = configuredArtifactSource(environment);

  let envelope;
  if (source === 'database') {
    if (typeof queryImpl !== 'function') {
      throw artifactError(
        'GRH_WORKFORCE_FINANCE_DATABASE_UNAVAILABLE',
        'La base workforce-finance no esta disponible.',
      );
    }
    envelope = envelopeFromDatabaseResult(
      await queryImpl(READ_ACTIVE_GRH_WORKFORCE_FINANCE_SQL, [tenantId]),
    );
  } else if (source === 'encrypted_snapshot') {
    const payload = await loadGrhWorkforceFinanceSnapshotArtifact({
      tenantId,
      key: environment[GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_ENV],
      queryImpl,
      expectedSourceSha256,
      expectedSnapshotAsOf,
      expectedReleaseId,
    });
    envelope = envelopeFromLocalSource(payload, tenantId);
  } else if (source === 'sealed') {
    envelope = await readSealedEnvelope(environment);
  } else {
    envelope = envelopeFromLocalSource(await readLocalSourceArtifactImpl(), tenantId);
  }
  return assertEnvelope(envelope, expectedIdentity);
}

export async function readGrhWorkforceFinanceArtifact({
  tenantId,
  expectedSourceSha256,
  expectedSnapshotAsOf,
  expectedReleaseId = GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
  environment = process.env,
} = {}) {
  const source = configuredArtifactSource(environment);
  const db = ['database', 'encrypted_snapshot'].includes(source)
    ? databasePool(environment)
    : null;
  const queryImpl = db ? (text, params) => db.query(text, params) : null;
  return loadGrhWorkforceFinanceArtifact({
    tenantId,
    expectedSourceSha256,
    expectedSnapshotAsOf,
    expectedReleaseId,
    environment,
    queryImpl,
  });
}
