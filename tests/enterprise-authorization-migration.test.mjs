import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { deriveBaselineManifest } from '../shared/prisma-migration-contract.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const schemaPath = path.join(repoRoot, 'prisma', 'schema.prisma');
const proposalPath = path.join(repoRoot, 'prisma', 'proposals', 'rbac-abac-v1.prisma');
const migrationDirectory = '20260811122648_grh_directory_enterprise_authz';
const migrationPath = path.join(repoRoot, 'prisma', 'migrations', migrationDirectory, 'migration.sql');
const manifestPath = path.join(repoRoot, 'prisma', 'migrations', 'baseline-manifest.json');
const ledgerPath = path.join(repoRoot, 'api', 'lib', 'security-audit-ledger.js');

const schema = fs.readFileSync(schemaPath, 'utf8');
const proposal = fs.readFileSync(proposalPath, 'utf8');
const migration = fs.readFileSync(migrationPath, 'utf8');
const ledger = fs.readFileSync(ledgerPath, 'utf8');

const expectedModels = [
  'UserSecurityState',
  'OrgUnit',
  'OrgUnitClosure',
  'PolicyBundle',
  'CapabilityDefinition',
  'RoleDefinition',
  'RoleCapability',
  'AuthorizationScope',
  'RoleAssignment',
  'SecurityAuditEvent',
];

const expectedEnums = [
  'AccountLifecycleStatus',
  'OrgUnitKind',
  'OrgUnitStatus',
  'PolicyBundleStatus',
  'RoleDefinitionStatus',
  'PermissionEffect',
  'ScopeKind',
  'ScopeStatus',
  'RoleAssignmentStatus',
  'AssignmentSource',
  'AuditOutcome',
];

const expectedTables = [
  'auth_user_security_states',
  'auth_org_units',
  'auth_org_unit_closure',
  'auth_policy_bundles',
  'auth_capabilities',
  'auth_role_definitions',
  'auth_role_capabilities',
  'auth_scopes',
  'auth_role_assignments',
  'security_audit_events',
];

function declarations(source, kind) {
  return [...source.matchAll(new RegExp(`^${kind} ([A-Za-z][A-Za-z0-9_]*) \\{`, 'gmu'))]
    .map(match => match[1]);
}

function modelBlock(source, name) {
  const match = source.match(new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, 'mu'));
  assert.ok(match, `model ${name} must exist`);
  return match[1];
}

function sqlConstraint(name) {
  const marker = `CONSTRAINT "${name}" CHECK (`;
  const start = migration.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  let depth = 0;
  for (let index = start + marker.length - 1; index < migration.length; index += 1) {
    if (migration[index] === '(') depth += 1;
    if (migration[index] === ')') depth -= 1;
    if (depth === 0) return migration.slice(start, index + 1);
  }
  assert.fail(`${name} must have balanced parentheses`);
}

function sqlTable(name) {
  const match = migration.match(new RegExp(`^CREATE TABLE "${name}" \\(([\\s\\S]*?)^\\);`, 'mu'));
  assert.ok(match, `table ${name} must exist`);
  return match[1];
}

