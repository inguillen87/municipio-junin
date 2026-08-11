import pg from 'pg';

import { noStore, requireCapability, verifyToken } from './lib/auth.js';
import {
  GRH_DIRECTORY_ACCESS_LIMITS,
  GRH_DIRECTORY_ACCESS_PURPOSES,
  GRH_DIRECTORY_ACCESS_SCHEMA_VERSION,
  GRH_DIRECTORY_PERMISSION,
  inspectGrhDirectoryAccessResponse,
} from './lib/grh-directory-access-contract.js';
import { parseGrhDirectoryRequestContext } from './lib/grh-directory-request-context.js';
import enterpriseAuthorizationStore from './lib/enterprise-authorization-store.js';
import {
  ENTERPRISE_AUTHORIZATION_DECISION_CODES,
  evaluateEnterpriseAuthorization,
} from './lib/enterprise-authorization.js';
import {
  appendSecurityAuditEvent,
  createAuditPrincipalHash,
  requireCommittedSecurityAudit,
} from './lib/security-audit-ledger.js';
import accessPolicy from '../shared/access-policy.cjs';
import databaseUrlPolicy from '../shared/database-url-policy.cjs';
import publishedDemoPolicy from '../shared/published-demo-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';
import routePolicy from '../shared/route-policy.cjs';

const { Pool } = pg;
const { ACCESS_POLICY_VERSION } = accessPolicy;
const { inspectDatabaseUrl } = databaseUrlPolicy;
const { isPublishedDemoIdentity } = publishedDemoPolicy;
const { API_CONTRACTS, HEADER_NAME } = releaseTruthContract;
const { ACTIONS, RESOURCES } = routePolicy;

const DIRECTORY_RESOURCE = RESOURCES.GRH_DIRECTORY || 'grh.directory';
const CONTRACT_VALUE = API_CONTRACTS['/api/grh-directory-access'] ||
  GRH_DIRECTORY_ACCESS_SCHEMA_VERSION;
const HIGH_DIRECTORY_ROLES = new Set(['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']);
const AUTHORIZATION_MODES = new Set(['disabled', 'shadow', 'intersect']);
const AUTHORIZATION_DYNAMIC_EVIDENCE_FAILURES = new Set([
  ENTERPRISE_AUTHORIZATION_DECISION_CODES.DYNAMIC_FACTS_MISSING,
  ENTERPRISE_AUTHORIZATION_DECISION_CODES.DYNAMIC_FACTS_DRIFT,
  ENTERPRISE_AUTHORIZATION_DECISION_CODES.DYNAMIC_DATABASE_ERROR,
]);
const AUTHORIZATION_FATAL_FAILURES = new Set([
  ENTERPRISE_AUTHORIZATION_DECISION_CODES.CONFIGURATION_INVALID,
  ENTERPRISE_AUTHORIZATION_DECISION_CODES.PERMISSION_INVALID,
  ENTERPRISE_AUTHORIZATION_DECISION_CODES.INPUT_INVALID,
]);
const TENANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const STATIC_POLICY_VERSION = `static:${ACCESS_POLICY_VERSION}`;

export function parseDirectoryUserAllowlist(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ids = value.split(',').map(item => item.trim());
  if (ids.some(id => !/^[A-Za-z0-9_-]{1,128}$/.test(id)) ||
      new Set(ids).size !== ids.length) return null;
  return new Set(ids);
}

export function parseGrhDirectoryAuthorizationMode(value) {
  const mode = value === undefined || value === null || value === '' ? 'disabled' : value;
  return typeof mode === 'string' && AUTHORIZATION_MODES.has(mode) ? mode : null;
}

export function isPublishedGrhDirectoryRequest(req) {
  const token = verifyToken(req);
  return isPublishedDemoIdentity(token?.email);
}

export function createSecurityAuditQueryAdapter({
  environment = process.env,
  PoolClass = Pool,
} = {}) {
  let pool = null;
  return Object.freeze({
    async connect() {
      if (!pool) {
        const inspected = inspectDatabaseUrl(environment.DATABASE_URL, {
          nodeEnv: environment.NODE_ENV,
          environment,
        });
        pool = new PoolClass({ connectionString: inspected.connectionString });
      }
      return pool.connect();
    },
  });
}

export const securityAuditQueryAdapter = createSecurityAuditQueryAdapter();

export function respondGrhDirectoryDenied(res, code = 'GRH_DIRECTORY_ACCESS_DENIED') {
  return res.status(403).json({
    error: 'Acceso individual GRH no habilitado',
    code,
  });
}

export function respondGrhDirectoryUnavailable(res) {
  return res.status(503).json({
    error: 'El directorio GRH no esta disponible.',
    code: 'GRH_DIRECTORY_UNAVAILABLE',
  });
}

