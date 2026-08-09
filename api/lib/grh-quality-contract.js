export const GRH_QUALITY_SCHEMA_VERSION = 'grh-quality-v1';

export const GRH_QUALITY_SCOPE =
  'governed_aggregate_extract_not_fitness_of_every_raw_grh_table';

export const GRH_QUALITY_COMPONENTS = Object.freeze([
  'temporalValidity',
  'referentialIntegrity',
  'payrollReconciliation',
  'legajoKeyUniqueness',
]);

export const GRH_TEMPORAL_DOMAINS = Object.freeze([
  'ausencia',
  'calculo',
  'legamov',
  'licencia',
  'totpago',
]);

export const GRH_REFERENTIAL_FACTS = Object.freeze([
  'calculo',
  'legamov',
  'ausencia',
  'licencia',
]);

const SHAPES = Object.freeze({
  top: ['schemaVersion', 'source', 'lineage', 'privacy', 'inventory', 'quality', 'temporal', 'referential', 'reconciliation'],
  source: ['canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf', 'compressedSizeBytes', 'realtime', 'excludedSources'],
  lineage: ['profileSchemaVersion', 'semanticSchemaVersion', 'profileGeneratedAt', 'semanticGeneratedAt'],
  privacy: ['aggregateOnly', 'containsPii', 'employeeIdentifiersExported', 'rawRowsExported', 'categoricalLabelsExported', 'cellCodesExported', 'monetarySeriesExported'],
  inventory: ['all', 'focal', 'remainder'],
  inventoryGroup: ['totalTables', 'nonEmptyTables', 'emptyTables', 'totalRows'],
  quality: ['score', 'scope', 'components', 'risks'],
  component: ['score', 'weightPct'],
  risks: ['rawSourceContainsSensitivePii', 'historicalSnapshotNotRealtime', 'currencyNotDeclaredInSource', 'legacyImportErrorRows', 'quarantinedTemporalRows', 'totpagoCrossSourceMismatch', 'calculationControlAnomalousPeriods', 'latestCalculationControlWithinRoundingTolerance', 'suspiciousTextEncodingLabelCount'],
  temporal: ['rows', 'validRows', 'quarantineRows', 'validRatePct', 'dateMonthMismatchRows', 'quarantineReasonOccurrences', 'domains'],
  temporalDomain: ['rows', 'validRows', 'quarantineRows', 'validRatePct', 'validPeriods', 'firstValidPeriod', 'lastValidPeriod', 'firstValidYear', 'lastValidYear', 'dateMonthMismatchRows', 'quarantineReasonOccurrences'],
  referential: ['legajo', 'facts'],
  legajo: ['rows', 'uniqueKeys', 'uniquenessPct'],
  fact: ['rows', 'matchedRows', 'orphanRows', 'joinIntegrityPct', 'distinctEmployeeKeys', 'validMatchedEmployeeKeys', 'employeeCoveragePct'],
  reconciliation: ['status', 'totpagoDiagnosticStatus', 'metricStatus', 'currencyStatus', 'toleranceCents', 'calculationRuns', 'totpagoRuns', 'unionRuns', 'matchedRuns', 'fullyReconciledRuns', 'runCoveragePct', 'metricExactRatePct', 'valueAgreementPct', 'scorePct', 'absoluteVarianceCents'],
});

const FORBIDDEN_PROPERTY_NAMES = new Set([
  'name', 'fullname', 'nombre', 'apellido', 'dni', 'cuil', 'cuit', 'cbu',
  'bankaccount', 'accountnumber', 'email', 'phone', 'telefono', 'domicilio',
  'address', 'dateofbirth', 'birthdate', 'idpersona', 'personaid', 'employeeid',
  'legajoid', 'companycode', 'sourcecode', 'label', 'concept', 'concepto',
]);

