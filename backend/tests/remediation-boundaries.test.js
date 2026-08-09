'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const jwt = require('jsonwebtoken');

const root = path.resolve(__dirname, '..', '..');
const backendRoot = path.join(root, 'backend');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    payload: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

test('retired Express upload code and its vulnerable dependencies stay absent', () => {
  const manifest = JSON.parse(read('backend/package.json'));
  const dependencies = manifest.dependencies || {};

  for (const dependency of ['xlsx', 'nodemailer', 'uuid', 'multer', 'pdf-parse', 'mammoth']) {
    assert.equal(dependencies[dependency], undefined, `${dependency} must not ship in the retired Express runtime`);
  }
  for (const relativePath of [
    'backend/utils/parser.js',
    'backend/middleware/upload.js',
    'backend/db/seed.js',
    'css/ia-hf.css',
  ]) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), false, `${relativePath} must remain retired`);
  }

  assert.equal(manifest.scripts.seed, 'node seed.js');
  assert.equal(manifest.scripts['db:seed'], 'node seed.js');
});

test('bootstrap and deployment metadata contain no demo identities or private build artifacts', () => {
  const migration = read('database/migrations/001_initial.sql');
  const backendReadme = read('backend/README.md');
  const deployment = read('DEPLOYMENT.md');
  const vercelIgnore = read('.vercelignore');

  assert.doesNotMatch(migration, /INSERT\s+INTO\s+usuarios|placeholder_bcrypt_hash|demo@demo\.com/i);
  assert.doesNotMatch(backendReadme, /^##\s+Modo demo|sembrar datos demo|SMTP_/im);
  assert.doesNotMatch(deployment, /sin\s*=\s*modo demo|contraseñas demo|SMTP_/i);
  assert.match(backendReadme, /ACCOUNT_LIFECYCLE_NOT_GOVERNED/);
  assert.doesNotMatch(backendReadme, /SEED_(?:SUPER_ADMIN|INTENDENTE|HACIENDA|IT)_(?:EMAIL|PASSWORD)/);
  assert.match(backendReadme, /npm run db:seed/);

  for (const pattern of ['backend/**', 'database/**', 'migrations/**', 'docs/**', 'tests/**', 'scripts/**', '*.sql.gz']) {
    assert.match(vercelIgnore, new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  }
  assert.doesNotMatch(vercelIgnore, /^(?:api|prisma)\/\*\*$/m, 'API and Prisma must remain deployable');
});

test('the production seed is a fail-closed lifecycle gate and cannot touch persistence', async () => {
  const result = spawnSync(process.execPath, ['seed.js'], {
    cwd: backendRoot,
    env: { ...process.env },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ACCOUNT_LIFECYCLE_NOT_GOVERNED/);
  assert.doesNotMatch(result.stdout + result.stderr, /passwordHash|postgresql:\/\//i);

  const seedSource = read('backend/seed.js');
  assert.doesNotMatch(seedSource, /bcrypt|prisma|process\.env|\.create\(|\.update\(|\.upsert\(|\$transaction/);
  const { main, RETIREMENT_CODE } = require('../seed');
  assert.equal(RETIREMENT_CODE, 'ACCOUNT_LIFECYCLE_NOT_GOVERNED');
  await assert.rejects(main(), /ACCOUNT_LIFECYCLE_NOT_GOVERNED/);
});

test('Express production DB configuration requires DATABASE_URL with certificate verification', () => {
  const { validateDatabaseConfiguration } = require('../db/connection');
  assert.throws(
    () => validateDatabaseConfiguration({ NODE_ENV: 'production', DB_HOST: 'ignored.example.test' }),
    /DATABASE_URL_REQUIRED/,
  );
  assert.throws(
    () => validateDatabaseConfiguration({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@db.example/x?sslmode=require' }),
    /DATABASE_TLS_VERIFY_FULL_REQUIRED/,
  );
  assert.equal(
    validateDatabaseConfiguration({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@db.example/x?sslmode=verify-full' }),
    'postgresql://u:p@db.example/x?sslmode=verify-full',
  );
  assert.equal(
    validateDatabaseConfiguration({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://local@localhost/dev' }),
    'postgresql://local@localhost/dev',
  );
  assert.throws(
    () => validateDatabaseConfiguration({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://local@127.0.0.1/dev?host=remote.example.test',
    }),
    /override/i,
  );
  assert.throws(
    () => validateDatabaseConfiguration({
      NODE_ENV: 'production',
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
      DATABASE_URL: 'postgresql://u:p@db.example/x?sslmode=verify-full',
    }),
    /DATABASE_TLS_ENV_FORBIDDEN/,
  );
});

test('Express preserves the raw DATABASE_URL for the shared canonicalization boundary', () => {
  const { validateDatabaseConfiguration } = require('../db/connection');
  const { inspectDatabaseUrl } = require('../../shared/database-url-policy.cjs');
  const canonical = 'postgresql://u:p@db.example/x?sslmode=verify-full';

  for (const connectionString of [` ${canonical}`, `${canonical} `, `${canonical}\r\n`]) {
    assert.throws(
      () => inspectDatabaseUrl(connectionString, { nodeEnv: 'production', environment: {} }),
      error => error.code === 'DATABASE_URL_NOT_CANONICAL',
    );
    assert.throws(
      () => validateDatabaseConfiguration({ NODE_ENV: 'production', DATABASE_URL: connectionString }),
      /DATABASE_URL_NOT_CANONICAL/,
    );
  }

  assert.equal(validateDatabaseConfiguration({ NODE_ENV: 'production', DATABASE_URL: canonical }), canonical);
});

test('external connector rejects a missing JSON body after authoritative auth', async t => {
  process.env.JWT_SECRET = 'external-connector-test-secret-with-sufficient-length';
  process.env.LEGACY_ANALYTICS_TENANT_ID = 'tenant-current';

  const { prisma } = await import('../../api/lib/db.js');
  const originalFindUnique = prisma.user.findUnique;
  prisma.user.findUnique = async ({ where }) => ({
    id: where.id,
    email: `${where.id}@example.test`,
    name: 'Administrador vigente',
    role: 'TENANT_ADMIN',
    tenantId: 'tenant-current',
    active: true,
    tenant: {
      id: 'tenant-current',
      slug: 'tenant-current',
      name: 'Municipio de prueba',
      shortName: 'Prueba',
      status: 'ACTIVE',
    },
  });
  t.after(async () => {
    prisma.user.findUnique = originalFindUnique;
    await prisma.$disconnect();
  });

  const { default: handler } = await import('../../api/external-connector.js');
  const token = jwt.sign({ id: 'connector-admin' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const request = {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    query: {},
  };

  const missingBody = mockResponse();
  await handler(request, missingBody);
  assert.equal(missingBody.statusCode, 400);
  assert.deepEqual(missingBody.payload, { error: 'Cuerpo JSON requerido' });

  const arrayBody = mockResponse();
  await handler({ ...request, body: [] }, arrayBody);
  assert.equal(arrayBody.statusCode, 400);

  for (const action of ['save', 'list', 'query']) {
    const retired = mockResponse();
    await handler({ ...request, body: { action, config: {}, query: 'SELECT 1' } }, retired);
    assert.equal(retired.statusCode, 410);
    assert.equal(retired.payload.success, false);
    assert.equal(retired.payload.code, 'CONNECTOR_ACTION_RETIRED');
  }
});
