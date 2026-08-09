#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import pg from 'pg';

import observationModule from '../shared/prisma-baseline-observation.cjs';

const {
  Wp0ObservationError,
  runRestoredCopyObservation,
  validateObservationConfig,
  writeObservationFile,
} = observationModule;

const execFile = promisify(execFileCallback);
const MODES = new Set(['--help', '--check-config', '--connected']);
const WP0_SAFE_PG_OPTIONS = '-c default_transaction_read_only=on -c row_security=off -c search_path=pg_catalog';
const WP0_FORBIDDEN_AMBIENT_POSTGRES_ENV = Object.freeze([
  'NODE_PG_FORCE_NATIVE',
  'PGAPPNAME',
  'PGBINARY',
  'PGCHANNELBINDING',
  'PGCLIENTENCODING',
  'PGCLIENT_ENCODING',
  'PGCONNECT_TIMEOUT',
  'PGDATABASE',
  'PGGSSENCMODE',
  'PGHOST',
  'PGHOSTADDR',
  'PGKRBSRVNAME',
  'PGPASSFILE',
  'PGPASS_NO_DEESCAPE',
  'PGPASSWORD',
  'PGPORT',
  'PGREPLICATION',
  'PGREQUIREPEER',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGSSLCERT',
  'PGSSLCRL',
  'PGSSLKEY',
  'PGSSLMODE',
  'PGSSLNEGOTIATION',
  'PGSSLROOTCERT',
  'PGSSLSNI',
  'PGTARGETSESSIONATTRS',
  'PGUSER',
]);
const VALUE_OPTIONS = new Set([
  '--confirmation',
  '--target-id',
  '--output',
  '--backup-ref',
  '--restore-ref',
  '--reviewer',
]);

const HELP = `Uso local y read-only:
  npm run db:baseline:inspect -- --help
  npm run db:baseline:inspect -- --check-config \\
    --confirmation RESTORED_DISPOSABLE --target-id target:<id> \\
    --output <ruta-absoluta-fuera-del-repo.json> \\
    --backup-ref backup:<id> --restore-ref restore:<id> \\
    --reviewer reviewer:<id-1> --reviewer reviewer:<id-2>
  npm run db:baseline:inspect -- --connected <mismos argumentos>

WP0_DATABASE_URL es la unica fuente permitida para la URL PostgreSQL.
--check-config no abre conexiones ni escribe. --connected debe ser explicito.
El schema se hashea desde el blob del commit Git fijado, no desde el working tree.
Absent, empty e inconsistent se persisten como discovery no aprobable.
La salida es solo una observacion; no aprueba baseline, migracion ni release.
`;

function cliError(code, message, cause) {
  return new Wp0ObservationError(code, message, cause);
}

function parseArguments(argv) {
  if (!Array.isArray(argv)) throw cliError('CLI_ARGUMENTS_INVALID', 'Los argumentos CLI son invalidos.');
  const modeTokens = argv.filter(value => MODES.has(value));
  if (modeTokens.length !== 1) {
    throw cliError('CLI_MODE_REQUIRED', 'Use exactamente uno de --help, --check-config o --connected.');
  }
  const mode = modeTokens[0];
  if (mode === '--help') {
    if (argv.length !== 1) throw cliError('CLI_HELP_ARGUMENTS_INVALID', '--help no admite otros argumentos.');
    return Object.freeze({ mode: 'help' });
  }

  const values = new Map();
  const reviewers = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === mode) continue;
    if (!VALUE_OPTIONS.has(token)) {
      throw cliError('CLI_OPTION_INVALID', 'Opcion WP0-L no permitida.');
    }
    const value = argv[index + 1];
    if (typeof value !== 'string' || value.startsWith('--')) {
      throw cliError('CLI_VALUE_REQUIRED', `Falta el valor de ${token}.`);
    }
    index += 1;
    if (token === '--reviewer') {
      reviewers.push(value);
      continue;
    }
    if (values.has(token)) throw cliError('CLI_OPTION_DUPLICATED', `${token} no puede repetirse.`);
    values.set(token, value);
  }

  const required = ['--confirmation', '--target-id', '--output', '--backup-ref', '--restore-ref'];
  for (const option of required) {
    if (!values.has(option)) throw cliError('CLI_OPTION_REQUIRED', `Falta ${option}.`);
  }
  return Object.freeze({
    mode: mode === '--connected' ? 'connected' : 'check-config',
    confirmation: values.get('--confirmation'),
    targetId: values.get('--target-id'),
    outputPath: values.get('--output'),
    backupRef: values.get('--backup-ref'),
    restoreRef: values.get('--restore-ref'),
    reviewerIds: Object.freeze(reviewers),
  });
}

