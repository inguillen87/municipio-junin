import assert from 'node:assert/strict';
import test from 'node:test';

import tenantLifecycle from '../shared/tenant-lifecycle.cjs';

const { TENANT_ACCESS_CODES, evaluateTenantAccess } = tenantLifecycle;
const NOW = new Date('2026-08-08T12:00:00.000Z');

test('ACTIVE tenants remain enabled independently from historical trial metadata', () => {
  assert.deepEqual(evaluateTenantAccess({
    status: 'ACTIVE',
    trialEndsAt: '2020-01-01T00:00:00.000Z',
  }, NOW), {
    allowed: true,
    code: TENANT_ACCESS_CODES.ACTIVE,
  });
});

test('TRIAL tenants require a valid future expiry and fail at the exact boundary', () => {
  assert.equal(evaluateTenantAccess({ status: 'TRIAL', trialEndsAt: null }, NOW).code,
    TENANT_ACCESS_CODES.TRIAL_EXPIRY_REQUIRED);
  assert.equal(evaluateTenantAccess({ status: 'TRIAL', trialEndsAt: 'invalid' }, NOW).code,
    TENANT_ACCESS_CODES.TRIAL_EXPIRY_REQUIRED);
  assert.equal(evaluateTenantAccess({ status: 'TRIAL', trialEndsAt: NOW.toISOString() }, NOW).code,
    TENANT_ACCESS_CODES.TRIAL_EXPIRED);
  assert.equal(evaluateTenantAccess({ status: 'TRIAL', trialEndsAt: '2026-08-08T11:59:59.999Z' }, NOW).code,
    TENANT_ACCESS_CODES.TRIAL_EXPIRED);

  const future = evaluateTenantAccess({ status: 'TRIAL', trialEndsAt: '2026-08-09T12:00:00.000Z' }, NOW);
  assert.equal(future.allowed, true);
  assert.equal(future.expiresAt, '2026-08-09T12:00:00.000Z');
});

test('missing, suspended, and cancelled tenants are denied', () => {
  assert.equal(evaluateTenantAccess(null, NOW).code, TENANT_ACCESS_CODES.MISSING);
  assert.equal(evaluateTenantAccess({ status: 'SUSPENDED' }, NOW).code, TENANT_ACCESS_CODES.STATUS_DISABLED);
  assert.equal(evaluateTenantAccess({ status: 'CANCELLED' }, NOW).code, TENANT_ACCESS_CODES.STATUS_DISABLED);
});