function contextInvalid(res) {
  return res.status(400).json({
    error: 'Proposito o correlacion de consulta invalidos',
    code: 'GRH_DIRECTORY_CONTEXT_INVALID',
  });
}

function accessScope(decision) {
  if (decision.scope.tenantWide) {
    return { kind: 'TENANT', label: 'Todo el municipio', organizationCount: null };
  }
  const kind = decision.scope.kind === 'ORG_UNIT' ? 'ORG_UNIT' : 'ORG_SUBTREE';
  return {
    kind,
    label: kind === 'ORG_UNIT'
      ? 'Unidad organizativa autorizada'
      : 'Ambitos organizativos autorizados',
    organizationCount: decision.allowedOrganizationCodes.length,
  };
}

export function buildGrhDirectoryAccessResponse(decision) {
  const active = decision.mode === 'intersect';
  const staticMode = decision.mode === 'disabled';
  return Object.freeze({
    schemaVersion: GRH_DIRECTORY_ACCESS_SCHEMA_VERSION,
    status: active ? 'active' : (staticMode ? 'static' : 'shadow'),
    policyVersion: decision.policyVersion || STATIC_POLICY_VERSION,
    permission: GRH_DIRECTORY_PERMISSION,
    scope: Object.freeze(accessScope(decision)),
    validity: Object.freeze(active
      ? { ...decision.validity }
      : { validFrom: null, validUntil: null }),
    audit: Object.freeze({
      required: !staticMode,
      purposes: Object.freeze([...GRH_DIRECTORY_ACCESS_PURPOSES]),
      storesPersonalQuery: false,
    }),
    limits: Object.freeze([...GRH_DIRECTORY_ACCESS_LIMITS]),
  });
}

function auditEvidence(decision, allowed) {
  if (!allowed || !decision?.allowed) {
    return {
      policyVersion: null,
      assignmentIds: [],
      scopeIds: [],
      scopeKind: 'NONE',
      organizationCount: 0,
    };
  }
  return {
    policyVersion: decision.policyVersion,
    assignmentIds: [...decision.assignment.ids],
    scopeIds: [...decision.scope.ids],
    scopeKind: decision.scope.kind,
    organizationCount: decision.allowedOrganizationCodes.length,
  };
}

async function commitAttemptAudit({
  caller,
  context,
  mode,
  operation,
  outcome,
  reason,
  resultCount,
  decision,
  principalHash,
  auditQueryAdapter,
  appendAuditImpl,
  requireCommittedAuditImpl,
  clock,
  auditIdFactory,
}) {
  const evidence = auditEvidence(decision, outcome === 'ALLOWED');
  try {
    const result = await appendAuditImpl({
      tenantId: String(caller.tenantId),
      principalHash,
      purpose: context.purpose,
      operation,
      correlationId: context.correlationId,
      authorizationMode: mode,
      authorizationReason: reason,
      outcome,
      ...evidence,
      resultCount,
    }, {
      queryAdapter: auditQueryAdapter,
      clock,
      idFactory: auditIdFactory,
    });
    requireCommittedAuditImpl(result);
    return true;
  } catch {
    return false;
  }
}

/**
 * Shared private-directory guard. It never reads request query values and it
 * returns an audit closure instead of exposing principal or policy receipts.
 */
