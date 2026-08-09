const QUALITY_COMPONENTS = Object.freeze([
  'temporal_validity',
  'referential_integrity',
  'payroll_reconciliation',
  'legajo_key_uniqueness',
]);

const WORKFORCE_RANKINGS = Object.freeze([
  'by_sector',
  'by_cost_center',
  'by_agreement',
]);

const FOCUSED_SOURCE_TABLES = Object.freeze([
  'legajo',
  'calculo',
  'totpago',
  'ausencia',
  'licencia',
  'legamov',
]);

const PROFILE_TOP_LEVEL_KEYS = Object.freeze([
  'schema_version',
  'source',
  'compressed_size_bytes',
  'sha256',
  'snapshot_as_of',
  'generated_at',
  'canonical_source',
  'excluded_sources',
  'tables_profiled',
  'row_counts',
  'candidate_keys',
  'aggregates',
  'quality_flags',
]);

const PROFILE_AGGREGATE_KEYS = Object.freeze([
  'employees_by_sector',
  'employees_by_cost_center',
  'salary_by_period',
  'absence_by_year',
  'leave_by_year',
  'payroll_by_period',
  'movement_by_year',
]);

const PROFILE_QUALITY_KEYS = Object.freeze([
  'pii_not_exported',
  'salary_amounts_are_source_values',
  'periods_require_complete_partition_check',
  'future_realtime_requires_incremental_ingestion',
]);

const SOURCE_MANIFEST_KEYS = Object.freeze([
  'schema_version',
  'canonical_system',
  'source_file',
  'sha256',
  'compressed_size_bytes',
  'snapshot_as_of',
  'excluded_sources',
  'approval_basis',
]);

const SEMANTIC_SHAPE = Object.freeze({
  top: ['schema_version', 'source', 'privacy', 'table_dictionary', 'period_policy', 'period_quality', 'payroll', 'workforce', 'absence', 'leave', 'movements', 'coverage', 'quality'],
  source: ['file', 'compressed_size_bytes', 'sha256', 'snapshot_as_of', 'generated_at', 'canonical_system', 'realtime'],
  privacy: ['aggregate_only', 'contains_pii', 'employee_identifiers_exported', 'excluded_sources'],
  tableDictionary: ['total_tables', 'non_empty_tables', 'empty_tables', 'total_rows', 'tables'],
  tableDictionaryRow: ['table', 'rows', 'columns', 'has_primary_key', 'unique_keys', 'foreign_keys'],
  periodPolicy: ['minimum_valid_date', 'maximum_valid_date', 'valid_month_range', 'date_year_must_match_period_year', 'date_month_mismatch_is_diagnostic_not_quarantine'],
  periodQualityDomains: ['ausencia', 'calculo', 'legamov', 'licencia', 'totpago'],
  periodQualityRow: ['rows', 'valid_rows', 'quarantine_rows', 'valid_rate_pct', 'valid_periods', 'first_valid_period', 'last_valid_period', 'first_valid_year', 'last_valid_year', 'date_month_mismatch_rows', 'quarantine_by_period', 'quarantine_reason_occurrences', 'quarantine_reasons_are_non_exclusive'],
  payroll: ['source_table', 'source_tables', 'currency', 'amount_unit', 'executive_metric_source', 'executive_metric_status', 'mass_salary_definition', 'calculation_reconciliation_formula', 'totpago_diagnostic_status', 'totpago_internal_formula', 'totpago_internal_reconciliation_score_pct', 'source_control_totals', 'valid_control_totals', 'quarantine_control_totals', 'source_equals_valid_plus_quarantine', 'null_measure_cells', 'valid_period_series', 'valid_period_series_status', 'calculation_control_series', 'latest_calculation_period', 'latest_top_detail_concepts', 'cross_source_reconciliation'],
  controlTotals: ['rows', 'gross_earnings_cents', 'contributory_earnings_cents', 'non_contributory_earnings_cents', 'withholdings_cents', 'net_payroll_cents', 'source_tapo_cents', 'reconciliation_variance_cents', 'reconciled_rows', 'reconciled_row_rate_pct'],
  validPeriodRow: ['period', 'rows', 'gross_earnings_cents', 'contributory_earnings_cents', 'non_contributory_earnings_cents', 'withholdings_cents', 'net_payroll_cents', 'source_tapo_cents', 'reconciliation_variance_cents', 'reconciled_rows', 'reconciled_row_rate_pct'],
  calculationPeriodRow: ['period', 'calculation_rows', 'control_rows', 'distinct_payroll_participants', 'gross_with_family_allowances_cents', 'contributory_earnings_cents', 'non_contributory_earnings_cents', 'family_allowances_cents', 'employee_withholdings_cents', 'net_payroll_cents', 'net_to_pay_cents', 'employer_contributions_cents', 'net_identity_variance_cents', 'net_to_pay_variance_cents', 'rounding_tolerance_cents', 'control_identity_reconciled', 'control_identity_within_rounding_tolerance'],
  conceptRow: ['source_code', 'label', 'source_class_code', 'source_type_code', 'rows', 'distinct_participants', 'amount_cents'],
  reconciliation: ['status', 'comparison', 'tolerance_cents', 'calculation_runs', 'totpago_runs', 'matched_runs', 'fully_reconciled_runs', 'run_coverage_pct', 'metric_exact_rate_pct', 'value_agreement_pct', 'score_pct', 'absolute_variance_cents', 'period_series', 'latest_period_runs'],
  reconciliationPeriod: ['period', 'calculation_runs', 'totpago_runs', 'matched_runs', 'fully_reconciled_runs', 'absolute_variance_cents', 'run_coverage_pct', 'metric_exact_rate_pct', 'value_agreement_pct'],
  reconciliationRun: ['company_code', 'period', 'calculation_date', 'source_run_type', 'fully_reconciled', 'metrics'],
  reconciliationMetric: ['metric', 'calculo_cents', 'totpago_cents', 'variance_cents', 'within_one_cent'],
  workforce: ['definition', 'reference_period', 'payroll_participants', 'matched_legajo_participants', 'legajo_match_rate_pct', 'by_sector', 'by_cost_center', 'by_agreement'],
  workforceRank: ['company_code', 'source_code', 'label', 'participants', 'share_pct'],
  absenceOrLeave: ['source_table', 'valid_rows', 'quarantine_rows', 'valid_reported_days', 'valid_by_year', 'distinct_participants_by_year'],
  movements: ['source_table', 'valid_rows', 'quarantine_rows', 'valid_by_year', 'distinct_participants_by_year'],
  coverage: ['legajo_rows', 'unique_legajo_keys', 'facts'],
  coverageFacts: ['calculo', 'legamov', 'ausencia', 'licencia'],
  coverageFact: ['rows', 'matched_rows', 'orphan_rows', 'join_integrity_pct', 'distinct_employee_keys', 'valid_matched_employee_keys', 'employee_coverage_pct'],
  quality: ['score', 'score_scope', 'components', 'risk_flags'],
  qualityComponents: ['temporal_validity', 'referential_integrity', 'payroll_reconciliation', 'legajo_key_uniqueness'],
  qualityComponent: ['score', 'weight_pct'],
  qualityReconciliationComponent: ['score', 'weight_pct', 'basis'],
  riskFlags: ['raw_source_contains_sensitive_pii', 'historical_snapshot_not_realtime', 'currency_not_declared_in_source', 'legacy_import_error_rows', 'quarantined_temporal_rows', 'totpago_cross_source_mismatch', 'calculation_control_anomalous_periods', 'latest_calculation_control_within_rounding_tolerance', 'suspicious_text_encoding_labels'],
});

