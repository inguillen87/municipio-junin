'use strict';

const { isPublishedDemoIdentity } = require('./published-demo-policy.cjs');

// Runtime-neutral RBAC foundation shared by Serverless (ESM) and Express (CJS).
//
// Security contract:
// - roles and capabilities are exact, case-sensitive identifiers;
// - there is no rank, inheritance or wildcard grant;
// - unknown roles and capabilities are denied;
// - adding a capability never grants it automatically to an existing role.
const ACCESS_POLICY_VERSION = '2026-08-11.1';

const ROLES = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  INTENDENTE: 'INTENDENTE',
  TENANT_ADMIN: 'TENANT_ADMIN',
  TENANT_USER: 'TENANT_USER',
  CONTADOR: 'CONTADOR',
  INSPECTOR: 'INSPECTOR',
  DEMO: 'DEMO',
});

const CAPABILITIES = Object.freeze({
  SESSION_READ: 'session.read',
  NAV_WORKSPACE: 'navigation.workspace',
  NAV_DASHBOARD: 'navigation.dashboard',
  NAV_REPORTS: 'navigation.reports',
  NAV_HACIENDA: 'navigation.hacienda',
  NAV_GRH_EXECUTIVE: 'navigation.grh-executive',
  NAV_ORGANIZATION_ANALYTICS: 'navigation.organization-analytics',
  NAV_TERRITORY: 'navigation.territory',
  NAV_DATA_QUALITY: 'navigation.data-quality',
  NAV_RRHH: 'navigation.rrhh',
  NAV_AI_ASSISTANT: 'navigation.ai-assistant',
  NAV_AUDIT: 'navigation.audit',
  NAV_EXPORT: 'navigation.export',
  NAV_IMPORT: 'navigation.import',
  NAV_HELP: 'navigation.help',
});

// Each role is intentionally enumerated. Do not replace these lists with an
// "all capabilities" spread: a newly introduced permission must remain denied
// until this policy is deliberately versioned and reviewed.
const ROLE_CAPABILITIES = Object.freeze({
  SUPER_ADMIN: Object.freeze([
    CAPABILITIES.SESSION_READ,
    CAPABILITIES.NAV_WORKSPACE,
    CAPABILITIES.NAV_DASHBOARD,
    CAPABILITIES.NAV_REPORTS,
    CAPABILITIES.NAV_HACIENDA,
    CAPABILITIES.NAV_GRH_EXECUTIVE,
    CAPABILITIES.NAV_ORGANIZATION_ANALYTICS,
    CAPABILITIES.NAV_TERRITORY,
    CAPABILITIES.NAV_DATA_QUALITY,
    CAPABILITIES.NAV_RRHH,
    CAPABILITIES.NAV_AI_ASSISTANT,
    CAPABILITIES.NAV_AUDIT,
    CAPABILITIES.NAV_EXPORT,
    CAPABILITIES.NAV_IMPORT,
    CAPABILITIES.NAV_HELP,
  ]),
  INTENDENTE: Object.freeze([
    CAPABILITIES.SESSION_READ,
    CAPABILITIES.NAV_WORKSPACE,
    CAPABILITIES.NAV_DASHBOARD,
    CAPABILITIES.NAV_REPORTS,
    CAPABILITIES.NAV_HACIENDA,
    CAPABILITIES.NAV_GRH_EXECUTIVE,
    CAPABILITIES.NAV_ORGANIZATION_ANALYTICS,
    CAPABILITIES.NAV_TERRITORY,
    CAPABILITIES.NAV_DATA_QUALITY,
    CAPABILITIES.NAV_RRHH,
    CAPABILITIES.NAV_AI_ASSISTANT,
    CAPABILITIES.NAV_AUDIT,
    CAPABILITIES.NAV_EXPORT,
    CAPABILITIES.NAV_HELP,
  ]),
  TENANT_ADMIN: Object.freeze([
    CAPABILITIES.SESSION_READ,
    CAPABILITIES.NAV_WORKSPACE,
    CAPABILITIES.NAV_DASHBOARD,
    CAPABILITIES.NAV_REPORTS,
    CAPABILITIES.NAV_HACIENDA,
    CAPABILITIES.NAV_GRH_EXECUTIVE,
    CAPABILITIES.NAV_ORGANIZATION_ANALYTICS,
    CAPABILITIES.NAV_TERRITORY,
    CAPABILITIES.NAV_DATA_QUALITY,
    CAPABILITIES.NAV_RRHH,
    CAPABILITIES.NAV_AI_ASSISTANT,
    CAPABILITIES.NAV_AUDIT,
    CAPABILITIES.NAV_EXPORT,
    CAPABILITIES.NAV_IMPORT,
    CAPABILITIES.NAV_HELP,
  ]),
  TENANT_USER: Object.freeze([
    CAPABILITIES.SESSION_READ,
    CAPABILITIES.NAV_WORKSPACE,
    CAPABILITIES.NAV_TERRITORY,
    CAPABILITIES.NAV_HELP,
  ]),
  CONTADOR: Object.freeze([
    CAPABILITIES.SESSION_READ,
    CAPABILITIES.NAV_WORKSPACE,
    CAPABILITIES.NAV_DASHBOARD,
    CAPABILITIES.NAV_REPORTS,
    CAPABILITIES.NAV_HACIENDA,
    CAPABILITIES.NAV_GRH_EXECUTIVE,
    CAPABILITIES.NAV_ORGANIZATION_ANALYTICS,
    CAPABILITIES.NAV_TERRITORY,
    CAPABILITIES.NAV_DATA_QUALITY,
    CAPABILITIES.NAV_RRHH,
    CAPABILITIES.NAV_AI_ASSISTANT,
    CAPABILITIES.NAV_EXPORT,
    CAPABILITIES.NAV_HELP,
  ]),
  INSPECTOR: Object.freeze([
    CAPABILITIES.SESSION_READ,
    CAPABILITIES.NAV_WORKSPACE,
    CAPABILITIES.NAV_TERRITORY,
    CAPABILITIES.NAV_HELP,
  ]),
  DEMO: Object.freeze([
    CAPABILITIES.SESSION_READ,
    CAPABILITIES.NAV_WORKSPACE,
    CAPABILITIES.NAV_TERRITORY,
    CAPABILITIES.NAV_HELP,
  ]),
});

