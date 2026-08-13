import assert from 'node:assert/strict';
import test from 'node:test';

import { createGrhEmploymentReviewHandler } from '../api/grh-employment-review.js';
import { GRH_EMPLOYMENT_REVIEW_SCHEMA_VERSION } from '../api/lib/grh-employment-review-projection.js';

const SOURCE_SHA = 'a'.repeat(64);
const ARTIFACT = Object.freeze({
  source: Object.freeze({ sha256: SOURCE_SHA }),
});

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    payload: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function dependencies({ demo = false, contractOk = true, source = ARTIFACT } = {}) {
  return {
    requireCapabilityImpl: async (_req, _res, resource, action) => {
      assert.equal(resource, 'grh.organization.analytics');
      assert.equal(action, 'read');
      return { tenantId: 'tenant-junin', email: demo ? 'intendente@junin.gov.ar' : 'private@junin.gov.ar' };
    },
    requireDatasetTenantImpl: () => true,
    readSnapshotImpl: async ({ tenantId }) => {
      assert.equal(tenantId, 'tenant-junin');
      return source;
    },
    inspectArtifactImpl: () => ({ ok: true }),
    buildProjectionImpl: (_artifact, options) => ({
      schemaVersion: GRH_EMPLOYMENT_REVIEW_SCHEMA_VERSION,
      audience: options.audience,
    }),
    inspectContractImpl: () => ({ ok: contractOk }),
    isPublishedDemoIdentityImpl: email => email === 'intendente@junin.gov.ar',
    environment: { GRH_SOURCE_SHA256: SOURCE_SHA },
  };
}

test('employment review publishes private exact or portable protected audiences by identity', async t => {
  for (const [label, demo, expectedAudience] of [
    ['private', false, 'private'],
    ['published evaluation', true, 'portable'],
  ]) {
    await t.test(label, async () => {
      const response = responseRecorder();
      await createGrhEmploymentReviewHandler(dependencies({ demo }))(
        { method: 'GET', headers: {}, query: {} },
        response,
      );
      assert.equal(response.statusCode, 200);
      assert.equal(response.headers['x-municontrol-contract'], GRH_EMPLOYMENT_REVIEW_SCHEMA_VERSION);
      assert.equal(response.headers['cache-control'], 'no-store, private, max-age=0');
      assert.equal(response.payload.audience, expectedAudience);
    });
  }
});

test('employment review fails closed on source pin or contract drift and rejects writes', async t => {
  await t.test('source mismatch', async () => {
    const response = responseRecorder();
    await createGrhEmploymentReviewHandler(dependencies({
      source: { source: { sha256: 'b'.repeat(64) } },
    }))({ method: 'GET', headers: {}, query: {} }, response);
    assert.equal(response.statusCode, 503);
    assert.equal(response.payload.code, 'GRH_EMPLOYMENT_REVIEW_UNAVAILABLE');
  });

  await t.test('contract mismatch', async () => {
    const response = responseRecorder();
    await createGrhEmploymentReviewHandler(dependencies({ contractOk: false }))(
      { method: 'GET', headers: {}, query: {} },
      response,
    );
    assert.equal(response.statusCode, 503);
  });

  await t.test('write', async () => {
    const response = responseRecorder();
    await createGrhEmploymentReviewHandler(dependencies())(
      { method: 'POST', headers: {}, query: {} },
      response,
    );
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.allow, 'GET');
  });
});
