'use strict';

const TENANT_ACCESS_CODES = Object.freeze({
  ACTIVE: 'TENANT_ACTIVE',
  MISSING: 'TENANT_MISSING',
  STATUS_DISABLED: 'TENANT_STATUS_DISABLED',
  TRIAL_EXPIRY_REQUIRED: 'TENANT_TRIAL_EXPIRY_REQUIRED',
  TRIAL_EXPIRED: 'TENANT_TRIAL_EXPIRED',
});

function timestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string' && typeof value !== 'number') return Number.NaN;
  return new Date(value).getTime();
}

function evaluateTenantAccess(tenant, now = new Date()) {
  if (!tenant || typeof tenant !== 'object') {
    return { allowed: false, code: TENANT_ACCESS_CODES.MISSING };
  }
  if (tenant.status === 'ACTIVE') {
    return { allowed: true, code: TENANT_ACCESS_CODES.ACTIVE };
  }
  if (tenant.status !== 'TRIAL') {
    return { allowed: false, code: TENANT_ACCESS_CODES.STATUS_DISABLED };
  }

  const expiresAt = timestamp(tenant.trialEndsAt);
  if (!Number.isFinite(expiresAt)) {
    return { allowed: false, code: TENANT_ACCESS_CODES.TRIAL_EXPIRY_REQUIRED };
  }
  const nowTimestamp = timestamp(now);
  if (!Number.isFinite(nowTimestamp) || expiresAt <= nowTimestamp) {
    return { allowed: false, code: TENANT_ACCESS_CODES.TRIAL_EXPIRED };
  }
  return {
    allowed: true,
    code: TENANT_ACCESS_CODES.ACTIVE,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

module.exports = {
  TENANT_ACCESS_CODES,
  evaluateTenantAccess,
};
