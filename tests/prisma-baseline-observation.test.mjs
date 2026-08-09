import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import observationModule from '../shared/prisma-baseline-observation.cjs';
import {
  WP0_FORBIDDEN_AMBIENT_POSTGRES_ENV,
  WP0_SAFE_PG_OPTIONS,
  formatFailure,
  parseArguments,
  resolveCommit,
  resolveSchemaSha256,
  runCli,
} from '../scripts/inspect-prisma-restored-copy.mjs';

const {
  QUERY_IDS,
  assertObservationSafe,
  canonicalJson,
  executeAllowlistedQuery,
  listAllowlistedQueries,
  runRestoredCopyObservation,
  validateObservationConfig,
  validateOutputPath,
  writeObservationFile,
} = observationModule;

const COMMIT = 'a'.repeat(40);
const SCHEMA_SHA = 'c'.repeat(64);
const MIGRATION_COLUMNS = 'applied_steps_count,checksum,finished_at,id,logs,migration_name,rolled_back_at,started_at';
const MIGRATION_SIGNATURE = [
  'applied_steps_count|integer|not_null=true|identity=|generated=|default=0',
  'checksum|character varying(64)|not_null=true|identity=|generated=|default=<none>',
  'finished_at|timestamp with time zone|not_null=false|identity=|generated=|default=<none>',
  'id|character varying(36)|not_null=true|identity=|generated=|default=<none>',
  'logs|text|not_null=false|identity=|generated=|default=<none>',
  'migration_name|character varying(255)|not_null=true|identity=|generated=|default=<none>',
  'rolled_back_at|timestamp with time zone|not_null=false|identity=|generated=|default=<none>',
  'started_at|timestamp with time zone|not_null=true|identity=|generated=|default=now()',
].join('\n');
const MIGRATION_ID = '123e4567-e89b-42d3-a456-426614174000';
const OBSERVATION_BYTE_LIMIT = 10 * 1024 * 1024;
const REMOTE_URL = 'postgresql://wp0_observer:dummy-test-secret@db.example.invalid/wp0?sslmode=verify-full&schema=public';
const FIXED_NOW = new Date('2026-08-09T12:00:00.000Z');

function canonicalSha256(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function rebuildObservationDigests(observation) {
  const catalog = observation.inventory.catalog;
  const migrations = observation.inventory.prismaMigrations;
  catalog.count = catalog.rows.length;
  catalog.sha256 = canonicalSha256(catalog.rows);
  migrations.count = migrations.rows.length;
  migrations.sha256 = canonicalSha256(migrations.rows);
  observation.inventory.inventoryDigestSha256 = canonicalSha256({
    catalog: { count: catalog.count, sha256: catalog.sha256 },
    prismaMigrations: {
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
    },
  });
  delete observation.observationId;
  observation.observationId = `wp0-observation-${canonicalSha256(observation)}`;
  return observation;
}

async function sandbox(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'municontrol-wp0-test-'));
  const repoRoot = path.join(root, 'checkout');
  const outputRoot = path.join(root, 'evidence');
  await fs.mkdir(repoRoot);
  await fs.mkdir(outputRoot);
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  return {
    root,
    repoRoot,
    outputRoot,
    outputPath: path.join(outputRoot, 'observation.json'),
  };
}

function rawConfig(paths, overrides = {}) {
  return {
    confirmation: 'RESTORED_DISPOSABLE',
    targetId: 'target:wp0-copy-01',
    backupRef: 'backup:snapshot-001',
    restoreRef: 'restore:exercise-001',
    reviewerIds: ['reviewer:security-01', 'reviewer:dba-02'],
    databaseUrl: REMOTE_URL,
    nodeEnv: 'test',
    outputPath: paths.outputPath,
    repoRoot: paths.repoRoot,
    ...overrides,
  };
}

function validRows() {
  return {
    [QUERY_IDS.BEGIN]: [],
    [QUERY_IDS.TRANSACTION_STATE]: [{
      transaction_read_only: 'on',
      transaction_isolation: 'repeatable read',
      row_security: 'off',
      search_path: 'pg_catalog',
    }],
    [QUERY_IDS.CLOCK_STATE]: [{
      database_clock: new Date('2026-08-09T12:00:00.000Z'),
      transaction_started_at: new Date('2026-08-09T11:59:59.000Z'),
    }],
    [QUERY_IDS.TRANSPORT_SECURITY]: [{
      ssl: 'true',
      protocol: 'TLSv1.3',
      cipher: 'TLS_AES_256_GCM_SHA384',
      bits: '256',
    }],
    [QUERY_IDS.DATABASE_IDENTITY]: [{
      database_name: 'wp0_restored_copy',
      server_version_num: '160004',
      wp0_marker: 'municontrol.wp0.v1|target_class=RESTORED_DISPOSABLE|target_id=target:wp0-copy-01',
    }],
    [QUERY_IDS.OBSERVER_SECURITY]: [{
      session_user_name: 'wp0_observer',
      current_user_name: 'wp0_observer',
      role_superuser: 'false',
      role_inherit: 'true',
      role_create_role: 'false',
      role_create_db: 'false',
      role_can_login: 'true',
      role_replication: 'false',
      role_bypass_rls: 'false',
      role_membership_count: '0',
      unsafe_membership_count: '0',
      database_create: 'false',
      database_connect: 'true',
      database_temp: 'false',
      governed_schema_create: 'false',
      governed_schema_usage: 'true',
      governed_relation_write: 'false',
      governed_column_write: 'false',
      governed_sequence_write: 'false',
      governed_routine_execute: 'false',
      business_relation_select: 'false',
      business_column_select: 'false',
      migration_history_select: 'true',
    }],
    [QUERY_IDS.CATALOG_INVENTORY]: [
      {
        object_kind: 'schema',
        schema_name: 'public',
        object_name: 'public',
        parent_name: null,
        definition: 'owner=wp0_owner',
      },
      {
        object_kind: 'relation',
        schema_name: 'public',
        object_name: '_prisma_migrations',
        parent_name: null,
        definition: 'kind=r;owner=wp0_owner;rls=false;force_rls=false',
      },
      {
        object_kind: 'enum_label',
        schema_name: 'public',
        object_name: 'OPEN',
        parent_name: 'CaseStatus',
        definition: 'sort_order=1',
      },
      {
        object_kind: 'column_default',
        schema_name: 'public',
        object_name: 'created_at',
        parent_name: '_prisma_migrations',
        definition: 'now()',
      },
      {
        object_kind: 'view',
        schema_name: 'public',
        object_name: 'case_summary',
        parent_name: null,
        definition: 'kind=v;definition=SELECT 1',
      },
      {
        object_kind: 'routine',
        schema_name: 'public',
        object_name: 'normalize_case(text)',
        parent_name: null,
        definition: 'kind=f;language=sql',
      },
      {
        object_kind: 'extension',
        schema_name: 'public',
        object_name: 'pgcrypto',
        parent_name: null,
        definition: 'version=1.3;relocatable=true',
      },
      {
        object_kind: 'relation_acl',
        schema_name: 'public',
        object_name: '_prisma_migrations',
        parent_name: null,
        definition: 'grantee=wp0_observer;privilege=SELECT',
      },
      {
        object_kind: 'policy',
        schema_name: 'public',
        object_name: 'tenant_scope',
        parent_name: 'cases',
        definition: 'command=r;roles=app',
      },
      {
        object_kind: 'trigger',
        schema_name: 'public',
        object_name: 'cases_audit',
        parent_name: 'cases',
        definition: 'CREATE TRIGGER cases_audit',
      },
      {
        object_kind: 'sequence',
        schema_name: 'public',
        object_name: 'case_seq',
        parent_name: null,
        definition: 'increment=1;cycle=false',
      },
      {
        object_kind: 'partition',
        schema_name: 'public',
        object_name: 'cases_2026',
        parent_name: 'cases',
        definition: 'parent_schema=public;bound=FOR VALUES FROM (2026) TO (2027)',
      },
      {
        object_kind: 'ordinary_inheritance',
        schema_name: 'public',
        object_name: 'legacy_child',
        parent_name: 'legacy_parent',
        definition: 'parent_schema=public;sequence=1',
      },
    ],
    [QUERY_IDS.MIGRATION_LOCATOR]: [{
      named_object_count: '1',
      relation_count: '1',
      relation_kinds: 'r',
      relation_persistence: 'p',
      column_count: '8',
      column_names: MIGRATION_COLUMNS,
      column_signature: MIGRATION_SIGNATURE,
      primary_key_count: '1',
      primary_key_columns: 'id',
      row_level_security: 'false',
      force_row_level_security: 'false',
    }],
    [QUERY_IDS.MIGRATION_HISTORY]: [{
      migration_id: MIGRATION_ID,
      checksum: 'b'.repeat(64),
      migration_name: '20260809000000_wp0_baseline',
      started_at: new Date('2026-08-09T10:00:00.000Z'),
      finished_at: new Date('2026-08-09T10:00:01.000Z'),
      rolled_back_at: null,
      applied_steps_count: '1',
    }],
    [QUERY_IDS.COMMIT]: [],
    [QUERY_IDS.ROLLBACK]: [],
  };
}

