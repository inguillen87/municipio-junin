import assert from 'node:assert/strict';
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
  runCli,
} from '../scripts/inspect-prisma-restored-copy.mjs';

const {
  QUERY_IDS,
  executeAllowlistedQuery,
  listAllowlistedQueries,
  runRestoredCopyObservation,
  validateObservationConfig,
  validateOutputPath,
  writeObservationFile,
} = observationModule;

const COMMIT = 'a'.repeat(40);
const REMOTE_URL = 'postgresql://wp0_observer:dummy-test-secret@db.example.invalid/wp0?sslmode=verify-full&schema=public';
const FIXED_NOW = new Date('2026-08-09T12:00:00.000Z');

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
    [QUERY_IDS.DATABASE_IDENTITY]: [{
      database_name: 'wp0_restored_copy',
      server_version_num: '160004',
      target_class: 'RESTORED_DISPOSABLE',
      target_id: 'target:wp0-copy-01',
      database_target_class_setting: 'municontrol.wp0_target_class=RESTORED_DISPOSABLE',
      database_target_id_setting: 'municontrol.wp0_target_id=target:wp0-copy-01',
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
    ],
    [QUERY_IDS.MIGRATION_LOCATOR]: [{
      relation_count: '1',
      row_level_security: 'false',
      force_row_level_security: 'false',
    }],
    [QUERY_IDS.MIGRATION_HISTORY]: [{
      migration_id: 'migration-001',
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
  const observation = await runRestoredCopyObservation({ adapter, config, commit: COMMIT, now: FIXED_NOW });

  assert.equal(observation.artifactType, 'wp0_restored_copy_observation');
  assert.equal(observation.semantics, 'OBSERVATION_ONLY_NOT_AUTHORIZATION');
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
  assert.equal(serialized.includes(REMOTE_URL), false);
  assert.equal(serialized.includes('releaseReceipt'), false);
  assert.equal(serialized.includes('baselineManifest'), false);
  await rejectsCode(
    writeObservationFile({ outputPath: paths.outputPath, repoRoot: paths.repoRoot, observation }),
    'OUTPUT_ALREADY_EXISTS',
  );
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
      target_class: 'PRODUCTION',
      target_id: 'target:wp0-copy-01',
      database_target_class_setting: 'municontrol.wp0_target_class=PRODUCTION',
      database_target_id_setting: 'municontrol.wp0_target_id=target:wp0-copy-01',
    }],
  });
  await rejectsCode(
    runRestoredCopyObservation({ adapter, config, commit: COMMIT, now: FIXED_NOW }),
    'TARGET_NOT_RESTORED_DISPOSABLE',
  );
  assert.equal(adapter.calls.at(-1).id, QUERY_IDS.ROLLBACK);
});

test('target CLI no puede etiquetar una copia con otro target persistente', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const adapter = fakeAdapter({
    [QUERY_IDS.DATABASE_IDENTITY]: [{
      database_name: 'wp0_restored_copy',
      server_version_num: '160004',
      target_class: 'RESTORED_DISPOSABLE',
      target_id: 'target:different-copy',
      database_target_class_setting: 'municontrol.wp0_target_class=RESTORED_DISPOSABLE',
      database_target_id_setting: 'municontrol.wp0_target_id=target:different-copy',
    }],
  });
  await rejectsCode(
    runRestoredCopyObservation({ adapter, config, commit: COMMIT, now: FIXED_NOW }),
    'TARGET_ID_MISMATCH',
  );
  assert.deepEqual(adapter.calls.map(call => call.id), [
    QUERY_IDS.BEGIN,
    QUERY_IDS.TRANSACTION_STATE,
    QUERY_IDS.DATABASE_IDENTITY,
    QUERY_IDS.ROLLBACK,
  ]);
});

test('marcadores heredados de rol o sistema no sustituyen ALTER DATABASE', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const identity = validRows()[QUERY_IDS.DATABASE_IDENTITY][0];
  for (const override of [
    { database_target_class_setting: null },
    { database_target_id_setting: null },
    { database_target_class_setting: 'municontrol.wp0_target_class=RESTORED_DISPOSABLE\nmunicontrol.wp0_target_class=RESTORED_DISPOSABLE' },
  ]) {
    const adapter = fakeAdapter({
      [QUERY_IDS.DATABASE_IDENTITY]: [{ ...identity, ...override }],
    });
    await rejectsCode(
      runRestoredCopyObservation({ adapter, config, commit: COMMIT, now: FIXED_NOW }),
      'TARGET_DATABASE_SETTING_MISSING',
    );
    assert.equal(adapter.calls.at(-1).id, QUERY_IDS.ROLLBACK);
  }
});