const FORBIDDEN_VALUE_PATTERNS = Object.freeze([
  /\b[A-Z0-9._%+-]+\s*@\s*[A-Z0-9-]+(?:\s*\.\s*[A-Z0-9-]+)+\b/i,
  /\b(?:d[.\s_/-]*n[.\s_/-]*i|documento)\b[^\d]{0,16}\d[\d.\s/-]{5,18}\d/i,
  /\b(?:c[.\s_/-]*u[.\s_/-]*i[.\s_/-]*[lt])\b[^\d]{0,16}\d[\d.\s/-]{8,24}\d/i,
  /\b(?:c[.\s_/-]*b[.\s_/-]*u|cuenta\s+bancaria)\b[^\d]{0,16}\d[\d.\s/-]{20,42}\d/i,
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

function addShape(errors, value, keys, code) {
  add(errors, exactKeys(value, keys), code);
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function finitePercentage(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function closeTo(left, right, tolerance = 0.0001) {
  return Number.isFinite(left) && Number.isFinite(right) &&
    Math.abs(left - right) <= tolerance;
}

function percentage(numerator, denominator) {
  return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(4));
}

function normalizedPropertyName(key) {
  return key
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

function containsForbiddenProperty(value, visited = new Set()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return false;
  visited.add(value);
  if (Array.isArray(value)) {
    return value.some(item => containsForbiddenProperty(item, visited));
  }
  return Object.entries(value).some(([key, child]) =>
    FORBIDDEN_PROPERTY_NAMES.has(normalizedPropertyName(key)) ||
    containsForbiddenProperty(child, visited));
}

function containsForbiddenValue(value, visited = new Set()) {
  if (typeof value === 'string') {
    if (value.length > 256 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
      return true;
    }
    const normalized = value
      .normalize('NFKC')
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/[\u00A0\u202F]/g, ' ');
    return FORBIDDEN_VALUE_PATTERNS.some(pattern => pattern.test(normalized));
  }
  if (!value || typeof value !== 'object' || visited.has(value)) return false;
  visited.add(value);
  if (Array.isArray(value)) return value.some(item => containsForbiddenValue(item, visited));
  return Object.values(value).some(child => containsForbiddenValue(child, visited));
}

function validIsoTimestamp(value) {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function validPeriod(value) {
  return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value || '');
}

function inspectInventoryGroup(errors, group, code) {
  addShape(errors, group, SHAPES.inventoryGroup, `${code}.structure`);
  for (const field of SHAPES.inventoryGroup) {
    add(errors, nonNegativeInteger(group?.[field]), `${code}.${field}`);
  }
  add(
    errors,
    group?.totalTables === group?.nonEmptyTables + group?.emptyTables,
    `${code}.table_count_identity`,
  );
  add(errors, group?.totalRows >= group?.nonEmptyTables, `${code}.row_lower_bound`);
  add(
    errors,
    (group?.totalRows === 0) === (group?.nonEmptyTables === 0),
    `${code}.row_presence_identity`,
  );
}

function inspectTemporalDomain(errors, row, code) {
  addShape(errors, row, SHAPES.temporalDomain, `${code}.structure`);
  for (const field of [
    'rows', 'validRows', 'quarantineRows', 'validPeriods', 'firstValidYear',
    'lastValidYear', 'dateMonthMismatchRows', 'quarantineReasonOccurrences',
  ]) {
    add(errors, nonNegativeInteger(row?.[field]), `${code}.${field}`);
  }
  add(errors, row?.rows > 0, `${code}.rows_nonzero`);
  add(errors, row?.rows === row?.validRows + row?.quarantineRows, `${code}.row_identity`);
  add(errors, finitePercentage(row?.validRatePct), `${code}.valid_rate`);
  add(errors, closeTo(row?.validRatePct, percentage(row?.validRows, row?.rows)), `${code}.valid_rate_identity`);
  add(errors, row?.dateMonthMismatchRows <= row?.rows, `${code}.date_mismatch_bound`);
  add(errors, row?.quarantineReasonOccurrences >= row?.quarantineRows, `${code}.reason_occurrence_bound`);
  add(errors, validPeriod(row?.firstValidPeriod), `${code}.first_period`);
  add(errors, validPeriod(row?.lastValidPeriod), `${code}.last_period`);
  add(errors, row?.firstValidPeriod <= row?.lastValidPeriod, `${code}.period_order`);
  add(errors, row?.firstValidYear === Number(String(row?.firstValidPeriod).slice(0, 4)), `${code}.first_year_identity`);
  add(errors, row?.lastValidYear === Number(String(row?.lastValidPeriod).slice(0, 4)), `${code}.last_year_identity`);
  add(errors, row?.firstValidYear <= row?.lastValidYear, `${code}.year_order`);
}

function inspectReferentialFact(errors, row, code, uniqueLegajoKeys) {
  addShape(errors, row, SHAPES.fact, `${code}.structure`);
  for (const field of [
    'rows', 'matchedRows', 'orphanRows', 'distinctEmployeeKeys',
    'validMatchedEmployeeKeys',
  ]) {
    add(errors, nonNegativeInteger(row?.[field]), `${code}.${field}`);
  }
  add(errors, row?.rows > 0, `${code}.rows_nonzero`);
  add(errors, row?.rows === row?.matchedRows + row?.orphanRows, `${code}.row_identity`);
  add(errors, row?.distinctEmployeeKeys <= uniqueLegajoKeys, `${code}.distinct_key_bound`);
  add(errors, row?.validMatchedEmployeeKeys <= row?.distinctEmployeeKeys, `${code}.valid_key_bound`);
  add(errors, finitePercentage(row?.joinIntegrityPct), `${code}.join_rate`);
  add(errors, closeTo(row?.joinIntegrityPct, percentage(row?.matchedRows, row?.rows)), `${code}.join_rate_identity`);
  add(errors, finitePercentage(row?.employeeCoveragePct), `${code}.employee_coverage`);
  add(
    errors,
    closeTo(
      row?.employeeCoveragePct,
      percentage(row?.validMatchedEmployeeKeys, uniqueLegajoKeys),
    ),
    `${code}.employee_coverage_identity`,
  );
}

export function inspectGrhQualityContract(data) {
  const errors = [];
  addShape(errors, data, SHAPES.top, 'quality_projection.structure');
  add(errors, data?.schemaVersion === GRH_QUALITY_SCHEMA_VERSION, 'schema.version');
  add(errors, !containsForbiddenProperty(data), 'privacy.forbidden_property');
  add(errors, !containsForbiddenValue(data), 'privacy.forbidden_value');

  const source = data?.source;
  addShape(errors, source, SHAPES.source, 'source.structure');
  add(errors, source?.canonicalSystem === 'GRH Junín', 'source.canonical_system');
  add(errors, /^grh_junin\.[a-z0-9._-]+\.sql\.gz$/i.test(source?.sourceFile || ''), 'source.file');
  add(errors, /^[0-9a-f]{64}$/.test(source?.sourceSha256 || ''), 'source.sha256');
  add(errors, /^\d{4}-\d{2}-\d{2}$/.test(source?.snapshotAsOf || '') &&
    Number.isFinite(Date.parse(`${source?.snapshotAsOf}T00:00:00Z`)), 'source.snapshot');
  add(errors, nonNegativeInteger(source?.compressedSizeBytes) && source.compressedSizeBytes > 0, 'source.size');
  add(errors, source?.realtime === false, 'source.realtime');
  add(errors, Array.isArray(source?.excludedSources) && source.excludedSources.length === 1 &&
    source.excludedSources[0] === 'personas_junin', 'source.excluded_sources');

  const lineage = data?.lineage;
  addShape(errors, lineage, SHAPES.lineage, 'lineage.structure');
  add(errors, lineage?.profileSchemaVersion === 'grh-profile-v1', 'lineage.profile_version');
  add(
    errors,
    /^grh-semantic-v[1-9]\d*$/.test(lineage?.semanticSchemaVersion || ''),
    'lineage.semantic_version',
  );
  add(errors, validIsoTimestamp(lineage?.profileGeneratedAt), 'lineage.profile_generated_at');
  add(errors, validIsoTimestamp(lineage?.semanticGeneratedAt), 'lineage.semantic_generated_at');
  const snapshotStart = Date.parse(`${source?.snapshotAsOf}T00:00:00Z`);
  add(errors, Date.parse(lineage?.profileGeneratedAt) >= snapshotStart, 'lineage.profile_after_snapshot');
  add(errors, Date.parse(lineage?.semanticGeneratedAt) >= snapshotStart, 'lineage.semantic_after_snapshot');

  const privacy = data?.privacy;
  addShape(errors, privacy, SHAPES.privacy, 'privacy.structure');
  for (const field of [
    'aggregateOnly', 'containsPii', 'employeeIdentifiersExported', 'rawRowsExported',
    'categoricalLabelsExported', 'cellCodesExported', 'monetarySeriesExported',
  ]) {
    add(errors, typeof privacy?.[field] === 'boolean', `privacy.${field}_type`);
  }
  add(errors, privacy?.aggregateOnly === true, 'privacy.aggregate_only');
  for (const field of [
    'containsPii', 'employeeIdentifiersExported', 'rawRowsExported',
    'categoricalLabelsExported', 'cellCodesExported', 'monetarySeriesExported',
  ]) {
    add(errors, privacy?.[field] === false, `privacy.${field}`);
  }

  const inventory = data?.inventory;
  addShape(errors, inventory, SHAPES.inventory, 'inventory.structure');
  inspectInventoryGroup(errors, inventory?.all, 'inventory.all');
  inspectInventoryGroup(errors, inventory?.focal, 'inventory.focal');
  inspectInventoryGroup(errors, inventory?.remainder, 'inventory.remainder');
  for (const field of SHAPES.inventoryGroup) {
    add(
      errors,
      inventory?.all?.[field] === inventory?.focal?.[field] + inventory?.remainder?.[field],
      `inventory.${field}_identity`,
    );
  }
  add(errors, inventory?.all?.totalTables > 0 && inventory?.all?.totalRows > 0, 'inventory.nonempty');
  add(errors, inventory?.focal?.totalTables > 0 && inventory?.focal?.totalRows > 0, 'inventory.focal_nonempty');

  const temporal = data?.temporal;
  addShape(errors, temporal, SHAPES.temporal, 'temporal.structure');
  addShape(errors, temporal?.domains, GRH_TEMPORAL_DOMAINS, 'temporal.domains_structure');
  for (const domain of GRH_TEMPORAL_DOMAINS) {
    inspectTemporalDomain(errors, temporal?.domains?.[domain], `temporal.${domain}`);
  }
  const temporalSums = {
    rows: 0,
    validRows: 0,
    quarantineRows: 0,
    dateMonthMismatchRows: 0,
    quarantineReasonOccurrences: 0,
  };
  for (const domain of GRH_TEMPORAL_DOMAINS) {
    const row = temporal?.domains?.[domain];
    for (const field of Object.keys(temporalSums)) {
      if (nonNegativeInteger(row?.[field])) temporalSums[field] += row[field];
    }
  }
  for (const [field, expected] of Object.entries(temporalSums)) {
    add(errors, nonNegativeInteger(temporal?.[field]), `temporal.${field}`);
    add(errors, temporal?.[field] === expected, `temporal.${field}_identity`);
  }
  add(errors, finitePercentage(temporal?.validRatePct), 'temporal.valid_rate');
  add(errors, closeTo(temporal?.validRatePct, percentage(temporal?.validRows, temporal?.rows)), 'temporal.valid_rate_identity');
  add(errors, temporal?.rows <= inventory?.focal?.totalRows, 'temporal.focal_row_bound');

  const referential = data?.referential;
  addShape(errors, referential, SHAPES.referential, 'referential.structure');
  addShape(errors, referential?.legajo, SHAPES.legajo, 'referential.legajo_structure');
  add(errors, nonNegativeInteger(referential?.legajo?.rows) && referential.legajo.rows > 0, 'referential.legajo_rows');
  add(errors, nonNegativeInteger(referential?.legajo?.uniqueKeys) &&
    referential.legajo.uniqueKeys <= referential.legajo.rows, 'referential.legajo_unique_keys');
  add(errors, finitePercentage(referential?.legajo?.uniquenessPct), 'referential.legajo_uniqueness');
  add(
    errors,
    closeTo(
      referential?.legajo?.uniquenessPct,
      percentage(referential?.legajo?.uniqueKeys, referential?.legajo?.rows),
    ),
    'referential.legajo_uniqueness_identity',
  );
  addShape(errors, referential?.facts, GRH_REFERENTIAL_FACTS, 'referential.facts_structure');
  for (const fact of GRH_REFERENTIAL_FACTS) {
    inspectReferentialFact(
      errors,
      referential?.facts?.[fact],
      `referential.${fact}`,
      referential?.legajo?.uniqueKeys,
    );
  }

  const reconciliation = data?.reconciliation;
  addShape(errors, reconciliation, SHAPES.reconciliation, 'reconciliation.structure');
  add(errors, ['reconciled', 'material_differences_detected'].includes(reconciliation?.status), 'reconciliation.status');
  add(errors, reconciliation?.totpagoDiagnosticStatus === 'not_cross_source_reconciled', 'reconciliation.totpago_status');
  add(errors, reconciliation?.metricStatus === 'calculation_control_not_bank_disbursement', 'reconciliation.metric_status');
  add(errors, reconciliation?.currencyStatus === 'not_declared_in_source', 'reconciliation.currency_status');
  for (const field of [
    'toleranceCents', 'calculationRuns', 'totpagoRuns', 'unionRuns', 'matchedRuns',
    'fullyReconciledRuns', 'absoluteVarianceCents',
  ]) {
    add(errors, nonNegativeInteger(reconciliation?.[field]), `reconciliation.${field}`);
  }
  for (const field of [
    'runCoveragePct', 'metricExactRatePct', 'valueAgreementPct', 'scorePct',
  ]) {
    add(errors, finitePercentage(reconciliation?.[field]), `reconciliation.${field}`);
  }
  add(
    errors,
    reconciliation?.unionRuns === reconciliation?.calculationRuns +
      reconciliation?.totpagoRuns - reconciliation?.matchedRuns,
    'reconciliation.union_identity',
  );
  add(errors, reconciliation?.matchedRuns <= reconciliation?.calculationRuns, 'reconciliation.matched_calculation_bound');
  add(errors, reconciliation?.matchedRuns <= reconciliation?.totpagoRuns, 'reconciliation.matched_totpago_bound');
  add(errors, reconciliation?.fullyReconciledRuns <= reconciliation?.matchedRuns, 'reconciliation.fully_reconciled_bound');
  add(
    errors,
    closeTo(
      reconciliation?.runCoveragePct,
      percentage(reconciliation?.matchedRuns, reconciliation?.unionRuns),
    ),
    'reconciliation.run_coverage_identity',
  );
  const reconciliationScore = Number((([
    reconciliation?.runCoveragePct,
    reconciliation?.metricExactRatePct,
    reconciliation?.valueAgreementPct,
  ].reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0)) / 3).toFixed(4));
  add(errors, closeTo(reconciliation?.scorePct, reconciliationScore), 'reconciliation.score_identity');
  add(
    errors,
    reconciliation?.status === (reconciliation?.scorePct === 100 ? 'reconciled' : 'material_differences_detected'),
    'reconciliation.status_identity',
  );

  const quality = data?.quality;
  addShape(errors, quality, SHAPES.quality, 'quality.structure');
  add(errors, finitePercentage(quality?.score), 'quality.score');
  add(errors, quality?.scope === GRH_QUALITY_SCOPE, 'quality.scope');
  addShape(errors, quality?.components, GRH_QUALITY_COMPONENTS, 'quality.components_structure');
  let weightSum = 0;
  let weightedScore = 0;
  for (const componentName of GRH_QUALITY_COMPONENTS) {
    const component = quality?.components?.[componentName];
    addShape(errors, component, SHAPES.component, `quality.${componentName}.structure`);
    add(errors, finitePercentage(component?.score), `quality.${componentName}.score`);
    add(errors, finitePercentage(component?.weightPct), `quality.${componentName}.weight`);
    if (finitePercentage(component?.score) && finitePercentage(component?.weightPct)) {
      weightSum += component.weightPct;
      weightedScore += component.score * component.weightPct / 100;
    }
  }
  add(errors, closeTo(weightSum, 100, 0.000001), 'quality.weight_identity');
  add(errors, closeTo(quality?.score, Number(weightedScore.toFixed(2)), 0.001), 'quality.score_identity');
  const meanTemporalRate = Number((GRH_TEMPORAL_DOMAINS.reduce(
    (sum, domain) => sum + (temporal?.domains?.[domain]?.validRatePct || 0),
    0,
  ) / GRH_TEMPORAL_DOMAINS.length).toFixed(2));
  add(errors, closeTo(quality?.components?.temporalValidity?.score, meanTemporalRate, 0.001), 'quality.temporal_identity');
  const meanReferentialRate = Number((GRH_REFERENTIAL_FACTS.reduce(
    (sum, fact) => sum + (referential?.facts?.[fact]?.joinIntegrityPct || 0),
    0,
  ) / GRH_REFERENTIAL_FACTS.length).toFixed(2));
  add(errors, closeTo(quality?.components?.referentialIntegrity?.score, meanReferentialRate, 0.001), 'quality.referential_identity');
  add(errors, closeTo(quality?.components?.payrollReconciliation?.score, Number(reconciliation?.scorePct?.toFixed?.(2)), 0.001), 'quality.reconciliation_identity');
  add(errors, closeTo(quality?.components?.legajoKeyUniqueness?.score, Number(referential?.legajo?.uniquenessPct?.toFixed?.(2)), 0.001), 'quality.legajo_identity');

  const risks = quality?.risks;
  addShape(errors, risks, SHAPES.risks, 'quality.risks_structure');
  for (const field of [
    'rawSourceContainsSensitivePii', 'historicalSnapshotNotRealtime',
    'currencyNotDeclaredInSource', 'totpagoCrossSourceMismatch',
    'latestCalculationControlWithinRoundingTolerance',
  ]) {
    add(errors, typeof risks?.[field] === 'boolean', `quality.risks.${field}_type`);
  }
  for (const field of [
    'legacyImportErrorRows', 'quarantinedTemporalRows',
    'calculationControlAnomalousPeriods', 'suspiciousTextEncodingLabelCount',
  ]) {
    add(errors, nonNegativeInteger(risks?.[field]), `quality.risks.${field}`);
  }
  add(errors, risks?.rawSourceContainsSensitivePii === true, 'quality.risks.raw_pii');
  add(errors, risks?.historicalSnapshotNotRealtime === !source?.realtime, 'quality.risks.snapshot_identity');
  add(errors, risks?.currencyNotDeclaredInSource === (reconciliation?.currencyStatus === 'not_declared_in_source'), 'quality.risks.currency_identity');
  add(errors, risks?.quarantinedTemporalRows === temporal?.quarantineRows, 'quality.risks.quarantine_identity');
  add(errors, risks?.totpagoCrossSourceMismatch === (reconciliation?.status === 'material_differences_detected'), 'quality.risks.reconciliation_identity');
  add(errors, risks?.legacyImportErrorRows <= inventory?.all?.totalRows, 'quality.risks.legacy_import_bound');
  add(errors, risks?.calculationControlAnomalousPeriods <= temporal?.domains?.calculo?.validPeriods, 'quality.risks.calculation_anomaly_bound');

  const uniqueErrors = Object.freeze([...new Set(errors)]);
  return Object.freeze({ ok: uniqueErrors.length === 0, errors: uniqueErrors });
}

export function validateGrhQualityContract(data) {
  return inspectGrhQualityContract(data).ok;
}
