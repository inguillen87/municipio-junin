#!/usr/bin/env node

import {
  createDecipheriv,
  createHash,
  createHmac,
  timingSafeEqual,
} from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import pg from 'pg';
import databaseUrlPolicy from '../shared/database-url-policy.cjs';
import tenantLifecycle from '../shared/tenant-lifecycle.cjs';

const { Client } = pg;
const { evaluateTenantAccess } = tenantLifecycle;
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');

export const PUBLISH_DATABASE_ENV = 'GRH_PERSONAS_REVIEW_PUBLISH_DATABASE_URL';
export const HMAC_KEY_ENV = 'GRH_PERSONAS_REVIEW_HMAC_KEY_V1';
export const EVIDENCE_KEY_ENV = 'GRH_PERSONAS_REVIEW_EVIDENCE_KEY_V1';
export const PUBLISH_CONFIRMATION = 'PUBLISH_PRIVATE_GRH_PERSONAS_REVIEW';
export const RUN_UUID_NAMESPACE = '3d4bb1eb-8509-5f52-a0b3-5a7d05414d60';
export const PINNED_SOURCE = Object.freeze({
  snapshotAsOf: '2026-08-06',
  grhSourceSha256: 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9',
  personasSourceSha256: '11bf15764488e4fe8a053255f503404f6bca24a1ac47c90647649e2c41d8e39c',
});
export const EXPECTED_COUNTS = Object.freeze({
  totalCaseCount: 2349,
  totalOptionCount: 2185,
  candidateCaseCount: 1699,
  ambiguousCaseCount: 157,
  unmatchedCaseCount: 493,
  documentConflictCount: 23,
  autoApprovedCount: 0,
});
export const GOVERNED_CANONICAL_MATCH_COUNTS = Object.freeze({
  activeLinkCount: 1699,
  cuilUniqueCount: 1432,
  duplicateCuilCount: 58,
  dniUniqueCount: 203,
  duplicateDniCount: 6,
});

const SHA256 = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TENANT = /^[A-Za-z0-9_-]{1,128}$/u;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;
const MAX_STREAM_BYTES = 32 * 1024 * 1024;
const CHUNK_SIZE = 400;
const MATCH_METHODS = new Set([
  'UNIQUE_VALID_CUIL',
  'UNIQUE_DNI_BACKUP',
  'DUPLICATE_VALID_CUIL_NAME',
  'DUPLICATE_DNI_NAME',
  'DOCUMENT_CANDIDATE',
  'NAME_BIRTHDATE_SIGNAL',
  'NAME_ONLY_SIGNAL',
]);
const EVIDENCE_LEVELS = new Set(['STRONG', 'ASSISTED', 'CONFLICT', 'INSUFFICIENT']);
const DNI_BACKUP_METHODS = new Set(['UNIQUE_DNI_BACKUP', 'DUPLICATE_DNI_NAME']);
const DOCUMENT_STATES = new Set(['MATCH', 'CONFLICT', 'MISSING']);
const NAME_STATES = new Set(['MATCH', 'DIFFERENT', 'MISSING']);
const PRIORITIES = new Set(['DOCUMENT_CONFLICT', 'MANUAL_REVIEW', 'STANDARD']);

const MANIFEST_KEYS = [
  'recordType', 'schemaVersion', 'runSchemaVersion', 'materializerVersion',
  'matcherVersion', 'evidencePolicyVersion', 'encryptionKeyVersion', 'tenantId',
  'runId', 'runDigest', 'semanticDigest', 'snapshotAsOf', 'grhSourceSha256',
  'personasSourceSha256', 'counts', 'allPending', 'autoApprovalAllowed',
  'crosswalkPublished',
];
const CASE_KEYS = [
  'recordType', 'tenantId', 'runId', 'caseKey', 'grhRef', 'classification',
  'reviewLane', 'status', 'tierKey', 'priority', 'optionCount',
  'documentConflict', 'birthDateConflict', 'nameSupport', 'evidenceDigest',
  'evidenceEnvelope',
];
const OPTION_KEYS = [
  'recordType', 'tenantId', 'runId', 'caseKey', 'optionKey', 'pairRef',
  'personasRef', 'rank', 'matchMethod', 'evidenceLevel', 'status',
  'cuilEvidence', 'dniEvidence', 'nameEvidence', 'birthDateEvidence',
  'requiresManualCheck', 'evidenceDigest', 'evidenceEnvelope',
];
const ENVELOPE_KEYS = ['schemaVersion', 'keyVersion', 'algorithm', 'iv', 'ciphertext', 'tag'];

export class GrhPersonasReviewPublisherError extends Error {
  constructor(code) {
    super(code);
    this.name = 'GrhPersonasReviewPublisherError';
    this.code = code;
  }
}

function fail(code) {
  throw new GrhPersonasReviewPublisherError(code);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function expectedDniEvidenceLevel(row) {
  if (!DNI_BACKUP_METHODS.has(row.matchMethod)) return null;
  const hasConflict = [row.cuilEvidence, row.dniEvidence, row.birthDateEvidence].includes('CONFLICT');
  const hasIndependentSupport = row.nameEvidence === 'MATCH' || row.birthDateEvidence === 'MATCH';
  return hasConflict ? 'CONFLICT' : hasIndependentSupport ? 'ASSISTED' : 'INSUFFICIENT';
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256Json(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function decodeKey(value, code = 'REVIEW_KEY_INVALID') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(value)) fail(code);
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== 32 || decoded.toString('base64url') !== value) fail(code);
  return decoded;
}

function decodeReviewKeyPair(hmacKey, evidenceKey) {
  let hmacKeyBytes;
  let evidenceKeyBytes;
  try {
    hmacKeyBytes = Buffer.isBuffer(hmacKey)
      ? Buffer.from(hmacKey)
      : decodeKey(hmacKey, 'REVIEW_HMAC_KEY_INVALID');
    evidenceKeyBytes = Buffer.isBuffer(evidenceKey)
      ? Buffer.from(evidenceKey)
      : decodeKey(evidenceKey, 'REVIEW_EVIDENCE_KEY_INVALID');
    if (hmacKeyBytes.length !== 32 || evidenceKeyBytes.length !== 32) fail('REVIEW_KEY_INVALID');
    if (timingSafeEqual(hmacKeyBytes, evidenceKeyBytes)) fail('REVIEW_KEY_REUSE_FORBIDDEN');
    return { hmacKeyBytes, evidenceKeyBytes };
  } catch (error) {
    hmacKeyBytes?.fill(0);
    evidenceKeyBytes?.fill(0);
    throw error;
  }
}

function decodeBase64url(value, bytes, code) {
  if (typeof value !== 'string' || !BASE64URL.test(value)) fail(code);
  const decoded = Buffer.from(value, 'base64url');
  if ((bytes && decoded.length !== bytes) || decoded.toString('base64url') !== value) fail(code);
  return decoded;
}

