import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import jwt from 'jsonwebtoken';

import { validateGrhQualityContract } from '../api/lib/grh-quality-contract.js';
import routePolicy from '../shared/route-policy.cjs';

process.env.JWT_SECRET = 'test-only-grh-quality-secret-with-sufficient-length';
process.env.GRH_TENANT_ID = 'tenant-junin-quality-test';
process.env.ALLOW_LOCAL_GRH_ARTIFACTS = 'true';
delete process.env.DATABASE_URL;
delete process.env.GRH_SOURCE_SHA256;

const {
  createGrhQualityHandler,
  default: authoritativeHandler,
} = await import('../api/grh-quality.js');
const { prisma } = await import('../api/lib/db.js');

const authoritativeUsers = new Map();
const originalFindUnique = prisma.user.findUnique;
prisma.user.findUnique = async ({ where }) => authoritativeUsers.get(where.id) || null;

after(async () => {
  prisma.user.findUnique = originalFindUnique;
  await prisma.$disconnect();
});

function responseRecorder() {
  return {
    statusCode: 200,
    payload: undefined,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

function withQuietErrors(callback) {
  const original = console.error;
  console.error = () => {};
  return Promise.resolve()
    .then(callback)
    .finally(() => { console.error = original; });
}

test('the quality GRH endpoint is GET-only, no-store and nosniff', async () => {
  let authenticated = false;
  const handler = createGrhQualityHandler({
    requireCapabilityImpl: async () => { authenticated = true; },
  });
  const response = responseRecorder();

  await handler({ method: 'POST', headers: {}, query: {} }, response);

  assert.equal(response.statusCode, 405);
  assert.equal(response.payload.code, 'METHOD_NOT_ALLOWED');
  assert.equal(response.headers.allow, 'GET');
  assert.equal(response.headers['cache-control'], 'no-store, private, max-age=0');
  assert.equal(response.headers.pragma, 'no-cache');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-municontrol-contract'], 'grh-quality-v1');
  assert.equal(authenticated, false);
});

test('capability and exact GRH tenant gates run before the single artifact read', async () => {
  let tenantChecks = 0;
  let bundleReads = 0;
  const authDenied = createGrhQualityHandler({
    requireCapabilityImpl: async (_req, res, resource, action) => {
      assert.equal(resource, routePolicy.RESOURCES.GRH_CONTRACT);
      assert.equal(action, routePolicy.ACTIONS.READ);
      res.status(401).json({ error: 'No autorizado' });
      return null;
    },
    requireDatasetTenantImpl: () => { tenantChecks += 1; return true; },
    readArtifactBundleImpl: async () => { bundleReads += 1; },
  });
  const authResponse = responseRecorder();
  await authDenied({ method: 'GET', headers: {}, query: {} }, authResponse);
  assert.equal(authResponse.statusCode, 401);
  assert.equal(tenantChecks, 0);
  assert.equal(bundleReads, 0);

  const tenantDenied = createGrhQualityHandler({
    requireCapabilityImpl: async () => ({
      id: 'official-1',
      role: 'INTENDENTE',
      tenantId: 'foreign-tenant',
      authMethod: 'jwt-db',
    }),
    requireDatasetTenantImpl: (res, caller, environmentName) => {
      tenantChecks += 1;
      assert.equal(caller.authMethod, 'jwt-db');
      assert.equal(environmentName, 'GRH_TENANT_ID');
      res.status(403).json({ error: 'Acceso denegado a esta fuente' });
      return false;
    },
    readArtifactBundleImpl: async () => { bundleReads += 1; },
  });
  const tenantResponse = responseRecorder();
  await tenantDenied({ method: 'GET', headers: {}, query: {} }, tenantResponse);
  assert.equal(tenantResponse.statusCode, 403);
  assert.equal(tenantChecks, 1);
  assert.equal(bundleReads, 0);
});

test('the default handler trusts the current database identity, not JWT role or tenant claims', async () => {
  const userId = 'authoritative-quality-official';
  const token = jwt.sign({
    id: userId,
    role: 'INTENDENTE',
    tenantId: process.env.GRH_TENANT_ID,
  }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const request = {
    method: 'GET',
    url: '/api/grh-quality',
    headers: { authorization: `Bearer ${token}` },
    query: {},
  };

  authoritativeUsers.set(userId, {
    id: userId,
    email: 'official@example.test',
    name: 'Official test',
    role: 'TENANT_USER',
    tenantId: process.env.GRH_TENANT_ID,
    active: true,
    tenant: {
      id: process.env.GRH_TENANT_ID,
      slug: 'junin-test',
      name: 'Municipio de prueba',
      shortName: 'Prueba',
      status: 'ACTIVE',
      trialEndsAt: null,
    },
  });
  const downgraded = responseRecorder();
  await authoritativeHandler(request, downgraded);
  assert.equal(downgraded.statusCode, 403);
  assert.equal(downgraded.payload.code, 'ROUTE_PERMISSION_DENIED');

  authoritativeUsers.set(userId, {
    ...authoritativeUsers.get(userId),
    role: 'INTENDENTE',
    tenantId: 'tenant-foreign',
    tenant: {
      ...authoritativeUsers.get(userId).tenant,
      id: 'tenant-foreign',
      slug: 'foreign-test',
    },
  });
  const foreign = responseRecorder();
  await authoritativeHandler({ ...request, headers: { ...request.headers } }, foreign);
  assert.equal(foreign.statusCode, 403);
  assert.match(foreign.payload.error, /fuente/i);

  authoritativeUsers.set(userId, {
    ...authoritativeUsers.get(userId),
    tenantId: process.env.GRH_TENANT_ID,
    tenant: {
      ...authoritativeUsers.get(userId).tenant,
      id: process.env.GRH_TENANT_ID,
      slug: 'junin-test',
    },
  });
  const allowed = responseRecorder();
  await authoritativeHandler({ ...request, headers: { ...request.headers } }, allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(validateGrhQualityContract(allowed.payload), true);
});

test('an authorized official receives one validated projection and no raw bundle data or PII', async () => {
  const calls = [];
  const handler = createGrhQualityHandler({
    requireCapabilityImpl: async (_req, _res, resource, action) => {
      calls.push(['capability', resource, action]);
      return {
        id: 'official-1',
        role: 'CONTADOR',
        tenantId: process.env.GRH_TENANT_ID,
        authMethod: 'jwt-db',
      };
    },
    requireDatasetTenantImpl: (_res, caller, environmentName) => {
      calls.push(['tenant', caller.tenantId, environmentName]);
      return caller.tenantId === process.env[environmentName];
    },
    readArtifactBundleImpl: async tenantId => {
      calls.push(['bundle', tenantId]);
      return {
        profile: { privateMarker: 'raw-profile', personas: [{ dni: '12.345.678' }] },
        semantic: { privateMarker: 'raw-semantic', concepts: [{ label: 'private-label' }] },
      };
    },
    buildProjectionImpl: (profile, semantic) => {
      assert.equal(profile.privateMarker, 'raw-profile');
      assert.equal(semantic.privateMarker, 'raw-semantic');
      calls.push(['projection']);
      return {
        schemaVersion: 'grh-quality-v1',
        privacy: { containsPii: false, rawRowsExported: false },
      };
    },
    inspectContractImpl: projection => {
      calls.push(['contract', projection.schemaVersion]);
      return { ok: true, errors: [] };
    },
  });
  const response = responseRecorder();

  await handler({ method: 'GET', headers: {}, query: {} }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [
    ['capability', routePolicy.RESOURCES.GRH_CONTRACT, routePolicy.ACTIONS.READ],
    ['tenant', process.env.GRH_TENANT_ID, 'GRH_TENANT_ID'],
    ['bundle', process.env.GRH_TENANT_ID],
    ['projection'],
    ['contract', 'grh-quality-v1'],
  ]);
  assert.deepEqual(response.payload, {
    schemaVersion: 'grh-quality-v1',
    privacy: { containsPii: false, rawRowsExported: false },
  });
  assert.doesNotMatch(
    JSON.stringify(response.payload),
    /raw-profile|raw-semantic|personas|dni|12\.345\.678|private-label|concepts/i,
  );
});

test('artifact, projection and contract failures share one detail-free 503 boundary', async () => {
  const baseDependencies = {
    requireCapabilityImpl: async () => ({
      id: 'official-1',
      role: 'INTENDENTE',
      tenantId: process.env.GRH_TENANT_ID,
      authMethod: 'jwt-db',
    }),
    requireDatasetTenantImpl: () => true,
  };
  const scenarios = [
    createGrhQualityHandler({
      ...baseDependencies,
      readArtifactBundleImpl: async () => {
        const error = new Error('database-host-and-secret-must-not-leak');
        error.details = { dni: 'private-dni' };
        throw error;
      },
    }),
    createGrhQualityHandler({
      ...baseDependencies,
      readArtifactBundleImpl: async () => ({ profile: {}, semantic: null }),
    }),
    createGrhQualityHandler({
      ...baseDependencies,
      readArtifactBundleImpl: async () => ({ profile: {}, semantic: {} }),
      buildProjectionImpl: () => ({ leaked: 'private-dni' }),
      inspectContractImpl: () => ({ ok: false, errors: ['private-contract-detail'] }),
    }),
  ];

  for (const handler of scenarios) {
    const response = responseRecorder();
    await withQuietErrors(() => handler({ method: 'GET', headers: {}, query: {} }, response));
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.payload, {
      error: 'La proyeccion de calidad GRH no esta disponible.',
      code: 'GRH_QUALITY_CONTRACT_UNAVAILABLE',
    });
    assert.doesNotMatch(
      JSON.stringify(response.payload),
      /database-host|secret|private-dni|private-contract-detail|stack|details/i,
    );
    assert.equal(response.headers['cache-control'], 'no-store, private, max-age=0');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
  }
});
