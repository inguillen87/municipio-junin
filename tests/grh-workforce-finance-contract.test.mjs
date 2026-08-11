import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  GRH_WORKFORCE_FINANCE_ARTIFACT_KEY,
  GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
  GRH_WORKFORCE_FINANCE_APPROVED_SOURCE,
  GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION,
  canonicalGrhWorkforceFinanceReleaseJson,
  computeGrhWorkforceFinanceContentDigest,
  computeGrhWorkforceFinanceReleaseId,
  inspectGrhWorkforceFinanceSourceContract,
} from '../api/lib/grh-workforce-finance-source-contract.js';
import {
  GRH_WORKFORCE_FINANCE_SCHEMA_VERSION,
  computeGrhWorkforceFinanceProjectionReleaseId,
  inspectGrhWorkforceFinanceContract,
} from '../api/lib/grh-workforce-finance-contract.js';
import {
  buildGrhWorkforceFinanceProjection,
} from '../api/lib/grh-workforce-finance-projection.js';

const PRESENTATION = Object.freeze({
  schemaVersion: 'tenant-presentation-v1',
  locale: 'es-AR',
  displayCurrencyCode: 'ARS',
  basis: 'tenant_configuration',
  effectiveFrom: '2026-08-10',
  sourceCurrencyStatus: 'not_declared_in_source',
});
const python = process.platform === 'win32' ? 'python' : 'python3';
const repositoryRoot = path.resolve(import.meta.dirname, '..');

async function realSource() {
  return JSON.parse(await readFile(
    new URL('../api/_data/grh-workforce-finance.json', import.meta.url),
    'utf8',
  ));
}

function assertDeepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}

function firstReleasedCell(source) {
  return source.dimension_views
    .flatMap(view => view.periods)
    .flatMap(period => period.cells)
    .find(cell => cell.privacy_status === 'released');
}

function firstMaskedCell(source) {
  return source.dimension_views
    .flatMap(view => view.periods)
    .flatMap(period => period.cells)
    .find(cell => cell.participant_privacy_status === 'protected_difference_attack');
}

test('the real governed artifact and frozen ARS presentation pass both exact contracts', async () => {
  const source = await realSource();
  const original = structuredClone(source);
  const sourceInspection = inspectGrhWorkforceFinanceSourceContract(source);
  const projection = buildGrhWorkforceFinanceProjection(source, { presentation: PRESENTATION });

  assert.equal(GRH_WORKFORCE_FINANCE_ARTIFACT_KEY, 'workforce_finance');
  assert.equal(source.release_id, GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID);
  assert.equal(source.schema_version, GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION);
  assert.equal(sourceInspection.ok, true, sourceInspection.errors.join(','));
  assert.deepEqual(source, original, 'projection must not mutate the governed source artifact');
  assert.equal(projection.schemaVersion, GRH_WORKFORCE_FINANCE_SCHEMA_VERSION);
  assert.equal(projection.metric.sourceCurrencyStatus, 'not_declared_in_source');
  assert.equal(projection.metric.presentationCurrency, 'ARS');
  assert.equal(projection.metric.presentationCurrencyBasis, 'tenant_configuration');
  assert.equal(projection.periodTotals.length, 24);
  assert.deepEqual(projection.dimensionViews.map(view => view.dimension), [
    'sector', 'costCenter', 'agreement',
  ]);
  assert.equal(inspectGrhWorkforceFinanceContract(projection).ok, true);
  assertDeepFrozen(projection);
});

test('content-addressed release rejects coordinated cent drift and is projection-recomputable', async () => {
  const source = await realSource();
  const tampered = structuredClone(source);
  tampered.period_totals[0].components.employer_contributions_cents += 1;
  for (const view of tampered.dimension_views) {
    const protectedCell = view.periods[0].cells.find(
      cell => cell.privacy_status === 'protected_aggregate',
    );
    assert.ok(protectedCell);
    protectedCell.components.employer_contributions_cents += 1;
  }
  assert.ok(inspectGrhWorkforceFinanceSourceContract(tampered).errors.includes(
    'release.identity',
  ));

  const tamperedRelease = computeGrhWorkforceFinanceReleaseId(tampered);
  assert.notEqual(tamperedRelease, GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID);
  tampered.release_id = tamperedRelease;
  assert.equal(inspectGrhWorkforceFinanceSourceContract(tampered).ok, true);
  const projection = buildGrhWorkforceFinanceProjection(tampered, { presentation: PRESENTATION });
  assert.equal(computeGrhWorkforceFinanceProjectionReleaseId(projection), tamperedRelease);
  assert.equal(inspectGrhWorkforceFinanceContract(projection).ok, true);
});

