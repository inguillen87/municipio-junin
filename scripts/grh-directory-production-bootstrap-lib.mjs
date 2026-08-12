import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import bcrypt from 'bcryptjs';

import {
  inspectGrhDirectoryArtifact,
  inspectGrhDirectoryResponse,
} from '../api/lib/grh-directory-contract.js';
import { flattenGrhDirectoryArtifact } from '../api/lib/grh-directory-publication.js';
import {
  BOOTSTRAP_INTERNAL_STAGES,
  renderGrhDirectoryBootstrapFunction,
} from './grh-directory-bootstrap-function-template.mjs';

export const BOOTSTRAP_CONTRACT = 'grh-directory-bootstrap-v3';
export const DIRECTORY_CONTRACT = 'grh-directory-v3';
export const PILOT_ROLE = 'INTENDENTE';
export const PILOT_NAME = 'Piloto privado GRH';
export const BOOTSTRAP_MODES = Object.freeze(['ddl', 'encrypted_snapshot']);
export const SNAPSHOT_KEY_ENV = 'GRH_DIRECTORY_SNAPSHOT_KEY_V1';
export const SNAPSHOT_KEY_VERSION = 'v1';
export const STABLE_PRODUCTION_URL = 'https://municipio-junin.vercel.app';
export const VERCEL_PROJECT = 'municipio-junin';
export const VERCEL_SCOPE = 'marcelos-projects-c26aa499';
export const MAX_COMPRESSED_BYTES = 4_000_000;
export const MAX_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;
export const EXPECTED_MIGRATION_003_SHA256 = 'c33ef9e79c3960d26d377daae2a62b210a62be0733bb4480ec30fd48d1641b19';
export const EXPECTED_MIGRATION_004_SHA256 = '0c4984cdfbe8a25b2f100925d0c3ca96702fa7a572587a6d830b8092c2c21a04';
export const EXPECTED_MIGRATION_005_SHA256 = '87d87ed17a67a99e34c5a9b5a8dcdb37a4dc57e485d1e9516e5da78729c1d671';
export const EXPECTED_MIGRATION_SHA256 = '8399ad200938250fd30538ddb102da1ea9507a97ac4f189185cc7af837e168c9';
export const EXPECTED_MANIFEST_SHA256 = 'c19d48c256914124a160315243b4ddd0aa46ff0c8c6977f2955a9abb56c4b42a';
export const EXPECTED_SOURCE_MANIFEST = Object.freeze({
  schema_version: 'grh-source-manifest-v1',
  canonical_system: 'GRH Jun\u00edn',
  source_file: 'grh_junin.backup_2026080615_plataforma.sql.gz',
  sha256: 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9',
  compressed_size_bytes: 44_537_741,
  snapshot_as_of: '2026-08-06',
  excluded_sources: Object.freeze(['personas_junin']),
  approval_basis: 'Backup GRH designado por el usuario como snapshot municipal can\u00f3nico el 2026-08-08.',
});

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPOSITORY_ROOT = path.resolve(moduleDirectory, '..');
const CURL_RECEIPT_MARKER = '__MUNICTRL_RECEIPT__';
const MAX_PROTECTED_RESPONSE_BYTES = 2 * 1024 * 1024;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PREVIEW_BRANCH_PATTERN = /^(?!master$)(?!refs\/)[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const REQUIRED_PREVIEW_ENVIRONMENT_NAMES = Object.freeze([
  'DATABASE_URL', 'DIRECT_URL', 'JWT_SECRET', 'GRH_TENANT_ID',
  'GRH_SOURCE_SHA256', 'GRH_ARTIFACT_SOURCE',
]);
const DATABASE_TARGET_FINGERPRINT_HELPER = 'scripts/print-database-target-fingerprint.mjs';
const DATABASE_TARGET_FINGERPRINT_MARKER = '__MUNICTRL_DATABASE_TARGET__';
const BOOTSTRAP_STATE_STATUSES = new Set([
  'prepared', 'deployment_created', 'preapply_cleanup_required', 'deployed',
  'apply_started', 'apply_ambiguous', 'applied', 'verified', 'cleaned',
  'production_verified', 'finalized',
]);
const INTERNAL_BOOTSTRAP_CODES = new Set(
  BOOTSTRAP_INTERNAL_STAGES.map(stage => `BOOTSTRAP_INTERNAL_${stage.toUpperCase()}`),
);
const FORBIDDEN_RESPONSE_KEYS = new Set([
  'dni', 'cuil', 'contact', 'contacto', 'address', 'domicilio', 'bank_account',
  'bankAccount', 'salary', 'salario', 'event_cause', 'eventCause', 'cause',
  'causa', 'notes', 'notas', 'observaciones',
]);

export class BootstrapToolError extends Error {
  constructor(code, pgCode = null) {
    super('GRH directory production bootstrap failed');
    this.name = 'BootstrapToolError';
    this.code = code;
    if (typeof pgCode === 'string' && /^[0-9A-Z]{5}$/.test(pgCode)) this.pgCode = pgCode;
  }
}

function fail(code, pgCode = null) {
  throw new BootstrapToolError(code, pgCode);
}

function normalizeNewlines(value) {
  return value.replace(/\r\n/g, '\n');
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isInside(candidate, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readJson(target, code) {
  try {
    return JSON.parse(await fs.readFile(target, 'utf8'));
  } catch {
    fail(code);
  }
}

async function writeExclusive(target, value) {
  try {
    await fs.writeFile(target, value, { flag: 'wx', mode: 0o600 });
  } catch {
    fail('BOOTSTRAP_FILE_ALREADY_EXISTS');
  }
}

async function writeState(statePath, state, securePathImpl) {
  await fs.writeFile(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  await securePathImpl(statePath, false);
}

function parseWindowsSid(output) {
  const match = String(output || '').match(/S-\d-(?:\d+-){1,14}\d+/);
  return match?.[0] || null;
}

export function resolveBootstrapCommandInvocation(command, args) {
  if (process.platform !== 'win32') return { command, args };
  if (command === 'vercel') {
    const commandLine = '"' + ['vercel.cmd', ...args].map(value => {
      const text = String(value);
      if (/[\0\r\n"%]/.test(text)) fail('BOOTSTRAP_COMMAND_ARGUMENT_INVALID');
      return `"${text}"`;
    }).join(' ') + '"';
    return {
      command: process.env['ComSpec'] || 'cmd.exe',
      args: ['/d', '/v:off', '/s', '/c', commandLine],
    };
  }
  if (command === 'git') return { command: 'git.exe', args };
  return { command, args };
}

export function defaultCommandRunner(command, args, { cwd, input } = {}) {
  const invocation = resolveBootstrapCommandInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    input,
    encoding: 'utf8',
    windowsHide: true,
    windowsVerbatimArguments: process.platform === 'win32' && command === 'vercel',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) fail('BOOTSTRAP_COMMAND_FAILED');
  return Object.freeze({ stdout: result.stdout || '', stderr: result.stderr || '' });
}

export async function defaultSecurePath(target, directory = false) {
  await fs.chmod(target, directory ? 0o700 : 0o600).catch(() => {});
  if (process.platform !== 'win32') return;
  const identity = spawnSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const sid = identity.status === 0 ? parseWindowsSid(identity.stdout) : null;
  if (!sid) fail('BOOTSTRAP_ACL_FAILED');
  const permission = directory ? '*'+ sid + ':(OI)(CI)F' : '*' + sid + ':F';
  const acl = spawnSync('icacls.exe', [target, '/inheritance:r', '/grant:r', permission], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (acl.status !== 0) fail('BOOTSTRAP_ACL_FAILED');
}

function validManifest(manifest) {
  return exactKeys(manifest, Object.keys(EXPECTED_SOURCE_MANIFEST)) &&
    JSON.stringify(manifest) === JSON.stringify(EXPECTED_SOURCE_MANIFEST);
}

function validateArtifactPins(artifact, manifest) {
  if (!inspectGrhDirectoryArtifact(artifact).ok || artifact.schema_version !== DIRECTORY_CONTRACT) {
    fail('BOOTSTRAP_ARTIFACT_INVALID');
  }
  const source = artifact.source;
  if (source.canonical_system !== manifest.canonical_system ||
      source.file !== manifest.source_file ||
      source.sha256 !== manifest.sha256 ||
      source.compressed_size_bytes !== manifest.compressed_size_bytes ||
      source.snapshot_as_of !== manifest.snapshot_as_of) {
    fail('BOOTSTRAP_ARTIFACT_SOURCE_MISMATCH');
  }
}

function validateBcryptHash(hash) {
  if (!/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(hash || '')) fail('BOOTSTRAP_PASSWORD_HASH_INVALID');
  try {
    if (bcrypt.getRounds(hash) !== 12) fail('BOOTSTRAP_PASSWORD_HASH_INVALID');
  } catch {
    fail('BOOTSTRAP_PASSWORD_HASH_INVALID');
  }
}

function randomPilotEmail(bytes) {
  return 'piloto-grh-' + bytes.toString('hex').slice(0, 12) + '@municontrol.local';
}

function sensitivePaths(stateDir) {
  return Object.freeze({
    credentialPath: path.join(stateDir, 'grh-directory-pilot.credentials.json'),
    secretPath: path.join(stateDir, 'grh-directory-bootstrap.secret'),
    snapshotKeyPath: path.join(stateDir, 'grh-directory-snapshot-key-v1.secret'),
    allowedUserIdPath: path.join(stateDir, 'grh-directory-bootstrap.allowed-user-id'),
    payloadPath: path.join(stateDir, 'grh-directory-bootstrap.payload.json.gz'),
    statePath: path.join(stateDir, 'grh-directory-bootstrap.state.json'),
  });
}

function exactGitOutput(runner, cwd, args, code) {
  const value = run(runner, 'git', args, { cwd }).stdout.trim();
  if (/\r|\n/.test(value)) fail(code);
  return value;
}

function assertPinnedGitState({
  runner,
  repositoryRoot,
  worktreePath,
  expectedGitSha = null,
  endpointRelativePath = null,
  preparing = false,
  target = 'production',
  previewBranch = null,
} = {}) {
  const code = preparing ? 'BOOTSTRAP_PREPARE_GIT_PIN_INVALID' : 'BOOTSTRAP_GIT_PIN_INVALID';
  const sourceHead = exactGitOutput(runner, repositoryRoot, ['rev-parse', '--verify', 'HEAD'], code);
  const pinnedRef = target === 'preview'
    ? `refs/remotes/origin/${previewBranch}`
    : 'refs/remotes/origin/master';
  const sourceOrigin = exactGitOutput(runner, repositoryRoot, ['rev-parse', '--verify', pinnedRef], code);
  const worktreeHead = exactGitOutput(runner, worktreePath, ['rev-parse', '--verify', 'HEAD'], code);
  const worktreeOrigin = exactGitOutput(runner, worktreePath, ['rev-parse', '--verify', pinnedRef], code);
  const branch = exactGitOutput(runner, worktreePath, ['branch', '--show-current'], code);
  const status = run(runner, 'git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: worktreePath,
  }).stdout;
  const pinned = expectedGitSha || (target === 'preview' ? sourceOrigin : sourceHead);
  const sourcePinned = target === 'preview' ? true : sourceHead === pinned;
  const expectedBranch = target === 'preview' ? previewBranch : '';
  if (!GIT_SHA_PATTERN.test(pinned) || !sourcePinned || sourceOrigin !== pinned ||
      worktreeHead !== pinned || worktreeOrigin !== pinned || branch !== expectedBranch ||
      (preparing ? String(status).trim() !== '' : !exactWorktreeStatus(status, endpointRelativePath))) {
    fail(code);
  }
  return pinned;
}

export async function prepareBootstrapBundle({
  mode,
  target = 'production',
  previewBranch = null,
  databaseTargetFingerprintSha256 = null,
  stableDatabaseTargetFingerprintSha256 = null,
  worktreePath,
  artifactPath,
  stateDirectory,
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  now = () => new Date(),
  randomBytesImpl = randomBytes,
  randomUuidImpl = randomUUID,
  bcryptHashImpl = (password, rounds) => bcrypt.hash(password, rounds),
  securePathImpl = defaultSecurePath,
  runner = defaultCommandRunner,
  compressedLimit = MAX_COMPRESSED_BYTES,
  uncompressedLimit = MAX_UNCOMPRESSED_BYTES,
} = {}) {
  if (!BOOTSTRAP_MODES.includes(mode)) fail('BOOTSTRAP_MODE_REQUIRED');
  if (!['production', 'preview'].includes(target)) fail('BOOTSTRAP_TARGET_INVALID');
  if (target === 'preview') {
    if (mode !== 'ddl') fail('BOOTSTRAP_PREVIEW_MODE_INVALID');
    if (!PREVIEW_BRANCH_PATTERN.test(previewBranch || '')) fail('BOOTSTRAP_PREVIEW_BRANCH_INVALID');
    if (!SHA256_PATTERN.test(databaseTargetFingerprintSha256 || '') ||
        !SHA256_PATTERN.test(stableDatabaseTargetFingerprintSha256 || '') ||
        databaseTargetFingerprintSha256 === stableDatabaseTargetFingerprintSha256) {
      fail('BOOTSTRAP_PREVIEW_DATABASE_TARGET_INVALID');
    }
  } else if (previewBranch !== null || databaseTargetFingerprintSha256 !== null ||
      stableDatabaseTargetFingerprintSha256 !== null) {
    fail('BOOTSTRAP_PRODUCTION_TARGET_ARGUMENT_INVALID');
  }
  if (!worktreePath || !artifactPath || !stateDirectory) fail('BOOTSTRAP_ARGUMENT_REQUIRED');
  const sourceRoot = path.resolve(repositoryRoot);
  const worktree = path.resolve(worktreePath);
  const artifactFile = path.resolve(artifactPath);
  const stateDir = path.resolve(stateDirectory);
  if (worktree === sourceRoot || isInside(stateDir, sourceRoot) || isInside(stateDir, worktree) ||
      isInside(worktree, stateDir)) {
    fail('BOOTSTRAP_PATH_SCOPE_INVALID');
  }
  if (!(await exists(path.join(worktree, 'api', 'lib', 'grh-directory-contract.js'))) ||
      !(await exists(path.join(worktree, 'api', 'lib', 'grh-directory-publication.js'))) ||
      !(await exists(path.join(worktree, 'api', 'lib', 'grh-directory-snapshot.js'))) ||
      !(await exists(path.join(worktree, 'shared', 'database-url-policy.cjs'))) ||
      !(await exists(path.join(worktree, 'shared', 'published-demo-policy.cjs'))) ||
      !(await exists(path.join(worktree, 'vercel.json')))) {
    fail('BOOTSTRAP_WORKTREE_INVALID');
  }
  if (target === 'preview') {
    const fingerprintLibraryPresent = await exists(
      path.join(worktree, 'api', 'lib', 'database-target-fingerprint.js'),
    );
    const fingerprintHelperPresent = await exists(
      path.join(worktree, DATABASE_TARGET_FINGERPRINT_HELPER),
    );
    if (!fingerprintLibraryPresent || !fingerprintHelperPresent) {
      fail('BOOTSTRAP_PREVIEW_WORKTREE_INVALID');
    }
  }
  if (await exists(stateDir)) fail('BOOTSTRAP_STATE_DIRECTORY_EXISTS');

  const expectedGitSha = assertPinnedGitState({
    runner,
    repositoryRoot: sourceRoot,
    worktreePath: worktree,
    preparing: true,
    target,
    previewBranch,
  });

  const baseMigrationPath = path.join(sourceRoot, 'migrations', '003_grh_directory.sql');
  const upgradeMigrationPath = path.join(sourceRoot, 'migrations', '004_grh_directory_v2.sql');
  const employmentMigrationPath = path.join(sourceRoot, 'migrations', '005_grh_directory_v3.sql');
  const manifestPath = path.join(sourceRoot, 'config', 'grh-source-manifest.json');
  const baseMigrationSql = normalizeNewlines(await fs.readFile(baseMigrationPath, 'utf8'));
  const upgradeMigrationSql = normalizeNewlines(await fs.readFile(upgradeMigrationPath, 'utf8'));
  const employmentMigrationSql = normalizeNewlines(await fs.readFile(employmentMigrationPath, 'utf8'));
  const migrationSql = baseMigrationSql + '\n' + upgradeMigrationSql + '\n' + employmentMigrationSql;
  const manifestText = normalizeNewlines(await fs.readFile(manifestPath, 'utf8'));
  const baseMigrationSha256 = sha256(Buffer.from(baseMigrationSql, 'utf8'));
  const upgradeMigrationSha256 = sha256(Buffer.from(upgradeMigrationSql, 'utf8'));
  const employmentMigrationSha256 = sha256(Buffer.from(employmentMigrationSql, 'utf8'));
  const migrationSha256 = sha256(Buffer.from(migrationSql, 'utf8'));
  const manifestSha256 = sha256(Buffer.from(manifestText, 'utf8'));
  if (baseMigrationSha256 !== EXPECTED_MIGRATION_003_SHA256 ||
      upgradeMigrationSha256 !== EXPECTED_MIGRATION_004_SHA256 ||
      employmentMigrationSha256 !== EXPECTED_MIGRATION_005_SHA256 ||
      migrationSha256 !== EXPECTED_MIGRATION_SHA256 ||
      manifestSha256 !== EXPECTED_MANIFEST_SHA256) {
    fail('BOOTSTRAP_SOURCE_CONTRACT_DRIFT');
  }
  const manifest = JSON.parse(manifestText);
  if (!validManifest(manifest)) fail('BOOTSTRAP_MANIFEST_INVALID');
  const artifact = await readJson(artifactFile, 'BOOTSTRAP_ARTIFACT_UNREADABLE');
  validateArtifactPins(artifact, manifest);
  const flattened = flattenGrhDirectoryArtifact(artifact);
  const positionObservationCount = flattened.people.filter(
    person => person.position_observation_label !== null,
  ).length;

  const operationId = randomUuidImpl();
  const requestId = randomUuidImpl();
  const pilotId = randomUuidImpl();
  if (![operationId, requestId, pilotId].every(value => /^[0-9a-f-]{36}$/.test(value || ''))) {
    fail('BOOTSTRAP_RANDOMNESS_INVALID');
  }
  const password = randomBytesImpl(27).toString('base64url');
  const bootstrapSecret = randomBytesImpl(32).toString('base64url');
  const snapshotKey = mode === 'encrypted_snapshot'
    ? randomBytesImpl(32).toString('base64url')
    : null;
  const email = randomPilotEmail(randomBytesImpl(12));
  if (password.length < 14 || Buffer.byteLength(password, 'utf8') > 72 || bootstrapSecret.length < 32 ||
      (mode === 'encrypted_snapshot' &&
        (!/^[A-Za-z0-9_-]{43}$/.test(snapshotKey) || Buffer.from(snapshotKey, 'base64url').length !== 32))) {
    fail('BOOTSTRAP_RANDOMNESS_INVALID');
  }
  const passwordHash = await bcryptHashImpl(password, 12);
  validateBcryptHash(passwordHash);
  const createdAt = now().toISOString();
  const snapshotKeyFingerprintSha256 = snapshotKey === null
    ? null
    : sha256(Buffer.from(snapshotKey, 'base64url'));
  const envelope = {
    operation: { contract: BOOTSTRAP_CONTRACT, operationId, requestId },
    manifest,
    artifact,
    pilot: { id: pilotId, email, name: PILOT_NAME, role: PILOT_ROLE, passwordHash },
  };
  const rawEnvelope = Buffer.from(JSON.stringify(envelope), 'utf8');
  if (rawEnvelope.length > uncompressedLimit) fail('BOOTSTRAP_UNCOMPRESSED_BODY_TOO_LARGE');
  const compressed = gzipSync(rawEnvelope, { level: 9, mtime: 0 });
  if (compressed.length > compressedLimit) fail('BOOTSTRAP_COMPRESSED_BODY_TOO_LARGE');

  const endpointName = 'internal-grh-directory-bootstrap-' + operationId.replaceAll('-', '').slice(0, 16) + '.js';
  const endpointRelativePath = path.posix.join('api', endpointName);
  const endpointPath = path.join(worktree, 'api', endpointName);
  const endpointSource = renderGrhDirectoryBootstrapFunction({
    mode,
    expectedVercelEnv: target,
    databaseTargetFingerprintSha256,
    operationId,
    migrationSql,
    migrationSha256,
    manifest,
    manifestSha256,
  });
  if (endpointSource.includes(password) || endpointSource.includes(bootstrapSecret) ||
      (snapshotKey && endpointSource.includes(snapshotKey)) ||
      endpointSource.includes(passwordHash) || endpointSource.includes(email) || endpointSource.includes(pilotId)) {
    fail('BOOTSTRAP_SECRET_EMBEDDING_FORBIDDEN');
  }

  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  await securePathImpl(stateDir, true);
  const paths = sensitivePaths(stateDir);
  const credential = {
    schemaVersion: 'grh-directory-pilot-credential-v1',
    userId: pilotId,
    email,
    password,
    role: PILOT_ROLE,
    createdAt,
  };
  const state = {
    schemaVersion: BOOTSTRAP_CONTRACT,
    mode,
    target,
    previewBranch,
    databaseTargetFingerprintSha256,
    stableDatabaseTargetFingerprintSha256,
    expectedGitSha,
    status: 'prepared',
    createdAt,
    repositoryRoot: sourceRoot,
    worktreePath: worktree,
    endpointRelativePath,
    endpointPath,
    endpointRoute: '/api/' + endpointName.replace(/\.js$/, ''),
    endpointSha256: sha256(Buffer.from(endpointSource, 'utf8')),
    payloadPath: paths.payloadPath,
    payloadSha256: sha256(compressed),
    payloadBytes: compressed.length,
    uncompressedBytes: rawEnvelope.length,
    credentialPath: paths.credentialPath,
    secretPath: paths.secretPath,
    snapshotKeyPath: mode === 'encrypted_snapshot' ? paths.snapshotKeyPath : null,
    snapshotKeyVersion: mode === 'encrypted_snapshot' ? SNAPSHOT_KEY_VERSION : null,
    snapshotKeyFingerprintSha256,
    allowedUserIdPath: paths.allowedUserIdPath,
    operationId,
    requestId,
    migrationSha256,
    manifestSha256,
    sourceSha256: manifest.sha256,
    snapshotAsOf: manifest.snapshot_as_of,
    recordCount: flattened.people.length,
    absenceRecordCount: flattened.absenceEvents.length,
    leaveRecordCount: flattened.leaveEvents.length,
    movementPeriodCount: flattened.movementPeriods.length,
    positionObservationCount,
    stableProductionUrl: STABLE_PRODUCTION_URL,
    deployment: null,
    productionVerification: null,
    finalizedAt: null,
  };

  try {
    await writeExclusive(endpointPath, endpointSource);
    await writeExclusive(paths.credentialPath, JSON.stringify(credential, null, 2) + '\n');
    await securePathImpl(paths.credentialPath, false);
    await writeExclusive(paths.secretPath, bootstrapSecret);
    await securePathImpl(paths.secretPath, false);
    if (snapshotKey !== null) {
      await writeExclusive(paths.snapshotKeyPath, snapshotKey);
      await securePathImpl(paths.snapshotKeyPath, false);
    }
    await writeExclusive(paths.allowedUserIdPath, pilotId);
    await securePathImpl(paths.allowedUserIdPath, false);
    await writeExclusive(paths.payloadPath, compressed);
    await securePathImpl(paths.payloadPath, false);
    await writeExclusive(paths.statePath, JSON.stringify(state, null, 2) + '\n');
    await securePathImpl(paths.statePath, false);
  } catch (error) {
    await fs.rm(endpointPath, { force: true }).catch(() => {});
    await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  return Object.freeze({
    statePath: paths.statePath,
    mode,
    target,
    previewBranch,
    databaseTargetFingerprintSha256,
    stableDatabaseTargetFingerprintSha256,
    expectedGitSha,
    endpointRelativePath,
    payloadBytes: compressed.length,
    uncompressedBytes: rawEnvelope.length,
    recordCount: flattened.people.length,
    leaveRecordCount: flattened.leaveEvents.length,
    positionObservationCount,
  });
}

function parseJsonOutput(result, code) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail(code);
  }
}

function collectEnvironmentNames(value, names = new Set()) {
  if (Array.isArray(value)) {
    value.forEach(item => collectEnvironmentNames(item, names));
  } else if (value && typeof value === 'object') {
    if (typeof value.name === 'string') names.add(value.name);
    if (typeof value.key === 'string') names.add(value.key);
    Object.values(value).forEach(item => collectEnvironmentNames(item, names));
  }
  return names;
}

function deploymentIdentity(value) {
  const candidate = value?.deployment && typeof value.deployment === 'object'
    ? value.deployment
    : value;
  const id = candidate?.id || candidate?.deploymentId || candidate?.uid;
  const rawUrl = candidate?.url || candidate?.deploymentUrl || candidate?.inspectorUrl;
  const url = typeof rawUrl === 'string'
    ? (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') ? rawUrl : 'https://' + rawUrl)
    : null;
  return { id: typeof id === 'string' ? id : null, url };
}

function readyDeployment(value, expectedId, expectedTarget = 'production') {
  const identity = deploymentIdentity(value);
  const status = String(value?.readyState || value?.status || value?.state || '').toUpperCase();
  const target = String(value?.target || value?.environment || '').toLowerCase();
  return identity.id === expectedId && ['READY', 'READY_STATE_READY'].includes(status) &&
    (expectedTarget === 'production' ? (!target || target === 'production') : target === expectedTarget);
}

function deploymentGitSha(value) {
  const candidates = [
    value?.meta?.githubCommitSha,
    value?.meta?.gitCommitSha,
    value?.gitSource?.sha,
    value?.source?.sha,
  ].filter(candidate => candidate !== undefined && candidate !== null);
  if (candidates.length === 0 || candidates.some(candidate => !GIT_SHA_PATTERN.test(candidate))) {
    return null;
  }
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique[0] : null;
}

function deploymentGitRef(value) {
  const candidates = [
    value?.meta?.githubCommitRef,
    value?.meta?.gitCommitRef,
    value?.gitSource?.ref,
    value?.source?.ref,
  ].filter(candidate => candidate !== undefined && candidate !== null);
  if (candidates.length === 0 || candidates.some(candidate =>
    typeof candidate !== 'string' || !PREVIEW_BRANCH_PATTERN.test(candidate))) {
    return null;
  }
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique[0] : null;
}

function canonicalDeploymentOrigin(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.vercel.app') ||
        parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function inspectProductionAlias(value, state) {
  const deployment = deploymentIdentity(value);
  const target = String(value?.target || value?.environment || '').toLowerCase();
  const url = canonicalDeploymentOrigin(deployment.url);
  if (!deployment.id || !url || url === STABLE_PRODUCTION_URL ||
      !readyDeployment(value, deployment.id) || target !== 'production' ||
      deployment.id === state.deployment?.baselineAliasDeploymentId ||
      deployment.id === state.deployment?.id) {
    fail('BOOTSTRAP_PRODUCTION_RELEASE_INVALID');
  }
  return Object.freeze({ id: deployment.id, url });
}

function productionListEntries(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray(value.deployments)) {
    return value.deployments;
  }
  fail('BOOTSTRAP_PRODUCTION_LIST_INVALID');
}

function matchProductionListRelease(value, inspected, state) {
  const matches = productionListEntries(value).filter(entry => {
    const identity = deploymentIdentity(entry);
    return canonicalDeploymentOrigin(identity.url) === inspected.url;
  });
  if (matches.length !== 1) fail('BOOTSTRAP_PRODUCTION_RELEASE_INVALID');
  const release = matches[0];
  const identity = deploymentIdentity(release);
  const status = String(release?.readyState || release?.status || release?.state || '').toUpperCase();
  const target = String(release?.target || release?.environment || '').toLowerCase();
  const gitSha = deploymentGitSha(release);
  // `vercel ls --json` currently omits deployment IDs. The alias inspection is
  // authoritative for the ID; the list entry supplies Git provenance by exact
  // immutable deployment URL. Reject a conflicting ID when the CLI does emit one.
  if ((identity.id !== null && identity.id !== inspected.id) ||
      !['READY', 'READY_STATE_READY'].includes(status) || target !== 'production' ||
      gitSha !== state.expectedGitSha) {
    fail('BOOTSTRAP_PRODUCTION_RELEASE_INVALID');
  }
  return Object.freeze({ id: inspected.id, url: inspected.url, gitSha });
}

function inspectPreviewCandidate(value, state) {
  const identity = deploymentIdentity(value);
  const url = canonicalDeploymentOrigin(identity.url);
  if (!identity.id || !url || !readyDeployment(value, identity.id, 'preview') ||
      deploymentGitSha(value) !== state.expectedGitSha ||
      deploymentGitRef(value) !== state.previewBranch ||
      identity.id === state.deployment?.baselineAliasDeploymentId) {
    fail('BOOTSTRAP_PREVIEW_DEPLOYMENT_INVALID');
  }
  return Object.freeze({ id: identity.id, url });
}

function matchPreviewListCandidate(value, inspected, state) {
  const matches = productionListEntries(value).filter(entry =>
    canonicalDeploymentOrigin(deploymentIdentity(entry).url) === inspected.url);
  if (matches.length !== 1) fail('BOOTSTRAP_PREVIEW_DEPLOYMENT_INVALID');
  const candidate = matches[0];
  const identity = deploymentIdentity(candidate);
  if ((identity.id !== null && identity.id !== inspected.id) ||
      !readyDeployment({ ...candidate, id: identity.id || inspected.id }, identity.id || inspected.id, 'preview') ||
      deploymentGitSha(candidate) !== state.expectedGitSha ||
      deploymentGitRef(candidate) !== state.previewBranch) {
    fail('BOOTSTRAP_PREVIEW_DEPLOYMENT_INVALID');
  }
  return Object.freeze({
    id: inspected.id,
    url: inspected.url,
    gitSha: state.expectedGitSha,
    gitRef: state.previewBranch,
  });
}

function assertUniqueDeploymentUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail('BOOTSTRAP_DEPLOYMENT_URL_INVALID');
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.vercel.app') ||
      parsed.origin === STABLE_PRODUCTION_URL || parsed.pathname !== '/') {
    fail('BOOTSTRAP_DEPLOYMENT_URL_INVALID');
  }
  return parsed.origin;
}

async function loadState(statePath) {
  const resolved = path.resolve(statePath || '');
  const persisted = await readJson(resolved, 'BOOTSTRAP_STATE_UNREADABLE');
  const hasTargetContract = ['target', 'previewBranch', 'databaseTargetFingerprintSha256',
    'stableDatabaseTargetFingerprintSha256'].some(key => Object.hasOwn(persisted, key));
  if (hasTargetContract && !['target', 'previewBranch', 'databaseTargetFingerprintSha256',
    'stableDatabaseTargetFingerprintSha256'].every(key => Object.hasOwn(persisted, key))) {
    fail('BOOTSTRAP_STATE_INVALID');
  }
  const state = hasTargetContract ? persisted : {
    ...persisted,
    target: 'production',
    previewBranch: null,
    databaseTargetFingerprintSha256: null,
    stableDatabaseTargetFingerprintSha256: null,
  };
  if (!exactKeys(state, [
    'schemaVersion', 'mode', 'target', 'previewBranch', 'databaseTargetFingerprintSha256',
    'stableDatabaseTargetFingerprintSha256', 'expectedGitSha', 'status', 'createdAt',
    'repositoryRoot', 'worktreePath',
    'endpointRelativePath', 'endpointPath', 'endpointRoute', 'endpointSha256',
    'payloadPath', 'payloadSha256', 'payloadBytes', 'uncompressedBytes',
    'credentialPath', 'secretPath', 'snapshotKeyPath', 'snapshotKeyVersion',
    'snapshotKeyFingerprintSha256',
    'allowedUserIdPath', 'operationId', 'requestId',
    'migrationSha256', 'manifestSha256', 'sourceSha256', 'snapshotAsOf',
    'recordCount', 'absenceRecordCount', 'leaveRecordCount', 'movementPeriodCount',
    'positionObservationCount',
    'stableProductionUrl', 'deployment', 'productionVerification', 'finalizedAt',
  ]) || state.schemaVersion !== BOOTSTRAP_CONTRACT || !BOOTSTRAP_MODES.includes(state.mode) ||
      !['production', 'preview'].includes(state.target) ||
      (state.target === 'preview'
        ? (state.mode !== 'ddl' || !PREVIEW_BRANCH_PATTERN.test(state.previewBranch || '') ||
          !SHA256_PATTERN.test(state.databaseTargetFingerprintSha256 || '') ||
          !SHA256_PATTERN.test(state.stableDatabaseTargetFingerprintSha256 || '') ||
          state.databaseTargetFingerprintSha256 === state.stableDatabaseTargetFingerprintSha256)
        : (state.previewBranch !== null || state.databaseTargetFingerprintSha256 !== null ||
          state.stableDatabaseTargetFingerprintSha256 !== null)) ||
      !BOOTSTRAP_STATE_STATUSES.has(state.status) ||
      !GIT_SHA_PATTERN.test(state.expectedGitSha || '') ||
      state.stableProductionUrl !== STABLE_PRODUCTION_URL ||
      (state.mode === 'encrypted_snapshot'
        ? (typeof state.snapshotKeyPath !== 'string' || state.snapshotKeyVersion !== SNAPSHOT_KEY_VERSION ||
          !/^[0-9a-f]{64}$/.test(state.snapshotKeyFingerprintSha256 || ''))
        : (state.snapshotKeyPath !== null || state.snapshotKeyVersion !== null ||
          state.snapshotKeyFingerprintSha256 !== null)) ||
      (state.productionVerification === null
        ? ['production_verified', 'finalized'].includes(state.status) || state.finalizedAt !== null
        : (!exactKeys(state.productionVerification, ['deploymentId', 'gitSha', 'verifiedAt']) ||
          !/^dpl_[A-Za-z0-9_-]+$/.test(state.productionVerification.deploymentId || '') ||
          state.productionVerification.gitSha !== state.expectedGitSha ||
          !Number.isFinite(Date.parse(state.productionVerification.verifiedAt || '')) ||
          !['production_verified', 'finalized'].includes(state.status) ||
          (state.status === 'finalized'
            ? !Number.isFinite(Date.parse(state.finalizedAt || ''))
            : state.finalizedAt !== null)))) {
    fail('BOOTSTRAP_STATE_INVALID');
  }
  return { statePath: resolved, state };
}

async function verifyPreparedFiles(state) {
  const [endpoint, payload, credential, secret, allowedUserId, snapshotKey] = await Promise.all([
    fs.readFile(state.endpointPath),
    fs.readFile(state.payloadPath),
    readJson(state.credentialPath, 'BOOTSTRAP_CREDENTIAL_UNREADABLE'),
    fs.readFile(state.secretPath, 'utf8'),
    fs.readFile(state.allowedUserIdPath, 'utf8'),
    state.mode === 'encrypted_snapshot' ? fs.readFile(state.snapshotKeyPath, 'utf8') : Promise.resolve(null),
  ]).catch(() => fail('BOOTSTRAP_PREPARED_FILES_INVALID'));
  if (sha256(endpoint) !== state.endpointSha256 || sha256(payload) !== state.payloadSha256 ||
      payload.length !== state.payloadBytes || secret.length < 32 ||
      allowedUserId !== credential.userId || credential.role !== PILOT_ROLE ||
      (state.mode === 'encrypted_snapshot' &&
        (!/^[A-Za-z0-9_-]{43}$/.test(snapshotKey || '') ||
          Buffer.from(snapshotKey, 'base64url').length !== 32 ||
          Buffer.from(snapshotKey, 'base64url').toString('base64url') !== snapshotKey ||
          sha256(Buffer.from(snapshotKey, 'base64url')) !== state.snapshotKeyFingerprintSha256)) ||
      !/^[0-9a-f-]{36}$/.test(credential.userId || '') ||
      typeof credential.email !== 'string' || typeof credential.password !== 'string') {
    fail('BOOTSTRAP_PREPARED_FILES_INVALID');
  }
  return { endpoint, payload, credential, secret, allowedUserId, snapshotKey };
}

function run(runner, command, args, options) {
  const result = runner(command, args, options);
  if (!result || typeof result.stdout !== 'string') fail('BOOTSTRAP_COMMAND_RESULT_INVALID');
  return result;
}

function environmentTargetArgs(state) {
  return state.target === 'preview'
    ? ['preview', state.previewBranch]
    : ['production'];
}

function parseDatabaseTargetFingerprintOutput(result) {
  const output = result.stdout;
  if (Buffer.byteLength(output, 'utf8') > 16 * 1024) {
    fail('BOOTSTRAP_DATABASE_TARGET_PREFLIGHT_INVALID');
  }
  const matches = String(output).split(/\r?\n/u).filter(
    line => line.startsWith(DATABASE_TARGET_FINGERPRINT_MARKER),
  );
  if (matches.length !== 1) fail('BOOTSTRAP_DATABASE_TARGET_PREFLIGHT_INVALID');
  const fingerprint = matches[0].slice(DATABASE_TARGET_FINGERPRINT_MARKER.length);
  if (!SHA256_PATTERN.test(fingerprint)) fail('BOOTSTRAP_DATABASE_TARGET_PREFLIGHT_INVALID');
  return fingerprint;
}

function preflightPreviewDatabaseTargets(runner, state) {
  if (state.target !== 'preview') return;
  const stable = parseDatabaseTargetFingerprintOutput(run(
    runner,
    'vercel',
    ['env', 'run', '-e', 'production', '--', 'node', DATABASE_TARGET_FINGERPRINT_HELPER],
    { cwd: state.worktreePath },
  ));
  const candidate = parseDatabaseTargetFingerprintOutput(run(
    runner,
    'vercel',
    ['env', 'run', '-e', 'preview', '--git-branch', state.previewBranch, '--',
      'node', DATABASE_TARGET_FINGERPRINT_HELPER],
    { cwd: state.worktreePath },
  ));
  if (stable !== state.stableDatabaseTargetFingerprintSha256 ||
      candidate !== state.databaseTargetFingerprintSha256 || candidate === stable) {
    fail('BOOTSTRAP_DATABASE_TARGET_PREFLIGHT_MISMATCH');
  }
}

function inspectStableProduction(runner, state, code) {
  const inspection = parseJsonOutput(run(
    runner,
    'vercel',
    ['inspect', STABLE_PRODUCTION_URL, '--json'],
    { cwd: state.worktreePath },
  ), code);
  const identity = deploymentIdentity(inspection);
  const target = String(inspection?.target || inspection?.environment || '').toLowerCase();
  if (!identity.id || !readyDeployment(inspection, identity.id) || target !== 'production') fail(code);
  return Object.freeze({ id: identity.id, url: identity.url });
}

function inspectPreviewDeploymentProvenance(runner, state, deploymentUrl) {
  const inspection = parseJsonOutput(run(
    runner,
    'vercel',
    ['inspect', deploymentUrl, '--json', '--wait', '--timeout', '3m'],
    { cwd: state.worktreePath },
  ), 'BOOTSTRAP_DEPLOYMENT_INSPECTION_INVALID');
  const inspected = inspectPreviewCandidate(inspection, state);
  const deployments = parseJsonOutput(run(
    runner,
    'vercel',
    ['ls', VERCEL_PROJECT, '--environment', 'preview', '--json'],
    { cwd: state.worktreePath },
  ), 'BOOTSTRAP_PREVIEW_DEPLOYMENT_LIST_INVALID');
  return matchPreviewListCandidate(deployments, inspected, state);
}

function exactWorktreeStatus(output, endpointRelativePath) {
  const lines = String(output || '').split(/\r?\n/).filter(Boolean);
  return lines.length === 1 && lines[0] === '?? ' + endpointRelativePath.replaceAll('\\', '/');
}

function curlConfigQuote(value) {
  const text = String(value);
  if (/[\0\r\n]/.test(text)) fail('BOOTSTRAP_CURL_CONFIG_INVALID');
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\t', '\\t');
}

function buildProtectedCurlConfig({ method = 'GET', headers = {}, jsonBody, bodyFile } = {}) {
  if (!['GET', 'POST'].includes(method) || !headers || typeof headers !== 'object' ||
      Array.isArray(headers) || (jsonBody !== undefined && bodyFile !== undefined)) {
    fail('BOOTSTRAP_CURL_CONFIG_INVALID');
  }
  const lines = ['silent', 'show-error'];
  if (method !== 'GET') lines.push(`request = "${method}"`);
  for (const [name, value] of Object.entries(headers)) {
    if (!/^[A-Za-z0-9-]+$/.test(name) || typeof value !== 'string') {
      fail('BOOTSTRAP_CURL_CONFIG_INVALID');
    }
    lines.push(`header = "${curlConfigQuote(name + ': ' + value)}"`);
  }
  if (jsonBody !== undefined) {
    lines.push(`data-binary = "${curlConfigQuote(JSON.stringify(jsonBody))}"`);
  } else if (bodyFile !== undefined) {
    lines.push(`data-binary = "${curlConfigQuote('@' + path.resolve(bodyFile))}"`);
  }
  lines.push(`write-out = "\\n${CURL_RECEIPT_MARKER}%{http_code}|%header{x-municontrol-contract}"`);
  return lines.join('\n') + '\n';
}

function parseProtectedCurlResult(result, code) {
  const output = result.stdout;
  if (Buffer.byteLength(output, 'utf8') > MAX_PROTECTED_RESPONSE_BYTES) fail(code);
  const marker = '\n' + CURL_RECEIPT_MARKER;
  const markerIndex = output.lastIndexOf(marker);
  if (markerIndex < 0) fail(code);
  const receiptText = output.slice(markerIndex + marker.length).trimEnd();
  const receiptMatch = receiptText.match(/^(\d{3})\|([A-Za-z0-9._-]{0,128})$/);
  if (!receiptMatch) fail(code);
  let body;
  try {
    body = JSON.parse(output.slice(0, markerIndex));
  } catch {
    fail(code);
  }
  return Object.freeze({
    status: Number(receiptMatch[1]),
    contract: receiptMatch[2],
    body,
  });
}

function protectedCurlJsonAt(runner, state, deploymentUrl, route, request, code, stable = false) {
  if (typeof route !== 'string' || !route.startsWith('/') || /[\r\n]/.test(route)) fail(code);
  const targetUrl = stable
    ? (deploymentUrl === STABLE_PRODUCTION_URL ? deploymentUrl : fail(code))
    : assertUniqueDeploymentUrl(deploymentUrl);
  let result;
  try {
    result = run(runner, 'vercel', [
      'curl', route, '--deployment', targetUrl, '--yes', '--', '--config', '-',
    ], {
      cwd: state.worktreePath,
      input: buildProtectedCurlConfig(request),
    });
  } catch {
    fail(code);
  }
  return parseProtectedCurlResult(result, code);
}

function protectedCurlJson(runner, state, route, request, code) {
  return protectedCurlJsonAt(
    runner,
    state,
    state.deployment?.url,
    route,
    request,
    code,
    false,
  );
}

function inspectBootstrapApplyReceipt(receipt, state, code) {
  if (receipt.contract !== BOOTSTRAP_CONTRACT) fail(code);
  if (receipt.status === 500 && receipt.body?.ok === false &&
      INTERNAL_BOOTSTRAP_CODES.has(receipt.body?.code)) {
    const hasPgCode = Object.hasOwn(receipt.body, 'pgCode');
    const expectedKeys = hasPgCode ? ['ok', 'code', 'pgCode'] : ['ok', 'code'];
    if (!exactKeys(receipt.body, expectedKeys) ||
        (hasPgCode && !/^[0-9A-Z]{5}$/.test(receipt.body.pgCode || ''))) {
      fail(code);
    }
    fail(receipt.body.code, hasPgCode ? receipt.body.pgCode : null);
  }
  if (receipt.status === 410 && exactKeys(receipt.body, ['ok', 'code']) &&
      receipt.body.ok === false && receipt.body.code === 'BOOTSTRAP_ALREADY_CONSUMED') {
    return 'already_consumed';
  }
  const expectedReceiptKeys = [
    'ok', 'code', 'schemaVersion', 'snapshotAsOf', 'recordCount',
    'absenceRecordCount', 'leaveRecordCount', 'movementPeriodCount',
    'positionObservationCount',
    ...(state.target === 'preview' ? ['databaseTargetFingerprintSha256'] : []),
  ];
  if (receipt.status !== 201 || !exactKeys(receipt.body, expectedReceiptKeys) ||
      receipt.body.ok !== true || receipt.body.code !== 'GRH_DIRECTORY_BOOTSTRAP_APPLIED' ||
      receipt.body.schemaVersion !== DIRECTORY_CONTRACT || receipt.body.snapshotAsOf !== state.snapshotAsOf ||
      receipt.body.recordCount !== state.recordCount ||
      receipt.body.absenceRecordCount !== state.absenceRecordCount ||
      receipt.body.leaveRecordCount !== state.leaveRecordCount ||
      receipt.body.movementPeriodCount !== state.movementPeriodCount ||
      receipt.body.positionObservationCount !== state.positionObservationCount ||
      (state.target === 'preview' &&
        receipt.body.databaseTargetFingerprintSha256 !== state.databaseTargetFingerprintSha256)) {
    fail(code);
  }
  return 'applied';
}

async function rollbackPreApplyResources({
  runner,
  state,
  statePath,
  securePathImpl,
  secretAttempted,
  allowlistAttempted,
  snapshotKeyAttempted,
  deploymentRecorded,
} = {}) {
  let cleanupFailed = false;
  const attempt = args => {
    try {
      run(runner, 'vercel', args, { cwd: state.worktreePath });
    } catch {
      cleanupFailed = true;
    }
  };
  if (deploymentRecorded && state.deployment?.id) {
    attempt(['remove', state.deployment.id, '--yes']);
  }
  const environmentArgs = environmentTargetArgs(state);
  if (secretAttempted) {
    attempt(['env', 'rm', 'GRH_DIRECTORY_BOOTSTRAP_SECRET', ...environmentArgs, '--yes']);
  }
  if (allowlistAttempted) {
    attempt(['env', 'rm', 'GRH_DIRECTORY_ALLOWED_USER_IDS', ...environmentArgs, '--yes']);
  }
  if (snapshotKeyAttempted) {
    attempt(['env', 'rm', SNAPSHOT_KEY_ENV, ...environmentArgs, '--yes']);
  }
  if (deploymentRecorded) {
    state.status = cleanupFailed ? 'preapply_cleanup_required' : 'prepared';
    if (!cleanupFailed) state.deployment = null;
    await writeState(statePath, state, securePathImpl);
  }
  if (cleanupFailed) fail('BOOTSTRAP_PREAPPLY_CLEANUP_FAILED');
}

export async function applyPreparedBootstrap({
  statePath,
  runner = defaultCommandRunner,
  securePathImpl = defaultSecurePath,
} = {}) {
  const loaded = await loadState(statePath);
  const { state } = loaded;
  if (state.status !== 'prepared' || state.deployment !== null) fail('BOOTSTRAP_STATE_NOT_PREPARED');
  const material = await verifyPreparedFiles(state);
  assertPinnedGitState({
    runner,
    repositoryRoot: state.repositoryRoot,
    worktreePath: state.worktreePath,
    expectedGitSha: state.expectedGitSha,
    endpointRelativePath: state.endpointRelativePath,
    target: state.target,
    previewBranch: state.previewBranch,
  });
  run(runner, 'vercel', [
    'link', '--yes', '--project', VERCEL_PROJECT, '--scope', VERCEL_SCOPE,
  ], { cwd: state.worktreePath });
  preflightPreviewDatabaseTargets(runner, state);

  const environmentArgs = environmentTargetArgs(state);
  const environments = parseJsonOutput(run(
    runner,
    'vercel',
    ['env', 'ls', ...environmentArgs, '--json'],
    { cwd: state.worktreePath },
  ), 'BOOTSTRAP_ENV_LIST_INVALID');
  const names = collectEnvironmentNames(environments);
  if (names.has('GRH_DIRECTORY_ALLOWED_USER_IDS') || names.has('GRH_DIRECTORY_BOOTSTRAP_SECRET') ||
      (state.mode === 'encrypted_snapshot' && names.has(SNAPSHOT_KEY_ENV))) {
    fail('BOOTSTRAP_ENV_ALREADY_CONFIGURED');
  }
  if (state.target === 'preview' &&
      REQUIRED_PREVIEW_ENVIRONMENT_NAMES.some(name => !names.has(name))) {
    fail('BOOTSTRAP_PREVIEW_ENVIRONMENT_INCOMPLETE');
  }
  const baseline = inspectStableProduction(runner, state, 'BOOTSTRAP_BASELINE_INSPECTION_INVALID');

  let allowlistAttempted = false;
  let secretAttempted = false;
  let snapshotKeyAttempted = false;
  let deploymentRecorded = false;
  let applyStarted = false;
  try {
    if (state.mode === 'encrypted_snapshot') {
      snapshotKeyAttempted = true;
      run(runner, 'vercel', [
        'env', 'add', SNAPSHOT_KEY_ENV, ...environmentArgs, '--sensitive', '--yes',
      ], { cwd: state.worktreePath, input: material.snapshotKey });
    }
    allowlistAttempted = true;
    run(runner, 'vercel', [
      'env', 'add', 'GRH_DIRECTORY_ALLOWED_USER_IDS', ...environmentArgs, '--sensitive', '--yes',
    ], { cwd: state.worktreePath, input: material.allowedUserId });
    secretAttempted = true;
    run(runner, 'vercel', [
      'env', 'add', 'GRH_DIRECTORY_BOOTSTRAP_SECRET', ...environmentArgs, '--sensitive', '--yes',
    ], { cwd: state.worktreePath, input: material.secret });
    const deploymentOutput = parseJsonOutput(run(
      runner,
      'vercel',
      state.target === 'preview'
        ? ['deploy', '--target', 'preview', '--yes', '--json']
        : ['deploy', '--prod', '--skip-domain', '--yes', '--json'],
      { cwd: state.worktreePath },
    ), 'BOOTSTRAP_DEPLOYMENT_OUTPUT_INVALID');
    const deployment = deploymentIdentity(deploymentOutput);
    if (!deployment.id || !deployment.url) fail('BOOTSTRAP_DEPLOYMENT_OUTPUT_INVALID');
    deployment.url = assertUniqueDeploymentUrl(deployment.url);
    if (deployment.id === baseline.id) fail('BOOTSTRAP_DEPLOYMENT_OUTPUT_INVALID');
    state.status = 'deployment_created';
    state.deployment = {
      id: deployment.id,
      url: deployment.url,
      baselineAliasDeploymentId: baseline.id,
      target: state.target,
      skipDomain: state.target === 'production',
      appliedAt: null,
      verifiedAt: null,
      cleanedAt: null,
    };
    deploymentRecorded = true;
    await writeState(loaded.statePath, state, securePathImpl);
    if (state.target === 'preview') {
      const inspectedDeployment = inspectPreviewDeploymentProvenance(runner, state, deployment.url);
      if (deployment.id !== inspectedDeployment.id) fail('BOOTSTRAP_PREVIEW_DEPLOYMENT_INVALID');
      const stableAfter = inspectStableProduction(runner, state, 'BOOTSTRAP_ALIAS_INSPECTION_INVALID');
      if (stableAfter.id !== baseline.id || stableAfter.id === deployment.id) fail('BOOTSTRAP_ALIAS_MOVED');
    } else {
      const uniqueInspection = parseJsonOutput(run(
        runner,
        'vercel',
        ['inspect', deployment.url, '--json', '--wait', '--timeout', '3m'],
        { cwd: state.worktreePath },
      ), 'BOOTSTRAP_DEPLOYMENT_INSPECTION_INVALID');
      const inspectedDeployment = deploymentIdentity(uniqueInspection);
      if (!inspectedDeployment.id || deployment.id !== inspectedDeployment.id ||
          !readyDeployment(uniqueInspection, inspectedDeployment.id)) {
        fail('BOOTSTRAP_DEPLOYMENT_NOT_READY');
      }
      deployment.id = inspectedDeployment.id;
      state.deployment.id = inspectedDeployment.id;
      const aliasInspection = parseJsonOutput(run(
        runner,
        'vercel',
        ['inspect', STABLE_PRODUCTION_URL, '--json'],
        { cwd: state.worktreePath },
      ), 'BOOTSTRAP_ALIAS_INSPECTION_INVALID');
      if (deploymentIdentity(aliasInspection).id !== baseline.id) fail('BOOTSTRAP_ALIAS_MOVED');
    }

    state.status = 'deployed';
    await writeState(loaded.statePath, state, securePathImpl);

    let receipt;
    try {
      state.status = 'apply_started';
      await writeState(loaded.statePath, state, securePathImpl);
      applyStarted = true;
      receipt = protectedCurlJson(runner, state, state.endpointRoute, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/gzip',
          'X-GRH-Bootstrap-Action': 'apply',
          'X-GRH-Bootstrap-Secret': material.secret,
          'X-GRH-Body-Sha256': state.payloadSha256,
        },
        bodyFile: state.payloadPath,
      }, 'BOOTSTRAP_APPLY_AMBIGUOUS');
    } catch {
      state.status = 'apply_ambiguous';
      await writeState(loaded.statePath, state, securePathImpl);
      fail('BOOTSTRAP_APPLY_AMBIGUOUS');
    }
    let applyState;
    try {
      applyState = inspectBootstrapApplyReceipt(receipt, state, 'BOOTSTRAP_APPLY_RESPONSE_INVALID');
    } catch (error) {
      state.status = 'apply_ambiguous';
      await writeState(loaded.statePath, state, securePathImpl);
      if (error instanceof BootstrapToolError && INTERNAL_BOOTSTRAP_CODES.has(error.code)) throw error;
      fail('BOOTSTRAP_APPLY_RESPONSE_INVALID');
    }
    if (applyState === 'already_consumed') {
      state.status = 'apply_ambiguous';
      await writeState(loaded.statePath, state, securePathImpl);
      fail('BOOTSTRAP_APPLY_ALREADY_CONSUMED');
    }
    state.status = 'applied';
    state.deployment.appliedAt = new Date().toISOString();
    await writeState(loaded.statePath, state, securePathImpl);
    return Object.freeze({
      status: 'applied',
      deploymentId: deployment.id,
      deploymentUrl: deployment.url,
      stableAliasUnchanged: true,
      recordCount: state.recordCount,
      absenceRecordCount: state.absenceRecordCount,
      leaveRecordCount: state.leaveRecordCount,
      movementPeriodCount: state.movementPeriodCount,
      ...(state.target === 'preview' ? {
        databaseTargetFingerprintSha256: state.databaseTargetFingerprintSha256,
        stableDatabaseTargetFingerprintSha256: state.stableDatabaseTargetFingerprintSha256,
      } : {}),
    });
  } catch (error) {
    if (!applyStarted) {
      await rollbackPreApplyResources({
        runner,
        state,
        statePath: loaded.statePath,
        securePathImpl,
        secretAttempted,
        allowlistAttempted,
        snapshotKeyAttempted,
        deploymentRecorded,
      });
    }
    throw error;
  }
}

function assertRecordedDeployment(runner, state) {
  const expectedSkipDomain = state.target === 'production';
  if (!state.deployment?.id || state.deployment.skipDomain !== expectedSkipDomain ||
      (state.deployment.target !== undefined && state.deployment.target !== state.target)) {
    fail('BOOTSTRAP_DEPLOYMENT_STATE_INVALID');
  }
  const deploymentUrl = assertUniqueDeploymentUrl(state.deployment.url);
  if (state.target === 'preview') {
    const candidate = inspectPreviewDeploymentProvenance(runner, state, deploymentUrl);
    if (candidate.id !== state.deployment.id) fail('BOOTSTRAP_PREVIEW_DEPLOYMENT_INVALID');
    const stable = inspectStableProduction(runner, state, 'BOOTSTRAP_ALIAS_INSPECTION_INVALID');
    if (stable.id !== state.deployment.baselineAliasDeploymentId || stable.id === candidate.id) {
      fail('BOOTSTRAP_ALIAS_MOVED');
    }
    return deploymentUrl;
  }
  const deploymentInspection = parseJsonOutput(run(
    runner,
    'vercel',
    ['inspect', deploymentUrl, '--json', '--wait', '--timeout', '3m'],
    { cwd: state.worktreePath },
  ), 'BOOTSTRAP_DEPLOYMENT_INSPECTION_INVALID');
  if (!readyDeployment(deploymentInspection, state.deployment.id)) fail('BOOTSTRAP_DEPLOYMENT_NOT_READY');
  const aliasInspection = parseJsonOutput(run(
    runner,
    'vercel',
    ['inspect', STABLE_PRODUCTION_URL, '--json'],
    { cwd: state.worktreePath },
  ), 'BOOTSTRAP_ALIAS_INSPECTION_INVALID');
  if (deploymentIdentity(aliasInspection).id !== state.deployment.baselineAliasDeploymentId) {
    fail('BOOTSTRAP_ALIAS_MOVED');
  }
  return deploymentUrl;
}

export async function resolveAmbiguousBootstrap({
  statePath,
  runner = defaultCommandRunner,
  securePathImpl = defaultSecurePath,
} = {}) {
  const loaded = await loadState(statePath);
  const { state } = loaded;
  if (!['apply_started', 'apply_ambiguous'].includes(state.status)) {
    fail('BOOTSTRAP_STATE_NOT_AMBIGUOUS');
  }
  const material = await verifyPreparedFiles(state);
  assertRecordedDeployment(runner, state);
  const receipt = protectedCurlJson(runner, state, state.endpointRoute, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/gzip',
      'X-GRH-Bootstrap-Action': 'apply',
      'X-GRH-Bootstrap-Secret': material.secret,
      'X-GRH-Body-Sha256': state.payloadSha256,
    },
    bodyFile: state.payloadPath,
  }, 'BOOTSTRAP_RESOLVE_REQUEST_FAILED');
  const resolution = inspectBootstrapApplyReceipt(receipt, state, 'BOOTSTRAP_RESOLVE_RESPONSE_INVALID');
  if (resolution === 'already_consumed') {
    return Object.freeze({
      status: 'apply_ambiguous',
      alreadyConsumed: true,
      verificationRequired: true,
      stableAliasUnchanged: true,
    });
  }
  state.status = 'applied';
  state.deployment.appliedAt = new Date().toISOString();
  await writeState(loaded.statePath, state, securePathImpl);
  return Object.freeze({
    status: 'applied',
    alreadyConsumed: false,
    verificationRequired: true,
    stableAliasUnchanged: true,
    recordCount: state.recordCount,
    absenceRecordCount: state.absenceRecordCount,
    leaveRecordCount: state.leaveRecordCount,
    movementPeriodCount: state.movementPeriodCount,
    ...(state.target === 'preview' ? {
      databaseTargetFingerprintSha256: state.databaseTargetFingerprintSha256,
      stableDatabaseTargetFingerprintSha256: state.stableDatabaseTargetFingerprintSha256,
    } : {}),
  });
}