const FORBIDDEN_SEMANTIC_PROPERTY_NAMES = new Set([
  'rawemployee', 'rawperson', 'employee', 'persona', 'person', 'name', 'fullname',
  'nombre', 'apellido', 'dni', 'cuil', 'cuit', 'cbu', 'bankaccount', 'accountnumber',
  'email', 'phone', 'telefono', 'domicilio', 'address', 'dateofbirth', 'birthdate',
  'idpersona', 'employeeid', 'legajoid', 'lega12', 'nomb12', 'nudo12', 'emia12',
  'tele12', 'domi12',
]);

const FORBIDDEN_SEMANTIC_VALUE_PATTERNS = Object.freeze([
  /\b[A-Z0-9._%+-]+\s*@\s*[A-Z0-9-]+(?:\s*\.\s*[A-Z0-9-]+)+\b/i,
  /\b\d{2}(?:[ ./-]?\d){9}\b/,
  /\b\d(?:[ ./-]?\d){21}\b/,
]);

const LABELED_IDENTIFIER_RULES = Object.freeze([
  Object.freeze({
    pattern: /\b(?:d[.\s_/-]*n[.\s_/-]*i|documento)\b[^\d]{0,16}(\d[\d.\s/-]{5,18}\d)/i,
    minimumDigits: 7,
    maximumDigits: 8,
  }),
  Object.freeze({
    pattern: /\b(?:c[.\s_/-]*u[.\s_/-]*i[.\s_/-]*[lt])\b[^\d]{0,16}(\d[\d.\s/-]{8,24}\d)/i,
    minimumDigits: 11,
    maximumDigits: 11,
  }),
  Object.freeze({
    pattern: /\b(?:c[.\s_/-]*b[.\s_/-]*u|cuenta\s+bancaria)\b[^\d]{0,16}(\d[\d.\s/-]{20,42}\d)/i,
    minimumDigits: 22,
    maximumDigits: 22,
  }),
  Object.freeze({
    pattern: /\b(?:t[.\s_/-]*e[.\s_/-]*l(?:(?:e|\u00e9)fono)?|celular|m[o\u00f3]vil|whatsapp|contacto)\b[^\d+]{0,16}((?:\+?\d)[\d()\s./-]{6,24}\d)/i,
    minimumDigits: 8,
    maximumDigits: 15,
  }),
]);

function finiteNumber(value, min = -Infinity, max = Infinity) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value, allowedKeys) {
  if (!plainObject(value)) return false;
  const expected = [...allowedKeys].sort();
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function addShapeError(errors, value, allowedKeys, code) {
  addError(errors, hasExactKeys(value, allowedKeys), code);
}

function arrayHasExactRowShape(value, allowedKeys) {
  return Array.isArray(value) && value.every(row => hasExactKeys(row, allowedKeys));
}

function containsForbiddenSemanticProperty(value, visited = new Set()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return false;
  visited.add(value);
  if (Array.isArray(value)) {
    return value.some(item => containsForbiddenSemanticProperty(item, visited));
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (FORBIDDEN_SEMANTIC_PROPERTY_NAMES.has(normalized)) return true;
    if (containsForbiddenSemanticProperty(child, visited)) return true;
  }
  return false;
}

function normalizeSensitiveText(value) {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[\u00A0\u202F]/g, ' ');
}

function containsLabeledIdentifier(value) {
  for (const rule of LABELED_IDENTIFIER_RULES) {
    const match = rule.pattern.exec(value);
    if (!match) continue;
    const digitCount = (match[1].match(/\d/g) || []).length;
    if (digitCount >= rule.minimumDigits && digitCount <= rule.maximumDigits) return true;
  }
  return false;
}

