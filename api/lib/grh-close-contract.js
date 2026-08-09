import { GRH_PRIVACY_POLICY_VERSION } from './grh-privacy.js';

export const GRH_CLOSE_SCHEMA_VERSION = 'grh-close-v1';
export const GRH_CLOSE_PRIVACY_THRESHOLD = 10;

export const GRH_CLOSE_COMPONENT_KEYS = Object.freeze([
  'grossWithFamilyAllowancesCents',
  'contributoryEarningsCents',
  'nonContributoryEarningsCents',
  'familyAllowancesCents',
  'employeeWithholdingsCents',
  'netPayrollCents',
  'netToPayCents',
  'employerContributionsCents',
]);

export const GRH_CLOSE_RECONCILIATION_DELTA_KEYS = Object.freeze([
  'runCoveragePct',
  'metricExactRatePct',
  'valueAgreementPct',
  'absoluteVarianceCents',
]);

const SHAPES = Object.freeze({
  top: ['schemaVersion', 'policyVersion', 'source', 'privacy', 'metric', 'series', 'comparison'],
  source: [
    'canonicalSystem',
    'sourceFile',
    'sourceSha256',
    'snapshotAsOf',
    'latestValidCalculationPeriod',
    'realtime',
  ],
  privacy: [
    'audience',
    'threshold',
    'aggregateOnly',
    'containsPii',
    'employeeIdentifiersExported',
    'rawRowsExported',
    'categoricalLabelsExported',
    'cellCodesExported',
    'comparisonRule',
  ],
  metric: ['grain', 'currency', 'amountUnit', 'status', 'interpretation'],
  seriesRow: [
    'period',
    'participantCount',
    'participantDisplay',
    'privacyStatus',
    'components',
    'control',
    'reconciliation',
  ],
  control: [
    'netIdentityVarianceCents',
    'netToPayVarianceCents',
    'roundingToleranceCents',
    'identityExactlyReconciled',
    'identityWithinRoundingTolerance',
  ],
  reconciliation: [
    'calculationRuns',
    'totpagoRuns',
    'matchedRuns',
    'fullyReconciledRuns',
    'runCoveragePct',
    'metricExactRatePct',
    'valueAgreementPct',
    'absoluteVarianceCents',
  ],
  comparison: [
    'status',
    'reason',
    'previousPeriod',
    'currentPeriod',
    'participantDelta',
    'componentDeltas',
    'reconciliationDeltas',
  ],
});