function assertNoForbiddenKeys(value) {
  if (Array.isArray(value)) {
    value.forEach(assertNoForbiddenKeys);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_RESPONSE_KEYS.has(key)) fail('BOOTSTRAP_VERIFY_FORBIDDEN_FIELD');
    assertNoForbiddenKeys(nested);
  }
}

function requireProtectedReceipt(receipt, code, expectedContract = null) {
  if (receipt.status !== 200 || (expectedContract !== null && receipt.contract !== expectedContract)) {
    fail(code);
  }
  return receipt.body;
}

function verifyBootstrapBehavior({ runner, state, credential, deploymentUrl, stable = false }) {
  if (credential.role !== PILOT_ROLE || !credential.userId || !credential.email || !credential.password) {
    fail('BOOTSTRAP_CREDENTIAL_INVALID');
  }
  const protectedRequest = (route, request, code) => protectedCurlJsonAt(
    runner,
    state,
    deploymentUrl,
    route,
    request,
    code,
    stable,
  );
  const login = requireProtectedReceipt(protectedRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    jsonBody: { email: credential.email, password: credential.password },
  }, 'BOOTSTRAP_VERIFY_LOGIN_FAILED'), 'BOOTSTRAP_VERIFY_LOGIN_FAILED');
  const token = login?.token;
  if (typeof token !== 'string' || token.length < 32 || login?.user?.id !== credential.userId ||
      login?.user?.role !== PILOT_ROLE || typeof login?.user?.tenantId !== 'string') {
    fail('BOOTSTRAP_VERIFY_LOGIN_FAILED');
  }
  const headers = { Authorization: 'Bearer ' + token };
  const browseHeaders = { ...headers, 'X-MuniControl-Purpose': 'DIRECTORY_BROWSE' };
  const personHeaders = { ...headers, 'X-MuniControl-Purpose': 'PERSON_LOOKUP' };
  const directory = requireProtectedReceipt(protectedRequest(
    '/api/grh-directory?limit=1',
    { method: 'GET', headers: browseHeaders },
    'BOOTSTRAP_VERIFY_DIRECTORY_FAILED',
  ), 'BOOTSTRAP_VERIFY_DIRECTORY_FAILED', DIRECTORY_CONTRACT);
  if (!inspectGrhDirectoryResponse(directory).ok || directory.source?.sourceSha256 !== state.sourceSha256 ||
      directory.source?.snapshotAsOf !== state.snapshotAsOf ||
      directory.query?.total !== state.recordCount || directory.items?.length !== 1) {
    fail('BOOTSTRAP_VERIFY_DIRECTORY_FAILED');
  }
  assertNoForbiddenKeys(directory);
  const observedFacets = directory.facets?.positionObservations;
  const observedTotal = Array.isArray(observedFacets)
    ? observedFacets.reduce((sum, item) => sum + Number(item?.count || 0), 0)
    : 0;
  if (observedTotal !== state.positionObservationCount) fail('BOOTSTRAP_VERIFY_POSITION_OBSERVATION_FAILED');
  const statusFacet = directory.facets?.reportedStatuses?.[0];
  const contractRegimeFacet = directory.facets?.contractRegimes?.[0];
  const serviceSituationFacet = directory.facets?.serviceSituations?.[0];
  if (typeof statusFacet?.status !== 'string' || !Number.isInteger(contractRegimeFacet?.code) ||
      !Number.isInteger(serviceSituationFacet?.code)) {
    fail('BOOTSTRAP_VERIFY_EMPLOYMENT_FAILED');
  }
  const employmentChecks = [
    {
      route: '/api/grh-directory?limit=1&reportedStatus=' + encodeURIComponent(statusFacet.status),
      matches: item => item?.employment?.reportedStatus === statusFacet.status,
    },
    {
      route: '/api/grh-directory?limit=1&contractRegime=' + contractRegimeFacet.code,
      matches: item => item?.contractRegime?.code === contractRegimeFacet.code,
    },
    {
      route: '/api/grh-directory?limit=1&serviceSituation=' + serviceSituationFacet.code,
      matches: item => item?.serviceSituation?.code === serviceSituationFacet.code,
    },
  ];
  for (const check of employmentChecks) {
    const filtered = requireProtectedReceipt(protectedRequest(
      check.route,
      { method: 'GET', headers: browseHeaders },
      'BOOTSTRAP_VERIFY_EMPLOYMENT_FAILED',
    ), 'BOOTSTRAP_VERIFY_EMPLOYMENT_FAILED', DIRECTORY_CONTRACT);
    if (!inspectGrhDirectoryResponse(filtered).ok || filtered.items?.length !== 1 ||
        !check.matches(filtered.items[0])) {
      fail('BOOTSTRAP_VERIFY_EMPLOYMENT_FAILED');
    }
    assertNoForbiddenKeys(filtered);
  }
  if (state.leaveRecordCount <= 0) fail('BOOTSTRAP_VERIFY_LEAVE_FAILED');
  const leave = requireProtectedReceipt(protectedRequest(
    '/api/grh-directory?limit=1&hasLeave=true',
    { method: 'GET', headers: browseHeaders },
    'BOOTSTRAP_VERIFY_LEAVE_FAILED',
  ), 'BOOTSTRAP_VERIFY_LEAVE_FAILED', DIRECTORY_CONTRACT);
  const leaveCandidate = leave.items?.[0];
  if (!inspectGrhDirectoryResponse(leave).ok || leave.items?.length !== 1 ||
      !Number.isInteger(leaveCandidate?.legajo) ||
      Number(leaveCandidate?.events?.leaveCount || 0) <= 0) {
    fail('BOOTSTRAP_VERIFY_LEAVE_FAILED');
  }
  assertNoForbiddenKeys(leave);
  const leaveDetail = requireProtectedReceipt(protectedRequest(
    `/api/grh-directory?company=${leaveCandidate.companyCode}&legajo=${leaveCandidate.legajo}`,
    { method: 'GET', headers: personHeaders },
    'BOOTSTRAP_VERIFY_LEAVE_FAILED',
  ), 'BOOTSTRAP_VERIFY_LEAVE_FAILED', DIRECTORY_CONTRACT);
  if (!inspectGrhDirectoryResponse(leaveDetail).ok || leaveDetail.items?.length !== 1 ||
      Number(leaveDetail.items?.[0]?.leaveHistory?.total || 0) <= 0 ||
      !Array.isArray(leaveDetail.items?.[0]?.leaveHistory?.items) ||
      leaveDetail.items[0].leaveHistory.items.length < 1) {
    fail('BOOTSTRAP_VERIFY_LEAVE_FAILED');
  }
  assertNoForbiddenKeys(leaveDetail);

  if (state.absenceRecordCount <= 0) fail('BOOTSTRAP_VERIFY_ABSENCE_FAILED');
  const absence = requireProtectedReceipt(protectedRequest(
    '/api/grh-directory?limit=1&hasAbsence=true',
    { method: 'GET', headers: browseHeaders },
    'BOOTSTRAP_VERIFY_ABSENCE_FAILED',
  ), 'BOOTSTRAP_VERIFY_ABSENCE_FAILED', DIRECTORY_CONTRACT);
  if (!inspectGrhDirectoryResponse(absence).ok || absence.items?.length !== 1 ||
      Number(absence.items?.[0]?.events?.absenceCount || 0) <= 0) {
    fail('BOOTSTRAP_VERIFY_ABSENCE_FAILED');
  }
  assertNoForbiddenKeys(absence);
  const absenceCandidate = absence.items[0];
  const absenceDetail = requireProtectedReceipt(protectedRequest(
    `/api/grh-directory?company=${absenceCandidate.companyCode}&legajo=${absenceCandidate.legajo}`,
    { method: 'GET', headers: personHeaders },
    'BOOTSTRAP_VERIFY_ABSENCE_FAILED',
  ), 'BOOTSTRAP_VERIFY_ABSENCE_FAILED', DIRECTORY_CONTRACT);
  if (!inspectGrhDirectoryResponse(absenceDetail).ok || absenceDetail.items?.length !== 1 ||
      Number(absenceDetail.items?.[0]?.absenceHistory?.total || 0) <= 0 ||
      !Array.isArray(absenceDetail.items?.[0]?.absenceHistory?.items) ||
      absenceDetail.items[0].absenceHistory.items.length < 1) {
    fail('BOOTSTRAP_VERIFY_ABSENCE_FAILED');
  }
  assertNoForbiddenKeys(absenceDetail);

  if (state.movementPeriodCount <= 0) fail('BOOTSTRAP_VERIFY_MOVEMENT_FAILED');
  const movement = requireProtectedReceipt(protectedRequest(
    '/api/grh-directory?limit=1&hasMovement=true',
    { method: 'GET', headers: browseHeaders },
    'BOOTSTRAP_VERIFY_MOVEMENT_FAILED',
  ), 'BOOTSTRAP_VERIFY_MOVEMENT_FAILED', DIRECTORY_CONTRACT);
  if (!inspectGrhDirectoryResponse(movement).ok || movement.items?.length !== 1 ||
      Number(movement.items?.[0]?.movement?.rowCount || 0) <= 0 ||
      Number(movement.items?.[0]?.movement?.periodCount || 0) <= 0) {
    fail('BOOTSTRAP_VERIFY_MOVEMENT_FAILED');
  }
  assertNoForbiddenKeys(movement);
  const movementCandidate = movement.items[0];
  const movementDetail = requireProtectedReceipt(protectedRequest(
    `/api/grh-directory?company=${movementCandidate.companyCode}&legajo=${movementCandidate.legajo}`,
    { method: 'GET', headers: personHeaders },
    'BOOTSTRAP_VERIFY_MOVEMENT_FAILED',
  ), 'BOOTSTRAP_VERIFY_MOVEMENT_FAILED', DIRECTORY_CONTRACT);
  if (!inspectGrhDirectoryResponse(movementDetail).ok || movementDetail.items?.length !== 1 ||
      Number(movementDetail.items?.[0]?.movementHistory?.total || 0) <= 0 ||
      !Array.isArray(movementDetail.items?.[0]?.movementHistory?.items) ||
      movementDetail.items[0].movementHistory.items.length < 1) {
    fail('BOOTSTRAP_VERIFY_MOVEMENT_FAILED');
  }
  assertNoForbiddenKeys(movementDetail);

  const nominalCandidate = leaveCandidate;

  const nominalAssistant = requireProtectedReceipt(protectedRequest(
    '/api/ai-analyze',
    {
      method: 'POST',
      headers: { ...personHeaders, 'Content-Type': 'application/json' },
      jsonBody: {
        message: `legajo ${nominalCandidate.legajo}`,
        mode: 'deterministic',
      },
    },
    'BOOTSTRAP_VERIFY_AI_FAILED',
  ), 'BOOTSTRAP_VERIFY_AI_FAILED');
  if (nominalAssistant?.intent !== 'person_lookup' ||
      nominalAssistant?.status !== 'answered' ||
      nominalAssistant?.engine?.externalProvider !== false ||
      nominalAssistant?.engine?.generated !== false ||
      nominalAssistant?.dataStatus?.source !== 'grh_directory_private_contract' ||
      nominalAssistant?.dataStatus?.snapshotAsOf !== state.snapshotAsOf ||
      nominalAssistant?.provenance?.sourceSha256 !== state.sourceSha256 ||
      nominalAssistant?.provenance?.snapshotAsOf !== state.snapshotAsOf ||
      nominalAssistant?.answer?.directory?.status !== 'matched' ||
      Number(nominalAssistant?.answer?.directory?.person?.leaveHistory?.total || 0) <= 0 ||
      !Array.isArray(nominalAssistant?.answer?.directory?.person?.leaveHistory?.items) ||
      nominalAssistant.answer.directory.person.leaveHistory.items.length < 1 ||
      !Array.isArray(nominalAssistant?.answer?.directory?.person?.absenceHistory?.items) ||
      !Array.isArray(nominalAssistant?.answer?.directory?.person?.movementHistory?.items)) {
    fail('BOOTSTRAP_VERIFY_AI_FAILED');
  }
  return Object.freeze({
    schemaVersion: DIRECTORY_CONTRACT,
    snapshotAsOf: state.snapshotAsOf,
    recordCount: state.recordCount,
    absenceAvailable: true,
    leaveAvailable: true,
    movementAvailable: true,
    positionObservationAvailable: state.positionObservationCount > 0,
    employmentAvailable: true,
    nominalAiVerified: true,
  });
}

