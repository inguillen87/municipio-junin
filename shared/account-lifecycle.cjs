'use strict';

// Pure, runtime-neutral account lifecycle decisions.
//
// This module deliberately performs no I/O, persistence, token generation,
// password handling, cryptographic hashing, or authorization lookup. Callers
// must calculate presented digests before invoking it and must persist accepted
// decisions atomically with an append-only audit event.
const ACCOUNT_LIFECYCLE_VERSION = '2026-08-08.1';

const ACCOUNT_STATES = Object.freeze({
  INVITED: 'INVITED',
  FIRST_LOGIN_REQUIRED: 'FIRST_LOGIN_REQUIRED',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
});

const ACCOUNT_EVENTS = Object.freeze({
  ACCEPT_INVITATION: 'ACCEPT_INVITATION',
  COMPLETE_FIRST_LOGIN: 'COMPLETE_FIRST_LOGIN',
  SUSPEND: 'SUSPEND',
  REINSTATE: 'REINSTATE',
  EXPIRE: 'EXPIRE',
  REVOKE: 'REVOKE',
});

const ASSIGNMENT_STATES = Object.freeze({
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
});

const GOVERNED_ROLES = Object.freeze([
  'SUPER_ADMIN',
  'INTENDENTE',
  'TENANT_ADMIN',
  'TENANT_USER',
  'CONTADOR',
  'INSPECTOR',
  'DEMO',
]);

const PRIVILEGED_ROLES = Object.freeze([
  'SUPER_ADMIN',
  'INTENDENTE',
  'TENANT_ADMIN',
  'CONTADOR',
]);

const DATA_SCOPES = Object.freeze({
  SYNTHETIC_DEMO: 'SYNTHETIC_DEMO',
  GRH_REAL: 'GRH_REAL',
});

