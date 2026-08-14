import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createGrhGardenNetworkHandler,
  readGrhGardenNetworkArtifact,
} from '../api/grh-garden-network.js';
import {
  GRH_GARDEN_NETWORK_SCHEMA_VERSION,
  inspectGrhGardenNetworkContract,
} from '../api/lib/grh-garden-network-contract.js';

const SOURCE_SHA = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';
const ARTIFACT = JSON.parse(await readFile(
  new URL('../api/_data/grh-garden-network.json', import.meta.url),
  'utf8',
));

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    payload: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function dependencies({ artifact = ARTIFACT, contractOk = true } = {}) {
  return {
    requireCapabilityImpl: async (_req, _res, resource, action) => {
      assert.equal(resource, 'grh.organization.analytics');
      assert.equal(action, 'read');
      return { tenantId: 'tenant-junin', email: 'autoridad@junin.gob.ar' };
    },
    requireDatasetTenantImpl: (_res, caller, environmentName) => {
      assert.equal(caller.tenantId, 'tenant-junin');
      assert.equal(environmentName, 'GRH_TENANT_ID');
      return true;
    },
    readArtifactImpl: async options => {
      assert.equal(options.expectedSourceSha256, SOURCE_SHA);
      assert.equal(options.environment.GRH_SOURCE_SHA256, SOURCE_SHA);
      return artifact;
    },
    inspectContractImpl: contractOk
      ? inspectGrhGardenNetworkContract
      : () => ({ ok: false }),
    environment: { GRH_SOURCE_SHA256: SOURCE_SHA },
  };
}

test('reusable reader pins, validates and freezes the aggregate artifact', async () => {
  const projection = await readGrhGardenNetworkArtifact({
    expectedSourceSha256: SOURCE_SHA,
  });
  assert.equal(projection.schemaVersion, GRH_GARDEN_NETWORK_SCHEMA_VERSION);
  assert.equal(projection.summary.people, 107);
  assert.equal(Object.isFrozen(projection), true);

  await assert.rejects(
    readGrhGardenNetworkArtifact({ expectedSourceSha256: 'bad' }),
    error => error?.code === 'GRH_GARDEN_NETWORK_SOURCE_PIN_INVALID',
  );
  await assert.rejects(
    readGrhGardenNetworkArtifact({ expectedSourceSha256: 'a'.repeat(64) }),
    error => error?.code === 'GRH_GARDEN_NETWORK_SOURCE_MISMATCH',
  );
  await assert.rejects(
    readGrhGardenNetworkArtifact({
      expectedSourceSha256: SOURCE_SHA,
      readFileImpl: async () => '{not-json',
    }),
    error => error?.code === 'GRH_GARDEN_NETWORK_ARTIFACT_INVALID',
  );
});

test('endpoint is GET-only, fixed-query, capability-gated, tenant-bound and no-store', async () => {
  const response = responseRecorder();
  await createGrhGardenNetworkHandler(dependencies())(
    { method: 'GET', query: {}, headers: {} },
    response,
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-municontrol-contract'], GRH_GARDEN_NETWORK_SCHEMA_VERSION);
  assert.equal(response.headers['cache-control'], 'no-store, private, max-age=0');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers.vary, 'Authorization');
  assert.equal(inspectGrhGardenNetworkContract(response.payload, {
    expectedSourceSha256: SOURCE_SHA,
  }).ok, true);

  let authCalls = 0;
  const methodDeps = dependencies();
  methodDeps.requireCapabilityImpl = async () => { authCalls += 1; return null; };
  const methodResponse = responseRecorder();
  await createGrhGardenNetworkHandler(methodDeps)(
    { method: 'POST', query: {}, headers: {} },
    methodResponse,
  );
  assert.equal(methodResponse.statusCode, 405);
  assert.equal(methodResponse.headers.allow, 'GET');
  assert.equal(authCalls, 0);

  let artifactReads = 0;
  const queryDeps = dependencies();
  queryDeps.readArtifactImpl = async () => { artifactReads += 1; return ARTIFACT; };
  const queryResponse = responseRecorder();
  await createGrhGardenNetworkHandler(queryDeps)(
    { method: 'GET', query: { unit: 'private' }, headers: {} },
    queryResponse,
  );
  assert.equal(queryResponse.statusCode, 400);
  assert.equal(queryResponse.payload.code, 'GRH_GARDEN_NETWORK_QUERY_INVALID');
  assert.equal(artifactReads, 0);
});

test('authorization or dataset-tenant rejection stops before artifact access', async t => {
  await t.test('capability rejected', async () => {
    let reads = 0;
    const deps = dependencies();
    deps.requireCapabilityImpl = async () => null;
    deps.readArtifactImpl = async () => { reads += 1; return ARTIFACT; };
    const response = responseRecorder();
    await createGrhGardenNetworkHandler(deps)(
      { method: 'GET', query: {}, headers: {} }, response,
    );
    assert.equal(reads, 0);
  });
  await t.test('tenant rejected', async () => {
    let reads = 0;
    const deps = dependencies();
    deps.requireDatasetTenantImpl = () => false;
    deps.readArtifactImpl = async () => { reads += 1; return ARTIFACT; };
    const response = responseRecorder();
    await createGrhGardenNetworkHandler(deps)(
      { method: 'GET', query: {}, headers: {} }, response,
    );
    assert.equal(reads, 0);
  });
});

test('pin, artifact or contract drift returns one detail-free unavailable response', async t => {
  const cases = [
    ['missing pin', { ...dependencies(), environment: {} }],
    ['artifact failure', {
      ...dependencies(),
      readArtifactImpl: async () => { throw new Error('private source detail'); },
    }],
    ['contract failure', dependencies({ contractOk: false })],
  ];
  for (const [name, deps] of cases) {
    await t.test(name, async () => {
      const response = responseRecorder();
      const previous = console.error;
      console.error = () => {};
      try {
        await createGrhGardenNetworkHandler(deps)(
          { method: 'GET', query: {}, headers: {} },
          response,
        );
      } finally {
        console.error = previous;
      }
      assert.equal(response.statusCode, 503);
      assert.deepEqual(response.payload, {
        error: 'La Red de Jardines Maternales no está disponible.',
        code: 'GRH_GARDEN_NETWORK_UNAVAILABLE',
      });
      assert.equal(JSON.stringify(response.payload).includes('private source detail'), false);
    });
  }
});
