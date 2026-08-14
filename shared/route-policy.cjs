'use strict';

// Exact resource/action authorization shared by Serverless (ESM) and Express
// (CJS). This policy is an authorization ceiling for the currently exposed
// protected routes. Legacy route-local role checks may further restrict access,
// but they cannot grant a permission absent from this policy.
//
// Security contract:
// - no role hierarchy, inheritance or wildcard grant;
// - every resource/action pair and every route is explicitly registered;
// - unknown roles, permissions, routes, methods and runtimes are denied;
// - internal bearer access is explicit per route and secret name;
// - adding a permission does not grant it to any role automatically.

const { ROLES, isKnownRole } = require('./access-policy.cjs');

const ROUTE_POLICY_VERSION = '2026-08-14.16';

const RUNTIMES = Object.freeze({
  SERVERLESS: 'serverless',
  EXPRESS: 'express',
});

const RESOURCES = Object.freeze({
  SESSION: 'session',
  GRH_CONTRACT: 'grh.contract',
  GRH_EMPLOYMENT_ACTIONS: 'grh.employment-actions',
  GRH_ACTION_LEDGER: 'grh.action-ledger',
  GRH_DIRECTORY: 'grh.directory',
  GRH_ORGANIZATION_ANALYTICS: 'grh.organization.analytics',
  GRH_WORKFORCE_FINANCE: 'grh.workforce-finance',
  MUNICIPAL_TERRITORY: 'municipal.territory',
  GRH_ANALYSIS: 'grh.analysis',
  GRH_REPORT: 'grh.report',
  LEGACY_AI: 'legacy.ai',
  LEGACY_AUDIT: 'legacy.audit',
  LEGACY_DASHBOARD: 'legacy.dashboard',
  EMPLOYEE_RECORD: 'employee.record',
  PAYMENT_RECORD: 'payment.record',
  CLAIM_RECORD: 'claim.record',
  CORE_IMPORT: 'core.import',
  LEGACY_IMPORT: 'legacy.import',
  LEGACY_EXPORT: 'legacy.export',
  LEGACY_CONNECTOR: 'legacy.connector',
  REPORT_DELIVERY: 'report.delivery',
  SERVERLESS_WHATSAPP_ALERT: 'serverless.whatsapp-alert',
  EXPRESS_WHATSAPP_ADMIN: 'express.whatsapp-admin',
  WHATSAPP_DIAGNOSTIC: 'whatsapp.diagnostic',
  PLATFORM_SEED: 'platform.seed',
  RETIRED_TENANTLESS: 'retired.tenantless',
  LEGACY_DATA: 'legacy.data',
  LEGACY_NOTIFICATION: 'legacy.notification',
  PLATFORM_STATS: 'platform.stats',
  PLATFORM_TENANT: 'platform.tenant',
  PLATFORM_USER: 'platform.user',
  PLATFORM_AUDIT: 'platform.audit',
});

const ACTIONS = Object.freeze({
  READ: 'read',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  EXECUTE: 'execute',
  IMPORT: 'import',
  EXPORT: 'export',
  SEND: 'send',
  REFRESH: 'refresh',
  UPDATE_STATUS: 'update-status',
  UPDATE_MODULES: 'update-modules',
  ACCESS: 'access',
});

function permissionId(resource, action) {
  return `${resource}:${action}`;
}

