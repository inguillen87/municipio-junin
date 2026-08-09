import { inspectGrhSemanticContract } from './grh-contract.js';
import {
  GRH_CLOSE_COMPONENT_KEYS,
  GRH_CLOSE_PRIVACY_THRESHOLD,
  GRH_CLOSE_RECONCILIATION_DELTA_KEYS,
  GRH_CLOSE_SCHEMA_VERSION,
  inspectGrhCloseContract,
} from './grh-close-contract.js';
import { GRH_PRIVACY_POLICY_VERSION } from './grh-privacy.js';

const COMPONENT_SOURCE_FIELDS = Object.freeze({
  grossWithFamilyAllowancesCents: 'gross_with_family_allowances_cents',
  contributoryEarningsCents: 'contributory_earnings_cents',
  nonContributoryEarningsCents: 'non_contributory_earnings_cents',
  familyAllowancesCents: 'family_allowances_cents',
  employeeWithholdingsCents: 'employee_withholdings_cents',
  netPayrollCents: 'net_payroll_cents',
  netToPayCents: 'net_to_pay_cents',
  employerContributionsCents: 'employer_contributions_cents',
});

const MONTH_PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;

function closeError(code, message, details = []) {
  const error = new Error(message);
  error.code = code;
  error.details = Object.freeze([...details]);
  return error;
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
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

function round4(value) {
  return Number(value.toFixed(4));
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

function nullObject(keys) {
  return Object.fromEntries(keys.map(key => [key, null]));
}

function sourceComponents(row) {
  return Object.fromEntries(GRH_CLOSE_COMPONENT_KEYS.map(key => [key, row[COMPONENT_SOURCE_FIELDS[key]]]));
}

function calculationRowErrors(row) {
  const errors = [];
  if (!MONTH_PERIOD.test(row?.period || '')) errors.push('calculation.period');
  if (!nonNegativeInteger(row?.distinct_payroll_participants)) errors.push('calculation.participants');
  for (const sourceKey of Object.values(COMPONENT_SOURCE_FIELDS)) {
    if (!nonNegativeInteger(row?.[sourceKey])) errors.push(`calculation.${sourceKey}`);
  }
  if (!signedInteger(row?.net_identity_variance_cents)) errors.push('calculation.net_identity_variance');
  if (!signedInteger(row?.net_to_pay_variance_cents)) errors.push('calculation.net_to_pay_variance');
  if (!nonNegativeInteger(row?.rounding_tolerance_cents)) errors.push('calculation.rounding_tolerance');
  if (typeof row?.control_identity_reconciled !== 'boolean') errors.push('calculation.exact_identity_type');
  if (typeof row?.control_identity_within_rounding_tolerance !== 'boolean') {
    errors.push('calculation.tolerance_identity_type');
  }

  const grossIdentity = row?.gross_with_family_allowances_cents ===
    row?.contributory_earnings_cents +
    row?.non_contributory_earnings_cents +
    row?.family_allowances_cents;
  if (!grossIdentity) errors.push('calculation.gross_identity');
  if (row?.net_payroll_cents -
      (row?.gross_with_family_allowances_cents - row?.employee_withholdings_cents) !==
      row?.net_identity_variance_cents) {
    errors.push('calculation.net_identity');
  }
  if (row?.net_to_pay_cents - row?.net_payroll_cents !== row?.net_to_pay_variance_cents) {
    errors.push('calculation.net_to_pay_identity');
  }

  const exactlyReconciled = Math.abs(row?.net_identity_variance_cents) <= 1 &&
    Math.abs(row?.net_to_pay_variance_cents) <= 1;
  const withinTolerance = Math.abs(row?.net_identity_variance_cents) <= row?.rounding_tolerance_cents &&
    Math.abs(row?.net_to_pay_variance_cents) <= row?.rounding_tolerance_cents;
  if (row?.control_identity_reconciled !== exactlyReconciled) errors.push('calculation.exact_identity');
  if (row?.control_identity_within_rounding_tolerance !== withinTolerance) {
    errors.push('calculation.tolerance_identity');
  }
  return errors;
}

function reconciliationRowErrors(row) {
  const errors = [];
  if (!MONTH_PERIOD.test(row?.period || '')) errors.push('reconciliation.period');
  for (const key of ['calculation_runs', 'totpago_runs', 'matched_runs', 'fully_reconciled_runs']) {
    if (!nonNegativeInteger(row?.[key])) errors.push(`reconciliation.${key}`);
  }
  if (row?.matched_runs > row?.calculation_runs) errors.push('reconciliation.matched_calculation_bound');
  if (row?.matched_runs > row?.totpago_runs) errors.push('reconciliation.matched_totpago_bound');
  if (row?.fully_reconciled_runs > row?.matched_runs) errors.push('reconciliation.fully_reconciled_bound');
  for (const key of ['run_coverage_pct', 'metric_exact_rate_pct', 'value_agreement_pct']) {
    if (!finitePercentage(row?.[key])) errors.push(`reconciliation.${key}`);
  }
  if (!nonNegativeInteger(row?.absolute_variance_cents)) errors.push('reconciliation.absolute_variance');

  const unionRuns = row?.calculation_runs + row?.totpago_runs - row?.matched_runs;
  const expectedCoverage = unionRuns > 0 ? round4((row?.matched_runs / unionRuns) * 100) : null;
  if (expectedCoverage === null || Math.abs(row?.run_coverage_pct - expectedCoverage) > 0.0001) {
    errors.push('reconciliation.run_coverage_identity');
  }
  return errors;
}

function reconciliationMap(semantic) {
  const rows = semantic?.payroll?.cross_source_reconciliation?.period_series;
  if (!Array.isArray(rows)) {
    throw closeError(
      'GRH_CLOSE_SOURCE_INVALID',
      'La serie mensual de conciliacion GRH no es valida.',
      ['reconciliation.series'],
    );
  }
  const byPeriod = new Map();
  const errors = [];
  for (const row of rows) {
    errors.push(...reconciliationRowErrors(row));
    if (byPeriod.has(row?.period)) errors.push('reconciliation.duplicate_period');
    else if (MONTH_PERIOD.test(row?.period || '')) byPeriod.set(row.period, row);
  }
  if (errors.length > 0) {
    throw closeError(
      'GRH_CLOSE_SOURCE_INVALID',
      'La serie mensual de conciliacion GRH no supera el contrato.',
      [...new Set(errors)],
    );
  }
  return byPeriod;
}

function releasedReconciliation(row) {
  return {
    calculationRuns: row.calculation_runs,
    totpagoRuns: row.totpago_runs,
    matchedRuns: row.matched_runs,
    fullyReconciledRuns: row.fully_reconciled_runs,
    runCoveragePct: round4(row.run_coverage_pct),
    metricExactRatePct: round4(row.metric_exact_rate_pct),
    valueAgreementPct: round4(row.value_agreement_pct),
    absoluteVarianceCents: row.absolute_variance_cents,
  };
}

function protectedPeriod(row) {
  return {
    period: row.period,
    participantCount: null,
    participantDisplay: `<${GRH_CLOSE_PRIVACY_THRESHOLD}`,
    privacyStatus: 'suppressed',
    components: nullObject(GRH_CLOSE_COMPONENT_KEYS),
    control: nullObject([
      'netIdentityVarianceCents',
      'netToPayVarianceCents',
      'roundingToleranceCents',
      'identityExactlyReconciled',
      'identityWithinRoundingTolerance',
    ]),
    reconciliation: nullObject([
      'calculationRuns',
      'totpagoRuns',
      'matchedRuns',
      'fullyReconciledRuns',
      'runCoveragePct',
      'metricExactRatePct',
      'valueAgreementPct',
      'absoluteVarianceCents',
    ]),
  };
}

function releasedPeriod(row, reconciliation) {
  return {
    period: row.period,
    participantCount: row.distinct_payroll_participants,
    participantDisplay: String(row.distinct_payroll_participants),
    privacyStatus: 'released',
    components: sourceComponents(row),
    control: {
      netIdentityVarianceCents: row.net_identity_variance_cents,
      netToPayVarianceCents: row.net_to_pay_variance_cents,
      roundingToleranceCents: row.rounding_tolerance_cents,
      identityExactlyReconciled: row.control_identity_reconciled,
      identityWithinRoundingTolerance: row.control_identity_within_rounding_tolerance,
    },
    reconciliation: releasedReconciliation(reconciliation),
  };
}

function buildSeries(semantic) {
  const reconciliationByPeriod = reconciliationMap(semantic);
  const calculationRows = [...semantic.payroll.calculation_control_series]
    .sort((left, right) => left.period.localeCompare(right.period));
  const errors = [];
  const seen = new Set();
  for (const row of calculationRows) {
    errors.push(...calculationRowErrors(row));
    if (seen.has(row?.period)) errors.push('calculation.duplicate_period');
    else if (MONTH_PERIOD.test(row?.period || '')) seen.add(row.period);
    if (!reconciliationByPeriod.has(row?.period)) {
      errors.push('reconciliation.period_missing');
    } else if (!(reconciliationByPeriod.get(row.period)?.calculation_runs > 0)) {
      errors.push('reconciliation.calculation_runs');
    }
  }
  if (errors.length > 0) {
    throw closeError(
      'GRH_CLOSE_SOURCE_INVALID',
      'Las series mensuales GRH no son aptas para el cierre gobernado.',
      [...new Set(errors)],
    );
  }

  return calculationRows.map(row => row.distinct_payroll_participants >= GRH_CLOSE_PRIVACY_THRESHOLD
    ? releasedPeriod(row, reconciliationByPeriod.get(row.period))
    : protectedPeriod(row));
}

function unavailableComparison(previousPeriod, currentPeriod, reason) {
  return {
    status: 'unavailable',
    reason,
    previousPeriod,
    currentPeriod,
    participantDelta: null,
    componentDeltas: nullObject(GRH_CLOSE_COMPONENT_KEYS),
    reconciliationDeltas: nullObject(GRH_CLOSE_RECONCILIATION_DELTA_KEYS),
  };
}

function buildComparison(series, currentPeriod) {
  const previousPeriod = previousCalendarMonth(currentPeriod);
  const previous = series.find(row => row.period === previousPeriod);
  const current = series.find(row => row.period === currentPeriod);
  if (!previous) return unavailableComparison(previousPeriod, currentPeriod, 'period_missing');
  if (previous.privacyStatus !== 'released' || current?.privacyStatus !== 'released') {
    return unavailableComparison(previousPeriod, currentPeriod, 'privacy_protected');
  }

  return {
    status: 'released',
    reason: 'both_periods_released',
    previousPeriod,
    currentPeriod,
    participantDelta: current.participantCount - previous.participantCount,
    componentDeltas: Object.fromEntries(GRH_CLOSE_COMPONENT_KEYS.map(key => [
      key,
      current.components[key] - previous.components[key],
    ])),
    reconciliationDeltas: {
      runCoveragePct: round4(
        current.reconciliation.runCoveragePct - previous.reconciliation.runCoveragePct,
      ),
      metricExactRatePct: round4(
        current.reconciliation.metricExactRatePct - previous.reconciliation.metricExactRatePct,
      ),
      valueAgreementPct: round4(
        current.reconciliation.valueAgreementPct - previous.reconciliation.valueAgreementPct,
      ),
      absoluteVarianceCents:
        current.reconciliation.absoluteVarianceCents - previous.reconciliation.absoluteVarianceCents,
    },
  };
}

export function buildGrhCloseProjection(semantic) {
  const semanticInspection = inspectGrhSemanticContract(semantic);
  if (!semanticInspection.ok) {
    throw closeError(
      'GRH_CLOSE_SOURCE_INVALID',
      'El contrato semantico GRH no es apto para el cierre mensual.',
      semanticInspection.errors,
    );
  }

  const series = buildSeries(semantic);
  const latestPeriod = semantic.payroll.latest_calculation_period;
  const projection = {
    schemaVersion: GRH_CLOSE_SCHEMA_VERSION,
    policyVersion: GRH_PRIVACY_POLICY_VERSION,
    source: {
      canonicalSystem: semantic.source.canonical_system,
      sourceFile: semantic.source.file,
      sourceSha256: semantic.source.sha256,
      snapshotAsOf: semantic.source.snapshot_as_of,
      latestValidCalculationPeriod: latestPeriod,
      realtime: semantic.source.realtime,
    },
    privacy: {
      audience: 'interactive',
      threshold: GRH_CLOSE_PRIVACY_THRESHOLD,
      aggregateOnly: true,
      containsPii: false,
      employeeIdentifiersExported: false,
      rawRowsExported: false,
      categoricalLabelsExported: false,
      cellCodesExported: false,
      comparisonRule: 'both_consecutive_periods_released',
    },
    metric: {
      grain: 'calendar_month',
      currency: semantic.payroll.currency,
      amountUnit: semantic.payroll.amount_unit,
      status: semantic.payroll.executive_metric_status,
      interpretation: 'arithmetic_decomposition_not_causal_explanation',
    },
    series,
    comparison: buildComparison(series, latestPeriod),
  };

  const outputInspection = inspectGrhCloseContract(projection);
  if (!outputInspection.ok) {
    throw closeError(
      'GRH_CLOSE_PROJECTION_INVALID',
      'La proyeccion mensual GRH no supera el contrato de salida.',
      outputInspection.errors,
    );
  }
  return deepFreeze(projection);
}
