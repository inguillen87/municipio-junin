import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGrhEmploymentReviewHandler,
  readGrhEmploymentReviewAggregate,
} from '../api/grh-employment-review.js';
import { GRH_EMPLOYMENT_REVIEW_SCHEMA_VERSION } from '../api/lib/grh-employment-review-projection.js';

const SOURCE_SHA = 'a'.repeat(64);
const AGGREGATE = Object.freeze({
  source: Object.freeze({ sourceSha256: SOURCE_SHA }),
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

function dependencies({ demo = false, contractOk = true, source = AGGREGATE } = {}) {
  return {
    requireCapabilityImpl: async (_req, _res, resource, action) => {
      assert.equal(resource, 'grh.organization.analytics');
      assert.equal(action, 'read');
      return { tenantId: 'tenant-junin', email: demo ? 'intendente@junin.gov.ar' : 'private@junin.gov.ar' };
    },
    requireDatasetTenantImpl: () => true,
    readAggregateImpl: async ({ tenantId }) => {
      assert.equal(tenantId, 'tenant-junin');
      return source;
    },
    buildProjectionImpl: (_aggregate, options) => ({
      schemaVersion: GRH_EMPLOYMENT_REVIEW_SCHEMA_VERSION,
      audience: options.audience,
    }),
    inspectContractImpl: () => ({ ok: contractOk }),
    isPublishedDemoIdentityImpl: email => email === 'intendente@junin.gov.ar',
    environment: { GRH_SOURCE_SHA256: SOURCE_SHA },
  };
}

test('employment review reads only tenant-bound aggregate counts from the v3 publication', async () => {
  const aggregate = await readGrhEmploymentReviewAggregate({
    tenantId: 'tenant-junin',
    queryImpl: async (sql, values) => {
      assert.match(sql, /FROM grh_directory_sources source/i);
      assert.match(sql, /LEFT JOIN grh_directory_people people/i);
      assert.match(sql, /WHERE source\.tenant_id = \$1/i);
      assert.deepEqual(values, ['tenant-junin']);
      return { rows: [{
        schema_version: 'grh-directory-v3',
        canonical_system: 'GRH Junín',
        source_sha256: SOURCE_SHA,
        snapshot_as_of: '2026-08-06',
        record_count: 2449,
        materialized_people: 2449,
        employment_people: 2449,
        reference_period_count: 1,
        reference_period: '2026-07',
        reported_current_without_reference_payroll: 19,
        reported_ended_with_reference_payroll: 7,
        uncertain_status_with_reference_payroll: 1,
      }] };
    },
  });
  assert.equal(aggregate.totalDirectoryPeople, 2449);
  assert.deepEqual(Object.values(aggregate.counts), [19, 7, 1]);
  assert.doesNotMatch(JSON.stringify(aggregate), /display_name|legajo|company_code/i);
});

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
      source: { source: { sourceSha256: 'b'.repeat(64) } },
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