// Product routing metadata only. It does not grant access: every priority must
// already exist in ROLE_CAPABILITIES and every API remains authoritative.
// Keep the profile deliberately small so display copy cannot become policy.
const ROLE_HOME_PROFILE = Object.freeze({
  SUPER_ADMIN: Object.freeze({
    variant: 'platform-governance',
    defaultPath: 'inicio.html',
    priorityCapabilities: Object.freeze([
      CAPABILITIES.NAV_WORKSPACE,
      CAPABILITIES.NAV_AUDIT,
      CAPABILITIES.NAV_IMPORT,
      CAPABILITIES.NAV_DATA_QUALITY,
    ]),
  }),
  INTENDENTE: Object.freeze({
    variant: 'executive-leadership',
    defaultPath: 'inicio.html',
    priorityCapabilities: Object.freeze([
      CAPABILITIES.NAV_WORKSPACE,
      CAPABILITIES.NAV_DASHBOARD,
      CAPABILITIES.NAV_GRH_EXECUTIVE,
      CAPABILITIES.NAV_REPORTS,
    ]),
  }),
  TENANT_ADMIN: Object.freeze({
    variant: 'municipal-operations',
    defaultPath: 'inicio.html',
    priorityCapabilities: Object.freeze([
      CAPABILITIES.NAV_WORKSPACE,
      CAPABILITIES.NAV_IMPORT,
      CAPABILITIES.NAV_AUDIT,
      CAPABILITIES.NAV_DATA_QUALITY,
    ]),
  }),
  TENANT_USER: Object.freeze({
    variant: 'municipal-limited',
    defaultPath: 'inicio.html',
    priorityCapabilities: Object.freeze([
      CAPABILITIES.NAV_WORKSPACE,
      CAPABILITIES.NAV_TERRITORY,
      CAPABILITIES.NAV_HELP,
    ]),
  }),
  CONTADOR: Object.freeze({
    variant: 'financial-control',
    defaultPath: 'inicio.html',
    priorityCapabilities: Object.freeze([
      CAPABILITIES.NAV_WORKSPACE,
      CAPABILITIES.NAV_HACIENDA,
      CAPABILITIES.NAV_REPORTS,
      CAPABILITIES.NAV_DATA_QUALITY,
    ]),
  }),
  INSPECTOR: Object.freeze({
    variant: 'territorial-unassigned',
    defaultPath: 'inicio.html',
    priorityCapabilities: Object.freeze([
      CAPABILITIES.NAV_WORKSPACE,
      CAPABILITIES.NAV_TERRITORY,
      CAPABILITIES.NAV_HELP,
    ]),
  }),
  DEMO: Object.freeze({
    variant: 'controlled-preview',
    defaultPath: 'inicio.html',
    priorityCapabilities: Object.freeze([
      CAPABILITIES.NAV_WORKSPACE,
      CAPABILITIES.NAV_TERRITORY,
      CAPABILITIES.NAV_HELP,
    ]),
  }),
});

