import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectGrhEmploymentReviewContract } from '../api/lib/grh-employment-review-contract.js';
import {
  buildGrhEmploymentReviewAggregateProjection,
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
    schemaVersion: 'grh-employment-review-v2',
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
  assert.equal(summary.reportedCurrentPeople, 20);
  assert.equal(summary.reportedEndedPeople, 8);
  assert.equal(summary.uncertainPeople, 1);
  assert.equal(summary.referencePayrollParticipants, 9);
  assert.equal(summary.reportedCurrentWithReferencePayroll, 1);
  assert.equal(summary.currentWithoutPayroll, 19);
  assert.equal(summary.endedWithPayroll, 7);
  assert.equal(summary.uncertainWithPayroll, 1);
  assert.equal(summary.totalToReview, 27);
  assert.deepEqual(summary.categories.map(row => row.count), [19, 7, 1]);
  assert.equal(summary.privacyStatus, 'released');
  assert.ok(Object.isFrozen(summary));
  assert.doesNotMatch(JSON.stringify(summary), /error|activo|baja real|pago/i);
  assert.equal(inspectGrhEmploymentReviewContract(contractProjection(summary)).ok, true);
});

test('portable presentation publishes safe headlines and protects only the 7 and 1 cells', () => {
  const summary = summarizeGrhEmploymentReviewRecords(recordsForCanonicalCounts(), { audience: 'portable' });
  assert.equal(summary.totalToReview, 27);
  assert.equal(summary.privacyStatus, 'partially_protected');
  assert.equal(summary.reportedCurrentWithReferencePayroll, null);
  assert.equal(summary.currentWithoutPayroll, 19);
  assert.equal(summary.endedWithPayroll, null);
  assert.equal(summary.uncertainWithPayroll, null);
  assert.deepEqual(summary.categories.map(row => [row.count, row.display, row.privacyStatus]), [
    [19, '19', 'released'],
    [null, 'Detalle protegido', 'protected'],
    [null, 'Detalle protegido', 'protected'],
  ]);
  assert.equal(inspectGrhEmploymentReviewContract(contractProjection(summary)).ok, true);
});

test('materialized aggregate produces the same protected 27 without reading nominal records', () => {
  const projection = buildGrhEmploymentReviewAggregateProjection({
    source: {
      schemaVersion: 'grh-directory-v3',
      canonicalSystem: 'GRH Junín',
      sourceSha256: 'a'.repeat(64),
      snapshotAsOf: '2026-08-06',
    },
    referencePeriod: '2026-07',
    referencePeriodCount: 1,
    totalDirectoryPeople: 2449,
    materializedPeople: 2449,
    employmentPeople: 2449,
    counts: {
      reported_current_people: 867,
      reported_ended_people: 1560,
      uncertain_people: 22,
      reference_payroll_participants: 856,
      reported_current_with_reference_payroll: 848,
      reported_current_without_reference_payroll: 19,
      reported_ended_with_reference_payroll: 7,
      uncertain_status_with_reference_payroll: 1,
    },
  }, { audience: 'portable' });
  assert.equal(projection.schemaVersion, 'grh-employment-review-v2');
  assert.equal(projection.totalDirectoryPeople, 2449);
  assert.equal(projection.reportedCurrentPeople, 867);
  assert.equal(projection.reportedEndedPeople, 1560);
  assert.equal(projection.uncertainPeople, 22);
  assert.equal(projection.referencePayrollParticipants, 856);
  assert.equal(projection.reportedCurrentWithReferencePayroll, 848);
  assert.equal(projection.currentWithoutPayroll, 19);
  assert.equal(projection.endedWithPayroll, null);
  assert.equal(projection.uncertainWithPayroll, null);
  assert.equal(projection.totalToReview, 27);
  assert.deepEqual(projection.categories.map(row => row.count), [19, null, null]);
  assert.equal(inspectGrhEmploymentReviewContract(projection).ok, true);

  const drifted = structuredClone(projection);
  assert.throws(
    () => buildGrhEmploymentReviewAggregateProjection({
      source: { ...drifted.source, schemaVersion: 'grh-directory-v3' },
      referencePeriod: '2026-07',
      referencePeriodCount: 1,
      totalDirectoryPeople: 2449,
      materializedPeople: 2448,
      employmentPeople: 2449,
      counts: {
        reported_current_people: 867,
        reported_ended_people: 1560,
        uncertain_people: 22,
        reference_payroll_participants: 856,
        reported_current_with_reference_payroll: 848,
        reported_current_without_reference_payroll: 19,
        reported_ended_with_reference_payroll: 7,
        uncertain_status_with_reference_payroll: 1,
      },
    }),
    error => error?.code === 'GRH_EMPLOYMENT_REVIEW_AGGREGATE_INVALID',
  );
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

  const hiddenHeadline = structuredClone(base);
  hiddenHeadline.currentWithoutPayroll = null;
  hiddenHeadline.categories[0] = {
    ...hiddenHeadline.categories[0],
    count: null,
    display: 'Detalle protegido',
    privacyStatus: 'protected',
  };
  assert.equal(inspectGrhEmploymentReviewContract(hiddenHeadline).ok, false);

  const invented = structuredClone(base);
  invented.totalToReview = 50;
  assert.ok(inspectGrhEmploymentReviewContract(invented).errors.includes('total_to_review'));

  assert.deepEqual(
    base.categories.map(row => row.key),
    GRH_EMPLOYMENT_REVIEW_CATEGORIES.map(row => row.key),
  );
});