export async function authorizeGrhDirectoryRequest(req, res, {
  operation,
  requiresNominalAudit = true,
  environment = process.env,
  requireCapabilityImpl = requireCapability,
  isPublicRequestImpl = isPublishedGrhDirectoryRequest,
  isPublishedIdentityImpl = isPublishedDemoIdentity,
  parseContextImpl = parseGrhDirectoryRequestContext,
  authorizationStore = enterpriseAuthorizationStore,
  evaluateAuthorizationImpl = evaluateEnterpriseAuthorization,
  auditQueryAdapter = securityAuditQueryAdapter,
  appendAuditImpl = appendSecurityAuditEvent,
  requireCommittedAuditImpl = requireCommittedSecurityAudit,
  principalHashImpl = createAuditPrincipalHash,
  clock = () => new Date(),
  auditIdFactory,
} = {}) {
  if (isPublicRequestImpl(req)) {
    respondGrhDirectoryDenied(res, 'GRH_DIRECTORY_PUBLIC_ACCESS_DENIED');
    return null;
  }

  const caller = await requireCapabilityImpl(
    req,
    res,
    DIRECTORY_RESOURCE,
    ACTIONS.READ,
  );
  if (!caller) return null;
  if (isPublishedIdentityImpl(caller.email)) {
    respondGrhDirectoryDenied(res, 'GRH_DIRECTORY_PUBLIC_ACCESS_DENIED');
    return null;
  }

  const context = requiresNominalAudit
    ? parseContextImpl(req, { detail: operation === 'detail' })
    : null;
  if (requiresNominalAudit && !context) {
    contextInvalid(res);
    return null;
  }

  const mode = parseGrhDirectoryAuthorizationMode(environment.GRH_DIRECTORY_AUTHZ_MODE);
  const configuredTenant = environment.GRH_TENANT_ID;
  if (!mode || typeof configuredTenant !== 'string' ||
      !TENANT_ID_PATTERN.test(configuredTenant)) {
    respondGrhDirectoryUnavailable(res);
    return null;
  }

  let principalHash = null;
  if (mode !== 'disabled') {
    try {
      principalHash = principalHashImpl({
        secret: environment.GRH_DIRECTORY_AUDIT_HMAC_SECRET,
        tenantId: String(caller.tenantId || ''),
        userId: String(caller.id || ''),
      });
    } catch {
      respondGrhDirectoryUnavailable(res);
      return null;
    }
  }

  const commitAudit = mode === 'disabled' || !requiresNominalAudit
    ? async () => true
    : options => commitAttemptAudit({
      caller,
      context,
      mode,
      operation,
      principalHash,
      auditQueryAdapter,
      appendAuditImpl,
      requireCommittedAuditImpl,
      clock,
      auditIdFactory,
      ...options,
    });

  if (!caller.tenantId || String(caller.tenantId) !== configuredTenant) {
    const committed = await commitAudit({
      outcome: 'DENIED',
      reason: 'TENANT_BOUNDARY_DENIED',
      resultCount: 0,
      decision: null,
    });
    if (!committed) respondGrhDirectoryUnavailable(res);
    else respondGrhDirectoryDenied(res, 'GRH_DIRECTORY_TENANT_DENIED');
    return null;
  }

  const allowlist = parseDirectoryUserAllowlist(environment.GRH_DIRECTORY_ALLOWED_USER_IDS);
  const staticAllowed = HIGH_DIRECTORY_ROLES.has(caller.role) &&
    typeof caller.email === 'string' && caller.email.trim().length > 0 &&
    Boolean(allowlist?.has(String(caller.id)));
  if (!staticAllowed) {
    const committed = await commitAudit({
      outcome: 'DENIED',
      reason: 'STATIC_DENIED',
      resultCount: 0,
      decision: null,
    });
    if (!committed) respondGrhDirectoryUnavailable(res);
    else respondGrhDirectoryDenied(res);
    return null;
  }

  let decision;
  try {
    decision = await evaluateAuthorizationImpl({
      mode,
      staticAllowed: true,
      tenantId: configuredTenant,
      userId: String(caller.id),
      permission: GRH_DIRECTORY_PERMISSION,
      at: clock(),
      queryAdapter: authorizationStore,
    });
  } catch {
    decision = null;
  }

  if (!decision || AUTHORIZATION_FATAL_FAILURES.has(decision.reason) ||
      (mode === 'intersect' && AUTHORIZATION_DYNAMIC_EVIDENCE_FAILURES.has(decision.reason)) ||
      (decision.allowed && !decision.scope.tenantWide &&
        decision.allowedOrganizationCodes.length === 0)) {
    await commitAudit({
      outcome: 'DENIED',
      reason: 'AUTHORIZATION_POLICY_ERROR',
      resultCount: 0,
      decision: null,
    });
    respondGrhDirectoryUnavailable(res);
    return null;
  }

  if (!decision.allowed) {
    const committed = await commitAudit({
      outcome: 'DENIED',
      reason: decision.reason,
      resultCount: 0,
      decision,
    });
    if (!committed) respondGrhDirectoryUnavailable(res);
    else respondGrhDirectoryDenied(res);
    return null;
  }

  return Object.freeze({ caller, context, mode, decision, commitAudit });
}

function setAccessHeaders(res) {
  res.setHeader(HEADER_NAME, CONTRACT_VALUE);
  noStore(res);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Authorization');
}

export function createGrhDirectoryAccessHandler(dependencies = {}) {
  return async function handler(req, res) {
    setAccessHeaders(res);
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Metodo no permitido', code: 'METHOD_NOT_ALLOWED' });
    }

    const authorization = await authorizeGrhDirectoryRequest(req, res, {
      operation: 'list',
      requiresNominalAudit: false,
      ...dependencies,
    });
    if (!authorization) return;

    const response = buildGrhDirectoryAccessResponse(authorization.decision);
    if (!inspectGrhDirectoryAccessResponse(response).ok) {
      return respondGrhDirectoryUnavailable(res);
    }
    return res.status(200).json(response);
  };
}

export default createGrhDirectoryAccessHandler();