function fakeAdapter(overrides = {}) {
  const rows = validRows();
  const calls = [];
  const adapter = {
    calls,
    closed: false,
    async query(query) {
      calls.push(query);
      const override = overrides[query.id];
      if (typeof override === 'function') return override(query);
      if (override instanceof Error) throw override;
      return { rows: override ?? rows[query.id] };
    },
    async close() {
      adapter.closed = true;
    },
  };
  return adapter;
}

async function validated(paths, overrides) {
  return validateObservationConfig(rawConfig(paths, overrides));
}

function capture() {
  let value = '';
  return {
    stream: { write(chunk) { value += String(chunk); } },
    read: () => value,
  };
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, error => {
    assert.equal(error?.code, code);
    return true;
  });
}

test('vertical feliz: transaccion read-only, inventario canonico y output exclusivo', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const adapter = fakeAdapter();
  const observation = await runRestoredCopyObservation({ adapter, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW });

  assert.equal(observation.artifactType, 'wp0_restored_copy_observation');
  assert.equal(observation.contractVersion, 2);
  assert.equal(observation.semantics, 'OBSERVATION_ONLY_NOT_AUTHORIZATION');
  assert.equal(observation.source.schemaSha256, SCHEMA_SHA);
  assert.equal(observation.source.sourceKind, 'IMMUTABLE_GIT_BLOB');
  assert.equal(observation.inventory.prismaMigrations.state, 'valid');
  assert.equal(observation.quality.collectionMode, 'strict');
  assert.equal(observation.quality.approvalEligible, false);
  assert.equal(observation.quality.blockingReasons.includes('WINDOWS_DACL_NOT_ATTESTED'), true);
  assert.equal(observation.limitations.some(value => value.includes('DACL efectiva')), true);
  assert.equal(observation.observer.leastPrivilegeVerified, true);
  assert.equal(observation.target.transport.negotiated, true);
  assert.equal(observation.transaction.clock.absoluteSkewMs, 0);
  assert.equal(observation.evidence.externalReferencesVerified, false);
  assert.equal(Object.isFrozen(observation), true);
  assert.equal(Object.isFrozen(observation.inventory), true);
  assert.equal(Object.isFrozen(observation.inventory.catalog.rows), true);
  assert.equal(Object.isFrozen(observation.inventory.catalog.rows[0]), true);
  for (const row of observation.inventory.catalog.rows) {
    assert.deepEqual(Object.keys(row).sort(), [
      'definitionSha256', 'objectKind', 'objectName', 'parentName', 'schemaName',
    ]);
  }
  assert.match(observation.inventory.inventoryDigestSha256, /^[a-f0-9]{64}$/u);
  assert.equal(adapter.calls[0].id, QUERY_IDS.BEGIN);
  assert.equal(adapter.calls.at(-1).id, QUERY_IDS.COMMIT);
  assert.equal(adapter.calls.some(call => call.id === QUERY_IDS.ROLLBACK), false);

  const written = await writeObservationFile({
    outputPath: paths.outputPath,
    repoRoot: paths.repoRoot,
    observation,
  });
  const serialized = await fs.readFile(paths.outputPath, 'utf8');
  assert.match(written.sha256, /^[a-f0-9]{64}$/u);
  assert.equal(written.outputPath, path.join(await fs.realpath(paths.outputRoot), 'observation.json'));
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(paths.outputPath)).mode & 0o777, 0o600);
  }
  assert.equal(serialized.includes(REMOTE_URL), false);
  assert.equal(serialized.includes('releaseReceipt'), false);
  assert.equal(serialized.includes('baselineManifest'), false);
  await rejectsCode(
    writeObservationFile({ outputPath: paths.outputPath, repoRoot: paths.repoRoot, observation }),
    'OUTPUT_ALREADY_EXISTS',
  );
});

test('sink v2 rechaza artefactos forjados aunque recomputen observationId', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const observation = await runRestoredCopyObservation({
    adapter: fakeAdapter(), config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW,
  });

  for (const mutate of [
    forged => { forged.quality.approvalEligible = true; },
    forged => { forged.evidence.signedProviderReceiptVerified = true; },
  ]) {
    const forged = JSON.parse(JSON.stringify(observation));
    mutate(forged);
    delete forged.observationId;
    forged.observationId = `wp0-observation-${crypto.createHash('sha256').update(canonicalJson(forged)).digest('hex')}`;
    await rejectsCode(
      writeObservationFile({ outputPath: paths.outputPath, repoRoot: paths.repoRoot, observation: forged }),
      'OBSERVATION_SEMANTICS_INVALID',
    );
    await assert.rejects(fs.access(paths.outputPath));
  }

  const arbitrary = JSON.parse(JSON.stringify(observation));
  arbitrary.releaseReceipt = { verified: true };
  assert.throws(() => assertObservationSafe(arbitrary), error => error?.code === 'OBSERVATION_SCHEMA_INVALID');
});

test('canonicalizador rechaza __proto__ en la raiz antes de devolver o crear output', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const observation = await runRestoredCopyObservation({
    adapter: fakeAdapter(), config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW,
  });
  const forged = JSON.parse(JSON.stringify(observation));
  const attackerPrototype = {};
  Object.defineProperty(forged, '__proto__', {
    value: attackerPrototype,
    enumerable: true,
    configurable: true,
    writable: true,
  });

  assert.throws(() => {
    const snapshot = assertObservationSafe(forged);
    Object.getPrototypeOf(snapshot).polluted = true;
  }, error => error?.code === 'OBSERVATION_KEY_FORBIDDEN');
  assert.equal(Object.hasOwn(attackerPrototype, 'polluted'), false);
  await rejectsCode(
    writeObservationFile({ outputPath: paths.outputPath, repoRoot: paths.repoRoot, observation: forged }),
    'OBSERVATION_KEY_FORBIDDEN',
  );
  await assert.rejects(fs.access(paths.outputPath));
});

test('canonicalizador rechaza __proto__ anidado antes de devolver o crear output', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const observation = await runRestoredCopyObservation({
    adapter: fakeAdapter(), config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW,
  });
  const forged = JSON.parse(JSON.stringify(observation));
  const attackerPrototype = {};
  Object.defineProperty(forged.evidence, '__proto__', {
    value: attackerPrototype,
    enumerable: true,
    configurable: true,
    writable: true,
  });

  assert.throws(() => {
    const snapshot = assertObservationSafe(forged);
    Object.getPrototypeOf(snapshot.evidence).polluted = true;
  }, error => error?.code === 'OBSERVATION_KEY_FORBIDDEN');
  assert.equal(Object.hasOwn(attackerPrototype, 'polluted'), false);
  await rejectsCode(
    writeObservationFile({ outputPath: paths.outputPath, repoRoot: paths.repoRoot, observation: forged }),
    'OBSERVATION_KEY_FORBIDDEN',
  );
  await assert.rejects(fs.access(paths.outputPath));
});

test('sink v2 recomputa digests de catalogo, migraciones, inventario e identidad', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const observation = await runRestoredCopyObservation({
    adapter: fakeAdapter(), config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW,
  });
  const mutations = [
    forged => { forged.inventory.catalog.sha256 = 'd'.repeat(64); },
    forged => { forged.inventory.prismaMigrations.sha256 = 'd'.repeat(64); },
    forged => { forged.inventory.inventoryDigestSha256 = 'd'.repeat(64); },
    forged => { forged.observationId = `wp0-observation-${'d'.repeat(64)}`; },
  ];
  for (const mutate of mutations) {
    const forged = JSON.parse(JSON.stringify(observation));
    mutate(forged);
    await rejectsCode(
      writeObservationFile({ outputPath: paths.outputPath, repoRoot: paths.repoRoot, observation: forged }),
      'OBSERVATION_DIGEST_INVALID',
    );
    await assert.rejects(fs.access(paths.outputPath));
  }
});

