import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { renderGrhDirectoryBootstrapFunction } from '../scripts/grh-directory-bootstrap-function-template.mjs';
import {
  BOOTSTRAP_CONTRACT,
  DIRECTORY_CONTRACT,
  EXPECTED_MIGRATION_003_SHA256,
  EXPECTED_MIGRATION_004_SHA256,
  EXPECTED_MIGRATION_005_SHA256,
  EXPECTED_MIGRATION_SHA256,
} from '../scripts/grh-directory-production-bootstrap-lib.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('v3 bootstrap pins the exact additive 003+004+005 migration chain', async () => {
  const normalize = value => value.replace(/\r\n/g, '\n');
  const migration003 = normalize(await readFile(new URL('../migrations/003_grh_directory.sql', import.meta.url), 'utf8'));
  const migration004 = normalize(await readFile(new URL('../migrations/004_grh_directory_v2.sql', import.meta.url), 'utf8'));
  const migration005 = normalize(await readFile(new URL('../migrations/005_grh_directory_v3.sql', import.meta.url), 'utf8'));
  assert.equal(BOOTSTRAP_CONTRACT, 'grh-directory-bootstrap-v3');
  assert.equal(DIRECTORY_CONTRACT, 'grh-directory-v3');
  assert.equal(sha256(migration003), EXPECTED_MIGRATION_003_SHA256);
  assert.equal(sha256(migration004), EXPECTED_MIGRATION_004_SHA256);
  assert.equal(sha256(migration005), EXPECTED_MIGRATION_005_SHA256);
  assert.equal(sha256(migration003 + '\n' + migration004 + '\n' + migration005),
    EXPECTED_MIGRATION_SHA256);
});

test('rendered one-shot function verifies the v3 schema, content and employment filters', () => {
  const endpoint = renderGrhDirectoryBootstrapFunction({
    mode: 'ddl',
    operationId: '11111111-1111-4111-8111-111111111111',
    migrationSql: 'SELECT 1;',
    migrationSha256: 'a'.repeat(64),
    manifest: { schema_version: 'fixture' },
    manifestSha256: 'b'.repeat(64),
  });
  assert.match(endpoint, /const BOOTSTRAP_CONTRACT = 'grh-directory-bootstrap-v3'/);
  assert.match(endpoint, /const DIRECTORY_CONTRACT = 'grh-directory-v3'/);
  for (const column of [
    'reported_ingress_date', 'reported_exit_date', 'reported_status', 'employment_as_of',
    'employment_basis', 'reference_payroll_period', 'reference_payroll_observed',
    'reference_payroll_row_count', 'contract_regime_code', 'service_situation_code',
    'termination_reason_code', 'content_sha256',
  ]) assert.match(endpoint, new RegExp(`'${column}'`));
  for (const index of [
    'idx_grh_directory_people_reported_status',
    'idx_grh_directory_people_contract_regime',
    'idx_grh_directory_people_service_situation',
  ]) assert.match(endpoint, new RegExp(`'${index}'`));
  assert.match(endpoint, /grhDirectoryContentSha256\(inspected\.artifact\)/);
  assert.match(endpoint, /content_digests/);
  assert.match(endpoint, /\['grh-directory-v2', DIRECTORY_CONTRACT\]\.includes/);
});

test('bootstrap verifier proves all three v3 employment filters instead of count-only publication', async () => {
  const source = await readFile(
    new URL('../scripts/grh-directory-production-bootstrap-lib.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /reportedStatus=/);
  assert.match(source, /contractRegime=/);
  assert.match(source, /serviceSituation=/);
  assert.match(source, /BOOTSTRAP_VERIFY_EMPLOYMENT_FAILED/);
  assert.match(source, /employmentAvailable: true/);
});
