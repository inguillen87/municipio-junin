import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGrhManagementTimelineHandler,
  readGrhManagementTimelineArtifact,
} from '../api/grh-management-timeline.js';
import routePolicy from '../shared/route-policy.cjs';

const SOURCE_SHA = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';

function responseRecorder() {
  return {
    statusCode: 200,
    payload: undefined,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function withQuietErrors(callback) {
  const original = console.error;
  console.error = () => {};
  return Promise.resolve().then(callback).finally(() => { console.error = original; });
}

test('artifact reader returns the pinned deeply frozen real projection', async () => {
  const result = await readGrhManagementTimelineArtifact({
    environment: { GRH_SOURCE_SHA256: SOURCE_SHA },
  });
  assert.equal(result.schemaVersion, 'grh-management-timeline-v1');
  assert.equal(result.source.sha256, SOURCE_SHA);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.comparison.domains.reportedAbsence.current.values), true);
});

test('endpoint is GET-only, fixed-query, private no-store and rejects before auth', async () => {
  let authCalls = 0;
  let reads = 0;
  const handler = createGrhManagementTimelineHandler({
    requireCapabilityImpl: async () => { authCalls += 1; return null; },
    readArtifactImpl: async () => { reads += 1; },
  });
  const method = responseRecorder();
  await handler({ method: 'POST', query: {}, headers: {} }, method);
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.allow, 'GET');
  assert.equal(method.headers['x-municontrol-contract'], 'grh-management-timeline-v1');
  assert.equal(method.headers['cache-control'], 'no-store, private, max-age=0');
  assert.equal(method.headers['x-content-type-options'], 'nosniff');
  assert.equal(method.headers.vary, 'Authorization');
  assert.equal(authCalls, 0);
  assert.equal(reads, 0);

  const query = responseRecorder();
  await handler({ method: 'GET', query: { year: '4' }, headers: {} }, query);
  assert.equal(query.statusCode, 400);
  assert.equal(query.payload.code, 'GRH_MANAGEMENT_TIMELINE_QUERY_INVALID');
  assert.equal(authCalls, 0);
  assert.equal(reads, 0);
});

test('authorized tenant-bound official receives only validated organization aggregates', async () => {
  const calls = [];
  const payload = {
    schemaVersion: 'grh-management-timeline-v1',
    privacy: { mode: 'aggregate_only', containsPii: false },
  };
  const handler = createGrhManagementTimelineHandler({
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
      return payload;
    },
    inspectContractImpl: value => {
      calls.push(['contract', value.schemaVersion]);
      return { ok: true, errors: [] };
    },
  });
  const response = responseRecorder();
  await handler({ method: 'GET', query: {}, headers: {} }, response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [
    ['capability', routePolicy.RESOURCES.GRH_ORGANIZATION_ANALYTICS, routePolicy.ACTIONS.READ],
    ['tenant', 'tenant-junin', 'GRH_TENANT_ID'],
    ['artifact', SOURCE_SHA],
    ['contract', 'grh-management-timeline-v1'],
  ]);
  assert.equal(response.payload.privacy.containsPii, false);
});

test('missing caller or tenant binding stops before artifact access', async () => {
  let reads = 0;
  const noCaller = createGrhManagementTimelineHandler({
    requireCapabilityImpl: async () => null,
    readArtifactImpl: async () => { reads += 1; },
  });
  await noCaller({ method: 'GET', query: {}, headers: {} }, responseRecorder());
  const wrongTenant = createGrhManagementTimelineHandler({
    requireCapabilityImpl: async () => ({ id: 'official', tenantId: 'other' }),
    requireDatasetTenantImpl: () => false,
    readArtifactImpl: async () => { reads += 1; },
  });
  await wrongTenant({ method: 'GET', query: {}, headers: {} }, responseRecorder());
  assert.equal(reads, 0);
});

test('source, artifact and contract failures share one detail-free 503 boundary', async () => {
  await assert.rejects(
    readGrhManagementTimelineArtifact({ environment: {} }),
    error => error?.code === 'GRH_MANAGEMENT_TIMELINE_SOURCE_PIN_INVALID',
  );
  const base = {
    requireCapabilityImpl: async () => ({ id: 'official', tenantId: 'tenant-junin' }),
    requireDatasetTenantImpl: () => true,
  };
  for (const handler of [
    createGrhManagementTimelineHandler({
      ...base,
      readArtifactImpl: async () => { throw new Error('secret-path-and-person'); },
    }),
    createGrhManagementTimelineHandler({
      ...base,
      readArtifactImpl: async () => ({ leaked: 'private-message' }),
      inspectContractImpl: () => ({ ok: false, errors: ['private-detail'] }),
    }),
  ]) {
    const response = responseRecorder();
    await withQuietErrors(() => handler({ method: 'GET', query: {}, headers: {} }, response));
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.payload, {
      error: 'La línea de gestión agregada GRH no está disponible.',
      code: 'GRH_MANAGEMENT_TIMELINE_UNAVAILABLE',
    });
    assert.doesNotMatch(
      JSON.stringify(response.payload),
      /secret|person|private|stack|detail|message/i,
    );
  }
});
