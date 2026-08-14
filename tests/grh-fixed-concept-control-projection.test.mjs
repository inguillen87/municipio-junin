import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  inspectGrhFixedConceptControlContract,
  validateGrhFixedConceptControlContract,
} from '../api/lib/grh-fixed-concept-control-contract.js';
import {
  buildGrhFixedConceptControlProjection,
} from '../api/lib/grh-fixed-concept-control-projection.js';

const SOURCE_SHA = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';
const artifact = JSON.parse(await readFile(
  new URL('../api/_data/grh-fixed-concept-control.json', import.meta.url),
  'utf8',
));

test('real artifact produces one exact frozen aggregate fixed-concept projection', () => {
  const before = structuredClone(artifact);
  const projection = buildGrhFixedConceptControlProjection(artifact, {
    expectedSourceSha256: SOURCE_SHA,
  });
  assert.equal(validateGrhFixedConceptControlContract(projection), true);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.reconciliation.states[0]), true);
  assert.equal(Object.isFrozen(projection.snapshot.categories.rows), true);
  assert.deepEqual(artifact, before);
  assert.deepEqual(projection.reconciliation.states.map(row => row.rows), [94, 19, 78]);
  assert.equal(projection.coverage.matchedLegajoRows, 8729);
  assert.equal(projection.coverage.orphanLegajoRows, 0);
  assert.equal(projection.snapshot.legalInstrumentReportedRows, 0);
  assert.equal(projection.privacy.containsPii, false);
  assert.equal(projection.privacy.monetaryAmountsExported, false);
  assert.equal(projection.privacy.legalInstrumentValuesExported, false);
});

test('contract rejects raw fields, forged identities, weakened privacy and dishonest semantics', () => {
  const rawField = structuredClone(artifact);
  rawField.reconciliation.states[0].employeeId = 123;
  assert.ok(inspectGrhFixedConceptControlContract(rawField).errors.includes('reconciliation.states.0.structure'));

  const forged = structuredClone(artifact);
  forged.reconciliation.states[0].rows += 1;
  const forgedErrors = inspectGrhFixedConceptControlContract(forged).errors;
  assert.ok(forgedErrors.includes('reconciliation.states.0.canonical_identity'));
  assert.ok(forgedErrors.includes('reconciliation.row_identity'));

  const privacy = structuredClone(artifact);
  privacy.privacy.monetaryAmountsExported = true;
  assert.ok(inspectGrhFixedConceptControlContract(privacy).errors.includes('privacy.monetaryAmountsExported'));

  const claim = structuredClone(artifact);
  claim.metric.absenceMeaning = 'No observado significa error confirmado';
  assert.ok(inspectGrhFixedConceptControlContract(claim).errors.includes('metric.absenceMeaning'));

  assert.doesNotThrow(() => inspectGrhFixedConceptControlContract({}));
  assert.equal(inspectGrhFixedConceptControlContract({}).ok, false);
});

test('projection fails closed on pin, schema, contract and source drift', () => {
  assert.throws(
    () => buildGrhFixedConceptControlProjection(artifact, { expectedSourceSha256: 'bad' }),
    error => error?.code === 'GRH_FIXED_CONCEPT_CONTROL_SOURCE_PIN_INVALID',
  );
  assert.throws(
    () => buildGrhFixedConceptControlProjection(artifact, { expectedSourceSha256: '0'.repeat(64) }),
    error => error?.code === 'GRH_FIXED_CONCEPT_CONTROL_SOURCE_MISMATCH',
  );
  const schema = structuredClone(artifact);
  schema.schemaVersion = 'future';
  assert.throws(
    () => buildGrhFixedConceptControlProjection(schema, { expectedSourceSha256: SOURCE_SHA }),
    error => error?.code === 'GRH_FIXED_CONCEPT_CONTROL_SCHEMA_INVALID',
  );
  const drifted = structuredClone(artifact);
  drifted.snapshot.categories.rows[2].privacyStatus = 'released';
  assert.throws(
    () => buildGrhFixedConceptControlProjection(drifted, { expectedSourceSha256: SOURCE_SHA }),
    error => error?.code === 'GRH_FIXED_CONCEPT_CONTROL_CONTRACT_INVALID',
  );
});
