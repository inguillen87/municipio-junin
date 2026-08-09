'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const databaseUrlPolicy = require('./database-url-policy.cjs');

const { inspectDatabaseUrl } = databaseUrlPolicy;

const WP0_CONFIRMATION = 'RESTORED_DISPOSABLE';
const OBSERVATION_ARTIFACT_TYPE = 'wp0_restored_copy_observation';
const OBSERVATION_CONTRACT_VERSION = 2;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MIN_POSTGRES_VERSION_NUM = 120000;
const MAX_CATALOG_ROWS = 20_000;
const MAX_CATALOG_NAME_BYTES = 1024;
const MAX_CATALOG_DEFINITION_BYTES = 256 * 1024;
const MAX_CATALOG_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_MIGRATION_ROWS = 10_000;
const MAX_MIGRATION_FIELD_BYTES = 1024;
const MAX_MIGRATION_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_OBSERVATION_BYTES = 10 * 1024 * 1024;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const COMMIT_SHA = /^[a-f0-9]{40}$/u;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/u;
const REFERENCE_BODY = /^[A-Za-z0-9][A-Za-z0-9._-]{1,126}$/u;
const WP0_DATABASE_MARKER = /^municontrol\.wp0\.v1\|target_class=([A-Z][A-Z_]*)\|target_id=(target:[A-Za-z0-9][A-Za-z0-9._-]{1,126})$/u;
const MIGRATION_NAME = /^\d{14}_[a-z0-9][a-z0-9_]*$/u;
const PRISMA_MIGRATION_COLUMNS = Object.freeze([
  'applied_steps_count', 'checksum', 'finished_at', 'id', 'logs',
  'migration_name', 'rolled_back_at', 'started_at',
]);
const PRISMA_MIGRATION_COLUMN_SIGNATURE = [
  'applied_steps_count|integer|not_null=true|identity=|generated=|default=0',
  'checksum|character varying(64)|not_null=true|identity=|generated=|default=<none>',
  'finished_at|timestamp with time zone|not_null=false|identity=|generated=|default=<none>',
  'id|character varying(36)|not_null=true|identity=|generated=|default=<none>',
  'logs|text|not_null=false|identity=|generated=|default=<none>',
  'migration_name|character varying(255)|not_null=true|identity=|generated=|default=<none>',
  'rolled_back_at|timestamp with time zone|not_null=false|identity=|generated=|default=<none>',
  'started_at|timestamp with time zone|not_null=true|identity=|generated=|default=now()',
].join('\n');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const WP0_ALLOWED_URL_PARAMS = new Set(['schema', 'sslmode']);
const CATALOG_OBJECT_KINDS = new Set([
  'schema', 'relation', 'column', 'column_default', 'type', 'enum_label',
  'constraint', 'domain_constraint', 'index', 'view', 'routine', 'extension',
  'schema_acl', 'relation_acl', 'column_acl', 'type_acl', 'routine_acl',
  'default_acl', 'policy', 'trigger', 'sequence', 'partitioned_table', 'partition',
  'ordinary_inheritance',
]);
const CATALOG_LIMIT_SENTINEL_KIND = '__wp0_catalog_limit__';
const CATALOG_LIMIT_CODES = new Set([
  'CATALOG_ROW_LIMIT_EXCEEDED',
  'CATALOG_FIELD_LIMIT_EXCEEDED',
  'CATALOG_TOTAL_LIMIT_EXCEEDED',
]);
const UNSAFE_OUTPUT_VALUE = /(?:[a-z][a-z0-9+.-]*:\/\/|\bpassword\s*=|\btoken\s*=|\bsecret\s*=|\bsk-[A-Za-z0-9_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/iu;
const BASE_OBSERVATION_BLOCKERS = Object.freeze([
  'APPROVED_BRANCH_AND_UPSTREAM_UNVERIFIED',
  'BACKUP_RESTORE_RELATION_UNVERIFIED',
  'DIRECT_ENDPOINT_UNATTESTED',
  'DRIFT_NOT_EVALUATED',
  'EXTERNAL_REFERENCES_UNVERIFIED',
  'PROVIDER_RECEIPT_UNVERIFIED',
  'REVIEWER_INDEPENDENCE_UNVERIFIED',
  'TLS_CERTIFICATE_CHAIN_UNATTESTED',
  'WINDOWS_DACL_NOT_ATTESTED',
]);
const OBSERVATION_LIMITATIONS = Object.freeze([
  'No es un baseline manifest, una migración, un receipt de release ni una autorización de DDL.',
  'No demuestra ausencia de drift ni reemplaza backup, restore, diff y revisión institucional.',
  'Las referencias externas son declaraciones opacas no verificadas; no prueban custodia, hash, restore ni separación de funciones.',
  'La metadata TLS observada no atesta cadena de certificados ni endpoint directo del proveedor.',
  'El commit y el schema quedan fijados, pero la rama aprobada y su upstream no están atestados.',
  'La DACL efectiva del archivo en Windows no está atestada por este recolector.',
  'No contiene filas de negocio y no habilita aprovisionamiento de cuentas.',
]);

const QUERY_IDS = Object.freeze({
  BEGIN: 'transaction.begin',
  TRANSACTION_STATE: 'transaction.state',
  CLOCK_STATE: 'transaction.clock',
  TRANSPORT_SECURITY: 'transport.security',
  DATABASE_IDENTITY: 'database.identity',
  OBSERVER_SECURITY: 'observer.security',
  CATALOG_INVENTORY: 'catalog.inventory',
  MIGRATION_LOCATOR: 'prisma.migrations.locator',
  MIGRATION_HISTORY: 'prisma.migrations.history',
  COMMIT: 'transaction.commit',
  ROLLBACK: 'transaction.rollback',
});

const FIXED_QUERIES = Object.freeze({
  [QUERY_IDS.BEGIN]: Object.freeze({
    text: 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
    values: Object.freeze([]),
  }),
  [QUERY_IDS.TRANSACTION_STATE]: Object.freeze({
    text: [
      'SELECT',
      "  pg_catalog.current_setting('transaction_read_only') AS transaction_read_only,",
      "  pg_catalog.current_setting('transaction_isolation') AS transaction_isolation,",
      "  pg_catalog.current_setting('row_security') AS row_security,",
      "  pg_catalog.current_setting('search_path') AS search_path",
    ].join('\n'),
    values: Object.freeze([]),
  }),
  [QUERY_IDS.CLOCK_STATE]: Object.freeze({
    text: [
      'SELECT',
      '  pg_catalog.clock_timestamp() AS database_clock,',
      '  pg_catalog.transaction_timestamp() AS transaction_started_at',
    ].join('\n'),
    values: Object.freeze([]),
  }),
  [QUERY_IDS.TRANSPORT_SECURITY]: Object.freeze({
    text: [
      'SELECT',
      '  ssl::text AS ssl,',
      '  version::text AS protocol,',
      '  cipher::text AS cipher,',
      '  bits::text AS bits',
      'FROM pg_catalog.pg_stat_ssl',
      'WHERE pid = pg_catalog.pg_backend_pid()',
    ].join('\n'),
    values: Object.freeze([]),
  }),
  [QUERY_IDS.DATABASE_IDENTITY]: Object.freeze({
    text: [
      'SELECT',
      '  database.datname::text AS database_name,',
      "  pg_catalog.current_setting('server_version_num') AS server_version_num,",
      "  pg_catalog.shobj_description(database.oid, 'pg_database')::text AS wp0_marker",
      'FROM pg_catalog.pg_database AS database',
      'WHERE database.datname = pg_catalog.current_database()',
    ].join('\n'),
    values: Object.freeze([]),
  }),
  [QUERY_IDS.OBSERVER_SECURITY]: Object.freeze({
    text: [
      'WITH current_role_record AS (',
      '  SELECT r.oid, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb,',
      '    r.rolcanlogin, r.rolreplication, r.rolbypassrls',
      '  FROM pg_catalog.pg_roles AS r',
      '  WHERE r.rolname = current_user',
      '), governed_namespaces AS (',
      '  SELECT n.oid, n.nspname',
      '  FROM pg_catalog.pg_namespace AS n',
      "  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')",
      "    AND n.nspname !~ '^pg_(toast|temp)'",
      '), governed_relations AS (',
      '  SELECT c.oid, c.relkind, c.relname, n.nspname',
      '  FROM pg_catalog.pg_class AS c',
      '  JOIN governed_namespaces AS n ON n.oid = c.relnamespace',
      "  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')",
      '), governed_routines AS (',
      '  SELECT p.oid',
      '  FROM pg_catalog.pg_proc AS p',
      '  JOIN governed_namespaces AS n ON n.oid = p.pronamespace',
      ')',
      'SELECT',
      '  session_user::text AS session_user_name,',
      '  current_user::text AS current_user_name,',
      '  role.rolsuper::text AS role_superuser,',
      '  role.rolinherit::text AS role_inherit,',
      '  role.rolcreaterole::text AS role_create_role,',
      '  role.rolcreatedb::text AS role_create_db,',
      '  role.rolcanlogin::text AS role_can_login,',
      '  role.rolreplication::text AS role_replication,',
      '  role.rolbypassrls::text AS role_bypass_rls,',
      '  (SELECT pg_catalog.count(*) FROM pg_catalog.pg_roles AS candidate',
      "    WHERE candidate.oid <> role.oid AND pg_catalog.pg_has_role(current_user, candidate.oid, 'MEMBER'))::text AS role_membership_count,",
      '  (SELECT pg_catalog.count(*) FROM pg_catalog.pg_roles AS candidate',
      '    WHERE candidate.oid <> role.oid',
      '      AND (candidate.rolsuper OR candidate.rolcreaterole OR candidate.rolcreatedb',
      '        OR candidate.rolreplication OR candidate.rolbypassrls)',
      "      AND pg_catalog.pg_has_role(current_user, candidate.oid, 'MEMBER'))::text AS unsafe_membership_count,",
      "  pg_catalog.has_database_privilege(current_user, pg_catalog.current_database(), 'CREATE')::text AS database_create,",
      "  pg_catalog.has_database_privilege(current_user, pg_catalog.current_database(), 'CONNECT')::text AS database_connect,",
      "  pg_catalog.has_database_privilege(current_user, pg_catalog.current_database(), 'TEMP')::text AS database_temp,",
      "  coalesce((SELECT pg_catalog.bool_or(pg_catalog.has_schema_privilege(current_user, n.oid, 'CREATE'))",
      '    FROM governed_namespaces AS n), false)::text AS governed_schema_create,',
      "  coalesce((SELECT pg_catalog.bool_or(pg_catalog.has_schema_privilege(current_user, n.oid, 'USAGE'))",
      '    FROM governed_namespaces AS n), false)::text AS governed_schema_usage,',
      "  coalesce((SELECT pg_catalog.bool_or(pg_catalog.has_table_privilege(current_user, r.oid, 'INSERT')",
      "    OR pg_catalog.has_table_privilege(current_user, r.oid, 'UPDATE')",
      "    OR pg_catalog.has_table_privilege(current_user, r.oid, 'DELETE')",
      "    OR pg_catalog.has_table_privilege(current_user, r.oid, 'TRUNCATE')",
      "    OR pg_catalog.has_table_privilege(current_user, r.oid, 'REFERENCES')",
      "    OR pg_catalog.has_table_privilege(current_user, r.oid, 'TRIGGER'))",
      "    FROM governed_relations AS r WHERE r.relkind <> 'S'), false)::text AS governed_relation_write,",
      "  coalesce((SELECT pg_catalog.bool_or(pg_catalog.has_any_column_privilege(current_user, r.oid, 'INSERT')",
      "    OR pg_catalog.has_any_column_privilege(current_user, r.oid, 'UPDATE')",
      "    OR pg_catalog.has_any_column_privilege(current_user, r.oid, 'REFERENCES'))",
      "    FROM governed_relations AS r WHERE r.relkind <> 'S'), false)::text AS governed_column_write,",
      "  coalesce((SELECT pg_catalog.bool_or(pg_catalog.has_sequence_privilege(current_user, r.oid, 'USAGE')",
      "    OR pg_catalog.has_sequence_privilege(current_user, r.oid, 'UPDATE'))",
      "    FROM governed_relations AS r WHERE r.relkind = 'S'), false)::text AS governed_sequence_write,",
      "  coalesce((SELECT pg_catalog.bool_or(pg_catalog.has_function_privilege(current_user, p.oid, 'EXECUTE'))",
      '    FROM governed_routines AS p), false)::text AS governed_routine_execute,',
      "  coalesce((SELECT pg_catalog.bool_or(pg_catalog.has_table_privilege(current_user, r.oid, 'SELECT'))",
      "    FROM governed_relations AS r WHERE r.relkind <> 'S'",
      "      AND NOT (r.nspname = $1 AND r.relname = '_prisma_migrations')), false)::text AS business_relation_select,",
      "  coalesce((SELECT pg_catalog.bool_or(pg_catalog.has_any_column_privilege(current_user, r.oid, 'SELECT'))",
      "    FROM governed_relations AS r WHERE r.relkind <> 'S'",
      "      AND NOT (r.nspname = $1 AND r.relname = '_prisma_migrations')), false)::text AS business_column_select,",
      "  coalesce((SELECT pg_catalog.bool_or(pg_catalog.has_table_privilege(current_user, r.oid, 'SELECT'))",
      '    FROM governed_relations AS r',
      "    WHERE r.nspname = $1 AND r.relname = '_prisma_migrations' AND r.relkind = 'r'), false)::text AS migration_history_select",
      'FROM current_role_record AS role',
    ].join('\n'),
  }),
  [QUERY_IDS.CATALOG_INVENTORY]: Object.freeze({
    text: [
      'WITH governed_namespaces AS (',
      '  SELECT n.oid, n.nspname, n.nspowner, n.nspacl, pg_catalog.pg_get_userbyid(n.nspowner) AS owner_name',
      '  FROM pg_catalog.pg_namespace AS n',
      "  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')",
      "    AND n.nspname !~ '^pg_(toast|temp)'",
      '), inventory AS MATERIALIZED (',
      "  SELECT 'schema'::text AS object_kind, n.nspname::text AS schema_name,",
      "    n.nspname::text AS object_name, NULL::text AS parent_name,",
      "    ('owner=' || n.owner_name)::text AS definition",
      '  FROM governed_namespaces AS n',
      '  UNION ALL',
      "  SELECT 'relation', n.nspname, c.relname, NULL::text,",
      "    ('kind=' || c.relkind || ';owner=' || pg_catalog.pg_get_userbyid(c.relowner) ||",
      "     ';rls=' || c.relrowsecurity::text || ';force_rls=' || c.relforcerowsecurity::text)::text",
      '  FROM pg_catalog.pg_class AS c',
      '  JOIN governed_namespaces AS n ON n.oid = c.relnamespace',
      "  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')",
      '  UNION ALL',
      "  SELECT 'column', n.nspname, a.attname, c.relname,",
      "    ('type=' || pg_catalog.format_type(a.atttypid, a.atttypmod) ||",
      "     ';not_null=' || a.attnotnull::text || ';identity=' || a.attidentity ||",
      "     ';generated=' || a.attgenerated || ';default=' ||",
      "     coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid, true), '<none>'))::text",
      '  FROM pg_catalog.pg_attribute AS a',
      '  JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid',
      '  JOIN governed_namespaces AS n ON n.oid = c.relnamespace',
      '  LEFT JOIN pg_catalog.pg_attrdef AS d ON d.adrelid = a.attrelid AND d.adnum = a.attnum',
      "  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f') AND a.attnum > 0 AND NOT a.attisdropped",
      '  UNION ALL',
      "  SELECT 'column_default', n.nspname, a.attname, c.relname,",
      '    pg_catalog.pg_get_expr(d.adbin, d.adrelid, true)::text',
      '  FROM pg_catalog.pg_attrdef AS d',
      '  JOIN pg_catalog.pg_attribute AS a ON a.attrelid = d.adrelid AND a.attnum = d.adnum',
      '  JOIN pg_catalog.pg_class AS c ON c.oid = d.adrelid',
      '  JOIN governed_namespaces AS n ON n.oid = c.relnamespace',
      '  WHERE NOT a.attisdropped',
      '  UNION ALL',
      "  SELECT 'type', n.nspname, t.typname, NULL::text,",
      "    ('kind=' || t.typtype || ';category=' || t.typcategory ||",
      "     ';owner=' || pg_catalog.pg_get_userbyid(t.typowner) || ';not_null=' || t.typnotnull::text ||",
      "     ';base=' || CASE WHEN t.typbasetype = 0 THEN '<none>' ELSE pg_catalog.format_type(t.typbasetype, t.typtypmod) END ||",
      "     ';default=' || coalesce(t.typdefault, '<none>'))::text",
      '  FROM pg_catalog.pg_type AS t',
      '  JOIN governed_namespaces AS n ON n.oid = t.typnamespace',
      '  WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class AS typed_relation WHERE typed_relation.reltype = t.oid)',
      '  UNION ALL',
      "  SELECT 'enum_label', n.nspname, e.enumlabel::text, t.typname,",
      "    ('sort_order=' || e.enumsortorder::text)::text",
      '  FROM pg_catalog.pg_enum AS e',
      '  JOIN pg_catalog.pg_type AS t ON t.oid = e.enumtypid',
      '  JOIN governed_namespaces AS n ON n.oid = t.typnamespace',
      '  UNION ALL',
      "  SELECT 'constraint', n.nspname, con.conname, c.relname,",
      '    pg_catalog.pg_get_constraintdef(con.oid, true)::text',
      '  FROM pg_catalog.pg_constraint AS con',
      '  JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid',
      '  JOIN governed_namespaces AS n ON n.oid = c.relnamespace',
      '  UNION ALL',
      "  SELECT 'domain_constraint', n.nspname, con.conname, t.typname,",
      '    pg_catalog.pg_get_constraintdef(con.oid, true)::text',
      '  FROM pg_catalog.pg_constraint AS con',
      '  JOIN pg_catalog.pg_type AS t ON t.oid = con.contypid',
      '  JOIN governed_namespaces AS n ON n.oid = t.typnamespace',
      '  WHERE con.contypid <> 0',
      '  UNION ALL',
      "  SELECT 'index', n.nspname, i.relname, c.relname,",
      '    pg_catalog.pg_get_indexdef(i.oid, 0, true)::text',
      '  FROM pg_catalog.pg_index AS x',
      '  JOIN pg_catalog.pg_class AS i ON i.oid = x.indexrelid',
      '  JOIN pg_catalog.pg_class AS c ON c.oid = x.indrelid',
      '  JOIN governed_namespaces AS n ON n.oid = c.relnamespace',
      '  UNION ALL',
      "  SELECT 'view', n.nspname, c.relname, NULL::text,",
      "    ('kind=' || c.relkind || ';definition=' || pg_catalog.pg_get_viewdef(c.oid, true))::text",
      '  FROM pg_catalog.pg_class AS c',
      '  JOIN governed_namespaces AS n ON n.oid = c.relnamespace',
      "  WHERE c.relkind IN ('v', 'm')",
      '  UNION ALL',
      "  SELECT 'routine', n.nspname,",
      "    (p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')')::text, NULL::text,",
      "    ('kind=' || p.prokind || ';owner=' || pg_catalog.pg_get_userbyid(p.proowner) ||",
      "     ';language=' || l.lanname || ';returns=' || coalesce(pg_catalog.pg_get_function_result(p.oid), '<procedure>') ||",
      "     ';definition=' || pg_catalog.pg_get_functiondef(p.oid))::text",
      '  FROM pg_catalog.pg_proc AS p',
      '  JOIN governed_namespaces AS n ON n.oid = p.pronamespace',
      '  JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang',
      "  WHERE p.prokind IN ('f', 'p', 'w')",
      '  UNION ALL',
      "  SELECT 'extension', n.nspname, e.extname, NULL::text,",
      "    ('version=' || e.extversion || ';relocatable=' || e.extrelocatable::text ||",
      "     ';owner=' || pg_catalog.pg_get_userbyid(e.extowner))::text",
      '  FROM pg_catalog.pg_extension AS e',
      '  JOIN pg_catalog.pg_namespace AS n ON n.oid = e.extnamespace',
      '  UNION ALL',
      "  SELECT 'schema_acl', n.nspname, n.nspname, NULL::text,",
      "    ('grantor=' || pg_catalog.pg_get_userbyid(acl.grantor) || ';grantee=' ||",
      "     CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(acl.grantee) END ||",
      "     ';privilege=' || acl.privilege_type || ';grantable=' || acl.is_grantable::text)::text",
      '  FROM governed_namespaces AS n',
      "  CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) AS acl",
      '  UNION ALL',
      "  SELECT 'relation_acl', n.nspname, c.relname, NULL::text,",
      "    ('grantor=' || pg_catalog.pg_get_userbyid(acl.grantor) || ';grantee=' ||",
      "     CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(acl.grantee) END ||",
      "     ';privilege=' || acl.privilege_type || ';grantable=' || acl.is_grantable::text)::text",
      '  FROM pg_catalog.pg_class AS c',
      '  JOIN governed_namespaces AS n ON n.oid = c.relnamespace',
      "  CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault(CASE WHEN c.relkind = 'S' THEN 'S'::\"char\" ELSE 'r'::\"char\" END, c.relowner))) AS acl",
      "  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')",
      '  UNION ALL',
      "  SELECT 'column_acl', n.nspname, a.attname, c.relname,",
      "    ('grantor=' || pg_catalog.pg_get_userbyid(acl.grantor) || ';grantee=' ||",
      "     CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(acl.grantee) END ||",
      "     ';privilege=' || acl.privilege_type || ';grantable=' || acl.is_grantable::text)::text",
      '  FROM pg_catalog.pg_attribute AS a',
      '  JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid',
      '  JOIN governed_namespaces AS n ON n.oid = c.relnamespace',
      '  CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) AS acl',
      '  WHERE a.attacl IS NOT NULL AND a.attnum > 0 AND NOT a.attisdropped',
      '  UNION ALL',
      "  SELECT 'type_acl', n.nspname, t.typname, NULL::text,",
      "    ('grantor=' || pg_catalog.pg_get_userbyid(acl.grantor) || ';grantee=' ||",
      "     CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(acl.grantee) END ||",
      "     ';privilege=' || acl.privilege_type || ';grantable=' || acl.is_grantable::text)::text",
      '  FROM pg_catalog.pg_type AS t',
      '  JOIN governed_namespaces AS n ON n.oid = t.typnamespace',
      "  CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(t.typacl, pg_catalog.acldefault('T', t.typowner))) AS acl",
      '  UNION ALL',
      "  SELECT 'routine_acl', n.nspname,",
      "    (p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')')::text, NULL::text,",
      "    ('grantor=' || pg_catalog.pg_get_userbyid(acl.grantor) || ';grantee=' ||",
      "     CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(acl.grantee) END ||",
      "     ';privilege=' || acl.privilege_type || ';grantable=' || acl.is_grantable::text)::text",
      '  FROM pg_catalog.pg_proc AS p',
      '  JOIN governed_namespaces AS n ON n.oid = p.pronamespace',
      "  CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS acl",
      '  UNION ALL',
      "  SELECT 'default_acl', coalesce(n.nspname, '*'), pg_catalog.pg_get_userbyid(d.defaclrole), NULL::text,",
      "    ('object_type=' || d.defaclobjtype || ';grantor=' || pg_catalog.pg_get_userbyid(acl.grantor) ||",
      "     ';grantee=' || CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(acl.grantee) END ||",
      "     ';privilege=' || acl.privilege_type || ';grantable=' || acl.is_grantable::text)::text",
      '  FROM pg_catalog.pg_default_acl AS d',
      '  LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = d.defaclnamespace',
      '  CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) AS acl',
      '  UNION ALL',
      "  SELECT 'policy', n.nspname, p.polname, c.relname,",
      "    ('permissive=' || p.polpermissive::text || ';command=' || p.polcmd || ';roles=' ||",
      "     pg_catalog.array_to_string(ARRAY(SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role_oid) END FROM pg_catalog.unnest(p.polroles) AS role_entry(role_oid) ORDER BY role_oid), ',') ||",
      "     ';using=' || coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid, true), '<none>') ||",
      "     ';check=' || coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid, true), '<none>'))::text",
      '  FROM pg_catalog.pg_policy AS p',
      '  JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid',
      '  JOIN governed_namespaces AS n ON n.oid = c.relnamespace',
      '  UNION ALL',
      "  SELECT 'trigger', n.nspname, t.tgname, c.relname, pg_catalog.pg_get_triggerdef(t.oid, true)::text",
      '  FROM pg_catalog.pg_trigger AS t',
      '  JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid',
      '  JOIN governed_namespaces AS n ON n.oid = c.relnamespace',
      '  WHERE NOT t.tgisinternal',
      '  UNION ALL',
      "  SELECT 'sequence', n.nspname, c.relname, NULL::text,",
      "    ('type=' || pg_catalog.format_type(s.seqtypid, -1) || ';start=' || s.seqstart::text ||",
      "     ';increment=' || s.seqincrement::text || ';min=' || s.seqmin::text || ';max=' || s.seqmax::text ||",
      "     ';cache=' || s.seqcache::text || ';cycle=' || s.seqcycle::text)::text",
      '  FROM pg_catalog.pg_sequence AS s',
      '  JOIN pg_catalog.pg_class AS c ON c.oid = s.seqrelid',
      '  JOIN governed_namespaces AS n ON n.oid = c.relnamespace',
      '  UNION ALL',
      "  SELECT 'partitioned_table', n.nspname, c.relname, NULL::text,",
      "    ('strategy=' || p.partstrat || ';key=' || pg_catalog.pg_get_partkeydef(c.oid))::text",
      '  FROM pg_catalog.pg_partitioned_table AS p',
      '  JOIN pg_catalog.pg_class AS c ON c.oid = p.partrelid',
      '  JOIN governed_namespaces AS n ON n.oid = c.relnamespace',
      '  UNION ALL',
      "  SELECT 'partition', child_namespace.nspname, child.relname, parent.relname,",
      "    ('parent_schema=' || parent_namespace.nspname || ';bound=' ||",
      "     pg_catalog.pg_get_expr(child.relpartbound, child.oid, true))::text",
      '  FROM pg_catalog.pg_inherits AS inheritance',
      '  JOIN pg_catalog.pg_class AS child ON child.oid = inheritance.inhrelid',
      '  JOIN governed_namespaces AS child_namespace ON child_namespace.oid = child.relnamespace',
      '  JOIN pg_catalog.pg_class AS parent ON parent.oid = inheritance.inhparent',
      '  JOIN pg_catalog.pg_namespace AS parent_namespace ON parent_namespace.oid = parent.relnamespace',
      '  WHERE child.relispartition',
      '  UNION ALL',
      "  SELECT 'ordinary_inheritance', child_namespace.nspname, child.relname, parent.relname,",
      "    ('parent_schema=' || parent_namespace.nspname || ';sequence=' || inheritance.inhseqno::text)::text",
      '  FROM pg_catalog.pg_inherits AS inheritance',
      '  JOIN pg_catalog.pg_class AS child ON child.oid = inheritance.inhrelid',
      '  JOIN governed_namespaces AS child_namespace ON child_namespace.oid = child.relnamespace',
      '  JOIN pg_catalog.pg_class AS parent ON parent.oid = inheritance.inhparent',
      '  JOIN pg_catalog.pg_namespace AS parent_namespace ON parent_namespace.oid = parent.relnamespace',
      '  WHERE NOT child.relispartition',
      '), inventory_stats AS (',
      '  SELECT',
      '    pg_catalog.count(*)::bigint AS row_count,',
      '    coalesce(pg_catalog.max(pg_catalog.octet_length(object_kind)), 0)::bigint AS max_object_kind_bytes,',
      '    coalesce(pg_catalog.max(pg_catalog.octet_length(schema_name)), 0)::bigint AS max_schema_name_bytes,',
      '    coalesce(pg_catalog.max(pg_catalog.octet_length(object_name)), 0)::bigint AS max_object_name_bytes,',
      '    coalesce(pg_catalog.max(pg_catalog.octet_length(parent_name)), 0)::bigint AS max_parent_name_bytes,',
      '    coalesce(pg_catalog.max(pg_catalog.octet_length(definition)), 0)::bigint AS max_definition_bytes,',
      '    coalesce(pg_catalog.sum(',
      '      pg_catalog.octet_length(object_kind)::bigint +',
      '      pg_catalog.octet_length(schema_name)::bigint +',
      '      pg_catalog.octet_length(object_name)::bigint +',
      '      coalesce(pg_catalog.octet_length(parent_name), 0)::bigint +',
      '      pg_catalog.octet_length(definition)::bigint',
      '    ), 0) AS total_bytes',
      '  FROM inventory',
      '), catalog_budget AS (',
      '  SELECT CASE',
      `    WHEN row_count > ${MAX_CATALOG_ROWS} THEN 'CATALOG_ROW_LIMIT_EXCEEDED'`,
      `    WHEN max_object_kind_bytes > ${MAX_CATALOG_NAME_BYTES}`,
      `      OR max_schema_name_bytes > ${MAX_CATALOG_NAME_BYTES}`,
      `      OR max_object_name_bytes > ${MAX_CATALOG_NAME_BYTES}`,
      `      OR max_parent_name_bytes > ${MAX_CATALOG_NAME_BYTES}`,
      `      OR max_definition_bytes > ${MAX_CATALOG_DEFINITION_BYTES}`,
      "      THEN 'CATALOG_FIELD_LIMIT_EXCEEDED'",
      `    WHEN total_bytes > ${MAX_CATALOG_TOTAL_BYTES} THEN 'CATALOG_TOTAL_LIMIT_EXCEEDED'`,
      '    ELSE NULL::text',
      '  END AS limit_code',
      '  FROM inventory_stats',
      '), bounded_inventory AS (',
      '  SELECT inventory.object_kind, inventory.schema_name, inventory.object_name,',
      '    inventory.parent_name, inventory.definition',
      '  FROM inventory CROSS JOIN catalog_budget',
      '  WHERE catalog_budget.limit_code IS NULL',
      '  UNION ALL',
      `  SELECT '${CATALOG_LIMIT_SENTINEL_KIND}', 'wp0', catalog_budget.limit_code, NULL::text,`,
      "    'server_side_budget_rejected'::text",
      '  FROM catalog_budget',
      '  WHERE catalog_budget.limit_code IS NOT NULL',
      ')',
      'SELECT object_kind, schema_name, object_name, parent_name, definition',
      'FROM bounded_inventory',
      `LIMIT ${MAX_CATALOG_ROWS + 1}`,
    ].join('\n'),
    values: Object.freeze([]),
  }),
  [QUERY_IDS.MIGRATION_LOCATOR]: Object.freeze({
    text: [
      'WITH located AS (',
      '  SELECT c.oid, c.relkind, c.relpersistence, c.relrowsecurity, c.relforcerowsecurity',
      '  FROM pg_catalog.pg_class AS c',
      '  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace',
      "  WHERE n.nspname = $1 AND c.relname = '_prisma_migrations'",
      '), ordinary_table AS (',
      "  SELECT oid FROM located WHERE relkind = 'r'",
      ')',
      'SELECT',
      '  pg_catalog.count(*)::text AS named_object_count,',
      "  pg_catalog.count(*) FILTER (WHERE c.relkind = 'r')::text AS relation_count,",
      "  coalesce(pg_catalog.string_agg(c.relkind::text, ',' ORDER BY c.relkind::text), '') AS relation_kinds,",
      "  coalesce(pg_catalog.string_agg(c.relpersistence::text, ',' ORDER BY c.relpersistence::text), '') AS relation_persistence,",
      '  (SELECT pg_catalog.count(*)::text FROM pg_catalog.pg_attribute AS a',
      '    JOIN ordinary_table AS target ON target.oid = a.attrelid',
      '    WHERE a.attnum > 0 AND NOT a.attisdropped) AS column_count,',
      "  coalesce((SELECT pg_catalog.string_agg(a.attname, ',' ORDER BY a.attname) FROM pg_catalog.pg_attribute AS a",
      '    JOIN ordinary_table AS target ON target.oid = a.attrelid',
      "    WHERE a.attnum > 0 AND NOT a.attisdropped), '') AS column_names,",
      "  coalesce((SELECT pg_catalog.string_agg(a.attname || '|' || pg_catalog.format_type(a.atttypid, a.atttypmod) ||",
      "    '|not_null=' || a.attnotnull::text || '|identity=' || a.attidentity || '|generated=' || a.attgenerated ||",
      "    '|default=' || coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid, true), '<none>'), E'\\n' ORDER BY a.attname)",
      '    FROM pg_catalog.pg_attribute AS a',
      '    JOIN ordinary_table AS target ON target.oid = a.attrelid',
      '    LEFT JOIN pg_catalog.pg_attrdef AS d ON d.adrelid = a.attrelid AND d.adnum = a.attnum',
      "    WHERE a.attnum > 0 AND NOT a.attisdropped), '') AS column_signature,",
      "  (SELECT pg_catalog.count(*)::text FROM pg_catalog.pg_constraint AS con",
      "    JOIN ordinary_table AS target ON target.oid = con.conrelid WHERE con.contype = 'p') AS primary_key_count,",
      "  coalesce((SELECT pg_catalog.string_agg(attribute.attname, ',' ORDER BY key_column.ordinality)",
      '    FROM pg_catalog.pg_constraint AS con',
      '    JOIN ordinary_table AS target ON target.oid = con.conrelid',
      '    CROSS JOIN LATERAL pg_catalog.unnest(con.conkey) WITH ORDINALITY AS key_column(attnum, ordinality)',
      '    JOIN pg_catalog.pg_attribute AS attribute',
      '      ON attribute.attrelid = con.conrelid AND attribute.attnum = key_column.attnum',
      "    WHERE con.contype = 'p'), '') AS primary_key_columns,",
      "  coalesce(pg_catalog.bool_or(c.relrowsecurity), false)::text AS row_level_security,",
      "  coalesce(pg_catalog.bool_or(c.relforcerowsecurity), false)::text AS force_row_level_security",
      'FROM located AS c',
    ].join('\n'),
  }),
  [QUERY_IDS.COMMIT]: Object.freeze({ text: 'COMMIT', values: Object.freeze([]) }),
  [QUERY_IDS.ROLLBACK]: Object.freeze({ text: 'ROLLBACK', values: Object.freeze([]) }),
});

const ROW_FIELDS = Object.freeze({
  [QUERY_IDS.TRANSACTION_STATE]: Object.freeze([
    'transaction_read_only', 'transaction_isolation', 'row_security', 'search_path',
  ]),
  [QUERY_IDS.CLOCK_STATE]: Object.freeze(['database_clock', 'transaction_started_at']),
  [QUERY_IDS.TRANSPORT_SECURITY]: Object.freeze(['ssl', 'protocol', 'cipher', 'bits']),
  [QUERY_IDS.DATABASE_IDENTITY]: Object.freeze([
    'database_name', 'server_version_num', 'wp0_marker',
  ]),
  [QUERY_IDS.OBSERVER_SECURITY]: Object.freeze([
    'session_user_name', 'current_user_name', 'role_superuser', 'role_inherit',
    'role_create_role', 'role_create_db', 'role_can_login', 'role_replication',
    'role_bypass_rls', 'role_membership_count', 'unsafe_membership_count',
    'database_create', 'database_connect', 'database_temp',
    'governed_schema_create', 'governed_schema_usage', 'governed_relation_write',
    'governed_column_write', 'governed_sequence_write', 'governed_routine_execute',
    'business_relation_select', 'business_column_select', 'migration_history_select',
  ]),
  [QUERY_IDS.CATALOG_INVENTORY]: Object.freeze(['object_kind', 'schema_name', 'object_name', 'parent_name', 'definition']),
  [QUERY_IDS.MIGRATION_LOCATOR]: Object.freeze([
    'named_object_count', 'relation_count', 'relation_kinds', 'relation_persistence',
    'column_count', 'column_names', 'column_signature',
    'primary_key_count', 'primary_key_columns',
    'row_level_security', 'force_row_level_security',
  ]),
  [QUERY_IDS.MIGRATION_HISTORY]: Object.freeze([
    'migration_id', 'checksum', 'migration_name', 'started_at', 'finished_at',
    'rolled_back_at', 'applied_steps_count',
  ]),
});

class Wp0ObservationError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'Wp0ObservationError';
    this.code = code;
  }
}

