import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import lifecycle from '../shared/account-lifecycle.cjs';

const require = createRequire(import.meta.url);
const cjsLifecycle = require('../shared/account-lifecycle.cjs');

const {
  ACCOUNT_EVENTS,
  ACCOUNT_STATES,
  ASSIGNMENT_STATES,
  DATA_SCOPES,
  DECISION_CODES,
  TRANSITION_TARGETS,
  decideAccountTransition,
  decideInvitationUse,
  decideRefreshRotation,
  evaluateAccessSession,
  evaluateAccountAccess,
  evaluateMfaGate,
  evaluateSeparationOfDuties,
  getTransitionTarget,
  planDemoProvisioning,
} = lifecycle;

const NOW = '2026-08-08T12:00:00.000Z';
const FUTURE = '2026-08-09T12:00:00.000Z';
const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);

function account(overrides = {}) {
  return {
    id: 'account-1',
    tenantId: 'tenant-1',
    state: ACCOUNT_STATES.ACTIVE,
    expiresAt: FUTURE,
    ...overrides,
  };
}

function assignment(overrides = {}) {
  return {
    accountId: 'account-1',
    tenantId: 'tenant-1',
    state: ASSIGNMENT_STATES.ACTIVE,
    role: 'INTENDENTE',
    expiresAt: FUTURE,
    ...overrides,
  };
}

function mfa(overrides = {}) {
  return {
    enrolled: true,
    verifiedAt: NOW,
    ...overrides,
  };
}

function invitation(overrides = {}) {
  return {
    id: 'invitation-1',
    accountId: 'account-1',
    tenantId: 'tenant-1',
    tokenDigest: DIGEST_A,
    attemptCount: 0,
    maxAttempts: 3,
    expiresAt: FUTURE,
    usedAt: null,
    revokedAt: null,
    lockedAt: null,
    ...overrides,
  };
}

function accessSession(overrides = {}) {
  return {
    id: 'access-1',
    kind: 'ACCESS',
    familyId: 'family-1',
    accountId: 'account-1',
    tenantId: 'tenant-1',
    expiresAt: FUTURE,
    revokedAt: null,
    ...overrides,
  };
}