function hmacRef(key, domain, ...parts) {
  const values = [domain, ...parts];
  if (values.some(value => typeof value !== 'string' || !value || value.includes('\0'))) {
    fail('REVIEW_HMAC_INPUT_INVALID');
  }
  return createHmac('sha256', key).update(values.join('\0'), 'utf8').digest('hex');
}

function uuidBytes(value) {
  return Buffer.from(value.replaceAll('-', ''), 'hex');
}

export function uuidV5(namespace, name) {
  if (!UUID.test(namespace) || typeof name !== 'string' || !name) fail('REVIEW_RUN_ID_INVALID');
  const bytes = createHash('sha1')
    .update(uuidBytes(namespace))
    .update(Buffer.from(name, 'utf8'))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validatePersonEvidence(value, recordType) {
  const expectedSchema = recordType === 'case'
    ? 'grh-personas-review-case-evidence-v1'
    : 'grh-personas-review-option-evidence-v1';
  if (!exactKeys(value, ['schemaVersion', 'person']) || value.schemaVersion !== expectedSchema ||
      !exactKeys(value.person, ['displayName', 'birthDate', 'documents']) ||
      !exactKeys(value.person.documents, ['cuil', 'dni'])) {
    fail('REVIEW_EVIDENCE_PLAINTEXT_INVALID');
  }
  const { displayName, birthDate, documents } = value.person;
  if (displayName !== null && (typeof displayName !== 'string' || !displayName.trim() ||
      displayName.trim() !== displayName || displayName.length > 200 || /[\u0000-\u001f\u007f]/u.test(displayName))) {
    fail('REVIEW_EVIDENCE_PLAINTEXT_INVALID');
  }
  if (birthDate !== null) {
    if (typeof birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(birthDate)) {
      fail('REVIEW_EVIDENCE_PLAINTEXT_INVALID');
    }
    const time = Date.parse(`${birthDate}T00:00:00.000Z`);
    const minimum = Date.parse('1900-01-02T00:00:00.000Z');
    const maximum = Date.parse('2026-08-06T00:00:00.000Z');
    if (!Number.isFinite(time) || time < minimum || time > maximum ||
        ['1900-01-01', '1992-12-31', '1111-11-11'].includes(birthDate)) {
      fail('REVIEW_EVIDENCE_PLAINTEXT_INVALID');
    }
  }
  if (documents.cuil !== null && !/^\d{11}$/u.test(documents.cuil)) {
    fail('REVIEW_EVIDENCE_PLAINTEXT_INVALID');
  }
  if (documents.dni !== null && !/^\d{6,8}$/u.test(documents.dni)) {
    fail('REVIEW_EVIDENCE_PLAINTEXT_INVALID');
  }
}

export function decryptEvidenceEnvelope({
  envelope,
  key,
  tenantId,
  runId,
  caseKey,
  recordType,
  stableKey,
} = {}) {
  if (!exactKeys(envelope, ENVELOPE_KEYS) ||
      envelope.schemaVersion !== 'grh-personas-review-envelope-v1' ||
      envelope.keyVersion !== 'v1' || envelope.algorithm !== 'A256GCM' ||
      !TENANT.test(tenantId || '') || !UUID.test(runId || '') ||
      (recordType === 'case' ? !SHA256.test(caseKey || '') : caseKey !== null) ||
      !['case', 'option'].includes(recordType) || !SHA256.test(stableKey || '')) {
    fail('REVIEW_EVIDENCE_ENVELOPE_INVALID');
  }
  const decodedKey = Buffer.isBuffer(key) ? Buffer.from(key) : decodeKey(key);
  if (decodedKey.length !== 32) fail('REVIEW_KEY_INVALID');
  const iv = decodeBase64url(envelope.iv, 12, 'REVIEW_EVIDENCE_ENVELOPE_INVALID');
  const tag = decodeBase64url(envelope.tag, 16, 'REVIEW_EVIDENCE_ENVELOPE_INVALID');
  const ciphertext = decodeBase64url(envelope.ciphertext, null, 'REVIEW_EVIDENCE_ENVELOPE_INVALID');
  if (!ciphertext.length || ciphertext.length > 8 * 1024) fail('REVIEW_EVIDENCE_ENVELOPE_INVALID');
  const aad = canonicalJson({
    caseKey,
    keyVersion: 'v1',
    recordType,
    runId,
    stableKey,
    tenantId,
  });
  let plaintext;
  try {
    const decipher = createDecipheriv('aes-256-gcm', decodedKey, iv, { authTagLength: 16 });
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    fail('REVIEW_EVIDENCE_AUTH_INVALID');
  } finally {
    decodedKey.fill(0);
  }
  let parsed;
  try {
    parsed = JSON.parse(plaintext.toString('utf8'));
  } catch {
    fail('REVIEW_EVIDENCE_PLAINTEXT_INVALID');
  } finally {
    plaintext?.fill(0);
  }
  validatePersonEvidence(parsed, recordType);
  return parsed;
}

function evidenceDigest(key, recordType, plaintext) {
  return hmacRef(
    key,
    'grh-personas-review:evidence-digest:v1',
    recordType,
    canonicalJson(plaintext),
  );
}

function manifestIsValid(manifest) {
  return exactKeys(manifest, MANIFEST_KEYS) &&
    manifest.recordType === 'manifest' &&
    manifest.schemaVersion === 'grh-personas-review-stream-v1' &&
    manifest.runSchemaVersion === 'grh-personas-review-run-v1' &&
    manifest.materializerVersion === 'grh-personas-review-materializer-v2' &&
    manifest.matcherVersion === 'grh-personas-linkage-matcher-v1' &&
    manifest.evidencePolicyVersion === 'grh-personas-review-evidence-v2' &&
    manifest.encryptionKeyVersion === 'v1' && TENANT.test(manifest.tenantId || '') &&
    UUID.test(manifest.runId || '') && SHA256.test(manifest.runDigest || '') &&
    SHA256.test(manifest.semanticDigest || '') && /^\d{4}-\d{2}-\d{2}$/u.test(manifest.snapshotAsOf || '') &&
    SHA256.test(manifest.grhSourceSha256 || '') && SHA256.test(manifest.personasSourceSha256 || '') &&
    exactKeys(manifest.counts, Object.keys(EXPECTED_COUNTS)) &&
    Object.entries(EXPECTED_COUNTS).every(([key, value]) => manifest.counts[key] === value) &&
    manifest.allPending === true && manifest.autoApprovalAllowed === false &&
    manifest.crosswalkPublished === false &&
    manifest.snapshotAsOf === PINNED_SOURCE.snapshotAsOf &&
    manifest.grhSourceSha256 === PINNED_SOURCE.grhSourceSha256 &&
    manifest.personasSourceSha256 === PINNED_SOURCE.personasSourceSha256;
}

function semanticCase(row) {
  return {
    recordType: 'case',
    grhRef: row.grhRef,
    classification: row.classification,
    reviewLane: row.reviewLane,
    tierKey: row.tierKey,
    priority: row.priority,
    optionCount: row.optionCount,
    documentConflict: row.documentConflict,
    birthDateConflict: row.birthDateConflict,
    nameSupport: row.nameSupport,
    evidenceDigest: row.evidenceDigest,
  };
}

function semanticOption(row, grhRef) {
  return {
    recordType: 'option',
    grhRef,
    personasRef: row.personasRef,
    rank: row.rank,
    matchMethod: row.matchMethod,
    evidenceLevel: row.evidenceLevel,
    cuilEvidence: row.cuilEvidence,
    dniEvidence: row.dniEvidence,
    nameEvidence: row.nameEvidence,
    birthDateEvidence: row.birthDateEvidence,
    requiresManualCheck: row.requiresManualCheck,
    evidenceDigest: row.evidenceDigest,
  };
}

export function inspectReviewBundle({ manifest, records, hmacKey, evidenceKey } = {}) {
  if (!manifestIsValid(manifest) || !Array.isArray(records) ||
      records.length !== EXPECTED_COUNTS.totalCaseCount + EXPECTED_COUNTS.totalOptionCount) {
    fail('REVIEW_STREAM_INVALID');
  }
  const { hmacKeyBytes, evidenceKeyBytes } = decodeReviewKeyPair(hmacKey, evidenceKey);
  const cases = records.filter(record => record?.recordType === 'case');
  const options = records.filter(record => record?.recordType === 'option');
  if (cases.length !== EXPECTED_COUNTS.totalCaseCount || options.length !== EXPECTED_COUNTS.totalOptionCount) {
    fail('REVIEW_STREAM_INVALID');
  }
  const casesByKey = new Map();
  const grhRefs = new Set();
  const optionKeys = new Set();
  const pairRefs = new Set();
  const personasRefs = new Set();
  const optionsByCase = new Map();
  let documentConflicts = 0;
  let candidates = 0;
  let ambiguous = 0;
  let unmatched = 0;
  try {
    for (const row of cases) {
      if (!exactKeys(row, CASE_KEYS) || row.tenantId !== manifest.tenantId || row.runId !== manifest.runId ||
          !SHA256.test(row.caseKey || '') || !SHA256.test(row.grhRef || '') ||
          !['CANDIDATE', 'AMBIGUOUS', 'UNMATCHED'].includes(row.classification) ||
          row.status !== 'PENDING' || !PRIORITIES.has(row.priority) ||
          !Number.isSafeInteger(row.optionCount) || row.optionCount < 0 ||
          typeof row.documentConflict !== 'boolean' || typeof row.birthDateConflict !== 'boolean' ||
          typeof row.nameSupport !== 'boolean' || !SHA256.test(row.evidenceDigest || '') ||
          casesByKey.has(row.caseKey) || grhRefs.has(row.grhRef) ||
          hmacRef(hmacKeyBytes, 'grh-personas-review:case-key:v1', manifest.tenantId, row.grhRef) !== row.caseKey) {
        fail('REVIEW_CASE_INVALID');
      }
      const laneValid = row.classification === 'CANDIDATE'
        ? Object.keys({
          unique_valid_cuil: 1,
          unique_dni_backup: 1,
          duplicate_valid_cuil_unique_name: 1,
          duplicate_dni_unique_name: 1,
        }).includes(row.reviewLane) && row.tierKey === row.reviewLane
        : row.classification === 'AMBIGUOUS'
          ? ['document_candidate', 'name_only_signal', 'name_birthdate_signal'].includes(row.reviewLane) && row.tierKey === null
          : row.reviewLane === 'unmatched' && row.tierKey === null;
      if (!laneValid) fail('REVIEW_CASE_INVALID');
      const plaintext = decryptEvidenceEnvelope({
        envelope: row.evidenceEnvelope,
        key: evidenceKeyBytes,
        tenantId: row.tenantId,
        runId: row.runId,
        caseKey: row.caseKey,
        recordType: 'case',
        stableKey: row.caseKey,
      });
      if (evidenceDigest(hmacKeyBytes, 'case', plaintext) !== row.evidenceDigest) {
        fail('REVIEW_EVIDENCE_DIGEST_INVALID');
      }
      casesByKey.set(row.caseKey, row);
      grhRefs.add(row.grhRef);
      optionsByCase.set(row.caseKey, []);
      candidates += Number(row.classification === 'CANDIDATE');
      ambiguous += Number(row.classification === 'AMBIGUOUS');
      unmatched += Number(row.classification === 'UNMATCHED');
      documentConflicts += Number(row.documentConflict);
    }
    for (const row of options) {
      const reviewCase = casesByKey.get(row?.caseKey);
      if (!exactKeys(row, OPTION_KEYS) || row.tenantId !== manifest.tenantId || row.runId !== manifest.runId ||
          !reviewCase || !SHA256.test(row.optionKey || '') || !SHA256.test(row.pairRef || '') ||
          !SHA256.test(row.personasRef || '') || !Number.isSafeInteger(row.rank) || row.rank < 1 ||
          !MATCH_METHODS.has(row.matchMethod) || !EVIDENCE_LEVELS.has(row.evidenceLevel) ||
          row.status !== 'PENDING' || !DOCUMENT_STATES.has(row.cuilEvidence) ||
          !DOCUMENT_STATES.has(row.dniEvidence) || !NAME_STATES.has(row.nameEvidence) ||
          !DOCUMENT_STATES.has(row.birthDateEvidence) || row.requiresManualCheck !== true ||
          !SHA256.test(row.evidenceDigest || '') || optionKeys.has(row.optionKey) ||
          pairRefs.has(row.pairRef) || personasRefs.has(row.personasRef)) {
        fail('REVIEW_OPTION_INVALID');
      }
      const expectedLevel = expectedDniEvidenceLevel(row);
      if (expectedLevel !== null && row.evidenceLevel !== expectedLevel) fail('REVIEW_OPTION_INVALID');
      const expectedPair = hmacRef(
        hmacKeyBytes,
        'grh-personas-review:pair-ref:v1',
        manifest.tenantId,
        reviewCase.grhRef,
        row.personasRef,
      );
      const expectedOption = hmacRef(
        hmacKeyBytes,
        'grh-personas-review:option-key:v1',
        manifest.tenantId,
        expectedPair,
      );
      if (expectedPair !== row.pairRef || expectedOption !== row.optionKey) fail('REVIEW_OPTION_INVALID');
      const plaintext = decryptEvidenceEnvelope({
        envelope: row.evidenceEnvelope,
        key: evidenceKeyBytes,
        tenantId: row.tenantId,
        runId: row.runId,
        caseKey: null,
        recordType: 'option',
        stableKey: row.optionKey,
      });
      if (evidenceDigest(hmacKeyBytes, 'option', plaintext) !== row.evidenceDigest) {
        fail('REVIEW_EVIDENCE_DIGEST_INVALID');
      }
      optionKeys.add(row.optionKey);
      pairRefs.add(row.pairRef);
      personasRefs.add(row.personasRef);
      optionsByCase.get(row.caseKey).push(row);
    }
  } finally {
    hmacKeyBytes.fill(0);
    evidenceKeyBytes.fill(0);
  }
  for (const [caseKey, reviewCase] of casesByKey) {
    const caseOptions = optionsByCase.get(caseKey).sort((left, right) => left.rank - right.rank);
    if (caseOptions.length !== reviewCase.optionCount ||
        caseOptions.some((row, index) => row.rank !== index + 1) ||
        (reviewCase.classification === 'CANDIDATE' && caseOptions.length !== 1) ||
        (reviewCase.classification === 'AMBIGUOUS' && caseOptions.length < 1) ||
        (reviewCase.classification === 'UNMATCHED' && caseOptions.length !== 0)) {
      fail('REVIEW_CASE_OPTION_PARTITION_INVALID');
    }
  }
  const observed = {
    totalCaseCount: cases.length,
    totalOptionCount: options.length,
    candidateCaseCount: candidates,
    ambiguousCaseCount: ambiguous,
    unmatchedCaseCount: unmatched,
    documentConflictCount: documentConflicts,
    autoApprovedCount: 0,
  };
  if (!Object.entries(EXPECTED_COUNTS).every(([key, value]) => observed[key] === value)) {
    fail('REVIEW_COUNTS_INVALID');
  }
  const semanticCases = cases.map(semanticCase).sort((left, right) => left.grhRef.localeCompare(right.grhRef));
  const semanticOptions = options.map(row => semanticOption(row, casesByKey.get(row.caseKey).grhRef))
    .sort((left, right) => left.personasRef.localeCompare(right.personasRef) ||
      left.grhRef.localeCompare(right.grhRef) || left.rank - right.rank);
  const semanticDigest = sha256Json([...semanticCases, ...semanticOptions]);
  if (semanticDigest !== manifest.semanticDigest) fail('REVIEW_SEMANTIC_DIGEST_INVALID');
  const runDigest = sha256Json({
    schemaVersion: manifest.runSchemaVersion,
    tenantId: manifest.tenantId,
    snapshotAsOf: manifest.snapshotAsOf,
    grhSourceSha256: manifest.grhSourceSha256,
    personasSourceSha256: manifest.personasSourceSha256,
    matcherVersion: manifest.matcherVersion,
    evidencePolicyVersion: manifest.evidencePolicyVersion,
    ...observed,
    semanticDigest,
  });
  if (runDigest !== manifest.runDigest || uuidV5(RUN_UUID_NAMESPACE, runDigest) !== manifest.runId) {
    fail('REVIEW_RUN_IDENTITY_INVALID');
  }
  return Object.freeze({
    manifest: structuredClone(manifest),
    cases: cases.map(row => structuredClone(row)),
    options: options.map(row => structuredClone(row)),
  });
}

export function parseReviewStream(raw, { hmacKey, evidenceKey } = {}) {
  if (typeof raw !== 'string' || !raw || Buffer.byteLength(raw, 'utf8') > MAX_STREAM_BYTES) {
    fail('REVIEW_STREAM_INVALID');
  }
  let lines;
  try {
    lines = raw.split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line));
  } catch {
    fail('REVIEW_STREAM_INVALID');
  }
  if (lines.length < 2 || lines[0]?.recordType !== 'manifest') fail('REVIEW_STREAM_INVALID');
  return inspectReviewBundle({ manifest: lines[0], records: lines.slice(1), hmacKey, evidenceKey });
}

