const FACTS_SCHEMA_VERSION = 'enterprise-authorization-facts-v1';
const DECISION_SCHEMA_VERSION = 'enterprise-authorization-decision-v1';
const DIRECTORY_PERMISSION = 'grh.directory:read';

const MODES = Object.freeze({
  DISABLED: 'disabled',
  SHADOW: 'shadow',
  INTERSECT: 'intersect',
});

const SCOPE_TYPES = Object.freeze({
  TENANT: 'TENANT',
  ORG_UNIT: 'ORG_UNIT',
  ORG_SUBTREE: 'ORG_SUBTREE',
});

const DECISION_STATUSES = Object.freeze({
  ALLOWED: 'allowed',
  DENIED: 'denied',
});

const DECISION_CODES = Object.freeze({
  STATIC_ALLOWED: 'STATIC_ALLOWED',
  STATIC_DENIED: 'STATIC_DENIED',
  DYNAMIC_ALLOWED: 'DYNAMIC_ALLOWED',
  DYNAMIC_ASSIGNMENT_MISSING: 'DYNAMIC_ASSIGNMENT_MISSING',
  DYNAMIC_IDENTITY_INACTIVE: 'DYNAMIC_IDENTITY_INACTIVE',
  DYNAMIC_ASSIGNMENT_INACTIVE: 'DYNAMIC_ASSIGNMENT_INACTIVE',
  DYNAMIC_ASSIGNMENT_NOT_YET_VALID: 'DYNAMIC_ASSIGNMENT_NOT_YET_VALID',
  DYNAMIC_ASSIGNMENT_EXPIRED: 'DYNAMIC_ASSIGNMENT_EXPIRED',
  DYNAMIC_POLICY_INACTIVE: 'DYNAMIC_POLICY_INACTIVE',
  DYNAMIC_ROLE_INACTIVE: 'DYNAMIC_ROLE_INACTIVE',
  DYNAMIC_SCOPE_INACTIVE: 'DYNAMIC_SCOPE_INACTIVE',
  DYNAMIC_PERMISSION_MISSING: 'DYNAMIC_PERMISSION_MISSING',
  DYNAMIC_FACTS_MISSING: 'DYNAMIC_FACTS_MISSING',
  DYNAMIC_FACTS_DRIFT: 'DYNAMIC_FACTS_DRIFT',
  DYNAMIC_DATABASE_ERROR: 'DYNAMIC_DATABASE_ERROR',
  CONFIGURATION_INVALID: 'CONFIGURATION_INVALID',
  PERMISSION_INVALID: 'PERMISSION_INVALID',
  INPUT_INVALID: 'INPUT_INVALID',
  INTERSECTION_ALLOWED: 'INTERSECTION_ALLOWED',
  INTERSECTION_DENIED: 'INTERSECTION_DENIED',
  SHADOW_STATIC_ALLOWED: 'SHADOW_STATIC_ALLOWED',
  SHADOW_STATIC_DENIED: 'SHADOW_STATIC_DENIED',
});

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const ORGANIZATION_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._:-]{0,63}$/;
const PERMISSION_PATTERN = /^[a-z][a-z0-9.-]{0,63}:[a-z][a-z0-9.-]{0,63}$/;
const KNOWN_STATUSES = new Set([
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'REVOKED',
  'DISABLED',
  'DELETED',
  'DRAFT',
  'RETIRED',
  'REJECTED',
  'EXPIRED',
  'PENDING',
  'PENDING_APPROVAL',
  'LOCKED',
  'TERMINATED',
  'ARCHIVED',
  'INVITED',
  'FIRST_LOGIN_REQUIRED',
]);
const DYNAMIC_EVIDENCE_FAILURES = new Set([
  DECISION_CODES.DYNAMIC_FACTS_MISSING,
  DECISION_CODES.DYNAMIC_FACTS_DRIFT,
  DECISION_CODES.DYNAMIC_DATABASE_ERROR,
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function hasExactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validIdentifier(value) {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value);
}

function validStatus(value) {
  return typeof value === 'string' && KNOWN_STATUSES.has(value);
}

function normalizedInstant(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value !== 'string' || value.length < 20 || value.length > 40) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toISOString();
}

export function normalizeOrganizationCode(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFKC').trim().toUpperCase();
  return ORGANIZATION_CODE_PATTERN.test(normalized) ? normalized : null;
}

function normalizeOrganizationCodes(values) {
  if (!Array.isArray(values)) return null;
  const normalized = values.map(normalizeOrganizationCode);
  if (normalized.some(value => value === null)) return null;
  return [...new Set(normalized)].sort();
}