function fail(code, message, cause) {
  throw new Wp0ObservationError(code, message, cause);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalize(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('OBSERVATION_VALUE_INVALID', 'La observación contiene un número no finito.');
    return value;
  }
  if (typeof value === 'bigint') return value.toString(10);
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) fail('OBSERVATION_VALUE_INVALID', 'La observación contiene una fecha inválida.');
    return value.toISOString();
  }
  if (!value || typeof value !== 'object' || Buffer.isBuffer(value)) {
    fail('OBSERVATION_VALUE_INVALID', 'La observación contiene un tipo no permitido.');
  }
  if (ancestors.has(value)) fail('OBSERVATION_VALUE_INVALID', 'La observación no admite ciclos.');
  ancestors.add(value);
  const ownNames = Object.getOwnPropertyNames(value);
  if (ownNames.includes('__proto__')) {
    fail('OBSERVATION_KEY_FORBIDDEN', 'La observacion contiene una clave de objeto prohibida.');
  }
  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.includes('__proto__')) {
      fail('OBSERVATION_KEY_FORBIDDEN', 'La observacion contiene una clave de objeto prohibida.');
    }
    if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
      fail('OBSERVATION_VALUE_INVALID', 'La observación contiene un array disperso o extendido.');
    }
    if (ownNames.length !== keys.length + 1 || !ownNames.includes('length')) {
      fail('OBSERVATION_VALUE_INVALID', 'La observación no admite propiedades ocultas en arrays.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.hasOwn(descriptors, '__proto__')) {
      fail('OBSERVATION_KEY_FORBIDDEN', 'La observacion contiene una clave de objeto prohibida.');
    }
    const result = keys.map(key => {
      if (!Object.hasOwn(descriptors[key], 'value')) {
        fail('OBSERVATION_VALUE_INVALID', 'La observación no admite accessors.');
      }
      return canonicalize(descriptors[key].value, ancestors);
    });
    ancestors.delete(value);
    return result;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail('OBSERVATION_VALUE_INVALID', 'La observación exige objetos planos.');
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    fail('OBSERVATION_VALUE_INVALID', 'La observación no admite claves Symbol.');
  }
  const keys = Object.keys(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (keys.includes('__proto__') || Object.hasOwn(descriptors, '__proto__')) {
    fail('OBSERVATION_KEY_FORBIDDEN', 'La observacion contiene una clave de objeto prohibida.');
  }
  if (ownNames.length !== keys.length) {
    fail('OBSERVATION_VALUE_INVALID', 'La observación no admite propiedades ocultas.');
  }
  const result = {};
  for (const key of keys.sort()) {
    if (key === '__proto__') {
      fail('OBSERVATION_KEY_FORBIDDEN', 'La observacion contiene una clave de objeto prohibida.');
    }
    if (!Object.hasOwn(descriptors[key], 'value')) {
      fail('OBSERVATION_VALUE_INVALID', 'La observación no admite accessors.');
    }
    result[key] = canonicalize(descriptors[key].value, ancestors);
  }
  ancestors.delete(value);
  return result;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function exactKeys(record, expected) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  const actual = Object.keys(record).sort();
  return actual.length === expected.length && expected.every((key, index) => key === actual[index]);
}