export async function runMaterializer({
  tenantId,
  grhSource,
  personasSource,
  grhManifest = path.join(REPO_ROOT, 'config', 'grh-source-manifest.json'),
  personasManifest = path.join(REPO_ROOT, 'config', 'personas-source-manifest.json'),
  hmacKey,
  evidenceKey,
  python = 'python',
  runtimeEnvironment = process.env,
  spawnImpl = spawn,
} = {}) {
  if (!TENANT.test(tenantId || '') || !grhSource || !personasSource) fail('REVIEW_ARGUMENT_INVALID');
  return new Promise((resolve, reject) => {
    const childEnvironment = Object.fromEntries([
      'PATH', 'Path', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP',
    ].filter(name => typeof runtimeEnvironment[name] === 'string')
      .map(name => [name, runtimeEnvironment[name]]));
    Object.assign(childEnvironment, {
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
      [HMAC_KEY_ENV]: hmacKey,
      [EVIDENCE_KEY_ENV]: evidenceKey,
    });
    const child = spawnImpl(python, [
      path.join(REPO_ROOT, 'scripts', 'build_grh_personas_review.py'),
      '--tenant-id', tenantId,
      '--grh-source', path.resolve(grhSource),
      '--personas-source', path.resolve(personasSource),
      '--grh-manifest', path.resolve(grhManifest),
      '--personas-manifest', path.resolve(personasManifest),
    ], {
      cwd: REPO_ROOT,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: childEnvironment,
    });
    const stdout = [];
    let stdoutBytes = 0;
    child.stdout.on('data', chunk => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_STREAM_BYTES) {
        child.kill();
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', () => {});
    child.once('error', () => reject(new GrhPersonasReviewPublisherError('REVIEW_MATERIALIZER_FAILED')));
    child.once('close', code => {
      if (code !== 0 || stdoutBytes > MAX_STREAM_BYTES) {
        reject(new GrhPersonasReviewPublisherError('REVIEW_MATERIALIZER_FAILED'));
        return;
      }
      try {
        resolve(parseReviewStream(Buffer.concat(stdout).toString('utf8'), { hmacKey, evidenceKey }));
      } catch (error) {
        reject(error);
      }
    });
  });
}

export const FIND_READY_RUN_SQL = `SELECT run_id, schema_version, matcher_version,
       evidence_policy_version, encryption_key_version, snapshot_as_of::text,
       grh_source_sha256, personas_source_sha256, semantic_digest, run_digest,
       total_case_count, total_option_count, candidate_case_count,
       ambiguous_case_count, unmatched_case_count, document_conflict_count,
       auto_approved_count, status
  FROM grh_personas_review_runs
 WHERE tenant_id = $1 AND status = 'READY'
 ORDER BY published_at DESC NULLS LAST, created_at DESC
 FOR UPDATE`;

export const DETECT_CANONICAL_LINKAGE_SQL = `SELECT
       to_regclass('public.crosswalk_persona') IS NOT NULL AS has_crosswalk_persona,
       to_regclass('public.source_xref') IS NOT NULL AS has_source_xref`;

export const READ_CANONICAL_LINKAGE_PREFLIGHT_SQL = `WITH active_links AS (
  SELECT cw.match_method, cw.reviewed_at
    FROM public.crosswalk_persona cw
    JOIN public.source_xref sx
      ON sx.source_system = 'PERSONAS'
     AND sx.source_entity = cw.personas_source_entity
     AND sx.source_id = cw.personas_source_id
     AND sx.canonical_entity = 'person_identity'
     AND sx.canonical_id = cw.person_id
     AND sx.valid_to IS NULL
   WHERE cw.valid_to IS NULL
     AND cw.match_status = 'matched'
)
SELECT COUNT(*)::int AS active_link_count,
       COUNT(*) FILTER (WHERE reviewed_at IS NULL)::int AS unreviewed_active_link_count,
       COUNT(*) FILTER (WHERE match_method = 'cuil_unique')::int AS cuil_unique_count,
       COUNT(*) FILTER (WHERE match_method = 'cuil_duplicate_resolved')::int AS duplicate_cuil_count,
       COUNT(*) FILTER (WHERE match_method = 'dni_unique')::int AS dni_unique_count,
       COUNT(*) FILTER (WHERE match_method = 'dni_duplicate_resolved')::int AS duplicate_dni_count
  FROM active_links`;

export const FIND_RUN_BY_DIGEST_SQL = `SELECT run_id, status
  FROM grh_personas_review_runs
 WHERE tenant_id = $1 AND run_digest = $2
 FOR UPDATE`;

export const LOCK_ACTIVE_CASES_SQL = `SELECT case_key, status
  FROM grh_personas_review_cases
 WHERE tenant_id = $1 AND run_id = $2
 FOR UPDATE`;

export const COUNT_ACTIVE_EVENTS_SQL = `SELECT COUNT(*)::int AS event_count
  FROM grh_personas_review_events
 WHERE tenant_id = $1 AND run_id = $2`;

export const RETIRE_RUN_SQL = `UPDATE grh_personas_review_runs
   SET status = 'RETIRED'
 WHERE tenant_id = $1 AND run_id = $2 AND status = 'READY'`;

export const INSERT_RUN_SQL = `INSERT INTO grh_personas_review_runs
  (run_id, tenant_id, schema_version, matcher_version, evidence_policy_version,
   encryption_key_version, snapshot_as_of, grh_source_sha256,
   personas_source_sha256, semantic_digest, run_digest, total_case_count,
   total_option_count, candidate_case_count, ambiguous_case_count,
   unmatched_case_count, document_conflict_count, auto_approved_count,
   status, created_at, published_at)
 VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,0,
         'READY',clock_timestamp(),clock_timestamp())`;

export const INSERT_CASES_SQL = `INSERT INTO grh_personas_review_cases
  (tenant_id, run_id, case_key, grh_ref, kind, status, priority,
   evidence_envelope, evidence_digest, document_conflict,
   birth_date_conflict, name_support, option_count, version, created_at, updated_at)
 SELECT $1,$2,x.case_key,x.grh_ref,x.kind,'PENDING',x.priority,
        x.evidence_envelope,x.evidence_digest,x.document_conflict,
        x.birth_date_conflict,x.name_support,x.option_count,1,
        clock_timestamp(),clock_timestamp()
   FROM jsonb_to_recordset($3::jsonb) AS x(
     case_key text, grh_ref text, kind text, priority text,
     evidence_envelope jsonb, evidence_digest text, document_conflict boolean,
     birth_date_conflict boolean, name_support boolean, option_count integer)`;

export const INSERT_OPTIONS_SQL = `INSERT INTO grh_personas_review_options
  (tenant_id, run_id, case_key, option_key, pair_ref, personas_ref, rank,
   match_method, evidence_level, evidence_envelope, evidence_digest,
   cuil_evidence, dni_evidence, name_evidence, birth_date_evidence,
   requires_manual_check, created_at)
 SELECT $1,$2,x.case_key,x.option_key,x.pair_ref,x.personas_ref,x.rank,
        x.match_method,x.evidence_level,x.evidence_envelope,x.evidence_digest,
        x.cuil_evidence,x.dni_evidence,x.name_evidence,x.birth_date_evidence,
        TRUE,clock_timestamp()
   FROM jsonb_to_recordset($3::jsonb) AS x(
     case_key text, option_key text, pair_ref text, personas_ref text, rank integer,
     match_method text, evidence_level text, evidence_envelope jsonb,
     evidence_digest text, cuil_evidence text, dni_evidence text,
     name_evidence text, birth_date_evidence text)`;

export const READBACK_SQL = `SELECT r.run_id, r.run_digest, r.semantic_digest, r.status,
       r.total_case_count, r.total_option_count, r.candidate_case_count,
       r.ambiguous_case_count, r.unmatched_case_count,
       r.document_conflict_count, r.auto_approved_count,
       (SELECT COUNT(*)::int FROM grh_personas_review_cases c
         WHERE c.tenant_id=r.tenant_id AND c.run_id=r.run_id) AS observed_case_count,
       (SELECT COUNT(*)::int FROM grh_personas_review_options o
         WHERE o.tenant_id=r.tenant_id AND o.run_id=r.run_id) AS observed_option_count,
       (SELECT COUNT(*)::int FROM grh_personas_review_cases c
         WHERE c.tenant_id=r.tenant_id AND c.run_id=r.run_id AND c.status='PENDING') AS pending_case_count,
       (SELECT COUNT(*)::int FROM grh_personas_review_cases c
         WHERE c.tenant_id=r.tenant_id AND c.run_id=r.run_id AND c.kind='CANDIDATE') AS observed_candidate_count,
       (SELECT COUNT(*)::int FROM grh_personas_review_cases c
         WHERE c.tenant_id=r.tenant_id AND c.run_id=r.run_id AND c.kind='AMBIGUOUS') AS observed_ambiguous_count,
       (SELECT COUNT(*)::int FROM grh_personas_review_cases c
         WHERE c.tenant_id=r.tenant_id AND c.run_id=r.run_id AND c.kind='UNMATCHED') AS observed_unmatched_count,
       (SELECT COUNT(*)::int FROM grh_personas_review_cases c
         WHERE c.tenant_id=r.tenant_id AND c.run_id=r.run_id AND c.document_conflict) AS observed_document_conflict_count,
       (SELECT COUNT(*)::int - COUNT(DISTINCT personas_ref)::int
          FROM grh_personas_review_options o
         WHERE o.tenant_id=r.tenant_id AND o.run_id=r.run_id) AS target_collision_count,
       (SELECT COUNT(*)::int FROM grh_personas_review_options o
         WHERE o.tenant_id=r.tenant_id AND o.run_id=r.run_id AND o.requires_manual_check) AS manual_option_count
  FROM grh_personas_review_runs r
 WHERE r.tenant_id=$1 AND r.run_id=$2`;

export const READBACK_CASES_SQL = `SELECT case_key, grh_ref, kind, status, priority,
       evidence_envelope, evidence_digest, document_conflict,
       birth_date_conflict, name_support, option_count, version,
       selected_option_key, selected_personas_ref, reason_code,
       decided_by_user_id, decided_at
  FROM grh_personas_review_cases
 WHERE tenant_id=$1 AND run_id=$2
 ORDER BY case_key`;

export const READBACK_OPTIONS_SQL = `SELECT case_key, option_key, pair_ref, personas_ref,
       rank, match_method, evidence_level, evidence_envelope, evidence_digest,
       cuil_evidence, dni_evidence, name_evidence, birth_date_evidence,
       requires_manual_check
  FROM grh_personas_review_options
 WHERE tenant_id=$1 AND run_id=$2
 ORDER BY case_key, rank, option_key`;

function chunk(values, size = CHUNK_SIZE) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function runMatchesManifest(row, manifest) {
  return row && row.run_id === manifest.runId && row.run_digest === manifest.runDigest &&
    row.semantic_digest === manifest.semanticDigest && row.schema_version === manifest.runSchemaVersion &&
    row.matcher_version === manifest.matcherVersion &&
    row.evidence_policy_version === manifest.evidencePolicyVersion &&
    row.encryption_key_version === manifest.encryptionKeyVersion &&
    String(row.snapshot_as_of).slice(0, 10) === manifest.snapshotAsOf &&
    row.grh_source_sha256 === manifest.grhSourceSha256 &&
    row.personas_source_sha256 === manifest.personasSourceSha256 &&
    row.total_case_count === manifest.counts.totalCaseCount &&
    row.total_option_count === manifest.counts.totalOptionCount &&
    row.candidate_case_count === manifest.counts.candidateCaseCount &&
    row.ambiguous_case_count === manifest.counts.ambiguousCaseCount &&
    row.unmatched_case_count === manifest.counts.unmatchedCaseCount &&
    row.document_conflict_count === manifest.counts.documentConflictCount &&
    row.auto_approved_count === 0 && row.status === 'READY';
}

function readbackMatches(row, manifest, { requireAllPending = true } = {}) {
  return row && row.run_id === manifest.runId && row.run_digest === manifest.runDigest &&
    row.semantic_digest === manifest.semanticDigest && row.status === 'READY' &&
    row.total_case_count === EXPECTED_COUNTS.totalCaseCount &&
    row.total_option_count === EXPECTED_COUNTS.totalOptionCount &&
    row.candidate_case_count === EXPECTED_COUNTS.candidateCaseCount &&
    row.ambiguous_case_count === EXPECTED_COUNTS.ambiguousCaseCount &&
    row.unmatched_case_count === EXPECTED_COUNTS.unmatchedCaseCount &&
    row.document_conflict_count === EXPECTED_COUNTS.documentConflictCount &&
    row.auto_approved_count === 0 &&
    row.observed_case_count === EXPECTED_COUNTS.totalCaseCount &&
    row.observed_option_count === EXPECTED_COUNTS.totalOptionCount &&
    (!requireAllPending || row.pending_case_count === EXPECTED_COUNTS.totalCaseCount) &&
    row.observed_candidate_count === EXPECTED_COUNTS.candidateCaseCount &&
    row.observed_ambiguous_count === EXPECTED_COUNTS.ambiguousCaseCount &&
    row.observed_unmatched_count === EXPECTED_COUNTS.unmatchedCaseCount &&
    row.observed_document_conflict_count === EXPECTED_COUNTS.documentConflictCount &&
    row.target_collision_count === 0 && row.manual_option_count === EXPECTED_COUNTS.totalOptionCount;
}

function caseInsertRow(row) {
  return {
    case_key: row.caseKey,
    grh_ref: row.grhRef,
    kind: row.classification,
    priority: row.priority,
    evidence_envelope: row.evidenceEnvelope,
    evidence_digest: row.evidenceDigest,
    document_conflict: row.documentConflict,
    birth_date_conflict: row.birthDateConflict,
    name_support: row.nameSupport,
    option_count: row.optionCount,
  };
}

function optionInsertRow(row) {
  return {
    case_key: row.caseKey,
    option_key: row.optionKey,
    pair_ref: row.pairRef,
    personas_ref: row.personasRef,
    rank: row.rank,
    match_method: row.matchMethod,
    evidence_level: row.evidenceLevel,
    evidence_envelope: row.evidenceEnvelope,
    evidence_digest: row.evidenceDigest,
    cuil_evidence: row.cuilEvidence,
    dni_evidence: row.dniEvidence,
    name_evidence: row.nameEvidence,
    birth_date_evidence: row.birthDateEvidence,
  };
}

function persistedCase(row) {
  return {
    case_key: row.caseKey,
    grh_ref: row.grhRef,
    kind: row.classification,
    priority: row.priority,
    evidence_envelope: row.evidenceEnvelope,
    evidence_digest: row.evidenceDigest,
    document_conflict: row.documentConflict,
    birth_date_conflict: row.birthDateConflict,
    name_support: row.nameSupport,
    option_count: row.optionCount,
  };
}

function persistedOption(row) {
  return {
    case_key: row.caseKey,
    option_key: row.optionKey,
    pair_ref: row.pairRef,
    personas_ref: row.personasRef,
    rank: row.rank,
    match_method: row.matchMethod,
    evidence_level: row.evidenceLevel,
    evidence_envelope: row.evidenceEnvelope,
    evidence_digest: row.evidenceDigest,
    cuil_evidence: row.cuilEvidence,
    dni_evidence: row.dniEvidence,
    name_evidence: row.nameEvidence,
    birth_date_evidence: row.birthDateEvidence,
    requires_manual_check: true,
  };
}

function normalizeDatabaseValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeDatabaseValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeDatabaseValue(item)]));
}

