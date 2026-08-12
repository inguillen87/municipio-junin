export const BOOTSTRAP_INTERNAL_STAGES = Object.freeze([
  'configuration', 'snapshot_key', 'connect', 'schema_privilege', 'tenant_reference_privilege',
  'begin', 'migration', 'schema', 'tenant',
  'consumed', 'source', 'pilot', 'user', 'snapshot_encrypt', 'publication', 'counts', 'audit', 'commit',
]);

export function bootstrapInternalDiagnostic(stage, error) {
  const safeStage = BOOTSTRAP_INTERNAL_STAGES.includes(stage) ? stage : 'configuration';
  const code = `BOOTSTRAP_INTERNAL_${safeStage.toUpperCase()}`;
  const pgCode = typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)
    ? error.code
    : null;
  return Object.freeze(pgCode ? { code, pgCode } : { code });
}

const ENDPOINT_TEMPLATE = String.raw`import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import bcrypt from 'bcryptjs';
import pg from 'pg';

import { inspectGrhDirectoryArtifact } from './lib/grh-directory-contract.js';
import {
  flattenGrhDirectoryArtifact,
  publishGrhDirectory,
} from './lib/grh-directory-publication.js';
import {
  GRH_DIRECTORY_SNAPSHOT_ACTION,
  GRH_DIRECTORY_SNAPSHOT_ENTITY,
  GRH_DIRECTORY_SNAPSHOT_KEY_VERSION,
  createGrhDirectorySnapshotEnvelope,
} from './lib/grh-directory-snapshot.js';
import databaseUrlPolicy from '../shared/database-url-policy.cjs';
import publishedDemoPolicy from '../shared/published-demo-policy.cjs';

export const config = { api: { bodyParser: false } };

const { Client } = pg;
const { inspectDatabaseUrl } = databaseUrlPolicy;
const { isPublishedDemoIdentity } = publishedDemoPolicy;

const BOOTSTRAP_CONTRACT = 'grh-directory-bootstrap-v2';
const DIRECTORY_CONTRACT = 'grh-directory-v2';
const BOOTSTRAP_MODE = __BOOTSTRAP_MODE__;
const OPERATION_ID = __OPERATION_ID__;
const MIGRATION_SQL = __MIGRATION_SQL__;
const MIGRATION_SHA256 = __MIGRATION_SHA256__;
const EXPECTED_MANIFEST = Object.freeze(__EXPECTED_MANIFEST__);
const EXPECTED_MANIFEST_SHA256 = __EXPECTED_MANIFEST_SHA256__;
const MAX_COMPRESSED_BYTES = 4_000_000;
const MAX_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;
__BOOTSTRAP_INTERNAL_DIAGNOSTIC__
const PILOT_ROLE = 'INTENDENTE';
const PILOT_NAME = 'Piloto privado GRH';
const TABLES = Object.freeze([
  'grh_directory_sources',
  'grh_directory_dimensions',
  'grh_directory_people',
  'grh_directory_leave_events',
  'grh_directory_absence_events',
  'grh_directory_movement_periods',
]);
const EXPECTED_COLUMNS = Object.freeze({
  grh_directory_sources: Object.freeze([
    'tenant_id', 'schema_version', 'canonical_system', 'source_file', 'source_sha256',
    'snapshot_as_of', 'artifact_generated_at', 'record_count', 'leave_record_count',
    'position_observation_count', 'published_at', 'absence_record_count',
    'movement_period_count',
  ]),
  grh_directory_dimensions: Object.freeze([
    'tenant_id', 'dimension', 'company_code', 'scope_code', 'code', 'label',
    'parent_code', 'depends_on_code',
  ]),
  grh_directory_people: Object.freeze([
    'tenant_id', 'company_code', 'legajo', 'display_name', 'sector_code',
    'organization_code', 'position_code', 'position_observation_label',
    'position_observed_date', 'position_observed_period', 'position_observation_status',
    'position_observation_source', 'category_code', 'agreement_code',
    'absence_event_count', 'latest_absence_date', 'leave_event_count',
    'latest_leave_start_date', 'latest_leave_end_date', 'cost_center_code',
    'movement_row_count', 'movement_period_count', 'latest_movement_period',
  ]),
  grh_directory_leave_events: Object.freeze([
    'tenant_id', 'company_code', 'legajo', 'event_order', 'start_date', 'end_date', 'days',
  ]),
  grh_directory_absence_events: Object.freeze([
    'tenant_id', 'company_code', 'legajo', 'event_order', 'event_date', 'days',
  ]),
  grh_directory_movement_periods: Object.freeze([
    'tenant_id', 'company_code', 'legajo', 'period', 'row_count',
  ]),
});
const EXPECTED_INDEXES = Object.freeze([
  'idx_grh_directory_people_legajo',
  'idx_grh_directory_people_name_prefix',
  'idx_grh_directory_people_sector',
  'idx_grh_directory_people_organization',
  'idx_grh_directory_people_position',
  'idx_grh_directory_people_position_observation',
  'idx_grh_directory_people_category',
  'idx_grh_directory_people_agreement',
  'idx_grh_directory_people_absence',
  'idx_grh_directory_people_leave',
  'idx_grh_directory_leave_events_recent',
  'idx_grh_directory_people_cost_center',
  'idx_grh_directory_people_movement',
  'idx_grh_directory_absence_events_recent',
  'idx_grh_directory_movement_periods_recent',
]);

class BootstrapError extends Error {
  constructor(code, status = 500) {
    super('GRH bootstrap failed');
    this.code = code;
    this.status = status;
  }
}

class BootstrapInternalError extends Error {
  constructor(stage, cause) {
    super('GRH bootstrap internal failure');
    const diagnostic = bootstrapInternalDiagnostic(stage, cause);
    this.code = diagnostic.code;
    this.pgCode = diagnostic.pgCode || null;
  }
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function headerValue(req, name) {
  const value = req.headers?.[name];
  return Array.isArray(value) ? null : typeof value === 'string' ? value.trim() : null;
}

function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function digest(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function decodeSnapshotKey() {
  const encoded = String(process.env.GRH_DIRECTORY_SNAPSHOT_KEY_V1 || '').trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) {
    throw new BootstrapError('BOOTSTRAP_SNAPSHOT_KEY_INVALID', 503);
  }
  const key = Buffer.from(encoded, 'base64url');
  if (key.length !== 32 || key.toString('base64url') !== encoded) {
    throw new BootstrapError('BOOTSTRAP_SNAPSHOT_KEY_INVALID', 503);
  }
  return { encoded, decoded: key };
}

function encryptSnapshot(tenantId, artifact, inspected, key) {
  const snapshot = createGrhDirectorySnapshotEnvelope({
    tenantId,
    artifact,
    key: key.encoded,
    keyVersion: GRH_DIRECTORY_SNAPSHOT_KEY_VERSION,
  });
  if (snapshot.recordCount !== inspected.flattened.people.length ||
      snapshot.absenceRecordCount !== inspected.flattened.absenceEvents.length ||
      snapshot.leaveRecordCount !== inspected.flattened.leaveEvents.length ||
      snapshot.movementPeriodCount !== inspected.flattened.movementPeriods.length ||
      snapshot.positionObservationCount !== inspected.positionObservationCount) {
    throw new BootstrapError('BOOTSTRAP_PUBLICATION_COUNT_MISMATCH', 409);
  }
  return snapshot;
}

function send(res, status, code, details = {}) {
  return res.status(status).json({ ok: status < 300, code, ...details });
}

async function readCompressedBody(req) {
  const declared = headerValue(req, 'content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_COMPRESSED_BYTES)) {
    throw new BootstrapError('BOOTSTRAP_BODY_TOO_LARGE', 413);
  }
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) {
      if (req.body.length > MAX_COMPRESSED_BYTES) throw new BootstrapError('BOOTSTRAP_BODY_TOO_LARGE', 413);
      return req.body;
    }
    if (req.body instanceof Uint8Array) {
      const buffer = Buffer.from(req.body);
      if (buffer.length > MAX_COMPRESSED_BYTES) throw new BootstrapError('BOOTSTRAP_BODY_TOO_LARGE', 413);
      return buffer;
    }
    throw new BootstrapError('BOOTSTRAP_BODY_INVALID', 400);
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_COMPRESSED_BYTES) throw new BootstrapError('BOOTSTRAP_BODY_TOO_LARGE', 413);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
}

function inspectEnvelope(envelope) {
  if (!exactKeys(envelope, ['operation', 'manifest', 'artifact', 'pilot'])) {
    throw new BootstrapError('BOOTSTRAP_ENVELOPE_INVALID', 400);
  }
  if (!exactKeys(envelope.operation, ['contract', 'operationId', 'requestId']) ||
      envelope.operation.contract !== BOOTSTRAP_CONTRACT ||
      envelope.operation.operationId !== OPERATION_ID ||
      !/^[0-9a-f-]{36}$/.test(envelope.operation.requestId || '')) {
    throw new BootstrapError('BOOTSTRAP_OPERATION_INVALID', 400);
  }
  if (JSON.stringify(envelope.manifest) !== JSON.stringify(EXPECTED_MANIFEST)) {
    throw new BootstrapError('BOOTSTRAP_MANIFEST_INVALID', 400);
  }
  const artifact = envelope.artifact;
  if (!inspectGrhDirectoryArtifact(artifact).ok ||
      artifact.schema_version !== DIRECTORY_CONTRACT ||
      artifact.source.canonical_system !== EXPECTED_MANIFEST.canonical_system ||
      artifact.source.file !== EXPECTED_MANIFEST.source_file ||
      artifact.source.sha256 !== EXPECTED_MANIFEST.sha256 ||
      artifact.source.compressed_size_bytes !== EXPECTED_MANIFEST.compressed_size_bytes ||
      artifact.source.snapshot_as_of !== EXPECTED_MANIFEST.snapshot_as_of) {
    throw new BootstrapError('BOOTSTRAP_ARTIFACT_INVALID', 400);
  }
  const pilot = envelope.pilot;
  if (!exactKeys(pilot, ['id', 'email', 'name', 'role', 'passwordHash']) ||
      !/^[0-9a-f-]{36}$/.test(pilot.id || '') ||
      !/^piloto-grh-[a-f0-9]{12}@municontrol\.local$/.test(pilot.email || '') ||
      pilot.name !== PILOT_NAME || pilot.role !== PILOT_ROLE ||
      isPublishedDemoIdentity(pilot.email) ||
      !/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(pilot.passwordHash || '')) {
    throw new BootstrapError('BOOTSTRAP_PILOT_INVALID', 400);
  }
  try {
    if (bcrypt.getRounds(pilot.passwordHash) !== 12) throw new Error('invalid rounds');
  } catch {
    throw new BootstrapError('BOOTSTRAP_PILOT_INVALID', 400);
  }
  const flattened = flattenGrhDirectoryArtifact(artifact);
  const positionObservationCount = flattened.people.filter(
    person => person.position_observation_label !== null,
  ).length;
  return { artifact, pilot, flattened, positionObservationCount };
}

async function assertDirectorySchema(client) {
  const columns = await client.query(
    "SELECT table_name, array_agg(column_name ORDER BY ordinal_position) AS columns " +
    "FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[]) " +
    'GROUP BY table_name ORDER BY table_name',
    [TABLES],
  );
  const byTable = new Map((columns.rows || []).map(row => [row.table_name, row.columns]));
  for (const table of TABLES) {
    if (JSON.stringify(byTable.get(table)) !== JSON.stringify(EXPECTED_COLUMNS[table])) {
      throw new BootstrapError('BOOTSTRAP_SCHEMA_MISMATCH', 409);
    }
  }
  const constraints = await client.query(
    "SELECT COUNT(*) FILTER (WHERE contype = 'p')::int AS primary_keys, " +
    "COUNT(*) FILTER (WHERE contype = 'f')::int AS foreign_keys, " +
    "COUNT(*) FILTER (WHERE contype = 'f' AND confdeltype = 'c')::int AS cascading_foreign_keys " +
    'FROM pg_constraint WHERE conrelid = ANY($1::regclass[])',
    [TABLES.map(table => 'public.' + table)],
  );
  const integrity = constraints.rows?.[0] || {};
  if (Number(integrity.primary_keys) !== 6 || Number(integrity.foreign_keys) !== 6 ||
      Number(integrity.cascading_foreign_keys) !== 6) {
    throw new BootstrapError('BOOTSTRAP_SCHEMA_MISMATCH', 409);
  }
  const indexes = await client.query(
    "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY($1::text[])",
    [TABLES],
  );
  const names = new Set((indexes.rows || []).map(row => row.indexname));
  if (EXPECTED_INDEXES.some(name => !names.has(name))) {
    throw new BootstrapError('BOOTSTRAP_SCHEMA_MISMATCH', 409);
  }
}

async function applyBootstrap(envelope, inspected) {
  let stage = 'configuration';
  const tenantId = String(process.env.GRH_TENANT_ID || '').trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(tenantId) ||
      String(process.env.GRH_DIRECTORY_ALLOWED_USER_IDS || '').trim() !== inspected.pilot.id) {
    throw new BootstrapError('BOOTSTRAP_RUNTIME_CONFIGURATION_INVALID', 503);
  }
  let snapshotKey = null;
  if (!['ddl', 'encrypted_snapshot'].includes(BOOTSTRAP_MODE)) {
    throw new BootstrapError('BOOTSTRAP_RUNTIME_CONFIGURATION_INVALID', 503);
  }
  let database;
  try {
    database = inspectDatabaseUrl(process.env.DIRECT_URL, {
      nodeEnv: 'production',
      environment: process.env,
    });
  } catch {
    throw new BootstrapError('BOOTSTRAP_DATABASE_CONFIGURATION_INVALID', 503);
  }
  const client = new Client({
    connectionString: database.connectionString,
    connectionTimeoutMillis: 5_000,
    query_timeout: 25_000,
    keepAlive: true,
  });
  let transaction = false;
  try {
    if (BOOTSTRAP_MODE === 'encrypted_snapshot') {
      stage = 'snapshot_key';
      snapshotKey = decodeSnapshotKey();
    }
    stage = 'connect';
    await client.connect();
    if (BOOTSTRAP_MODE === 'ddl') {
      stage = 'schema_privilege';
      const privileges = await client.query(
        "SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS can_create, " +
        "has_table_privilege(current_user, 'public.tenants', 'REFERENCES') AS can_reference_tenant",
      );
      const privilegeRow = privileges.rows?.[0] || {};
      if (privilegeRow.can_create !== true) {
        throw new BootstrapInternalError(stage, { code: '42501' });
      }
      stage = 'tenant_reference_privilege';
      if (privilegeRow.can_reference_tenant !== true) {
        throw new BootstrapInternalError(stage, { code: '42501' });
      }
    }
    stage = 'begin';
    await client.query('BEGIN');
    transaction = true;
    await client.query("SET LOCAL search_path TO public, pg_catalog");
    await client.query("SET LOCAL lock_timeout = '3000ms'");
    await client.query("SET LOCAL statement_timeout = '25000ms'");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('grh-directory-bootstrap-v2'), hashtext($1))",
      [tenantId],
    );
    if (BOOTSTRAP_MODE === 'ddl') {
      stage = 'migration';
      await client.query(MIGRATION_SQL);
      stage = 'schema';
      await assertDirectorySchema(client);
    }

    stage = 'tenant';
    const tenantResult = await client.query(
      'SELECT id, slug, status, "trialEndsAt" FROM tenants WHERE id = $1 FOR SHARE',
      [tenantId],
    );
    const tenant = tenantResult.rows?.[0];
    const expiredTrial = tenant?.status === 'TRIAL' && tenant.trialEndsAt &&
      new Date(tenant.trialEndsAt).getTime() <= Date.now();
    if (!tenant || tenant.slug !== 'junin' || !['ACTIVE', 'TRIAL'].includes(tenant.status) || expiredTrial) {
      throw new BootstrapError('BOOTSTRAP_TENANT_INVALID', 409);
    }

    if (BOOTSTRAP_MODE === 'ddl') {
      stage = 'source';
      const existingSource = await client.query(
        'SELECT schema_version FROM grh_directory_sources WHERE tenant_id = $1 FOR UPDATE',
        [tenantId],
      );
      if ((existingSource.rows || []).some(row => row.schema_version !== DIRECTORY_CONTRACT)) {
        throw new BootstrapError('BOOTSTRAP_DIRECTORY_VERSION_INVALID', 409);
      }
    }
    stage = 'consumed';
    const consumed = await client.query(
      'SELECT 1 FROM audit_logs WHERE "tenantId" = $1 AND action = $2 AND "entityId" = $3 LIMIT 1',
      [tenantId, 'GRH_DIRECTORY_BOOTSTRAP_V2', OPERATION_ID],
    );
    if ((consumed.rows || []).length > 0) {
      throw new BootstrapError('BOOTSTRAP_ALREADY_CONSUMED', 410);
    }
    stage = 'pilot';
    const existingPilot = await client.query(
      'SELECT id FROM users WHERE id = $1 OR lower(email) = lower($2) FOR UPDATE',
      [inspected.pilot.id, inspected.pilot.email],
    );
    if ((existingPilot.rows || []).length > 0) {
      throw new BootstrapError('BOOTSTRAP_PILOT_CONFLICT', 409);
    }

    stage = 'user';
    await client.query(
      'INSERT INTO users (id, email, "passwordHash", name, role, "tenantId", active, "loginCount", "createdAt", "updatedAt") ' +
      'VALUES ($1, $2, $3, $4, $5::"Role", $6, true, 0, NOW(), NOW())',
      [inspected.pilot.id, inspected.pilot.email, inspected.pilot.passwordHash,
        inspected.pilot.name, inspected.pilot.role, tenantId],
    );
    if (BOOTSTRAP_MODE === 'encrypted_snapshot') {
      stage = 'snapshot_encrypt';
      const snapshotEnvelope = encryptSnapshot(tenantId, inspected.artifact, inspected, snapshotKey);
      stage = 'publication';
      await client.query(
        'INSERT INTO audit_logs (id, "tenantId", "userId", action, entity, "entityId", details, "createdAt") ' +
        'VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())',
        [randomUUID(), tenantId, inspected.pilot.id, GRH_DIRECTORY_SNAPSHOT_ACTION,
          GRH_DIRECTORY_SNAPSHOT_ENTITY,
          OPERATION_ID, JSON.stringify(snapshotEnvelope)],
      );
      snapshotKey.decoded.fill(0);
      snapshotKey = null;
    } else {
      stage = 'publication';
      const publication = await publishGrhDirectory(client, tenantId, inspected.artifact, {
        chunkSize: 1000,
        transactionMode: 'external',
      });
      if (!['published', 'replaced', 'unchanged'].includes(publication.status)) {
        throw new BootstrapError('BOOTSTRAP_PUBLICATION_STATE_INVALID', 409);
      }
      stage = 'counts';
      const verified = await client.query(
        'SELECT (SELECT COUNT(*)::int FROM grh_directory_people WHERE tenant_id = $1) AS people, ' +
        '(SELECT COUNT(*)::int FROM grh_directory_absence_events WHERE tenant_id = $1) AS absence_events, ' +
        '(SELECT COUNT(*)::int FROM grh_directory_leave_events WHERE tenant_id = $1) AS leave_events, ' +
        '(SELECT COUNT(*)::int FROM grh_directory_movement_periods WHERE tenant_id = $1) AS movement_periods, ' +
        '(SELECT COUNT(*)::int FROM grh_directory_people WHERE tenant_id = $1 ' +
        'AND position_observation_label IS NOT NULL) AS position_observations',
        [tenantId],
      );
      const counts = verified.rows?.[0] || {};
      if (Number(counts.people) !== inspected.flattened.people.length ||
          Number(counts.absence_events) !== inspected.flattened.absenceEvents.length ||
          Number(counts.leave_events) !== inspected.flattened.leaveEvents.length ||
          Number(counts.movement_periods) !== inspected.flattened.movementPeriods.length ||
          Number(counts.position_observations) !== inspected.positionObservationCount) {
        throw new BootstrapError('BOOTSTRAP_PUBLICATION_COUNT_MISMATCH', 409);
      }
    }
    stage = 'audit';
    const auditDetails = {
      contract: BOOTSTRAP_CONTRACT,
      publicationMode: BOOTSTRAP_MODE,
      schemaVersion: DIRECTORY_CONTRACT,
      operationId: OPERATION_ID,
      requestId: envelope.operation.requestId,
      sourceSha256: inspected.artifact.source.sha256,
      snapshotAsOf: inspected.artifact.source.snapshot_as_of,
      migrationSha256: MIGRATION_SHA256,
      manifestSha256: EXPECTED_MANIFEST_SHA256,
      recordCount: inspected.flattened.people.length,
      absenceRecordCount: inspected.flattened.absenceEvents.length,
      leaveRecordCount: inspected.flattened.leaveEvents.length,
      movementPeriodCount: inspected.flattened.movementPeriods.length,
      positionObservationCount: inspected.positionObservationCount,
      pilotRole: PILOT_ROLE,
    };
    await client.query(
      'INSERT INTO audit_logs (id, "tenantId", "userId", action, entity, "entityId", details, "createdAt") ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())',
      [randomUUID(), tenantId, inspected.pilot.id, 'GRH_DIRECTORY_BOOTSTRAP_V2',
        'grh_directory', OPERATION_ID, JSON.stringify(auditDetails)],
    );
    stage = 'commit';
    await client.query('COMMIT');
    transaction = false;
    return {
      recordCount: inspected.flattened.people.length,
      absenceRecordCount: inspected.flattened.absenceEvents.length,
      leaveRecordCount: inspected.flattened.leaveEvents.length,
      movementPeriodCount: inspected.flattened.movementPeriods.length,
      positionObservationCount: inspected.positionObservationCount,
    };
  } catch (error) {
    if (transaction) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof BootstrapError || error instanceof BootstrapInternalError) throw error;
    throw new BootstrapInternalError(stage, error);
  } finally {
    if (snapshotKey) snapshotKey.decoded.fill(0);
    await client.end().catch(() => {});
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-MuniControl-Contract', BOOTSTRAP_CONTRACT);
  const expectedHost = String(process.env.VERCEL_URL || '').toLowerCase();
  const requestHost = String(headerValue(req, 'host') || '').toLowerCase();
  const configuredSecret = String(process.env.GRH_DIRECTORY_BOOTSTRAP_SECRET || '');
  const suppliedSecret = headerValue(req, 'x-grh-bootstrap-secret');
  if (process.env.VERCEL_ENV !== 'production' || !expectedHost || requestHost !== expectedHost ||
      configuredSecret.length < 32 || !constantTimeEqual(configuredSecret, suppliedSecret || '')) {
    return send(res, 404, 'NOT_FOUND');
  }
  if (req.method !== 'POST' || headerValue(req, 'x-grh-bootstrap-action') !== 'apply' ||
      headerValue(req, 'content-type')?.toLowerCase() !== 'application/gzip' ||
      headerValue(req, 'content-encoding') !== null) {
    return send(res, 404, 'NOT_FOUND');
  }
  try {
    const compressed = await readCompressedBody(req);
    const suppliedDigest = headerValue(req, 'x-grh-body-sha256');
    if (!/^[0-9a-f]{64}$/.test(suppliedDigest || '') || !constantTimeEqual(digest(compressed), suppliedDigest)) {
      throw new BootstrapError('BOOTSTRAP_BODY_DIGEST_INVALID', 400);
    }
    let envelope;
    try {
      const decoded = gunzipSync(compressed, { maxOutputLength: MAX_UNCOMPRESSED_BYTES });
      envelope = JSON.parse(decoded.toString('utf8'));
    } catch {
      throw new BootstrapError('BOOTSTRAP_BODY_INVALID', 400);
    }
    const inspected = inspectEnvelope(envelope);
    const counts = await applyBootstrap(envelope, inspected);
    return send(res, 201, 'GRH_DIRECTORY_BOOTSTRAP_APPLIED', {
      schemaVersion: DIRECTORY_CONTRACT,
      snapshotAsOf: inspected.artifact.source.snapshot_as_of,
      ...counts,
    });
  } catch (error) {
    if (error instanceof BootstrapError) return send(res, error.status, error.code);
    const internal = error instanceof BootstrapInternalError
      ? error
      : new BootstrapInternalError('configuration', error);
    return send(res, 500, internal.code, internal.pgCode ? { pgCode: internal.pgCode } : {});
  }
}
`;

