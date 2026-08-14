export const GRH_EMPLOYMENT_ACTIONS_SCHEMA_VERSION = 'grh-employment-actions-v1';
export const GRH_EMPLOYMENT_ACTIONS_GENERATED_AT = '2026-08-13T00:00:00.000Z';
export const GRH_EMPLOYMENT_ACTIONS_CLASSIFICATION_RULE_VERSION =
  'grh-foja-action-codes-v1';
export const GRH_EMPLOYMENT_ACTIONS_PRIVACY_RULE =
  'protect_category_when_current_prior_or_absolute_delta_is_1_to_9_and_apply_complementary_suppression';

export const GRH_EMPLOYMENT_ACTIONS_RELEASED_CATEGORIES = Object.freeze([
  Object.freeze({
    key: 'area',
    label: 'Área municipal',
    meaning: 'Actuación sobre el área municipal informada.',
  }),
  Object.freeze({
    key: 'category',
    label: 'Categoría laboral',
    meaning: 'Actuación sobre la categoría laboral informada.',
  }),
  Object.freeze({
    key: 'competition-status',
    label: 'Condición de concurso informada',
    meaning: 'Actuación sobre una condición de concurso documentada.',
  }),
  Object.freeze({
    key: 'distribution',
    label: 'Repartición',
    meaning: 'Actuación sobre la repartición informada.',
  }),
  Object.freeze({
    key: 'indemnity-cap',
    label: 'Tope indemnizatorio',
    meaning: 'Actuación sobre el tope indemnizatorio informado.',
  }),
  Object.freeze({
    key: 'labor-agreement',
    label: 'Convenio laboral',
    meaning: 'Actuación sobre el convenio laboral informado.',
  }),
  Object.freeze({
    key: 'leave-regime',
    label: 'Régimen de licencia',
    meaning: 'Actuación sobre el régimen de licencia informado.',
  }),
  Object.freeze({
    key: 'personnel-type',
    label: 'Tipo de personal',
    meaning: 'Actuación sobre el tipo de personal informado.',
  }),
  Object.freeze({
    key: 'position-structure',
    label: 'Estructura de cargos',
    meaning: 'Actuación sobre la estructura de cargos informada.',
  }),
  Object.freeze({
    key: 'reported-entry-date',
    label: 'Fecha de ingreso informada',
    meaning: 'Actuación sobre una fecha de ingreso; no equivale a un alta única.',
  }),
  Object.freeze({
    key: 'reported-exit-date',
    label: 'Fecha de egreso informada',
    meaning: 'Actuación sobre una fecha de egreso; no equivale a una baja única.',
  }),
  Object.freeze({
    key: 'unhealthy-work',
    label: 'Condición de insalubridad',
    meaning: 'Actuación sobre una condición de insalubridad informada.',
  }),
  Object.freeze({
    key: 'workplace',
    label: 'Lugar de trabajo',
    meaning: 'Actuación sobre el lugar de trabajo informado.',
  }),
]);

export const GRH_EMPLOYMENT_ACTIONS_LIMITS = Object.freeze([
  Object.freeze({
    code: 'historical_snapshot_not_realtime',
    text: 'La información corresponde al respaldo del 6 de agosto de 2026 y no se actualiza en tiempo real.',
  }),
  Object.freeze({
    code: 'action_rows_not_unique_changes',
    text: 'Cada fila es una actuación documentada; no representa necesariamente un cambio único.',
  }),
  Object.freeze({
    code: 'effective_date_not_current_validity',
    text: 'La fecha efectiva informada no prueba que una condición continúe vigente en la actualidad.',
  }),
  Object.freeze({
    code: 'entry_exit_actions_not_staffing_events',
    text: 'Las actuaciones sobre fechas de ingreso o egreso no deben interpretarse automáticamente como altas o bajas de dotación.',
  }),
  Object.freeze({
    code: 'comparison_not_causal_attribution',
    text: 'La comparación usa ventanas iguales de 972 días; describe registros y no atribuye causas ni desempeño de gestión.',
  }),
  Object.freeze({
    code: 'sensitive_source_values_withheld',
    text: 'No se publican valores de instrumentos, observaciones, usuarios, documentos ni identificadores personales.',
  }),
  Object.freeze({
    code: 'source_labels_normalized',
    text: 'Las categorías usan una clasificación municipal versionada; no copian etiquetas libres del sistema legado.',
  }),
]);