async function assertContentReadback(client, bundle, code, { requireAllPending = true } = {}) {
  const [casesResult, optionsResult] = await Promise.all([
    client.query(READBACK_CASES_SQL, [bundle.manifest.tenantId, bundle.manifest.runId]),
    client.query(READBACK_OPTIONS_SQL, [bundle.manifest.tenantId, bundle.manifest.runId]),
  ]);
  const expectedCases = bundle.cases.map(persistedCase)
    .sort((left, right) => left.case_key.localeCompare(right.case_key));
  const expectedOptions = bundle.options.map(persistedOption)
    .sort((left, right) => left.case_key.localeCompare(right.case_key) ||
      left.rank - right.rank || left.option_key.localeCompare(right.option_key));
  const immutableCases = (casesResult.rows || []).map(row => ({
    case_key: row.case_key,
    grh_ref: row.grh_ref,
    kind: row.kind,
    priority: row.priority,
    evidence_envelope: row.evidence_envelope,
    evidence_digest: row.evidence_digest,
    document_conflict: row.document_conflict,
    birth_date_conflict: row.birth_date_conflict,
    name_support: row.name_support,
    option_count: row.option_count,
  }));
  if (casesResult.rows?.length !== expectedCases.length ||
      optionsResult.rows?.length !== expectedOptions.length ||
      canonicalJson(normalizeDatabaseValue(immutableCases)) !== canonicalJson(expectedCases) ||
      canonicalJson(normalizeDatabaseValue(optionsResult.rows)) !== canonicalJson(expectedOptions)) {
    fail(code);
  }
  const mutableStatesValid = casesResult.rows.every(row =>
    ['PENDING', 'DEFERRED', 'APPROVED', 'REJECTED'].includes(row.status) &&
    Number.isSafeInteger(row.version) && row.version >= 1);
  if (!mutableStatesValid || (requireAllPending && casesResult.rows.some(row =>
    row.status !== 'PENDING' || row.version !== 1 || row.selected_option_key !== null ||
    row.selected_personas_ref !== null || row.reason_code !== null ||
    row.decided_by_user_id !== null || row.decided_at !== null))) {
    fail(code);
  }
}

