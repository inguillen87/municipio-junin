import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { DATABASE_TARGET_FINGERPRINT_HEADER } from
  '../api/lib/database-target-fingerprint.js';
import { inspectGrhActionLedgerContract } from '../api/lib/grh-action-ledger-contract.js';
import publishedDemoPolicy from '../shared/published-demo-policy.cjs';

const { PUBLISHED_DEMO_PROFILES, isPublishedDemoIdentity } = publishedDemoPolicy;

export const SMOKE_CONTRACT = 'grh-action-ledger-candidate-smoke-v1';
export const LEDGER_CONTRACT = 'grh-action-ledger-v1';
export const STABLE_PRODUCTION_ORIGIN = 'https://municipio-junin.vercel.app';
export const DISPOSABLE_MUTATION_SCOPE = 'DISPOSABLE_PREVIEW_LEDGER_V1';
export const DEFAULT_VERCEL_PROJECT = 'municipio-junin';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPOSITORY_ROOT = path.resolve(moduleDirectory, '..');

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const DEPLOYMENT_ID_PATTERN = /^dpl_[A-Za-z0-9_-]{6,}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CURL_MARKER = '__MUNICTRL_LEDGER_SMOKE__';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_UI_BYTES = 512 * 1024;
const READER_ROLES = new Set(['INTENDENTE', 'TENANT_ADMIN', 'CONTADOR']);

const ENV = Object.freeze({
  candidateUrl: 'MUNICONTROL_LEDGER_CANDIDATE_URL',
  deploymentId: 'MUNICONTROL_LEDGER_CANDIDATE_DEPLOYMENT_ID',
  gitSha: 'MUNICONTROL_LEDGER_EXPECTED_GIT_SHA',
  project: 'MUNICONTROL_LEDGER_VERCEL_PROJECT',
  intendenteEmail: 'MUNICONTROL_LEDGER_INTENDENTE_EMAIL',
  intendentePassword: 'MUNICONTROL_LEDGER_INTENDENTE_PASSWORD',
  contadorEmail: 'MUNICONTROL_LEDGER_CONTADOR_EMAIL',
  contadorPassword: 'MUNICONTROL_LEDGER_CONTADOR_PASSWORD',
  demoEmail: 'MUNICONTROL_LEDGER_DEMO_EMAIL',
  demoPassword: 'MUNICONTROL_LEDGER_DEMO_PASSWORD',
  mutationScope: 'MUNICONTROL_LEDGER_MUTATION_SCOPE',
  disposableFingerprint: 'MUNICONTROL_LEDGER_DISPOSABLE_TARGET_FINGERPRINT',
});

export class LedgerCandidateSmokeError extends Error {
  constructor(code) {
    super('GRH action ledger candidate smoke failed');
    this.name = 'LedgerCandidateSmokeError';
    this.code = code;
  }
}

function fail(code) {
  throw new LedgerCandidateSmokeError(code);
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalLf(value) {
  return value.replace(/\r\n?/g, '\n');
}

function requiredText(value, code, maximum = 1024) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim() || value.length > maximum ||
      /[\0\r\n]/.test(value)) fail(code);
  return value;
}

function normalizedEmail(value, code) {
  const email = requiredText(value, code, 254).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) fail(code);
  return email;
}

export function normalizeCandidateOrigin(value) {
  const input = requiredText(value, 'LEDGER_SMOKE_CANDIDATE_URL_INVALID', 2048);
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    fail('LEDGER_SMOKE_CANDIDATE_URL_INVALID');
  }
  const suffix = input.match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]+(.*)$/i)?.[1];
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      !parsed.hostname.endsWith('.vercel.app') || parsed.hostname === 'vercel.app' ||
      parsed.pathname !== '/' || parsed.search || parsed.hash ||
      !['', '/'].includes(suffix) || parsed.origin === STABLE_PRODUCTION_ORIGIN) {
    fail('LEDGER_SMOKE_CANDIDATE_URL_INVALID');
  }
  return parsed.origin;
}

function parseArguments(argv) {
  const values = Object.create(null);
  let mutateDisposable = false;
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--mutate-disposable') {
      mutateDisposable = true;
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      help = true;
      continue;
    }
    const key = {
      '--candidate-url': 'candidateUrl',
      '--deployment-id': 'deploymentId',
      '--git-sha': 'gitSha',
    }[argument];
    if (!key || index + 1 >= argv.length || String(argv[index + 1]).startsWith('--')) {
      fail('LEDGER_SMOKE_ARGUMENT_INVALID');
    }
    if (values[key] !== undefined) fail('LEDGER_SMOKE_ARGUMENT_INVALID');
    values[key] = argv[index + 1];
    index += 1;
  }
  return { values, mutateDisposable, help };
}

function argumentOrEnvironment(argument, environment, name, code) {
  const fromEnvironment = environment[name];
  if (argument !== undefined && fromEnvironment !== undefined && argument !== fromEnvironment) {
    fail('LEDGER_SMOKE_CONFIGURATION_CONFLICT');
  }
  return requiredText(argument ?? fromEnvironment, code, 2048);
}

