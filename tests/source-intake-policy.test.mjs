import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import publishedDemoPolicy from '../shared/published-demo-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';
import routePolicy from '../shared/route-policy.cjs';
import { createGoogleSheetsHandler, parseCSVText } from '../api/google-sheets.js';
import { createLegacyUploadRetirementHandler } from '../api/upload-handler.js';

const root = path.resolve(import.meta.dirname, '..');
const READ_ROUTE = 'serverless.municipal.source-intake.read';
const CREATE_ROUTE = 'serverless.municipal.source-intake.create';

test('source intake has exact GET/POST permissions, routes, and deployment contract', () => {
  assert.equal(routePolicy.ROUTE_POLICY_VERSION, '2026-08-14.18');
  assert.equal(routePolicy.RESOURCES.MUNICIPAL_SOURCE_INTAKE, 'municipal.source-intake');
  assert.equal(routePolicy.PERMISSIONS.MUNICIPAL_SOURCE_INTAKE_READ, 'municipal.source-intake:read');
  assert.equal(routePolicy.PERMISSIONS.MUNICIPAL_SOURCE_INTAKE_CREATE, 'municipal.source-intake:create');
  assert.deepEqual(routePolicy.getAllowedRoles(routePolicy.PERMISSIONS.MUNICIPAL_SOURCE_INTAKE_READ),
    ['SUPER_ADMIN', 'TENANT_ADMIN']);
  assert.deepEqual(routePolicy.getAllowedRoles(routePolicy.PERMISSIONS.MUNICIPAL_SOURCE_INTAKE_CREATE),
    ['SUPER_ADMIN', 'TENANT_ADMIN']);
  assert.deepEqual(
    routePolicy.PROTECTED_ROUTES.filter(route => [READ_ROUTE, CREATE_ROUTE].includes(route.id)),
    [
      {
        id: READ_ROUTE,
        runtime: 'serverless',
        method: 'GET',
        path: '/source-intake',
        permission: 'municipal.source-intake:read',
        internalSecrets: [],
      },
      {
        id: CREATE_ROUTE,
        runtime: 'serverless',
        method: 'POST',
        path: '/source-intake',
        permission: 'municipal.source-intake:create',
        internalSecrets: [],
      },
    ],
  );
  assert.equal(releaseTruthContract.API_CONTRACTS['/api/source-intake'], 'municipal-source-intake-v1');
});

test('published ceiling can inspect intake GET but never admits intake POST', () => {
  assert.equal(publishedDemoPolicy.PUBLISHED_DEMO_POLICY_VERSION, '2026-08-14.18');
  assert.equal(publishedDemoPolicy.PUBLISHED_DEMO_CAPABILITIES.includes('navigation.import'), true);
  assert.equal(publishedDemoPolicy.PUBLISHED_DEMO_ALLOWED_ROUTE_IDS.includes(READ_ROUTE), true);
  assert.equal(publishedDemoPolicy.PUBLISHED_DEMO_ALLOWED_ROUTE_IDS.includes(CREATE_ROUTE), false);
  for (const profile of publishedDemoPolicy.PUBLISHED_DEMO_PROFILES) {
    const readDecision = publishedDemoPolicy.evaluatePublishedDemoRoute({ ...profile, routeId: READ_ROUTE });
    const createDecision = publishedDemoPolicy.evaluatePublishedDemoRoute({ ...profile, routeId: CREATE_ROUTE });
    assert.equal(readDecision.allowed, profile.role === 'TENANT_ADMIN', `${profile.email} ${READ_ROUTE}`);
    assert.equal(createDecision.allowed, false, `${profile.email} ${CREATE_ROUTE}`);
  }
});

test('legacy upload and public-Sheets routes remain explicit authenticated 410s with no write/fetch implementation', () => {
  for (const [relativePath, code] of [
    ['api/upload-handler.js', 'LEGACY_UPLOAD_IMPORT_RETIRED'],
    ['api/google-sheets.js', 'LEGACY_GOOGLE_SHEETS_IMPORT_RETIRED'],
  ]) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    assert.match(source, new RegExp(code));
    assert.match(source, /replacement:\s*['"]\/api\/source-intake['"]/);
    assert.match(source, /requireRoleImpl\(req, res, IMPORT_ROLES\)/);
    assert.match(source, /requireDatasetTenantImpl\(res, caller, 'LEGACY_ANALYTICS_TENANT_ID'\)/);
    assert.doesNotMatch(source, /INSERT\s+INTO\s+(?:datasets|data_points)|\bfetchImpl\s*\(|\bPoolClass\s*\(/i);
  }
});

test('authenticated legacy import handlers stop at 410 before parsing or persistence', async () => {
  const calls = [];
  const requireRoleImpl = async (_req, _res, roles) => {
    calls.push(['role', [...roles]]);
    return { id: 'admin-1', role: 'TENANT_ADMIN', tenantId: 'tenant-1' };
  };
  const requireDatasetTenantImpl = (_res, caller, environmentKey) => {
    calls.push(['tenant', caller.tenantId, environmentKey]);
    return true;
  };
  const response = () => ({
    statusCode: 200,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  });

  for (const [handler, code] of [
    [createLegacyUploadRetirementHandler({ requireRoleImpl, requireDatasetTenantImpl }), 'LEGACY_UPLOAD_IMPORT_RETIRED'],
    [createGoogleSheetsHandler({ requireRoleImpl, requireDatasetTenantImpl }), 'LEGACY_GOOGLE_SHEETS_IMPORT_RETIRED'],
  ]) {
    const res = response();
    await handler({ method: 'POST', headers: {}, body: undefined }, res);
    assert.equal(res.statusCode, 410);
    assert.deepEqual(res.payload, {
      success: false,
      parsed: false,
      persisted: false,
      code,
      error: res.payload.error,
      replacement: '/api/source-intake',
    });
    assert.equal(typeof res.payload.error, 'string');
    assert.equal(res.headers['cache-control'], 'no-store, private, max-age=0');
    assert.equal(res.headers.vary, 'Authorization');
  }

  assert.deepEqual(calls, [
    ['role', ['SUPER_ADMIN', 'TENANT_ADMIN']],
    ['tenant', 'tenant-1', 'LEGACY_ANALYTICS_TENANT_ID'],
    ['role', ['SUPER_ADMIN', 'TENANT_ADMIN']],
    ['tenant', 'tenant-1', 'LEGACY_ANALYTICS_TENANT_ID'],
  ]);
});

test('the retired Sheets route retains only its bounded pure CSV parser', () => {
  assert.deepEqual(parseCSVText('area,nota\nHacienda,"Control, mensual"'), [
    { area: 'Hacienda', nota: 'Control, mensual' },
  ]);
  assert.throws(() => parseCSVText('__proto__.admin,valor\ntrue,1'), /encabezado no permitido/i);
  assert.throws(() => parseCSVText('area,area\nHacienda,RRHH'), /encabezados duplicados/i);
});
