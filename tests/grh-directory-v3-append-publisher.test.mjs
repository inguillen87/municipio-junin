import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import fs from 'node:fs/promises';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

import {
  CONFIRMATION,
  decryptPriorSnapshotForContinuity,
  DirectorySnapshotPublisherError,
  runCli,
} from '../scripts/publish-grh-directory-snapshot-v3.mjs';

const KEY = Buffer.alloc(32, 17).toString('base64url');
const TENANT = 'tenant-junin';
const SOURCE = 'a'.repeat(64);

function legacyEnvelope() {
  const artifact = {
    schema_version: 'grh-directory-v1',
    source: { sha256: SOURCE, snapshot_as_of: '2026-08-06' },
    records: [{ leave_history: [] }],
  };
  const aad = {
    tenantId: TENANT,
    schemaVersion: artifact.schema_version,
    sourceSha256: SOURCE,
    snapshotAsOf: '2026-08-06',
    keyVersion: 'v1',
    compression: 'gzip',
  };
  const nonce = Buffer.alloc(12, 3);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(KEY, 'base64url'), nonce);
  cipher.setAAD(Buffer.from(JSON.stringify(aad), 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(gzipSync(Buffer.from(JSON.stringify(artifact), 'utf8'))),
    cipher.final(),
  ]);
  return {
    kind: 'grh.directory.snapshot.v1',
    schemaVersion: artifact.schema_version,
    keyVersion: 'v1',
    compression: 'gzip',
    cipher: 'aes-256-gcm',
    sourceSha256: SOURCE,
    snapshotAsOf: '2026-08-06',
    recordCount: 1,
    leaveRecordCount: 0,
    positionObservationCount: 0,
    nonce: nonce.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
    aad,
  };
}

test('retained production key decrypts the prior envelope before any append', () => {
  const artifact = decryptPriorSnapshotForContinuity({
    tenantId: TENANT,
    envelope: legacyEnvelope(),
    key: KEY,
  });
  assert.equal(artifact.schema_version, 'grh-directory-v1');
  assert.equal(artifact.source.sha256, SOURCE);
  assert.equal(artifact.records.length, 1);
  assert.throws(() => decryptPriorSnapshotForContinuity({
    tenantId: TENANT,
    envelope: legacyEnvelope(),
    key: Buffer.alloc(32, 18).toString('base64url'),
  }), error => error instanceof DirectorySnapshotPublisherError &&
      error.code === 'DIRECTORY_V3_KEY_CONTINUITY_FAILED');
});

test('publisher source is append-only and excludes DDL, users and environment mutation', async () => {
  const source = await fs.readFile(new URL('../scripts/publish-grh-directory-snapshot-v3.mjs', import.meta.url), 'utf8');
  assert.match(source, /INSERT INTO audit_logs/);
  assert.match(source, /BEGIN ISOLATION LEVEL SERIALIZABLE/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /decryptPriorSnapshotForContinuity/);
  assert.match(source, /DIRECTORY_V3_COMMIT_READBACK_MISMATCH/);
  assert.doesNotMatch(source, /INSERT INTO users/i);
  assert.doesNotMatch(source, /(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|SCHEMA)/i);
  assert.doesNotMatch(source, /vercel\W+env\W+(?:add|rm)/i);
});

test('CLI fails closed without exact explicit production confirmation', async () => {
  await assert.rejects(
    () => runCli(['--confirm-production-append-only', CONFIRMATION + '-wrong']),
    error => error instanceof DirectorySnapshotPublisherError &&
      error.code === 'DIRECTORY_V3_CONFIRMATION_REQUIRED',
  );
});
