export const GRH_DIRECTORY_ACCESS_SCHEMA_VERSION = 'grh-directory-access-v1';
export const GRH_DIRECTORY_PERMISSION = 'grh.directory:read';

export const GRH_DIRECTORY_ACCESS_PURPOSES = Object.freeze([
  'DIRECTORY_BROWSE',
  'PERSON_LOOKUP',
  'LEAVE_REVIEW',
]);

export const GRH_DIRECTORY_ACCESS_LIMITS = Object.freeze([
  'private_identity_required',
  'purpose_required',
  'tenant_bound',
  'no_public_demo',
  'no_raw_export',
]);

const TOP_LEVEL_KEYS = Object.freeze([
  'schemaVersion',
  'status',
  'policyVersion',
  'permission',
  'scope',
  'validity',
  'audit',
  'limits',
]);
const SCOPE_KEYS = Object.freeze(['kind', 'label', 'organizationCount']);
const VALIDITY_KEYS = Object.freeze(['validFrom', 'validUntil']);
const AUDIT_KEYS = Object.freeze(['required', 'purposes', 'storesPersonalQuery']);
const STATUS_VALUES = new Set(['static', 'shadow', 'active']);
const SCOPE_VALUES = new Set(['TENANT', 'ORG_UNIT', 'ORG_SUBTREE']);
const POLICY_VERSION_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const expectedSorted = [...expected].sort();
  const actual = Object.keys(value).sort();
  return actual.length === expectedSorted.length &&
    actual.every((key, index) => key === expectedSorted[index]);
}

function add(errors, condition, code) {
  if (!condition) errors.push(code);
}

function safeLabel(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= 120 &&
    !/[\u0000-\u001f\u007f]/u.test(value) && value.trim() === value;
}

function timestamp(value) {
  return typeof value === 'string' && TIMESTAMP_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function nullableTimestamp(value) {
  return value === null || timestamp(value);
}

export function inspectGrhDirectoryAccessResponse(value) {
  const errors = [];
  add(errors, exactKeys(value, TOP_LEVEL_KEYS), 'contract.shape');
  add(errors,
    value?.schemaVersion === GRH_DIRECTORY_ACCESS_SCHEMA_VERSION,
    'contract.schemaVersion');
  add(errors, STATUS_VALUES.has(value?.status), 'contract.status');
  add(errors,
    typeof value?.policyVersion === 'string' && POLICY_VERSION_PATTERN.test(value.policyVersion),
    'contract.policyVersion');
  add(errors, value?.permission === GRH_DIRECTORY_PERMISSION, 'contract.permission');

  add(errors, exactKeys(value?.scope, SCOPE_KEYS), 'scope.shape');
  add(errors, SCOPE_VALUES.has(value?.scope?.kind), 'scope.kind');
  add(errors, safeLabel(value?.scope?.label), 'scope.label');
  add(errors,
    value?.scope?.organizationCount === null ||
      (Number.isSafeInteger(value?.scope?.organizationCount) && value.scope.organizationCount >= 0),
    'scope.organizationCount');
  if (value?.scope?.kind !== 'TENANT') {
    add(errors,
      Number.isSafeInteger(value?.scope?.organizationCount) && value.scope.organizationCount > 0,
      'scope.organizationCount.scoped');
  }

  add(errors, exactKeys(value?.validity, VALIDITY_KEYS), 'validity.shape');
  add(errors, nullableTimestamp(value?.validity?.validFrom), 'validity.validFrom');
  add(errors, nullableTimestamp(value?.validity?.validUntil), 'validity.validUntil');
  if (value?.status === 'active') {
    add(errors, timestamp(value?.validity?.validFrom), 'validity.active.validFrom');
  }
  if (value?.validity?.validUntil !== null) {
    add(errors, timestamp(value?.validity?.validFrom), 'validity.validUntil.requiresValidFrom');
    add(errors,
      timestamp(value?.validity?.validFrom) &&
        timestamp(value?.validity?.validUntil) &&
        value.validity.validUntil > value.validity.validFrom,
      'validity.order');
  }

  add(errors, exactKeys(value?.audit, AUDIT_KEYS), 'audit.shape');
  add(errors,
    value?.audit?.required === (value?.status !== 'static'),
    'audit.required');
  add(errors, value?.audit?.storesPersonalQuery === false, 'audit.storesPersonalQuery');
  add(errors,
    JSON.stringify(value?.audit?.purposes) === JSON.stringify(GRH_DIRECTORY_ACCESS_PURPOSES),
    'audit.purposes');
  add(errors,
    JSON.stringify(value?.limits) === JSON.stringify(GRH_DIRECTORY_ACCESS_LIMITS),
    'limits.allowlist');

  if (value?.status === 'static') {
    add(errors, value?.policyVersion?.startsWith('static:'), 'contract.static.policyVersion');
    add(errors, value?.scope?.kind === 'TENANT', 'scope.static.tenant');
    add(errors, value?.scope?.organizationCount === null, 'scope.static.organizationCount');
  }
  if (value?.status !== 'active') {
    add(errors,
      value?.validity?.validFrom === null && value?.validity?.validUntil === null,
      'validity.non_active.null');
  }

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze([...new Set(errors)]),
  });
}