test('confirmacion ausente o incorrecta falla antes de consultar', async t => {
  const paths = await sandbox(t);
  await rejectsCode(validated(paths, { confirmation: undefined }), 'RESTORED_COPY_CONFIRMATION_REQUIRED');
  await rejectsCode(validated(paths, { confirmation: 'RESTORED_DISPOSABLE ' }), 'RESTORED_COPY_CONFIRMATION_REQUIRED');
});

test('marcador de base productiva se rechaza y ejecuta rollback', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const adapter = fakeAdapter({
    [QUERY_IDS.DATABASE_IDENTITY]: [{
      database_name: 'production',
      server_version_num: '160004',
      wp0_marker: 'municontrol.wp0.v1|target_class=PRODUCTION|target_id=target:wp0-copy-01',
    }],
  });
  await rejectsCode(
    runRestoredCopyObservation({ adapter, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW }),
    'TARGET_NOT_RESTORED_DISPOSABLE',
  );
  assert.deepEqual(adapter.calls.map(call => call.id), [
    QUERY_IDS.BEGIN,
    QUERY_IDS.TRANSACTION_STATE,
    QUERY_IDS.DATABASE_IDENTITY,
    QUERY_IDS.ROLLBACK,
  ]);
});

test('target CLI no puede etiquetar una copia con otro target persistente', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const adapter = fakeAdapter({
    [QUERY_IDS.DATABASE_IDENTITY]: [{
      database_name: 'wp0_restored_copy',
      server_version_num: '160004',
      wp0_marker: 'municontrol.wp0.v1|target_class=RESTORED_DISPOSABLE|target_id=target:different-copy',
    }],
  });
  await rejectsCode(
    runRestoredCopyObservation({ adapter, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW }),
    'TARGET_ID_MISMATCH',
  );
  assert.deepEqual(adapter.calls.map(call => call.id), [
    QUERY_IDS.BEGIN,
    QUERY_IDS.TRANSACTION_STATE,
    QUERY_IDS.DATABASE_IDENTITY,
    QUERY_IDS.ROLLBACK,
  ]);
});

test('PostgreSQL anterior a 12 se rechaza antes de observer y catalogo', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const adapter = fakeAdapter({
    [QUERY_IDS.DATABASE_IDENTITY]: [{
      ...validRows()[QUERY_IDS.DATABASE_IDENTITY][0],
      server_version_num: '110022',
    }],
  });
  await rejectsCode(
    runRestoredCopyObservation({ adapter, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW }),
    'POSTGRES_VERSION_UNSUPPORTED',
  );
  assert.deepEqual(adapter.calls.map(call => call.id), [
    QUERY_IDS.BEGIN,
    QUERY_IDS.TRANSACTION_STATE,
    QUERY_IDS.DATABASE_IDENTITY,
    QUERY_IDS.ROLLBACK,
  ]);
});

test('comentario WP0 ausente, extendido, versionado o no canonico falla cerrado antes de reloj y catalogo', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const identity = validRows()[QUERY_IDS.DATABASE_IDENTITY][0];
  for (const wp0Marker of [
    null,
    'municontrol.wp0.v1|target_class=RESTORED_DISPOSABLE|target_id=target:wp0-copy-01|extra=true',
    'municontrol.wp0.v2|target_class=RESTORED_DISPOSABLE|target_id=target:wp0-copy-01',
    'municontrol.wp0.v1|target_class=restored_disposable|target_id=target:wp0-copy-01',
    ' municontrol.wp0.v1|target_class=RESTORED_DISPOSABLE|target_id=target:wp0-copy-01',
    'municontrol.wp0.v1|target_class=RESTORED_DISPOSABLE|target_id=target:wp0-copy-01 ',
    'municontrol.wp0.v1|target_class=RESTORED_DISPOSABLE|target_id=target:wp0-copy-01\n',
    'municontrol.wp0.v1|target_id=target:wp0-copy-01|target_class=RESTORED_DISPOSABLE',
    'RESTORED_DISPOSABLE:target:wp0-copy-01',
  ]) {
    const adapter = fakeAdapter({
      [QUERY_IDS.DATABASE_IDENTITY]: [{ ...identity, wp0_marker: wp0Marker }],
    });
    await rejectsCode(
      runRestoredCopyObservation({ adapter, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW }),
      'TARGET_DATABASE_MARKER_INVALID',
    );
    assert.deepEqual(adapter.calls.map(call => call.id), [
      QUERY_IDS.BEGIN,
      QUERY_IDS.TRANSACTION_STATE,
      QUERY_IDS.DATABASE_IDENTITY,
      QUERY_IDS.ROLLBACK,
    ]);
  }
});

test('identidad WP0 exige cardinalidad exacta y revierte antes de reloj y catalogo', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const identity = validRows()[QUERY_IDS.DATABASE_IDENTITY][0];
  for (const rows of [[], [identity, { ...identity }]]) {
    const adapter = fakeAdapter({ [QUERY_IDS.DATABASE_IDENTITY]: rows });
    await rejectsCode(
      runRestoredCopyObservation({ adapter, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW }),
      'QUERY_CARDINALITY_INVALID',
    );
    assert.deepEqual(adapter.calls.map(call => call.id), [
      QUERY_IDS.BEGIN,
      QUERY_IDS.TRANSACTION_STATE,
      QUERY_IDS.DATABASE_IDENTITY,
      QUERY_IDS.ROLLBACK,
    ]);
  }
});

test('output dentro del repo o a traves de symlink/junction se rechaza', async t => {
  const paths = await sandbox(t);
  const validatedOutside = await validateOutputPath(paths.outputPath, paths.repoRoot);
  const parentStat = await fs.stat(paths.outputRoot);
  assert.deepEqual(validatedOutside.parentIdentity, { dev: parentStat.dev, ino: parentStat.ino });
  const inside = path.join(paths.repoRoot, 'observation.json');
  await rejectsCode(validateOutputPath(inside, paths.repoRoot), 'OUTPUT_INSIDE_REPOSITORY');

  const link = path.join(paths.root, 'evidence-link');
  try {
    await fs.symlink(paths.outputRoot, link, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      t.skip(`El host no permite crear symlink/junction de prueba: ${error.code}`);
      return;
    }
    throw error;
  }
  await rejectsCode(
    validateOutputPath(path.join(link, 'linked.json'), paths.repoRoot),
    'OUTPUT_SYMLINK_FORBIDDEN',
  );
});

test('TLS debil remoto falla; loopback sin TLS solo existe en development', async t => {
  const paths = await sandbox(t);
  await rejectsCode(
    validated(paths, { databaseUrl: 'postgresql://wp0:dummy-test-secret@db.example.invalid/wp0?sslmode=require' }),
    'DATABASE_TLS_VERIFY_FULL_REQUIRED',
  );
  await rejectsCode(
    validated(paths, { databaseUrl: 'postgresql://wp0:dummy-test-secret@127.0.0.1/wp0?sslmode=disable', nodeEnv: 'test' }),
    'DATABASE_TLS_VERIFY_FULL_REQUIRED',
  );
  const local = await validated(paths, {
    databaseUrl: 'postgresql://wp0:dummy-test-secret@127.0.0.1/wp0?sslmode=disable',
    nodeEnv: 'development',
  });
  assert.equal(local.developmentLoopback, true);
  assert.equal(local.tlsVerified, false);
});

test('opciones de sesion en URL no pueden falsificar el marcador de restore', async t => {
  const paths = await sandbox(t);
  await rejectsCode(
    validated(paths, {
      databaseUrl: 'postgresql://wp0:dummy-test-secret@db.example.invalid/wp0?sslmode=verify-full&options=-c%20municontrol.wp0_target_class%3DRESTORED_DISPOSABLE',
    }),
    'DATABASE_URL_OVERRIDE_FORBIDDEN',
  );
});

test('WP0-L exige credencial en la URL y no delega autenticacion a pgpass o PGPASSWORD', async t => {
  const paths = await sandbox(t);
  await rejectsCode(
    validated(paths, { databaseUrl: 'postgresql://wp0_observer@db.example.invalid/wp0?sslmode=verify-full&schema=public' }),
    'DATABASE_CREDENTIAL_REQUIRED',
  );
});