function credential(environment, emailName, passwordName, code) {
  return Object.freeze({
    email: normalizedEmail(environment[emailName], code),
    password: requiredText(environment[passwordName], code, 1024),
  });
}

export function resolveCandidateSmokeConfiguration(argv = [], environment = {}) {
  const parsed = parseArguments(argv);
  if (parsed.help) return Object.freeze({ help: true });

  const candidateUrl = normalizeCandidateOrigin(argumentOrEnvironment(
    parsed.values.candidateUrl,
    environment,
    ENV.candidateUrl,
    'LEDGER_SMOKE_CANDIDATE_URL_REQUIRED',
  ));
  const deploymentId = argumentOrEnvironment(
    parsed.values.deploymentId,
    environment,
    ENV.deploymentId,
    'LEDGER_SMOKE_DEPLOYMENT_ID_REQUIRED',
  );
  const gitSha = argumentOrEnvironment(
    parsed.values.gitSha,
    environment,
    ENV.gitSha,
    'LEDGER_SMOKE_GIT_SHA_REQUIRED',
  );
  const project = requiredText(environment[ENV.project] || DEFAULT_VERCEL_PROJECT,
    'LEDGER_SMOKE_PROJECT_INVALID', 128);
  if (!DEPLOYMENT_ID_PATTERN.test(deploymentId)) fail('LEDGER_SMOKE_DEPLOYMENT_ID_INVALID');
  if (!GIT_SHA_PATTERN.test(gitSha)) fail('LEDGER_SMOKE_GIT_SHA_INVALID');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(project)) fail('LEDGER_SMOKE_PROJECT_INVALID');

  const credentials = Object.freeze({
    intendente: credential(environment, ENV.intendenteEmail, ENV.intendentePassword,
      'LEDGER_SMOKE_INTENDENTE_CREDENTIAL_REQUIRED'),
    contador: credential(environment, ENV.contadorEmail, ENV.contadorPassword,
      'LEDGER_SMOKE_CONTADOR_CREDENTIAL_REQUIRED'),
    demo: credential(environment, ENV.demoEmail, ENV.demoPassword,
      'LEDGER_SMOKE_DEMO_CREDENTIAL_REQUIRED'),
  });
  if (new Set(Object.values(credentials).map(item => item.email)).size !== 3) {
    fail('LEDGER_SMOKE_CREDENTIAL_IDENTITY_COLLISION');
  }
  if (!isPublishedDemoIdentity(credentials.demo.email)) fail('LEDGER_SMOKE_DEMO_IDENTITY_INVALID');

  let disposableTargetFingerprint = null;
  if (parsed.mutateDisposable) {
    if (environment[ENV.mutationScope] !== DISPOSABLE_MUTATION_SCOPE) {
      fail('LEDGER_SMOKE_DISPOSABLE_SCOPE_REQUIRED');
    }
    disposableTargetFingerprint = requiredText(
      environment[ENV.disposableFingerprint],
      'LEDGER_SMOKE_DISPOSABLE_FINGERPRINT_REQUIRED',
      64,
    );
    if (!SHA256_PATTERN.test(disposableTargetFingerprint)) {
      fail('LEDGER_SMOKE_DISPOSABLE_FINGERPRINT_INVALID');
    }
  }

  return Object.freeze({
    help: false,
    mode: parsed.mutateDisposable ? 'mutate_disposable' : 'read_only',
    candidateUrl,
    deploymentId,
    gitSha,
    project,
    credentials,
    disposableTargetFingerprint,
  });
}

function safeCommandArgument(value) {
  const text = String(value);
  if (!text || /[\0\r\n"%]/.test(text)) fail('LEDGER_SMOKE_COMMAND_ARGUMENT_INVALID');
  return text;
}

export function resolveCommandInvocation(command, args, environment = {}) {
  const safeArgs = args.map(safeCommandArgument);
  if (process.platform !== 'win32' || command !== 'vercel') return { command, args: safeArgs };
  const commandLine = `"${['vercel.cmd', ...safeArgs].map(value => `"${value}"`).join(' ')}"`;
  return {
    command: environment.ComSpec || 'cmd.exe',
    args: ['/d', '/v:off', '/s', '/c', commandLine],
  };
}

export function defaultCommandRunner(command, args, { cwd, input } = {}) {
  const invocation = resolveCommandInvocation(command, args, process.env);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    input,
    encoding: 'utf8',
    windowsHide: true,
    windowsVerbatimArguments: process.platform === 'win32' && command === 'vercel',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) fail('LEDGER_SMOKE_COMMAND_FAILED');
  return Object.freeze({ stdout: result.stdout || '', stderr: result.stderr || '' });
}

function run(runner, command, args, options, code) {
  let result;
  try {
    result = runner(command, args, options);
  } catch {
    fail(code);
  }
  if (!result || typeof result.stdout !== 'string') fail(code);
  return result;
}

function parseJsonOutput(result, code) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail(code);
  }
}

