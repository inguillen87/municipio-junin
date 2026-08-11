import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import {
  GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
  GRH_WORKFORCE_FINANCE_APPROVED_SOURCE,
  GRH_WORKFORCE_FINANCE_POLICY_VERSION,
  inspectGrhWorkforceFinanceSourceContract,
} from '../api/lib/grh-workforce-finance-source-contract.js';
import { renderGrhWorkforceFinanceBootstrapFunction } from './grh-workforce-finance-bootstrap-function-template.mjs';

export const BOOTSTRAP_CONTRACT = 'grh-workforce-finance-bootstrap-v1';
export const SNAPSHOT_KEY_ENV = 'GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_V1';
export const ARTIFACT_SOURCE_ENV = 'GRH_WORKFORCE_FINANCE_ARTIFACT_SOURCE';
export const BOOTSTRAP_SECRET_ENV = 'GRH_WORKFORCE_FINANCE_BOOTSTRAP_SECRET';
export const APPROVED_SNAPSHOT_KEY_FINGERPRINT_SHA256 =
  'cab6b6e8aeb83141996b9cc7f92c0dad215bdc1c9d96a689253fd571b7af2100';
export const STABLE_PRODUCTION_URL = 'https://municipio-junin.vercel.app';
export const VERCEL_PROJECT = 'municipio-junin';
export const VERCEL_SCOPE = 'marcelos-projects-c26aa499';

const repositoryRootDefault = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = '__MUNICTRL_WORKFORCE_BOOTSTRAP__';
const GIT_SHA = /^[0-9a-f]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const MAX_COMPRESSED_BYTES = 2 * 1024 * 1024;
const STATUSES = new Set([
  'prepared', 'deployment_created', 'apply_ambiguous', 'verified', 'cleaned',
  'aborted_ambiguous',
]);

export class WorkforceFinanceBootstrapError extends Error {
  constructor(code) {
    super(code);
    this.name = 'WorkforceFinanceBootstrapError';
    this.code = code;
  }
}