const KNOWN_ROLES = new Set(Object.values(ROLES));
const KNOWN_CAPABILITIES = new Set(Object.values(CAPABILITIES));

function isKnownRole(role) {
  return typeof role === 'string' && KNOWN_ROLES.has(role);
}

function isKnownCapability(capability) {
  return typeof capability === 'string' && KNOWN_CAPABILITIES.has(capability);
}

function getCapabilitiesForRole(role) {
  if (!isKnownRole(role)) return [];
  return [...ROLE_CAPABILITIES[role]];
}

function getHomeProfileForRole(role) {
  if (!isKnownRole(role)) return null;
  const profile = ROLE_HOME_PROFILE[role];
  if (!profile || profile.defaultPath !== 'inicio.html' ||
      !Array.isArray(profile.priorityCapabilities) ||
      !profile.priorityCapabilities.every(capability => hasCapability(role, capability))) {
    return null;
  }
  return Object.freeze({
    variant: profile.variant,
    defaultPath: profile.defaultPath,
    priorityCapabilities: Object.freeze([...profile.priorityCapabilities]),
  });
}

function getSessionAccessForUser(user) {
  if (!user || typeof user !== 'object' || !isKnownRole(user.role)) return null;
  const hasTenant = typeof user.tenantId === 'string' && user.tenantId.trim().length > 0;
  const roleCapabilities = user.role === ROLES.SUPER_ADMIN && !hasTenant
    ? [CAPABILITIES.SESSION_READ, CAPABILITIES.NAV_WORKSPACE, CAPABILITIES.NAV_HELP]
    : getCapabilitiesForRole(user.role);
  // Published role-preview identities remain a deliberately narrower product
  // surface even when their static role ceiling includes private GRH access.
  const capabilities = isPublishedDemoIdentity(user.email)
    ? roleCapabilities.filter(capability => capability !== CAPABILITIES.NAV_ORGANIZATION_ANALYTICS)
    : roleCapabilities;
  const baseProfile = getHomeProfileForRole(user.role);
  if (!baseProfile || !capabilities.includes(CAPABILITIES.NAV_WORKSPACE)) return null;
  const priorityCapabilities = baseProfile.priorityCapabilities.filter(capability =>
    capabilities.includes(capability)
  );
  if (!priorityCapabilities.includes(CAPABILITIES.NAV_WORKSPACE)) return null;
  return Object.freeze({
    capabilities: Object.freeze([...capabilities]),
    homeProfile: Object.freeze({
      variant: baseProfile.variant,
      defaultPath: baseProfile.defaultPath,
      priorityCapabilities: Object.freeze(priorityCapabilities),
    }),
  });
}

function hasCapability(role, capability) {
  if (!isKnownRole(role) || !isKnownCapability(capability)) return false;
  return ROLE_CAPABILITIES[role].includes(capability);
}

function hasExactRole(userRole, requiredRole) {
  return isKnownRole(userRole) && isKnownRole(requiredRole) && userRole === requiredRole;
}

function hasAnyRole(userRole, allowedRoles) {
  return isKnownRole(userRole) && Array.isArray(allowedRoles) &&
    allowedRoles.some(requiredRole => hasExactRole(userRole, requiredRole));
}

module.exports = Object.freeze({
  ACCESS_POLICY_VERSION,
  ROLES,
  CAPABILITIES,
  ROLE_CAPABILITIES,
  ROLE_HOME_PROFILE,
  isKnownRole,
  isKnownCapability,
  getCapabilitiesForRole,
  getHomeProfileForRole,
  getSessionAccessForUser,
  hasCapability,
  hasExactRole,
  hasAnyRole,
});