const PERMISSIONS = Object.freeze({
  SESSION_READ: permissionId(RESOURCES.SESSION, ACTIONS.READ),
  SESSION_REFRESH: permissionId(RESOURCES.SESSION, ACTIONS.REFRESH),
  GRH_CONTRACT_READ: permissionId(RESOURCES.GRH_CONTRACT, ACTIONS.READ),
  GRH_EMPLOYMENT_ACTIONS_READ: permissionId(RESOURCES.GRH_EMPLOYMENT_ACTIONS, ACTIONS.READ),
  GRH_ACTION_LEDGER_READ: permissionId(RESOURCES.GRH_ACTION_LEDGER, ACTIONS.READ),
  GRH_ACTION_LEDGER_CREATE: permissionId(RESOURCES.GRH_ACTION_LEDGER, ACTIONS.CREATE),
  GRH_ACTION_LEDGER_UPDATE: permissionId(RESOURCES.GRH_ACTION_LEDGER, ACTIONS.UPDATE),
  GRH_DIRECTORY_READ: permissionId(RESOURCES.GRH_DIRECTORY, ACTIONS.READ),
  GRH_ORGANIZATION_ANALYTICS_READ: permissionId(RESOURCES.GRH_ORGANIZATION_ANALYTICS, ACTIONS.READ),
  GRH_WORKFORCE_FINANCE_READ: permissionId(RESOURCES.GRH_WORKFORCE_FINANCE, ACTIONS.READ),
  MUNICIPAL_TERRITORY_READ: permissionId(RESOURCES.MUNICIPAL_TERRITORY, ACTIONS.READ),
  GRH_ANALYSIS_EXECUTE: permissionId(RESOURCES.GRH_ANALYSIS, ACTIONS.EXECUTE),
  GRH_REPORT_READ: permissionId(RESOURCES.GRH_REPORT, ACTIONS.READ),
  LEGACY_AI_EXECUTE: permissionId(RESOURCES.LEGACY_AI, ACTIONS.EXECUTE),
  LEGACY_AUDIT_READ: permissionId(RESOURCES.LEGACY_AUDIT, ACTIONS.READ),
  LEGACY_AUDIT_DELETE: permissionId(RESOURCES.LEGACY_AUDIT, ACTIONS.DELETE),
  LEGACY_DASHBOARD_READ: permissionId(RESOURCES.LEGACY_DASHBOARD, ACTIONS.READ),
  EMPLOYEE_READ: permissionId(RESOURCES.EMPLOYEE_RECORD, ACTIONS.READ),
  EMPLOYEE_CREATE: permissionId(RESOURCES.EMPLOYEE_RECORD, ACTIONS.CREATE),
  EMPLOYEE_UPDATE: permissionId(RESOURCES.EMPLOYEE_RECORD, ACTIONS.UPDATE),
  EMPLOYEE_DELETE: permissionId(RESOURCES.EMPLOYEE_RECORD, ACTIONS.DELETE),
  PAYMENT_READ: permissionId(RESOURCES.PAYMENT_RECORD, ACTIONS.READ),
  PAYMENT_CREATE: permissionId(RESOURCES.PAYMENT_RECORD, ACTIONS.CREATE),
  PAYMENT_UPDATE: permissionId(RESOURCES.PAYMENT_RECORD, ACTIONS.UPDATE),
  PAYMENT_DELETE: permissionId(RESOURCES.PAYMENT_RECORD, ACTIONS.DELETE),
  CLAIM_READ: permissionId(RESOURCES.CLAIM_RECORD, ACTIONS.READ),
  CLAIM_CREATE: permissionId(RESOURCES.CLAIM_RECORD, ACTIONS.CREATE),
  CLAIM_UPDATE: permissionId(RESOURCES.CLAIM_RECORD, ACTIONS.UPDATE),
  CLAIM_DELETE: permissionId(RESOURCES.CLAIM_RECORD, ACTIONS.DELETE),
  CORE_IMPORT_EXECUTE: permissionId(RESOURCES.CORE_IMPORT, ACTIONS.IMPORT),
  LEGACY_IMPORT_EXECUTE: permissionId(RESOURCES.LEGACY_IMPORT, ACTIONS.IMPORT),
  LEGACY_EXPORT_READ: permissionId(RESOURCES.LEGACY_EXPORT, ACTIONS.EXPORT),
  LEGACY_CONNECTOR_EXECUTE: permissionId(RESOURCES.LEGACY_CONNECTOR, ACTIONS.EXECUTE),
  REPORT_DELIVERY_SEND: permissionId(RESOURCES.REPORT_DELIVERY, ACTIONS.SEND),
  SERVERLESS_WHATSAPP_ALERT_SEND: permissionId(RESOURCES.SERVERLESS_WHATSAPP_ALERT, ACTIONS.SEND),
  EXPRESS_WHATSAPP_ADMIN_READ: permissionId(RESOURCES.EXPRESS_WHATSAPP_ADMIN, ACTIONS.READ),
  EXPRESS_WHATSAPP_ADMIN_SEND: permissionId(RESOURCES.EXPRESS_WHATSAPP_ADMIN, ACTIONS.SEND),
  WHATSAPP_DIAGNOSTIC_EXECUTE: permissionId(RESOURCES.WHATSAPP_DIAGNOSTIC, ACTIONS.EXECUTE),
  PLATFORM_SEED_EXECUTE: permissionId(RESOURCES.PLATFORM_SEED, ACTIONS.EXECUTE),
  RETIRED_TENANTLESS_ACCESS: permissionId(RESOURCES.RETIRED_TENANTLESS, ACTIONS.ACCESS),
  LEGACY_DATA_READ: permissionId(RESOURCES.LEGACY_DATA, ACTIONS.READ),
  LEGACY_DATA_IMPORT: permissionId(RESOURCES.LEGACY_DATA, ACTIONS.IMPORT),
  LEGACY_DATA_STATUS_READ: permissionId(RESOURCES.LEGACY_DATA, ACTIONS.ACCESS),
  LEGACY_NOTIFICATION_SEND: permissionId(RESOURCES.LEGACY_NOTIFICATION, ACTIONS.SEND),
  LEGACY_NOTIFICATION_STATUS_READ: permissionId(RESOURCES.LEGACY_NOTIFICATION, ACTIONS.READ),
  PLATFORM_STATS_READ: permissionId(RESOURCES.PLATFORM_STATS, ACTIONS.READ),
  PLATFORM_TENANT_READ: permissionId(RESOURCES.PLATFORM_TENANT, ACTIONS.READ),
  PLATFORM_TENANT_CREATE: permissionId(RESOURCES.PLATFORM_TENANT, ACTIONS.CREATE),
  PLATFORM_TENANT_UPDATE: permissionId(RESOURCES.PLATFORM_TENANT, ACTIONS.UPDATE),
  PLATFORM_TENANT_STATUS_UPDATE: permissionId(RESOURCES.PLATFORM_TENANT, ACTIONS.UPDATE_STATUS),
  PLATFORM_TENANT_MODULES_UPDATE: permissionId(RESOURCES.PLATFORM_TENANT, ACTIONS.UPDATE_MODULES),
  PLATFORM_USER_READ: permissionId(RESOURCES.PLATFORM_USER, ACTIONS.READ),
  PLATFORM_USER_CREATE: permissionId(RESOURCES.PLATFORM_USER, ACTIONS.CREATE),
  PLATFORM_AUDIT_READ: permissionId(RESOURCES.PLATFORM_AUDIT, ACTIONS.READ),
});