function deploymentIdentity(value) {
  const candidate = value?.deployment && typeof value.deployment === 'object'
    ? value.deployment
    : value;
  const id = candidate?.id || candidate?.deploymentId || candidate?.uid;
  const rawUrl = candidate?.url || candidate?.deploymentUrl || candidate?.inspectorUrl;
  let url = null;
  if (typeof rawUrl === 'string') {
    try {
      url = normalizeCandidateOrigin(rawUrl.startsWith('https://') ? rawUrl : `https://${rawUrl}`);
    } catch {
      url = null;
    }
  }
  return { id: typeof id === 'string' ? id : null, url };
}

function candidateGitSha(value) {
  const candidates = [
    value?.meta?.githubCommitSha,
    value?.meta?.gitCommitSha,
    value?.gitSource?.sha,
    value?.source?.sha,
  ].filter(item => item !== undefined && item !== null);
  if (candidates.length === 0 || candidates.some(item => !GIT_SHA_PATTERN.test(item))) return null;
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique[0] : null;
}

function deploymentList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray(value.deployments)) return value.deployments;
  fail('LEDGER_SMOKE_DEPLOYMENT_LIST_INVALID');
}

function readyCandidateTarget(value) {
  const status = String(value?.readyState || value?.status || value?.state || '').toUpperCase();
  const target = String(value?.target || value?.environment || '').toLowerCase();
  if (!['READY', 'READY_STATE_READY'].includes(status) ||
      !['preview', 'production'].includes(target)) return null;
  return target;
}

function assertTargetAllowedForMode(target, mode) {
  if (mode === 'read_only' && ['preview', 'production'].includes(target)) return;
  if (mode === 'mutate_disposable' && target === 'preview') return;
  if (mode === 'mutate_disposable' && target === 'production') {
    fail('LEDGER_SMOKE_MUTATION_REQUIRES_PREVIEW');
  }
  fail('LEDGER_SMOKE_CANDIDATE_TARGET_INVALID');
}

function stableAliasDeploymentId(value) {
  const identity = deploymentIdentity(value);
  const status = String(value?.readyState || value?.status || value?.state || '').toUpperCase();
  const target = String(value?.target || value?.environment || '').toLowerCase();
  if (!DEPLOYMENT_ID_PATTERN.test(identity.id || '') ||
      !['READY', 'READY_STATE_READY'].includes(status) || target !== 'production') {
    fail('LEDGER_SMOKE_STABLE_ALIAS_INVALID');
  }
  return identity.id;
}

function inspectStableAlias(runner, cwd) {
  const inspection = parseJsonOutput(run(runner, 'vercel', [
    'inspect', STABLE_PRODUCTION_ORIGIN, '--json',
  ], { cwd }, 'LEDGER_SMOKE_STABLE_ALIAS_INSPECTION_FAILED'),
  'LEDGER_SMOKE_STABLE_ALIAS_INSPECTION_INVALID');
  return stableAliasDeploymentId(inspection);
}

export function inspectCandidateDeployment({ runner = defaultCommandRunner, config, cwd = DEFAULT_REPOSITORY_ROOT } = {}) {
  const stableDeploymentIdBefore = inspectStableAlias(runner, cwd);
  if (stableDeploymentIdBefore === config.deploymentId) {
    fail('LEDGER_SMOKE_CANDIDATE_ALREADY_PROMOTED');
  }
  const inspection = parseJsonOutput(run(runner, 'vercel', [
    'inspect', config.candidateUrl, '--json', '--wait', '--timeout', '3m',
  ], { cwd }, 'LEDGER_SMOKE_DEPLOYMENT_INSPECTION_FAILED'),
  'LEDGER_SMOKE_DEPLOYMENT_INSPECTION_INVALID');
  const inspectedIdentity = deploymentIdentity(inspection);
  const inspectedTarget = readyCandidateTarget(inspection);
  if (inspectedIdentity.id !== config.deploymentId || inspectedIdentity.url !== config.candidateUrl ||
      inspectedTarget === null) fail('LEDGER_SMOKE_CANDIDATE_NOT_READY');
  assertTargetAllowedForMode(inspectedTarget, config.mode);

  const stableDeploymentIdAfter = inspectStableAlias(runner, cwd);
  if (stableDeploymentIdAfter === config.deploymentId) {
    fail('LEDGER_SMOKE_CANDIDATE_ALREADY_PROMOTED');
  }
  if (stableDeploymentIdAfter !== stableDeploymentIdBefore) {
    fail('LEDGER_SMOKE_STABLE_ALIAS_MOVED');
  }

  const listed = parseJsonOutput(run(runner, 'vercel', [
    'ls', config.project, '--json', '--limit', '100',
  ], { cwd }, 'LEDGER_SMOKE_DEPLOYMENT_LIST_FAILED'),
  'LEDGER_SMOKE_DEPLOYMENT_LIST_INVALID');
  const matches = deploymentList(listed).filter(entry => deploymentIdentity(entry).url === config.candidateUrl);
  if (matches.length !== 1) fail('LEDGER_SMOKE_CANDIDATE_PROVENANCE_INVALID');
  const listedIdentity = deploymentIdentity(matches[0]);
  const listedTarget = readyCandidateTarget(matches[0]);
  const listedIdMatches = listedIdentity.id === null || listedIdentity.id === config.deploymentId;
  if (!listedIdMatches || listedTarget !== inspectedTarget ||
      candidateGitSha(matches[0]) !== config.gitSha) {
    fail('LEDGER_SMOKE_CANDIDATE_PROVENANCE_INVALID');
  }
  const inspectedSha = candidateGitSha(inspection);
  if (inspectedSha !== null && inspectedSha !== config.gitSha) {
    fail('LEDGER_SMOKE_CANDIDATE_PROVENANCE_INVALID');
  }
  return Object.freeze({
    deploymentId: config.deploymentId,
    gitSha: config.gitSha,
    target: inspectedTarget,
    candidateUrl: config.candidateUrl,
    stableAliasDeploymentId: stableDeploymentIdBefore,
  });
}