function fail(code) {
  throw new WorkforceFinanceBootstrapError(code);
}

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (plainObject(value)) {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function inside(candidate, parent) {
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

async function writeExclusive(target, data) {
  try {
    await fs.writeFile(target, data, { flag: 'wx', mode: 0o600 });
  } catch {
    fail('BOOTSTRAP_FILE_ALREADY_EXISTS');
  }
}

async function readJson(target, code) {
  try {
    return JSON.parse(await fs.readFile(target, 'utf8'));
  } catch {
    fail(code);
  }
}

async function writeState(statePath, state, securePathImpl) {
  await fs.writeFile(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  await securePathImpl(statePath, false);
}

function parseWindowsSid(output) {
  return String(output || '').match(/S-\d-(?:\d+-){1,14}\d+/)?.[0] || null;
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
  return command === 'git' ? { command: 'git.exe', args } : { command, args };
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
    encoding: 'utf8', windowsHide: true,
  });
  const sid = identity.status === 0 ? parseWindowsSid(identity.stdout) : null;
  if (!sid) fail('BOOTSTRAP_ACL_FAILED');
  const permission = directory ? `*${sid}:(OI)(CI)F` : `*${sid}:F`;
  const acl = spawnSync('icacls.exe', [target, '/inheritance:r', '/grant:r', permission], {
    encoding: 'utf8', windowsHide: true,
  });
  if (acl.status !== 0) fail('BOOTSTRAP_ACL_FAILED');
}

function run(runner, command, args, options) {
  const result = runner(command, args, options);
  if (!result || typeof result.stdout !== 'string') fail('BOOTSTRAP_COMMAND_RESULT_INVALID');
  return result;
}

function exactGit(runner, cwd, args, code) {
  const output = run(runner, 'git', args, { cwd }).stdout.trim();
  if (/[\r\n]/.test(output)) fail(code);
  return output;
}

function assertPinnedGit({ runner, repositoryRoot, worktreePath, expectedGitSha = null, endpointRelativePath = null, preparing = false }) {
  const code = preparing ? 'BOOTSTRAP_PREPARE_GIT_PIN_INVALID' : 'BOOTSTRAP_GIT_PIN_INVALID';
  const sourceHead = exactGit(runner, repositoryRoot, ['rev-parse', '--verify', 'HEAD'], code);
  const sourceOrigin = exactGit(runner, repositoryRoot, ['rev-parse', '--verify', 'refs/remotes/origin/master'], code);
  const worktreeHead = exactGit(runner, worktreePath, ['rev-parse', '--verify', 'HEAD'], code);
  const worktreeOrigin = exactGit(runner, worktreePath, ['rev-parse', '--verify', 'refs/remotes/origin/master'], code);
  const branch = exactGit(runner, worktreePath, ['branch', '--show-current'], code);
  const status = run(runner, 'git', ['status', '--porcelain', '--untracked-files=all'], { cwd: worktreePath }).stdout;
  const expectedStatus = endpointRelativePath ? `?? ${endpointRelativePath.replaceAll('\\', '/')}` : '';
  const lines = String(status).split(/\r?\n/).filter(Boolean);
  const pinned = expectedGitSha || sourceHead;
  if (!GIT_SHA.test(pinned) || sourceHead !== pinned || sourceOrigin !== pinned ||
      worktreeHead !== pinned || worktreeOrigin !== pinned || branch !== '' ||
      (preparing ? lines.length !== 0 : (lines.length !== 1 || lines[0] !== expectedStatus))) {
    fail(code);
  }
  return pinned;
}

function inspectArtifact(artifact) {
  const source = artifact?.source;
  if (!inspectGrhWorkforceFinanceSourceContract(artifact).ok ||
      artifact.release_id !== GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID ||
      artifact.policy_version !== GRH_WORKFORCE_FINANCE_POLICY_VERSION ||
      source?.canonical_system !== GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.canonicalSystem ||
      source?.file !== GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.sourceFile ||
      source?.sha256 !== GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.sourceSha256 ||
      source?.compressed_size_bytes !== GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.compressedSizeBytes ||
      source?.snapshot_as_of !== GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.snapshotAsOf) {
    fail('BOOTSTRAP_ARTIFACT_INVALID');
  }
}

function requiredWorktreeFiles(worktreePath) {
  return [
    'api/lib/grh-workforce-finance-source-contract.js',
    'api/lib/grh-workforce-finance-snapshot.js',
    'api/lib/grh-workforce-finance-artifact.js',
    'api/lib/grh-workforce-finance-snapshot-publisher.js',
    'api/grh-workforce-finance.js',
    'shared/database-url-policy.cjs',
    'vercel.json',
  ].map(relative => path.join(worktreePath, relative));
}

export async function prepareWorkforceFinanceBootstrap({
  worktreePath,
  artifactPath,
  stateDirectory,
  repositoryRoot = repositoryRootDefault,
  runner = defaultCommandRunner,
  securePathImpl = defaultSecurePath,
  randomUuidImpl = randomUUID,
  randomBytesImpl = randomBytes,
  now = () => new Date(),
} = {}) {
  const worktree = path.resolve(worktreePath || '');
  const artifactFile = path.resolve(artifactPath || '');
  const stateDir = path.resolve(stateDirectory || '');
  const repo = path.resolve(repositoryRoot || '');
  if (!worktreePath || !artifactPath || !stateDirectory ||
      inside(stateDir, repo) || inside(stateDir, worktree) ||
      inside(artifactFile, repo) || inside(artifactFile, worktree) ||
      await exists(stateDir)) {
    fail('BOOTSTRAP_PREPARE_PATH_INVALID');
  }
  for (const required of requiredWorktreeFiles(worktree)) {
    if (!await exists(required)) fail('BOOTSTRAP_WORKTREE_INVALID');
  }
  const expectedGitSha = assertPinnedGit({
    runner, repositoryRoot: repo, worktreePath: worktree, preparing: true,
  });
  const stat = await fs.stat(artifactFile).catch(() => fail('BOOTSTRAP_ARTIFACT_UNREADABLE'));
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_ARTIFACT_BYTES) {
    fail('BOOTSTRAP_ARTIFACT_SIZE_INVALID');
  }
  const artifactBytes = await fs.readFile(artifactFile);
  let artifact;
  try {
    artifact = JSON.parse(artifactBytes.toString('utf8'));
  } catch {
    fail('BOOTSTRAP_ARTIFACT_INVALID');
  }
  inspectArtifact(artifact);
  const operationId = randomUuidImpl();
  const entityId = randomUuidImpl();
  if (!UUID.test(operationId) || !UUID.test(entityId) || operationId === entityId) {
    fail('BOOTSTRAP_ID_INVALID');
  }
  const semanticArtifactSha256 = sha256(Buffer.from(canonicalJson(artifact), 'utf8'));
  const endpointRelativePath = `api/internal-grh-workforce-finance-bootstrap-${operationId}.js`;
  const endpointPath = path.join(worktree, endpointRelativePath);
  const endpointRoute = '/' + endpointRelativePath.replace(/\.js$/, '').replaceAll('\\', '/');
  const endpointSource = renderGrhWorkforceFinanceBootstrapFunction({
    operationId,
    entityId,
    artifactSha256: semanticArtifactSha256,
    keyFingerprintSha256: APPROVED_SNAPSHOT_KEY_FINGERPRINT_SHA256,
  });
  const secret = randomBytesImpl(32).toString('base64url');
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) fail('BOOTSTRAP_SECRET_INVALID');
  const payload = {
    contract: BOOTSTRAP_CONTRACT,
    operationId,
    entityId,
    artifact,
  };
  const rawPayload = Buffer.from(JSON.stringify(payload), 'utf8');
  const compressed = gzipSync(rawPayload, { level: 9 });
  if (rawPayload.length > MAX_ARTIFACT_BYTES || compressed.length > MAX_COMPRESSED_BYTES) {
    fail('BOOTSTRAP_PAYLOAD_SIZE_INVALID');
  }
  const paths = {
    statePath: path.join(stateDir, 'grh-workforce-finance-bootstrap.state.json'),
    secretPath: path.join(stateDir, 'grh-workforce-finance-bootstrap.secret'),
    payloadPath: path.join(stateDir, 'grh-workforce-finance-bootstrap.payload.json.gz'),
  };
  const state = {
    schemaVersion: BOOTSTRAP_CONTRACT,
    status: 'prepared',
    createdAt: now().toISOString(),
    repositoryRoot: repo,
    worktreePath: worktree,
    expectedGitSha,
    operationId,
    entityId,
    endpointRelativePath,
    endpointPath,
    endpointRoute,
    endpointSha256: sha256(endpointSource),
    artifactFileSha256: sha256(artifactBytes),
    artifactSha256: semanticArtifactSha256,
    payloadPath: paths.payloadPath,
    payloadSha256: sha256(compressed),
    payloadBytes: compressed.length,
    secretPath: paths.secretPath,
    keyFingerprintSha256: APPROVED_SNAPSHOT_KEY_FINGERPRINT_SHA256,
    sourceSha256: GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.sourceSha256,
    snapshotAsOf: GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.snapshotAsOf,
    releaseId: GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
    policyVersion: GRH_WORKFORCE_FINANCE_POLICY_VERSION,
    periodCount: artifact.period_totals.length,
    dimensionViewCount: artifact.dimension_views.length,
    stableProductionUrl: STABLE_PRODUCTION_URL,
    deployment: null,
    receipt: null,
  };
  try {
    await fs.mkdir(stateDir, { recursive: false, mode: 0o700 });
    await securePathImpl(stateDir, true);
    await writeExclusive(endpointPath, endpointSource);
    await writeExclusive(paths.secretPath, secret);
    await securePathImpl(paths.secretPath, false);
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
    expectedGitSha,
    operationId,
    entityId,
    artifactSha256: semanticArtifactSha256,
    artifactFileSha256: state.artifactFileSha256,
    keyFingerprintSha256: state.keyFingerprintSha256,
    payloadBytes: compressed.length,
    periodCount: state.periodCount,
    dimensionViewCount: state.dimensionViewCount,
  });
}