function assertPersistenceBundle(bundle) {
  if (!manifestIsValid(bundle?.manifest) || !Array.isArray(bundle?.cases) ||
      !Array.isArray(bundle?.options) ||
      bundle.cases.length !== EXPECTED_COUNTS.totalCaseCount ||
      bundle.options.length !== EXPECTED_COUNTS.totalOptionCount) {
    fail('REVIEW_PUBLICATION_INPUT_INVALID');
  }
  for (const row of bundle.cases) {
    if (!exactKeys(row, CASE_KEYS) || row.status !== 'PENDING' ||
        row.tenantId !== bundle.manifest.tenantId || row.runId !== bundle.manifest.runId ||
        !SHA256.test(row.caseKey || '') || !SHA256.test(row.grhRef || '') ||
        !exactKeys(row.evidenceEnvelope, ENVELOPE_KEYS) ||
        row.evidenceEnvelope.algorithm !== 'A256GCM' ||
        typeof row.evidenceEnvelope.ciphertext !== 'string') {
      fail('REVIEW_PUBLICATION_INPUT_INVALID');
    }
  }
  for (const row of bundle.options) {
    if (!exactKeys(row, OPTION_KEYS) || row.status !== 'PENDING' ||
        row.tenantId !== bundle.manifest.tenantId || row.runId !== bundle.manifest.runId ||
        !SHA256.test(row.caseKey || '') || !SHA256.test(row.optionKey || '') ||
        !SHA256.test(row.pairRef || '') || !SHA256.test(row.personasRef || '') ||
        row.requiresManualCheck !== true ||
        !exactKeys(row.evidenceEnvelope, ENVELOPE_KEYS) ||
        row.evidenceEnvelope.algorithm !== 'A256GCM' ||
        typeof row.evidenceEnvelope.ciphertext !== 'string' ||
        (expectedDniEvidenceLevel(row) !== null &&
          row.evidenceLevel !== expectedDniEvidenceLevel(row))) {
      fail('REVIEW_PUBLICATION_INPUT_INVALID');
    }
  }
}

