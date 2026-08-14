import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import esmPolicy from '../shared/route-policy.cjs';

const require = createRequire(import.meta.url);
const cjsPolicy = require('../shared/route-policy.cjs');
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED_SERVERLESS = [
  'GET /auth/me',
  'GET /grh-data',
  'GET /grh-directory',
  'GET /grh-directory-access',
  'GET /grh-administration-comparison',
  'GET /grh-management-timeline',
  'GET /grh-garden-network',
  'GET /grh-absence-insights',
  'GET /grh-personas-linkage-readiness',
  'GET /grh-domain-catalog',
  'GET /grh-employment-review',
  'GET /grh-employment-actions',
  'GET /grh-organization-analytics',
  'GET /grh-movement-operations',
  'GET /grh-workforce-finance',
  'GET /grh-payroll-run-control',
  'GET /grh-fixed-concept-control',
  'GET /municipal-territory',
  'GET /grh-executive',
  'GET /grh-quality',
  'GET /grh-import-quality-history',
  'GET /grh-close',
  'GET /grh-decision-brief',
  'GET /grh-action-ledger',
  'POST /grh-action-ledger',
  'PATCH /grh-action-ledger',
  'POST /ai-analyze',
  'GET /pdf-report',
  'POST /ai-proxy',
  'GET /intelligence',
  'POST /intelligence',
  'GET /audit',
  'DELETE /audit',
  'GET /data/dashboard',
  'GET /data/empleados',
  'POST /data/empleados',
  'PUT /data/empleados',
  'DELETE /data/empleados',
  'GET /data/pagos',
  'POST /data/pagos',
  'PUT /data/pagos',
  'DELETE /data/pagos',
  'GET /data/reclamos',
  'POST /data/reclamos',
  'PUT /data/reclamos',
  'DELETE /data/reclamos',
  'POST /data/import',
  'POST /data/seed',
  'POST /upload-handler',
  'POST /google-sheets',
  'POST /external-connector',
  'GET /export-data',
  'GET /reports',
  'POST /email-report',
  'POST /whatsapp-alert',
  'POST /whatsapp-test',
  'GET /cron-daily-report',
];

const EXPECTED_EXPRESS = [
  'GET /auth/me',
  'POST /auth/refresh',
  ...['contratos', 'empleados', 'reclamos', 'archivos'].flatMap(surface =>
    ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(method => `${method} /${surface}/:operation?`)
  ),
  'GET /data/metrics',
  'GET /data/secretarias',
  'GET /data/empleados/stats',
  'GET /data/alertas',
  'POST /data/import',
  'GET /data/db-status',
  'POST /notifications/send',
  'POST /notifications/weekly-report',
  'GET /notifications/status',
  'POST /whatsapp/send-alert',
  'GET /whatsapp/status',
  'GET /admin/stats',
  'GET /admin/tenants',
  'POST /admin/tenants',
  'PUT /admin/tenants/:id',
  'PATCH /admin/tenants/:id/status',
  'PUT /admin/tenants/:id/modules',
  'GET /admin/users',
  'POST /admin/users',
  'GET /admin/audit',
];

function signatures(runtime) {
  return esmPolicy.PROTECTED_ROUTES
    .filter(route => route.runtime === runtime)
    .map(route => `${route.method} ${route.path}`)
    .sort();
}

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await javascriptFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(entryPath);
  }
  return files;
}

