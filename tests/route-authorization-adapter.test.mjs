import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'route-policy-jwt-secret-with-sufficient-length';
process.env.CRON_SECRET = 'route-policy-cron-secret-with-sufficient-length';
delete process.env.DATABASE_URL;

const { prisma } = await import('../api/lib/db.js');
const {
  isTrustedInternalRequest,
  requireAuth,
  requireCapability,
  requireRole,
} = await import('../api/lib/auth.js');
const routePolicy = (await import('../shared/route-policy.cjs')).default;

const originalFindUnique = prisma.user.findUnique;
const users = new Map();

prisma.user.findUnique = async ({ where }) => users.get(where.id) || null;

after(async () => {
  prisma.user.findUnique = originalFindUnique;
  await prisma.$disconnect();
});

function setUser(id, role, tenantId = 'tenant-current') {
  users.set(id, {
    id,
    email: `${id}@example.test`,
    name: `Usuario ${id}`,
    role,
    tenantId,
    active: true,
    tenant: tenantId ? {
      id: tenantId,
      slug: tenantId,
      name: 'Municipio de prueba',
      shortName: 'Prueba',
      status: 'ACTIVE',
    } : null,
  });
}

function tokenFor(id, staleRole = 'SUPER_ADMIN') {
  return jwt.sign({ id, role: staleRole, tenantId: 'stale-tenant' }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function requestFor(id, method, url) {
  return {
    method,
    url,
    headers: { authorization: `Bearer ${tokenFor(id)}` },
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test('Serverless route policy is an authorization ceiling over legacy role lists', async () => {
  setUser('tenant-user-grh', 'TENANT_USER');
  const driftedRouteResponse = responseRecorder();
  const driftedRoute = await requireRole(
    requestFor('tenant-user-grh', 'GET', '/api/grh-data?artifact=semantic'),
    driftedRouteResponse,
    ['TENANT_USER'],
  );
  assert.equal(driftedRoute, null, 'a permissive local role list must not bypass the central GRH permission');
  assert.equal(driftedRouteResponse.statusCode, 403);
  assert.equal(driftedRouteResponse.payload.code, 'ROUTE_PERMISSION_DENIED');

  setUser('current-intendente', 'INTENDENTE');
  const legitimateResponse = responseRecorder();
  const legitimate = await requireRole(
    requestFor('current-intendente', 'GET', '/api/grh-data?artifact=semantic'),
    legitimateResponse,
    ['INTENDENTE'],
  );
  assert.equal(legitimate?.role, 'INTENDENTE');
  assert.equal(legitimate?.tenantId, 'tenant-current');
  assert.equal(legitimateResponse.statusCode, 200);

  const importDriftResponse = responseRecorder();
  const importDrift = await requireRole(
    requestFor('current-intendente', 'POST', '/api/data/import'),
    importDriftResponse,
    ['INTENDENTE'],
  );
  assert.equal(importDrift, null);
  assert.equal(importDriftResponse.payload.code, 'ROUTE_PERMISSION_DENIED');
});

test('unknown routes, resource/actions and methods fail closed after DB-authoritative auth', async () => {
  setUser('current-super-admin', 'SUPER_ADMIN', null);

  for (const [method, url] of [
    ['GET', '/api/future-operation'],
    ['POST', '/api/grh-data'],
    ['GET', '/api//grh-data'],
  ]) {
    const response = responseRecorder();
    const user = await requireAuth(requestFor('current-super-admin', method, url), response);
    assert.equal(user, null, `${method} ${url}`);
    assert.equal(response.statusCode, 403);
    assert.equal(response.payload.code, 'ROUTE_PERMISSION_DENIED');
  }

  setUser('capability-intendente', 'INTENDENTE');
  const knownResponse = responseRecorder();
  const known = await requireCapability(
    { headers: { authorization: `Bearer ${tokenFor('capability-intendente')}` } },
    knownResponse,
    routePolicy.RESOURCES.GRH_CONTRACT,
    routePolicy.ACTIONS.READ,
  );
  assert.equal(known?.role, 'INTENDENTE');

  const unknownResponse = responseRecorder();
  const unknown = await requireCapability(
    { headers: { authorization: `Bearer ${tokenFor('capability-intendente')}` } },
    unknownResponse,
    'future.resource',
    'admin',
  );
  assert.equal(unknown, null);
  assert.equal(unknownResponse.payload.code, 'ROUTE_PERMISSION_DENIED');
});

test('internal bearer access is bound to exact Serverless routes', () => {
  const internal = { authorization: `Bearer ${process.env.CRON_SECRET}` };

  assert.equal(isTrustedInternalRequest({ method: 'GET', url: '/api/reports', headers: internal }), false);
  assert.equal(isTrustedInternalRequest({ method: 'POST', url: '/api/email-report', headers: internal }), true);
  assert.equal(isTrustedInternalRequest({ method: 'GET', url: '/api/cron-daily-report', headers: internal }), true);

  assert.equal(isTrustedInternalRequest({ method: 'GET', url: '/api/grh-data', headers: internal }), false);
  assert.equal(isTrustedInternalRequest({ method: 'POST', url: '/api/reports', headers: internal }), false);
  assert.equal(isTrustedInternalRequest({ method: 'GET', url: '/api/future', headers: internal }), false);
});
