#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { fingerprintDatabaseTarget } from '../api/lib/database-target-fingerprint.js';
import databaseUrlPolicy from '../shared/database-url-policy.cjs';
import { inspectBaselineManifestFile } from './generate-prisma-baseline-manifest.mjs';

const { inspectDatabaseUrl } = databaseUrlPolicy;

const CONTRACT_VERSION = 'grh-action-ledger-postgres-verification-v1';
const MIGRATION_NAME = '20260811190000_grh_action_ledger';
const DATABASE_ENV = 'GRH_ACTION_LEDGER_VERIFY_DATABASE_URL';
const CONFIRMATION = 'READ_ONLY_CATALOG';
const TARGET_PATTERN = /^target:[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MODES = new Set(['--help', '--check-config', '--connected']);
const VALUE_OPTIONS = new Set(['--confirmation', '--target-id']);
const FORBIDDEN_AMBIENT_POSTGRES_ENV = Object.freeze([
  'PGAPPNAME',
  'PGDATABASE',
  'PGHOST',
  'PGHOSTADDR',
  'PGOPTIONS',
  'PGPASSWORD',
  'PGPORT',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGSSLMODE',
  'PGSSLROOTCERT',
  'PGUSER',
]);

const HELP = `Verificacion PostgreSQL read-only del ledger de decisiones GRH.

Configuracion (no conecta):
  npm run db:grh-ledger:verify -- --check-config \\
    --confirmation READ_ONLY_CATALOG --target-id target:<id>

Observacion conectada (solo catalogos, transaccion REPEATABLE READ READ ONLY):
  $env:${DATABASE_ENV}='<secreto inyectado>'
  npm run db:grh-ledger:verify -- --connected \\
    --confirmation READ_ONLY_CATALOG --target-id target:<id>

${DATABASE_ENV} es la unica URL admitida. El comando nunca aplica migraciones,
no crea datos y no convierte su resultado en autorizacion de release.
`;

const QUERY = Object.freeze({
  begin: Object.freeze({
    name: 'grh-ledger-verify-begin-v1',
    text: 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
    values: Object.freeze([]),
  }),
  session: Object.freeze({
    name: 'grh-ledger-verify-session-v1',
    text: `
      SELECT
        current_setting('server_version_num')::integer AS server_version_num,
        current_setting('transaction_read_only') AS transaction_read_only,
        current_setting('transaction_isolation') AS transaction_isolation
    `,
    values: Object.freeze([]),
  }),
  migration: Object.freeze({
    name: 'grh-ledger-verify-migration-v1',
    text: `
      SELECT
        "migration_name",
        "checksum",
        ("finished_at" IS NOT NULL) AS finished,
        ("rolled_back_at" IS NULL) AS not_rolled_back,
        "applied_steps_count"::integer AS applied_steps_count
      FROM "public"."_prisma_migrations"
      WHERE "migration_name" = $1
      ORDER BY "started_at" ASC
    `,
    values: Object.freeze([MIGRATION_NAME]),
  }),
  relations: Object.freeze({
    name: 'grh-ledger-verify-relations-v1',
    text: `
      SELECT relation.relname AS relation_name,
             relation.relkind,
             relation.relpersistence
      FROM pg_catalog.pg_class AS relation
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY($1::text[])
      ORDER BY relation.relname ASC
    `,
    values: Object.freeze([Object.freeze([
      'grh_action_commitment_events',
      'grh_action_commitment_events_sequence_seq',
      'grh_action_commitments',
    ])]),
  }),
  enums: Object.freeze({
    name: 'grh-ledger-verify-enums-v1',
    text: `
      SELECT type.typname AS enum_name,
             value.enumlabel AS enum_value,
             value.enumsortorder::integer AS enum_order
      FROM pg_catalog.pg_type AS type
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = type.typnamespace
      INNER JOIN pg_catalog.pg_enum AS value
        ON value.enumtypid = type.oid
      WHERE namespace.nspname = 'public'
        AND type.typname = ANY($1::text[])
      ORDER BY type.typname ASC, value.enumsortorder ASC
    `,
    values: Object.freeze([Object.freeze([
      'GrhActionCode',
      'GrhActionCommitmentState',
      'GrhActionLedgerCommand',
      'GrhActionPrioritySeverity',
    ])]),
  }),
  columns: Object.freeze({
    name: 'grh-ledger-verify-columns-v1',
    text: `
      SELECT relation.relname AS table_name,
             attribute.attname AS column_name,
             pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
             attribute.attnotnull AS not_null,
             pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid) AS default_expression
      FROM pg_catalog.pg_class AS relation
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      INNER JOIN pg_catalog.pg_attribute AS attribute
        ON attribute.attrelid = relation.oid
      LEFT JOIN pg_catalog.pg_attrdef AS default_value
        ON default_value.adrelid = relation.oid
       AND default_value.adnum = attribute.attnum
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY($1::text[])
        AND relation.relkind IN ('r', 'p')
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
      ORDER BY relation.relname ASC, attribute.attnum ASC
    `,
    values: Object.freeze([Object.freeze([
      'grh_action_commitment_events',
      'grh_action_commitments',
    ])]),
  }),
  constraints: Object.freeze({
    name: 'grh-ledger-verify-constraints-v1',
    text: `
      SELECT relation.relname AS table_name,
             constraint_object.conname AS constraint_name,
             constraint_object.contype AS constraint_type,
             constraint_object.convalidated AS validated,
             constraint_object.condeferrable AS deferrable,
             constraint_object.condeferred AS initially_deferred,
             pg_catalog.pg_get_constraintdef(constraint_object.oid, true) AS definition
      FROM pg_catalog.pg_constraint AS constraint_object
      INNER JOIN pg_catalog.pg_class AS relation
        ON relation.oid = constraint_object.conrelid
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY($1::text[])
      ORDER BY relation.relname ASC, constraint_object.conname ASC
    `,
    values: Object.freeze([Object.freeze([
      'grh_action_commitment_events',
      'grh_action_commitments',
    ])]),
  }),
  indexes: Object.freeze({
    name: 'grh-ledger-verify-indexes-v1',
    text: `
      SELECT table_index.relname AS table_name,
             index_relation.relname AS index_name,
             index_relation.relkind AS index_kind,
             access_method.amname AS access_method,
             index_metadata.indisunique AS is_unique,
             index_metadata.indisprimary AS is_primary,
             index_metadata.indisexclusion AS is_exclusion,
             index_metadata.indimmediate AS is_immediate,
             index_metadata.indisvalid AS is_valid,
             index_metadata.indisready AS is_ready,
             (index_metadata.indpred IS NULL) AS is_unconditional,
             (index_metadata.indexprs IS NULL) AS has_no_expressions,
             index_metadata.indnkeyatts::integer AS key_attribute_count,
             index_metadata.indnatts::integer AS total_attribute_count,
             ARRAY(
               SELECT attribute.attname::text
               FROM unnest(index_metadata.indkey::smallint[]) WITH ORDINALITY
                 AS key_attribute(attnum, position)
               INNER JOIN pg_catalog.pg_attribute AS attribute
                 ON attribute.attrelid = table_index.oid
                AND attribute.attnum = key_attribute.attnum
               WHERE key_attribute.position <= index_metadata.indnkeyatts
               ORDER BY key_attribute.position
             ) AS key_columns,
             ARRAY(
               SELECT pg_catalog.pg_get_indexdef(
                 index_metadata.indexrelid,
                 key_position,
                 true
               )
               FROM generate_series(1, index_metadata.indnkeyatts) AS key_position
               ORDER BY key_position
             ) AS key_definitions,
             pg_catalog.pg_get_indexdef(index_metadata.indexrelid) AS definition
      FROM pg_catalog.pg_index AS index_metadata
      INNER JOIN pg_catalog.pg_class AS table_index
        ON table_index.oid = index_metadata.indrelid
      INNER JOIN pg_catalog.pg_class AS index_relation
        ON index_relation.oid = index_metadata.indexrelid
      INNER JOIN pg_catalog.pg_am AS access_method
        ON access_method.oid = index_relation.relam
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = table_index.relnamespace
      WHERE namespace.nspname = 'public'
        AND table_index.relname = ANY($1::text[])
      ORDER BY table_index.relname ASC, index_relation.relname ASC
    `,
    values: Object.freeze([Object.freeze([
      'grh_action_commitment_events',
      'grh_action_commitments',
    ])]),
  }),
  triggers: Object.freeze({
    name: 'grh-ledger-verify-triggers-v1',
    text: `
      SELECT relation.relname AS table_name,
             trigger_metadata.tgname AS trigger_name,
             trigger_metadata.tgenabled AS enabled,
             function_proc.proname AS function_name,
             pg_catalog.pg_get_triggerdef(trigger_metadata.oid, true) AS definition
      FROM pg_catalog.pg_trigger AS trigger_metadata
      INNER JOIN pg_catalog.pg_class AS relation
        ON relation.oid = trigger_metadata.tgrelid
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      INNER JOIN pg_catalog.pg_proc AS function_proc
        ON function_proc.oid = trigger_metadata.tgfoid
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'grh_action_commitment_events'
        AND NOT trigger_metadata.tgisinternal
      ORDER BY trigger_metadata.tgname ASC
    `,
    values: Object.freeze([]),
  }),
  functions: Object.freeze({
    name: 'grh-ledger-verify-functions-v1',
    text: `
      SELECT function_proc.proname AS function_name,
             language.lanname AS language_name,
              function_proc.provolatile AS volatility,
              function_proc.prosecdef AS security_definer,
              pg_catalog.pg_get_function_result(function_proc.oid) AS result_type,
              function_proc.prosrc AS source,
              pg_catalog.pg_get_functiondef(function_proc.oid) AS definition
      FROM pg_catalog.pg_proc AS function_proc
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = function_proc.pronamespace
      INNER JOIN pg_catalog.pg_language AS language
        ON language.oid = function_proc.prolang
      WHERE namespace.nspname = 'public'
        AND function_proc.proname = 'grh_action_commitment_events_deny_mutation'
      ORDER BY function_proc.oid ASC
    `,
    values: Object.freeze([]),
  }),
  publicPrivileges: Object.freeze({
    name: 'grh-ledger-verify-public-privileges-v1',
    text: `
      SELECT relation.relname AS table_name,
             privilege.privilege_type
      FROM pg_catalog.pg_class AS relation
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
      ) AS privilege
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'grh_action_commitment_events'
        AND privilege.grantee = 0
      ORDER BY privilege.privilege_type ASC
    `,
    values: Object.freeze([]),
  }),
  commit: Object.freeze({ name: 'grh-ledger-verify-commit-v1', text: 'COMMIT', values: Object.freeze([]) }),
  rollback: Object.freeze({ name: 'grh-ledger-verify-rollback-v1', text: 'ROLLBACK', values: Object.freeze([]) }),
});

const EXPECTED_RELATIONS = Object.freeze([
  Object.freeze({ relation_name: 'grh_action_commitment_events', relkind: 'r', relpersistence: 'p' }),
  Object.freeze({ relation_name: 'grh_action_commitment_events_sequence_seq', relkind: 'S', relpersistence: 'p' }),
  Object.freeze({ relation_name: 'grh_action_commitments', relkind: 'r', relpersistence: 'p' }),
]);

const EXPECTED_ENUMS = Object.freeze({
  GrhActionCode: Object.freeze(['REVIEW_CROSS_SOURCE_RECONCILIATION', 'REVIEW_TEMPORAL_QUARANTINE']),
  GrhActionCommitmentState: Object.freeze(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELED']),
  GrhActionLedgerCommand: Object.freeze(['CREATE', 'CLAIM', 'BLOCK', 'RESUME', 'COMPLETE', 'RESCHEDULE', 'CANCEL']),
  GrhActionPrioritySeverity: Object.freeze(['CRITICAL', 'WARNING']),
});

const EXPECTED_COLUMNS = Object.freeze({
  grh_action_commitments: Object.freeze([
    ['id', 'uuid', true, null],
    ['tenant_id', 'text', true, null],
    ['brief_schema_version', 'character varying(80)', true, null],
    ['brief_policy_version', 'character varying(80)', true, null],
    ['source_sha256', 'character(64)', true, null],
    ['snapshot_as_of', 'date', true, null],
    ['period', 'character varying(7)', true, null],
    ['priority_code', 'character varying(80)', true, null],
    ['priority_severity', '"GrhActionPrioritySeverity"', true, null],
    ['action_code', '"GrhActionCode"', true, null],
    ['evidence_digest', 'character(64)', true, null],
    ['state', '"GrhActionCommitmentState"', true, /'OPEN'::"GrhActionCommitmentState"/u],
    ['assignee_role', '"Role"', true, null],
    ['owner_user_id', 'text', false, null],
    ['due_on', 'date', true, null],
    ['version', 'integer', true, /^1$/u],
    ['outcome_code', 'character varying(80)', false, null],
    ['created_by_user_id', 'text', true, null],
    ['created_at', 'timestamp(6) with time zone', true, /^CURRENT_TIMESTAMP$/iu],
    ['updated_at', 'timestamp(6) with time zone', true, /^CURRENT_TIMESTAMP$/iu],
  ]),
  grh_action_commitment_events: Object.freeze([
    ['sequence', 'bigint', true, /^nextval\('grh_action_commitment_events_sequence_seq'::regclass\)$/u],
    ['event_id', 'uuid', true, null],
    ['tenant_id', 'text', true, null],
    ['commitment_id', 'uuid', true, null],
    ['command_id', 'uuid', true, null],
    ['payload_digest', 'character(64)', true, null],
    ['actor_user_id', 'text', true, null],
    ['actor_role', '"Role"', true, null],
    ['command', '"GrhActionLedgerCommand"', true, null],
    ['from_state', '"GrhActionCommitmentState"', false, null],
    ['to_state', '"GrhActionCommitmentState"', true, null],
    ['reason_code', 'character varying(80)', false, null],
    ['outcome_code', 'character varying(80)', false, null],
    ['due_on', 'date', false, null],
    ['expected_version', 'integer', true, null],
    ['result_version', 'integer', true, null],
    ['occurred_at', 'timestamp(6) with time zone', true, /^CURRENT_TIMESTAMP$/iu],
  ]),
});

const EXPECTED_CONSTRAINTS = Object.freeze({
  grh_action_commitments: Object.freeze({
    grh_action_commitments_assignee_check: ['c', `CHECK (assignee_role = ANY (ARRAY['CONTADOR'::public."Role", 'TENANT_ADMIN'::public."Role"]))`],
    grh_action_commitments_contract_check: ['c', `CHECK (btrim(brief_schema_version::text) <> ''::text AND btrim(brief_policy_version::text) <> ''::text AND source_sha256 ~ '^[0-9a-f]{64}$'::text AND evidence_digest ~ '^[0-9a-f]{64}$'::text AND period::text ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'::text AND version >= 1 AND due_on >= snapshot_as_of)`],
    grh_action_commitments_created_by_fkey: ['f', 'FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES public.users("tenantId", id) ON UPDATE CASCADE ON DELETE RESTRICT'],
    grh_action_commitments_owner_fkey: ['f', 'FOREIGN KEY (tenant_id, owner_user_id) REFERENCES public.users("tenantId", id) ON UPDATE CASCADE ON DELETE RESTRICT'],
    grh_action_commitments_pkey: ['p', 'PRIMARY KEY (id)'],
    grh_action_commitments_priority_check: ['c', `CHECK (priority_code::text = 'cross_source_material_difference'::text AND priority_severity = 'CRITICAL'::public."GrhActionPrioritySeverity" AND action_code = 'REVIEW_CROSS_SOURCE_RECONCILIATION'::public."GrhActionCode" OR priority_code::text = 'temporal_quarantine_present'::text AND priority_severity = 'WARNING'::public."GrhActionPrioritySeverity" AND action_code = 'REVIEW_TEMPORAL_QUARANTINE'::public."GrhActionCode")`],
    grh_action_commitments_state_check: ['c', `CHECK (state = 'OPEN'::public."GrhActionCommitmentState" AND owner_user_id IS NULL AND outcome_code IS NULL OR (state = ANY (ARRAY['IN_PROGRESS'::public."GrhActionCommitmentState", 'BLOCKED'::public."GrhActionCommitmentState"])) AND owner_user_id IS NOT NULL AND outcome_code IS NULL OR state = 'COMPLETED'::public."GrhActionCommitmentState" AND owner_user_id IS NOT NULL AND (outcome_code::text = ANY (ARRAY['review_completed'::character varying, 'correction_requested'::character varying, 'no_change_required'::character varying]::text[])) OR state = 'CANCELED'::public."GrhActionCommitmentState" AND outcome_code IS NULL)`],
    grh_action_commitments_tenant_id_fkey: ['f', 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT'],
  }),
  grh_action_commitment_events: Object.freeze({
    grh_action_commitment_events_actor_fkey: ['f', 'FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.users("tenantId", id) ON UPDATE CASCADE ON DELETE RESTRICT'],
    grh_action_commitment_events_commitment_fkey: ['f', 'FOREIGN KEY (tenant_id, commitment_id) REFERENCES public.grh_action_commitments(tenant_id, id) ON UPDATE CASCADE ON DELETE RESTRICT'],
    grh_action_commitment_events_event_id_key: ['u', 'UNIQUE (event_id)'],
    grh_action_commitment_events_payload_check: ['c', `CHECK (payload_digest ~ '^[0-9a-f]{64}$'::text AND (actor_role = ANY (ARRAY['INTENDENTE'::public."Role", 'TENANT_ADMIN'::public."Role", 'CONTADOR'::public."Role"])) AND expected_version >= 0 AND result_version = (expected_version + 1))`],
    grh_action_commitment_events_pkey: ['p', 'PRIMARY KEY (sequence)'],
    grh_action_commitment_events_tenant_id_fkey: ['f', 'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT'],
    grh_action_commitment_events_transition_check: ['c', `CHECK (command = 'CREATE'::public."GrhActionLedgerCommand" AND from_state IS NULL AND to_state = 'OPEN'::public."GrhActionCommitmentState" AND expected_version = 0 AND result_version = 1 AND reason_code IS NULL AND outcome_code IS NULL AND due_on IS NOT NULL OR command = 'CLAIM'::public."GrhActionLedgerCommand" AND from_state = 'OPEN'::public."GrhActionCommitmentState" AND to_state = 'IN_PROGRESS'::public."GrhActionCommitmentState" AND reason_code IS NULL AND outcome_code IS NULL AND due_on IS NULL OR command = 'BLOCK'::public."GrhActionLedgerCommand" AND from_state = 'IN_PROGRESS'::public."GrhActionCommitmentState" AND to_state = 'BLOCKED'::public."GrhActionCommitmentState" AND (reason_code::text = ANY (ARRAY['dependency_pending'::character varying, 'source_review_required'::character varying, 'owner_unavailable'::character varying]::text[])) AND outcome_code IS NULL AND due_on IS NULL OR command = 'RESUME'::public."GrhActionLedgerCommand" AND from_state = 'BLOCKED'::public."GrhActionCommitmentState" AND to_state = 'IN_PROGRESS'::public."GrhActionCommitmentState" AND reason_code IS NULL AND outcome_code IS NULL AND due_on IS NULL OR command = 'COMPLETE'::public."GrhActionLedgerCommand" AND from_state = 'IN_PROGRESS'::public."GrhActionCommitmentState" AND to_state = 'COMPLETED'::public."GrhActionCommitmentState" AND reason_code IS NULL AND (outcome_code::text = ANY (ARRAY['review_completed'::character varying, 'correction_requested'::character varying, 'no_change_required'::character varying]::text[])) AND due_on IS NULL OR command = 'RESCHEDULE'::public."GrhActionLedgerCommand" AND from_state = to_state AND (to_state = ANY (ARRAY['OPEN'::public."GrhActionCommitmentState", 'IN_PROGRESS'::public."GrhActionCommitmentState", 'BLOCKED'::public."GrhActionCommitmentState"])) AND reason_code IS NULL AND outcome_code IS NULL AND due_on IS NOT NULL OR command = 'CANCEL'::public."GrhActionLedgerCommand" AND (from_state = ANY (ARRAY['OPEN'::public."GrhActionCommitmentState", 'IN_PROGRESS'::public."GrhActionCommitmentState", 'BLOCKED'::public."GrhActionCommitmentState"])) AND to_state = 'CANCELED'::public."GrhActionCommitmentState" AND (reason_code::text = ANY (ARRAY['priority_withdrawn'::character varying, 'duplicate_commitment'::character varying]::text[])) AND outcome_code IS NULL AND due_on IS NULL)`],
  }),
});

const EXPECTED_INDEXES = Object.freeze({
  grh_action_commitments: Object.freeze({
    grh_action_commitments_pkey: [true, true, ['id']],
    grh_action_commitments_tenant_id_id_key: [true, false, ['tenant_id', 'id']],
    grh_action_commitments_evidence_priority_key: [true, false, [
      'tenant_id', 'brief_schema_version', 'brief_policy_version', 'source_sha256',
      'snapshot_as_of', 'period', 'evidence_digest', 'priority_code',
    ]],
    grh_action_commitments_tenant_state_due_idx: [false, false, ['tenant_id', 'state', 'due_on']],
    grh_action_commitments_tenant_assignee_state_idx: [false, false, ['tenant_id', 'assignee_role', 'state']],
  }),
  grh_action_commitment_events: Object.freeze({
    grh_action_commitment_events_pkey: [true, true, ['sequence']],
    grh_action_commitment_events_event_id_key: [true, false, ['event_id']],
    grh_action_commitment_events_tenant_command_key: [true, false, ['tenant_id', 'command_id']],
    grh_action_commitment_events_commitment_sequence_idx: [false, false, ['tenant_id', 'commitment_id', 'sequence']],
    grh_action_commitment_events_actor_occurred_idx: [false, false, ['tenant_id', 'actor_user_id', 'occurred_at']],
  }),
});

const EXPECTED_TRIGGER_DEFINITIONS = Object.freeze({
  grh_action_commitment_events_no_truncate:
    'create trigger grh_action_commitment_events_no_truncate before truncate on grh_action_commitment_events for each statement execute function grh_action_commitment_events_deny_mutation()',
  grh_action_commitment_events_no_update_delete:
    'create trigger grh_action_commitment_events_no_update_delete before delete or update on grh_action_commitment_events for each row execute function grh_action_commitment_events_deny_mutation()',
});

const EXPECTED_DENY_FUNCTION_SOURCE =
  "BEGIN RAISE EXCEPTION 'grh_action_commitment_events is append-only'; END;";

class LedgerPostgresVerificationError extends Error {
  constructor(code, message, failures = [], cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'LedgerPostgresVerificationError';
    this.code = code;
    this.failures = Object.freeze([...failures]);
  }
}

function fail(code, message, failures = [], cause) {
  return new LedgerPostgresVerificationError(code, message, failures, cause);
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeDefinition(value) {
  return String(value || '')
    .replaceAll('"public".', '')
    .replaceAll('public.', '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

function normalizeTriggerDefinition(value) {
  return normalizeDefinition(value).replaceAll('"', '');
}

function normalizeConstraintDefinition(value) {
  return String(value || '')
    .replaceAll('"public".', '')
    .replaceAll('public.', '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalizeProcedureSource(value) {
  return String(value || '').replace(/\s+/gu, ' ').trim();
}

function normalizeCatalogType(value) {
  return String(value || '').replace(/^(?:"public"|public)\./u, '');
}

function normalizeCatalogExpression(value) {
  if (value === null || value === undefined) return null;
  return String(value)
    .replaceAll('"public".', '')
    .replaceAll('public.', '');
}

function safePostgresFailureCode(error) {
  const code = typeof error?.code === 'string' ? error.code.toUpperCase() : '';
  return /^(?:[0-9A-Z]{5}|E[A-Z0-9_]{2,30})$/u.test(code) ? `POSTGRES_${code}` : 'POSTGRES_CODE_UNAVAILABLE';
}

function parseArguments(argv) {
  if (!Array.isArray(argv)) throw fail('CLI_ARGUMENTS_INVALID', 'Los argumentos son invalidos.');
  const modes = argv.filter(value => MODES.has(value));
  if (modes.length !== 1) throw fail('CLI_MODE_REQUIRED', 'Use exactamente uno de --help, --check-config o --connected.');
  const mode = modes[0];
  if (mode === '--help') {
    if (argv.length !== 1) throw fail('CLI_HELP_ARGUMENTS_INVALID', '--help no admite otros argumentos.');
    return Object.freeze({ mode: 'help' });
  }

  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === mode) continue;
    if (!VALUE_OPTIONS.has(token)) throw fail('CLI_OPTION_INVALID', 'Opcion no permitida.');
    const value = argv[index + 1];
    if (typeof value !== 'string' || value.startsWith('--')) throw fail('CLI_VALUE_REQUIRED', `Falta el valor de ${token}.`);
    if (values.has(token)) throw fail('CLI_OPTION_DUPLICATED', `${token} no puede repetirse.`);
    values.set(token, value);
    index += 1;
  }
  if (values.get('--confirmation') !== CONFIRMATION) {
    throw fail('CLI_CONFIRMATION_INVALID', `Se exige --confirmation ${CONFIRMATION}.`);
  }
  const targetId = values.get('--target-id');
  if (typeof targetId !== 'string' || !TARGET_PATTERN.test(targetId)) {
    throw fail('CLI_TARGET_ID_INVALID', '--target-id debe ser un identificador opaco target:<id>.');
  }
  return Object.freeze({ mode: mode === '--connected' ? 'connected' : 'check-config', targetId });
}

async function loadLocalContract(repoRoot) {
  const inspection = inspectBaselineManifestFile({ repoRoot });
  if (!inspection.ok) throw fail('LOCAL_MANIFEST_INVALID', 'El manifest Prisma local no coincide con la historia gobernada.');
  const migration = inspection.migrations.find(item => item.directory === MIGRATION_NAME);
  if (!migration || inspection.migrations.at(-1)?.directory !== MIGRATION_NAME) {
    throw fail('LOCAL_MIGRATION_NOT_CURRENT', 'La migracion GRH esperada no es la ultima migracion gobernada.');
  }
  const migrationPath = path.join(repoRoot, 'prisma', 'migrations', MIGRATION_NAME, 'migration.sql');
  const bytes = await fs.readFile(migrationPath);
  const migrationSha256 = digest(bytes);
  if (migrationSha256 !== migration.sha256) {
    throw fail('LOCAL_MIGRATION_DIGEST_MISMATCH', 'La migracion GRH no coincide con el digest del manifest.');
  }
  return Object.freeze({ migrationName: MIGRATION_NAME, migrationSha256 });
}

function inspectEnvironment(env) {
  if (!env || typeof env !== 'object') throw fail('ENVIRONMENT_INVALID', 'El entorno es invalido.');
  const ambient = FORBIDDEN_AMBIENT_POSTGRES_ENV.find(name => typeof env[name] === 'string' && env[name].trim() !== '');
  if (ambient) throw fail('AMBIENT_POSTGRES_ENV_FORBIDDEN', 'La URL dedicada debe ser la unica configuracion PostgreSQL ambiental.');
  if (String(env.NODE_TLS_REJECT_UNAUTHORIZED || '').trim() === '0') {
    throw fail('TLS_VERIFICATION_ENV_FORBIDDEN', 'La verificacion TLS global no puede desactivarse.');
  }
  const rawUrl = env[DATABASE_ENV];
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
    throw fail('DATABASE_URL_REQUIRED', `Falta ${DATABASE_ENV}.`);
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (error) {
    throw fail('DATABASE_URL_INVALID', 'La URL PostgreSQL dedicada es invalida.', [], error);
  }
  const loopback = new Set(['localhost', '127.0.0.1', '::1', '[::1]']).has(parsed.hostname.toLowerCase());
  try {
    const inspected = inspectDatabaseUrl(rawUrl, {
      nodeEnv: loopback ? 'development' : 'verification',
      environment: env,
    });
    return Object.freeze({
      ...inspected,
      databaseTargetFingerprintSha256: fingerprintDatabaseTarget(rawUrl),
    });
  } catch (error) {
    throw fail(error.code || 'DATABASE_URL_INVALID', 'La URL PostgreSQL dedicada no supera la politica de conexion.', [], error);
  }
}

async function createPgAdapter(connectionString) {
  const client = new pg.Client({
    connectionString,
    application_name: 'municontrol-grh-ledger-verifier',
    connectionTimeoutMillis: 5_000,
    query_timeout: 8_000,
    options: '-c default_transaction_read_only=on -c search_path=pg_catalog -c statement_timeout=5000 -c lock_timeout=1000',
  });
  await client.connect();
  return Object.freeze({
    query: query => client.query({ name: query.name, text: query.text, values: [...query.values] }),
    close: () => client.end(),
  });
}

function expectExactRows(actual, expected, failureCode, failures) {
  if (canonicalJson(actual) !== canonicalJson(expected)) failures.push(failureCode);
}

function verifyEnums(rows, failures) {
  const actual = {};
  for (const row of rows) {
    if (!actual[row.enum_name]) actual[row.enum_name] = [];
    actual[row.enum_name].push({ value: row.enum_value, order: Number(row.enum_order) });
  }
  const expected = Object.fromEntries(Object.entries(EXPECTED_ENUMS).map(([name, values]) => [
    name,
    values.map((value, index) => ({ value, order: index + 1 })),
  ]));
  if (canonicalJson(actual) !== canonicalJson(expected)) failures.push('ENUMS_MISMATCH');
}

function verifyColumns(rows, failures) {
  const byTable = Object.groupBy(rows, row => row.table_name);
  for (const [tableName, expected] of Object.entries(EXPECTED_COLUMNS)) {
    const actual = byTable[tableName] || [];
    if (actual.length !== expected.length) {
      failures.push(`COLUMNS_${tableName.toUpperCase()}_COUNT_MISMATCH`);
      continue;
    }
    expected.forEach(([name, type, notNull, defaultMatcher], index) => {
      const row = actual[index];
      const columnCode = `COLUMN_${tableName.toUpperCase()}_${name.toUpperCase()}`;
      if (row.column_name !== name) failures.push(`${columnCode}_ORDER_MISMATCH`);
      if (normalizeCatalogType(row.data_type) !== type) failures.push(`${columnCode}_TYPE_MISMATCH`);
      if (row.not_null !== notNull) failures.push(`${columnCode}_NULLABILITY_MISMATCH`);
      const actualDefault = normalizeCatalogExpression(row.default_expression);
      if (defaultMatcher === null ? actualDefault !== null : !defaultMatcher.test(String(actualDefault))) {
        failures.push(`${columnCode}_DEFAULT_MISMATCH`);
      }
    });
  }
}

function verifyConstraints(rows, failures) {
  const byTable = Object.groupBy(rows, row => row.table_name);
  for (const [tableName, expected] of Object.entries(EXPECTED_CONSTRAINTS)) {
    const actualRows = byTable[tableName] || [];
    const actualNames = actualRows.map(row => row.constraint_name).sort();
    const expectedNames = Object.keys(expected).sort();
    if (canonicalJson(actualNames) !== canonicalJson(expectedNames)) {
      failures.push(`CONSTRAINTS_${tableName.toUpperCase()}_SET_MISMATCH`);
      continue;
    }
    for (const row of actualRows) {
      const name = row.constraint_name;
      const [expectedType, expectedDefinition] = expected[name];
      if (row.constraint_type !== expectedType || row.validated !== true
        || row.deferrable !== false || row.initially_deferred !== false) {
        failures.push(`CONSTRAINT_${name.toUpperCase()}_FLAGS_MISMATCH`);
      }
      if (normalizeConstraintDefinition(row.definition)
        !== normalizeConstraintDefinition(expectedDefinition)) {
        failures.push(`CONSTRAINT_${name.toUpperCase()}_DEFINITION_MISMATCH`);
      }
    }
  }
}

function verifyIndexes(rows, failures) {
  const byTable = Object.groupBy(rows, row => row.table_name);
  for (const [tableName, expected] of Object.entries(EXPECTED_INDEXES)) {
    const actualRows = byTable[tableName] || [];
    const actualNames = actualRows.map(row => row.index_name).sort();
    const expectedNames = Object.keys(expected).sort();
    if (canonicalJson(actualNames) !== canonicalJson(expectedNames)) {
      failures.push(`INDEXES_${tableName.toUpperCase()}_SET_MISMATCH`);
      continue;
    }
    for (const row of actualRows) {
      const [expectedUnique, expectedPrimary, expectedColumns] = expected[row.index_name];
      const columnsAreExact = canonicalJson(row.key_columns) === canonicalJson(expectedColumns)
        && canonicalJson(row.key_definitions) === canonicalJson(expectedColumns);
      if (row.index_kind !== 'i'
        || row.access_method !== 'btree'
        || row.is_unique !== expectedUnique
        || row.is_primary !== expectedPrimary
        || row.is_exclusion !== false
        || row.is_immediate !== true
        || row.is_valid !== true
        || row.is_ready !== true
        || row.is_unconditional !== true
        || row.has_no_expressions !== true
        || Number(row.key_attribute_count) !== expectedColumns.length
        || Number(row.total_attribute_count) !== expectedColumns.length
        || !columnsAreExact) {
        failures.push(`INDEX_${row.index_name.toUpperCase()}_DEFINITION_MISMATCH`);
      }
    }
  }
}

function verifyTriggers(rows, failures) {
  const expectedNames = Object.keys(EXPECTED_TRIGGER_DEFINITIONS).sort();
  if (canonicalJson(rows.map(row => row.trigger_name).sort()) !== canonicalJson(expectedNames)) {
    failures.push('TRIGGERS_SET_MISMATCH');
    return;
  }
  for (const row of rows) {
    const definition = normalizeTriggerDefinition(row.definition);
    if (row.table_name !== 'grh_action_commitment_events'
      || row.enabled !== 'O'
      || row.function_name !== 'grh_action_commitment_events_deny_mutation'
      || definition !== EXPECTED_TRIGGER_DEFINITIONS[row.trigger_name]) {
      failures.push(`TRIGGER_${row.trigger_name.toUpperCase()}_MISMATCH`);
    }
  }
}

function verifyFunction(rows, failures) {
  if (rows.length !== 1) {
    failures.push('DENY_FUNCTION_COUNT_MISMATCH');
    return;
  }
  const row = rows[0];
  if (row.function_name !== 'grh_action_commitment_events_deny_mutation'
    || row.language_name !== 'plpgsql'
    || row.volatility !== 'v'
    || row.security_definer !== false
    || row.result_type !== 'trigger'
    || normalizeProcedureSource(row.source) !== EXPECTED_DENY_FUNCTION_SOURCE) {
    failures.push('DENY_FUNCTION_MISMATCH');
  }
}

function evaluateCatalog(contract, observations, now) {
  const failures = [];
  const session = observations.session.rows;
  if (session.length !== 1
    || Number(session[0].server_version_num) < 120000
    || session[0].transaction_read_only !== 'on'
    || session[0].transaction_isolation !== 'repeatable read') {
    failures.push('READ_ONLY_POSTGRES_SESSION_INVALID');
  }

  const migrationRows = observations.migration.rows;
  if (migrationRows.length !== 1
    || migrationRows[0].migration_name !== contract.migrationName
    || migrationRows[0].checksum !== contract.migrationSha256
    || migrationRows[0].finished !== true
    || migrationRows[0].not_rolled_back !== true
    || Number(migrationRows[0].applied_steps_count) !== 1) {
    failures.push('MIGRATION_HISTORY_MISMATCH');
  }

  expectExactRows(observations.relations.rows, EXPECTED_RELATIONS, 'RELATIONS_MISMATCH', failures);
  verifyEnums(observations.enums.rows, failures);
  verifyColumns(observations.columns.rows, failures);
  verifyConstraints(observations.constraints.rows, failures);
  verifyIndexes(observations.indexes.rows, failures);
  verifyTriggers(observations.triggers.rows, failures);
  verifyFunction(observations.functions.rows, failures);

  const forbiddenPrivileges = new Set(['UPDATE', 'DELETE', 'TRUNCATE']);
  if (observations.publicPrivileges.rows.some(row => forbiddenPrivileges.has(row.privilege_type))) {
    failures.push('PUBLIC_MUTATION_PRIVILEGE_PRESENT');
  }

  if (failures.length > 0) {
    throw fail('CATALOG_CONTRACT_MISMATCH', 'PostgreSQL no coincide con el contrato exacto del ledger GRH.', [...new Set(failures)].sort());
  }

  const fingerprintSource = {
    migration: migrationRows,
    relations: observations.relations.rows,
    enums: observations.enums.rows,
    columns: observations.columns.rows,
    constraints: observations.constraints.rows,
    indexes: observations.indexes.rows,
    triggers: observations.triggers.rows,
    functions: observations.functions.rows,
    publicPrivileges: observations.publicPrivileges.rows,
  };
  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    status: 'verified',
    checkedAt: now.toISOString(),
    migrationName: contract.migrationName,
    migrationSha256: contract.migrationSha256,
    serverVersionNum: Number(session[0].server_version_num),
    transactionMode: 'REPEATABLE READ READ ONLY',
    catalogFingerprintSha256: digest(canonicalJson(fingerprintSource)),
    checks: Object.freeze({
      migrationHistory: 'exact',
      relations: 3,
      enums: Object.values(EXPECTED_ENUMS).reduce((total, values) => total + values.length, 0),
      columns: Object.values(EXPECTED_COLUMNS).reduce((total, values) => total + values.length, 0),
      constraints: Object.values(EXPECTED_CONSTRAINTS).reduce((total, values) => total + Object.keys(values).length, 0),
      indexes: Object.values(EXPECTED_INDEXES).reduce((total, values) => total + Object.keys(values).length, 0),
      triggers: 2,
      appendOnlyFunction: 'exact',
      publicMutationPrivileges: 0,
    }),
  });
}

async function runConnectedVerification({
  adapter,
  contract,
  targetId,
  databaseTargetFingerprintSha256,
  clock = () => new Date(),
}) {
  if (!adapter || typeof adapter.query !== 'function') throw fail('QUERY_ADAPTER_INVALID', 'El adaptador PostgreSQL es invalido.');
  if (!SHA256_PATTERN.test(databaseTargetFingerprintSha256 || '')) {
    throw fail('DATABASE_TARGET_FINGERPRINT_INVALID', 'La identidad opaca del target PostgreSQL es invalida.');
  }
  const observationNames = [
    'session',
    'migration',
    'relations',
    'enums',
    'columns',
    'constraints',
    'indexes',
    'triggers',
    'functions',
    'publicPrivileges',
  ];
  const observations = {};
  let stage = 'begin';
  await adapter.query(QUERY.begin);
  try {
    for (const name of observationNames) {
      stage = name;
      observations[name] = await adapter.query(QUERY[name]);
    }
    stage = 'evaluation';
    const receipt = evaluateCatalog(contract, observations, clock());
    stage = 'commit';
    await adapter.query(QUERY.commit);
    return Object.freeze({ ...receipt, targetId, databaseTargetFingerprintSha256 });
  } catch (error) {
    try { await adapter.query(QUERY.rollback); } catch { /* original failure remains authoritative */ }
    if (error instanceof LedgerPostgresVerificationError) throw error;
    throw fail(
      'POSTGRES_OBSERVATION_FAILED',
      'No se pudo completar la observacion PostgreSQL read-only.',
      [`STAGE_${stage.toUpperCase()}`, safePostgresFailureCode(error)],
      error,
    );
  }
}

async function runCli(argv, {
  env = process.env,
  repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  stdout = process.stdout,
  adapterFactory = createPgAdapter,
  clock = () => new Date(),
} = {}) {
  const args = parseArguments(argv);
  if (args.mode === 'help') {
    stdout.write(HELP);
    return Object.freeze({ mode: 'help' });
  }
  const contract = await loadLocalContract(repoRoot);
  const inspectedDatabase = inspectEnvironment(env);
  if (args.mode === 'check-config') {
    const result = Object.freeze({
      contractVersion: CONTRACT_VERSION,
      mode: 'check-config',
      status: 'valid',
      targetId: args.targetId,
      databaseTargetFingerprintSha256: inspectedDatabase.databaseTargetFingerprintSha256,
      migrationName: contract.migrationName,
      migrationSha256: contract.migrationSha256,
      connected: false,
    });
    stdout.write(`${JSON.stringify(result)}\n`);
    return result;
  }

  let adapter;
  let result;
  let failure;
  try {
    adapter = await adapterFactory(inspectedDatabase.connectionString);
    if (!adapter || typeof adapter.close !== 'function') throw fail('QUERY_ADAPTER_INVALID', 'El adaptador PostgreSQL es invalido.');
    result = await runConnectedVerification({
      adapter,
      contract,
      targetId: args.targetId,
      databaseTargetFingerprintSha256: inspectedDatabase.databaseTargetFingerprintSha256,
      clock,
    });
  } catch (error) {
    failure = error;
  } finally {
    if (adapter && typeof adapter.close === 'function') {
      try {
        await adapter.close();
      } catch (error) {
        if (!failure) failure = fail('POSTGRES_CLOSE_FAILED', 'No se pudo cerrar limpiamente la conexion de observacion.', [], error);
      }
    }
  }
  if (failure) throw failure;
  stdout.write(`${JSON.stringify({ ...result, connected: true })}\n`);
  return result;
}

function formatFailure(error) {
  const code = error instanceof LedgerPostgresVerificationError ? error.code : 'UNEXPECTED_FAILURE';
  const suffix = error instanceof LedgerPostgresVerificationError && error.failures.length > 0
    ? ` (${error.failures.join(',')})`
    : '';
  return `[GRH-LEDGER-DB:${code}] Verificacion no aprobada${suffix}`;
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entrypoint === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${formatFailure(error)}\n`);
    process.exitCode = 1;
  });
}

export {
  CONFIRMATION,
  CONTRACT_VERSION,
  DATABASE_ENV,
  EXPECTED_COLUMNS,
  EXPECTED_CONSTRAINTS,
  EXPECTED_ENUMS,
  EXPECTED_INDEXES,
  EXPECTED_RELATIONS,
  FORBIDDEN_AMBIENT_POSTGRES_ENV,
  HELP,
  LedgerPostgresVerificationError,
  MIGRATION_NAME,
  QUERY,
  createPgAdapter,
  evaluateCatalog,
  formatFailure,
  inspectEnvironment,
  loadLocalContract,
  parseArguments,
  runCli,
  runConnectedVerification,
  normalizeCatalogExpression,
  normalizeCatalogType,
  safePostgresFailureCode,
};
