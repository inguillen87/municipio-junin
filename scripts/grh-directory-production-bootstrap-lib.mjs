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
import { renderGrhDirectoryBootstrapFunction } from './grh-directory-bootstrap-function-template.mjs';

export const BOOTSTRAP_CONTRACT = 'grh-directory-bootstrap-v1';
export const DIRECTORY_CONTRACT = 'grh-directory-v1';
export const PILOT_ROLE = 'CONTADOR';
export const PILOT_NAME = 'Piloto privado GRH';
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
const FORBIDDEN_RESPONSE_KEYS = new Set([
  'dni', 'cuil', 'contact', 'contacto', 'address', 'domicilio', 'bank_account',
  'bankAccount', 'salary', 'salario', 'event_cause', 'eventCause', 'cause',
  'causa', 'notes', 'notas', 'observaciones',
]);

export class BootstrapToolError extends Error {
  constructor(code) {
    super('GRH directory production bootstrap failed');
    this.name = 'BootstrapToolError';
    this.code = code;
  }
}

function fail(code) {
  throw new BootstrapToolError(code);
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
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'vercel.cmd', ...args],
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
    allowedUserIdPath: path.join(stateDir, 'grh-directory-bootstrap.allowed-user-id'),
    payloadPath: path.join(stateDir, 'grh-directory-bootstrap.payload.json.gz'),
    statePath: path.join(stateDir, 'grh-directory-bootstrap.state.json'),
  });
}

export async function prepareBootstrapBundle({
  worktreePath,
  artifactPath,
  stateDirectory,
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  now = () => new Date(),
  randomBytesImpl = randomBytes,
  randomUuidImpl = randomUUID,
  bcryptHashImpl = (password, rounds) => bcrypt.hash(password, rounds),
  securePathImpl = defaultSecurePath,
  compressedLimit = MAX_COMPRESSED_BYTES,
  uncompressedLimit = MAX_UNCOMPRESSED_BYTES,
} = {}) {
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
      !(await exists(path.join(worktree, 'shared', 'database-url-policy.cjs'))) ||
      !(await exists(path.join(worktree, 'shared', 'published-demo-policy.cjs'))) ||
      !(await exists(path.join(worktree, 'vercel.json')))) {
    fail('BOOTSTRAP_WORKTREE_INVALID');
  }
  if (await exists(stateDir)) fail('BOOTSTRAP_STATE_DIRECTORY_EXISTS');

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
  const email = randomPilotEmail(randomBytesImpl(12));
  if (password.length < 14 || Buffer.byteLength(password, 'utf8') > 72 || bootstrapSecret.length < 32) {
    fail('BOOTSTRAP_RANDOMNESS_INVALID');
  }
  const passwordHash = await bcryptHashImpl(password, 12);
  validateBcryptHash(passwordHash);
  const createdAt = now().toISOString();
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
    operationId,
    migrationSql,
    migrationSha256,
    manifest,
    manifestSha256,
  });
  if (endpointSource.includes(password) || endpointSource.includes(bootstrapSecret) ||
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
  };

  try {
    await writeExclusive(endpointPath, endpointSource);
    await writeExclusive(paths.credentialPath, JSON.stringify(credential, null, 2) + '\n');
    await securePathImpl(paths.credentialPath, false);
    await writeExclusive(paths.secretPath, bootstrapSecret);
    await securePathImpl(paths.secretPath, false);
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
    'schemaVersion', 'status', 'createdAt', 'repositoryRoot', 'worktreePath',
    'endpointRelativePath', 'endpointPath', 'endpointRoute', 'endpointSha256',
    'payloadPath', 'payloadSha256', 'payloadBytes', 'uncompressedBytes',
    'credentialPath', 'secretPath', 'allowedUserIdPath', 'operationId', 'requestId',
    'migrationSha256', 'manifestSha256', 'sourceSha256', 'snapshotAsOf',
    'recordCount', 'leaveRecordCount', 'positionObservationCount',
    'stableProductionUrl', 'deployment',
  ]) || state.schemaVersion !== BOOTSTRAP_CONTRACT || state.stableProductionUrl !== STABLE_PRODUCTION_URL) {
    fail('BOOTSTRAP_STATE_INVALID');
  }
  return { statePath: resolved, state };
}

