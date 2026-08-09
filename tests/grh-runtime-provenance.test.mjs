import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  inspectGrhPublicationBundle,
  inspectGrhRuntimeBundle,
} from '../api/lib/grh-contract.js';
import { loadGrhArtifactBundle } from '../api/lib/grh-artifacts.js';

async function realArtifacts() {
  const [profile, semantic, manifest] = await Promise.all([
    readFile(new URL('../api/_data/grh-profile.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../api/_data/grh-semantic.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../config/grh-source-manifest.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  return { profile, semantic, manifest };
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

test('the real private profile and semantic resolve as one manifest-approved local bundle', async () => {
  const artifacts = await realArtifacts();
  const reads = [];
  const bundle = await loadGrhArtifactBundle({
    tenantId: 'tenant-runtime-test',
    environment: {
      NODE_ENV: 'development',
      ALLOW_LOCAL_GRH_ARTIFACTS: 'true',
    },
    readLocalJsonImpl: async artifact => {
      reads.push(artifact);
      return structuredClone(artifacts[artifact]);
    },
  });

  assert.deepEqual(reads.sort(), ['manifest', 'profile', 'semantic']);
  assert.equal(bundle.profile.schema_version, 'grh-profile-v1');
  assert.equal(bundle.semantic.schema_version, 'grh-semantic-v2');
  assert.equal(bundle.provenance.approvedSourceSha256, artifacts.manifest.sha256);
  assert.equal(bundle.provenance.sourceSha256, artifacts.manifest.sha256);
  assert.equal(bundle.provenance.snapshotAsOf, artifacts.manifest.snapshot_as_of);
});

test('database runtime reads both active tenant artifacts on every call without a payload cache', async () => {
  const { profile, semantic, manifest } = await realArtifacts();
  const calls = [];
  const queryImpl = async (text, params) => {
    calls.push({ text, params });
    return { rows: databaseRows(profile, semantic) };
  };
  const options = {
    tenantId: 'tenant-runtime-test',
    queryImpl,
    environment: {
      NODE_ENV: 'production',
      GRH_SOURCE_SHA256: manifest.sha256,
    },
  };

  const first = await loadGrhArtifactBundle(options);
  const second = await loadGrhArtifactBundle(options);
  assert.notStrictEqual(first, second);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.params.length === 1 && call.params[0] === 'tenant-runtime-test'));
  assert.ok(calls.every(call => /WHERE tenant_id = \$1[\s\S]+active = TRUE[\s\S]+artifact IN \('profile', 'semantic'\)/.test(call.text)));
  assert.ok(calls.every(call => /schema_version[\s\S]+snapshot_as_of[\s\S]+source_sha256[\s\S]+payload/.test(call.text)));
});

test('runtime rejects a coherent forged bundle whose SHA is not the approved production pin', async () => {
  const { profile, semantic, manifest } = await realArtifacts();
  const forgedProfile = structuredClone(profile);
  const forgedSemantic = structuredClone(semantic);
  const forgedSha = 'b'.repeat(64);
  forgedProfile.sha256 = forgedSha;
  forgedSemantic.source.sha256 = forgedSha;

  const inspection = inspectGrhRuntimeBundle(
    databaseRows(forgedProfile, forgedSemantic),
    manifest.sha256,
  );
  assert.equal(inspection.ok, false);
  assert.equal(inspection.bundle, null);
  assert.ok(inspection.errors.includes('runtime.approved_sha256_identity'));

  const unpinned = inspectGrhRuntimeBundle(databaseRows(profile, semantic));
  assert.equal(unpinned.ok, false);
  assert.ok(unpinned.errors.includes('runtime.approved_sha256_format'));
});

test('runtime rejects row metadata drift and an incomplete semantic-only result', async () => {
  const { profile, semantic, manifest } = await realArtifacts();
  const driftedRows = databaseRows(profile, semantic);
  driftedRows[1].snapshot_as_of = '2026-08-07';
  driftedRows[1].source_sha256 = 'c'.repeat(64);
  const drifted = inspectGrhRuntimeBundle(driftedRows, manifest.sha256);
  assert.equal(drifted.ok, false);
  assert.ok(drifted.errors.includes('runtime.semantic_metadata_snapshot_identity'));
  assert.ok(drifted.errors.includes('runtime.semantic_metadata_sha256_identity'));
  assert.ok(drifted.errors.includes('runtime.metadata_sha256_identity'));

  const incomplete = inspectGrhRuntimeBundle(databaseRows(profile, semantic).slice(1), manifest.sha256);
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.bundle, null);
  assert.ok(incomplete.errors.includes('runtime.bundle_complete'));
  assert.ok(incomplete.errors.includes('runtime.profile_required'));
});

test('runtime and publication reject focused source inventory drift', async () => {
  const { profile, semantic, manifest } = await realArtifacts();
  const driftedProfile = structuredClone(profile);
  driftedProfile.row_counts.calculo += 1;

  const runtime = inspectGrhRuntimeBundle(databaseRows(driftedProfile, semantic), manifest.sha256);
  assert.equal(runtime.ok, false);
  assert.ok(runtime.errors.includes('runtime.focused_row_count_identity'));

  const publication = inspectGrhPublicationBundle(driftedProfile, semantic, manifest);
  assert.equal(publication.ok, false);
  assert.ok(publication.errors.includes('publication.focused_row_count_identity'));
});

test('every database runtime rejects a missing pin and production rejects malformed pins before querying', async () => {
  let queries = 0;
  const queryImpl = async () => {
    queries += 1;
    return { rows: [] };
  };

  await assert.rejects(
    loadGrhArtifactBundle({
      tenantId: 'tenant-runtime-test',
      queryImpl,
      environment: { NODE_ENV: 'production' },
    }),
    error => error?.code === 'GRH_SOURCE_SHA256_REQUIRED',
  );
  await assert.rejects(
    loadGrhArtifactBundle({
      tenantId: 'tenant-runtime-test',
      queryImpl,
      environment: { NODE_ENV: 'development', ALLOW_LOCAL_GRH_ARTIFACTS: 'true' },
    }),
    error => error?.code === 'GRH_SOURCE_SHA256_REQUIRED',
  );
  await assert.rejects(
    loadGrhArtifactBundle({
      tenantId: 'tenant-runtime-test',
      queryImpl,
      environment: { NODE_ENV: 'production', GRH_SOURCE_SHA256: 'not-a-sha' },
    }),
    error => error?.code === 'GRH_SOURCE_SHA256_INVALID',
  );
  assert.equal(queries, 0);
});

test('an invalid database bundle fails closed without falling back to local files', async () => {
  const { semantic, manifest } = await realArtifacts();
  let localReads = 0;
  await assert.rejects(
    loadGrhArtifactBundle({
      tenantId: 'tenant-runtime-test',
      queryImpl: async () => ({ rows: databaseRows({}, semantic).slice(1) }),
      environment: {
        NODE_ENV: 'development',
        ALLOW_LOCAL_GRH_ARTIFACTS: 'true',
        GRH_SOURCE_SHA256: manifest.sha256,
      },
      readLocalJsonImpl: async () => {
        localReads += 1;
        throw new Error('local fallback must not run');
      },
    }),
    error => error?.code === 'GRH_RUNTIME_BUNDLE_INVALID',
  );
  assert.equal(localReads, 0);
});
