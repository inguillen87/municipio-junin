import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { inspectBaselineManifestFile } from '../scripts/generate-prisma-baseline-manifest.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const migrationPath = path.join(
  repoRoot,
  'prisma',
  'migrations',
  '20260811190000_grh_action_ledger',
  'migration.sql',
);
const schemaPath = path.join(repoRoot, 'prisma', 'schema.prisma');

test('Prisma schema exposes the tenant-bound GRH commitment and immutable event models', async () => {
  const schema = await readFile(schemaPath, 'utf8');

  assert.match(schema, /enum GrhActionCommitmentState\s*\{\s*OPEN\s+IN_PROGRESS\s+BLOCKED\s+COMPLETED\s+CANCELED\s*\}/u);
  assert.match(schema, /enum GrhActionLedgerCommand\s*\{\s*CREATE\s+CLAIM\s+BLOCK\s+RESUME\s+COMPLETE\s+RESCHEDULE\s+CANCEL\s*\}/u);
  assert.match(schema, /enum GrhActionCode\s*\{\s*REVIEW_CROSS_SOURCE_RECONCILIATION\s+REVIEW_TEMPORAL_QUARANTINE\s*\}/u);
  assert.match(schema, /model GrhActionCommitment\s*\{[\s\S]*?tenantId\s+String[\s\S]*?actionCode\s+GrhActionCode[\s\S]*?ownerUserId\s+String\?[\s\S]*?version\s+Int[\s\S]*?@@unique\(\[tenantId, briefSchemaVersion, briefPolicyVersion, sourceSha256, snapshotAsOf, period, evidenceDigest, priorityCode\], map: "grh_action_commitments_evidence_priority_key"\)[\s\S]*?@@map\("grh_action_commitments"\)/u);
  assert.match(schema, /model GrhActionCommitmentEvent\s*\{[\s\S]*?commandId\s+String[\s\S]*?payloadDigest\s+String[\s\S]*?actorUserId\s+String[\s\S]*?expectedVersion\s+Int[\s\S]*?resultVersion\s+Int[\s\S]*?@@unique\(\[tenantId, commandId\]\)[\s\S]*?@@map\("grh_action_commitment_events"\)/u);
  assert.match(schema, /fields: \[tenantId, ownerUserId\], references: \[tenantId, id\], onDelete: Restrict/u);
  assert.match(schema, /fields: \[tenantId, commitmentId\], references: \[tenantId, id\], onDelete: Restrict/u);
});

test('migration is additive, seed-free and constrains the frozen workflow in PostgreSQL', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.doesNotMatch(sql, /^\s*(?:DROP\b|TRUNCATE\b|INSERT\s+INTO\s+"(?:users|tenants)"\b)/imu);
  assert.match(sql, /CREATE TYPE "GrhActionCommitmentState" AS ENUM \('OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELED'\)/u);
  assert.match(sql, /CREATE TYPE "GrhActionLedgerCommand" AS ENUM \('CREATE', 'CLAIM', 'BLOCK', 'RESUME', 'COMPLETE', 'RESCHEDULE', 'CANCEL'\)/u);
  assert.match(sql, /CREATE TABLE "grh_action_commitments"/u);
  assert.match(sql, /CREATE TABLE "grh_action_commitment_events"/u);
  assert.match(sql, /"assignee_role" IN \('CONTADOR', 'TENANT_ADMIN'\)/u);
  assert.match(sql, /"priority_code" = 'cross_source_material_difference'[\s\S]*?"priority_severity" = 'CRITICAL'[\s\S]*?"action_code" = 'REVIEW_CROSS_SOURCE_RECONCILIATION'/u);
  assert.match(sql, /"priority_code" = 'temporal_quarantine_present'[\s\S]*?"priority_severity" = 'WARNING'[\s\S]*?"action_code" = 'REVIEW_TEMPORAL_QUARANTINE'/u);
  assert.match(sql, /"state" = 'COMPLETED'[\s\S]*?"outcome_code" IN \('review_completed', 'correction_requested', 'no_change_required'\)/u);
  assert.match(sql, /"command" = 'BLOCK'[\s\S]*?"reason_code" IN \('dependency_pending', 'source_review_required', 'owner_unavailable'\)/u);
  assert.match(sql, /"command" = 'CANCEL'[\s\S]*?"reason_code" IN \('priority_withdrawn', 'duplicate_commitment'\)/u);
  assert.match(sql, /"result_version" = "expected_version" \+ 1/u);
  assert.match(sql, /"actor_role" IN \('INTENDENTE', 'TENANT_ADMIN', 'CONTADOR'\)/u);
});

test('database keys preserve tenant isolation, command idempotency and exact evidence-priority uniqueness', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /CREATE UNIQUE INDEX "grh_action_commitments_evidence_priority_key"\s+ON "grh_action_commitments"\(\s*"tenant_id",\s*"brief_schema_version",\s*"brief_policy_version",\s*"source_sha256",\s*"snapshot_as_of",\s*"period",\s*"evidence_digest",\s*"priority_code"\s*\);/u);
  assert.match(sql, /CREATE UNIQUE INDEX "grh_action_commitment_events_tenant_command_key"[\s\S]*?\("tenant_id", "command_id"\)/u);
  assert.match(sql, /FOREIGN KEY \("tenant_id", "created_by_user_id"\) REFERENCES "users"\("tenantId", "id"\) ON DELETE RESTRICT/u);
  assert.match(sql, /FOREIGN KEY \("tenant_id", "owner_user_id"\) REFERENCES "users"\("tenantId", "id"\) ON DELETE RESTRICT/u);
  assert.match(sql, /FOREIGN KEY \("tenant_id", "actor_user_id"\) REFERENCES "users"\("tenantId", "id"\) ON DELETE RESTRICT/u);
  assert.match(sql, /FOREIGN KEY \("tenant_id", "commitment_id"\) REFERENCES "grh_action_commitments"\("tenant_id", "id"\) ON DELETE RESTRICT/u);
});

test('event history is append-only against row mutation and table truncation', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /FUNCTION "grh_action_commitment_events_deny_mutation"/u);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON "grh_action_commitment_events"/u);
  assert.match(sql, /BEFORE TRUNCATE ON "grh_action_commitment_events"/u);
  assert.match(sql, /REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "grh_action_commitment_events" FROM PUBLIC/u);
});

test('governed migration manifest matches schema and complete migration history byte-for-byte', () => {
  const inspection = inspectBaselineManifestFile({ repoRoot });
  assert.equal(inspection.ok, true, JSON.stringify(inspection.errors));
  assert.equal(inspection.migrations.at(-1)?.directory, '20260811190000_grh_action_ledger');
});
