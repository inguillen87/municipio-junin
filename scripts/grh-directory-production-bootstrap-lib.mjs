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

export const BOOTSTRAP_CONTRACT = 'grh-directory-bootstrap-v1';
export const DIRECTORY_CONTRACT = 'grh-directory-v1';
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
export const EXPECTED_MIGRATION_SHA256 = 'c33ef9e79c3960d26d377daae2a62b210a62be0733bb4480ec30fd48d1641b19';
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
} = {}) {
  const code = preparing ? 'BOOTSTRAP_PREPARE_GIT_PIN_INVALID' : 'BOOTSTRAP_GIT_PIN_INVALID';
  const sourceHead = exactGitOutput(runner, repositoryRoot, ['rev-parse', '--verify', 'HEAD'], code);
  const sourceOrigin = exactGitOutput(
    runner,
    repositoryRoot,
    ['rev-parse', '--verify', 'refs/remotes/origin/master'],
    code,
  );
  const worktreeHead = exactGitOutput(runner, worktreePath, ['rev-parse', '--verify', 'HEAD'], code);
  const worktreeOrigin = exactGitOutput(
    runner,
    worktreePath,
    ['rev-parse', '--verify', 'refs/remotes/origin/master'],
    code,
  );
  const branch = exactGitOutput(runner, worktreePath, ['branch', '--show-current'], code);
  const status = run(runner, 'git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: worktreePath,
  }).stdout;
  const pinned = expectedGitSha || sourceHead;
  if (!GIT_SHA_PATTERN.test(pinned) || sourceHead !== pinned || sourceOrigin !== pinned ||
      worktreeHead !== pinned || worktreeOrigin !== pinned || branch !== '' ||
      (preparing ? String(status).trim() !== '' : !exactWorktreeStatus(status, endpointRelativePath))) {
    fail(code);
  }
  return pinned;
}

