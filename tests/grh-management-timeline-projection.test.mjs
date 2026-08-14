import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  inspectGrhManagementTimelineContract,
  validateGrhManagementTimelineContract,
} from '../api/lib/grh-management-timeline-contract.js';
import {
  buildGrhManagementTimelineProjection,
} from '../api/lib/grh-management-timeline-projection.js';

const SOURCE_SHA = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';
const artifact = JSON.parse(await readFile(
  new URL('../api/_data/grh-management-timeline.json', import.meta.url),
  'utf8',
));

function clone(value) {
  return structuredClone(value);
}

test('real artifact produces one exact deeply frozen IDPERSONA timeline', () => {
  const before = clone(artifact);
  const projection = buildGrhManagementTimelineProjection(artifact, {
    expectedSourceSha256: SOURCE_SHA,
  });
  assert.equal(validateGrhManagementTimelineContract(projection), true);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.managementYears[2].domains.reportedAbsence.current.values), true);
  assert.deepEqual(artifact, before);
  assert.deepEqual(projection.comparison.domains.reportedAbsence.current.values, {
    eventRows: 5936,
    distinctPersons: 749,
    reportedDays: 65847,
  });
  assert.equal(projection.source.coverage.employment.distinctPersons, 2325);
  assert.equal(projection.privacy.personKey, 'legajo.IDPERSONA');
  assert.equal(projection.privacy.containsPii, false);
});

test('contract rejects shape drift, privacy weakening and protected-value disclosure', () => {
  const rawField = clone(artifact);
  rawField.comparison.domains.reportedAbsence.employeeName = 'dato privado';
  assert.ok(inspectGrhManagementTimelineContract(rawField).errors.includes(
    'comparison.domains.reportedAbsence.structure',
  ));

  const weakPrivacy = clone(artifact);
  weakPrivacy.privacy.threshold = 1;
  weakPrivacy.privacy.personKey = 'legajo';
  const privacyErrors = inspectGrhManagementTimelineContract(weakPrivacy).errors;
  assert.ok(privacyErrors.includes('privacy.threshold'));
  assert.ok(privacyErrors.includes('privacy.person_key'));

  const leaked = clone(artifact);
  leaked.managementYears[2].domains.reportedIngressDates.current.values.eventRows = 80;
  assert.ok(inspectGrhManagementTimelineContract(leaked).errors.includes(
    'management_years.2.domains.reportedIngressDates.current.values.protected',
  ));

  const preMandate = clone(artifact);
  preMandate.source.snapshotAsOf = '2023-12-08';
  preMandate.observed.current = {
    startDate: null, endDate: null, days: 0, progressPct: 0, status: 'not_started',
  };
  preMandate.observed.prior = {
    startDate: null, endDate: null, days: 0, progressPct: 0, status: 'not_compared',
  };
  const preMandateErrors = inspectGrhManagementTimelineContract(preMandate).errors;
  assert.ok(preMandateErrors.includes('source.snapshot_before_current_term'));
  assert.ok(preMandateErrors.includes('observed.current.positive_days'));
  assert.ok(preMandateErrors.includes('observed.prior.positive_days'));
});

test('contract detects reconstruction when complementary suppression is removed', () => {
  const value = clone(artifact);
  const domain = value.managementYears[1].domains.reportedIngressDates;
  domain.current = {
    privacyStatus: 'released', values: { eventRows: 108, distinctPersons: 108 },
  };
  domain.prior = {
    privacyStatus: 'released', values: { eventRows: 70, distinctPersons: 70 },
  };
  domain.delta = {
    privacyStatus: 'released', values: { eventRows: 38, distinctPersons: 38 },
  };
  const errors = inspectGrhManagementTimelineContract(value).errors;
  assert.ok(errors.includes(
    'comparison.domains.reportedIngressDates.reconstruction_protection',
  ));
  assert.ok(errors.includes(
    'management_years.reportedIngressDates.complementary_suppression',
  ));
});

test('projection fails closed on pin, schema, source and contract drift', () => {
  assert.throws(
    () => buildGrhManagementTimelineProjection(artifact, { expectedSourceSha256: 'bad' }),
    error => error?.code === 'GRH_MANAGEMENT_TIMELINE_SOURCE_PIN_INVALID',
  );
  assert.throws(
    () => buildGrhManagementTimelineProjection(artifact, {
      expectedSourceSha256: '0'.repeat(64),
    }),
    error => error?.code === 'GRH_MANAGEMENT_TIMELINE_SOURCE_MISMATCH',
  );
  const schema = clone(artifact);
  schema.schemaVersion = 'grh-management-timeline-v2';
  assert.throws(
    () => buildGrhManagementTimelineProjection(schema, { expectedSourceSha256: SOURCE_SHA }),
    error => error?.code === 'GRH_MANAGEMENT_TIMELINE_SCHEMA_INVALID',
  );
  const contract = clone(artifact);
  contract.limits[9].code = 'gardens_certified';
  assert.throws(
    () => buildGrhManagementTimelineProjection(contract, { expectedSourceSha256: SOURCE_SHA }),
    error => error?.code === 'GRH_MANAGEMENT_TIMELINE_CONTRACT_INVALID',
  );
});
