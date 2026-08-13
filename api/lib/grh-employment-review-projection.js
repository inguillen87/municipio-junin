import { inspectGrhDirectoryArtifact } from './grh-directory-contract.js';

export const GRH_EMPLOYMENT_REVIEW_SCHEMA_VERSION = 'grh-employment-review-v1';
export const GRH_EMPLOYMENT_REVIEW_PRIVACY_THRESHOLD = 10;
const GRH_DIRECTORY_SOURCE_SCHEMA_VERSION = 'grh-directory-v3';

const PRIVATE_AUDIENCE = 'private';
const PORTABLE_AUDIENCE = 'portable';
const UNKNOWN_REPORTED_STATUSES = new Set([
  'unknown_missing_ingress',
  'unknown_sentinel_ingress',
  'unknown_implausible_active_tenure',
  'invalid_chronology',
]);

export const GRH_EMPLOYMENT_REVIEW_CATEGORIES = Object.freeze([
  Object.freeze({
    key: 'reported_current_without_reference_payroll',
    label: 'Sin participación en el cálculo del mes',
    meaning: 'El legajo no informa egreso al corte, pero no aparece en el cálculo de referencia.',
  }),
  Object.freeze({
    key: 'reported_ended_with_reference_payroll',
    label: 'Con egreso informado y participación en el cálculo',
    meaning: 'El legajo informa egreso al corte y también aparece en el cálculo de referencia.',
  }),
  Object.freeze({
    key: 'uncertain_status_with_reference_payroll',
    label: 'Con fechas a revisar y participación en el cálculo',
    meaning: 'Las fechas del legajo no permiten determinar la situación informada y la persona aparece en el cálculo de referencia.',
  }),
]);