test('WP0-L rechaza cualquier parametro de conexion fuera de sslmode y schema', async t => {
  const paths = await sandbox(t);
  for (const parameter of [
    'application_name=forged',
    'statement_timeout=0',
    'query_timeout=0',
    'replication=database',
    'client_encoding=SQL_ASCII',
  ]) {
    await rejectsCode(
      validated(paths, { databaseUrl: `${REMOTE_URL}&${parameter}` }),
      'DATABASE_PARAMETER_FORBIDDEN',
    );
  }
  await rejectsCode(
    validated(paths, { databaseUrl: `${REMOTE_URL}&schema=other` }),
    'PRISMA_SCHEMA_INVALID',
  );
});

test('transaccion no read-only falla cerrada con rollback', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const adapter = fakeAdapter({
    [QUERY_IDS.TRANSACTION_STATE]: [{
      transaction_read_only: 'off',
      transaction_isolation: 'repeatable read',
      row_security: 'off',
      search_path: 'pg_catalog',
    }],
  });
  await rejectsCode(
    runRestoredCopyObservation({ adapter, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW }),
    'TRANSACTION_NOT_READ_ONLY',
  );
  assert.deepEqual(adapter.calls.map(call => call.id), [
    QUERY_IDS.BEGIN,
    QUERY_IDS.TRANSACTION_STATE,
    QUERY_IDS.ROLLBACK,
  ]);
});

test('search_path o row_security heredados fallan cerrados antes del inventario', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  for (const drift of [
    { search_path: 'evil, pg_catalog' },
    { row_security: 'on' },
  ]) {
    const adapter = fakeAdapter({
      [QUERY_IDS.TRANSACTION_STATE]: [{
        transaction_read_only: 'on',
        transaction_isolation: 'repeatable read',
        row_security: 'off',
        search_path: 'pg_catalog',
        ...drift,
      }],
    });
    await rejectsCode(
      runRestoredCopyObservation({ adapter, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW }),
      'SESSION_SECURITY_CONTEXT_INVALID',
    );
    assert.deepEqual(adapter.calls.map(call => call.id), [
      QUERY_IDS.BEGIN,
      QUERY_IDS.TRANSACTION_STATE,
      QUERY_IDS.ROLLBACK,
    ]);
  }
});

test('rol observador privilegiado, TLS no negociado o reloj fuera de tolerancia fallan cerrados', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);

  for (const field of [
    'role_superuser', 'role_bypass_rls', 'database_temp', 'governed_relation_write',
    'governed_column_write', 'business_relation_select', 'business_column_select',
  ]) {
    const role = { ...validRows()[QUERY_IDS.OBSERVER_SECURITY][0], [field]: 'true' };
    const adapter = fakeAdapter({ [QUERY_IDS.OBSERVER_SECURITY]: [role] });
    await rejectsCode(
      runRestoredCopyObservation({ adapter, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW }),
      'OBSERVER_ROLE_NOT_LEAST_PRIVILEGE',
    );
    assert.equal(adapter.calls.at(-1).id, QUERY_IDS.ROLLBACK);
  }

  const noInheritPredefinedMembership = {
    ...validRows()[QUERY_IDS.OBSERVER_SECURITY][0],
    role_inherit: 'false',
    role_membership_count: '1',
    // pg_read_all_data (or any pg_* role) is still reachable through SET ROLE.
    unsafe_membership_count: '0',
  };
  const memberAdapter = fakeAdapter({
    [QUERY_IDS.OBSERVER_SECURITY]: [noInheritPredefinedMembership],
  });
  await rejectsCode(
    runRestoredCopyObservation({ adapter: memberAdapter, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW }),
    'OBSERVER_ROLE_NOT_LEAST_PRIVILEGE',
  );
  assert.equal(memberAdapter.calls.at(-1).id, QUERY_IDS.ROLLBACK);

  const noTls = fakeAdapter({
    [QUERY_IDS.TRANSPORT_SECURITY]: [{ ssl: 'false', protocol: null, cipher: null, bits: null }],
  });
  await rejectsCode(
    runRestoredCopyObservation({ adapter: noTls, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW }),
    'TLS_NOT_NEGOTIATED',
  );
  assert.equal(noTls.calls.at(-1).id, QUERY_IDS.ROLLBACK);

  const staleClock = fakeAdapter({
    [QUERY_IDS.CLOCK_STATE]: [{
      database_clock: new Date('2026-08-09T11:54:59.999Z'),
      transaction_started_at: new Date('2026-08-09T11:54:59.000Z'),
    }],
  });
  await rejectsCode(
    runRestoredCopyObservation({ adapter: staleClock, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW }),
    'DATABASE_CLOCK_SKEW_EXCEEDED',
  );
  assert.equal(staleClock.calls.at(-1).id, QUERY_IDS.ROLLBACK);
});

test('schema hash y SELECT exclusivo de _prisma_migrations son obligatorios', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const untouched = fakeAdapter();
  await rejectsCode(
    runRestoredCopyObservation({ adapter: untouched, config, commit: COMMIT, schemaSha256: 'bad', now: FIXED_NOW }),
    'SCHEMA_SHA256_INVALID',
  );
  assert.equal(untouched.calls.length, 0);

  const role = {
    ...validRows()[QUERY_IDS.OBSERVER_SECURITY][0],
    migration_history_select: 'false',
  };
  const missingSelect = fakeAdapter({ [QUERY_IDS.OBSERVER_SECURITY]: [role] });
  await rejectsCode(
    runRestoredCopyObservation({ adapter: missingSelect, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW }),
    'OBSERVER_MIGRATION_SELECT_REQUIRED',
  );
  assert.equal(missingSelect.calls.some(call => call.id === QUERY_IDS.MIGRATION_HISTORY), false);
  assert.equal(missingSelect.calls.at(-1).id, QUERY_IDS.ROLLBACK);
});

test('una query fuera de allowlist nunca llega al adapter', async () => {
  const adapter = fakeAdapter();
  await rejectsCode(executeAllowlistedQuery(adapter, 'business.rows'), 'QUERY_NOT_ALLOWLISTED');
  assert.equal(adapter.calls.length, 0);
});