async function assertCanonicalLinkagePreflight(client) {
  const detected = await client.query(DETECT_CANONICAL_LINKAGE_SQL);
  const presence = detected.rows?.[0];
  if (!presence || typeof presence.has_crosswalk_persona !== 'boolean' ||
      typeof presence.has_source_xref !== 'boolean' ||
      presence.has_crosswalk_persona !== presence.has_source_xref) {
    fail('REVIEW_CANONICAL_LINKAGE_PREFLIGHT_FAILED');
  }
  if (!presence.has_crosswalk_persona) return;

  const result = await client.query(READ_CANONICAL_LINKAGE_PREFLIGHT_SQL);
  const row = result.rows?.[0];
  const observed = row && {
    activeLinkCount: Number(row.active_link_count),
    cuilUniqueCount: Number(row.cuil_unique_count),
    duplicateCuilCount: Number(row.duplicate_cuil_count),
    dniUniqueCount: Number(row.dni_unique_count),
    duplicateDniCount: Number(row.duplicate_dni_count),
  };
  if (!observed || Number(row.unreviewed_active_link_count) !== 0 ||
      Object.entries(GOVERNED_CANONICAL_MATCH_COUNTS).some(([key, count]) =>
        !Number.isSafeInteger(observed[key]) || observed[key] !== count)) {
    fail('REVIEW_CANONICAL_LINKAGE_PREFLIGHT_FAILED');
  }
}

