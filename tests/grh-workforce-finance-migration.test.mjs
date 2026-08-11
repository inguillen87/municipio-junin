import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../migrations/004_grh_workforce_finance.sql', import.meta.url),
  'utf8',
);
const legacyArtifactMigration = await readFile(
  new URL('../migrations/002_grh_artifacts.sql', import.meta.url),
  'utf8',
);

test('workforce-finance migration is additive and uses a separate tenant-bound table', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS grh_workforce_finance_artifacts/u);
  assert.match(migration, /tenant_id\s+TEXT NOT NULL REFERENCES tenants\(id\) ON DELETE CASCADE/u);
  assert.match(migration, /PRIMARY KEY \(tenant_id, artifact\)/u);
  assert.match(migration, /CHECK \(artifact = 'workforce_finance'\)/u);
  assert.match(migration, /CHECK \(schema_version = 'grh-workforce-finance-source-v1'\)/u);
  assert.match(migration, /CHECK \(source_sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/u);
  assert.match(migration, /CHECK \(jsonb_typeof\(payload\) = 'object'\)/u);
  assert.match(
    migration,
    /CHECK \(COALESCE\(payload ->> 'schema_version', ''\) = schema_version\)/u,
  );
  assert.match(
    migration,
    /CHECK \(COALESCE\(payload #>> '\{source,sha256\}', ''\) = BTRIM\(source_sha256\)\)/u,
  );
  assert.match(
    migration,
    /CHECK \(COALESCE\(payload #>> '\{source,snapshot_as_of\}', ''\) = snapshot_as_of::TEXT\)/u,
  );
  assert.match(migration, /REVOKE ALL ON TABLE grh_workforce_finance_artifacts FROM PUBLIC/u);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/imu);
  assert.doesNotMatch(
    migration,
    /(?:ALTER|CREATE|INSERT INTO|UPDATE|DELETE FROM)\s+(?:TABLE\s+)?grh_artifacts\b/iu,
  );
});

test('the existing two-artifact table and sealed-bundle migration contract remain byte-unchanged in scope', () => {
  assert.match(legacyArtifactMigration, /artifact IN \('profile', 'semantic'\)/u);
  assert.doesNotMatch(legacyArtifactMigration, /workforce_finance|grh-workforce-finance/u);
  assert.doesNotMatch(migration, /ALTER TABLE\s+grh_artifacts/iu);
});
