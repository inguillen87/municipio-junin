import crypto from 'node:crypto';

export const GRH_WORKFORCE_FINANCE_ARTIFACT_KEY = 'workforce_finance';
export const GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION =
  'grh-workforce-finance-source-v1';
export const GRH_WORKFORCE_FINANCE_POLICY_VERSION =
  'grh-workforce-finance-privacy-v1';
export const GRH_WORKFORCE_FINANCE_PRIVACY_THRESHOLD = 10;
export const GRH_WORKFORCE_FINANCE_PUBLISHED_MONTHS = 24;
export const GRH_WORKFORCE_FINANCE_MAX_OBSERVABLES_PER_VIEW = 13;
export const GRH_WORKFORCE_FINANCE_MAX_PROTECTED_TARGET_STATES_PER_PERIOD = 32768;
export const GRH_WORKFORCE_FINANCE_MAX_SUBSET_EQUATIONS_PER_PERIOD = 12000000;

export const GRH_WORKFORCE_FINANCE_APPROVED_SOURCE = Object.freeze({
  canonicalSystem: 'GRH Junín',
  sourceFile: 'grh_junin.backup_2026080615_plataforma.sql.gz',
  sourceSha256: 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9',
  compressedSizeBytes: 44537741,
  snapshotAsOf: '2026-08-06',
});

export const GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID =
  'e9460c55eaa819146c263f251f96eb269e18fbaad3fb279240e8950187abbe43';

export const GRH_WORKFORCE_FINANCE_SOURCE_DIMENSIONS = Object.freeze([
  'sector',
  'cost_center',
  'agreement',
]);

export const GRH_WORKFORCE_FINANCE_SOURCE_COMPONENT_KEYS = Object.freeze([
  'gross_with_family_allowances_cents',
  'contributory_earnings_cents',
  'non_contributory_earnings_cents',
  'family_allowances_cents',
  'employee_withholdings_cents',
  'net_payroll_cents',
  'net_to_pay_cents',
  'employer_contributions_cents',
]);

const CONTROL_KEYS = Object.freeze([
  'net_identity_variance_cents',
  'net_to_pay_variance_cents',
  'rounding_tolerance_cents',
  'identity_exactly_reconciled',
  'identity_within_rounding_tolerance',
]);

const RECONCILIATION_KEYS = Object.freeze([
  'calculation_runs',
  'totpago_runs',
  'matched_runs',
  'fully_reconciled_runs',
  'run_coverage_pct',
  'metric_exact_rate_pct',
  'value_agreement_pct',
  'absolute_variance_cents',
]);

const CHANGE_KEYS = Object.freeze([
  'status',
  'reason',
  'previous_period',
  'distinct_participants_delta',
  'gross_with_family_allowances_delta_cents',
  'employee_withholdings_delta_cents',
  'net_payroll_delta_cents',
  'employer_contributions_delta_cents',
  'net_payroll_delta_pct',
]);

