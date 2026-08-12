import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildPortableGrhViews } from '../api/lib/grh-portable-bundle.js';
import routePolicy from '../shared/route-policy.cjs';
import {
  buildGrhExecutiveReport,
  createReportsHandler,
} from '../api/reports.js';

const PROFILE_URL = new URL('../api/_data/grh-profile.json', import.meta.url);
const SEMANTIC_URL = new URL('../api/_data/grh-semantic.json', import.meta.url);
const HAS_PRIVATE_GRH = existsSync(PROFILE_URL) && existsSync(SEMANTIC_URL);

function realBundle() {
  const profile = JSON.parse(readFileSync(PROFILE_URL, 'utf8'));
  const semantic = JSON.parse(readFileSync(SEMANTIC_URL, 'utf8'));
  return {
    profile,
    semantic,
    provenance: {
      sourceFile: profile.source,
      sourceSha256: profile.sha256,
      approvedSourceSha256: profile.sha256,
      snapshotAsOf: profile.snapshot_as_of,
      profileSchemaVersion: profile.schema_version,
      semanticSchemaVersion: semantic.schema_version,
    },
  };
}

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

function guardedHandler(bundle = realBundle()) {
  const calls = [];
  const handler = createReportsHandler({
    requireCapabilityImpl: async (_req, _res, resource, action) => {
      calls.push(['capability', resource, action]);
      return { id: 'official-1', role: 'INTENDENTE', tenantId: 'tenant-grh-test' };
    },
    requireDatasetTenantImpl: (_res, user, envName) => {
      calls.push(['tenant', user.tenantId, envName]);
      return true;
    },
    readArtifactBundleImpl: async tenantId => {
      calls.push(['bundle', tenantId]);
      return bundle;
    },
  });
  return { handler, calls };
}

