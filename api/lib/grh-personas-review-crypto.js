import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';

import { canonicalGrhPersonasReviewJson, isOpaqueReviewKey, isReviewUuid } from './grh-personas-review-contract.js';

export const GRH_PERSONAS_REVIEW_ENVELOPE_SCHEMA_VERSION = 'grh-personas-review-envelope-v1';
export const GRH_PERSONAS_REVIEW_KEY_VERSION = 'v1';
export const GRH_PERSONAS_REVIEW_EVIDENCE_KEY_ENV = 'GRH_PERSONAS_REVIEW_EVIDENCE_KEY_V1';
export const GRH_PERSONAS_REVIEW_HMAC_KEY_ENV = 'GRH_PERSONAS_REVIEW_HMAC_KEY_V1';

const ALGORITHM = 'A256GCM';
const CIPHER = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_CIPHERTEXT_BYTES = 8192;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;
const TENANT = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const ENVELOPE_KEYS = Object.freeze(['algorithm', 'ciphertext', 'iv', 'keyVersion', 'schemaVersion', 'tag']);

export class GrhPersonasReviewCryptoError extends Error {
  constructor(code) {
    super('Private linkage evidence is unavailable');
    this.name = 'GrhPersonasReviewCryptoError';
    this.code = code;
  }
}

function fail(code = 'GRH_PERSONAS_REVIEW_CRYPTO_INVALID') {
  throw new GrhPersonasReviewCryptoError(code);
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function decodeCanonicalBase64url(value, exactBytes = null, maximumBytes = null) {
  if (typeof value !== 'string' || !value || !BASE64URL.test(value) ||
      (maximumBytes !== null && value.length > Math.ceil(maximumBytes * 4 / 3) + 1)) fail();
  let decoded;
  try {
    decoded = Buffer.from(value, 'base64url');
  } catch {
    fail();
  }
  if (decoded.toString('base64url') !== value ||
      (exactBytes !== null && decoded.length !== exactBytes) ||
      (maximumBytes !== null && decoded.length > maximumBytes)) fail();
  return decoded;
}

function keyFromEnvironment(environment, keyName) {
  if (!environment || typeof environment !== 'object') fail('GRH_PERSONAS_REVIEW_KEY_INVALID');
  try {
    return decodeCanonicalBase64url(environment[keyName], KEY_BYTES);
  } catch {
    fail('GRH_PERSONAS_REVIEW_KEY_INVALID');
  }
}

function exactIdentity(value, maximum = 512) {
  return typeof value === 'string' && value.length >= 1 && value.length <= maximum &&
    !value.includes('\0') && value.trim() === value;
}

function validateTenant(tenantId) {
  if (typeof tenantId !== 'string' || !TENANT.test(tenantId)) fail();
}

function validateAadInput({ tenantId, runId, recordType, stableKey } = {}) {
  validateTenant(tenantId);
  if (!isReviewUuid(runId) || !['case', 'option'].includes(recordType) || !isOpaqueReviewKey(stableKey)) fail();
  return Object.freeze({
    caseKey: recordType === 'case' ? stableKey : undefined,
    keyVersion: GRH_PERSONAS_REVIEW_KEY_VERSION,
    recordType,
    runId: runId.toLowerCase(),
    stableKey,
    tenantId,
  });
}

function aadBytes(input) {
  const aad = validateAadInput(input);
  // Keep one exact shape for both record types; null is authenticated rather
  // than omitting a key through an undefined serialization side effect.
  return Buffer.from(canonicalGrhPersonasReviewJson({
    caseKey: aad.caseKey ?? null,
    keyVersion: aad.keyVersion,
    recordType: aad.recordType,
    runId: aad.runId,
    stableKey: aad.stableKey,
    tenantId: aad.tenantId,
  }), 'utf8');
}

function validateEvidence(value, recordType) {
  const schemaVersion = recordType === 'case'
    ? 'grh-personas-review-case-evidence-v1'
    : 'grh-personas-review-option-evidence-v1';
  if (!exactKeys(value, ['person', 'schemaVersion']) || value.schemaVersion !== schemaVersion ||
      !exactKeys(value.person, ['birthDate', 'displayName', 'documents']) ||
      !exactKeys(value.person.documents, ['cuil', 'dni'])) fail();
  const { displayName, birthDate, documents } = value.person;
  if (displayName !== null && (typeof displayName !== 'string' || displayName.length < 1 ||
      displayName.length > 200 || displayName.trim() !== displayName || /[\u0000-\u001f\u007f]/u.test(displayName))) fail();
  if (birthDate !== null && !exactEvidenceDate(birthDate)) fail();
  if (documents.cuil !== null && (typeof documents.cuil !== 'string' || !/^\d{11}$/u.test(documents.cuil))) fail();
  if (documents.dni !== null && (typeof documents.dni !== 'string' || !/^\d{6,8}$/u.test(documents.dni))) fail();
  return value;
}

function exactEvidenceDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
  const year = Number(value.slice(0, 4));
  const currentYear = new Date().getUTCFullYear();
  return year >= 1900 && year <= currentYear &&
    !new Set(['1900-01-01', '1992-12-31', '1111-11-11']).has(value);
}