const MONTH_PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys) {
  if (!plainObject(value)) return false;
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function add(errors, condition, code) {
  if (!condition) errors.push(code);
}

function addShape(errors, value, keys, code) {
  add(errors, exactKeys(value, keys), code);
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function signedInteger(value) {
  return Number.isSafeInteger(value);
}

function finitePercentage(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function validSnapshot(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function previousCalendarMonth(period) {
  const match = MONTH_PERIOD.exec(period || '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month === 1
    ? `${String(year - 1).padStart(4, '0')}-12`
    : `${String(year).padStart(4, '0')}-${String(month - 1).padStart(2, '0')}`;
}

function round4(value) {
  return Number(value.toFixed(4));
}

function allNull(value, keys) {
  return exactKeys(value, keys) && keys.every(key => value[key] === null);
}

function inspectReleasedComponents(errors, row) {
  const components = row?.components;
  add(errors, GRH_CLOSE_COMPONENT_KEYS.every(key => nonNegativeInteger(components?.[key])),
    'series.released_components');
  add(
    errors,
    components?.grossWithFamilyAllowancesCents ===
      components?.contributoryEarningsCents +
      components?.nonContributoryEarningsCents +
      components?.familyAllowancesCents,
    'series.gross_component_identity',
  );
}

function inspectReleasedControl(errors, row) {
  const components = row?.components;
  const control = row?.control;
  add(errors, signedInteger(control?.netIdentityVarianceCents), 'series.control_net_variance');
  add(errors, signedInteger(control?.netToPayVarianceCents), 'series.control_pay_variance');
  add(errors, nonNegativeInteger(control?.roundingToleranceCents), 'series.control_tolerance');
  add(errors, typeof control?.identityExactlyReconciled === 'boolean', 'series.control_exact_type');
  add(errors, typeof control?.identityWithinRoundingTolerance === 'boolean', 'series.control_tolerance_type');

  add(
    errors,
    components?.netPayrollCents -
      (components?.grossWithFamilyAllowancesCents - components?.employeeWithholdingsCents) ===
      control?.netIdentityVarianceCents,
    'series.net_identity',
  );
  add(
    errors,
    components?.netToPayCents - components?.netPayrollCents === control?.netToPayVarianceCents,
    'series.net_to_pay_identity',
  );

  const exact = Math.abs(control?.netIdentityVarianceCents) <= 1 &&
    Math.abs(control?.netToPayVarianceCents) <= 1;
  const withinTolerance = Math.abs(control?.netIdentityVarianceCents) <= control?.roundingToleranceCents &&
    Math.abs(control?.netToPayVarianceCents) <= control?.roundingToleranceCents;
  add(errors, control?.identityExactlyReconciled === exact, 'series.control_exact_identity');
  add(errors, control?.identityWithinRoundingTolerance === withinTolerance,
    'series.control_tolerance_identity');
}

function inspectReleasedReconciliation(errors, reconciliation) {
  for (const key of ['calculationRuns', 'totpagoRuns', 'matchedRuns', 'fullyReconciledRuns']) {
    add(errors, nonNegativeInteger(reconciliation?.[key]), `series.reconciliation.${key}`);
  }
  add(errors, reconciliation?.calculationRuns > 0, 'series.reconciliation.calculation_runs');
  add(errors, reconciliation?.matchedRuns <= reconciliation?.calculationRuns,
    'series.reconciliation.matched_calculation_bound');
  add(errors, reconciliation?.matchedRuns <= reconciliation?.totpagoRuns,
    'series.reconciliation.matched_totpago_bound');
  add(errors, reconciliation?.fullyReconciledRuns <= reconciliation?.matchedRuns,
    'series.reconciliation.fully_reconciled_bound');
  for (const key of ['runCoveragePct', 'metricExactRatePct', 'valueAgreementPct']) {
    add(errors, finitePercentage(reconciliation?.[key]), `series.reconciliation.${key}`);
  }
  add(errors, nonNegativeInteger(reconciliation?.absoluteVarianceCents),
    'series.reconciliation.absolute_variance');

  const unionRuns = reconciliation?.calculationRuns +
    reconciliation?.totpagoRuns - reconciliation?.matchedRuns;
  const expectedCoverage = unionRuns > 0
    ? round4((reconciliation?.matchedRuns / unionRuns) * 100)
    : null;
  add(errors, expectedCoverage !== null &&
    Math.abs(reconciliation?.runCoveragePct - expectedCoverage) <= 0.0001,
  'series.reconciliation.run_coverage_identity');
}

function inspectSeries(errors, series, latestPeriod, snapshotAsOf) {
  add(errors, Array.isArray(series) && series.length > 1, 'series.structure');
  const periods = new Set();
  let previousPeriod = null;
  for (const row of Array.isArray(series) ? series : []) {
    addShape(errors, row, SHAPES.seriesRow, 'series.row_structure');
    addShape(errors, row?.components, GRH_CLOSE_COMPONENT_KEYS, 'series.components_structure');
    addShape(errors, row?.control, SHAPES.control, 'series.control_structure');
    addShape(errors, row?.reconciliation, SHAPES.reconciliation, 'series.reconciliation_structure');
    const periodValid = MONTH_PERIOD.test(row?.period || '');
    add(errors, periodValid && !periods.has(row?.period), 'series.period');
    add(errors, periodValid && row.period >= '1979-01' &&
      row.period <= String(snapshotAsOf || '').slice(0, 7), 'series.period_bound');
    add(errors, previousPeriod === null || row?.period > previousPeriod, 'series.period_order');
    if (periodValid) {
      periods.add(row.period);
      previousPeriod = row.period;
    }

    if (row?.privacyStatus === 'released') {
      add(errors, nonNegativeInteger(row.participantCount) &&
        row.participantCount >= GRH_CLOSE_PRIVACY_THRESHOLD, 'series.small_cell');
      add(errors, row.participantDisplay === String(row.participantCount), 'series.participant_display');
      inspectReleasedComponents(errors, row);
      inspectReleasedControl(errors, row);
      inspectReleasedReconciliation(errors, row.reconciliation);
    } else if (row?.privacyStatus === 'suppressed') {
      add(errors, row.participantCount === null, 'series.suppressed_count');
      add(errors, row.participantDisplay === `<${GRH_CLOSE_PRIVACY_THRESHOLD}`,
        'series.suppressed_display');
      add(errors, allNull(row.components, GRH_CLOSE_COMPONENT_KEYS), 'series.suppressed_components');
      add(errors, allNull(row.control, SHAPES.control), 'series.suppressed_control');
      add(errors, allNull(row.reconciliation, SHAPES.reconciliation),
        'series.suppressed_reconciliation');
    } else {
      add(errors, false, 'series.privacy_status');
    }
  }
  add(errors, previousPeriod === latestPeriod, 'series.latest_period_identity');
}

function inspectComparison(errors, comparison, series, latestPeriod) {
  addShape(errors, comparison, SHAPES.comparison, 'comparison.structure');
  addShape(errors, comparison?.componentDeltas, GRH_CLOSE_COMPONENT_KEYS,
    'comparison.component_deltas_structure');
  addShape(errors, comparison?.reconciliationDeltas, GRH_CLOSE_RECONCILIATION_DELTA_KEYS,
    'comparison.reconciliation_deltas_structure');

  const expectedPrevious = previousCalendarMonth(latestPeriod);
  add(errors, comparison?.previousPeriod === expectedPrevious, 'comparison.previous_period');
  add(errors, comparison?.currentPeriod === latestPeriod, 'comparison.current_period');
  const previous = Array.isArray(series) ? series.find(row => row?.period === expectedPrevious) : null;
  const current = Array.isArray(series) ? series.find(row => row?.period === latestPeriod) : null;
  const canRelease = previous?.privacyStatus === 'released' && current?.privacyStatus === 'released';

  if (canRelease) {
    add(errors, comparison?.status === 'released', 'comparison.status');
    add(errors, comparison?.reason === 'both_periods_released', 'comparison.reason');
    add(errors, comparison?.participantDelta === current.participantCount - previous.participantCount,
      'comparison.participant_delta_identity');
    add(
      errors,
      GRH_CLOSE_COMPONENT_KEYS.every(key =>
        comparison?.componentDeltas?.[key] === current.components[key] - previous.components[key]),
      'comparison.component_delta_identity',
    );
    add(
      errors,
      comparison?.reconciliationDeltas?.runCoveragePct === round4(
        current.reconciliation.runCoveragePct - previous.reconciliation.runCoveragePct,
      ) &&
      comparison?.reconciliationDeltas?.metricExactRatePct === round4(
        current.reconciliation.metricExactRatePct - previous.reconciliation.metricExactRatePct,
      ) &&
      comparison?.reconciliationDeltas?.valueAgreementPct === round4(
        current.reconciliation.valueAgreementPct - previous.reconciliation.valueAgreementPct,
      ) &&
      comparison?.reconciliationDeltas?.absoluteVarianceCents ===
        current.reconciliation.absoluteVarianceCents - previous.reconciliation.absoluteVarianceCents,
      'comparison.reconciliation_delta_identity',
    );
    add(errors, signedInteger(comparison?.participantDelta), 'comparison.participant_delta');
    add(errors, GRH_CLOSE_COMPONENT_KEYS.every(key => signedInteger(comparison?.componentDeltas?.[key])),
      'comparison.component_deltas');
    add(errors, GRH_CLOSE_RECONCILIATION_DELTA_KEYS.every(key =>
      Number.isFinite(comparison?.reconciliationDeltas?.[key])),
    'comparison.reconciliation_deltas');
    return;
  }

  add(errors, comparison?.status === 'unavailable', 'comparison.status');
  add(errors, comparison?.reason === (previous ? 'privacy_protected' : 'period_missing'),
    'comparison.reason');
  add(errors, comparison?.participantDelta === null, 'comparison.unavailable_participant_delta');
  add(errors, allNull(comparison?.componentDeltas, GRH_CLOSE_COMPONENT_KEYS),
    'comparison.unavailable_component_deltas');
  add(errors, allNull(comparison?.reconciliationDeltas, GRH_CLOSE_RECONCILIATION_DELTA_KEYS),
    'comparison.unavailable_reconciliation_deltas');
}

export function inspectGrhCloseContract(data) {
  const errors = [];
  addShape(errors, data, SHAPES.top, 'close.structure');
  add(errors, data?.schemaVersion === GRH_CLOSE_SCHEMA_VERSION, 'schema.version');
  add(errors, data?.policyVersion === GRH_PRIVACY_POLICY_VERSION, 'policy.version');

  const source = data?.source;
  addShape(errors, source, SHAPES.source, 'source.structure');
  add(errors, typeof source?.canonicalSystem === 'string' &&
    source.canonicalSystem.length > 0 && source.canonicalSystem.length <= 80 &&
    source.canonicalSystem.toLowerCase().includes('grh') &&
    !/[\u0000-\u001F\u007F]/.test(source.canonicalSystem), 'source.canonical_system');
  add(errors, /^grh_junin\.[a-z0-9._-]+\.sql\.gz$/i.test(source?.sourceFile || ''), 'source.file');
  add(errors, /^[0-9a-f]{64}$/.test(source?.sourceSha256 || ''), 'source.sha256');
  add(errors, validSnapshot(source?.snapshotAsOf), 'source.snapshot');
  add(errors, MONTH_PERIOD.test(source?.latestValidCalculationPeriod || ''), 'source.latest_period');
  add(errors, source?.latestValidCalculationPeriod <= String(source?.snapshotAsOf || '').slice(0, 7),
    'source.latest_period_bound');
  add(errors, source?.realtime === false, 'source.realtime');

  const privacy = data?.privacy;
  addShape(errors, privacy, SHAPES.privacy, 'privacy.structure');
  add(errors, privacy?.audience === 'interactive', 'privacy.audience');
  add(errors, privacy?.threshold === GRH_CLOSE_PRIVACY_THRESHOLD, 'privacy.threshold');
  add(errors, privacy?.aggregateOnly === true, 'privacy.aggregate_only');
  add(errors, privacy?.containsPii === false, 'privacy.contains_pii');
  add(errors, privacy?.employeeIdentifiersExported === false, 'privacy.employee_identifiers');
  add(errors, privacy?.rawRowsExported === false, 'privacy.raw_rows');
  add(errors, privacy?.categoricalLabelsExported === false, 'privacy.labels');
  add(errors, privacy?.cellCodesExported === false, 'privacy.codes');
  add(errors, privacy?.comparisonRule === 'both_consecutive_periods_released',
    'privacy.comparison_rule');

  const metric = data?.metric;
  addShape(errors, metric, SHAPES.metric, 'metric.structure');
  add(errors, metric?.grain === 'calendar_month', 'metric.grain');
  add(errors, metric?.currency === 'not_declared_in_source', 'metric.currency');
  add(errors, metric?.amountUnit === 'source_currency_cents', 'metric.amount_unit');
  add(errors, metric?.status === 'calculation_control_not_bank_disbursement', 'metric.status');
  add(errors, metric?.interpretation === 'arithmetic_decomposition_not_causal_explanation',
    'metric.interpretation');

  inspectSeries(errors, data?.series, source?.latestValidCalculationPeriod, source?.snapshotAsOf);
  inspectComparison(errors, data?.comparison, data?.series, source?.latestValidCalculationPeriod);

  const uniqueErrors = Object.freeze([...new Set(errors)]);
  return Object.freeze({ ok: uniqueErrors.length === 0, errors: uniqueErrors });
}

export function validateGrhCloseContract(data) {
  return inspectGrhCloseContract(data).ok;
}