const ALL_CURRENT_ROLES = Object.freeze([
  ROLES.SUPER_ADMIN,
  ROLES.INTENDENTE,
  ROLES.TENANT_ADMIN,
  ROLES.TENANT_USER,
  ROLES.CONTADOR,
  ROLES.INSPECTOR,
  ROLES.DEMO,
]);

// Permission grants are intentionally literal. Do not use an "all roles"
// helper or spreads here: every role grant must be reviewable at this boundary.
const PERMISSION_GRANTS = Object.freeze({
  [PERMISSIONS.SESSION_READ]: Object.freeze(['SUPER_ADMIN', 'INTENDENTE', 'TENANT_ADMIN', 'TENANT_USER', 'CONTADOR', 'INSPECTOR', 'DEMO']),
  [PERMISSIONS.SESSION_REFRESH]: Object.freeze(['SUPER_ADMIN', 'INTENDENTE', 'TENANT_ADMIN', 'TENANT_USER', 'CONTADOR', 'INSPECTOR', 'DEMO']),
  [PERMISSIONS.GRH_CONTRACT_READ]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']),
  [PERMISSIONS.GRH_EMPLOYMENT_ACTIONS_READ]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']),
  [PERMISSIONS.GRH_ACTION_LEDGER_READ]: Object.freeze(['TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']),
  [PERMISSIONS.GRH_ACTION_LEDGER_CREATE]: Object.freeze(['INTENDENTE']),
  [PERMISSIONS.GRH_ACTION_LEDGER_UPDATE]: Object.freeze(['TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']),
  [PERMISSIONS.GRH_DIRECTORY_READ]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']),
  [PERMISSIONS.GRH_ORGANIZATION_ANALYTICS_READ]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']),
  [PERMISSIONS.GRH_WORKFORCE_FINANCE_READ]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']),
  [PERMISSIONS.MUNICIPAL_TERRITORY_READ]: Object.freeze(['SUPER_ADMIN', 'INTENDENTE', 'TENANT_ADMIN', 'TENANT_USER', 'CONTADOR', 'INSPECTOR', 'DEMO']),
  [PERMISSIONS.GRH_ANALYSIS_EXECUTE]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']),
  [PERMISSIONS.GRH_REPORT_READ]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']),
  [PERMISSIONS.LEGACY_AI_EXECUTE]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']),
  [PERMISSIONS.LEGACY_AUDIT_READ]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE']),
  [PERMISSIONS.LEGACY_AUDIT_DELETE]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN']),
  [PERMISSIONS.LEGACY_DASHBOARD_READ]: Object.freeze(['INTENDENTE', 'CONTADOR']),
  [PERMISSIONS.EMPLOYEE_READ]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']),
  [PERMISSIONS.EMPLOYEE_CREATE]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN']),
  [PERMISSIONS.EMPLOYEE_UPDATE]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN']),
  [PERMISSIONS.EMPLOYEE_DELETE]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN']),
  [PERMISSIONS.PAYMENT_READ]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']),
  [PERMISSIONS.PAYMENT_CREATE]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN']),
  [PERMISSIONS.PAYMENT_UPDATE]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN']),
  [PERMISSIONS.PAYMENT_DELETE]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN']),
  [PERMISSIONS.CLAIM_READ]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'INSPECTOR']),
  [PERMISSIONS.CLAIM_CREATE]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'INSPECTOR']),
  [PERMISSIONS.CLAIM_UPDATE]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'INSPECTOR']),
  [PERMISSIONS.CLAIM_DELETE]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'INSPECTOR']),
  [PERMISSIONS.CORE_IMPORT_EXECUTE]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN']),
  [PERMISSIONS.LEGACY_IMPORT_EXECUTE]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN']),
  [PERMISSIONS.LEGACY_EXPORT_READ]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']),
  [PERMISSIONS.LEGACY_CONNECTOR_EXECUTE]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN']),
  [PERMISSIONS.REPORT_DELIVERY_SEND]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE']),
  [PERMISSIONS.SERVERLESS_WHATSAPP_ALERT_SEND]: Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN']),
  [PERMISSIONS.EXPRESS_WHATSAPP_ADMIN_READ]: Object.freeze(['TENANT_ADMIN']),
  [PERMISSIONS.EXPRESS_WHATSAPP_ADMIN_SEND]: Object.freeze(['TENANT_ADMIN']),
  [PERMISSIONS.WHATSAPP_DIAGNOSTIC_EXECUTE]: Object.freeze(['SUPER_ADMIN']),
  [PERMISSIONS.PLATFORM_SEED_EXECUTE]: Object.freeze(['SUPER_ADMIN']),
  [PERMISSIONS.RETIRED_TENANTLESS_ACCESS]: Object.freeze(['SUPER_ADMIN', 'INTENDENTE', 'TENANT_ADMIN', 'TENANT_USER', 'CONTADOR', 'INSPECTOR', 'DEMO']),
  [PERMISSIONS.LEGACY_DATA_READ]: Object.freeze(['SUPER_ADMIN', 'INTENDENTE', 'TENANT_ADMIN', 'TENANT_USER', 'CONTADOR', 'INSPECTOR', 'DEMO']),
  [PERMISSIONS.LEGACY_DATA_IMPORT]: Object.freeze(['TENANT_ADMIN']),
  [PERMISSIONS.LEGACY_DATA_STATUS_READ]: Object.freeze(['TENANT_ADMIN']),
  [PERMISSIONS.LEGACY_NOTIFICATION_SEND]: Object.freeze(['TENANT_ADMIN']),
  [PERMISSIONS.LEGACY_NOTIFICATION_STATUS_READ]: Object.freeze(['TENANT_ADMIN']),
  [PERMISSIONS.PLATFORM_STATS_READ]: Object.freeze(['SUPER_ADMIN']),
  [PERMISSIONS.PLATFORM_TENANT_READ]: Object.freeze(['SUPER_ADMIN']),
  [PERMISSIONS.PLATFORM_TENANT_CREATE]: Object.freeze(['SUPER_ADMIN']),
  [PERMISSIONS.PLATFORM_TENANT_UPDATE]: Object.freeze(['SUPER_ADMIN']),
  [PERMISSIONS.PLATFORM_TENANT_STATUS_UPDATE]: Object.freeze(['SUPER_ADMIN']),
  [PERMISSIONS.PLATFORM_TENANT_MODULES_UPDATE]: Object.freeze(['SUPER_ADMIN']),
  [PERMISSIONS.PLATFORM_USER_READ]: Object.freeze(['SUPER_ADMIN']),
  [PERMISSIONS.PLATFORM_USER_CREATE]: Object.freeze(['SUPER_ADMIN']),
  [PERMISSIONS.PLATFORM_AUDIT_READ]: Object.freeze(['SUPER_ADMIN']),
});

