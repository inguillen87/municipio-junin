import { createHash } from 'node:crypto';

import {
  ENTERPRISE_AUTHORIZATION_FACTS_SCHEMA_VERSION,
  GRH_DIRECTORY_PERMISSION,
  normalizeOrganizationCode,
} from './enterprise-authorization.js';
import { assertPrismaDatabaseTransport, prisma } from './db.js';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const POLICY_PART_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const RECOGNIZED_SCOPE_TYPES = new Set(['TENANT', 'ORG_UNIT', 'ORG_SUBTREE']);
const MAX_AUTHORIZATION_ASSIGNMENTS = 256;
const MAX_POLICY_SET_SIZE = 512;

export class EnterpriseAuthorizationStoreError extends Error {
  constructor(code) {
    super('Enterprise authorization facts are unavailable');
    this.name = 'EnterpriseAuthorizationStoreError';
    this.code = code;
  }
}

function storeError(code) {
  return new EnterpriseAuthorizationStoreError(code);
}

function validIdentifier(value) {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value);
}

function normalizeInstant(value) {
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw storeError('ENTERPRISE_AUTHORIZATION_INPUT_INVALID');
  return new Date(milliseconds);
}

function normalizeNullableInstant(value, code = 'ENTERPRISE_AUTHORIZATION_FACTS_INVALID') {
  if (value === null || value === undefined) return null;
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw storeError(code);
  return new Date(milliseconds).toISOString();
}

function normalizeTenantStatus(value) {
  if (value === 'ACTIVE') return 'ACTIVE';
  if (value === 'SUSPENDED') return 'SUSPENDED';
  return 'INACTIVE';
}

function normalizeUserStatus(row, atMilliseconds) {
  if (row.userActive !== true || row.securityUserId !== row.userId ||
      row.securityTenantId !== row.tenantId) {
    return 'INACTIVE';
  }
  if (row.revokedAt || row.lifecycleStatus === 'REVOKED' || row.lifecycleStatus === 'TERMINATED') {
    return 'REVOKED';
  }
  if (row.suspendedAt || row.lifecycleStatus === 'SUSPENDED' || row.lifecycleStatus === 'LOCKED') {
    return 'SUSPENDED';
  }

  const lockedUntil = normalizeNullableInstant(row.lockedUntil);
  const accountExpiresAt = normalizeNullableInstant(row.accountExpiresAt);
  if ((lockedUntil && Date.parse(lockedUntil) > atMilliseconds) ||
      (accountExpiresAt && Date.parse(accountExpiresAt) <= atMilliseconds)) {
    return 'SUSPENDED';
  }
  return row.lifecycleStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
}

function normalizeAssignmentStatus(value) {
  if (value === 'ACTIVE') return 'ACTIVE';
  if (value === 'SUSPENDED') return 'SUSPENDED';
  if (value === 'REVOKED') return 'REVOKED';
  return 'INACTIVE';
}

function activeWithinWindow(status, validFrom, validUntil, atMilliseconds) {
  if (status !== 'ACTIVE') return false;
  const from = normalizeNullableInstant(validFrom);
  const until = normalizeNullableInstant(validUntil);
  return (!from || Date.parse(from) <= atMilliseconds) &&
    (!until || Date.parse(until) > atMilliseconds);
}

function normalizePolicyStatus(row, atMilliseconds) {
  if (row.policyStatus !== 'ACTIVE') return 'INACTIVE';
  const activatedAt = normalizeNullableInstant(row.policyActivatedAt);
  const retiredAt = normalizeNullableInstant(row.policyRetiredAt);
  if (!activatedAt || Date.parse(activatedAt) > atMilliseconds ||
      (retiredAt && Date.parse(retiredAt) <= atMilliseconds)) {
    return 'INACTIVE';
  }
  return 'ACTIVE';
}

function normalizeRoleStatus(row, atMilliseconds) {
  return activeWithinWindow(
    row.roleStatus,
    row.roleValidFrom,
    row.roleValidUntil,
    atMilliseconds,
  ) ? 'ACTIVE' : 'INACTIVE';
}