test('only the approved enterprise authorization slice is promoted from the inactive proposal', () => {
  const proposalModels = new Set(declarations(proposal, 'model'));
  const proposalEnums = new Set(declarations(proposal, 'enum'));
  const activeModels = declarations(schema, 'model').filter(name => proposalModels.has(name));
  const activeEnums = declarations(schema, 'enum').filter(name => proposalEnums.has(name));

  assert.deepEqual(activeModels.sort(), [...expectedModels].sort());
  assert.deepEqual(activeEnums.sort(), [...expectedEnums].sort());

  for (const name of expectedModels) assert.match(schema, new RegExp(`^model ${name} \\{`, 'mu'));
  for (const name of expectedEnums) assert.match(schema, new RegExp(`^enum ${name} \\{`, 'mu'));
  assert.doesNotMatch(schema, /^model (?:ApprovalRequest|OrgUnitMembership|BreakGlassGrant|SodRule) \{/mu);
});

test('the Prisma model exposes tenant-aware relations without replacing the legacy role enum', () => {
  assert.match(modelBlock(schema, 'User'), /@@unique\(\[tenantId, id\]\)/u);
  assert.match(modelBlock(schema, 'OrgUnit'), /@relation\("OrgUnitHierarchy", fields: \[tenantId, parentId\], references: \[tenantId, id\]/u);
  assert.match(modelBlock(schema, 'OrgUnitClosure'), /fields: \[tenantId, ancestorId\], references: \[tenantId, id\]/u);
  assert.match(modelBlock(schema, 'AuthorizationScope'), /fields: \[tenantId, orgUnitId\], references: \[tenantId, id\]/u);
  assert.match(modelBlock(schema, 'RoleAssignment'), /subject\s+User\s+@relation\("RoleAssignmentSubject"/u);
  const audit = modelBlock(schema, 'SecurityAuditEvent');
  assert.match(audit, /sequence\s+BigInt\s+@id\s+@default\(autoincrement\(\)\)/u);
  assert.match(audit, /eventId\s+String\s+@unique\s+@default\(uuid\(\)\)[^\n]*@db\.Uuid/u);
  assert.match(audit, /chainPartition\s+String[^\n]*@db\.VarChar\(160\)/u);
  assert.match(audit, /chainSequence\s+BigInt\s+@map\("chain_sequence"\)/u);
  assert.match(audit, /assignmentIds\s+String\[\]\s+@map\("assignment_ids"\)/u);
  assert.match(audit, /scopeIds\s+String\[\]\s+@map\("scope_ids"\)/u);
  assert.match(audit, /@@unique\(\[chainPartition, chainSequence\]\)/u);
  assert.doesNotMatch(audit, /\b(?:actorUserId|actorSessionId|targetType|targetId|metadata|requestDigest|signerKeyId|actionKey|scopeId)\b/u);
  assert.match(schema, /^enum Role \{[\s\S]*?^\}/mu);
});

test('the migration is additive, creates exactly the authorized tables, and contains no seed data', () => {
  const createdTables = [...migration.matchAll(/^CREATE TABLE "([^"]+)"/gmu)].map(match => match[1]);
  assert.deepEqual(createdTables.sort(), [...expectedTables].sort());
  assert.doesNotMatch(migration, /\bDROP\s+(?:TABLE|COLUMN|TYPE|SCHEMA|INDEX)\b/iu);
  assert.doesNotMatch(migration, /\bALTER\s+TABLE\b[^;]*\bDROP\b/iu);
  assert.doesNotMatch(migration, /\b(?:INSERT\s+INTO|COPY\s+[^\s]+\s+FROM)\b/iu);
  assert.doesNotMatch(migration, /\bTRUNCATE\s+TABLE\b/iu);
  assert.equal((migration.match(/^CREATE TYPE /gmu) || []).length, expectedEnums.length);
});

test('foreign keys close tenant boundaries for users, hierarchy, scopes, roles, and assignments', () => {
  for (const fragment of [
    'FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenantId", "id")',
    'FOREIGN KEY ("tenant_id", "parent_id") REFERENCES "auth_org_units"("tenant_id", "id")',
    'FOREIGN KEY ("tenant_id", "ancestor_id") REFERENCES "auth_org_units"("tenant_id", "id")',
    'FOREIGN KEY ("tenant_id", "descendant_id") REFERENCES "auth_org_units"("tenant_id", "id")',
    'FOREIGN KEY ("tenant_id", "org_unit_id") REFERENCES "auth_org_units"("tenant_id", "id")',
    'FOREIGN KEY ("tenant_id", "subject_user_id") REFERENCES "users"("tenantId", "id")',
    'FOREIGN KEY ("tenant_id", "scope_id") REFERENCES "auth_scopes"("tenant_id", "id")',
    'FOREIGN KEY ("role_definition_id") REFERENCES "auth_role_definitions"("id")',
    'FOREIGN KEY ("capability_key") REFERENCES "auth_capabilities"("key")',
    'FOREIGN KEY ("policy_bundle_id") REFERENCES "auth_policy_bundles"("id")',
  ]) assert.ok(migration.includes(fragment), fragment);

  assert.match(migration, /CREATE TRIGGER "auth_user_security_states_tenant_guard"/u);
  assert.match(migration, /subject\."tenantId" IS NOT DISTINCT FROM NEW\."tenant_id"/u);
  assert.match(migration, /CREATE TRIGGER "auth_role_definitions_tenant_guard"/u);
  assert.match(migration, /CREATE TRIGGER "auth_role_assignments_tenant_guard"/u);
  assert.match(migration, /role_definition\."tenant_id" IS NULL[\s\S]*?role_definition\."tenant_id" IS NOT DISTINCT FROM NEW\."tenant_id"/u);
  assert.doesNotMatch(migration, /REFERENCES "auth_approval_requests"/u);
});

test('validity, exact scope kinds, digests, and canonical capability keys fail closed', () => {
  for (const name of [
    'auth_user_security_states_versions_check',
    'auth_org_units_validity_check',
    'auth_org_unit_closure_depth_check',
    'auth_policy_bundles_digest_check',
    'auth_policy_bundles_status_check',
    'auth_capabilities_exact_key_check',
    'auth_role_definitions_validity_check',
    'auth_scopes_digest_check',
    'auth_scopes_kind_check',
    'auth_role_assignments_validity_check',
    'auth_role_assignments_status_check',
    'security_audit_events_contract_check',
    'security_audit_events_digest_check',
    'security_audit_events_chain_check',
    'security_audit_events_arrays_check',
    'security_audit_events_result_check',
  ]) sqlConstraint(name);

  assert.match(sqlConstraint('auth_capabilities_exact_key_check'), /"key" = "resource_type" \|\| ':' \|\| "action"/u);
  assert.match(sqlConstraint('auth_policy_bundles_digest_check'), /\^\[0-9a-f\]\{64\}\$/u);
  assert.match(sqlConstraint('security_audit_events_digest_check'), /"event_hash" ~ '\^\[0-9a-f\]\{64\}\$'/u);

  const scopeKinds = sqlConstraint('auth_scopes_kind_check');
  for (const kind of ['PLATFORM', 'TENANT', 'ORG_UNIT', 'ORG_SUBTREE', 'SELF', 'ASSIGNED_RESOURCE', 'RESOURCE', 'DATASET', 'GEOGRAPHIC_BOUNDARY']) {
    assert.match(scopeKinds, new RegExp(`'${kind}'`, 'u'), kind);
  }
  assert.match(migration, /CREATE UNIQUE INDEX "auth_scopes_platform_digest_key"[\s\S]*?WHERE "tenant_id" IS NULL;/u);
});

test('the sanitized ledger INSERT and database columns are byte-contract compatible', () => {
  const table = sqlTable('security_audit_events');
  const columnSection = table.split(/\r?\n\s*\r?\n/u)[0];
  const tableColumns = [...columnSection.matchAll(/^\s+"([a-z_]+)"\s+/gmu)].map(match => match[1]);
  const insert = ledger.match(/INSERT INTO security_audit_events \(\s*([\s\S]*?)\s*\) VALUES/u);
  assert.ok(insert, 'security audit INSERT must exist');
  const insertColumns = insert[1].split(',').map(column => column.trim());

  assert.deepEqual(tableColumns.filter(column => column !== 'sequence'), insertColumns);
  assert.deepEqual(insertColumns, [
    'event_id', 'chain_partition', 'chain_sequence', 'previous_hash', 'event_hash',
    'schema_version', 'tenant_id', 'principal_hash', 'permission', 'purpose', 'operation',
    'outcome', 'authorization_mode', 'authorization_reason', 'policy_version',
    'assignment_ids', 'scope_ids', 'scope_kind', 'organization_count', 'result_count',
    'correlation_id', 'occurred_at',
  ]);
  assert.doesNotMatch(table, /"(?:actor_user_id|actor_session_id|target_type|target_id|metadata|request_digest|signer_key_id|action_key|scope_id)"/u);
  assert.match(table, /"permission" = 'grh\.directory:read'/u);
  assert.match(table, /"purpose" IN \('DIRECTORY_BROWSE', 'PERSON_LOOKUP', 'LEAVE_REVIEW'\)/u);
  assert.match(table, /"authorization_mode" IN \('disabled', 'shadow', 'intersect'\)/u);
  assert.match(table, /"scope_kind" IN \('NONE', 'TENANT', 'ORG_UNIT', 'ORG_SUBTREE', 'MIXED'\)/u);
});

test('security audit events reject UPDATE, DELETE, and TRUNCATE at the database boundary', () => {
  assert.match(migration, /CREATE FUNCTION "security_audit_events_deny_mutation"\(\) RETURNS trigger[\s\S]*?RAISE EXCEPTION 'security_audit_events is append-only'/u);
  assert.match(migration, /CREATE TRIGGER "security_audit_events_no_update_delete"\s+BEFORE UPDATE OR DELETE ON "security_audit_events"\s+FOR EACH ROW/u);
  assert.match(migration, /CREATE TRIGGER "security_audit_events_no_truncate"\s+BEFORE TRUNCATE ON "security_audit_events"\s+FOR EACH STATEMENT/u);
  assert.match(migration, /REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "security_audit_events" FROM PUBLIC;/u);
  assert.doesNotMatch(migration, /DISABLE TRIGGER/iu);
  assert.doesNotMatch(migration, /security_audit_events_(?:enforce_tenant|tenant_guard)/u);
});

test('the governed manifest binds the exact schema and additive migration bytes', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const derived = deriveBaselineManifest({ repoRoot });
  assert.equal(derived.ok, true, JSON.stringify(derived.errors));
  assert.deepEqual(manifest, derived.manifest);
  assert.equal(manifest.baselineMigration.directory, '20260809220336_baseline');
  const governedMigration = manifest.migrations.find(entry => entry.directory === migrationDirectory);
  assert.ok(governedMigration, `missing governed migration ${migrationDirectory}`);
  assert.equal(
    governedMigration.sha256,
    crypto.createHash('sha256').update(migration).digest('hex'),
  );
});