const DECISION_CODES = Object.freeze({
  ALLOWED: 'ALLOWED',
  CLOCK_INVALID: 'CLOCK_INVALID',
  RECORD_MISSING: 'RECORD_MISSING',
  RECORD_INVALID: 'RECORD_INVALID',
  RAW_SECRET_FORBIDDEN: 'RAW_SECRET_FORBIDDEN',
  IDENTIFIER_INVALID: 'IDENTIFIER_INVALID',
  SUBJECT_MISMATCH: 'SUBJECT_MISMATCH',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  ROLE_UNKNOWN: 'ROLE_UNKNOWN',
  ACCOUNT_STATE_UNKNOWN: 'ACCOUNT_STATE_UNKNOWN',
  ACCOUNT_STATE_BLOCKED: 'ACCOUNT_STATE_BLOCKED',
  ACCOUNT_EXPIRY_INVALID: 'ACCOUNT_EXPIRY_INVALID',
  ACCOUNT_EXPIRED: 'ACCOUNT_EXPIRED',
  ASSIGNMENT_STATE_UNKNOWN: 'ASSIGNMENT_STATE_UNKNOWN',
  ASSIGNMENT_STATE_BLOCKED: 'ASSIGNMENT_STATE_BLOCKED',
  ASSIGNMENT_EXPIRY_INVALID: 'ASSIGNMENT_EXPIRY_INVALID',
  ASSIGNMENT_EXPIRED: 'ASSIGNMENT_EXPIRED',
  MFA_ENROLLMENT_REQUIRED: 'MFA_ENROLLMENT_REQUIRED',
  MFA_VERIFICATION_REQUIRED: 'MFA_VERIFICATION_REQUIRED',
  MFA_VERIFICATION_INVALID: 'MFA_VERIFICATION_INVALID',
  EVENT_UNKNOWN: 'EVENT_UNKNOWN',
  TRANSITION_NOT_ALLOWED: 'TRANSITION_NOT_ALLOWED',
  TRANSITION_PRECONDITION_FAILED: 'TRANSITION_PRECONDITION_FAILED',
  INVITATION_DIGEST_INVALID: 'INVITATION_DIGEST_INVALID',
  INVITATION_REVOKED: 'INVITATION_REVOKED',
  INVITATION_ALREADY_USED: 'INVITATION_ALREADY_USED',
  INVITATION_EXPIRY_INVALID: 'INVITATION_EXPIRY_INVALID',
  INVITATION_EXPIRED: 'INVITATION_EXPIRED',
  INVITATION_ATTEMPTS_INVALID: 'INVITATION_ATTEMPTS_INVALID',
  INVITATION_ATTEMPTS_EXHAUSTED: 'INVITATION_ATTEMPTS_EXHAUSTED',
  INVITATION_DIGEST_MISMATCH: 'INVITATION_DIGEST_MISMATCH',
  INVITATION_ACCEPTED: 'INVITATION_ACCEPTED',
  SESSION_KIND_INVALID: 'SESSION_KIND_INVALID',
  SESSION_REVOKED: 'SESSION_REVOKED',
  SESSION_FAMILY_REVOKED: 'SESSION_FAMILY_REVOKED',
  SESSION_EXPIRY_INVALID: 'SESSION_EXPIRY_INVALID',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  ACCESS_ALLOWED: 'ACCESS_ALLOWED',
  REFRESH_FAMILY_REVOKED: 'REFRESH_FAMILY_REVOKED',
  REFRESH_SEQUENCE_INVALID: 'REFRESH_SEQUENCE_INVALID',
  REFRESH_SEQUENCE_AHEAD: 'REFRESH_SEQUENCE_AHEAD',
  REFRESH_CREDENTIAL_REVOKED: 'REFRESH_CREDENTIAL_REVOKED',
  REFRESH_REUSE_DETECTED: 'REFRESH_REUSE_DETECTED',
  REFRESH_DIGEST_INVALID: 'REFRESH_DIGEST_INVALID',
  REFRESH_DIGEST_MISMATCH: 'REFRESH_DIGEST_MISMATCH',
  REFRESH_ROTATION_ALLOWED: 'REFRESH_ROTATION_ALLOWED',
  REQUESTER_REQUIRED: 'REQUESTER_REQUIRED',
  APPROVER_REQUIRED: 'APPROVER_REQUIRED',
  REQUESTER_CANNOT_APPROVE: 'REQUESTER_CANNOT_APPROVE',
  APPROVAL_ALLOWED: 'APPROVAL_ALLOWED',
  DEMO_TENANT_REQUIRED: 'DEMO_TENANT_REQUIRED',
  DEMO_SUPER_ADMIN_FORBIDDEN: 'DEMO_SUPER_ADMIN_FORBIDDEN',
  DEMO_SYNTHETIC_DATA_REQUIRED: 'DEMO_SYNTHETIC_DATA_REQUIRED',
  DEMO_EXPIRY_REQUIRED: 'DEMO_EXPIRY_REQUIRED',
  DEMO_EXPIRED: 'DEMO_EXPIRED',
  DEMO_DURATION_EXCEEDED: 'DEMO_DURATION_EXCEEDED',
  DEMO_PLAN_READY: 'DEMO_PLAN_READY',
});

const TRANSITION_TARGETS = deepFreeze({
  INVITED: {
    ACCEPT_INVITATION: ACCOUNT_STATES.FIRST_LOGIN_REQUIRED,
    EXPIRE: ACCOUNT_STATES.EXPIRED,
    REVOKE: ACCOUNT_STATES.REVOKED,
  },
  FIRST_LOGIN_REQUIRED: {
    COMPLETE_FIRST_LOGIN: ACCOUNT_STATES.ACTIVE,
    SUSPEND: ACCOUNT_STATES.SUSPENDED,
    EXPIRE: ACCOUNT_STATES.EXPIRED,
    REVOKE: ACCOUNT_STATES.REVOKED,
  },
  ACTIVE: {
    SUSPEND: ACCOUNT_STATES.SUSPENDED,
    EXPIRE: ACCOUNT_STATES.EXPIRED,
    REVOKE: ACCOUNT_STATES.REVOKED,
  },
  SUSPENDED: {
    REINSTATE: ACCOUNT_STATES.ACTIVE,
    EXPIRE: ACCOUNT_STATES.EXPIRED,
    REVOKE: ACCOUNT_STATES.REVOKED,
  },
  EXPIRED: {
    REVOKE: ACCOUNT_STATES.REVOKED,
  },
  REVOKED: {},
});