function containsForbiddenSemanticValue(value, visited = new Set()) {
  if (typeof value === 'string') {
    if (value.length > 512 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) return true;
    const normalized = normalizeSensitiveText(value);
    return containsLabeledIdentifier(normalized) ||
      FORBIDDEN_SEMANTIC_VALUE_PATTERNS.some(pattern => pattern.test(normalized));
  }
  if (!value || typeof value !== 'object' || visited.has(value)) return false;
  visited.add(value);
  if (Array.isArray(value)) return value.some(item => containsForbiddenSemanticValue(item, visited));
  return Object.values(value).some(child => containsForbiddenSemanticValue(child, visited));
}

function validateSemanticShape(data, errors) {
  addShapeError(errors, data, SEMANTIC_SHAPE.top, 'semantic.structure');
  addShapeError(errors, data?.source, SEMANTIC_SHAPE.source, 'semantic.source_structure');
  addShapeError(errors, data?.privacy, SEMANTIC_SHAPE.privacy, 'semantic.privacy_structure');
  addShapeError(errors, data?.table_dictionary, SEMANTIC_SHAPE.tableDictionary, 'semantic.table_dictionary_structure');
  addError(errors, arrayHasExactRowShape(data?.table_dictionary?.tables, SEMANTIC_SHAPE.tableDictionaryRow), 'semantic.table_dictionary_rows_structure');
  addShapeError(errors, data?.period_policy, SEMANTIC_SHAPE.periodPolicy, 'semantic.period_policy_structure');
  addShapeError(errors, data?.period_quality, SEMANTIC_SHAPE.periodQualityDomains, 'semantic.period_quality_structure');
  for (const domain of SEMANTIC_SHAPE.periodQualityDomains) {
    addShapeError(errors, data?.period_quality?.[domain], SEMANTIC_SHAPE.periodQualityRow, `semantic.period_quality_${domain}_structure`);
  }

  const payroll = data?.payroll;
  addShapeError(errors, payroll, SEMANTIC_SHAPE.payroll, 'semantic.payroll_structure');
  for (const totals of ['source_control_totals', 'valid_control_totals', 'quarantine_control_totals']) {
    addShapeError(errors, payroll?.[totals], SEMANTIC_SHAPE.controlTotals, `semantic.payroll_${totals}_structure`);
  }
  addError(errors, arrayHasExactRowShape(payroll?.valid_period_series, SEMANTIC_SHAPE.validPeriodRow), 'semantic.payroll_valid_series_structure');
  addError(errors, arrayHasExactRowShape(payroll?.calculation_control_series, SEMANTIC_SHAPE.calculationPeriodRow), 'semantic.payroll_calculation_series_structure');
  addError(errors, arrayHasExactRowShape(payroll?.latest_top_detail_concepts, SEMANTIC_SHAPE.conceptRow), 'semantic.payroll_concepts_structure');
  const reconciliation = payroll?.cross_source_reconciliation;
  addShapeError(errors, reconciliation, SEMANTIC_SHAPE.reconciliation, 'semantic.reconciliation_structure');
  addError(errors, arrayHasExactRowShape(reconciliation?.period_series, SEMANTIC_SHAPE.reconciliationPeriod), 'semantic.reconciliation_periods_structure');
  addError(errors, arrayHasExactRowShape(reconciliation?.latest_period_runs, SEMANTIC_SHAPE.reconciliationRun), 'semantic.reconciliation_runs_structure');
  if (Array.isArray(reconciliation?.latest_period_runs)) {
    addError(errors, reconciliation.latest_period_runs.every(run => arrayHasExactRowShape(run?.metrics, SEMANTIC_SHAPE.reconciliationMetric)), 'semantic.reconciliation_metrics_structure');
  }

  addShapeError(errors, data?.workforce, SEMANTIC_SHAPE.workforce, 'semantic.workforce_structure');
  for (const ranking of WORKFORCE_RANKINGS) {
    addError(errors, arrayHasExactRowShape(data?.workforce?.[ranking], SEMANTIC_SHAPE.workforceRank), `semantic.workforce_${ranking}_structure`);
  }
  addShapeError(errors, data?.absence, SEMANTIC_SHAPE.absenceOrLeave, 'semantic.absence_structure');
  addShapeError(errors, data?.leave, SEMANTIC_SHAPE.absenceOrLeave, 'semantic.leave_structure');
  addShapeError(errors, data?.movements, SEMANTIC_SHAPE.movements, 'semantic.movements_structure');
  addShapeError(errors, data?.coverage, SEMANTIC_SHAPE.coverage, 'semantic.coverage_structure');
  addShapeError(errors, data?.coverage?.facts, SEMANTIC_SHAPE.coverageFacts, 'semantic.coverage_facts_structure');
  for (const domain of SEMANTIC_SHAPE.coverageFacts) {
    addShapeError(errors, data?.coverage?.facts?.[domain], SEMANTIC_SHAPE.coverageFact, `semantic.coverage_${domain}_structure`);
  }
  addShapeError(errors, data?.quality, SEMANTIC_SHAPE.quality, 'semantic.quality_structure');
  addShapeError(errors, data?.quality?.components, SEMANTIC_SHAPE.qualityComponents, 'semantic.quality_components_structure');
  for (const component of QUALITY_COMPONENTS) {
    const keys = component === 'payroll_reconciliation'
      ? SEMANTIC_SHAPE.qualityReconciliationComponent
      : SEMANTIC_SHAPE.qualityComponent;
    addShapeError(errors, data?.quality?.components?.[component], keys, `semantic.quality_${component}_structure`);
  }
  addShapeError(errors, data?.quality?.risk_flags, SEMANTIC_SHAPE.riskFlags, 'semantic.risk_flags_structure');
  addError(errors, !containsForbiddenSemanticProperty(data), 'semantic.forbidden_property');
  addError(errors, !containsForbiddenSemanticValue(data), 'semantic.sensitive_value');
}

