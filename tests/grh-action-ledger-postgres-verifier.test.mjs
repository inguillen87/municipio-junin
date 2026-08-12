import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { fingerprintDatabaseTarget } from '../api/lib/database-target-fingerprint.js';
import {
  CONFIRMATION,
  DATABASE_ENV,
  EXPECTED_COLUMNS,
  EXPECTED_CONSTRAINTS,
  EXPECTED_ENUMS,
  EXPECTED_INDEXES,
  EXPECTED_RELATIONS,
  LedgerPostgresVerificationError,
  MIGRATION_NAME,
  QUERY,
  formatFailure,
  inspectEnvironment,
  loadLocalContract,
  normalizeCatalogExpression,
  normalizeCatalogType,
  parseArguments,
  runCli,
  runConnectedVerification,
  safePostgresFailureCode,
} from '../scripts/verify-grh-action-ledger-postgres.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const NOW = new Date('2026-08-11T23:30:00.000Z');
const LOCAL_URL = 'postgresql://ledger_verifier@localhost/municontrol_ledger_disposable?sslmode=disable';
const LOCAL_TARGET_FINGERPRINT = fingerprintDatabaseTarget(LOCAL_URL);

function enumRows() {
  return Object.entries(EXPECTED_ENUMS).flatMap(([enumName, values]) => (
    values.map((value, index) => ({
      enum_name: enumName,
      enum_value: value,
      enum_order: index + 1,
    }))
  ));
}

function columnRows() {
  const rows = [];
  for (const tableName of ['grh_action_commitment_events', 'grh_action_commitments']) {
    for (const [columnName, dataType, notNull, defaultMatcher] of EXPECTED_COLUMNS[tableName]) {
      let defaultExpression = null;
      if (defaultMatcher) {
        if (columnName === 'sequence') defaultExpression = "nextval('grh_action_commitment_events_sequence_seq'::regclass)";
        else if (columnName === 'state') defaultExpression = `'OPEN'::"GrhActionCommitmentState"`;
        else if (columnName === 'version') defaultExpression = '1';
        else defaultExpression = 'CURRENT_TIMESTAMP';
      }
      rows.push({
        table_name: tableName,
        column_name: columnName,
        data_type: dataType,
        not_null: notNull,
        default_expression: defaultExpression,
      });
    }
  }
  return rows;
}

function constraintRows() {
  const expectedByTable = EXPECTED_CONSTRAINTS;
  return Object.entries(expectedByTable).flatMap(([tableName, expected]) => (
    Object.entries(expected).map(([name, [type, definition]]) => {
      const base = {
        table_name: tableName,
        constraint_name: name,
        definition,
      };
      return {
        ...base,
        constraint_type: type,
        validated: true,
        deferrable: false,
        initially_deferred: false,
      };
    })
  ));
}

function indexRows() {
  return Object.entries(EXPECTED_INDEXES).flatMap(([tableName, expected]) => (
    Object.entries(expected).map(([name, [isUnique, isPrimary, columns]]) => ({
      table_name: tableName,
      index_name: name,
      index_kind: 'i',
      access_method: 'btree',
      is_unique: isUnique,
      is_primary: isPrimary,
      is_exclusion: false,
      is_immediate: true,
      is_valid: true,
      is_ready: true,
      is_unconditional: true,
      has_no_expressions: true,
      key_attribute_count: columns.length,
      total_attribute_count: columns.length,
      key_columns: [...columns],
      key_definitions: [...columns],
      definition: `CREATE INDEX ${name} ON ${tableName} USING btree (${columns.join(', ')})`,
    }))
  ));
}