function normalizeScalar(value) {
  const normalized = canonicalize(value);
  if (typeof normalized === 'string') return normalized.normalize('NFC');
  if (normalized === null || typeof normalized === 'boolean' || typeof normalized === 'number') return normalized;
  fail('QUERY_RESULT_SCALAR_INVALID', 'La consulta allowlisted devolvió un valor no escalar.');
}

function normalizeMigrationTimestamp(field, value) {
  if (!['started_at', 'finished_at', 'rolled_back_at'].includes(field) || value === null) return value;
  const timestamp = timestampMillis(value);
  return timestamp === null ? value : new Date(timestamp).toISOString();
}

function normalizeRows(queryId, rows) {
  const fields = ROW_FIELDS[queryId];
  if (!fields || !Array.isArray(rows)) fail('QUERY_RESULT_INVALID', `Resultado inválido para ${queryId}.`);
  if (queryId === QUERY_IDS.CATALOG_INVENTORY && rows.length > MAX_CATALOG_ROWS) {
    fail('CATALOG_ROW_LIMIT_EXCEEDED', 'El inventario excede el máximo de filas permitido.');
  }
  if (queryId === QUERY_IDS.MIGRATION_HISTORY && rows.length > MAX_MIGRATION_ROWS) {
    fail('MIGRATION_ROW_LIMIT_EXCEEDED', 'La historia Prisma excede el máximo de filas permitido.');
  }
  const sortedFields = [...fields].sort();
  let catalogTotalBytes = 0;
  let migrationTotalBytes = 0;
  const normalized = rows.map(row => {
    if (!exactKeys(row, sortedFields)) fail('QUERY_RESULT_SHAPE_INVALID', `Columnas inesperadas en ${queryId}.`);
    const result = {};
    for (const field of fields) {
      const scalar = normalizeScalar(row[field]);
      if (queryId === QUERY_IDS.MIGRATION_HISTORY && scalar !== null) {
        const bytes = Buffer.byteLength(String(scalar), 'utf8');
        if (bytes > MAX_MIGRATION_FIELD_BYTES) {
          fail('MIGRATION_FIELD_LIMIT_EXCEEDED', `El campo ${field} excede el límite WP0-L.`);
        }
        migrationTotalBytes += bytes;
        if (migrationTotalBytes > MAX_MIGRATION_TOTAL_BYTES) {
          fail('MIGRATION_TOTAL_LIMIT_EXCEEDED', 'La historia Prisma excede el máximo total de bytes permitido.');
        }
      }
      result[field] = normalizeMigrationTimestamp(field, scalar);
      if (queryId === QUERY_IDS.CATALOG_INVENTORY && result[field] !== null) {
        const bytes = Buffer.byteLength(String(result[field]), 'utf8');
        const fieldLimit = field === 'definition' ? MAX_CATALOG_DEFINITION_BYTES : MAX_CATALOG_NAME_BYTES;
        if (bytes > fieldLimit) {
          fail('CATALOG_FIELD_LIMIT_EXCEEDED', `El campo ${field} excede el límite WP0-L.`);
        }
        catalogTotalBytes += bytes;
        if (catalogTotalBytes > MAX_CATALOG_TOTAL_BYTES) {
          fail('CATALOG_TOTAL_LIMIT_EXCEEDED', 'El inventario excede el máximo total de bytes permitido.');
        }
      }
    }
    return result;
  });
  normalized.sort((left, right) => Buffer.compare(
    Buffer.from(canonicalJson(left), 'utf8'),
    Buffer.from(canonicalJson(right), 'utf8'),
  ));
  return normalized;
}

