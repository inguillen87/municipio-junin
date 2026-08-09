'use strict';

// Pure compatibility boundary between the executable account-lifecycle
// foundation and exact, serialized projections of the inactive Prisma RBAC/ABAC
// proposal. This module performs no I/O, persistence, hashing, coercion or
// defaulting. A rejected record must never be partially mapped.
const lifecycle = require('./account-lifecycle.cjs');
const { types: { isProxy } } = require('node:util');

const ACCOUNT_LIFECYCLE_PRISMA_MAPPER_VERSION = 'IAM-MAP-01/1.0.0';
const FOUNDATION_ACCOUNT_LIFECYCLE_VERSION = '2026-08-08.1';
const PRISMA_RBAC_ABAC_PROPOSAL_VERSION = 'rbac-abac-v1/1.0.0';
const PRISMA_INVITATION_PURPOSE = 'ACCOUNT_ACTIVATION';
const PRISMA_INT_MAX = 2147483647;

const MAPPING_CODES = Object.freeze({
  MAPPED: 'IAM_MAPPING_OK',
  INPUT_INVALID: 'IAM_MAPPING_INPUT_INVALID',
  RAW_SECRET_FORBIDDEN: 'IAM_MAPPING_RAW_SECRET_FORBIDDEN',
  KEYS_INVALID: 'IAM_MAPPING_KEYS_INVALID',
  VERSION_MISMATCH: 'IAM_MAPPING_VERSION_MISMATCH',
  IDENTIFIER_INVALID: 'IAM_MAPPING_IDENTIFIER_INVALID',
  TIMESTAMP_INVALID: 'IAM_MAPPING_TIMESTAMP_INVALID',
  DIGEST_INVALID: 'IAM_MAPPING_DIGEST_INVALID',
  COUNTER_INVALID: 'IAM_MAPPING_COUNTER_INVALID',
  STATE_NOT_REPRESENTABLE: 'IAM_MAPPING_STATE_NOT_REPRESENTABLE',
  STATUS_INCONSISTENT: 'IAM_MAPPING_STATUS_INCONSISTENT',
  SUBJECT_MISMATCH: 'IAM_MAPPING_SUBJECT_MISMATCH',
  TENANT_MISMATCH: 'IAM_MAPPING_TENANT_MISMATCH',
});

const FOUNDATION_ENVELOPE_KEYS = Object.freeze([
  'account',
  'foundationVersion',
  'invitation',
  'mappingVersion',
  'prismaProposalVersion',
  'refreshFamily',
]);
const PRISMA_ENVELOPE_KEYS = Object.freeze([
  'foundationVersion',
  'mappingVersion',
  'oneTimeCredential',
  'prismaProposalVersion',
  'refreshTokenFamily',
  'userSecurityState',
]);
const FOUNDATION_ACCOUNT_KEYS = Object.freeze(['expiresAt', 'id', 'state', 'tenantId']);
const PRISMA_ACCOUNT_KEYS = Object.freeze([
  'accountExpiresAt',
  'lifecycleStatus',
  'tenantId',
  'userId',
]);
const FOUNDATION_INVITATION_KEYS = Object.freeze([
  'accountId',
  'attemptCount',
  'expiresAt',
  'id',
  'lockedAt',
  'maxAttempts',
  'revokedAt',
  'tenantId',
  'tokenDigest',
  'usedAt',
]);
const PRISMA_INVITATION_KEYS = Object.freeze([
  'consumedAt',
  'expiresAt',
  'failedAttempts',
  'id',
  'maxAttempts',
  'purpose',
  'revokedAt',
  'status',
  'tenantId',
  'tokenDigest',
  'userId',
]);
const FOUNDATION_FAMILY_KEYS = Object.freeze([
  'accountId',
  'id',
  'latestSequence',
  'revokedAt',
  'tenantId',
]);
const PRISMA_FAMILY_KEYS = Object.freeze([
  'currentSequence',
  'id',
  'revokedAt',
  'status',
  'tenantId',
  'userId',
]);

