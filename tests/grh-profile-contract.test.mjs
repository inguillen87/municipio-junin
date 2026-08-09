import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspectGrhProfileContract, inspectGrhPublicationBundle, inspectGrhSemanticContract, validateGrhProfileContract, validateGrhSemanticContract } from '../api/lib/grh-contract.js';
import { publishGrhArtifactBundle } from '../api/lib/grh-publication.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function asSemanticV2Fixture(value) {
  const semantic = structuredClone(value);
  semantic.schema_version = 'grh-semantic-v2';
  for (const domain of ['absence', 'leave', 'movements']) {
    semantic[domain].distinct_participants_by_year ??= Object.fromEntries(
      Object.keys(semantic[domain].valid_by_year).map(year => [year, 0]),
    );
  }
  return semantic;
}

async function readSemanticFixture() {
  return asSemanticV2Fixture(JSON.parse(
    await readFile(path.join(root, 'api', '_data', 'grh-semantic.json'), 'utf8'),
  ));
}

function fixture() {
  return {
    schema_version: 'grh-profile-v1',
    source: 'grh_junin.backup_test.sql.gz',
    compressed_size_bytes: 123456,
    sha256: 'a'.repeat(64),
    snapshot_as_of: '2026-08-08',
    generated_at: '2026-08-08T16:50:40.297Z',
    canonical_source: 'GRH Junín',
    excluded_sources: ['personas_junin'],
    tables_profiled: 6,
    row_counts: {
      legajo: 2,
      calculo: 10,
      totpago: 2,
      ausencia: 1,
      licencia: 1,
      legamov: 2,
    },
    candidate_keys: { legajo: 2 },
    aggregates: {
      employees_by_sector: { '1': 1, sin_sector: 1 },
      employees_by_cost_center: { '2': 2 },
      salary_by_period: { snapshot: 0 },
      absence_by_year: { '2026': 1 },
      leave_by_year: { '2026': 1 },
      payroll_by_period: { '2026-07': 1 },
      movement_by_year: { '2026': 2 },
    },
    quality_flags: {
      pii_not_exported: true,
      salary_amounts_are_source_values: true,
      periods_require_complete_partition_check: true,
      future_realtime_requires_incremental_ingestion: true,
    },
  };
}

test('the profile contract accepts only the aggregate allowlisted structure', () => {
  const profile = fixture();
  assert.equal(validateGrhProfileContract(profile, profile.source, profile.sha256, profile.snapshot_as_of), true);
  assert.deepEqual(inspectGrhProfileContract(profile).errors, []);
});

test('profile and semantic lineage must match beyond a shared filename', () => {
  const profile = fixture();
  const wrongHash = inspectGrhProfileContract(profile, profile.source, 'b'.repeat(64), profile.snapshot_as_of);
  assert.equal(wrongHash.ok, false);
  assert.ok(wrongHash.errors.includes('profile.sha256_identity'));

  const wrongSnapshot = inspectGrhProfileContract(profile, profile.source, profile.sha256, '2026-08-07');
  assert.equal(wrongSnapshot.ok, false);
  assert.ok(wrongSnapshot.errors.includes('profile.snapshot_identity'));
});