const INTERNAL_ONLY = null;
const INTERNAL_CRON = Object.freeze(['CRON_SECRET']);

function route(id, runtime, method, path, permission, internalSecrets = []) {
  return Object.freeze({
    id,
    runtime,
    method,
    path,
    permission,
    internalSecrets: Object.freeze([...internalSecrets]),
  });
}

// These two POST routes exchange an already-governed one-click selector for a
// session. They are intentionally outside PROTECTED_ROUTES because no JWT
// exists yet. Their handlers must enforce the exact body, identity, tenant,
// expiry and rate-limit policies before issuing a token.
const SESSION_EXCHANGE_ROUTES = Object.freeze([
  Object.freeze({
    id: 'serverless.auth.evaluation-session.exchange',
    runtime: RUNTIMES.SERVERLESS,
    method: 'POST',
    path: '/auth/evaluation-session',
    mode: 'published-profile',
  }),
  Object.freeze({
    id: 'serverless.auth.private-link-session.exchange',
    runtime: RUNTIMES.SERVERLESS,
    method: 'POST',
    path: '/auth/private-link-session',
    mode: 'opaque-link',
  }),
]);

// Canonical paths omit the common /api prefix. The resolver accepts exactly
// one optional /api prefix so production mounts and isolated route harnesses
// exercise the same policy.
const PROTECTED_ROUTES = Object.freeze([
  // Serverless session and GRH executive surfaces.
  route('serverless.auth.me.read', 'serverless', 'GET', '/auth/me', PERMISSIONS.SESSION_READ),
  route('serverless.grh.contract.read', 'serverless', 'GET', '/grh-data', PERMISSIONS.GRH_CONTRACT_READ),
  route('serverless.grh.directory.read', 'serverless', 'GET', '/grh-directory', PERMISSIONS.GRH_DIRECTORY_READ),
  route('serverless.grh.directory-access.read', 'serverless', 'GET', '/grh-directory-access', PERMISSIONS.GRH_DIRECTORY_READ),
  route('serverless.grh.administration-comparison.read', 'serverless', 'GET', '/grh-administration-comparison', PERMISSIONS.GRH_ORGANIZATION_ANALYTICS_READ),
  route('serverless.grh.management-timeline.read', 'serverless', 'GET', '/grh-management-timeline', PERMISSIONS.GRH_ORGANIZATION_ANALYTICS_READ),
  route('serverless.grh.employment-review.read', 'serverless', 'GET', '/grh-employment-review', PERMISSIONS.GRH_ORGANIZATION_ANALYTICS_READ),
  route('serverless.grh.absence-insights.read', 'serverless', 'GET', '/grh-absence-insights', PERMISSIONS.GRH_ORGANIZATION_ANALYTICS_READ),
  route('serverless.grh.personas-linkage-readiness.read', 'serverless', 'GET', '/grh-personas-linkage-readiness', PERMISSIONS.GRH_ORGANIZATION_ANALYTICS_READ),
  route('serverless.grh.domain-catalog.read', 'serverless', 'GET', '/grh-domain-catalog', PERMISSIONS.GRH_CONTRACT_READ),
  route('serverless.grh.organization-analytics.read', 'serverless', 'GET', '/grh-organization-analytics', PERMISSIONS.GRH_ORGANIZATION_ANALYTICS_READ),
  route('serverless.grh.movement-operations.read', 'serverless', 'GET', '/grh-movement-operations', PERMISSIONS.GRH_ORGANIZATION_ANALYTICS_READ),
  route('serverless.grh.workforce-finance.read', 'serverless', 'GET', '/grh-workforce-finance', PERMISSIONS.GRH_WORKFORCE_FINANCE_READ),
  route('serverless.grh.payroll-run-control.read', 'serverless', 'GET', '/grh-payroll-run-control', PERMISSIONS.GRH_WORKFORCE_FINANCE_READ),
  route('serverless.grh.fixed-concept-control.read', 'serverless', 'GET', '/grh-fixed-concept-control', PERMISSIONS.GRH_WORKFORCE_FINANCE_READ),
  route('serverless.municipal.territory.read', 'serverless', 'GET', '/municipal-territory', PERMISSIONS.MUNICIPAL_TERRITORY_READ),
  route('serverless.grh.executive.read', 'serverless', 'GET', '/grh-executive', PERMISSIONS.GRH_CONTRACT_READ),
  route('serverless.grh.quality.read', 'serverless', 'GET', '/grh-quality', PERMISSIONS.GRH_CONTRACT_READ),
  route('serverless.grh.import-quality-history.read', 'serverless', 'GET', '/grh-import-quality-history', PERMISSIONS.GRH_CONTRACT_READ),
  route('serverless.grh.employment-actions.read', 'serverless', 'GET', '/grh-employment-actions', PERMISSIONS.GRH_EMPLOYMENT_ACTIONS_READ),
  route('serverless.grh.close.read', 'serverless', 'GET', '/grh-close', PERMISSIONS.GRH_CONTRACT_READ),
  route('serverless.grh.decision-brief.read', 'serverless', 'GET', '/grh-decision-brief', PERMISSIONS.GRH_CONTRACT_READ),
  route('serverless.grh.action-ledger.read', 'serverless', 'GET', '/grh-action-ledger', PERMISSIONS.GRH_ACTION_LEDGER_READ),
  route('serverless.grh.action-ledger.create', 'serverless', 'POST', '/grh-action-ledger', PERMISSIONS.GRH_ACTION_LEDGER_CREATE),
  route('serverless.grh.action-ledger.update', 'serverless', 'PATCH', '/grh-action-ledger', PERMISSIONS.GRH_ACTION_LEDGER_UPDATE),
  route('serverless.grh.analysis.execute', 'serverless', 'POST', '/ai-analyze', PERMISSIONS.GRH_ANALYSIS_EXECUTE),
  route('serverless.grh.report.read', 'serverless', 'GET', '/pdf-report', PERMISSIONS.GRH_REPORT_READ),

  // Serverless legacy/retired analytical surfaces.
  route('serverless.legacy.ai-proxy.execute', 'serverless', 'POST', '/ai-proxy', PERMISSIONS.LEGACY_AI_EXECUTE),
  route('serverless.legacy.intelligence.read', 'serverless', 'GET', '/intelligence', PERMISSIONS.LEGACY_AI_EXECUTE),
  route('serverless.legacy.intelligence.execute', 'serverless', 'POST', '/intelligence', PERMISSIONS.LEGACY_AI_EXECUTE),
  route('serverless.legacy.audit.read', 'serverless', 'GET', '/audit', PERMISSIONS.LEGACY_AUDIT_READ),
  route('serverless.legacy.audit.delete', 'serverless', 'DELETE', '/audit', PERMISSIONS.LEGACY_AUDIT_DELETE),
  route('serverless.legacy.dashboard.read', 'serverless', 'GET', '/data/dashboard', PERMISSIONS.LEGACY_DASHBOARD_READ),
  route('serverless.employee.read', 'serverless', 'GET', '/data/empleados', PERMISSIONS.EMPLOYEE_READ),
  route('serverless.employee.create', 'serverless', 'POST', '/data/empleados', PERMISSIONS.EMPLOYEE_CREATE),
  route('serverless.employee.update', 'serverless', 'PUT', '/data/empleados', PERMISSIONS.EMPLOYEE_UPDATE),
  route('serverless.employee.delete', 'serverless', 'DELETE', '/data/empleados', PERMISSIONS.EMPLOYEE_DELETE),
  route('serverless.payment.read', 'serverless', 'GET', '/data/pagos', PERMISSIONS.PAYMENT_READ),
  route('serverless.payment.create', 'serverless', 'POST', '/data/pagos', PERMISSIONS.PAYMENT_CREATE),
  route('serverless.payment.update', 'serverless', 'PUT', '/data/pagos', PERMISSIONS.PAYMENT_UPDATE),
  route('serverless.payment.delete', 'serverless', 'DELETE', '/data/pagos', PERMISSIONS.PAYMENT_DELETE),
  route('serverless.claim.read', 'serverless', 'GET', '/data/reclamos', PERMISSIONS.CLAIM_READ),
  route('serverless.claim.create', 'serverless', 'POST', '/data/reclamos', PERMISSIONS.CLAIM_CREATE),
  route('serverless.claim.update', 'serverless', 'PUT', '/data/reclamos', PERMISSIONS.CLAIM_UPDATE),
  route('serverless.claim.delete', 'serverless', 'DELETE', '/data/reclamos', PERMISSIONS.CLAIM_DELETE),
  route('serverless.core-import.execute', 'serverless', 'POST', '/data/import', PERMISSIONS.CORE_IMPORT_EXECUTE),
  route('serverless.platform-seed.execute', 'serverless', 'POST', '/data/seed', PERMISSIONS.PLATFORM_SEED_EXECUTE),
  route('serverless.legacy-import.upload', 'serverless', 'POST', '/upload-handler', PERMISSIONS.LEGACY_IMPORT_EXECUTE),
  route('serverless.legacy-import.sheets', 'serverless', 'POST', '/google-sheets', PERMISSIONS.LEGACY_IMPORT_EXECUTE),
  route('serverless.legacy-connector.execute', 'serverless', 'POST', '/external-connector', PERMISSIONS.LEGACY_CONNECTOR_EXECUTE),
  route('serverless.legacy-export.read', 'serverless', 'GET', '/export-data', PERMISSIONS.LEGACY_EXPORT_READ),
  route('serverless.grh.report-api.read', 'serverless', 'GET', '/reports', PERMISSIONS.GRH_REPORT_READ),
  route('serverless.report-delivery.send', 'serverless', 'POST', '/email-report', PERMISSIONS.REPORT_DELIVERY_SEND, INTERNAL_CRON),
  route('serverless.whatsapp-alert.send', 'serverless', 'POST', '/whatsapp-alert', PERMISSIONS.SERVERLESS_WHATSAPP_ALERT_SEND, INTERNAL_CRON),
  route('serverless.whatsapp-diagnostic.execute', 'serverless', 'POST', '/whatsapp-test', PERMISSIONS.WHATSAPP_DIAGNOSTIC_EXECUTE),
  route('serverless.cron-report.execute', 'serverless', 'GET', '/cron-daily-report', INTERNAL_ONLY, INTERNAL_CRON),

  // Express authenticated session routes.
  route('express.auth.me.read', 'express', 'GET', '/auth/me', PERMISSIONS.SESSION_READ),
  route('express.auth.refresh', 'express', 'POST', '/auth/refresh', PERMISSIONS.SESSION_REFRESH),

  // Express tenantless surfaces remain authenticated and retired. The optional
  // final segment covers the only current nested call (/archivos/upload); deeper
  // or newly added paths fail closed until explicitly registered.
  route('express.retired.contratos.get', 'express', 'GET', '/contratos/:operation?', PERMISSIONS.RETIRED_TENANTLESS_ACCESS),
  route('express.retired.contratos.post', 'express', 'POST', '/contratos/:operation?', PERMISSIONS.RETIRED_TENANTLESS_ACCESS),
  route('express.retired.contratos.put', 'express', 'PUT', '/contratos/:operation?', PERMISSIONS.RETIRED_TENANTLESS_ACCESS),
  route('express.retired.contratos.patch', 'express', 'PATCH', '/contratos/:operation?', PERMISSIONS.RETIRED_TENANTLESS_ACCESS),
  route('express.retired.contratos.delete', 'express', 'DELETE', '/contratos/:operation?', PERMISSIONS.RETIRED_TENANTLESS_ACCESS),
  route('express.retired.empleados.get', 'express', 'GET', '/empleados/:operation?', PERMISSIONS.RETIRED_TENANTLESS_ACCESS),
  route('express.retired.empleados.post', 'express', 'POST', '/empleados/:operation?', PERMISSIONS.RETIRED_TENANTLESS_ACCESS),
  route('express.retired.empleados.put', 'express', 'PUT', '/empleados/:operation?', PERMISSIONS.RETIRED_TENANTLESS_ACCESS),
  route('express.retired.empleados.patch', 'express', 'PATCH', '/empleados/:operation?', PERMISSIONS.RETIRED_TENANTLESS_ACCESS),
  route('express.retired.empleados.delete', 'express', 'DELETE', '/empleados/:operation?', PERMISSIONS.RETIRED_TENANTLESS_ACCESS),
  route('express.retired.reclamos.get', 'express', 'GET', '/reclamos/:operation?', PERMISSIONS.RETIRED_TENANTLESS_ACCESS),
  route('express.retired.reclamos.post', 'express', 'POST', '/reclamos/:operation?', PERMISSIONS.RETIRED_TENANTLESS_ACCESS),
  route('express.retired.reclamos.put', 'express', 'PUT', '/reclamos/:operation?', PERMISSIONS.RETIRED_TENANTLESS_ACCESS),
  route('express.retired.reclamos.patch', 'express', 'PATCH', '/reclamos/:operation?', PERMISSIONS.RETIRED_TENANTLESS_ACCESS),
  route('express.retired.reclamos.delete', 'express', 'DELETE', '/reclamos/:operation?', PERMISSIONS.RETIRED_TENANTLESS_ACCESS),
  route('express.retired.archivos.get', 'express', 'GET', '/archivos/:operation?', PERMISSIONS.RETIRED_TENANTLESS_ACCESS),
  route('express.retired.archivos.post', 'express', 'POST', '/archivos/:operation?', PERMISSIONS.RETIRED_TENANTLESS_ACCESS),
  route('express.retired.archivos.put', 'express', 'PUT', '/archivos/:operation?', PERMISSIONS.RETIRED_TENANTLESS_ACCESS),
  route('express.retired.archivos.patch', 'express', 'PATCH', '/archivos/:operation?', PERMISSIONS.RETIRED_TENANTLESS_ACCESS),
  route('express.retired.archivos.delete', 'express', 'DELETE', '/archivos/:operation?', PERMISSIONS.RETIRED_TENANTLESS_ACCESS),

  // Express legacy connectors and notifications.
  route('express.legacy-data.metrics.read', 'express', 'GET', '/data/metrics', PERMISSIONS.LEGACY_DATA_READ),
  route('express.legacy-data.secretarias.read', 'express', 'GET', '/data/secretarias', PERMISSIONS.LEGACY_DATA_READ),
  route('express.legacy-data.empleados-stats.read', 'express', 'GET', '/data/empleados/stats', PERMISSIONS.LEGACY_DATA_READ),
  route('express.legacy-data.alertas.read', 'express', 'GET', '/data/alertas', PERMISSIONS.LEGACY_DATA_READ),
  route('express.legacy-data.import', 'express', 'POST', '/data/import', PERMISSIONS.LEGACY_DATA_IMPORT),
  route('express.legacy-data.status.read', 'express', 'GET', '/data/db-status', PERMISSIONS.LEGACY_DATA_STATUS_READ),
  route('express.notification.send', 'express', 'POST', '/notifications/send', PERMISSIONS.LEGACY_NOTIFICATION_SEND),
  route('express.notification.weekly-report', 'express', 'POST', '/notifications/weekly-report', PERMISSIONS.LEGACY_NOTIFICATION_SEND),
  route('express.notification.status.read', 'express', 'GET', '/notifications/status', PERMISSIONS.LEGACY_NOTIFICATION_STATUS_READ),
  route('express.whatsapp.alert.send', 'express', 'POST', '/whatsapp/send-alert', PERMISSIONS.EXPRESS_WHATSAPP_ADMIN_SEND),
  route('express.whatsapp.status.read', 'express', 'GET', '/whatsapp/status', PERMISSIONS.EXPRESS_WHATSAPP_ADMIN_READ),

  // Express platform administration.
  route('express.admin.stats.read', 'express', 'GET', '/admin/stats', PERMISSIONS.PLATFORM_STATS_READ),
  route('express.admin.tenants.read', 'express', 'GET', '/admin/tenants', PERMISSIONS.PLATFORM_TENANT_READ),
  route('express.admin.tenants.create', 'express', 'POST', '/admin/tenants', PERMISSIONS.PLATFORM_TENANT_CREATE),
  route('express.admin.tenants.update', 'express', 'PUT', '/admin/tenants/:id', PERMISSIONS.PLATFORM_TENANT_UPDATE),
  route('express.admin.tenants.status', 'express', 'PATCH', '/admin/tenants/:id/status', PERMISSIONS.PLATFORM_TENANT_STATUS_UPDATE),
  route('express.admin.tenants.modules', 'express', 'PUT', '/admin/tenants/:id/modules', PERMISSIONS.PLATFORM_TENANT_MODULES_UPDATE),
  route('express.admin.users.read', 'express', 'GET', '/admin/users', PERMISSIONS.PLATFORM_USER_READ),
  route('express.admin.users.create', 'express', 'POST', '/admin/users', PERMISSIONS.PLATFORM_USER_CREATE),
  route('express.admin.audit.read', 'express', 'GET', '/admin/audit', PERMISSIONS.PLATFORM_AUDIT_READ),
]);

