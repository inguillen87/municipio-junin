import assert from 'node:assert/strict';
import test from 'node:test';

import { createGrhFixedConceptControlHandler } from '../api/grh-fixed-concept-control.js';
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
  const handler = createGrhFixedConceptControlHandler({
    requireCapabilityImpl: async () => { authCalls += 1; return null; },
    readArtifactImpl: async () => { reads += 1; },
  });
  const method = responseRecorder();
  await handler({ method: 'POST', query: {}, headers: {} }, method);
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.allow, 'GET');
  assert.equal(method.headers['x-municontrol-contract'], 'grh-fixed-concept-control-v1');
  assert.equal(method.headers['cache-control'], 'no-store, private, max-age=0');
  assert.equal(method.headers['x-content-type-options'], 'nosniff');
  assert.equal(method.headers.vary, 'Authorization');
  assert.equal(authCalls, 0);
  assert.equal(reads, 0);

  const query = responseRecorder();
  await handler({ method: 'GET', query: { employee: 'private' }, headers: {} }, query);
  assert.equal(query.statusCode, 400);
  assert.equal(query.payload.code, 'GRH_FIXED_CONCEPT_CONTROL_QUERY_INVALID');
  assert.equal(authCalls, 0);
  assert.equal(reads, 0);
});

test('authorized exact-tenant caller reuses workforce-finance read and receives validated aggregates', async () => {
  const calls = [];
  const handler = createGrhFixedConceptControlHandler({
    environment: { GRH_SOURCE_SHA256: SOURCE_SHA, GRH_TENANT_ID: 'tenant-junin' },
    requireCapabilityImpl: async (_req, _res, resource, action) => {
      calls.push(['capability', resource, action]);
      return { id: 'official', role: 'CONTADOR', tenantId: 'tenant-junin' };
    },
    requireDatasetTenantImpl: (_res, caller, environmentName) => {
      calls.push(['tenant', caller.tenantId, environmentName]);
      return true;
    },
    readArtifactImpl: async options => {
      calls.push(['artifact', options.expectedSourceSha256]);
      return { schemaVersion: 'grh-fixed-concept-control-v1', privacy: { aggregateOnly: true, containsPii: false } };
    },
    inspectContractImpl: projection => {
      calls.push(['contract', projection.schemaVersion]);
      return { ok: true, errors: [] };
    },
  });
  const response = responseRecorder();
  await handler({ method: 'GET', query: {}, headers: {} }, response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [
    ['capability', routePolicy.RESOURCES.GRH_WORKFORCE_FINANCE, routePolicy.ACTIONS.READ],
    ['tenant', 'tenant-junin', 'GRH_TENANT_ID'],
    ['artifact', SOURCE_SHA],
    ['contract', 'grh-fixed-concept-control-v1'],
  ]);
  assert.equal(response.payload.privacy.aggregateOnly, true);
  assert.equal(response.payload.privacy.containsPii, false);
});

test('missing caller or tenant binding stops before artifact access', async () => {
  let reads = 0;
  const noCaller = createGrhFixedConceptControlHandler({
    requireCapabilityImpl: async () => null,
    readArtifactImpl: async () => { reads += 1; },
  });
  await noCaller({ method: 'GET', query: {}, headers: {} }, responseRecorder());
  const wrongTenant = createGrhFixedConceptControlHandler({
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
    createGrhFixedConceptControlHandler({
      ...base,
      readArtifactImpl: async () => { throw new Error('secret-path-and-identifier'); },
    }),
    createGrhFixedConceptControlHandler({
      ...base,
      readArtifactImpl: async () => ({ leaked: 'private-message' }),
      inspectContractImpl: () => ({ ok: false, errors: ['private-detail'] }),
    }),
  ]) {
    const response = responseRecorder();
    await withQuietErrors(() => handler({ method: 'GET', query: {}, headers: {} }, response));
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.payload, {
      error: 'El control agregado de conceptos fijos GRH no está disponible.',
      code: 'GRH_FIXED_CONCEPT_CONTROL_UNAVAILABLE',
    });
    assert.doesNotMatch(JSON.stringify(response.payload), /secret|identifier|private|stack|detail|message/i);
  }
});