async function verifyPreparedFiles(state) {
  const [endpoint, payload, credential, secret, allowedUserId] = await Promise.all([
    fs.readFile(state.endpointPath),
    fs.readFile(state.payloadPath),
    readJson(state.credentialPath, 'BOOTSTRAP_CREDENTIAL_UNREADABLE'),
    fs.readFile(state.secretPath, 'utf8'),
    fs.readFile(state.allowedUserIdPath, 'utf8'),
  ]).catch(() => fail('BOOTSTRAP_PREPARED_FILES_INVALID'));
  if (sha256(endpoint) !== state.endpointSha256 || sha256(payload) !== state.payloadSha256 ||
      payload.length !== state.payloadBytes || secret.length < 32 ||
      allowedUserId !== credential.userId || credential.role !== PILOT_ROLE ||
      !/^[0-9a-f-]{36}$/.test(credential.userId || '') ||
      typeof credential.email !== 'string' || typeof credential.password !== 'string') {
    fail('BOOTSTRAP_PREPARED_FILES_INVALID');
  }
  return { endpoint, payload, credential, secret, allowedUserId };
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

async function safeJsonResponse(response, code) {
  try {
    return await response.json();
  } catch {
    fail(code);
  }
}

export async function applyPreparedBootstrap({
  statePath,
  runner = defaultCommandRunner,
  fetchImpl = globalThis.fetch,
  securePathImpl = defaultSecurePath,
} = {}) {
  if (typeof fetchImpl !== 'function') fail('BOOTSTRAP_FETCH_UNAVAILABLE');
  const loaded = await loadState(statePath);
  const { state } = loaded;
  if (state.status !== 'prepared' || state.deployment !== null) fail('BOOTSTRAP_STATE_NOT_PREPARED');
  const material = await verifyPreparedFiles(state);
  const gitStatus = run(runner, 'git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: state.worktreePath,
  });
  if (!exactWorktreeStatus(gitStatus.stdout, state.endpointRelativePath)) fail('BOOTSTRAP_WORKTREE_DIRTY');
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
  if (names.has('GRH_DIRECTORY_ALLOWED_USER_IDS') || names.has('GRH_DIRECTORY_BOOTSTRAP_SECRET')) {
    fail('BOOTSTRAP_ENV_ALREADY_CONFIGURED');
  }
  const baselineInspection = parseJsonOutput(run(
    runner,
    'vercel',
    ['inspect', STABLE_PRODUCTION_URL, '--json'],
    { cwd: state.worktreePath },
  ), 'BOOTSTRAP_BASELINE_INSPECTION_INVALID');
  const baseline = deploymentIdentity(baselineInspection);
  if (!baseline.id) fail('BOOTSTRAP_BASELINE_INSPECTION_INVALID');

  let allowlistAdded = false;
  let secretAdded = false;
  let deploymentCreated = false;
  try {
    run(runner, 'vercel', [
      'env', 'add', 'GRH_DIRECTORY_ALLOWED_USER_IDS', 'production', '--sensitive', '--yes',
    ], { cwd: state.worktreePath, input: material.allowedUserId });
    allowlistAdded = true;
    run(runner, 'vercel', [
      'env', 'add', 'GRH_DIRECTORY_BOOTSTRAP_SECRET', 'production', '--sensitive', '--yes',
    ], { cwd: state.worktreePath, input: material.secret });
    secretAdded = true;
    const deploymentOutput = parseJsonOutput(run(
      runner,
      'vercel',
      ['deploy', '--prod', '--skip-domain', '--yes', '--json'],
      { cwd: state.worktreePath },
    ), 'BOOTSTRAP_DEPLOYMENT_OUTPUT_INVALID');
    const deployment = deploymentIdentity(deploymentOutput);
    if (!deployment.url) fail('BOOTSTRAP_DEPLOYMENT_OUTPUT_INVALID');
    deployment.url = assertUniqueDeploymentUrl(deployment.url);
    deploymentCreated = true;
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
    const aliasInspection = parseJsonOutput(run(
      runner,
      'vercel',
      ['inspect', STABLE_PRODUCTION_URL, '--json'],
      { cwd: state.worktreePath },
    ), 'BOOTSTRAP_ALIAS_INSPECTION_INVALID');
    if (deploymentIdentity(aliasInspection).id !== baseline.id) fail('BOOTSTRAP_ALIAS_MOVED');

    state.status = 'deployed';
    state.deployment = {
      id: deployment.id,
      url: deployment.url,
      baselineAliasDeploymentId: baseline.id,
      skipDomain: true,
      appliedAt: null,
      verifiedAt: null,
      cleanedAt: null,
    };
    await writeState(loaded.statePath, state, securePathImpl);

    let response;
    try {
      response = await fetchImpl(deployment.url + state.endpointRoute, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/gzip',
          'X-GRH-Bootstrap-Action': 'apply',
          'X-GRH-Bootstrap-Secret': material.secret,
          'X-GRH-Body-Sha256': state.payloadSha256,
        },
        body: material.payload,
        redirect: 'error',
      });
    } catch {
      state.status = 'apply_ambiguous';
      await writeState(loaded.statePath, state, securePathImpl);
      fail('BOOTSTRAP_APPLY_AMBIGUOUS');
    }
    const responseBody = await safeJsonResponse(response, 'BOOTSTRAP_APPLY_RESPONSE_INVALID');
    if (response.status !== 201 || !exactKeys(responseBody, [
      'ok', 'code', 'schemaVersion', 'snapshotAsOf', 'recordCount',
      'leaveRecordCount', 'positionObservationCount',
    ]) || responseBody.ok !== true || responseBody.code !== 'GRH_DIRECTORY_BOOTSTRAP_APPLIED' ||
      responseBody.schemaVersion !== DIRECTORY_CONTRACT || responseBody.snapshotAsOf !== state.snapshotAsOf ||
      responseBody.recordCount !== state.recordCount || responseBody.leaveRecordCount !== state.leaveRecordCount ||
      responseBody.positionObservationCount !== state.positionObservationCount) {
      state.status = 'apply_ambiguous';
      await writeState(loaded.statePath, state, securePathImpl);
      fail('BOOTSTRAP_APPLY_RESPONSE_INVALID');
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
    if (!deploymentCreated) {
      if (secretAdded) {
        try { run(runner, 'vercel', ['env', 'rm', 'GRH_DIRECTORY_BOOTSTRAP_SECRET', 'production', '--yes'], { cwd: state.worktreePath }); } catch {}
      }
      if (allowlistAdded) {
        try { run(runner, 'vercel', ['env', 'rm', 'GRH_DIRECTORY_ALLOWED_USER_IDS', 'production', '--yes'], { cwd: state.worktreePath }); } catch {}
      }
    }
    throw error;
  }
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