function validRows(contract) {
  return {
    [QUERY.session.name]: [{
      server_version_num: 160004,
      transaction_read_only: 'on',
      transaction_isolation: 'repeatable read',
    }],
    [QUERY.migration.name]: [{
      migration_name: contract.migrationName,
      checksum: contract.migrationSha256,
      finished: true,
      not_rolled_back: true,
      applied_steps_count: 1,
    }],
    [QUERY.relations.name]: EXPECTED_RELATIONS.map(row => ({ ...row })),
    [QUERY.enums.name]: enumRows(),
    [QUERY.columns.name]: columnRows(),
    [QUERY.constraints.name]: constraintRows(),
    [QUERY.indexes.name]: indexRows(),
    [QUERY.triggers.name]: [
      {
        table_name: 'grh_action_commitment_events',
        trigger_name: 'grh_action_commitment_events_no_truncate',
        enabled: 'O',
        function_name: 'grh_action_commitment_events_deny_mutation',
        definition: 'CREATE TRIGGER grh_action_commitment_events_no_truncate BEFORE TRUNCATE ON grh_action_commitment_events FOR EACH STATEMENT EXECUTE FUNCTION grh_action_commitment_events_deny_mutation()',
      },
      {
        table_name: 'grh_action_commitment_events',
        trigger_name: 'grh_action_commitment_events_no_update_delete',
        enabled: 'O',
        function_name: 'grh_action_commitment_events_deny_mutation',
        definition: 'CREATE TRIGGER grh_action_commitment_events_no_update_delete BEFORE DELETE OR UPDATE ON grh_action_commitment_events FOR EACH ROW EXECUTE FUNCTION grh_action_commitment_events_deny_mutation()',
      },
    ],
    [QUERY.functions.name]: [{
      function_name: 'grh_action_commitment_events_deny_mutation',
      language_name: 'plpgsql',
      volatility: 'v',
      security_definer: false,
      result_type: 'trigger',
      source: "BEGIN\n    RAISE EXCEPTION 'grh_action_commitment_events is append-only';\nEND;",
      definition: "CREATE FUNCTION grh_action_commitment_events_deny_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'grh_action_commitment_events is append-only'; END; $$",
    }],
    [QUERY.publicPrivileges.name]: [],
  };
}

function fakeAdapter(rowsByQueryName) {
  const calls = [];
  let closed = false;
  return {
    calls,
    get closed() { return closed; },
    async query(query) {
      calls.push(query.name);
      if ([QUERY.begin.name, QUERY.commit.name, QUERY.rollback.name].includes(query.name)) {
        return { rowCount: null, rows: [] };
      }
      if (!Object.hasOwn(rowsByQueryName, query.name)) throw new Error(`unexpected query ${query.name}`);
      const rows = rowsByQueryName[query.name];
      return { rowCount: rows.length, rows };
    },
    async close() { closed = true; },
  };
}

test('local contract pins the exact governed ledger migration bytes', async () => {
  const contract = await loadLocalContract(repoRoot);
  assert.equal(contract.migrationName, MIGRATION_NAME);
  assert.match(contract.migrationSha256, /^[a-f0-9]{64}$/u);
  assert.equal(contract.migrationSha256, 'c5a3b63d7d64f1be4089df82c161f90707674ce73cc870764a225ee725bc455a');
});

test('connected catalog verification is repeatable-read, read-only and emits a sanitized exact receipt', async () => {
  const contract = await loadLocalContract(repoRoot);
  const adapter = fakeAdapter(validRows(contract));
  const result = await runConnectedVerification({
    adapter,
    contract,
    targetId: 'target:local-ledger-copy-01',
    databaseTargetFingerprintSha256: LOCAL_TARGET_FINGERPRINT,
    clock: () => NOW,
  });

  assert.deepEqual(adapter.calls, [
    QUERY.begin.name,
    QUERY.session.name,
    QUERY.migration.name,
    QUERY.relations.name,
    QUERY.enums.name,
    QUERY.columns.name,
    QUERY.constraints.name,
    QUERY.indexes.name,
    QUERY.triggers.name,
    QUERY.functions.name,
    QUERY.publicPrivileges.name,
    QUERY.commit.name,
  ]);
  assert.equal(result.status, 'verified');
  assert.equal(result.targetId, 'target:local-ledger-copy-01');
  assert.equal(result.databaseTargetFingerprintSha256, LOCAL_TARGET_FINGERPRINT);
  assert.equal(result.transactionMode, 'REPEATABLE READ READ ONLY');
  assert.equal(result.migrationSha256, contract.migrationSha256);
  assert.match(result.catalogFingerprintSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(result.checks, {
    migrationHistory: 'exact',
    relations: 3,
    enums: 16,
    columns: 37,
    constraints: 15,
    indexes: 10,
    triggers: 2,
    appendOnlyFunction: 'exact',
    publicMutationPrivileges: 0,
  });
  assert.doesNotMatch(JSON.stringify(result), /postgresql:|ledger_verifier|municontrol_ledger_disposable/u);
});

test('all connected statements are catalog reads or transaction control', () => {
  const transactionControl = new Set(['begin', 'commit', 'rollback']);
  for (const [name, query] of Object.entries(QUERY)) {
    const sql = query.text.trim();
    if (transactionControl.has(name)) continue;
    assert.match(sql, /^SELECT\b/iu, `${name} must be SELECT-only`);
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|CALL|COPY|DO)\b/iu, `${name} must not mutate`);
  }
  assert.match(QUERY.begin.text, /REPEATABLE READ READ ONLY/u);
});