const COMMON_ACCOUNT_STATE_VALUES = Object.freeze([
  'INVITED',
  'FIRST_LOGIN_REQUIRED',
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'REVOKED',
]);
const COMMON_ACCOUNT_STATES = new Set(COMMON_ACCOUNT_STATE_VALUES);
const FOUNDATION_PIN_VALID =
  lifecycle.ACCOUNT_LIFECYCLE_VERSION === FOUNDATION_ACCOUNT_LIFECYCLE_VERSION &&
  JSON.stringify(Object.values(lifecycle.ACCOUNT_STATES)) === JSON.stringify(COMMON_ACCOUNT_STATE_VALUES);
const SUPPORTED_INVITATION_STATUSES = new Set(['ISSUED', 'CONSUMED', 'REVOKED']);
const SUPPORTED_FAMILY_STATUSES = new Set(['ACTIVE', 'REVOKED']);
const RAW_SECRET_KEYS = new Set([
  'token',
  'rawtoken',
  'password',
  'passwordhash',
  'secret',
  'clientsecret',
  'credential',
  'cookie',
  'authorization',
]);
const SAFE_SECURITY_FIELD_KEYS = new Set([
  'onetimecredential',
  'refreshtokenfamily',
  'tokendigest',
  'tokenversion',
  'tokenversionatissue',
]);
const SHA256_HEX = /^[a-f0-9]{64}$/;
const CANONICAL_ID = /^[^\s\u0000-\u001f\u007f]{1,128}$/;
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function deepFreeze(value, visited = new WeakSet()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return value;
  visited.add(value);
  for (const child of Object.values(value)) deepFreeze(child, visited);
  return Object.freeze(value);
}

function isRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function snapshotExactRecord(value, expected) {
  if (!isRecord(value)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (actual.some(key => typeof key !== 'string')) return null;
  actual.sort();
  if (actual.length !== expected.length || !actual.every((key, index) => key === expected[index])) return null;
  const snapshot = Object.create(null);
  for (const key of actual) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || descriptor.get || descriptor.set) return null;
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function hasRawSecret(value, visited = new WeakSet()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return false;
  if (isProxy(value)) throw new TypeError('Proxy input is not a serializable lifecycle projection');
  visited.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).some(key => {
    const keyText = typeof key === 'symbol' ? String(key.description || '') : key;
    const normalized = keyText.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!SAFE_SECURITY_FIELD_KEYS.has(normalized) &&
        (RAW_SECRET_KEYS.has(normalized) || normalized.includes('token') ||
         normalized.includes('password') || normalized.includes('secret') ||
         normalized.includes('credential'))) {
      return true;
    }
    const descriptor = descriptors[key];
    return Object.hasOwn(descriptor, 'value') && hasRawSecret(descriptor.value, visited);
  });
}

function failure(code, path) {
  return deepFreeze({ ok: false, code, path });
}

function success(value) {
  return deepFreeze({ ok: true, code: MAPPING_CODES.MAPPED, value });
}

function canonicalId(value) {
  return typeof value === 'string' && CANONICAL_ID.test(value);
}

