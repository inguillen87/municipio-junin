import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

import {
  GRH_WORKFORCE_FINANCE_ARTIFACT_KEY,
  GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION,
  READ_ACTIVE_GRH_WORKFORCE_FINANCE_SQL,
  inspectGrhWorkforceFinanceArtifactEnvelope,
  loadGrhWorkforceFinanceArtifact,
} from '../api/lib/grh-workforce-finance-artifact.js';

const SOURCE_SHA256 = 'a'.repeat(64);
const SNAPSHOT = '2026-08-06';
const TENANT_ID = 'tenant-junin';

function envelope(overrides = {}) {
  return {
    tenantId: TENANT_ID,
    artifact: GRH_WORKFORCE_FINANCE_ARTIFACT_KEY,
    schemaVersion: GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION,
    snapshotAsOf: SNAPSHOT,
    sourceSha256: SOURCE_SHA256,
    payload: {
      schema_version: GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION,
      source: { sha256: SOURCE_SHA256, snapshot_as_of: SNAPSHOT },
    },
    ...overrides,
  };
}

function options(overrides = {}) {
  return {
    tenantId: TENANT_ID,
    expectedSourceSha256: SOURCE_SHA256,
    expectedSnapshotAsOf: SNAPSHOT,
    ...overrides,
  };
}

function sealedBase64(value) {
  return gzipSync(Buffer.from(JSON.stringify(value), 'utf8'), { mtime: 0 }).toString('base64');
}

test('local mode is explicit, non-production, source-pinned and returns only the standalone envelope', async () => {
  let reads = 0;
  const result = await loadGrhWorkforceFinanceArtifact(options({
    environment: {
      NODE_ENV: 'test',
      GRH_WORKFORCE_FINANCE_ARTIFACT_SOURCE: 'local',
      ALLOW_LOCAL_GRH_WORKFORCE_FINANCE_ARTIFACTS: 'true',
    },
    readLocalSourceArtifactImpl: async () => {
      reads += 1;
      return envelope().payload;
    },
  }));

  assert.equal(reads, 1);
  assert.equal(result.tenantId, TENANT_ID);
  assert.equal(result.sourceSha256, SOURCE_SHA256);
  assert.equal(result.payload.schema_version, GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION);
  assert.equal(Object.isFrozen(result), true);
});

test('missing, unknown and Production-local modes fail before any artifact read', async t => {
  for (const [name, environment] of [
    ['missing', { NODE_ENV: 'test' }],
    ['unknown', { NODE_ENV: 'test', GRH_WORKFORCE_FINANCE_ARTIFACT_SOURCE: 'bucket' }],
    ['production-local', {
      NODE_ENV: 'production',
      GRH_WORKFORCE_FINANCE_ARTIFACT_SOURCE: 'local',
      ALLOW_LOCAL_GRH_WORKFORCE_FINANCE_ARTIFACTS: 'true',
    }],
  ]) {
    await t.test(name, async () => {
      let reads = 0;
      await assert.rejects(
        loadGrhWorkforceFinanceArtifact(options({
          environment,
          readLocalSourceArtifactImpl: async () => { reads += 1; return envelope().payload; },
        })),
        error => error?.name === 'GrhWorkforceFinanceArtifactError' &&
          !JSON.stringify(error).includes('payload'),
      );
      assert.equal(reads, 0);
    });
  }
});