function quoteIdentifier(identifier) {
  if (!IDENTIFIER.test(identifier)) fail('PRISMA_SCHEMA_INVALID', 'El schema Prisma de la conexión no es seguro.');
  return `"${identifier.replaceAll('"', '""')}"`;
}

function queryFor(queryId, prismaSchema = 'public') {
  if (!IDENTIFIER.test(prismaSchema)) fail('PRISMA_SCHEMA_INVALID', 'Unsafe Prisma schema.');
  if (queryId === QUERY_IDS.MIGRATION_HISTORY) {
    const schema = quoteIdentifier(prismaSchema);
    return Object.freeze({
      id: queryId,
      text: [
        'SELECT',
        '  source.id::text AS migration_id,',
        '  source.checksum::text AS checksum,',
        '  source.migration_name::text AS migration_name,',
        '  source.started_at AS started_at,',
        '  source.finished_at AS finished_at,',
        '  source.rolled_back_at AS rolled_back_at,',
        '  source.applied_steps_count::text AS applied_steps_count',
        `FROM ${schema}."_prisma_migrations" AS source`,
        'ORDER BY source.started_at, source.migration_name, source.id',
        `LIMIT ${MAX_MIGRATION_ROWS + 1}`,
      ].join('\n'),
      values: Object.freeze([]),
    });
  }
  const fixed = FIXED_QUERIES[queryId];
  if (!fixed) fail('QUERY_NOT_ALLOWLISTED', 'La consulta solicitada no está permitida por WP0-L.');
  const schemaScoped = queryId === QUERY_IDS.MIGRATION_LOCATOR || queryId === QUERY_IDS.OBSERVER_SECURITY;
  const values = schemaScoped ? Object.freeze([prismaSchema]) : fixed.values;
  return Object.freeze({ id: queryId, text: fixed.text, values });
}

async function executeAllowlistedQuery(adapter, queryId, { prismaSchema = 'public' } = {}) {
  if (!adapter || typeof adapter.query !== 'function') fail('QUERY_ADAPTER_INVALID', 'El adaptador de consulta no está disponible.');
  const query = queryFor(queryId, prismaSchema);
  const result = await adapter.query(query);
  if (!result || !Array.isArray(result.rows)) fail('QUERY_RESULT_INVALID', `Resultado inválido para ${queryId}.`);
  return result.rows;
}

function parseReference(value, prefix, code) {
  if (typeof value !== 'string' || value !== value.trim()) fail(code, `Se requiere una referencia ${prefix} no secreta.`);
  const marker = `${prefix}:`;
  if (!value.startsWith(marker) || !REFERENCE_BODY.test(value.slice(marker.length)) || UNSAFE_OUTPUT_VALUE.test(value)) {
    fail(code, `La referencia debe usar el formato ${prefix}:<id-opaco>.`);
  }
  return value;
}

