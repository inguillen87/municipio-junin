import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after } from 'node:test';
import jwt from 'jsonwebtoken';

import {
  GRH_CLOSE_SCHEMA_VERSION,
  validateGrhCloseContract,
} from '../api/lib/grh-close-contract.js';
import routePolicy from '../shared/route-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';

process.env.JWT_SECRET = 'test-only-grh-close-secret-with-sufficient-length';
process.env.GRH_TENANT_ID = 'tenant-junin-close-test';
process.env.ALLOW_LOCAL_GRH_ARTIFACTS = 'true';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
delete process.env.GRH_SOURCE_SHA256;

const {
  createGrhCloseHandler,
  default: authoritativeHandler,
} = await import('../api/grh-close.js');
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

async function artifactFixture() {
  const [profile, semantic] = await Promise.all([
    readFile(new URL('../api/_data/grh-profile.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../api/_data/grh-semantic.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  return {
    profile,
    semantic,
    provenance: {
      sourceFile: profile.source,
      sourceSha256: profile.sha256,
      approvedSourceSha256: profile.sha256,
      snapshotAsOf: profile.snapshot_as_of,
      profileSchemaVersion: profile.schema_version,
      semanticSchemaVersion: semantic.schema_version,
    },
  };
}

function withQuietErrors(callback) {
  const original = console.error;
  console.error = () => {};
  return Promise.resolve().then(callback).finally(() => { console.error = original; });
}

test('the close endpoint is GET-only, no-store and unauthenticated methods stop early', async () => {
  let authenticated = false;
  const handler = createGrhCloseHandler({
    requireCapabilityImpl: async () => { authenticated = true; },
  });
  const response = responseRecorder();

  await handler({ method: 'POST', url: '/api/grh-close', headers: {}, query: {} }, response);

  assert.equal(response.statusCode, 405);
  assert.equal(response.payload.code, 'METHOD_NOT_ALLOWED');
  assert.equal(response.headers.allow, 'GET');
  assert.equal(response.headers['cache-control'], 'no-store, private, max-age=0');
  assert.equal(response.headers.pragma, 'no-cache');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(
    response.headers['x-municontrol-contract'],
    releaseTruthContract.API_CONTRACTS['/api/grh-close'],
  );
  assert.equal(response.headers['x-municontrol-contract'], GRH_CLOSE_SCHEMA_VERSION);
  assert.equal(authenticated, false);
});

test('capability and exact GRH tenant gates run before the single bundle read', async () => {
  let tenantChecked = false;
  let bundleReads = 0;
  const deniedByCapability = createGrhCloseHandler({
    requireCapabilityImpl: async (_req, res, resource, action) => {
      assert.equal(resource, routePolicy.RESOURCES.GRH_CONTRACT);
      assert.equal(action, routePolicy.ACTIONS.READ);
      res.status(403).json({ code: 'ROUTE_PERMISSION_DENIED' });
      return null;
    },
    requireDatasetTenantImpl: () => { tenantChecked = true; return true; },
    readArtifactBundleImpl: async () => { bundleReads += 1; },
  });
  const deniedResponse = responseRecorder();
  await deniedByCapability({ method: 'GET', url: '/api/grh-close', headers: {}, query: {} }, deniedResponse);
  assert.equal(deniedResponse.statusCode, 403);
  assert.equal(
    deniedResponse.headers['x-municontrol-contract'],
    releaseTruthContract.API_CONTRACTS['/api/grh-close'],
  );
  assert.equal(tenantChecked, false);
  assert.equal(bundleReads, 0);

  const deniedByTenant = createGrhCloseHandler({
    requireCapabilityImpl: async () => ({
      id: 'official-1', role: 'INTENDENTE', tenantId: 'foreign', authMethod: 'jwt-db',
    }),
    requireDatasetTenantImpl: (res, caller, environmentName) => {
      tenantChecked = true;
      assert.equal(caller.authMethod, 'jwt-db');
      assert.equal(environmentName, 'GRH_TENANT_ID');
      res.status(403).json({ error: 'Fuente denegada' });
      return false;
    },
    readArtifactBundleImpl: async () => { bundleReads += 1; },
  });
  const tenantResponse = responseRecorder();
  await deniedByTenant({ method: 'GET', url: '/api/grh-close', headers: {}, query: {} }, tenantResponse);
  assert.equal(tenantResponse.statusCode, 403);
  assert.equal(tenantChecked, true);
  assert.equal(bundleReads, 0);
});

test('the default endpoint trusts the current database role and tenant, not JWT claims', async () => {
  const userId = 'authoritative-grh-close-official';
  const token = jwt.sign({
    id: userId,
    role: 'INTENDENTE',
    tenantId: process.env.GRH_TENANT_ID,
  }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const request = () => ({
    method: 'GET',
    url: '/api/grh-close',
    headers: { authorization: `Bearer ${token}` },
    query: {},
  });
  const baseUser = {
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
  };

  authoritativeUsers.set(userId, baseUser);
  const downgraded = responseRecorder();
  await authoritativeHandler(request(), downgraded);
  assert.equal(downgraded.statusCode, 403);
  assert.equal(downgraded.payload.code, 'ROUTE_PERMISSION_DENIED');

  authoritativeUsers.set(userId, {
    ...baseUser,
    role: 'INTENDENTE',
    tenantId: 'foreign-tenant',
    tenant: { ...baseUser.tenant, id: 'foreign-tenant', slug: 'foreign-test' },
  });
  const foreign = responseRecorder();
  await authoritativeHandler(request(), foreign);
  assert.equal(foreign.statusCode, 403);
  assert.match(foreign.payload.error, /fuente/i);

  authoritativeUsers.set(userId, { ...baseUser, role: 'INTENDENTE' });
  const allowed = responseRecorder();
  await authoritativeHandler(request(), allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(validateGrhCloseContract(allowed.payload), true);
});

test('an authorized official receives only the pinned exact close projection', async () => {
  const bundle = await artifactFixture();
  const calls = [];
  const handler = createGrhCloseHandler({
    requireCapabilityImpl: async (_req, _res, resource, action) => {
      calls.push(['capability', resource, action]);
      return {
        id: 'official-1', role: 'CONTADOR', tenantId: process.env.GRH_TENANT_ID, authMethod: 'jwt-db',
      };
    },
    requireDatasetTenantImpl: (_res, caller, environmentName) => {
      calls.push(['tenant', caller.tenantId, environmentName]);
      return caller.tenantId === process.env[environmentName];
    },
    readArtifactBundleImpl: async tenantId => {
      calls.push(['bundle', tenantId]);
      return bundle;
    },
  });
  const response = responseRecorder();

  await handler({ method: 'GET', url: '/api/grh-close', headers: {}, query: {} }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(validateGrhCloseContract(response.payload), true);
  assert.deepEqual(calls, [
    ['capability', routePolicy.RESOURCES.GRH_CONTRACT, routePolicy.ACTIONS.READ],
    ['tenant', process.env.GRH_TENANT_ID, 'GRH_TENANT_ID'],
    ['bundle', process.env.GRH_TENANT_ID],
  ]);
  const serialized = JSON.stringify(response.payload);
  assert.doesNotMatch(serialized, /"profile"|"semantic"|"provenance"|personas|dni|cuit|legajo|source_code|company_code/i);
});

test('a missing or mismatched approved bundle pin fails closed without projection', async () => {
  const base = await artifactFixture();
  for (const bundle of [
    { profile: base.profile, semantic: base.semantic },
    {
      ...base,
      provenance: { ...base.provenance, approvedSourceSha256: 'b'.repeat(64) },
    },
  ]) {
    let built = false;
    const handler = createGrhCloseHandler({
      requireCapabilityImpl: async () => ({
        id: 'official-1', role: 'INTENDENTE', tenantId: process.env.GRH_TENANT_ID, authMethod: 'jwt-db',
      }),
      requireDatasetTenantImpl: () => true,
      readArtifactBundleImpl: async () => bundle,
      buildProjectionImpl: () => { built = true; return {}; },
    });
    const response = responseRecorder();
    await withQuietErrors(() => handler({ method: 'GET', url: '/api/grh-close', headers: {} }, response));
    assert.equal(response.statusCode, 503);
    assert.equal(response.payload.code, 'GRH_CLOSE_CONTRACT_UNAVAILABLE');
    assert.equal(built, false);
  }
});

test('artifact, projection and output-contract failures share one detail-free 503 boundary', async () => {
  const bundle = await artifactFixture();
  const base = {
    requireCapabilityImpl: async () => ({
      id: 'official-1', role: 'CONTADOR', tenantId: process.env.GRH_TENANT_ID, authMethod: 'jwt-db',
    }),
    requireDatasetTenantImpl: () => true,
  };
  const scenarios = [
    createGrhCloseHandler({
      ...base,
      readArtifactBundleImpl: async () => { throw new Error('database-secret-private-dni'); },
    }),
    createGrhCloseHandler({
      ...base,
      readArtifactBundleImpl: async () => bundle,
      buildProjectionImpl: () => ({ leaked: 'private-dni' }),
      inspectContractImpl: () => ({ ok: false, errors: ['private-contract-detail'] }),
    }),
  ];

  for (const handler of scenarios) {
    const response = responseRecorder();
    await withQuietErrors(() => handler({ method: 'GET', url: '/api/grh-close', headers: {} }, response));
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.payload, {
      error: 'La proyeccion mensual GRH no esta disponible.',
      code: 'GRH_CLOSE_CONTRACT_UNAVAILABLE',
    });
    assert.doesNotMatch(JSON.stringify(response.payload), /secret|private-dni|contract-detail|stack|details/i);
    assert.equal(response.headers['cache-control'], 'no-store, private, max-age=0');
  }
});
