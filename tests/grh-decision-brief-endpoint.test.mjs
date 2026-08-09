import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after } from 'node:test';
import jwt from 'jsonwebtoken';

import {
  GRH_DECISION_BRIEF_SCHEMA_VERSION,
  validateGrhDecisionBriefContract,
} from '../api/lib/grh-decision-brief-contract.js';
import routePolicy from '../shared/route-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';

process.env.JWT_SECRET = 'test-only-grh-decision-brief-secret-is-long';
process.env.GRH_TENANT_ID = 'tenant-junin-decision-brief-test';
process.env.ALLOW_LOCAL_GRH_ARTIFACTS = 'true';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
delete process.env.GRH_SOURCE_SHA256;

const {
  createGrhDecisionBriefHandler,
  default: authoritativeHandler,
} = await import('../api/grh-decision-brief.js');
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

function request(headers = {}) {
  return {
    method: 'GET',
    url: '/api/grh-decision-brief',
    headers,
    query: {},
  };
}

function withQuietErrors(callback) {
  const original = console.error;
  console.error = () => {};
  return Promise.resolve().then(callback).finally(() => { console.error = original; });
}

test('decision brief endpoint is GET-only and publishes its contract before authentication', async () => {
  let authenticated = false;
  const handler = createGrhDecisionBriefHandler({
    requireCapabilityImpl: async () => { authenticated = true; },
  });
  const response = responseRecorder();

  await handler({ ...request(), method: 'POST' }, response);

  assert.equal(response.statusCode, 405);
  assert.deepEqual(response.payload, {
    error: 'Metodo no permitido',
    code: 'METHOD_NOT_ALLOWED',
  });
  assert.equal(response.headers.allow, 'GET');
  assert.equal(response.headers['cache-control'], 'no-store, private, max-age=0');
  assert.equal(response.headers.pragma, 'no-cache');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(
    response.headers['x-municontrol-contract'],
    releaseTruthContract.API_CONTRACTS['/api/grh-decision-brief'],
  );
  assert.equal(response.headers['x-municontrol-contract'], GRH_DECISION_BRIEF_SCHEMA_VERSION);
  assert.equal(authenticated, false);
});