function numericAggregate(value, keyPattern, { integersOnly = false } = {}) {
  if (!plainObject(value) || Object.keys(value).length === 0) return false;
  return Object.entries(value).every(([key, count]) =>
    keyPattern.test(key) &&
    (integersOnly ? nonNegativeInteger(count) : finiteNumber(count, 0))
  );
}

function validateAnnualParticipantCounts(value, periodPolicy, errors, domain) {
  const events = value?.valid_by_year;
  const participants = value?.distinct_participants_by_year;
  addError(errors, plainObject(events), `${domain}.valid_by_year`);
  addError(errors, plainObject(participants), `${domain}.distinct_participants_by_year`);
  if (!plainObject(events) || !plainObject(participants)) return;

  const eventYears = Object.keys(events).sort();
  const participantYears = Object.keys(participants).sort();
  addError(
    errors,
    eventYears.length === participantYears.length &&
      eventYears.every((year, index) => year === participantYears[index]),
    `${domain}.participant_year_identity`,
  );

  const minimumYear = Number(String(periodPolicy?.minimum_valid_date || '').slice(0, 4));
  const maximumYear = Number(String(periodPolicy?.maximum_valid_date || '').slice(0, 4));
  let eventTotal = 0;
  for (const year of eventYears) {
    const eventCount = events[year];
    const participantCount = participants[year];
    const numericYear = Number(year);
    addError(
      errors,
      /^\d{4}$/.test(year) && Number.isInteger(minimumYear) && Number.isInteger(maximumYear) &&
        numericYear >= minimumYear && numericYear <= maximumYear,
      `${domain}.year_range`,
    );
    addError(errors, nonNegativeInteger(eventCount), `${domain}.event_count`);
    addError(
      errors,
      nonNegativeInteger(participantCount) && nonNegativeInteger(eventCount) && participantCount <= eventCount,
      `${domain}.participant_count`,
    );
    if (nonNegativeInteger(eventCount)) eventTotal += eventCount;
  }
  addError(errors, nonNegativeInteger(value?.valid_rows) && eventTotal === value.valid_rows, `${domain}.valid_row_identity`);
}

function closeTo(left, right, tolerance) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
}

function addError(errors, condition, code) {
  if (!condition) errors.push(code);
}

function rankingIsComplete(rows, participants, errors, rankingName) {
  if (!Array.isArray(rows) || rows.length === 0) {
    errors.push(`workforce.${rankingName}.missing`);
    return;
  }

  const keys = new Set();
  let participantSum = 0;
  for (const row of rows) {
    const label = typeof row?.label === 'string' ? row.label.trim() : '';
    const count = row?.participants;
    const share = row?.share_pct;
    const key = `${row?.company_code ?? ''}:${row?.source_code ?? ''}:${label}`;
    addError(errors, Boolean(label), `workforce.${rankingName}.label`);
    addError(errors, nonNegativeInteger(count), `workforce.${rankingName}.participants`);
    addError(errors, finiteNumber(share, 0, 100), `workforce.${rankingName}.share`);
    addError(errors, !keys.has(key), `workforce.${rankingName}.duplicate`);
    keys.add(key);

    if (nonNegativeInteger(count)) {
      participantSum += count;
      const expectedShare = participants > 0 ? (count / participants) * 100 : 0;
      addError(errors, closeTo(share, expectedShare, 0.011), `workforce.${rankingName}.share_identity`);
    }
  }

  addError(errors, participantSum === participants, `workforce.${rankingName}.sum_identity`);
}