function curlQuote(value) {
  const text = String(value);
  if (/[\0\r\n]/.test(text)) fail('LEDGER_SMOKE_CURL_CONFIG_INVALID');
  return text.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\t', '\\t');
}

export function buildProtectedCurlConfig({ method = 'GET', headers = {}, jsonBody } = {}) {
  if (!['GET', 'POST', 'PATCH'].includes(method) || !headers || typeof headers !== 'object' ||
      Array.isArray(headers)) fail('LEDGER_SMOKE_CURL_CONFIG_INVALID');
  const lines = ['silent', 'show-error', 'max-time = 20'];
  if (method !== 'GET') lines.push(`request = "${method}"`);
  for (const [name, value] of Object.entries(headers)) {
    if (!/^[A-Za-z0-9-]+$/.test(name) || typeof value !== 'string') {
      fail('LEDGER_SMOKE_CURL_CONFIG_INVALID');
    }
    lines.push(`header = "${curlQuote(`${name}: ${value}`)}"`);
  }
  if (jsonBody !== undefined) {
    lines.push(`data-binary = "${curlQuote(JSON.stringify(jsonBody))}"`);
  }
  lines.push(`write-out = "\\n${CURL_MARKER}%{http_code}|%header{x-municontrol-contract}|%header{${DATABASE_TARGET_FINGERPRINT_HEADER.toLowerCase()}}|%header{content-type}|%{url_effective}"`);
  return `${lines.join('\n')}\n`;
}

export function parseProtectedCurlResult(result, code = 'LEDGER_SMOKE_REQUEST_INVALID') {
  const output = result?.stdout;
  if (typeof output !== 'string' || Buffer.byteLength(output, 'utf8') > MAX_RESPONSE_BYTES) fail(code);
  const marker = `\n${CURL_MARKER}`;
  const index = output.lastIndexOf(marker);
  if (index < 0) fail(code);
  const receipt = output.slice(index + marker.length).trimEnd();
  const match = receipt.match(/^(\d{3})\|([A-Za-z0-9._-]{0,128})\|([A-Za-z0-9._-]{0,128})\|([^|\r\n]{0,256})\|(https:\/\/[^|\r\n]+)$/);
  if (!match) fail(code);
  return Object.freeze({
    status: Number(match[1]),
    contract: match[2] || null,
    databaseTargetFingerprint: match[3] || null,
    contentType: match[4].toLowerCase(),
    effectiveUrl: match[5],
    rawBody: output.slice(0, index),
  });
}

export function createVercelRequester({ runner = defaultCommandRunner, config, cwd = DEFAULT_REPOSITORY_ROOT } = {}) {
  return ({ route, method = 'GET', headers = {}, jsonBody }) => {
    if (typeof route !== 'string' || !/^\/[A-Za-z0-9/_-]+$/.test(route)) {
      fail('LEDGER_SMOKE_ROUTE_INVALID');
    }
    const result = run(runner, 'vercel', [
      'curl', route, '--deployment', config.candidateUrl, '--yes', '--', '--config', '-',
    ], {
      cwd,
      input: buildProtectedCurlConfig({ method, headers, jsonBody }),
    }, 'LEDGER_SMOKE_REQUEST_AMBIGUOUS');
    const parsed = parseProtectedCurlResult(result);
    const expectedUrl = `${config.candidateUrl}${route}`;
    if (parsed.effectiveUrl !== expectedUrl) fail('LEDGER_SMOKE_REDIRECT_FORBIDDEN');
    return parsed;
  };
}

function parseJsonBody(response, code) {
  if (!response.contentType.startsWith('application/json')) fail(code);
  try {
    return JSON.parse(response.rawBody);
  } catch {
    fail(code);
  }
}