export async function verifyAppliedBootstrap({
  statePath,
  runner = defaultCommandRunner,
  securePathImpl = defaultSecurePath,
} = {}) {
  const loaded = await loadState(statePath);
  const { state } = loaded;
  if (!['applied', 'apply_started', 'apply_ambiguous'].includes(state.status) ||
      !state.deployment?.id || state.deployment.skipDomain !== (state.target === 'production')) {
    fail('BOOTSTRAP_STATE_NOT_APPLIED');
  }
  assertRecordedDeployment(runner, state);
  const credential = await readJson(state.credentialPath, 'BOOTSTRAP_CREDENTIAL_UNREADABLE');
  const verified = verifyBootstrapBehavior({
    runner,
    state,
    credential,
    deploymentUrl: state.deployment.url,
  });
  state.status = 'verified';
  state.deployment.verifiedAt = new Date().toISOString();
  await writeState(loaded.statePath, state, securePathImpl);
  return Object.freeze({
    status: 'verified',
    stableAliasUnchanged: true,
    ...(state.target === 'preview' ? {
      databaseTargetFingerprintSha256: state.databaseTargetFingerprintSha256,
      stableDatabaseTargetFingerprintSha256: state.stableDatabaseTargetFingerprintSha256,
    } : {}),
    ...verified,
  });
}