test('catalog queries never use PostgreSQL command keywords as aliases', () => {
  const reservedAliases = /\bAS\s+(?:constraint|index|procedure|trigger|table|user|authorization|current_user)\b/iu;
  for (const [name, query] of Object.entries(QUERY)) {
    assert.doesNotMatch(query.text, reservedAliases, `${name} contains a reserved alias`);
    assert.doesNotMatch(query.text, /\b(?:constraint|index|procedure|trigger)\./iu, `${name} references a reserved alias`);
  }
  assert.match(QUERY.constraints.text, /pg_constraint AS constraint_object/u);
  assert.match(QUERY.indexes.text, /pg_index AS index_metadata/u);
  assert.match(QUERY.triggers.text, /pg_trigger AS trigger_metadata/u);
});

test('public-qualified PostgreSQL enum types and regclass defaults canonicalize to the frozen contract', () => {
  assert.equal(normalizeCatalogType('public."GrhActionCode"'), '"GrhActionCode"');
  assert.equal(normalizeCatalogType('"public"."Role"'), '"Role"');
  assert.equal(
    normalizeCatalogExpression("nextval('public.grh_action_commitment_events_sequence_seq'::regclass)"),
    "nextval('grh_action_commitment_events_sequence_seq'::regclass)",
  );
  assert.equal(
    normalizeCatalogExpression(`'OPEN'::public."GrhActionCommitmentState"`),
    `'OPEN'::"GrhActionCommitmentState"`,
  );
});

test('migration checksum drift fails closed and rolls the observation back', async () => {
  const contract = await loadLocalContract(repoRoot);
  const rows = validRows(contract);
  rows[QUERY.migration.name][0].checksum = '0'.repeat(64);
  const adapter = fakeAdapter(rows);

  await assert.rejects(
    runConnectedVerification({
      adapter, contract, targetId: 'target:local-ledger-copy-01',
      databaseTargetFingerprintSha256: LOCAL_TARGET_FINGERPRINT, clock: () => NOW,
    }),
    error => error instanceof LedgerPostgresVerificationError
      && error.code === 'CATALOG_CONTRACT_MISMATCH'
      && error.failures.includes('MIGRATION_HISTORY_MISMATCH'),
  );
  assert.equal(adapter.calls.at(-1), QUERY.rollback.name);
  assert.equal(adapter.calls.includes(QUERY.commit.name), false);
});

test('column drift reports only the exact safe metadata dimension', async () => {
  const contract = await loadLocalContract(repoRoot);
  const rows = validRows(contract);
  const target = rows[QUERY.columns.name].find(row => row.column_name === 'action_code');
  target.data_type = 'text';
  const adapter = fakeAdapter(rows);

  await assert.rejects(
    runConnectedVerification({
      adapter, contract, targetId: 'target:local-ledger-copy-01',
      databaseTargetFingerprintSha256: LOCAL_TARGET_FINGERPRINT, clock: () => NOW,
    }),
    error => error.code === 'CATALOG_CONTRACT_MISMATCH'
      && error.failures.includes('COLUMN_GRH_ACTION_COMMITMENTS_ACTION_CODE_TYPE_MISMATCH')
      && error.failures.every(code => !code.includes('postgresql://')),
  );
});

test('a session that is not repeatable-read and read-only fails closed', async () => {
  const contract = await loadLocalContract(repoRoot);
  const rows = validRows(contract);
  rows[QUERY.session.name][0].transaction_isolation = 'read committed';
  const adapter = fakeAdapter(rows);

  await assert.rejects(
    runConnectedVerification({
      adapter, contract, targetId: 'target:local-ledger-copy-01',
      databaseTargetFingerprintSha256: LOCAL_TARGET_FINGERPRINT, clock: () => NOW,
    }),
    error => error instanceof LedgerPostgresVerificationError
      && error.code === 'CATALOG_CONTRACT_MISMATCH'
      && error.failures.includes('READ_ONLY_POSTGRES_SESSION_INVALID'),
  );
  assert.equal(adapter.calls.at(-1), QUERY.rollback.name);
});

