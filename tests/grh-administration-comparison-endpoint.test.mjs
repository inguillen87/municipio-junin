import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGrhAdministrationComparisonHandler,
  readGrhAdministrationComparisonAggregate,
} from '../api/grh-administration-comparison.js';
import {
  GRH_ADMINISTRATION_COMPARISON_SCHEMA_VERSION,
  inspectGrhAdministrationComparisonContract,
} from '../api/lib/grh-administration-comparison-contract.js';
import routePolicy from '../shared/route-policy.cjs';
import releaseTruth from '../shared/release-truth-contract.cjs';
import publishedDemoPolicy from '../shared/published-demo-policy.cjs';

const SOURCE_SHA = 'a'.repeat(64);
const CONTENT_SHA = 'b'.repeat(64);

function databaseRow(overrides = {}) {
  return {
    schema_version: 'grh-directory-v3',
    canonical_system: 'GRH Junín',
    source_sha256: SOURCE_SHA,
    content_sha256: CONTENT_SHA,
    snapshot_as_of: '2026-08-06',
    record_count: 2449,
    absence_record_count: 31553,
    materialized_people: 2449,
    unique_people: 2449,
    employment_people: 2449,
    digested_people: 2449,
    materialized_absence_events: 31553,
    current_event_rows: 5936,
    current_distinct_people: 752,
    current_reported_days: 65847n,
    current_known_event_rows: 5936,
    current_missing_event_rows: 0,
    current_reported_ingress_dates: 281,
    current_reported_exit_dates: 232,
    prior_event_rows: 3395,
    prior_distinct_people: 662,
    prior_reported_days: 52190n,
    prior_known_event_rows: 3395,
    prior_missing_event_rows: 0,
    prior_reported_ingress_dates: 216,
    prior_reported_exit_dates: 173,
    ...overrides,
  };
}

function aggregate() {
  return {
    source: {
      schemaVersion: 'grh-directory-v3', canonicalSystem: 'GRH Junín',
      sourceSha256: SOURCE_SHA, contentSha256: CONTENT_SHA,
      snapshotAsOf: '2026-08-06', recordCount: 2449, absenceEventCount: 31553,
    },
    identity: {
      materializedPeople: 2449, uniquePeople: 2449, employmentPeople: 2449,
      digestedPeople: 2449, materializedAbsenceEvents: 31553,
    },
    current: {
      eventRows: 5936, distinctPeople: 752, reportedDays: 65847,
      knownEventRows: 5936, missingEventRows: 0,
      reportedIngressDates: 281, reportedExitDates: 232,
    },
    prior: {
      eventRows: 3395, distinctPeople: 662, reportedDays: 52190,
      knownEventRows: 3395, missingEventRows: 0,
      reportedIngressDates: 216, reportedExitDates: 173,
    },
  };
}

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

function dependencies({ demo = false, source = aggregate(), contractOk = true } = {}) {
  return {
    requireCapabilityImpl: async (_req, _res, resource, action) => {
      assert.equal(resource, 'grh.organization.analytics');
      assert.equal(action, 'read');
      return {
        tenantId: 'tenant-junin',
        email: demo ? 'intendente@junin.gov.ar' : 'autoridad-privada@junin.gov.ar',
      };
    },
    requireDatasetTenantImpl: () => true,
    readAggregateImpl: async options => {
      assert.deepEqual(options, { tenantId: 'tenant-junin', sourceSha256: SOURCE_SHA });
      return source;
    },
    inspectContractImpl: contractOk
      ? inspectGrhAdministrationComparisonContract
      : () => ({ ok: false }),
    isPublishedDemoIdentityImpl: email => email === 'intendente@junin.gov.ar',
    environment: { GRH_SOURCE_SHA256: SOURCE_SHA },
  };
}

