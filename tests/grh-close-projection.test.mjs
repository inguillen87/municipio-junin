import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  GRH_CLOSE_SCHEMA_VERSION,
  inspectGrhCloseContract,
  validateGrhCloseContract,
} from '../api/lib/grh-close-contract.js';
import { buildGrhCloseProjection } from '../api/lib/grh-close-projection.js';

async function realSemantic() {
  return JSON.parse(await readFile(
    new URL('../api/_data/grh-semantic.json', import.meta.url),
    'utf8',
  ));
}

function assertDeepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}

function assertNoIdentityKeys(value) {
  const forbidden = /^(?:dni|cuit|cuil|legajo|employeeId|personId|companyCode|sourceCode|label|name|email|phone|address)$/i;
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.doesNotMatch(key, forbidden);
    assertNoIdentityKeys(child);
  }
}

function allNull(object) {
  return Object.values(object).every(value => value === null);
}

test('the real semantic v2 builds one exact, frozen monthly close contract', async () => {
  const semantic = await realSemantic();
  const original = structuredClone(semantic);
  const projection = buildGrhCloseProjection(semantic);

  assert.deepEqual(semantic, original, 'the projection must not mutate the private semantic artifact');
  assert.equal(projection.schemaVersion, GRH_CLOSE_SCHEMA_VERSION);
  assert.equal(projection.schemaVersion, 'grh-close-v1');
  assert.equal(projection.privacy.threshold, 10);
  assert.equal(projection.privacy.comparisonRule, 'both_consecutive_periods_released');
  assert.equal(projection.metric.currency, 'not_declared_in_source');
  assert.equal(projection.metric.status, 'calculation_control_not_bank_disbursement');
  assert.equal(projection.metric.interpretation, 'arithmetic_decomposition_not_causal_explanation');
  assert.deepEqual(projection.source, {
    canonicalSystem: semantic.source.canonical_system,
    sourceFile: semantic.source.file,
    sourceSha256: semantic.source.sha256,
    snapshotAsOf: semantic.source.snapshot_as_of,
    latestValidCalculationPeriod: semantic.payroll.latest_calculation_period,
    realtime: false,
  });
  assert.equal(projection.series.length, semantic.payroll.calculation_control_series.length);
  assert.equal(projection.series.filter(row => row.privacyStatus === 'released').length, 213);
  assert.equal(projection.series.filter(row => row.privacyStatus === 'suppressed').length, 3);
  assert.equal(validateGrhCloseContract(projection), true);
  assertNoIdentityKeys(projection);
  assertDeepFrozen(projection);
});

test('period reconciliation comes from the matching period and never from the global score', async () => {
  const semantic = await realSemantic();
  const globalAgreement = semantic.payroll.cross_source_reconciliation.value_agreement_pct;
  const latestPeriod = semantic.payroll.latest_calculation_period;
  const expected = semantic.payroll.cross_source_reconciliation.period_series
    .find(row => row.period === latestPeriod);
  const projection = buildGrhCloseProjection(semantic);
  const latest = projection.series.find(row => row.period === latestPeriod);

  assert.equal(
    latest.reconciliation.valueAgreementPct,
    Number(expected.value_agreement_pct.toFixed(4)),
  );
  assert.notEqual(latest.reconciliation.valueAgreementPct, globalAgreement);

  const changedGlobal = structuredClone(semantic);
  changedGlobal.payroll.cross_source_reconciliation.value_agreement_pct = 99;
  const independent = buildGrhCloseProjection(changedGlobal);
  assert.equal(
    independent.series.find(row => row.period === latestPeriod).reconciliation.valueAgreementPct,
    Number(expected.value_agreement_pct.toFixed(4)),
  );
});

test('small cells suppress every amount, control and reconciliation value', async () => {
  const semantic = await realSemantic();
  const previousPeriod = '2026-06';
  semantic.payroll.calculation_control_series
    .find(row => row.period === previousPeriod).distinct_payroll_participants = 9;

  const projection = buildGrhCloseProjection(semantic);
  const protectedRow = projection.series.find(row => row.period === previousPeriod);
  assert.deepEqual({
    participantCount: protectedRow.participantCount,
    participantDisplay: protectedRow.participantDisplay,
    privacyStatus: protectedRow.privacyStatus,
  }, {
    participantCount: null,
    participantDisplay: '<10',
    privacyStatus: 'suppressed',
  });
  assert.equal(allNull(protectedRow.components), true);
  assert.equal(allNull(protectedRow.control), true);
  assert.equal(allNull(protectedRow.reconciliation), true);
  assert.equal(projection.comparison.status, 'unavailable');
  assert.equal(projection.comparison.reason, 'privacy_protected');
  assert.equal(projection.comparison.participantDelta, null);
  assert.equal(allNull(projection.comparison.componentDeltas), true);
  assert.equal(allNull(projection.comparison.reconciliationDeltas), true);
  assert.equal(validateGrhCloseContract(projection), true);
});