const SHAPES = Object.freeze({
  top: [
    'schema_version', 'policy_version', 'release_id', 'source', 'metric',
    'cohort', 'privacy', 'capabilities', 'period_totals', 'dimension_views', 'quality',
  ],
  source: [
    'canonical_system', 'file', 'sha256', 'compressed_size_bytes', 'snapshot_as_of',
    'generated_at', 'latest_valid_calculation_period', 'profile_schema_version',
    'semantic_schema_version', 'realtime',
  ],
  metric: [
    'grain', 'currency', 'amount_unit', 'status', 'allocation_basis',
    'allocation_rule', 'interpretation',
  ],
  cohort: [
    'participant_definition', 'assignment_mode', 'assignment_grain',
    'assignment_semantics', 'published_window_months', 'first_period', 'last_period',
    'one_way_dimensions', 'participants_may_overlap_across_categories',
  ],
  privacy: [
    'threshold', 'aggregate_only', 'contains_pii', 'employee_identifiers_exported',
    'raw_rows_exported', 'arbitrary_filters_allowed', 'intersections_allowed',
    'primary_suppression', 'complementary_suppression', 'cross_period_protection',
    'small_overlap_protection', 'released_amounts_remain_arithmetically_comparable',
    'protected_bucket_label',
  ],
  capabilities: [
    'cohort_finance', 'cell_arithmetic_control', 'period_cross_source_reconciliation',
    'cohort_cross_source_reconciliation', 'cohort_absence', 'cohort_leave',
  ],
  periodTotal: [
    'period', 'participant_count', 'participant_display', 'privacy_status',
    'components', 'control', 'reconciliation',
  ],
  dimensionView: ['dimension', 'assignment_semantics', 'periods'],
  dimensionPeriod: ['period', 'privacy_status', 'participant_accounting', 'cells'],
  participantAccounting: [
    'period_distinct_participants', 'sum_cell_distinct_participants_observed',
    'multi_category_participants', 'multi_category_participant_display',
    'multi_category_privacy_status', 'participants_may_overlap',
  ],
  cell: [
    'company_code', 'source_code', 'label', 'distinct_participants_observed',
    'participant_display', 'participant_privacy_status', 'allocation_share_pct',
    'privacy_status', 'components', 'control', 'change',
  ],
  calculationQuality: [
    'source_rows', 'valid_rows', 'quarantine_rows', 'valid_rate_pct', 'window_rows',
    'window_control_rows', 'window_periods',
  ],
  referenceQuality: [
    'dimension', 'observed_codes', 'resolved_codes', 'unresolved_codes',
    'observed_control_runs', 'resolved_control_runs', 'coverage_pct',
  ],
  assignmentQuality: [
    'employee_period_runs', 'invalid_employee_period_runs', 'dimension_run_checks',
    'multi_category_employee_periods',
  ],
  runCheck: [
    'dimension', 'employee_period_runs', 'valid_runs', 'ambiguous_runs',
    'missing_code_runs', 'unresolved_reference_runs', 'invalid_employee_key_runs',
    'coverage_pct',
  ],
  multiCategoryQuality: [
    'dimension', 'employee_periods', 'multi_category_employee_periods',
    'multi_category_pct',
  ],
  participantReconciliation: [
    'periods_checked', 'exact_periods', 'mismatched_periods',
    'all_calculo_employee_periods', 'control_employee_periods',
    'control_cohort_used_for_finance',
  ],
  amountSigns: [
    'periods_checked', 'periods_with_nonpositive_net_payroll',
    'negative_period_components', 'dimensions',
  ],
  dimensionSigns: [
    'dimension', 'cells_checked', 'negative_component_cells',
    'allocation_periods_available', 'allocation_periods_unavailable',
  ],
  partitionCheck: [
    'dimension', 'periods_checked', 'component_identity_failures',
    'net_allocation_identity_failures', 'allocation_share_failures',
  ],
  quality: [
    'calculation', 'references', 'assignment', 'participant_set_reconciliation',
    'amount_signs', 'partition_checks', 'warnings',
  ],
});

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_LABEL = /^[^\u0000-\u001f\u007f]{1,160}$/;
const FORBIDDEN_KEYS = new Set([
  'legajo', 'employee', 'employee_key', 'display_name', 'nombre', 'apellido',
  'dni', 'cuil', 'cbu', 'email', 'phone', 'telefono', 'address', 'domicilio',
]);

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys) {
  if (!plainObject(value)) return false;
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function add(errors, condition, code) {
  if (!condition) errors.push(code);
}

function shape(errors, value, keys, code) {
  add(errors, exactKeys(value, keys), code);
}

function integer(value) {
  return Number.isSafeInteger(value);
}

function nonNegativeInteger(value) {
  return integer(value) && value >= 0;
}

function percentage(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function round4(value) {
  return Number(value.toFixed(4));
}

function ratio4(numerator, denominator) {
  if (!nonNegativeInteger(numerator) || !nonNegativeInteger(denominator)) return null;
  if (denominator === 0) return 0;
  const scaled = BigInt(numerator) * 1000000n;
  const divisor = BigInt(denominator);
  const quotient = scaled / divisor;
  const remainder = scaled % divisor;
  const doubled = remainder * 2n;
  const rounded = quotient + (
    doubled > divisor || (doubled === divisor && quotient % 2n === 1n) ? 1n : 0n
  );
  return Number(rounded) / 10000;
}

function canonicalUtcTimestamp(value) {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z$/.test(
    value || '',
  )) return false;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return false;
  const canonical = date.toISOString();
  return value.includes('.') ? value === canonical : value === canonical.replace('.000Z', 'Z');
}

function nextMonth(value) {
  const match = MONTH.exec(value || '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month === 12
    ? `${String(year + 1).padStart(4, '0')}-01`
    : `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}`;
}

function previousMonth(value) {
  const match = MONTH.exec(value || '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month === 1
    ? `${String(year - 1).padStart(4, '0')}-12`
    : `${String(year).padStart(4, '0')}-${String(month - 1).padStart(2, '0')}`;
}

function consecutiveMonths(values) {
  return Array.isArray(values) && values.length === GRH_WORKFORCE_FINANCE_PUBLISHED_MONTHS &&
    values.every((period, index) => MONTH.test(period) &&
      (index === 0 || nextMonth(values[index - 1]) === period));
}

function noForbiddenKeys(value) {
  if (Array.isArray(value)) return value.every(noForbiddenKeys);
  if (!plainObject(value)) return true;
  return Object.entries(value).every(([key, child]) =>
    !FORBIDDEN_KEYS.has(key.toLowerCase()) && noForbiddenKeys(child));
}

function componentShape(errors, components, code) {
  shape(errors, components, GRH_WORKFORCE_FINANCE_SOURCE_COMPONENT_KEYS, `${code}.structure`);
  add(errors, GRH_WORKFORCE_FINANCE_SOURCE_COMPONENT_KEYS.every(
    key => nonNegativeInteger(components?.[key])),
    `${code}.values`);
  add(errors, components?.gross_with_family_allowances_cents ===
    components?.contributory_earnings_cents +
    components?.non_contributory_earnings_cents +
    components?.family_allowances_cents, `${code}.gross_identity`);
}

function controlShape(errors, control, components, participants, code) {
  shape(errors, control, CONTROL_KEYS, `${code}.structure`);
  add(errors, integer(control?.net_identity_variance_cents), `${code}.net_variance`);
  add(errors, integer(control?.net_to_pay_variance_cents), `${code}.pay_variance`);
  add(errors, typeof control?.identity_exactly_reconciled === 'boolean', `${code}.exact_type`);
  add(errors, control?.net_identity_variance_cents ===
    components?.net_payroll_cents -
      (components?.gross_with_family_allowances_cents - components?.employee_withholdings_cents),
  `${code}.net_identity`);
  add(errors, control?.net_to_pay_variance_cents ===
    components?.net_to_pay_cents - components?.net_payroll_cents, `${code}.pay_identity`);
  add(errors, control?.identity_exactly_reconciled === (
    Math.abs(control?.net_identity_variance_cents) <= 1 &&
    Math.abs(control?.net_to_pay_variance_cents) <= 1
  ), `${code}.exact_identity`);
  if (participants === null) {
    add(errors, control?.rounding_tolerance_cents === null &&
      control?.identity_within_rounding_tolerance === null,
    `${code}.protected_tolerance`);
    return;
  }
  add(errors, nonNegativeInteger(control?.rounding_tolerance_cents), `${code}.tolerance`);
  add(errors, typeof control?.identity_within_rounding_tolerance === 'boolean',
    `${code}.tolerance_type`);
  const tolerance = Math.max(1, participants || 0);
  add(errors, control?.rounding_tolerance_cents === tolerance, `${code}.tolerance_identity`);
  add(errors, control?.identity_within_rounding_tolerance === (
    Math.abs(control?.net_identity_variance_cents) <= tolerance &&
    Math.abs(control?.net_to_pay_variance_cents) <= tolerance
  ), `${code}.within_tolerance_identity`);
}

function inspectReleasedPeriod(errors, row) {
  add(errors, nonNegativeInteger(row?.participant_count) &&
    row.participant_count >= GRH_WORKFORCE_FINANCE_PRIVACY_THRESHOLD,
  'period_totals.small_cell');
  add(errors, row?.participant_display === String(row?.participant_count),
    'period_totals.participant_display');
  componentShape(errors, row?.components, 'period_totals.components');
  controlShape(errors, row?.control, row?.components, row?.participant_count,
    'period_totals.control');
  shape(errors, row?.reconciliation, RECONCILIATION_KEYS,
    'period_totals.reconciliation.structure');
  for (const key of ['calculation_runs', 'totpago_runs', 'matched_runs', 'fully_reconciled_runs']) {
    add(errors, nonNegativeInteger(row?.reconciliation?.[key]),
      `period_totals.reconciliation.${key}`);
  }
  for (const key of ['run_coverage_pct', 'metric_exact_rate_pct', 'value_agreement_pct']) {
    add(errors, percentage(row?.reconciliation?.[key]),
      `period_totals.reconciliation.${key}`);
  }
  add(errors, nonNegativeInteger(row?.reconciliation?.absolute_variance_cents),
    'period_totals.reconciliation.absolute_variance');
  const reconciliation = row?.reconciliation;
  const calculationRuns = reconciliation?.calculation_runs;
  const totpagoRuns = reconciliation?.totpago_runs;
  const matchedRuns = reconciliation?.matched_runs;
  const fullyReconciledRuns = reconciliation?.fully_reconciled_runs;
  add(errors, matchedRuns <= calculationRuns && matchedRuns <= totpagoRuns,
    'period_totals.reconciliation.matched_bounds');
  add(errors, fullyReconciledRuns <= matchedRuns,
    'period_totals.reconciliation.fully_reconciled_bounds');
  const observedRuns = calculationRuns + totpagoRuns - matchedRuns;
  const expectedCoverage = observedRuns
    ? round4((matchedRuns * 100) / observedRuns)
    : 0;
  add(errors, reconciliation?.run_coverage_pct === expectedCoverage,
    'period_totals.reconciliation.coverage_identity');
  if (matchedRuns === 0) {
    add(errors, fullyReconciledRuns === 0 &&
      reconciliation?.metric_exact_rate_pct === 0 &&
      reconciliation?.absolute_variance_cents === 0 &&
      reconciliation?.value_agreement_pct === 0,
    'period_totals.reconciliation.empty_identity');
    return;
  }
  const metricCells = matchedRuns * 5;
  const impliedExactCells = Math.round(
    (reconciliation?.metric_exact_rate_pct * metricCells) / 100,
  );
  add(errors, nonNegativeInteger(impliedExactCells) &&
    round4((impliedExactCells * 100) / metricCells) ===
      reconciliation?.metric_exact_rate_pct &&
    impliedExactCells >= fullyReconciledRuns * 5 &&
    impliedExactCells <= fullyReconciledRuns * 5 +
      (matchedRuns - fullyReconciledRuns) * 4,
  'period_totals.reconciliation.metric_identity');
  if (reconciliation?.absolute_variance_cents === 0) {
    add(errors, fullyReconciledRuns === matchedRuns &&
      reconciliation?.metric_exact_rate_pct === 100,
    'period_totals.reconciliation.zero_variance_identity');
  }
}

function inspectPeriodTotals(errors, rows) {
  add(errors, Array.isArray(rows), 'period_totals.structure');
  const periods = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    shape(errors, row, SHAPES.periodTotal, 'period_totals.row_structure');
    periods.push(row?.period);
    add(errors, row?.privacy_status === 'released', 'period_totals.privacy_status');
    inspectReleasedPeriod(errors, row);
  }
  add(errors, consecutiveMonths(periods), 'period_totals.window');
  return periods;
}

function inspectChange(errors, cell, previousCell, expectedPreviousPeriod) {
  const change = cell?.change;
  shape(errors, change, CHANGE_KEYS, 'dimension_views.change.structure');
  add(errors, change?.previous_period === expectedPreviousPeriod,
    'dimension_views.change.previous_period');
  if (change?.status === 'released') {
    add(errors, cell?.participant_privacy_status === 'released' &&
      previousCell?.participant_privacy_status === 'released',
    'dimension_views.change.released_count_visibility');
    add(errors, change?.reason === 'both_consecutive_periods_released',
      'dimension_views.change.released_reason');
    for (const key of CHANGE_KEYS.slice(3, 8)) {
      add(errors, integer(change?.[key]), `dimension_views.change.${key}`);
    }
    add(errors, change?.net_payroll_delta_pct === null ||
      Number.isFinite(change?.net_payroll_delta_pct),
    'dimension_views.change.net_pct');
    add(errors, Boolean(previousCell) &&
      change?.distinct_participants_delta ===
        cell?.distinct_participants_observed - previousCell?.distinct_participants_observed &&
      change?.gross_with_family_allowances_delta_cents ===
        cell?.components?.gross_with_family_allowances_cents -
          previousCell?.components?.gross_with_family_allowances_cents &&
      change?.employee_withholdings_delta_cents ===
        cell?.components?.employee_withholdings_cents -
          previousCell?.components?.employee_withholdings_cents &&
      change?.net_payroll_delta_cents ===
        cell?.components?.net_payroll_cents - previousCell?.components?.net_payroll_cents &&
      change?.employer_contributions_delta_cents ===
        cell?.components?.employer_contributions_cents -
          previousCell?.components?.employer_contributions_cents,
    'dimension_views.change.delta_identity');
    const previousNet = previousCell?.components?.net_payroll_cents;
    const expectedPct = previousNet
      ? round4((change?.net_payroll_delta_cents / Math.abs(previousNet)) * 100)
      : null;
    add(errors, change?.net_payroll_delta_pct === expectedPct,
      'dimension_views.change.net_pct_identity');
    return;
  }
  add(errors, change?.status === 'unavailable', 'dimension_views.change.status');
  add(errors, [
    'pending_comparison', 'privacy_protected', 'protected_bucket_composition',
    'previous_period_missing', 'category_not_comparable', 'membership_change_protected',
    'participant_count_protected',
  ].includes(change?.reason), 'dimension_views.change.reason');
  for (const key of CHANGE_KEYS.slice(3)) {
    add(errors, change?.[key] === null, `dimension_views.change.unavailable_${key}`);
  }
  if (change?.reason === 'membership_change_protected') {
    add(errors, cell?.distinct_participants_observed === null &&
      cell?.participant_privacy_status === 'protected_difference_attack',
    'dimension_views.change.membership_count_mask');
  }
}

function inspectCell(errors, cell, total, previousCell, expectedPreviousPeriod) {
  shape(errors, cell, SHAPES.cell, 'dimension_views.cell_structure');
  componentShape(errors, cell?.components, 'dimension_views.components');
  const releasedIdentity = cell?.privacy_status === 'released';
  const protectedIdentity = cell?.privacy_status === 'protected_aggregate';
  add(errors, releasedIdentity || protectedIdentity, 'dimension_views.cell_privacy_status');
  if (releasedIdentity) {
    add(errors, nonNegativeInteger(cell?.company_code), 'dimension_views.company_code');
    add(errors, nonNegativeInteger(cell?.source_code), 'dimension_views.source_code');
    add(errors, typeof cell?.label === 'string' && SAFE_LABEL.test(cell.label),
      'dimension_views.label');
  } else {
    add(errors, cell?.company_code === null && cell?.source_code === null,
      'dimension_views.protected_identity');
    add(errors, cell?.label === 'Otros (celdas protegidas)',
      'dimension_views.protected_label');
  }
  if (cell?.participant_privacy_status === 'released') {
    add(errors, nonNegativeInteger(cell?.distinct_participants_observed) &&
      cell.distinct_participants_observed >= GRH_WORKFORCE_FINANCE_PRIVACY_THRESHOLD,
    'dimension_views.cell_small_count');
    add(errors, cell?.participant_display === String(cell?.distinct_participants_observed),
      'dimension_views.cell_count_display');
  } else {
    add(errors, cell?.participant_privacy_status === 'protected_difference_attack',
      'dimension_views.participant_privacy_status');
    add(errors, cell?.distinct_participants_observed === null &&
      cell?.participant_display === 'Protegido', 'dimension_views.protected_count');
  }
  controlShape(errors, cell?.control, cell?.components,
    cell?.distinct_participants_observed,
    'dimension_views.control');
  inspectChange(errors, cell, previousCell, expectedPreviousPeriod);
  add(errors, cell?.allocation_share_pct === null || percentage(cell?.allocation_share_pct),
    'dimension_views.allocation_share');
}

function inspectParticipantAccounting(errors, accounting, cells, total) {
  shape(errors, accounting, SHAPES.participantAccounting,
    'dimension_views.participant_accounting.structure');
  add(errors, nonNegativeInteger(accounting?.period_distinct_participants) &&
    accounting.period_distinct_participants >= GRH_WORKFORCE_FINANCE_PRIVACY_THRESHOLD,
  'dimension_views.participant_accounting.period_count');
  add(errors, accounting?.period_distinct_participants === total?.participant_count,
    'dimension_views.participant_accounting.period_identity');
  const status = accounting?.multi_category_privacy_status;
  const hasProtectedCount = cells.some(cell =>
    cell?.participant_privacy_status === 'protected_difference_attack');
  if (hasProtectedCount) {
    add(errors, accounting?.sum_cell_distinct_participants_observed === null,
      'dimension_views.participant_accounting.protected_sum');
  }
  if (status === 'protected') {
    add(errors, accounting?.multi_category_participants === null &&
      accounting?.sum_cell_distinct_participants_observed === null &&
      accounting?.multi_category_participant_display ===
        `<${GRH_WORKFORCE_FINANCE_PRIVACY_THRESHOLD}` &&
      accounting?.participants_may_overlap === true,
    'dimension_views.participant_accounting.protected');
    add(errors, cells.some(cell =>
      cell?.participant_privacy_status === 'protected_difference_attack') ||
      (cells.length === 1 && cells[0]?.privacy_status === 'protected_aggregate'),
    'dimension_views.participant_accounting.difference_companion');
    return;
  }
  add(errors, ['released', 'not_observed'].includes(status),
    'dimension_views.participant_accounting.status');
  add(errors, nonNegativeInteger(accounting?.multi_category_participants),
    'dimension_views.participant_accounting.multi_count');
  add(errors, accounting?.multi_category_participant_display ===
    String(accounting?.multi_category_participants),
  'dimension_views.participant_accounting.display');
  if (status === 'not_observed') {
    add(errors, accounting?.multi_category_participants === 0 &&
      accounting?.participants_may_overlap === false,
    'dimension_views.participant_accounting.not_observed_identity');
  } else {
    add(errors, accounting?.multi_category_participants > 0 &&
      accounting?.multi_category_participants <=
        accounting?.period_distinct_participants &&
      accounting?.participants_may_overlap === true,
    'dimension_views.participant_accounting.released_identity');
  }
  if (hasProtectedCount) {
    return;
  }
  add(errors, nonNegativeInteger(accounting?.sum_cell_distinct_participants_observed),
    'dimension_views.participant_accounting.cell_sum');
  if (status === 'not_observed') {
    add(errors, accounting?.sum_cell_distinct_participants_observed ===
      accounting?.period_distinct_participants,
    'dimension_views.participant_accounting.not_observed_sum');
  } else {
    add(errors, accounting?.sum_cell_distinct_participants_observed >=
      accounting?.period_distinct_participants +
        accounting?.multi_category_participants,
    'dimension_views.participant_accounting.released_sum');
  }
}

function inspectDimensionViews(errors, views, expectedPeriods, totals) {
  add(errors, Array.isArray(views) && views.length ===
    GRH_WORKFORCE_FINANCE_SOURCE_DIMENSIONS.length, 'dimension_views.structure');
  const totalByPeriod = new Map(totals.map(row => [row.period, row]));
  for (const [viewIndex, view] of (Array.isArray(views) ? views : []).entries()) {
    shape(errors, view, SHAPES.dimensionView, 'dimension_views.view_structure');
    add(errors, view?.dimension === GRH_WORKFORCE_FINANCE_SOURCE_DIMENSIONS[viewIndex],
      'dimension_views.dimension_order');
    add(errors, view?.assignment_semantics ===
      'dimension_observed_on_calculo_run_not_contract_status',
    'dimension_views.assignment_semantics');
    const actualPeriods = Array.isArray(view?.periods)
      ? view.periods.map(row => row?.period)
      : [];
    add(errors, actualPeriods.length === expectedPeriods.length &&
      actualPeriods.every((period, index) => period === expectedPeriods[index]),
    'dimension_views.period_identity');
    let previousReleased = new Map();
    for (const row of Array.isArray(view?.periods) ? view.periods : []) {
      shape(errors, row, SHAPES.dimensionPeriod, 'dimension_views.period_structure');
      add(errors, row?.privacy_status === 'released', 'dimension_views.period_privacy');
      add(errors, Array.isArray(row?.cells) && row.cells.length > 0,
        'dimension_views.cells_structure');
      const safeCells = Array.isArray(row?.cells) ? row.cells : [];
      const total = totalByPeriod.get(row?.period);
      inspectParticipantAccounting(
        errors, row?.participant_accounting, safeCells, total,
      );
      const currentReleased = new Map();
      const releasedCells = safeCells.filter(cell => cell?.privacy_status === 'released');
      const canonicalReleasedCells = [...releasedCells].sort((left, right) => {
        const amountOrder = Number(right?.components?.net_payroll_cents || 0) -
          Number(left?.components?.net_payroll_cents || 0);
        if (amountOrder !== 0) return amountOrder;
        const labelOrder = String(left?.label || '').localeCompare(String(right?.label || ''));
        if (labelOrder !== 0) return labelOrder;
        const companyOrder = String(left?.company_code).localeCompare(String(right?.company_code));
        if (companyOrder !== 0) return companyOrder;
        return String(left?.source_code).localeCompare(String(right?.source_code));
      });
      add(errors, releasedCells.every((cell, index) => cell === canonicalReleasedCells[index]) &&
        safeCells.slice(releasedCells.length).every(cell =>
          cell?.privacy_status === 'protected_aggregate'),
      'dimension_views.public_order');
      const componentSums = Object.fromEntries(
        GRH_WORKFORCE_FINANCE_SOURCE_COMPONENT_KEYS.map(key => [key, 0]));
      for (const cell of safeCells) {
        const key = `${cell?.company_code}:${cell?.source_code}`;
        inspectCell(errors, cell, total, previousReleased.get(key), previousMonth(row?.period));
        if (cell?.privacy_status === 'released') currentReleased.set(key, cell);
        for (const component of GRH_WORKFORCE_FINANCE_SOURCE_COMPONENT_KEYS) {
          componentSums[component] += Number(cell?.components?.[component] || 0);
        }
      }
      add(errors, GRH_WORKFORCE_FINANCE_SOURCE_COMPONENT_KEYS.every(key =>
        componentSums[key] === total?.components?.[key]),
      'dimension_views.component_partition');
      const allNonNegative = GRH_WORKFORCE_FINANCE_SOURCE_COMPONENT_KEYS.every(key =>
        total?.components?.[key] >= 0) && safeCells.every(cell =>
        GRH_WORKFORCE_FINANCE_SOURCE_COMPONENT_KEYS.every(key => cell?.components?.[key] >= 0));
      const allocationEligible = allNonNegative && total?.components?.net_payroll_cents > 0;
      const shares = safeCells.map(cell => cell?.allocation_share_pct);
      add(errors, allocationEligible
        ? shares.every(percentage) && Math.abs(shares.reduce((sum, value) => sum + value, 0) - 100) <= 0.01
        : shares.every(value => value === null),
      'dimension_views.allocation_identity');
      previousReleased = currentReleased;
    }
  }
}

function inspectSource(errors, source) {
  shape(errors, source, SHAPES.source, 'source.structure');
  add(errors, source?.canonical_system === GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.canonicalSystem,
    'source.canonical_system');
  add(errors, source?.file === GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.sourceFile,
    'source.file');
  add(errors, source?.sha256 === GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.sourceSha256,
    'source.sha256');
  add(errors, source?.compressed_size_bytes ===
    GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.compressedSizeBytes, 'source.size');
  add(errors, source?.snapshot_as_of === GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.snapshotAsOf,
    'source.snapshot');
  add(errors, canonicalUtcTimestamp(source?.generated_at), 'source.generated_at');
  add(errors, MONTH.test(source?.latest_valid_calculation_period || ''), 'source.latest_period');
  add(errors, source?.profile_schema_version === 'grh-profile-v1', 'source.profile_version');
  add(errors, source?.semantic_schema_version === 'grh-semantic-v2', 'source.semantic_version');
  add(errors, source?.realtime === false, 'source.realtime');
}

function canonicalReleaseNumber(value) {
  if (!Number.isFinite(value)) {
    throw new TypeError('workforce-finance release number is not finite');
  }
  if (Object.is(value, -0) || value === 0) return '0';
  if (Number.isInteger(value)) {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError('workforce-finance release integer exceeds safe JSON range');
    }
    return String(value);
  }
  const fixed = value.toFixed(4);
  if (Number(fixed) !== value) {
    throw new TypeError('workforce-finance release number exceeds four decimals');
  }
  return fixed.replace(/0+$/, '').replace(/\.$/, '');
}

export function canonicalGrhWorkforceFinanceReleaseJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalGrhWorkforceFinanceReleaseJson).join(',')}]`;
  }
  if (plainObject(value)) {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalGrhWorkforceFinanceReleaseJson(value[key])}`
    ).join(',')}}`;
  }
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return canonicalReleaseNumber(value);
  throw new TypeError('workforce-finance release content is not canonical JSON');
}

export function computeGrhWorkforceFinanceContentDigest(artifact) {
  if (!plainObject(artifact)) {
    throw new TypeError('workforce-finance release artifact must be an object');
  }
  const content = Object.fromEntries(
    Object.entries(artifact).filter(([key]) => key !== 'release_id'),
  );
  return crypto.createHash('sha256')
    .update(canonicalGrhWorkforceFinanceReleaseJson(content), 'utf8')
    .digest('hex');
}

export function computeGrhWorkforceFinanceReleaseId(artifact) {
  const material = [
    GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION,
    GRH_WORKFORCE_FINANCE_POLICY_VERSION,
    artifact?.source?.sha256,
    artifact?.source?.snapshot_as_of,
    artifact?.cohort?.first_period,
    artifact?.cohort?.last_period,
    'calculo_row_observed',
    computeGrhWorkforceFinanceContentDigest(artifact),
  ].join('|');
  return crypto.createHash('sha256').update(material).digest('hex');
}

export function inspectGrhWorkforceFinanceSourceContract(data) {
  const errors = [];
  shape(errors, data, SHAPES.top, 'source_contract.structure');
  add(errors, data?.schema_version === GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION,
    'schema.version');
  add(errors, data?.policy_version === GRH_WORKFORCE_FINANCE_POLICY_VERSION,
    'policy.version');
  add(errors, SHA256.test(data?.release_id || ''), 'release.id');
  inspectSource(errors, data?.source);

  shape(errors, data?.metric, SHAPES.metric, 'metric.structure');
  add(errors, data?.metric?.grain === 'calendar_month_x_observed_run_dimension', 'metric.grain');
  add(errors, data?.metric?.currency === 'not_declared_in_source', 'metric.currency');
  add(errors, data?.metric?.amount_unit === 'source_currency_cents', 'metric.amount_unit');
  add(errors, data?.metric?.status === 'calculation_control_not_bank_disbursement', 'metric.status');
  add(errors, data?.metric?.allocation_basis === 'net_payroll_cents', 'metric.allocation_basis');
  add(errors, data?.metric?.allocation_rule ===
    'released_only_when_all_period_cell_components_nonnegative_and_period_net_positive',
  'metric.allocation_rule');
  add(errors, data?.metric?.interpretation ===
    'run_observed_allocation_not_exclusive_workforce_distribution', 'metric.interpretation');

  shape(errors, data?.cohort, SHAPES.cohort, 'cohort.structure');
  add(errors, data?.cohort?.participant_definition ===
    'distinct_company_employee_key_observed_in_allowlisted_control_concepts',
  'cohort.participant_definition');
  add(errors, data?.cohort?.assignment_mode === 'calculo_row_observed', 'cohort.assignment_mode');
  add(errors, data?.cohort?.assignment_grain ===
    'company_employee_period_calculation_date_run_type', 'cohort.assignment_grain');
  add(errors, data?.cohort?.assignment_semantics ===
    'dimension_observed_on_calculo_run_not_contract_status', 'cohort.assignment_semantics');
  add(errors, data?.cohort?.published_window_months ===
    GRH_WORKFORCE_FINANCE_PUBLISHED_MONTHS, 'cohort.window');
  add(errors, Array.isArray(data?.cohort?.one_way_dimensions) &&
    data.cohort.one_way_dimensions.length === GRH_WORKFORCE_FINANCE_SOURCE_DIMENSIONS.length &&
    data.cohort.one_way_dimensions.every((item, index) =>
      item === GRH_WORKFORCE_FINANCE_SOURCE_DIMENSIONS[index]), 'cohort.dimensions');
  add(errors, data?.cohort?.participants_may_overlap_across_categories === true,
    'cohort.overlap');

  shape(errors, data?.privacy, SHAPES.privacy, 'privacy.structure');
  add(errors, data?.privacy?.threshold === GRH_WORKFORCE_FINANCE_PRIVACY_THRESHOLD,
    'privacy.threshold');
  for (const key of [
    'aggregate_only', 'primary_suppression', 'complementary_suppression',
    'small_overlap_protection',
  ]) add(errors, data?.privacy?.[key] === true, `privacy.${key}`);
  for (const key of [
    'contains_pii', 'employee_identifiers_exported', 'raw_rows_exported',
    'arbitrary_filters_allowed', 'intersections_allowed',
  ]) add(errors, data?.privacy?.[key] === false, `privacy.${key}`);
  add(errors, data?.privacy?.cross_period_protection ===
    'consecutive_participant_count_difference_protection',
  'privacy.cross_period_protection');
  add(errors, data?.privacy?.released_amounts_remain_arithmetically_comparable === true,
    'privacy.released_amount_comparability');
  add(errors, data?.privacy?.protected_bucket_label === 'Otros (celdas protegidas)',
    'privacy.protected_label');

  shape(errors, data?.capabilities, SHAPES.capabilities, 'capabilities.structure');
  add(errors,
    data?.capabilities?.cohort_finance === 'released' &&
    data?.capabilities?.cell_arithmetic_control === 'released' &&
    data?.capabilities?.period_cross_source_reconciliation === 'released' &&
    data?.capabilities?.cohort_cross_source_reconciliation ===
      'unavailable_no_dimensional_totpago_join' &&
    data?.capabilities?.cohort_absence === 'not_in_source_v1' &&
    data?.capabilities?.cohort_leave === 'not_in_source_v1',
  'capabilities.identity');
  const periods = inspectPeriodTotals(errors, data?.period_totals);
  add(errors, data?.cohort?.first_period === periods[0] &&
    data?.cohort?.last_period === periods.at(-1) &&
    data?.source?.latest_valid_calculation_period === periods.at(-1),
  'cohort.period_identity');
  inspectDimensionViews(errors, data?.dimension_views, periods,
    Array.isArray(data?.period_totals) ? data.period_totals : []);

  shape(errors, data?.quality, SHAPES.quality, 'quality.structure');
  shape(errors, data?.quality?.calculation, SHAPES.calculationQuality,
    'quality.calculation.structure');
  const calculation = data?.quality?.calculation;
  const calculationCountsValid = [
    'source_rows', 'valid_rows', 'quarantine_rows', 'window_rows',
    'window_control_rows', 'window_periods',
  ].every(key => nonNegativeInteger(calculation?.[key]));
  add(errors, calculationCountsValid, 'quality.calculation.counts');
  add(errors, percentage(calculation?.valid_rate_pct), 'quality.calculation.valid_rate');
  add(errors, calculationCountsValid &&
    calculation.source_rows === calculation.valid_rows + calculation.quarantine_rows,
  'quality.calculation.row_partition');
  add(errors, calculationCountsValid && percentage(calculation?.valid_rate_pct) &&
    calculation.valid_rate_pct === ratio4(calculation.valid_rows, calculation.source_rows),
  'quality.calculation.valid_rate_identity');
  add(errors, calculationCountsValid &&
    calculation.window_control_rows <= calculation.window_rows &&
    calculation.window_rows <= calculation.valid_rows,
  'quality.calculation.window_bounds');
  add(errors, calculationCountsValid && calculation.window_periods ===
    GRH_WORKFORCE_FINANCE_PUBLISHED_MONTHS, 'quality.calculation.window');
  add(errors, Array.isArray(data?.quality?.references) &&
    data.quality.references.length === GRH_WORKFORCE_FINANCE_SOURCE_DIMENSIONS.length,
  'quality.references.structure');
  const references = Array.isArray(data?.quality?.references) ? data.quality.references : [];
  const referenceByDimension = new Map();
  for (const [index, row] of references.entries()) {
    shape(errors, row, SHAPES.referenceQuality, 'quality.references.row_structure');
    const dimension = GRH_WORKFORCE_FINANCE_SOURCE_DIMENSIONS[index];
    add(errors, row?.dimension === dimension,
      'quality.references.dimension');
    const referenceCountsValid = [
      'observed_codes', 'resolved_codes', 'unresolved_codes',
      'observed_control_runs', 'resolved_control_runs',
    ].every(key => nonNegativeInteger(row?.[key]));
    add(errors, referenceCountsValid, 'quality.references.counts');
    add(errors, percentage(row?.coverage_pct), 'quality.references.coverage');
    add(errors, referenceCountsValid &&
      row.resolved_codes + row.unresolved_codes === row.observed_codes,
    'quality.references.code_partition');
    add(errors, referenceCountsValid && row.resolved_control_runs <= row.observed_control_runs,
      'quality.references.run_bounds');
    add(errors, referenceCountsValid && percentage(row?.coverage_pct) &&
      row.coverage_pct === ratio4(row.resolved_control_runs, row.observed_control_runs),
    'quality.references.coverage_identity');
    if (dimension) referenceByDimension.set(dimension, row);
  }
  shape(errors, data?.quality?.assignment, SHAPES.assignmentQuality,
    'quality.assignment.structure');
  const assignment = data?.quality?.assignment;
  const assignmentCountsValid = nonNegativeInteger(assignment?.employee_period_runs) &&
    nonNegativeInteger(assignment?.invalid_employee_period_runs);
  add(errors, assignmentCountsValid, 'quality.assignment.counts');
  add(errors, assignmentCountsValid &&
    assignment.invalid_employee_period_runs <= assignment.employee_period_runs,
  'quality.assignment.invalid_bounds');
  const runChecks = Array.isArray(data?.quality?.assignment?.dimension_run_checks)
    ? data.quality.assignment.dimension_run_checks
    : [];
  add(errors, runChecks.length === GRH_WORKFORCE_FINANCE_SOURCE_DIMENSIONS.length,
    'quality.assignment.run_checks');
  const invalidRunCounts = [];
  for (const [index, row] of runChecks.entries()) {
    shape(errors, row, SHAPES.runCheck, 'quality.assignment.run_structure');
    const dimension = GRH_WORKFORCE_FINANCE_SOURCE_DIMENSIONS[index];
    add(errors, row?.dimension === dimension,
      'quality.assignment.run_dimension');
    const runCountsValid = [
      'employee_period_runs', 'valid_runs', 'ambiguous_runs', 'missing_code_runs',
      'unresolved_reference_runs', 'invalid_employee_key_runs',
    ].every(key => nonNegativeInteger(row?.[key]));
    add(errors, runCountsValid, 'quality.assignment.run_counts');
    add(errors, percentage(row?.coverage_pct), 'quality.assignment.run_coverage');
    const invalidRuns = runCountsValid
      ? row.ambiguous_runs + row.missing_code_runs + row.unresolved_reference_runs +
        row.invalid_employee_key_runs
      : null;
    if (invalidRuns !== null) invalidRunCounts.push(invalidRuns);
    add(errors, runCountsValid && assignmentCountsValid &&
      row.employee_period_runs === assignment.employee_period_runs,
    'quality.assignment.run_population');
    add(errors, runCountsValid && row.valid_runs + invalidRuns === row.employee_period_runs,
      'quality.assignment.run_partition');
    add(errors, runCountsValid && percentage(row?.coverage_pct) &&
      row.coverage_pct === ratio4(row.valid_runs, row.employee_period_runs),
    'quality.assignment.run_coverage_identity');
    const reference = referenceByDimension.get(dimension);
    add(errors, Boolean(reference) && runCountsValid &&
      reference?.observed_control_runs === row.employee_period_runs &&
      reference?.resolved_control_runs === row.valid_runs,
    'quality.reference_assignment_identity');
  }
  add(errors, assignmentCountsValid &&
    assignment.invalid_employee_period_runs === Math.max(0, ...invalidRunCounts) &&
    invalidRunCounts.length === GRH_WORKFORCE_FINANCE_SOURCE_DIMENSIONS.length,
  'quality.assignment.invalid_identity');
  const multiCategory = Array.isArray(data?.quality?.assignment?.multi_category_employee_periods)
    ? data.quality.assignment.multi_category_employee_periods
    : [];
  add(errors, multiCategory.length === GRH_WORKFORCE_FINANCE_SOURCE_DIMENSIONS.length,
    'quality.assignment.multi_category');
  for (const [index, row] of multiCategory.entries()) {
    shape(errors, row, SHAPES.multiCategoryQuality, 'quality.assignment.multi_structure');
    add(errors, row?.dimension === GRH_WORKFORCE_FINANCE_SOURCE_DIMENSIONS[index],
      'quality.assignment.multi_dimension');
    const multiCountsValid = nonNegativeInteger(row?.employee_periods) &&
      nonNegativeInteger(row?.multi_category_employee_periods);
    add(errors, multiCountsValid, 'quality.assignment.multi_counts');
    add(errors, percentage(row?.multi_category_pct), 'quality.assignment.multi_percentage');
    add(errors, multiCountsValid &&
      row.multi_category_employee_periods <= row.employee_periods,
    'quality.assignment.multi_bounds');
    add(errors, multiCountsValid && percentage(row?.multi_category_pct) &&
      row.multi_category_pct === ratio4(
        row.multi_category_employee_periods, row.employee_periods,
      ),
    'quality.assignment.multi_percentage_identity');
  }
  shape(errors, data?.quality?.participant_set_reconciliation,
    SHAPES.participantReconciliation, 'quality.participant_reconciliation.structure');
  const participant = data?.quality?.participant_set_reconciliation;
  const participantCountsValid = [
    'periods_checked', 'exact_periods', 'mismatched_periods',
    'all_calculo_employee_periods', 'control_employee_periods',
  ].every(key => nonNegativeInteger(participant?.[key]));
  add(errors, participantCountsValid, 'quality.participant_reconciliation.counts');
  add(errors, participantCountsValid &&
    participant.periods_checked === GRH_WORKFORCE_FINANCE_PUBLISHED_MONTHS &&
    participant.exact_periods + participant.mismatched_periods === participant.periods_checked &&
    participant.exact_periods === participant.periods_checked &&
    participant.mismatched_periods === 0 &&
    participant.all_calculo_employee_periods === participant.control_employee_periods &&
    participant?.control_cohort_used_for_finance === true,
  'quality.participant_reconciliation.identity');
  const periodParticipantTotal = Array.isArray(data?.period_totals) &&
    data.period_totals.every(row => nonNegativeInteger(row?.participant_count))
    ? data.period_totals.reduce((sum, row) => sum + row.participant_count, 0)
    : null;
  add(errors, participantCountsValid && periodParticipantTotal !== null &&
    participant.control_employee_periods === periodParticipantTotal,
  'quality.participant_reconciliation.period_total_identity');
  for (const row of multiCategory) {
    add(errors, participantCountsValid && nonNegativeInteger(row?.employee_periods) &&
      row.employee_periods === participant.control_employee_periods,
    'quality.assignment.multi_population');
  }
  shape(errors, data?.quality?.amount_signs, SHAPES.amountSigns,
    'quality.amount_signs.structure');
  add(errors, data?.quality?.amount_signs?.periods_checked ===
    GRH_WORKFORCE_FINANCE_PUBLISHED_MONTHS,
  'quality.amount_signs.periods_checked');
  add(errors, nonNegativeInteger(
    data?.quality?.amount_signs?.periods_with_nonpositive_net_payroll),
  'quality.amount_signs.nonpositive_count');
  shape(errors, data?.quality?.amount_signs?.negative_period_components,
    GRH_WORKFORCE_FINANCE_SOURCE_COMPONENT_KEYS, 'quality.amount_signs.period_components');
  add(errors, data?.quality?.amount_signs?.periods_with_nonpositive_net_payroll === 0 &&
    GRH_WORKFORCE_FINANCE_SOURCE_COMPONENT_KEYS.every(key =>
      data?.quality?.amount_signs?.negative_period_components?.[key] === 0),
  'quality.amount_signs.period_gate');
  const amountDimensions = Array.isArray(data?.quality?.amount_signs?.dimensions)
    ? data.quality.amount_signs.dimensions
    : [];
  add(errors, amountDimensions.length === GRH_WORKFORCE_FINANCE_SOURCE_DIMENSIONS.length,
    'quality.amount_signs.dimensions');
  for (const [index, row] of amountDimensions.entries()) {
    shape(errors, row, SHAPES.dimensionSigns, 'quality.amount_signs.dimension_structure');
    shape(errors, row?.negative_component_cells,
      GRH_WORKFORCE_FINANCE_SOURCE_COMPONENT_KEYS,
      'quality.amount_signs.dimension_components');
    add(errors, row?.dimension === GRH_WORKFORCE_FINANCE_SOURCE_DIMENSIONS[index],
      'quality.amount_signs.dimension');
    add(errors, nonNegativeInteger(row?.cells_checked) &&
      nonNegativeInteger(row?.allocation_periods_available) &&
      nonNegativeInteger(row?.allocation_periods_unavailable),
    'quality.amount_signs.dimension_counts');
    add(errors, GRH_WORKFORCE_FINANCE_SOURCE_COMPONENT_KEYS.every(key =>
      nonNegativeInteger(row?.negative_component_cells?.[key]) &&
      row.negative_component_cells[key] === 0) &&
      row?.allocation_periods_available + row?.allocation_periods_unavailable ===
        GRH_WORKFORCE_FINANCE_PUBLISHED_MONTHS &&
      row?.allocation_periods_unavailable === 0,
    'quality.amount_signs.dimension_gate');
  }
  const partitions = Array.isArray(data?.quality?.partition_checks)
    ? data.quality.partition_checks
    : [];
  add(errors, partitions.length === GRH_WORKFORCE_FINANCE_SOURCE_DIMENSIONS.length,
    'quality.partition.structure');
  for (const [index, row] of partitions.entries()) {
    shape(errors, row, SHAPES.partitionCheck, 'quality.partition.structure');
    add(errors, row?.dimension === GRH_WORKFORCE_FINANCE_SOURCE_DIMENSIONS[index],
      'quality.partition.dimension');
    add(errors, [
      'periods_checked', 'component_identity_failures',
      'net_allocation_identity_failures', 'allocation_share_failures',
    ].every(key => nonNegativeInteger(row?.[key])), 'quality.partition.counts');
    add(errors, row?.periods_checked === GRH_WORKFORCE_FINANCE_PUBLISHED_MONTHS &&
      row?.component_identity_failures === 0 &&
      row?.net_allocation_identity_failures === 0 &&
      row?.allocation_share_failures === 0, 'quality.partition.identity');
  }
  const warningList = Array.isArray(data?.quality?.warnings)
    ? data.quality.warnings
    : [];
  add(errors, Array.isArray(data?.quality?.warnings) &&
    warningList.every(item => typeof item === 'string' && SAFE_LABEL.test(item)),
  'quality.warnings');
  add(errors, warningList.includes(
    'cross_view_single_cell_difference_gate_passed') &&
    warningList.includes('cross_view_remaining_single_cell_risks:0'),
  'quality.cross_view_gate');
  const subsetMaxWarning = warningList.find(item =>
    typeof item === 'string' &&
    item.startsWith('cross_view_max_observables_per_view:'));
  const subsetEquationsWarning = warningList.find(item =>
    typeof item === 'string' &&
    item.startsWith('cross_view_subset_equations_checked:'));
  const targetStatesWarning = warningList.find(item =>
    typeof item === 'string' &&
    item.startsWith('cross_view_max_protected_target_states_per_period:'));
  const maxPeriodEquationsWarning = warningList.find(item =>
    typeof item === 'string' &&
    item.startsWith('cross_view_max_subset_equations_per_period:'));
  const subsetMax = Number(subsetMaxWarning?.split(':')[1]);
  const subsetEquations = Number(subsetEquationsWarning?.split(':')[1]);
  const targetStates = Number(targetStatesWarning?.split(':')[1]);
  const maxPeriodEquations = Number(maxPeriodEquationsWarning?.split(':')[1]);
  add(errors, warningList.includes(
    'cross_view_subset_difference_gate_passed') &&
    warningList.includes(
      'cross_view_remaining_subset_difference_risks:0') &&
    Number.isSafeInteger(subsetMax) && subsetMax >= 0 &&
    subsetMax <= GRH_WORKFORCE_FINANCE_MAX_OBSERVABLES_PER_VIEW &&
    Number.isSafeInteger(subsetEquations) && subsetEquations > 0 &&
    Number.isSafeInteger(targetStates) && targetStates > 0 &&
    targetStates <= GRH_WORKFORCE_FINANCE_MAX_PROTECTED_TARGET_STATES_PER_PERIOD &&
    Number.isSafeInteger(maxPeriodEquations) && maxPeriodEquations > 0 &&
    maxPeriodEquations <= GRH_WORKFORCE_FINANCE_MAX_SUBSET_EQUATIONS_PER_PERIOD,
  'quality.cross_view_subset_gate');
  add(errors, noForbiddenKeys(data), 'privacy.forbidden_keys');
  let expectedReleaseId = null;
  try {
    expectedReleaseId = computeGrhWorkforceFinanceReleaseId(data);
  } catch {
    // Shape/type errors are already collected; release validation remains fail-closed.
  }
  add(errors, data?.release_id === expectedReleaseId, 'release.identity');

  const uniqueErrors = Object.freeze([...new Set(errors)]);
  return Object.freeze({ ok: uniqueErrors.length === 0, errors: uniqueErrors });
}

export function validateGrhWorkforceFinanceSourceContract(data) {
  return inspectGrhWorkforceFinanceSourceContract(data).ok;
}
