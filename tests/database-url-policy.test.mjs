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

test('remote connections cannot inherit credentials or disable Node certificate verification', () => {
  assert.throws(
    () => inspectDatabaseUrl(
      'postgresql://user@db.example.test/municipio?sslmode=verify-full',
      { nodeEnv: 'production', environment: { PGPASSWORD: 'ambient-secret' } },
    ),
    error => error instanceof DatabaseUrlPolicyError && error.code === 'DATABASE_CREDENTIAL_REQUIRED',
  );
  assert.throws(
    () => inspectDatabaseUrl(
      'postgresql://user:secret@db.example.test/municipio?sslmode=verify-full',
      { nodeEnv: 'production', environment: { NODE_TLS_REJECT_UNAUTHORIZED: '0' } },
    ),
    error => error instanceof DatabaseUrlPolicyError && error.code === 'DATABASE_TLS_ENV_FORBIDDEN',
  );
});

test('encoded socket hosts cannot cross the canonical URL boundary', () => {
  for (const connectionString of [
    'postgresql://user:secret@%2Fvar%2Frun%2Fpostgresql/municipio?sslmode=verify-full',
    'postgresql://user:secret@%5C%5Cpipe%5Cpostgres/municipio?sslmode=verify-full',
  ]) {
    assert.throws(
      () => inspectDatabaseUrl(connectionString, { nodeEnv: 'production', environment: {} }),
      error => error instanceof DatabaseUrlPolicyError && error.code === 'DATABASE_HOST_CANONICAL_REQUIRED',
    );
  }
});

test('WHATWG and node-postgres cannot receive different strings through whitespace or bad escapes', () => {
  const canonical = 'postgresql://user:secret@db.example.test/municipio?sslmode=verify-full';
  for (const connectionString of [
    ` ${canonical}`,
    `${canonical} `,
    `\t${canonical}`,
    `${canonical}\r\n`,
    canonical.replace('secret', 'sec ret'),
    canonical.replace('secret', 'sec%ZZret'),
  ]) {
    assert.throws(
      () => inspectDatabaseUrl(connectionString, { nodeEnv: 'production', environment: {} }),
      error => error instanceof DatabaseUrlPolicyError && error.code === 'DATABASE_URL_NOT_CANONICAL',
    );
  }
  assert.equal(
    inspectDatabaseUrl(canonical, { nodeEnv: 'production', environment: {} }).connectionString,
    canonical,
  );
});

test('query parameters cannot replace the validated PostgreSQL authority or session', () => {
  for (const parameter of [
    'host=remote.example.test',
    'port=6543',
    'user=forged',
    'password=forged',
    'database=forged',
    'options=-c%20municontrol.wp0_target_class%3DRESTORED_DISPOSABLE',
  ]) {
    assert.throws(
      () => inspectDatabaseUrl(
        `postgresql://local:local@127.0.0.1:5432/municipio?sslmode=disable&${parameter}`,
        { nodeEnv: 'development' },
      ),
      error => error instanceof DatabaseUrlPolicyError && error.code === 'DATABASE_URL_OVERRIDE_FORBIDDEN',
      parameter,
    );
  }

  for (const connectionString of [
    'postgresql://127.0.0.1:5432/municipio?sslmode=disable',
    'postgresql://local:local@127.0.0.1:5432/?sslmode=disable',
  ]) {
    assert.throws(
      () => inspectDatabaseUrl(connectionString, { nodeEnv: 'development' }),
      error => error instanceof DatabaseUrlPolicyError && error.code === 'DATABASE_URL_IDENTITY_REQUIRED',
    );
  }
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