function emptyScope() {
  return {
    tenantWide: false,
    kind: 'NONE',
    label: null,
    ids: [],
    kinds: [],
    organizationCount: 0,
    allowedOrganizationCodes: [],
  };
}

function tenantScope(label = 'Todo el municipio') {
  return {
    tenantWide: true,
    kind: SCOPE_TYPES.TENANT,
    label,
    ids: [],
    kinds: [SCOPE_TYPES.TENANT],
    organizationCount: 0,
    allowedOrganizationCodes: [],
  };
}

function emptyValidity() {
  return { validFrom: null, validUntil: null };
}

function emptyAssignment() {
  return { count: 0, ids: [] };
}

function staticDecision(staticAllowed) {
  return {
    allowed: staticAllowed,
    code: staticAllowed ? DECISION_CODES.STATIC_ALLOWED : DECISION_CODES.STATIC_DENIED,
    scope: staticAllowed ? tenantScope() : emptyScope(),
  };
}

function dynamicDenied(code, evaluated = true, diagnostics = []) {
  return {
    allowed: false,
    code,
    evaluated,
    policyVersion: null,
    receipts: [],
    scope: emptyScope(),
    validity: emptyValidity(),
    diagnostics: [...new Set(diagnostics)],
  };
}

function inspectIdentity(value, expectedId, expectedTenantId, kind) {
  const expectedKeys = kind === 'tenant' ? ['id', 'status'] : ['id', 'tenantId', 'status'];
  if (!hasExactKeys(value, expectedKeys) || !validIdentifier(value.id) || !validStatus(value.status)) {
    return { drift: true, active: false };
  }
  if (value.id !== expectedId || (kind !== 'tenant' && value.tenantId !== expectedTenantId)) {
    return { drift: true, active: false };
  }
  return { drift: false, active: value.status === 'ACTIVE' };
}

function inspectScope(scope) {
  const baseKeys = ['scopeId', 'status', 'type', 'organizationCode', 'allowedOrganizationCodes'];
  const exactBase = hasExactKeys(scope, baseKeys);
  const exactWithLabel = hasExactKeys(scope, [...baseKeys, 'label']);
  if ((!exactBase && !exactWithLabel) || !validIdentifier(scope.scopeId) || !validStatus(scope.status) ||
      !Object.values(SCOPE_TYPES).includes(scope.type)) {
    return { drift: true };
  }
  const label = exactWithLabel
    ? (typeof scope.label === 'string' ? scope.label.normalize('NFKC').trim() : '')
    : null;
  if (exactWithLabel && (label.length < 1 || label.length > 120 || /[\u0000-\u001f<>]/u.test(label))) {
    return { drift: true };
  }

  const organizationCode = scope.organizationCode === null
    ? null
    : normalizeOrganizationCode(scope.organizationCode);
  const allowedOrganizationCodes = normalizeOrganizationCodes(scope.allowedOrganizationCodes);
  if (allowedOrganizationCodes === null) return { drift: true };

  if (scope.type === SCOPE_TYPES.TENANT) {
    if (organizationCode !== null || allowedOrganizationCodes.length !== 0) return { drift: true };
    return {
      drift: false,
      active: scope.status === 'ACTIVE',
      scopeId: scope.scopeId,
      label: label || 'Todo el municipio',
      type: scope.type,
      tenantWide: true,
      allowedOrganizationCodes: [],
    };
  }

  if (!organizationCode) return { drift: true };
  if (scope.type === SCOPE_TYPES.ORG_UNIT) {
    if (allowedOrganizationCodes.length !== 1 || allowedOrganizationCodes[0] !== organizationCode) {
      return { drift: true };
    }
  } else if (allowedOrganizationCodes.length === 0 || !allowedOrganizationCodes.includes(organizationCode)) {
    return { drift: true };
  }

  return {
    drift: false,
    active: scope.status === 'ACTIVE',
    scopeId: scope.scopeId,
    label: label || organizationCode,
    type: scope.type,
    tenantWide: false,
    allowedOrganizationCodes,
  };
}