const KNOWN_RUNTIMES = new Set(Object.values(RUNTIMES));
const KNOWN_RESOURCES = new Set(Object.values(RESOURCES));
const KNOWN_ACTIONS = new Set(Object.values(ACTIONS));
const KNOWN_PERMISSIONS = new Set(Object.values(PERMISSIONS));

function isKnownPermission(permission) {
  return typeof permission === 'string' && KNOWN_PERMISSIONS.has(permission);
}

function permissionFor(resource, action) {
  if (!KNOWN_RESOURCES.has(resource) || !KNOWN_ACTIONS.has(action)) return null;
  const permission = permissionId(resource, action);
  return isKnownPermission(permission) ? permission : null;
}

function getAllowedRoles(permission) {
  if (!isKnownPermission(permission)) return [];
  return [...PERMISSION_GRANTS[permission]];
}

function hasPermission(role, permission) {
  return isKnownRole(role) && isKnownPermission(permission) &&
    PERMISSION_GRANTS[permission].includes(role);
}

function hasResourceAction(role, resource, action) {
  const permission = permissionFor(resource, action);
  return permission !== null && hasPermission(role, permission);
}

function getPermissionsForRole(role) {
  if (!isKnownRole(role)) return [];
  return Object.values(PERMISSIONS).filter(permission => hasPermission(role, permission));
}