function hmac(environment, domain, parts) {
  const key = keyFromEnvironment(environment, GRH_PERSONAS_REVIEW_HMAC_KEY_ENV);
  if (!exactIdentity(domain, 80) || parts.some(part => !exactIdentity(part))) fail();
  return createHmac('sha256', key).update([domain, ...parts].join('\0'), 'utf8').digest('hex');
}

export function createGrhPersonasReviewSourceRef({ tenantId, sourceSystem, sourceId, environment = process.env } = {}) {
  validateTenant(tenantId);
  if (!['GRH', 'PERSONAS'].includes(sourceSystem)) fail();
  return hmac(environment, 'grh-personas-review:source-ref:v1', [tenantId, sourceSystem, sourceId]);
}

export function createGrhPersonasReviewCaseKey({ tenantId, grhRef, environment = process.env } = {}) {
  validateTenant(tenantId);
  if (!isOpaqueReviewKey(grhRef)) fail();
  return hmac(environment, 'grh-personas-review:case-key:v1', [tenantId, grhRef]);
}

export function createGrhPersonasReviewPairRef({ tenantId, grhRef, personasRef, environment = process.env } = {}) {
  validateTenant(tenantId);
  if (![grhRef, personasRef].every(isOpaqueReviewKey)) fail();
  return hmac(environment, 'grh-personas-review:pair-ref:v1', [tenantId, grhRef, personasRef]);
}

export function createGrhPersonasReviewOptionKey({ tenantId, pairRef, environment = process.env } = {}) {
  validateTenant(tenantId);
  if (!isOpaqueReviewKey(pairRef)) fail();
  return hmac(environment, 'grh-personas-review:option-key:v1', [tenantId, pairRef]);
}

export function sealGrhPersonasReviewEvidence({
  tenantId,
  runId,
  recordType,
  stableKey,
  evidence,
  environment = process.env,
  iv = randomBytes(IV_BYTES),
} = {}) {
  const key = keyFromEnvironment(environment, GRH_PERSONAS_REVIEW_EVIDENCE_KEY_ENV);
  if (!Buffer.isBuffer(iv) || iv.length !== IV_BYTES) fail();
  validateEvidence(evidence, recordType);
  const plaintext = Buffer.from(canonicalGrhPersonasReviewJson(evidence), 'utf8');
  if (plaintext.length > MAX_CIPHERTEXT_BYTES) fail();
  try {
    const cipher = createCipheriv(CIPHER, key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(aadBytes({ tenantId, runId, recordType, stableKey }));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Object.freeze({
      schemaVersion: GRH_PERSONAS_REVIEW_ENVELOPE_SCHEMA_VERSION,
      keyVersion: GRH_PERSONAS_REVIEW_KEY_VERSION,
      algorithm: ALGORITHM,
      iv: iv.toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
    });
  } catch (error) {
    if (error instanceof GrhPersonasReviewCryptoError) throw error;
    fail();
  }
}

export function openGrhPersonasReviewEvidence({
  tenantId,
  runId,
  recordType,
  stableKey,
  envelope,
  environment = process.env,
} = {}) {
  const key = keyFromEnvironment(environment, GRH_PERSONAS_REVIEW_EVIDENCE_KEY_ENV);
  if (!exactKeys(envelope, ENVELOPE_KEYS) ||
      envelope.schemaVersion !== GRH_PERSONAS_REVIEW_ENVELOPE_SCHEMA_VERSION ||
      envelope.keyVersion !== GRH_PERSONAS_REVIEW_KEY_VERSION || envelope.algorithm !== ALGORITHM) fail();
  const iv = decodeCanonicalBase64url(envelope.iv, IV_BYTES);
  const tag = decodeCanonicalBase64url(envelope.tag, TAG_BYTES);
  const ciphertext = decodeCanonicalBase64url(envelope.ciphertext, null, MAX_CIPHERTEXT_BYTES);
  try {
    const decipher = createDecipheriv(CIPHER, key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(aadBytes({ tenantId, runId, recordType, stableKey }));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const evidence = JSON.parse(plaintext.toString('utf8'));
    validateEvidence(evidence, recordType);
    if (Buffer.from(canonicalGrhPersonasReviewJson(evidence), 'utf8').compare(plaintext) !== 0) fail();
    return evidence;
  } catch (error) {
    if (error instanceof GrhPersonasReviewCryptoError) throw error;
    fail();
  }
}