test('output dentro del repo o a traves de symlink/junction se rechaza', async t => {
  const paths = await sandbox(t);
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
    runRestoredCopyObservation({ adapter, config, commit: COMMIT, now: FIXED_NOW }),
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
      runRestoredCopyObservation({ adapter, config, commit: COMMIT, now: FIXED_NOW }),
      'SESSION_SECURITY_CONTEXT_INVALID',
    );
    assert.deepEqual(adapter.calls.map(call => call.id), [
      QUERY_IDS.BEGIN,
      QUERY_IDS.TRANSACTION_STATE,
      QUERY_IDS.ROLLBACK,
    ]);
  }
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
    assert.doesNotMatch(query.text, /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COPY|VACUUM)\b/iu);
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
  assert.equal(
    (databaseIdentity.match(/current_database/gu) || []).length,
    (databaseIdentity.match(/pg_catalog\.current_database/gu) || []).length,
  );
  assert.equal(
    (databaseIdentity.match(/current_setting/gu) || []).length,
    (databaseIdentity.match(/pg_catalog\.current_setting/gu) || []).length,
  );
});

test('URL o secreto derivado de catalogos bloquea el artefacto y hace rollback', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const contaminated = validRows()[QUERY_IDS.CATALOG_INVENTORY].map(row => ({ ...row }));
  contaminated[0].definition = 'default=https://secret.invalid/token';
  const adapter = fakeAdapter({ [QUERY_IDS.CATALOG_INVENTORY]: contaminated });
  await rejectsCode(
    runRestoredCopyObservation({ adapter, config, commit: COMMIT, now: FIXED_NOW }),
    'OBSERVATION_SECRET_DETECTED',
  );
  assert.equal(adapter.calls.at(-1).id, QUERY_IDS.ROLLBACK);
  await assert.rejects(fs.access(paths.outputPath));

  const withSecret = validRows()[QUERY_IDS.CATALOG_INVENTORY].map(row => ({ ...row }));
  withSecret[0].definition = 'password=top-secret-value';
  const secretAdapter = fakeAdapter({ [QUERY_IDS.CATALOG_INVENTORY]: withSecret });
  await rejectsCode(
    runRestoredCopyObservation({ adapter: secretAdapter, config, commit: COMMIT, now: FIXED_NOW }),
    'OBSERVATION_SECRET_DETECTED',
  );
  assert.equal(secretAdapter.calls.at(-1).id, QUERY_IDS.ROLLBACK);
});

test('historia ausente o inconsistente falla cerrada', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  const absent = fakeAdapter({
    [QUERY_IDS.MIGRATION_LOCATOR]: [{
      relation_count: '0',
      row_level_security: 'false',
      force_row_level_security: 'false',
    }],
  });
  await rejectsCode(
    runRestoredCopyObservation({ adapter: absent, config, commit: COMMIT, now: FIXED_NOW }),
    'MIGRATION_HISTORY_MISSING',
  );
  assert.equal(absent.calls.at(-1).id, QUERY_IDS.ROLLBACK);

  const badRow = { ...validRows()[QUERY_IDS.MIGRATION_HISTORY][0], applied_steps_count: '0' };
  const inconsistent = fakeAdapter({ [QUERY_IDS.MIGRATION_HISTORY]: [badRow] });
  await rejectsCode(
    runRestoredCopyObservation({ adapter: inconsistent, config, commit: COMMIT, now: FIXED_NOW }),
    'MIGRATION_HISTORY_INCONSISTENT',
  );
  assert.equal(inconsistent.calls.at(-1).id, QUERY_IDS.ROLLBACK);
});

test('RLS en _prisma_migrations nunca puede ocultar historia al observador', async t => {
  const paths = await sandbox(t);
  const config = await validated(paths);
  for (const field of ['row_level_security', 'force_row_level_security']) {
    const locator = {
      relation_count: '1',
      row_level_security: 'false',
      force_row_level_security: 'false',
      [field]: 'true',
    };
    const adapter = fakeAdapter({ [QUERY_IDS.MIGRATION_LOCATOR]: [locator] });
    await rejectsCode(
      runRestoredCopyObservation({ adapter, config, commit: COMMIT, now: FIXED_NOW }),
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
    runRestoredCopyObservation({ adapter, config, commit: COMMIT, now: FIXED_NOW }),
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
    runRestoredCopyObservation({ adapter, config, commit: COMMIT, now: FIXED_NOW }),
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
  });
  assert.equal(result.connected, false);
  assert.equal(result.written, false);
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
    clock: () => FIXED_NOW,
  });
  const artifact = JSON.parse(await fs.readFile(paths.outputPath, 'utf8'));
  assert.equal(receivedUrl, REMOTE_URL);
  assert.equal(adapter.closed, true);
  assert.equal(result.connected, true);
  assert.equal(result.written, true);
  assert.equal(artifact.artifactType, 'wp0_restored_copy_observation');
  assert.equal(out.read().includes(REMOTE_URL), false);
});
