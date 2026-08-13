export const GRH_ABSENCE_INSIGHTS_SCHEMA_VERSION = 'grh-absence-insights-v1';
export const GRH_ABSENCE_INSIGHTS_PRIVACY_THRESHOLD = 10;
export const GRH_ABSENCE_INSIGHTS_GENERATED_AT = '2026-08-13T00:00:00.000Z';

export const GRH_ABSENCE_INSIGHTS_PERIODS = Object.freeze({
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

export const GRH_ABSENCE_INSIGHTS_LIMITS = Object.freeze([
  Object.freeze({
    code: 'historical_snapshot_not_realtime',
    text: 'La información corresponde al respaldo del 6 de agosto de 2026; no se actualiza en tiempo real.',
  }),
  Object.freeze({
    code: 'absence_records_not_all_leave',
    text: 'Estos son registros de ausencia. No todos representan una licencia y no describen por sí solos la situación laboral de una persona.',
  }),
  Object.freeze({
    code: 'legacy_leave_kept_separate',
    text: 'La tabla histórica de licencias se mantiene separada y no se suma a estos motivos de ausencia.',
  }),
  Object.freeze({
    code: 'equal_periods_not_causes',
    text: 'La comparación usa dos períodos de 972 días. Muestra diferencias registradas, pero no explica sus causas ni evalúa gestiones.',
  }),
  Object.freeze({
    code: 'small_groups_are_combined',
    text: 'Los motivos con menos de 10 personas se reúnen en Otros motivos para evitar identificar situaciones individuales.',
  }),
]);

const TOP_KEYS = Object.freeze([
  'schemaVersion', 'source', 'privacy', 'summary', 'periods', 'comparison',
  'categories', 'protectedBucket', 'coverage', 'limits',
]);
const SOURCE_KEYS = Object.freeze([
  'canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf',
  'generatedAt', 'realtime', 'tables',
]);
const TABLE_KEYS = Object.freeze(['absenceRecords', 'absenceReasons', 'historicalLeave']);
const PRIVACY_KEYS = Object.freeze([
  'status', 'threshold', 'aggregateOnly', 'containsPii',
  'personIdentifiersExported', 'rawRowsExported', 'sourceCauseLabelsExported',
]);
const SUMMARY_KEYS = Object.freeze([
  'rawAbsenceRows', 'validAbsenceRows', 'quarantinedRows',
  'validReportedDays', 'motiveCatalogEntries',
]);
const PERIODS_KEYS = Object.freeze(['current', 'prior']);
const PERIOD_KEYS = Object.freeze(['label', 'startDate', 'endDate', 'days']);
const COMPARISON_KEYS = Object.freeze(['current', 'prior', 'deltas']);
const VALUES_KEYS = Object.freeze(['events', 'people', 'days']);
const CATEGORY_KEYS = Object.freeze(['key', 'label', 'meaning', 'current', 'prior', 'deltas']);
const PERIOD_METRIC_KEYS = Object.freeze(['privacyStatus', 'events', 'people', 'days']);
const BUCKET_KEYS = Object.freeze(['key', 'label', 'meaning', 'current', 'prior', 'deltas']);
const COVERAGE_KEYS = Object.freeze(['current', 'prior']);
const COVERAGE_PERIOD_KEYS = Object.freeze([
  'totalEvents', 'publishedCategoryEvents', 'protectedEvents', 'coveragePct',
]);
const LIMIT_KEYS = Object.freeze(['code', 'text']);
const HEX_64 = /^[0-9a-f]{64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

function visibleText(value, maximum = 180) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 &&
    value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
}

function inspectValues(errors, value, path, { signed = false } = {}) {
  add(errors, exactKeys(value, VALUES_KEYS), `${path}.structure`);
  for (const key of VALUES_KEYS) {
    add(errors, signed ? signedInteger(value?.[key]) : nonNegativeInteger(value?.[key]), `${path}.${key}`);
  }
  if (!signed) add(errors, value?.people <= value?.events, `${path}.people_not_events`);
}

function inspectPeriodMetric(errors, value, path) {
  add(errors, exactKeys(value, PERIOD_METRIC_KEYS), `${path}.structure`);
  add(errors, ['released', 'protected'].includes(value?.privacyStatus), `${path}.privacy_status`);
  if (value?.privacyStatus === 'protected') {
    for (const key of VALUES_KEYS) add(errors, value?.[key] === null, `${path}.${key}.protected`);
    return;
  }
  for (const key of VALUES_KEYS) add(errors, nonNegativeInteger(value?.[key]), `${path}.${key}`);
  add(errors, value?.people <= value?.events, `${path}.people_not_events`);
  add(
    errors,
    value?.people === 0 || value?.people >= GRH_ABSENCE_INSIGHTS_PRIVACY_THRESHOLD,
    `${path}.small_cell`,
  );
}

function inspectDelta(errors, delta, current, prior, path) {
  add(errors, exactKeys(delta, VALUES_KEYS), `${path}.structure`);
  const released = current?.privacyStatus === 'released' && prior?.privacyStatus === 'released';
  for (const key of VALUES_KEYS) {
    if (released) {
      add(errors, signedInteger(delta?.[key]), `${path}.${key}`);
      add(errors, delta?.[key] === current?.[key] - prior?.[key], `${path}.${key}.identity`);
    } else {
      add(errors, delta?.[key] === null, `${path}.${key}.protected`);
    }
  }
}

function inspectCategory(errors, category, index) {
  const path = `categories.${index}`;
  add(errors, exactKeys(category, CATEGORY_KEYS), `${path}.structure`);
  add(errors, /^reason_\d{2}$/.test(category?.key || ''), `${path}.key`);
  add(errors, visibleText(category?.label, 100), `${path}.label`);
  add(
    errors,
    category?.meaning === 'Motivo del catálogo municipal aplicado a registros de ausencia.',
    `${path}.meaning`,
  );
  inspectPeriodMetric(errors, category?.current, `${path}.current`);
  inspectPeriodMetric(errors, category?.prior, `${path}.prior`);
  inspectDelta(errors, category?.deltas, category?.current, category?.prior, `${path}.deltas`);
  add(
    errors,
    category?.current?.privacyStatus === 'released' || category?.prior?.privacyStatus === 'released',
    `${path}.fully_protected`,
  );
}

export function inspectGrhAbsenceInsightsContract(value) {
  const errors = [];
  add(errors, exactKeys(value, TOP_KEYS), 'absence_insights.structure');
  add(errors, value?.schemaVersion === GRH_ABSENCE_INSIGHTS_SCHEMA_VERSION, 'schema.version');

  const source = value?.source;
  add(errors, exactKeys(source, SOURCE_KEYS), 'source.structure');
  add(errors, source?.canonicalSystem === 'GRH Junín', 'source.canonical_system');
  add(errors, source?.sourceFile === 'grh_junin.backup_2026080615_plataforma.sql.gz', 'source.file');
  add(errors, HEX_64.test(source?.sourceSha256 || ''), 'source.sha256');
  add(errors, source?.snapshotAsOf === GRH_ABSENCE_INSIGHTS_PERIODS.current.endDate, 'source.snapshot');
  add(errors, source?.generatedAt === GRH_ABSENCE_INSIGHTS_GENERATED_AT, 'source.generated_at');
  add(errors, source?.generatedAt?.slice(0, 10) >= source?.snapshotAsOf, 'source.generated_after_snapshot');
  add(errors, source?.realtime === false, 'source.realtime');
  add(errors, exactKeys(source?.tables, TABLE_KEYS), 'source.tables.structure');
  add(errors, source?.tables?.absenceRecords === 'ausencia', 'source.tables.absence');
  add(errors, source?.tables?.absenceReasons === 'motause', 'source.tables.reasons');
  add(errors, source?.tables?.historicalLeave === 'licencia', 'source.tables.leave');

  const privacy = value?.privacy;
  add(errors, exactKeys(privacy, PRIVACY_KEYS), 'privacy.structure');
  add(errors, privacy?.status === 'released_with_protected_bucket', 'privacy.status');
  add(errors, privacy?.threshold === GRH_ABSENCE_INSIGHTS_PRIVACY_THRESHOLD, 'privacy.threshold');
  add(errors, privacy?.aggregateOnly === true, 'privacy.aggregate_only');
  add(errors, privacy?.containsPii === false, 'privacy.contains_pii');
  add(errors, privacy?.personIdentifiersExported === false, 'privacy.identifiers');
  add(errors, privacy?.rawRowsExported === false, 'privacy.raw_rows');
  add(errors, privacy?.sourceCauseLabelsExported === false, 'privacy.source_labels');

  const summary = value?.summary;
  add(errors, exactKeys(summary, SUMMARY_KEYS), 'summary.structure');
  for (const key of SUMMARY_KEYS) add(errors, nonNegativeInteger(summary?.[key]), `summary.${key}`);
  add(
    errors,
    summary?.rawAbsenceRows === summary?.validAbsenceRows + summary?.quarantinedRows,
    'summary.row_identity',
  );
  add(errors, summary?.motiveCatalogEntries >= value?.categories?.length, 'summary.catalog_coverage');

  add(errors, exactKeys(value?.periods, PERIODS_KEYS), 'periods.structure');
  for (const key of PERIODS_KEYS) {
    const period = value?.periods?.[key];
    const expected = GRH_ABSENCE_INSIGHTS_PERIODS[key];
    add(errors, exactKeys(period, PERIOD_KEYS), `periods.${key}.structure`);
    add(errors, PERIOD_KEYS.every(field => period?.[field] === expected[field]), `periods.${key}.identity`);
    add(errors, DATE_RE.test(period?.startDate || '') && DATE_RE.test(period?.endDate || ''), `periods.${key}.dates`);
  }

  add(errors, exactKeys(value?.comparison, COMPARISON_KEYS), 'comparison.structure');
  inspectValues(errors, value?.comparison?.current, 'comparison.current');
  inspectValues(errors, value?.comparison?.prior, 'comparison.prior');
  inspectValues(errors, value?.comparison?.deltas, 'comparison.deltas', { signed: true });
  for (const key of VALUES_KEYS) {
    add(
      errors,
      value?.comparison?.deltas?.[key] ===
        value?.comparison?.current?.[key] - value?.comparison?.prior?.[key],
      `comparison.deltas.${key}.identity`,
    );
  }

  add(errors, Array.isArray(value?.categories) && value.categories.length > 0, 'categories.array');
  const categories = Array.isArray(value?.categories) ? value.categories : [];
  categories.forEach((category, index) => inspectCategory(errors, category, index));
  add(errors, new Set(categories.map(category => category?.key)).size === categories.length, 'categories.unique_keys');
  add(
    errors,
    categories.every((category, index) => index === 0 || category.key > categories[index - 1].key),
    'categories.order',
  );

  const bucket = value?.protectedBucket;
  add(errors, exactKeys(bucket, BUCKET_KEYS), 'protected_bucket.structure');
  add(errors, bucket?.key === 'other_protected_motives', 'protected_bucket.key');
  add(errors, bucket?.label === 'Otros motivos', 'protected_bucket.label');
  add(
    errors,
    bucket?.meaning === 'Suma de motivos que, por separado, alcanzan a menos de 10 personas.',
    'protected_bucket.meaning',
  );
  inspectPeriodMetric(errors, bucket?.current, 'protected_bucket.current');
  inspectPeriodMetric(errors, bucket?.prior, 'protected_bucket.prior');
  add(errors, bucket?.current?.privacyStatus === 'released', 'protected_bucket.current.released');
  add(errors, bucket?.prior?.privacyStatus === 'released', 'protected_bucket.prior.released');
  inspectDelta(errors, bucket?.deltas, bucket?.current, bucket?.prior, 'protected_bucket.deltas');

  add(errors, exactKeys(value?.coverage, COVERAGE_KEYS), 'coverage.structure');
  for (const periodKey of PERIODS_KEYS) {
    const coverage = value?.coverage?.[periodKey];
    add(errors, exactKeys(coverage, COVERAGE_PERIOD_KEYS), `coverage.${periodKey}.structure`);
    for (const key of COVERAGE_PERIOD_KEYS) {
      add(errors, nonNegativeInteger(coverage?.[key]), `coverage.${periodKey}.${key}`);
    }
    add(errors, coverage?.coveragePct === 100, `coverage.${periodKey}.percentage`);
    add(
      errors,
      coverage?.totalEvents === coverage?.publishedCategoryEvents + coverage?.protectedEvents,
      `coverage.${periodKey}.identity`,
    );
    add(
      errors,
      coverage?.totalEvents === value?.comparison?.[periodKey]?.events,
      `coverage.${periodKey}.comparison_identity`,
    );
    add(
      errors,
      coverage?.protectedEvents === bucket?.[periodKey]?.events,
      `coverage.${periodKey}.protected_identity`,
    );
    const releasedEvents = categories.reduce((total, category) => (
      category?.[periodKey]?.privacyStatus === 'released'
        ? total + category[periodKey].events
        : total
    ), 0);
    add(
      errors,
      releasedEvents === coverage?.publishedCategoryEvents,
      `coverage.${periodKey}.published_identity`,
    );
  }

  add(
    errors,
    Array.isArray(value?.limits) && value.limits.length === GRH_ABSENCE_INSIGHTS_LIMITS.length,
    'limits.length',
  );
  const limits = Array.isArray(value?.limits) ? value.limits : [];
  limits.forEach((limit, index) => {
    add(errors, exactKeys(limit, LIMIT_KEYS), `limits.${index}.structure`);
    add(
      errors,
      limit?.code === GRH_ABSENCE_INSIGHTS_LIMITS[index]?.code &&
        limit?.text === GRH_ABSENCE_INSIGHTS_LIMITS[index]?.text,
      `limits.${index}.identity`,
    );
  });

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze([...new Set(errors)]),
  });
}

export function validateGrhAbsenceInsightsContract(value) {
  return inspectGrhAbsenceInsightsContract(value).ok;
}
