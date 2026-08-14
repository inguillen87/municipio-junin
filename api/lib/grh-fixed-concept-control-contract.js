export const GRH_FIXED_CONCEPT_CONTROL_SCHEMA_VERSION = 'grh-fixed-concept-control-v1';
export const GRH_FIXED_CONCEPT_CONTROL_POLICY_VERSION = 'grh-fixed-concept-control-policy-v1';
export const GRH_FIXED_CONCEPT_CONTROL_GENERATED_AT = '2026-08-14T00:00:00.000Z';

export const GRH_FIXED_CONCEPT_CONTROL_LIMITS = Object.freeze([
  Object.freeze({
    code: 'historical_snapshot_not_realtime',
    text: 'La información corresponde al respaldo del 6 de agosto de 2026 y no se actualiza en tiempo real.',
  }),
  Object.freeze({
    code: 'observation_not_authorization_or_payment',
    text: 'Observar la misma persona y concepto en cálculo no acredita autorización, corrección, devengado ni pago.',
  }),
  Object.freeze({
    code: 'absence_not_error',
    text: 'No observar una persona o concepto en julio de 2026 es una señal de revisión y no demuestra un error.',
  }),
  Object.freeze({
    code: 'fixed_range_not_employment_status',
    text: 'La vigencia por fechas de fijos no acredita vínculo laboral activo ni participación en una liquidación.',
  }),
  Object.freeze({
    code: 'reported_start_not_employment_ingress',
    text: 'FECHA_ALTA es el alta informada del concepto fijo; no representa el ingreso laboral de una persona.',
  }),
  Object.freeze({
    code: 'administration_comparison_descriptive_only',
    text: 'Las ventanas iguales describen registros de origen y no evalúan gestiones, causas, mérito ni desempeño.',
  }),
  Object.freeze({
    code: 'no_amounts_budget_procurement_or_treasury',
    text: 'La vista no publica importes ni integra presupuesto, compras, tesorería o transferencias bancarias.',
  }),
]);

const SOURCE_SHA256 = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';

const METRIC = Object.freeze({
  fixedRowGrain: 'una fila fuente de fijos identificada internamente por FIJO_ID, nunca exportado',
  eligibleFixedConceptDefinition: 'FECHA_ALTA menor o igual al ancla y FVTO_53 mayor o igual al ancla, con ambas fechas válidas',
  exactObservationDefinition: 'misma clave laboral interna CODI_01, LEGA_12 y CODI_27 en al menos una fila válida de calculo del período',
  personObservedConceptAbsentDefinition: 'el mismo registro laboral aparece en calculo del período, pero no se observa el mismo CODI_27',
  personNotObservedDefinition: 'la clave laboral interna no aparece en ninguna fila válida de calculo del período',
  observationMeaning: 'observado describe presencia técnica en la fuente; no acredita autorización, corrección, devengado ni pago',
  absenceMeaning: 'no observado es una señal de revisión; no demuestra error, baja, deuda ni incumplimiento',
  comparisonRule: 'dos ventanas inclusivas de 972 días: 2023-12-09..2026-08-06 y 2019-12-09..2022-08-06',
});

const COVERAGE = Object.freeze({
  sourceFixedRows: 8_729,
  uniqueFixedIds: 8_729,
  duplicateFixedIdRows: 0,
  validEmployeeKeyRows: 8_729,
  matchedLegajoRows: 8_729,
  orphanLegajoRows: 0,
  legajoJoinCoveragePct: 100,
  catalogMatchedRows: 8_729,
  catalogOrphanRows: 0,
  validRangeRows: 8_066,
  missingStartRows: 0,
  missingEndRows: 2,
  endBeforeStartRows: 661,
  validRangeRatePct: 92.4046,
  exactBusinessKeyExtraRows: 79,
  calculationRows: 29_395,
  calculationParticipants: 856,
  calculationPersonConceptPairs: 22_181,
});

const STATES = Object.freeze([
  Object.freeze({
    code: 'same_person_and_concept_observed',
    label: 'Misma persona y concepto observados',
    rows: 94,
    people: 90,
    privacyStatus: 'released',
  }),
  Object.freeze({
    code: 'person_observed_concept_absent',
    label: 'Persona observada; concepto no observado',
    rows: 19,
    people: 18,
    privacyStatus: 'released',
  }),
  Object.freeze({
    code: 'person_not_observed_in_period',
    label: 'Persona no observada en el período',
    rows: 78,
    people: 77,
    privacyStatus: 'released',
  }),
]);