async function loadState(statePath) {
  const resolved = path.resolve(statePath || '');
  const state = await readJson(resolved, 'BOOTSTRAP_STATE_UNREADABLE');
  if (state.schemaVersion !== BOOTSTRAP_CONTRACT || !STATUSES.has(state.status) ||
      !GIT_SHA.test(state.expectedGitSha || '') || !UUID.test(state.operationId || '') ||
      !UUID.test(state.entityId || '') || !SHA256.test(state.endpointSha256 || '') ||
      !SHA256.test(state.payloadSha256 || '') || !SHA256.test(state.artifactSha256 || '') ||
      state.keyFingerprintSha256 !== APPROVED_SNAPSHOT_KEY_FINGERPRINT_SHA256 ||
      state.releaseId !== GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID ||
      state.sourceSha256 !== GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.sourceSha256 ||
      state.stableProductionUrl !== STABLE_PRODUCTION_URL) {
    fail('BOOTSTRAP_STATE_INVALID');
  }
  return { statePath: resolved, state };
}

async function verifyPreparedFiles(state) {
  const [endpoint, payload, secret] = await Promise.all([
    fs.readFile(state.endpointPath),
    fs.readFile(state.payloadPath),
    fs.readFile(state.secretPath, 'utf8'),
  ]).catch(() => fail('BOOTSTRAP_PREPARED_FILES_INVALID'));
  if (sha256(endpoint) !== state.endpointSha256 || sha256(payload) !== state.payloadSha256 ||
      payload.length !== state.payloadBytes || !/^[A-Za-z0-9_-]{43}$/.test(secret)) {
    fail('BOOTSTRAP_PREPARED_FILES_INVALID');
  }
  return { secret };
}

