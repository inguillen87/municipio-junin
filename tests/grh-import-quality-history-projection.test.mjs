import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  inspectGrhImportQualityHistoryContract,
  validateGrhImportQualityHistoryContract,
} from '../api/lib/grh-import-quality-history-contract.js';
import {
  buildGrhImportQualityHistoryProjection,
} from '../api/lib/grh-import-quality-history-projection.js';

const SOURCE_SHA = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';
const artifact = JSON.parse(await readFile(
  new URL('../api/_data/grh-import-quality-history.json', import.meta.url),
  'utf8',
));

test('real artifact produces an exact frozen aggregate projection', () => {
  const sourceBefore = structuredClone(artifact);
  const projection = buildGrhImportQualityHistoryProjection(artifact, {
    expectedSourceSha256: SOURCE_SHA,
  });
  assert.equal(validateGrhImportQualityHistoryContract(projection), true);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.annual[0]), true);
  assert.equal(Object.isFrozen(projection.categories[0]), true);
  assert.deepEqual(artifact, sourceBefore);
  assert.equal(projection.classification.classifiedIncidents, projection.totals.incidents);
  assert.equal(projection.classification.coveragePct, 100);
});

test('contract rejects forged totals, labels, PII fields and incomplete annual series', () => {
  const extra = structuredClone(artifact);
  extra.categories[0].dni = '12.345.678';
  assert.ok(inspectGrhImportQualityHistoryContract(extra).errors.includes('categories.0.structure'));

  const forged = structuredClone(artifact);
  forged.categories[0].incidents -= 1;
  const forgedInspection = inspectGrhImportQualityHistoryContract(forged);
  assert.ok(forgedInspection.errors.includes('categories.0.share_identity'));
  assert.ok(forgedInspection.errors.includes('categories.incident_identity'));

  const mislabeled = structuredClone(artifact);
  mislabeled.categories[0].label = 'Errores actuales de empleados';
  assert.ok(inspectGrhImportQualityHistoryContract(mislabeled).errors.includes('categories.0.label'));

  const missingYear = structuredClone(artifact);
  missingYear.annual.splice(3, 1);
  const missingInspection = inspectGrhImportQualityHistoryContract(missingYear);
  assert.ok(missingInspection.errors.some(code => code.endsWith('.consecutive')));
  assert.ok(missingInspection.errors.includes('annual.incident_identity'));
});

test('projection fails closed on source pin, schema and contract drift', () => {
  assert.throws(
    () => buildGrhImportQualityHistoryProjection(artifact, { expectedSourceSha256: 'bad' }),
    error => error?.code === 'GRH_IMPORT_QUALITY_HISTORY_SOURCE_PIN_INVALID',
  );
  assert.throws(
    () => buildGrhImportQualityHistoryProjection(artifact, { expectedSourceSha256: '0'.repeat(64) }),
    error => error?.code === 'GRH_IMPORT_QUALITY_HISTORY_SOURCE_MISMATCH',
  );
  const schema = structuredClone(artifact);
  schema.schemaVersion = 'future';
  assert.throws(
    () => buildGrhImportQualityHistoryProjection(schema, { expectedSourceSha256: SOURCE_SHA }),
    error => error?.code === 'GRH_IMPORT_QUALITY_HISTORY_SCHEMA_INVALID',
  );
  const drifted = structuredClone(artifact);
  drifted.privacy.rawMessagesExported = true;
  assert.throws(
    () => buildGrhImportQualityHistoryProjection(drifted, { expectedSourceSha256: SOURCE_SHA }),
    error => error?.code === 'GRH_IMPORT_QUALITY_HISTORY_CONTRACT_INVALID',
  );
});
