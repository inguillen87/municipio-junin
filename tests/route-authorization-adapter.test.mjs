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
const publishedDemoPolicy = (await import('../shared/published-demo-policy.cjs')).default;

const originalFindUnique = prisma.user.findUnique;
const users = new Map();

prisma.user.findUnique = async ({ where }) => {
  if (where.id) return users.get(where.id) || null;
  if (where.email) return [...users.values()].find(user => user.email === where.email) || null;
  return null;
};

after(async () => {
  prisma.user.findUnique = originalFindUnique;
  await prisma.$disconnect();
});

function setUser(id, role, tenantId = 'tenant-current', {
  email = `${id}@example.test`,
  tenantSlug = tenantId,
} = {}) {
  users.set(id, {
    id,
    email,
    name: `Usuario ${id}`,
    role,
    tenantId,
    active: true,
    tenant: tenantId ? {
      id: tenantId,
      slug: tenantSlug,
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

function publishedRequestFor(profile, method, url, tenantId = 'tenant-current') {
  const token = jwt.sign({
    id: `published-evaluation:${profile.profileId}`,
    profileId: profile.profileId,
    role: profile.role,
    tenantId,
    authMode: 'published-evaluation',
  }, process.env.JWT_SECRET, { expiresIn: '5m' });
  return { method, url, headers: { authorization: `Bearer ${token}` } };
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

test('Serverless published identities are constrained by identity, role, tenant and exact route', async () => {
  const aggregateRoutes = [
    ['GET', '/api/grh-executive'],
    ['GET', '/api/grh-quality'],
    ['GET', '/api/grh-close'],
    ['GET', '/api/grh-decision-brief'],
    ['GET', '/api/grh-action-ledger'],
    ['GET', '/api/grh-organization-analytics'],
    ['GET', '/api/grh-movement-operations'],
    ['GET', '/api/reports'],
    ['GET', '/api/pdf-report'],
    ['POST', '/api/ai-analyze'],
  ];
  const sensitiveRouteForRole = Object.freeze({
    INTENDENTE: ['POST', '/api/data/reclamos'],
    TENANT_ADMIN: ['POST', '/api/data/import'],
    CONTADOR: ['GET', '/api/export-data'],
    INSPECTOR: ['POST', '/api/data/reclamos'],
    TENANT_USER: ['POST', '/api/data/reclamos'],
    DEMO: ['POST', '/api/data/reclamos'],
  });
  const publishedRouteIsAllowed = (profile, method, url) => {
    const route = routePolicy.resolveProtectedRoute(routePolicy.RUNTIMES.SERVERLESS, method, url);
    return Boolean(
      route &&
      publishedDemoPolicy.PUBLISHED_DEMO_ALLOWED_ROUTE_IDS.includes(route.id) &&
      routePolicy.hasPermission(profile.role, route.permission),
    );
  };

  for (const [index, profile] of publishedDemoPolicy.PUBLISHED_DEMO_PROFILES.entries()) {
    const id = `published-${index}`;
    setUser(id, profile.role, 'tenant-current', {
      email: profile.email,
      tenantSlug: profile.tenantSlug,
    });

    const meResponse = responseRecorder();
    const me = await requireAuth(publishedRequestFor(profile, 'GET', '/api/auth/me'), meResponse);
    assert.equal(me?.email, profile.email, `${profile.email} auth/me`);

    for (const [method, url] of aggregateRoutes) {
      const response = responseRecorder();
      const user = await requireAuth(publishedRequestFor(profile, method, url), response);
      if (publishedRouteIsAllowed(profile, method, url)) {
        assert.equal(user?.email, profile.email, `${profile.email} aggregate ${method} ${url}`);
      } else {
        assert.equal(user, null, `${profile.email} must not inherit aggregate ${method} ${url}`);
        assert.equal(response.statusCode, 403);
        assert.equal(response.payload.code, 'PUBLISHED_DEMO_ROUTE_DENIED');
      }
    }

    const roleGrantResponse = responseRecorder();
    const roleGrant = await requireRole(
      publishedRequestFor(profile, 'GET', '/api/grh-executive'),
      roleGrantResponse,
      ['INTENDENTE'],
    );
    if (publishedRouteIsAllowed(profile, 'GET', '/api/grh-executive')) {
      assert.equal(roleGrant?.email, profile.email, `${profile.email} exact-route role grant`);
    } else {
      assert.equal(roleGrant, null, `${profile.email} must not bypass the executive route ceiling`);
      assert.equal(roleGrantResponse.statusCode, 403);
    }

    const capabilityGrantResponse = responseRecorder();
    const capabilityGrant = await requireCapability(
      publishedRequestFor(profile, 'GET', '/api/grh-quality'),
      capabilityGrantResponse,
      routePolicy.RESOURCES.GRH_CONTRACT,
      routePolicy.ACTIONS.READ,
    );
    if (publishedRouteIsAllowed(profile, 'GET', '/api/grh-quality')) {
      assert.equal(capabilityGrant?.email, profile.email, `${profile.email} exact-route capability grant`);
    } else {
      assert.equal(capabilityGrant, null, `${profile.email} must not bypass the quality route ceiling`);
      assert.equal(capabilityGrantResponse.statusCode, 403);
    }

    const directoryResponse = responseRecorder();
    const directory = await requireAuth(
      publishedRequestFor(profile, 'GET', '/api/grh-directory?limit=20'),
      directoryResponse,
    );
    assert.equal(directory, null, `${profile.email} must not gain nominal GRH directory access`);
    assert.equal(directoryResponse.statusCode, 403);

    const [sensitiveMethod, sensitiveUrl] = sensitiveRouteForRole[profile.role];
    const sensitiveResponse = responseRecorder();
    const sensitive = await requireAuth(
      publishedRequestFor(profile, sensitiveMethod, sensitiveUrl),
      sensitiveResponse,
    );
    assert.equal(sensitive, null, `${profile.email} ${sensitiveMethod} ${sensitiveUrl}`);
    assert.equal(sensitiveResponse.payload.code, 'PUBLISHED_DEMO_ROUTE_DENIED');
  }

  setUser('published-drift', 'SUPER_ADMIN', 'tenant-current', {
    email: 'admin@junin.gov.ar',
    tenantSlug: 'junin',
  });
  const driftResponse = responseRecorder();
  assert.equal(
    await requireAuth(requestFor('published-drift', 'GET', '/api/auth/me'), driftResponse),
    null,
  );
  assert.equal(driftResponse.payload.code, 'PUBLISHED_DEMO_ROUTE_DENIED');

  const stalePublicTenant = publishedDemoPolicy.resolvePublishedDemoProfile('intendente');
  const stalePublicResponse = responseRecorder();
  assert.equal(
    await requireAuth(
      publishedRequestFor(stalePublicTenant, 'GET', '/api/auth/me', 'other-tenant'),
      stalePublicResponse,
    ),
    null,
  );
  assert.equal(stalePublicResponse.statusCode, 401);

  setUser('ordinary-tenant-admin', 'TENANT_ADMIN');
  const ordinaryResponse = responseRecorder();
  const ordinary = await requireAuth(
    requestFor('ordinary-tenant-admin', 'POST', '/api/data/import'),
    ordinaryResponse,
  );
  assert.equal(ordinary?.email, 'ordinary-tenant-admin@example.test');
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
