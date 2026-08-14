import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  GRH_GARDEN_NETWORK_ASSIGNMENT_POLICY_VERSION,
  GRH_GARDEN_NETWORK_SCHEMA_VERSION,
  inspectGrhGardenNetworkContract,
} from '../api/lib/grh-garden-network-contract.js';
import {
  buildGrhGardenNetworkProjection,
} from '../api/lib/grh-garden-network-projection.js';

const RAW_ARTIFACT = await readFile(
  new URL('../api/_data/grh-garden-network.json', import.meta.url),
  'utf8',
);
const ARTIFACT = JSON.parse(RAW_ARTIFACT);
const SOURCE_SHA = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('canonical garden-network projection is byte-identical, reconciled and deeply frozen', () => {
  const projection = buildGrhGardenNetworkProjection(ARTIFACT, {
    expectedSourceSha256: SOURCE_SHA,
  });
  assert.equal(projection.schemaVersion, GRH_GARDEN_NETWORK_SCHEMA_VERSION);
  assert.equal(
    projection.quality.assignmentPolicyVersion,
    GRH_GARDEN_NETWORK_ASSIGNMENT_POLICY_VERSION,
  );
  assert.equal(inspectGrhGardenNetworkContract(projection, {
    expectedSourceSha256: SOURCE_SHA,
  }).ok, true);
  assert.equal(JSON.stringify(projection), RAW_ARTIFACT);
  assert.deepEqual(projection.summary, {
    people: 107,
    releasedPeople: 45,
    protectedPeople: 62,
    releasedUnitCount: 4,
    observedUnitCount: 16,
  });
  assert.equal(
    projection.summary.releasedPeople + projection.summary.protectedPeople,
    projection.summary.people,
  );
  assert.deepEqual(
    projection.releasedUnits.map(({ label, people }) => ({ label, people })),
    [
      { label: 'Amanecer', people: 12 },
      { label: 'Manitos de Colores', people: 12 },
      { label: 'Del Sol', people: 11 },
      { label: 'Pata Garabata', people: 10 },
    ],
  );
  assert.equal(projection.protectedBucket.people, 62);
  assert.equal(projection.monthlyTrend.length, 24);
  assert.deepEqual(projection.monthlyTrend[0], { period: '2024-08', label: 'Ago 2024', people: 90 });
  assert.deepEqual(projection.monthlyTrend.at(-1), { period: '2026-07', label: 'Jul 2026', people: 107 });
  assert.equal(Math.max(...projection.monthlyTrend.map(row => row.people)), 109);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.monthlyTrend[0]), true);
});

test('contract rejects source, privacy, classification, reconciliation and shape drift', () => {
  const cases = [
    value => { value.person = { name: 'Dato privado' }; },
    value => { value.source.sourceSha256 = 'a'.repeat(64); },
    value => { value.privacy.personIdentifiersExported = true; },
    value => { value.quality.assignmentPolicyVersion = 'unreviewed'; },
    value => { value.quality.sourceEmploymentKeys -= 1; },
    value => { value.quality.linkedEmploymentKeys -= 1; },
    value => { value.quality.assignedPeople = 96; },
    value => { value.summary.unassignedPeople = 11; },
    value => { value.summary.releasedPeople -= 1; },
    value => { value.monthlyTrend[0].people -= 1; },
    value => { value.releasedUnits[0].people = 9; },
    value => { value.releasedUnits[0].unitCode = 10; },
    value => { value.protectedBucket.people -= 1; },
    value => { value.referencePeriod.period = '2026-08'; },
    value => { value.limits[6].code = 'map_available'; },
  ];
  for (const mutate of cases) {
    const value = clone(ARTIFACT);
    mutate(value);
    assert.equal(inspectGrhGardenNetworkContract(value, {
      expectedSourceSha256: SOURCE_SHA,
    }).ok, false);
  }
});

test('projection fails closed when source pin or artifact contract drifts', () => {
  assert.throws(
    () => buildGrhGardenNetworkProjection(ARTIFACT),
    error => error?.code === 'GRH_GARDEN_NETWORK_SOURCE_PIN_INVALID',
  );
  assert.throws(
    () => buildGrhGardenNetworkProjection(ARTIFACT, { expectedSourceSha256: 'a'.repeat(64) }),
    error => error?.code === 'GRH_GARDEN_NETWORK_SOURCE_MISMATCH',
  );
  const unsafe = clone(ARTIFACT);
  unsafe.releasedUnits[0].people = 9;
  assert.throws(
    () => buildGrhGardenNetworkProjection(unsafe, { expectedSourceSha256: SOURCE_SHA }),
    error => error?.code === 'GRH_GARDEN_NETWORK_CONTRACT_INVALID',
  );
});
