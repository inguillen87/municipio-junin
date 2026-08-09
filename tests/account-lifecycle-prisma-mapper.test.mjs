import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const mapper = require('../shared/account-lifecycle-prisma-mapper.cjs');
const lifecycle = require('../shared/account-lifecycle.cjs');
const proposalSource = readFileSync(
  new URL('../prisma/proposals/rbac-abac-v1.prisma', import.meta.url),
  'utf8',
);

const {
  ACCOUNT_LIFECYCLE_PRISMA_MAPPER_VERSION,
  FOUNDATION_ACCOUNT_LIFECYCLE_VERSION,
  PRISMA_RBAC_ABAC_PROPOSAL_VERSION,
  PRISMA_INVITATION_PURPOSE,
  MAPPING_CODES,
  mapFoundationLifecycleToPrisma,
  mapPrismaLifecycleToFoundation,
} = mapper;

const EXPIRES_AT = '2026-08-16T12:00:00.000Z';
const EVENT_AT = '2026-08-09T12:00:00.000Z';
const DIGEST = 'a'.repeat(64);

function foundationEnvelope(overrides = {}) {
  return {
    mappingVersion: ACCOUNT_LIFECYCLE_PRISMA_MAPPER_VERSION,
    foundationVersion: FOUNDATION_ACCOUNT_LIFECYCLE_VERSION,
    prismaProposalVersion: PRISMA_RBAC_ABAC_PROPOSAL_VERSION,
    account: {
      id: 'user-1',
      tenantId: 'tenant-1',
      state: 'ACTIVE',
      expiresAt: EXPIRES_AT,
    },
    invitation: {
      id: 'invitation-1',
      accountId: 'user-1',
      tenantId: 'tenant-1',
      tokenDigest: DIGEST,
      attemptCount: 1,
      maxAttempts: 3,
      expiresAt: EXPIRES_AT,
      usedAt: null,
      revokedAt: null,
      lockedAt: null,
    },
    refreshFamily: {
      id: 'family-1',
      accountId: 'user-1',
      tenantId: 'tenant-1',
      latestSequence: 4,
      revokedAt: null,
    },
    ...overrides,
  };
}

function prismaEnvelope(overrides = {}) {
  return {
    mappingVersion: ACCOUNT_LIFECYCLE_PRISMA_MAPPER_VERSION,
    foundationVersion: FOUNDATION_ACCOUNT_LIFECYCLE_VERSION,
    prismaProposalVersion: PRISMA_RBAC_ABAC_PROPOSAL_VERSION,
    userSecurityState: {
      userId: 'user-1',
      tenantId: 'tenant-1',
      lifecycleStatus: 'ACTIVE',
      accountExpiresAt: EXPIRES_AT,
    },
    oneTimeCredential: {
      id: 'invitation-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      tokenDigest: DIGEST,
      failedAttempts: 1,
      maxAttempts: 3,
      purpose: PRISMA_INVITATION_PURPOSE,
      expiresAt: EXPIRES_AT,
      consumedAt: null,
      revokedAt: null,
      status: 'ISSUED',
    },
    refreshTokenFamily: {
      id: 'family-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      currentSequence: 4,
      revokedAt: null,
      status: 'ACTIVE',
    },
    ...overrides,
  };
}

function assertFailure(result, code) {
  assert.deepEqual(Object.keys(result), ['ok', 'code', 'path']);
  assert.equal(result.ok, false);
  assert.equal(result.code, code);
  assert.equal(typeof result.path, 'string');
  assert.equal(Object.isFrozen(result), true);
}

function blockMembers(kind, name) {
  const match = proposalSource.match(new RegExp(`${kind} ${name} \\{([\\s\\S]*?)\\r?\\n\\}`));
  assert.ok(match, `${kind} ${name} must exist in the pinned proposal`);
  return match[1]
    .split(/\r?\n/)
    .map(line => line.replace(/\/\/.*$/, '').trim())
    .filter(line => line && !line.startsWith('@@'))
    .map(line => line.split(/\s+/)[0]);
}