test('allowlist no contiene DDL/DML ni lecturas de tablas de negocio', () => {
  const queries = listAllowlistedQueries('public');
  assert.deepEqual(queries.map(query => query.id).sort(), Object.values(QUERY_IDS).sort());
  for (const query of queries) {
    const sqlWithoutStringLiterals = query.text.replace(/'(?:''|[^'])*'/gu, "''");
    assert.doesNotMatch(sqlWithoutStringLiterals, /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COPY|VACUUM)\b/iu);
    assert.doesNotMatch(query.text, /\b(?:users|tenants|citizens|applications|business_rows)\b/iu);
    if (/\bFROM\b/iu.test(query.text)) {
      assert.match(query.text, /pg_catalog|_prisma_migrations|governed_namespaces|inventory/iu);
    }
  }

  const transactionState = queries.find(query => query.id === QUERY_IDS.TRANSACTION_STATE)?.text || '';
  assert.match(transactionState, /pg_catalog\.current_setting\('search_path'\) AS search_path/u);
  assert.match(transactionState, /pg_catalog\.current_setting\('row_security'\) AS row_security/u);
  assert.equal(
    (transactionState.match(/current_setting/gu) || []).length,
    (transactionState.match(/pg_catalog\.current_setting/gu) || []).length,
  );

  const databaseIdentity = queries.find(query => query.id === QUERY_IDS.DATABASE_IDENTITY)?.text || '';
  assert.match(databaseIdentity, /FROM pg_catalog\.pg_database AS database/u);
  assert.match(
    databaseIdentity,
    /pg_catalog\.shobj_description\(database\.oid, 'pg_database'\)::text AS wp0_marker/u,
  );
  assert.doesNotMatch(databaseIdentity, /pg_catalog\.pg_db_role_setting/iu);
  assert.doesNotMatch(databaseIdentity, /\bJOIN\b/iu);
  assert.doesNotMatch(databaseIdentity, /current_setting\(\s*'municontrol\./iu);
  assert.doesNotMatch(
    databaseIdentity,
    /\b(?:users|tenants|ciudadanos|empleados|obras|licitaciones|pagos|presupuestos|reclamos|grh_artifacts)\b/iu,
  );
  assert.equal(
    (databaseIdentity.match(/current_database/gu) || []).length,
    (databaseIdentity.match(/pg_catalog\.current_database/gu) || []).length,
  );
  assert.equal(
    (databaseIdentity.match(/current_setting/gu) || []).length,
    (databaseIdentity.match(/pg_catalog\.current_setting/gu) || []).length,
  );

  const catalog = queries.find(query => query.id === QUERY_IDS.CATALOG_INVENTORY)?.text || '';
  assert.match(catalog, /inventory AS MATERIALIZED/u);
  for (const objectKind of [
    'column_default', 'type', 'enum_label', 'domain_constraint', 'view', 'routine', 'extension',
    'schema_acl', 'relation_acl', 'column_acl', 'type_acl', 'routine_acl', 'default_acl', 'policy', 'trigger',
    'sequence', 'partitioned_table', 'partition', 'ordinary_inheritance',
  ]) {
    assert.match(catalog, new RegExp(`'${objectKind}'`, 'u'), objectKind);
  }
  assert.match(catalog, /pg_catalog\.pg_get_functiondef/u);
  assert.match(catalog, /pg_catalog\.pg_get_viewdef/u);
  assert.match(catalog, /pg_catalog\.aclexplode/u);
  assert.match(catalog, /pg_catalog\.pg_policy/u);
  assert.match(catalog, /WHERE child\.relispartition/u);
  assert.match(catalog, /WHERE NOT child\.relispartition/u);
  assert.match(catalog, /inventory_stats/u);
  assert.match(catalog, /catalog_budget/u);
  assert.match(catalog, /pg_catalog\.octet_length\(definition\)/u);
  assert.match(catalog, /max_definition_bytes > 262144/u);
  assert.match(catalog, /total_bytes > 4194304/u);
  assert.match(catalog, /__wp0_catalog_limit__/u);
  assert.match(catalog, /server_side_budget_rejected/u);
  assert.match(catalog, /FROM bounded_inventory/u);
  assert.match(catalog, /LIMIT 20001/u);
  assert.doesNotMatch(catalog, /ORDER BY object_kind/u);

  const migrationLocator = queries.find(query => query.id === QUERY_IDS.MIGRATION_LOCATOR)?.text || '';
  assert.match(migrationLocator, /pg_catalog\.format_type/u);
  assert.match(migrationLocator, /pg_catalog\.pg_attrdef/u);
  assert.match(migrationLocator, /AS column_signature/u);
  assert.match(migrationLocator, /AS primary_key_count/u);
  assert.match(migrationLocator, /AS primary_key_columns/u);

  const migrationHistory = queries.find(query => query.id === QUERY_IDS.MIGRATION_HISTORY)?.text || '';
  assert.doesNotMatch(migrationHistory, /pg_catalog\.to_jsonb/u);
  assert.match(migrationHistory, /source\.id::text AS migration_id/u);
  assert.match(migrationHistory, /source\.started_at AS started_at/u);
  assert.match(migrationHistory, /LIMIT 10001/u);
});

test('definitions de catalogo se persisten solo como SHA-256 incluso con credencial generica', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const contaminated = validRows()[QUERY_IDS.CATALOG_INVENTORY].map(row => ({ ...row }));
  const credentialLiteral = 'api_key=plain-provider-credential-123456789';
  contaminated[0].definition = credentialLiteral;
  const adapter = fakeAdapter({ [QUERY_IDS.CATALOG_INVENTORY]: contaminated });
  const observation = await runRestoredCopyObservation({
    adapter, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW,
  });
  const schemaRow = observation.inventory.catalog.rows.find(row => row.objectKind === 'schema');
  assert.equal(schemaRow.definitionSha256, crypto.createHash('sha256').update(credentialLiteral).digest('hex'));
  assert.equal(Object.hasOwn(schemaRow, 'definition'), false);
  assert.equal(JSON.stringify(observation).includes(credentialLiteral), false);
  assert.equal(adapter.calls.at(-1).id, QUERY_IDS.COMMIT);

  await writeObservationFile({ outputPath: paths.outputPath, repoRoot: paths.repoRoot, observation });
  const serialized = await fs.readFile(paths.outputPath, 'utf8');
  assert.equal(serialized.includes(credentialLiteral), false);
  assert.equal(serialized.includes('api_key='), false);
});

test('validator reaplica caps sobre el snapshot canonico frente a un Proxy dinamico', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const observation = await runRestoredCopyObservation({
    adapter: fakeAdapter(), config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW,
  });
  const forged = JSON.parse(JSON.stringify(observation));
  const originalRow = forged.inventory.catalog.rows[0];
  let objectNameDescriptors = 0;
  forged.inventory.catalog.rows[0] = new Proxy(originalRow, {
    getOwnPropertyDescriptor(target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
      if (property !== 'objectName' || !descriptor) return descriptor;
      objectNameDescriptors += 1;
      return {
        ...descriptor,
        value: objectNameDescriptors === 1 ? 'safe_name' : 'x'.repeat(2048),
      };
    },
  });
  assert.throws(
    () => assertObservationSafe(forged),
    error => error?.code === 'CATALOG_FIELD_LIMIT_EXCEEDED',
  );
  assert.equal(objectNameDescriptors > 1, true);
});

test('validator limita el tamaño total del artefacto antes de aceptarlo', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const observation = await runRestoredCopyObservation({
    adapter: fakeAdapter(), config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW,
  });
  const forged = JSON.parse(JSON.stringify(observation));
  forged.unknownOversizedField = 'x'.repeat(11 * 1024 * 1024);
  assert.throws(
    () => assertObservationSafe(forged),
    error => error?.code === 'OBSERVATION_SIZE_LIMIT_EXCEEDED',
  );
});

test('write rechaza el JSON pretty final sobre 10 MiB antes de crear archivo', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const observation = await runRestoredCopyObservation({
    adapter: fakeAdapter(), config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW,
  });
  const boundary = JSON.parse(JSON.stringify(observation));
  boundary.inventory.catalog.rows = Array.from({ length: 20_000 }, (_, index) => ({
    definitionSha256: 'd'.repeat(64),
    objectKind: 'schema',
    objectName: `object_${String(index).padStart(5, '0')}_${'x'.repeat(50)}`,
    parentName: null,
    schemaName: 's'.repeat(63),
  }));
  const baseMigration = boundary.inventory.prismaMigrations.rows[0];
  boundary.inventory.prismaMigrations.rows = Array.from({ length: 6000 }, (_, index) => ({
    ...baseMigration,
    migration_id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
    migration_name: `20260809000000_m${String(index).padStart(4, '0')}_${'x'.repeat(279)}`,
  }));
  rebuildObservationDigests(boundary);

  const compactBytes = Buffer.byteLength(JSON.stringify(boundary), 'utf8');
  const finalBytes = Buffer.byteLength(`${JSON.stringify(boundary, null, 2)}\n`, 'utf8');
  assert.equal(compactBytes <= OBSERVATION_BYTE_LIMIT, true);
  assert.equal(finalBytes > OBSERVATION_BYTE_LIMIT, true);
  await rejectsCode(
    writeObservationFile({ outputPath: paths.outputPath, repoRoot: paths.repoRoot, observation: boundary }),
    'OBSERVATION_SIZE_LIMIT_EXCEEDED',
  );
  await assert.rejects(fs.access(paths.outputPath));
});

test('catalogo de 50k filas falla antes de ordenar o persistir', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const base = validRows()[QUERY_IDS.CATALOG_INVENTORY][0];
  const oversized = Array.from({ length: 50_000 }, (_, index) => ({
    ...base,
    object_name: `schema_${index}`,
  }));
  const adapter = fakeAdapter({ [QUERY_IDS.CATALOG_INVENTORY]: oversized });
  await rejectsCode(
    runRestoredCopyObservation({ adapter, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW }),
    'CATALOG_ROW_LIMIT_EXCEEDED',
  );
  assert.equal(adapter.calls.at(-1).id, QUERY_IDS.ROLLBACK);
  await assert.rejects(fs.access(paths.outputPath));
});

test('sentinel server-side de catalogo falla cerrado sin transportar definitions', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  for (const code of [
    'CATALOG_ROW_LIMIT_EXCEEDED',
    'CATALOG_FIELD_LIMIT_EXCEEDED',
    'CATALOG_TOTAL_LIMIT_EXCEEDED',
  ]) {
    const adapter = fakeAdapter({
      [QUERY_IDS.CATALOG_INVENTORY]: [{
        object_kind: '__wp0_catalog_limit__',
        schema_name: 'wp0',
        object_name: code,
        parent_name: null,
        definition: 'server_side_budget_rejected',
      }],
    });
    await rejectsCode(
      runRestoredCopyObservation({ adapter, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW }),
      code,
    );
    assert.equal(adapter.calls.at(-1).id, QUERY_IDS.ROLLBACK);
  }
});