const CATEGORIES = Object.freeze([
  Object.freeze({ label: 'RESPONSABILIDAD JERARQUICA', rows: 113, people: 113, privacyStatus: 'released' }),
  Object.freeze({ label: 'ESTADO DOCENTE', rows: 59, people: 59, privacyStatus: 'released' }),
  Object.freeze({ label: 'Otros conceptos protegidos', rows: 21, people: 19, privacyStatus: 'protected_aggregate' }),
]);

const WINDOWS = Object.freeze({
  current: Object.freeze({
    code: 'current', label: 'Gestión actual comparable', startDate: '2023-12-09', endDate: '2026-08-06',
    days: 972, startRows: 60, distinctPeople: 56, concepts: 7, stateReportedRows: 60,
    movementTypeReportedRows: 60, legalInstrumentReportedRows: 0, privacyStatus: 'released',
  }),
  prior: Object.freeze({
    code: 'prior', label: 'Mismo tramo cuatro años antes', startDate: '2019-12-09', endDate: '2022-08-06',
    days: 972, startRows: 423, distinctPeople: 387, concepts: 7, stateReportedRows: 146,
    movementTypeReportedRows: 146, legalInstrumentReportedRows: 0, privacyStatus: 'released',
  }),
});

const QUALITY_SIGNALS = Object.freeze([
  Object.freeze({
    code: 'fixed_range_end_before_start', label: 'Vencimiento anterior al alta', severity: 'high',
    rows: 661, ratePct: 7.5725,
    meaning: 'El rango no puede usarse para determinar vigencia hasta ser saneado.',
  }),
  Object.freeze({
    code: 'fixed_range_end_missing', label: 'Vencimiento no informado', severity: 'medium',
    rows: 2, ratePct: 0.0229,
    meaning: 'La vigencia por rango no puede evaluarse cuando falta el vencimiento.',
  }),
  Object.freeze({
    code: 'snapshot_eligible_legal_instrument_missing', label: 'Instrumento legal no informado', severity: 'high',
    rows: 193, ratePct: 100,
    meaning: 'La columna existe, pero su ausencia no permite verificar respaldo legal desde esta fuente.',
  }),
  Object.freeze({
    code: 'snapshot_eligible_movement_type_missing', label: 'Tipo de movimiento no informado', severity: 'medium',
    rows: 109, ratePct: 56.4767,
    meaning: 'La ausencia reduce la capacidad de interpretar cómo se originó o modificó el registro.',
  }),
]);

const KEYS = Object.freeze({
  top: ['schemaVersion', 'policyVersion', 'source', 'privacy', 'metric', 'coverage', 'reconciliation', 'snapshot', 'administrationComparison', 'quality', 'limits'],
  source: ['canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf', 'generatedAt', 'realtime', 'tables', 'calculationPeriod', 'calculationPeriodEnd'],
  tables: ['fixedConcepts', 'conceptCatalog', 'calculationDetails', 'employmentMaster'],
  privacy: ['threshold', 'aggregateOnly', 'containsPii', 'personIdentifiersExported', 'sourceKeysExported', 'rawRowsExported', 'monetaryAmountsExported', 'legalInstrumentValuesExported', 'arbitraryFiltersAllowed', 'complementarySuppression'],
  metric: Object.keys(METRIC),
  coverage: Object.keys(COVERAGE),
  reconciliation: ['calculationPeriod', 'fixedEligibilityDate', 'eligibleFixedRows', 'eligiblePeople', 'states', 'exactObservationRatePct'],
  state: ['code', 'label', 'rows', 'people', 'privacyStatus'],
  snapshot: ['asOf', 'eligibleFixedRows', 'eligiblePeople', 'authorizedStateRows', 'missingStateRows', 'movementTypeReportedRows', 'legalInstrumentReportedRows', 'conceptsObserved', 'categories'],
  categories: ['sourceCategoryCount', 'releasedCategoryCount', 'protectedCategoryCount', 'rows'],
  category: ['label', 'rows', 'people', 'privacyStatus'],
  comparison: ['rule', 'current', 'prior', 'differences', 'metadataComparable', 'interpretation'],
  window: ['code', 'label', 'startDate', 'endDate', 'days', 'startRows', 'distinctPeople', 'concepts', 'stateReportedRows', 'movementTypeReportedRows', 'legalInstrumentReportedRows', 'privacyStatus'],
  differences: ['startRows', 'distinctPeople'],
  quality: ['status', 'signals'],
  signal: ['code', 'label', 'severity', 'rows', 'ratePct', 'meaning'],
  limit: ['code', 'text'],
});