test('aggregate reader executes one tenant and source-bound statement with exact materialization identity', async () => {
  const calls = [];
  const result = await readGrhAdministrationComparisonAggregate({
    tenantId: 'tenant-junin',
    sourceSha256: SOURCE_SHA,
    queryImpl: async (sql, values) => {
      calls.push({ sql, values });
      return { rows: [databaseRow()] };
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].values, ['tenant-junin', SOURCE_SHA]);
  assert.match(calls[0].sql, /WHERE source\.tenant_id = \$1[\s\S]*source\.source_sha256 = \$2/);
  assert.match(calls[0].sql, /source\.schema_version = 'grh-directory-v3'/);
  assert.match(calls[0].sql, /DATE '2023-12-09', DATE '2026-08-06'/);
  assert.match(calls[0].sql, /DATE '2019-12-09', DATE '2022-08-06'/);
  assert.equal((calls[0].sql.match(/BETWEEN period\.start_date AND period\.end_date/g) || []).length, 3);
  assert.match(calls[0].sql, /COUNT\(DISTINCT \(people\.company_code, people\.legajo\)\)/);
  assert.match(calls[0].sql, /people\.content_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.doesNotMatch(calls[0].sql, /grh_directory_(?:dimensions|leave_events|movement_periods)/i);
  assert.deepEqual(result.current, {
    eventRows: 5936, distinctPeople: 752, reportedDays: 65847,
    knownEventRows: 5936, missingEventRows: 0,
    reportedIngressDates: 281, reportedExitDates: 232,
  });
  assert.equal(result.source.contentSha256, CONTENT_SHA);
  assert.doesNotMatch(JSON.stringify(result), /displayName|display_name|eventDate|event_date|cause/i);
});

test('aggregate reader rejects ambiguous results, invalid pins and unsafe numeric coercion', async t => {
  await t.test('invalid source pin before SQL', async () => {
    let reads = 0;
    await assert.rejects(readGrhAdministrationComparisonAggregate({
      tenantId: 'tenant-junin',
      sourceSha256: 'not-a-sha',
      queryImpl: async () => { reads += 1; return { rows: [databaseRow()] }; },
    }));
    assert.equal(reads, 0);
  });

  for (const rows of [[], [databaseRow(), databaseRow()]]) {
    await t.test(`${rows.length} rows`, async () => {
      await assert.rejects(readGrhAdministrationComparisonAggregate({
        tenantId: 'tenant-junin',
        sourceSha256: SOURCE_SHA,
        queryImpl: async () => ({ rows }),
      }));
    });
  }

  await t.test('unsafe bigint', async () => {
    await assert.rejects(readGrhAdministrationComparisonAggregate({
      tenantId: 'tenant-junin',
      sourceSha256: SOURCE_SHA,
      queryImpl: async () => ({ rows: [databaseRow({
        current_reported_days: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
      })] }),
    }));
  });
});

test('endpoint publishes private exact and portable governed projections with no-store headers', async t => {
  for (const [name, demo, audience] of [
    ['private', false, 'private'],
    ['portable', true, 'portable'],
  ]) {
    await t.test(name, async () => {
      const response = responseRecorder();
      await createGrhAdministrationComparisonHandler(dependencies({ demo }))(
        { method: 'GET', query: {}, headers: {} },
        response,
      );
      assert.equal(response.statusCode, 200);
      assert.equal(response.headers['x-municontrol-contract'],
        GRH_ADMINISTRATION_COMPARISON_SCHEMA_VERSION);
      assert.equal(response.headers['cache-control'], 'no-store, private, max-age=0');
      assert.equal(response.headers.vary, 'Authorization');
      assert.equal(response.payload.privacy.audience, audience);
      assert.equal(inspectGrhAdministrationComparisonContract(response.payload).ok, true);
    });
  }
});

test('endpoint is fixed GET-only and fails closed on query, source or contract drift', async t => {
  await t.test('write rejected before authentication', async () => {
    let authCalls = 0;
    const deps = dependencies();
    deps.requireCapabilityImpl = async () => { authCalls += 1; return null; };
    const response = responseRecorder();
    await createGrhAdministrationComparisonHandler(deps)(
      { method: 'POST', query: {}, headers: {} },
      response,
    );
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.allow, 'GET');
    assert.equal(authCalls, 0);
  });

  await t.test('caller cannot shift periods', async () => {
    const deps = dependencies();
    let reads = 0;
    deps.readAggregateImpl = async () => { reads += 1; return aggregate(); };
    const response = responseRecorder();
    await createGrhAdministrationComparisonHandler(deps)(
      { method: 'GET', query: { startDate: '2025-01-01' }, headers: {} },
      response,
    );
    assert.equal(response.statusCode, 400);
    assert.equal(response.payload.code, 'GRH_ADMINISTRATION_COMPARISON_QUERY_INVALID');
    assert.equal(reads, 0);
  });

  await t.test('source pin drift', async () => {
    const wrong = aggregate();
    wrong.source.sourceSha256 = 'c'.repeat(64);
    const response = responseRecorder();
    await createGrhAdministrationComparisonHandler(dependencies({ source: wrong }))(
      { method: 'GET', query: {}, headers: {} },
      response,
    );
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.payload, {
      error: 'La comparación de períodos administrativos no está disponible.',
      code: 'GRH_ADMINISTRATION_COMPARISON_UNAVAILABLE',
    });
  });

  await t.test('contract drift', async () => {
    const response = responseRecorder();
    await createGrhAdministrationComparisonHandler(dependencies({ contractOk: false }))(
      { method: 'GET', query: {}, headers: {} },
      response,
    );
    assert.equal(response.statusCode, 503);
  });

  await t.test('incomplete reported-day coverage', async () => {
    const incomplete = aggregate();
    incomplete.prior.knownEventRows = 3394;
    incomplete.prior.missingEventRows = 1;
    const response = responseRecorder();
    await createGrhAdministrationComparisonHandler(dependencies({ source: incomplete }))(
      { method: 'GET', query: {}, headers: {} },
      response,
    );
    assert.equal(response.statusCode, 503);
    assert.equal(response.payload.code, 'GRH_ADMINISTRATION_COMPARISON_UNAVAILABLE');
    assert.equal('comparison' in response.payload, false);
  });
});

test('route authorization and release truth reuse organization analytics exactly', () => {
  const route = routePolicy.resolveProtectedRoute(
    'serverless',
    'GET',
    '/api/grh-administration-comparison',
  );
  assert.deepEqual(route && {
    permission: route.permission,
    path: route.path,
  }, {
    permission: routePolicy.PERMISSIONS.GRH_ORGANIZATION_ANALYTICS_READ,
    path: '/grh-administration-comparison',
  });
  assert.equal(
    releaseTruth.API_CONTRACTS['/api/grh-administration-comparison'],
    GRH_ADMINISTRATION_COMPARISON_SCHEMA_VERSION,
  );

  const intendedProfile = publishedDemoPolicy.PUBLISHED_DEMO_PROFILES.find(
    profile => profile.role === 'INTENDENTE',
  );
  assert.deepEqual(
    publishedDemoPolicy.evaluatePublishedDemoRoute({
      ...intendedProfile,
      routeId: route.id,
    }),
    {
      applies: true,
      allowed: true,
      code: publishedDemoPolicy.PUBLISHED_DEMO_DECISION_CODES.ALLOWED,
      policyVersion: '2026-08-13.8',
    },
  );
});
