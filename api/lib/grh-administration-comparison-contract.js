export const GRH_ADMINISTRATION_COMPARISON_SCHEMA_VERSION =
  'grh-administration-comparison-v1';
export const GRH_ADMINISTRATION_COMPARISON_THRESHOLD = 10;
export const GRH_ADMINISTRATION_COMPARISON_PRIVACY_RULE =
  'protect_each_analytical_block_when_any_published_count_or_absolute_difference_is_1_to_9';

export const GRH_ADMINISTRATION_COMPARISON_PERIODS = Object.freeze({
  current: Object.freeze({
    label: 'Tramo actual de gestión',
    startDate: '2023-12-09',
    endDate: '2026-08-06',
    days: 972,
  }),
  prior: Object.freeze({
    label: 'Mismo tramo, cuatro años antes',
    startDate: '2019-12-09',
    endDate: '2022-08-06',
    days: 972,
  }),
});

export const GRH_ADMINISTRATION_COMPARISON_DEFINITIONS = Object.freeze({
  absence: Object.freeze({
    key: 'reported_absence',
    label: 'Ausencias informadas',
    meaning: 'Compara registros de ausencia, personas distintas alcanzadas y días informados en dos tramos calendario iguales.',
    metrics: Object.freeze({
      eventRows: 'Registros de ausencia',
      distinctPeople: 'Personas distintas con ausencias',
      reportedDays: 'Días informados en los registros',
      knownEventRows: 'Registros con días informados',
      missingEventRows: 'Registros sin días informados',
    }),
  }),
  reportedIngressDates: Object.freeze({
    key: 'reported_ingress_dates',
    label: 'Fechas de ingreso informadas',
    meaning: 'Cuenta legajos cuya fecha de ingreso informada cae dentro de cada tramo; no prueba altas de personal.',
  }),
  reportedExitDates: Object.freeze({
    key: 'reported_exit_dates',
    label: 'Fechas de egreso informadas',
    meaning: 'Cuenta legajos cuya fecha de egreso informada cae dentro de cada tramo; no prueba bajas de personal.',
  }),
});

export const GRH_ADMINISTRATION_COMPARISON_LIMITS = Object.freeze([
  Object.freeze({
    code: 'historical_snapshot_not_realtime',
    text: 'La lectura corresponde al respaldo histórico del 6 de agosto de 2026; no es tiempo real.',
  }),
  Object.freeze({
    code: 'equal_calendar_spans_not_causal_attribution',
    text: 'Compara dos tramos calendario iguales de 972 días; las diferencias no explican causas ni atribuyen resultados a una gestión.',
  }),
  Object.freeze({
    code: 'absence_rows_not_performance',
    text: 'Los registros de ausencia no miden desempeño ni impacto operativo y no incluyen sus causas.',
  }),
  Object.freeze({
    code: 'reported_days_have_explicit_coverage',
    text: 'Los días suman sólo valores informados; los registros con días conocidos y faltantes se muestran por separado.',
  }),
  Object.freeze({
    code: 'reported_dates_not_staffing_actions',
    text: 'Las fechas informadas no acreditan altas, bajas, dotación activa, pagos ni decisiones administrativas.',
  }),
  Object.freeze({
    code: 'counts_not_rates',
    text: 'La comparación publica conteos agregados; no calcula tasas ni porcentajes.',
  }),
]);

