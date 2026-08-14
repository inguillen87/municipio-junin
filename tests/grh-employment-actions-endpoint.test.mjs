import assert from 'node:assert/strict';
import test from 'node:test';

import { createGrhEmploymentActionsHandler } from '../api/grh-employment-actions.js';
import routePolicy from '../shared/route-policy.cjs';

const SOURCE_SHA = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';

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
  return Promise.resolve().then(callback).finally(() => { console.error = original; });
}

test('endpoint is GET-only, fixed-query, no-store and authenticates before reading', async () => {
  let authCalls = 0;
  let reads = 0;
  const handler = createGrhEmploymentActionsHandler({
    requireCapabilityImpl: async () => { authCalls += 1; return null; },
    readArtifactImpl: async () => { reads += 1; },
  });

  const method = responseRecorder();
  await handler({ method: 'POST', query: {}, headers: {} }, method);
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.allow, 'GET');
  assert.equal(method.headers['x-municontrol-contract'], 'grh-employment-actions-v1');
  assert.equal(method.headers['cache-control'], 'no-store, private, max-age=0');
  assert.equal(method.headers['x-content-type-options'], 'nosniff');
  assert.equal(method.headers.vary, 'Authorization');
  assert.equal(authCalls, 0);
  assert.equal(reads, 0);

  const query = responseRecorder();
  await handler({ method: 'GET', query: { employee: 'private' }, headers: {} }, query);
  assert.equal(query.statusCode, 400);
  assert.equal(query.payload.code, 'GRH_EMPLOYMENT_ACTIONS_QUERY_INVALID');
  assert.equal(authCalls, 0);
  assert.equal(reads, 0);
});

test('authorized exact-tenant caller receives one validated aggregate projection', async () => {
  const calls = [];
  const handler = createGrhEmploymentActionsHandler({
    environment: { GRH_SOURCE_SHA256: SOURCE_SHA, GRH_TENANT_ID: 'tenant-junin' },
    requireCapabilityImpl: async (_req, _res, resource, action) => {
      calls.push(['capability', resource, action]);
      return { id: 'official', role: 'INTENDENTE', tenantId: 'tenant-junin' };
    },
    requireDatasetTenantImpl: (_res, caller, environmentName) => {
      calls.push(['tenant', caller.tenantId, environmentName]);
      return true;
    },
    readArtifactImpl: async options => {
      calls.push(['artifact', options.expectedSourceSha256]);
      return {
        schemaVersion: 'grh-employment-actions-v1',
        privacy: { aggregateOnly: true, containsPii: false },
      };
    },
    inspectContractImpl: projection => {
      calls.push(['contract', projection.schemaVersion]);
      return { ok: true, errors: [] };
    },
  });
  const response = responseRecorder();
  await handler({ method: 'GET', query: {}, headers: {} }, response);

  assert.equal(routePolicy.RESOURCES.GRH_EMPLOYMENT_ACTIONS, 'grh.employment-actions');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [
    ['capability', routePolicy.RESOURCES.GRH_EMPLOYMENT_ACTIONS, routePolicy.ACTIONS.READ],
    ['tenant', 'tenant-junin', 'GRH_TENANT_ID'],
    ['artifact', SOURCE_SHA],
    ['contract', 'grh-employment-actions-v1'],
  ]);
  assert.equal(response.payload.privacy.aggregateOnly, true);
  assert.equal(response.payload.privacy.containsPii, false);
});

test('missing caller or tenant binding stops before artifact access', async () => {
  let reads = 0;
  const noCaller = createGrhEmploymentActionsHandler({
    requireCapabilityImpl: async () => null,
    readArtifactImpl: async () => { reads += 1; },
  });
  await noCaller({ method: 'GET', query: {}, headers: {} }, responseRecorder());

  const wrongTenant = createGrhEmploymentActionsHandler({
    requireCapabilityImpl: async () => ({ id: 'official', tenantId: 'other' }),
    requireDatasetTenantImpl: () => false,
    readArtifactImpl: async () => { reads += 1; },
  });
  await wrongTenant({ method: 'GET', query: {}, headers: {} }, responseRecorder());
  assert.equal(reads, 0);
});

test('artifact and contract failures share one detail-free 503 boundary', async () => {
  const base = {
    requireCapabilityImpl: async () => ({ id: 'official', tenantId: 'tenant-junin' }),
    requireDatasetTenantImpl: () => true,
  };
  for (const handler of [
    createGrhEmploymentActionsHandler({
      ...base,
      readArtifactImpl: async () => { throw new Error('secret-path-and-dni'); },
    }),
    createGrhEmploymentActionsHandler({
      ...base,
      readArtifactImpl: async () => ({ leaked: 'private-observation' }),
      inspectContractImpl: () => ({ ok: false, errors: ['private-detail'] }),
    }),
  ]) {
    const response = responseRecorder();
    await withQuietErrors(() => handler({ method: 'GET', query: {}, headers: {} }, response));
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.payload, {
      error: 'Las actuaciones laborales agregadas no están disponibles.',
      code: 'GRH_EMPLOYMENT_ACTIONS_UNAVAILABLE',
    });
    assert.doesNotMatch(JSON.stringify(response.payload), /secret|dni|private|stack|detail|observation/i);
  }
});