test('historia Prisma aplica caps de filas, campo y bytes antes de ordenar', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const base = validRows()[QUERY_IDS.MIGRATION_HISTORY][0];

  const tooManyRows = fakeAdapter({
    [QUERY_IDS.MIGRATION_HISTORY]: Array.from({ length: 20_000 }, () => base),
  });
  await rejectsCode(
    runRestoredCopyObservation({ adapter: tooManyRows, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW }),
    'MIGRATION_ROW_LIMIT_EXCEEDED',
  );
  assert.equal(tooManyRows.calls.at(-1).id, QUERY_IDS.ROLLBACK);

  const oversizedField = fakeAdapter({
    [QUERY_IDS.MIGRATION_HISTORY]: [{ ...base, migration_name: 'x'.repeat(1025) }],
  });
  await rejectsCode(
    runRestoredCopyObservation({ adapter: oversizedField, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW }),
    'MIGRATION_FIELD_LIMIT_EXCEEDED',
  );
  assert.equal(oversizedField.calls.at(-1).id, QUERY_IDS.ROLLBACK);

  const wideRow = {
    ...base,
    migration_name: `20260809000000_${'x'.repeat(900)}`,
  };
  const oversizedTotal = fakeAdapter({
    [QUERY_IDS.MIGRATION_HISTORY]: Array.from({ length: 5000 }, () => wideRow),
  });
  await rejectsCode(
    runRestoredCopyObservation({ adapter: oversizedTotal, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW }),
    'MIGRATION_TOTAL_LIMIT_EXCEEDED',
  );
  assert.equal(oversizedTotal.calls.at(-1).id, QUERY_IDS.ROLLBACK);
});

test('sink limita migration history aun si recibe un artefacto directo', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const observation = await runRestoredCopyObservation({
    adapter: fakeAdapter(), config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW,
  });
  const forged = JSON.parse(JSON.stringify(observation));
  const base = forged.inventory.prismaMigrations.rows[0];
  forged.inventory.prismaMigrations.rows = Array.from({ length: 20_000 }, () => base);
  forged.inventory.prismaMigrations.count = 20_000;
  assert.throws(
    () => assertObservationSafe(forged),
    error => error?.code === 'MIGRATION_ROW_LIMIT_EXCEEDED',
  );
});

test('timestamps PostgreSQL con offset se canonicalizan a ISO Z sin degradar valid', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const row = {
    ...validRows()[QUERY_IDS.MIGRATION_HISTORY][0],
    started_at: '2026-08-09 10:00:00+00:00',
    finished_at: '2026-08-09 10:00:01+00:00',
  };
  const observation = await runRestoredCopyObservation({
    adapter: fakeAdapter({ [QUERY_IDS.MIGRATION_HISTORY]: [row] }),
    config,
    commit: COMMIT,
    schemaSha256: SCHEMA_SHA,
    now: FIXED_NOW,
  });
  assert.equal(observation.inventory.prismaMigrations.state, 'valid');
  assert.equal(observation.quality.collectionMode, 'strict');
  assert.equal(observation.inventory.prismaMigrations.rows[0].started_at, '2026-08-09T10:00:00.000Z');
  assert.equal(observation.inventory.prismaMigrations.rows[0].finished_at, '2026-08-09T10:00:01.000Z');
});

test('historia absent, empty e inconsistent queda persistible pero nunca aprobable', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const absent = fakeAdapter({
    [QUERY_IDS.OBSERVER_SECURITY]: [{
      ...validRows()[QUERY_IDS.OBSERVER_SECURITY][0],
      migration_history_select: 'false',
    }],
    [QUERY_IDS.MIGRATION_LOCATOR]: [{
      named_object_count: '0',
      relation_count: '0',
      relation_kinds: '',
      relation_persistence: '',
      column_count: '0',
      column_names: '',
      column_signature: '',
      primary_key_count: '0',
      primary_key_columns: '',
      row_level_security: 'false',
      force_row_level_security: 'false',
    }],
  });
  const absentObservation = await runRestoredCopyObservation({
    adapter: absent, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW,
  });
  assert.equal(absentObservation.inventory.prismaMigrations.state, 'absent');
  assert.equal(absentObservation.quality.collectionMode, 'discovery_non_approvable');
  assert.equal(absentObservation.quality.approvalEligible, false);
  assert.deepEqual(absentObservation.inventory.prismaMigrations.issues, ['MIGRATION_HISTORY_ABSENT']);
  assert.equal(absent.calls.some(call => call.id === QUERY_IDS.MIGRATION_HISTORY), false);
  assert.equal(absent.calls.at(-1).id, QUERY_IDS.COMMIT);

  const wrongShape = fakeAdapter({
    [QUERY_IDS.OBSERVER_SECURITY]: [{
      ...validRows()[QUERY_IDS.OBSERVER_SECURITY][0],
      migration_history_select: 'false',
    }],
    [QUERY_IDS.MIGRATION_LOCATOR]: [{
      named_object_count: '1',
      relation_count: '0',
      relation_kinds: 'v',
      relation_persistence: 'p',
      column_count: '0',
      column_names: '',
      column_signature: '',
      primary_key_count: '0',
      primary_key_columns: '',
      row_level_security: 'false',
      force_row_level_security: 'false',
    }],
  });
  const wrongShapeObservation = await runRestoredCopyObservation({
    adapter: wrongShape, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW,
  });
  assert.equal(wrongShapeObservation.inventory.prismaMigrations.state, 'inconsistent');
  assert.deepEqual(
    wrongShapeObservation.inventory.prismaMigrations.issues,
    ['MIGRATION_RELATION_SHAPE_INCONSISTENT'],
  );
  assert.equal(wrongShape.calls.some(call => call.id === QUERY_IDS.MIGRATION_HISTORY), false);

  const empty = fakeAdapter({ [QUERY_IDS.MIGRATION_HISTORY]: [] });
  const emptyObservation = await runRestoredCopyObservation({
    adapter: empty, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW,
  });
  assert.equal(emptyObservation.inventory.prismaMigrations.state, 'empty');
  assert.deepEqual(emptyObservation.inventory.prismaMigrations.issues, ['MIGRATION_HISTORY_EMPTY']);
  assert.equal(empty.calls.at(-1).id, QUERY_IDS.COMMIT);

  const badRow = { ...validRows()[QUERY_IDS.MIGRATION_HISTORY][0], applied_steps_count: '0' };
  const inconsistent = fakeAdapter({ [QUERY_IDS.MIGRATION_HISTORY]: [badRow] });
  const inconsistentObservation = await runRestoredCopyObservation({
    adapter: inconsistent, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW,
  });
  assert.equal(inconsistentObservation.inventory.prismaMigrations.state, 'inconsistent');
  assert.equal(inconsistentObservation.inventory.prismaMigrations.issues.includes('MIGRATION_ROW_INCOMPLETE_OR_INVALID'), true);
  assert.equal(inconsistentObservation.quality.approvalEligible, false);
  assert.equal(inconsistent.calls.at(-1).id, QUERY_IDS.COMMIT);
});

test('firma fisica Prisma incorrecta degrada a inconsistent sin leer la tabla', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const locator = validRows()[QUERY_IDS.MIGRATION_LOCATOR][0];
  for (const override of [
    { column_signature: MIGRATION_SIGNATURE.replace('checksum|character varying(64)', 'checksum|text') },
    { column_signature: MIGRATION_SIGNATURE.replace('default=now()', 'default=<none>') },
    { primary_key_count: '0', primary_key_columns: '' },
  ]) {
    const adapter = fakeAdapter({
      [QUERY_IDS.MIGRATION_LOCATOR]: [{ ...locator, ...override }],
    });
    const observation = await runRestoredCopyObservation({
      adapter, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW,
    });
    assert.equal(observation.inventory.prismaMigrations.state, 'inconsistent');
    assert.deepEqual(observation.inventory.prismaMigrations.issues, ['MIGRATION_RELATION_SHAPE_INCONSISTENT']);
    assert.equal(observation.quality.approvalEligible, false);
    assert.equal(adapter.calls.some(call => call.id === QUERY_IDS.MIGRATION_HISTORY), false);
    assert.equal(adapter.calls.at(-1).id, QUERY_IDS.COMMIT);
  }
});