export async function publishReviewBundle({ bundle, client } = {}) {
  if (!client || typeof client.query !== 'function') {
    fail('REVIEW_PUBLICATION_INPUT_INVALID');
  }
  assertPersistenceBundle(bundle);
  const { manifest } = bundle;
  let transaction = false;
  let status = 'published';
  try {
    await assertCanonicalLinkagePreflight(client);
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    transaction = true;
    await client.query("SET LOCAL search_path TO public, pg_catalog");
    await client.query("SET LOCAL lock_timeout = '5000ms'");
    await client.query("SET LOCAL statement_timeout = '60000ms'");
    const tenant = await client.query(
      `SELECT id, status, "trialEndsAt" AS trial_ends_at FROM tenants WHERE id=$1 FOR SHARE`,
      [manifest.tenantId],
    );
    const tenantRow = tenant.rows?.length === 1 ? tenant.rows[0] : null;
    const tenantAccess = tenantRow && evaluateTenantAccess({
      status: tenantRow.status,
      trialEndsAt: tenantRow.trial_ends_at,
    });
    if (!tenantAccess?.allowed) {
      fail('REVIEW_TENANT_INVALID');
    }
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('grh-personas-review-publish-v1'),hashtext($1))",
      [manifest.tenantId],
    );
    const readyResult = await client.query(FIND_READY_RUN_SQL, [manifest.tenantId]);
    if ((readyResult.rows?.length || 0) > 1) fail('REVIEW_MULTIPLE_READY_RUNS');
    const current = readyResult.rows?.[0];
    if (current && current.run_digest === manifest.runDigest) {
      if (!runMatchesManifest(current, manifest)) fail('REVIEW_IDEMPOTENCY_CONFLICT');
      status = 'unchanged';
    } else {
      const existing = await client.query(FIND_RUN_BY_DIGEST_SQL, [manifest.tenantId, manifest.runDigest]);
      if (existing.rows?.length) fail('REVIEW_RETIRED_DIGEST_CONFLICT');
      if (current) {
        const lockedCases = await client.query(LOCK_ACTIVE_CASES_SQL, [manifest.tenantId, current.run_id]);
        const events = await client.query(COUNT_ACTIVE_EVENTS_SQL, [manifest.tenantId, current.run_id]);
        if (lockedCases.rows?.length !== current.total_case_count ||
            lockedCases.rows.some(row => row.status !== 'PENDING') ||
            events.rows?.[0]?.event_count !== 0) {
          fail('REVIEW_ACTIVE_RUN_HAS_DECISIONS');
        }
        const retired = await client.query(RETIRE_RUN_SQL, [manifest.tenantId, current.run_id]);
        if (retired.rowCount !== 1) fail('REVIEW_ACTIVE_RUN_CHANGED');
      }
      await client.query(INSERT_RUN_SQL, [
        manifest.runId,
        manifest.tenantId,
        manifest.runSchemaVersion,
        manifest.matcherVersion,
        manifest.evidencePolicyVersion,
        manifest.encryptionKeyVersion,
        manifest.snapshotAsOf,
        manifest.grhSourceSha256,
        manifest.personasSourceSha256,
        manifest.semanticDigest,
        manifest.runDigest,
        manifest.counts.totalCaseCount,
        manifest.counts.totalOptionCount,
        manifest.counts.candidateCaseCount,
        manifest.counts.ambiguousCaseCount,
        manifest.counts.unmatchedCaseCount,
        manifest.counts.documentConflictCount,
      ]);
      for (const rows of chunk(bundle.cases.map(caseInsertRow))) {
        await client.query(INSERT_CASES_SQL, [manifest.tenantId, manifest.runId, JSON.stringify(rows)]);
      }
      for (const rows of chunk(bundle.options.map(optionInsertRow))) {
        await client.query(INSERT_OPTIONS_SQL, [manifest.tenantId, manifest.runId, JSON.stringify(rows)]);
      }
    }
    const readback = await client.query(READBACK_SQL, [manifest.tenantId, manifest.runId]);
    const requireAllPending = status !== 'unchanged';
    if (readback.rows?.length !== 1 || !readbackMatches(readback.rows[0], manifest, { requireAllPending })) {
      fail('REVIEW_READBACK_MISMATCH');
    }
    await assertContentReadback(client, bundle, 'REVIEW_CONTENT_READBACK_MISMATCH', { requireAllPending });
    await client.query('COMMIT');
    transaction = false;
    const committed = await client.query(READBACK_SQL, [manifest.tenantId, manifest.runId]);
    if (committed.rows?.length !== 1 || !readbackMatches(committed.rows[0], manifest, { requireAllPending })) {
      fail('REVIEW_COMMIT_READBACK_MISMATCH');
    }
    await assertContentReadback(client, bundle, 'REVIEW_COMMIT_CONTENT_READBACK_MISMATCH', { requireAllPending });
    return Object.freeze({
      status,
      tenantId: manifest.tenantId,
      runId: manifest.runId,
      runDigest: manifest.runDigest,
      semanticDigest: manifest.semanticDigest,
      ...manifest.counts,
    });
  } catch (error) {
    if (transaction) await client.query('ROLLBACK').catch(() => {});
    throw error instanceof GrhPersonasReviewPublisherError
      ? error
      : new GrhPersonasReviewPublisherError('REVIEW_PUBLICATION_FAILED');
  }
}

