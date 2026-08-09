import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach } from 'node:test';

import {
  inspectMigrationGate,
  inspectOfflineMigrationGate,
} from '../scripts/assert-prisma-migrations.mjs';

const temporaryRoots = [];
const NOW = new Date('2026-08-08T18:00:00.000Z');

afterEach(() => {
  while (temporaryRoots.length) {
    const target = temporaryRoots.pop();
    if (target.startsWith(os.tmpdir())) fs.rmSync(target, { recursive: true, force: true });
  }
});

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function tempDirectory(prefix) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryRoots.push(target);
  return target;
}

function writeUtf8(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function buildFixture() {
  const repoRoot = tempDirectory('municontrol-prisma-gate-repo-');
  const migrationsRoot = path.join(repoRoot, 'prisma', 'migrations');
  const migrationDirectory = '20260808000000_baseline';
  writeUtf8(path.join(repoRoot, 'package.json'), JSON.stringify({ devDependencies: { prisma: '^5.22.0' } }));
  writeUtf8(path.join(repoRoot, 'prisma', 'schema.prisma'), [
    'generator client {',
    '  provider = "prisma-client-js"',
    '}',
    'datasource db {',
    '  provider = "postgresql"',
    '  url = env("DATABASE_URL")',
    '}',
    '',
  ].join('\n'));
  writeUtf8(path.join(migrationsRoot, 'migration_lock.toml'), 'provider = "postgresql"\n');
  writeUtf8(path.join(migrationsRoot, migrationDirectory, 'migration.sql'), 'CREATE TABLE "baseline_probe" ("id" TEXT PRIMARY KEY);\n');

  const migration = {
    directory: migrationDirectory,
    sha256: digest('CREATE TABLE "baseline_probe" ("id" TEXT PRIMARY KEY);\n'),
  };
  const migrations = [migration];
  const schemaSha256 = digest(fs.readFileSync(path.join(repoRoot, 'prisma', 'schema.prisma'), 'utf8'));
  const migrationHistorySha256 = digest(JSON.stringify(migrations));
  const baselineId = `prisma-baseline-${digest(JSON.stringify({
    provider: 'postgresql',
    prismaMajor: 5,
    baselineMigration: migration,
  }))}`;
  const migrationSetId = `prisma-set-${digest(JSON.stringify({
    baselineId,
    schemaSha256,
    migrationHistorySha256,
    migrations,
  }))}`;
  const manifest = {
    contractVersion: 1,
    provider: 'postgresql',
    prismaMajor: 5,
    baselineId,
    baselineMigration: migration,
    schemaSha256,
    migrationHistorySha256,
    migrationSetId,
    migrations,
  };
  writeUtf8(path.join(migrationsRoot, 'baseline-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const env = {
    PRISMA_BASELINE_ID: baselineId,
    PRISMA_MIGRATION_SET_ID: migrationSetId,
  };
  return { repoRoot, migrationsRoot, migrationDirectory, manifest, env };
}

function attachValidReceipt(fixture, overrides = {}) {
  const receiptRoot = tempDirectory('municontrol-prisma-gate-receipt-');
  const receiptPath = path.join(receiptRoot, 'drift-receipt.json');
  const receipt = {
    contractVersion: 1,
    baselineId: fixture.manifest.baselineId,
    migrationSetId: fixture.manifest.migrationSetId,
    targetId: 'staging-junin',
    checkedAt: '2026-08-08T17:30:00.000Z',
    expiresAt: '2026-08-08T18:30:00.000Z',
    issuer: {
      tool: 'municipal-db-auditor',
      version: '1.0',
      runId: 'run:20260808-001',
    },
    database: {
      schemaFingerprintSha256: '1'.repeat(64),
      migrationStateSha256: '2'.repeat(64),
    },
    checks: {
      migrateStatus: 'history_consistent',
      driftStatus: 'no_unexpected_drift',
      restoreStatus: 'passed',
    },
    artifacts: {
      migrateStatusSha256: '3'.repeat(64),
      driftReportSha256: '4'.repeat(64),
      backupEvidenceRef: 'artifact:backup-001',
      restoreEvidenceRef: 'artifact:restore-001',
    },
    pendingMigrations: [fixture.migrationDirectory],
    reviewerIds: ['reviewer:dba-01', 'reviewer:security-02'],
    ...overrides,
  };
  writeUtf8(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return {
    ...fixture.env,
    PRISMA_TARGET_ID: receipt.targetId,
    PRISMA_DRIFT_RECEIPT_PATH: receiptPath,
    PRISMA_DRIFT_RECEIPT_SHA256: digest(fs.readFileSync(receiptPath)),
  };
}

test('the real checkout remains fail-closed until a reviewed Prisma history exists', () => {
  const result = inspectOfflineMigrationGate({ env: {} });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.code === 'MIGRATIONS_MISSING'));
});

test('offline gate binds immutable baseline separately from the complete migration set', () => {
  const fixture = buildFixture();
  const result = inspectMigrationGate({ mode: 'offline', repoRoot: fixture.repoRoot, env: fixture.env, now: NOW });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.baselineId, fixture.manifest.baselineId);
  assert.equal(result.migrationSetId, fixture.manifest.migrationSetId);
  assert.equal(result.migrationCount, 1);
});