test('the publication script reserves one PostgreSQL client for the full transaction', async () => {
  const source = await readFile(path.join(root, 'scripts', 'publish_grh_artifacts.mjs'), 'utf8');
  const publication = await readFile(path.join(root, 'api', 'lib', 'grh-publication.js'), 'utf8');
  assert.match(source, /const client = await pool\.connect\(\)/);
  assert.match(source, /inspectGrhPublicationBundle\(profile, semantic, manifest\)/);
  assert.match(source, /sha256: profile\.sha256/);
  assert.match(source, /publishGrhArtifactBundle\(client, tenantId, profile, semantic, verifiedProvenance\)/);
  assert.doesNotMatch(source, /sourceHash\s*=\s*semantic/);
  assert.match(source, /client\.release\(\)/);
  assert.match(publication, /await client\.query\('BEGIN'\)/);
  assert.match(publication, /await client\.query\('COMMIT'\)/);
  assert.match(publication, /await client\.query\('ROLLBACK'\)/);
  assert.doesNotMatch(source, /await pool\.query\((?:'BEGIN'|'COMMIT'|'ROLLBACK'|\s*`INSERT INTO grh_artifacts)/);
});

test('publication binds profile provenance to the approved manifest before semantic lineage', async () => {
  const [profile, semantic, manifest] = await Promise.all([
    readFile(path.join(root, 'api', '_data', 'grh-profile.json'), 'utf8').then(JSON.parse),
    readSemanticFixture(),
    readFile(path.join(root, 'config', 'grh-source-manifest.json'), 'utf8').then(JSON.parse),
  ]);
  assert.deepEqual(inspectGrhPublicationBundle(profile, semantic, manifest).errors, []);

  const forgedProfile = structuredClone(profile);
  const forgedSemantic = structuredClone(semantic);
  forgedProfile.sha256 = 'b'.repeat(64);
  forgedSemantic.source.sha256 = forgedProfile.sha256;
  const forged = inspectGrhPublicationBundle(forgedProfile, forgedSemantic, manifest);
  assert.equal(forged.ok, false);
  assert.ok(forged.errors.includes('profile.sha256_identity'));

  const wrongSizeProfile = structuredClone(profile);
  const wrongSizeSemantic = structuredClone(semantic);
  wrongSizeProfile.compressed_size_bytes += 1;
  wrongSizeSemantic.source.compressed_size_bytes = wrongSizeProfile.compressed_size_bytes;
  const wrongSize = inspectGrhPublicationBundle(wrongSizeProfile, wrongSizeSemantic, manifest);
  assert.equal(wrongSize.ok, false);
  assert.ok(wrongSize.errors.includes('publication.profile_size_identity'));

  const wrongTableCount = structuredClone(semantic);
  wrongTableCount.table_dictionary.total_tables += 1;
  const tableCountDrift = inspectGrhPublicationBundle(profile, wrongTableCount, manifest);
  assert.equal(tableCountDrift.ok, false);
  assert.ok(tableCountDrift.errors.includes('publication.table_count_identity'));

  const wrongFocusedRows = structuredClone(semantic);
  wrongFocusedRows.table_dictionary.tables.find(row => row.table === 'calculo').rows += 1;
  const focusedRowDrift = inspectGrhPublicationBundle(profile, wrongFocusedRows, manifest);
  assert.equal(focusedRowDrift.ok, false);
  assert.ok(focusedRowDrift.errors.includes('publication.focused_row_count_identity'));
});

test('publication uses one PoolClient, one verified profile SHA and rolls back the pair on failure', async () => {
  const [profile, semantic] = await Promise.all([
    readFile(path.join(root, 'api', '_data', 'grh-profile.json'), 'utf8').then(JSON.parse),
    readSemanticFixture(),
  ]);
  const provenance = {
    source: profile.source,
    sha256: profile.sha256,
    snapshotAsOf: profile.snapshot_as_of,
  };
  const calls = [];
  const client = {
    async query(text, params) {
      calls.push({ text, params });
    },
  };
  await publishGrhArtifactBundle(client, 'tenant-test', profile, semantic, provenance);
  assert.equal(calls[0].text, 'BEGIN');
  assert.equal(calls.at(-1).text, 'COMMIT');
  const inserts = calls.filter(call => call.text.startsWith('INSERT INTO grh_artifacts'));
  assert.equal(inserts.length, 2);
  assert.deepEqual(inserts.map(call => call.params[1]), ['profile', 'semantic']);
  assert.deepEqual(inserts.map(call => call.params[4]), [profile.sha256, profile.sha256]);

  const failingCalls = [];
  let insertCount = 0;
  const failingClient = {
    async query(text) {
      failingCalls.push(text);
      if (text.startsWith('INSERT INTO grh_artifacts') && ++insertCount === 2) {
        throw new Error('simulated second upsert failure');
      }
    },
  };
  await assert.rejects(
    publishGrhArtifactBundle(failingClient, 'tenant-test', profile, semantic, provenance),
    /simulated second upsert failure/,
  );
  assert.equal(failingCalls[0], 'BEGIN');
  assert.equal(failingCalls.at(-1), 'ROLLBACK');
  assert.equal(failingCalls.includes('COMMIT'), false);
});

test('the profile contract rejects identity fields, arbitrary aggregate labels and broken identities', () => {
  const withPii = fixture();
  withPii.employee_email = 'persona@example.test';
  assert.equal(validateGrhProfileContract(withPii), false);

  const namedPerson = fixture();
  namedPerson.aggregates.employees_by_sector = { 'Nombre Apellido': 2 };
  assert.equal(validateGrhProfileContract(namedPerson), false);

  const brokenTotal = fixture();
  brokenTotal.aggregates.employees_by_cost_center = { '2': 1 };
  assert.equal(validateGrhProfileContract(brokenTotal), false);
});

test('the materialized private GRH profile satisfies the contract when present', async t => {
  const artifact = path.join(root, 'api', '_data', 'grh-profile.json');
  let profile;
  try {
    profile = JSON.parse(await readFile(artifact, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return t.skip('private GRH profile not materialized');
    throw error;
  }
  const result = inspectGrhProfileContract(profile);
  assert.deepEqual(result.errors, []);
});

test('the semantic contract rejects arbitrary or nested identity-bearing fields', async t => {
  const artifact = path.join(root, 'api', '_data', 'grh-semantic.json');
  let semantic;
  try {
    semantic = asSemanticV2Fixture(JSON.parse(await readFile(artifact, 'utf8')));
  } catch (error) {
    if (error?.code === 'ENOENT') return t.skip('private GRH semantic artifact not materialized');
    throw error;
  }
  assert.equal(validateGrhSemanticContract(semantic), true);

  const topLevelPii = structuredClone(semantic);
  topLevelPii.raw_employee = { nombre: 'Persona', dni: '12345678' };
  assert.equal(validateGrhSemanticContract(topLevelPii), false);

  const nestedPii = structuredClone(semantic);
  nestedPii.payroll.raw_employee = { value: 'Persona' };
  assert.equal(validateGrhSemanticContract(nestedPii), false);

  const rowPii = structuredClone(semantic);
  rowPii.workforce.by_sector[0].dni = '12345678';
  assert.equal(validateGrhSemanticContract(rowPii), false);

  const disguisedDni = structuredClone(semantic);
  disguisedDni.workforce.by_sector[0].label = 'Juan Perez DNI 12345678';
  assert.equal(validateGrhSemanticContract(disguisedDni), false);

  const disguisedEmail = structuredClone(semantic);
  disguisedEmail.workforce.by_cost_center[0].label = 'persona@example.test';
  assert.equal(validateGrhSemanticContract(disguisedEmail), false);
});

test('semantic v2 enforces safe annual participant cardinality identities and rejects v1', async t => {
  let semantic;
  try {
    semantic = await readSemanticFixture();
  } catch (error) {
    if (error?.code === 'ENOENT') return t.skip('private GRH semantic artifact not materialized');
    throw error;
  }
  assert.equal(semantic.schema_version, 'grh-semantic-v2');
  assert.deepEqual(inspectGrhSemanticContract(semantic).errors, []);

  const legacy = structuredClone(semantic);
  legacy.schema_version = 'grh-semantic-v1';
  const legacyInspection = inspectGrhSemanticContract(legacy);
  assert.equal(legacyInspection.ok, false);
  assert.ok(legacyInspection.errors.includes('schema.version'));

  for (const domain of ['absence', 'leave', 'movements']) {
    const events = semantic[domain].valid_by_year;
    const participants = semantic[domain].distinct_participants_by_year;
    assert.deepEqual(Object.keys(participants).sort(), Object.keys(events).sort());
    for (const year of Object.keys(events)) {
      assert.ok(Number.isInteger(participants[year]));
      assert.ok(participants[year] >= 0 && participants[year] <= events[year]);
    }

    const firstYear = Object.keys(events)[0];
    const missingYear = structuredClone(semantic);
    delete missingYear[domain].distinct_participants_by_year[firstYear];
    assert.ok(
      inspectGrhSemanticContract(missingYear).errors.includes(`${domain}.participant_year_identity`),
    );

    const overflow = structuredClone(semantic);
    overflow[domain].distinct_participants_by_year[firstYear] = events[firstYear] + 1;
    assert.ok(inspectGrhSemanticContract(overflow).errors.includes(`${domain}.participant_count`));

    const rawKeys = structuredClone(semantic);
    rawKeys[domain].participant_keys = [[101, 42]];
    assert.equal(inspectGrhSemanticContract(rawKeys).ok, false);
  }
});

test('semantic DLP rejects formatted and obfuscated PII inside otherwise allowed labels', async t => {
  const artifact = path.join(root, 'api', '_data', 'grh-semantic.json');
  let semantic;
  try {
    semantic = asSemanticV2Fixture(JSON.parse(await readFile(artifact, 'utf8')));
  } catch (error) {
    if (error?.code === 'ENOENT') return t.skip('private GRH semantic artifact not materialized');
    throw error;
  }

  for (const label of [
    'Agente DNI N.º 12.345.678',
    'Agente CUIL 20-12.345.678-9',
    'Tesorería CBU 2850 5994 0098 1234 5678 90',
    'Contacto Tel.: +54 (9) 236 412-3456',
    'Contacto persona @ municipio .gob.ar',
    'Agente D\u200bNI １２.３４５.６７８',
    'Agente D.N.I. 12 345 678',
    'Agente C.U.I.L. 20/12.345.678/9',
    'Tesorería C.B.U. 2850.5994.0098.1234.5678.90',
    'Contacto T.E.L. +54 9 236 412 3456',
  ]) {
    const candidate = structuredClone(semantic);
    candidate.workforce.by_sector[0].label = label;
    const inspection = inspectGrhSemanticContract(candidate);
    assert.equal(inspection.ok, false, `debe rechazar ${label}`);
    assert.ok(inspection.errors.includes('semantic.sensitive_value'), `DLP debe detectar ${label}`);
  }
});

test('semantic DLP preserves legitimate aggregate labels and source codes', async t => {
  const artifact = path.join(root, 'api', '_data', 'grh-semantic.json');
  let semantic;
  try {
    semantic = asSemanticV2Fixture(JSON.parse(await readFile(artifact, 'utf8')));
  } catch (error) {
    if (error?.code === 'ENOENT') return t.skip('private GRH semantic artifact not materialized');
    throw error;
  }

  for (const label of [
    'Sector 12345678',
    'Teléfonos y conectividad',
    'Email institucional',
    'Cuenta bancaria - conciliación agregada',
  ]) {
    const candidate = structuredClone(semantic);
    candidate.workforce.by_sector[0].label = label;
    assert.deepEqual(inspectGrhSemanticContract(candidate).errors, [], `debe preservar ${label}`);
  }
});
