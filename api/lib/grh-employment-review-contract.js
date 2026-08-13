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
  'reportedCurrentPeople',
  'reportedEndedPeople',
  'uncertainPeople',
  'referencePayrollParticipants',
  'reportedCurrentWithReferencePayroll',
  'currentWithoutPayroll',
  'endedWithPayroll',
  'uncertainWithPayroll',
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

function releasedOrProtectedCount(value, audience) {
  if (value === null) return audience === 'portable';
  if (!nonNegativeInteger(value)) return false;
  return audience === 'private' || value === 0 || value >= GRH_EMPLOYMENT_REVIEW_PRIVACY_THRESHOLD;
}

function protectedPairMatchesTotal(total, left, right) {
  if (!nonNegativeInteger(total)) return false;
  if (nonNegativeInteger(left) && nonNegativeInteger(right)) return left + right === total;
  if (left === null && nonNegativeInteger(right)) {
    const hidden = total - right;
    return hidden > 0 && hidden < GRH_EMPLOYMENT_REVIEW_PRIVACY_THRESHOLD;
  }
  if (right === null && nonNegativeInteger(left)) {
    const hidden = total - left;
    return hidden > 0 && hidden < GRH_EMPLOYMENT_REVIEW_PRIVACY_THRESHOLD;
  }
  return left === null && right === null && total >= 2 &&
    total <= 2 * (GRH_EMPLOYMENT_REVIEW_PRIVACY_THRESHOLD - 1);
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
  add(errors, nonNegativeInteger(value?.reportedCurrentPeople), 'reported_current_people');
  add(errors, nonNegativeInteger(value?.reportedEndedPeople), 'reported_ended_people');
  add(errors, nonNegativeInteger(value?.uncertainPeople), 'uncertain_people');
  add(errors, nonNegativeInteger(value?.referencePayrollParticipants),
    'reference_payroll_participants');
  add(errors, releasedOrProtectedCount(value?.reportedCurrentWithReferencePayroll, value?.audience),
    'reported_current_with_reference_payroll');
  add(errors, releasedOrProtectedCount(value?.currentWithoutPayroll, value?.audience),
    'current_without_payroll');
  add(errors, releasedOrProtectedCount(value?.endedWithPayroll, value?.audience),
    'ended_with_payroll');
  add(errors, releasedOrProtectedCount(value?.uncertainWithPayroll, value?.audience),
    'uncertain_with_payroll');
  add(errors, nonNegativeInteger(value?.totalToReview) && value.totalToReview <= value.totalDirectoryPeople,
    'total_to_review');
  add(errors, ['released', 'partially_protected'].includes(value?.privacyStatus), 'privacy_status');
  add(errors, Array.isArray(value?.categories) &&
    value.categories.length === GRH_EMPLOYMENT_REVIEW_CATEGORIES.length, 'categories');

  add(errors,
    value?.reportedCurrentPeople + value?.reportedEndedPeople + value?.uncertainPeople ===
      value?.totalDirectoryPeople,
    'reported_status_identity');
  add(errors, value?.referencePayrollParticipants <= value?.totalDirectoryPeople,
    'reference_payroll_bound');

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
  const hiddenReviewTotal = value?.totalToReview - releasedTotal;
  add(errors, protectedCount === 0
    ? hiddenReviewTotal === 0
    : hiddenReviewTotal >= protectedCount &&
      hiddenReviewTotal <= protectedCount * (GRH_EMPLOYMENT_REVIEW_PRIVACY_THRESHOLD - 1),
  'review_total_identity');
  add(errors, rows[0]?.count === value?.currentWithoutPayroll, 'current_category_identity');
  add(errors, rows[1]?.count === value?.endedWithPayroll, 'ended_category_identity');
  add(errors, rows[2]?.count === value?.uncertainWithPayroll, 'uncertain_category_identity');
  add(errors, protectedPairMatchesTotal(
    value?.reportedCurrentPeople,
    value?.reportedCurrentWithReferencePayroll,
    value?.currentWithoutPayroll,
  ), 'reported_current_identity');
  const effectiveCurrentWith = nonNegativeInteger(value?.reportedCurrentWithReferencePayroll)
    ? value.reportedCurrentWithReferencePayroll
    : (nonNegativeInteger(value?.currentWithoutPayroll)
      ? value.reportedCurrentPeople - value.currentWithoutPayroll
      : null);
  const effectiveCurrentWithout = nonNegativeInteger(value?.currentWithoutPayroll)
    ? value.currentWithoutPayroll
    : (nonNegativeInteger(value?.reportedCurrentWithReferencePayroll)
      ? value.reportedCurrentPeople - value.reportedCurrentWithReferencePayroll
      : null);
  if (nonNegativeInteger(effectiveCurrentWith) && nonNegativeInteger(effectiveCurrentWithout)) {
    const referenceRemainder = value.referencePayrollParticipants - effectiveCurrentWith;
    const reviewRemainder = value.totalToReview - effectiveCurrentWithout;
    add(errors, referenceRemainder === reviewRemainder, 'protected_remainder_identity');
    add(errors, protectedPairMatchesTotal(
      referenceRemainder,
      value?.endedWithPayroll,
      value?.uncertainWithPayroll,
    ), 'reference_payroll_identity');
  }
  if (nonNegativeInteger(value?.reportedCurrentWithReferencePayroll) &&
      nonNegativeInteger(value?.currentWithoutPayroll)) {
    add(errors,
      value.reportedCurrentWithReferencePayroll + value.currentWithoutPayroll ===
        value.reportedCurrentPeople,
      'reported_current_identity');
  }
  if ([
    value?.reportedCurrentWithReferencePayroll,
    value?.endedWithPayroll,
    value?.uncertainWithPayroll,
  ].every(nonNegativeInteger)) {
    add(errors,
      value.reportedCurrentWithReferencePayroll + value.endedWithPayroll +
        value.uncertainWithPayroll === value.referencePayrollParticipants,
      'reference_payroll_identity');
  }
  if ([
    value?.currentWithoutPayroll,
    value?.endedWithPayroll,
    value?.uncertainWithPayroll,
  ].every(nonNegativeInteger)) {
    add(errors,
      value.currentWithoutPayroll + value.endedWithPayroll + value.uncertainWithPayroll ===
        value.totalToReview,
      'total_to_review_identity');
  }
  const protectedTopCount = [
    value?.reportedCurrentWithReferencePayroll,
    value?.currentWithoutPayroll,
    value?.endedWithPayroll,
    value?.uncertainWithPayroll,
  ].filter(count => count === null).length;
  add(errors, value?.privacyStatus === (protectedTopCount === 0 ? 'released' : 'partially_protected'),
    'privacy_identity');
  add(errors, value?.audience !== 'private' || (protectedCount === 0 && protectedTopCount === 0),
    'private_exact_counts');
  add(errors, value?.audience !== 'portable' || rows.every(row => (
    row.privacyStatus === 'protected' || row.count === 0 ||
      row.count >= GRH_EMPLOYMENT_REVIEW_PRIVACY_THRESHOLD
  )), 'portable_small_cells');

  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...new Set(errors)]) });
}

export function validateGrhEmploymentReviewContract(value) {
  return inspectGrhEmploymentReviewContract(value).ok;
}