function normalizeScopeStatus(row, atMilliseconds) {
  if (row.scopeStatus !== 'ACTIVE') return 'INACTIVE';
  if (row.scopeType === 'TENANT') return 'ACTIVE';
  if (!row.organizationCode || row.orgUnitStatus !== 'ACTIVE' ||
      !activeWithinWindow('ACTIVE', row.orgUnitValidFrom, row.orgUnitValidUntil, atMilliseconds)) {
    return 'INACTIVE';
  }
  return 'ACTIVE';
}

function normalizePermissions(value) {
  if (!Array.isArray(value)) throw storeError('ENTERPRISE_AUTHORIZATION_FACTS_INVALID');
  const permissions = value.map(permission => {
    if (typeof permission !== 'string' || permission.length < 3 || permission.length > 160) {
      throw storeError('ENTERPRISE_AUTHORIZATION_FACTS_INVALID');
    }
    return permission;
  });
  return [...new Set(permissions)].sort((left, right) => left.localeCompare(right));
}

function normalizeOrganizationCodes(value) {
  if (!Array.isArray(value)) throw storeError('ENTERPRISE_AUTHORIZATION_FACTS_INVALID');
  const codes = value.map(code => normalizeOrganizationCode(code));
  if (codes.some(code => code === null)) throw storeError('ENTERPRISE_AUTHORIZATION_FACTS_INVALID');
  return [...new Set(codes)].sort((left, right) => left.localeCompare(right));
}

function safeScopeLabel(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.normalize('NFKC').trim();
  if (!normalized || normalized.length > 120 || /[\u0000-\u001f<>]/u.test(normalized)) return fallback;
  return normalized;
}