test('reports is GET-only, reads one governed bundle and has no SQL or artifact fallback', async () => {
  const source = await readFile(new URL('../api/reports.js', import.meta.url), 'utf8');
  assert.match(source, /readGrhArtifactBundle/);
  assert.match(source, /buildPortableGrhViews/);
  assert.match(source, /RESOURCES\.GRH_REPORT/);
  assert.match(source, /ACTIONS\.READ/);
  assert.doesNotMatch(source, /readGrhArtifact\(|from ['"]pg['"]|\bPool\b|\bdata_points\b|DATABASE_URL/i);
  assert.doesNotMatch(source, /INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|UPSERT|CREATE\s+TABLE/i);

  const { handler } = guardedHandler(HAS_PRIVATE_GRH ? realBundle() : {});
  const response = responseRecorder();
  await handler({ method: 'POST', query: {}, headers: {} }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.payload.code, 'METHOD_NOT_ALLOWED');
});

test('reports emits only portable k=10 rankings and released compensation periods', { skip: !HAS_PRIVATE_GRH }, () => {
  const bundle = realBundle();
  const views = buildPortableGrhViews(bundle);
  const report = buildGrhExecutiveReport(bundle, null, '2026-08-08T15:00:00.000Z');
  const serialized = JSON.stringify(report);
  const releasedPeriods = views.executive.compensation.series
    .filter(row => row.privacyStatus === 'released')
    .map(row => row.period);

  assert.equal(report.schemaVersion, 'grh-executive-report-v2');
  assert.equal(report.source.semanticSchemaVersion, 'grh-semantic-v2');
  assert.equal(report.source.executiveSchemaVersion, 'grh-executive-v2');
  assert.equal(report.source.qualitySchemaVersion, 'grh-quality-v1');
  assert.equal(report.source.privacyPolicyVersion, 'grh-small-cell-v1');
  assert.equal(report.source.portableThreshold, 10);
  assert.deepEqual(report.availablePeriods, releasedPeriods);
  assert.equal(report.calculationControl.privacyStatus, 'released');
  assert.equal(report.calculationControl.distinctPayrollParticipants >= 10, true);
  assert.equal(report.calculationControl.components.every(row => Number.isSafeInteger(row.valueCents)), true);
  assert.equal(report.workforce.distributionBySector.threshold, 10);
  assert.equal(report.workforce.distributionBySector.participants.every(row =>
    row.participants >= 10 && !Object.hasOwn(row, 'sourceCode') && !Object.hasOwn(row, 'companyCode')), true);
  assert.match(report.executiveSummary[0], /856 personas.*\+1 \(\+0,12%\).*2026-06/i);
  assert.match(report.executiveSummary[1], /OBRERO.*220 personas.*25,7%/i);
  assert.match(report.executiveSummary[2], /consistencia entre fuentes.*63,88\/100.*no acredita un pago bancario/i);
  assert.doesNotMatch(serialized, /"sourceCode"|"companyCode"|"dni"|"cuil"|data_points/i);
  assert.doesNotMatch(serialized, /calculationRows|controlRows|netIdentityVarianceCents|netToPayVarianceCents|roundingToleranceCents/i);
});

test('reports preserves approved provenance and honest financial definitions', { skip: !HAS_PRIVATE_GRH }, () => {
  const bundle = realBundle();
  const report = buildGrhExecutiveReport(bundle);
  assert.equal(report.source.approvedSha256, bundle.profile.sha256);
  assert.equal(report.source.snapshotAsOf, bundle.profile.snapshot_as_of);
  assert.equal(report.source.aggregateOnly, true);
  assert.equal(report.source.containsPii, false);
  assert.deepEqual(report.source.excludedSources, ['personas_junin']);
  assert.equal(report.calculationControl.currency, 'not_declared_in_source');
  assert.equal(report.calculationControl.amountUnit, 'source_currency_cents');
  assert.equal(report.calculationControl.metricStatus, 'calculation_control_not_bank_disbursement');
  assert.match(report.caveats.join(' '), /k=10/);
  assert.match(report.caveats.join(' '), /no acredita pago bancario/i);
});

test('reports requires capability and tenant before exactly one bundle read', { skip: !HAS_PRIVATE_GRH }, async () => {
  const originalTenant = process.env.GRH_TENANT_ID;
  process.env.GRH_TENANT_ID = 'tenant-grh-test';
  try {
    const { handler, calls } = guardedHandler();
    const response = responseRecorder();
    await handler({ method: 'GET', query: {}, headers: {} }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls, [
      ['capability', routePolicy.RESOURCES.GRH_REPORT, routePolicy.ACTIONS.READ],
      ['tenant', 'tenant-grh-test', 'GRH_TENANT_ID'],
      ['bundle', 'tenant-grh-test'],
    ]);
    assert.equal(response.payload.dataStatus.source, 'grh-executive-portable');
    assert.equal(response.headers['cache-control'], 'no-store, private, max-age=0');
  } finally {
    if (originalTenant === undefined) delete process.env.GRH_TENANT_ID;
    else process.env.GRH_TENANT_ID = originalTenant;
  }
});

test('reports never substitutes a suppressed or absent period', { skip: !HAS_PRIVATE_GRH }, async () => {
  const bundle = realBundle();
  const suppressed = buildPortableGrhViews(bundle).executive.compensation.series
    .find(row => row.privacyStatus === 'suppressed');
  assert.ok(suppressed?.period);
  const originalTenant = process.env.GRH_TENANT_ID;
  process.env.GRH_TENANT_ID = 'tenant-grh-test';
  try {
    const { handler } = guardedHandler(bundle);
    const response = responseRecorder();
    await handler({ method: 'GET', query: { period: suppressed.period }, headers: {} }, response);
    assert.equal(response.statusCode, 404);
    assert.equal(response.payload.code, 'GRH_REPORT_PERIOD_UNAVAILABLE');
    assert.equal(response.payload.dataStatus.period, suppressed.period);
    assert.match(response.payload.dataStatus.warning, /no se sustituyó/i);
    assert.doesNotMatch(JSON.stringify(response.payload), /participantCount|amounts|valueCents/i);
  } finally {
    if (originalTenant === undefined) delete process.env.GRH_TENANT_ID;
    else process.env.GRH_TENANT_ID = originalTenant;
  }
});

test('reports fails closed on provenance drift without leaking bundle detail', { skip: !HAS_PRIVATE_GRH }, async () => {
  const bundle = realBundle();
  bundle.provenance.approvedSourceSha256 = 'b'.repeat(64);
  const originalTenant = process.env.GRH_TENANT_ID;
  process.env.GRH_TENANT_ID = 'tenant-grh-test';
  try {
    const { handler } = guardedHandler(bundle);
    const response = responseRecorder();
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      await handler({ method: 'GET', query: {}, headers: {} }, response);
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(response.statusCode, 503);
    assert.equal(response.payload.code, 'GRH_REPORT_CONTRACT_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(response.payload), /stack|sourceSha256|profile|semantic/i);
  } finally {
    if (originalTenant === undefined) delete process.env.GRH_TENANT_ID;
    else process.env.GRH_TENANT_ID = originalTenant;
  }
});