function blockLines(kind, name) {
  const match = proposalSource.match(new RegExp(`${kind} ${name} \\{([\\s\\S]*?)\\r?\\n\\}`));
  assert.ok(match, `${kind} ${name} must exist in the pinned proposal`);
  return match[1]
    .split(/\r?\n/)
    .map(line => line.replace(/\/\/.*$/, '').trim())
    .filter(line => line && !line.startsWith('@@'));
}

function fieldDefinition(model, field) {
  const matches = blockLines('model', model).filter(line => line.split(/\s+/)[0] === field);
  assert.equal(matches.length, 1, `${model}.${field} must be singular`);
  return matches[0].replace(/\s+/g, ' ');
}

test('the mapper is explicitly versioned, immutable, and exposes only the two pure directions', () => {
  assert.equal(ACCOUNT_LIFECYCLE_PRISMA_MAPPER_VERSION, 'IAM-MAP-01/1.0.0');
  assert.equal(FOUNDATION_ACCOUNT_LIFECYCLE_VERSION, '2026-08-08.1');
  assert.equal(PRISMA_RBAC_ABAC_PROPOSAL_VERSION, 'rbac-abac-v1/1.0.0');
  assert.equal(PRISMA_INVITATION_PURPOSE, 'ACCOUNT_ACTIVATION');
  assert.equal(Object.isFrozen(mapper), true);
  assert.equal(Object.isFrozen(MAPPING_CODES), true);
  assert.equal(typeof mapFoundationLifecycleToPrisma, 'function');
  assert.equal(typeof mapPrismaLifecycleToFoundation, 'function');
});

test('the mapper pins the exact foundation/proposal drift surface instead of following it silently', () => {
  assert.deepEqual(Object.values(lifecycle.ACCOUNT_STATES), [
    'INVITED', 'FIRST_LOGIN_REQUIRED', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED',
  ]);
  assert.deepEqual(blockMembers('enum', 'AccountLifecycleStatus'), [
    'INVITED', 'FIRST_LOGIN_REQUIRED', 'ACTIVE', 'SUSPENDED', 'LOCKED', 'EXPIRED',
    'REVOKED', 'TERMINATED',
  ]);
  assert.deepEqual(blockMembers('enum', 'OneTimeCredentialStatus'), [
    'ISSUED', 'CONSUMED', 'REVOKED', 'EXPIRED', 'LOCKED',
  ]);
  assert.deepEqual(blockMembers('enum', 'OneTimeCredentialPurpose'), [
    'ACCOUNT_ACTIVATION', 'INITIAL_PASSWORD_SETUP', 'PASSWORD_RESET',
    'EMAIL_VERIFICATION', 'MFA_ENROLLMENT', 'DEMO_ACTIVATION',
  ]);
  assert.deepEqual(blockMembers('enum', 'RefreshTokenFamilyStatus'), [
    'ACTIVE', 'REVOKED', 'EXPIRED',
  ]);

  assert.equal(fieldDefinition('UserSecurityState', 'userId'), 'userId String @id @map("user_id")');
  assert.equal(fieldDefinition('UserSecurityState', 'tenantId'), 'tenantId String? @map("tenant_id")');
  assert.equal(fieldDefinition('UserSecurityState', 'lifecycleStatus'),
    'lifecycleStatus AccountLifecycleStatus @default(INVITED) @map("lifecycle_status")');
  assert.equal(fieldDefinition('UserSecurityState', 'accountExpiresAt'),
    'accountExpiresAt DateTime? @map("account_expires_at") @db.Timestamptz(6)');

  assert.equal(fieldDefinition('OneTimeCredential', 'purpose'), 'purpose OneTimeCredentialPurpose');
  assert.equal(fieldDefinition('OneTimeCredential', 'id'), 'id String @id @default(cuid())');
  assert.equal(fieldDefinition('OneTimeCredential', 'userId'), 'userId String @map("user_id")');
  assert.equal(fieldDefinition('OneTimeCredential', 'tenantId'), 'tenantId String? @map("tenant_id")');
  assert.equal(fieldDefinition('OneTimeCredential', 'status'),
    'status OneTimeCredentialStatus @default(ISSUED)');
  assert.equal(fieldDefinition('OneTimeCredential', 'tokenDigest'),
    'tokenDigest String @unique @map("token_digest") @db.Char(64)');
  assert.equal(fieldDefinition('OneTimeCredential', 'maxAttempts'),
    'maxAttempts Int @default(5) @map("max_attempts")');
  assert.equal(fieldDefinition('OneTimeCredential', 'failedAttempts'),
    'failedAttempts Int @default(0) @map("failed_attempts")');
  assert.equal(fieldDefinition('OneTimeCredential', 'expiresAt'),
    'expiresAt DateTime @map("expires_at") @db.Timestamptz(6)');
  assert.equal(fieldDefinition('OneTimeCredential', 'consumedAt'),
    'consumedAt DateTime? @map("consumed_at") @db.Timestamptz(6)');
  assert.equal(fieldDefinition('OneTimeCredential', 'revokedAt'),
    'revokedAt DateTime? @map("revoked_at") @db.Timestamptz(6)');

  assert.equal(fieldDefinition('RefreshTokenFamily', 'status'),
    'status RefreshTokenFamilyStatus @default(ACTIVE)');
  assert.equal(fieldDefinition('RefreshTokenFamily', 'id'), 'id String @id @default(cuid())');
  assert.equal(fieldDefinition('RefreshTokenFamily', 'userId'), 'userId String @map("user_id")');
  assert.equal(fieldDefinition('RefreshTokenFamily', 'tenantId'), 'tenantId String @map("tenant_id")');
  assert.equal(fieldDefinition('RefreshTokenFamily', 'currentSequence'),
    'currentSequence Int @default(0) @map("current_sequence")');
  assert.equal(fieldDefinition('RefreshTokenFamily', 'expiresAt'),
    'expiresAt DateTime @map("expires_at") @db.Timestamptz(6)');
  assert.equal(fieldDefinition('RefreshTokenFamily', 'revokedAt'),
    'revokedAt DateTime? @map("revoked_at") @db.Timestamptz(6)');
});