function parseJsonOutput(result, code) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail(code);
  }
}

function collectEnvNames(value, names = new Set()) {
  if (Array.isArray(value)) value.forEach(child => collectEnvNames(child, names));
  else if (plainObject(value)) {
    if (typeof value.name === 'string') names.add(value.name);
    if (typeof value.key === 'string') names.add(value.key);
    Object.values(value).forEach(child => collectEnvNames(child, names));
  }
  return names;
}

function deploymentIdentity(value) {
  const item = plainObject(value?.deployment) ? value.deployment : value;
  const id = item?.id || item?.uid || item?.deploymentId;
  const rawUrl = item?.url || item?.deploymentUrl;
  const url = typeof rawUrl === 'string'
    ? (rawUrl.startsWith('https://') ? rawUrl : `https://${rawUrl}`)
    : null;
  return { id: typeof id === 'string' ? id : null, url };
}

function ready(value, id) {
  const target = String(value?.target || value?.environment || '').toLowerCase();
  const status = String(value?.readyState || value?.status || value?.state || '').toUpperCase();
  return deploymentIdentity(value).id === id && ['READY', 'READY_STATE_READY'].includes(status) &&
    (!target || target === 'production');
}

function uniqueDeploymentUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.vercel.app') ||
        parsed.origin === STABLE_PRODUCTION_URL || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      fail('BOOTSTRAP_DEPLOYMENT_URL_INVALID');
    }
    return parsed.origin;
  } catch (error) {
    if (error instanceof WorkforceFinanceBootstrapError) throw error;
    fail('BOOTSTRAP_DEPLOYMENT_URL_INVALID');
  }
}

function curlQuote(value) {
  const text = String(value);
  if (/[\0\r\n]/.test(text)) fail('BOOTSTRAP_CURL_CONFIG_INVALID');
  return text.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\t', '\\t');
}