test('IDs Prisma no UUID o duplicados son inconsistent y nunca strict', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const validRow = validRows()[QUERY_IDS.MIGRATION_HISTORY][0];
  const invalidIdAdapter = fakeAdapter({
    [QUERY_IDS.MIGRATION_HISTORY]: [{ ...validRow, migration_id: 'migration-001' }],
  });
  const invalidId = await runRestoredCopyObservation({
    adapter: invalidIdAdapter, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW,
  });
  assert.equal(invalidId.inventory.prismaMigrations.state, 'inconsistent');
  assert.equal(invalidId.inventory.prismaMigrations.issues.includes('MIGRATION_ROW_INCOMPLETE_OR_INVALID'), true);
  assert.equal(invalidId.quality.collectionMode, 'discovery_non_approvable');

  const duplicateIdAdapter = fakeAdapter({
    [QUERY_IDS.MIGRATION_HISTORY]: [
      validRow,
      {
        ...validRow,
        migration_name: '20260809000001_wp0_followup',
        started_at: new Date('2026-08-09T10:01:00.000Z'),
        finished_at: new Date('2026-08-09T10:01:01.000Z'),
      },
    ],
  });
  const duplicateId = await runRestoredCopyObservation({
    adapter: duplicateIdAdapter, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW,
  });
  assert.equal(duplicateId.inventory.prismaMigrations.state, 'inconsistent');
  assert.equal(duplicateId.inventory.prismaMigrations.issues.includes('MIGRATION_ID_DUPLICATED'), true);
  assert.equal(duplicateId.quality.approvalEligible, false);
});

test('RLS en _prisma_migrations nunca puede ocultar historia al observador', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  for (const field of ['row_level_security', 'force_row_level_security']) {
    const locator = {
      named_object_count: '1',
      relation_count: '1',
      relation_kinds: 'r',
      relation_persistence: 'p',
      column_count: '8',
      column_names: MIGRATION_COLUMNS,
      column_signature: MIGRATION_SIGNATURE,
      primary_key_count: '1',
      primary_key_columns: 'id',
      row_level_security: 'false',
      force_row_level_security: 'false',
      [field]: 'true',
    };
    const adapter = fakeAdapter({ [QUERY_IDS.MIGRATION_LOCATOR]: [locator] });
    await rejectsCode(
      runRestoredCopyObservation({ adapter, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW }),
      'MIGRATION_HISTORY_RLS_FORBIDDEN',
    );
    assert.equal(adapter.calls.at(-1).id, QUERY_IDS.ROLLBACK);
  }
});

test('refs externas y exactamente dos revisores independientes son obligatorios', async t => {
  const paths = await sandbox(t);
  await rejectsCode(validated(paths, { targetId: 'target:sk-abcdefghijklmnop' }), 'TARGET_ID_INVALID');
  await rejectsCode(validated(paths, { backupRef: 'snapshot-001' }), 'BACKUP_REF_INVALID');
  await rejectsCode(validated(paths, { restoreRef: 'restore:x' }), 'RESTORE_REF_INVALID');
  await rejectsCode(validated(paths, { reviewerIds: ['reviewer:one'] }), 'REVIEWERS_INVALID');
  await rejectsCode(
    validated(paths, { reviewerIds: ['reviewer:same', 'reviewer:SAME'] }),
    'REVIEWERS_INVALID',
  );
});

test('error de query intenta rollback y oculta causa sensible', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const adapter = fakeAdapter({
    [QUERY_IDS.CATALOG_INVENTORY]: new Error('postgresql://admin:secret@production.invalid/db'),
  });
  await rejectsCode(
    runRestoredCopyObservation({ adapter, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW }),
    'OBSERVATION_QUERY_FAILED',
  );
  assert.equal(adapter.calls.at(-1).id, QUERY_IDS.ROLLBACK);
  const rendered = formatFailure(new Error('postgresql://admin:secret@production.invalid/db'));
  assert.equal(rendered.includes('postgresql://'), false);
  assert.equal(rendered.includes('secret'), false);
});

test('fallo de rollback queda explicitamente bloqueado sin exponer la causa', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const adapter = fakeAdapter({
    [QUERY_IDS.TRANSACTION_STATE]: new Error('query failed'),
    [QUERY_IDS.ROLLBACK]: new Error('rollback failed'),
  });
  await rejectsCode(
    runRestoredCopyObservation({ adapter, config, commit: COMMIT, schemaSha256: SCHEMA_SHA, now: FIXED_NOW }),
    'ROLLBACK_FAILED',
  );
});

test('CLI exige modo explicito y help no consulta entorno, git, adapter ni disco', async () => {
  assert.throws(() => parseArguments([]), error => error?.code === 'CLI_MODE_REQUIRED');
  assert.throws(
    () => parseArguments(['--connected', '--database-url', REMOTE_URL]),
    error => error?.code === 'CLI_OPTION_INVALID',
  );
  const out = capture();
  const result = await runCli(['--help'], {
    env: {},
    stdout: out.stream,
    adapterFactory: async () => { throw new Error('adapter should not run'); },
    commitResolver: async () => { throw new Error('git should not run'); },
  });
  assert.equal(result.mode, 'help');
  assert.match(out.read(), /--connected debe ser explicito/u);
});

test('una opcion CLI invalida nunca refleja URLs ni secretos en stderr', () => {
  const accidentalSecret = 'postgresql://observer:dummy-secret@example.invalid/wp0';
  let captured;
  try {
    parseArguments(['--connected', accidentalSecret]);
  } catch (error) {
    captured = error;
  }
  assert.equal(captured?.code, 'CLI_OPTION_INVALID');
  const rendered = formatFailure(captured);
  assert.equal(rendered.includes(accidentalSecret), false);
  assert.equal(rendered.includes('dummy-secret'), false);
  assert.equal(rendered, '[WP0-L:CLI_OPTION_INVALID] Opcion WP0-L no permitida.');
});

test('resolveCommit fija HEAD y exige status porcelain completamente limpio', async () => {
  const cleanCalls = [];
  const cleanExec = async (_executable, args) => {
    cleanCalls.push(args);
    if (args[0] === 'rev-parse') return { stdout: `${COMMIT}\n` };
    if (args[0] === 'status') return { stdout: '' };
    return { stdout: 'H shared/policy.cjs\nH prisma/schema.prisma\n' };
  };
  assert.equal(await resolveCommit('C:\\checkout', cleanExec), COMMIT);
  assert.deepEqual(cleanCalls, [
    ['rev-parse', '--verify', 'HEAD'],
    ['status', '--porcelain=v1', '--untracked-files=all'],
    ['ls-files', '-v', '--full-name'],
  ]);

  const dirtyExec = async (_executable, args) => ({
    stdout: args[0] === 'rev-parse' ? `${COMMIT}\n` : '?? shared/local-change.cjs\n',
  });
  await rejectsCode(resolveCommit('C:\\checkout', dirtyExec), 'WORKTREE_NOT_CLEAN');

  for (const tag of ['h', 'S']) {
    const flaggedExec = async (_executable, args) => {
      if (args[0] === 'rev-parse') return { stdout: `${COMMIT}\n` };
      if (args[0] === 'status') return { stdout: '' };
      return { stdout: `${tag} hidden-change.cjs\n` };
    };
    await rejectsCode(resolveCommit('C:\\checkout', flaggedExec), 'WORKTREE_INDEX_FLAGS_FORBIDDEN');
  }
});

test('resolveSchemaSha256 hashea bytes del blob inmutable del commit', async () => {
  const schemaBytes = Buffer.from('datasource db { provider = "postgresql" }\n', 'utf8');
  const blobSha = 'd'.repeat(40);
  const calls = [];
  const runExec = async (_executable, args, options) => {
    calls.push({ args, options });
    if (args[0] === 'ls-tree') {
      return { stdout: `100644 blob ${blobSha}\tprisma/schema.prisma\n` };
    }
    return { stdout: schemaBytes };
  };
  const digest = await resolveSchemaSha256('C:\\checkout', COMMIT, runExec);
  assert.equal(digest, crypto.createHash('sha256').update(schemaBytes).digest('hex'));
  assert.deepEqual(calls[0].args, ['ls-tree', COMMIT, '--', 'prisma/schema.prisma']);
  assert.deepEqual(calls[1].args, ['cat-file', 'blob', blobSha]);
  assert.equal(calls[1].options.encoding, null);
  await rejectsCode(resolveSchemaSha256('C:\\checkout', 'bad', runExec), 'COMMIT_INVALID');
  const symlinkExec = async () => ({
    stdout: `120000 blob ${blobSha}\tprisma/schema.prisma\n`,
  });
  await rejectsCode(resolveSchemaSha256('C:\\checkout', COMMIT, symlinkExec), 'SCHEMA_BLOB_ENTRY_INVALID');
});

