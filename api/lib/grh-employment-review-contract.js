import {
  GRH_EMPLOYMENT_REVIEW_CATEGORIES,
  GRH_EMPLOYMENT_REVIEW_PRIVACY_THRESHOLD,
  GRH_EMPLOYMENT_REVIEW_SCHEMA_VERSION,
} from './grh-employment-review-projection.js';

const TOP_KEYS = Object.freeze([
  'schemaVersion',
  'source',
  'audience',
  'referencePeriod',
  'totalDirectoryPeople',
  'totalToReview',
  'privacyStatus',
  'categories',
]);
const SOURCE_KEYS = Object.freeze(['canonicalSystem', 'sourceSha256', 'snapshotAsOf']);
const CATEGORY_KEYS = Object.freeze(['key', 'label', 'meaning', 'count', 'display', 'privacyStatus']);

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function add(errors, condition, code) {
  if (!condition) errors.push(code);
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function inspectGrhEmploymentReviewContract(value) {
  const errors = [];
  add(errors, exactKeys(value, TOP_KEYS), 'employment_review.structure');
  add(errors, value?.schemaVersion === GRH_EMPLOYMENT_REVIEW_SCHEMA_VERSION, 'schema.version');
  add(errors, exactKeys(value?.source, SOURCE_KEYS), 'source.structure');
  add(errors, typeof value?.source?.canonicalSystem === 'string' && value.source.canonicalSystem.length > 0,
    'source.canonical_system');
  add(errors, /^[0-9a-f]{64}$/.test(value?.source?.sourceSha256 || ''), 'source.sha256');
  add(errors, /^\d{4}-\d{2}-\d{2}$/.test(value?.source?.snapshotAsOf || ''), 'source.snapshot');
  add(errors, ['private', 'portable'].includes(value?.audience), 'audience');
  add(errors, /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value?.referencePeriod || ''), 'reference_period');
  add(errors, nonNegativeInteger(value?.totalDirectoryPeople), 'total_directory_people');
  add(errors, nonNegativeInteger(value?.totalToReview) && value.totalToReview <= value.totalDirectoryPeople,
    'total_to_review');
  add(errors, ['released', 'partially_protected'].includes(value?.privacyStatus), 'privacy_status');
  add(errors, Array.isArray(value?.categories) &&
    value.categories.length === GRH_EMPLOYMENT_REVIEW_CATEGORIES.length, 'categories');

  let releasedTotal = 0;
  let protectedCount = 0;
  const rows = Array.isArray(value?.categories) ? value.categories : [];
  rows.forEach((row, index) => {
    const expected = GRH_EMPLOYMENT_REVIEW_CATEGORIES[index];
    add(errors, exactKeys(row, CATEGORY_KEYS), `categories.${index}.structure`);
    add(errors, row?.key === expected?.key && row?.label === expected?.label &&
      row?.meaning === expected?.meaning, `categories.${index}.definition`);
    if (row?.privacyStatus === 'released') {
      add(errors, nonNegativeInteger(row.count), `categories.${index}.count`);
      add(errors, row.display === String(row.count), `categories.${index}.display`);
      if (nonNegativeInteger(row.count)) releasedTotal += row.count;
    } else if (row?.privacyStatus === 'protected') {
      protectedCount += 1;
      add(errors, value?.audience === 'portable' && row.count === null && row.display === 'Detalle protegido',
        `categories.${index}.protected`);
    } else {
      add(errors, false, `categories.${index}.privacy_status`);
    }
  });
  add(errors, protectedCount === 0
    ? releasedTotal === value?.totalToReview
    : protectedCount === GRH_EMPLOYMENT_REVIEW_CATEGORIES.length &&
      value?.totalToReview >= GRH_EMPLOYMENT_REVIEW_PRIVACY_THRESHOLD,
  'total_identity');
  add(errors, value?.privacyStatus === (protectedCount === 0 ? 'released' : 'partially_protected'),
    'privacy_identity');
  add(errors, value?.audience !== 'private' || protectedCount === 0, 'private_exact_counts');
  add(errors, value?.audience !== 'portable' || rows.every(row => (
    row.privacyStatus === 'protected' || row.count >= GRH_EMPLOYMENT_REVIEW_PRIVACY_THRESHOLD
  )), 'portable_small_cells');

  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...new Set(errors)]) });
}

export function validateGrhEmploymentReviewContract(value) {
  return inspectGrhEmploymentReviewContract(value).ok;
}
