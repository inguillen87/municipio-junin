import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  inspectGrhPayrollRunControlContract,
  validateGrhPayrollRunControlContract,
} from '../api/lib/grh-payroll-run-control-contract.js';
import {
  buildGrhPayrollRunControlProjection,
} from '../api/lib/grh-payroll-run-control-projection.js';

const SOURCE_SHA = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';
const artifact = JSON.parse(await readFile(
  new URL('../api/_data/grh-payroll-run-control.json', import.meta.url),
  'utf8',
));

test('real artifact produces one exact frozen aggregate payroll-run projection', () => {
  const sourceBefore = structuredClone(artifact);
  const projection = buildGrhPayrollRunControlProjection(artifact, {
    expectedSourceSha256: SOURCE_SHA,
  });

  assert.equal(validateGrhPayrollRunControlContract(projection), true);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.monthly[0]), true);
  assert.equal(Object.isFrozen(projection.quarantine.reasonOccurrences), true);
  assert.deepEqual(artifact, sourceBefore);
  assert.equal(projection.coverage.sourceRunHeaders, 625);
  assert.equal(projection.coverage.validRunHeaders, 612);
  assert.equal(projection.coverage.validHeadersWithCalculation, 600);
  assert.equal(projection.coverage.validHeadersWithoutCalculation, 12);
  assert.equal(projection.coverage.orphanCalculationRunKeys, 0);
  assert.equal(projection.currentYear.runHeaders, 26);
  assert.equal(projection.quarantine.calculationRows, 20_270);
  assert.equal(projection.privacy.containsPii, false);
  assert.equal(projection.privacy.monetaryAmountsExported, false);
  assert.equal(projection.privacy.rawTechnicalLogsExported, false);
});

test('contract rejects forged reconciliations, sensitive fields and dishonest close semantics', () => {
  const rawField = structuredClone(artifact);
  rawField.monthly[0].employeeId = 123;
  assert.ok(inspectGrhPayrollRunControlContract(rawField).errors.includes('monthly.0.structure'));

  const forged = structuredClone(artifact);
  forged.monthly.at(-1).headersWithoutCalculation += 1;
  assert.ok(inspectGrhPayrollRunControlContract(forged).errors.includes('monthly.216.calculation_identity'));

  const openClaim = structuredClone(artifact);
  openClaim.metric.missingCloseFlagMeaning = 'CIER_31 ausente significa corrida abierta';
  assert.ok(inspectGrhPayrollRunControlContract(openClaim).errors.includes('metric.missingCloseFlagMeaning'));

  const missingQuarantine = structuredClone(artifact);
  missingQuarantine.quarantine.status = 'clear';
  assert.ok(inspectGrhPayrollRunControlContract(missingQuarantine).errors.includes('quarantine.canonical_identity'));

  assert.doesNotThrow(() => inspectGrhPayrollRunControlContract({}));
  assert.equal(inspectGrhPayrollRunControlContract({}).ok, false);
});

test('projection fails closed on source pin, schema, contract and privacy drift', () => {
  assert.throws(
    () => buildGrhPayrollRunControlProjection(artifact, { expectedSourceSha256: 'bad' }),
    error => error?.code === 'GRH_PAYROLL_RUN_CONTROL_SOURCE_PIN_INVALID',
  );
  assert.throws(
    () => buildGrhPayrollRunControlProjection(artifact, { expectedSourceSha256: '0'.repeat(64) }),
    error => error?.code === 'GRH_PAYROLL_RUN_CONTROL_SOURCE_MISMATCH',
  );

  const schema = structuredClone(artifact);
  schema.schemaVersion = 'future';
  assert.throws(
    () => buildGrhPayrollRunControlProjection(schema, { expectedSourceSha256: SOURCE_SHA }),
    error => error?.code === 'GRH_PAYROLL_RUN_CONTROL_SCHEMA_INVALID',
  );

  const drifted = structuredClone(artifact);
  drifted.privacy.rawMessagesExported = true;
  assert.throws(
    () => buildGrhPayrollRunControlProjection(drifted, { expectedSourceSha256: SOURCE_SHA }),
    error => error?.code === 'GRH_PAYROLL_RUN_CONTROL_CONTRACT_INVALID',
  );
});