function normalizePath(pathname) {
  if (typeof pathname !== 'string' || pathname.length === 0) return null;
  const delimiter = pathname.search(/[?#]/);
  let path = delimiter === -1 ? pathname : pathname.slice(0, delimiter);
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes('//')) return null;
  if (/(?:^|\/)\.{1,2}(?:\/|$)|%2f|%5c|%2e/i.test(path)) return null;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (path === '/api') return '/';
  if (path.startsWith('/api/')) return path.slice(4);
  return path;
}

function pathMatches(template, actual) {
  const templateSegments = template.split('/').filter(Boolean);
  const actualSegments = actual.split('/').filter(Boolean);
  const optionalLast = templateSegments.at(-1)?.startsWith(':') && templateSegments.at(-1)?.endsWith('?');
  const minimumLength = optionalLast ? templateSegments.length - 1 : templateSegments.length;
  if (actualSegments.length < minimumLength || actualSegments.length > templateSegments.length) return false;

  for (let index = 0; index < actualSegments.length; index += 1) {
    const expected = templateSegments[index];
    if (expected.startsWith(':')) {
      if (!actualSegments[index]) return false;
      continue;
    }
    if (expected !== actualSegments[index]) return false;
  }
  return true;
}

function resolveProtectedRoute(runtime, method, pathname) {
  if (!KNOWN_RUNTIMES.has(runtime) || typeof method !== 'string') return null;
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = normalizePath(pathname);
  if (!normalizedPath) return null;
  return PROTECTED_ROUTES.find(candidate =>
    candidate.runtime === runtime &&
    candidate.method === normalizedMethod &&
    pathMatches(candidate.path, normalizedPath)
  ) || null;
}

function resolveSessionExchangeRoute(runtime, method, pathname) {
  if (!KNOWN_RUNTIMES.has(runtime) || typeof method !== 'string') return null;
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = normalizePath(pathname);
  if (!normalizedPath) return null;
  return SESSION_EXCHANGE_ROUTES.find(candidate =>
    candidate.runtime === runtime &&
    candidate.method === normalizedMethod &&
    candidate.path === normalizedPath
  ) || null;
}

function authorizeRoute(role, runtime, method, pathname) {
  const routePolicy = resolveProtectedRoute(runtime, method, pathname);
  return routePolicy !== null && routePolicy.permission !== null &&
    hasPermission(role, routePolicy.permission);
}

function isInternalRouteAllowed(runtime, method, pathname, secretName) {
  const routePolicy = resolveProtectedRoute(runtime, method, pathname);
  return routePolicy !== null && typeof secretName === 'string' &&
    routePolicy.internalSecrets.includes(secretName);
}

function validatePolicy() {
  if (new Set(ALL_CURRENT_ROLES).size !== ALL_CURRENT_ROLES.length ||
      ALL_CURRENT_ROLES.some(role => !isKnownRole(role))) {
    throw new Error('Route policy contains an invalid role registry');
  }

  const permissionValues = Object.values(PERMISSIONS);
  if (new Set(permissionValues).size !== permissionValues.length) {
    throw new Error('Route policy contains duplicate permissions');
  }
  if (Object.keys(PERMISSION_GRANTS).length !== permissionValues.length) {
    throw new Error('Every permission must have one explicit grant list');
  }
  for (const permission of permissionValues) {
    const roles = PERMISSION_GRANTS[permission];
    if (!Array.isArray(roles) || new Set(roles).size !== roles.length || roles.some(role => !isKnownRole(role))) {
      throw new Error(`Invalid grants for permission ${permission}`);
    }
  }

  const routeIds = new Set();
  const routeSignatures = new Set();
  for (const currentRoute of PROTECTED_ROUTES) {
    if (routeIds.has(currentRoute.id)) throw new Error(`Duplicate route id ${currentRoute.id}`);
    routeIds.add(currentRoute.id);
    if (!KNOWN_RUNTIMES.has(currentRoute.runtime) || !/^(GET|POST|PUT|PATCH|DELETE)$/.test(currentRoute.method)) {
      throw new Error(`Invalid route runtime or method for ${currentRoute.id}`);
    }
    if (!currentRoute.path.startsWith('/') || currentRoute.path.includes('*')) {
      throw new Error(`Wildcard or invalid path in ${currentRoute.id}`);
    }
    if (currentRoute.permission !== null && !isKnownPermission(currentRoute.permission)) {
      throw new Error(`Unknown permission in ${currentRoute.id}`);
    }
    if (currentRoute.permission === null && currentRoute.internalSecrets.length === 0) {
      throw new Error(`Route ${currentRoute.id} has no authorization mechanism`);
    }
    if (currentRoute.internalSecrets.some(secretName => secretName !== 'CRON_SECRET')) {
      throw new Error(`Unknown internal secret in ${currentRoute.id}`);
    }
    const signature = `${currentRoute.runtime}:${currentRoute.method}:${currentRoute.path}`;
    if (routeSignatures.has(signature)) throw new Error(`Duplicate route policy ${signature}`);
    routeSignatures.add(signature);
  }


  for (const exchangeRoute of SESSION_EXCHANGE_ROUTES) {
    if (routeIds.has(exchangeRoute.id)) throw new Error(`Duplicate route id ${exchangeRoute.id}`);
    routeIds.add(exchangeRoute.id);
    if (exchangeRoute.runtime !== RUNTIMES.SERVERLESS || exchangeRoute.method !== 'POST' ||
        !exchangeRoute.path.startsWith('/auth/') || !['published-profile', 'opaque-link'].includes(exchangeRoute.mode)) {
      throw new Error(`Invalid session exchange route ${exchangeRoute.id}`);
    }
  }
}

validatePolicy();

module.exports = Object.freeze({
  ROUTE_POLICY_VERSION,
  RUNTIMES,
  RESOURCES,
  ACTIONS,
  PERMISSIONS,
  PERMISSION_GRANTS,
  PROTECTED_ROUTES,
  SESSION_EXCHANGE_ROUTES,
  isKnownPermission,
  permissionFor,
  getAllowedRoles,
  getPermissionsForRole,
  hasPermission,
  hasResourceAction,
  resolveProtectedRoute,
  resolveSessionExchangeRoute,
  authorizeRoute,
  isInternalRouteAllowed,
});
