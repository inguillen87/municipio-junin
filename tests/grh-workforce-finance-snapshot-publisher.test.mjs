import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  computeGrhWorkforceFinanceReleaseId,
  GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
  inspectGrhWorkforceFinanceSourceContract,
} from '../api/lib/grh-workforce-finance-source-contract.js';
import {
  GRH_WORKFORCE_FINANCE_SNAPSHOT_ACTION,
  GRH_WORKFORCE_FINANCE_SNAPSHOT_ENTITY,
} from '../api/lib/grh-workforce-finance-snapshot.js';
import {
  FIND_GRH_WORKFORCE_FINANCE_SNAPSHOT_OPERATION_SQL,
  GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_ACTION,
  GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_DATABASE_ENV,
  INSERT_GRH_WORKFORCE_FINANCE_SNAPSHOT_PAYLOAD_SQL,
  publishGrhWorkforceFinanceSnapshot,
  READ_ACTIVE_GRH_WORKFORCE_FINANCE_SNAPSHOT_SQL,
  READ_BACK_GRH_WORKFORCE_FINANCE_SNAPSHOT_SQL,
  runGrhWorkforceFinanceSnapshotPublisherCli,
} from '../scripts/publish-grh-workforce-finance-snapshot.mjs';

const ARTIFACT_URL = new URL('../api/_data/grh-workforce-finance.json', import.meta.url);
const ARTIFACT_PATH = fileURLToPath(ARTIFACT_URL);
const ARTIFACT = JSON.parse(await readFile(ARTIFACT_URL, 'utf8'));
const KEY = Buffer.alloc(32, 9).toString('base64url');
const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const ENTITY_ID = '22222222-2222-4222-8222-222222222222';
const TENANT_ID = 'tenant-junin';
const LOG_IDS = [
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
];
const RECEIPT_KEYS = [
  'artifactSha256', 'envelopeSha256', 'ciphertextSha256', 'plaintextBytes',
  'compressedBytes', 'periodCount', 'dimensionViewCount', 'dimensionPeriodCount',
  'cellCount', 'createdCount', 'reusedCount',
];

function jsonbReordered(value) {
  if (Array.isArray(value)) return value.map(jsonbReordered);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().reverse().map(
    key => [key, jsonbReordered(value[key])],
  ));
}

function publishOptions(client, overrides = {}) {
  let nextId = 0;
  return {
    tenantId: TENANT_ID,
    operationId: OPERATION_ID,
    entityId: ENTITY_ID,
    artifact: ARTIFACT,
    key: KEY,
    expectedSourceSha256: ARTIFACT.source.sha256,
    expectedSnapshotAsOf: ARTIFACT.source.snapshot_as_of,
    expectedReleaseId: ARTIFACT.release_id,
    expectedPolicyVersion: ARTIFACT.policy_version,
    client,
    nonce: Buffer.alloc(12, 5),
    randomUuidImpl: () => LOG_IDS[nextId++],
    ...overrides,
  };
}

function cliArguments() {
  return [
    '--artifact', ARTIFACT_PATH,
    '--tenant-id', TENANT_ID,
    '--operation-id', OPERATION_ID,
    '--entity-id', ENTITY_ID,
    '--source-sha256', ARTIFACT.source.sha256,
    '--snapshot-as-of', ARTIFACT.source.snapshot_as_of,
    '--release-id', ARTIFACT.release_id,
    '--policy-version', ARTIFACT.policy_version,
  ];
}

function economicallyMutatedArtifact() {
  const mutation = structuredClone(ARTIFACT);
  mutation.period_totals[0].components.employer_contributions_cents += 1;
  for (const view of mutation.dimension_views) {
    const protectedCell = view.periods[0].cells.find(
      cell => cell.privacy_status === 'protected_aggregate',
    );
    assert.ok(protectedCell, `protected aggregate required for ${view.dimension}`);
    protectedCell.components.employer_contributions_cents += 1;
  }
  mutation.release_id = computeGrhWorkforceFinanceReleaseId(mutation);
  return mutation;
}

class AuditLogClient {
  constructor({
    failEventInsert = false,
    corruptReadBack = false,
    reorderJsonb = true,
  } = {}) {
    this.rows = [];
    this.calls = [];
    this.transactionBackup = null;
    this.failEventInsert = failEventInsert;
    this.corruptReadBack = corruptReadBack;
    this.reorderJsonb = reorderJsonb;
  }