test('database mode uses one tenant-bound exact-key query and rejects row drift', async () => {
  const calls = [];
  const result = await loadGrhWorkforceFinanceArtifact(options({
    environment: { GRH_WORKFORCE_FINANCE_ARTIFACT_SOURCE: 'database' },
    queryImpl: async (sql, values) => {
      calls.push({ sql, values });
      return { rows: [{
        tenant_id: TENANT_ID,
        artifact: GRH_WORKFORCE_FINANCE_ARTIFACT_KEY,
        schema_version: GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION,
        snapshot_as_of: SNAPSHOT,
        source_sha256: SOURCE_SHA256,
        payload: envelope().payload,
      }] };
    },
  }));

  assert.equal(result.artifact, GRH_WORKFORCE_FINANCE_ARTIFACT_KEY);
  assert.deepEqual(calls, [{ sql: READ_ACTIVE_GRH_WORKFORCE_FINANCE_SQL, values: [TENANT_ID] }]);
  assert.match(calls[0].sql, /WHERE tenant_id = \$1/u);
  assert.match(calls[0].sql, /artifact = 'workforce_finance'/u);
  assert.match(calls[0].sql, /active = TRUE/u);

  await assert.rejects(loadGrhWorkforceFinanceArtifact(options({
    environment: { GRH_WORKFORCE_FINANCE_ARTIFACT_SOURCE: 'database' },
    queryImpl: async () => ({ rows: [{
      tenant_id: 'tenant-other',
      artifact: GRH_WORKFORCE_FINANCE_ARTIFACT_KEY,
      schema_version: GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION,
      snapshot_as_of: SNAPSHOT,
      source_sha256: SOURCE_SHA256,
      payload: envelope().payload,
    }] }),
  })), error => error?.code === 'GRH_WORKFORCE_FINANCE_ENVELOPE_INVALID');
});

test('sealed mode has an independent exact envelope and never widens the active three-key bundle', async () => {
  const encoded = sealedBase64(envelope());
  const result = await loadGrhWorkforceFinanceArtifact(options({
    environment: {
      GRH_WORKFORCE_FINANCE_ARTIFACT_SOURCE: 'sealed',
      GRH_WORKFORCE_FINANCE_SEALED_BASE64: encoded,
    },
  }));
  assert.equal(result.snapshotAsOf, SNAPSHOT);

  const midpoint = Math.ceil(encoded.length / 2);
  const fragmented = await loadGrhWorkforceFinanceArtifact(options({
    environment: {
      GRH_WORKFORCE_FINANCE_ARTIFACT_SOURCE: 'sealed',
      GRH_WORKFORCE_FINANCE_SEALED_PARTS: '2',
      GRH_WORKFORCE_FINANCE_SEALED_01: encoded.slice(0, midpoint),
      GRH_WORKFORCE_FINANCE_SEALED_02: encoded.slice(midpoint),
    },
  }));
  assert.equal(fragmented.sourceSha256, SOURCE_SHA256);

  await assert.rejects(loadGrhWorkforceFinanceArtifact(options({
    environment: {
      GRH_WORKFORCE_FINANCE_ARTIFACT_SOURCE: 'sealed',
      GRH_WORKFORCE_FINANCE_SEALED_BASE64: sealedBase64({
        ...envelope(),
        semantic: {},
      }),
    },
  })), error => error?.code === 'GRH_WORKFORCE_FINANCE_ENVELOPE_INVALID');
});

test('existing GRH routes do not depend on the standalone workforce configuration', async () => {
  const existingLoader = await readFile(
    new URL('../api/lib/grh-artifacts.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(existingLoader, /GRH_WORKFORCE_FINANCE|workforce_finance/u);
  assert.match(existingLoader, /keys\[0\] !== 'manifest'/u);
  assert.match(existingLoader, /keys\[1\] !== 'profile'/u);
  assert.match(existingLoader, /keys\[2\] !== 'semantic'/u);
});

test('envelope inspection rejects tenant, source, snapshot, schema and payload drift', () => {
  const expected = options();
  assert.equal(inspectGrhWorkforceFinanceArtifactEnvelope(envelope(), expected).ok, true);
  for (const drift of [
    { tenantId: 'tenant-other' },
    { sourceSha256: 'b'.repeat(64) },
    { snapshotAsOf: '2026-08-07' },
    { schemaVersion: 'grh-workforce-finance-source-v2' },
    { payload: [] },
  ]) {
    assert.equal(
      inspectGrhWorkforceFinanceArtifactEnvelope(envelope(drift), expected).ok,
      false,
    );
  }
});
