import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

import { loadGrhWorkforceFinanceArtifact } from '../api/lib/grh-workforce-finance-artifact.js';
import {
  computeGrhWorkforceFinanceReleaseId,
  GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
  inspectGrhWorkforceFinanceSourceContract,
} from '../api/lib/grh-workforce-finance-source-contract.js';
import {
  clearGrhWorkforceFinanceSnapshotCache,
  createGrhWorkforceFinanceSnapshotEnvelope,
  decryptGrhWorkforceFinanceSnapshotEnvelope,
  GRH_WORKFORCE_FINANCE_SNAPSHOT_ACTION,
  GRH_WORKFORCE_FINANCE_SNAPSHOT_ENTITY,
  loadGrhWorkforceFinanceSnapshotArtifact,
  READ_GRH_WORKFORCE_FINANCE_SNAPSHOT_SQL,
} from '../api/lib/grh-workforce-finance-snapshot.js';

const ARTIFACT = JSON.parse(await readFile(
  new URL('../api/_data/grh-workforce-finance.json', import.meta.url),
  'utf8',
));
const KEY = Buffer.alloc(32, 7).toString('base64url');
const WRONG_KEY = Buffer.alloc(32, 8).toString('base64url');
const TENANT_ID = 'tenant-junin';
const PINS = Object.freeze({
  expectedSourceSha256: ARTIFACT.source.sha256,
  expectedSnapshotAsOf: ARTIFACT.source.snapshot_as_of,
  expectedReleaseId: ARTIFACT.release_id,
  expectedPolicyVersion: ARTIFACT.policy_version,
});

function envelope(tenantId = TENANT_ID) {
  return createGrhWorkforceFinanceSnapshotEnvelope({
    tenantId,
    artifact: ARTIFACT,
    key: KEY,
    nonce: Buffer.alloc(12, tenantId === TENANT_ID ? 1 : 2),
    ...PINS,
  });
}

test.beforeEach(() => clearGrhWorkforceFinanceSnapshotCache());

test('workforce-finance snapshot is an exact AES-256-GCM gzip envelope with full authenticated identity', () => {
  assert.equal(inspectGrhWorkforceFinanceSourceContract(ARTIFACT).ok, true);
  const encrypted = envelope();
  assert.deepEqual(Object.keys(encrypted).sort(), [
    'aad', 'authTag', 'cellCount', 'cipher', 'ciphertext', 'compressedBytes',
    'compression', 'dimensionPeriodCount', 'dimensionViewCount', 'keyVersion', 'kind',
    'nonce', 'periodCount', 'plaintextBytes', 'policyVersion', 'releaseId',
    'snapshotAsOf', 'sourceSchema', 'sourceSha256',
  ].sort());
  assert.equal(GRH_WORKFORCE_FINANCE_SNAPSHOT_ACTION,
    'GRH_WORKFORCE_FINANCE_SNAPSHOT_PAYLOAD_V1');
  assert.equal(GRH_WORKFORCE_FINANCE_SNAPSHOT_ENTITY,
    'GRH_WORKFORCE_FINANCE_SNAPSHOT');
  assert.equal(encrypted.cipher, 'aes-256-gcm');
  assert.equal(Buffer.from(encrypted.nonce, 'base64url').length, 12);
  assert.equal(Buffer.from(encrypted.authTag, 'base64url').length, 16);
  assert.deepEqual(encrypted.aad, {
    tenantId: TENANT_ID,
    sourceSchema: ARTIFACT.schema_version,
    sourceSha256: ARTIFACT.source.sha256,
    snapshotAsOf: ARTIFACT.source.snapshot_as_of,
    releaseId: ARTIFACT.release_id,
    policyVersion: ARTIFACT.policy_version,
    keyVersion: 'v1',
    compression: 'gzip',
  });
  assert.doesNotMatch(JSON.stringify(encrypted), /SERVICIOS PUBLICOS|net_payroll_cents/u);

  const decrypted = decryptGrhWorkforceFinanceSnapshotEnvelope({
    tenantId: TENANT_ID,
    envelope: encrypted,
    key: KEY,
    ...PINS,
  });
  assert.deepEqual(decrypted, ARTIFACT);
  assert.equal(Object.isFrozen(decrypted), true);
  assert.equal(Object.isFrozen(decrypted.dimension_views[0].periods[0]), true);
});