const KNOWN_ACCOUNT_STATES = new Set(Object.values(ACCOUNT_STATES));
const KNOWN_ASSIGNMENT_STATES = new Set(Object.values(ASSIGNMENT_STATES));
const KNOWN_EVENTS = new Set(Object.values(ACCOUNT_EVENTS));
const KNOWN_ROLES = new Set(GOVERNED_ROLES);
const MFA_REQUIRED = new Set(PRIVILEGED_ROLES);
const RAW_SECRET_KEYS = new Set([
  'accesstoken',
  'password',
  'plaintexttoken',
  'rawsecret',
  'rawtoken',
  'refreshtoken',
  'secret',
  'token',
]);
const SHA256_HEX = /^[a-f0-9]{64}$/;
const UTC_ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CANONICAL_ID = /^[^\s\u0000-\u001f\u007f]{1,128}$/;
const MAX_DEMO_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function decision(allowed, code, details = {}) {
  return deepFreeze({ allowed, code, ...details });
}

function own(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalId(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized === value && CANONICAL_ID.test(normalized) ? normalized : null;
}

function timestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value !== 'string' || !UTC_ISO_TIMESTAMP.test(value)) return Number.NaN;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return Number.NaN;
  const canonical = value.includes('.') ? value : value.replace('Z', '.000Z');
  return new Date(parsed).toISOString() === canonical ? parsed : Number.NaN;
}

function clock(now) {
  const value = timestamp(now);
  return Number.isFinite(value)
    ? { valid: true, value, iso: new Date(value).toISOString() }
    : { valid: false };
}

function hasRawSecret(value, visited = new WeakSet()) {
  if (!value || typeof value !== 'object') return false;
  if (visited.has(value)) return false;
  visited.add(value);
  return Object.entries(value).some(([key, child]) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized !== 'tokendigest' &&
        (RAW_SECRET_KEYS.has(normalized) || normalized.includes('token') ||
         normalized.includes('password') || normalized.includes('secret'))) {
      return true;
    }
    return hasRawSecret(child, visited);
  });
}

function validDigest(value) {
  return typeof value === 'string' && SHA256_HEX.test(value);
}

