import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const [
  gitignore,
  vercelignore,
  rawArtifact,
  rawImportQualityArtifact,
  rawLinkageArtifact,
  rawEmploymentActionsArtifact,
  rawPayrollRunControlArtifact,
  rawFixedConceptControlArtifact,
  rawManagementTimelineArtifact,
] = await Promise.all([
  readFile(new URL('.gitignore', ROOT), 'utf8'),
  readFile(new URL('.vercelignore', ROOT), 'utf8'),
  readFile(new URL('api/_data/grh-absence-insights.json', ROOT), 'utf8'),
  readFile(new URL('api/_data/grh-import-quality-history.json', ROOT), 'utf8'),
  readFile(new URL('api/_data/grh-personas-linkage-readiness.json', ROOT), 'utf8'),
  readFile(new URL('api/_data/grh-employment-actions.json', ROOT), 'utf8'),
  readFile(new URL('api/_data/grh-payroll-run-control.json', ROOT), 'utf8'),
  readFile(new URL('api/_data/grh-fixed-concept-control.json', ROOT), 'utf8'),
  readFile(new URL('api/_data/grh-management-timeline.json', ROOT), 'utf8'),
]);
const ARTIFACT_EXCEPTIONS = [
  '!api/_data/grh-absence-insights.json',
  '!api/_data/grh-import-quality-history.json',
  '!api/_data/grh-personas-linkage-readiness.json',
  '!api/_data/grh-employment-actions.json',
  '!api/_data/grh-payroll-run-control.json',
  '!api/_data/grh-fixed-concept-control.json',
  '!api/_data/grh-management-timeline.json',
];

test('only reviewed aggregate artifacts are excepted from private JSON exclusions', () => {
  for (const [name, source] of [['gitignore', gitignore], ['vercelignore', vercelignore]]) {
    assert.match(source, /^api\/_data\/\*\.json$/m, `${name} must retain the generic private exclusion`);
    for (const exception of ARTIFACT_EXCEPTIONS) {
      assert.equal(
        source.split(/\r?\n/).filter(line => line === exception).length,
        1,
        `${name} must contain one exact deployment exception for ${exception}`,
      );
    }
    assert.deepEqual(
      source.split(/\r?\n/).filter(line => line.startsWith('!api/_data/')).sort(),
      [...ARTIFACT_EXCEPTIONS].sort(),
      `${name} must expose no other private JSON artifact`,
    );
    assert.equal(source.includes('!api/_data/*.json'), false);
  }
});

test('the deployed exception is a small aggregate contract with no nominal fields', () => {
  assert.ok(Buffer.byteLength(rawArtifact, 'utf8') < 16 * 1024);
  const artifact = JSON.parse(rawArtifact);
  assert.deepEqual(artifact.privacy, {
    status: 'released_with_protected_bucket',
    threshold: 10,
    aggregateOnly: true,
    containsPii: false,
    personIdentifiersExported: false,
    rawRowsExported: false,
    sourceCauseLabelsExported: false,
  });
  assert.doesNotMatch(rawArtifact,
    /"(?:displayName|display_name|legajo|companyCode|company_code|dni|cuil|personId|person_id|employeeId|employee_id)"\s*:/i);
  assert.doesNotMatch(rawArtifact, /"(?:CODI_21|DETA_21|textoReporte)"\s*:/i);
});

test('the linkage readiness exception contains only aggregate reconciliation and source metadata', () => {
  assert.ok(Buffer.byteLength(rawLinkageArtifact, 'utf8') < 16 * 1024);
  const artifact = JSON.parse(rawLinkageArtifact);
  assert.equal(artifact.schemaVersion, 'grh-personas-linkage-readiness-v1');
  assert.equal(artifact.reconciliation.candidates, 1699);
  assert.equal(artifact.reconciliation.ambiguous, 157);
  assert.equal(artifact.reconciliation.unmatched, 493);
  assert.deepEqual(artifact.privacy, {
    aggregateOnly: true,
    containsPii: false,
    rawRowsExported: false,
    sourceIdentifiersExported: false,
    namesExported: false,
    documentsExported: false,
    addressesExported: false,
    contactsExported: false,
    candidateRowsExported: false,
  });
  assert.doesNotMatch(rawLinkageArtifact,
    /"(?:displayName|fullName|birthDate|dni|cuil|street|streetName|addressText|domicile|phone|email|sourceId|candidateRows|rawPersons)"\s*:/i);
});

test('the import-quality exception is small, aggregate-only and withholds raw messages', () => {
  assert.ok(Buffer.byteLength(rawImportQualityArtifact, 'utf8') < 16 * 1024);
  const artifact = JSON.parse(rawImportQualityArtifact);
  assert.equal(artifact.schemaVersion, 'grh-import-quality-history-v1');
  assert.deepEqual(artifact.privacy, {
    aggregateOnly: true,
    containsPii: false,
    personIdentifiersExported: false,
    rawRowsExported: false,
    rawMessagesExported: false,
  });
  assert.doesNotMatch(rawImportQualityArtifact,
    /"(?:displayName|fullName|legajo|dni|cuil|nroreporte|nrolinea|rawMessage|error)"\s*:/i);
});