function refreshCredential(overrides = {}) {
  return {
    id: 'refresh-1',
    kind: 'REFRESH',
    familyId: 'family-1',
    accountId: 'account-1',
    tenantId: 'tenant-1',
    tokenDigest: DIGEST_A,
    sequence: 2,
    expiresAt: FUTURE,
    usedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function refreshFamily(overrides = {}) {
  return {
    id: 'family-1',
    accountId: 'account-1',
    tenantId: 'tenant-1',
    latestSequence: 2,
    revokedAt: null,
    ...overrides,
  };
}

test('the CJS/ESM contract is immutable, versioned, and enumerates the exact state graph', () => {
  assert.strictEqual(lifecycle, cjsLifecycle);
  assert.equal(lifecycle.ACCOUNT_LIFECYCLE_VERSION, '2026-08-08.1');
  assert.equal(Object.isFrozen(lifecycle), true);
  assert.equal(Object.isFrozen(TRANSITION_TARGETS), true);
  assert.deepEqual(Object.keys(TRANSITION_TARGETS), Object.values(ACCOUNT_STATES));
  assert.deepEqual(TRANSITION_TARGETS, {
    INVITED: {
      ACCEPT_INVITATION: 'FIRST_LOGIN_REQUIRED',
      EXPIRE: 'EXPIRED',
      REVOKE: 'REVOKED',
    },
    FIRST_LOGIN_REQUIRED: {
      COMPLETE_FIRST_LOGIN: 'ACTIVE',
      SUSPEND: 'SUSPENDED',
      EXPIRE: 'EXPIRED',
      REVOKE: 'REVOKED',
    },
    ACTIVE: { SUSPEND: 'SUSPENDED', EXPIRE: 'EXPIRED', REVOKE: 'REVOKED' },
    SUSPENDED: { REINSTATE: 'ACTIVE', EXPIRE: 'EXPIRED', REVOKE: 'REVOKED' },
    EXPIRED: { REVOKE: 'REVOKED' },
    REVOKED: {},
  });
});

test('every undefined state/event edge fails closed and terminal REVOKED cannot transition', () => {
  for (const state of Object.values(ACCOUNT_STATES)) {
    for (const event of Object.values(ACCOUNT_EVENTS)) {
      const expected = TRANSITION_TARGETS[state][event] || null;
      assert.equal(getTransitionTarget(state, event), expected, `${state}:${event}`);
      if (!expected) {
        const result = decideAccountTransition({ account: account({ state }), event, now: NOW });
        assert.equal(result.allowed, false, `${state}:${event}`);
        assert.equal(result.code, DECISION_CODES.TRANSITION_NOT_ALLOWED, `${state}:${event}`);
      }
    }
  }
  assert.equal(getTransitionTarget('active', 'SUSPEND'), null);
  assert.equal(decideAccountTransition({ account: account(), event: 'DELETE', now: NOW }).code,
    DECISION_CODES.EVENT_UNKNOWN);
});

test('every declared edge produces exactly its declared target when its prerequisites hold', () => {
  for (const [state, transitions] of Object.entries(TRANSITION_TARGETS)) {
    for (const [event, expectedTarget] of Object.entries(transitions)) {
      const input = {
        account: account({ state }),
        event,
        now: NOW,
      };
      if (event === ACCOUNT_EVENTS.ACCEPT_INVITATION) {
        input.invitation = invitation();
        input.presentedTokenDigest = DIGEST_A;
      }
      if (event === ACCOUNT_EVENTS.COMPLETE_FIRST_LOGIN) {
        input.assignment = assignment();
        input.firstLoginCompleted = true;
        input.mfa = mfa();
      }
      if (event === ACCOUNT_EVENTS.REINSTATE) {
        input.assignment = assignment();
        input.mfa = mfa();
      }
      const result = decideAccountTransition(input);
      assert.equal(result.allowed, true, `${state}:${event}`);
      assert.equal(result.fromState, state, `${state}:${event}`);
      assert.equal(result.toState, expectedTarget, `${state}:${event}`);
    }
  }
});

test('invitation acceptance is single-use, digest-only, expiry-bound, and does not leak digests', () => {
  const source = invitation();
  const accepted = decideInvitationUse({ invitation: source, presentedTokenDigest: DIGEST_A, now: NOW });
  assert.equal(accepted.allowed, true);
  assert.equal(accepted.code, DECISION_CODES.INVITATION_ACCEPTED);
  assert.equal(accepted.action, 'CONSUME_INVITATION');
  assert.deepEqual(accepted.patch, { usedAt: NOW });
  assert.equal(accepted.nextAccountState, ACCOUNT_STATES.FIRST_LOGIN_REQUIRED);
  assert.equal(JSON.stringify(accepted).includes(DIGEST_A), false);
  assert.equal(source.usedAt, null, 'pure decision must not mutate source');

  assert.equal(decideInvitationUse({
    invitation: invitation({ usedAt: NOW }), presentedTokenDigest: DIGEST_A, now: NOW,
  }).code, DECISION_CODES.INVITATION_ALREADY_USED);
  assert.equal(decideInvitationUse({
    invitation: invitation({ expiresAt: NOW }), presentedTokenDigest: DIGEST_A, now: NOW,
  }).code, DECISION_CODES.INVITATION_EXPIRED);
  assert.equal(decideInvitationUse({
    invitation: invitation({ expiresAt: 'invalid' }), presentedTokenDigest: DIGEST_A, now: NOW,
  }).code, DECISION_CODES.INVITATION_EXPIRY_INVALID);
  assert.equal(decideInvitationUse({
    invitation: invitation({ rawToken: 'never-store-this' }), presentedTokenDigest: DIGEST_A, now: NOW,
  }).code, DECISION_CODES.RAW_SECRET_FORBIDDEN);
  assert.equal(decideInvitationUse({
    invitation: invitation({ 'raw-token': 'never-store-this' }), presentedTokenDigest: DIGEST_A, now: NOW,
  }).code, DECISION_CODES.RAW_SECRET_FORBIDDEN);
  assert.equal(decideInvitationUse({
    invitation: invitation({ metadata: { rawToken: 'never-store-this' } }),
    presentedTokenDigest: DIGEST_A,
    now: NOW,
  }).code, DECISION_CODES.RAW_SECRET_FORBIDDEN);
  assert.equal(decideInvitationUse({
    invitation: invitation({ usedAt: false }), presentedTokenDigest: DIGEST_A, now: NOW,
  }).code, DECISION_CODES.RECORD_INVALID);
  assert.equal(decideInvitationUse({
    invitation: invitation(), presentedTokenDigest: 'not-a-digest', now: NOW,
  }).code, DECISION_CODES.INVITATION_DIGEST_INVALID);
});

test('failed invitation digests increment attempts purely and lock at the exact limit', () => {
  const firstFailure = decideInvitationUse({
    invitation: invitation(), presentedTokenDigest: DIGEST_B, now: NOW,
  });
  assert.deepEqual(firstFailure, {
    allowed: false,
    code: DECISION_CODES.INVITATION_DIGEST_MISMATCH,
    action: 'RECORD_FAILED_ATTEMPT',
    patch: { attemptCount: 1 },
    exhausted: false,
  });

  const finalFailure = decideInvitationUse({
    invitation: invitation({ attemptCount: 2 }), presentedTokenDigest: DIGEST_B, now: NOW,
  });
  assert.equal(finalFailure.exhausted, true);
  assert.deepEqual(finalFailure.patch, { attemptCount: 3, lockedAt: NOW });
  assert.equal(decideInvitationUse({
    invitation: invitation({ attemptCount: 3 }), presentedTokenDigest: DIGEST_A, now: NOW,
  }).code, DECISION_CODES.INVITATION_ATTEMPTS_EXHAUSTED);
  assert.equal(decideInvitationUse({
    invitation: invitation({ attemptCount: -1 }), presentedTokenDigest: DIGEST_A, now: NOW,
  }).code, DECISION_CODES.INVITATION_ATTEMPTS_INVALID);
});

test('INVITED validates and consumes the same-subject invitation inside one transition decision', () => {
  const invitedAccount = account({ state: ACCOUNT_STATES.INVITED });
  const result = decideAccountTransition({
    account: invitedAccount,
    event: ACCOUNT_EVENTS.ACCEPT_INVITATION,
    invitation: invitation(),
    presentedTokenDigest: DIGEST_A,
    now: NOW,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.toState, ACCOUNT_STATES.FIRST_LOGIN_REQUIRED);
  assert.deepEqual(result.relatedPatches, {
    invitation: { id: 'invitation-1', usedAt: NOW },
  });
  assert.deepEqual(result.effects, []);
  assert.equal(invitedAccount.state, ACCOUNT_STATES.INVITED);

  assert.equal(decideAccountTransition({
    account: invitedAccount,
    event: ACCOUNT_EVENTS.ACCEPT_INVITATION,
    invitation: invitation({ accountId: 'account-2' }),
    presentedTokenDigest: DIGEST_A,
    now: NOW,
  }).code, DECISION_CODES.TRANSITION_PRECONDITION_FAILED);
  assert.equal(decideAccountTransition({
    account: invitedAccount,
    event: ACCOUNT_EVENTS.ACCEPT_INVITATION,
    invitation: invitation(),
    presentedTokenDigest: DIGEST_B,
    now: NOW,
  }).code, DECISION_CODES.INVITATION_DIGEST_MISMATCH);
});

test('activation and reinstatement enforce assignment validity and privileged MFA', () => {
  const firstLogin = account({ state: ACCOUNT_STATES.FIRST_LOGIN_REQUIRED });
  assert.equal(decideAccountTransition({
    account: firstLogin,
    assignment: assignment(),
    event: ACCOUNT_EVENTS.COMPLETE_FIRST_LOGIN,
    firstLoginCompleted: true,
    now: NOW,
  }).code, DECISION_CODES.MFA_ENROLLMENT_REQUIRED);

  const activated = decideAccountTransition({
    account: firstLogin,
    assignment: assignment(),
    event: ACCOUNT_EVENTS.COMPLETE_FIRST_LOGIN,
    firstLoginCompleted: true,
    mfa: mfa(),
    now: NOW,
  });
  assert.equal(activated.allowed, true);
  assert.equal(activated.toState, ACCOUNT_STATES.ACTIVE);

  assert.equal(decideAccountTransition({
    account: firstLogin,
    assignment: assignment({ expiresAt: NOW }),
    event: ACCOUNT_EVENTS.COMPLETE_FIRST_LOGIN,
    firstLoginCompleted: true,
    mfa: mfa(),
    now: NOW,
  }).code, DECISION_CODES.ASSIGNMENT_EXPIRED);

  assert.equal(decideAccountTransition({
    account: account({ state: ACCOUNT_STATES.SUSPENDED }),
    assignment: assignment({ state: ASSIGNMENT_STATES.SUSPENDED }),
    event: ACCOUNT_EVENTS.REINSTATE,
    mfa: mfa(),
    now: NOW,
  }).code, DECISION_CODES.ASSIGNMENT_STATE_BLOCKED);
});

test('suspension, expiry, and revocation explicitly require all session families to be revoked', () => {
  for (const event of [ACCOUNT_EVENTS.SUSPEND, ACCOUNT_EVENTS.EXPIRE, ACCOUNT_EVENTS.REVOKE]) {
    const result = decideAccountTransition({ account: account(), event, now: NOW });
    assert.equal(result.allowed, true, event);
    assert.deepEqual(result.effects, ['REVOKE_ALL_SESSION_FAMILIES'], event);
  }
  assert.equal(decideAccountTransition({
    account: account({ expiresAt: NOW }),
    assignment: assignment(),
    event: ACCOUNT_EVENTS.SUSPEND,
    now: NOW,
  }).code, DECISION_CODES.ACCOUNT_EXPIRED);
});

test('access fails at exact account and assignment expiry boundaries', () => {
  assert.equal(evaluateAccountAccess({
    account: account(), assignment: assignment(), mfa: mfa(), now: NOW,
  }).allowed, true);
  assert.equal(evaluateAccountAccess({
    account: account({ expiresAt: NOW }), assignment: assignment(), mfa: mfa(), now: NOW,
  }).code, DECISION_CODES.ACCOUNT_EXPIRED);
  assert.equal(evaluateAccountAccess({
    account: account({ expiresAt: '' }), assignment: assignment(), mfa: mfa(), now: NOW,
  }).code, DECISION_CODES.ACCOUNT_EXPIRY_INVALID);
  assert.equal(evaluateAccountAccess({
    account: account(), assignment: assignment({ expiresAt: NOW }), mfa: mfa(), now: NOW,
  }).code, DECISION_CODES.ASSIGNMENT_EXPIRED);
  assert.equal(evaluateAccountAccess({
    account: account({ state: ACCOUNT_STATES.SUSPENDED }), assignment: assignment(), mfa: mfa(), now: NOW,
  }).code, DECISION_CODES.ACCOUNT_STATE_BLOCKED);
  assert.equal(evaluateAccountAccess({
    account: account(), assignment: assignment({ tenantId: 'tenant-2' }), mfa: mfa(), now: NOW,
  }).code, DECISION_CODES.TENANT_MISMATCH);
});

test('MFA is mandatory for every privileged role and optional for governed low-privilege roles', () => {
  for (const role of lifecycle.PRIVILEGED_ROLES) {
    assert.equal(evaluateMfaGate({ role, now: NOW }).code, DECISION_CODES.MFA_ENROLLMENT_REQUIRED, role);
    assert.equal(evaluateMfaGate({ role, mfa: { enrolled: true }, now: NOW }).code,
      DECISION_CODES.MFA_VERIFICATION_REQUIRED, role);
    assert.equal(evaluateMfaGate({ role, mfa: mfa({ verifiedAt: FUTURE }), now: NOW }).code,
      DECISION_CODES.MFA_VERIFICATION_INVALID, role);
    assert.equal(evaluateMfaGate({ role, mfa: mfa(), now: NOW }).allowed, true, role);
  }
  for (const role of ['TENANT_USER', 'INSPECTOR', 'DEMO']) {
    assert.deepEqual(evaluateMfaGate({ role, now: NOW }), {
      allowed: true,
      code: DECISION_CODES.ALLOWED,
      required: false,
    });
  }
  assert.equal(evaluateMfaGate({ role: 'RRHH', mfa: mfa(), now: NOW }).code, DECISION_CODES.ROLE_UNKNOWN);
});

test('access sessions are tenant-bound, expiry-bound, revocable, and secret-free', () => {
  const allowed = evaluateAccessSession({
    session: accessSession(), family: refreshFamily(), account: account(),
    assignment: assignment(), mfa: mfa(), now: NOW,
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.code, DECISION_CODES.ACCESS_ALLOWED);
  assert.equal(evaluateAccessSession({
    session: accessSession({ expiresAt: NOW }),
    family: refreshFamily(),
    account: account(), assignment: assignment(), mfa: mfa(), now: NOW,
  }).code, DECISION_CODES.SESSION_EXPIRED);
  assert.equal(evaluateAccessSession({
    session: accessSession({ revokedAt: NOW }),
    family: refreshFamily(),
    account: account(), assignment: assignment(), mfa: mfa(), now: NOW,
  }).code, DECISION_CODES.SESSION_REVOKED);
  assert.equal(evaluateAccessSession({
    session: accessSession({ tenantId: 'tenant-2' }),
    family: refreshFamily(),
    account: account(), assignment: assignment(), mfa: mfa(), now: NOW,
  }).code, DECISION_CODES.TENANT_MISMATCH);
  assert.equal(evaluateAccessSession({
    session: accessSession({ accessToken: 'raw-token' }),
    family: refreshFamily(),
    account: account(), assignment: assignment(), mfa: mfa(), now: NOW,
  }).code, DECISION_CODES.RAW_SECRET_FORBIDDEN);
  assert.equal(evaluateAccessSession({
    session: accessSession({ revokedAt: false }), family: refreshFamily(),
    account: account(), assignment: assignment(), mfa: mfa(), now: NOW,
  }).code, DECISION_CODES.RECORD_INVALID);
  assert.equal(evaluateAccessSession({
    session: accessSession(), family: refreshFamily({ revokedAt: NOW }),
    account: account(), assignment: assignment(), mfa: mfa(), now: NOW,
  }).code, DECISION_CODES.SESSION_FAMILY_REVOKED);
  assert.equal(evaluateAccessSession({
    session: accessSession(), family: refreshFamily({ id: 'family-2' }),
    account: account(), assignment: assignment(), mfa: mfa(), now: NOW,
  }).code, DECISION_CODES.SUBJECT_MISMATCH);
});

test('a valid refresh decision consumes once, advances its family, and emits no token or digest', () => {
  const sourceCredential = refreshCredential();
  const sourceFamily = refreshFamily();
  const result = decideRefreshRotation({
    credential: sourceCredential,
    family: sourceFamily,
    account: account(),
    assignment: assignment(),
    mfa: mfa(),
    presentedTokenDigest: DIGEST_A,
    now: NOW,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.code, DECISION_CODES.REFRESH_ROTATION_ALLOWED);
  assert.equal(result.action, 'ROTATE');
  assert.deepEqual(result.consumePatch, { usedAt: NOW });
  assert.deepEqual(result.familyPatch, { latestSequence: 3 });
  assert.equal(result.nextCredential.sequence, 3);
  assert.equal(JSON.stringify(result).includes(DIGEST_A), false);
  assert.equal('tokenDigest' in result.nextCredential, false);
  assert.equal(sourceCredential.usedAt, null);
  assert.equal(sourceFamily.latestSequence, 2);
});

test('refresh reuse revokes the whole family while mismatch and inconsistent future sequence only deny', () => {
  for (const credential of [
    refreshCredential({ usedAt: NOW }),
    refreshCredential({ sequence: 1 }),
  ]) {
    const result = decideRefreshRotation({
      credential,
      family: refreshFamily(),
      account: account(),
      assignment: assignment(),
      mfa: mfa(),
      presentedTokenDigest: DIGEST_A,
      now: NOW,
    });
    assert.equal(result.code, DECISION_CODES.REFRESH_REUSE_DETECTED);
    assert.equal(result.action, 'REVOKE_FAMILY');
    assert.equal(result.reuseDetected, true);
    assert.deepEqual(result.familyPatch, { revokedAt: NOW, revocationReason: 'REFRESH_REUSE' });
  }

  const mismatch = decideRefreshRotation({
    credential: refreshCredential(), family: refreshFamily(), account: account(),
    assignment: assignment(), mfa: mfa(), presentedTokenDigest: DIGEST_B, now: NOW,
  });
  assert.deepEqual(mismatch, {
    allowed: false,
    code: DECISION_CODES.REFRESH_DIGEST_MISMATCH,
    action: 'DENY',
  });
  assert.equal(decideRefreshRotation({
    credential: refreshCredential({ sequence: 3 }), family: refreshFamily(), account: account(),
    assignment: assignment(), mfa: mfa(), presentedTokenDigest: DIGEST_A, now: NOW,
  }).code, DECISION_CODES.REFRESH_SEQUENCE_AHEAD);
  assert.equal(decideRefreshRotation({
    credential: refreshCredential({ rawToken: 'forbidden' }), family: refreshFamily(), account: account(),
    assignment: assignment(), mfa: mfa(), presentedTokenDigest: DIGEST_A, now: NOW,
  }).code, DECISION_CODES.RAW_SECRET_FORBIDDEN);
  assert.equal(decideRefreshRotation({
    credential: refreshCredential({ usedAt: false }), family: refreshFamily(), account: account(),
    assignment: assignment(), mfa: mfa(), presentedTokenDigest: DIGEST_A, now: NOW,
  }).code, DECISION_CODES.RECORD_INVALID);
});

test('segregation of duties rejects missing identities and self-approval', () => {
  assert.equal(evaluateSeparationOfDuties({ approverId: 'approver-1' }).code,
    DECISION_CODES.REQUESTER_REQUIRED);
  assert.equal(evaluateSeparationOfDuties({ requesterId: 'requester-1' }).code,
    DECISION_CODES.APPROVER_REQUIRED);
  assert.equal(evaluateSeparationOfDuties({ requesterId: 'actor-1', approverId: 'actor-1' }).code,
    DECISION_CODES.REQUESTER_CANNOT_APPROVE);
  assert.equal(evaluateSeparationOfDuties({ requesterId: 'actor-1', approverId: 'actor-2' }).allowed, true);
  assert.equal(evaluateSeparationOfDuties({ requesterId: ' actor-1 ', approverId: 'actor-2' }).code,
    DECISION_CODES.REQUESTER_REQUIRED);
  assert.equal(evaluateSeparationOfDuties({ requesterId: 'actor\n1', approverId: 'actor-2' }).code,
    DECISION_CODES.REQUESTER_REQUIRED);
});

test('demo planning is a side-effect-free synthetic plan with expiry, approval, and no credentials', () => {
  const input = {
    tenantId: 'tenant-demo',
    requesterId: 'requester-1',
    approverId: 'approver-1',
    role: 'INTENDENTE',
    dataScope: DATA_SCOPES.SYNTHETIC_DEMO,
    expiresAt: FUTURE,
    now: NOW,
  };
  const first = planDemoProvisioning(input);
  const second = planDemoProvisioning(input);
  assert.deepEqual(first, second, 'injected clock must make planning deterministic');
  assert.equal(first.allowed, true);
  assert.equal(first.dryRun, true);
  assert.equal(first.code, DECISION_CODES.DEMO_PLAN_READY);
  assert.equal(first.plan.account.initialState, ACCOUNT_STATES.INVITED);
  assert.equal(first.plan.assignment.initialState, ASSIGNMENT_STATES.ACTIVE);
  assert.equal(first.plan.invitation.persistence, 'DIGEST_ONLY');
  assert.equal(first.plan.sessionPolicy.mfaRequired, true);
  assert.deepEqual(first.plan.sideEffects, []);
  assert.doesNotMatch(JSON.stringify(first), /password|rawToken|tokenDigest|secret/i);
});

test('demo planning rejects SUPER_ADMIN, real GRH, missing tenant/expiry/approver, self-approval, and long grants', () => {
  const base = {
    tenantId: 'tenant-demo',
    requesterId: 'requester-1',
    approverId: 'approver-1',
    role: 'DEMO',
    dataScope: DATA_SCOPES.SYNTHETIC_DEMO,
    expiresAt: FUTURE,
    now: NOW,
  };
  const cases = [
    [{ ...base, tenantId: '' }, DECISION_CODES.DEMO_TENANT_REQUIRED],
    [{ ...base, role: 'SUPER_ADMIN' }, DECISION_CODES.DEMO_SUPER_ADMIN_FORBIDDEN],
    [{ ...base, dataScope: DATA_SCOPES.GRH_REAL }, DECISION_CODES.DEMO_SYNTHETIC_DATA_REQUIRED],
    [{ ...base, dataScope: undefined }, DECISION_CODES.DEMO_SYNTHETIC_DATA_REQUIRED],
    [{ ...base, expiresAt: undefined }, DECISION_CODES.DEMO_EXPIRY_REQUIRED],
    [{ ...base, expiresAt: NOW }, DECISION_CODES.DEMO_EXPIRED],
    [{ ...base, approverId: undefined }, DECISION_CODES.APPROVER_REQUIRED],
    [{ ...base, requesterId: undefined }, DECISION_CODES.REQUESTER_REQUIRED],
    [{ ...base, approverId: 'requester-1' }, DECISION_CODES.REQUESTER_CANNOT_APPROVE],
    [{ ...base, expiresAt: '2026-08-16T12:00:00.000Z' }, DECISION_CODES.DEMO_DURATION_EXCEEDED],
    [{ ...base, password: 'must-never-enter-planner' }, DECISION_CODES.RAW_SECRET_FORBIDDEN],
  ];
  for (const [input, expectedCode] of cases) {
    const result = planDemoProvisioning(input);
    assert.equal(result.allowed, false, expectedCode);
    assert.equal(result.dryRun, true, expectedCode);
    assert.equal(result.code, expectedCode);
  }
});

test('every clocked decision rejects an invalid injected clock rather than reading wall time', () => {
  assert.equal(evaluateMfaGate({ role: 'DEMO', now: 'invalid' }).code, DECISION_CODES.CLOCK_INVALID);
  assert.equal(evaluateAccountAccess({ account: account(), assignment: assignment(), now: null }).code,
    DECISION_CODES.CLOCK_INVALID);
  assert.equal(decideInvitationUse({
    invitation: invitation(), presentedTokenDigest: DIGEST_A, now: 'invalid',
  }).code, DECISION_CODES.CLOCK_INVALID);
  assert.equal(decideAccountTransition({
    account: account(), event: ACCOUNT_EVENTS.SUSPEND, now: undefined,
  }).code, DECISION_CODES.CLOCK_INVALID);
  assert.equal(evaluateAccessSession({
    session: accessSession(), family: refreshFamily(), account: account(), assignment: assignment(), now: 'invalid',
  }).code, DECISION_CODES.CLOCK_INVALID);
  assert.equal(decideRefreshRotation({
    credential: refreshCredential(), family: refreshFamily(), account: account(),
    assignment: assignment(), presentedTokenDigest: DIGEST_A, now: 'invalid',
  }).code, DECISION_CODES.CLOCK_INVALID);
  assert.equal(planDemoProvisioning({ tenantId: 'tenant-1', now: 'invalid' }).code,
    DECISION_CODES.CLOCK_INVALID);
});