async function authenticatedJson(fetchImpl, url, options, code) {
  let response;
  try {
    response = await fetchImpl(url, { ...options, redirect: 'error' });
  } catch {
    fail(code);
  }
  const body = await safeJsonResponse(response, code);
  if (response.status !== 200) fail(code);
  return { response, body };
}

export async function verifyAppliedBootstrap({
  statePath,
  runner = defaultCommandRunner,
  fetchImpl = globalThis.fetch,
  securePathImpl = defaultSecurePath,
} = {}) {
  if (typeof fetchImpl !== 'function') fail('BOOTSTRAP_FETCH_UNAVAILABLE');
  const loaded = await loadState(statePath);
  const { state } = loaded;
  if (!['applied', 'apply_ambiguous'].includes(state.status) || !state.deployment?.skipDomain) {
    fail('BOOTSTRAP_STATE_NOT_APPLIED');
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
  const credential = await readJson(state.credentialPath, 'BOOTSTRAP_CREDENTIAL_UNREADABLE');
  if (credential.role !== PILOT_ROLE || !credential.userId || !credential.email || !credential.password) {
    fail('BOOTSTRAP_CREDENTIAL_INVALID');
  }
  const login = await authenticatedJson(fetchImpl, deploymentUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: credential.email, password: credential.password }),
  }, 'BOOTSTRAP_VERIFY_LOGIN_FAILED');
  const token = login.body?.token;
  if (typeof token !== 'string' || token.length < 32 || login.body?.user?.id !== credential.userId ||
      login.body?.user?.role !== PILOT_ROLE || typeof login.body?.user?.tenantId !== 'string') {
    fail('BOOTSTRAP_VERIFY_LOGIN_FAILED');
  }
  const headers = { Authorization: 'Bearer ' + token };
  const directory = await authenticatedJson(
    fetchImpl,
    deploymentUrl + '/api/grh-directory?limit=1',
    { method: 'GET', headers },
    'BOOTSTRAP_VERIFY_DIRECTORY_FAILED',
  );
  if (directory.response.headers.get('x-municontrol-contract') !== DIRECTORY_CONTRACT ||
      !inspectGrhDirectoryResponse(directory.body).ok || directory.body.source?.sourceSha256 !== state.sourceSha256 ||
      directory.body.source?.snapshotAsOf !== state.snapshotAsOf ||
      directory.body.query?.total !== state.recordCount || directory.body.items?.length !== 1) {
    fail('BOOTSTRAP_VERIFY_DIRECTORY_FAILED');
  }
  assertNoForbiddenKeys(directory.body);
  const observedFacets = directory.body.facets?.positionObservations;
  const observedTotal = Array.isArray(observedFacets)
    ? observedFacets.reduce((sum, item) => sum + Number(item?.count || 0), 0)
    : 0;
  if (observedTotal !== state.positionObservationCount) fail('BOOTSTRAP_VERIFY_POSITION_OBSERVATION_FAILED');
  if (state.leaveRecordCount <= 0) fail('BOOTSTRAP_VERIFY_LEAVE_FAILED');
  const leave = await authenticatedJson(
    fetchImpl,
    deploymentUrl + '/api/grh-directory?limit=1&hasLeave=true',
    { method: 'GET', headers },
    'BOOTSTRAP_VERIFY_LEAVE_FAILED',
  );
  const nominalCandidate = leave.body.items?.[0];
  if (!inspectGrhDirectoryResponse(leave.body).ok || leave.body.items?.length !== 1 ||
      !Number.isInteger(nominalCandidate?.legajo) ||
      Number(nominalCandidate?.events?.leaveCount || 0) <= 0) {
    fail('BOOTSTRAP_VERIFY_LEAVE_FAILED');
  }
  assertNoForbiddenKeys(leave.body);

  const nominalAssistant = await authenticatedJson(
    fetchImpl,
    deploymentUrl + '/api/ai-analyze',
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `legajo ${nominalCandidate.legajo}`,
        mode: 'deterministic',
      }),
    },
    'BOOTSTRAP_VERIFY_AI_FAILED',
  );
  if (nominalAssistant.body?.intent !== 'person_lookup' ||
      nominalAssistant.body?.status !== 'answered' ||
      nominalAssistant.body?.engine?.externalProvider !== false ||
      nominalAssistant.body?.engine?.generated !== false ||
      nominalAssistant.body?.dataStatus?.source !== 'grh_directory_private_contract' ||
      nominalAssistant.body?.dataStatus?.snapshotAsOf !== state.snapshotAsOf ||
      nominalAssistant.body?.provenance?.sourceSha256 !== state.sourceSha256 ||
      nominalAssistant.body?.provenance?.snapshotAsOf !== state.snapshotAsOf ||
      nominalAssistant.body?.answer?.directory?.status !== 'matched') {
    fail('BOOTSTRAP_VERIFY_AI_FAILED');
  }
  state.status = 'verified';
  state.deployment.verifiedAt = new Date().toISOString();
  await writeState(loaded.statePath, state, securePathImpl);
  return Object.freeze({
    status: 'verified',
    stableAliasUnchanged: true,
    schemaVersion: DIRECTORY_CONTRACT,
    snapshotAsOf: state.snapshotAsOf,
    recordCount: state.recordCount,
    leaveAvailable: state.leaveRecordCount > 0,
    positionObservationAvailable: state.positionObservationCount > 0,
    nominalAiVerified: true,
  });
}

async function removeIfExact(target, expectedSha) {
  const content = await fs.readFile(target).catch(() => fail('BOOTSTRAP_CLEANUP_FILE_MISSING'));
  if (expectedSha && sha256(content) !== expectedSha) fail('BOOTSTRAP_CLEANUP_FILE_DRIFT');
  await fs.rm(target, { force: true });
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
    credentialPath: state.credentialPath,
    stableAliasUnchanged: true,
  });
}

export function safeCliResult(result) {
  if (!result || typeof result !== 'object') return Object.freeze({ ok: true });
  const allowed = [
    'statePath', 'endpointRelativePath', 'payloadBytes', 'uncompressedBytes',
    'recordCount', 'leaveRecordCount', 'positionObservationCount', 'status',
    'deploymentId', 'deploymentUrl', 'stableAliasUnchanged', 'schemaVersion',
    'snapshotAsOf', 'leaveAvailable', 'positionObservationAvailable', 'nominalAiVerified',
    'deploymentRemoved', 'bootstrapSecretRemoved', 'allowlistRetained', 'credentialPath',
  ];
  return Object.freeze(Object.fromEntries(
    allowed.filter(key => Object.hasOwn(result, key)).map(key => [key, result[key]]),
  ));
}