  async query(sql, values = []) {
    this.calls.push({ sql, values });
    if (sql === 'BEGIN') {
      this.transactionBackup = structuredClone(this.rows);
      return { rows: [] };
    }
    if (sql === 'COMMIT') {
      this.transactionBackup = null;
      return { rows: [] };
    }
    if (sql === 'ROLLBACK') {
      this.rows = this.transactionBackup || [];
      this.transactionBackup = null;
      return { rows: [] };
    }
    if (/pg_advisory_xact_lock/u.test(sql)) return { rows: [{}] };
    if (sql === FIND_GRH_WORKFORCE_FINANCE_SNAPSHOT_OPERATION_SQL) {
      const [tenantId, action, entity, entityId, operationId] = values;
      return {
        rows: this.rows
          .filter(row => row.tenantId === tenantId && row.action === action &&
            row.entity === entity &&
            (row.entityId === entityId || row.details?.operationId === operationId))
          .map(row => ({
            entity_id: row.entityId,
            details: this.reorderJsonb
              ? jsonbReordered(row.details)
              : structuredClone(row.details),
          })),
      };
    }
    if (sql === INSERT_GRH_WORKFORCE_FINANCE_SNAPSHOT_PAYLOAD_SQL) {
      const [id, tenantId, action, entity, entityId, rawDetails] = values;
      if (this.failEventInsert && action === GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_ACTION) {
        throw new Error('injected event insert failure');
      }
      this.rows.push({
        id,
        tenantId,
        action,
        entity,
        entityId,
        details: JSON.parse(rawDetails),
      });
      return { rowCount: 1, rows: [] };
    }
    if (sql === READ_BACK_GRH_WORKFORCE_FINANCE_SNAPSHOT_SQL) {
      const [id, tenantId, action, entity, entityId] = values;
      const row = this.rows.find(item => item.id === id && item.tenantId === tenantId &&
        item.action === action && item.entity === entity && item.entityId === entityId);
      if (!row) return { rows: [] };
      const details = structuredClone(row.details);
      if (this.corruptReadBack) {
        details.authTag = Buffer.alloc(16, 6).toString('base64url');
      }
      return { rows: [{ details: this.reorderJsonb ? jsonbReordered(details) : details }] };
    }
    if (sql === READ_ACTIVE_GRH_WORKFORCE_FINANCE_SNAPSHOT_SQL) {
      const [tenantId, action, entity] = values;
      const row = this.rows
        .filter(item => item.tenantId === tenantId && item.action === action &&
          item.entity === entity)
        .at(-1);
      if (!row) return { rows: [] };
      return { rows: [{
        id: row.id,
        entity_id: row.entityId,
        details: this.reorderJsonb
          ? jsonbReordered(row.details)
          : structuredClone(row.details),
      }] };
    }
    throw new Error(`unexpected query: ${sql}`);
  }
}

test('publisher appends an encrypted payload and small event, then verifies read-back before commit', async () => {
  const client = new AuditLogClient();
  const receipt = await publishGrhWorkforceFinanceSnapshot(publishOptions(client));
  assert.deepEqual(Object.keys(receipt).sort(), [...RECEIPT_KEYS].sort());
  assert.equal(receipt.createdCount, 1);
  assert.equal(receipt.reusedCount, 0);
  assert.match(receipt.artifactSha256, /^[0-9a-f]{64}$/u);
  assert.match(receipt.envelopeSha256, /^[0-9a-f]{64}$/u);
  assert.match(receipt.ciphertextSha256, /^[0-9a-f]{64}$/u);
  assert.equal(client.rows.length, 2);

  const payload = client.rows.find(row => row.action === GRH_WORKFORCE_FINANCE_SNAPSHOT_ACTION);
  const event = client.rows.find(
    row => row.action === GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_ACTION,
  );
  assert.equal(payload.entity, GRH_WORKFORCE_FINANCE_SNAPSHOT_ENTITY);
  assert.equal(payload.entityId, ENTITY_ID);
  assert.equal(typeof payload.details.ciphertext, 'string');
  assert.equal(event.entityId, ENTITY_ID);
  assert.equal(event.details.operationId, OPERATION_ID);
  assert.equal(Object.hasOwn(event.details, 'ciphertext'), false);
  assert.equal(Object.hasOwn(event.details, 'authTag'), false);
  assert.equal(Object.hasOwn(event.details, 'aad'), false);
  assert.doesNotMatch(JSON.stringify(event.details), /snapshot-key/i);
  assert.doesNotMatch(JSON.stringify(receipt), new RegExp(KEY, 'u'));

  const sqlText = client.calls.map(call => call.sql);
  const payloadInsert = sqlText.indexOf(INSERT_GRH_WORKFORCE_FINANCE_SNAPSHOT_PAYLOAD_SQL);
  const eventInsert = sqlText.indexOf(
    INSERT_GRH_WORKFORCE_FINANCE_SNAPSHOT_PAYLOAD_SQL,
    payloadInsert + 1,
  );
  const readBack = sqlText.indexOf(READ_BACK_GRH_WORKFORCE_FINANCE_SNAPSHOT_SQL);
  const activeRead = sqlText.indexOf(READ_ACTIVE_GRH_WORKFORCE_FINANCE_SNAPSHOT_SQL);
  const commit = sqlText.indexOf('COMMIT');
  assert.ok(payloadInsert > sqlText.indexOf(FIND_GRH_WORKFORCE_FINANCE_SNAPSHOT_OPERATION_SQL));
  assert.ok(eventInsert > payloadInsert);
  assert.ok(readBack > eventInsert);
  assert.ok(activeRead > readBack);
  assert.ok(commit > activeRead);
  assert.match(INSERT_GRH_WORKFORCE_FINANCE_SNAPSHOT_PAYLOAD_SQL, /clock_timestamp\(\)/u);
  assert.match(INSERT_GRH_WORKFORCE_FINANCE_SNAPSHOT_PAYLOAD_SQL, /\$1/u);
  assert.doesNotMatch(INSERT_GRH_WORKFORCE_FINANCE_SNAPSHOT_PAYLOAD_SQL,
    new RegExp(`${TENANT_ID}|${ENTITY_ID}`, 'u'));
});

