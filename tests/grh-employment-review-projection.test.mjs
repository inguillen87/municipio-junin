import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectGrhEmploymentReviewContract } from '../api/lib/grh-employment-review-contract.js';
import {
  GRH_EMPLOYMENT_REVIEW_CATEGORIES,
  summarizeGrhEmploymentReviewRecords,
} from '../api/lib/grh-employment-review-projection.js';

function employment(reportedStatus, observed, rowCount = observed ? 1 : 0, period = '2026-07') {
  return {
    reported_status: reportedStatus,
    reference_payroll_participation: {
      period,
      observed,
      row_count: rowCount,
    },
  };
}

function recordsForCanonicalCounts() {
  return [
    ...Array.from({ length: 19 }, () => ({
      employment: employment('current_by_reported_dates', false),
    })),
    ...Array.from({ length: 7 }, () => ({
      employment: employment('ended_by_reported_dates', true),
    })),
    { employment: employment('unknown_implausible_active_tenure', true) },
    { employment: employment('current_by_reported_dates', true) },
    { employment: employment('ended_by_reported_dates', false) },
  ];
}

function contractProjection(summary) {
  return {
    schemaVersion: 'grh-employment-review-v1',
    source: {
      canonicalSystem: 'GRH Junín',
      sourceSha256: 'a'.repeat(64),
      snapshotAsOf: '2026-08-06',
    },
    ...summary,
  };
}

test('canonical employment review separates 27 review situations without calling them errors', () => {
  const summary = summarizeGrhEmploymentReviewRecords(recordsForCanonicalCounts(), { audience: 'private' });
  assert.equal(summary.referencePeriod, '2026-07');
  assert.equal(summary.totalDirectoryPeople, 29);
  assert.equal(summary.totalToReview, 27);
  assert.deepEqual(summary.categories.map(row => row.count), [19, 7, 1]);
  assert.equal(summary.privacyStatus, 'released');
  assert.ok(Object.isFrozen(summary));
  assert.doesNotMatch(JSON.stringify(summary), /error|activo|baja real|pago/i);
  assert.equal(inspectGrhEmploymentReviewContract(contractProjection(summary)).ok, true);
});

test('portable presentation protects the complete breakdown against difference attacks', () => {
  const summary = summarizeGrhEmploymentReviewRecords(recordsForCanonicalCounts(), { audience: 'portable' });
  assert.equal(summary.totalToReview, 27);
  assert.equal(summary.privacyStatus, 'partially_protected');
  assert.deepEqual(summary.categories.map(row => [row.count, row.display, row.privacyStatus]), [
    [null, 'Detalle protegido', 'protected'],
    [null, 'Detalle protegido', 'protected'],
    [null, 'Detalle protegido', 'protected'],
  ]);
  assert.equal(inspectGrhEmploymentReviewContract(contractProjection(summary)).ok, true);
});

test('classification is mutually exclusive and rejects mixed periods or participation drift', () => {
  const everyStatus = [
    'unknown_missing_ingress',
    'unknown_sentinel_ingress',
    'unknown_implausible_active_tenure',
    'invalid_chronology',
  ].map(status => ({ employment: employment(status, true) }));
  const summary = summarizeGrhEmploymentReviewRecords(everyStatus, { audience: 'private' });
  assert.deepEqual(summary.categories.map(row => row.count), [0, 0, 4]);

  const wrongPeriod = recordsForCanonicalCounts();
  wrongPeriod[0].employment.reference_payroll_participation.period = '2026-06';
  assert.throws(
    () => summarizeGrhEmploymentReviewRecords(wrongPeriod),
    error => error?.code === 'GRH_EMPLOYMENT_REVIEW_PERIOD_MISMATCH',
  );

  const falseParticipation = recordsForCanonicalCounts();
  falseParticipation[0].employment.reference_payroll_participation.observed = true;
  assert.throws(
    () => summarizeGrhEmploymentReviewRecords(falseParticipation),
    error => error?.code === 'GRH_EMPLOYMENT_REVIEW_RECORD_INVALID',
  );
});

test('contract rejects reordered definitions, leaked protected counts and invented totals', () => {
  const base = contractProjection(
    summarizeGrhEmploymentReviewRecords(recordsForCanonicalCounts(), { audience: 'portable' }),
  );
  const reordered = structuredClone(base);
  reordered.categories.reverse();
  assert.equal(inspectGrhEmploymentReviewContract(reordered).ok, false);

  const leaked = structuredClone(base);
  leaked.categories[1].count = 7;
  assert.equal(inspectGrhEmploymentReviewContract(leaked).ok, false);

  const invented = structuredClone(base);
  invented.totalToReview = 50;
  assert.ok(inspectGrhEmploymentReviewContract(invented).errors.includes('total_to_review'));

  assert.deepEqual(
    base.categories.map(row => row.key),
    GRH_EMPLOYMENT_REVIEW_CATEGORIES.map(row => row.key),
  );
});