test('CLI rechaza checkout sucio antes de crear adapter o conectar', async t => {
  const paths = await sandbox(t);
  let adapterCalls = 0;
  const dirtyExec = async (_executable, args) => ({
    stdout: args[0] === 'rev-parse' ? `${COMMIT}\n` : ' M prisma/schema.prisma\n',
  });
  await rejectsCode(
    runCli(validCliArguments(paths, '--connected'), {
      env: { WP0_DATABASE_URL: REMOTE_URL, NODE_ENV: 'test' },
      repoRoot: paths.repoRoot,
      stdout: capture().stream,
      adapterFactory: async () => { adapterCalls += 1; return fakeAdapter(); },
      commitResolver: repoRoot => resolveCommit(repoRoot, dirtyExec),
    }),
    'WORKTREE_NOT_CLEAN',
  );
  assert.equal(adapterCalls, 0);
  await assert.rejects(fs.access(paths.outputPath));
});

test('PGOPTIONS ambiental no puede forjar los marcadores de la copia restaurada', async t => {
  const paths = await sandbox(t);
  let adapterCalls = 0;
  await rejectsCode(
    runCli(validCliArguments(paths, '--connected'), {
      env: {
        WP0_DATABASE_URL: REMOTE_URL,
        NODE_ENV: 'test',
        PGOPTIONS: '-c municontrol.wp0_target_class=RESTORED_DISPOSABLE -c municontrol.wp0_target_id=target:forged',
      },
      repoRoot: paths.repoRoot,
      stdout: capture().stream,
      adapterFactory: async () => { adapterCalls += 1; return fakeAdapter(); },
      commitResolver: async () => COMMIT,
    }),
    'AMBIENT_PGOPTIONS_FORBIDDEN',
  );
  assert.equal(adapterCalls, 0);
  assert.equal(
    WP0_SAFE_PG_OPTIONS,
    '-c default_transaction_read_only=on -c row_security=off -c search_path=pg_catalog',
  );
  await assert.rejects(fs.access(paths.outputPath));
});

test('ninguna configuracion PostgreSQL ambiental puede sustituir URL, identidad o limites WP0-L', async t => {
  const paths = await sandbox(t);
  for (const name of WP0_FORBIDDEN_AMBIENT_POSTGRES_ENV) {
    let adapterCalls = 0;
    let commitCalls = 0;
    await rejectsCode(
      runCli(validCliArguments(paths, '--connected'), {
        env: {
          WP0_DATABASE_URL: REMOTE_URL,
          NODE_ENV: 'test',
          [name]: name === 'PGPORT' ? '6543' : 'forged',
        },
        repoRoot: paths.repoRoot,
        stdout: capture().stream,
        adapterFactory: async () => { adapterCalls += 1; return fakeAdapter(); },
        commitResolver: async () => { commitCalls += 1; return COMMIT; },
      }),
      'AMBIENT_POSTGRES_ENV_FORBIDDEN',
    );
    assert.equal(adapterCalls, 0, name);
    assert.equal(commitCalls, 0, name);
  }
});

test('la desactivacion TLS global falla antes de Git, adapter o conexion', async t => {
  const paths = await sandbox(t);
  let adapterCalls = 0;
  let commitCalls = 0;
  await rejectsCode(
    runCli(validCliArguments(paths, '--connected'), {
      env: {
        WP0_DATABASE_URL: REMOTE_URL,
        NODE_ENV: 'test',
        NODE_TLS_REJECT_UNAUTHORIZED: '0',
      },
      repoRoot: paths.repoRoot,
      stdout: capture().stream,
      adapterFactory: async () => { adapterCalls += 1; return fakeAdapter(); },
      commitResolver: async () => { commitCalls += 1; return COMMIT; },
    }),
    'TLS_VERIFICATION_ENV_FORBIDDEN',
  );
  assert.equal(adapterCalls, 0);
  assert.equal(commitCalls, 0);
  await assert.rejects(fs.access(paths.outputPath));
});

function validCliArguments(paths, mode) {
  return [
    mode,
    '--confirmation', 'RESTORED_DISPOSABLE',
    '--target-id', 'target:wp0-copy-01',
    '--output', paths.outputPath,
    '--backup-ref', 'backup:snapshot-001',
    '--restore-ref', 'restore:exercise-001',
    '--reviewer', 'reviewer:security-01',
    '--reviewer', 'reviewer:dba-02',
  ];
}

test('CLI check-config valida sin adapter, conexion ni escritura', async t => {
  const paths = await sandbox(t);
  const out = capture();
  let adapterCalls = 0;
  const result = await runCli(validCliArguments(paths, '--check-config'), {
    env: { WP0_DATABASE_URL: REMOTE_URL, NODE_ENV: 'test' },
    repoRoot: paths.repoRoot,
    stdout: out.stream,
    adapterFactory: async () => { adapterCalls += 1; throw new Error('must not connect'); },
    commitResolver: async () => COMMIT,
    schemaResolver: async () => SCHEMA_SHA,
  });
  assert.equal(result.connected, false);
  assert.equal(result.written, false);
  assert.equal(result.schemaSha256, SCHEMA_SHA);
  assert.equal(adapterCalls, 0);
  await assert.rejects(fs.access(paths.outputPath));
  assert.equal(out.read().includes(REMOTE_URL), false);
});

test('CLI connected explicito usa adapter inyectado, cierra y escribe observacion', async t => {
  const paths = await sandbox(t);
  const out = capture();
  const adapter = fakeAdapter();
  let receivedUrl;
  const result = await runCli(validCliArguments(paths, '--connected'), {
    env: { WP0_DATABASE_URL: REMOTE_URL, NODE_ENV: 'test' },
    repoRoot: paths.repoRoot,
    stdout: out.stream,
    adapterFactory: async databaseUrl => {
      receivedUrl = databaseUrl;
      return adapter;
    },
    commitResolver: async () => COMMIT,
    schemaResolver: async () => SCHEMA_SHA,
    clock: () => FIXED_NOW,
  });
  const artifact = JSON.parse(await fs.readFile(paths.outputPath, 'utf8'));
  assert.equal(receivedUrl, REMOTE_URL);
  assert.equal(adapter.closed, true);
  assert.equal(result.connected, true);
  assert.equal(result.written, true);
  assert.equal(result.collectionMode, 'strict');
  assert.equal(result.migrationHistoryState, 'valid');
  assert.equal(artifact.artifactType, 'wp0_restored_copy_observation');
  assert.equal(out.read().includes(REMOTE_URL), false);
});

test('CLI connected persiste historia absent como discovery no aprobable', async t => {
  const paths = await sandbox(t);
  const adapter = fakeAdapter({
    [QUERY_IDS.OBSERVER_SECURITY]: [{
      ...validRows()[QUERY_IDS.OBSERVER_SECURITY][0],
      migration_history_select: 'false',
    }],
    [QUERY_IDS.MIGRATION_LOCATOR]: [{
      named_object_count: '0',
      relation_count: '0',
      relation_kinds: '',
      relation_persistence: '',
      column_count: '0',
      column_names: '',
      column_signature: '',
      primary_key_count: '0',
      primary_key_columns: '',
      row_level_security: 'false',
      force_row_level_security: 'false',
    }],
  });
  const result = await runCli(validCliArguments(paths, '--connected'), {
    env: { WP0_DATABASE_URL: REMOTE_URL, NODE_ENV: 'test' },
    repoRoot: paths.repoRoot,
    stdout: capture().stream,
    adapterFactory: async () => adapter,
    commitResolver: async () => COMMIT,
    schemaResolver: async () => SCHEMA_SHA,
    clock: () => FIXED_NOW,
  });
  const artifact = JSON.parse(await fs.readFile(paths.outputPath, 'utf8'));
  assert.equal(result.collectionMode, 'discovery_non_approvable');
  assert.equal(result.migrationHistoryState, 'absent');
  assert.equal(artifact.quality.approvalEligible, false);
  assert.equal(artifact.inventory.prismaMigrations.state, 'absent');
  assert.equal(adapter.closed, true);
});
