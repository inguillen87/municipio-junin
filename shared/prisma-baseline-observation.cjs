'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const databaseUrlPolicy = require('./database-url-policy.cjs');

const { inspectDatabaseUrl } = databaseUrlPolicy;

const WP0_CONFIRMATION = 'RESTORED_DISPOSABLE';
const OBSERVATION_ARTIFACT_TYPE = 'wp0_restored_copy_observation';
const OBSERVATION_CONTRACT_VERSION = 1;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const COMMIT_SHA = /^[a-f0-9]{40}$/u;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/u;
const REFERENCE_BODY = /^[A-Za-z0-9][A-Za-z0-9._-]{1,126}$/u;
const MIGRATION_NAME = /^\d{14}_[a-z0-9][a-z0-9_]*$/u;
const WP0_ALLOWED_URL_PARAMS = new Set(['schema', 'sslmode']);
const UNSAFE_OUTPUT_VALUE = /(?:[a-z][a-z0-9+.-]*:\/\/|\bpassword\s*=|\btoken\s*=|\bsecret\s*=|\bsk-[A-Za-z0-9_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/iu;

const QUERY_IDS = Object.freeze({
  BEGIN: 'transaction.begin',
  TRANSACTION_STATE: 'transaction.state',
  DATABASE_IDENTITY: 'database.identity',
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
  [QUERY_IDS.DATABASE_IDENTITY]: Object.freeze({
    text: [
      'WITH database_settings AS (',
      '  SELECT',
      "    pg_catalog.string_agg(setting, E'\\n' ORDER BY setting) FILTER (WHERE setting LIKE 'municontrol.wp0_target_class=%') AS target_class_setting,",
      "    pg_catalog.string_agg(setting, E'\\n' ORDER BY setting) FILTER (WHERE setting LIKE 'municontrol.wp0_target_id=%') AS target_id_setting",
      '  FROM pg_catalog.pg_db_role_setting AS configured',
      '  JOIN pg_catalog.pg_database AS database ON database.oid = configured.setdatabase',
      '  CROSS JOIN LATERAL pg_catalog.unnest(configured.setconfig) AS expanded(setting)',
      '  WHERE database.datname = pg_catalog.current_database() AND configured.setrole = 0',
      ')',
      'SELECT',
      '  pg_catalog.current_database() AS database_name,',
      "  pg_catalog.current_setting('server_version_num') AS server_version_num,",
      "  pg_catalog.current_setting('municontrol.wp0_target_class', true) AS target_class,",
      "  pg_catalog.current_setting('municontrol.wp0_target_id', true) AS target_id,",
      '  target_class_setting AS database_target_class_setting,',
      '  target_id_setting AS database_target_id_setting',
      'FROM database_settings',
    ].join('\n'),
    values: Object.freeze([]),
  }),
  [QUERY_IDS.CATALOG_INVENTORY]: Object.freeze({
    text: [
      'WITH governed_namespaces AS (',
      '  SELECT n.oid, n.nspname, pg_catalog.pg_get_userbyid(n.nspowner) AS owner_name',
      '  FROM pg_catalog.pg_namespace AS n',
      "  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')",
      "    AND n.nspname !~ '^pg_(toast|temp)'",
      '), inventory AS (',
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
      "     ';generated=' || a.attgenerated)::text",
      '  FROM pg_catalog.pg_attribute AS a',
      '  JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid',
      '  JOIN governed_namespaces AS n ON n.oid = c.relnamespace',
      "  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f') AND a.attnum > 0 AND NOT a.attisdropped",
      '  UNION ALL',
      "  SELECT 'constraint', n.nspname, con.conname, c.relname,",
      '    pg_catalog.pg_get_constraintdef(con.oid, true)::text',
      '  FROM pg_catalog.pg_constraint AS con',
      '  JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid',
      '  JOIN governed_namespaces AS n ON n.oid = c.relnamespace',
      '  UNION ALL',
      "  SELECT 'index', n.nspname, i.relname, c.relname,",
      '    pg_catalog.pg_get_indexdef(i.oid, 0, true)::text',
      '  FROM pg_catalog.pg_index AS x',
      '  JOIN pg_catalog.pg_class AS i ON i.oid = x.indexrelid',
      '  JOIN pg_catalog.pg_class AS c ON c.oid = x.indrelid',
      '  JOIN governed_namespaces AS n ON n.oid = c.relnamespace',
      ')',
      'SELECT object_kind, schema_name, object_name, parent_name, definition',
      'FROM inventory',
      'ORDER BY object_kind, schema_name, parent_name NULLS FIRST, object_name, definition',
    ].join('\n'),
    values: Object.freeze([]),
  }),
  [QUERY_IDS.MIGRATION_LOCATOR]: Object.freeze({
    text: [
      'SELECT',
      '  pg_catalog.count(*)::text AS relation_count,',
      "  coalesce(pg_catalog.bool_or(c.relrowsecurity), false)::text AS row_level_security,",
      "  coalesce(pg_catalog.bool_or(c.relforcerowsecurity), false)::text AS force_row_level_security",
      'FROM pg_catalog.pg_class AS c',
      'JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace',
      "WHERE n.nspname = $1 AND c.relname = '_prisma_migrations' AND c.relkind = 'r'",
    ].join('\n'),
  }),
  [QUERY_IDS.COMMIT]: Object.freeze({ text: 'COMMIT', values: Object.freeze([]) }),
  [QUERY_IDS.ROLLBACK]: Object.freeze({ text: 'ROLLBACK', values: Object.freeze([]) }),
});

const ROW_FIELDS = Object.freeze({
  [QUERY_IDS.TRANSACTION_STATE]: Object.freeze([
    'transaction_read_only', 'transaction_isolation', 'row_security', 'search_path',
  ]),
  [QUERY_IDS.DATABASE_IDENTITY]: Object.freeze([
    'database_name', 'server_version_num', 'target_class', 'target_id',
    'database_target_class_setting', 'database_target_id_setting',
  ]),
  [QUERY_IDS.CATALOG_INVENTORY]: Object.freeze(['object_kind', 'schema_name', 'object_name', 'parent_name', 'definition']),
  [QUERY_IDS.MIGRATION_LOCATOR]: Object.freeze([
    'relation_count', 'row_level_security', 'force_row_level_security',
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

function canonicalize(value) {
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
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object' || Buffer.isBuffer(value)) {
    fail('OBSERVATION_VALUE_INVALID', 'La observación contiene un tipo no permitido.');
  }
  const result = {};
  for (const key of Object.keys(value).sort()) result[key] = canonicalize(value[key]);
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
  return typeof normalized === 'string' ? normalized.normalize('NFC') : normalized;
}

function normalizeRows(queryId, rows) {
  const fields = ROW_FIELDS[queryId];
  if (!fields || !Array.isArray(rows)) fail('QUERY_RESULT_INVALID', `Resultado inválido para ${queryId}.`);
  const sortedFields = [...fields].sort();
  const normalized = rows.map(row => {
    if (!exactKeys(row, sortedFields)) fail('QUERY_RESULT_SHAPE_INVALID', `Columnas inesperadas en ${queryId}.`);
    const result = {};
    for (const field of fields) result[field] = normalizeScalar(row[field]);
    return result;
  });
  normalized.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), 'en'));
  return normalized;
}

function quoteIdentifier(identifier) {
  if (!IDENTIFIER.test(identifier)) fail('PRISMA_SCHEMA_INVALID', 'El schema Prisma de la conexión no es seguro.');
  return `"${identifier.replaceAll('"', '""')}"`;
}

function queryFor(queryId, prismaSchema = 'public') {
  if (queryId === QUERY_IDS.MIGRATION_HISTORY) {
    const schema = quoteIdentifier(prismaSchema);
    return Object.freeze({
      id: queryId,
      text: [
        'SELECT',
        '  id::text AS migration_id, checksum::text AS checksum, migration_name::text AS migration_name,',
        '  started_at AS started_at, finished_at AS finished_at, rolled_back_at AS rolled_back_at,',
        '  applied_steps_count::text AS applied_steps_count',
        `FROM ${schema}."_prisma_migrations"`,
        'ORDER BY started_at, migration_name, id',
      ].join('\n'),
      values: Object.freeze([]),
    });
  }
  const fixed = FIXED_QUERIES[queryId];
  if (!fixed) fail('QUERY_NOT_ALLOWLISTED', 'La consulta solicitada no está permitida por WP0-L.');
  const values = queryId === QUERY_IDS.MIGRATION_LOCATOR ? Object.freeze([prismaSchema]) : fixed.values;
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
  return Object.freeze({ outputPath: resolvedOutput, parentReal, repoReal });
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

function parseTimestamp(value, field) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(timestamp)) fail('MIGRATION_HISTORY_INCONSISTENT', `Timestamp inválido en ${field}.`);
  return timestamp;
}

function validateMigrationHistory(rows) {
  const history = normalizeRows(QUERY_IDS.MIGRATION_HISTORY, rows);
  if (history.length === 0) fail('MIGRATION_HISTORY_MISSING', 'La copia restaurada no contiene historia Prisma aplicada.');
  const names = new Set();
  for (const row of history) {
    if (typeof row.migration_id !== 'string' || !row.migration_id.trim()
      || typeof row.checksum !== 'string' || !SHA256_HEX.test(row.checksum)
      || typeof row.migration_name !== 'string' || !MIGRATION_NAME.test(row.migration_name)
      || row.finished_at === null || row.rolled_back_at !== null
      || !/^\d+$/u.test(String(row.applied_steps_count)) || Number(row.applied_steps_count) < 1) {
      fail('MIGRATION_HISTORY_INCONSISTENT', 'La historia Prisma contiene una migración incompleta o inválida.');
    }
    if (names.has(row.migration_name)) fail('MIGRATION_HISTORY_INCONSISTENT', 'La historia Prisma contiene nombres duplicados.');
    names.add(row.migration_name);
    const started = parseTimestamp(row.started_at, 'started_at');
    const finished = parseTimestamp(row.finished_at, 'finished_at');
    if (finished < started) fail('MIGRATION_HISTORY_INCONSISTENT', 'La historia Prisma contiene tiempos inconsistentes.');
  }
  return history;
}

function section(rows) {
  const canonical = canonicalJson(rows);
  return Object.freeze({ count: rows.length, sha256: sha256(canonical), rows: Object.freeze(rows) });
}

function assertObservationSafe(observation) {
  const serialized = canonicalJson(observation);
  if (UNSAFE_OUTPUT_VALUE.test(serialized)) {
    fail('OBSERVATION_SECRET_DETECTED', 'La observación contiene una URL o material con apariencia de secreto.');
  }
  if (!serialized.includes(`"artifactType":"${OBSERVATION_ARTIFACT_TYPE}"`)
    || serialized.includes('releaseReceipt') || serialized.includes('baselineManifest')
    || serialized.includes('releaseAuthorization')) {
    fail('OBSERVATION_SEMANTICS_INVALID', 'El artefacto debe conservar semántica exclusiva de observación.');
  }
  return true;
}

function buildObservation({ config, commit, observedAt, identity, catalogRows, migrationRows }) {
  if (!COMMIT_SHA.test(String(commit || ''))) fail('COMMIT_INVALID', 'WP0-L exige un commit Git SHA-1 exacto.');
  const observed = observedAt instanceof Date ? observedAt : new Date(observedAt);
  if (!Number.isFinite(observed.getTime())) fail('OBSERVED_AT_INVALID', 'La fecha de observación no es válida.');
  const catalog = section(catalogRows);
  const migrations = section(migrationRows);
  const inventoryDigestSha256 = sha256(canonicalJson({
    catalog: { count: catalog.count, sha256: catalog.sha256 },
    prismaMigrations: { count: migrations.count, sha256: migrations.sha256 },
  }));
  const payload = {
    contractVersion: OBSERVATION_CONTRACT_VERSION,
    artifactType: OBSERVATION_ARTIFACT_TYPE,
    semantics: 'OBSERVATION_ONLY_NOT_AUTHORIZATION',
    observedAt: observed.toISOString(),
    commit,
    target: {
      targetId: config.targetId,
      targetClass: WP0_CONFIRMATION,
      databaseNameSha256: sha256(identity.database_name),
      postgresVersionNum: String(identity.server_version_num),
      prismaSchema: config.prismaSchema,
      tls: config.developmentLoopback && !config.tlsVerified ? 'development_loopback' : 'verify-full',
    },
    evidence: {
      backupRef: config.backupRef,
      restoreRef: config.restoreRef,
      reviewerIds: [...config.reviewerIds],
    },
    transaction: {
      isolation: 'repeatable read',
      readOnly: true,
    },
    inventory: {
      catalog,
      prismaMigrations: migrations,
      inventoryDigestSha256,
    },
    limitations: [
      'No es un baseline manifest, una migración, un receipt de release ni una autorización de DDL.',
      'No demuestra ausencia de drift ni reemplaza backup, restore, diff y revisión institucional.',
      'No contiene filas de negocio y no habilita aprovisionamiento de cuentas.',
    ],
  };
  const observation = Object.freeze({
    ...payload,
    observationId: `wp0-observation-${sha256(canonicalJson(payload))}`,
  });
  assertObservationSafe(observation);
  return observation;
}

async function runRestoredCopyObservation({ adapter, config, commit, now = new Date() }) {
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
    if (identity.target_class !== WP0_CONFIRMATION) {
      fail('TARGET_NOT_RESTORED_DISPOSABLE', 'La DB no declara el marcador de copia restaurada descartable.');
    }
    if (identity.target_id !== config.targetId) {
      fail('TARGET_ID_MISMATCH', 'La identidad persistente de la DB no coincide con el target solicitado.');
    }
    if (identity.database_target_class_setting !== `municontrol.wp0_target_class=${WP0_CONFIRMATION}`
      || identity.database_target_id_setting !== `municontrol.wp0_target_id=${config.targetId}`) {
      fail('TARGET_DATABASE_SETTING_MISSING', 'Los marcadores WP0-L no pertenecen exclusivamente a la base restaurada.');
    }
    if (typeof identity.database_name !== 'string' || !identity.database_name.trim()
      || !/^\d{5,8}$/u.test(String(identity.server_version_num))) {
      fail('DATABASE_IDENTITY_INVALID', 'La identidad PostgreSQL observada es inválida.');
    }

    const catalogRows = normalizeRows(
      QUERY_IDS.CATALOG_INVENTORY,
      await executeAllowlistedQuery(adapter, QUERY_IDS.CATALOG_INVENTORY, { prismaSchema: config.prismaSchema }),
    );
    if (catalogRows.length === 0) fail('CATALOG_INVENTORY_EMPTY', 'El inventario de catálogos está vacío.');

    const locator = requireSingleRow(
      QUERY_IDS.MIGRATION_LOCATOR,
      await executeAllowlistedQuery(adapter, QUERY_IDS.MIGRATION_LOCATOR, { prismaSchema: config.prismaSchema }),
    );
    if (locator.relation_count !== '1') {
      fail('MIGRATION_HISTORY_MISSING', 'No existe exactamente una tabla _prisma_migrations en el schema esperado.');
    }
    if (locator.row_level_security !== 'false' || locator.force_row_level_security !== 'false') {
      fail('MIGRATION_HISTORY_RLS_FORBIDDEN', 'La historia Prisma no puede observarse a través de RLS.');
    }
    const migrationRows = validateMigrationHistory(
      await executeAllowlistedQuery(adapter, QUERY_IDS.MIGRATION_HISTORY, { prismaSchema: config.prismaSchema }),
    );

    const observation = buildObservation({ config, commit, observedAt: now, identity, catalogRows, migrationRows });
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
  assertObservationSafe(observation);
  const validated = await validateOutputPath(outputPath, repoRoot);
  const serialized = `${JSON.stringify(canonicalize(observation), null, 2)}\n`;
  let handle;
  try {
    handle = await fsp.open(validated.outputPath, 'wx', 0o600);
    const stat = await handle.stat();
    if (!stat.isFile()) fail('OUTPUT_NOT_REGULAR', 'El output creado no es un archivo regular.');
    await handle.writeFile(serialized, 'utf8');
    await handle.sync();
  } finally {
    if (handle) await handle.close();
  }
  return Object.freeze({
    outputPath: validated.outputPath,
    sha256: sha256(Buffer.from(serialized, 'utf8')),
    bytes: Buffer.byteLength(serialized),
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