test('the employment-actions exception is aggregate-only and withholds sensitive foja values', () => {
  assert.ok(Buffer.byteLength(rawEmploymentActionsArtifact, 'utf8') < 24 * 1024);
  const artifact = JSON.parse(rawEmploymentActionsArtifact);
  assert.equal(artifact.schemaVersion, 'grh-employment-actions-v1');
  assert.equal(artifact.privacy.aggregateOnly, true);
  assert.equal(artifact.privacy.containsPii, false);
  assert.equal(artifact.privacy.personIdentifiersExported, false);
  assert.equal(artifact.privacy.rawRowsExported, false);
  assert.equal(artifact.privacy.instrumentValuesExported, false);
  assert.equal(artifact.privacy.observationsExported, false);
  assert.equal(artifact.privacy.userValuesExported, false);
  assert.equal(artifact.privacy.rawCategoryValuesExported, false);
  assert.doesNotMatch(rawEmploymentActionsArtifact,
    /"(?:displayName|fullName|legajo|dni|cuil|nins_fj|obse_fj|USER_FJ|DETA_FJ|MOTI_FJ_DETA)"\s*:/i);
});

test('the payroll-run exception is aggregate-only and withholds run keys, amounts and raw logs', () => {
  assert.ok(Buffer.byteLength(rawPayrollRunControlArtifact, 'utf8') < 64 * 1024);
  const artifact = JSON.parse(rawPayrollRunControlArtifact);
  assert.equal(artifact.schemaVersion, 'grh-payroll-run-control-v1');
  assert.equal(artifact.privacy.aggregateOnly, true);
  assert.equal(artifact.privacy.containsPii, false);
  assert.equal(artifact.privacy.personIdentifiersExported, false);
  assert.equal(artifact.privacy.rawRowsExported, false);
  assert.equal(artifact.privacy.sourceRunKeysExported, false);
  assert.equal(artifact.privacy.monetaryAmountsExported, false);
  assert.equal(artifact.privacy.rawTechnicalLogsExported, false);
  assert.equal(artifact.privacy.rawMessagesExported, false);
  assert.doesNotMatch(rawPayrollRunControlArtifact,
    /"(?:displayName|fullName|legajo|LEGA_12|lega_12|dni|cuil|employeeId|personId|IMPO_31|cantidadFalso|cantidadVerdadero|condicion|denominacion|unidad)"\s*:/i);
});

test('the fixed-concept exception is aggregate-only and withholds nominal and monetary values', () => {
  assert.ok(Buffer.byteLength(rawFixedConceptControlArtifact, 'utf8') < 16 * 1024);
  const artifact = JSON.parse(rawFixedConceptControlArtifact);
  assert.equal(artifact.schemaVersion, 'grh-fixed-concept-control-v1');
  assert.equal(artifact.privacy.aggregateOnly, true);
  assert.equal(artifact.privacy.containsPii, false);
  assert.equal(artifact.privacy.personIdentifiersExported, false);
  assert.equal(artifact.privacy.sourceKeysExported, false);
  assert.equal(artifact.privacy.rawRowsExported, false);
  assert.equal(artifact.privacy.monetaryAmountsExported, false);
  assert.equal(artifact.privacy.legalInstrumentValuesExported, false);
  assert.doesNotMatch(rawFixedConceptControlArtifact,
    /"(?:displayName|fullName|legajo|LEGA_12|dni|cuil|IDPERSONA|IMPO_31|instrumento|expediente)"\s*:/i);
});

test('the management-timeline exception is aggregate-only and protects person-level source data', () => {
  assert.ok(Buffer.byteLength(rawManagementTimelineArtifact, 'utf8') < 24 * 1024);
  const artifact = JSON.parse(rawManagementTimelineArtifact);
  assert.equal(artifact.schemaVersion, 'grh-management-timeline-v1');
  assert.equal(artifact.privacy.mode, 'aggregate_only');
  assert.equal(artifact.privacy.threshold, 10);
  assert.equal(artifact.privacy.complementarySuppression, true);
  assert.equal(artifact.privacy.containsPii, false);
  assert.equal(artifact.privacy.personIdentifiersExported, false);
  assert.equal(artifact.privacy.rawRowsExported, false);
  assert.doesNotMatch(rawManagementTimelineArtifact,
    /"(?:displayName|fullName|personId|employeeId|dni|cuil|LEGA_12|CODI_01|documentNumber|instrumentValue|observation)"\s*:/i);
});
