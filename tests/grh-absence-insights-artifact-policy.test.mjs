import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const [gitignore, vercelignore, rawArtifact, rawLinkageArtifact] = await Promise.all([
  readFile(new URL('.gitignore', ROOT), 'utf8'),
  readFile(new URL('.vercelignore', ROOT), 'utf8'),
  readFile(new URL('api/_data/grh-absence-insights.json', ROOT), 'utf8'),
  readFile(new URL('api/_data/grh-personas-linkage-readiness.json', ROOT), 'utf8'),
]);
const ARTIFACT_EXCEPTIONS = [
  '!api/_data/grh-absence-insights.json',
  '!api/_data/grh-personas-linkage-readiness.json',
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