function policyVersionFor(rows, assignmentRows) {
  const tuples = new Map();
  for (const row of [...rows, ...assignmentRows]) {
    const policyId = row.policyId;
    const policyVersion = row.policyVersion;
    if (!validIdentifier(policyId) || typeof policyVersion !== 'string' ||
        !POLICY_PART_PATTERN.test(policyVersion)) {
      throw storeError('ENTERPRISE_AUTHORIZATION_POLICY_INVALID');
    }
    tuples.set(`${policyId}\u0000${policyVersion}`, [policyId, policyVersion]);
  }

  const canonical = [...tuples.values()]
    .sort(([leftId, leftVersion], [rightId, rightVersion]) => (
      leftId.localeCompare(rightId) || leftVersion.localeCompare(rightVersion)
    ))
    .map(([policyId, version]) => `${policyId.length}:${policyId}${version.length}:${version}`)
    .join('|');
  return `rbac:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

function normalizeAssignment(row, context) {
  if (!validIdentifier(row.assignmentId) || row.tenantId !== context.tenantId ||
      row.userId !== context.userId || !validIdentifier(row.policyId) ||
      !validIdentifier(row.roleId) || !validIdentifier(row.scopeId) ||
      !RECOGNIZED_SCOPE_TYPES.has(row.scopeType)) {
    throw storeError('ENTERPRISE_AUTHORIZATION_TENANT_BOUNDARY_INVALID');
  }

  const validFrom = normalizeNullableInstant(row.validFrom);
  const validUntil = normalizeNullableInstant(row.validUntil);
  if (!validFrom || (validUntil && Date.parse(validUntil) <= Date.parse(validFrom))) {
    throw storeError('ENTERPRISE_AUTHORIZATION_ASSIGNMENT_INVALID');
  }

  const organizationCode = row.scopeType === 'TENANT'
    ? null
    : normalizeOrganizationCode(row.organizationCode);
  if (row.scopeType !== 'TENANT' && organizationCode === null) {
    throw storeError('ENTERPRISE_AUTHORIZATION_SCOPE_INVALID');
  }

  const allowedOrganizationCodes = normalizeOrganizationCodes(row.allowedOrganizationCodes);
  if (row.scopeType === 'TENANT' && allowedOrganizationCodes.length !== 0) {
    throw storeError('ENTERPRISE_AUTHORIZATION_SCOPE_INVALID');
  }
  if (row.scopeType === 'ORG_UNIT' &&
      (allowedOrganizationCodes.length !== 1 || allowedOrganizationCodes[0] !== organizationCode)) {
    throw storeError('ENTERPRISE_AUTHORIZATION_SCOPE_INVALID');
  }
  if (row.scopeType === 'ORG_SUBTREE' &&
      (allowedOrganizationCodes.length === 0 || !allowedOrganizationCodes.includes(organizationCode))) {
    throw storeError('ENTERPRISE_AUTHORIZATION_SCOPE_INVALID');
  }

  const label = row.scopeType === 'TENANT'
    ? 'Todo el municipio'
    : safeScopeLabel(row.scopeLabel, organizationCode);

  return {
    assignmentId: row.assignmentId,
    tenantId: context.tenantId,
    userId: context.userId,
    status: normalizeAssignmentStatus(row.assignmentStatus),
    validFrom,
    validUntil,
    policy: {
      policyId: row.policyId,
      status: normalizePolicyStatus(row, context.atMilliseconds),
      permissions: normalizePermissions(row.permissions),
    },
    role: {
      roleId: row.roleId,
      status: normalizeRoleStatus(row, context.atMilliseconds),
    },
    scope: {
      scopeId: row.scopeId,
      status: normalizeScopeStatus(row, context.atMilliseconds),
      type: row.scopeType,
      organizationCode,
      allowedOrganizationCodes,
      label,
    },
  };
}

async function loadIdentity(client, { tenantId, userId }) {
  return client.$queryRaw`
    /* enterprise-authz:identity-v1 */
    SELECT
      tenant."id" AS "tenantId",
      tenant."status"::text AS "tenantStatus",
      subject."id" AS "userId",
      subject."tenantId" AS "userTenantId",
      subject."active" AS "userActive",
      security."user_id" AS "securityUserId",
      security."tenant_id" AS "securityTenantId",
      security."lifecycle_status"::text AS "lifecycleStatus",
      security."locked_until" AS "lockedUntil",
      security."account_expires_at" AS "accountExpiresAt",
      security."suspended_at" AS "suspendedAt",
      security."revoked_at" AS "revokedAt"
    FROM "tenants" AS tenant
    INNER JOIN "users" AS subject
      ON subject."tenantId" = tenant."id"
     AND subject."id" = ${userId}
    LEFT JOIN "auth_user_security_states" AS security
      ON security."tenant_id" = tenant."id"
     AND security."user_id" = subject."id"
    WHERE tenant."id" = ${tenantId}
      AND subject."tenantId" = ${tenantId}
    LIMIT 2
  `;
}

async function loadAssignments(client, { tenantId, userId, permission, at }) {
  return client.$queryRaw`
    /* enterprise-authz:assignments-v1 */
    SELECT
      assignment."id" AS "assignmentId",
      assignment."tenant_id" AS "tenantId",
      assignment."subject_user_id" AS "userId",
      assignment."status"::text AS "assignmentStatus",
      assignment."valid_from" AS "validFrom",
      assignment."valid_until" AS "validUntil",
      policy."id" AS "policyId",
      policy."version" AS "policyVersion",
      policy."status"::text AS "policyStatus",
      policy."activated_at" AS "policyActivatedAt",
      policy."retired_at" AS "policyRetiredAt",
      role_definition."id" AS "roleId",
      role_definition."status"::text AS "roleStatus",
      role_definition."valid_from" AS "roleValidFrom",
      role_definition."valid_until" AS "roleValidUntil",
      scope."id" AS "scopeId",
      scope."status"::text AS "scopeStatus",
      scope."kind"::text AS "scopeType",
      org_unit."code"::text AS "organizationCode",
      org_unit."name"::text AS "scopeLabel",
      org_unit."status"::text AS "orgUnitStatus",
      org_unit."valid_from" AS "orgUnitValidFrom",
      org_unit."valid_until" AS "orgUnitValidUntil",
      COALESCE((
        SELECT array_agg(role_capability."capability_key"::text ORDER BY role_capability."capability_key")
        FROM "auth_role_capabilities" AS role_capability
        INNER JOIN "auth_capabilities" AS capability
          ON capability."key" = role_capability."capability_key"
         AND capability."enabled" = true
        WHERE role_capability."role_definition_id" = role_definition."id"
          AND role_capability."effect" = 'ALLOW'
          AND role_capability."capability_key" = ${permission}
      ), ARRAY[]::text[]) AS "permissions",
      CASE scope."kind"::text
        WHEN 'TENANT' THEN ARRAY[]::text[]
        WHEN 'ORG_UNIT' THEN CASE
          WHEN org_unit."id" IS NULL THEN ARRAY[]::text[]
          ELSE ARRAY[org_unit."code"::text]
        END
        WHEN 'ORG_SUBTREE' THEN ARRAY(
          SELECT descendant."code"::text
          FROM "auth_org_unit_closure" AS closure
          INNER JOIN "auth_org_units" AS ancestor
            ON ancestor."tenant_id" = closure."tenant_id"
           AND ancestor."id" = closure."ancestor_id"
          INNER JOIN "auth_org_units" AS descendant
            ON descendant."tenant_id" = closure."tenant_id"
           AND descendant."id" = closure."descendant_id"
          WHERE closure."tenant_id" = assignment."tenant_id"
            AND closure."ancestor_id" = scope."org_unit_id"
            AND ancestor."tenant_id" = assignment."tenant_id"
            AND ancestor."id" = scope."org_unit_id"
            AND ancestor."status" = 'ACTIVE'
            AND ancestor."valid_from" <= ${at}
            AND (ancestor."valid_until" IS NULL OR ancestor."valid_until" > ${at})
            AND descendant."tenant_id" = assignment."tenant_id"
            AND descendant."status" = 'ACTIVE'
            AND descendant."valid_from" <= ${at}
            AND (descendant."valid_until" IS NULL OR descendant."valid_until" > ${at})
          ORDER BY descendant."code"
        )
        ELSE ARRAY[]::text[]
      END AS "allowedOrganizationCodes"
    FROM "auth_role_assignments" AS assignment
    INNER JOIN "auth_role_definitions" AS role_definition
      ON role_definition."id" = assignment."role_definition_id"
     AND (role_definition."tenant_id" IS NULL OR role_definition."tenant_id" = assignment."tenant_id")
    INNER JOIN "auth_policy_bundles" AS policy
      ON policy."id" = role_definition."policy_bundle_id"
     AND (policy."tenant_id" IS NULL OR policy."tenant_id" = assignment."tenant_id")
    INNER JOIN "auth_scopes" AS scope
      ON scope."id" = assignment."scope_id"
     AND scope."tenant_id" = assignment."tenant_id"
    LEFT JOIN "auth_org_units" AS org_unit
      ON org_unit."tenant_id" = assignment."tenant_id"
     AND org_unit."id" = scope."org_unit_id"
    WHERE assignment."tenant_id" = ${tenantId}
      AND assignment."subject_user_id" = ${userId}
      AND scope."kind" IN ('TENANT', 'ORG_UNIT', 'ORG_SUBTREE')
    ORDER BY assignment."id"
    LIMIT ${MAX_AUTHORIZATION_ASSIGNMENTS + 1}
  `;
}

async function loadPolicySet(client, { tenantId, permission }) {
  return client.$queryRaw`
    /* enterprise-authz:policy-set-v1 */
    SELECT DISTINCT
      policy."id" AS "policyId",
      policy."version" AS "policyVersion"
    FROM "auth_policy_bundles" AS policy
    INNER JOIN "auth_role_definitions" AS role_definition
      ON role_definition."policy_bundle_id" = policy."id"
     AND (role_definition."tenant_id" IS NULL OR role_definition."tenant_id" = ${tenantId})
    INNER JOIN "auth_role_capabilities" AS role_capability
      ON role_capability."role_definition_id" = role_definition."id"
     AND role_capability."capability_key" = ${permission}
    INNER JOIN "auth_capabilities" AS capability
      ON capability."key" = role_capability."capability_key"
    WHERE policy."tenant_id" IS NULL OR policy."tenant_id" = ${tenantId}
    ORDER BY policy."id", policy."version"
    LIMIT ${MAX_POLICY_SET_SIZE + 1}
  `;
}

function validateContext({ schemaVersion, tenantId, userId, permission, at } = {}) {
  if (schemaVersion !== ENTERPRISE_AUTHORIZATION_FACTS_SCHEMA_VERSION ||
      !validIdentifier(tenantId) || !validIdentifier(userId) ||
      permission !== GRH_DIRECTORY_PERMISSION) {
    throw storeError('ENTERPRISE_AUTHORIZATION_INPUT_INVALID');
  }
  const instant = normalizeInstant(at);
  return Object.freeze({
    tenantId,
    userId,
    permission,
    at: instant,
    atMilliseconds: instant.getTime(),
  });
}

export function createEnterpriseAuthorizationStore({
  client = prisma,
  assertTransport = assertPrismaDatabaseTransport,
} = {}) {
  if (!client || typeof client.$queryRaw !== 'function' || typeof client.$transaction !== 'function' ||
      typeof assertTransport !== 'function') {
    throw storeError('ENTERPRISE_AUTHORIZATION_ADAPTER_INVALID');
  }

  return Object.freeze({
    async loadAuthorizationFacts(input) {
      const context = validateContext(input);
      let transport;
      try {
        transport = assertTransport();
      } catch {
        throw storeError('ENTERPRISE_AUTHORIZATION_TRANSPORT_INVALID');
      }
      if (!transport) throw storeError('ENTERPRISE_AUTHORIZATION_TRANSPORT_INVALID');

      try {
        return await client.$transaction(async transaction => {
          const identityRows = await loadIdentity(transaction, context);
          if (!Array.isArray(identityRows) || identityRows.length > 1) {
            throw storeError('ENTERPRISE_AUTHORIZATION_IDENTITY_INVALID');
          }
          if (identityRows.length === 0) return null;

          const identity = identityRows[0];
          if (identity.tenantId !== context.tenantId || identity.userId !== context.userId ||
              identity.userTenantId !== context.tenantId) {
            return null;
          }

          const tenantStatus = normalizeTenantStatus(identity.tenantStatus);
          const userStatus = normalizeUserStatus(identity, context.atMilliseconds);
          const [assignmentRows, policyRows] = (tenantStatus === 'ACTIVE' && userStatus === 'ACTIVE')
            ? await Promise.all([
              loadAssignments(transaction, context),
              loadPolicySet(transaction, context),
            ])
            : [[], []];
          if (!Array.isArray(assignmentRows) || !Array.isArray(policyRows)) {
            throw storeError('ENTERPRISE_AUTHORIZATION_FACTS_INVALID');
          }
          if (assignmentRows.length > MAX_AUTHORIZATION_ASSIGNMENTS ||
              policyRows.length > MAX_POLICY_SET_SIZE) {
            throw storeError('ENTERPRISE_AUTHORIZATION_FACTS_LIMIT_EXCEEDED');
          }

          const assignments = assignmentRows
            .map(row => normalizeAssignment(row, context))
            .sort((left, right) => left.assignmentId.localeCompare(right.assignmentId));

          return {
            schemaVersion: ENTERPRISE_AUTHORIZATION_FACTS_SCHEMA_VERSION,
            policyVersion: policyVersionFor(policyRows, assignmentRows),
            tenant: {
              id: context.tenantId,
              status: tenantStatus,
            },
            user: {
              id: context.userId,
              tenantId: context.tenantId,
              status: userStatus,
            },
            assignments,
          };
        }, {
          isolationLevel: 'RepeatableRead',
          maxWait: 2_000,
          timeout: 5_000,
        });
      } catch (error) {
        if (error instanceof EnterpriseAuthorizationStoreError) throw error;
        throw storeError('ENTERPRISE_AUTHORIZATION_DATABASE_UNAVAILABLE');
      }
    },
  });
}

export const enterpriseAuthorizationStore = createEnterpriseAuthorizationStore();
export default enterpriseAuthorizationStore;
