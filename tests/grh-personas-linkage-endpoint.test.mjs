import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createGrhPersonasLinkageReadinessHandler,
  readGrhPersonasLinkageReadinessArtifact,
} from '../api/grh-personas-linkage-readiness.js';
import { inspectGrhPersonasLinkageContract } from '../api/lib/grh-personas-linkage-contract.js';

const GRH_SHA = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';
const PERSONAS_SHA = '11bf15764488e4fe8a053255f503404f6bca24a1ac47c90647649e2c41d8e39c';
const ARTIFACT = JSON.parse(await readFile(new URL('../api/_data/grh-personas-linkage-readiness.json', import.meta.url), 'utf8'));

function responseRecorder() {
  return {
    headers: {}, statusCode: 200, payload: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function dependencies({ contractOk = true } = {}) {
  return {
    requireCapabilityImpl: async (_req, _res, resource, action) => {
      assert.equal(resource, 'grh.organization.analytics');
      assert.equal(action, 'read');
      return { tenantId: 'tenant-junin' };
    },
    requireDatasetTenantImpl: (_res, caller, name) => {
      assert.equal(caller.tenantId, 'tenant-junin');
      assert.equal(name, 'GRH_TENANT_ID');
      return true;
    },
    readArtifactImpl: async options => {
      assert.equal(options.expectedGrhSourceSha256, GRH_SHA);
      assert.equal(options.expectedPersonasSourceSha256, PERSONAS_SHA);
      return ARTIFACT;
    },
    inspectContractImpl: contractOk ? inspectGrhPersonasLinkageContract : () => ({ ok: false }),
    environment: { GRH_SOURCE_SHA256: GRH_SHA, PERSONAS_SOURCE_SHA256: PERSONAS_SHA },
  };
}

test('server loader requires and verifies both source pins', async () => {
  const projection = await readGrhPersonasLinkageReadinessArtifact({
    expectedGrhSourceSha256: GRH_SHA,
    expectedPersonasSourceSha256: PERSONAS_SHA,
  });
  assert.equal(projection.reconciliation.candidates, 1699);
  await assert.rejects(readGrhPersonasLinkageReadinessArtifact({
    expectedGrhSourceSha256: GRH_SHA,
  }), error => error?.code === 'GRH_PERSONAS_LINKAGE_SOURCE_PIN_INVALID');
  await assert.rejects(readGrhPersonasLinkageReadinessArtifact({
    expectedGrhSourceSha256: GRH_SHA,
    expectedPersonasSourceSha256: PERSONAS_SHA,
    readFileImpl: async () => '{invalid',
  }), error => error?.code === 'GRH_PERSONAS_LINKAGE_ARTIFACT_INVALID');
});

test('endpoint is GET-only, fixed-query, tenant-bound, private and no-store', async () => {
  const response = responseRecorder();
  await createGrhPersonasLinkageReadinessHandler(dependencies())({ method: 'GET', query: {} }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-municontrol-contract'], 'grh-personas-linkage-readiness-v1');
  assert.equal(response.headers['cache-control'], 'no-store, private, max-age=0');
  assert.equal(response.headers.vary, 'Authorization');
  assert.equal(inspectGrhPersonasLinkageContract(response.payload).ok, true);

  const post = responseRecorder();
  await createGrhPersonasLinkageReadinessHandler(dependencies())({ method: 'POST', query: {} }, post);
  assert.equal(post.statusCode, 405);
  assert.equal(post.headers.allow, 'GET');
  const query = responseRecorder();
  await createGrhPersonasLinkageReadinessHandler(dependencies())({ method: 'GET', query: { person: '1' } }, query);
  assert.equal(query.statusCode, 400);
  assert.equal(query.payload.code, 'GRH_PERSONAS_LINKAGE_QUERY_INVALID');
});

test('missing pin, artifact failure and contract drift share one detail-free 503', async t => {
  const cases = [
    ['missing personas pin', { ...dependencies(), environment: { GRH_SOURCE_SHA256: GRH_SHA } }],
    ['artifact failure', { ...dependencies(), readArtifactImpl: async () => { throw new Error('private path'); } }],
    ['contract drift', dependencies({ contractOk: false })],
  ];
  for (const [name, deps] of cases) {
    await t.test(name, async () => {
      const response = responseRecorder();
      const previous = console.error; console.error = () => {};
      try {
        await createGrhPersonasLinkageReadinessHandler(deps)({ method: 'GET', query: {} }, response);
      } finally { console.error = previous; }
      assert.equal(response.statusCode, 503);
      assert.deepEqual(response.payload, {
        error: 'La revisión de vinculación entre GRH y PERSONAS no está disponible.',
        code: 'GRH_PERSONAS_LINKAGE_UNAVAILABLE',
      });
      assert.equal(JSON.stringify(response.payload).includes('private path'), false);
    });
  }
});