function requireStatus(response, statuses, code) {
  if (!statuses.includes(response.status)) fail(code);
  return response;
}

function requireLedger(response, code) {
  requireStatus(response, [200], code);
  if (response.contract !== LEDGER_CONTRACT) fail(code);
  const body = parseJsonBody(response, code);
  if (!inspectGrhActionLedgerContract(body).ok) fail(code);
  return body;
}

function expectedDemoProfile(email) {
  return PUBLISHED_DEMO_PROFILES.find(profile => profile.email === email) || null;
}

async function login(request, credential, expectedRole, code) {
  const response = await request({
    route: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    jsonBody: credential,
  });
  requireStatus(response, [200], code);
  const body = parseJsonBody(response, code);
  const user = body?.user;
  if (typeof body?.token !== 'string' || body.token.length < 32 ||
      typeof user?.id !== 'string' || !user.id || user.role !== expectedRole ||
      user.email?.toLowerCase() !== credential.email || typeof user.tenantId !== 'string' || !user.tenantId) {
    fail(code);
  }
  return Object.freeze({ token: body.token, user });
}

function authHeaders(session) {
  return Object.freeze({ Authorization: `Bearer ${session.token}`, Accept: 'application/json' });
}

function assertReadPermissions(body, role, publishedDemo) {
  const expected = role === 'INTENDENTE'
    ? { canRead: true, canCreate: true, canUpdate: true, canCancel: true, canReschedule: true }
    : { canRead: true, canCreate: false, canUpdate: true, canCancel: false, canReschedule: false };
  if (publishedDemo) {
    expected.canCreate = false;
    expected.canUpdate = false;
    expected.canCancel = false;
    expected.canReschedule = false;
  }
  if (!exactKeys(body.permissions, Object.keys(expected)) ||
      Object.entries(expected).some(([key, value]) => body.permissions[key] !== value)) {
    fail('LEDGER_SMOKE_PERMISSION_PROJECTION_INVALID');
  }
}

function readUiContract(cwd) {
  const target = path.join(cwd, 'decisiones-grh.html');
  let stat;
  try {
    stat = lstatSync(target);
  } catch {
    fail('LEDGER_SMOKE_LOCAL_UI_INVALID');
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_UI_BYTES) {
    fail('LEDGER_SMOKE_LOCAL_UI_INVALID');
  }
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(target));
  } catch {
    fail('LEDGER_SMOKE_LOCAL_UI_INVALID');
  }
  if (!/<title>Centro de decisiones GRH \| MuniControl<\/title>/i.test(source) ||
      !/id="decisionLedger"/.test(source) || !/js\/grh-action-ledger\.js/.test(source)) {
    fail('LEDGER_SMOKE_LOCAL_UI_INVALID');
  }
  return Object.freeze({ source: canonicalLf(source), digest: sha256(canonicalLf(source)) });
}

async function verifyUi(request, cwd) {
  const local = readUiContract(cwd);
  const response = await request({
    route: '/decisiones-grh',
    method: 'GET',
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });
  requireStatus(response, [200], 'LEDGER_SMOKE_UI_UNAVAILABLE');
  if (!response.contentType.startsWith('text/html') ||
      sha256(canonicalLf(response.rawBody)) !== local.digest) {
    fail('LEDGER_SMOKE_UI_DRIFT');
  }
  return local.digest;
}