function validTimestamp(value, nullable) {
  if (value === null) return nullable;
  if (typeof value !== 'string' || !CANONICAL_UTC.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function validCounter(value, minimum = 0) {
  return Number.isInteger(value) && !Object.is(value, -0) && value >= minimum && value <= PRISMA_INT_MAX;
}

function inspectVersions(input) {
  return FOUNDATION_PIN_VALID &&
    input.mappingVersion === ACCOUNT_LIFECYCLE_PRISMA_MAPPER_VERSION &&
    input.foundationVersion === FOUNDATION_ACCOUNT_LIFECYCLE_VERSION &&
    input.prismaProposalVersion === PRISMA_RBAC_ABAC_PROPOSAL_VERSION;
}

function inspectFoundationAccount(record) {
  const snapshot = snapshotExactRecord(record, FOUNDATION_ACCOUNT_KEYS);
  if (!snapshot) {
    return failure(MAPPING_CODES.KEYS_INVALID, 'account');
  }
  if (!canonicalId(snapshot.id) || !canonicalId(snapshot.tenantId)) {
    return failure(MAPPING_CODES.IDENTIFIER_INVALID, 'account');
  }
  if (!COMMON_ACCOUNT_STATES.has(snapshot.state)) {
    return failure(MAPPING_CODES.STATE_NOT_REPRESENTABLE, 'account.state');
  }
  if (!validTimestamp(snapshot.expiresAt, true)) {
    return failure(MAPPING_CODES.TIMESTAMP_INVALID, 'account.expiresAt');
  }
  return {
    ok: true,
    value: {
      userId: snapshot.id,
      tenantId: snapshot.tenantId,
      lifecycleStatus: snapshot.state,
      accountExpiresAt: snapshot.expiresAt,
    },
  };
}

function inspectPrismaAccount(record) {
  const snapshot = snapshotExactRecord(record, PRISMA_ACCOUNT_KEYS);
  if (!snapshot) {
    return failure(MAPPING_CODES.KEYS_INVALID, 'userSecurityState');
  }
  if (!canonicalId(snapshot.userId) || !canonicalId(snapshot.tenantId)) {
    return failure(MAPPING_CODES.IDENTIFIER_INVALID, 'userSecurityState');
  }
  if (!COMMON_ACCOUNT_STATES.has(snapshot.lifecycleStatus)) {
    return failure(MAPPING_CODES.STATE_NOT_REPRESENTABLE, 'userSecurityState.lifecycleStatus');
  }
  if (!validTimestamp(snapshot.accountExpiresAt, true)) {
    return failure(MAPPING_CODES.TIMESTAMP_INVALID, 'userSecurityState.accountExpiresAt');
  }
  return {
    ok: true,
    value: {
      id: snapshot.userId,
      tenantId: snapshot.tenantId,
      state: snapshot.lifecycleStatus,
      expiresAt: snapshot.accountExpiresAt,
    },
  };
}

function inspectFoundationInvitation(record, account) {
  if (record === null) return { ok: true, value: null };
  const snapshot = snapshotExactRecord(record, FOUNDATION_INVITATION_KEYS);
  if (!snapshot) {
    return failure(MAPPING_CODES.KEYS_INVALID, 'invitation');
  }
  if (![snapshot.id, snapshot.accountId, snapshot.tenantId].every(canonicalId)) {
    return failure(MAPPING_CODES.IDENTIFIER_INVALID, 'invitation');
  }
  if (snapshot.accountId !== account.id) {
    return failure(MAPPING_CODES.SUBJECT_MISMATCH, 'invitation.accountId');
  }
  if (snapshot.tenantId !== account.tenantId) {
    return failure(MAPPING_CODES.TENANT_MISMATCH, 'invitation.tenantId');
  }
  if (typeof snapshot.tokenDigest !== 'string' || !SHA256_HEX.test(snapshot.tokenDigest)) {
    return failure(MAPPING_CODES.DIGEST_INVALID, 'invitation.tokenDigest');
  }
  if (!validCounter(snapshot.attemptCount) || !validCounter(snapshot.maxAttempts, 1) ||
      snapshot.attemptCount > snapshot.maxAttempts) {
    return failure(MAPPING_CODES.COUNTER_INVALID, 'invitation.attemptCount');
  }
  if (!validTimestamp(snapshot.expiresAt, false) || !validTimestamp(snapshot.usedAt, true) ||
      !validTimestamp(snapshot.revokedAt, true) || !validTimestamp(snapshot.lockedAt, true)) {
    return failure(MAPPING_CODES.TIMESTAMP_INVALID, 'invitation.timestamps');
  }
  const terminalMarkers = [snapshot.usedAt, snapshot.revokedAt, snapshot.lockedAt]
    .filter(value => value !== null).length;
  if (terminalMarkers > 1) {
    return failure(MAPPING_CODES.STATUS_INCONSISTENT, 'invitation.status');
  }
  if (snapshot.lockedAt !== null) {
    return failure(MAPPING_CODES.STATE_NOT_REPRESENTABLE, 'invitation.lockedAt');
  }
  if (snapshot.attemptCount === snapshot.maxAttempts) {
    return failure(MAPPING_CODES.COUNTER_INVALID, 'invitation.attemptCount');
  }
  const status = snapshot.usedAt !== null ? 'CONSUMED' : snapshot.revokedAt !== null ? 'REVOKED' : 'ISSUED';
  return {
    ok: true,
    value: {
      id: snapshot.id,
      userId: snapshot.accountId,
      tenantId: snapshot.tenantId,
      tokenDigest: snapshot.tokenDigest,
      failedAttempts: snapshot.attemptCount,
      maxAttempts: snapshot.maxAttempts,
      purpose: PRISMA_INVITATION_PURPOSE,
      expiresAt: snapshot.expiresAt,
      consumedAt: snapshot.usedAt,
      revokedAt: snapshot.revokedAt,
      status,
    },
  };
}

function inspectPrismaInvitation(record, account) {
  if (record === null) return { ok: true, value: null };
  const snapshot = snapshotExactRecord(record, PRISMA_INVITATION_KEYS);
  if (!snapshot) {
    return failure(MAPPING_CODES.KEYS_INVALID, 'oneTimeCredential');
  }
  if (![snapshot.id, snapshot.userId, snapshot.tenantId].every(canonicalId)) {
    return failure(MAPPING_CODES.IDENTIFIER_INVALID, 'oneTimeCredential');
  }
  if (snapshot.userId !== account.userId) {
    return failure(MAPPING_CODES.SUBJECT_MISMATCH, 'oneTimeCredential.userId');
  }
  if (snapshot.tenantId !== account.tenantId) {
    return failure(MAPPING_CODES.TENANT_MISMATCH, 'oneTimeCredential.tenantId');
  }
  if (typeof snapshot.tokenDigest !== 'string' || !SHA256_HEX.test(snapshot.tokenDigest)) {
    return failure(MAPPING_CODES.DIGEST_INVALID, 'oneTimeCredential.tokenDigest');
  }
  if (!validCounter(snapshot.failedAttempts) || !validCounter(snapshot.maxAttempts, 1) ||
      snapshot.failedAttempts >= snapshot.maxAttempts) {
    return failure(MAPPING_CODES.COUNTER_INVALID, 'oneTimeCredential.failedAttempts');
  }
  if (!validTimestamp(snapshot.expiresAt, false) || !validTimestamp(snapshot.consumedAt, true) ||
      !validTimestamp(snapshot.revokedAt, true)) {
    return failure(MAPPING_CODES.TIMESTAMP_INVALID, 'oneTimeCredential.timestamps');
  }
  if (!SUPPORTED_INVITATION_STATUSES.has(snapshot.status)) {
    return failure(MAPPING_CODES.STATE_NOT_REPRESENTABLE, 'oneTimeCredential.status');
  }
  if (snapshot.purpose !== PRISMA_INVITATION_PURPOSE) {
    return failure(MAPPING_CODES.STATE_NOT_REPRESENTABLE, 'oneTimeCredential.purpose');
  }
  const consumed = snapshot.consumedAt !== null;
  const revoked = snapshot.revokedAt !== null;
  const statusConsistent =
    (snapshot.status === 'ISSUED' && !consumed && !revoked) ||
    (snapshot.status === 'CONSUMED' && consumed && !revoked) ||
    (snapshot.status === 'REVOKED' && !consumed && revoked);
  if (!statusConsistent) {
    return failure(MAPPING_CODES.STATUS_INCONSISTENT, 'oneTimeCredential.status');
  }
  return {
    ok: true,
    value: {
      id: snapshot.id,
      accountId: snapshot.userId,
      tenantId: snapshot.tenantId,
      tokenDigest: snapshot.tokenDigest,
      attemptCount: snapshot.failedAttempts,
      maxAttempts: snapshot.maxAttempts,
      expiresAt: snapshot.expiresAt,
      usedAt: snapshot.consumedAt,
      revokedAt: snapshot.revokedAt,
      lockedAt: null,
    },
  };
}

function inspectFoundationFamily(record, account) {
  if (record === null) return { ok: true, value: null };
  const snapshot = snapshotExactRecord(record, FOUNDATION_FAMILY_KEYS);
  if (!snapshot) {
    return failure(MAPPING_CODES.KEYS_INVALID, 'refreshFamily');
  }
  if (![snapshot.id, snapshot.accountId, snapshot.tenantId].every(canonicalId)) {
    return failure(MAPPING_CODES.IDENTIFIER_INVALID, 'refreshFamily');
  }
  if (snapshot.accountId !== account.id) {
    return failure(MAPPING_CODES.SUBJECT_MISMATCH, 'refreshFamily.accountId');
  }
  if (snapshot.tenantId !== account.tenantId) {
    return failure(MAPPING_CODES.TENANT_MISMATCH, 'refreshFamily.tenantId');
  }
  if (!validCounter(snapshot.latestSequence)) {
    return failure(MAPPING_CODES.COUNTER_INVALID, 'refreshFamily.latestSequence');
  }
  if (!validTimestamp(snapshot.revokedAt, true)) {
    return failure(MAPPING_CODES.TIMESTAMP_INVALID, 'refreshFamily.revokedAt');
  }
  return {
    ok: true,
    value: {
      id: snapshot.id,
      userId: snapshot.accountId,
      tenantId: snapshot.tenantId,
      currentSequence: snapshot.latestSequence,
      revokedAt: snapshot.revokedAt,
      status: snapshot.revokedAt === null ? 'ACTIVE' : 'REVOKED',
    },
  };
}

function inspectPrismaFamily(record, account) {
  if (record === null) return { ok: true, value: null };
  const snapshot = snapshotExactRecord(record, PRISMA_FAMILY_KEYS);
  if (!snapshot) {
    return failure(MAPPING_CODES.KEYS_INVALID, 'refreshTokenFamily');
  }
  if (![snapshot.id, snapshot.userId, snapshot.tenantId].every(canonicalId)) {
    return failure(MAPPING_CODES.IDENTIFIER_INVALID, 'refreshTokenFamily');
  }
  if (snapshot.userId !== account.userId) {
    return failure(MAPPING_CODES.SUBJECT_MISMATCH, 'refreshTokenFamily.userId');
  }
  if (snapshot.tenantId !== account.tenantId) {
    return failure(MAPPING_CODES.TENANT_MISMATCH, 'refreshTokenFamily.tenantId');
  }
  if (!validCounter(snapshot.currentSequence)) {
    return failure(MAPPING_CODES.COUNTER_INVALID, 'refreshTokenFamily.currentSequence');
  }
  if (!validTimestamp(snapshot.revokedAt, true)) {
    return failure(MAPPING_CODES.TIMESTAMP_INVALID, 'refreshTokenFamily.revokedAt');
  }
  if (!SUPPORTED_FAMILY_STATUSES.has(snapshot.status)) {
    return failure(MAPPING_CODES.STATE_NOT_REPRESENTABLE, 'refreshTokenFamily.status');
  }
  const statusConsistent =
    (snapshot.status === 'ACTIVE' && snapshot.revokedAt === null) ||
    (snapshot.status === 'REVOKED' && snapshot.revokedAt !== null);
  if (!statusConsistent) {
    return failure(MAPPING_CODES.STATUS_INCONSISTENT, 'refreshTokenFamily.status');
  }
  return {
    ok: true,
    value: {
      id: snapshot.id,
      accountId: snapshot.userId,
      tenantId: snapshot.tenantId,
      latestSequence: snapshot.currentSequence,
      revokedAt: snapshot.revokedAt,
    },
  };
}

function mapFoundationLifecycleToPrisma(input) {
  try {
    if (!isRecord(input)) return failure(MAPPING_CODES.INPUT_INVALID, 'input');
    if (hasRawSecret(input)) return failure(MAPPING_CODES.RAW_SECRET_FORBIDDEN, 'input');
    const envelope = snapshotExactRecord(input, FOUNDATION_ENVELOPE_KEYS);
    if (!envelope) {
      return failure(MAPPING_CODES.KEYS_INVALID, 'input');
    }
    if (!inspectVersions(envelope)) return failure(MAPPING_CODES.VERSION_MISMATCH, 'versions');

    const account = inspectFoundationAccount(envelope.account);
    if (!account.ok) return account;
    const invitation = inspectFoundationInvitation(envelope.invitation, {
      id: account.value.userId,
      tenantId: account.value.tenantId,
    });
    if (!invitation.ok) return invitation;
    const family = inspectFoundationFamily(envelope.refreshFamily, {
      id: account.value.userId,
      tenantId: account.value.tenantId,
    });
    if (!family.ok) return family;

    return success({
      mappingVersion: ACCOUNT_LIFECYCLE_PRISMA_MAPPER_VERSION,
      foundationVersion: FOUNDATION_ACCOUNT_LIFECYCLE_VERSION,
      prismaProposalVersion: PRISMA_RBAC_ABAC_PROPOSAL_VERSION,
      userSecurityState: account.value,
      oneTimeCredential: invitation.value,
      refreshTokenFamily: family.value,
    });
  } catch {
    return failure(MAPPING_CODES.INPUT_INVALID, 'input');
  }
}

function mapPrismaLifecycleToFoundation(input) {
  try {
    if (!isRecord(input)) return failure(MAPPING_CODES.INPUT_INVALID, 'input');
    if (hasRawSecret(input)) return failure(MAPPING_CODES.RAW_SECRET_FORBIDDEN, 'input');
    const envelope = snapshotExactRecord(input, PRISMA_ENVELOPE_KEYS);
    if (!envelope) {
      return failure(MAPPING_CODES.KEYS_INVALID, 'input');
    }
    if (!inspectVersions(envelope)) return failure(MAPPING_CODES.VERSION_MISMATCH, 'versions');

    const account = inspectPrismaAccount(envelope.userSecurityState);
    if (!account.ok) return account;
    const invitation = inspectPrismaInvitation(envelope.oneTimeCredential, {
      userId: account.value.id,
      tenantId: account.value.tenantId,
    });
    if (!invitation.ok) return invitation;
    const family = inspectPrismaFamily(envelope.refreshTokenFamily, {
      userId: account.value.id,
      tenantId: account.value.tenantId,
    });
    if (!family.ok) return family;

    return success({
      mappingVersion: ACCOUNT_LIFECYCLE_PRISMA_MAPPER_VERSION,
      foundationVersion: FOUNDATION_ACCOUNT_LIFECYCLE_VERSION,
      prismaProposalVersion: PRISMA_RBAC_ABAC_PROPOSAL_VERSION,
      account: account.value,
      invitation: invitation.value,
      refreshFamily: family.value,
    });
  } catch {
    return failure(MAPPING_CODES.INPUT_INVALID, 'input');
  }
}

module.exports = deepFreeze({
  ACCOUNT_LIFECYCLE_PRISMA_MAPPER_VERSION,
  FOUNDATION_ACCOUNT_LIFECYCLE_VERSION,
  PRISMA_RBAC_ABAC_PROPOSAL_VERSION,
  PRISMA_INVITATION_PURPOSE,
  MAPPING_CODES,
  mapFoundationLifecycleToPrisma,
  mapPrismaLifecycleToFoundation,
});