test('latest comparison is arithmetic, consecutive and internally reconciled', async () => {
  const projection = buildGrhCloseProjection(await realSemantic());
  const comparison = projection.comparison;
  const previous = projection.series.find(row => row.period === comparison.previousPeriod);
  const current = projection.series.find(row => row.period === comparison.currentPeriod);

  assert.equal(comparison.status, 'released');
  assert.equal(comparison.reason, 'both_periods_released');
  assert.equal(comparison.previousPeriod, '2026-06');
  assert.equal(comparison.currentPeriod, '2026-07');
  assert.equal(comparison.participantDelta, current.participantCount - previous.participantCount);
  for (const key of Object.keys(comparison.componentDeltas)) {
    assert.equal(comparison.componentDeltas[key], current.components[key] - previous.components[key]);
  }
  assert.equal(
    comparison.reconciliationDeltas.valueAgreementPct,
    Number((current.reconciliation.valueAgreementPct - previous.reconciliation.valueAgreementPct).toFixed(4)),
  );
});

test('a missing immediate month never falls back to an older released period', async () => {
  const semantic = await realSemantic();
  semantic.payroll.calculation_control_series = semantic.payroll.calculation_control_series
    .filter(row => row.period !== '2026-06');

  const projection = buildGrhCloseProjection(semantic);
  assert.equal(projection.comparison.previousPeriod, '2026-06');
  assert.equal(projection.comparison.currentPeriod, '2026-07');
  assert.equal(projection.comparison.status, 'unavailable');
  assert.equal(projection.comparison.reason, 'period_missing');
  assert.equal(projection.comparison.participantDelta, null);
  assert.equal(allNull(projection.comparison.componentDeltas), true);
  assert.equal(allNull(projection.comparison.reconciliationDeltas), true);
  assert.equal(validateGrhCloseContract(projection), true);
});

test('the builder fails closed on missing, duplicate or malformed period reconciliation', async () => {
  const semantic = await realSemantic();
  const latest = semantic.payroll.latest_calculation_period;
  const scenarios = [];

  const missing = structuredClone(semantic);
  missing.payroll.cross_source_reconciliation.period_series =
    missing.payroll.cross_source_reconciliation.period_series.filter(row => row.period !== latest);
  scenarios.push(missing);

  const duplicate = structuredClone(semantic);
  duplicate.payroll.cross_source_reconciliation.period_series.push(structuredClone(
    duplicate.payroll.cross_source_reconciliation.period_series.find(row => row.period === latest),
  ));
  scenarios.push(duplicate);

  const outOfRange = structuredClone(semantic);
  outOfRange.payroll.cross_source_reconciliation.period_series
    .find(row => row.period === latest).value_agreement_pct = 101;
  scenarios.push(outOfRange);

  const brokenRunIdentity = structuredClone(semantic);
  brokenRunIdentity.payroll.cross_source_reconciliation.period_series
    .find(row => row.period === latest).matched_runs = 99;
  scenarios.push(brokenRunIdentity);

  for (const candidate of scenarios) {
    assert.throws(
      () => buildGrhCloseProjection(candidate),
      error => error?.code === 'GRH_CLOSE_SOURCE_INVALID',
    );
  }
});

test('the exact-key contract rejects disclosure, weakened policy and forged arithmetic', async () => {
  const projection = buildGrhCloseProjection(await realSemantic());

  const leakedLabel = structuredClone(projection);
  leakedLabel.series[0].label = 'persona privada';
  assert.ok(inspectGrhCloseContract(leakedLabel).errors.includes('series.row_structure'));

  const weakened = structuredClone(projection);
  weakened.privacy.threshold = 5;
  assert.ok(inspectGrhCloseContract(weakened).errors.includes('privacy.threshold'));

  const falseCurrency = structuredClone(projection);
  falseCurrency.metric.currency = 'ARS';
  assert.ok(inspectGrhCloseContract(falseCurrency).errors.includes('metric.currency'));

  const causal = structuredClone(projection);
  causal.metric.interpretation = 'causal_explanation';
  assert.ok(inspectGrhCloseContract(causal).errors.includes('metric.interpretation'));

  const protectedLeak = structuredClone(projection);
  const suppressed = protectedLeak.series.find(row => row.privacyStatus === 'suppressed');
  suppressed.components.netPayrollCents = 42;
  assert.ok(inspectGrhCloseContract(protectedLeak).errors.includes('series.suppressed_components'));

  const forgedDelta = structuredClone(projection);
  forgedDelta.comparison.componentDeltas.netPayrollCents += 1;
  assert.ok(inspectGrhCloseContract(forgedDelta).errors.includes('comparison.component_delta_identity'));
});