test('missing append-only trigger and PUBLIC mutation grants both fail closed', async () => {
  const contract = await loadLocalContract(repoRoot);
  const rows = validRows(contract);
  rows[QUERY.triggers.name] = rows[QUERY.triggers.name].slice(0, 1);
  rows[QUERY.publicPrivileges.name] = [{
    table_name: 'grh_action_commitment_events',
    privilege_type: 'UPDATE',
  }];
  const adapter = fakeAdapter(rows);

  await assert.rejects(
    runConnectedVerification({
      adapter, contract, targetId: 'target:local-ledger-copy-01',
      databaseTargetFingerprintSha256: LOCAL_TARGET_FINGERPRINT, clock: () => NOW,
    }),
    error => error instanceof LedgerPostgresVerificationError
      && error.code === 'CATALOG_CONTRACT_MISMATCH'
      && error.failures.includes('TRIGGERS_SET_MISMATCH')
      && error.failures.includes('PUBLIC_MUTATION_PRIVILEGE_PRESENT'),
  );
  assert.equal(adapter.calls.at(-1), QUERY.rollback.name);
});

test('append-only function rejects an early return even when the governed RAISE text remains', async () => {
  const contract = await loadLocalContract(repoRoot);
  const rows = validRows(contract);
  rows[QUERY.functions.name][0].source =
    "BEGIN RETURN OLD; RAISE EXCEPTION 'grh_action_commitment_events is append-only'; END;";
  const adapter = fakeAdapter(rows);

  await assert.rejects(
    runConnectedVerification({
      adapter, contract, targetId: 'target:local-ledger-copy-01',
      databaseTargetFingerprintSha256: LOCAL_TARGET_FINGERPRINT, clock: () => NOW,
    }),
    error => error instanceof LedgerPostgresVerificationError
      && error.code === 'CATALOG_CONTRACT_MISMATCH'
      && error.failures.includes('DENY_FUNCTION_MISMATCH'),
  );
  assert.equal(adapter.calls.at(-1), QUERY.rollback.name);
  assert.equal(adapter.calls.includes(QUERY.commit.name), false);
});

test('append-only triggers reject a false WHEN clause instead of accepting matching fragments', async () => {
  const contract = await loadLocalContract(repoRoot);
  const rows = validRows(contract);
  const trigger = rows[QUERY.triggers.name].find(row =>
    row.trigger_name === 'grh_action_commitment_events_no_update_delete');
  trigger.definition =
    'CREATE TRIGGER grh_action_commitment_events_no_update_delete BEFORE DELETE OR UPDATE ON grh_action_commitment_events FOR EACH ROW WHEN (false) EXECUTE FUNCTION grh_action_commitment_events_deny_mutation()';
  const adapter = fakeAdapter(rows);

  await assert.rejects(
    runConnectedVerification({
      adapter, contract, targetId: 'target:local-ledger-copy-01',
      databaseTargetFingerprintSha256: LOCAL_TARGET_FINGERPRINT, clock: () => NOW,
    }),
    error => error instanceof LedgerPostgresVerificationError
      && error.code === 'CATALOG_CONTRACT_MISMATCH'
      && error.failures.includes(
        'TRIGGER_GRH_ACTION_COMMITMENT_EVENTS_NO_UPDATE_DELETE_MISMATCH',
      ),
  );
  assert.equal(adapter.calls.at(-1), QUERY.rollback.name);
  assert.equal(adapter.calls.includes(QUERY.commit.name), false);
});

test('indexes reject INCLUDE columns and non-canonical key definitions', async () => {
  const contract = await loadLocalContract(repoRoot);
  const rows = validRows(contract);
  const index = rows[QUERY.indexes.name].find(row =>
    row.index_name === 'grh_action_commitments_tenant_id_id_key');
  index.total_attribute_count += 1;
  index.key_definitions[0] = 'tenant_id DESC';
  index.definition += ' INCLUDE (created_at)';
  const adapter = fakeAdapter(rows);

  await assert.rejects(
    runConnectedVerification({
      adapter, contract, targetId: 'target:local-ledger-copy-01',
      databaseTargetFingerprintSha256: LOCAL_TARGET_FINGERPRINT, clock: () => NOW,
    }),
    error => error instanceof LedgerPostgresVerificationError
      && error.code === 'CATALOG_CONTRACT_MISMATCH'
      && error.failures.includes(
        'INDEX_GRH_ACTION_COMMITMENTS_TENANT_ID_ID_KEY_DEFINITION_MISMATCH',
      ),
  );
  assert.equal(adapter.calls.at(-1), QUERY.rollback.name);
  assert.equal(adapter.calls.includes(QUERY.commit.name), false);
});

