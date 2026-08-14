import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  GRH_MOVEMENT_OPERATIONS_RESOURCE,
  createGrhMovementOperationsHandler,
} from '../api/grh-movement-operations.js';
import {
  GRH_MOVEMENT_OPERATIONS_LIMITS,
  GRH_MOVEMENT_OPERATIONS_METRIC,
  GRH_MOVEMENT_OPERATIONS_POLICY_VERSION,
  GRH_MOVEMENT_OPERATIONS_SCHEMA_VERSION,
  buildGrhMovementOperationsActions,
  inspectGrhMovementOperationsContract,
} from '../api/lib/grh-movement-operations-contract.js';
import { buildGrhMovementOperationsProjection } from '../api/lib/grh-movement-operations.js';
import routePolicy from '../shared/route-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';

const SOURCE_SHA = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';

async function realSemantic() {
  return JSON.parse(await readFile(
    new URL('../api/_data/grh-semantic.json', import.meta.url),
    'utf8',
  ));
}

function responseRecorder() {
  return {
    statusCode: null,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

async function withQuietErrors(callback) {
  const original = console.error;
  console.error = () => {};
  try {
    return await callback();
  } finally {
    console.error = original;
  }
}

test('real semantic source builds the exact annual movement decision contract', async () => {
  const projection = buildGrhMovementOperationsProjection(await realSemantic());
  assert.deepEqual(inspectGrhMovementOperationsContract(projection, {
    expectedSourceSha256: SOURCE_SHA,
    expectedSnapshotAsOf: '2026-08-06',
  }), { ok: true, errors: [] });
  assert.equal(projection.schemaVersion, GRH_MOVEMENT_OPERATIONS_SCHEMA_VERSION);
  assert.equal(projection.policyVersion, GRH_MOVEMENT_OPERATIONS_POLICY_VERSION);
  assert.deepEqual(projection.metric, GRH_MOVEMENT_OPERATIONS_METRIC);
  assert.deepEqual(projection.actions,
    buildGrhMovementOperationsActions(projection.summary.defaultComparison));
  assert.deepEqual(projection.limits, GRH_MOVEMENT_OPERATIONS_LIMITS);
  assert.deepEqual(projection.source, {
    canonicalSystem: 'GRH Junín',
    sourceFile: 'grh_junin.backup_2026080615_plataforma.sql.gz',
    sourceSha256: SOURCE_SHA,
    snapshotAsOf: '2026-08-06',
    generatedAt: '2026-08-09T02:12:13.748Z',
    realtime: false,
    sourceTable: 'legamov',
  });
  assert.deepEqual(projection.coverage, {
    sourceRows: 489681,
    validRows: 489455,
    quarantineRows: 226,
    validRatePct: 99.9538,
    validPeriods: 217,
    firstValidPeriod: '2008-01',
    lastValidPeriod: '2026-08',
    matchedRows: 489681,
    orphanRows: 0,
    joinIntegrityPct: 100,
    distinctEmployeeKeys: 2094,
    employeeCoveragePct: 85.4694,
  });
  assert.deepEqual(projection.summary, {
    firstYear: '2008',
    lastObservedYear: '2026',
    lastObservedYearStatus: 'partial',
    latestCompleteYear: '2025',
    yearsAvailable: 19,
    releasedYears: 19,
    protectedYears: 0,
    latestCompleteEvents: 35843,
    latestCompleteParticipants: 933,
    latestCompleteEventsPerParticipant: 38.4169,
    defaultComparison: {
      fromYear: '2024',
      toYear: '2025',
      status: 'available',
      eventDelta: -1176,
      eventDeltaPct: -3.1767,
      participantDelta: 64,
      participantDeltaPct: 7.3648,
      intensityDelta: -4.1826,
      intensityDeltaPct: -9.8184,
    },
  });
  assert.equal(projection.series.at(-1).status, 'partial');
  assert.equal(projection.series.at(-1).year, '2026');
  assert.equal(projection.series.at(-1).events, 27417);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.series), true);
});

test('comparison uses only the last two released complete years and never annualizes the partial snapshot year', async () => {
  const projection = buildGrhMovementOperationsProjection(await realSemantic());
  assert.deepEqual(projection.summary.defaultComparison, {
    fromYear: '2024',
    toYear: '2025',
    status: 'available',
    eventDelta: -1176,
    eventDeltaPct: -3.1767,
    participantDelta: 64,
    participantDeltaPct: 7.3648,
    intensityDelta: -4.1826,
    intensityDeltaPct: -9.8184,
  });
  const partial = projection.series.find(row => row.year === '2026');
  assert.deepEqual(partial, {
    year: '2026',
    status: 'partial',
    events: 27417,
    participants: 910,
    eventsPerParticipant: 30.1286,
    privacyStatus: 'released',
  });

  const forged = structuredClone(projection);
  forged.series.at(-1).status = 'complete';
  forged.summary.lastObservedYearStatus = 'complete';
  forged.summary.latestCompleteYear = '2026';
  assert.equal(inspectGrhMovementOperationsContract(forged).ok, false);
});