function normalizeReviewers(values) {
  if (!Array.isArray(values) || values.length !== 2) {
    fail('REVIEWERS_INVALID', 'WP0-L exige exactamente dos revisores independientes.');
  }
  const reviewers = values.map(value => parseReference(value, 'reviewer', 'REVIEWERS_INVALID'));
  if (new Set(reviewers.map(value => value.toLowerCase())).size !== 2) {
    fail('REVIEWERS_INVALID', 'Los dos revisores deben ser independientes.');
  }
  return Object.freeze(reviewers);
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function validateWp0DatabaseMarker(marker, targetId) {
  const expected = `municontrol.wp0.v1|target_class=${WP0_CONFIRMATION}|target_id=${targetId}`;
  if (marker === expected) return;

  const parsed = typeof marker === 'string' ? WP0_DATABASE_MARKER.exec(marker) : null;
  if (!parsed || parsed[0] !== marker) {
    fail('TARGET_DATABASE_MARKER_INVALID', 'La DB no contiene el comentario WP0-L canónico exacto.');
  }
  if (parsed[1] !== WP0_CONFIRMATION) {
    fail('TARGET_NOT_RESTORED_DISPOSABLE', 'La DB no declara el marcador de copia restaurada descartable.');
  }
  if (parsed[2] !== targetId) {
    fail('TARGET_ID_MISMATCH', 'La identidad persistente de la DB no coincide con el target solicitado.');
  }
  fail('TARGET_DATABASE_MARKER_INVALID', 'La DB no contiene el comentario WP0-L canónico exacto.');
}

function sameFileIdentity(stat, identity) {
  return Boolean(stat && identity && stat.dev === identity.dev && stat.ino === identity.ino);
}

async function assertNoSymlinkAncestors(targetDirectory) {
  let cursor = path.resolve(targetDirectory);
  while (true) {
    const stat = await fsp.lstat(cursor);
    if (stat.isSymbolicLink()) fail('OUTPUT_SYMLINK_FORBIDDEN', 'El output no puede atravesar symlinks o junctions.');
    if (!stat.isDirectory()) fail('OUTPUT_PARENT_INVALID', 'El directorio de output no es válido.');
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

async function validateOutputPath(outputPath, repoRoot) {
  if (typeof outputPath !== 'string' || !path.isAbsolute(outputPath)) {
    fail('OUTPUT_ABSOLUTE_REQUIRED', 'El output debe ser una ruta absoluta fuera del repositorio.');
  }
  if (path.extname(outputPath).toLowerCase() !== '.json') {
    fail('OUTPUT_EXTENSION_INVALID', 'La observación WP0-L debe escribirse como JSON.');
  }
  const resolvedOutput = path.resolve(outputPath);
  const parent = path.dirname(resolvedOutput);
  await assertNoSymlinkAncestors(parent);
  const parentReal = await fsp.realpath(parent);
  const parentStat = await fsp.stat(parentReal);
  if (!parentStat.isDirectory()) fail('OUTPUT_PARENT_INVALID', 'El directorio de output no es válido.');
  const parentIdentity = Object.freeze({ dev: parentStat.dev, ino: parentStat.ino });
  const repoReal = await fsp.realpath(repoRoot);
  const canonicalOutput = path.join(parentReal, path.basename(resolvedOutput));
  const comparableRepo = process.platform === 'win32' ? repoReal.toLowerCase() : repoReal;
  const comparableOutput = process.platform === 'win32' ? canonicalOutput.toLowerCase() : canonicalOutput;
  if (isInside(comparableRepo, comparableOutput)) {
    fail('OUTPUT_INSIDE_REPOSITORY', 'La observación debe residir fuera del checkout.');
  }
  try {
    const stat = await fsp.lstat(resolvedOutput);
    if (stat.isSymbolicLink()) fail('OUTPUT_SYMLINK_FORBIDDEN', 'El output no puede ser un symlink.');
    fail('OUTPUT_ALREADY_EXISTS', 'WP0-L nunca sobrescribe una observación existente.');
  } catch (error) {
    if (error instanceof Wp0ObservationError) throw error;
    if (error?.code !== 'ENOENT') throw error;
  }
  return Object.freeze({ outputPath: canonicalOutput, parentReal, parentIdentity, repoReal });
}

async function validateObservationConfig(input) {
  if (!input || typeof input !== 'object') fail('CONFIG_INVALID', 'Falta la configuración WP0-L.');
  if (input.confirmation !== WP0_CONFIRMATION) {
    fail('RESTORED_COPY_CONFIRMATION_REQUIRED', `La confirmación exacta requerida es ${WP0_CONFIRMATION}.`);
  }
  const targetId = parseReference(input.targetId, 'target', 'TARGET_ID_INVALID');
  const backupRef = parseReference(input.backupRef, 'backup', 'BACKUP_REF_INVALID');
  const restoreRef = parseReference(input.restoreRef, 'restore', 'RESTORE_REF_INVALID');
  if (backupRef.slice('backup:'.length).toLowerCase() === restoreRef.slice('restore:'.length).toLowerCase()) {
    fail('RESTORE_EVIDENCE_INVALID', 'Backup y restore deben tener referencias externas diferentes.');
  }
  const reviewerIds = normalizeReviewers(input.reviewerIds);
  const database = inspectDatabaseUrl(input.databaseUrl, { nodeEnv: input.nodeEnv });
  const parsed = new URL(database.connectionString);
  if (!parsed.password) {
    fail('DATABASE_CREDENTIAL_REQUIRED', 'WP0-L exige una credencial explicita dentro de WP0_DATABASE_URL y no consulta pgpass ni PGPASSWORD.');
  }
  for (const [name] of parsed.searchParams) {
    if (!WP0_ALLOWED_URL_PARAMS.has(name.toLowerCase())) {
      fail('DATABASE_PARAMETER_FORBIDDEN', 'WP0-L admite solo sslmode y schema en la URL PostgreSQL.');
    }
  }
  if (parsed.searchParams.getAll('schema').length > 1) {
    fail('PRISMA_SCHEMA_INVALID', 'El schema Prisma debe declararse una sola vez.');
  }
  const prismaSchema = parsed.searchParams.get('schema') || 'public';
  if (!IDENTIFIER.test(prismaSchema)) fail('PRISMA_SCHEMA_INVALID', 'El schema Prisma de la conexión no es seguro.');
  const output = await validateOutputPath(input.outputPath, input.repoRoot);
  return Object.freeze({
    confirmation: WP0_CONFIRMATION,
    targetId,
    backupRef,
    restoreRef,
    reviewerIds,
    databaseUrl: database.connectionString,
    databaseHost: database.host,
    tlsVerified: database.tlsVerified,
    developmentLoopback: database.developmentLoopback,
    prismaSchema,
    outputPath: output.outputPath,
    repoRoot: output.repoReal,
  });
}

function requireSingleRow(queryId, rows) {
  const normalized = normalizeRows(queryId, rows);
  if (normalized.length !== 1) fail('QUERY_CARDINALITY_INVALID', `${queryId} debe devolver exactamente una fila.`);
  return normalized[0];
}

function timestampMillis(value) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseNonNegativeInteger(value) {
  if (!/^\d+$/u.test(String(value))) return null;
  try {
    return BigInt(String(value));
  } catch {
    return null;
  }
}

function analyzeMigrationHistory(locator, rows) {
  const namedObjectCount = parseNonNegativeInteger(locator.named_object_count);
  const relationCount = parseNonNegativeInteger(locator.relation_count);
  const columnCount = parseNonNegativeInteger(locator.column_count);
  const primaryKeyCount = parseNonNegativeInteger(locator.primary_key_count);
  if (namedObjectCount === null || relationCount === null || columnCount === null
    || primaryKeyCount === null
    || relationCount > namedObjectCount
    || typeof locator.relation_kinds !== 'string'
    || (!/^[A-Za-z](?:,[A-Za-z])*$/u.test(locator.relation_kinds) && locator.relation_kinds !== '')
    || typeof locator.relation_persistence !== 'string'
    || (!/^[put](?:,[put])*$/u.test(locator.relation_persistence) && locator.relation_persistence !== '')
    || typeof locator.column_names !== 'string'
    || (!/^[A-Za-z_][A-Za-z0-9_$]*(?:,[A-Za-z_][A-Za-z0-9_$]*)*$/u.test(locator.column_names)
      && locator.column_names !== '')
    || typeof locator.column_signature !== 'string'
    || Buffer.byteLength(locator.column_signature, 'utf8') > 16 * 1024
    || typeof locator.primary_key_columns !== 'string'
    || (!/^[A-Za-z_][A-Za-z0-9_$]*(?:,[A-Za-z_][A-Za-z0-9_$]*)*$/u.test(locator.primary_key_columns)
      && locator.primary_key_columns !== '')) {
    fail('MIGRATION_LOCATOR_INVALID', 'El catálogo devolvió un locator Prisma inválido.');
  }
  const relationKinds = locator.relation_kinds === '' ? [] : locator.relation_kinds.split(',');
  const relationPersistence = locator.relation_persistence === '' ? [] : locator.relation_persistence.split(',');
  const columnNames = locator.column_names === '' ? [] : locator.column_names.split(',');
  const primaryKeyColumns = locator.primary_key_columns === '' ? [] : locator.primary_key_columns.split(',');
  if (namedObjectCount > 1000n || columnCount > 1000n || primaryKeyCount > 1000n
    || BigInt(relationKinds.length) !== namedObjectCount
    || BigInt(relationPersistence.length) !== namedObjectCount
    || BigInt(columnNames.length) !== columnCount) {
    fail('MIGRATION_LOCATOR_INVALID', 'El catálogo devolvió una forma Prisma contradictoria.');
  }
  const locatorMetadata = {
    namedObjectCount: namedObjectCount.toString(10),
    relationCount: relationCount.toString(10),
    relationKinds: Object.freeze(relationKinds),
    relationPersistence: Object.freeze(relationPersistence),
    columnCount: columnCount.toString(10),
    columnNames: Object.freeze(columnNames),
    columnSignatureSha256: sha256(locator.column_signature),
    primaryKeyCount: primaryKeyCount.toString(10),
    primaryKeyColumns: Object.freeze(primaryKeyColumns),
    rowLevelSecurity: locator.row_level_security === 'true',
    forceRowLevelSecurity: locator.force_row_level_security === 'true',
  };
  if (!['true', 'false'].includes(locator.row_level_security)
    || !['true', 'false'].includes(locator.force_row_level_security)) {
    fail('MIGRATION_LOCATOR_INVALID', 'El catálogo devolvió flags RLS inválidos.');
  }
  if (locatorMetadata.rowLevelSecurity || locatorMetadata.forceRowLevelSecurity) {
    fail('MIGRATION_HISTORY_RLS_FORBIDDEN', 'La historia Prisma no puede observarse a través de RLS.');
  }

  if (namedObjectCount === 0n) {
    return Object.freeze({
      state: 'absent',
      issues: Object.freeze(['MIGRATION_HISTORY_ABSENT']),
      ...locatorMetadata,
      ...section([]),
    });
  }
  if (namedObjectCount !== 1n || relationCount !== 1n || relationKinds[0] !== 'r'
    || relationPersistence[0] !== 'p'
    || canonicalJson(columnNames) !== canonicalJson(PRISMA_MIGRATION_COLUMNS)
    || locator.column_signature !== PRISMA_MIGRATION_COLUMN_SIGNATURE
    || primaryKeyCount !== 1n || canonicalJson(primaryKeyColumns) !== canonicalJson(['id'])) {
    return Object.freeze({
      state: 'inconsistent',
      issues: Object.freeze(['MIGRATION_RELATION_SHAPE_INCONSISTENT']),
      ...locatorMetadata,
      ...section([]),
    });
  }

  const history = normalizeRows(QUERY_IDS.MIGRATION_HISTORY, rows);
  if (history.length === 0) {
    return Object.freeze({
      state: 'empty',
      issues: Object.freeze(['MIGRATION_HISTORY_EMPTY']),
      ...locatorMetadata,
      ...section(history),
    });
  }

  const issues = collectMigrationRowIssues(history);
  const state = issues.length === 0 ? 'valid' : 'inconsistent';
  return Object.freeze({
    state,
    issues: Object.freeze(issues),
    ...locatorMetadata,
    ...section(history),
  });
}

function collectMigrationRowIssues(history) {
  const issues = new Set();
  const names = new Set();
  const ids = new Set();
  for (const row of history) {
    const steps = parseNonNegativeInteger(row.applied_steps_count);
    const started = timestampMillis(row.started_at);
    const finished = timestampMillis(row.finished_at);
    const startedCanonical = started !== null && new Date(started).toISOString() === row.started_at;
    const finishedCanonical = finished !== null && new Date(finished).toISOString() === row.finished_at;
    if (typeof row.migration_id !== 'string' || !UUID.test(row.migration_id)
      || typeof row.checksum !== 'string' || !SHA256_HEX.test(row.checksum)
      || typeof row.migration_name !== 'string' || !MIGRATION_NAME.test(row.migration_name)
      || !startedCanonical || !finishedCanonical || row.rolled_back_at !== null
      || steps === null || steps < 1n) {
      issues.add('MIGRATION_ROW_INCOMPLETE_OR_INVALID');
    }
    if (typeof row.migration_id === 'string') {
      if (ids.has(row.migration_id)) issues.add('MIGRATION_ID_DUPLICATED');
      ids.add(row.migration_id);
    }
    if (typeof row.migration_name === 'string') {
      if (names.has(row.migration_name)) issues.add('MIGRATION_NAME_DUPLICATED');
      names.add(row.migration_name);
    }
    if (started === null || finished === null || finished < started) {
      issues.add('MIGRATION_TIMESTAMPS_INCONSISTENT');
    }
  }
  return [...issues].sort();
}

function section(rows) {
  const canonical = canonicalJson(rows);
  return Object.freeze({ count: rows.length, sha256: sha256(canonical), rows: Object.freeze(rows) });
}

function validateCatalogRows(rows) {
  const sentinels = rows.filter(row => row.object_kind === CATALOG_LIMIT_SENTINEL_KIND);
  if (sentinels.length > 0) {
    const sentinel = sentinels[0];
    if (rows.length !== 1 || sentinels.length !== 1
      || sentinel.schema_name !== 'wp0' || sentinel.parent_name !== null
      || sentinel.definition !== 'server_side_budget_rejected'
      || !CATALOG_LIMIT_CODES.has(sentinel.object_name)) {
      fail('CATALOG_INVENTORY_INVALID', 'PostgreSQL devolvió un sentinel de catálogo inválido.');
    }
    fail(sentinel.object_name, 'PostgreSQL rechazó el catálogo por exceder el budget WP0-L.');
  }
  const projected = [];
  for (const row of rows) {
    if (!CATALOG_OBJECT_KINDS.has(row.object_kind)
      || typeof row.schema_name !== 'string' || row.schema_name.length === 0
      || typeof row.object_name !== 'string' || row.object_name.length === 0
      || (row.parent_name !== null && (typeof row.parent_name !== 'string' || row.parent_name.length === 0))
      || typeof row.definition !== 'string' || row.definition.length === 0) {
      fail('CATALOG_INVENTORY_INVALID', 'El inventario de catálogos contiene una fila inválida.');
    }
    projected.push({
      objectKind: row.object_kind,
      schemaName: row.schema_name,
      objectName: row.object_name,
      parentName: row.parent_name,
      definitionSha256: sha256(row.definition),
    });
  }
  projected.sort((left, right) => Buffer.compare(
    Buffer.from(canonicalJson(left), 'utf8'),
    Buffer.from(canonicalJson(right), 'utf8'),
  ));
  return Object.freeze(projected);
}

function assertRecordKeys(record, keys) {
  if (!exactKeys(record, [...keys].sort())) {
    fail('OBSERVATION_SCHEMA_INVALID', 'El artefacto WP0-L no cumple el schema v2 exacto.');
  }
}

function assertBoolean(value) {
  if (typeof value !== 'boolean') fail('OBSERVATION_SCHEMA_INVALID', 'Se esperaba un booleano exacto.');
}

function assertString(value, pattern) {
  if (typeof value !== 'string' || (pattern && !pattern.test(value))) {
    fail('OBSERVATION_SCHEMA_INVALID', 'Se esperaba un string canónico.');
  }
}

function assertIsoTimestamp(value) {
  assertString(value);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    fail('OBSERVATION_SCHEMA_INVALID', 'Se esperaba un timestamp ISO canónico.');
  }
  return parsed;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function preflightObservationCatalog(observation) {
  const inventory = Object.getOwnPropertyDescriptor(observation || {}, 'inventory')?.value;
  const catalog = Object.getOwnPropertyDescriptor(inventory || {}, 'catalog')?.value;
  const rows = Object.getOwnPropertyDescriptor(catalog || {}, 'rows')?.value;
  if (!Array.isArray(rows)) return;
  if (rows.length > MAX_CATALOG_ROWS) {
    fail('CATALOG_ROW_LIMIT_EXCEEDED', 'El artefacto excede el máximo de filas de catálogo.');
  }
  let totalBytes = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    for (const field of ['objectKind', 'schemaName', 'objectName', 'parentName', 'definitionSha256']) {
      const value = Object.getOwnPropertyDescriptor(row, field)?.value;
      if (typeof value !== 'string') continue;
      const bytes = Buffer.byteLength(value, 'utf8');
      if (bytes > MAX_CATALOG_NAME_BYTES) {
        fail('CATALOG_FIELD_LIMIT_EXCEEDED', 'El artefacto contiene un campo de catálogo sobredimensionado.');
      }
      totalBytes += bytes;
      if (totalBytes > MAX_CATALOG_TOTAL_BYTES) {
        fail('CATALOG_TOTAL_LIMIT_EXCEEDED', 'El artefacto excede el máximo total de catálogo.');
      }
    }
  }
}

function preflightObservationMigrations(observation) {
  const inventory = Object.getOwnPropertyDescriptor(observation || {}, 'inventory')?.value;
  const migrations = Object.getOwnPropertyDescriptor(inventory || {}, 'prismaMigrations')?.value;
  const rows = Object.getOwnPropertyDescriptor(migrations || {}, 'rows')?.value;
  if (!Array.isArray(rows)) return;
  if (rows.length > MAX_MIGRATION_ROWS) {
    fail('MIGRATION_ROW_LIMIT_EXCEEDED', 'El artefacto excede el máximo de filas Prisma.');
  }
  let totalBytes = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    for (const field of ROW_FIELDS[QUERY_IDS.MIGRATION_HISTORY]) {
      const value = Object.getOwnPropertyDescriptor(row, field)?.value;
      if (value === null || value === undefined) continue;
      const bytes = Buffer.byteLength(String(value), 'utf8');
      if (bytes > MAX_MIGRATION_FIELD_BYTES) {
        fail('MIGRATION_FIELD_LIMIT_EXCEEDED', 'El artefacto contiene un campo Prisma sobredimensionado.');
      }
      totalBytes += bytes;
      if (totalBytes > MAX_MIGRATION_TOTAL_BYTES) {
        fail('MIGRATION_TOTAL_LIMIT_EXCEEDED', 'El artefacto excede el máximo total de historia Prisma.');
      }
    }
  }
}

function assertObservationBudget(value) {
  const state = { bytes: 0 };
  const ancestors = new WeakSet();
  const visit = (current, depth) => {
    if (depth > 64) fail('OBSERVATION_SIZE_LIMIT_EXCEEDED', 'El artefacto excede la profundidad permitida.');
    if (current === null || current === undefined) {
      state.bytes += 4;
    } else if (typeof current === 'string') {
      state.bytes += Buffer.byteLength(current, 'utf8') + 2;
    } else if (typeof current === 'number' || typeof current === 'bigint' || typeof current === 'boolean') {
      state.bytes += Buffer.byteLength(String(current), 'utf8') + 1;
    } else if (typeof current === 'object') {
      if (ancestors.has(current)) return;
      ancestors.add(current);
      state.bytes += 16;
      let descriptors;
      try {
        descriptors = Object.getOwnPropertyDescriptors(current);
      } catch {
        fail('OBSERVATION_VALUE_INVALID', 'No se pudo inspeccionar el artefacto de forma segura.');
      }
      for (const [key, descriptor] of Object.entries(descriptors)) {
        state.bytes += Buffer.byteLength(key, 'utf8') + 4;
        if (Object.hasOwn(descriptor, 'value')) visit(descriptor.value, depth + 1);
        if (state.bytes > MAX_OBSERVATION_BYTES) {
          fail('OBSERVATION_SIZE_LIMIT_EXCEEDED', 'El artefacto excede el máximo total de bytes permitido.');
        }
      }
      ancestors.delete(current);
    } else {
      state.bytes += 16;
    }
    if (state.bytes > MAX_OBSERVATION_BYTES) {
      fail('OBSERVATION_SIZE_LIMIT_EXCEEDED', 'El artefacto excede el máximo total de bytes permitido.');
    }
  };
  visit(value, 0);
}

function migrationDigestDescriptor(migrations) {
  return {
    state: migrations.state,
    issues: migrations.issues,
    namedObjectCount: migrations.namedObjectCount,
    relationCount: migrations.relationCount,
    relationKinds: migrations.relationKinds,
    relationPersistence: migrations.relationPersistence,
    columnCount: migrations.columnCount,
    columnNames: migrations.columnNames,
    columnSignatureSha256: migrations.columnSignatureSha256,
    primaryKeyCount: migrations.primaryKeyCount,
    primaryKeyColumns: migrations.primaryKeyColumns,
    rowLevelSecurity: migrations.rowLevelSecurity,
    forceRowLevelSecurity: migrations.forceRowLevelSecurity,
    count: migrations.count,
    sha256: migrations.sha256,
  };
}

function inventoryDigest(catalog, migrations) {
  return sha256(canonicalJson({
    catalog: { count: catalog.count, sha256: catalog.sha256 },
    prismaMigrations: migrationDigestDescriptor(migrations),
  }));
}

function validateCatalogSection(catalog) {
  assertRecordKeys(catalog, ['count', 'sha256', 'rows']);
  if (!Number.isSafeInteger(catalog.count) || catalog.count < 1 || catalog.count > MAX_CATALOG_ROWS
    || !Array.isArray(catalog.rows) || catalog.rows.length !== catalog.count) {
    fail('OBSERVATION_SCHEMA_INVALID', 'La sección de catálogo es inválida.');
  }
  assertString(catalog.sha256, SHA256_HEX);
  let totalBytes = 0;
  for (const row of catalog.rows) {
    assertRecordKeys(row, ['objectKind', 'schemaName', 'objectName', 'parentName', 'definitionSha256']);
    if (!CATALOG_OBJECT_KINDS.has(row.objectKind)) fail('OBSERVATION_SCHEMA_INVALID', 'Object kind desconocido.');
    assertString(row.schemaName);
    assertString(row.objectName);
    if (row.schemaName.length === 0 || row.objectName.length === 0) {
      fail('OBSERVATION_SCHEMA_INVALID', 'El catálogo contiene nombres vacíos.');
    }
    if (row.parentName !== null) {
      assertString(row.parentName);
      if (row.parentName.length === 0) fail('OBSERVATION_SCHEMA_INVALID', 'Parent name vacío.');
    }
    assertString(row.definitionSha256, SHA256_HEX);
    if (Object.hasOwn(row, 'definition')) fail('OBSERVATION_SCHEMA_INVALID', 'El artefacto no puede persistir definitions raw.');
    for (const field of ['objectKind', 'schemaName', 'objectName', 'parentName', 'definitionSha256']) {
      if (row[field] === null) continue;
      const bytes = Buffer.byteLength(row[field], 'utf8');
      if (bytes > MAX_CATALOG_NAME_BYTES) {
        fail('CATALOG_FIELD_LIMIT_EXCEEDED', 'El snapshot contiene un campo de catálogo sobredimensionado.');
      }
      totalBytes += bytes;
      if (totalBytes > MAX_CATALOG_TOTAL_BYTES) {
        fail('CATALOG_TOTAL_LIMIT_EXCEEDED', 'El snapshot excede el máximo total de catálogo.');
      }
    }
  }
  const sortedRows = [...catalog.rows].sort((left, right) => Buffer.compare(
    Buffer.from(canonicalJson(left), 'utf8'),
    Buffer.from(canonicalJson(right), 'utf8'),
  ));
  if (canonicalJson(catalog.rows) !== canonicalJson(sortedRows)) {
    fail('OBSERVATION_SCHEMA_INVALID', 'Las filas de catálogo no están en orden canónico.');
  }
  if (catalog.sha256 !== sha256(canonicalJson(catalog.rows))) {
    fail('OBSERVATION_DIGEST_INVALID', 'El digest de catálogo no coincide.');
  }
}

function validateMigrationSection(migrations) {
  assertRecordKeys(migrations, [
    'state', 'issues', 'namedObjectCount', 'relationCount', 'relationKinds',
    'relationPersistence', 'columnCount', 'columnNames', 'columnSignatureSha256',
    'primaryKeyCount', 'primaryKeyColumns', 'rowLevelSecurity', 'forceRowLevelSecurity',
    'count', 'sha256', 'rows',
  ]);
  if (!['valid', 'absent', 'empty', 'inconsistent'].includes(migrations.state)
    || !Array.isArray(migrations.issues) || !Array.isArray(migrations.rows)
    || !Number.isSafeInteger(migrations.count) || migrations.count < 0
    || migrations.count > MAX_MIGRATION_ROWS
    || migrations.rows.length !== migrations.count) {
    fail('OBSERVATION_SCHEMA_INVALID', 'La sección de historia Prisma es inválida.');
  }
  const structuralCounts = {};
  for (const field of ['namedObjectCount', 'relationCount', 'columnCount', 'primaryKeyCount']) {
    if (!/^(?:0|[1-9]\d*)$/u.test(String(migrations[field]))) {
      fail('OBSERVATION_SCHEMA_INVALID', 'Conteo Prisma inválido.');
    }
    structuralCounts[field] = BigInt(migrations[field]);
  }
  for (const field of ['relationKinds', 'relationPersistence', 'columnNames', 'primaryKeyColumns']) {
    if (!Array.isArray(migrations[field]) || migrations[field].some(value => typeof value !== 'string')) {
      fail('OBSERVATION_SCHEMA_INVALID', 'Inventario estructural Prisma inválido.');
    }
  }
  if (structuralCounts.namedObjectCount > 1000n
    || structuralCounts.relationCount > structuralCounts.namedObjectCount
    || structuralCounts.columnCount > 1000n || structuralCounts.primaryKeyCount > 1000n
    || BigInt(migrations.relationKinds.length) !== structuralCounts.namedObjectCount
    || BigInt(migrations.relationPersistence.length) !== structuralCounts.namedObjectCount
    || BigInt(migrations.columnNames.length) !== structuralCounts.columnCount
    || migrations.relationKinds.some(value => !/^[A-Za-z]$/u.test(value))
    || migrations.relationPersistence.some(value => !/^[put]$/u.test(value))
    || [...migrations.columnNames, ...migrations.primaryKeyColumns]
      .some(value => !IDENTIFIER.test(value))) {
    fail('OBSERVATION_SCHEMA_INVALID', 'Inventario estructural Prisma contradictorio.');
  }
  assertString(migrations.columnSignatureSha256, SHA256_HEX);
  assertString(migrations.sha256, SHA256_HEX);
  assertBoolean(migrations.rowLevelSecurity);
  assertBoolean(migrations.forceRowLevelSecurity);
  if (migrations.rowLevelSecurity || migrations.forceRowLevelSecurity) {
    fail('OBSERVATION_SCHEMA_INVALID', 'Una observación persistida no puede aceptar RLS en la historia.');
  }
  for (const issue of migrations.issues) assertString(issue, /^[A-Z][A-Z0-9_]+$/u);
  if (canonicalJson(migrations.issues) !== canonicalJson([...new Set(migrations.issues)].sort())) {
    fail('OBSERVATION_SCHEMA_INVALID', 'Los issues Prisma no están ordenados o contienen duplicados.');
  }
  let migrationTotalBytes = 0;
  for (const row of migrations.rows) {
    if (!exactKeys(row, [...ROW_FIELDS[QUERY_IDS.MIGRATION_HISTORY]].sort())) {
      fail('OBSERVATION_SCHEMA_INVALID', 'Fila Prisma con shape inválido.');
    }
    for (const value of Object.values(row)) {
      if (value !== null && typeof value !== 'string') fail('OBSERVATION_SCHEMA_INVALID', 'Fila Prisma no escalar.');
      if (value !== null) {
        const bytes = Buffer.byteLength(value, 'utf8');
        if (bytes > MAX_MIGRATION_FIELD_BYTES) {
          fail('MIGRATION_FIELD_LIMIT_EXCEEDED', 'El snapshot contiene un campo Prisma sobredimensionado.');
        }
        migrationTotalBytes += bytes;
        if (migrationTotalBytes > MAX_MIGRATION_TOTAL_BYTES) {
          fail('MIGRATION_TOTAL_LIMIT_EXCEEDED', 'El snapshot excede el máximo total de historia Prisma.');
        }
      }
    }
  }
  if (migrations.sha256 !== sha256(canonicalJson(migrations.rows))) {
    fail('OBSERVATION_DIGEST_INVALID', 'El digest de historia Prisma no coincide.');
  }
  const sortedRows = [...migrations.rows].sort((left, right) => Buffer.compare(
    Buffer.from(canonicalJson(left), 'utf8'),
    Buffer.from(canonicalJson(right), 'utf8'),
  ));
  if (canonicalJson(migrations.rows) !== canonicalJson(sortedRows)) {
    fail('OBSERVATION_SCHEMA_INVALID', 'Las filas Prisma no están en orden canónico.');
  }
  const structurallyCanonical = migrations.namedObjectCount === '1'
    && migrations.relationCount === '1'
    && canonicalJson(migrations.relationKinds) === canonicalJson(['r'])
    && canonicalJson(migrations.relationPersistence) === canonicalJson(['p'])
    && migrations.columnCount === String(PRISMA_MIGRATION_COLUMNS.length)
    && canonicalJson(migrations.columnNames) === canonicalJson(PRISMA_MIGRATION_COLUMNS)
    && migrations.columnSignatureSha256 === sha256(PRISMA_MIGRATION_COLUMN_SIGNATURE)
    && migrations.primaryKeyCount === '1'
    && canonicalJson(migrations.primaryKeyColumns) === canonicalJson(['id']);
  const structurallyAbsent = migrations.namedObjectCount === '0'
    && migrations.relationCount === '0'
    && migrations.relationKinds.length === 0
    && migrations.relationPersistence.length === 0
    && migrations.columnCount === '0'
    && migrations.columnNames.length === 0
    && migrations.columnSignatureSha256 === sha256('')
    && migrations.primaryKeyCount === '0'
    && migrations.primaryKeyColumns.length === 0;
  const rowIssues = collectMigrationRowIssues(migrations.rows);
  let expectedState;
  let expectedIssues;
  if (structurallyAbsent && migrations.count === 0) {
    expectedState = 'absent';
    expectedIssues = ['MIGRATION_HISTORY_ABSENT'];
  } else if (structurallyCanonical && migrations.count === 0) {
    expectedState = 'empty';
    expectedIssues = ['MIGRATION_HISTORY_EMPTY'];
  } else if (structurallyCanonical && rowIssues.length === 0) {
    expectedState = 'valid';
    expectedIssues = [];
  } else if (structurallyCanonical) {
    expectedState = 'inconsistent';
    expectedIssues = rowIssues;
  } else {
    expectedState = 'inconsistent';
    expectedIssues = ['MIGRATION_RELATION_SHAPE_INCONSISTENT'];
    if (migrations.count !== 0) {
      fail('OBSERVATION_SCHEMA_INVALID', 'Una relación Prisma no consultable no puede contener filas.');
    }
  }
  if (migrations.state !== expectedState
    || canonicalJson(migrations.issues) !== canonicalJson(expectedIssues)) {
    fail('OBSERVATION_SCHEMA_INVALID', 'El estado Prisma no coincide con su estructura y filas.');
  }
}

function validateObservationShape(observation) {
  assertRecordKeys(observation, [
    'contractVersion', 'artifactType', 'semantics', 'observedAt', 'commit', 'source',
    'quality', 'target', 'evidence', 'transaction', 'observer', 'inventory',
    'limitations', 'observationId',
  ]);
  if (observation.contractVersion !== OBSERVATION_CONTRACT_VERSION
    || observation.artifactType !== OBSERVATION_ARTIFACT_TYPE
    || observation.semantics !== 'OBSERVATION_ONLY_NOT_AUTHORIZATION') {
    fail('OBSERVATION_SEMANTICS_INVALID', 'La semántica WP0-L v2 es inmutable.');
  }
  assertIsoTimestamp(observation.observedAt);
  assertString(observation.commit, COMMIT_SHA);

  assertRecordKeys(observation.source, ['schemaPath', 'schemaSha256', 'sourceKind']);
  if (observation.source.schemaPath !== 'prisma/schema.prisma'
    || observation.source.sourceKind !== 'IMMUTABLE_GIT_BLOB') {
    fail('OBSERVATION_SCHEMA_INVALID', 'La fuente del schema no está fijada por Git.');
  }
  assertString(observation.source.schemaSha256, SHA256_HEX);

  assertRecordKeys(observation.quality, ['collectionMode', 'approvalEligible', 'blockingReasons']);
  if (observation.quality.approvalEligible !== false || !Array.isArray(observation.quality.blockingReasons)) {
    fail('OBSERVATION_SEMANTICS_INVALID', 'Una observación nunca puede autoaprobarse.');
  }

  assertRecordKeys(observation.target, [
    'targetId', 'targetClass', 'databaseNameSha256', 'postgresVersionNum', 'prismaSchema', 'transport',
  ]);
  parseReference(observation.target.targetId, 'target', 'OBSERVATION_SCHEMA_INVALID');
  if (observation.target.targetClass !== WP0_CONFIRMATION
    || !/^\d{6,8}$/u.test(observation.target.postgresVersionNum)
    || Number(observation.target.postgresVersionNum) < MIN_POSTGRES_VERSION_NUM
    || !IDENTIFIER.test(observation.target.prismaSchema)) {
    fail('OBSERVATION_SCHEMA_INVALID', 'Target PostgreSQL inválido.');
  }
  assertString(observation.target.databaseNameSha256, SHA256_HEX);
  assertRecordKeys(observation.target.transport, [
    'urlPolicy', 'negotiated', 'protocol', 'cipher', 'bits',
    'certificateChainAttested', 'directEndpointAttested',
  ]);
  if (!['verify-full', 'development_loopback'].includes(observation.target.transport.urlPolicy)
    || observation.target.transport.certificateChainAttested !== false
    || observation.target.transport.directEndpointAttested !== false) {
    fail('OBSERVATION_SEMANTICS_INVALID', 'La atestación de transporte no puede autoafirmarse.');
  }
  assertBoolean(observation.target.transport.negotiated);
  if (observation.target.transport.urlPolicy === 'verify-full' && !observation.target.transport.negotiated) {
    fail('OBSERVATION_SCHEMA_INVALID', 'verify-full exige TLS negociado.');
  }
  if (observation.target.transport.negotiated) {
    if (typeof observation.target.transport.protocol !== 'string'
      || !/^[A-Za-z0-9_.+-]{1,32}$/u.test(observation.target.transport.protocol)
      || typeof observation.target.transport.cipher !== 'string'
      || !/^[A-Za-z0-9_.:+-]{1,128}$/u.test(observation.target.transport.cipher)
      || !Number.isSafeInteger(observation.target.transport.bits)
      || observation.target.transport.bits < 40 || observation.target.transport.bits > 4096) {
      fail('OBSERVATION_SCHEMA_INVALID', 'La metadata TLS persistida es inválida.');
    }
  } else if (observation.target.transport.urlPolicy !== 'development_loopback'
    || observation.target.transport.protocol !== null
    || observation.target.transport.cipher !== null
    || observation.target.transport.bits !== null) {
    fail('OBSERVATION_SCHEMA_INVALID', 'La metadata sin TLS es contradictoria.');
  }

  assertRecordKeys(observation.evidence, [
    'backupRef', 'restoreRef', 'reviewerIds', 'externalReferencesVerified',
    'backupRestoreRelationVerified', 'reviewerIndependenceVerified', 'signedProviderReceiptVerified',
  ]);
  if (observation.evidence.externalReferencesVerified !== false
    || observation.evidence.backupRestoreRelationVerified !== false
    || observation.evidence.reviewerIndependenceVerified !== false
    || observation.evidence.signedProviderReceiptVerified !== false
    || !Array.isArray(observation.evidence.reviewerIds)
    || observation.evidence.reviewerIds.length !== 2) {
    fail('OBSERVATION_SEMANTICS_INVALID', 'La evidencia externa sigue sin verificar.');
  }
  parseReference(observation.evidence.backupRef, 'backup', 'OBSERVATION_SCHEMA_INVALID');
  parseReference(observation.evidence.restoreRef, 'restore', 'OBSERVATION_SCHEMA_INVALID');
  normalizeReviewers(observation.evidence.reviewerIds);
  if (observation.evidence.backupRef.slice('backup:'.length).toLowerCase()
    === observation.evidence.restoreRef.slice('restore:'.length).toLowerCase()) {
    fail('OBSERVATION_SCHEMA_INVALID', 'Backup y restore deben conservar referencias diferentes.');
  }

  assertRecordKeys(observation.transaction, ['isolation', 'readOnly', 'clock']);
  if (observation.transaction.isolation !== 'repeatable read' || observation.transaction.readOnly !== true) {
    fail('OBSERVATION_SCHEMA_INVALID', 'La transacción persistida no es read-only.');
  }
  assertRecordKeys(observation.transaction.clock, [
    'databaseClock', 'transactionStartedAt', 'localObserverClock', 'absoluteSkewMs', 'maxAllowedSkewMs',
  ]);
  const databaseClock = assertIsoTimestamp(observation.transaction.clock.databaseClock);
  const transactionStartedAt = assertIsoTimestamp(observation.transaction.clock.transactionStartedAt);
  const localClock = assertIsoTimestamp(observation.transaction.clock.localObserverClock);
  if (transactionStartedAt > databaseClock
    || !Number.isSafeInteger(observation.transaction.clock.absoluteSkewMs)
    || observation.transaction.clock.maxAllowedSkewMs !== MAX_CLOCK_SKEW_MS
    || observation.transaction.clock.absoluteSkewMs !== Math.abs(localClock - databaseClock)
    || observation.transaction.clock.absoluteSkewMs > MAX_CLOCK_SKEW_MS) {
    fail('OBSERVATION_SCHEMA_INVALID', 'La evidencia de reloj es contradictoria.');
  }

  assertRecordKeys(observation.observer, [
    'sessionMatchesCurrent', 'roleNameSha256', 'attributes', 'memberships', 'privileges', 'leastPrivilegeVerified',
  ]);
  if (observation.observer.sessionMatchesCurrent !== true || observation.observer.leastPrivilegeVerified !== true) {
    fail('OBSERVATION_SCHEMA_INVALID', 'La identidad del observador no está verificada.');
  }
  assertString(observation.observer.roleNameSha256, SHA256_HEX);
  assertRecordKeys(observation.observer.attributes, [
    'superuser', 'inherit', 'createRole', 'createDb', 'canLogin', 'replication', 'bypassRls',
  ]);
  for (const value of Object.values(observation.observer.attributes)) assertBoolean(value);
  if (observation.observer.attributes.superuser || observation.observer.attributes.createRole
    || observation.observer.attributes.createDb || !observation.observer.attributes.canLogin
    || observation.observer.attributes.replication || observation.observer.attributes.bypassRls) {
    fail('OBSERVATION_SCHEMA_INVALID', 'Atributos de rol inseguros.');
  }
  assertRecordKeys(observation.observer.memberships, ['count', 'unsafeCount']);
  if (observation.observer.memberships.count !== '0' || observation.observer.memberships.unsafeCount !== '0') {
    fail('OBSERVATION_SCHEMA_INVALID', 'El observador no puede pertenecer a otros roles.');
  }
  assertRecordKeys(observation.observer.privileges, [
    'databaseCreate', 'databaseConnect', 'databaseTemp', 'governedSchemaCreate',
    'governedSchemaUsage', 'governedRelationWrite', 'governedColumnWrite',
    'governedSequenceWrite', 'governedRoutineExecute', 'businessRelationSelect',
    'businessColumnSelect', 'migrationHistorySelect',
  ]);
  for (const value of Object.values(observation.observer.privileges)) assertBoolean(value);
  const privileges = observation.observer.privileges;
  if (privileges.databaseCreate || !privileges.databaseConnect || privileges.databaseTemp
    || privileges.governedSchemaCreate || privileges.governedRelationWrite
    || privileges.governedColumnWrite || privileges.governedSequenceWrite
    || privileges.governedRoutineExecute || privileges.businessRelationSelect
    || privileges.businessColumnSelect) {
    fail('OBSERVATION_SCHEMA_INVALID', 'Privilegios del observador inseguros.');
  }

  assertRecordKeys(observation.inventory, ['catalog', 'prismaMigrations', 'inventoryDigestSha256']);
  validateCatalogSection(observation.inventory.catalog);
  validateMigrationSection(observation.inventory.prismaMigrations);
  if (observation.inventory.inventoryDigestSha256
    !== inventoryDigest(observation.inventory.catalog, observation.inventory.prismaMigrations)) {
    fail('OBSERVATION_DIGEST_INVALID', 'El digest integral no coincide.');
  }
  const migrations = observation.inventory.prismaMigrations;
  const expectedMode = migrations.state === 'valid' ? 'strict' : 'discovery_non_approvable';
  const expectedBlockers = [...migrations.issues, ...BASE_OBSERVATION_BLOCKERS].sort();
  if (observation.quality.collectionMode !== expectedMode
    || canonicalJson(observation.quality.blockingReasons) !== canonicalJson(expectedBlockers)) {
    fail('OBSERVATION_SEMANTICS_INVALID', 'Quality no coincide con el estado observado.');
  }
  if (!Array.isArray(observation.limitations)
    || canonicalJson(observation.limitations) !== canonicalJson(OBSERVATION_LIMITATIONS)) {
    fail('OBSERVATION_SEMANTICS_INVALID', 'Las limitaciones WP0-L son inmutables.');
  }
  const { observationId, ...payload } = observation;
  if (observationId !== `wp0-observation-${sha256(canonicalJson(payload))}`) {
    fail('OBSERVATION_DIGEST_INVALID', 'observationId no coincide con el payload.');
  }
}

function assertObservationSafe(observation) {
  preflightObservationCatalog(observation);
  preflightObservationMigrations(observation);
  assertObservationBudget(observation);
  const snapshot = canonicalize(observation);
  assertObservationBudget(snapshot);
  validateObservationShape(snapshot);
  const serialized = JSON.stringify(snapshot);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_OBSERVATION_BYTES) {
    fail('OBSERVATION_SIZE_LIMIT_EXCEEDED', 'El JSON de observación excede el máximo permitido.');
  }
  if (UNSAFE_OUTPUT_VALUE.test(serialized)
    || serialized.includes('releaseReceipt') || serialized.includes('baselineManifest')
    || serialized.includes('releaseAuthorization')) {
    fail('OBSERVATION_SECRET_DETECTED', 'La observación contiene material no permitido.');
  }
  return deepFreeze(snapshot);
}