async function resolveCommit(repoRoot, runExecFile = execFile) {
  let stdout;
  try {
    ({ stdout } = await runExecFile('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      windowsHide: true,
    }));
  } catch (error) {
    throw cliError('COMMIT_UNAVAILABLE', 'No se pudo fijar el commit Git observado.', error);
  }
  const commit = String(stdout || '').trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/u.test(commit)) throw cliError('COMMIT_INVALID', 'Git no devolvio un commit SHA-1 exacto.');
  let statusStdout;
  try {
    ({ stdout: statusStdout } = await runExecFile(
      'git',
      ['status', '--porcelain=v1', '--untracked-files=all'],
      { cwd: repoRoot, encoding: 'utf8', windowsHide: true },
    ));
  } catch (error) {
    throw cliError('WORKTREE_STATE_UNAVAILABLE', 'No se pudo verificar el estado exacto del checkout.', error);
  }
  if (String(statusStdout || '') !== '') {
    throw cliError('WORKTREE_NOT_CLEAN', 'WP0-L exige un checkout limpio antes de observar la copia restaurada.');
  }
  let indexStdout;
  try {
    ({ stdout: indexStdout } = await runExecFile(
      'git',
      ['ls-files', '-v', '--full-name'],
      { cwd: repoRoot, encoding: 'utf8', windowsHide: true },
    ));
  } catch (error) {
    throw cliError('WORKTREE_INDEX_UNAVAILABLE', 'No se pudo verificar el indice Git completo.', error);
  }
  const indexLines = String(indexStdout || '').split(/\r?\n/u).filter(Boolean);
  if (indexLines.some(line => !/^H /u.test(line))) {
    throw cliError(
      'WORKTREE_INDEX_FLAGS_FORBIDDEN',
      'WP0-L rechaza archivos assume-unchanged, skip-worktree o estados no ordinarios del indice.',
    );
  }
  return commit;
}

