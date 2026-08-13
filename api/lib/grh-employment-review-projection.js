import { inspectGrhDirectoryArtifact } from './grh-directory-contract.js';

export const GRH_EMPLOYMENT_REVIEW_SCHEMA_VERSION = 'grh-employment-review-v1';
export const GRH_EMPLOYMENT_REVIEW_PRIVACY_THRESHOLD = 10;

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

  const totalToReview = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const protectBreakdown = audience === PORTABLE_AUDIENCE && Object.values(counts).some(
    count => count > 0 && count < GRH_EMPLOYMENT_REVIEW_PRIVACY_THRESHOLD,
  );
  const categories = GRH_EMPLOYMENT_REVIEW_CATEGORIES.map(
    definition => categoryRow(definition, counts[definition.key], protectBreakdown),
  );
  return deepFreeze({
    audience,
    referencePeriod,
    totalDirectoryPeople: records.length,
    totalToReview,
    privacyStatus: protectBreakdown
      ? 'partially_protected'
      : 'released',
    categories,
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