function curlConfig({ secret, payloadPath, payloadSha256 }) {
  return [
    'silent',
    'show-error',
    'request = "POST"',
    'header = "Content-Type: application/gzip"',
    `header = "${curlQuote('X-GRH-Workforce-Bootstrap-Secret: ' + secret)}"`,
    `header = "${curlQuote('X-GRH-Body-Sha256: ' + payloadSha256)}"`,
    `data-binary = "${curlQuote('@' + path.resolve(payloadPath))}"`,
    `write-out = "\\n${MARKER}%{http_code}|%header{x-municontrol-contract}"`,
  ].join('\n') + '\n';
}

function parseCurl(result, code) {
  if (Buffer.byteLength(result.stdout, 'utf8') > 1024 * 1024) fail(code);
  const marker = '\n' + MARKER;
  const index = result.stdout.lastIndexOf(marker);
  if (index < 0) fail(code);
  const receipt = result.stdout.slice(index + marker.length).trimEnd().match(/^(\d{3})\|([A-Za-z0-9._-]{0,128})$/);
  if (!receipt) fail(code);
  let body;
  try {
    body = JSON.parse(result.stdout.slice(0, index));
  } catch {
    fail(code);
  }
  return { status: Number(receipt[1]), contract: receipt[2], body };
}

function postPayload(runner, state, secret, code) {
  const result = run(runner, 'vercel', [
    'curl', state.endpointRoute, '--deployment', uniqueDeploymentUrl(state.deployment.url),
    '--yes', '--', '--config', '-',
  ], {
    cwd: state.worktreePath,
    input: curlConfig({ secret, payloadPath: state.payloadPath, payloadSha256: state.payloadSha256 }),
  });
  return parseCurl(result, code);
}

function inspectReceipt(receipt, state, { requireReused = false } = {}) {
  const body = receipt.body;
  if (receipt.status !== 201 || receipt.contract !== BOOTSTRAP_CONTRACT ||
      !exactKeys(body, [
        'ok', 'code', 'releaseId', 'sourceSha256', 'snapshotAsOf', 'artifactSha256',
        'envelopeSha256', 'ciphertextSha256', 'keyFingerprintSha256', 'periodCount',
        'dimensionViewCount', 'cellCount', 'createdCount', 'reusedCount',
      ]) || body.ok !== true || body.code !== 'GRH_WORKFORCE_FINANCE_BOOTSTRAP_APPLIED' ||
      body.releaseId !== state.releaseId || body.sourceSha256 !== state.sourceSha256 ||
      body.snapshotAsOf !== state.snapshotAsOf || body.artifactSha256 !== state.artifactSha256 ||
      body.keyFingerprintSha256 !== state.keyFingerprintSha256 ||
      !SHA256.test(body.envelopeSha256 || '') || !SHA256.test(body.ciphertextSha256 || '') ||
      body.periodCount !== state.periodCount || body.dimensionViewCount !== state.dimensionViewCount ||
      !Number.isSafeInteger(body.cellCount) || body.cellCount < 0 ||
      body.createdCount + body.reusedCount !== 1 ||
      (requireReused && (body.createdCount !== 0 || body.reusedCount !== 1))) {
    fail('BOOTSTRAP_APPLY_RESPONSE_INVALID');
  }
  return body;
}

function inspectAlias(runner, state, expectedId) {
  const inspection = parseJsonOutput(run(runner, 'vercel', [
    'inspect', STABLE_PRODUCTION_URL, '--json',
  ], { cwd: state.worktreePath }), 'BOOTSTRAP_ALIAS_INSPECTION_INVALID');
  if (deploymentIdentity(inspection).id !== expectedId) fail('BOOTSTRAP_ALIAS_MOVED');
}