test('publisher is idempotent by the exact operation/entity pair and performs no second insert', async () => {
  const client = new AuditLogClient();
  const first = await publishGrhWorkforceFinanceSnapshot(publishOptions(client));
  const callsBefore = client.calls.length;
  const second = await publishGrhWorkforceFinanceSnapshot(publishOptions(client));
  assert.equal(first.createdCount, 1);
  assert.equal(second.createdCount, 0);
  assert.equal(second.reusedCount, 1);
  assert.equal(second.artifactSha256, first.artifactSha256);
  assert.equal(second.envelopeSha256, first.envelopeSha256);
  assert.equal(client.rows.length, 2);
  assert.equal(client.calls.slice(callsBefore).some(
    call => call.sql === INSERT_GRH_WORKFORCE_FINANCE_SNAPSHOT_PAYLOAD_SQL,
  ), false);
});

test('publisher rejects operation/entity reuse conflicts and rolls the transaction back', async () => {
  const client = new AuditLogClient();
  await publishGrhWorkforceFinanceSnapshot(publishOptions(client));
  const baseline = structuredClone(client.rows);

  await assert.rejects(publishGrhWorkforceFinanceSnapshot(publishOptions(client, {
    entityId: '55555555-5555-4555-8555-555555555555',
  })), error => error.code ===
    'GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_IDEMPOTENCY_CONFLICT');
  assert.deepEqual(client.rows, baseline);

  await assert.rejects(publishGrhWorkforceFinanceSnapshot(publishOptions(client, {
    operationId: '66666666-6666-4666-8666-666666666666',
  })), error => error.code ===
    'GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_IDEMPOTENCY_CONFLICT');
  assert.deepEqual(client.rows, baseline);
  assert.equal(client.calls.filter(call => call.sql === 'ROLLBACK').length, 2);
});

test('tenant-global activation is serialized and an old idempotency retry cannot claim active success', async () => {
  const client = new AuditLogClient();
  await publishGrhWorkforceFinanceSnapshot(publishOptions(client));
  const secondOperation = '77777777-7777-4777-8777-777777777777';
  const secondEntity = '88888888-8888-4888-8888-888888888888';
  const secondIds = [
    '99999999-9999-4999-8999-999999999999',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ];
  let secondIdIndex = 0;
  await publishGrhWorkforceFinanceSnapshot(publishOptions(client, {
    operationId: secondOperation,
    entityId: secondEntity,
    nonce: Buffer.alloc(12, 6),
    randomUuidImpl: () => secondIds[secondIdIndex++],
  }));

  const activeLockValues = client.calls
    .filter(call => /pg_advisory_xact_lock/u.test(call.sql) &&
      String(call.values[0]).includes(':active:'))
    .map(call => call.values[0]);
  assert.deepEqual(activeLockValues, [
    `workforce-finance-snapshot:active:${TENANT_ID}`,
    `workforce-finance-snapshot:active:${TENANT_ID}`,
  ]);
  const activePayload = client.rows
    .filter(row => row.action === GRH_WORKFORCE_FINANCE_SNAPSHOT_ACTION)
    .at(-1);
  assert.equal(activePayload.entityId, secondEntity);

  await assert.rejects(
    publishGrhWorkforceFinanceSnapshot(publishOptions(client)),
    error => error.code === 'GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_NOT_ACTIVE',
  );
  assert.equal(client.rows.filter(
    row => row.action === GRH_WORKFORCE_FINANCE_SNAPSHOT_ACTION,
  ).length, 2);
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
});

