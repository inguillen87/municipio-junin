import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const [gitignore, vercelignore, rawArtifact] = await Promise.all([
  readFile(new URL('.gitignore', ROOT), 'utf8'),
  readFile(new URL('.vercelignore', ROOT), 'utf8'),
  readFile(new URL('api/_data/grh-absence-insights.json', ROOT), 'utf8'),
]);
const ARTIFACT_EXCEPTION = '!api/_data/grh-absence-insights.json';

test('only the reviewed aggregate absence artifact is excepted from private JSON exclusions', () => {
  for (const [name, source] of [['gitignore', gitignore], ['vercelignore', vercelignore]]) {
    assert.match(source, /^api\/_data\/\*\.json$/m, `${name} must retain the generic private exclusion`);
    assert.equal(
      source.split(/\r?\n/).filter(line => line === ARTIFACT_EXCEPTION).length,
      1,
      `${name} must contain one exact deployment exception`,
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
