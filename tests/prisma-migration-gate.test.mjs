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
import {
  canonicalManifestText,
  CANONICAL_MIGRATION_LOCK,
  deriveBaselineManifest,
} from '../shared/prisma-migration-contract.mjs';

const temporaryRoots = [];
const NOW = new Date('2026-08-08T18:00:00.000Z');
const PRISMA_VERSION = '5.22.0';
const ENGINE_VERSION = '5.22.0-44.605197351a3c8bdd595af2d2a9bc3025bca48ea2';
const TOOLCHAIN_PACKAGES = [
  '@prisma/client',
  '@prisma/debug',
  '@prisma/engines',
  '@prisma/engines-version',
  '@prisma/fetch-engine',
  '@prisma/get-platform',
  'prisma',
];

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

function toolchainLock() {
  const packages = {};
  for (const packageName of TOOLCHAIN_PACKAGES) {
    packages[`node_modules/${packageName}`] = {
      version: packageName === '@prisma/engines-version' ? ENGINE_VERSION : PRISMA_VERSION,
      resolved: `https://registry.npmjs.org/${packageName}/fixture.tgz`,
      integrity: `sha512-${digest(packageName)}`,
    };
  }
  return { lockfileVersion: 3, packages };
}

function writeToolchain(repoRoot) {
  const pkg = {
    dependencies: { '@prisma/client': PRISMA_VERSION },
    devDependencies: { prisma: PRISMA_VERSION },
  };
  const lock = toolchainLock();
  writeUtf8(path.join(repoRoot, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  writeUtf8(path.join(repoRoot, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
  writeUtf8(path.join(repoRoot, 'backend', 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  writeUtf8(path.join(repoRoot, 'backend', 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
}

function buildFixture() {
  const repoRoot = tempDirectory('municontrol-prisma-gate-repo-');
  const migrationsRoot = path.join(repoRoot, 'prisma', 'migrations');
  const migrationDirectory = '20260808000000_baseline';
  writeToolchain(repoRoot);
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
  writeUtf8(path.join(migrationsRoot, 'migration_lock.toml'), CANONICAL_MIGRATION_LOCK);
  writeUtf8(
    path.join(migrationsRoot, migrationDirectory, 'migration.sql'),
    'CREATE TABLE "baseline_probe" ("id" TEXT NOT NULL, CONSTRAINT "baseline_probe_pkey" PRIMARY KEY ("id"));\n',
  );

  const derived = deriveBaselineManifest({ repoRoot });
  assert.equal(derived.ok, true, JSON.stringify(derived.errors));
  writeUtf8(
    path.join(migrationsRoot, 'baseline-manifest.json'),
    canonicalManifestText(derived.manifest),
  );
  const env = {
    PRISMA_BASELINE_ID: derived.baselineId,
    PRISMA_MIGRATION_SET_ID: derived.migrationSetId,
  };
  return {
    repoRoot,
    migrationsRoot,
    migrationDirectory,
    manifest: derived.manifest,
    env,
  };
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

test('the real checkout has a reproducible offline baseline but still requires exact environment pins', () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve('prisma/migrations/baseline-manifest.json'), 'utf8'));
  const withoutPins = inspectOfflineMigrationGate({ env: {} });
  assert.equal(withoutPins.ok, false);
  assert.deepEqual(withoutPins.errors.map(error => error.code), ['ENVIRONMENT_PIN_MISMATCH']);

  const result = inspectOfflineMigrationGate({
    env: {
      PRISMA_BASELINE_ID: manifest.baselineId,
      PRISMA_MIGRATION_SET_ID: manifest.migrationSetId,
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.prismaVersion, PRISMA_VERSION);
  assert.deepEqual(result.baselineSql, {
    statementCount: 82,
    enum: 3,
    table: 25,
    index: 25,
    foreignKey: 29,
  });
});

test('offline gate binds immutable baseline separately from the complete migration set', () => {
  const fixture = buildFixture();
  const result = inspectMigrationGate({ mode: 'offline', repoRoot: fixture.repoRoot, env: fixture.env, now: NOW });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.baselineId, fixture.manifest.baselineId);
  assert.equal(result.migrationSetId, fixture.manifest.migrationSetId);
  assert.equal(result.migrationCount, 1);
  assert.equal(result.prismaEngineVersion, ENGINE_VERSION);
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
  assert.ok(result.errors.some(error => error.code === 'BASELINE_SQL_POLICY_VIOLATION'));
});

test('canonical lock, LF and exact Prisma toolchain are mandatory', () => {
  const fixture = buildFixture();
  writeUtf8(path.join(fixture.migrationsRoot, 'migration_lock.toml'), `${CANONICAL_MIGRATION_LOCK}extra = "unsafe"\n`);
  const migrationPath = path.join(fixture.migrationsRoot, fixture.migrationDirectory, 'migration.sql');
  fs.writeFileSync(migrationPath, fs.readFileSync(migrationPath, 'utf8').replaceAll('\n', '\r\n'), 'utf8');
  const backendPackagePath = path.join(fixture.repoRoot, 'backend', 'package.json');
  const backendPackage = JSON.parse(fs.readFileSync(backendPackagePath, 'utf8'));
  backendPackage.devDependencies.prisma = '^5.22.0';
  writeUtf8(backendPackagePath, `${JSON.stringify(backendPackage, null, 2)}\n`);

  const result = inspectMigrationGate({ mode: 'offline', repoRoot: fixture.repoRoot, env: fixture.env, now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.code === 'MIGRATION_LOCK_INVALID'));
  assert.ok(result.errors.some(error => error.code === 'MIGRATION_TEXT_NOT_CANONICAL'));
  assert.ok(result.errors.some(error => error.code === 'PRISMA_TOOLCHAIN_VERSION_INVALID'));
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

test('absent history and non-array pending migrations remain fail-closed', () => {
  const fixture = buildFixture();
  const env = attachValidReceipt(fixture, {
    checks: {
      migrateStatus: 'history_absent',
      driftStatus: 'no_unexpected_drift',
      restoreStatus: 'passed',
    },
    pendingMigrations: fixture.migrationDirectory,
  });
  const result = inspectMigrationGate({ mode: 'release', repoRoot: fixture.repoRoot, env, now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.code === 'RECEIPT_CHECK_FAILED'));
  assert.ok(result.errors.some(error => error.code === 'RECEIPT_PENDING_INVALID'));
});

test('an explicit offline or release mode is mandatory', () => {
  const result = inspectMigrationGate({ mode: null });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map(error => error.code), ['MODE_REQUIRED']);
});
