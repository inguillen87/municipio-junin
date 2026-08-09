import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import databaseUrlPolicy from '../shared/database-url-policy.cjs';

const root = path.resolve(import.meta.dirname, '..');
const { DatabaseUrlPolicyError, inspectDatabaseUrl } = databaseUrlPolicy;

test('remote PostgreSQL requires one exact verify-full mode', () => {
  const accepted = inspectDatabaseUrl(
    'postgresql://user:secret@db.example.test/municipio?sslmode=verify-full',
    { nodeEnv: 'production' }
  );
  assert.equal(accepted.tlsVerified, true);
  assert.equal(accepted.developmentLoopback, false);

  for (const connectionString of [
    'postgresql://user:secret@db.example.test/municipio',
    'postgresql://user:secret@db.example.test/municipio?sslmode=require',
    'postgresql://user:secret@db.example.test/municipio?sslmode=disable',
    'postgresql://user:secret@db.example.test/municipio?sslmode=no-verify',
    'postgresql://user:secret@db.example.test/municipio?sslmode=verify-full&sslmode=disable',
    'postgresql://user:secret@localhost/municipio',
  ]) {
    assert.throws(
      () => inspectDatabaseUrl(connectionString, { nodeEnv: 'production' }),
      error => error instanceof DatabaseUrlPolicyError && error.code === 'DATABASE_TLS_VERIFY_FULL_REQUIRED',
      connectionString
    );
  }
});

test('only explicit development loopback may omit transport verification', () => {
  const local = inspectDatabaseUrl('postgresql://local:local@127.0.0.1:5432/municipio', { nodeEnv: 'development' });
  assert.equal(local.developmentLoopback, true);
  assert.equal(local.tlsVerified, false);

  assert.throws(
    () => inspectDatabaseUrl('postgresql://user:secret@db.example.test/municipio', { nodeEnv: 'development' }),
    /verify-full/
  );
  assert.throws(
    () => inspectDatabaseUrl('postgresql://local:local@127.0.0.1/municipio?sslmode=no-verify', { nodeEnv: 'development' }),
    error => error.code === 'DATABASE_TLS_INVALID'
  );
});

test('all database entry points invoke the shared policy before creating or using pools', () => {
  const entryPoints = [
    'api/lib/db.js',
    'api/upload-handler.js',
    'api/google-sheets.js',
    'api/audit.js',
    'api/lib/grh-artifacts.js',
    'scripts/publish_grh_artifacts.mjs',
  ];
  for (const relativePath of entryPoints) {
    const source = readFileSync(path.join(root, relativePath), 'utf8');
    assert.match(source, /database-url-policy\.cjs/, relativePath);
    assert.match(source, /inspectDatabaseUrl\(/, relativePath);
  }

  const retiredExport = readFileSync(path.join(root, 'api/export-data.js'), 'utf8');
  assert.match(retiredExport, /RAW_DATA_EXPORT_NOT_GOVERNED/);
  assert.doesNotMatch(retiredExport, /\bPool\b|DATABASE_URL|xlsx/);
});

test('Serverless Prisma authentication rejects an insecure configured transport', async () => {
  const originalUrl = process.env.DATABASE_URL;
  const originalEnv = process.env.NODE_ENV;
  const { assertPrismaDatabaseTransport } = await import('../api/lib/db.js');
  try {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:secret@db.example.test/municipio?sslmode=disable';
    assert.throws(
      () => assertPrismaDatabaseTransport(),
      error => error.code === 'DATABASE_TLS_VERIFY_FULL_REQUIRED'
    );
  } finally {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  }
});

test('GRH publisher rejects insecure transport before reading artifacts or opening a pool', () => {
  const result = spawnSync(process.execPath, [
    'scripts/publish_grh_artifacts.mjs',
    '--tenant-id', 'tenant-policy-test',
    '--data-dir', path.join(root, 'does-not-exist-database-policy-test'),
  ], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://user:secret@db.example.test/municipio?sslmode=disable',
    },
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /política TLS.*verify-full/i);
  assert.doesNotMatch(`${result.stderr}\n${result.stdout}`, /ENOENT|does-not-exist-database-policy-test/);
});