export async function prepareBootstrapBundle({
  mode,
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
  if (await exists(stateDir)) fail('BOOTSTRAP_STATE_DIRECTORY_EXISTS');

  const expectedGitSha = assertPinnedGitState({
    runner,
    repositoryRoot: sourceRoot,
    worktreePath: worktree,
    preparing: true,
  });

  const migrationPath = path.join(sourceRoot, 'migrations', '003_grh_directory.sql');
  const manifestPath = path.join(sourceRoot, 'config', 'grh-source-manifest.json');
  const migrationSql = normalizeNewlines(await fs.readFile(migrationPath, 'utf8'));
  const manifestText = normalizeNewlines(await fs.readFile(manifestPath, 'utf8'));
  const migrationSha256 = sha256(Buffer.from(migrationSql, 'utf8'));
  const manifestSha256 = sha256(Buffer.from(manifestText, 'utf8'));
  if (migrationSha256 !== EXPECTED_MIGRATION_SHA256 || manifestSha256 !== EXPECTED_MANIFEST_SHA256) {
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
    leaveRecordCount: flattened.leaveEvents.length,
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

function readyDeployment(value, expectedId) {
  const identity = deploymentIdentity(value);
  const status = String(value?.readyState || value?.status || value?.state || '').toUpperCase();
  const target = String(value?.target || value?.environment || '').toLowerCase();
  return identity.id === expectedId && ['READY', 'READY_STATE_READY'].includes(status) &&
    (!target || target === 'production');
}

function productionDeploymentGitSha(value) {
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

function inspectProductionRelease(value, state) {
  const deployment = deploymentIdentity(value);
  const target = String(value?.target || value?.environment || '').toLowerCase();
  const gitSha = productionDeploymentGitSha(value);
  if (!deployment.id || !readyDeployment(value, deployment.id) || target !== 'production' ||
      deployment.id === state.deployment?.baselineAliasDeploymentId ||
      deployment.id === state.deployment?.id || gitSha !== state.expectedGitSha) {
    fail('BOOTSTRAP_PRODUCTION_RELEASE_INVALID');
  }
  return Object.freeze({ id: deployment.id, gitSha });
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
  const state = await readJson(resolved, 'BOOTSTRAP_STATE_UNREADABLE');
  if (!exactKeys(state, [
    'schemaVersion', 'mode', 'expectedGitSha', 'status', 'createdAt', 'repositoryRoot', 'worktreePath',
    'endpointRelativePath', 'endpointPath', 'endpointRoute', 'endpointSha256',
    'payloadPath', 'payloadSha256', 'payloadBytes', 'uncompressedBytes',
    'credentialPath', 'secretPath', 'snapshotKeyPath', 'snapshotKeyVersion',
    'snapshotKeyFingerprintSha256',
    'allowedUserIdPath', 'operationId', 'requestId',
    'migrationSha256', 'manifestSha256', 'sourceSha256', 'snapshotAsOf',
    'recordCount', 'leaveRecordCount', 'positionObservationCount',
    'stableProductionUrl', 'deployment', 'productionVerification', 'finalizedAt',
  ]) || state.schemaVersion !== BOOTSTRAP_CONTRACT || !BOOTSTRAP_MODES.includes(state.mode) ||
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
  if (receipt.status !== 201 || !exactKeys(receipt.body, [
    'ok', 'code', 'schemaVersion', 'snapshotAsOf', 'recordCount',
    'leaveRecordCount', 'positionObservationCount',
  ]) || receipt.body.ok !== true || receipt.body.code !== 'GRH_DIRECTORY_BOOTSTRAP_APPLIED' ||
      receipt.body.schemaVersion !== DIRECTORY_CONTRACT || receipt.body.snapshotAsOf !== state.snapshotAsOf ||
      receipt.body.recordCount !== state.recordCount || receipt.body.leaveRecordCount !== state.leaveRecordCount ||
      receipt.body.positionObservationCount !== state.positionObservationCount) {
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
  if (secretAttempted) {
    attempt(['env', 'rm', 'GRH_DIRECTORY_BOOTSTRAP_SECRET', 'production', '--yes']);
  }
  if (allowlistAttempted) {
    attempt(['env', 'rm', 'GRH_DIRECTORY_ALLOWED_USER_IDS', 'production', '--yes']);
  }
  if (snapshotKeyAttempted) {
    attempt(['env', 'rm', SNAPSHOT_KEY_ENV, 'production', '--yes']);
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
  });
  run(runner, 'vercel', [
    'link', '--yes', '--project', VERCEL_PROJECT, '--scope', VERCEL_SCOPE,
  ], { cwd: state.worktreePath });

  const environments = parseJsonOutput(run(
    runner,
    'vercel',
    ['env', 'ls', 'production', '--json'],
    { cwd: state.worktreePath },
  ), 'BOOTSTRAP_ENV_LIST_INVALID');
  const names = collectEnvironmentNames(environments);
  if (names.has('GRH_DIRECTORY_ALLOWED_USER_IDS') || names.has('GRH_DIRECTORY_BOOTSTRAP_SECRET') ||
      (state.mode === 'encrypted_snapshot' && names.has(SNAPSHOT_KEY_ENV))) {
    fail('BOOTSTRAP_ENV_ALREADY_CONFIGURED');
  }
  const baselineInspection = parseJsonOutput(run(
    runner,
    'vercel',
    ['inspect', STABLE_PRODUCTION_URL, '--json'],
    { cwd: state.worktreePath },
  ), 'BOOTSTRAP_BASELINE_INSPECTION_INVALID');
  const baseline = deploymentIdentity(baselineInspection);
  const baselineTarget = String(
    baselineInspection?.target || baselineInspection?.environment || '',
  ).toLowerCase();
  if (!baseline.id || !readyDeployment(baselineInspection, baseline.id) ||
      baselineTarget !== 'production') {
    fail('BOOTSTRAP_BASELINE_INSPECTION_INVALID');
  }

  let allowlistAttempted = false;
  let secretAttempted = false;
  let snapshotKeyAttempted = false;
  let deploymentRecorded = false;
  let applyStarted = false;
  try {
    if (state.mode === 'encrypted_snapshot') {
      snapshotKeyAttempted = true;
      run(runner, 'vercel', [
        'env', 'add', SNAPSHOT_KEY_ENV, 'production', '--sensitive', '--yes',
      ], { cwd: state.worktreePath, input: material.snapshotKey });
    }
    allowlistAttempted = true;
    run(runner, 'vercel', [
      'env', 'add', 'GRH_DIRECTORY_ALLOWED_USER_IDS', 'production', '--sensitive', '--yes',
    ], { cwd: state.worktreePath, input: material.allowedUserId });
    secretAttempted = true;
    run(runner, 'vercel', [
      'env', 'add', 'GRH_DIRECTORY_BOOTSTRAP_SECRET', 'production', '--sensitive', '--yes',
    ], { cwd: state.worktreePath, input: material.secret });
    const deploymentOutput = parseJsonOutput(run(
      runner,
      'vercel',
      ['deploy', '--prod', '--skip-domain', '--yes', '--json'],
      { cwd: state.worktreePath },
    ), 'BOOTSTRAP_DEPLOYMENT_OUTPUT_INVALID');
    const deployment = deploymentIdentity(deploymentOutput);
    if (!deployment.id || !deployment.url) fail('BOOTSTRAP_DEPLOYMENT_OUTPUT_INVALID');
    deployment.url = assertUniqueDeploymentUrl(deployment.url);
    state.status = 'deployment_created';
    state.deployment = {
      id: deployment.id,
      url: deployment.url,
      baselineAliasDeploymentId: baseline.id,
      skipDomain: true,
      appliedAt: null,
      verifiedAt: null,
      cleanedAt: null,
    };
    deploymentRecorded = true;
    await writeState(loaded.statePath, state, securePathImpl);
    const uniqueInspection = parseJsonOutput(run(
      runner,
      'vercel',
      ['inspect', deployment.url, '--json', '--wait', '--timeout', '3m'],
      { cwd: state.worktreePath },
    ), 'BOOTSTRAP_DEPLOYMENT_INSPECTION_INVALID');
    const inspectedDeployment = deploymentIdentity(uniqueInspection);
    if (!inspectedDeployment.id || (deployment.id && deployment.id !== inspectedDeployment.id) ||
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
  if (!state.deployment?.id || !state.deployment?.skipDomain) {
    fail('BOOTSTRAP_DEPLOYMENT_STATE_INVALID');
  }
  const deploymentUrl = assertUniqueDeploymentUrl(state.deployment.url);
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
  const directory = requireProtectedReceipt(protectedRequest(
    '/api/grh-directory?limit=1',
    { method: 'GET', headers },
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
  if (state.leaveRecordCount <= 0) fail('BOOTSTRAP_VERIFY_LEAVE_FAILED');
  const leave = requireProtectedReceipt(protectedRequest(
    '/api/grh-directory?limit=1&hasLeave=true',
    { method: 'GET', headers },
    'BOOTSTRAP_VERIFY_LEAVE_FAILED',
  ), 'BOOTSTRAP_VERIFY_LEAVE_FAILED', DIRECTORY_CONTRACT);
  const nominalCandidate = leave.items?.[0];
  if (!inspectGrhDirectoryResponse(leave).ok || leave.items?.length !== 1 ||
      !Number.isInteger(nominalCandidate?.legajo) ||
      Number(nominalCandidate?.events?.leaveCount || 0) <= 0) {
    fail('BOOTSTRAP_VERIFY_LEAVE_FAILED');
  }
  assertNoForbiddenKeys(leave);

  const nominalAssistant = requireProtectedReceipt(protectedRequest(
    '/api/ai-analyze',
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
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
      nominalAssistant?.answer?.directory?.status !== 'matched') {
    fail('BOOTSTRAP_VERIFY_AI_FAILED');
  }
  return Object.freeze({
    schemaVersion: DIRECTORY_CONTRACT,
    snapshotAsOf: state.snapshotAsOf,
    recordCount: state.recordCount,
    leaveAvailable: state.leaveRecordCount > 0,
    positionObservationAvailable: state.positionObservationCount > 0,
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
      !state.deployment?.skipDomain) {
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
  if (state.status !== 'verified' || !state.deployment?.id || !state.deployment?.skipDomain) {
    fail('BOOTSTRAP_CLEANUP_REQUIRES_VERIFICATION');
  }
  await assertSnapshotRecoveryMaterial(state);
  const aliasInspection = parseJsonOutput(run(
    runner,
    'vercel',
    ['inspect', STABLE_PRODUCTION_URL, '--json'],
    { cwd: state.worktreePath },
  ), 'BOOTSTRAP_ALIAS_INSPECTION_INVALID');
  if (deploymentIdentity(aliasInspection).id !== state.deployment.baselineAliasDeploymentId) {
    fail('BOOTSTRAP_ALIAS_MOVED');
  }
  run(runner, 'vercel', [
    'env', 'rm', 'GRH_DIRECTORY_BOOTSTRAP_SECRET', 'production', '--yes',
  ], { cwd: state.worktreePath });
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
    allowlistRetained: true,
    snapshotKeyRetained: state.mode === 'encrypted_snapshot',
    snapshotKeyLocalRetained: state.mode === 'encrypted_snapshot',
    snapshotKeyVersion: state.snapshotKeyVersion,
    snapshotKeyFingerprintSha256: state.snapshotKeyFingerprintSha256,
    recoverySourceSha256: state.sourceSha256,
    credentialPath: state.credentialPath,
    stableAliasUnchanged: true,
  });
}

export async function verifyProductionBootstrap({
  statePath,
  runner = defaultCommandRunner,
  securePathImpl = defaultSecurePath,
} = {}) {
  const loaded = await loadState(statePath);
  const { state } = loaded;
  if (state.status !== 'cleaned' || state.productionVerification !== null ||
      !state.deployment?.cleanedAt) {
    fail('BOOTSTRAP_PRODUCTION_VERIFY_REQUIRES_CLEANUP');
  }
  await assertSnapshotRecoveryMaterial(state);
  const credential = await readJson(state.credentialPath, 'BOOTSTRAP_CREDENTIAL_UNREADABLE');
  const beforeInspection = parseJsonOutput(run(
    runner,
    'vercel',
    ['inspect', STABLE_PRODUCTION_URL, '--json', '--wait', '--timeout', '3m'],
    { cwd: state.repositoryRoot },
  ), 'BOOTSTRAP_PRODUCTION_INSPECTION_INVALID');
  const before = inspectProductionRelease(beforeInspection, state);
  const verified = verifyBootstrapBehavior({
    runner,
    state,
    credential,
    deploymentUrl: STABLE_PRODUCTION_URL,
    stable: true,
  });
  const afterInspection = parseJsonOutput(run(
    runner,
    'vercel',
    ['inspect', STABLE_PRODUCTION_URL, '--json'],
    { cwd: state.repositoryRoot },
  ), 'BOOTSTRAP_PRODUCTION_INSPECTION_INVALID');
  const after = inspectProductionRelease(afterInspection, state);
  if (after.id !== before.id || after.gitSha !== before.gitSha) {
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
    'statePath', 'mode', 'endpointRelativePath', 'payloadBytes', 'uncompressedBytes',
    'recordCount', 'leaveRecordCount', 'positionObservationCount', 'status',
    'deploymentId', 'deploymentUrl', 'stableAliasUnchanged', 'schemaVersion',
    'snapshotAsOf', 'leaveAvailable', 'positionObservationAvailable', 'nominalAiVerified',
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