test('constraints reject an OR TRUE weakening even when every governed fragment remains', async () => {
  const contract = await loadLocalContract(repoRoot);
  const rows = validRows(contract);
  const constraint = rows[QUERY.constraints.name].find(row =>
    row.constraint_name === 'grh_action_commitments_state_check');
  constraint.definition = constraint.definition.replace(/\)$/u, ' OR TRUE)');
  const adapter = fakeAdapter(rows);

  await assert.rejects(
    runConnectedVerification({
      adapter, contract, targetId: 'target:local-ledger-copy-01',
      databaseTargetFingerprintSha256: LOCAL_TARGET_FINGERPRINT, clock: () => NOW,
    }),
    error => error instanceof LedgerPostgresVerificationError
      && error.code === 'CATALOG_CONTRACT_MISMATCH'
      && error.failures.includes(
        'CONSTRAINT_GRH_ACTION_COMMITMENTS_STATE_CHECK_DEFINITION_MISMATCH',
      ),
  );
  assert.equal(adapter.calls.at(-1), QUERY.rollback.name);
  assert.equal(adapter.calls.includes(QUERY.commit.name), false);
});

test('query failures expose only a stable stage and PostgreSQL code', async () => {
  const contract = await loadLocalContract(repoRoot);
  const adapter = fakeAdapter(validRows(contract));
  const originalQuery = adapter.query;
  adapter.query = async query => {
    if (query.name === QUERY.indexes.name) {
      const error = new Error(`sensitive ${LOCAL_URL}`);
      error.code = '42P01';
      throw error;
    }
    return originalQuery.call(adapter, query);
  };

  await assert.rejects(
    runConnectedVerification({
      adapter, contract, targetId: 'target:local-ledger-copy-01',
      databaseTargetFingerprintSha256: LOCAL_TARGET_FINGERPRINT, clock: () => NOW,
    }),
    error => error.code === 'POSTGRES_OBSERVATION_FAILED'
      && error.failures.includes('STAGE_INDEXES')
      && error.failures.includes('POSTGRES_42P01')
      && !formatFailure(error).includes('sensitive'),
  );
  assert.equal(adapter.calls.at(-1), QUERY.rollback.name);
  assert.equal(safePostgresFailureCode({ code: `42P01 ${LOCAL_URL}` }), 'POSTGRES_CODE_UNAVAILABLE');
});

test('config check validates local URL and contract without opening a PostgreSQL adapter', async () => {
  let adapterCalls = 0;
  let stdout = '';
  const result = await runCli([
    '--check-config',
    '--confirmation', CONFIRMATION,
    '--target-id', 'target:local-ledger-copy-01',
  ], {
    repoRoot,
    env: { [DATABASE_ENV]: LOCAL_URL },
    stdout: { write: value => { stdout += value; } },
    adapterFactory: async () => { adapterCalls += 1; throw new Error('must not connect'); },
  });

  assert.equal(adapterCalls, 0);
  assert.equal(result.connected, false);
  assert.equal(result.status, 'valid');
  assert.match(stdout, /"mode":"check-config"/u);
  assert.doesNotMatch(stdout, /postgresql:|ledger_verifier|municontrol_ledger_disposable/u);
});