export function inspectGrhProfileContract(
  data,
  expectedSource = null,
  expectedSha256 = null,
  expectedSnapshot = null,
) {
  const errors = [];
  addError(errors, hasExactKeys(data, PROFILE_TOP_LEVEL_KEYS), 'profile.structure');
  addError(errors, data?.schema_version === 'grh-profile-v1', 'profile.schema_version');
  addError(errors, typeof data?.source === 'string' && /^grh_junin\.[a-z0-9._-]+\.sql\.gz$/i.test(data.source), 'profile.source');
  addError(errors, expectedSource === null || data?.source === expectedSource, 'profile.source_identity');
  addError(errors, nonNegativeInteger(data?.compressed_size_bytes) && data.compressed_size_bytes > 0, 'profile.compressed_size_bytes');
  addError(errors, /^[0-9a-f]{64}$/.test(data?.sha256 || ''), 'profile.sha256');
  addError(errors, expectedSha256 === null || data?.sha256 === expectedSha256, 'profile.sha256_identity');
  addError(errors, /^\d{4}-\d{2}-\d{2}$/.test(data?.snapshot_as_of || '') && Number.isFinite(Date.parse(`${data.snapshot_as_of}T00:00:00Z`)), 'profile.snapshot_as_of');
  addError(errors, expectedSnapshot === null || data?.snapshot_as_of === expectedSnapshot, 'profile.snapshot_identity');
  addError(errors, typeof data?.generated_at === 'string' && Number.isFinite(Date.parse(data.generated_at)), 'profile.generated_at');
  addError(errors, typeof data?.canonical_source === 'string' && data.canonical_source.toLowerCase().includes('grh'), 'profile.canonical_source');
  addError(errors, Array.isArray(data?.excluded_sources) && data.excluded_sources.length === 1 && data.excluded_sources[0] === 'personas_junin', 'profile.excluded_sources');
  addError(errors, nonNegativeInteger(data?.tables_profiled) && data.tables_profiled > 0, 'profile.tables_profiled');

  const rowCounts = data?.row_counts;
  const criticalTables = ['legajo', 'calculo', 'totpago', 'ausencia', 'licencia', 'legamov'];
  addError(errors, plainObject(rowCounts) && Object.keys(rowCounts).length > 0, 'profile.row_counts');
  if (plainObject(rowCounts)) {
    addError(errors, Object.entries(rowCounts).every(([table, rows]) => /^[a-z][a-z0-9_]*$/.test(table) && nonNegativeInteger(rows)), 'profile.row_counts_values');
    addError(errors, criticalTables.every(table => nonNegativeInteger(rowCounts[table]) && rowCounts[table] > 0), 'profile.row_counts_critical');
  }

  addError(errors, hasExactKeys(data?.candidate_keys, ['legajo']), 'profile.candidate_keys');
  addError(errors, nonNegativeInteger(data?.candidate_keys?.legajo) && data.candidate_keys.legajo <= (rowCounts?.legajo ?? -1), 'profile.candidate_keys_legajo');

  const aggregates = data?.aggregates;
  addError(errors, hasExactKeys(aggregates, PROFILE_AGGREGATE_KEYS), 'profile.aggregates_structure');
  if (plainObject(aggregates)) {
    const sectorOk = numericAggregate(aggregates.employees_by_sector, /^(?:\d+|sin_sector)$/, { integersOnly: true });
    const costCenterOk = numericAggregate(aggregates.employees_by_cost_center, /^(?:\d+|sin_centro_costo)$/, { integersOnly: true });
    addError(errors, sectorOk, 'profile.aggregates_sector');
    addError(errors, costCenterOk, 'profile.aggregates_cost_center');
    addError(errors, numericAggregate(aggregates.salary_by_period, /^snapshot$/), 'profile.aggregates_salary');
    addError(errors, numericAggregate(aggregates.absence_by_year, /^(?:\d{1,4}|sin_fecha)$/, { integersOnly: true }), 'profile.aggregates_absence');
    addError(errors, numericAggregate(aggregates.leave_by_year, /^(?:\d{1,4}|sin_fecha)$/, { integersOnly: true }), 'profile.aggregates_leave');
    addError(errors, numericAggregate(aggregates.payroll_by_period, /^\d{1,4}-(?:0[1-9]|1[0-2])$/), 'profile.aggregates_payroll');
    addError(errors, numericAggregate(aggregates.movement_by_year, /^(?:\d{1,4}|sin_año)$/, { integersOnly: true }), 'profile.aggregates_movement');

    const expectedLegajos = data?.candidate_keys?.legajo;
    if (nonNegativeInteger(expectedLegajos) && sectorOk && costCenterOk) {
      const sectorTotal = Object.values(aggregates.employees_by_sector).reduce((sum, value) => sum + value, 0);
      const costCenterTotal = Object.values(aggregates.employees_by_cost_center).reduce((sum, value) => sum + value, 0);
      addError(errors, sectorTotal === expectedLegajos, 'profile.aggregates_sector_identity');
      addError(errors, costCenterTotal === expectedLegajos, 'profile.aggregates_cost_center_identity');
    }
  }

  addError(errors, hasExactKeys(data?.quality_flags, PROFILE_QUALITY_KEYS), 'profile.quality_structure');
  if (plainObject(data?.quality_flags)) {
    for (const key of PROFILE_QUALITY_KEYS) {
      addError(errors, data.quality_flags[key] === true, `profile.quality.${key}`);
    }
  }

  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...new Set(errors)]) });
}

export function validateGrhProfileContract(
  data,
  expectedSource = null,
  expectedSha256 = null,
  expectedSnapshot = null,
) {
  return inspectGrhProfileContract(data, expectedSource, expectedSha256, expectedSnapshot).ok;
}

function addProfileSemanticInventoryErrors(errors, profile, semantic, prefix) {
  const dictionary = semantic?.table_dictionary;
  const tables = Array.isArray(dictionary?.tables) ? dictionary.tables : [];
  addError(
    errors,
    nonNegativeInteger(profile?.tables_profiled) &&
      profile.tables_profiled === dictionary?.total_tables &&
      tables.length === dictionary?.total_tables,
    `${prefix}.table_count_identity`,
  );

  for (const tableName of FOCUSED_SOURCE_TABLES) {
    const matches = tables.filter(row => row?.table === tableName);
    addError(errors, matches.length === 1, `${prefix}.focused_table_presence`);
    addError(
      errors,
      matches.length === 1 &&
        nonNegativeInteger(profile?.row_counts?.[tableName]) &&
        matches[0]?.rows === profile.row_counts[tableName],
      `${prefix}.focused_row_count_identity`,
    );
  }
}