function stableUuid(label) {
  const bytes = Buffer.from(sha256(label).slice(0, 32), 'hex');
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function plusDays(dateText, days) {
  const instant = Date.parse(`${dateText}T00:00:00Z`);
  if (!Number.isFinite(instant)) fail('LEDGER_SMOKE_BRIEF_DATE_INVALID');
  return new Date(instant + days * 86_400_000).toISOString().slice(0, 10);
}

function sourceKey(body, priorityCode) {
  return canonicalJson({
    schemaVersion: body.currentBrief.schemaVersion,
    sourceSha256: body.currentBrief.sourceSha256,
    snapshotAsOf: body.currentBrief.snapshotAsOf,
    period: body.currentBrief.period,
    priorityCode,
  });
}

function commitmentFor(body, priorityCode) {
  return body.commitments.find(item => item.priorityCode === priorityCode &&
    item.source.schemaVersion === body.currentBrief.schemaVersion &&
    item.source.sourceSha256 === body.currentBrief.sourceSha256 &&
    item.source.snapshotAsOf === body.currentBrief.snapshotAsOf &&
    item.source.period === body.currentBrief.period) || null;
}

function assertHistory(body, priorityCode) {
  const commitment = commitmentFor(body, priorityCode);
  if (!commitment || commitment.state !== 'completed' || commitment.version !== 4 ||
      commitment.assignee.role !== 'CONTADOR' || commitment.outcomeCode !== 'review_completed') {
    fail('LEDGER_SMOKE_HISTORY_INVALID');
  }
  const commands = commitment.events.map(event => event.command);
  const versions = commitment.events.map(event => event.resultingVersion);
  const actors = commitment.events.map(event => event.actorRole);
  if (canonicalJson(commands) !== canonicalJson(['create', 'reschedule', 'claim', 'complete']) ||
      canonicalJson(versions) !== canonicalJson([1, 2, 3, 4]) ||
      canonicalJson(actors) !== canonicalJson(['INTENDENTE', 'INTENDENTE', 'CONTADOR', 'CONTADOR'])) {
    fail('LEDGER_SMOKE_HISTORY_INVALID');
  }
  return commitment;
}

async function denied(request, session, method, code) {
  const response = await request({
    route: '/api/grh-action-ledger',
    method,
    headers: { ...authHeaders(session), 'Content-Type': 'application/json' },
    jsonBody: {},
  });
  if (response.status !== 403 || response.contract !== LEDGER_CONTRACT) fail(code);
}

async function mutateAndVerify({
  request,
  config,
  sessions,
  initial,
  verifiedTargetFingerprint,
}) {
  if (config.mode !== 'mutate_disposable' || !SHA256_PATTERN.test(config.disposableTargetFingerprint || '')) {
    fail('LEDGER_SMOKE_MUTATION_SCOPE_INVALID');
  }
  if (verifiedTargetFingerprint !== config.disposableTargetFingerprint) {
    fail('LEDGER_SMOKE_DATABASE_TARGET_MISMATCH');
  }
  if (isPublishedDemoIdentity(config.credentials.intendente.email) ||
      isPublishedDemoIdentity(config.credentials.contador.email)) {
    fail('LEDGER_SMOKE_MUTATION_IDENTITY_NOT_PRIVATE');
  }

  const suggestion = initial.intendente.suggestions.find(item =>
    item.priorityCode === 'cross_source_material_difference' && item.defaultAssigneeRole === 'CONTADOR');
  if (!suggestion) fail('LEDGER_SMOKE_PRIORITY_UNAVAILABLE');
  const priorityCode = suggestion.priorityCode;
  const existing = commitmentFor(initial.intendente, priorityCode);
  const dueOn = plusDays(initial.intendente.currentBrief.snapshotAsOf, 30);
  const rescheduledDueOn = plusDays(initial.intendente.currentBrief.snapshotAsOf, 31);
  if (!existing && dueOn < new Date().toISOString().slice(0, 10)) {
    fail('LEDGER_SMOKE_CANDIDATE_SNAPSHOT_TOO_OLD');
  }
  const seed = canonicalJson({
    deploymentId: config.deploymentId,
    gitSha: config.gitSha,
    disposableTargetFingerprint: verifiedTargetFingerprint,
    source: sourceKey(initial.intendente, priorityCode),
    intendenteUserId: sessions.intendente.user.id,
    contadorUserId: sessions.contador.user.id,
  });
  const createBody = {
    commandId: stableUuid(`${seed}:create`),
    brief: {
      schemaVersion: initial.intendente.currentBrief.schemaVersion,
      sourceSha256: initial.intendente.currentBrief.sourceSha256,
      snapshotAsOf: initial.intendente.currentBrief.snapshotAsOf,
      period: initial.intendente.currentBrief.period,
      priorityCode,
    },
    assigneeRole: 'CONTADOR',
    dueOn,
  };
  const writeHeaders = session => ({
    ...authHeaders(session),
    'Content-Type': 'application/json',
  });

  await denied(request, sessions.contador, 'POST', 'LEDGER_SMOKE_CONTADOR_CREATE_NOT_DENIED');
  await denied(request, sessions.demo, 'POST', 'LEDGER_SMOKE_DEMO_CREATE_NOT_DENIED');

  const firstCreateResponse = await request({
    route: '/api/grh-action-ledger', method: 'POST',
    headers: writeHeaders(sessions.intendente), jsonBody: createBody,
  });
  requireStatus(firstCreateResponse, [200, 201], 'LEDGER_SMOKE_CREATE_FAILED');
  const firstCreate = parseJsonBody(firstCreateResponse, 'LEDGER_SMOKE_CREATE_FAILED');
  if (firstCreateResponse.contract !== LEDGER_CONTRACT || !inspectGrhActionLedgerContract(firstCreate).ok) {
    fail('LEDGER_SMOKE_CREATE_FAILED');
  }
  const created = commitmentFor(firstCreate, priorityCode);
  if (!created) fail('LEDGER_SMOKE_CREATE_FAILED');

  const replayResponse = await request({
    route: '/api/grh-action-ledger', method: 'POST',
    headers: writeHeaders(sessions.intendente), jsonBody: createBody,
  });
  const replay = requireLedger(requireStatus(replayResponse, [200], 'LEDGER_SMOKE_CREATE_REPLAY_FAILED'),
    'LEDGER_SMOKE_CREATE_REPLAY_FAILED');
  if (commitmentFor(replay, priorityCode)?.id !== created.id) fail('LEDGER_SMOKE_CREATE_REPLAY_FAILED');

  const patch = async (session, jsonBody, code) => {
    const response = await request({
      route: '/api/grh-action-ledger', method: 'PATCH',
      headers: writeHeaders(session), jsonBody,
    });
    return requireLedger(response, code);
  };
  await patch(sessions.intendente, {
    commandId: stableUuid(`${seed}:reschedule`),
    commitmentId: created.id,
    expectedVersion: 1,
    command: 'reschedule',
    reasonCode: null,
    dueOn: rescheduledDueOn,
    outcomeCode: null,
  }, 'LEDGER_SMOKE_RESCHEDULE_FAILED');
  await patch(sessions.contador, {
    commandId: stableUuid(`${seed}:claim`),
    commitmentId: created.id,
    expectedVersion: 2,
    command: 'claim',
    reasonCode: null,
    dueOn: null,
    outcomeCode: null,
  }, 'LEDGER_SMOKE_CLAIM_FAILED');
  await patch(sessions.contador, {
    commandId: stableUuid(`${seed}:complete`),
    commitmentId: created.id,
    expectedVersion: 3,
    command: 'complete',
    reasonCode: null,
    dueOn: null,
    outcomeCode: 'review_completed',
  }, 'LEDGER_SMOKE_COMPLETE_FAILED');
  await denied(request, sessions.demo, 'PATCH', 'LEDGER_SMOKE_DEMO_UPDATE_NOT_DENIED');

  const finalByRole = {};
  for (const role of ['intendente', 'contador', 'demo']) {
    const response = await request({
      route: '/api/grh-action-ledger', method: 'GET', headers: authHeaders(sessions[role]),
    });
    if (response.databaseTargetFingerprint !== verifiedTargetFingerprint) {
      fail('LEDGER_SMOKE_DATABASE_TARGET_CHANGED');
    }
    finalByRole[role] = requireLedger(response,
      `LEDGER_SMOKE_${role.toUpperCase()}_HISTORY_FAILED`);
    assertHistory(finalByRole[role], priorityCode);
  }
  return Object.freeze({
    priorityCode,
    eventCount: 4,
    replayVerified: true,
    historyVerifiedAcrossRoles: true,
  });
}

function receiptTimestamp(now) {
  const value = typeof now === 'function' ? now() : now;
  const instant = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(instant.getTime())) fail('LEDGER_SMOKE_CLOCK_INVALID');
  return instant.toISOString();
}