const HEX_64 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const PERIOD = /^\d{4}-(?:0[1-9]|1[0-2])$/;

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function percentage(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function rounded(value) {
  return Number(value.toFixed(4));
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : rounded((numerator / denominator) * 100);
}

function validDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function add(errors, condition, code) {
  if (!condition) errors.push(code);
}

function matchesExpected(value, expected) {
  return Object.entries(expected).every(([key, expectedValue]) => value?.[key] === expectedValue);
}

function matchesExactRow(value, expected) {
  return exactKeys(value, Object.keys(expected)) && matchesExpected(value, expected);
}

export function inspectGrhFixedConceptControlContract(value) {
  const errors = [];
  add(errors, exactKeys(value, KEYS.top), 'fixed_concept_control.structure');
  add(errors, value?.schemaVersion === GRH_FIXED_CONCEPT_CONTROL_SCHEMA_VERSION, 'schema.version');
  add(errors, value?.policyVersion === GRH_FIXED_CONCEPT_CONTROL_POLICY_VERSION, 'policy.version');

  const source = value?.source;
  add(errors, exactKeys(source, KEYS.source), 'source.structure');
  add(errors, source?.canonicalSystem === 'GRH Junín', 'source.canonical_system');
  add(errors, source?.sourceFile === 'grh_junin.backup_2026080615_plataforma.sql.gz', 'source.file');
  add(errors, HEX_64.test(source?.sourceSha256 || ''), 'source.sha256_format');
  add(errors, source?.sourceSha256 === SOURCE_SHA256, 'source.sha256');
  add(errors, source?.snapshotAsOf === '2026-08-06', 'source.snapshot');
  add(errors, source?.generatedAt === GRH_FIXED_CONCEPT_CONTROL_GENERATED_AT, 'source.generated_at');
  add(errors, source?.realtime === false, 'source.realtime');
  add(errors, exactKeys(source?.tables, KEYS.tables), 'source.tables.structure');
  add(errors, source?.tables?.fixedConcepts === 'fijos', 'source.tables.fixed_concepts');
  add(errors, source?.tables?.conceptCatalog === 'concepto', 'source.tables.concept_catalog');
  add(errors, source?.tables?.calculationDetails === 'calculo', 'source.tables.calculation_details');
  add(errors, source?.tables?.employmentMaster === 'legajo', 'source.tables.employment_master');
  add(errors, source?.calculationPeriod === '2026-07', 'source.calculation_period');
  add(errors, source?.calculationPeriodEnd === '2026-07-31', 'source.calculation_period_end');

  const privacy = value?.privacy;
  add(errors, exactKeys(privacy, KEYS.privacy), 'privacy.structure');
  add(errors, privacy?.threshold === 10, 'privacy.threshold');
  add(errors, privacy?.aggregateOnly === true, 'privacy.aggregate_only');
  add(errors, privacy?.complementarySuppression === true, 'privacy.complementary_suppression');
  for (const field of [
    'containsPii', 'personIdentifiersExported', 'sourceKeysExported', 'rawRowsExported',
    'monetaryAmountsExported', 'legalInstrumentValuesExported', 'arbitraryFiltersAllowed',
  ]) add(errors, privacy?.[field] === false, `privacy.${field}`);

  const metric = value?.metric;
  add(errors, exactKeys(metric, KEYS.metric), 'metric.structure');
  for (const [key, expected] of Object.entries(METRIC)) {
    add(errors, metric?.[key] === expected, `metric.${key}`);
  }

  const coverage = value?.coverage;
  add(errors, exactKeys(coverage, KEYS.coverage), 'coverage.structure');
  for (const field of KEYS.coverage.filter(key => !key.endsWith('Pct'))) {
    add(errors, nonNegativeInteger(coverage?.[field]), `coverage.${field}`);
  }
  for (const field of KEYS.coverage.filter(key => key.endsWith('Pct'))) {
    add(errors, percentage(coverage?.[field]), `coverage.${field}`);
  }
  add(errors, matchesExpected(coverage, COVERAGE), 'coverage.canonical_identity');
  add(errors, coverage?.uniqueFixedIds + coverage?.duplicateFixedIdRows === coverage?.sourceFixedRows, 'coverage.fixed_id_identity');
  add(errors, coverage?.matchedLegajoRows + coverage?.orphanLegajoRows === coverage?.validEmployeeKeyRows, 'coverage.legajo_join_identity');
  add(errors, coverage?.catalogMatchedRows + coverage?.catalogOrphanRows === coverage?.sourceFixedRows, 'coverage.catalog_join_identity');
  add(errors, coverage?.validRangeRows + coverage?.missingStartRows + coverage?.missingEndRows + coverage?.endBeforeStartRows === coverage?.sourceFixedRows, 'coverage.range_identity');
  add(errors, coverage?.legajoJoinCoveragePct === ratio(coverage?.matchedLegajoRows, coverage?.validEmployeeKeyRows), 'coverage.legajo_rate_identity');
  add(errors, coverage?.validRangeRatePct === ratio(coverage?.validRangeRows, coverage?.sourceFixedRows), 'coverage.valid_range_rate_identity');

  const reconciliation = value?.reconciliation;
  add(errors, exactKeys(reconciliation, KEYS.reconciliation), 'reconciliation.structure');
  add(errors, reconciliation?.calculationPeriod === source?.calculationPeriod, 'reconciliation.period_identity');
  add(errors, reconciliation?.fixedEligibilityDate === source?.calculationPeriodEnd, 'reconciliation.date_identity');
  add(errors, reconciliation?.eligibleFixedRows === 191, 'reconciliation.eligible_rows');
  add(errors, reconciliation?.eligiblePeople === 185, 'reconciliation.eligible_people');
  const states = Array.isArray(reconciliation?.states) ? reconciliation.states : [];
  add(errors, states.length === STATES.length, 'reconciliation.states.length');
  states.forEach((state, index) => {
    add(errors, exactKeys(state, KEYS.state), `reconciliation.states.${index}.structure`);
    add(errors, matchesExactRow(state, STATES[index]), `reconciliation.states.${index}.canonical_identity`);
    add(errors, state?.rows >= privacy?.threshold, `reconciliation.states.${index}.rows_threshold`);
    add(errors, state?.people >= privacy?.threshold, `reconciliation.states.${index}.people_threshold`);
  });
  add(errors, states.reduce((sum, state) => sum + (state?.rows || 0), 0) === reconciliation?.eligibleFixedRows, 'reconciliation.row_identity');
  add(errors, states.reduce((sum, state) => sum + (state?.people || 0), 0) === reconciliation?.eligiblePeople, 'reconciliation.people_identity');
  add(errors, reconciliation?.exactObservationRatePct === ratio(states[0]?.rows, reconciliation?.eligibleFixedRows), 'reconciliation.rate_identity');

  const snapshot = value?.snapshot;
  add(errors, exactKeys(snapshot, KEYS.snapshot), 'snapshot.structure');
  add(errors, snapshot?.asOf === source?.snapshotAsOf, 'snapshot.date_identity');
  add(errors, snapshot?.eligibleFixedRows === 193, 'snapshot.eligible_rows');
  add(errors, snapshot?.eligiblePeople === 187, 'snapshot.eligible_people');
  add(errors, snapshot?.authorizedStateRows === 192, 'snapshot.authorized_rows');
  add(errors, snapshot?.missingStateRows === 1, 'snapshot.missing_state_rows');
  add(errors, snapshot?.movementTypeReportedRows === 84, 'snapshot.movement_type_rows');
  add(errors, snapshot?.legalInstrumentReportedRows === 0, 'snapshot.legal_instrument_rows');
  add(errors, snapshot?.conceptsObserved === 11, 'snapshot.concepts');
  add(errors, snapshot?.authorizedStateRows + snapshot?.missingStateRows === snapshot?.eligibleFixedRows, 'snapshot.state_identity');
  for (const field of ['movementTypeReportedRows', 'legalInstrumentReportedRows']) {
    add(errors, nonNegativeInteger(snapshot?.[field]) && snapshot[field] <= snapshot?.eligibleFixedRows, `snapshot.${field}_bound`);
  }

  const categories = snapshot?.categories;
  add(errors, exactKeys(categories, KEYS.categories), 'snapshot.categories.structure');
  add(errors, categories?.sourceCategoryCount === 11, 'snapshot.categories.source_count');
  add(errors, categories?.releasedCategoryCount === 2, 'snapshot.categories.released_count');
  add(errors, categories?.protectedCategoryCount === 9, 'snapshot.categories.protected_count');
  add(errors, categories?.releasedCategoryCount + categories?.protectedCategoryCount === categories?.sourceCategoryCount, 'snapshot.categories.count_identity');
  const categoryRows = Array.isArray(categories?.rows) ? categories.rows : [];
  add(errors, categoryRows.length === CATEGORIES.length, 'snapshot.categories.rows.length');
  categoryRows.forEach((row, index) => {
    add(errors, exactKeys(row, KEYS.category), `snapshot.categories.rows.${index}.structure`);
    add(errors, matchesExactRow(row, CATEGORIES[index]), `snapshot.categories.rows.${index}.canonical_identity`);
    add(errors, row?.people >= privacy?.threshold, `snapshot.categories.rows.${index}.threshold`);
  });
  add(errors, categoryRows.reduce((sum, row) => sum + (row?.rows || 0), 0) === snapshot?.eligibleFixedRows, 'snapshot.categories.row_identity');
  add(errors, categoryRows.filter(row => row?.privacyStatus === 'released').length === categories?.releasedCategoryCount, 'snapshot.categories.released_identity');
  add(errors, categoryRows.filter(row => row?.privacyStatus === 'protected_aggregate').length === 1, 'snapshot.categories.protected_aggregate_identity');

  const comparison = value?.administrationComparison;
  add(errors, exactKeys(comparison, KEYS.comparison), 'administration_comparison.structure');
  add(errors, comparison?.rule === 'reported_fixed_concept_start_dates_in_equal_972_day_windows', 'administration_comparison.rule');
  for (const key of ['current', 'prior']) {
    const window = comparison?.[key];
    add(errors, exactKeys(window, KEYS.window), `administration_comparison.${key}.structure`);
    add(errors, matchesExactRow(window, WINDOWS[key]), `administration_comparison.${key}.canonical_identity`);
    add(errors, validDate(window?.startDate) && validDate(window?.endDate), `administration_comparison.${key}.dates`);
    add(errors, window?.startRows >= privacy?.threshold, `administration_comparison.${key}.rows_threshold`);
    add(errors, window?.distinctPeople >= privacy?.threshold, `administration_comparison.${key}.people_threshold`);
  }
  add(errors, comparison?.current?.days === comparison?.prior?.days && comparison?.current?.days === 972, 'administration_comparison.equal_window_identity');
  add(errors, exactKeys(comparison?.differences, KEYS.differences), 'administration_comparison.differences.structure');
  add(errors, comparison?.differences?.startRows === comparison?.current?.startRows - comparison?.prior?.startRows, 'administration_comparison.differences.rows');
  add(errors, comparison?.differences?.distinctPeople === comparison?.current?.distinctPeople - comparison?.prior?.distinctPeople, 'administration_comparison.differences.people');
  add(errors, comparison?.metadataComparable === false, 'administration_comparison.metadata_comparable');
  add(errors, comparison?.interpretation === 'FECHA_ALTA describe el alta informada del concepto fijo y la completitud de metadatos cambia entre ventanas; no son altas laborales ni evaluación de gestiones.', 'administration_comparison.interpretation');

  const quality = value?.quality;
  add(errors, exactKeys(quality, KEYS.quality), 'quality.structure');
  add(errors, quality?.status === 'attention_required', 'quality.status');
  const signals = Array.isArray(quality?.signals) ? quality.signals : [];
  add(errors, signals.length === QUALITY_SIGNALS.length, 'quality.signals.length');
  signals.forEach((signal, index) => {
    add(errors, exactKeys(signal, KEYS.signal), `quality.signals.${index}.structure`);
    add(errors, matchesExactRow(signal, QUALITY_SIGNALS[index]), `quality.signals.${index}.canonical_identity`);
    add(errors, nonNegativeInteger(signal?.rows), `quality.signals.${index}.rows`);
    add(errors, percentage(signal?.ratePct), `quality.signals.${index}.rate`);
  });

  const limits = Array.isArray(value?.limits) ? value.limits : [];
  add(errors, limits.length === GRH_FIXED_CONCEPT_CONTROL_LIMITS.length, 'limits.length');
  limits.forEach((limit, index) => {
    const expected = GRH_FIXED_CONCEPT_CONTROL_LIMITS[index];
    add(errors, exactKeys(limit, KEYS.limit), `limits.${index}.structure`);
    add(errors, limit?.code === expected?.code, `limits.${index}.code`);
    add(errors, limit?.text === expected?.text, `limits.${index}.text`);
  });

  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

export function validateGrhFixedConceptControlContract(value) {
  return inspectGrhFixedConceptControlContract(value).ok;
}