async function rollbackPreApply({ runner, state, statePath, securePathImpl, secretAdded, deploymentAdded }) {
  let failed = false;
  const attempt = args => {
    try { run(runner, 'vercel', args, { cwd: state.worktreePath }); } catch { failed = true; }
  };
  if (deploymentAdded && state.deployment?.id) attempt(['remove', state.deployment.id, '--yes']);
  if (secretAdded) attempt(['env', 'rm', BOOTSTRAP_SECRET_ENV, 'production', '--yes']);
  state.status = failed ? 'deployment_created' : 'prepared';
  if (!failed) state.deployment = null;
  await writeState(statePath, state, securePathImpl);
  if (failed) fail('BOOTSTRAP_PREAPPLY_CLEANUP_FAILED');
}

function assertRecordedDeployment(runner, state) {
  if (!state.deployment?.id || state.deployment.skipDomain !== true) fail('BOOTSTRAP_DEPLOYMENT_STATE_INVALID');
  const inspection = parseJsonOutput(run(runner, 'vercel', [
    'inspect', uniqueDeploymentUrl(state.deployment.url), '--json', '--wait', '--timeout', '3m',
  ], { cwd: state.worktreePath }), 'BOOTSTRAP_DEPLOYMENT_INSPECTION_INVALID');
  if (!ready(inspection, state.deployment.id)) fail('BOOTSTRAP_DEPLOYMENT_NOT_READY');
  inspectAlias(runner, state, state.deployment.baselineAliasDeploymentId);
}

export async function applyWorkforceFinanceBootstrap({
  statePath,
  runner = defaultCommandRunner,
  securePathImpl = defaultSecurePath,
} = {}) {
  const loaded = await loadState(statePath);
  const { state } = loaded;
  if (state.status !== 'prepared' || state.deployment !== null) fail('BOOTSTRAP_STATE_NOT_PREPARED');
  const { secret } = await verifyPreparedFiles(state);
  assertPinnedGit({
    runner, repositoryRoot: state.repositoryRoot, worktreePath: state.worktreePath,
    expectedGitSha: state.expectedGitSha, endpointRelativePath: state.endpointRelativePath,
  });
  run(runner, 'vercel', ['link', '--yes', '--project', VERCEL_PROJECT, '--scope', VERCEL_SCOPE], {
    cwd: state.worktreePath,
  });
  const env = parseJsonOutput(run(runner, 'vercel', ['env', 'ls', 'production', '--json'], {
    cwd: state.worktreePath,
  }), 'BOOTSTRAP_ENV_LIST_INVALID');
  const envNames = collectEnvNames(env);
  if (!envNames.has(SNAPSHOT_KEY_ENV) || !envNames.has(ARTIFACT_SOURCE_ENV) ||
      envNames.has(BOOTSTRAP_SECRET_ENV)) {
    fail('BOOTSTRAP_RUNTIME_ENV_INVALID');
  }
  const baselineInspection = parseJsonOutput(run(runner, 'vercel', [
    'inspect', STABLE_PRODUCTION_URL, '--json',
  ], { cwd: state.worktreePath }), 'BOOTSTRAP_BASELINE_INSPECTION_INVALID');
  const baseline = deploymentIdentity(baselineInspection);
  if (!baseline.id || !ready(baselineInspection, baseline.id)) fail('BOOTSTRAP_BASELINE_INSPECTION_INVALID');
  let secretAdded = false;
  let deploymentAdded = false;
  let applyStarted = false;
  try {
    run(runner, 'vercel', [
      'env', 'add', BOOTSTRAP_SECRET_ENV, 'production', '--sensitive', '--yes',
    ], { cwd: state.worktreePath, input: secret });
    secretAdded = true;
    const deployed = parseJsonOutput(run(runner, 'vercel', [
      'deploy', '--prod', '--skip-domain', '--yes', '--json',
    ], { cwd: state.worktreePath }), 'BOOTSTRAP_DEPLOYMENT_OUTPUT_INVALID');
    const deployment = deploymentIdentity(deployed);
    if (!deployment.id || !deployment.url) fail('BOOTSTRAP_DEPLOYMENT_OUTPUT_INVALID');
    state.status = 'deployment_created';
    state.deployment = {
      id: deployment.id,
      url: uniqueDeploymentUrl(deployment.url),
      baselineAliasDeploymentId: baseline.id,
      skipDomain: true,
    };
    deploymentAdded = true;
    await writeState(loaded.statePath, state, securePathImpl);
    assertRecordedDeployment(runner, state);
    applyStarted = true;
    let first;
    try {
      first = inspectReceipt(postPayload(runner, state, secret, 'BOOTSTRAP_APPLY_AMBIGUOUS'), state);
    } catch {
      state.status = 'apply_ambiguous';
      await writeState(loaded.statePath, state, securePathImpl);
      fail('BOOTSTRAP_APPLY_AMBIGUOUS');
    }
    let second;
    try {
      second = inspectReceipt(postPayload(runner, state, secret, 'BOOTSTRAP_VERIFY_AMBIGUOUS'), state, {
        requireReused: true,
      });
    } catch {
      state.status = 'apply_ambiguous';
      await writeState(loaded.statePath, state, securePathImpl);
      fail('BOOTSTRAP_VERIFY_AMBIGUOUS');
    }
    if (first.envelopeSha256 !== second.envelopeSha256 ||
        first.ciphertextSha256 !== second.ciphertextSha256) {
      state.status = 'apply_ambiguous';
      await writeState(loaded.statePath, state, securePathImpl);
      fail('BOOTSTRAP_IDEMPOTENT_READBACK_INVALID');
    }
    inspectAlias(runner, state, baseline.id);
    state.status = 'verified';
    state.receipt = second;
    await writeState(loaded.statePath, state, securePathImpl);
    return Object.freeze({
      status: 'verified',
      deploymentId: state.deployment.id,
      deploymentUrl: state.deployment.url,
      stableAliasUnchanged: true,
      releaseId: state.releaseId,
      sourceSha256: state.sourceSha256,
      artifactSha256: state.artifactSha256,
      envelopeSha256: second.envelopeSha256,
      ciphertextSha256: second.ciphertextSha256,
      keyFingerprintSha256: state.keyFingerprintSha256,
      periodCount: second.periodCount,
      dimensionViewCount: second.dimensionViewCount,
      cellCount: second.cellCount,
    });
  } catch (error) {
    if (!applyStarted) {
      await rollbackPreApply({
        runner, state, statePath: loaded.statePath, securePathImpl,
        secretAdded, deploymentAdded,
      });
    }
    throw error;
  }
}

