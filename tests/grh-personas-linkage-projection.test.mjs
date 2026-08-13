import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { inspectGrhPersonasLinkageContract } from '../api/lib/grh-personas-linkage-contract.js';
import { buildGrhPersonasLinkageReadinessProjection } from '../api/lib/grh-personas-linkage-projection.js';

const ARTIFACT = JSON.parse(await readFile(new URL('../api/_data/grh-personas-linkage-readiness.json', import.meta.url), 'utf8'));
const GRH_SHA = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';
const PERSONAS_SHA = '11bf15764488e4fe8a053255f503404f6bca24a1ac47c90647649e2c41d8e39c';
const clone = value => JSON.parse(JSON.stringify(value));

test('real linkage artifact passes the exact contract and both source pins', () => {
  assert.deepEqual(inspectGrhPersonasLinkageContract(ARTIFACT), { ok: true, errors: [] });
  const projection = buildGrhPersonasLinkageReadinessProjection(ARTIFACT, {
    expectedGrhSourceSha256: GRH_SHA,
    expectedPersonasSourceSha256: PERSONAS_SHA,
  });
  assert.deepEqual(projection.algorithm.tiers.map(({ key, count }) => [key, count]), [
    ['unique_valid_cuil', 1432], ['unique_dni_backup', 203],
    ['duplicate_valid_cuil_unique_name', 58], ['duplicate_dni_unique_name', 6],
  ]);
  assert.deepEqual(projection.reconciliation.ambiguousBreakdown, {
    unresolvedDocumentCandidates: 154, nameOnlyReviewSignals: 3,
    multipleNameCandidates: 2, uniqueNameAndBirthDate: 1, promotedFromNameOnly: 0,
  });
  assert.equal(Object.isFrozen(projection.source.personas.counts), true);
});

test('projection fails closed on either source, PII, count or evidence drift', () => {
  assert.throws(() => buildGrhPersonasLinkageReadinessProjection(ARTIFACT, {
    expectedGrhSourceSha256: 'a'.repeat(64), expectedPersonasSourceSha256: PERSONAS_SHA,
  }), error => error?.code === 'GRH_PERSONAS_LINKAGE_SOURCE_MISMATCH');
  assert.throws(() => buildGrhPersonasLinkageReadinessProjection(ARTIFACT, {
    expectedGrhSourceSha256: GRH_SHA, expectedPersonasSourceSha256: 'bad',
  }), error => error?.code === 'GRH_PERSONAS_LINKAGE_SOURCE_PIN_INVALID');
  for (const mutate of [
    value => { value.person = { fullName: 'private' }; },
    value => { value.reconciliation.candidates -= 1; },
    value => { value.reconciliation.targetCollisions = 1; },
    value => { value.algorithm.nameOnlyMatching = true; },
    value => { value.algorithm.sexEvidenceUsed = true; },
    value => { value.reconciliation.ambiguousBreakdown.promotedFromNameOnly = 1; },
    value => { value.idPersonaControl.joinAllowed = true; },
    value => { value.privacy.containsPii = true; },
  ]) {
    const changed = clone(ARTIFACT); mutate(changed);
    assert.equal(inspectGrhPersonasLinkageContract(changed).ok, false);
  }
});