async function resolveSchemaSha256(repoRoot, commit, runExecFile = execFile) {
  if (!/^[a-f0-9]{40}$/u.test(String(commit || ''))) {
    throw cliError('COMMIT_INVALID', 'No se puede fijar el schema sin un commit Git SHA-1 exacto.');
  }
  let treeStdout;
  try {
    ({ stdout: treeStdout } = await runExecFile(
      'git',
      ['ls-tree', commit, '--', 'prisma/schema.prisma'],
      { cwd: repoRoot, encoding: 'utf8', windowsHide: true },
    ));
  } catch (error) {
    throw cliError('SCHEMA_BLOB_UNAVAILABLE', 'No se pudo fijar la entrada Git de prisma/schema.prisma.', error);
  }
  const treeEntry = String(treeStdout || '').trim();
  const match = /^100644 blob ([a-f0-9]{40})\tprisma\/schema\.prisma$/u.exec(treeEntry);
  if (!match) {
    throw cliError('SCHEMA_BLOB_ENTRY_INVALID', 'prisma/schema.prisma debe ser un blob Git regular 100644 único.');
  }

  let stdout;
  try {
    ({ stdout } = await runExecFile(
      'git',
      ['cat-file', 'blob', match[1]],
      { cwd: repoRoot, encoding: null, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
    ));
  } catch (error) {
    throw cliError('SCHEMA_BLOB_UNAVAILABLE', 'No se pudo leer prisma/schema.prisma desde el commit fijado.', error);
  }
  const schema = Buffer.isBuffer(stdout) ? stdout : Buffer.from(String(stdout || ''), 'utf8');
  if (schema.length === 0) throw cliError('SCHEMA_BLOB_EMPTY', 'El schema fijado por Git está vacío.');
  return crypto.createHash('sha256').update(schema).digest('hex');
}

async function createPgAdapter(databaseUrl) {
  const client = new pg.Client({
    connectionString: databaseUrl,
    // A non-empty explicit value prevents node-postgres from inheriting
    // PGOPTIONS, which could otherwise forge the restored-copy GUC markers.
    options: WP0_SAFE_PG_OPTIONS,
    application_name: 'municontrol-wp0-observer',
    connectionTimeoutMillis: 10_000,
    query_timeout: 30_000,
    statement_timeout: 30_000,
  });
  try {
    await client.connect();
  } catch (error) {
    try { await client.end(); } catch { /* best-effort cleanup; original failure remains authoritative */ }
    throw error;
  }
  return Object.freeze({
    query: query => client.query({ text: query.text, values: [...query.values] }),
    close: () => client.end(),
  });
}

function safeResult(result) {
  return JSON.stringify(result);
}

async function runCli(argv, {
  env = process.env,
  repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  stdout = process.stdout,
  adapterFactory = createPgAdapter,
  commitResolver = resolveCommit,
  schemaResolver = resolveSchemaSha256,
  clock = () => new Date(),
} = {}) {
  const args = parseArguments(argv);
  if (args.mode === 'help') {
    stdout.write(HELP);
    return Object.freeze({ mode: 'help' });
  }
  if (typeof env.WP0_DATABASE_URL !== 'string' || env.WP0_DATABASE_URL.length === 0) {
    throw cliError('DATABASE_URL_REQUIRED', 'Falta WP0_DATABASE_URL en el entorno local.');
  }
  if (typeof env.PGOPTIONS === 'string' && env.PGOPTIONS.trim() !== '') {
    throw cliError(
      'AMBIENT_PGOPTIONS_FORBIDDEN',
      'WP0-L no admite PGOPTIONS del entorno; la sesion PostgreSQL debe ser cerrada y reproducible.',
    );
  }
  const ambientPostgresSetting = WP0_FORBIDDEN_AMBIENT_POSTGRES_ENV.find(name => (
    typeof env[name] === 'string' && env[name].trim() !== ''
  ));
  if (ambientPostgresSetting) {
    throw cliError(
      'AMBIENT_POSTGRES_ENV_FORBIDDEN',
      'WP0-L no admite configuracion PostgreSQL ambiental; WP0_DATABASE_URL es la unica fuente de conexion.',
    );
  }
  if (String(env.NODE_TLS_REJECT_UNAUTHORIZED || '').trim() === '0') {
    throw cliError(
      'TLS_VERIFICATION_ENV_FORBIDDEN',
      'WP0-L no admite NODE_TLS_REJECT_UNAUTHORIZED=0.',
    );
  }

  const rawConfig = {
    confirmation: args.confirmation,
    targetId: args.targetId,
    outputPath: args.outputPath,
    backupRef: args.backupRef,
    restoreRef: args.restoreRef,
    reviewerIds: args.reviewerIds,
    databaseUrl: env.WP0_DATABASE_URL,
    nodeEnv: env.NODE_ENV,
    repoRoot,
  };
  const config = await validateObservationConfig(rawConfig);
  const commit = await commitResolver(repoRoot);
  const schemaSha256 = await schemaResolver(repoRoot, commit);

  if (args.mode === 'check-config') {
    const result = Object.freeze({
      mode: 'check-config',
      status: 'valid',
      commit,
      schemaSha256,
      targetId: config.targetId,
      outputPath: config.outputPath,
      connected: false,
      written: false,
    });
    stdout.write(`${safeResult(result)}\n`);
    return result;
  }

  let adapter;
  let observation;
  try {
    adapter = await adapterFactory(config.databaseUrl);
    if (!adapter || typeof adapter.query !== 'function' || typeof adapter.close !== 'function') {
      throw cliError('QUERY_ADAPTER_INVALID', 'El adaptador PostgreSQL es invalido.');
    }
    observation = await runRestoredCopyObservation({
      adapter,
      config,
      commit,
      schemaSha256,
      now: clock(),
    });
  } finally {
    if (adapter) await adapter.close();
  }
  const output = await writeObservationFile({
    outputPath: config.outputPath,
    repoRoot: config.repoRoot,
    observation,
  });
  const result = Object.freeze({
    mode: 'connected',
    status: 'observed',
    targetId: config.targetId,
    outputPath: output.outputPath,
    observationSha256: output.sha256,
    collectionMode: observation.quality.collectionMode,
    migrationHistoryState: observation.inventory.prismaMigrations.state,
    bytes: output.bytes,
    connected: true,
    written: true,
  });
  stdout.write(`${safeResult(result)}\n`);
  return result;
}

function formatFailure(error) {
  const code = error instanceof Wp0ObservationError ? error.code : 'UNEXPECTED_FAILURE';
  const message = error instanceof Wp0ObservationError
    ? error.message
    : 'Fallo inesperado de WP0-L; no se imprimen detalles para evitar fugas.';
  return `[WP0-L:${code}] ${message}`;
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entrypoint === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${formatFailure(error)}\n`);
    process.exitCode = 1;
  });
}

export {
  HELP,
  WP0_FORBIDDEN_AMBIENT_POSTGRES_ENV,
  WP0_SAFE_PG_OPTIONS,
  createPgAdapter,
  formatFailure,
  parseArguments,
  resolveCommit,
  resolveSchemaSha256,
  runCli,
};