function booleanField(record, field, code) {
  if (record[field] !== 'true' && record[field] !== 'false') {
    fail(code, `PostgreSQL devolvió un booleano inválido para ${field}.`);
  }
  return record[field] === 'true';
}

function validateClock(clock, observed) {
  const databaseClockMs = timestampMillis(clock.database_clock);
  const transactionStartedAtMs = timestampMillis(clock.transaction_started_at);
  if (databaseClockMs === null || transactionStartedAtMs === null || transactionStartedAtMs > databaseClockMs) {
    fail('DATABASE_CLOCK_INVALID', 'PostgreSQL devolvió un reloj transaccional inválido.');
  }
  const absoluteSkewMs = Math.abs(observed.getTime() - databaseClockMs);
  if (absoluteSkewMs > MAX_CLOCK_SKEW_MS) {
    fail('DATABASE_CLOCK_SKEW_EXCEEDED', 'El reloj local y PostgreSQL exceden el skew máximo de WP0-L.');
  }
  return Object.freeze({
    databaseClock: new Date(databaseClockMs).toISOString(),
    transactionStartedAt: new Date(transactionStartedAtMs).toISOString(),
    localObserverClock: observed.toISOString(),
    absoluteSkewMs,
    maxAllowedSkewMs: MAX_CLOCK_SKEW_MS,
  });
}