async function removeIfExact(target, expectedSha) {
  const content = await fs.readFile(target).catch(() => fail('BOOTSTRAP_CLEANUP_FILE_MISSING'));
  if (expectedSha && sha256(content) !== expectedSha) fail('BOOTSTRAP_CLEANUP_FILE_DRIFT');
  await fs.rm(target, { force: true });
}

async function assertSnapshotRecoveryMaterial(state) {
  if (state.mode !== 'encrypted_snapshot') return;
  const encoded = await fs.readFile(state.snapshotKeyPath, 'utf8')
    .catch(() => fail('BOOTSTRAP_RECOVERY_KEY_MISSING'));
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded) ||
      Buffer.from(encoded, 'base64url').toString('base64url') !== encoded ||
      sha256(Buffer.from(encoded, 'base64url')) !== state.snapshotKeyFingerprintSha256) {
    fail('BOOTSTRAP_RECOVERY_KEY_DRIFT');
  }
}

export async function cleanupVerifiedBootstrap({
  statePath,
  runner = defaultCommandRunner,
  securePathImpl = defaultSecurePath,
} = {}) {
  const loaded = await loadState(statePath);
  const { state } = loaded;
  if (state.status !== 'verified' || !state.deployment?.id ||
      state.deployment.skipDomain !== (state.target === 'production')) {
    fail('BOOTSTRAP_CLEANUP_REQUIRES_VERIFICATION');
  }
  await assertSnapshotRecoveryMaterial(state);
  if (state.target === 'preview') {
    assertRecordedDeployment(runner, state);
  } else {
    const aliasInspection = parseJsonOutput(run(
      runner,
      'vercel',
      ['inspect', STABLE_PRODUCTION_URL, '--json'],
      { cwd: state.worktreePath },
    ), 'BOOTSTRAP_ALIAS_INSPECTION_INVALID');
    if (deploymentIdentity(aliasInspection).id !== state.deployment.baselineAliasDeploymentId) {
      fail('BOOTSTRAP_ALIAS_MOVED');
    }
  }
  const environmentArgs = environmentTargetArgs(state);
  run(runner, 'vercel', [
    'env', 'rm', 'GRH_DIRECTORY_BOOTSTRAP_SECRET', ...environmentArgs, '--yes',
  ], { cwd: state.worktreePath });
  if (state.target === 'preview') {
    run(runner, 'vercel', [
      'env', 'rm', 'GRH_DIRECTORY_ALLOWED_USER_IDS', ...environmentArgs, '--yes',
    ], { cwd: state.worktreePath });
  }
  run(runner, 'vercel', ['remove', state.deployment.id, '--yes'], { cwd: state.worktreePath });

  await removeIfExact(state.endpointPath, state.endpointSha256);
  await removeIfExact(state.payloadPath, state.payloadSha256);
  await removeIfExact(state.secretPath);
  await removeIfExact(state.allowedUserIdPath);
  state.status = 'cleaned';
  state.deployment.cleanedAt = new Date().toISOString();
  await writeState(loaded.statePath, state, securePathImpl);
  return Object.freeze({
    status: 'cleaned',
    deploymentRemoved: true,
    bootstrapSecretRemoved: true,
    allowlistRetained: state.target === 'production',
    snapshotKeyRetained: state.mode === 'encrypted_snapshot',
    snapshotKeyLocalRetained: state.mode === 'encrypted_snapshot',
    snapshotKeyVersion: state.snapshotKeyVersion,
    snapshotKeyFingerprintSha256: state.snapshotKeyFingerprintSha256,
    recoverySourceSha256: state.sourceSha256,
    credentialPath: state.credentialPath,
    stableAliasUnchanged: true,
    ...(state.target === 'preview' ? {
      databaseTargetFingerprintSha256: state.databaseTargetFingerprintSha256,
      stableDatabaseTargetFingerprintSha256: state.stableDatabaseTargetFingerprintSha256,
    } : {}),
  });
}