const TOP_KEYS = Object.freeze([
  'schemaVersion',
  'source',
  'privacy',
  'periods',
  'comparison',
  'limits',
]);
const SOURCE_KEYS = Object.freeze([
  'schemaVersion',
  'canonicalSystem',
  'sourceSha256',
  'contentSha256',
  'snapshotAsOf',
]);
const PRIVACY_KEYS = Object.freeze([
  'audience',
  'threshold',
  'status',
  'aggregateOnly',
  'containsPii',
  'personIdentifiersExported',
  'rawRowsExported',
  'causeLabelsExported',
  'rule',
]);
const PERIODS_KEYS = Object.freeze(['current', 'prior']);
const PERIOD_KEYS = Object.freeze(['label', 'startDate', 'endDate', 'days']);
const COMPARISON_KEYS = Object.freeze([
  'absence',
  'reportedIngressDates',
  'reportedExitDates',
]);
const ABSENCE_KEYS = Object.freeze([
  'key',
  'label',
  'meaning',
  'privacyStatus',
  'eventRows',
  'distinctPeople',
  'reportedDays',
  'dayCoverage',
]);
const METRIC_KEYS = Object.freeze(['label', 'values']);
const COVERAGE_KEYS = Object.freeze(['knownEventRows', 'missingEventRows']);
const DATE_ROW_KEYS = Object.freeze(['key', 'label', 'meaning', 'privacyStatus', 'values']);
const VALUES_KEYS = Object.freeze(['current', 'prior', 'difference']);
const LIMIT_KEYS = Object.freeze(['code', 'text']);
const HEX_64 = /^[0-9a-f]{64}$/;

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function add(errors, condition, code) {
  if (!condition) errors.push(code);
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function signedInteger(value) {
  return Number.isSafeInteger(value);
}

function smallCell(value) {
  return Number.isSafeInteger(value) && Math.abs(value) > 0 &&
    Math.abs(value) < GRH_ADMINISTRATION_COMPARISON_THRESHOLD;
}

function exactDefinition(value, definition) {
  return value?.key === definition.key &&
    value?.label === definition.label &&
    value?.meaning === definition.meaning;
}

function inspectValues(errors, values, path, privacyStatus) {
  add(errors, exactKeys(values, VALUES_KEYS), `${path}.structure`);
  if (privacyStatus === 'protected') {
    for (const key of VALUES_KEYS) add(errors, values?.[key] === null, `${path}.${key}.protected`);
    return;
  }
  add(errors, nonNegativeInteger(values?.current), `${path}.current`);
  add(errors, nonNegativeInteger(values?.prior), `${path}.prior`);
  add(errors, signedInteger(values?.difference), `${path}.difference`);
  add(errors, values?.difference === values?.current - values?.prior, `${path}.identity`);
}

function inspectMetric(errors, metric, definition, path, privacyStatus) {
  add(errors, exactKeys(metric, METRIC_KEYS), `${path}.structure`);
  add(errors, metric?.label === definition, `${path}.label`);
  inspectValues(errors, metric?.values, `${path}.values`, privacyStatus);
}

function inspectAbsence(errors, absence, audience) {
  const definition = GRH_ADMINISTRATION_COMPARISON_DEFINITIONS.absence;
  add(errors, exactKeys(absence, ABSENCE_KEYS), 'comparison.absence.structure');
  add(errors, exactDefinition(absence, definition), 'comparison.absence.definition');
  add(errors, ['released', 'protected'].includes(absence?.privacyStatus),
    'comparison.absence.privacy_status');
  const privacyStatus = absence?.privacyStatus;
  inspectMetric(errors, absence?.eventRows, definition.metrics.eventRows,
    'comparison.absence.event_rows', privacyStatus);
  inspectMetric(errors, absence?.distinctPeople, definition.metrics.distinctPeople,
    'comparison.absence.distinct_people', privacyStatus);
  inspectMetric(errors, absence?.reportedDays, definition.metrics.reportedDays,
    'comparison.absence.reported_days', privacyStatus);
  add(errors, exactKeys(absence?.dayCoverage, COVERAGE_KEYS),
    'comparison.absence.day_coverage.structure');
  inspectMetric(errors, absence?.dayCoverage?.knownEventRows, definition.metrics.knownEventRows,
    'comparison.absence.day_coverage.known', privacyStatus);
  inspectMetric(errors, absence?.dayCoverage?.missingEventRows, definition.metrics.missingEventRows,
    'comparison.absence.day_coverage.missing', privacyStatus);

  if (privacyStatus === 'released') {
    for (const period of ['current', 'prior']) {
      const events = absence?.eventRows?.values?.[period];
      const people = absence?.distinctPeople?.values?.[period];
      const known = absence?.dayCoverage?.knownEventRows?.values?.[period];
      const missing = absence?.dayCoverage?.missingEventRows?.values?.[period];
      add(errors, nonNegativeInteger(events) && nonNegativeInteger(people) && people <= events,
        `comparison.absence.${period}.people_identity`);
      add(errors, nonNegativeInteger(known) && nonNegativeInteger(missing) && known + missing === events,
        `comparison.absence.${period}.coverage_identity`);
      add(errors, missing === 0, `comparison.absence.${period}.reported_days_complete`);
    }
    if (audience === 'portable') {
      const metrics = [
        absence?.eventRows,
        absence?.distinctPeople,
        absence?.reportedDays,
        absence?.dayCoverage?.knownEventRows,
        absence?.dayCoverage?.missingEventRows,
      ];
      for (const [index, metric] of metrics.entries()) {
        add(errors, VALUES_KEYS.every(key => !smallCell(metric?.values?.[key])),
          `comparison.absence.metrics.${index}.small_cell`);
      }
    }
  }
}

function inspectDateRow(errors, row, definition, path, audience) {
  add(errors, exactKeys(row, DATE_ROW_KEYS), `${path}.structure`);
  add(errors, exactDefinition(row, definition), `${path}.definition`);
  add(errors, ['released', 'protected'].includes(row?.privacyStatus), `${path}.privacy_status`);
  inspectValues(errors, row?.values, `${path}.values`, row?.privacyStatus);
  if (audience === 'portable' && row?.privacyStatus === 'released') {
    add(errors, VALUES_KEYS.every(key => !smallCell(row?.values?.[key])), `${path}.small_cell`);
  }
}

export function inspectGrhAdministrationComparisonContract(value) {
  const errors = [];
  add(errors, exactKeys(value, TOP_KEYS), 'comparison.structure');
  add(errors, value?.schemaVersion === GRH_ADMINISTRATION_COMPARISON_SCHEMA_VERSION,
    'schema.version');

  add(errors, exactKeys(value?.source, SOURCE_KEYS), 'source.structure');
  add(errors, value?.source?.schemaVersion === 'grh-directory-v3', 'source.schema_version');
  add(errors, typeof value?.source?.canonicalSystem === 'string' &&
    value.source.canonicalSystem.length > 0 && value.source.canonicalSystem.length <= 120,
  'source.canonical_system');
  add(errors, HEX_64.test(value?.source?.sourceSha256 || ''), 'source.sha256');
  add(errors, HEX_64.test(value?.source?.contentSha256 || ''), 'source.content_sha256');
  add(errors, value?.source?.snapshotAsOf === GRH_ADMINISTRATION_COMPARISON_PERIODS.current.endDate,
    'source.snapshot_as_of');

  const privacy = value?.privacy;
  add(errors, exactKeys(privacy, PRIVACY_KEYS), 'privacy.structure');
  add(errors, ['private', 'portable'].includes(privacy?.audience), 'privacy.audience');
  add(errors, privacy?.threshold === GRH_ADMINISTRATION_COMPARISON_THRESHOLD, 'privacy.threshold');
  add(errors, ['released', 'partially_protected', 'protected'].includes(privacy?.status),
    'privacy.status');
  add(errors, privacy?.aggregateOnly === true, 'privacy.aggregate_only');
  add(errors, privacy?.containsPii === false, 'privacy.contains_pii');
  add(errors, privacy?.personIdentifiersExported === false, 'privacy.identifiers');
  add(errors, privacy?.rawRowsExported === false, 'privacy.raw_rows');
  add(errors, privacy?.causeLabelsExported === false, 'privacy.causes');
  add(errors, privacy?.rule === GRH_ADMINISTRATION_COMPARISON_PRIVACY_RULE, 'privacy.rule');

  add(errors, exactKeys(value?.periods, PERIODS_KEYS), 'periods.structure');
  for (const key of PERIODS_KEYS) {
    add(errors, exactKeys(value?.periods?.[key], PERIOD_KEYS), `periods.${key}.structure`);
    const period = value?.periods?.[key];
    const expectedPeriod = GRH_ADMINISTRATION_COMPARISON_PERIODS[key];
    add(errors, PERIOD_KEYS.every(field => period?.[field] === expectedPeriod[field]),
      `periods.${key}.identity`);
  }

  add(errors, exactKeys(value?.comparison, COMPARISON_KEYS), 'comparison.blocks');
  inspectAbsence(errors, value?.comparison?.absence, privacy?.audience);
  inspectDateRow(
    errors,
    value?.comparison?.reportedIngressDates,
    GRH_ADMINISTRATION_COMPARISON_DEFINITIONS.reportedIngressDates,
    'comparison.reported_ingress_dates',
    privacy?.audience,
  );
  inspectDateRow(
    errors,
    value?.comparison?.reportedExitDates,
    GRH_ADMINISTRATION_COMPARISON_DEFINITIONS.reportedExitDates,
    'comparison.reported_exit_dates',
    privacy?.audience,
  );

  const blocks = [
    value?.comparison?.absence,
    value?.comparison?.reportedIngressDates,
    value?.comparison?.reportedExitDates,
  ];
  const protectedBlocks = blocks.filter(block => block?.privacyStatus === 'protected').length;
  const expectedPrivacyStatus = protectedBlocks === 0
    ? 'released'
    : protectedBlocks === blocks.length ? 'protected' : 'partially_protected';
  add(errors, privacy?.status === expectedPrivacyStatus, 'privacy.status_identity');
  add(errors, privacy?.audience !== 'private' || protectedBlocks === 0, 'privacy.private_exact');

  add(errors, Array.isArray(value?.limits) &&
    value.limits.length === GRH_ADMINISTRATION_COMPARISON_LIMITS.length, 'limits.length');
  const limits = Array.isArray(value?.limits) ? value.limits : [];
  limits.forEach((limit, index) => {
    add(errors, exactKeys(limit, LIMIT_KEYS), `limits.${index}.structure`);
    const expectedLimit = GRH_ADMINISTRATION_COMPARISON_LIMITS[index];
    add(errors, limit?.code === expectedLimit?.code && limit?.text === expectedLimit?.text,
      `limits.${index}.identity`);
  });

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze([...new Set(errors)]),
  });
}

export function validateGrhAdministrationComparisonContract(value) {
  return inspectGrhAdministrationComparisonContract(value).ok;
}
