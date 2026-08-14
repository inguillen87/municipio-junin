import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const RAW = await readFile(new URL('api/_data/grh-garden-network.json', ROOT), 'utf8');
const VERCEL_IGNORE = await readFile(new URL('.vercelignore', ROOT), 'utf8');
const GIT_IGNORE = await readFile(new URL('.gitignore', ROOT), 'utf8');

test('only the aggregate garden-network artifact is allowlisted for deployment', () => {
  const matches = VERCEL_IGNORE.match(/!api\/_data\/grh-garden-network\.json/g) || [];
  assert.equal(matches.length, 1);
  assert.match(VERCEL_IGNORE, /^api\/_data\/\*\.json$/m);
  assert.ok(VERCEL_IGNORE.indexOf('api/_data/*.json') <
    VERCEL_IGNORE.indexOf('!api/_data/grh-garden-network.json'));
  const gitMatches = GIT_IGNORE.match(/!api\/_data\/grh-garden-network\.json/g) || [];
  assert.equal(gitMatches.length, 1);
  assert.ok(GIT_IGNORE.indexOf('api/_data/*.json') <
    GIT_IGNORE.indexOf('!api/_data/grh-garden-network.json'));
});

test('artifact is small, aggregate-only and contains no source rows, identifiers, codes or amounts', () => {
  assert.ok(Buffer.byteLength(RAW, 'utf8') < 8 * 1024);
  const artifact = JSON.parse(RAW);
  assert.equal(artifact.schemaVersion, 'grh-garden-network-v1');
  assert.equal(artifact.privacy.aggregateOnly, true);
  assert.equal(artifact.privacy.containsPii, false);
  assert.equal(artifact.privacy.personIdentifiersExported, false);
  assert.equal(artifact.privacy.employmentKeysExported, false);
  assert.equal(artifact.privacy.sourceCodesExported, false);
  assert.equal(artifact.privacy.rawRowsExported, false);
  assert.doesNotMatch(RAW,
    /"(?:IDPERSONA|CODI_01|CODI_02|CODI_07|LEGA_12|personId|employeeId|companyCode|sectorCode|unitCode|sourceCode|assignedPeople|unassignedPeople|dni|cuil|importe|amount|rows?)"\s*:/i);
  assert.doesNotMatch(RAW, /"(?:matricula|capacidad|presentismo|presupuesto|latitude|longitude|address)"\s*:/i);
});