function inspectAssignment(assignment, { tenantId, userId, permission, atMilliseconds }) {
  if (!hasExactKeys(assignment, [
    'assignmentId', 'tenantId', 'userId', 'status', 'validFrom', 'validUntil',
    'policy', 'role', 'scope',
  ]) || !validIdentifier(assignment.assignmentId) || !validStatus(assignment.status) ||
      assignment.tenantId !== tenantId || assignment.userId !== userId) {
    return { drift: true };
  }

  if (!hasExactKeys(assignment.policy, ['policyId', 'status', 'permissions']) ||
      !validIdentifier(assignment.policy.policyId) || !validStatus(assignment.policy.status) ||
      !Array.isArray(assignment.policy.permissions) ||
      assignment.policy.permissions.some(item => typeof item !== 'string' || !PERMISSION_PATTERN.test(item)) ||
      new Set(assignment.policy.permissions).size !== assignment.policy.permissions.length) {
    return { drift: true };
  }
  if (!hasExactKeys(assignment.role, ['roleId', 'status']) ||
      !validIdentifier(assignment.role.roleId) || !validStatus(assignment.role.status)) {
    return { drift: true };
  }

  const scope = inspectScope(assignment.scope);
  if (scope.drift) return { drift: true };

  const validFrom = assignment.validFrom === null ? null : normalizedInstant(assignment.validFrom);
  const validUntil = assignment.validUntil === null ? null : normalizedInstant(assignment.validUntil);
  if ((assignment.validFrom !== null && validFrom === null) ||
      (assignment.validUntil !== null && validUntil === null) ||
      (validFrom !== null && validUntil !== null && Date.parse(validUntil) <= Date.parse(validFrom))) {
    return { drift: true };
  }

  if (assignment.status !== 'ACTIVE') {
    return { eligible: false, code: DECISION_CODES.DYNAMIC_ASSIGNMENT_INACTIVE };
  }
  if (validFrom !== null && atMilliseconds < Date.parse(validFrom)) {
    return { eligible: false, code: DECISION_CODES.DYNAMIC_ASSIGNMENT_NOT_YET_VALID };
  }
  if (validUntil !== null && atMilliseconds >= Date.parse(validUntil)) {
    return { eligible: false, code: DECISION_CODES.DYNAMIC_ASSIGNMENT_EXPIRED };
  }
  if (assignment.policy.status !== 'ACTIVE') {
    return { eligible: false, code: DECISION_CODES.DYNAMIC_POLICY_INACTIVE };
  }
  if (assignment.role.status !== 'ACTIVE') {
    return { eligible: false, code: DECISION_CODES.DYNAMIC_ROLE_INACTIVE };
  }
  if (!scope.active) return { eligible: false, code: DECISION_CODES.DYNAMIC_SCOPE_INACTIVE };
  if (!assignment.policy.permissions.includes(permission)) {
    return { eligible: false, code: DECISION_CODES.DYNAMIC_PERMISSION_MISSING };
  }

  return {
    drift: false,
    eligible: true,
    receipt: {
      assignmentId: assignment.assignmentId,
      policyVersion: null,
      scopeId: scope.scopeId,
      scopeKind: scope.type,
      scopeLabel: scope.label,
      validFrom,
      validUntil,
      tenantWide: scope.tenantWide,
      allowedOrganizationCodes: scope.allowedOrganizationCodes,
    },
    tenantWide: scope.tenantWide,
    allowedOrganizationCodes: scope.allowedOrganizationCodes,
  };
}

function effectiveValidity(receipts) {
  const starts = receipts.map(receipt => receipt.validFrom);
  const ends = receipts.map(receipt => receipt.validUntil);
  return {
    validFrom: starts.includes(null) ? null : starts.sort()[0],
    validUntil: ends.includes(null) ? null : ends.sort().at(-1),
  };
}