function readProductionRelease(runner, state, { wait = false } = {}) {
  const inspectArgs = ['inspect', STABLE_PRODUCTION_URL, '--json'];
  if (wait) inspectArgs.push('--wait', '--timeout', '3m');
  const inspection = parseJsonOutput(run(
    runner,
    'vercel',
    inspectArgs,
    { cwd: state.repositoryRoot },
  ), 'BOOTSTRAP_PRODUCTION_INSPECTION_INVALID');
  const inspected = inspectProductionAlias(inspection, state);
  const deployments = parseJsonOutput(run(
    runner,
    'vercel',
    ['ls', VERCEL_PROJECT, '--json'],
    { cwd: state.repositoryRoot },
  ), 'BOOTSTRAP_PRODUCTION_LIST_INVALID');
  return matchProductionListRelease(deployments, inspected, state);
}

export async function verifyProductionBootstrap({
  statePath,
  runner = defaultCommandRunner,
  securePathImpl = defaultSecurePath,
} = {}) {
  const loaded = await loadState(statePath);
  const { state } = loaded;
  if (state.target !== 'production') fail('BOOTSTRAP_PRODUCTION_VERIFY_TARGET_INVALID');
  if (state.status !== 'cleaned' || state.productionVerification !== null ||
      !state.deployment?.cleanedAt) {
    fail('BOOTSTRAP_PRODUCTION_VERIFY_REQUIRES_CLEANUP');
  }
  await assertSnapshotRecoveryMaterial(state);
  const credential = await readJson(state.credentialPath, 'BOOTSTRAP_CREDENTIAL_UNREADABLE');
  const before = readProductionRelease(runner, state, { wait: true });
  const verified = verifyBootstrapBehavior({
    runner,
    state,
    credential,
    deploymentUrl: STABLE_PRODUCTION_URL,
    stable: true,
  });
  const after = readProductionRelease(runner, state);
  if (after.id !== before.id || after.url !== before.url || after.gitSha !== before.gitSha) {
    fail('BOOTSTRAP_PRODUCTION_ALIAS_CHANGED');
  }
  const verifiedAt = new Date().toISOString();
  state.status = 'production_verified';
  state.productionVerification = {
    deploymentId: before.id,
    gitSha: before.gitSha,
    verifiedAt,
  };
  await writeState(loaded.statePath, state, securePathImpl);
  return Object.freeze({
    status: 'production_verified',
    productionDeploymentId: before.id,
    productionGitSha: before.gitSha,
    stableProductionUrl: STABLE_PRODUCTION_URL,
    snapshotKeyLocalRetained: state.mode === 'encrypted_snapshot',
    snapshotKeyVersion: state.snapshotKeyVersion,
    snapshotKeyFingerprintSha256: state.snapshotKeyFingerprintSha256,
    recoverySourceSha256: state.sourceSha256,
    ...verified,
  });
}

