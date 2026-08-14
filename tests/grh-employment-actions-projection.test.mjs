import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  inspectGrhEmploymentActionsContract,
  validateGrhEmploymentActionsContract,
} from '../api/lib/grh-employment-actions-contract.js';
import {
  buildGrhEmploymentActionsProjection,
} from '../api/lib/grh-employment-actions-projection.js';

const SOURCE_SHA = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';
const artifact = JSON.parse(await readFile(
  new URL('../api/_data/grh-employment-actions.json', import.meta.url),
  'utf8',
));

test('real artifact produces one exact frozen aggregate employment-actions projection', () => {
  const sourceBefore = structuredClone(artifact);
  const projection = buildGrhEmploymentActionsProjection(artifact, {
    expectedSourceSha256: SOURCE_SHA,
  });

  assert.equal(validateGrhEmploymentActionsContract(projection), true);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.categories[0]), true);
  assert.equal(Object.isFrozen(projection.protectedBucket.current), true);
  assert.deepEqual(artifact, sourceBefore);
  assert.equal(projection.periods.current.days, 972);
  assert.equal(projection.periods.prior.days, 972);
  assert.equal(projection.classification.classifiedWindowEvents, 7_108);
  assert.equal(projection.classification.classifiedWindowEvents, projection.classification.totalWindowEvents);
  assert.equal(projection.classification.coveragePct, 100);
  assert.equal(projection.protectedBucket.categoryCount, 9);
  assert.equal(projection.classification.releasedCategoryCount, 13);
  assert.equal(projection.comparison.current.distinctPersons, 714);
  assert.equal(projection.comparison.prior.distinctPersons, 631);
  assert.equal(projection.comparison.deltas.distinctPersons, 83);
  assert.equal(projection.privacy.containsPii, false);
  assert.equal(projection.privacy.instrumentValuesExported, false);
  assert.equal(projection.privacy.observationsExported, false);
  assert.equal(projection.privacy.userValuesExported, false);
});

test('contract rejects sensitive fields, raw-label drift, forged reconciliations and small released cells', () => {
  const sensitive = structuredClone(artifact);
  sensitive.categories[0].observation = 'valor legado privado';
  assert.ok(inspectGrhEmploymentActionsContract(sensitive).errors.includes('categories.0.structure'));

  const rawLabel = structuredClone(artifact);
  rawLabel.categories[0].label = 'CAMBIO AREA';
  assert.ok(inspectGrhEmploymentActionsContract(rawLabel).errors.includes('categories.0.label'));

  const forged = structuredClone(artifact);
  forged.categories[0].current.events -= 1;
  forged.categories[0].deltas.events -= 1;
  const forgedInspection = inspectGrhEmploymentActionsContract(forged);
  assert.ok(forgedInspection.errors.includes('categories.current_event_identity'));

  const small = structuredClone(artifact);
  small.categories[0].current.events = 9;
  small.categories[0].current.persons = 9;
  small.categories[0].deltas.events = 9 - small.categories[0].prior.events;
  small.categories[0].deltas.persons = 9 - small.categories[0].prior.persons;
  assert.ok(inspectGrhEmploymentActionsContract(small).errors.includes('categories.0.privacy_threshold'));

  const noComplement = structuredClone(artifact);
  noComplement.protectedBucket.categoryCount = 1;
  assert.ok(inspectGrhEmploymentActionsContract(noComplement).errors.includes('protected_bucket.category_count'));
});

test('contract keeps the metric semantics explicit and handles malformed values without throwing', () => {
  const uniqueChanges = structuredClone(artifact);
  uniqueChanges.metric.eventUnit = 'cambios laborales únicos';
  assert.ok(inspectGrhEmploymentActionsContract(uniqueChanges).errors.includes('metric.event_unit'));

  const causal = structuredClone(artifact);
  causal.limits[4].text = 'La gestión actual causó la variación.';
  assert.ok(inspectGrhEmploymentActionsContract(causal).errors.includes('limits.4.identity'));

  assert.doesNotThrow(() => inspectGrhEmploymentActionsContract({}));
  assert.equal(inspectGrhEmploymentActionsContract({}).ok, false);
});

test('projection fails closed on source pin, schema, contract and privacy drift', () => {
  assert.throws(
    () => buildGrhEmploymentActionsProjection(artifact, { expectedSourceSha256: 'bad' }),
    error => error?.code === 'GRH_EMPLOYMENT_ACTIONS_SOURCE_PIN_INVALID',
  );
  assert.throws(
    () => buildGrhEmploymentActionsProjection(artifact, { expectedSourceSha256: '0'.repeat(64) }),
    error => error?.code === 'GRH_EMPLOYMENT_ACTIONS_SOURCE_MISMATCH',
  );

  const schema = structuredClone(artifact);
  schema.schemaVersion = 'future';
  assert.throws(
    () => buildGrhEmploymentActionsProjection(schema, { expectedSourceSha256: SOURCE_SHA }),
    error => error?.code === 'GRH_EMPLOYMENT_ACTIONS_SCHEMA_INVALID',
  );

  const drifted = structuredClone(artifact);
  drifted.privacy.rawRowsExported = true;
  assert.throws(
    () => buildGrhEmploymentActionsProjection(drifted, { expectedSourceSha256: SOURCE_SHA }),
    error => error?.code === 'GRH_EMPLOYMENT_ACTIONS_CONTRACT_INVALID',
  );
});