function inspectFacts(facts, context) {
  if (!hasExactKeys(facts, ['schemaVersion', 'policyVersion', 'tenant', 'user', 'assignments']) ||
      facts.schemaVersion !== FACTS_SCHEMA_VERSION || !validIdentifier(facts.policyVersion) ||
      !Array.isArray(facts.assignments)) {
    return dynamicDenied(DECISION_CODES.DYNAMIC_FACTS_DRIFT, true, ['facts.shape']);
  }

  const tenant = inspectIdentity(facts.tenant, context.tenantId, context.tenantId, 'tenant');
  const user = inspectIdentity(facts.user, context.userId, context.tenantId, 'user');
  if (tenant.drift || user.drift) {
    return dynamicDenied(DECISION_CODES.DYNAMIC_FACTS_DRIFT, true, ['facts.identity']);
  }
  if (!tenant.active || !user.active) {
    return dynamicDenied(DECISION_CODES.DYNAMIC_IDENTITY_INACTIVE);
  }
  if (facts.assignments.length === 0) {
    return dynamicDenied(DECISION_CODES.DYNAMIC_ASSIGNMENT_MISSING);
  }
  const assignmentIds = facts.assignments.map(assignment => assignment?.assignmentId);
  if (assignmentIds.some(id => !validIdentifier(id)) ||
      new Set(assignmentIds).size !== assignmentIds.length) {
    return dynamicDenied(DECISION_CODES.DYNAMIC_FACTS_DRIFT, true, ['facts.assignment_ids']);
  }

  const inspected = facts.assignments.map(assignment => inspectAssignment(assignment, context));
  if (inspected.some(item => item.drift)) {
    return dynamicDenied(DECISION_CODES.DYNAMIC_FACTS_DRIFT, true, ['facts.assignment']);
  }

  const eligible = inspected.filter(item => item.eligible);
  if (eligible.length === 0) {
    return dynamicDenied(
      inspected[0]?.code || DECISION_CODES.DYNAMIC_ASSIGNMENT_MISSING,
      true,
      inspected.map(item => item.code).filter(Boolean),
    );
  }

  const receipts = eligible.map(item => ({
    ...item.receipt,
    policyVersion: facts.policyVersion,
  })).sort((left, right) => left.assignmentId < right.assignmentId ? -1 :
    (left.assignmentId > right.assignmentId ? 1 : 0));
  const tenantWide = eligible.some(item => item.tenantWide);
  const allowedOrganizationCodes = tenantWide
    ? []
    : [...new Set(eligible.flatMap(item => item.allowedOrganizationCodes))]
      .sort();
  const effectiveReceipts = tenantWide
    ? receipts.filter(receipt => receipt.tenantWide)
    : receipts;
  const kinds = tenantWide
    ? [SCOPE_TYPES.TENANT]
    : [...new Set(effectiveReceipts.map(receipt => receipt.scopeKind))].sort();
  const ids = [...new Set(effectiveReceipts.map(receipt => receipt.scopeId))].sort();
  const labels = [...new Set(effectiveReceipts.map(receipt => receipt.scopeLabel))].sort();
  const kind = kinds.length === 1 ? kinds[0] : 'MIXED';
  const label = labels.length === 1 ? labels[0] : `${labels.length} ámbitos autorizados`;

  return {
    allowed: true,
    code: DECISION_CODES.DYNAMIC_ALLOWED,
    evaluated: true,
    policyVersion: facts.policyVersion,
    receipts,
    scope: {
      tenantWide,
      kind,
      label,
      ids,
      kinds,
      organizationCount: allowedOrganizationCodes.length,
      allowedOrganizationCodes,
    },
    validity: effectiveValidity(receipts),
    diagnostics: [],
  };
}

function mismatchFor(staticAllowed, dynamic) {
  if (!dynamic.evaluated || DYNAMIC_EVIDENCE_FAILURES.has(dynamic.code)) return true;
  if (dynamic.allowed !== staticAllowed) return true;
  return staticAllowed && dynamic.allowed && !dynamic.scope.tenantWide;
}

function assignmentSummary(dynamic) {
  return {
    count: dynamic.receipts.length,
    ids: dynamic.receipts.map(receipt => receipt.assignmentId),
  };
}

function buildDecision({
  mode,
  permission,
  allowed,
  code,
  reason,
  mismatch,
  staticResult,
  dynamic,
  effectiveScope,
  effectiveValidity,
}) {
  return deepFreeze({
    schemaVersion: DECISION_SCHEMA_VERSION,
    status: allowed ? DECISION_STATUSES.ALLOWED : DECISION_STATUSES.DENIED,
    mode,
    permission,
    allowed,
    code,
    reason,
    mismatch,
    policyVersion: allowed && dynamic.allowed ? dynamic.policyVersion : null,
    assignment: allowed && dynamic.allowed ? assignmentSummary(dynamic) : emptyAssignment(),
    scope: effectiveScope,
    validity: effectiveValidity,
    allowedOrganizationCodes: effectiveScope.allowedOrganizationCodes,
    static: staticResult,
    dynamic,
  });
}

function invalidDecision({ mode, permission, staticAllowed, code }) {
  return buildDecision({
    mode,
    permission,
    allowed: false,
    code,
    reason: code,
    mismatch: true,
    staticResult: staticDecision(staticAllowed === true),
    dynamic: dynamicDenied(code, false),
    effectiveScope: emptyScope(),
    effectiveValidity: emptyValidity(),
  });
}