export async function finalizeProductionBootstrap({
  statePath,
  securePathImpl = defaultSecurePath,
} = {}) {
  const loaded = await loadState(statePath);
  const { state } = loaded;
  if (state.target !== 'production') fail('BOOTSTRAP_FINALIZE_TARGET_INVALID');
  if (!['production_verified', 'finalized'].includes(state.status) ||
      !state.productionVerification ||
      state.productionVerification.gitSha !== state.expectedGitSha ||
      !GIT_SHA_PATTERN.test(state.productionVerification.gitSha || '')) {
    fail('BOOTSTRAP_FINALIZE_REQUIRES_PRODUCTION_VERIFICATION');
  }
  await assertSnapshotRecoveryMaterial(state);
  const credential = await readJson(state.credentialPath, 'BOOTSTRAP_CREDENTIAL_UNREADABLE');
  if (credential.role !== PILOT_ROLE || !credential.userId || !credential.email || !credential.password) {
    fail('BOOTSTRAP_CREDENTIAL_INVALID');
  }
  if (state.status !== 'finalized') {
    state.status = 'finalized';
    state.finalizedAt = new Date().toISOString();
    await writeState(loaded.statePath, state, securePathImpl);
  }
  return Object.freeze({
    status: 'finalized',
    productionDeploymentId: state.productionVerification.deploymentId,
    productionGitSha: state.productionVerification.gitSha,
    credentialPath: state.credentialPath,
    snapshotKeyLocalRetained: state.mode === 'encrypted_snapshot',
    snapshotKeyVersion: state.snapshotKeyVersion,
    snapshotKeyFingerprintSha256: state.snapshotKeyFingerprintSha256,
    recoverySourceSha256: state.sourceSha256,
  });
}