export function inspectGrhPublicationBundle(profile, semantic, manifest) {
  const errors = [];
  addError(errors, hasExactKeys(manifest, SOURCE_MANIFEST_KEYS), 'publication.manifest_structure');
  addError(errors, manifest?.schema_version === 'grh-source-manifest-v1', 'publication.manifest_version');
  addError(errors, typeof manifest?.canonical_system === 'string' && manifest.canonical_system.toLowerCase().includes('grh'), 'publication.manifest_system');
  addError(errors, typeof manifest?.source_file === 'string' && /^grh_junin\.[a-z0-9._-]+\.sql\.gz$/i.test(manifest.source_file), 'publication.manifest_source');
  addError(errors, /^[0-9a-f]{64}$/.test(manifest?.sha256 || ''), 'publication.manifest_sha256');
  addError(errors, nonNegativeInteger(manifest?.compressed_size_bytes) && manifest.compressed_size_bytes > 0, 'publication.manifest_size');
  addError(errors, /^\d{4}-\d{2}-\d{2}$/.test(manifest?.snapshot_as_of || '') && Number.isFinite(Date.parse(`${manifest?.snapshot_as_of}T00:00:00Z`)), 'publication.manifest_snapshot');
  addError(errors, Array.isArray(manifest?.excluded_sources) && manifest.excluded_sources.length === 1 && manifest.excluded_sources[0] === 'personas_junin', 'publication.manifest_excluded_sources');
  addError(errors, typeof manifest?.approval_basis === 'string' && manifest.approval_basis.trim().length > 0, 'publication.manifest_approval');

  // Establish profile provenance from the approved manifest first. Only then
  // may the semantic artifact inherit that source identity.
  const profileInspection = inspectGrhProfileContract(
    profile,
    manifest?.source_file,
    manifest?.sha256,
    manifest?.snapshot_as_of,
  );
  errors.push(...profileInspection.errors);
  addError(errors, profile?.compressed_size_bytes === manifest?.compressed_size_bytes, 'publication.profile_size_identity');
  addError(errors, profile?.canonical_source === manifest?.canonical_system, 'publication.profile_system_identity');
  addError(errors, JSON.stringify(profile?.excluded_sources) === JSON.stringify(manifest?.excluded_sources), 'publication.profile_excluded_sources_identity');

  const semanticInspection = inspectGrhSemanticContract(semantic);
  errors.push(...semanticInspection.errors);
  addError(errors, semantic?.source?.file === profile?.source, 'publication.semantic_source_identity');
  addError(errors, semantic?.source?.sha256 === profile?.sha256, 'publication.semantic_sha256_identity');
  addError(errors, semantic?.source?.snapshot_as_of === profile?.snapshot_as_of, 'publication.semantic_snapshot_identity');
  addError(errors, semantic?.source?.compressed_size_bytes === profile?.compressed_size_bytes, 'publication.semantic_size_identity');
  addError(errors, semantic?.source?.canonical_system === profile?.canonical_source, 'publication.semantic_system_identity');
  addError(errors, JSON.stringify(semantic?.privacy?.excluded_sources) === JSON.stringify(profile?.excluded_sources), 'publication.semantic_excluded_sources_identity');
  addProfileSemanticInventoryErrors(errors, profile, semantic, 'publication');

  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...new Set(errors)]) });
}

export function validateGrhPublicationBundle(profile, semantic, manifest) {
  return inspectGrhPublicationBundle(profile, semantic, manifest).ok;
}

export function inspectGrhRuntimeBundle(rows, approvedSourceSha256 = null) {
  const errors = [];
  const records = Array.isArray(rows) ? rows : [];
  addError(errors, records.length === 2, 'runtime.bundle_complete');

  const byArtifact = new Map();
  for (const row of records) {
    addError(errors, plainObject(row), 'runtime.metadata_structure');
    const artifact = row?.artifact;
    addError(errors, artifact === 'profile' || artifact === 'semantic', 'runtime.artifact_name');
    addError(errors, !byArtifact.has(artifact), 'runtime.artifact_unique');
    if (artifact === 'profile' || artifact === 'semantic') byArtifact.set(artifact, row);
  }

  const profileRow = byArtifact.get('profile');
  const semanticRow = byArtifact.get('semantic');
  addError(errors, Boolean(profileRow), 'runtime.profile_required');
  addError(errors, Boolean(semanticRow), 'runtime.semantic_required');

  const profile = profileRow?.payload;
  const semantic = semanticRow?.payload;
  const profileInspection = inspectGrhProfileContract(profile);
  const semanticInspection = inspectGrhSemanticContract(semantic);
  errors.push(...profileInspection.errors, ...semanticInspection.errors);

  addError(errors, profileRow?.schema_version === 'grh-profile-v1', 'runtime.profile_metadata_schema');
  addError(errors, profileRow?.schema_version === profile?.schema_version, 'runtime.profile_metadata_schema_identity');
  addError(errors, profileRow?.snapshot_as_of === profile?.snapshot_as_of, 'runtime.profile_metadata_snapshot_identity');
  addError(errors, profileRow?.source_sha256 === profile?.sha256, 'runtime.profile_metadata_sha256_identity');

  addError(errors, semanticRow?.schema_version === 'grh-semantic-v2', 'runtime.semantic_metadata_schema');
  addError(errors, semanticRow?.schema_version === semantic?.schema_version, 'runtime.semantic_metadata_schema_identity');
  addError(errors, semanticRow?.snapshot_as_of === semantic?.source?.snapshot_as_of, 'runtime.semantic_metadata_snapshot_identity');
  addError(errors, semanticRow?.source_sha256 === semantic?.source?.sha256, 'runtime.semantic_metadata_sha256_identity');

  addError(errors, profile?.source === semantic?.source?.file, 'runtime.source_identity');
  addError(errors, profile?.sha256 === semantic?.source?.sha256, 'runtime.sha256_identity');
  addError(errors, profile?.snapshot_as_of === semantic?.source?.snapshot_as_of, 'runtime.snapshot_identity');
  addError(errors, profile?.compressed_size_bytes === semantic?.source?.compressed_size_bytes, 'runtime.size_identity');
  addError(errors, profile?.canonical_source === semantic?.source?.canonical_system, 'runtime.system_identity');
  addError(errors, JSON.stringify(profile?.excluded_sources) === JSON.stringify(semantic?.privacy?.excluded_sources), 'runtime.excluded_sources_identity');
  addError(errors, profileRow?.source_sha256 === semanticRow?.source_sha256, 'runtime.metadata_sha256_identity');
  addError(errors, profileRow?.snapshot_as_of === semanticRow?.snapshot_as_of, 'runtime.metadata_snapshot_identity');
  addProfileSemanticInventoryErrors(errors, profile, semantic, 'runtime');

  addError(errors, /^[0-9a-f]{64}$/.test(approvedSourceSha256 || ''), 'runtime.approved_sha256_format');
  addError(errors, profile?.sha256 === approvedSourceSha256, 'runtime.approved_sha256_identity');

  const uniqueErrors = Object.freeze([...new Set(errors)]);
  const ok = uniqueErrors.length === 0;
  const bundle = ok
    ? Object.freeze({
        profile,
        semantic,
        provenance: Object.freeze({
          sourceFile: profile.source,
          sourceSha256: profile.sha256,
          approvedSourceSha256,
          snapshotAsOf: profile.snapshot_as_of,
          profileSchemaVersion: profile.schema_version,
          semanticSchemaVersion: semantic.schema_version,
        }),
      })
    : null;
  return Object.freeze({ ok, errors: uniqueErrors, bundle });
}