test('Serverless ESM and Express CJS consume one immutable route policy', () => {
  assert.strictEqual(esmPolicy, cjsPolicy);
  assert.match(esmPolicy.ROUTE_POLICY_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  assert.equal(Object.isFrozen(esmPolicy.PROTECTED_ROUTES), true);
  assert.equal(Object.isFrozen(esmPolicy.PERMISSION_GRANTS), true);
  for (const route of esmPolicy.PROTECTED_ROUTES) {
    assert.equal(Object.isFrozen(route), true);
    assert.equal(Object.isFrozen(route.internalSecrets), true);
  }
  for (const grants of Object.values(esmPolicy.PERMISSION_GRANTS)) {
    assert.equal(Object.isFrozen(grants), true);
  }
});

test('the current protected route inventory is exact for both runtimes', () => {
  assert.deepEqual(signatures(esmPolicy.RUNTIMES.SERVERLESS), [...EXPECTED_SERVERLESS].sort());
  assert.deepEqual(signatures(esmPolicy.RUNTIMES.EXPRESS), [...EXPECTED_EXPRESS].sort());
  assert.equal(esmPolicy.PROTECTED_ROUTES.length, EXPECTED_SERVERLESS.length + EXPECTED_EXPRESS.length);

  const routeIds = esmPolicy.PROTECTED_ROUTES.map(route => route.id);
  assert.equal(new Set(routeIds).size, routeIds.length);
  assert.ok(esmPolicy.PROTECTED_ROUTES.every(route => !route.path.includes('*')));
  assert.ok(Object.values(esmPolicy.PERMISSION_GRANTS).flat().every(role => role !== '*'));
});

test('every current guarded source surface is owned by the route manifest', async () => {
  const apiRoot = path.join(repositoryRoot, 'api');
  const guardedServerless = [];
  for (const file of await javascriptFiles(apiRoot)) {
    if (file.includes(`${path.sep}api${path.sep}lib${path.sep}`)) continue;
    const source = await readFile(file, 'utf8');
    if (/\b(?:requireRole|requireRoleOrInternal|requireAuth|requireCapability|requireCapabilityImpl|requireRoleImpl|isTrustedInternalRequest|authorizeGrhDirectoryRequest)\s*\(/.test(source)) {
      guardedServerless.push(path.relative(apiRoot, file).replaceAll('\\', '/'));
    }
  }
  assert.deepEqual(guardedServerless.sort(), [
    'ai-analyze.js',
    'ai-proxy.js',
    'audit.js',
    'auth/me.js',
    'cron-daily-report.js',
    'data/dashboard.js',
    'data/empleados.js',
    'data/import.js',
    'data/pagos.js',
    'data/reclamos.js',
    'data/seed.js',
    'email-report.js',
    'export-data.js',
    'external-connector.js',
    'google-sheets.js',
    'grh-data.js',
    'grh-directory.js',
    'grh-directory-access.js',
    'grh-administration-comparison.js',
    'grh-management-timeline.js',
    'grh-garden-network.js',
    'grh-absence-insights.js',
    'grh-personas-linkage-readiness.js',
    'grh-domain-catalog.js',
    'grh-employment-review.js',
    'grh-employment-actions.js',
    'grh-organization-analytics.js',
    'grh-movement-operations.js',
    'grh-workforce-finance.js',
    'grh-payroll-run-control.js',
    'grh-fixed-concept-control.js',
    'grh-close.js',
    'grh-decision-brief.js',
    'grh-action-ledger.js',
    'grh-executive.js',
    'grh-import-quality-history.js',
    'grh-quality.js',
    'intelligence.js',
    'municipal-territory.js',
    'pdf-report.js',
    'reports.js',
    'upload-handler.js',
    'whatsapp-alert.js',
    'whatsapp-test.js',
  ].sort());

  const expressRoutesRoot = path.join(repositoryRoot, 'backend', 'routes');
  const guardedExpress = [];
  for (const file of await javascriptFiles(expressRoutesRoot)) {
    const source = await readFile(file, 'utf8');
    if (/\b(?:authenticate|isSuperAdmin|isTenantAdmin|requireRole)\b/.test(source)) {
      guardedExpress.push(path.relative(expressRoutesRoot, file).replaceAll('\\', '/'));
    }
  }
  assert.deepEqual(guardedExpress.sort(), [
    'admin.js',
    'auth.js',
    'data-connector.js',
    'notifications.js',
    'retired-tenantless.js',
    'whatsapp.js',
  ].sort());
});

test('resource/action grants preserve the current operational boundaries', () => {
  const { ACTIONS: action, RESOURCES: resource } = esmPolicy;

  assert.equal(esmPolicy.hasResourceAction('INTENDENTE', resource.GRH_CONTRACT, action.READ), true);
  assert.equal(esmPolicy.hasResourceAction('INTENDENTE', resource.GRH_DIRECTORY, action.READ), true);
  assert.equal(esmPolicy.hasResourceAction('TENANT_USER', resource.GRH_DIRECTORY, action.READ), false);
  assert.equal(esmPolicy.hasResourceAction('INTENDENTE', resource.GRH_ORGANIZATION_ANALYTICS, action.READ), true);
  assert.equal(esmPolicy.hasResourceAction('CONTADOR', resource.GRH_ORGANIZATION_ANALYTICS, action.READ), true);
  assert.equal(esmPolicy.hasResourceAction('TENANT_USER', resource.GRH_ORGANIZATION_ANALYTICS, action.READ), false);
  for (const role of ['TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']) {
    assert.equal(esmPolicy.hasResourceAction(role, resource.GRH_ACTION_LEDGER, action.READ), true, role);
    assert.equal(esmPolicy.hasResourceAction(role, resource.GRH_ACTION_LEDGER, action.UPDATE), true, role);
  }
  assert.equal(esmPolicy.hasResourceAction('INTENDENTE', resource.GRH_ACTION_LEDGER, action.CREATE), true);
  for (const role of ['SUPER_ADMIN', 'TENANT_ADMIN', 'CONTADOR', 'TENANT_USER', 'INSPECTOR', 'DEMO']) {
    assert.equal(esmPolicy.hasResourceAction(role, resource.GRH_ACTION_LEDGER, action.CREATE), false, role);
  }
  assert.equal(esmPolicy.hasResourceAction('SUPER_ADMIN', resource.GRH_ACTION_LEDGER, action.READ), false);
  for (const role of ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']) {
    assert.equal(esmPolicy.hasResourceAction(role, resource.GRH_WORKFORCE_FINANCE, action.READ), true, role);
  }
  for (const role of ['TENANT_USER', 'INSPECTOR', 'DEMO']) {
    assert.equal(esmPolicy.hasResourceAction(role, resource.GRH_WORKFORCE_FINANCE, action.READ), false, role);
  }
  for (const role of ['SUPER_ADMIN', 'INTENDENTE', 'TENANT_ADMIN', 'TENANT_USER', 'CONTADOR', 'INSPECTOR', 'DEMO']) {
    assert.equal(esmPolicy.hasResourceAction(role, resource.MUNICIPAL_TERRITORY, action.READ), true, role);
  }
  assert.equal(esmPolicy.hasResourceAction('CONTADOR', resource.GRH_ANALYSIS, action.EXECUTE), true);
  assert.equal(esmPolicy.hasResourceAction('INTENDENTE', resource.GRH_REPORT, action.READ), true);
  assert.equal(esmPolicy.hasResourceAction('CONTADOR', resource.GRH_REPORT, action.READ), true);
  assert.equal(esmPolicy.hasResourceAction('TENANT_ADMIN', resource.LEGACY_IMPORT, action.IMPORT), true);
  assert.equal(esmPolicy.hasResourceAction('SUPER_ADMIN', resource.PLATFORM_TENANT, action.CREATE), true);
  assert.equal(esmPolicy.hasResourceAction('INSPECTOR', resource.CLAIM_RECORD, action.UPDATE), true);

  assert.equal(esmPolicy.hasResourceAction('INTENDENTE', resource.LEGACY_IMPORT, action.IMPORT), false);
  assert.equal(esmPolicy.hasResourceAction('TENANT_USER', resource.GRH_CONTRACT, action.READ), false);
  assert.equal(esmPolicy.hasResourceAction('CONTADOR', resource.EMPLOYEE_RECORD, action.DELETE), false);
  assert.equal(esmPolicy.hasResourceAction('SUPER_ADMIN', resource.EXPRESS_WHATSAPP_ADMIN, action.SEND), false);
  assert.equal(esmPolicy.hasResourceAction('TENANT_ADMIN', resource.PLATFORM_TENANT, action.CREATE), false);
  assert.equal(esmPolicy.hasResourceAction('TESORERIA', resource.GRH_CONTRACT, action.READ), false);
  assert.equal(esmPolicy.hasResourceAction('TESORERIA', resource.GRH_REPORT, action.READ), false);
  assert.equal(esmPolicy.hasResourceAction('SUPER_ADMIN', 'future.resource', action.READ), false);
  assert.equal(esmPolicy.hasResourceAction('SUPER_ADMIN', resource.GRH_CONTRACT, 'admin'), false);
  assert.equal(esmPolicy.hasResourceAction('SUPER_ADMIN', resource.MUNICIPAL_TERRITORY, action.UPDATE), false);
});

test('route authorization is exact by runtime, method and path', () => {
  const { RUNTIMES: runtime } = esmPolicy;

  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-data?artifact=semantic'), true);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-directory?q=secretaria'), true);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-directory-access'), true);
  assert.equal(esmPolicy.authorizeRoute('TENANT_USER', runtime.SERVERLESS, 'GET', '/api/grh-directory'), false);
  assert.equal(esmPolicy.authorizeRoute('TENANT_USER', runtime.SERVERLESS, 'GET', '/api/grh-directory-access'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'POST', '/api/grh-directory'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'POST', '/api/grh-directory-access'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-action-ledger'), true);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'POST', '/api/grh-action-ledger'), true);
  assert.equal(esmPolicy.authorizeRoute('CONTADOR', runtime.SERVERLESS, 'POST', '/api/grh-action-ledger'), false);
  assert.equal(esmPolicy.authorizeRoute('CONTADOR', runtime.SERVERLESS, 'PATCH', '/api/grh-action-ledger'), true);
  assert.equal(esmPolicy.authorizeRoute('SUPER_ADMIN', runtime.SERVERLESS, 'GET', '/api/grh-action-ledger'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-domain-catalog'), true);
  assert.equal(esmPolicy.authorizeRoute('CONTADOR', runtime.SERVERLESS, 'GET', '/api/grh-domain-catalog'), true);
  assert.equal(esmPolicy.authorizeRoute('TENANT_USER', runtime.SERVERLESS, 'GET', '/api/grh-domain-catalog'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'POST', '/api/grh-domain-catalog'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-organization-analytics'), true);
  assert.equal(esmPolicy.authorizeRoute('CONTADOR', runtime.SERVERLESS, 'GET', '/api/grh-organization-analytics?period=2026-07'), true);
  assert.equal(esmPolicy.authorizeRoute('TENANT_USER', runtime.SERVERLESS, 'GET', '/api/grh-organization-analytics'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'POST', '/api/grh-organization-analytics'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-organization-analytics/future'), false);
  for (const role of ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']) {
    assert.equal(esmPolicy.authorizeRoute(role, runtime.SERVERLESS, 'GET', '/api/grh-garden-network'), true, role);
  }
  for (const role of ['TENANT_USER', 'INSPECTOR', 'DEMO']) {
    assert.equal(esmPolicy.authorizeRoute(role, runtime.SERVERLESS, 'GET', '/api/grh-garden-network'), false, role);
  }
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'POST', '/api/grh-garden-network'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-garden-network/future'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-movement-operations'), true);
  assert.equal(esmPolicy.authorizeRoute('CONTADOR', runtime.SERVERLESS, 'GET', '/api/grh-movement-operations'), true);
  assert.equal(esmPolicy.authorizeRoute('TENANT_USER', runtime.SERVERLESS, 'GET', '/api/grh-movement-operations'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'POST', '/api/grh-movement-operations'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-movement-operations/future'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-workforce-finance'), true);
  assert.equal(esmPolicy.authorizeRoute('CONTADOR', runtime.SERVERLESS, 'GET', '/api/grh-workforce-finance'), true);
  assert.equal(esmPolicy.authorizeRoute('TENANT_USER', runtime.SERVERLESS, 'GET', '/api/grh-workforce-finance'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'POST', '/api/grh-workforce-finance'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-workforce-finance/future'), false);
  for (const role of ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']) {
    assert.equal(esmPolicy.authorizeRoute(role, runtime.SERVERLESS, 'GET', '/api/grh-payroll-run-control'), true, role);
  }
  for (const role of ['TENANT_USER', 'INSPECTOR', 'DEMO']) {
    assert.equal(esmPolicy.authorizeRoute(role, runtime.SERVERLESS, 'GET', '/api/grh-payroll-run-control'), false, role);
  }
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'POST', '/api/grh-payroll-run-control'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-payroll-run-control/future'), false);
  for (const role of ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']) {
    assert.equal(esmPolicy.authorizeRoute(role, runtime.SERVERLESS, 'GET', '/api/grh-fixed-concept-control'), true, role);
  }
  for (const role of ['TENANT_USER', 'INSPECTOR', 'DEMO']) {
    assert.equal(esmPolicy.authorizeRoute(role, runtime.SERVERLESS, 'GET', '/api/grh-fixed-concept-control'), false, role);
  }
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'POST', '/api/grh-fixed-concept-control'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-fixed-concept-control/future'), false);
  for (const role of ['SUPER_ADMIN', 'INTENDENTE', 'TENANT_ADMIN', 'TENANT_USER', 'CONTADOR', 'INSPECTOR', 'DEMO']) {
    assert.equal(esmPolicy.authorizeRoute(role, runtime.SERVERLESS, 'GET', '/api/municipal-territory'), true, role);
  }
  assert.equal(esmPolicy.authorizeRoute('DEMO', runtime.SERVERLESS, 'GET', '/api/municipal-territory?refresh=1'), true);
  assert.equal(esmPolicy.authorizeRoute('INSPECTOR', runtime.SERVERLESS, 'POST', '/api/municipal-territory'), false);
  assert.equal(esmPolicy.authorizeRoute('TENANT_USER', runtime.SERVERLESS, 'GET', '/api/municipal-territory/future'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-executive'), true);
  assert.equal(esmPolicy.authorizeRoute('TENANT_USER', runtime.SERVERLESS, 'GET', '/api/grh-executive'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-quality'), true);
  assert.equal(esmPolicy.authorizeRoute('TENANT_USER', runtime.SERVERLESS, 'GET', '/api/grh-quality'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-import-quality-history'), true);
  assert.equal(esmPolicy.authorizeRoute('TENANT_USER', runtime.SERVERLESS, 'GET', '/api/grh-import-quality-history'), false);
  assert.equal(esmPolicy.authorizeRoute('SUPER_ADMIN', runtime.SERVERLESS, 'GET', '/api/grh-employment-actions'), true);
  assert.equal(esmPolicy.authorizeRoute('TENANT_ADMIN', runtime.SERVERLESS, 'GET', '/api/grh-employment-actions'), true);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-employment-actions'), true);
  assert.equal(esmPolicy.authorizeRoute('CONTADOR', runtime.SERVERLESS, 'GET', '/api/grh-employment-actions'), true);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'POST', '/api/grh-employment-actions'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-close'), true);
  assert.equal(esmPolicy.authorizeRoute('CONTADOR', runtime.SERVERLESS, 'GET', '/api/grh-close?period=ignored'), true);
  assert.equal(esmPolicy.authorizeRoute('TENANT_USER', runtime.SERVERLESS, 'GET', '/api/grh-close'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'POST', '/api/grh-close'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-decision-brief'), true);
  assert.equal(esmPolicy.authorizeRoute('CONTADOR', runtime.SERVERLESS, 'GET', '/api/grh-decision-brief?view=current'), true);
  assert.equal(esmPolicy.authorizeRoute('TENANT_USER', runtime.SERVERLESS, 'GET', '/api/grh-decision-brief'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'POST', '/api/grh-decision-brief'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/grh-decision-brief/future'), false);
  assert.equal(esmPolicy.authorizeRoute('INTENDENTE', runtime.SERVERLESS, 'GET', '/api/reports?period=2026-07'), true);
  assert.equal(esmPolicy.authorizeRoute('TESORERIA', runtime.SERVERLESS, 'GET', '/api/reports'), false);
  assert.equal(esmPolicy.authorizeRoute('TENANT_USER', runtime.SERVERLESS, 'GET', '/api/grh-data'), false);
  assert.equal(esmPolicy.authorizeRoute('TENANT_ADMIN', runtime.SERVERLESS, 'POST', '/api/google-sheets'), true);
  assert.equal(esmPolicy.authorizeRoute('TENANT_ADMIN', runtime.SERVERLESS, 'GET', '/api/google-sheets'), false);
  assert.equal(esmPolicy.authorizeRoute('SUPER_ADMIN', runtime.EXPRESS, 'PUT', '/api/admin/tenants/t-1/modules'), true);
  assert.equal(esmPolicy.authorizeRoute('TENANT_ADMIN', runtime.EXPRESS, 'PUT', '/api/admin/tenants/t-1/modules'), false);
  assert.equal(esmPolicy.authorizeRoute('TENANT_ADMIN', runtime.EXPRESS, 'POST', '/api/archivos/upload'), true);
  assert.equal(esmPolicy.authorizeRoute('TENANT_ADMIN', runtime.EXPRESS, 'POST', '/api/archivos/a/b'), false);

  assert.equal(esmPolicy.authorizeRoute('SUPER_ADMIN', runtime.SERVERLESS, 'GET', '/api/future'), false);
  assert.equal(esmPolicy.authorizeRoute('SUPER_ADMIN', 'future-runtime', 'GET', '/api/grh-data'), false);
  assert.equal(esmPolicy.authorizeRoute('SUPER_ADMIN', runtime.SERVERLESS, 'GET', '//host/api/grh-data'), false);
  assert.equal(esmPolicy.authorizeRoute('SUPER_ADMIN', runtime.SERVERLESS, 'GET', '/api//grh-data'), false);
  assert.equal(esmPolicy.authorizeRoute('SUPER_ADMIN', runtime.SERVERLESS, 'GET', '/api/a/../grh-data'), false);
  assert.equal(esmPolicy.authorizeRoute('SUPER_ADMIN', runtime.SERVERLESS, 'GET', '/api/%2e%2e/grh-data'), false);
  assert.equal(esmPolicy.authorizeRoute('SUPER_ADMIN', runtime.SERVERLESS, 'GET', '/api/grh%2fdata'), false);
});

test('internal bearer routes and secret names are explicitly scoped', () => {
  const { RUNTIMES: runtime } = esmPolicy;

  assert.equal(esmPolicy.isInternalRouteAllowed(runtime.SERVERLESS, 'GET', '/api/reports', 'CRON_SECRET'), false);
  assert.equal(esmPolicy.isInternalRouteAllowed(runtime.SERVERLESS, 'POST', '/api/email-report', 'CRON_SECRET'), true);
  assert.equal(esmPolicy.isInternalRouteAllowed(runtime.SERVERLESS, 'POST', '/api/whatsapp-alert', 'CRON_SECRET'), true);
  assert.equal(esmPolicy.isInternalRouteAllowed(runtime.SERVERLESS, 'GET', '/api/cron-daily-report', 'CRON_SECRET'), true);

  assert.equal(esmPolicy.isInternalRouteAllowed(runtime.SERVERLESS, 'GET', '/api/grh-data', 'CRON_SECRET'), false);
  assert.equal(esmPolicy.isInternalRouteAllowed(runtime.SERVERLESS, 'GET', '/api/grh-decision-brief', 'CRON_SECRET'), false);
  assert.equal(esmPolicy.isInternalRouteAllowed(runtime.SERVERLESS, 'GET', '/api/reports', 'OTHER_SECRET'), false);
  assert.equal(esmPolicy.isInternalRouteAllowed(runtime.EXPRESS, 'GET', '/api/reports', 'CRON_SECRET'), false);
  assert.equal(esmPolicy.authorizeRoute('SUPER_ADMIN', runtime.SERVERLESS, 'GET', '/api/cron-daily-report'), false);
});

test('permission snapshots cannot mutate the canonical grant matrix', () => {
  const permission = esmPolicy.PERMISSIONS.GRH_CONTRACT_READ;
  const grants = esmPolicy.getAllowedRoles(permission);
  grants.push('TENANT_USER');
  assert.equal(esmPolicy.hasPermission('TENANT_USER', permission), false);

  const permissions = esmPolicy.getPermissionsForRole('TENANT_USER');
  permissions.push(permission);
  assert.equal(esmPolicy.hasPermission('TENANT_USER', permission), false);
  assert.deepEqual(esmPolicy.getAllowedRoles('future:read'), []);
  assert.deepEqual(esmPolicy.getPermissionsForRole('TESORERIA'), []);
  assert.equal(esmPolicy.permissionFor('future', 'read'), null);
});
