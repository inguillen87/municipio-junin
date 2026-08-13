import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GRH_ADMINISTRATION_COMPARISON_SCHEMA_VERSION,
  inspectGrhAdministrationComparisonContract,
} from '../api/lib/grh-administration-comparison-contract.js';
import {
  buildGrhAdministrationComparisonProjection,
} from '../api/lib/grh-administration-comparison-projection.js';

const SOURCE_SHA = 'a'.repeat(64);
const CONTENT_SHA = 'b'.repeat(64);

function aggregate() {
  return {
    source: {
      schemaVersion: 'grh-directory-v3',
      canonicalSystem: 'GRH Junín',
      sourceSha256: SOURCE_SHA,
      contentSha256: CONTENT_SHA,
      snapshotAsOf: '2026-08-06',
      recordCount: 2449,
      absenceEventCount: 31553,
    },
    identity: {
      materializedPeople: 2449,
      uniquePeople: 2449,
      employmentPeople: 2449,
      digestedPeople: 2449,
      materializedAbsenceEvents: 31553,
    },
    current: {
      eventRows: 5936,
      distinctPeople: 752,
      reportedDays: 65847,
      knownEventRows: 5936,
      missingEventRows: 0,
      reportedIngressDates: 281,
      reportedExitDates: 232,
    },
    prior: {
      eventRows: 3395,
      distinctPeople: 662,
      reportedDays: 52190,
      knownEventRows: 3395,
      missingEventRows: 0,
      reportedIngressDates: 216,
      reportedExitDates: 173,
    },
  };
}

test('comparison publishes two exact inclusive 972-day spans without rates or causal claims', () => {
  const projection = buildGrhAdministrationComparisonProjection(aggregate(), { audience: 'private' });
  assert.equal(projection.schemaVersion, GRH_ADMINISTRATION_COMPARISON_SCHEMA_VERSION);
  assert.equal(inspectGrhAdministrationComparisonContract(projection).ok, true);
  assert.deepEqual(projection.periods, {
    current: {
      label: 'Tramo actual de gestión',
      startDate: '2023-12-09',
      endDate: '2026-08-06',
      days: 972,
    },
    prior: {
      label: 'Mismo tramo, cuatro años antes',
      startDate: '2019-12-09',
      endDate: '2022-08-06',
      days: 972,
    },
  });
  for (const period of Object.values(projection.periods)) {
    const inclusiveDays = Math.floor(
      (Date.parse(`${period.endDate}T00:00:00Z`) - Date.parse(`${period.startDate}T00:00:00Z`)) /
      86400000,
    ) + 1;
    assert.equal(inclusiveDays, period.days);
  }
  assert.deepEqual(projection.comparison.absence.eventRows.values,
    { current: 5936, prior: 3395, difference: 2541 });
  assert.deepEqual(projection.comparison.absence.distinctPeople.values,
    { current: 752, prior: 662, difference: 90 });
  assert.deepEqual(projection.comparison.absence.reportedDays.values,
    { current: 65847, prior: 52190, difference: 13657 });
  assert.deepEqual(projection.comparison.reportedIngressDates.values,
    { current: 281, prior: 216, difference: 65 });
  assert.deepEqual(projection.comparison.reportedExitDates.values,
    { current: 232, prior: 173, difference: 59 });
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.comparison.absence.eventRows.values), true);
  const serialized = JSON.stringify(projection);
  assert.doesNotMatch(serialized,
    /"(?:displayName|display_name|legajo|companyCode|company_code|eventDate|event_date)"\s*:/i);
  assert.doesNotMatch(serialized, /"(?:rate|percentage|activeStaff|hire|termination|payment|performance)"/i);
});