test('assistant action follows the released complete-year comparison instead of fixed calendar years', () => {
  const comparison = {
    fromYear: '2025', toYear: '2026', status: 'available',
    eventDelta: 1, eventDeltaPct: 1, participantDelta: 1,
    participantDeltaPct: 1, intensityDelta: 1, intensityDeltaPct: 1,
  };
  assert.deepEqual(buildGrhMovementOperationsActions(comparison)[0], {
    id: 'ask_movement_assistant',
    label: 'Comparar 2025 y 2026 con BOT IA',
    href: '/ia.html?question=Compar%C3%A1%20movimientos%202025%20y%202026',
    requiredCapability: 'navigation.ai-assistant',
  });
  assert.deepEqual(buildGrhMovementOperationsActions({ status: 'unavailable' })[0], {
    id: 'ask_movement_assistant',
    label: 'Consultar movimientos con BOT IA',
    href: '/ia.html?question=Qu%C3%A9%20movimientos%20hist%C3%B3ricos%20est%C3%A1n%20disponibles',
    requiredCapability: 'navigation.ai-assistant',
  });
});

test('below-k movement years receive complementary protection and all protected metrics are null', async () => {
  const semantic = await realSemantic();
  semantic.movements.distinct_participants_by_year['2008'] = 9;
  const projection = buildGrhMovementOperationsProjection(semantic);
  const protectedRows = projection.series.filter(row => row.privacyStatus === 'protected');
  assert.equal(protectedRows.length, 2);
  assert.deepEqual(protectedRows.map(row => row.year), ['2008', '2009']);
  assert.equal(protectedRows.every(row => (
    row.events === null && row.participants === null && row.eventsPerParticipant === null
  )), true);
  assert.equal(projection.summary.protectedYears, 2);
  assert.equal(projection.summary.releasedYears, 17);
  assert.equal(inspectGrhMovementOperationsContract(projection).ok, true);

  const disclosed = structuredClone(projection);
  disclosed.series[0].events = 2214;
  assert.equal(inspectGrhMovementOperationsContract(disclosed).ok, false);

  const singleProtected = structuredClone(projection);
  const companion = singleProtected.series[1];
  companion.privacyStatus = 'released';
  companion.events = 7839;
  companion.participants = 567;
  companion.eventsPerParticipant = 13.8254;
  singleProtected.summary.protectedYears = 1;
  singleProtected.summary.releasedYears = 18;
  assert.equal(inspectGrhMovementOperationsContract(singleProtected).ok, false);
});

test('default comparison is unavailable when fewer than two complete years are released', async () => {
  const semantic = await realSemantic();
  for (const year of Object.keys(semantic.movements.distinct_participants_by_year)) {
    if (year < '2025') semantic.movements.distinct_participants_by_year[year] = 9;
  }
  const projection = buildGrhMovementOperationsProjection(semantic);
  assert.equal(projection.summary.latestCompleteYear, '2025');
  assert.equal(projection.summary.protectedYears, 17);
  assert.deepEqual(projection.summary.defaultComparison, {
    fromYear: null,
    toYear: null,
    status: 'unavailable',
    eventDelta: null,
    eventDeltaPct: null,
    participantDelta: null,
    participantDeltaPct: null,
    intensityDelta: null,
    intensityDeltaPct: null,
  });
  assert.equal(inspectGrhMovementOperationsContract(projection).ok, true);
});