const PERIODS = Object.freeze({
  current: Object.freeze({
    label: 'Gestión actual hasta el corte',
    startDate: '2023-12-09',
    endDate: '2026-08-06',
    days: 972,
  }),
  prior: Object.freeze({
    label: 'Mismo tiempo de la gestión anterior',
    startDate: '2019-12-09',
    endDate: '2022-08-06',
    days: 972,
  }),
});

const KEYS = Object.freeze({
  top: ['schemaVersion', 'source', 'privacy', 'metric', 'coverage', 'periods', 'comparison', 'categories', 'protectedBucket', 'classification', 'limits'],
  source: ['canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf', 'generatedAt', 'realtime', 'tables', 'firstValidDate', 'lastValidDate'],
  tables: ['actions', 'employment'],
  privacy: ['threshold', 'rule', 'aggregateOnly', 'containsPii', 'personIdentifiersExported', 'rawRowsExported', 'instrumentValuesExported', 'observationsExported', 'userValuesExported', 'rawCategoryValuesExported'],
  metric: ['eventUnit', 'participantUnit', 'effectiveDateMeaning', 'comparisonRule', 'classificationRuleVersion'],
  coverage: ['sourceRows', 'validRows', 'quarantineRows', 'matchedRows', 'orphanRows', 'distinctEmployeeKeys', 'validDateRatePct', 'joinIntegrityPct'],
  periods: ['current', 'prior'],
  period: ['label', 'startDate', 'endDate', 'days'],
  comparison: ['current', 'prior', 'deltas'],
  comparisonPeriod: ['privacyStatus', 'actionEvents', 'distinctPersons', 'actionsPerPerson', 'instrumentTypePresent', 'instrumentNumberPresent', 'sourceCategoryPresent', 'documentCodePresent'],
  comparisonDelta: ['actionEvents', 'distinctPersons', 'instrumentTypePresent', 'instrumentNumberPresent', 'sourceCategoryPresent', 'documentCodePresent', 'actionsPerPerson'],
  category: ['key', 'label', 'meaning', 'privacyStatus', 'current', 'prior', 'deltas'],
  categoryPeriod: ['events', 'persons'],
  protectedBucket: ['privacyStatus', 'label', 'categoryCount', 'current', 'prior', 'deltas'],
  classification: ['status', 'ruleVersion', 'categoryCount', 'releasedCategoryCount', 'protectedCategoryCount', 'totalWindowEvents', 'classifiedWindowEvents', 'coveragePct'],
  limit: ['code', 'text'],
});

const HEX_64 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const COMPARISON_COUNT_FIELDS = Object.freeze([
  'actionEvents',
  'distinctPersons',
  'instrumentTypePresent',
  'instrumentNumberPresent',
  'sourceCategoryPresent',
  'documentCodePresent',
]);

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index]);
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
  return denominator === 0 ? null : rounded(numerator / denominator);
}

function percentageRatio(numerator, denominator) {
  return denominator === 0 ? null : rounded((numerator / denominator) * 100);
}

function validDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function inclusiveDays(startDate, endDate) {
  if (!validDate(startDate) || !validDate(endDate)) return null;
  return Math.round((Date.parse(`${endDate}T00:00:00.000Z`) -
    Date.parse(`${startDate}T00:00:00.000Z`)) / 86_400_000) + 1;
}

function smallCell(value, threshold = 10) {
  return Number.isSafeInteger(value) && Math.abs(value) >= 1 && Math.abs(value) < threshold;
}

function add(errors, condition, code) {
  if (!condition) errors.push(code);
}

function validateCategoryPeriod(errors, value, path) {
  add(errors, exactKeys(value, KEYS.categoryPeriod), `${path}.structure`);
  add(errors, nonNegativeInteger(value?.events), `${path}.events`);
  add(errors, nonNegativeInteger(value?.persons), `${path}.persons`);
  add(errors, value?.persons <= value?.events, `${path}.persons_bound`);
}

function validateCategoryDeltas(errors, value, current, prior, path) {
  add(errors, exactKeys(value, KEYS.categoryPeriod), `${path}.structure`);
  for (const field of ['events', 'persons']) {
    add(errors, Number.isSafeInteger(value?.[field]), `${path}.${field}`);
    add(errors, value?.[field] === current?.[field] - prior?.[field], `${path}.${field}_identity`);
  }
}