export function inspectGrhSemanticContract(data) {
  const errors = [];
  const source = data?.source;
  const privacy = data?.privacy;
  const payroll = data?.payroll;
  const reconciliation = payroll?.cross_source_reconciliation;
  const workforce = data?.workforce;
  const quality = data?.quality;

  validateSemanticShape(data, errors);

  addError(errors, data?.schema_version === 'grh-semantic-v2', 'schema.version');
  addError(errors, privacy?.aggregate_only === true, 'privacy.aggregate_only');
  addError(errors, privacy?.contains_pii === false, 'privacy.contains_pii');
  addError(errors, privacy?.employee_identifiers_exported === false, 'privacy.employee_identifiers');
  addError(errors, Array.isArray(privacy?.excluded_sources) && privacy.excluded_sources.includes('personas_junin'), 'privacy.excluded_sources');

  addError(errors, String(source?.canonical_system || '').toLowerCase().includes('grh'), 'source.canonical_system');
  addError(errors, String(source?.file || '').toLowerCase().startsWith('grh_junin.'), 'source.file');
  addError(errors, /^[0-9a-f]{64}$/.test(source?.sha256 || ''), 'source.sha256');
  addError(errors, /^\d{4}-\d{2}-\d{2}$/.test(source?.snapshot_as_of || ''), 'source.snapshot');
  addError(errors, source?.realtime === false, 'source.realtime');

  validateAnnualParticipantCounts(data?.absence, data?.period_policy, errors, 'absence');
  validateAnnualParticipantCounts(data?.leave, data?.period_policy, errors, 'leave');
  validateAnnualParticipantCounts(data?.movements, data?.period_policy, errors, 'movements');

  addError(errors, payroll?.currency === 'not_declared_in_source', 'payroll.currency');
  addError(errors, payroll?.executive_metric_status === 'calculation_control_not_bank_disbursement', 'payroll.executive_metric_status');
  addError(errors, payroll?.valid_period_series_status === 'totpago_diagnostic_only', 'payroll.valid_period_series_status');
  addError(errors, /^\d{4}-\d{2}$/.test(payroll?.latest_calculation_period || ''), 'payroll.latest_period');

  const series = payroll?.calculation_control_series;
  addError(errors, Array.isArray(series) && series.length > 1, 'payroll.calculation_series');
  if (Array.isArray(series)) {
    const periodKeys = new Set();
    for (const row of series) {
      addError(errors, /^\d{4}-\d{2}$/.test(row?.period || ''), 'payroll.calculation_series.period');
      addError(errors, !periodKeys.has(row?.period), 'payroll.calculation_series.duplicate_period');
      periodKeys.add(row?.period);
      addError(errors, nonNegativeInteger(row?.distinct_payroll_participants), 'payroll.calculation_series.participants');
      for (const field of [
        'gross_with_family_allowances_cents',
        'employee_withholdings_cents',
        'net_payroll_cents',
        'employer_contributions_cents',
        'net_identity_variance_cents',
        'net_to_pay_variance_cents',
        'rounding_tolerance_cents',
      ]) {
        addError(errors, Number.isFinite(row?.[field]), `payroll.calculation_series.${field}`);
      }
      addError(errors, row?.rounding_tolerance_cents >= 0, 'payroll.calculation_series.rounding_tolerance');
      const exactIdentity = Math.abs(row?.net_identity_variance_cents) <= 1 &&
        Math.abs(row?.net_to_pay_variance_cents) <= 1;
      const withinTolerance = Math.abs(row?.net_identity_variance_cents) <= row?.rounding_tolerance_cents &&
        Math.abs(row?.net_to_pay_variance_cents) <= row?.rounding_tolerance_cents;
      addError(errors, typeof row?.control_identity_reconciled === 'boolean', 'payroll.calculation_series.control_identity_type');
      addError(errors, typeof row?.control_identity_within_rounding_tolerance === 'boolean', 'payroll.calculation_series.rounding_identity_type');
      addError(errors, row?.control_identity_reconciled === exactIdentity, 'payroll.calculation_series.control_identity');
      addError(errors, row?.control_identity_within_rounding_tolerance === withinTolerance, 'payroll.calculation_series.rounding_identity');
    }
    addError(errors, periodKeys.has(payroll?.latest_calculation_period), 'payroll.latest_period_missing');
    const latestControl = series.find(row => row?.period === payroll?.latest_calculation_period);
    addError(errors, latestControl?.control_identity_within_rounding_tolerance === true, 'payroll.latest_control_identity');
  }

  addError(errors, ['reconciled', 'material_differences_detected'].includes(reconciliation?.status), 'reconciliation.status');
  for (const field of ['score_pct', 'value_agreement_pct', 'run_coverage_pct', 'metric_exact_rate_pct']) {
    addError(errors, finiteNumber(reconciliation?.[field], 0, 100), `reconciliation.${field}`);
  }
  for (const field of ['calculation_runs', 'totpago_runs', 'matched_runs', 'fully_reconciled_runs']) {
    addError(errors, nonNegativeInteger(reconciliation?.[field]), `reconciliation.${field}`);
  }
  addError(errors, reconciliation?.matched_runs <= reconciliation?.calculation_runs, 'reconciliation.matched_calculation_bound');
  addError(errors, reconciliation?.matched_runs <= reconciliation?.totpago_runs, 'reconciliation.matched_totpago_bound');
  addError(errors, reconciliation?.fully_reconciled_runs <= reconciliation?.matched_runs, 'reconciliation.fully_reconciled_bound');

  const participants = workforce?.payroll_participants;
  const matchedParticipants = workforce?.matched_legajo_participants;
  addError(errors, workforce?.reference_period === payroll?.latest_calculation_period, 'workforce.reference_period');
  addError(errors, nonNegativeInteger(participants) && participants > 0, 'workforce.payroll_participants');
  addError(errors, nonNegativeInteger(matchedParticipants) && matchedParticipants <= participants, 'workforce.matched_legajo_participants');
  addError(errors, finiteNumber(workforce?.legajo_match_rate_pct, 0, 100), 'workforce.legajo_match_rate_pct');
  if (nonNegativeInteger(participants) && participants > 0 && nonNegativeInteger(matchedParticipants)) {
    addError(errors, closeTo(workforce?.legajo_match_rate_pct, (matchedParticipants / participants) * 100, 0.011), 'workforce.match_rate_identity');
  }
  addError(errors, typeof workforce?.definition === 'string' && workforce.definition.includes('payroll participation') && workforce.definition.includes('not a contractual active-status master'), 'workforce.definition');
  if (nonNegativeInteger(participants) && participants > 0) {
    for (const rankingName of WORKFORCE_RANKINGS) {
      rankingIsComplete(workforce?.[rankingName], participants, errors, rankingName);
    }
  }

  addError(errors, finiteNumber(quality?.score, 0, 100), 'quality.score');
  addError(errors, typeof quality?.score_scope === 'string' && quality.score_scope.trim().length > 0, 'quality.score_scope');
  const components = quality?.components;
  let weightSum = 0;
  let weightedScore = 0;
  for (const componentName of QUALITY_COMPONENTS) {
    const component = components?.[componentName];
    addError(errors, finiteNumber(component?.score, 0, 100), `quality.${componentName}.score`);
    addError(errors, finiteNumber(component?.weight_pct, 0, 100), `quality.${componentName}.weight`);
    if (finiteNumber(component?.score, 0, 100) && finiteNumber(component?.weight_pct, 0, 100)) {
      weightSum += component.weight_pct;
      weightedScore += component.score * component.weight_pct / 100;
    }
  }
  addError(errors, closeTo(weightSum, 100, 0.000001), 'quality.weight_identity');
  addError(errors, closeTo(quality?.score, Number(weightedScore.toFixed(2)), 0.001), 'quality.score_identity');
  addError(errors, closeTo(components?.payroll_reconciliation?.score, Number(reconciliation?.score_pct?.toFixed?.(2)), 0.001), 'quality.reconciliation_identity');

  const risks = quality?.risk_flags;
  addError(errors, risks?.raw_source_contains_sensitive_pii === true, 'quality.risk.raw_pii');
  addError(errors, risks?.historical_snapshot_not_realtime === true, 'quality.risk.snapshot');
  addError(errors, risks?.currency_not_declared_in_source === true, 'quality.risk.currency');
  addError(errors, nonNegativeInteger(risks?.legacy_import_error_rows), 'quality.risk.legacy_import_errors');
  addError(errors, nonNegativeInteger(risks?.quarantined_temporal_rows), 'quality.risk.quarantine');
  addError(errors, risks?.totpago_cross_source_mismatch === (reconciliation?.status === 'material_differences_detected'), 'quality.risk.reconciliation');
  const anomalousCalculationPeriods = Array.isArray(series)
    ? series.filter(row => row?.control_identity_within_rounding_tolerance === false).length
    : 0;
  addError(errors, risks?.calculation_control_anomalous_periods === anomalousCalculationPeriods, 'quality.risk.calculation_anomalies');
  const latestCalculationControl = Array.isArray(series)
    ? series.find(row => row?.period === payroll?.latest_calculation_period)
    : null;
  addError(errors, risks?.latest_calculation_control_within_rounding_tolerance === latestCalculationControl?.control_identity_within_rounding_tolerance, 'quality.risk.latest_calculation_control');
  const publishedLabels = [
    ...(Array.isArray(payroll?.latest_top_detail_concepts) ? payroll.latest_top_detail_concepts : []),
    ...WORKFORCE_RANKINGS.flatMap(name => Array.isArray(workforce?.[name]) ? workforce[name] : []),
  ].map(item => String(item?.label || ''));
  const suspiciousTextEncodingLabels = publishedLabels.filter(label =>
    label.includes('\u00c3') || label.includes('\u00c2') || label.includes('\ufffd')
  ).length;
  addError(errors, nonNegativeInteger(risks?.suspicious_text_encoding_labels), 'quality.risk.text_encoding_labels');
  addError(errors, risks?.suspicious_text_encoding_labels === suspiciousTextEncodingLabels, 'quality.risk.text_encoding_identity');

  const quarantineDomains = ['calculo', 'totpago', 'ausencia', 'licencia', 'legamov'];
  const quarantineSum = quarantineDomains.reduce((total, domain) => {
    const value = data?.period_quality?.[domain]?.quarantine_rows;
    return total + (nonNegativeInteger(value) ? value : 0);
  }, 0);
  addError(errors, quarantineDomains.every(domain => nonNegativeInteger(data?.period_quality?.[domain]?.quarantine_rows)), 'quality.risk.quarantine_domains');
  addError(errors, risks?.quarantined_temporal_rows === quarantineSum, 'quality.risk.quarantine_identity');

  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...new Set(errors)]) });
}

export function validateGrhSemanticContract(data) {
  return inspectGrhSemanticContract(data).ok;
}