function validateTransportSecurity(transport, config) {
  const negotiated = booleanField(transport, 'ssl', 'TRANSPORT_SECURITY_INVALID');
  if (!negotiated && !(config.developmentLoopback && !config.tlsVerified)) {
    fail('TLS_NOT_NEGOTIATED', 'PostgreSQL no confirmó TLS para el target remoto WP0-L.');
  }
  if (negotiated) {
    if (typeof transport.protocol !== 'string' || !/^[A-Za-z0-9_.+-]{1,32}$/u.test(transport.protocol)
      || typeof transport.cipher !== 'string' || !/^[A-Za-z0-9_.:+-]{1,128}$/u.test(transport.cipher)
      || !/^\d{2,4}$/u.test(String(transport.bits))
      || Number(transport.bits) < 40 || Number(transport.bits) > 4096) {
      fail('TRANSPORT_SECURITY_INVALID', 'PostgreSQL devolvió metadata TLS inválida.');
    }
  } else if (transport.protocol !== null || transport.cipher !== null || transport.bits !== null) {
    fail('TRANSPORT_SECURITY_INVALID', 'PostgreSQL devolvió metadata TLS contradictoria.');
  }
  return Object.freeze({
    urlPolicy: config.developmentLoopback && !config.tlsVerified ? 'development_loopback' : 'verify-full',
    negotiated,
    protocol: negotiated ? transport.protocol : null,
    cipher: negotiated ? transport.cipher : null,
    bits: negotiated ? Number(transport.bits) : null,
    certificateChainAttested: false,
    directEndpointAttested: false,
  });
}

function validateObserverSecurity(observer) {
  if (typeof observer.session_user_name !== 'string' || !observer.session_user_name.trim()
    || typeof observer.current_user_name !== 'string' || !observer.current_user_name.trim()) {
    fail('OBSERVER_IDENTITY_INVALID', 'PostgreSQL no devolvió una identidad de observador válida.');
  }
  if (observer.session_user_name !== observer.current_user_name) {
    fail('OBSERVER_IDENTITY_SWITCHED', 'WP0-L no admite SET ROLE ni una identidad de sesión diferente.');
  }

  const attributes = Object.freeze({
    superuser: booleanField(observer, 'role_superuser', 'OBSERVER_SECURITY_INVALID'),
    inherit: booleanField(observer, 'role_inherit', 'OBSERVER_SECURITY_INVALID'),
    createRole: booleanField(observer, 'role_create_role', 'OBSERVER_SECURITY_INVALID'),
    createDb: booleanField(observer, 'role_create_db', 'OBSERVER_SECURITY_INVALID'),
    canLogin: booleanField(observer, 'role_can_login', 'OBSERVER_SECURITY_INVALID'),
    replication: booleanField(observer, 'role_replication', 'OBSERVER_SECURITY_INVALID'),
    bypassRls: booleanField(observer, 'role_bypass_rls', 'OBSERVER_SECURITY_INVALID'),
  });
  const privileges = Object.freeze({
    databaseCreate: booleanField(observer, 'database_create', 'OBSERVER_SECURITY_INVALID'),
    databaseConnect: booleanField(observer, 'database_connect', 'OBSERVER_SECURITY_INVALID'),
    databaseTemp: booleanField(observer, 'database_temp', 'OBSERVER_SECURITY_INVALID'),
    governedSchemaCreate: booleanField(observer, 'governed_schema_create', 'OBSERVER_SECURITY_INVALID'),
    governedSchemaUsage: booleanField(observer, 'governed_schema_usage', 'OBSERVER_SECURITY_INVALID'),
    governedRelationWrite: booleanField(observer, 'governed_relation_write', 'OBSERVER_SECURITY_INVALID'),
    governedColumnWrite: booleanField(observer, 'governed_column_write', 'OBSERVER_SECURITY_INVALID'),
    governedSequenceWrite: booleanField(observer, 'governed_sequence_write', 'OBSERVER_SECURITY_INVALID'),
    governedRoutineExecute: booleanField(observer, 'governed_routine_execute', 'OBSERVER_SECURITY_INVALID'),
    businessRelationSelect: booleanField(observer, 'business_relation_select', 'OBSERVER_SECURITY_INVALID'),
    businessColumnSelect: booleanField(observer, 'business_column_select', 'OBSERVER_SECURITY_INVALID'),
    migrationHistorySelect: booleanField(observer, 'migration_history_select', 'OBSERVER_SECURITY_INVALID'),
  });
  const membershipCount = parseNonNegativeInteger(observer.role_membership_count);
  const unsafeMembershipCount = parseNonNegativeInteger(observer.unsafe_membership_count);
  if (membershipCount === null || unsafeMembershipCount === null || unsafeMembershipCount > membershipCount) {
    fail('OBSERVER_SECURITY_INVALID', 'PostgreSQL devolvió membresías de rol inválidas.');
  }
  if (attributes.superuser || attributes.createRole || attributes.createDb
    || attributes.replication || attributes.bypassRls || !attributes.canLogin
    || membershipCount > 0n || unsafeMembershipCount > 0n
    || privileges.databaseCreate || !privileges.databaseConnect
    || privileges.databaseTemp || privileges.governedSchemaCreate
    || privileges.governedRelationWrite || privileges.governedColumnWrite
    || privileges.governedSequenceWrite || privileges.governedRoutineExecute
    || privileges.businessRelationSelect || privileges.businessColumnSelect) {
    fail('OBSERVER_ROLE_NOT_LEAST_PRIVILEGE', 'El rol WP0-L posee privilegios incompatibles con observación dedicada.');
  }
  return Object.freeze({
    sessionMatchesCurrent: true,
    roleNameSha256: sha256(observer.current_user_name),
    attributes,
    memberships: Object.freeze({
      count: membershipCount.toString(10),
      unsafeCount: unsafeMembershipCount.toString(10),
    }),
    privileges,
    leastPrivilegeVerified: true,
  });
}

