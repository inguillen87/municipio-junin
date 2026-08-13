import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createGrhAbsenceInsightsHandler,
  readGrhAbsenceInsightsArtifact,
} from '../api/grh-absence-insights.js';
import {
  GRH_ABSENCE_INSIGHTS_SCHEMA_VERSION,
  inspectGrhAbsenceInsightsContract,
} from '../api/lib/grh-absence-insights-contract.js';

const SOURCE_SHA = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';
const ARTIFACT = JSON.parse(await readFile(
  new URL('../api/_data/grh-absence-insights.json', import.meta.url),
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

function dependencies({ contractOk = true, artifact = ARTIFACT } = {}) {
  return {
    requireCapabilityImpl: async (_req, _res, resource, action) => {
      assert.equal(resource, 'grh.organization.analytics');
      assert.equal(action, 'read');
      return { tenantId: 'tenant-junin', email: 'autoridad@junin.gob.ar' };
    },
    requireDatasetTenantImpl: (_res, caller, name) => {
      assert.equal(caller.tenantId, 'tenant-junin');
      assert.equal(name, 'GRH_TENANT_ID');
      return true;
    },
    readArtifactImpl: async options => {
      assert.equal(options.expectedSourceSha256, SOURCE_SHA);
      assert.equal(options.environment.GRH_SOURCE_SHA256, SOURCE_SHA);
      return artifact;
    },
    inspectContractImpl: contractOk
      ? inspectGrhAbsenceInsightsContract
      : () => ({ ok: false }),
    environment: { GRH_SOURCE_SHA256: SOURCE_SHA },
  };
}

test('reusable server loader pins and validates the small aggregate artifact', async () => {
  const projection = await readGrhAbsenceInsightsArtifact({
    expectedSourceSha256: SOURCE_SHA,
  });
  assert.equal(projection.schemaVersion, GRH_ABSENCE_INSIGHTS_SCHEMA_VERSION);
  assert.equal(projection.comparison.current.events, 5936);
  assert.equal(Object.isFrozen(projection), true);

  await assert.rejects(
    readGrhAbsenceInsightsArtifact({ expectedSourceSha256: 'a'.repeat(64) }),
    error => error?.code === 'GRH_ABSENCE_INSIGHTS_SOURCE_MISMATCH',
  );
  await assert.rejects(
    readGrhAbsenceInsightsArtifact({ expectedSourceSha256: 'bad' }),
    error => error?.code === 'GRH_ABSENCE_INSIGHTS_SOURCE_PIN_INVALID',
  );
  await assert.rejects(
    readGrhAbsenceInsightsArtifact({
      expectedSourceSha256: SOURCE_SHA,
      readFileImpl: async () => '{not-json',
    }),
    error => error?.code === 'GRH_ABSENCE_INSIGHTS_ARTIFACT_INVALID',
  );
});

test('endpoint is GET-only, fixed-query, authenticated and no-store', async () => {
  const response = responseRecorder();
  await createGrhAbsenceInsightsHandler(dependencies())(
    { method: 'GET', query: {}, headers: {} },
    response,
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-municontrol-contract'], GRH_ABSENCE_INSIGHTS_SCHEMA_VERSION);
  assert.equal(response.headers['cache-control'], 'no-store, private, max-age=0');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers.vary, 'Authorization');
  assert.equal(inspectGrhAbsenceInsightsContract(response.payload).ok, true);

  let authCalls = 0;
  const writeDeps = dependencies();
  writeDeps.requireCapabilityImpl = async () => { authCalls += 1; return null; };
  const writeResponse = responseRecorder();
  await createGrhAbsenceInsightsHandler(writeDeps)(
    { method: 'POST', query: {}, headers: {} },
    writeResponse,
  );
  assert.equal(writeResponse.statusCode, 405);
  assert.equal(writeResponse.headers.allow, 'GET');
  assert.equal(authCalls, 0);

  let artifactReads = 0;
  const queryDeps = dependencies();
  queryDeps.readArtifactImpl = async () => { artifactReads += 1; return ARTIFACT; };
  const queryResponse = responseRecorder();
  await createGrhAbsenceInsightsHandler(queryDeps)(
    { method: 'GET', query: { from: '2025-01-01' }, headers: {} },
    queryResponse,
  );
  assert.equal(queryResponse.statusCode, 400);
  assert.equal(queryResponse.payload.code, 'GRH_ABSENCE_INSIGHTS_QUERY_INVALID');
  assert.equal(artifactReads, 0);
});

test('endpoint fails closed with one detail-free response on pin, artifact or contract drift', async t => {
  const cases = [
    ['missing pin', { ...dependencies(), environment: {} }],
    ['artifact failure', {
      ...dependencies(),
      readArtifactImpl: async () => { throw new Error('private file detail'); },
    }],
    ['contract failure', dependencies({ contractOk: false })],
  ];
  for (const [name, deps] of cases) {
    await t.test(name, async () => {
      const response = responseRecorder();
      const previous = console.error;
      console.error = () => {};
      try {
        await createGrhAbsenceInsightsHandler(deps)(
          { method: 'GET', query: {}, headers: {} },
          response,
        );
      } finally {
        console.error = previous;
      }
      assert.equal(response.statusCode, 503);
      assert.deepEqual(response.payload, {
        error: 'La lectura explicada de ausencias no está disponible.',
        code: 'GRH_ABSENCE_INSIGHTS_UNAVAILABLE',
      });
      assert.equal(JSON.stringify(response.payload).includes('private file detail'), false);
    });
  }
});