// Both inputs are already-computed canonical SHA-256 hex digests. This avoids
// early exit while keeping hashing and raw credentials outside this module.
function equalDigest(left, right) {
  if (!validDigest(left) || !validDigest(right)) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function expiryDecision(value, nowValue, required, invalidCode, expiredCode) {
  if (value === null || value === undefined) {
    return required ? decision(false, invalidCode) : null;
  }
  const expiresAt = timestamp(value);
  if (!Number.isFinite(expiresAt)) return decision(false, invalidCode);
  if (expiresAt <= nowValue) {
    return decision(false, expiredCode, { expiresAt: new Date(expiresAt).toISOString() });
  }
  return null;
}

function optionalTimestamp(value) {
  if (value === null || value === undefined) return { valid: true, present: false };
  const parsed = timestamp(value);
  if (!Number.isFinite(parsed)) return { valid: false, present: false };
  return { valid: true, present: true, value: parsed, iso: new Date(parsed).toISOString() };
}

function evaluateMfaGate({ role, mfa, now }) {
  const currentClock = clock(now);
  if (!currentClock.valid) return decision(false, DECISION_CODES.CLOCK_INVALID);
  if (!KNOWN_ROLES.has(role)) return decision(false, DECISION_CODES.ROLE_UNKNOWN);
  if (!MFA_REQUIRED.has(role)) {
    return decision(true, DECISION_CODES.ALLOWED, { required: false });
  }
  if (!isRecord(mfa) || mfa.enrolled !== true) {
    return decision(false, DECISION_CODES.MFA_ENROLLMENT_REQUIRED, { required: true });
  }
  if (mfa.verifiedAt === null || mfa.verifiedAt === undefined || mfa.verifiedAt === '') {
    return decision(false, DECISION_CODES.MFA_VERIFICATION_REQUIRED, { required: true });
  }
  const verifiedAt = timestamp(mfa.verifiedAt);
  if (!Number.isFinite(verifiedAt) || verifiedAt > currentClock.value) {
    return decision(false, DECISION_CODES.MFA_VERIFICATION_INVALID, { required: true });
  }
  return decision(true, DECISION_CODES.ALLOWED, {
    required: true,
    verifiedAt: new Date(verifiedAt).toISOString(),
  });
}

function evaluateAssignment(assignment, account, nowValue) {
  if (!isRecord(assignment)) return decision(false, DECISION_CODES.RECORD_MISSING);
  if (!KNOWN_ASSIGNMENT_STATES.has(assignment.state)) {
    return decision(false, DECISION_CODES.ASSIGNMENT_STATE_UNKNOWN);
  }
  if (assignment.state !== ASSIGNMENT_STATES.ACTIVE) {
    return decision(false, DECISION_CODES.ASSIGNMENT_STATE_BLOCKED);
  }
  if (!canonicalId(assignment.accountId) || assignment.accountId !== account.id) {
    return decision(false, DECISION_CODES.SUBJECT_MISMATCH);
  }
  if (!canonicalId(assignment.tenantId) || assignment.tenantId !== account.tenantId) {
    return decision(false, DECISION_CODES.TENANT_MISMATCH);
  }
  if (!KNOWN_ROLES.has(assignment.role)) return decision(false, DECISION_CODES.ROLE_UNKNOWN);
  const expiry = expiryDecision(
    assignment.expiresAt,
    nowValue,
    false,
    DECISION_CODES.ASSIGNMENT_EXPIRY_INVALID,
    DECISION_CODES.ASSIGNMENT_EXPIRED,
  );
  return expiry || decision(true, DECISION_CODES.ALLOWED, { role: assignment.role });
}

function evaluateAccountAccess({ account, assignment, mfa, now }) {
  const currentClock = clock(now);
  if (!currentClock.valid) return decision(false, DECISION_CODES.CLOCK_INVALID);
  if (!isRecord(account)) return decision(false, DECISION_CODES.RECORD_MISSING);
  if (!canonicalId(account.id) || !canonicalId(account.tenantId)) {
    return decision(false, DECISION_CODES.IDENTIFIER_INVALID);
  }
  if (!KNOWN_ACCOUNT_STATES.has(account.state)) {
    return decision(false, DECISION_CODES.ACCOUNT_STATE_UNKNOWN);
  }
  if (account.state !== ACCOUNT_STATES.ACTIVE) {
    return decision(false, DECISION_CODES.ACCOUNT_STATE_BLOCKED, { state: account.state });
  }
  const accountExpiry = expiryDecision(
    account.expiresAt,
    currentClock.value,
    false,
    DECISION_CODES.ACCOUNT_EXPIRY_INVALID,
    DECISION_CODES.ACCOUNT_EXPIRED,
  );
  if (accountExpiry) return accountExpiry;

  const assignmentDecision = evaluateAssignment(assignment, account, currentClock.value);
  if (!assignmentDecision.allowed) return assignmentDecision;
  const mfaDecision = evaluateMfaGate({ role: assignment.role, mfa, now });
  if (!mfaDecision.allowed) return mfaDecision;

  return decision(true, DECISION_CODES.ALLOWED, {
    accountId: account.id,
    tenantId: account.tenantId,
    role: assignment.role,
    mfaRequired: mfaDecision.required,
  });
}

function decideInvitationUse({ invitation, presentedTokenDigest, now }) {
  const currentClock = clock(now);
  if (!currentClock.valid) return decision(false, DECISION_CODES.CLOCK_INVALID);
  if (!isRecord(invitation)) return decision(false, DECISION_CODES.RECORD_MISSING);
  if (hasRawSecret(invitation)) return decision(false, DECISION_CODES.RAW_SECRET_FORBIDDEN);
  if (![invitation.id, invitation.accountId, invitation.tenantId].every(canonicalId)) {
    return decision(false, DECISION_CODES.IDENTIFIER_INVALID);
  }
  if (!validDigest(invitation.tokenDigest) || !validDigest(presentedTokenDigest)) {
    return decision(false, DECISION_CODES.INVITATION_DIGEST_INVALID);
  }
  const revoked = optionalTimestamp(invitation.revokedAt);
  const used = optionalTimestamp(invitation.usedAt);
  const locked = optionalTimestamp(invitation.lockedAt);
  if (!revoked.valid || !used.valid || !locked.valid) {
    return decision(false, DECISION_CODES.RECORD_INVALID);
  }
  if (revoked.present) return decision(false, DECISION_CODES.INVITATION_REVOKED);
  if (used.present) return decision(false, DECISION_CODES.INVITATION_ALREADY_USED);
  if (!Number.isInteger(invitation.attemptCount) || invitation.attemptCount < 0 ||
      !Number.isInteger(invitation.maxAttempts) || invitation.maxAttempts < 1 ||
      invitation.attemptCount > invitation.maxAttempts) {
    return decision(false, DECISION_CODES.INVITATION_ATTEMPTS_INVALID);
  }
  if (invitation.attemptCount >= invitation.maxAttempts || locked.present) {
    return decision(false, DECISION_CODES.INVITATION_ATTEMPTS_EXHAUSTED);
  }
  const invitationExpiry = expiryDecision(
    invitation.expiresAt,
    currentClock.value,
    true,
    DECISION_CODES.INVITATION_EXPIRY_INVALID,
    DECISION_CODES.INVITATION_EXPIRED,
  );
  if (invitationExpiry) return invitationExpiry;

  if (!equalDigest(invitation.tokenDigest, presentedTokenDigest)) {
    const nextAttemptCount = invitation.attemptCount + 1;
    const exhausted = nextAttemptCount >= invitation.maxAttempts;
    return decision(false, DECISION_CODES.INVITATION_DIGEST_MISMATCH, {
      action: 'RECORD_FAILED_ATTEMPT',
      patch: {
        attemptCount: nextAttemptCount,
        ...(exhausted ? { lockedAt: currentClock.iso } : {}),
      },
      exhausted,
    });
  }

  return decision(true, DECISION_CODES.INVITATION_ACCEPTED, {
    action: 'CONSUME_INVITATION',
    subject: {
      invitationId: invitation.id,
      accountId: invitation.accountId,
      tenantId: invitation.tenantId,
    },
    patch: { usedAt: currentClock.iso },
    nextAccountState: ACCOUNT_STATES.FIRST_LOGIN_REQUIRED,
  });
}

function getTransitionTarget(state, event) {
  if (!KNOWN_ACCOUNT_STATES.has(state) || !KNOWN_EVENTS.has(event)) return null;
  return TRANSITION_TARGETS[state][event] || null;
}

function decideAccountTransition({
  account,
  assignment,
  event,
  invitation,
  presentedTokenDigest,
  firstLoginCompleted,
  mfa,
  now,
}) {
  const currentClock = clock(now);
  if (!currentClock.valid) return decision(false, DECISION_CODES.CLOCK_INVALID);
  if (!isRecord(account)) return decision(false, DECISION_CODES.RECORD_MISSING);
  if (!canonicalId(account.id) || !canonicalId(account.tenantId)) {
    return decision(false, DECISION_CODES.IDENTIFIER_INVALID);
  }
  if (!KNOWN_ACCOUNT_STATES.has(account.state)) {
    return decision(false, DECISION_CODES.ACCOUNT_STATE_UNKNOWN);
  }
  if (!KNOWN_EVENTS.has(event)) return decision(false, DECISION_CODES.EVENT_UNKNOWN);

  const targetState = getTransitionTarget(account.state, event);
  if (!targetState) return decision(false, DECISION_CODES.TRANSITION_NOT_ALLOWED);

  const accountExpiry = expiryDecision(
    account.expiresAt,
    currentClock.value,
    false,
    DECISION_CODES.ACCOUNT_EXPIRY_INVALID,
    DECISION_CODES.ACCOUNT_EXPIRED,
  );
  if (accountExpiry && ![ACCOUNT_EVENTS.EXPIRE, ACCOUNT_EVENTS.REVOKE].includes(event)) {
    return accountExpiry;
  }

  let relatedPatches;
  if (event === ACCOUNT_EVENTS.ACCEPT_INVITATION) {
    const invitationDecision = decideInvitationUse({ invitation, presentedTokenDigest, now });
    if (!invitationDecision.allowed) return invitationDecision;
    const subject = invitationDecision.subject;
    if (subject.accountId !== account.id || subject.tenantId !== account.tenantId) {
      return decision(false, DECISION_CODES.TRANSITION_PRECONDITION_FAILED);
    }
    relatedPatches = {
      invitation: {
        id: subject.invitationId,
        ...invitationDecision.patch,
      },
    };
  }

  if ([ACCOUNT_EVENTS.COMPLETE_FIRST_LOGIN, ACCOUNT_EVENTS.REINSTATE].includes(event)) {
    if (event === ACCOUNT_EVENTS.COMPLETE_FIRST_LOGIN && firstLoginCompleted !== true) {
      return decision(false, DECISION_CODES.TRANSITION_PRECONDITION_FAILED);
    }
    const assignmentDecision = evaluateAssignment(assignment, account, currentClock.value);
    if (!assignmentDecision.allowed) return assignmentDecision;
    const mfaDecision = evaluateMfaGate({ role: assignment.role, mfa, now });
    if (!mfaDecision.allowed) return mfaDecision;
  }

  const revokesSessionFamilies = [
    ACCOUNT_EVENTS.SUSPEND,
    ACCOUNT_EVENTS.EXPIRE,
    ACCOUNT_EVENTS.REVOKE,
  ].includes(event);
  return decision(true, DECISION_CODES.ALLOWED, {
    event,
    fromState: account.state,
    toState: targetState,
    patch: {
      state: targetState,
      stateChangedAt: currentClock.iso,
    },
    ...(relatedPatches ? { relatedPatches } : {}),
    effects: revokesSessionFamilies ? ['REVOKE_ALL_SESSION_FAMILIES'] : [],
  });
}

function evaluateAccessSession({ session, family, account, assignment, mfa, now }) {
  const currentClock = clock(now);
  if (!currentClock.valid) return decision(false, DECISION_CODES.CLOCK_INVALID);
  if (!isRecord(session) || !isRecord(family)) {
    return decision(false, DECISION_CODES.RECORD_MISSING);
  }
  if (hasRawSecret(session) || hasRawSecret(family)) {
    return decision(false, DECISION_CODES.RAW_SECRET_FORBIDDEN);
  }
  if (session.kind !== 'ACCESS') return decision(false, DECISION_CODES.SESSION_KIND_INVALID);
  if (![session.id, session.familyId, session.accountId, session.tenantId].every(canonicalId)) {
    return decision(false, DECISION_CODES.IDENTIFIER_INVALID);
  }
  if (session.accountId !== account?.id) return decision(false, DECISION_CODES.SUBJECT_MISMATCH);
  if (session.tenantId !== account?.tenantId) return decision(false, DECISION_CODES.TENANT_MISMATCH);
  if (![family.id, family.accountId, family.tenantId].every(canonicalId)) {
    return decision(false, DECISION_CODES.IDENTIFIER_INVALID);
  }
  if (session.familyId !== family.id || family.accountId !== account?.id) {
    return decision(false, DECISION_CODES.SUBJECT_MISMATCH);
  }
  if (family.tenantId !== account?.tenantId) return decision(false, DECISION_CODES.TENANT_MISMATCH);
  const sessionRevoked = optionalTimestamp(session.revokedAt);
  const familyRevoked = optionalTimestamp(family.revokedAt);
  if (!sessionRevoked.valid || !familyRevoked.valid) {
    return decision(false, DECISION_CODES.RECORD_INVALID);
  }
  if (sessionRevoked.present) return decision(false, DECISION_CODES.SESSION_REVOKED);
  if (familyRevoked.present) return decision(false, DECISION_CODES.SESSION_FAMILY_REVOKED);
  const sessionExpiry = expiryDecision(
    session.expiresAt,
    currentClock.value,
    true,
    DECISION_CODES.SESSION_EXPIRY_INVALID,
    DECISION_CODES.SESSION_EXPIRED,
  );
  if (sessionExpiry) return sessionExpiry;

  const accessDecision = evaluateAccountAccess({ account, assignment, mfa, now });
  if (!accessDecision.allowed) return accessDecision;
  return decision(true, DECISION_CODES.ACCESS_ALLOWED, {
    sessionId: session.id,
    familyId: session.familyId,
    accountId: account.id,
    tenantId: account.tenantId,
    role: assignment.role,
  });
}

function decideRefreshRotation({
  credential,
  family,
  account,
  assignment,
  mfa,
  presentedTokenDigest,
  now,
}) {
  const currentClock = clock(now);
  if (!currentClock.valid) return decision(false, DECISION_CODES.CLOCK_INVALID);
  if (!isRecord(credential) || !isRecord(family)) {
    return decision(false, DECISION_CODES.RECORD_MISSING);
  }
  if (hasRawSecret(credential) || hasRawSecret(family)) {
    return decision(false, DECISION_CODES.RAW_SECRET_FORBIDDEN);
  }
  if (credential.kind !== 'REFRESH') return decision(false, DECISION_CODES.SESSION_KIND_INVALID);
  if (![credential.id, credential.familyId, credential.accountId, credential.tenantId, family.id,
    family.accountId, family.tenantId].every(canonicalId)) {
    return decision(false, DECISION_CODES.IDENTIFIER_INVALID);
  }
  if (!validDigest(credential.tokenDigest) || !validDigest(presentedTokenDigest)) {
    return decision(false, DECISION_CODES.REFRESH_DIGEST_INVALID);
  }
  if (!Number.isInteger(credential.sequence) || credential.sequence < 0 ||
      !Number.isInteger(family.latestSequence) || family.latestSequence < 0) {
    return decision(false, DECISION_CODES.REFRESH_SEQUENCE_INVALID);
  }
  if (credential.familyId !== family.id || credential.accountId !== family.accountId ||
      credential.accountId !== account?.id) {
    return decision(false, DECISION_CODES.SUBJECT_MISMATCH);
  }
  if (credential.tenantId !== family.tenantId || credential.tenantId !== account?.tenantId) {
    return decision(false, DECISION_CODES.TENANT_MISMATCH);
  }
  if (!equalDigest(credential.tokenDigest, presentedTokenDigest)) {
    return decision(false, DECISION_CODES.REFRESH_DIGEST_MISMATCH, { action: 'DENY' });
  }
  const familyRevoked = optionalTimestamp(family.revokedAt);
  const credentialUsed = optionalTimestamp(credential.usedAt);
  const credentialRevoked = optionalTimestamp(credential.revokedAt);
  if (!familyRevoked.valid || !credentialUsed.valid || !credentialRevoked.valid) {
    return decision(false, DECISION_CODES.RECORD_INVALID);
  }
  if (familyRevoked.present) return decision(false, DECISION_CODES.REFRESH_FAMILY_REVOKED);

  if (credentialUsed.present || credential.sequence < family.latestSequence) {
    return decision(false, DECISION_CODES.REFRESH_REUSE_DETECTED, {
      action: 'REVOKE_FAMILY',
      reuseDetected: true,
      familyPatch: {
        revokedAt: currentClock.iso,
        revocationReason: 'REFRESH_REUSE',
      },
    });
  }
  if (credential.sequence > family.latestSequence) {
    return decision(false, DECISION_CODES.REFRESH_SEQUENCE_AHEAD, { action: 'DENY' });
  }
  if (credentialRevoked.present) return decision(false, DECISION_CODES.REFRESH_CREDENTIAL_REVOKED);
  const credentialExpiry = expiryDecision(
    credential.expiresAt,
    currentClock.value,
    true,
    DECISION_CODES.SESSION_EXPIRY_INVALID,
    DECISION_CODES.SESSION_EXPIRED,
  );
  if (credentialExpiry) return credentialExpiry;

  const accessDecision = evaluateAccountAccess({ account, assignment, mfa, now });
  if (!accessDecision.allowed) return accessDecision;
  return decision(true, DECISION_CODES.REFRESH_ROTATION_ALLOWED, {
    action: 'ROTATE',
    reuseDetected: false,
    consumePatch: { usedAt: currentClock.iso },
    familyPatch: { latestSequence: credential.sequence + 1 },
    nextCredential: {
      kind: 'REFRESH',
      familyId: family.id,
      accountId: account.id,
      tenantId: account.tenantId,
      sequence: credential.sequence + 1,
    },
  });
}

function evaluateSeparationOfDuties({ requesterId, approverId }) {
  const requester = canonicalId(requesterId);
  const approver = canonicalId(approverId);
  if (!requester) return decision(false, DECISION_CODES.REQUESTER_REQUIRED);
  if (!approver) return decision(false, DECISION_CODES.APPROVER_REQUIRED);
  if (requester === approver) {
    return decision(false, DECISION_CODES.REQUESTER_CANNOT_APPROVE);
  }
  return decision(true, DECISION_CODES.APPROVAL_ALLOWED, {
    requesterId: requester,
    approverId: approver,
  });
}

function planDemoProvisioning(input) {
  if (!isRecord(input)) return decision(false, DECISION_CODES.RECORD_MISSING, { dryRun: true });
  if (hasRawSecret(input)) {
    return decision(false, DECISION_CODES.RAW_SECRET_FORBIDDEN, { dryRun: true });
  }
  const { tenantId, requesterId, approverId, role, dataScope, expiresAt, now } = input;
  const currentClock = clock(now);
  if (!currentClock.valid) return decision(false, DECISION_CODES.CLOCK_INVALID, { dryRun: true });
  const tenant = canonicalId(tenantId);
  if (!tenant) return decision(false, DECISION_CODES.DEMO_TENANT_REQUIRED, { dryRun: true });
  if (role === 'SUPER_ADMIN') {
    return decision(false, DECISION_CODES.DEMO_SUPER_ADMIN_FORBIDDEN, { dryRun: true });
  }
  if (!KNOWN_ROLES.has(role)) return decision(false, DECISION_CODES.ROLE_UNKNOWN, { dryRun: true });
  if (dataScope !== DATA_SCOPES.SYNTHETIC_DEMO) {
    return decision(false, DECISION_CODES.DEMO_SYNTHETIC_DATA_REQUIRED, { dryRun: true });
  }
  if (expiresAt === null || expiresAt === undefined || expiresAt === '') {
    return decision(false, DECISION_CODES.DEMO_EXPIRY_REQUIRED, { dryRun: true });
  }
  const expiry = timestamp(expiresAt);
  if (!Number.isFinite(expiry)) {
    return decision(false, DECISION_CODES.DEMO_EXPIRY_REQUIRED, { dryRun: true });
  }
  if (expiry <= currentClock.value) {
    return decision(false, DECISION_CODES.DEMO_EXPIRED, { dryRun: true });
  }
  if (expiry - currentClock.value > MAX_DEMO_DURATION_MS) {
    return decision(false, DECISION_CODES.DEMO_DURATION_EXCEEDED, { dryRun: true });
  }
  const approval = evaluateSeparationOfDuties({ requesterId, approverId });
  if (!approval.allowed) return decision(false, approval.code, { dryRun: true });

  const canonicalExpiry = new Date(expiry).toISOString();
  return decision(true, DECISION_CODES.DEMO_PLAN_READY, {
    dryRun: true,
    plan: {
      tenantId: tenant,
      role,
      dataScope: DATA_SCOPES.SYNTHETIC_DEMO,
      requesterId: approval.requesterId,
      approverId: approval.approverId,
      account: {
        initialState: ACCOUNT_STATES.INVITED,
        expiresAt: canonicalExpiry,
      },
      assignment: {
        initialState: ASSIGNMENT_STATES.ACTIVE,
        expiresAt: canonicalExpiry,
      },
      invitation: {
        oneTime: true,
        persistence: 'DIGEST_ONLY',
        expiresNoLaterThan: canonicalExpiry,
      },
      sessionPolicy: {
        refreshRotation: true,
        reuseAction: 'REVOKE_FAMILY',
        mfaRequired: MFA_REQUIRED.has(role),
      },
      sideEffects: [],
    },
  });
}

module.exports = deepFreeze({
  ACCOUNT_LIFECYCLE_VERSION,
  ACCOUNT_STATES,
  ACCOUNT_EVENTS,
  ASSIGNMENT_STATES,
  GOVERNED_ROLES,
  PRIVILEGED_ROLES,
  DATA_SCOPES,
  DECISION_CODES,
  TRANSITION_TARGETS,
  MAX_DEMO_DURATION_MS,
  getTransitionTarget,
  evaluateMfaGate,
  evaluateAccountAccess,
  decideInvitationUse,
  decideAccountTransition,
  evaluateAccessSession,
  decideRefreshRotation,
  evaluateSeparationOfDuties,
  planDemoProvisioning,
});