function projectionError(code, message, details = []) {
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

function categoryFor(record) {
  const employment = record.employment;
  const observed = employment.reference_payroll_participation.observed;
  if (employment.reported_status === 'current_by_reported_dates' && !observed) {
    return GRH_EMPLOYMENT_REVIEW_CATEGORIES[0].key;
  }
  if (employment.reported_status === 'ended_by_reported_dates' && observed) {
    return GRH_EMPLOYMENT_REVIEW_CATEGORIES[1].key;
  }
  if (UNKNOWN_REPORTED_STATUSES.has(employment.reported_status) && observed) {
    return GRH_EMPLOYMENT_REVIEW_CATEGORIES[2].key;
  }
  return null;
}

function categoryRow(definition, count, protectBreakdown) {
  const protectedCell = protectBreakdown;
  return {
    ...definition,
    count: protectedCell ? null : count,
    display: protectedCell ? 'Detalle protegido' : String(count),
    privacyStatus: protectedCell ? 'protected' : 'released',
  };
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function summaryFromCounts(counts, {
  audience,
  referencePeriod,
  totalDirectoryPeople,
} = {}) {
  if (![PRIVATE_AUDIENCE, PORTABLE_AUDIENCE].includes(audience) ||
      !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(referencePeriod || '') ||
      !nonNegativeInteger(totalDirectoryPeople) ||
      !GRH_EMPLOYMENT_REVIEW_CATEGORIES.every(row => nonNegativeInteger(counts?.[row.key]))) {
    throw projectionError(
      'GRH_EMPLOYMENT_REVIEW_AGGREGATE_INVALID',
      'El resumen de situaciones laborales no supera los controles requeridos.',
    );
  }
  const totalToReview = GRH_EMPLOYMENT_REVIEW_CATEGORIES.reduce(
    (sum, row) => sum + counts[row.key],
    0,
  );
  if (totalToReview > totalDirectoryPeople) {
    throw projectionError(
      'GRH_EMPLOYMENT_REVIEW_AGGREGATE_INVALID',
      'El resumen de situaciones laborales no supera los controles requeridos.',
    );
  }
  const protectBreakdown = audience === PORTABLE_AUDIENCE &&
    GRH_EMPLOYMENT_REVIEW_CATEGORIES.some(row => (
      counts[row.key] > 0 && counts[row.key] < GRH_EMPLOYMENT_REVIEW_PRIVACY_THRESHOLD
    ));
  return deepFreeze({
    audience,
    referencePeriod,
    totalDirectoryPeople,
    totalToReview,
    privacyStatus: protectBreakdown ? 'partially_protected' : 'released',
    categories: GRH_EMPLOYMENT_REVIEW_CATEGORIES.map(
      definition => categoryRow(definition, counts[definition.key], protectBreakdown),
    ),
  });
}

export function summarizeGrhEmploymentReviewRecords(records, {
  audience = PORTABLE_AUDIENCE,
} = {}) {
  if (![PRIVATE_AUDIENCE, PORTABLE_AUDIENCE].includes(audience) || !Array.isArray(records)) {
    throw projectionError(
      'GRH_EMPLOYMENT_REVIEW_OPTIONS_INVALID',
      'La consulta de situaciones laborales para revisar no es válida.',
    );
  }

  const counts = Object.fromEntries(GRH_EMPLOYMENT_REVIEW_CATEGORIES.map(row => [row.key, 0]));
  let referencePeriod = null;
  for (const record of records) {
    const employment = record?.employment;
    const payroll = employment?.reference_payroll_participation;
    if (!employment || !payroll || typeof payroll.period !== 'string' ||
      typeof payroll.observed !== 'boolean' || !Number.isSafeInteger(payroll.row_count) ||
      payroll.row_count < 0 || payroll.observed !== (payroll.row_count > 0)) {
      throw projectionError(
        'GRH_EMPLOYMENT_REVIEW_RECORD_INVALID',
        'La situación laboral informada no supera los controles requeridos.',
      );
    }
    if (referencePeriod === null) referencePeriod = payroll.period;
    if (payroll.period !== referencePeriod) {
      throw projectionError(
        'GRH_EMPLOYMENT_REVIEW_PERIOD_MISMATCH',
        'Los registros no comparten el mismo período de cálculo.',
      );
    }
    const key = categoryFor(record);
    if (key) counts[key] += 1;
  }

  return summaryFromCounts(counts, {
    audience,
    referencePeriod,
    totalDirectoryPeople: records.length,
  });
}

export function buildGrhEmploymentReviewAggregateProjection(aggregate, {
  audience = PORTABLE_AUDIENCE,
} = {}) {
  const source = aggregate?.source;
  if (source?.schemaVersion !== GRH_DIRECTORY_SOURCE_SCHEMA_VERSION ||
      typeof source?.canonicalSystem !== 'string' || source.canonicalSystem.length === 0 ||
      !/^[0-9a-f]{64}$/.test(source?.sourceSha256 || '') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(source?.snapshotAsOf || '') ||
      !nonNegativeInteger(aggregate?.totalDirectoryPeople) ||
      aggregate?.materializedPeople !== aggregate.totalDirectoryPeople ||
      aggregate?.employmentPeople !== aggregate.totalDirectoryPeople ||
      aggregate?.referencePeriodCount !== 1) {
    throw projectionError(
      'GRH_EMPLOYMENT_REVIEW_AGGREGATE_INVALID',
      'La publicación laboral no supera los controles requeridos.',
    );
  }
  const summary = summaryFromCounts(aggregate.counts, {
    audience,
    referencePeriod: aggregate.referencePeriod,
    totalDirectoryPeople: aggregate.totalDirectoryPeople,
  });
  return deepFreeze({
    schemaVersion: GRH_EMPLOYMENT_REVIEW_SCHEMA_VERSION,
    source: {
      canonicalSystem: source.canonicalSystem,
      sourceSha256: source.sourceSha256,
      snapshotAsOf: source.snapshotAsOf,
    },
    ...summary,
  });
}

export function buildGrhEmploymentReviewProjection(artifact, {
  audience = PORTABLE_AUDIENCE,
} = {}) {
  const inspection = inspectGrhDirectoryArtifact(artifact);
  if (!inspection.ok) {
    throw projectionError(
      'GRH_EMPLOYMENT_REVIEW_SOURCE_INVALID',
      'El respaldo de personal no es apto para esta revisión.',
      inspection.errors,
    );
  }

  const summary = summarizeGrhEmploymentReviewRecords(artifact.records, { audience });
  if (summary.referencePeriod !== artifact.counts.reference_payroll_period) {
    throw projectionError(
      'GRH_EMPLOYMENT_REVIEW_REFERENCE_PERIOD_INVALID',
      'El período de referencia no coincide con el respaldo validado.',
    );
  }
  return deepFreeze({
    schemaVersion: GRH_EMPLOYMENT_REVIEW_SCHEMA_VERSION,
    source: {
      canonicalSystem: artifact.source.canonical_system,
      sourceSha256: artifact.source.sha256,
      snapshotAsOf: artifact.source.snapshot_as_of,
    },
    ...summary,
  });
}