test('connected CLI closes its injected adapter and never exposes its URL', async () => {
  const contract = await loadLocalContract(repoRoot);
  const adapter = fakeAdapter(validRows(contract));
  let stdout = '';
  const result = await runCli([
    '--connected',
    '--confirmation', CONFIRMATION,
    '--target-id', 'target:local-ledger-copy-01',
  ], {
    repoRoot,
    env: { [DATABASE_ENV]: LOCAL_URL },
    stdout: { write: value => { stdout += value; } },
    clock: () => NOW,
    adapterFactory: async connectionString => {
      assert.match(connectionString, /^postgresql:\/\//u);
      return adapter;
    },
  });

  assert.equal(result.status, 'verified');
  assert.equal(result.databaseTargetFingerprintSha256, LOCAL_TARGET_FINGERPRINT);
  assert.equal(adapter.closed, true);
  assert.match(stdout, /"connected":true/u);
  assert.match(stdout, new RegExp(`"databaseTargetFingerprintSha256":"${LOCAL_TARGET_FINGERPRINT}"`, 'u'));
  assert.doesNotMatch(stdout, /postgresql:|ledger_verifier|municontrol_ledger_disposable/u);
});

test('connected CLI never prints success when closing the observation connection fails', async () => {
  const contract = await loadLocalContract(repoRoot);
  const adapter = fakeAdapter(validRows(contract));
  adapter.close = async () => { throw new Error(`sensitive ${LOCAL_URL}`); };
  let stdout = '';

  await assert.rejects(
    runCli([
      '--connected',
      '--confirmation', CONFIRMATION,
      '--target-id', 'target:local-ledger-copy-01',
    ], {
      repoRoot,
      env: { [DATABASE_ENV]: LOCAL_URL },
      stdout: { write: value => { stdout += value; } },
      clock: () => NOW,
      adapterFactory: async () => adapter,
    }),
    error => error.code === 'POSTGRES_CLOSE_FAILED',
  );
  assert.equal(stdout, '');
});

test('dedicated URL is mandatory and ambient PostgreSQL or disabled TLS is rejected', () => {
  assert.throws(
    () => inspectEnvironment({}),
    error => error.code === 'DATABASE_URL_REQUIRED',
  );
  assert.throws(
    () => inspectEnvironment({ [DATABASE_ENV]: LOCAL_URL, PGHOST: 'localhost' }),
    error => error.code === 'AMBIENT_POSTGRES_ENV_FORBIDDEN',
  );
  assert.throws(
    () => inspectEnvironment({ [DATABASE_ENV]: LOCAL_URL, NODE_TLS_REJECT_UNAUTHORIZED: '0' }),
    error => error.code === 'TLS_VERIFICATION_ENV_FORBIDDEN',
  );
});

test('CLI requires exact mode, confirmation and opaque target id', () => {
  assert.throws(() => parseArguments([]), error => error.code === 'CLI_MODE_REQUIRED');
  assert.throws(
    () => parseArguments(['--connected', '--confirmation', 'YES', '--target-id', 'target:copy']),
    error => error.code === 'CLI_CONFIRMATION_INVALID',
  );
  assert.throws(
    () => parseArguments(['--connected', '--confirmation', CONFIRMATION, '--target-id', 'production url']),
    error => error.code === 'CLI_TARGET_ID_INVALID',
  );
  assert.deepEqual(
    parseArguments(['--connected', '--confirmation', CONFIRMATION, '--target-id', 'target:copy-01']),
    { mode: 'connected', targetId: 'target:copy-01' },
  );
});

test('failure formatter exposes stable codes and check names, never connection details', () => {
  const error = new LedgerPostgresVerificationError(
    'CATALOG_CONTRACT_MISMATCH',
    `sensitive ${LOCAL_URL}`,
    ['MIGRATION_HISTORY_MISMATCH'],
  );
  const formatted = formatFailure(error);
  assert.equal(formatted, '[GRH-LEDGER-DB:CATALOG_CONTRACT_MISMATCH] Verificacion no aprobada (MIGRATION_HISTORY_MISMATCH)');
  assert.doesNotMatch(formatted, /postgresql:|ledger_verifier/u);
});

test('package and runbook expose the verifier without claiming stable DDL authorization', async () => {
  const packageManifest = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  const runbook = await readFile(path.join(repoRoot, 'docs', 'GRH_ACTION_LEDGER_POSTGRES_GATE.md'), 'utf8');

  assert.equal(
    packageManifest.scripts['db:grh-ledger:verify'],
    'node scripts/verify-grh-action-ledger-postgres.mjs',
  );
  assert.match(runbook, /REPEATABLE READ READ ONLY/u);
  assert.match(runbook, /copia local o descartable/iu);
  assert.match(runbook, /no aplica migraciones/iu);
  assert.match(runbook, /nunca una\s+habilitaci[oó]n para aplicar DDL estable/iu);
  assert.match(runbook, /pruebas locales usan un adapter inyectado[\s\S]*no equivalen a\s+una ejecuci[oó]n contra PostgreSQL real/iu);
});