test('snapshot rejects wrong key, tag/ciphertext tampering, tenant swap and metadata pin drift', () => {
  assert.equal(ARTIFACT.release_id, GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID);
  const encrypted = envelope();
  for (const [mutate, expectedCode] of [
    [value => ({ ...value, authTag: Buffer.alloc(16, 3).toString('base64url') }),
      'GRH_WORKFORCE_FINANCE_SNAPSHOT_AUTH_INVALID'],
    [value => ({
      ...value,
      ciphertext: `${value.ciphertext[0] === 'A' ? 'B' : 'A'}${value.ciphertext.slice(1)}`,
    }),
      'GRH_WORKFORCE_FINANCE_SNAPSHOT_AUTH_INVALID'],
    [value => ({ ...value, cellCount: value.cellCount + 1 }),
      'GRH_WORKFORCE_FINANCE_SNAPSHOT_COUNT_MISMATCH'],
  ]) {
    assert.throws(() => decryptGrhWorkforceFinanceSnapshotEnvelope({
      tenantId: TENANT_ID,
      envelope: mutate(structuredClone(encrypted)),
      key: KEY,
      ...PINS,
    }), error => error.code === expectedCode);
  }
  assert.throws(() => decryptGrhWorkforceFinanceSnapshotEnvelope({
    tenantId: TENANT_ID, envelope: encrypted, key: WRONG_KEY, ...PINS,
  }), error => error.code === 'GRH_WORKFORCE_FINANCE_SNAPSHOT_AUTH_INVALID');
  assert.throws(() => decryptGrhWorkforceFinanceSnapshotEnvelope({
    tenantId: 'tenant-other', envelope: encrypted, key: KEY, ...PINS,
  }), error => error.code === 'GRH_WORKFORCE_FINANCE_SNAPSHOT_AAD_INVALID');
  assert.throws(() => decryptGrhWorkforceFinanceSnapshotEnvelope({
    tenantId: TENANT_ID,
    envelope: encrypted,
    key: KEY,
    ...PINS,
    expectedSourceSha256: 'b'.repeat(64),
  }), error => error.code === 'GRH_WORKFORCE_FINANCE_SNAPSHOT_PIN_MISMATCH');
  assert.throws(() => createGrhWorkforceFinanceSnapshotEnvelope({
    tenantId: TENANT_ID,
    artifact: ARTIFACT,
    key: `${KEY}=`,
  }), error => error.code === 'GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_INVALID');

  const economicMutation = structuredClone(ARTIFACT);
  economicMutation.period_totals[0].components.employer_contributions_cents += 1;
  for (const view of economicMutation.dimension_views) {
    const protectedCell = view.periods[0].cells.find(
      cell => cell.privacy_status === 'protected_aggregate',
    );
    assert.ok(protectedCell);
    protectedCell.components.employer_contributions_cents += 1;
  }
  economicMutation.release_id = computeGrhWorkforceFinanceReleaseId(economicMutation);
  assert.equal(inspectGrhWorkforceFinanceSourceContract(economicMutation).ok, true);
  assert.notEqual(economicMutation.release_id, GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID);
  assert.throws(() => createGrhWorkforceFinanceSnapshotEnvelope({
    tenantId: TENANT_ID,
    artifact: economicMutation,
    key: KEY,
    expectedReleaseId: economicMutation.release_id,
  }), error => error.code === 'GRH_WORKFORCE_FINANCE_SNAPSHOT_PIN_MISMATCH');
});

test('encoded size caps and bounded gunzip reject oversized envelopes and expansion bombs', () => {
  const encrypted = envelope();
  const oversized = structuredClone(encrypted);
  oversized.ciphertext = Buffer.alloc(2 * 1024 * 1024 + 1, 1).toString('base64url');
  assert.throws(() => decryptGrhWorkforceFinanceSnapshotEnvelope({
    tenantId: TENANT_ID, envelope: oversized, key: KEY, ...PINS,
  }), error => error.code === 'GRH_WORKFORCE_FINANCE_SNAPSHOT_ENVELOPE_INVALID');

  const bomb = structuredClone(encrypted);
  const expandedBomb = Buffer.alloc(16 * 1024 * 1024 + 1, 0x20);
  const compressedBomb = gzipSync(expandedBomb, { level: 9 });
  const nonce = Buffer.alloc(12, 4);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(KEY, 'base64url'), nonce, {
    authTagLength: 16,
  });
  cipher.setAAD(Buffer.from(JSON.stringify(bomb.aad), 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(compressedBomb), cipher.final()]);
  bomb.nonce = nonce.toString('base64url');
  bomb.authTag = cipher.getAuthTag().toString('base64url');
  bomb.ciphertext = ciphertext.toString('base64url');
  bomb.compressedBytes = compressedBomb.length;
  bomb.plaintextBytes = 16 * 1024 * 1024;
  assert.throws(() => decryptGrhWorkforceFinanceSnapshotEnvelope({
    tenantId: TENANT_ID, envelope: bomb, key: KEY, ...PINS,
  }), error => error.code === 'GRH_WORKFORCE_FINANCE_SNAPSHOT_SIZE_INVALID');
});