test('a complete supported foundation projection maps exactly and round-trips without mutation', () => {
  const input = foundationEnvelope();
  const before = structuredClone(input);
  const mapped = mapFoundationLifecycleToPrisma(input);

  assert.equal(mapped.ok, true);
  assert.equal(mapped.code, MAPPING_CODES.MAPPED);
  assert.deepEqual(mapped.value, prismaEnvelope());
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(mapped), true);
  assert.equal(Object.isFrozen(mapped.value), true);
  assert.equal(Object.isFrozen(mapped.value.oneTimeCredential), true);

  const reversed = mapPrismaLifecycleToFoundation(mapped.value);
  assert.equal(reversed.ok, true);
  assert.deepEqual(reversed.value, input);
});

test('a complete supported Prisma projection maps exactly and round-trips without mutation', () => {
  const input = prismaEnvelope({
    oneTimeCredential: {
      ...prismaEnvelope().oneTimeCredential,
      status: 'CONSUMED',
      consumedAt: EVENT_AT,
    },
    refreshTokenFamily: {
      ...prismaEnvelope().refreshTokenFamily,
      status: 'REVOKED',
      revokedAt: EVENT_AT,
    },
  });
  const before = structuredClone(input);
  const mapped = mapPrismaLifecycleToFoundation(input);

  assert.equal(mapped.ok, true);
  assert.deepEqual(mapped.value.invitation.usedAt, EVENT_AT);
  assert.deepEqual(mapped.value.refreshFamily.revokedAt, EVENT_AT);
  assert.deepEqual(input, before);

  const reversed = mapFoundationLifecycleToPrisma(mapped.value);
  assert.equal(reversed.ok, true);
  assert.deepEqual(reversed.value, input);
});