test('portable protects an entire analytical block when an operand or absolute difference is 1 to 9', async t => {
  const cases = [
    ['current operand', 9, 20],
    ['prior operand', 20, 9],
    ['positive small difference', 19, 10],
    ['negative small difference', 10, 19],
    ['one against zero', 1, 0],
  ];
  for (const [name, currentPeople, priorPeople] of cases) {
    await t.test(name, () => {
      const input = aggregate();
      input.current.distinctPeople = currentPeople;
      input.prior.distinctPeople = priorPeople;
      const projection = buildGrhAdministrationComparisonProjection(input, { audience: 'portable' });
      assert.equal(projection.comparison.absence.privacyStatus, 'protected');
      for (const metric of [
        projection.comparison.absence.eventRows,
        projection.comparison.absence.distinctPeople,
        projection.comparison.absence.reportedDays,
        projection.comparison.absence.dayCoverage.knownEventRows,
        projection.comparison.absence.dayCoverage.missingEventRows,
      ]) {
        assert.deepEqual(metric.values, { current: null, prior: null, difference: null });
      }
      assert.equal(inspectGrhAdministrationComparisonContract(projection).ok, true);
    });
  }

  const incompleteDays = aggregate();
  incompleteDays.current.knownEventRows = 5931;
  incompleteDays.current.missingEventRows = 5;
  assert.throws(
    () => buildGrhAdministrationComparisonProjection(incompleteDays, { audience: 'portable' }),
    error => error?.code === 'GRH_ADMINISTRATION_COMPARISON_DAY_COVERAGE_INCOMPLETE',
  );
});

test('portable protects ingress and exit independently while private remains exact', () => {
  const input = aggregate();
  input.current.reportedIngressDates = 19;
  input.prior.reportedIngressDates = 10;
  input.current.reportedExitDates = 0;
  input.prior.reportedExitDates = 10;

  const portable = buildGrhAdministrationComparisonProjection(input, { audience: 'portable' });
  assert.equal(portable.privacy.status, 'partially_protected');
  assert.deepEqual(portable.comparison.reportedIngressDates.values,
    { current: null, prior: null, difference: null });
  assert.deepEqual(portable.comparison.reportedExitDates.values,
    { current: 0, prior: 10, difference: -10 });

  const privateProjection = buildGrhAdministrationComparisonProjection(input, { audience: 'private' });
  assert.equal(privateProjection.privacy.status, 'released');
  assert.deepEqual(privateProjection.comparison.reportedIngressDates.values,
    { current: 19, prior: 10, difference: 9 });
  assert.equal(inspectGrhAdministrationComparisonContract(privateProjection).ok, true);
});

test('contract rejects released portable small cells, shape drift and false materialization identity', () => {
  const released = structuredClone(
    buildGrhAdministrationComparisonProjection(aggregate(), { audience: 'portable' }),
  );
  released.comparison.reportedIngressDates.values = { current: 19, prior: 10, difference: 9 };
  assert.equal(inspectGrhAdministrationComparisonContract(released).ok, false);

  const drift = structuredClone(
    buildGrhAdministrationComparisonProjection(aggregate(), { audience: 'private' }),
  );
  drift.comparison.absence.distinctPeople.rate = 12.5;
  assert.equal(inspectGrhAdministrationComparisonContract(drift).ok, false);

  const mismatched = aggregate();
  mismatched.identity.uniquePeople -= 1;
  assert.throws(
    () => buildGrhAdministrationComparisonProjection(mismatched, { audience: 'private' }),
    error => error?.code === 'GRH_ADMINISTRATION_COMPARISON_AGGREGATE_INVALID',
  );

  const impossibleAbsenceSubset = aggregate();
  impossibleAbsenceSubset.source.absenceEventCount = 9000;
  impossibleAbsenceSubset.identity.materializedAbsenceEvents = 9000;
  assert.throws(
    () => buildGrhAdministrationComparisonProjection(impossibleAbsenceSubset, { audience: 'private' }),
    error => error?.code === 'GRH_ADMINISTRATION_COMPARISON_AGGREGATE_INVALID',
  );
});
