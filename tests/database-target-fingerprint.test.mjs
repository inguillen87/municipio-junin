import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DATABASE_TARGET_FINGERPRINT_VERSION,
  DatabaseTargetFingerprintError,
  canonicalizeDatabaseTarget,
  fingerprintDatabaseTarget,
} from '../api/lib/database-target-fingerprint.js';

const secret = 'never-print-this-database-password';
const directMain = `postgresql://ledger:${secret}@ep-main-a1b2c3.us-east-2.aws.neon.tech/municontrol?sslmode=verify-full`;
const pooledMain = `postgres://another-role:another-secret@ep-main-a1b2c3-pooler.us-east-2.aws.neon.tech:5432/municontrol?sslmode=require&channel_binding=require`;
const pooledChild = `postgresql://ledger:${secret}@ep-child-d4e5f6-pooler.us-east-2.aws.neon.tech/municontrol?sslmode=verify-full`;

test('Neon pooled and direct URLs canonicalize to one target while main and child remain distinct', () => {
  const directTarget = canonicalizeDatabaseTarget(directMain);
  const pooledTarget = canonicalizeDatabaseTarget(pooledMain);

  assert.deepEqual(directTarget, {
    schemaVersion: DATABASE_TARGET_FINGERPRINT_VERSION,
    host: 'ep-main-a1b2c3.us-east-2.aws.neon.tech',
    port: 5432,
    database: 'municontrol',
  });
  assert.deepEqual(pooledTarget, directTarget);
  assert.equal(fingerprintDatabaseTarget(directMain), fingerprintDatabaseTarget(pooledMain));
  assert.notEqual(fingerprintDatabaseTarget(directMain), fingerprintDatabaseTarget(pooledChild));
});

test('fingerprints and failures expose no username, password or connection URL', () => {
  const target = canonicalizeDatabaseTarget(directMain);
  const fingerprint = fingerprintDatabaseTarget(directMain);
  const serialized = JSON.stringify({ target, fingerprint });

  assert.match(fingerprint, /^[0-9a-f]{64}$/u);
  assert.doesNotMatch(serialized, /ledger|never-print|postgresql:\/\//u);

  for (const invalid of [
    undefined,
    `postgresql://ledger:${secret}@ep-main-a1b2c3.us-east-2.aws.neon.tech/municontrol?host=ep-child.invalid`,
    `postgresql://ledger:${secret}@ep-main-a1b2c3.us-east-2.aws.neon.tech/db%2Fother`,
    `postgresql://ledger:${secret}@ep-main-a1b2c3.us-east-2.aws.neon.tech/municontrol#fragment`,
  ]) {
    assert.throws(
      () => fingerprintDatabaseTarget(invalid),
      error => error instanceof DatabaseTargetFingerprintError &&
        !JSON.stringify({ name: error.name, code: error.code, message: error.message }).includes(secret),
    );
  }
});