/**
 * Evaluates the static grant and optional database-backed enterprise grant.
 * The adapter contract is:
 *   queryAdapter.loadAuthorizationFacts({ schemaVersion, tenantId, userId, permission, at })
 */
export async function evaluateEnterpriseAuthorization({
  mode = MODES.DISABLED,
  staticAllowed,
  tenantId,
  userId,
  permission = DIRECTORY_PERMISSION,
  at = new Date(),
  queryAdapter,
} = {}) {
  if (!Object.values(MODES).includes(mode) || typeof staticAllowed !== 'boolean') {
    return invalidDecision({ mode, permission, staticAllowed, code: DECISION_CODES.CONFIGURATION_INVALID });
  }
  if (permission !== DIRECTORY_PERMISSION) {
    return invalidDecision({ mode, permission, staticAllowed, code: DECISION_CODES.PERMISSION_INVALID });
  }
  const instant = normalizedInstant(at);
  if (!validIdentifier(tenantId) || !validIdentifier(userId) || instant === null) {
    return invalidDecision({ mode, permission, staticAllowed, code: DECISION_CODES.INPUT_INVALID });
  }

  const staticResult = staticDecision(staticAllowed);
  if (mode === MODES.DISABLED) {
    return buildDecision({
      mode,
      permission,
      allowed: staticAllowed,
      code: staticResult.code,
      reason: staticResult.code,
      mismatch: false,
      staticResult,
      dynamic: dynamicDenied(DECISION_CODES.DYNAMIC_FACTS_MISSING, false),
      effectiveScope: staticResult.scope,
      effectiveValidity: emptyValidity(),
    });
  }

  let dynamic;
  if (!queryAdapter || typeof queryAdapter.loadAuthorizationFacts !== 'function') {
    dynamic = dynamicDenied(DECISION_CODES.DYNAMIC_FACTS_MISSING, false);
  } else {
    try {
      const facts = await queryAdapter.loadAuthorizationFacts(Object.freeze({
        schemaVersion: FACTS_SCHEMA_VERSION,
        tenantId,
        userId,
        permission,
        at: instant,
      }));
      dynamic = facts === null || facts === undefined
        ? dynamicDenied(DECISION_CODES.DYNAMIC_FACTS_MISSING)
        : inspectFacts(facts, {
          tenantId,
          userId,
          permission,
          atMilliseconds: Date.parse(instant),
        });
    } catch {
      dynamic = dynamicDenied(DECISION_CODES.DYNAMIC_DATABASE_ERROR, true);
    }
  }

  const mismatch = mismatchFor(staticAllowed, dynamic);
  if (mode === MODES.SHADOW) {
    return buildDecision({
      mode,
      permission,
      allowed: staticAllowed,
      code: staticAllowed ? DECISION_CODES.SHADOW_STATIC_ALLOWED : DECISION_CODES.SHADOW_STATIC_DENIED,
      reason: mismatch ? dynamic.code : staticResult.code,
      mismatch,
      staticResult,
      dynamic,
      effectiveScope: staticResult.scope,
      effectiveValidity: emptyValidity(),
    });
  }

  const allowed = staticAllowed && dynamic.allowed;
  return buildDecision({
    mode,
    permission,
    allowed,
    code: allowed ? DECISION_CODES.INTERSECTION_ALLOWED : DECISION_CODES.INTERSECTION_DENIED,
    reason: allowed
      ? DECISION_CODES.INTERSECTION_ALLOWED
      : (staticAllowed ? dynamic.code : DECISION_CODES.STATIC_DENIED),
    mismatch,
    staticResult,
    dynamic,
    effectiveScope: allowed ? dynamic.scope : emptyScope(),
    effectiveValidity: allowed ? dynamic.validity : emptyValidity(),
  });
}

export {
  DECISION_CODES as ENTERPRISE_AUTHORIZATION_DECISION_CODES,
  DECISION_SCHEMA_VERSION as ENTERPRISE_AUTHORIZATION_DECISION_SCHEMA_VERSION,
  DECISION_STATUSES as ENTERPRISE_AUTHORIZATION_DECISION_STATUSES,
  DIRECTORY_PERMISSION as GRH_DIRECTORY_PERMISSION,
  FACTS_SCHEMA_VERSION as ENTERPRISE_AUTHORIZATION_FACTS_SCHEMA_VERSION,
  MODES as ENTERPRISE_AUTHORIZATION_MODES,
  SCOPE_TYPES as ENTERPRISE_AUTHORIZATION_SCOPE_TYPES,
};