test('publisher rolls back payload/event inserts on event or read-back failure', async t => {
  await t.test('event insert failure', async () => {
    const client = new AuditLogClient({ failEventInsert: true });
    await assert.rejects(
      publishGrhWorkforceFinanceSnapshot(publishOptions(client)),
      error => error.code === 'GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_DATABASE_ERROR',
    );
    assert.deepEqual(client.rows, []);
    assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
  });
  await t.test('authenticated read-back failure', async () => {
    const client = new AuditLogClient({ corruptReadBack: true });
    await assert.rejects(
      publishGrhWorkforceFinanceSnapshot(publishOptions(client)),
      error => error.code === 'GRH_WORKFORCE_FINANCE_SNAPSHOT_AUTH_INVALID',
    );
    assert.deepEqual(client.rows, []);
    assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
  });
});

test('publisher validates raw contract, all pins and canonical key before opening a transaction', async () => {
  assert.equal(ARTIFACT.release_id, GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID);
  const canonicalSystemDrift = structuredClone(ARTIFACT);
  canonicalSystemDrift.source.canonical_system = 'GRH Mars';
  const sourceFileDrift = structuredClone(ARTIFACT);
  sourceFileDrift.source.file = 'grh_junin.fake.sql.gz';
  const compressedSizeDrift = structuredClone(ARTIFACT);
  compressedSizeDrift.source.compressed_size_bytes = 1;
  const economicMutation = economicallyMutatedArtifact();
  assert.notEqual(economicMutation.release_id, GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID);
  assert.equal(inspectGrhWorkforceFinanceSourceContract(economicMutation).ok, true);
  for (const overrides of [
    { expectedSourceSha256: 'b'.repeat(64) },
    { expectedSnapshotAsOf: '2026-08-07' },
    { expectedReleaseId: 'c'.repeat(64) },
    { expectedPolicyVersion: 'privacy-v0' },
    { key: `${KEY}=` },
    { artifact: { ...ARTIFACT, unexpected: true } },
    { artifact: canonicalSystemDrift },
    { artifact: sourceFileDrift },
    { artifact: compressedSizeDrift },
    { artifact: economicMutation, expectedReleaseId: economicMutation.release_id },
  ]) {
    const client = new AuditLogClient();
    await assert.rejects(publishGrhWorkforceFinanceSnapshot(
      publishOptions(client, overrides),
    ));
    assert.deepEqual(client.calls, []);
    assert.deepEqual(client.rows, []);
  }
});

test('publisher CLI requires a separate write credential and never falls back to runtime DATABASE_URL', async () => {
  const runtimeOnlyEnvironment = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://runtime:runtime-secret@localhost/runtime?sslmode=disable',
    GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_V1: KEY,
  };
  let stdout = '';
  await assert.rejects(runGrhWorkforceFinanceSnapshotPublisherCli({
    argv: cliArguments(),
    environment: runtimeOnlyEnvironment,
    stdout: { write: value => { stdout += value; } },
  }), error => error.code === 'DATABASE_URL_REQUIRED');
  assert.equal(stdout, '');

  await assert.rejects(runGrhWorkforceFinanceSnapshotPublisherCli({
    argv: cliArguments(),
    environment: {
      ...runtimeOnlyEnvironment,
      [GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_DATABASE_ENV]: 'https://invalid.example/db',
    },
    stdout: { write: value => { stdout += value; } },
  }), error => error.code === 'DATABASE_URL_INVALID');
  assert.equal(stdout, '');

  const publisherSource = await readFile(
    new URL('../scripts/publish-grh-workforce-finance-snapshot.mjs', import.meta.url),
    'utf8',
  );
  assert.match(publisherSource, /GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_DATABASE_URL/u);
  assert.doesNotMatch(publisherSource, /environment\.DATABASE_URL/u);
  assert.doesNotMatch(publisherSource, /(?:UPDATE|DELETE\s+FROM)\s+audit_logs/iu);
});