export function safeCliResult(result) {
  if (!result || typeof result !== 'object') return Object.freeze({ ok: true });
  const allowed = [
    'statePath', 'mode', 'target', 'previewBranch', 'databaseTargetFingerprintSha256',
    'stableDatabaseTargetFingerprintSha256', 'endpointRelativePath', 'payloadBytes', 'uncompressedBytes',
    'recordCount', 'absenceRecordCount', 'leaveRecordCount', 'movementPeriodCount',
    'positionObservationCount', 'status',
    'deploymentId', 'deploymentUrl', 'stableAliasUnchanged', 'schemaVersion',
    'snapshotAsOf', 'absenceAvailable', 'leaveAvailable', 'movementAvailable',
    'positionObservationAvailable', 'nominalAiVerified',
    'employmentAvailable',
    'alreadyConsumed', 'verificationRequired',
    'deploymentRemoved', 'bootstrapSecretRemoved', 'allowlistRetained', 'snapshotKeyRetained',
    'snapshotKeyLocalRetained', 'snapshotKeyVersion', 'snapshotKeyFingerprintSha256',
    'recoverySourceSha256', 'credentialPath', 'expectedGitSha',
    'productionDeploymentId', 'productionGitSha', 'stableProductionUrl',
  ];
  return Object.freeze(Object.fromEntries(
    allowed.filter(key => Object.hasOwn(result, key)).map(key => [key, result[key]]),
  ));
}