test('contract rejects shape drift, count drift, source drift and forged comparisons', async () => {
  const projection = buildGrhMovementOperationsProjection(await realSemantic());
  const mutations = [
    value => { value.extra = true; },
    value => { value.series[0].legajo = 123; },
    value => { value.coverage.sourceRows += 1; },
    value => { value.coverage.validRows += 1; value.coverage.sourceRows += 1; value.coverage.validRatePct = Number((value.coverage.validRows / value.coverage.sourceRows * 100).toFixed(4)); },
    value => { value.summary.yearsAvailable -= 1; },
    value => { value.summary.defaultComparison.eventDelta += 1; },
    value => { value.source.sourceSha256 = 'b'.repeat(64); },
    value => { value.metric.classificationStatus = 'hires_and_exits'; },
    value => { value.actions[0].href = 'https://external.example'; },
    value => { value.limits.privacyThreshold = 5; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(projection);
    mutate(candidate);
    assert.equal(inspectGrhMovementOperationsContract(candidate, {
      expectedSourceSha256: SOURCE_SHA,
      expectedSnapshotAsOf: '2026-08-06',
    }).ok, false);
  }
});

test('projection fails closed when movement, temporal and coverage source counts diverge', async () => {
  for (const mutate of [
    semantic => { semantic.movements.valid_rows -= 1; },
    semantic => { semantic.period_quality.legamov.rows += 1; },
    semantic => { semantic.coverage.facts.legamov.orphan_rows += 1; },
  ]) {
    const semantic = await realSemantic();
    mutate(semantic);
    assert.throws(() => buildGrhMovementOperationsProjection(semantic), error => (
      typeof error?.code === 'string' && error.code.startsWith('GRH_MOVEMENT_OPERATIONS_')
    ));
  }
});

test('endpoint is exact GET-only, queryless, capability-bound, tenant-bound and no-store', async () => {
  const semantic = await realSemantic();
  const calls = [];
  const handler = createGrhMovementOperationsHandler({
    requireCapabilityImpl: async (_req, _res, resource, action) => {
      calls.push(['capability', resource, action]);
      return { role: 'INTENDENTE', tenantId: 'tenant-junin' };
    },
    requireDatasetTenantImpl: (_res, caller, envName) => {
      calls.push(['tenant', caller.tenantId, envName]);
      return true;
    },
    readArtifactBundleImpl: async tenantId => {
      calls.push(['read', tenantId]);
      return { semantic };
    },
  });
  const response = responseRecorder();
  await handler({ method: 'GET', query: {}, headers: {} }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.schemaVersion, GRH_MOVEMENT_OPERATIONS_SCHEMA_VERSION);
  assert.equal(response.headers['x-municontrol-contract'],
    releaseTruthContract.API_CONTRACTS['/api/grh-movement-operations']);
  assert.equal(response.headers['cache-control'], 'no-store, private, max-age=0');
  assert.equal(response.headers.pragma, 'no-cache');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers.vary, 'Authorization');
  assert.deepEqual(calls, [
    ['capability', GRH_MOVEMENT_OPERATIONS_RESOURCE, routePolicy.ACTIONS.READ],
    ['tenant', 'tenant-junin', 'GRH_TENANT_ID'],
    ['read', 'tenant-junin'],
  ]);
  assert.equal(GRH_MOVEMENT_OPERATIONS_RESOURCE, routePolicy.RESOURCES.GRH_ORGANIZATION_ANALYTICS);

  let authCalls = 0;
  const rejected = createGrhMovementOperationsHandler({
    requireCapabilityImpl: async () => { authCalls += 1; return null; },
  });
  const methodResponse = responseRecorder();
  await rejected({ method: 'POST', query: {} }, methodResponse);
  assert.equal(methodResponse.statusCode, 405);
  assert.equal(methodResponse.headers.allow, 'GET');
  const queryResponse = responseRecorder();
  await rejected({ method: 'GET', query: { year: '2025' } }, queryResponse);
  assert.equal(queryResponse.statusCode, 400);
  assert.equal(queryResponse.payload.code, 'GRH_MOVEMENT_OPERATIONS_QUERY_UNSUPPORTED');
  assert.equal(authCalls, 0);
});

test('endpoint denies before reads and redacts all unavailable dependency details', async () => {
  let reads = 0;
  const denied = createGrhMovementOperationsHandler({
    requireCapabilityImpl: async (_req, res) => {
      res.status(403).json({ code: 'ROUTE_PERMISSION_DENIED' });
      return null;
    },
    readArtifactBundleImpl: async () => { reads += 1; return {}; },
  });
  const deniedResponse = responseRecorder();
  await denied({ method: 'GET', query: {} }, deniedResponse);
  assert.equal(deniedResponse.statusCode, 403);
  assert.equal(reads, 0);

  await withQuietErrors(async () => {
    for (const scenario of [
      {
        read: async () => { throw new Error('private database detail'); },
      },
      {
        read: async () => ({ semantic: await realSemantic() }),
        inspect: () => ({ ok: false, errors: ['private.contract.detail'] }),
      },
      {
        read: async () => ({ semantic: null }),
      },
    ]) {
      const handler = createGrhMovementOperationsHandler({
        requireCapabilityImpl: async () => ({ role: 'INTENDENTE', tenantId: 'tenant-junin' }),
        requireDatasetTenantImpl: () => true,
        readArtifactBundleImpl: scenario.read,
        inspectContractImpl: scenario.inspect,
      });
      const response = responseRecorder();
      await handler({ method: 'GET', query: {} }, response);
      assert.equal(response.statusCode, 503);
      assert.deepEqual(response.payload, {
        error: 'El centro de movimientos GRH no esta disponible.',
        code: 'GRH_MOVEMENT_OPERATIONS_UNAVAILABLE',
      });
      assert.doesNotMatch(JSON.stringify(response.payload), /private|database|contract.detail/i);
    }
  });
});
