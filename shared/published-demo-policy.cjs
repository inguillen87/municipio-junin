'use strict';

// Temporary containment for the six role-preview identities that were
// previously published. This is an authorization ceiling, never a grant:
// callers must still pass the canonical role/route policy first.
const PUBLISHED_DEMO_POLICY_VERSION = '2026-08-11.6';

const PUBLISHED_DEMO_PROFILES = Object.freeze([
  Object.freeze({ email: 'admin@junin.gov.ar', role: 'TENANT_ADMIN', tenantSlug: 'junin' }),
  Object.freeze({ email: 'contador@junin.gov.ar', role: 'CONTADOR', tenantSlug: 'junin' }),
  Object.freeze({ email: 'demo@junin.gov.ar', role: 'DEMO', tenantSlug: 'junin' }),
  Object.freeze({ email: 'inspector@junin.gov.ar', role: 'INSPECTOR', tenantSlug: 'junin' }),
  Object.freeze({ email: 'intendente@junin.gov.ar', role: 'INTENDENTE', tenantSlug: 'junin' }),
  Object.freeze({ email: 'rrhh@junin.gov.ar', role: 'TENANT_USER', tenantSlug: 'junin' }),
]);

const PUBLISHED_DEMO_IDENTITIES = Object.freeze(PUBLISHED_DEMO_PROFILES.map(profile => profile.email));

const PUBLISHED_DEMO_ALLOWED_ROUTE_IDS = Object.freeze([
  'serverless.auth.me.read',
  'serverless.grh.executive.read',
  'serverless.grh.quality.read',
  'serverless.grh.close.read',
  'serverless.grh.decision-brief.read',
  'serverless.grh.action-ledger.read',
  'serverless.grh.domain-catalog.read',
  'serverless.grh.analysis.execute',
  'serverless.grh.organization-analytics.read',
  'serverless.grh.movement-operations.read',
  'serverless.grh.workforce-finance.read',
  'serverless.grh.report.read',
  'serverless.grh.report-api.read',
  'serverless.municipal.territory.read',
  'express.auth.me.read',
]);

const PUBLISHED_DEMO_DECISION_CODES = Object.freeze({
  NOT_APPLICABLE: 'PUBLISHED_DEMO_NOT_APPLICABLE',
  ALLOWED: 'PUBLISHED_DEMO_ROUTE_ALLOWED',
  DENIED: 'PUBLISHED_DEMO_ROUTE_DENIED',
  IDENTITY_DRIFT: 'PUBLISHED_DEMO_IDENTITY_DRIFT',
});

const profileByEmail = new Map(PUBLISHED_DEMO_PROFILES.map(profile => [profile.email, profile]));
const allowedRouteIdSet = new Set(PUBLISHED_DEMO_ALLOWED_ROUTE_IDS);

function canonicalEmail(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && normalized.length <= 254 ? normalized : null;
}

function isPublishedDemoIdentity(email) {
  const normalized = canonicalEmail(email);
  return normalized !== null && profileByEmail.has(normalized);
}

function evaluatePublishedDemoRoute({ email, role, tenantSlug, routeId } = {}) {
  const normalizedEmail = canonicalEmail(email);
  const profile = normalizedEmail === null ? null : profileByEmail.get(normalizedEmail);
  if (!profile) {
    return Object.freeze({
      applies: false,
      allowed: true,
      code: PUBLISHED_DEMO_DECISION_CODES.NOT_APPLICABLE,
      policyVersion: PUBLISHED_DEMO_POLICY_VERSION,
    });
  }

  if (role !== profile.role || tenantSlug !== profile.tenantSlug) {
    return Object.freeze({
      applies: true,
      allowed: false,
      code: PUBLISHED_DEMO_DECISION_CODES.IDENTITY_DRIFT,
      policyVersion: PUBLISHED_DEMO_POLICY_VERSION,
    });
  }

  const allowed = typeof routeId === 'string' && allowedRouteIdSet.has(routeId);
  return Object.freeze({
    applies: true,
    allowed,
    code: allowed
      ? PUBLISHED_DEMO_DECISION_CODES.ALLOWED
      : PUBLISHED_DEMO_DECISION_CODES.DENIED,
    policyVersion: PUBLISHED_DEMO_POLICY_VERSION,
  });
}

module.exports = Object.freeze({
  PUBLISHED_DEMO_POLICY_VERSION,
  PUBLISHED_DEMO_PROFILES,
  PUBLISHED_DEMO_IDENTITIES,
  PUBLISHED_DEMO_ALLOWED_ROUTE_IDS,
  PUBLISHED_DEMO_DECISION_CODES,
  isPublishedDemoIdentity,
  evaluatePublishedDemoRoute,
});