function categoryPrivacyIsSafe(current, prior, deltas, threshold) {
  return ['events', 'persons'].every(field =>
    !smallCell(current?.[field], threshold) &&
    !smallCell(prior?.[field], threshold) &&
    !smallCell(deltas?.[field], threshold));
}

export function inspectGrhEmploymentActionsContract(value) {
  const errors = [];
  add(errors, exactKeys(value, KEYS.top), 'employment_actions.structure');
  add(errors, value?.schemaVersion === GRH_EMPLOYMENT_ACTIONS_SCHEMA_VERSION, 'schema.version');

  const source = value?.source;
  add(errors, exactKeys(source, KEYS.source), 'source.structure');
  add(errors, source?.canonicalSystem === 'GRH Junín', 'source.canonical_system');
  add(errors, source?.sourceFile === 'grh_junin.backup_2026080615_plataforma.sql.gz', 'source.file');
  add(errors, HEX_64.test(source?.sourceSha256 || ''), 'source.sha256');
  for (const field of ['snapshotAsOf', 'firstValidDate', 'lastValidDate']) {
    add(errors, validDate(source?.[field]), `source.${field}`);
  }
  add(errors, source?.snapshotAsOf === '2026-08-06', 'source.snapshot');
  add(errors, source?.generatedAt === GRH_EMPLOYMENT_ACTIONS_GENERATED_AT, 'source.generated_at');
  add(errors, source?.realtime === false, 'source.realtime');
  add(errors, exactKeys(source?.tables, KEYS.tables), 'source.tables.structure');
  add(errors, source?.tables?.actions === 'foja', 'source.tables.actions');
  add(errors, source?.tables?.employment === 'legajo', 'source.tables.employment');
  add(errors, source?.firstValidDate <= source?.lastValidDate, 'source.date_order');
  add(errors, source?.lastValidDate <= source?.snapshotAsOf, 'source.before_snapshot');

  const privacy = value?.privacy;
  add(errors, exactKeys(privacy, KEYS.privacy), 'privacy.structure');
  add(errors, privacy?.threshold === 10, 'privacy.threshold');
  add(errors, privacy?.rule === GRH_EMPLOYMENT_ACTIONS_PRIVACY_RULE, 'privacy.rule');
  add(errors, privacy?.aggregateOnly === true, 'privacy.aggregate_only');
  for (const field of [
    'containsPii',
    'personIdentifiersExported',
    'rawRowsExported',
    'instrumentValuesExported',
    'observationsExported',
    'userValuesExported',
    'rawCategoryValuesExported',
  ]) {
    add(errors, privacy?.[field] === false, `privacy.${field}`);
  }

  const metric = value?.metric;
  add(errors, exactKeys(metric, KEYS.metric), 'metric.structure');
  add(errors, metric?.eventUnit === 'actuación documentada en GRH.foja', 'metric.event_unit');
  add(errors, metric?.participantUnit === 'persona GRH distinta enlazada por legajo con al menos una actuación', 'metric.participant_unit');
  add(errors, metric?.effectiveDateMeaning === 'fecha efectiva informada en FECH_FJ', 'metric.effective_date');
  add(errors, metric?.comparisonRule === 'dos ventanas inclusivas de 972 días con el mismo mes y día de corte', 'metric.comparison_rule');
  add(errors, metric?.classificationRuleVersion === GRH_EMPLOYMENT_ACTIONS_CLASSIFICATION_RULE_VERSION, 'metric.classification_rule');

  const coverage = value?.coverage;
  add(errors, exactKeys(coverage, KEYS.coverage), 'coverage.structure');
  for (const field of ['sourceRows', 'validRows', 'quarantineRows', 'matchedRows', 'orphanRows', 'distinctEmployeeKeys']) {
    add(errors, nonNegativeInteger(coverage?.[field]), `coverage.${field}`);
  }
  add(errors, coverage?.sourceRows > 0, 'coverage.source_rows_positive');
  add(errors, coverage?.validRows + coverage?.quarantineRows === coverage?.sourceRows, 'coverage.date_identity');
  add(errors, coverage?.matchedRows + coverage?.orphanRows === coverage?.sourceRows, 'coverage.join_identity');
  add(errors, coverage?.distinctEmployeeKeys > 0 && coverage?.distinctEmployeeKeys <= coverage?.matchedRows, 'coverage.employee_key_bound');
  add(errors, percentage(coverage?.validDateRatePct), 'coverage.valid_date_rate');
  add(errors, percentage(coverage?.joinIntegrityPct), 'coverage.join_integrity');
  add(errors, coverage?.validDateRatePct === percentageRatio(coverage?.validRows, coverage?.sourceRows), 'coverage.valid_date_rate_identity');
  add(errors, coverage?.joinIntegrityPct === percentageRatio(coverage?.matchedRows, coverage?.sourceRows), 'coverage.join_integrity_identity');

  const periods = value?.periods;
  add(errors, exactKeys(periods, KEYS.periods), 'periods.structure');
  for (const periodKey of ['current', 'prior']) {
    const period = periods?.[periodKey];
    const expected = PERIODS[periodKey];
    add(errors, exactKeys(period, KEYS.period), `periods.${periodKey}.structure`);
    for (const field of KEYS.period) {
      add(errors, period?.[field] === expected[field], `periods.${periodKey}.${field}`);
    }
    add(errors, period?.days === inclusiveDays(period?.startDate, period?.endDate), `periods.${periodKey}.inclusive_days`);
  }
  add(errors, periods?.current?.days === periods?.prior?.days, 'periods.equal_duration');
  add(errors, periods?.current?.endDate === source?.snapshotAsOf, 'periods.current_cut_identity');

  const comparison = value?.comparison;
  add(errors, exactKeys(comparison, KEYS.comparison), 'comparison.structure');
  for (const periodKey of ['current', 'prior']) {
    const period = comparison?.[periodKey];
    add(errors, exactKeys(period, KEYS.comparisonPeriod), `comparison.${periodKey}.structure`);
    add(errors, period?.privacyStatus === 'released', `comparison.${periodKey}.privacy_status`);
    for (const field of COMPARISON_COUNT_FIELDS) {
      add(errors, nonNegativeInteger(period?.[field]), `comparison.${periodKey}.${field}`);
    }
    add(errors, period?.actionEvents > 0, `comparison.${periodKey}.events_positive`);
    add(errors, period?.distinctPersons > 0 && period?.distinctPersons <= period?.actionEvents, `comparison.${periodKey}.persons_bound`);
    for (const field of ['instrumentTypePresent', 'instrumentNumberPresent', 'sourceCategoryPresent', 'documentCodePresent']) {
      add(errors, period?.[field] <= period?.actionEvents, `comparison.${periodKey}.${field}_bound`);
    }
    add(errors, period?.actionsPerPerson === ratio(period?.actionEvents, period?.distinctPersons), `comparison.${periodKey}.ratio_identity`);
  }
  const comparisonDeltas = comparison?.deltas;
  add(errors, exactKeys(comparisonDeltas, KEYS.comparisonDelta), 'comparison.deltas.structure');
  for (const field of COMPARISON_COUNT_FIELDS) {
    add(errors, Number.isSafeInteger(comparisonDeltas?.[field]), `comparison.deltas.${field}`);
    add(errors, comparisonDeltas?.[field] === comparison?.current?.[field] - comparison?.prior?.[field], `comparison.deltas.${field}_identity`);
  }
  const currentRatio = comparison?.current?.actionsPerPerson;
  const priorRatio = comparison?.prior?.actionsPerPerson;
  const expectedRatioDelta = Number.isFinite(currentRatio) && Number.isFinite(priorRatio)
    ? rounded(currentRatio - priorRatio)
    : null;
  add(errors, comparisonDeltas?.actionsPerPerson === expectedRatioDelta, 'comparison.deltas.actions_per_person_identity');

  const categories = Array.isArray(value?.categories) ? value.categories : [];
  add(errors, categories.length === GRH_EMPLOYMENT_ACTIONS_RELEASED_CATEGORIES.length, 'categories.length');
  categories.forEach((category, index) => {
    const path = `categories.${index}`;
    const expected = GRH_EMPLOYMENT_ACTIONS_RELEASED_CATEGORIES[index];
    add(errors, exactKeys(category, KEYS.category), `${path}.structure`);
    add(errors, category?.key === expected?.key, `${path}.key`);
    add(errors, category?.label === expected?.label, `${path}.label`);
    add(errors, category?.meaning === expected?.meaning, `${path}.meaning`);
    add(errors, category?.privacyStatus === 'released', `${path}.privacy_status`);
    validateCategoryPeriod(errors, category?.current, `${path}.current`);
    validateCategoryPeriod(errors, category?.prior, `${path}.prior`);
    validateCategoryDeltas(errors, category?.deltas, category?.current, category?.prior, `${path}.deltas`);
    add(
      errors,
      categoryPrivacyIsSafe(category?.current, category?.prior, category?.deltas, privacy?.threshold),
      `${path}.privacy_threshold`,
    );
  });

  const bucket = value?.protectedBucket;
  add(errors, exactKeys(bucket, KEYS.protectedBucket), 'protected_bucket.structure');
  add(errors, bucket?.privacyStatus === 'protected', 'protected_bucket.privacy_status');
  add(errors, bucket?.label === 'Otras actuaciones protegidas', 'protected_bucket.label');
  add(errors, Number.isSafeInteger(bucket?.categoryCount) && bucket.categoryCount >= 2, 'protected_bucket.category_count');
  validateCategoryPeriod(errors, bucket?.current, 'protected_bucket.current');
  validateCategoryPeriod(errors, bucket?.prior, 'protected_bucket.prior');
  validateCategoryDeltas(errors, bucket?.deltas, bucket?.current, bucket?.prior, 'protected_bucket.deltas');
  add(
    errors,
    categoryPrivacyIsSafe(bucket?.current, bucket?.prior, bucket?.deltas, privacy?.threshold),
    'protected_bucket.publishable_aggregate',
  );

  for (const periodKey of ['current', 'prior']) {
    const publishedEvents = categories.reduce(
      (sum, category) => sum + (category?.[periodKey]?.events || 0),
      bucket?.[periodKey]?.events || 0,
    );
    add(errors, publishedEvents === comparison?.[periodKey]?.actionEvents, `categories.${periodKey}_event_identity`);
  }
  const publishedDeltaEvents = categories.reduce(
    (sum, category) => sum + (category?.deltas?.events || 0),
    bucket?.deltas?.events || 0,
  );
  add(errors, publishedDeltaEvents === comparisonDeltas?.actionEvents, 'categories.delta_event_identity');

  const classification = value?.classification;
  add(errors, exactKeys(classification, KEYS.classification), 'classification.structure');
  add(errors, classification?.status === 'exhaustive_governed_mapping', 'classification.status');
  add(errors, classification?.ruleVersion === GRH_EMPLOYMENT_ACTIONS_CLASSIFICATION_RULE_VERSION, 'classification.rule_version');
  for (const field of ['categoryCount', 'releasedCategoryCount', 'protectedCategoryCount', 'totalWindowEvents', 'classifiedWindowEvents']) {
    add(errors, nonNegativeInteger(classification?.[field]), `classification.${field}`);
  }
  add(errors, classification?.releasedCategoryCount === categories.length, 'classification.released_count_identity');
  add(errors, classification?.protectedCategoryCount === bucket?.categoryCount, 'classification.protected_count_identity');
  add(errors, classification?.categoryCount === classification?.releasedCategoryCount + classification?.protectedCategoryCount, 'classification.category_count_identity');
  add(errors, classification?.totalWindowEvents === comparison?.current?.actionEvents + comparison?.prior?.actionEvents, 'classification.window_event_identity');
  add(errors, classification?.classifiedWindowEvents === classification?.totalWindowEvents, 'classification.classified_event_identity');
  add(errors, classification?.coveragePct === 100, 'classification.coverage');

  const limits = Array.isArray(value?.limits) ? value.limits : [];
  add(errors, limits.length === GRH_EMPLOYMENT_ACTIONS_LIMITS.length, 'limits.length');
  limits.forEach((limit, index) => {
    const expected = GRH_EMPLOYMENT_ACTIONS_LIMITS[index];
    add(errors, exactKeys(limit, KEYS.limit), `limits.${index}.structure`);
    add(errors, limit?.code === expected?.code && limit?.text === expected?.text, `limits.${index}.identity`);
  });

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze([...new Set(errors)]),
  });
}

export function validateGrhEmploymentActionsContract(value) {
  return inspectGrhEmploymentActionsContract(value).ok;
}