test('snapshot loader issues one exact tenant-bound parameterized query and rejects row/key drift', async () => {
  const encrypted = envelope();
  const calls = [];
  const result = await loadGrhWorkforceFinanceSnapshotArtifact({
    tenantId: TENANT_ID,
    key: KEY,
    queryImpl: async (sql, values) => {
      calls.push({ sql, values });
      return { rows: [{ details: encrypted }] };
    },
    ...PINS,
  });
  assert.equal(result.release_id, ARTIFACT.release_id);
  assert.deepEqual(calls, [{
    sql: READ_GRH_WORKFORCE_FINANCE_SNAPSHOT_SQL,
    values: [TENANT_ID, GRH_WORKFORCE_FINANCE_SNAPSHOT_ACTION,
      GRH_WORKFORCE_FINANCE_SNAPSHOT_ENTITY],
  }]);
  assert.match(calls[0].sql, /WHERE "tenantId" = \$1/u);
  assert.doesNotMatch(calls[0].sql, new RegExp(TENANT_ID, 'u'));

  let missingKeyQueries = 0;
  await assert.rejects(loadGrhWorkforceFinanceSnapshotArtifact({
    tenantId: TENANT_ID,
    key: undefined,
    queryImpl: async () => { missingKeyQueries += 1; return { rows: [{ details: encrypted }] }; },
    ...PINS,
  }), error => error.code === 'GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_INVALID');
  assert.equal(missingKeyQueries, 0);
  await assert.rejects(loadGrhWorkforceFinanceSnapshotArtifact({
    tenantId: TENANT_ID,
    key: KEY,
    queryImpl: async () => ({ rows: [{ details: encrypted, extra: true }] }),
    ...PINS,
  }), error => error.code === 'GRH_WORKFORCE_FINANCE_SNAPSHOT_SOURCE_UNAVAILABLE');
});

test('artifact loader accepts only the explicit encrypted_snapshot mode and retains active bundle pins', async () => {
  const encrypted = envelope();
  const loaded = await loadGrhWorkforceFinanceArtifact({
    tenantId: TENANT_ID,
    expectedSourceSha256: ARTIFACT.source.sha256,
    expectedSnapshotAsOf: ARTIFACT.source.snapshot_as_of,
    environment: {
      NODE_ENV: 'production',
      GRH_WORKFORCE_FINANCE_ARTIFACT_SOURCE: 'encrypted_snapshot',
      GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_V1: KEY,
    },
    queryImpl: async (sql, values) => {
      assert.equal(sql, READ_GRH_WORKFORCE_FINANCE_SNAPSHOT_SQL);
      assert.deepEqual(values, [TENANT_ID, GRH_WORKFORCE_FINANCE_SNAPSHOT_ACTION,
        GRH_WORKFORCE_FINANCE_SNAPSHOT_ENTITY]);
      return { rows: [{ details: encrypted }] };
    },
  });
  assert.equal(loaded.tenantId, TENANT_ID);
  assert.equal(loaded.payload.release_id, ARTIFACT.release_id);

  await assert.rejects(loadGrhWorkforceFinanceArtifact({
    tenantId: TENANT_ID,
    expectedSourceSha256: 'b'.repeat(64),
    expectedSnapshotAsOf: ARTIFACT.source.snapshot_as_of,
    environment: {
      GRH_WORKFORCE_FINANCE_ARTIFACT_SOURCE: 'encrypted_snapshot',
      GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_V1: KEY,
    },
    queryImpl: async () => ({ rows: [{ details: encrypted }] }),
  }), error => error.code === 'GRH_WORKFORCE_FINANCE_SNAPSHOT_PIN_MISMATCH');

  let releaseDriftQueries = 0;
  await assert.rejects(loadGrhWorkforceFinanceArtifact({
    tenantId: TENANT_ID,
    expectedSourceSha256: ARTIFACT.source.sha256,
    expectedSnapshotAsOf: ARTIFACT.source.snapshot_as_of,
    expectedReleaseId: 'b'.repeat(64),
    environment: {
      GRH_WORKFORCE_FINANCE_ARTIFACT_SOURCE: 'encrypted_snapshot',
      GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_V1: KEY,
    },
    queryImpl: async () => {
      releaseDriftQueries += 1;
      return { rows: [{ details: encrypted }] };
    },
  }), error => error.code === 'GRH_WORKFORCE_FINANCE_RELEASE_ID_INVALID');
  assert.equal(releaseDriftQueries, 0);
});