function argument(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function receipt(bundle, status = 'validated') {
  return Object.freeze({
    status,
    tenantId: bundle.manifest.tenantId,
    runId: bundle.manifest.runId,
    runDigest: bundle.manifest.runDigest,
    semanticDigest: bundle.manifest.semanticDigest,
    snapshotAsOf: bundle.manifest.snapshotAsOf,
    grhSourceSha256: bundle.manifest.grhSourceSha256,
    personasSourceSha256: bundle.manifest.personasSourceSha256,
    ...bundle.manifest.counts,
    allPending: true,
    crosswalkPublished: false,
  });
}

export async function runCli({
  argv = process.argv.slice(2),
  environment = process.env,
  stdout = process.stdout,
  materializerRunner = runMaterializer,
  ClientImpl = Client,
} = {}) {
  const tenantId = argument(argv, '--tenant-id');
  const grhSource = argument(argv, '--grh-source');
  const personasSource = argument(argv, '--personas-source');
  const dryRun = argv.includes('--dry-run');
  const publish = argv.includes('--publish');
  if (!TENANT.test(tenantId || '') || !grhSource || !personasSource || dryRun === publish) {
    fail('REVIEW_ARGUMENT_INVALID');
  }
  const hmacKey = environment[HMAC_KEY_ENV];
  const evidenceKey = environment[EVIDENCE_KEY_ENV];
  const decodedKeys = decodeReviewKeyPair(hmacKey, evidenceKey);
  decodedKeys.hmacKeyBytes.fill(0);
  decodedKeys.evidenceKeyBytes.fill(0);
  const bundle = await materializerRunner({
    tenantId,
    grhSource,
    personasSource,
    grhManifest: argument(argv, '--grh-manifest') || undefined,
    personasManifest: argument(argv, '--personas-manifest') || undefined,
    hmacKey,
    evidenceKey,
    python: 'python',
    runtimeEnvironment: environment,
  });
  if (dryRun) {
    const result = receipt(bundle);
    stdout.write(`${JSON.stringify(result)}\n`);
    return result;
  }
  if (argument(argv, '--confirm-private-publication') !== PUBLISH_CONFIRMATION) {
    fail('REVIEW_PUBLICATION_CONFIRMATION_REQUIRED');
  }
  const connection = databaseUrlPolicy.inspectDatabaseUrl(environment[PUBLISH_DATABASE_ENV], {
    nodeEnv: environment.NODE_ENV || 'production',
    environment,
  });
  const client = new ClientImpl({
    connectionString: connection.connectionString,
    connectionTimeoutMillis: 5_000,
    query_timeout: 65_000,
    keepAlive: true,
  });
  try {
    await client.connect();
    const result = await publishReviewBundle({ bundle, client });
    stdout.write(`${JSON.stringify(receipt(bundle, result.status))}\n`);
    return result;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  try {
    await runCli();
  } catch (error) {
    process.stderr.write(`[GRH-PERSONAS-REVIEW-PUBLISH] ${String(error?.code || 'REVIEW_PUBLICATION_FAILED')}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