export async function runLedgerCandidateSmoke({
  config,
  runner = defaultCommandRunner,
  cwd = DEFAULT_REPOSITORY_ROOT,
  inspectCandidateImpl = inspectCandidateDeployment,
  requestImpl = null,
  now = () => new Date(),
} = {}) {
  if (!config || config.help) fail('LEDGER_SMOKE_CONFIGURATION_INVALID');
  const before = await inspectCandidateImpl({ runner, config, cwd });
  assertTargetAllowedForMode(before.target, config.mode);
  if (before.deploymentId !== config.deploymentId ||
      before.gitSha !== config.gitSha || before.candidateUrl !== config.candidateUrl ||
      !DEPLOYMENT_ID_PATTERN.test(before.stableAliasDeploymentId || '') ||
      before.stableAliasDeploymentId === before.deploymentId) {
    fail('LEDGER_SMOKE_CANDIDATE_PROVENANCE_INVALID');
  }
  const request = requestImpl || createVercelRequester({ runner, config, cwd });
  const uiDigest = await verifyUi(request, cwd);

  const demoProfile = expectedDemoProfile(config.credentials.demo.email);
  if (!demoProfile || !READER_ROLES.has(demoProfile.role)) fail('LEDGER_SMOKE_DEMO_IDENTITY_INVALID');
  const sessions = Object.freeze({
    intendente: await login(request, config.credentials.intendente, 'INTENDENTE',
      'LEDGER_SMOKE_INTENDENTE_LOGIN_FAILED'),
    contador: await login(request, config.credentials.contador, 'CONTADOR',
      'LEDGER_SMOKE_CONTADOR_LOGIN_FAILED'),
    demo: await login(request, config.credentials.demo, demoProfile.role,
      'LEDGER_SMOKE_DEMO_LOGIN_FAILED'),
  });
  if (sessions.intendente.user.tenantId !== sessions.contador.user.tenantId ||
      sessions.intendente.user.tenantId !== sessions.demo.user.tenantId ||
      new Set(Object.values(sessions).map(session => session.user.id)).size !== 3) {
    fail('LEDGER_SMOKE_TENANT_OR_IDENTITY_MISMATCH');
  }

  const initial = {};
  const observedTargetFingerprints = new Set();
  for (const role of ['intendente', 'contador', 'demo']) {
    const response = await request({
      route: '/api/grh-action-ledger', method: 'GET', headers: authHeaders(sessions[role]),
    });
    if (!SHA256_PATTERN.test(response.databaseTargetFingerprint || '')) {
      fail('LEDGER_SMOKE_DATABASE_TARGET_HEADER_INVALID');
    }
    observedTargetFingerprints.add(response.databaseTargetFingerprint);
    initial[role] = requireLedger(response, `LEDGER_SMOKE_${role.toUpperCase()}_READ_FAILED`);
  }
  if (observedTargetFingerprints.size !== 1) {
    fail('LEDGER_SMOKE_DATABASE_TARGET_ROLE_DRIFT');
  }
  const verifiedTargetFingerprint = [...observedTargetFingerprints][0];
  if (config.mode === 'mutate_disposable' &&
      verifiedTargetFingerprint !== config.disposableTargetFingerprint) {
    fail('LEDGER_SMOKE_DATABASE_TARGET_MISMATCH');
  }
  assertReadPermissions(initial.intendente, 'INTENDENTE',
    isPublishedDemoIdentity(config.credentials.intendente.email));
  assertReadPermissions(initial.contador, 'CONTADOR',
    isPublishedDemoIdentity(config.credentials.contador.email));
  assertReadPermissions(initial.demo, demoProfile.role, true);
  const briefDigest = sha256(canonicalJson(initial.intendente.currentBrief));
  if (sha256(canonicalJson(initial.contador.currentBrief)) !== briefDigest ||
      sha256(canonicalJson(initial.demo.currentBrief)) !== briefDigest) {
    fail('LEDGER_SMOKE_ROLE_SOURCE_DRIFT');
  }

  const mutation = config.mode === 'mutate_disposable'
    ? await mutateAndVerify({
      request,
      config,
      sessions,
      initial,
      verifiedTargetFingerprint,
    })
    : null;
  const after = await inspectCandidateImpl({ runner, config, cwd });
  if (canonicalJson(after) !== canonicalJson(before)) fail('LEDGER_SMOKE_CANDIDATE_CHANGED');

  const checks = [
    `candidate_ready_${before.target}_unique`,
    'candidate_git_pinned',
    'decisions_ui_exact',
    'intendente_get',
    'contador_get',
    'published_demo_read_only_get',
    'database_target_observed_across_roles',
    'stable_alias_unchanged_not_candidate',
    'candidate_unchanged',
  ];
  if (mutation) checks.push(
    'disposable_target_pinned',
    'contador_create_denied',
    'published_demo_create_update_denied',
    'intendente_create',
    'create_replay',
    'intendente_reschedule',
    'contador_claim_complete',
    'history_across_roles',
  );
  return Object.freeze({
    schemaVersion: SMOKE_CONTRACT,
    ok: true,
    mode: config.mode,
    checkedAt: receiptTimestamp(now),
    candidate: Object.freeze({
      origin: config.candidateUrl,
      deploymentId: config.deploymentId,
      gitSha: config.gitSha,
      target: before.target,
      stableAliasDeploymentId: before.stableAliasDeploymentId,
      disposableTargetFingerprint: mutation ? verifiedTargetFingerprint : null,
    }),
    evidence: Object.freeze({
      uiSha256: uiDigest,
      currentBriefSha256: briefDigest,
      ledgerContract: LEDGER_CONTRACT,
      databaseTargetFingerprintSha256: verifiedTargetFingerprint,
      replayVerified: mutation?.replayVerified || false,
      historyEventCount: mutation?.eventCount || 0,
      historyVerifiedAcrossRoles: mutation?.historyVerifiedAcrossRoles || false,
    }),
    checks: Object.freeze(checks.map(id => Object.freeze({ id, status: 'passed' }))),
  });
}