test('all six common account states map reversibly while proposal-only states fail closed', () => {
  for (const state of ['INVITED', 'FIRST_LOGIN_REQUIRED', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED']) {
    const source = foundationEnvelope({
      account: { ...foundationEnvelope().account, state },
      invitation: null,
      refreshFamily: null,
    });
    const mapped = mapFoundationLifecycleToPrisma(source);
    assert.equal(mapped.ok, true, state);
    assert.equal(mapped.value.userSecurityState.lifecycleStatus, state);
    assert.deepEqual(mapPrismaLifecycleToFoundation(mapped.value).value, source);
  }

  for (const lifecycleStatus of ['LOCKED', 'TERMINATED', 'UNKNOWN']) {
    assertFailure(mapPrismaLifecycleToFoundation(prismaEnvelope({
      userSecurityState: { ...prismaEnvelope().userSecurityState, lifecycleStatus },
      oneTimeCredential: null,
      refreshTokenFamily: null,
    })), MAPPING_CODES.STATE_NOT_REPRESENTABLE);
  }

  for (const state of ['LOCKED', 'TERMINATED', 'UNKNOWN']) {
    assertFailure(mapFoundationLifecycleToPrisma(foundationEnvelope({
      account: { ...foundationEnvelope().account, state },
      invitation: null,
      refreshFamily: null,
    })), MAPPING_CODES.STATE_NOT_REPRESENTABLE);
  }
});

test('ISSUED, CONSUMED, and REVOKED invitation states map reversibly', () => {
  const cases = [
    [{ usedAt: null, revokedAt: null, lockedAt: null }, 'ISSUED'],
    [{ usedAt: EVENT_AT, revokedAt: null, lockedAt: null }, 'CONSUMED'],
    [{ usedAt: null, revokedAt: EVENT_AT, lockedAt: null }, 'REVOKED'],
  ];

  for (const [timestamps, status] of cases) {
    const source = foundationEnvelope({
      invitation: { ...foundationEnvelope().invitation, ...timestamps },
      refreshFamily: null,
    });
    const mapped = mapFoundationLifecycleToPrisma(source);
    assert.equal(mapped.ok, true, status);
    assert.equal(mapped.value.oneTimeCredential.status, status);
    assert.deepEqual(mapPrismaLifecycleToFoundation(mapped.value).value, source);
  }
});

test('invitation LOCKED and EXPIRED states fail closed because the foundation cannot round-trip them', () => {
  assertFailure(mapFoundationLifecycleToPrisma(foundationEnvelope({
    invitation: { ...foundationEnvelope().invitation, attemptCount: 3, lockedAt: EVENT_AT },
  })), MAPPING_CODES.STATE_NOT_REPRESENTABLE);

  for (const status of ['LOCKED', 'EXPIRED', 'UNKNOWN']) {
    assertFailure(mapPrismaLifecycleToFoundation(prismaEnvelope({
      oneTimeCredential: { ...prismaEnvelope().oneTimeCredential, status },
    })), MAPPING_CODES.STATE_NOT_REPRESENTABLE);
  }
});

test('only an account-activation credential can cross the invitation boundary', () => {
  for (const purpose of [
    'INITIAL_PASSWORD_SETUP', 'PASSWORD_RESET', 'EMAIL_VERIFICATION',
    'MFA_ENROLLMENT', 'DEMO_ACTIVATION', 'UNKNOWN',
  ]) {
    assertFailure(mapPrismaLifecycleToFoundation(prismaEnvelope({
      oneTimeCredential: { ...prismaEnvelope().oneTimeCredential, purpose },
    })), MAPPING_CODES.STATE_NOT_REPRESENTABLE);
  }
  assert.equal(
    mapFoundationLifecycleToPrisma(foundationEnvelope()).value.oneTimeCredential.purpose,
    'ACCOUNT_ACTIVATION',
  );
});

test('invitation status and timestamps must be singular and consistent', () => {
  const foundationCases = [
    { usedAt: EVENT_AT, revokedAt: EVENT_AT },
    { usedAt: EVENT_AT, lockedAt: EVENT_AT },
    { revokedAt: EVENT_AT, lockedAt: EVENT_AT },
  ];
  for (const timestamps of foundationCases) {
    assertFailure(mapFoundationLifecycleToPrisma(foundationEnvelope({
      invitation: { ...foundationEnvelope().invitation, ...timestamps },
    })), MAPPING_CODES.STATUS_INCONSISTENT);
  }

  const prismaCases = [
    { status: 'ISSUED', consumedAt: EVENT_AT },
    { status: 'ISSUED', revokedAt: EVENT_AT },
    { status: 'CONSUMED', consumedAt: null },
    { status: 'CONSUMED', consumedAt: EVENT_AT, revokedAt: EVENT_AT },
    { status: 'REVOKED', revokedAt: null },
    { status: 'REVOKED', consumedAt: EVENT_AT, revokedAt: EVENT_AT },
  ];
  for (const overrides of prismaCases) {
    assertFailure(mapPrismaLifecycleToFoundation(prismaEnvelope({
      oneTimeCredential: { ...prismaEnvelope().oneTimeCredential, ...overrides },
    })), MAPPING_CODES.STATUS_INCONSISTENT);
  }
});

test('invalid invitation counters, digests, and timestamps fail closed in both directions', () => {
  const foundationCases = [
    [{ attemptCount: -1 }, MAPPING_CODES.COUNTER_INVALID],
    [{ attemptCount: 3 }, MAPPING_CODES.COUNTER_INVALID],
    [{ maxAttempts: 0 }, MAPPING_CODES.COUNTER_INVALID],
    [{ tokenDigest: 'not-a-digest' }, MAPPING_CODES.DIGEST_INVALID],
    [{ expiresAt: 'not-a-time' }, MAPPING_CODES.TIMESTAMP_INVALID],
    [{ usedAt: false }, MAPPING_CODES.TIMESTAMP_INVALID],
  ];
  for (const [overrides, code] of foundationCases) {
    assertFailure(mapFoundationLifecycleToPrisma(foundationEnvelope({
      invitation: { ...foundationEnvelope().invitation, ...overrides },
    })), code);
  }

  const prismaCases = [
    [{ failedAttempts: -1 }, MAPPING_CODES.COUNTER_INVALID],
    [{ failedAttempts: 3 }, MAPPING_CODES.COUNTER_INVALID],
    [{ maxAttempts: 0 }, MAPPING_CODES.COUNTER_INVALID],
    [{ tokenDigest: 'A'.repeat(64) }, MAPPING_CODES.DIGEST_INVALID],
    [{ expiresAt: '2026-08-09' }, MAPPING_CODES.TIMESTAMP_INVALID],
    [{ consumedAt: 0 }, MAPPING_CODES.TIMESTAMP_INVALID],
  ];
  for (const [overrides, code] of prismaCases) {
    assertFailure(mapPrismaLifecycleToFoundation(prismaEnvelope({
      oneTimeCredential: { ...prismaEnvelope().oneTimeCredential, ...overrides },
    })), code);
  }
});

test('Prisma Int bounds and negative zero are enforced without numeric coercion', () => {
  const beyondInt = 2147483648;
  for (const overrides of [
    { attemptCount: -0 },
    { attemptCount: beyondInt, maxAttempts: beyondInt + 1 },
    { maxAttempts: beyondInt },
  ]) {
    assertFailure(mapFoundationLifecycleToPrisma(foundationEnvelope({
      invitation: { ...foundationEnvelope().invitation, ...overrides },
    })), MAPPING_CODES.COUNTER_INVALID);
  }
  for (const overrides of [
    { failedAttempts: -0 },
    { failedAttempts: beyondInt, maxAttempts: beyondInt + 1 },
    { maxAttempts: beyondInt },
  ]) {
    assertFailure(mapPrismaLifecycleToFoundation(prismaEnvelope({
      oneTimeCredential: { ...prismaEnvelope().oneTimeCredential, ...overrides },
    })), MAPPING_CODES.COUNTER_INVALID);
  }
  for (const latestSequence of [-0, beyondInt]) {
    assertFailure(mapFoundationLifecycleToPrisma(foundationEnvelope({
      refreshFamily: { ...foundationEnvelope().refreshFamily, latestSequence },
    })), MAPPING_CODES.COUNTER_INVALID);
  }
  for (const currentSequence of [-0, beyondInt]) {
    assertFailure(mapPrismaLifecycleToFoundation(prismaEnvelope({
      refreshTokenFamily: { ...prismaEnvelope().refreshTokenFamily, currentSequence },
    })), MAPPING_CODES.COUNTER_INVALID);
  }

  const atBoundary = foundationEnvelope({
    invitation: { ...foundationEnvelope().invitation, maxAttempts: 2147483647 },
    refreshFamily: { ...foundationEnvelope().refreshFamily, latestSequence: 2147483647 },
  });
  assert.equal(mapFoundationLifecycleToPrisma(atBoundary).ok, true);
});

test('refresh families map latestSequence/currentSequence reversibly and reject nonrepresentable expiry', () => {
  for (const revokedAt of [null, EVENT_AT]) {
    const source = foundationEnvelope({
      invitation: null,
      refreshFamily: { ...foundationEnvelope().refreshFamily, latestSequence: 9, revokedAt },
    });
    const mapped = mapFoundationLifecycleToPrisma(source);
    assert.equal(mapped.ok, true);
    assert.equal(mapped.value.refreshTokenFamily.currentSequence, 9);
    assert.equal(mapped.value.refreshTokenFamily.status, revokedAt ? 'REVOKED' : 'ACTIVE');
    assert.deepEqual(mapPrismaLifecycleToFoundation(mapped.value).value, source);
  }

  for (const status of ['EXPIRED', 'UNKNOWN']) {
    assertFailure(mapPrismaLifecycleToFoundation(prismaEnvelope({
      refreshTokenFamily: { ...prismaEnvelope().refreshTokenFamily, status },
    })), MAPPING_CODES.STATE_NOT_REPRESENTABLE);
  }
  assertFailure(mapFoundationLifecycleToPrisma(foundationEnvelope({
    refreshFamily: { ...foundationEnvelope().refreshFamily, latestSequence: -1 },
  })), MAPPING_CODES.COUNTER_INVALID);
});

test('family status and revokedAt must agree exactly', () => {
  assertFailure(mapPrismaLifecycleToFoundation(prismaEnvelope({
    refreshTokenFamily: { ...prismaEnvelope().refreshTokenFamily, status: 'ACTIVE', revokedAt: EVENT_AT },
  })), MAPPING_CODES.STATUS_INCONSISTENT);
  assertFailure(mapPrismaLifecycleToFoundation(prismaEnvelope({
    refreshTokenFamily: { ...prismaEnvelope().refreshTokenFamily, status: 'REVOKED', revokedAt: null },
  })), MAPPING_CODES.STATUS_INCONSISTENT);
});

test('subject and tenant mismatches fail closed for every linked record in both directions', () => {
  const foundationCases = [
    [{ invitation: { ...foundationEnvelope().invitation, accountId: 'user-2' } }, MAPPING_CODES.SUBJECT_MISMATCH],
    [{ invitation: { ...foundationEnvelope().invitation, tenantId: 'tenant-2' } }, MAPPING_CODES.TENANT_MISMATCH],
    [{ refreshFamily: { ...foundationEnvelope().refreshFamily, accountId: 'user-2' } }, MAPPING_CODES.SUBJECT_MISMATCH],
    [{ refreshFamily: { ...foundationEnvelope().refreshFamily, tenantId: 'tenant-2' } }, MAPPING_CODES.TENANT_MISMATCH],
  ];
  for (const [overrides, code] of foundationCases) {
    assertFailure(mapFoundationLifecycleToPrisma(foundationEnvelope(overrides)), code);
  }

  const prismaCases = [
    [{ oneTimeCredential: { ...prismaEnvelope().oneTimeCredential, userId: 'user-2' } }, MAPPING_CODES.SUBJECT_MISMATCH],
    [{ oneTimeCredential: { ...prismaEnvelope().oneTimeCredential, tenantId: 'tenant-2' } }, MAPPING_CODES.TENANT_MISMATCH],
    [{ refreshTokenFamily: { ...prismaEnvelope().refreshTokenFamily, userId: 'user-2' } }, MAPPING_CODES.SUBJECT_MISMATCH],
    [{ refreshTokenFamily: { ...prismaEnvelope().refreshTokenFamily, tenantId: 'tenant-2' } }, MAPPING_CODES.TENANT_MISMATCH],
  ];
  for (const [overrides, code] of prismaCases) {
    assertFailure(mapPrismaLifecycleToFoundation(prismaEnvelope(overrides)), code);
  }
});

test('raw secrets fail before shape handling and never appear in mapping output', () => {
  const forbiddenValue = ['fixture', 'raw', 'value'].join(':');
  const secretCases = [
    { rawToken: forbiddenValue },
    { 'raw-token': forbiddenValue },
    { metadata: { password: forbiddenValue } },
    { nested: { clientSecret: forbiddenValue } },
  ];
  for (const secret of secretCases) {
    assertFailure(mapFoundationLifecycleToPrisma({ ...foundationEnvelope(), ...secret }),
      MAPPING_CODES.RAW_SECRET_FORBIDDEN);
    assertFailure(mapPrismaLifecycleToFoundation({ ...prismaEnvelope(), ...secret }),
      MAPPING_CODES.RAW_SECRET_FORBIDDEN);
  }

  const mapped = mapFoundationLifecycleToPrisma(foundationEnvelope());
  assert.equal(JSON.stringify(mapped).includes(forbiddenValue), false);
});

test('unknown or duplicate-shape keys fail closed at the envelope and every nested projection', () => {
  const foundationCases = [
    { ...foundationEnvelope(), unexpected: true },
    foundationEnvelope({ account: { ...foundationEnvelope().account, tokenVersion: 1 } }),
    foundationEnvelope({ invitation: { ...foundationEnvelope().invitation, status: 'ISSUED' } }),
    foundationEnvelope({ refreshFamily: { ...foundationEnvelope().refreshFamily, currentSequence: 4 } }),
  ];
  for (const input of foundationCases) {
    assertFailure(mapFoundationLifecycleToPrisma(input), MAPPING_CODES.KEYS_INVALID);
  }

  const prismaCases = [
    { ...prismaEnvelope(), unexpected: true },
    prismaEnvelope({ userSecurityState: { ...prismaEnvelope().userSecurityState, tokenVersion: 1 } }),
    prismaEnvelope({ oneTimeCredential: { ...prismaEnvelope().oneTimeCredential, attemptCount: 1 } }),
    prismaEnvelope({ refreshTokenFamily: { ...prismaEnvelope().refreshTokenFamily, latestSequence: 4 } }),
  ];
  for (const input of prismaCases) {
    assertFailure(mapPrismaLifecycleToFoundation(input), MAPPING_CODES.KEYS_INVALID);
  }
});

test('missing, stale, or unknown mapping contract versions fail closed', () => {
  const cases = [
    ['mappingVersion', 'IAM-MAP-01/0.9.0'],
    ['foundationVersion', '2026-08-08.0'],
    ['prismaProposalVersion', 'rbac-abac-v1/0.9.0'],
  ];
  for (const [key, value] of cases) {
    assertFailure(mapFoundationLifecycleToPrisma(foundationEnvelope({ [key]: value })),
      MAPPING_CODES.VERSION_MISMATCH);
    assertFailure(mapPrismaLifecycleToFoundation(prismaEnvelope({ [key]: value })),
      MAPPING_CODES.VERSION_MISMATCH);
  }

  const missing = foundationEnvelope();
  delete missing.mappingVersion;
  assertFailure(mapFoundationLifecycleToPrisma(missing), MAPPING_CODES.KEYS_INVALID);
});

test('invalid identifiers and tenantless proposal records are rejected without coercion', () => {
  assertFailure(mapFoundationLifecycleToPrisma(foundationEnvelope({
    account: { ...foundationEnvelope().account, id: ' user-1 ' },
  })), MAPPING_CODES.IDENTIFIER_INVALID);
  assertFailure(mapPrismaLifecycleToFoundation(prismaEnvelope({
    userSecurityState: { ...prismaEnvelope().userSecurityState, tenantId: null },
  })), MAPPING_CODES.IDENTIFIER_INVALID);
  assertFailure(mapPrismaLifecycleToFoundation(prismaEnvelope({
    userSecurityState: { ...prismaEnvelope().userSecurityState, userId: 42 },
  })), MAPPING_CODES.IDENTIFIER_INVALID);
});

test('arrays, custom prototypes, cycles, and throwing getters fail closed without escaping', () => {
  assertFailure(mapFoundationLifecycleToPrisma(null), MAPPING_CODES.INPUT_INVALID);
  assertFailure(mapPrismaLifecycleToFoundation([]), MAPPING_CODES.INPUT_INVALID);

  const customPrototype = Object.assign(Object.create({ inherited: true }), foundationEnvelope());
  assertFailure(mapFoundationLifecycleToPrisma(customPrototype), MAPPING_CODES.INPUT_INVALID);

  const cyclic = foundationEnvelope();
  cyclic.self = cyclic;
  assertFailure(mapFoundationLifecycleToPrisma(cyclic), MAPPING_CODES.KEYS_INVALID);

  const throwingGetter = foundationEnvelope();
  Object.defineProperty(throwingGetter, 'rawToken', {
    enumerable: true,
    get() {
      throw new Error('must not escape');
    },
  });
  assertFailure(mapFoundationLifecycleToPrisma(throwingGetter), MAPPING_CODES.RAW_SECRET_FORBIDDEN);
});

test('accessors, hidden keys and symbols cannot evade the exact immutable snapshot', () => {
  const mutableGetter = foundationEnvelope();
  let reads = 0;
  Object.defineProperty(mutableGetter.account, 'state', {
    enumerable: true,
    get() {
      reads += 1;
      return reads === 1 ? 'ACTIVE' : 'LOCKED';
    },
  });
  assertFailure(mapFoundationLifecycleToPrisma(mutableGetter), MAPPING_CODES.KEYS_INVALID);
  assert.equal(reads, 0);

  const hiddenSecret = foundationEnvelope();
  const hiddenSentinel = ['fixture', 'hidden', 'value'].join(':');
  Object.defineProperty(hiddenSecret, 'rawToken', {
    enumerable: false,
    value: hiddenSentinel,
  });
  assertFailure(mapFoundationLifecycleToPrisma(hiddenSecret), MAPPING_CODES.RAW_SECRET_FORBIDDEN);

  const symbolKey = foundationEnvelope();
  symbolKey[Symbol('unexpected')] = true;
  assertFailure(mapFoundationLifecycleToPrisma(symbolKey), MAPPING_CODES.KEYS_INVALID);
});

test('hostile proxies are rejected before traps can hide secrets or mutate nested records', () => {
  const target = foundationEnvelope();
  Object.defineProperty(target, 'rawToken', {
    configurable: true,
    enumerable: true,
    value: 'must-never-cross-the-boundary',
  });
  let trapCalls = 0;
  const hidingProxy = new Proxy(target, {
    ownKeys(inner) {
      trapCalls += 1;
      return Reflect.ownKeys(inner).filter(key => key !== 'rawToken');
    },
    getOwnPropertyDescriptor(inner, key) {
      trapCalls += 1;
      return Reflect.getOwnPropertyDescriptor(inner, key);
    },
  });
  assertFailure(mapFoundationLifecycleToPrisma(hidingProxy), MAPPING_CODES.INPUT_INVALID);
  assert.equal(trapCalls, 0, 'proxy traps must not run before rejection');

  const nested = foundationEnvelope();
  nested.account = new Proxy(nested.account, {
    ownKeys(inner) {
      trapCalls += 1;
      return Reflect.ownKeys(inner);
    },
  });
  assertFailure(mapFoundationLifecycleToPrisma(nested), MAPPING_CODES.INPUT_INVALID);
  assert.equal(trapCalls, 0, 'nested proxy traps must not run before rejection');
});