test('offline gate rejects a schema provider that disagrees with the PostgreSQL history', () => {
  const fixture = buildFixture();
  const schemaPath = path.join(fixture.repoRoot, 'prisma', 'schema.prisma');
  const schema = fs.readFileSync(schemaPath, 'utf8').replace('provider = "postgresql"', 'provider = "mysql"');
  writeUtf8(schemaPath, schema);
  const result = inspectMigrationGate({ mode: 'offline', repoRoot: fixture.repoRoot, env: fixture.env, now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.code === 'SCHEMA_PROVIDER_INVALID'));
});

test('release gate parses fresh connected evidence but never trusts self-attested approval', () => {
  const fixture = buildFixture();
  const env = attachValidReceipt(fixture);
  const result = inspectMigrationGate({ mode: 'release', repoRoot: fixture.repoRoot, env, now: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.targetId, 'staging-junin');
  assert.ok(result.errors.some(error => error.code === 'RELEASE_ATTESTATION_NOT_GOVERNED'));
});

test('tampered migration and ungoverned extra files are rejected', () => {
  const fixture = buildFixture();
  writeUtf8(path.join(fixture.migrationsRoot, fixture.migrationDirectory, 'migration.sql'), 'DROP TABLE "baseline_probe";\n');
  writeUtf8(path.join(fixture.migrationsRoot, 'notes.txt'), 'not governed\n');
  const result = inspectMigrationGate({ mode: 'offline', repoRoot: fixture.repoRoot, env: fixture.env, now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.code === 'MIGRATION_ROOT_EXTRA'));
  assert.ok(result.errors.some(error => error.code === 'MIGRATION_SET_MISMATCH'));
});

test('release receipt inside the repository is rejected even when its hash is pinned', () => {
  const fixture = buildFixture();
  const externalEnv = attachValidReceipt(fixture);
  const insidePath = path.join(fixture.repoRoot, 'private-receipt.json');
  fs.copyFileSync(externalEnv.PRISMA_DRIFT_RECEIPT_PATH, insidePath);
  const env = {
    ...externalEnv,
    PRISMA_DRIFT_RECEIPT_PATH: insidePath,
    PRISMA_DRIFT_RECEIPT_SHA256: digest(fs.readFileSync(insidePath)),
  };
  const result = inspectMigrationGate({ mode: 'release', repoRoot: fixture.repoRoot, env, now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.code === 'RECEIPT_INSIDE_REPOSITORY'));
});

test('release receipt inside the repository is rejected through an external junction', t => {
  const fixture = buildFixture();
  const externalEnv = attachValidReceipt(fixture);
  const insidePath = path.join(fixture.repoRoot, 'junction-receipt.json');
  fs.copyFileSync(externalEnv.PRISMA_DRIFT_RECEIPT_PATH, insidePath);
  const junctionRoot = tempDirectory('municontrol-prisma-gate-junction-');
  const junctionPath = path.join(junctionRoot, 'repo-link');
  try {
    fs.symlinkSync(fixture.repoRoot, junctionPath, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    t.skip(`junction unavailable: ${error.code || error.message}`);
    return;
  }
  const disguisedPath = path.join(junctionPath, 'junction-receipt.json');
  const env = {
    ...externalEnv,
    PRISMA_DRIFT_RECEIPT_PATH: disguisedPath,
    PRISMA_DRIFT_RECEIPT_SHA256: digest(fs.readFileSync(disguisedPath)),
  };
  const result = inspectMigrationGate({ mode: 'release', repoRoot: fixture.repoRoot, env, now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.code === 'RECEIPT_INSIDE_REPOSITORY'));
});

test('expired evidence and duplicate reviewers never authorize deployment', () => {
  const fixture = buildFixture();
  const env = attachValidReceipt(fixture, {
    checkedAt: '2026-08-08T16:00:00.000Z',
    expiresAt: '2026-08-08T17:00:00.000Z',
    reviewerIds: ['reviewer:dba-01', ' REVIEWER:DBA-01 '],
  });
  const result = inspectMigrationGate({ mode: 'release', repoRoot: fixture.repoRoot, env, now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.code === 'RECEIPT_TIME_INVALID'));
  assert.ok(result.errors.some(error => error.code === 'RECEIPT_REVIEWERS_INVALID'));
});

test('an explicit offline or release mode is mandatory', () => {
  const result = inspectMigrationGate({ mode: null });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map(error => error.code), ['MODE_REQUIRED']);
});