test('Python and JavaScript share one semantic canonical JSON and release digest', async () => {
  const source = await realSource();
  const program = String.raw`
import json
from pathlib import Path
from scripts.build_grh_workforce_finance import (
    canonical_release_json,
    release_content_digest,
    release_id,
)
artifact = json.loads(Path("api/_data/grh-workforce-finance.json").read_text(encoding="utf-8"))
try:
    canonical_release_json([9007199254740992.0])
    unsafe_rejected = False
except ValueError:
    unsafe_rejected = True
print(json.dumps({
    "artifact_digest": release_content_digest(artifact),
    "fixture": canonical_release_json([100.0, 100, -0.0, 0.0001]),
    "release_id": release_id(artifact),
    "unsafe_rejected": unsafe_rejected,
}, sort_keys=True))
`;
  const execution = spawnSync(python, ['-c', program], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.equal(execution.status, 0, execution.stderr);
  const pythonResult = JSON.parse(execution.stdout);
  assert.equal(pythonResult.fixture,
    canonicalGrhWorkforceFinanceReleaseJson([100.0, 100, -0, 0.0001]));
  assert.equal(pythonResult.fixture, '[100,100,0,0.0001]');
  assert.equal(pythonResult.artifact_digest, computeGrhWorkforceFinanceContentDigest(source));
  assert.equal(pythonResult.release_id, computeGrhWorkforceFinanceReleaseId(source));
  assert.equal(pythonResult.unsafe_rejected, true);
  assert.throws(() => canonicalGrhWorkforceFinanceReleaseJson([9007199254740992]));
});

test('source contract rejects missing months, release drift, signed money and broken partitions', async () => {
  const source = await realSource();

  const missingMonth = structuredClone(source);
  missingMonth.period_totals.splice(3, 1);
  assert.equal(inspectGrhWorkforceFinanceSourceContract(missingMonth).ok, false);

  const releaseDrift = structuredClone(source);
  releaseDrift.release_id = 'f'.repeat(64);
  assert.ok(inspectGrhWorkforceFinanceSourceContract(releaseDrift).errors.includes('release.identity'));

  const signed = structuredClone(source);
  firstReleasedCell(signed).components.net_payroll_cents = -1;
  assert.ok(inspectGrhWorkforceFinanceSourceContract(signed).errors.includes(
    'dimension_views.components.values',
  ));

  const partition = structuredClone(source);
  firstReleasedCell(partition).components.net_payroll_cents += 1;
  assert.ok(inspectGrhWorkforceFinanceSourceContract(partition).errors.includes(
    'dimension_views.component_partition',
  ));

  const forgedChange = structuredClone(source);
  const releasedChange = forgedChange.dimension_views
    .flatMap(view => view.periods)
    .flatMap(period => period.cells)
    .find(cell => cell.change.status === 'released');
  releasedChange.change.net_payroll_delta_cents += 1;
  assert.ok(inspectGrhWorkforceFinanceSourceContract(forgedChange).errors.includes(
    'dimension_views.change.delta_identity',
  ));
});

test('masked counts cannot leak through tolerance, overlap diagnostics or public ordering', async () => {
  const source = await realSource();
  const masked = firstMaskedCell(source);
  assert.ok(masked);
  assert.equal(masked.distinct_participants_observed, null);
  assert.equal(masked.control.rounding_tolerance_cents, null);
  assert.equal(masked.control.identity_within_rounding_tolerance, null);

  const toleranceLeak = structuredClone(source);
  const leaked = firstMaskedCell(toleranceLeak);
  leaked.control.rounding_tolerance_cents = 17;
  leaked.control.identity_within_rounding_tolerance = true;
  assert.ok(inspectGrhWorkforceFinanceSourceContract(toleranceLeak).errors.includes(
    'dimension_views.control.protected_tolerance',
  ));

  const overlapLeak = structuredClone(source);
  const protectedAccounting = overlapLeak.dimension_views
    .flatMap(view => view.periods)
    .find(period => period.participant_accounting.multi_category_privacy_status === 'protected')
    .participant_accounting;
  protectedAccounting.multi_category_participants = 1;
  protectedAccounting.sum_cell_distinct_participants_observed =
    protectedAccounting.period_distinct_participants + 1;
  assert.ok(inspectGrhWorkforceFinanceSourceContract(overlapLeak).errors.includes(
    'dimension_views.participant_accounting.protected',
  ));

  const orderLeak = structuredClone(source);
  const period = orderLeak.dimension_views
    .flatMap(view => view.periods)
    .find(row => row.cells.filter(cell => cell.privacy_status === 'released').length >= 2);
  [period.cells[0], period.cells[1]] = [period.cells[1], period.cells[0]];
  assert.ok(inspectGrhWorkforceFinanceSourceContract(orderLeak).errors.includes(
    'dimension_views.public_order',
  ));
});

test('unsafe consecutive membership changes mask count-derived fields without claiming money secrecy', async () => {
  const source = await realSource();
  const cell = source.dimension_views
    .flatMap(view => view.periods)
    .flatMap(period => period.cells)
    .find(candidate => candidate.change.reason === 'membership_change_protected');

  assert.ok(cell);
  assert.equal(cell.distinct_participants_observed, null);
  assert.equal(cell.participantDisplay, undefined);
  assert.equal(cell.participant_display, 'Protegido');
  assert.equal(cell.control.rounding_tolerance_cents, null);
  assert.equal(cell.change.status, 'unavailable');
  assert.equal(cell.change.distinct_participants_delta, null);
  assert.equal(Number.isSafeInteger(cell.components.net_payroll_cents), true,
    'released monthly amounts remain arithmetically comparable by contract');
  assert.equal(source.privacy.cross_period_protection,
    'consecutive_participant_count_difference_protection');
  assert.equal(source.privacy.released_amounts_remain_arithmetically_comparable, true);
});

test('cross-view risk receipt is mandatory and cannot be weakened after build', async () => {
  const source = await realSource();
  assert.ok(source.quality.warnings.includes('cross_view_single_cell_difference_gate_passed'));
  assert.ok(source.quality.warnings.includes('cross_view_remaining_single_cell_risks:0'));
  assert.ok(source.quality.warnings.includes('cross_view_subset_difference_gate_passed'));
  assert.ok(source.quality.warnings.includes(
    'cross_view_remaining_subset_difference_risks:0'));

  const weakened = structuredClone(source);
  weakened.quality.warnings = weakened.quality.warnings.filter(
    item => item !== 'cross_view_remaining_single_cell_risks:0',
  );
  assert.ok(inspectGrhWorkforceFinanceSourceContract(weakened).errors.includes(
    'quality.cross_view_gate',
  ));

  const subsetWeakened = structuredClone(source);
  subsetWeakened.quality.warnings = subsetWeakened.quality.warnings.map(item =>
    item.startsWith('cross_view_max_observables_per_view:')
      ? 'cross_view_max_observables_per_view:14'
      : item,
  );
  assert.ok(inspectGrhWorkforceFinanceSourceContract(subsetWeakened).errors.includes(
    'quality.cross_view_subset_gate',
  ));
});

test('capabilities, reconciliation and participant accounting are exact claims', async () => {
  const source = await realSource();

  const capabilityDrift = structuredClone(source);
  capabilityDrift.capabilities.cohort_cross_source_reconciliation = 'released';
  assert.ok(inspectGrhWorkforceFinanceSourceContract(capabilityDrift).errors.includes(
    'capabilities.identity',
  ));

  const matchedDrift = structuredClone(source);
  matchedDrift.period_totals[0].reconciliation.matched_runs =
    matchedDrift.period_totals[0].reconciliation.calculation_runs + 1;
  assert.ok(inspectGrhWorkforceFinanceSourceContract(matchedDrift).errors.includes(
    'period_totals.reconciliation.matched_bounds',
  ));

  const coverageDrift = structuredClone(source);
  coverageDrift.period_totals[0].reconciliation.run_coverage_pct = 99;
  assert.ok(inspectGrhWorkforceFinanceSourceContract(coverageDrift).errors.includes(
    'period_totals.reconciliation.coverage_identity',
  ));

  const metricDrift = structuredClone(source);
  const metricReconciliation = metricDrift.period_totals[0].reconciliation;
  metricReconciliation.fully_reconciled_runs = metricReconciliation.matched_runs;
  metricReconciliation.metric_exact_rate_pct = 0;
  assert.ok(inspectGrhWorkforceFinanceSourceContract(metricDrift).errors.includes(
    'period_totals.reconciliation.metric_identity',
  ));

  const periodIdentityDrift = structuredClone(source);
  periodIdentityDrift.dimension_views[0].periods[0]
    .participant_accounting.period_distinct_participants = 999;
  assert.ok(inspectGrhWorkforceFinanceSourceContract(periodIdentityDrift).errors.includes(
    'dimension_views.participant_accounting.period_identity',
  ));

  const protectedSumDrift = structuredClone(source);
  const protectedPeriod = protectedSumDrift.dimension_views
    .flatMap(view => view.periods)
    .find(period => period.cells.some(cell =>
      cell.participant_privacy_status === 'protected_difference_attack'));
  assert.ok(protectedPeriod);
  protectedPeriod.participant_accounting.sum_cell_distinct_participants_observed = 999;
  assert.ok(inspectGrhWorkforceFinanceSourceContract(protectedSumDrift).errors.includes(
    'dimension_views.participant_accounting.protected_sum',
  ));

  const releasedSumDrift = structuredClone(source);
  const releasedAccounting = releasedSumDrift.dimension_views
    .flatMap(view => view.periods)
    .map(period => period.participant_accounting)
    .find(accounting => accounting.sum_cell_distinct_participants_observed !== null);
  assert.ok(releasedAccounting);
  releasedAccounting.multi_category_privacy_status = 'released';
  releasedAccounting.multi_category_participants = 1;
  releasedAccounting.multi_category_participant_display = '1';
  releasedAccounting.participants_may_overlap = true;
  releasedAccounting.sum_cell_distinct_participants_observed =
    releasedAccounting.period_distinct_participants;
  assert.ok(inspectGrhWorkforceFinanceSourceContract(releasedSumDrift).errors.includes(
    'dimension_views.participant_accounting.released_sum',
  ));

  const projection = buildGrhWorkforceFinanceProjection(source, { presentation: PRESENTATION });
  const projectionClaim = structuredClone(projection);
  projectionClaim.capabilities.cohortCrossSourceReconciliation = 'released';
  assert.ok(inspectGrhWorkforceFinanceContract(projectionClaim).errors.includes(
    'source_projection.capabilities.identity',
  ));
});

test('quality claims enforce exact types, partitions, bounds and ratios in source and projection', async () => {
  const source = await realSource();
  const mutations = [
    [candidate => { candidate.quality.calculation.source_rows = 'banana'; },
      'quality.calculation.counts'],
    [candidate => { candidate.quality.calculation.valid_rate_pct = 999; },
      'quality.calculation.valid_rate'],
    [candidate => { candidate.quality.references[0].observed_codes = -1; },
      'quality.references.counts'],
    [candidate => { candidate.quality.assignment.employee_period_runs = -5; },
      'quality.assignment.counts'],
    [candidate => { candidate.quality.calculation.valid_rows -= 1; },
      'quality.calculation.row_partition'],
    [candidate => { candidate.quality.calculation.window_control_rows =
      candidate.quality.calculation.window_rows + 1; }, 'quality.calculation.window_bounds'],
    [candidate => { candidate.quality.references[0].unresolved_codes = 1; },
      'quality.references.code_partition'],
    [candidate => { candidate.quality.assignment.dimension_run_checks[0].valid_runs -= 1; },
      'quality.assignment.run_partition'],
    [candidate => { candidate.quality.assignment.multi_category_employee_periods[0]
      .multi_category_pct = 99; }, 'quality.assignment.multi_percentage_identity'],
    [candidate => { candidate.quality.participant_set_reconciliation.control_employee_periods += 1; },
      'quality.participant_reconciliation.identity'],
  ];
  for (const [mutate, expectedError] of mutations) {
    const candidate = structuredClone(source);
    mutate(candidate);
    assert.ok(inspectGrhWorkforceFinanceSourceContract(candidate).errors.includes(expectedError),
      expectedError);
  }

  const projection = buildGrhWorkforceFinanceProjection(source, { presentation: PRESENTATION });
  const projectionQuality = structuredClone(projection);
  projectionQuality.quality.calculation.sourceRows = 'banana';
  assert.ok(inspectGrhWorkforceFinanceContract(projectionQuality).errors.includes(
    'source_projection.quality.calculation.counts',
  ));
});

test('generatedAt is a canonical complete UTC timestamp in source and projection', async () => {
  const source = await realSource();
  const invalidSource = structuredClone(source);
  invalidSource.source.generated_at = '2026-08-11Z';
  assert.ok(inspectGrhWorkforceFinanceSourceContract(invalidSource).errors.includes(
    'source.generated_at',
  ));

  const projection = buildGrhWorkforceFinanceProjection(source, { presentation: PRESENTATION });
  const invalidProjection = structuredClone(projection);
  invalidProjection.source.generatedAt = '2026-08-11Z';
  assert.ok(inspectGrhWorkforceFinanceContract(invalidProjection).errors.includes(
    'source_projection.source.generated_at',
  ));
});

test('source provenance is pinned exactly in source and projection inspectors', async () => {
  const source = await realSource();
  assert.deepEqual(GRH_WORKFORCE_FINANCE_APPROVED_SOURCE, {
    canonicalSystem: 'GRH Junín',
    sourceFile: 'grh_junin.backup_2026080615_plataforma.sql.gz',
    sourceSha256: 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9',
    compressedSizeBytes: 44537741,
    snapshotAsOf: '2026-08-06',
  });
  for (const [field, value, errorCode] of [
    ['canonical_system', 'GRH Mars', 'source.canonical_system'],
    ['file', 'grh_junin.fake.sql.gz', 'source.file'],
    ['compressed_size_bytes', 1, 'source.size'],
    ['sha256', 'a'.repeat(64), 'source.sha256'],
    ['snapshot_as_of', '2026-08-05', 'source.snapshot'],
  ]) {
    const candidate = structuredClone(source);
    candidate.source[field] = value;
    assert.ok(inspectGrhWorkforceFinanceSourceContract(candidate).errors.includes(errorCode));
  }

  const projection = buildGrhWorkforceFinanceProjection(source, { presentation: PRESENTATION });
  const invalidProjection = structuredClone(projection);
  invalidProjection.source.sourceFile = 'grh_junin.fake.sql.gz';
  assert.ok(inspectGrhWorkforceFinanceContract(invalidProjection).errors.includes(
    'source_projection.source.file',
  ));
});

test('presentation is exact, tenant supplied and never inferred from the GRH source', async () => {
  const source = await realSource();
  for (const presentation of [
    { ...PRESENTATION, sourceCurrencyStatus: 'not_declared' },
    { ...PRESENTATION, displayCurrencyCode: 'ars' },
    { ...PRESENTATION, extra: true },
  ]) {
    assert.throws(
      () => buildGrhWorkforceFinanceProjection(source, { presentation }),
      error => error?.code === 'GRH_WORKFORCE_FINANCE_PRESENTATION_INVALID',
    );
  }

  const projection = buildGrhWorkforceFinanceProjection(source, { presentation: PRESENTATION });
  const forged = structuredClone(projection);
  forged.metric.presentationCurrencyBasis = 'source_inference';
  assert.equal(inspectGrhWorkforceFinanceContract(forged).ok, false);
});

test('PII-shaped or unknown fields fail exact source and projection contracts', async () => {
  const source = await realSource();
  const sourceLeak = structuredClone(source);
  firstReleasedCell(sourceLeak).legajo = 123;
  assert.equal(inspectGrhWorkforceFinanceSourceContract(sourceLeak).ok, false);

  const projection = buildGrhWorkforceFinanceProjection(source, { presentation: PRESENTATION });
  const projectionLeak = structuredClone(projection);
  projectionLeak.employee = { name: 'persona' };
  assert.equal(inspectGrhWorkforceFinanceContract(projectionLeak).ok, false);
});

test('inspectors fail closed without throwing on hostile nested types', async () => {
  const source = await realSource();
  const hostileSource = structuredClone(source);
  hostileSource.dimension_views[0].periods[0].cells = { not: 'an array' };
  hostileSource.quality.references = { not: 'an array' };
  assert.doesNotThrow(() => inspectGrhWorkforceFinanceSourceContract(hostileSource));
  assert.equal(inspectGrhWorkforceFinanceSourceContract(hostileSource).ok, false);

  const projection = buildGrhWorkforceFinanceProjection(source, { presentation: PRESENTATION });
  const hostileProjection = structuredClone(projection);
  hostileProjection.cohort.oneWayDimensions = { not: 'an array' };
  assert.doesNotThrow(() => inspectGrhWorkforceFinanceContract(hostileProjection));
  assert.equal(inspectGrhWorkforceFinanceContract(hostileProjection).ok, false);
});
