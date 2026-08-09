import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after } from 'node:test';
import jwt from 'jsonwebtoken';

import { validateGrhExecutiveContract } from '../api/lib/grh-executive-contract.js';
import routePolicy from '../shared/route-policy.cjs';

process.env.JWT_SECRET = 'test-only-grh-executive-secret-with-sufficient-length';
process.env.GRH_TENANT_ID = 'tenant-junin-executive-test';
process.env.ALLOW_LOCAL_GRH_ARTIFACTS = 'true';
delete process.env.DATABASE_URL;
delete process.env.GRH_SOURCE_SHA256;

const {
  createGrhExecutiveHandler,
  default: authoritativeHandler,
} = await import('../api/grh-executive.js');
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

async function semanticFixture() {
  return JSON.parse(await readFile(
    new URL('../api/_data/grh-semantic.json', import.meta.url),
    'utf8',
  ));
}

function withQuietErrors(callback) {
  const original = console.error;
  console.error = () => {};
  return Promise.resolve()
    .then(callback)
    .finally(() => { console.error = original; });
}

test('the executive GRH endpoint is GET-only and private-cache disabled', async () => {
  let authenticated = false;
  const handler = createGrhExecutiveHandler({
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
  assert.equal(response.headers['x-municontrol-contract'], 'grh-executive-v2');
  assert.equal(authenticated, false);
});

test('authentication and the configured GRH tenant gate run before artifact access', async () => {
  let tenantChecked = false;
  let bundleRead = false;
  const authDenied = createGrhExecutiveHandler({
    requireCapabilityImpl: async (_req, res, resource, action) => {
      assert.equal(resource, routePolicy.RESOURCES.GRH_CONTRACT);
      assert.equal(action, routePolicy.ACTIONS.READ);
      res.status(401).json({ error: 'No autorizado' });
      return null;
    },
    requireDatasetTenantImpl: () => { tenantChecked = true; return true; },
    readArtifactBundleImpl: async () => { bundleRead = true; },
  });
  const authResponse = responseRecorder();
  await authDenied({ method: 'GET', headers: {}, query: {} }, authResponse);
  assert.equal(authResponse.statusCode, 401);
  assert.equal(tenantChecked, false);
  assert.equal(bundleRead, false);

  const tenantDenied = createGrhExecutiveHandler({
    requireCapabilityImpl: async () => ({
      id: 'official-1',
      role: 'INTENDENTE',
      tenantId: 'foreign-tenant',
      authMethod: 'jwt-db',
    }),
    requireDatasetTenantImpl: (res, user, envName) => {
      tenantChecked = true;
      assert.equal(user.authMethod, 'jwt-db');
      assert.equal(envName, 'GRH_TENANT_ID');
      res.status(403).json({ error: 'Acceso denegado a esta fuente' });
      return false;
    },
    readArtifactBundleImpl: async () => { bundleRead = true; },
  });
  const tenantResponse = responseRecorder();
  await tenantDenied({ method: 'GET', headers: {}, query: {} }, tenantResponse);
  assert.equal(tenantResponse.statusCode, 403);
  assert.equal(tenantChecked, true);
  assert.equal(bundleRead, false);
});

test('the default handler authorizes from the current database identity, not JWT role or tenant claims', async () => {
  const userId = 'authoritative-grh-official';
  const token = jwt.sign({
    id: userId,
    role: 'INTENDENTE',
    tenantId: process.env.GRH_TENANT_ID,
  }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const request = {
    method: 'GET',
    url: '/api/grh-executive',
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
  assert.equal(validateGrhExecutiveContract(allowed.payload), true);
  assert.equal(allowed.payload.privacy.audience, 'interactive');
});

test('an authorized Junin official receives only the validated interactive projection', async () => {
  const originalTenant = process.env.GRH_TENANT_ID;
  process.env.GRH_TENANT_ID = 'tenant-junin-executive-test';
  try {
    const semantic = await semanticFixture();
    const calls = [];
    const handler = createGrhExecutiveHandler({
      requireCapabilityImpl: async (_req, _res, resource, action) => {
        calls.push(['capability', resource, action]);
        return {
          id: 'official-1',
          role: 'INTENDENTE',
          tenantId: process.env.GRH_TENANT_ID,
          authMethod: 'jwt-db',
        };
      },
      requireDatasetTenantImpl: (_res, user, envName) => {
        calls.push(['tenant', user.tenantId, envName]);
        return user.tenantId === process.env[envName];
      },
      readArtifactBundleImpl: async tenantId => {
        calls.push(['bundle', tenantId]);
        return {
          profile: {
            privateMarker: 'profile-must-not-leave-server',
            personas: [{ dni: 'private-dni' }],
          },
          semantic,
        };
      },
    });
    const response = responseRecorder();

    await handler({
      method: 'GET',
      url: '/api/grh-executive',
      headers: { authorization: 'Bearer redacted' },
      query: {},
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(validateGrhExecutiveContract(response.payload), true);
    assert.equal(response.payload.privacy.audience, 'interactive');
    assert.deepEqual(calls, [
      ['capability', routePolicy.RESOURCES.GRH_CONTRACT, routePolicy.ACTIONS.READ],
      ['tenant', process.env.GRH_TENANT_ID, 'GRH_TENANT_ID'],
      ['bundle', process.env.GRH_TENANT_ID],
    ]);
    const serialized = JSON.stringify(response.payload);
    assert.doesNotMatch(serialized, /profile-must-not-leave-server|private-dni|"personas"|"dni"/i);
    assert.equal(response.payload.profile, undefined);
    assert.equal(response.payload.semantic, undefined);
  } finally {
    if (originalTenant === undefined) delete process.env.GRH_TENANT_ID;
    else process.env.GRH_TENANT_ID = originalTenant;
  }
});

test('artifact and output-contract failures return the same detail-free 503 boundary', async () => {
  const originalTenant = process.env.GRH_TENANT_ID;
  process.env.GRH_TENANT_ID = 'tenant-junin-executive-test';
  try {
    const semantic = await semanticFixture();
    const baseDependencies = {
      requireCapabilityImpl: async () => ({
        id: 'official-1',
        role: 'CONTADOR',
        tenantId: process.env.GRH_TENANT_ID,
        authMethod: 'jwt-db',
      }),
      requireDatasetTenantImpl: () => true,
    };
    const scenarios = [
      createGrhExecutiveHandler({
        ...baseDependencies,
        readArtifactBundleImpl: async () => {
          const error = new Error('database-host-and-secret-must-not-leak');
          error.details = { dni: 'private-dni' };
          throw error;
        },
      }),
      createGrhExecutiveHandler({
        ...baseDependencies,
        readArtifactBundleImpl: async () => ({ profile: {}, semantic }),
        buildProjectionImpl: () => ({ leaked: 'private-dni' }),
        inspectContractImpl: () => ({ ok: false, errors: ['private-contract-detail'] }),
      }),
    ];

    for (const handler of scenarios) {
      const response = responseRecorder();
      await withQuietErrors(() => handler({ method: 'GET', headers: {}, query: {} }, response));
      assert.equal(response.statusCode, 503);
      assert.deepEqual(response.payload, {
        error: 'La proyeccion ejecutiva GRH no esta disponible.',
        code: 'GRH_EXECUTIVE_CONTRACT_UNAVAILABLE',
      });
      assert.doesNotMatch(
        JSON.stringify(response.payload),
        /database-host|secret|private-dni|private-contract-detail|stack|details/i,
      );
      assert.equal(response.headers['cache-control'], 'no-store, private, max-age=0');
    }
  } finally {
    if (originalTenant === undefined) delete process.env.GRH_TENANT_ID;
    else process.env.GRH_TENANT_ID = originalTenant;
  }
});