function buildObservation({
  config,
  commit,
  schemaSha256,
  observedAt,
  identity,
  clock,
  transport,
  observer,
  catalogRows,
  migrationObservation,
}) {
  if (!COMMIT_SHA.test(String(commit || ''))) fail('COMMIT_INVALID', 'WP0-L exige un commit Git SHA-1 exacto.');
  if (!SHA256_HEX.test(String(schemaSha256 || ''))) {
    fail('SCHEMA_SHA256_INVALID', 'WP0-L exige el SHA-256 del schema fijado por el commit.');
  }
  const observed = observedAt instanceof Date ? observedAt : new Date(observedAt);
  if (!Number.isFinite(observed.getTime())) fail('OBSERVED_AT_INVALID', 'La fecha de observación no es válida.');
  const catalog = section(catalogRows);
  const inventoryDigestSha256 = inventoryDigest(catalog, migrationObservation);
  const historyStrict = migrationObservation.state === 'valid';
  const blockingReasons = [...migrationObservation.issues, ...BASE_OBSERVATION_BLOCKERS].sort();
  const payload = {
    contractVersion: OBSERVATION_CONTRACT_VERSION,
    artifactType: OBSERVATION_ARTIFACT_TYPE,
    semantics: 'OBSERVATION_ONLY_NOT_AUTHORIZATION',
    observedAt: observed.toISOString(),
    commit,
    source: {
      schemaPath: 'prisma/schema.prisma',
      schemaSha256,
      sourceKind: 'IMMUTABLE_GIT_BLOB',
    },
    quality: {
      collectionMode: historyStrict ? 'strict' : 'discovery_non_approvable',
      approvalEligible: false,
      blockingReasons,
    },
    target: {
      targetId: config.targetId,
      targetClass: WP0_CONFIRMATION,
      databaseNameSha256: sha256(identity.database_name),
      postgresVersionNum: String(identity.server_version_num),
      prismaSchema: config.prismaSchema,
      transport,
    },
    evidence: {
      backupRef: config.backupRef,
      restoreRef: config.restoreRef,
      reviewerIds: [...config.reviewerIds],
      externalReferencesVerified: false,
      backupRestoreRelationVerified: false,
      reviewerIndependenceVerified: false,
      signedProviderReceiptVerified: false,
    },
    transaction: {
      isolation: 'repeatable read',
      readOnly: true,
      clock,
    },
    observer,
    inventory: {
      catalog,
      prismaMigrations: migrationObservation,
      inventoryDigestSha256,
    },
    limitations: [...OBSERVATION_LIMITATIONS],
  };
  return assertObservationSafe({
    ...payload,
    observationId: `wp0-observation-${sha256(canonicalJson(payload))}`,
  });
}

async function runRestoredCopyObservation({ adapter, config, commit, schemaSha256, now = new Date() }) {
  const observed = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(observed.getTime())) fail('OBSERVED_AT_INVALID', 'La fecha de observación no es válida.');
  if (!SHA256_HEX.test(String(schemaSha256 || ''))) {
    fail('SCHEMA_SHA256_INVALID', 'WP0-L exige el SHA-256 del schema fijado por el commit.');
  }
  let transactionStarted = false;
  try {
    await executeAllowlistedQuery(adapter, QUERY_IDS.BEGIN, { prismaSchema: config.prismaSchema });
    transactionStarted = true;
    const transaction = requireSingleRow(
      QUERY_IDS.TRANSACTION_STATE,
      await executeAllowlistedQuery(adapter, QUERY_IDS.TRANSACTION_STATE, { prismaSchema: config.prismaSchema }),
    );
    if (transaction.transaction_read_only !== 'on'
      || String(transaction.transaction_isolation).toLowerCase() !== 'repeatable read') {
      fail('TRANSACTION_NOT_READ_ONLY', 'PostgreSQL no confirmó REPEATABLE READ READ ONLY.');
    }
    if (transaction.row_security !== 'off' || transaction.search_path !== 'pg_catalog') {
      fail(
        'SESSION_SECURITY_CONTEXT_INVALID',
        'PostgreSQL no confirmó row_security=off y search_path=pg_catalog para la sesión WP0-L.',
      );
    }

    const identity = requireSingleRow(
      QUERY_IDS.DATABASE_IDENTITY,
      await executeAllowlistedQuery(adapter, QUERY_IDS.DATABASE_IDENTITY, { prismaSchema: config.prismaSchema }),
    );
    validateWp0DatabaseMarker(identity.wp0_marker, config.targetId);
    if (typeof identity.database_name !== 'string' || !identity.database_name.trim()
      || !/^\d{5,8}$/u.test(String(identity.server_version_num))) {
      fail('DATABASE_IDENTITY_INVALID', 'La identidad PostgreSQL observada es inválida.');
    }
    if (Number(identity.server_version_num) < MIN_POSTGRES_VERSION_NUM) {
      fail('POSTGRES_VERSION_UNSUPPORTED', 'WP0-L v2 exige PostgreSQL 12 o posterior.');
    }

    const clock = validateClock(requireSingleRow(
      QUERY_IDS.CLOCK_STATE,
      await executeAllowlistedQuery(adapter, QUERY_IDS.CLOCK_STATE, { prismaSchema: config.prismaSchema }),
    ), observed);
    const transport = validateTransportSecurity(requireSingleRow(
      QUERY_IDS.TRANSPORT_SECURITY,
      await executeAllowlistedQuery(adapter, QUERY_IDS.TRANSPORT_SECURITY, { prismaSchema: config.prismaSchema }),
    ), config);

    const observer = validateObserverSecurity(requireSingleRow(
      QUERY_IDS.OBSERVER_SECURITY,
      await executeAllowlistedQuery(adapter, QUERY_IDS.OBSERVER_SECURITY, { prismaSchema: config.prismaSchema }),
    ));

    const catalogRows = validateCatalogRows(normalizeRows(
      QUERY_IDS.CATALOG_INVENTORY,
      await executeAllowlistedQuery(adapter, QUERY_IDS.CATALOG_INVENTORY, { prismaSchema: config.prismaSchema }),
    ));
    if (catalogRows.length === 0) fail('CATALOG_INVENTORY_EMPTY', 'El inventario de catálogos está vacío.');

    const locator = requireSingleRow(
      QUERY_IDS.MIGRATION_LOCATOR,
      await executeAllowlistedQuery(adapter, QUERY_IDS.MIGRATION_LOCATOR, { prismaSchema: config.prismaSchema }),
    );
    if (locator.row_level_security !== 'false' || locator.force_row_level_security !== 'false') {
      fail('MIGRATION_HISTORY_RLS_FORBIDDEN', 'La historia Prisma no puede observarse a través de RLS.');
    }
    const relationCount = parseNonNegativeInteger(locator.relation_count);
    if (relationCount === null) fail('MIGRATION_LOCATOR_INVALID', 'El catálogo devolvió un locator Prisma inválido.');
    const migrationQueryable = relationCount === 1n
      && locator.named_object_count === '1'
      && locator.relation_kinds === 'r'
      && locator.relation_persistence === 'p'
      && locator.column_count === String(PRISMA_MIGRATION_COLUMNS.length)
      && locator.column_names === PRISMA_MIGRATION_COLUMNS.join(',')
      && locator.column_signature === PRISMA_MIGRATION_COLUMN_SIGNATURE
      && locator.primary_key_count === '1'
      && locator.primary_key_columns === 'id';
    if (migrationQueryable && !observer.privileges.migrationHistorySelect) {
      fail('OBSERVER_MIGRATION_SELECT_REQUIRED', 'El rol WP0-L no puede leer la única tabla permitida de historia Prisma.');
    }
    const migrationRows = migrationQueryable
      ? await executeAllowlistedQuery(adapter, QUERY_IDS.MIGRATION_HISTORY, { prismaSchema: config.prismaSchema })
      : [];
    const migrationObservation = analyzeMigrationHistory(locator, migrationRows);

    const observation = buildObservation({
      config,
      commit,
      schemaSha256,
      observedAt: observed,
      identity,
      clock,
      transport,
      observer,
      catalogRows,
      migrationObservation,
    });
    await executeAllowlistedQuery(adapter, QUERY_IDS.COMMIT, { prismaSchema: config.prismaSchema });
    transactionStarted = false;
    return observation;
  } catch (error) {
    if (transactionStarted) {
      try {
        await executeAllowlistedQuery(adapter, QUERY_IDS.ROLLBACK, { prismaSchema: config?.prismaSchema });
      } catch {
        throw new Wp0ObservationError('ROLLBACK_FAILED', 'Falló la observación y PostgreSQL no confirmó ROLLBACK.', error);
      }
    }
    if (error instanceof Wp0ObservationError) throw error;
    throw new Wp0ObservationError('OBSERVATION_QUERY_FAILED', 'Falló la inspección read-only de la copia restaurada.', error);
  }
}

async function writeObservationFile({ outputPath, repoRoot, observation }) {
  const snapshot = assertObservationSafe(observation);
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  const serializedBytes = Buffer.byteLength(serialized, 'utf8');
  if (serializedBytes > MAX_OBSERVATION_BYTES) {
    fail('OBSERVATION_SIZE_LIMIT_EXCEEDED', 'El JSON final de observación excede el máximo permitido.');
  }
  const validated = await validateOutputPath(outputPath, repoRoot);
  let handle;
  let created = false;
  let createdIdentity;
  let completed = false;
  try {
    const parent = path.dirname(validated.outputPath);
    await assertNoSymlinkAncestors(parent);
    const parentRealBefore = await fsp.realpath(parent);
    const parentStatBefore = await fsp.stat(parent);
    const compare = value => (process.platform === 'win32' ? value.toLowerCase() : value);
    if (compare(parentRealBefore) !== compare(validated.parentReal)
      || !sameFileIdentity(parentStatBefore, validated.parentIdentity)) {
      fail('OUTPUT_PARENT_CHANGED', 'El directorio de output cambió después de validarse.');
    }
    const noFollow = process.platform === 'win32' ? 0 : (fs.constants.O_NOFOLLOW || 0);
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | noFollow;
    handle = await fsp.open(validated.outputPath, flags, 0o600);
    created = true;
    const handleStat = await handle.stat();
    createdIdentity = Object.freeze({ dev: handleStat.dev, ino: handleStat.ino });
    const pathStat = await fsp.lstat(validated.outputPath);
    const parentRealAfterOpen = await fsp.realpath(parent);
    const parentStatAfterOpen = await fsp.stat(parent);
    const outputRealAfterOpen = await fsp.realpath(validated.outputPath);
    if (!handleStat.isFile() || !pathStat.isFile() || pathStat.isSymbolicLink()) {
      fail('OUTPUT_NOT_REGULAR', 'El output creado no es un archivo regular.');
    }
    if (handleStat.dev !== pathStat.dev || handleStat.ino !== pathStat.ino
      || compare(parentRealAfterOpen) !== compare(validated.parentReal)
      || !sameFileIdentity(parentStatAfterOpen, validated.parentIdentity)
      || compare(outputRealAfterOpen) !== compare(validated.outputPath)) {
      fail('OUTPUT_PATH_CHANGED', 'La ruta de output cambió durante la apertura exclusiva.');
    }
    if (process.platform !== 'win32' && (handleStat.mode & 0o777) !== 0o600) {
      fail('OUTPUT_MODE_INVALID', 'El output POSIX debe crearse con modo 0600 exacto.');
    }
    await handle.writeFile(serialized, 'utf8');
    await handle.sync();
    const finalHandleStat = await handle.stat();
    const finalPathStat = await fsp.lstat(validated.outputPath);
    const finalParentReal = await fsp.realpath(parent);
    const finalParentStat = await fsp.stat(parent);
    if (!finalPathStat.isFile() || finalPathStat.isSymbolicLink()
      || finalHandleStat.dev !== finalPathStat.dev || finalHandleStat.ino !== finalPathStat.ino
      || compare(finalParentReal) !== compare(validated.parentReal)
      || !sameFileIdentity(finalParentStat, validated.parentIdentity)) {
      fail('OUTPUT_PATH_CHANGED', 'La ruta de output cambió durante la escritura.');
    }
    completed = true;
  } finally {
    if (handle) await handle.close();
    if (created && createdIdentity && !completed) {
      try {
        const cleanupStat = await fsp.lstat(validated.outputPath);
        if (!cleanupStat.isSymbolicLink()
          && cleanupStat.dev === createdIdentity.dev && cleanupStat.ino === createdIdentity.ino) {
          await fsp.unlink(validated.outputPath);
        }
      } catch { /* best-effort cleanup only when the exact created inode is still addressed */ }
    }
  }
  return Object.freeze({
    outputPath: validated.outputPath,
    sha256: sha256(Buffer.from(serialized, 'utf8')),
    bytes: serializedBytes,
  });
}

function listAllowlistedQueries(prismaSchema = 'public') {
  return Object.freeze(Object.values(QUERY_IDS).map(id => queryFor(id, prismaSchema)));
}

module.exports = Object.freeze({
  WP0_CONFIRMATION,
  OBSERVATION_ARTIFACT_TYPE,
  OBSERVATION_CONTRACT_VERSION,
  QUERY_IDS,
  Wp0ObservationError,
  canonicalJson,
  executeAllowlistedQuery,
  listAllowlistedQueries,
  validateObservationConfig,
  validateOutputPath,
  assertObservationSafe,
  runRestoredCopyObservation,
  writeObservationFile,
});