test('capability and exact GRH tenant gates run before the private bundle capture', async () => {
  let tenantChecks = 0;
  let bundleReads = 0;
  const capabilityDenied = createGrhDecisionBriefHandler({
    requireCapabilityImpl: async (_req, res, resource, action) => {
      assert.equal(resource, routePolicy.RESOURCES.GRH_CONTRACT);
      assert.equal(action, routePolicy.ACTIONS.READ);
      res.status(403).json({ error: 'Operacion no habilitada para este perfil', code: 'ROUTE_PERMISSION_DENIED' });
      return null;
    },
    requireDatasetTenantImpl: () => { tenantChecks += 1; return true; },
    readArtifactBundleImpl: async () => { bundleReads += 1; },
  });
  const capabilityResponse = responseRecorder();
  await capabilityDenied(request(), capabilityResponse);
  assert.equal(capabilityResponse.statusCode, 403);
  assert.equal(tenantChecks, 0);
  assert.equal(bundleReads, 0);
  assert.doesNotMatch(JSON.stringify(capabilityResponse.payload), /tenant|claim|token|stack|detail/i);

  const tenantDenied = createGrhDecisionBriefHandler({
    requireCapabilityImpl: async () => ({
      id: 'official-1', role: 'INTENDENTE', tenantId: 'foreign', authMethod: 'jwt-db',
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
  await tenantDenied(request(), tenantResponse);
  assert.equal(tenantResponse.statusCode, 403);
  assert.equal(tenantChecks, 1);
  assert.equal(bundleReads, 0);
  assert.doesNotMatch(JSON.stringify(tenantResponse.payload), /foreign|official-1|claim|token|stack|detail/i);
});

test('default authorization follows the current database role and tenant, never JWT claims', async () => {
  const anonymous = responseRecorder();
  await authoritativeHandler(request(), anonymous);
  assert.equal(anonymous.statusCode, 401);
  assert.deepEqual(anonymous.payload, { error: 'No autorizado' });
  assert.equal(anonymous.headers['x-municontrol-contract'], GRH_DECISION_BRIEF_SCHEMA_VERSION);
  assert.equal(anonymous.headers['cache-control'], 'no-store, private, max-age=0');
  assert.doesNotMatch(JSON.stringify(anonymous.payload), /claim|token|tenant|stack|detail/i);

  const userId = 'authoritative-grh-decision-official';
  const token = jwt.sign({
    id: userId,
    role: 'INTENDENTE',
    tenantId: process.env.GRH_TENANT_ID,
  }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const headers = { authorization: `Bearer ${token}` };
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
  await authoritativeHandler(request(headers), downgraded);
  assert.equal(downgraded.statusCode, 403);
  assert.equal(downgraded.payload.code, 'ROUTE_PERMISSION_DENIED');

  authoritativeUsers.set(userId, {
    ...baseUser,
    role: 'INTENDENTE',
    tenantId: 'foreign-tenant',
    tenant: { ...baseUser.tenant, id: 'foreign-tenant', slug: 'foreign-test' },
  });
  const foreign = responseRecorder();
  await authoritativeHandler(request(headers), foreign);
  assert.equal(foreign.statusCode, 403);
  assert.match(foreign.payload.error, /fuente/i);
  assert.doesNotMatch(JSON.stringify(foreign.payload), /foreign-tenant|foreign-test|official@example/i);

  authoritativeUsers.set(userId, { ...baseUser, role: 'INTENDENTE' });
  const allowed = responseRecorder();
  await authoritativeHandler(request(headers), allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(validateGrhDecisionBriefContract(allowed.payload), true);
});

test('one approved bundle capture feeds only validated aggregate projections', async () => {
  const bundle = await artifactFixture();
  const calls = [];
  const executive = Object.freeze({ contract: 'executive-projection' });
  const quality = Object.freeze({ contract: 'quality-projection' });
  const close = Object.freeze({ contract: 'close-projection' });
  const decisionBrief = Object.freeze({ schemaVersion: GRH_DECISION_BRIEF_SCHEMA_VERSION });
  const handler = createGrhDecisionBriefHandler({
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
    buildExecutiveProjectionImpl: (semantic, options) => {
      assert.strictEqual(semantic, bundle.semantic);
      assert.deepEqual(options, { audience: 'interactive' });
      calls.push(['executive']);
      return executive;
    },
    buildQualityProjectionImpl: (profile, semantic) => {
      assert.strictEqual(profile, bundle.profile);
      assert.strictEqual(semantic, bundle.semantic);
      calls.push(['quality']);
      return quality;
    },
    buildCloseProjectionImpl: semantic => {
      assert.strictEqual(semantic, bundle.semantic);
      calls.push(['close']);
      return close;
    },
    buildDecisionBriefProjectionImpl: (actualExecutive, actualQuality, actualClose) => {
      assert.strictEqual(actualExecutive, executive);
      assert.strictEqual(actualQuality, quality);
      assert.strictEqual(actualClose, close);
      calls.push(['decision']);
      return decisionBrief;
    },
    inspectContractImpl: projection => {
      assert.strictEqual(projection, decisionBrief);
      calls.push(['inspect']);
      return { ok: true, errors: [] };
    },
  });
  const response = responseRecorder();

  await handler(request(), response);

  assert.equal(response.statusCode, 200);
  assert.strictEqual(response.payload, decisionBrief);
  assert.deepEqual(calls, [
    ['capability', routePolicy.RESOURCES.GRH_CONTRACT, routePolicy.ACTIONS.READ],
    ['tenant', process.env.GRH_TENANT_ID, 'GRH_TENANT_ID'],
    ['bundle', process.env.GRH_TENANT_ID],
    ['executive'],
    ['quality'],
    ['close'],
    ['decision'],
    ['inspect'],
  ]);
});

test('the real endpoint output is a sanitized, exact decision brief receipt', async () => {
  const bundle = await artifactFixture();
  const handler = createGrhDecisionBriefHandler({
    requireCapabilityImpl: async () => ({
      id: 'official-1', role: 'INTENDENTE', tenantId: process.env.GRH_TENANT_ID, authMethod: 'jwt-db',
    }),
    requireDatasetTenantImpl: () => true,
    readArtifactBundleImpl: async () => bundle,
  });
  const response = responseRecorder();

  await handler(request(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(validateGrhDecisionBriefContract(response.payload), true);
  assert.equal(response.payload.schemaVersion, GRH_DECISION_BRIEF_SCHEMA_VERSION);
  assert.equal(response.payload.privacy.employeeIdentifiersExported, false);
  assert.equal(response.payload.privacy.monetaryAmountsExported, false);
  assert.equal(Number.isSafeInteger(response.payload.situation.temporalQuarantineRows), true);
  assert.ok(response.payload.situation.temporalQuarantineRows >= 0);
  const serialized = JSON.stringify(response.payload);
  assert.doesNotMatch(
    serialized,
    /"profile"|"semantic"|"provenance"|personas|dni|cuit|legajo|source_code|company_code|privateMarker/i,
  );
  assert.equal(response.payload.raw, undefined);
  assert.equal(response.payload.fallback, undefined);
  assert.equal(response.payload.global, undefined);
});

test('missing, drifted or wrongly configured provenance pins fail before projection', async () => {
  const bundle = await artifactFixture();
  const originalPin = process.env.GRH_SOURCE_SHA256;
  const scenarios = [
    { value: { profile: bundle.profile, semantic: bundle.semantic } },
    {
      value: {
        ...bundle,
        provenance: { ...bundle.provenance, approvedSourceSha256: 'b'.repeat(64) },
      },
    },
    { value: bundle, configuredPin: 'c'.repeat(64) },
    { value: bundle, configuredPin: 'invalid-pin' },
  ];

  try {
    for (const scenario of scenarios) {
      if (scenario.configuredPin === undefined) delete process.env.GRH_SOURCE_SHA256;
      else process.env.GRH_SOURCE_SHA256 = scenario.configuredPin;
      let built = false;
      let bundleReads = 0;
      const handler = createGrhDecisionBriefHandler({
        requireCapabilityImpl: async () => ({
          id: 'official-1', role: 'INTENDENTE', tenantId: process.env.GRH_TENANT_ID, authMethod: 'jwt-db',
        }),
        requireDatasetTenantImpl: () => true,
        readArtifactBundleImpl: async () => { bundleReads += 1; return scenario.value; },
        buildExecutiveProjectionImpl: () => { built = true; return {}; },
      });
      const response = responseRecorder();
      await withQuietErrors(() => handler(request(), response));

      assert.equal(response.statusCode, 503);
      assert.deepEqual(response.payload, {
        error: 'El brief ejecutivo GRH no esta disponible.',
        code: 'GRH_DECISION_BRIEF_CONTRACT_UNAVAILABLE',
      });
      assert.equal(bundleReads, 1);
      assert.equal(built, false);
    }
  } finally {
    if (originalPin === undefined) delete process.env.GRH_SOURCE_SHA256;
    else process.env.GRH_SOURCE_SHA256 = originalPin;
  }
});

test('artifact, projection and contract failures share one detail-free 503 receipt', async () => {
  const bundle = await artifactFixture();
  const base = {
    requireCapabilityImpl: async () => ({
      id: 'official-1', role: 'CONTADOR', tenantId: process.env.GRH_TENANT_ID, authMethod: 'jwt-db',
    }),
    requireDatasetTenantImpl: () => true,
  };
  const scenarios = [
    createGrhDecisionBriefHandler({
      ...base,
      readArtifactBundleImpl: async () => {
        const error = new Error('database-secret-private-dni');
        error.details = { token: 'private-token' };
        throw error;
      },
    }),
    createGrhDecisionBriefHandler({
      ...base,
      readArtifactBundleImpl: async () => bundle,
      buildExecutiveProjectionImpl: () => { throw new Error('upstream-private-row'); },
    }),
    createGrhDecisionBriefHandler({
      ...base,
      readArtifactBundleImpl: async () => bundle,
      buildDecisionBriefProjectionImpl: () => ({ leaked: 'private-dni' }),
      inspectContractImpl: () => ({ ok: false, errors: ['private-contract-detail'] }),
    }),
  ];

  for (const handler of scenarios) {
    const response = responseRecorder();
    await withQuietErrors(() => handler(request(), response));
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.payload, {
      error: 'El brief ejecutivo GRH no esta disponible.',
      code: 'GRH_DECISION_BRIEF_CONTRACT_UNAVAILABLE',
    });
    assert.doesNotMatch(
      JSON.stringify(response.payload),
      /database-secret|private-dni|private-token|private-row|contract-detail|stack|details/i,
    );
    assert.equal(response.headers['cache-control'], 'no-store, private, max-age=0');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['x-municontrol-contract'], GRH_DECISION_BRIEF_SCHEMA_VERSION);
  }
});