export async function resolveAmbiguousWorkforceFinanceBootstrap({
  statePath,
  runner = defaultCommandRunner,
  securePathImpl = defaultSecurePath,
} = {}) {
  const loaded = await loadState(statePath);
  const { state } = loaded;
  if (state.status !== 'apply_ambiguous') fail('BOOTSTRAP_STATE_NOT_AMBIGUOUS');
  const { secret } = await verifyPreparedFiles(state);
  assertRecordedDeployment(runner, state);
  const receipt = inspectReceipt(postPayload(runner, state, secret, 'BOOTSTRAP_RESOLVE_FAILED'), state, {
    requireReused: true,
  });
  inspectAlias(runner, state, state.deployment.baselineAliasDeploymentId);
  state.status = 'verified';
  state.receipt = receipt;
  await writeState(loaded.statePath, state, securePathImpl);
  return Object.freeze({
    status: 'verified',
    stableAliasUnchanged: true,
    releaseId: state.releaseId,
    artifactSha256: state.artifactSha256,
    envelopeSha256: receipt.envelopeSha256,
    ciphertextSha256: receipt.ciphertextSha256,
    keyFingerprintSha256: state.keyFingerprintSha256,
  });
}

async function removeExact(target, expectedSha = null) {
  const content = await fs.readFile(target).catch(() => fail('BOOTSTRAP_CLEANUP_FILE_MISSING'));
  if (expectedSha && sha256(content) !== expectedSha) fail('BOOTSTRAP_CLEANUP_FILE_DRIFT');
  await fs.rm(target, { force: true });
}