function literal(value) {
  return JSON.stringify(value);
}

function replaceTemplateToken(source, token, replacement) {
  const first = source.indexOf(token);
  if (first < 0 || source.indexOf(token, first + token.length) >= 0) {
    throw new TypeError('Invalid GRH bootstrap template token');
  }
  // A replacement function is mandatory here: PostgreSQL regexes contain `$'`,
  // which String#replace otherwise interprets as the template suffix.
  return source.replace(token, () => replacement);
}

export function renderGrhDirectoryBootstrapFunction({
  mode,
  operationId,
  migrationSql,
  migrationSha256,
  manifest,
  manifestSha256,
} = {}) {
  if (!['ddl', 'encrypted_snapshot'].includes(mode) ||
      typeof operationId !== 'string' || !/^[0-9a-f-]{36}$/.test(operationId) ||
      typeof migrationSql !== 'string' || !migrationSql.trim() ||
      !/^[0-9a-f]{64}$/.test(migrationSha256 || '') ||
      !manifest || typeof manifest !== 'object' || Array.isArray(manifest) ||
      !/^[0-9a-f]{64}$/.test(manifestSha256 || '')) {
    throw new TypeError('Invalid GRH bootstrap template input');
  }
  const replacements = [
    ['__BOOTSTRAP_INTERNAL_DIAGNOSTIC__', [
      `const BOOTSTRAP_INTERNAL_STAGES = Object.freeze(${literal(BOOTSTRAP_INTERNAL_STAGES)});`,
      bootstrapInternalDiagnostic.toString(),
    ].join('\n')],
    ['__BOOTSTRAP_MODE__', literal(mode)],
    ['__OPERATION_ID__', literal(operationId)],
    ['__MIGRATION_SQL__', literal(migrationSql)],
    ['__MIGRATION_SHA256__', literal(migrationSha256)],
    ['__EXPECTED_MANIFEST__', literal(manifest)],
    ['__EXPECTED_MANIFEST_SHA256__', literal(manifestSha256)],
  ];
  return replacements.reduce(
    (source, [token, replacement]) => replaceTemplateToken(source, token, replacement),
    ENDPOINT_TEMPLATE,
  );
}
