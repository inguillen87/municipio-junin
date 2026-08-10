import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

import { loadGrhArtifactBundle } from '../api/lib/grh-artifacts.js';

const MAX_EXPANDED_BYTES = 8 * 1024 * 1024;
const MAX_COMPRESSED_BYTES = 1024 * 1024;

async function realBundle() {
  const [profile, semantic, manifest] = await Promise.all([
    readFile(new URL('../api/_data/grh-profile.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../api/_data/grh-semantic.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../config/grh-source-manifest.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  return { profile, semantic, manifest };
}

function seal(value) {
  return gzipSync(Buffer.from(JSON.stringify(value)), { level: 9 }).toString('base64');
}

function databaseRows(profile, semantic) {
  return [
    {
      artifact: 'profile',
      schema_version: profile.schema_version,
      snapshot_as_of: profile.snapshot_as_of,
      source_sha256: profile.sha256,
      payload: profile,
    },
    {
      artifact: 'semantic',
      schema_version: semantic.schema_version,
      snapshot_as_of: semantic.source.snapshot_as_of,
      source_sha256: semantic.source.sha256,
      payload: semantic,
    },
  ];
}

function sealedEnvironment(bundle, overrides = {}) {
  return {
    NODE_ENV: 'production',
    GRH_ARTIFACT_SOURCE: 'sealed',
    GRH_SOURCE_SHA256: bundle.manifest.sha256,
    GRH_SEALED_BUNDLE_BASE64: seal(bundle),
    ...overrides,
  };
}

function fragmentedEnvironment(bundle, partCount = 3, overrides = {}) {
  const environment = sealedEnvironment(bundle);
  const payload = environment.GRH_SEALED_BUNDLE_BASE64;
  delete environment.GRH_SEALED_BUNDLE_BASE64;
  environment.GRH_SEALED_BUNDLE_PARTS = String(partCount);
  const fragmentLength = Math.ceil(payload.length / partCount);
  for (let index = 1; index <= partCount; index += 1) {
    environment[`GRH_SEALED_BUNDLE_${String(index).padStart(2, '0')}`] = payload.slice(
      (index - 1) * fragmentLength,
      index * fragmentLength,
    );
  }
  return { ...environment, ...overrides };
}

test('sealed runtime resolves the manifest-approved bundle without database or local reads', async () => {
  const source = await realBundle();
  let databaseReads = 0;
  let localReads = 0;
  const bundle = await loadGrhArtifactBundle({
    tenantId: 'tenant-sealed-test',
    environment: sealedEnvironment(source),
    queryImpl: async () => {
      databaseReads += 1;
      throw new Error('database must not run');
    },
    readLocalJsonImpl: async () => {
      localReads += 1;
      throw new Error('local files must not run');
    },
  });

  assert.equal(databaseReads, 0);
  assert.equal(localReads, 0);
  assert.equal(bundle.profile.schema_version, 'grh-profile-v1');
  assert.equal(bundle.semantic.schema_version, 'grh-semantic-v2');
  assert.equal(bundle.provenance.approvedSourceSha256, source.manifest.sha256);
  assert.equal(bundle.provenance.sourceSha256, source.manifest.sha256);
  assert.equal(bundle.provenance.snapshotAsOf, source.manifest.snapshot_as_of);
});

test('fragmented sealed runtime concatenates the declared parts without database or local reads', async () => {
  const source = await realBundle();
  let databaseReads = 0;
  let localReads = 0;
  const bundle = await loadGrhArtifactBundle({
    tenantId: 'tenant-sealed-test',
    environment: fragmentedEnvironment(source, 3),
    queryImpl: async () => {
      databaseReads += 1;
      throw new Error('database must not run');
    },
    readLocalJsonImpl: async () => {
      localReads += 1;
      throw new Error('local files must not run');
    },
  });

  assert.equal(databaseReads, 0);
  assert.equal(localReads, 0);
  assert.equal(bundle.provenance.sourceSha256, source.manifest.sha256);
  assert.equal(bundle.provenance.snapshotAsOf, source.manifest.snapshot_as_of);
});

test('a configured direct sealed payload takes precedence over fragment settings', async () => {
  const source = await realBundle();
  const environment = fragmentedEnvironment(source, 3, {
    GRH_SEALED_BUNDLE_BASE64: '%%%=',
  });

  await assert.rejects(
    loadGrhArtifactBundle({ tenantId: 'tenant-sealed-test', environment }),
    error => error?.code === 'GRH_SEALED_BUNDLE_ENCODING_INVALID',
  );
});

test('fragmented sealed runtime fails closed on missing, empty or invalid parts without other reads', async () => {
  const source = await realBundle();
  const cases = [
    ['GRH_SEALED_BUNDLE_02', undefined, 'GRH_SEALED_BUNDLE_PART_REQUIRED'],
    ['GRH_SEALED_BUNDLE_02', '', 'GRH_SEALED_BUNDLE_PART_EMPTY'],
    ['GRH_SEALED_BUNDLE_02', 42, 'GRH_SEALED_BUNDLE_PART_INVALID'],
  ];

  for (const [name, value, code] of cases) {
    const environment = fragmentedEnvironment(source, 3);
    if (value === undefined) delete environment[name];
    else environment[name] = value;
    let databaseReads = 0;
    let localReads = 0;
    await assert.rejects(
      loadGrhArtifactBundle({
        tenantId: 'tenant-sealed-test',
        environment,
        queryImpl: async () => {
          databaseReads += 1;
        },
        readLocalJsonImpl: async () => {
          localReads += 1;
        },
      }),
      error => error?.code === code,
    );
    assert.equal(databaseReads, 0);
    assert.equal(localReads, 0);
  }
});

test('fragmented sealed runtime rejects missing or out-of-contract part counts', async () => {
  const source = await realBundle();
  const cases = [
    [undefined, 'GRH_SEALED_BUNDLE_PARTS_REQUIRED'],
    ['', 'GRH_SEALED_BUNDLE_PARTS_REQUIRED'],
    ['1', 'GRH_SEALED_BUNDLE_PARTS_INVALID'],
    ['17', 'GRH_SEALED_BUNDLE_PARTS_INVALID'],
    ['02', 'GRH_SEALED_BUNDLE_PARTS_INVALID'],
    ['2.5', 'GRH_SEALED_BUNDLE_PARTS_INVALID'],
    [2, 'GRH_SEALED_BUNDLE_PARTS_INVALID'],
  ];

  for (const [partCount, code] of cases) {
    const environment = fragmentedEnvironment(source, 3, {
      GRH_SEALED_BUNDLE_PARTS: partCount,
    });
    await assert.rejects(
      loadGrhArtifactBundle({ tenantId: 'tenant-sealed-test', environment }),
      error => error?.code === code,
    );
  }
});

test('database source preserves the tenant-scoped query path', async () => {
  const { profile, semantic, manifest } = await realBundle();
  const calls = [];
  const bundle = await loadGrhArtifactBundle({
    tenantId: 'tenant-database-test',
    environment: {
      NODE_ENV: 'production',
      GRH_ARTIFACT_SOURCE: 'database',
      GRH_SOURCE_SHA256: manifest.sha256,
    },
    queryImpl: async (text, params) => {
      calls.push({ text, params });
      return { rows: databaseRows(profile, semantic) };
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, ['tenant-database-test']);
  assert.match(calls[0].text, /WHERE tenant_id = \$1/);
  assert.equal(bundle.provenance.sourceSha256, manifest.sha256);
});

test('unknown artifact sources fail before any database or local read', async () => {
  let databaseReads = 0;
  let localReads = 0;
  await assert.rejects(
    loadGrhArtifactBundle({
      tenantId: 'tenant-sealed-test',
      environment: { GRH_ARTIFACT_SOURCE: 'automatic' },
      queryImpl: async () => {
        databaseReads += 1;
      },
      readLocalJsonImpl: async () => {
        localReads += 1;
      },
    }),
    error => error?.code === 'GRH_ARTIFACT_SOURCE_INVALID',
  );
  assert.equal(databaseReads, 0);
  assert.equal(localReads, 0);
});

test('sealed runtime requires a valid approved SHA pin before opening the payload', async () => {
  const source = await realBundle();
  const base = sealedEnvironment(source);

  await assert.rejects(
    loadGrhArtifactBundle({
      tenantId: 'tenant-sealed-test',
      environment: { ...base, GRH_SOURCE_SHA256: '' },
    }),
    error => error?.code === 'GRH_SOURCE_SHA256_REQUIRED',
  );
  await assert.rejects(
    loadGrhArtifactBundle({
      tenantId: 'tenant-sealed-test',
      environment: { ...base, GRH_SOURCE_SHA256: 'not-a-sha' },
    }),
    error => error?.code === 'GRH_SOURCE_SHA256_INVALID',
  );
  await assert.rejects(
    loadGrhArtifactBundle({
      tenantId: 'tenant-sealed-test',
      environment: { ...base, GRH_SOURCE_SHA256: 'b'.repeat(64) },
    }),
    error => error?.code === 'GRH_SOURCE_SHA256_MISMATCH',
  );
});

test('sealed runtime rejects missing, malformed and structurally invalid envelopes with stable codes', async () => {
  const source = await realBundle();
  const base = sealedEnvironment(source);
  const cases = [
    [undefined, 'GRH_SEALED_BUNDLE_PARTS_REQUIRED'],
    ['', 'GRH_SEALED_BUNDLE_REQUIRED'],
    ['%%%=', 'GRH_SEALED_BUNDLE_ENCODING_INVALID'],
    ['AB==', 'GRH_SEALED_BUNDLE_ENCODING_INVALID'],
    [Buffer.from('not-gzip').toString('base64'), 'GRH_SEALED_BUNDLE_COMPRESSION_INVALID'],
    [gzipSync(Buffer.from('{')).toString('base64'), 'GRH_SEALED_BUNDLE_JSON_INVALID'],
    [gzipSync(Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d])).toString('base64'), 'GRH_SEALED_BUNDLE_JSON_INVALID'],
    [seal({ profile: source.profile, semantic: source.semantic }), 'GRH_SEALED_BUNDLE_STRUCTURE_INVALID'],
    [seal({ ...source, unexpected_private_value: 'must-never-leak' }), 'GRH_SEALED_BUNDLE_STRUCTURE_INVALID'],
  ];

  for (const [payload, code] of cases) {
    await assert.rejects(
      loadGrhArtifactBundle({
        tenantId: 'tenant-sealed-test',
        environment: { ...base, GRH_SEALED_BUNDLE_BASE64: payload },
      }),
      error => {
        assert.equal(error?.code, code);
        assert.doesNotMatch(error?.message || '', /must-never-leak|unexpected_private_value/);
        return true;
      },
    );
  }
});

test('sealed runtime enforces compressed and expanded size ceilings', async () => {
  const source = await realBundle();
  const base = sealedEnvironment(source);
  const oversizedCompressed = Buffer.alloc(MAX_COMPRESSED_BYTES + 1).toString('base64');
  const expansionBomb = gzipSync(Buffer.alloc(MAX_EXPANDED_BYTES + 1)).toString('base64');

  await assert.rejects(
    loadGrhArtifactBundle({
      tenantId: 'tenant-sealed-test',
      environment: { ...base, GRH_SEALED_BUNDLE_BASE64: oversizedCompressed },
    }),
    error => error?.code === 'GRH_SEALED_BUNDLE_COMPRESSED_LIMIT',
  );
  await assert.rejects(
    loadGrhArtifactBundle({
      tenantId: 'tenant-sealed-test',
      environment: { ...base, GRH_SEALED_BUNDLE_BASE64: expansionBomb },
    }),
    error => error?.code === 'GRH_SEALED_BUNDLE_EXPANSION_LIMIT',
  );
});

test('sealed runtime rejects publication contract drift and never exposes validator details', async () => {
  const source = await realBundle();
  const drifted = structuredClone(source);
  drifted.profile.row_counts.calculo += 1;

  await assert.rejects(
    loadGrhArtifactBundle({
      tenantId: 'tenant-sealed-test',
      environment: sealedEnvironment(drifted, {
        GRH_SOURCE_SHA256: source.manifest.sha256,
      }),
    }),
    error => {
      assert.equal(error?.code, 'GRH_SEALED_BUNDLE_PUBLICATION_INVALID');
      assert.doesNotMatch(error?.message || '', /focused_row_count|calculo|row_counts/);
      return true;
    },
  );
});