export async function cleanupWorkforceFinanceBootstrap({
  statePath,
  runner = defaultCommandRunner,
  securePathImpl = defaultSecurePath,
} = {}) {
  const loaded = await loadState(statePath);
  const { state } = loaded;
  if (state.status !== 'verified' || !state.deployment?.id) fail('BOOTSTRAP_CLEANUP_REQUIRES_VERIFICATION');
  assertRecordedDeployment(runner, state);
  run(runner, 'vercel', ['env', 'rm', BOOTSTRAP_SECRET_ENV, 'production', '--yes'], {
    cwd: state.worktreePath,
  });
  run(runner, 'vercel', ['remove', state.deployment.id, '--yes'], { cwd: state.worktreePath });
  await removeExact(state.endpointPath, state.endpointSha256);
  await removeExact(state.payloadPath, state.payloadSha256);
  await removeExact(state.secretPath);
  state.status = 'cleaned';
  await writeState(loaded.statePath, state, securePathImpl);
  return Object.freeze({
    status: 'cleaned',
    deploymentRemoved: true,
    bootstrapSecretRemoved: true,
    snapshotKeyRetained: true,
    artifactSourceRetained: true,
    stableAliasUnchanged: true,
    releaseId: state.releaseId,
    artifactSha256: state.artifactSha256,
    envelopeSha256: state.receipt.envelopeSha256,
    ciphertextSha256: state.receipt.ciphertextSha256,
    keyFingerprintSha256: state.keyFingerprintSha256,
  });
}

export async function abortAmbiguousWorkforceFinanceBootstrap({
  statePath,
  runner = defaultCommandRunner,
  securePathImpl = defaultSecurePath,
} = {}) {
  const loaded = await loadState(statePath);
  const { state } = loaded;
  if (state.status !== 'apply_ambiguous' || !state.deployment?.id) {
    fail('BOOTSTRAP_ABORT_REQUIRES_AMBIGUOUS_STATE');
  }
  assertRecordedDeployment(runner, state);
  run(runner, 'vercel', ['env', 'rm', BOOTSTRAP_SECRET_ENV, 'production', '--yes'], {
    cwd: state.worktreePath,
  });
  run(runner, 'vercel', ['remove', state.deployment.id, '--yes'], { cwd: state.worktreePath });
  await removeExact(state.endpointPath, state.endpointSha256);
  await removeExact(state.payloadPath, state.payloadSha256);
  await removeExact(state.secretPath);
  state.status = 'aborted_ambiguous';
  state.receipt = null;
  await writeState(loaded.statePath, state, securePathImpl);
  return Object.freeze({
    status: 'aborted_ambiguous',
    deploymentRemoved: true,
    bootstrapSecretRemoved: true,
    snapshotKeyRetained: true,
    artifactSourceRetained: true,
    stableAliasUnchanged: true,
    publicationVerified: false,
    databaseMutationClaimed: false,
    keyFingerprintSha256: state.keyFingerprintSha256,
  });
}

export function safeCliResult(result) {
  const allowed = new Set([
    'statePath', 'expectedGitSha', 'operationId', 'entityId', 'artifactSha256',
    'artifactFileSha256', 'keyFingerprintSha256', 'payloadBytes', 'periodCount',
    'dimensionViewCount', 'status', 'deploymentId', 'deploymentUrl',
    'stableAliasUnchanged', 'releaseId', 'sourceSha256', 'envelopeSha256',
    'ciphertextSha256', 'cellCount', 'deploymentRemoved', 'bootstrapSecretRemoved',
    'snapshotKeyRetained', 'artifactSourceRetained',
    'publicationVerified', 'databaseMutationClaimed',
  ]);
  return Object.freeze(Object.fromEntries(Object.entries(result || {}).filter(([key]) => allowed.has(key))));
}