export function safeFailure(error) {
  return Object.freeze({
    schemaVersion: SMOKE_CONTRACT,
    ok: false,
    code: error instanceof LedgerCandidateSmokeError ? error.code : 'LEDGER_SMOKE_INTERNAL_ERROR',
  });
}

export function usage() {
  return [
    'Uso read-only:',
    '  npm run smoke:grh-ledger:candidate -- --candidate-url <https://...vercel.app> --deployment-id <dpl_...> --git-sha <40-hex>',
    '',
    'Uso mutante, solamente sobre Preview disposable:',
    '  npm run smoke:grh-ledger:candidate:mutate -- --candidate-url <https://...vercel.app> --deployment-id <dpl_...> --git-sha <40-hex>',
    '',
    'Credenciales requeridas por entorno (nunca por argumentos):',
    `  ${ENV.intendenteEmail}, ${ENV.intendentePassword}`,
    `  ${ENV.contadorEmail}, ${ENV.contadorPassword}`,
    `  ${ENV.demoEmail}, ${ENV.demoPassword}`,
    '',
    'El modo mutante exige además:',
    `  ${ENV.mutationScope}=${DISPOSABLE_MUTATION_SCOPE}`,
    `  ${ENV.disposableFingerprint}=<sha256 del target disposable autorizado>`,
  ].join('\n');
}
