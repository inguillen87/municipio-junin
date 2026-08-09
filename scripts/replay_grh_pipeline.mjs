#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';

import { inspectGrhPublicationBundle } from '../api/lib/grh-contract.js';
import immutableFileCapture from '../shared/immutable-file-capture.cjs';
import pipelineFoundation from '../shared/grh-pipeline-foundation.cjs';

const { captureImmutableRegularFile } = immutableFileCapture;

const {
  DECISION_CODES,
  EXECUTION_SCOPES,
  PIPELINE_MANIFEST_SCHEMA_VERSION,
  PUBLICATION_TARGETS,
  RECEIPT_OUTCOMES,
  RUN_EVENTS,
  RUN_STATES,
  STAGES,
  buildStageReceipt,
  decideGrhPipelineTransition,
  digestStageReceipt,
  inspectPipelineRun,
  planGrhPipelineRun,
} = pipelineFoundation;

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const PIPELINE_VERSION = 'grh-pipeline-replay-v1';
const RECEIPT_VERSION = 'grh-pipeline-receipt-v1';
const LAST_KNOWN_GOOD_VERSION = 'grh-last-known-good-v1';
const ACTIVATION_VERSION = 'grh-local-activation-v1';
const MAX_MANIFEST_BYTES = 32 * 1024;
const MAX_PROCESSOR_BYTES = 4 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 128 * 1024 * 1024;
const MAX_STATE_BYTES = 2 * 1024 * 1024;
const DEFAULT_EXTRACTOR_TIMEOUT_MS = 20 * 60 * 1000;
const PROFILE_SCHEMA_VERSION = 'grh-profile-v1';
const SEMANTIC_SCHEMA_VERSION = 'grh-semantic-v2';
const STATE_CONTAINER_NAMES = Object.freeze(['activations', 'locks', 'runs', 'versions']);
const PYTHON_PROCESSOR_SCRIPTS = Object.freeze([
  Object.freeze({ filename: 'profile_grh.py', identityKey: 'profileScriptSha256' }),
  Object.freeze({ filename: 'build_grh_semantic.py', identityKey: 'buildSemanticScriptSha256' }),
  Object.freeze({ filename: 'grh_source_manifest.py', identityKey: 'sourceManifestScriptSha256' }),
]);
const PROCESSOR_IDENTITY_KEYS = Object.freeze([
  'buildSemanticScriptSha256',
  'nodeRuntimeSha256',
  'nodeRuntimePinSha256',
  'pipelineFoundationSha256',
  'profileScriptSha256',
  'publicationAdapterSha256',
  'publicationContractSha256',
  'pythonRuntimeSha256',
  'pythonRuntimePinSha256',
  'replayRunnerSha256',
  'sourceManifestScriptSha256',
]);
const MANIFEST_KEYS = Object.freeze([
  'approval_basis',
  'canonical_system',
  'compressed_size_bytes',
  'excluded_sources',
  'schema_version',
  'sha256',
  'snapshot_as_of',
  'source_file',
]);

const SAFE_MESSAGES = Object.freeze({
  GRH_PIPELINE_ARGUMENT_INVALID: 'La configuracion del replay GRH es invalida.',
  GRH_PIPELINE_ARTIFACT_INVALID: 'Los artefactos GRH no superaron el contrato de publicacion.',
  GRH_PIPELINE_CLEANUP_FAILED: 'El workspace temporal GRH no pudo eliminarse de forma segura.',
  GRH_PIPELINE_DUPLICATE_STATE_INVALID: 'El estado de una fuente GRH ya procesada es invalido.',
  GRH_PIPELINE_EXTRACTOR_FAILED: 'Un extractor GRH termino sin producir un resultado valido.',
  GRH_PIPELINE_EXTERNAL_STATE_REQUIRED: 'El estado operativo GRH debe ubicarse fuera del repositorio.',
  GRH_PIPELINE_LOCKED: 'Ya existe una ejecucion GRH para la misma fuente y snapshot.',
  GRH_PIPELINE_MANIFEST_INVALID: 'El manifiesto GRH no supera el contrato canonico.',
  GRH_PIPELINE_PROMOTION_FAILED: 'El bundle GRH validado no pudo promoverse.',
  GRH_PIPELINE_PROCESSOR_CHANGED: 'La identidad gobernada del procesador cambio durante el replay.',
  GRH_PIPELINE_RECEIPT_FAILED: 'No se pudo persistir la evidencia operativa GRH.',
  GRH_PIPELINE_ROLLBACK_BLOCKED: 'El snapshot GRH solicitado es anterior al ultimo estado local valido.',
  GRH_PIPELINE_RUNTIME_MISMATCH: 'El runtime efectivo no coincide con la version gobernada del pipeline.',
  GRH_PIPELINE_SOURCE_CHANGED: 'La fuente GRH cambio durante el procesamiento.',
  GRH_PIPELINE_SOURCE_CONFLICT: 'El snapshot GRH ya registrado tiene una identidad de fuente diferente.',
  GRH_PIPELINE_SOURCE_INVALID: 'La fuente GRH no coincide con el manifiesto aprobado.',
  GRH_PIPELINE_STATE_INVALID: 'El estado operativo GRH es invalido.',
  GRH_PIPELINE_TEMP_ROOT_INVALID: 'El workspace temporal GRH debe ubicarse fuera del repositorio.',
});

const SAFE_CLI_HINTS = Object.freeze({
  GRH_PIPELINE_EXTERNAL_STATE_REQUIRED:
    'Use %LOCALAPPDATA%\\MuniControl\\grh-pipeline fuera del repositorio y de carpetas sincronizadas.',
  GRH_PIPELINE_TEMP_ROOT_INVALID:
    'Use el directorio temporal del sistema fuera del repositorio y de carpetas sincronizadas.',
});

export const GRH_PIPELINE_REPLAY_USAGE = `Uso:
  node scripts/replay_grh_pipeline.mjs --source <backup.sql.gz> --manifest <manifest.json> --state-dir <directorio-local> [opciones]

Opciones:
  --temp-root <directorio>  Workspace efimero local; por defecto usa el temporal del sistema.
  --python <ejecutable>     Python gobernado por .python-version.
  --help, -h                Muestra esta ayuda sin ejecutar el pipeline.

El state-dir debe ser un subdirectorio estricto de TEMP o LOCALAPPDATA, fuera de OneDrive,
del repositorio y de namespaces UNC/device. Este replay publica solo LOCAL_STATE; no usa red ni DB.
`;

export class GrhPipelineReplayError extends Error {
  constructor(code, stage, cause = undefined) {
    super(SAFE_MESSAGES[code] || 'El replay GRH fallo de forma segura.');
    this.name = 'GrhPipelineReplayError';
    this.code = code;
    this.stage = stage;
    this.systemCode = typeof cause?.code === 'string' && /^[A-Z0-9_]{2,32}$/.test(cause.code)
      ? cause.code
      : null;
  }
}

function pipelineError(code, stage, cause) {
  if (cause instanceof GrhPipelineReplayError) return cause;
  return new GrhPipelineReplayError(code, stage, cause);
}

function asIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.valueOf())) {
    throw pipelineError('GRH_PIPELINE_STATE_INVALID', 'initialization');
  }
  return date.toISOString();
}

function elapsedMilliseconds(startedAt, completedAt) {
  return Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function configuredSynchronizedRoots(environment = process.env) {
  return [...new Set(
    ['OneDrive', 'OneDriveCommercial', 'OneDriveConsumer']
      .map(name => environment?.[name])
      .filter(value => typeof value === 'string' && value.trim().length > 0)
      .map(value => path.resolve(value)),
  )];
}

function configuredApprovedLocalRoots(environment = process.env, configured = null) {
  const candidates = configured || [
    environment?.LOCALAPPDATA,
    environment?.TEMP,
    environment?.TMP,
    environment?.TMPDIR,
    os.tmpdir(),
  ];
  const values = configured === null
    ? candidates.filter(value => typeof value === 'string' && value.trim().length > 0)
    : candidates;
  if (!Array.isArray(values) || values.length === 0 ||
      !values.every(value => typeof value === 'string' && value.trim().length > 0)) {
    throw pipelineError('GRH_PIPELINE_EXTERNAL_STATE_REQUIRED', 'initialization');
  }
  return [...new Set(values.map(value => path.resolve(value)))];
}

function isSameOrWithin(parent, candidate) {
  return path.relative(parent, candidate) === '' || isWithin(parent, candidate);
}

function assertLocalStatePath(directory, environment = process.env) {
  const resolved = path.resolve(directory);
  const parsedRoot = path.parse(resolved).root;
  const looksLikeWindowsNetworkOrDevice = /^(?:\\\\[?.]\\|\\\\[^\\])/u.test(resolved);
  const broadLocalRoots = [
    environment?.USERPROFILE,
    environment?.LOCALAPPDATA,
    environment?.APPDATA,
    os.homedir(),
  ].filter(value => typeof value === 'string' && value.trim().length > 0)
    .map(value => path.resolve(value));
  if (looksLikeWindowsNetworkOrDevice || parsedRoot.startsWith('\\\\') ||
      path.relative(parsedRoot, resolved) === '' ||
      broadLocalRoots.some(root => path.relative(root, resolved) === '')) {
    throw pipelineError('GRH_PIPELINE_EXTERNAL_STATE_REQUIRED', 'initialization');
  }
}

function assertLocalTempPath(directory) {
  const resolved = path.resolve(directory);
  const parsedRoot = path.parse(resolved).root;
  if (/^(?:\\\\[?.]\\|\\\\[^\\])/u.test(resolved) || parsedRoot.startsWith('\\\\') ||
      path.relative(parsedRoot, resolved) === '') {
    throw pipelineError('GRH_PIPELINE_TEMP_ROOT_INVALID', 'initialization');
  }
}

async function assertExternalDirectory(
  directory,
  repositoryRoot,
  code,
  fileSystem = fs,
  forbiddenRoots = [],
  allowedRoots = [],
  allowAllowedRoot = false,
) {
  const lexicalDirectory = path.resolve(directory);
  const lexicalRepository = path.resolve(repositoryRoot);
  const lexicalForbiddenRoots = forbiddenRoots.map(root => path.resolve(root));
  const lexicalAllowedRoots = allowedRoots.map(root => path.resolve(root));
  if (isSameOrWithin(lexicalRepository, lexicalDirectory) ||
      lexicalForbiddenRoots.some(root => isSameOrWithin(root, lexicalDirectory))) {
    throw pipelineError(code, 'initialization');
  }
  const lexicallyAllowed = root => allowAllowedRoot
    ? isSameOrWithin(root, lexicalDirectory)
    : isWithin(root, lexicalDirectory);
  if (lexicalAllowedRoots.length > 0 && !lexicalAllowedRoots.some(lexicallyAllowed)) {
    throw pipelineError(code, 'initialization');
  }

  const realRepository = await fileSystem.realpath(lexicalRepository);
  const prospectiveDirectory = await prospectiveRealPath(lexicalDirectory, fileSystem);
  const prospectiveForbiddenRoots = await Promise.all(
    lexicalForbiddenRoots.map(root => prospectiveRealPath(root, fileSystem).catch(error => {
      if (error?.code === 'ENOENT') return root;
      throw error;
    })),
  );
  const prospectiveAllowedRoots = await Promise.all(
    lexicalAllowedRoots.map(root => prospectiveRealPath(root, fileSystem).catch(error => {
      if (error?.code === 'ENOENT') return root;
      throw error;
    })),
  );
  if (isSameOrWithin(realRepository, prospectiveDirectory) ||
      prospectiveForbiddenRoots.some(root => isSameOrWithin(root, prospectiveDirectory))) {
    throw pipelineError(code, 'initialization');
  }
  const prospectivelyAllowed = root => allowAllowedRoot
    ? isSameOrWithin(root, prospectiveDirectory)
    : isWithin(root, prospectiveDirectory);
  if (prospectiveAllowedRoots.length > 0 && !prospectiveAllowedRoots.some(prospectivelyAllowed)) {
    throw pipelineError(code, 'initialization');
  }

  await fileSystem.mkdir(directory, { recursive: true, mode: 0o700 });
  const realDirectory = await fileSystem.realpath(directory);
  if (isSameOrWithin(realRepository, realDirectory) ||
      prospectiveForbiddenRoots.some(root => isSameOrWithin(root, realDirectory))) {
    throw pipelineError(code, 'initialization');
  }
  const reallyAllowed = root => allowAllowedRoot
    ? isSameOrWithin(root, realDirectory)
    : isWithin(root, realDirectory);
  if (prospectiveAllowedRoots.length > 0 && !prospectiveAllowedRoots.some(reallyAllowed)) {
    throw pipelineError(code, 'initialization');
  }
  return realDirectory;
}

async function prospectiveRealPath(candidate, fileSystem = fs) {
  let cursor = path.resolve(candidate);
  const missingSegments = [];
  while (true) {
    try {
      await fileSystem.lstat(cursor);
      const realAncestor = await fileSystem.realpath(cursor);
      return path.resolve(realAncestor, ...missingSegments);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      missingSegments.unshift(path.basename(cursor));
      cursor = parent;
    }
  }
}

async function inspectStateContainer(stateDirectory, containerName, fileSystem = fs) {
  const candidate = path.join(stateDirectory, containerName);
  let metadata;
  try {
    metadata = await fileSystem.lstat(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw pipelineError('GRH_PIPELINE_STATE_INVALID', 'state-containers', error);
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw pipelineError('GRH_PIPELINE_STATE_INVALID', 'state-containers');
  }
  let realContainer;
  try {
    realContainer = await fileSystem.realpath(candidate);
  } catch (error) {
    throw pipelineError('GRH_PIPELINE_STATE_INVALID', 'state-containers', error);
  }
  if (!isWithin(stateDirectory, realContainer) || path.relative(candidate, realContainer) !== '') {
    throw pipelineError('GRH_PIPELINE_STATE_INVALID', 'state-containers');
  }
  return Object.freeze({
    dev: metadata.dev,
    ino: metadata.ino,
    path: realContainer,
  });
}

async function initializeStateContainers(stateDirectory, fileSystem = fs) {
  const existing = new Map();
  for (const containerName of STATE_CONTAINER_NAMES) {
    existing.set(
      containerName,
      await inspectStateContainer(stateDirectory, containerName, fileSystem),
    );
  }
  for (const containerName of STATE_CONTAINER_NAMES) {
    if (existing.get(containerName)) continue;
    try {
      await fileSystem.mkdir(path.join(stateDirectory, containerName), { mode: 0o700 });
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw pipelineError('GRH_PIPELINE_STATE_INVALID', 'state-containers', error);
      }
    }
  }
  const containers = {};
  const ownership = {};
  for (const containerName of STATE_CONTAINER_NAMES) {
    const observed = await inspectStateContainer(stateDirectory, containerName, fileSystem);
    if (!observed) {
      throw pipelineError('GRH_PIPELINE_STATE_INVALID', 'state-containers');
    }
    containers[containerName] = observed.path;
    ownership[containerName] = observed;
  }
  Object.defineProperty(containers, 'ownership', {
    enumerable: false,
    value: Object.freeze(ownership),
  });
  return Object.freeze(containers);
}

async function assertStateContainerOwnership(stateDirectory, stateContainers, containerName, fileSystem = fs) {
  const expected = stateContainers?.ownership?.[containerName];
  const observed = await inspectStateContainer(stateDirectory, containerName, fileSystem);
  if (!expected || !observed || expected.path !== observed.path || !sameFileIdentity(expected, observed)) {
    throw pipelineError('GRH_PIPELINE_STATE_INVALID', 'state-containers');
  }
  return observed.path;
}

async function assertRegularFile(file, maxBytes, code, stage, fileSystem = fs) {
  let metadata;
  try {
    metadata = await fileSystem.lstat(file);
  } catch (error) {
    throw pipelineError(code, stage, error);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1 || metadata.size > maxBytes) {
    throw pipelineError(code, stage);
  }
  return metadata;
}

async function readJson(file, maxBytes, code, stage, fileSystem = fs) {
  await assertRegularFile(file, maxBytes, code, stage, fileSystem);
  try {
    return JSON.parse(await fileSystem.readFile(file, 'utf8'));
  } catch (error) {
    throw pipelineError(code, stage, error);
  }
}

async function readJsonBytes(file, maxBytes, code, stage, fileSystem = fs) {
  await assertRegularFile(file, maxBytes, code, stage, fileSystem);
  try {
    const bytes = await fileSystem.readFile(file);
    return { bytes, value: JSON.parse(bytes.toString('utf8')) };
  } catch (error) {
    throw pipelineError(code, stage, error);
  }
}

async function capturePipelineFile(file, maxBytes, code, stage, fileSystem = fs) {
  try {
    return await captureImmutableRegularFile(file, { fileSystem, maxBytes, minBytes: 1 });
  } catch (error) {
    throw pipelineError(code, stage, error);
  }
}

async function parseCapturedJson(capture, maxBytes, code, stage) {
  try {
    const bytes = await capture.readBytes(maxBytes);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { bytes, value: JSON.parse(text) };
  } catch (error) {
    throw pipelineError(code, stage, error);
  }
}

async function revalidatePipelineCapture(capture, code, stage) {
  try {
    await capture.revalidate();
  } catch (error) {
    throw pipelineError(code, stage, error);
  }
}

async function materializePipelineCapture(capture, target, code, stage) {
  try {
    return await capture.materialize(target);
  } catch (error) {
    throw pipelineError(code, stage, error);
  }
}

async function closePipelineCaptures(captures, stage) {
  let firstFailure = null;
  while (captures.length > 0) {
    const capture = captures.pop();
    try {
      await capture.close();
    } catch (error) {
      firstFailure ||= error;
    }
  }
  if (firstFailure) throw pipelineError('GRH_PIPELINE_CLEANUP_FAILED', stage, firstFailure);
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, sorted(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(sorted(value));
}

function sha256Text(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function sha256File(file) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on('data', chunk => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', resolve);
  });
  return hash.digest('hex');
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function inspectManifest(manifest) {
  const parsedSnapshot = typeof manifest?.snapshot_as_of === 'string' &&
    /^20\d{2}-\d{2}-\d{2}$/.test(manifest.snapshot_as_of)
    ? new Date(`${manifest.snapshot_as_of}T00:00:00.000Z`)
    : null;
  const validSnapshot = parsedSnapshot !== null && Number.isFinite(parsedSnapshot.valueOf()) &&
    parsedSnapshot.toISOString().slice(0, 10) === manifest.snapshot_as_of;
  const filenameDate = typeof manifest?.source_file === 'string'
    ? manifest.source_file.match(/(?<!\d)(20\d{6})\d*(?!\d)/)?.[1]
    : null;
  const expectedFilenameDate = validSnapshot ? manifest.snapshot_as_of.replaceAll('-', '') : null;

  return exactKeys(manifest, MANIFEST_KEYS) &&
    manifest.schema_version === 'grh-source-manifest-v1' &&
    manifest.canonical_system === 'GRH Junín' &&
    /^grh_junin\.[a-z0-9._-]+\.sql\.gz$/i.test(manifest.source_file || '') &&
    /^[0-9a-f]{64}$/.test(manifest.sha256 || '') &&
    Number.isSafeInteger(manifest.compressed_size_bytes) && manifest.compressed_size_bytes > 0 &&
    validSnapshot && filenameDate === expectedFilenameDate &&
    Array.isArray(manifest.excluded_sources) &&
    manifest.excluded_sources.length === 1 && manifest.excluded_sources[0] === 'personas_junin' &&
    typeof manifest.approval_basis === 'string' && manifest.approval_basis.trim().length > 0;
}

function verifyCanonicalSourceCapture(sourcePath, capture, manifest, stage) {
  const changedCode = stage === 'source-revalidation'
    ? 'GRH_PIPELINE_SOURCE_CHANGED'
    : 'GRH_PIPELINE_SOURCE_INVALID';
  if (path.basename(sourcePath) !== manifest.source_file || capture.size !== manifest.compressed_size_bytes) {
    throw pipelineError(changedCode, stage);
  }
  if (capture.sha256 !== manifest.sha256) {
    throw pipelineError(
      changedCode,
      stage,
    );
  }
  return Object.freeze({
    canonicalSystem: manifest.canonical_system,
    compressedSizeBytes: manifest.compressed_size_bytes,
    excludedSources: [...manifest.excluded_sources],
    sha256: manifest.sha256,
    snapshotAsOf: manifest.snapshot_as_of,
    sourceFile: manifest.source_file,
  });
}

function buildSourceIdentity(manifest) {
  const deterministic = {
    canonicalSystem: manifest.canonical_system,
    compressedSizeBytes: manifest.compressed_size_bytes,
    excludedSources: [...manifest.excluded_sources],
    sha256: manifest.sha256,
    snapshotAsOf: manifest.snapshot_as_of,
    sourceFile: manifest.source_file,
  };
  return Object.freeze({
    ...deterministic,
    identitySha256: sha256Text(canonicalJson(deterministic)),
  });
}

function validCanonicalUtcTimestamp(value) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function validArtifactGenerationTimes(profile, semantic, expected = null) {
  const profileTimestamp = profile?.generated_at;
  const semanticTimestamp = semantic?.source?.generated_at;
  return validCanonicalUtcTimestamp(profileTimestamp) &&
    validCanonicalUtcTimestamp(semanticTimestamp) &&
    (expected === null || (profileTimestamp === expected && semanticTimestamp === expected));
}

function withoutVolatileGenerationTime(artifact, kind) {
  const normalized = structuredClone(artifact);
  if (kind === 'profile') delete normalized.generated_at;
  if (kind === 'semantic' && normalized.source && typeof normalized.source === 'object') {
    delete normalized.source.generated_at;
  }
  return normalized;
}

function deriveArtifactIdentity(profile, semantic) {
  return Object.freeze({
    profile: Object.freeze({
      contentSha256: sha256Text(canonicalJson(withoutVolatileGenerationTime(profile, 'profile'))),
      schemaVersion: profile?.schema_version,
    }),
    semantic: Object.freeze({
      contentSha256: sha256Text(canonicalJson(withoutVolatileGenerationTime(semantic, 'semantic'))),
      schemaVersion: semantic?.schema_version,
    }),
  });
}

function safeSubprocessEnvironment(environment = process.env) {
  const allowed = [
    'LANG', 'LC_ALL', 'PATH', 'Path', 'PATHEXT', 'SYSTEMROOT', 'SystemRoot',
    'TEMP', 'TMP', 'TMPDIR', 'WINDIR',
  ];
  const selected = Object.fromEntries(
    allowed.filter(name => typeof environment[name] === 'string').map(name => [name, environment[name]]),
  );
  selected.PYTHONDONTWRITEBYTECODE = '1';
  selected.PYTHONUTF8 = '1';
  return selected;
}

export function runBoundedProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_EXTRACTOR_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 24 * 60 * 60 * 1000) {
      reject(new Error('invalid extractor timeout'));
      return;
    }
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    });
    let settled = false;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    timeout.unref?.();

    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    child.once('error', error => finish(error));
    child.once('exit', (code, signal) => {
      if (timedOut) finish(new Error('extractor timeout'));
      else if (code === 0 && signal === null) finish();
      else finish(new Error('extractor exited unsuccessfully'));
    });
  });
}

function readBoundedRuntimeVersion(command, options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const child = spawn(command, ['--version'], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let settled = false;
    let output = '';
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(value);
    };
    const collect = chunk => {
      output += chunk.toString('utf8');
      if (output.length > 256) {
        child.kill('SIGKILL');
        finish(new Error('runtime version output invalid'));
      }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', error => finish(error));
    child.once('exit', (code, signal) => {
      if (code !== 0 || signal !== null) finish(new Error('runtime version command failed'));
      else finish(null, output.trim());
    });
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('runtime version timeout'));
    }, timeoutMs);
    timeout.unref?.();
  });
}

export async function runPythonArtifactBuilders({
  generatedAt,
  manifestPath,
  outputDirectory,
  pythonExecutable,
  repositoryRoot,
  processorRoot = repositoryRoot,
  runProcessImpl = runBoundedProcess,
  sourcePath,
  subprocessEnvironment = safeSubprocessEnvironment(process.env),
  timeoutMs = DEFAULT_EXTRACTOR_TIMEOUT_MS,
}) {
  const profileOutput = path.join(outputDirectory, 'grh-profile.json');
  const semanticOutput = path.join(outputDirectory, 'grh-semantic.json');
  const common = { cwd: processorRoot, env: subprocessEnvironment, timeoutMs };

  try {
    await runProcessImpl(pythonExecutable, [
      path.join(processorRoot, 'scripts', 'profile_grh.py'),
      sourcePath,
      '--manifest', manifestPath,
      '--out', profileOutput,
      '--generated-at', generatedAt,
    ], common);
    await runProcessImpl(pythonExecutable, [
      path.join(processorRoot, 'scripts', 'build_grh_semantic.py'),
      sourcePath,
      '--manifest', manifestPath,
      '--out', semanticOutput,
      '--generated-at', generatedAt,
    ], common);
  } catch (error) {
    throw pipelineError('GRH_PIPELINE_EXTRACTOR_FAILED', 'artifact-build', error);
  }

  return { profileOutput, semanticOutput };
}

async function atomicWriteJson(target, payload, runId, fileSystem = fs) {
  const temporary = `${target}.${runId}.tmp`;
  const backup = `${target}.${runId}.bak`;
  await fileSystem.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  try {
    await fileSystem.writeFile(temporary, `${canonicalJson(payload)}\n`, {
      encoding: 'utf8', flag: 'wx', mode: 0o600,
    });
    try {
      await fileSystem.rename(temporary, target);
      return;
    } catch (directError) {
      let targetExists = true;
      try {
        await fileSystem.lstat(target);
      } catch (error) {
        if (error?.code === 'ENOENT') targetExists = false;
        else throw error;
      }
      if (!targetExists) throw directError;

      await fileSystem.rename(target, backup);
      try {
        await fileSystem.rename(temporary, target);
      } catch (replacementError) {
        await fileSystem.rename(backup, target);
        throw replacementError;
      }
      try {
        await fileSystem.unlink(backup);
      } catch (cleanupError) {
        await fileSystem.unlink(target);
        await fileSystem.rename(backup, target);
        throw cleanupError;
      }
    }
  } catch (error) {
    await fileSystem.unlink(temporary).catch(() => {});
    throw error;
  }
}

function sameFileIdentity(expected, observed) {
  return expected && observed && expected.dev === observed.dev && expected.ino === observed.ino;
}

async function unlinkOwnedLock(lockFile, ownership, expectedBytes, fileSystem, stage) {
  let observed;
  try {
    observed = await fileSystem.lstat(lockFile);
  } catch (error) {
    throw pipelineError('GRH_PIPELINE_STATE_INVALID', stage, error);
  }
  if (!observed.isFile() || observed.isSymbolicLink() || !sameFileIdentity(ownership, observed)) {
    throw pipelineError('GRH_PIPELINE_STATE_INVALID', stage);
  }
  if (expectedBytes !== null) {
    let currentBytes;
    try {
      currentBytes = await fileSystem.readFile(lockFile);
    } catch (error) {
      throw pipelineError('GRH_PIPELINE_STATE_INVALID', stage, error);
    }
    if (!Buffer.isBuffer(currentBytes) || !currentBytes.equals(expectedBytes)) {
      throw pipelineError('GRH_PIPELINE_STATE_INVALID', stage);
    }
  }
  try {
    await fileSystem.unlink(lockFile);
  } catch (error) {
    throw pipelineError('GRH_PIPELINE_STATE_INVALID', stage, error);
  }
}

async function acquireLock(lockFile, runId, sourceIdentity, fileSystem = fs) {
  let handle;
  let ownership = null;
  let created = false;
  let closed = false;
  const lockBytes = Buffer.from(`${canonicalJson({
    contractVersion: 'grh-pipeline-lock-v1',
    runId,
    sourceIdentitySha256: sourceIdentity.identitySha256,
  })}\n`, 'utf8');
  try {
    handle = await fileSystem.open(lockFile, 'wx', 0o600);
    created = true;
    ownership = await handle.stat();
    await handle.writeFile(lockBytes);
    return async () => {
      if (closed) return;
      try {
        await handle.close();
        closed = true;
      } catch (error) {
        throw pipelineError('GRH_PIPELINE_STATE_INVALID', 'lock-release', error);
      }
      try {
        await unlinkOwnedLock(lockFile, ownership, lockBytes, fileSystem, 'lock-release');
      } catch (error) {
        throw pipelineError('GRH_PIPELINE_STATE_INVALID', 'lock-release', error);
      }
    };
  } catch (error) {
    if (!created && error?.code === 'EEXIST') {
      throw pipelineError('GRH_PIPELINE_LOCKED', 'lock');
    }
    let cleanupFailure = null;
    if (handle && !closed) {
      try {
        await handle.close();
        closed = true;
      } catch (closeError) {
        cleanupFailure = closeError;
      }
    }
    if (created && closed && ownership) {
      try {
        await unlinkOwnedLock(lockFile, ownership, null, fileSystem, 'lock-cleanup');
      } catch (unlinkError) {
        cleanupFailure ||= unlinkError;
      }
    } else if (created && !ownership) {
      cleanupFailure ||= error;
    }
    throw pipelineError('GRH_PIPELINE_STATE_INVALID', cleanupFailure ? 'lock-cleanup' : 'lock', cleanupFailure || error);
  }
}

async function captureOwnedDirectory(target, safeParent, code, stage, fileSystem = fs) {
  let targetMetadata;
  let parentMetadata;
  let realTarget;
  let realParent;
  try {
    [targetMetadata, parentMetadata, realTarget, realParent] = await Promise.all([
      fileSystem.lstat(target),
      fileSystem.lstat(safeParent),
      fileSystem.realpath(target),
      fileSystem.realpath(safeParent),
    ]);
  } catch (error) {
    throw pipelineError(code, stage, error);
  }
  if (!targetMetadata.isDirectory() || targetMetadata.isSymbolicLink() ||
      !parentMetadata.isDirectory() || parentMetadata.isSymbolicLink() ||
      path.relative(path.resolve(target), realTarget) !== '' ||
      path.relative(path.resolve(safeParent), realParent) !== '' ||
      path.relative(realParent, path.dirname(realTarget)) !== '') {
    throw pipelineError(code, stage);
  }
  return Object.freeze({
    dev: targetMetadata.dev,
    ino: targetMetadata.ino,
    parentDev: parentMetadata.dev,
    parentIno: parentMetadata.ino,
    parentPath: realParent,
    path: realTarget,
  });
}

async function assertOwnedDirectory(ownership, code, stage, fileSystem = fs) {
  if (!ownership) throw pipelineError(code, stage);
  let targetMetadata;
  let parentMetadata;
  let realTarget;
  let realParent;
  try {
    [targetMetadata, parentMetadata, realTarget, realParent] = await Promise.all([
      fileSystem.lstat(ownership.path),
      fileSystem.lstat(ownership.parentPath),
      fileSystem.realpath(ownership.path),
      fileSystem.realpath(ownership.parentPath),
    ]);
  } catch (error) {
    throw pipelineError(code, stage, error);
  }
  if (!targetMetadata.isDirectory() || targetMetadata.isSymbolicLink() ||
      !parentMetadata.isDirectory() || parentMetadata.isSymbolicLink() ||
      !sameFileIdentity(ownership, targetMetadata) ||
      ownership.parentDev !== parentMetadata.dev || ownership.parentIno !== parentMetadata.ino ||
      realTarget !== ownership.path || realParent !== ownership.parentPath ||
      path.relative(realParent, path.dirname(realTarget)) !== '') {
    throw pipelineError(code, stage);
  }
  return realTarget;
}

async function removeOwnedDirectory(ownership, code, stage, fileSystem = fs) {
  const target = await assertOwnedDirectory(ownership, code, stage, fileSystem);
  try {
    await fileSystem.rm(target, { recursive: true, force: false });
  } catch (error) {
    throw pipelineError(code, stage, error);
  }
}

function validSha256(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function inspectProcessorIdentity(processors) {
  return exactKeys(processors, PROCESSOR_IDENTITY_KEYS) &&
    PROCESSOR_IDENTITY_KEYS.every(key => validSha256(processors[key]));
}

async function capturePythonProcessorBundle(repositoryRoot, dependencies, trackedCaptures) {
  const entries = [];
  for (const script of PYTHON_PROCESSOR_SCRIPTS) {
    const capture = await capturePipelineFile(
      path.join(repositoryRoot, 'scripts', script.filename),
      MAX_PROCESSOR_BYTES,
      'GRH_PIPELINE_STATE_INVALID',
      'processor-identity',
      dependencies.fileSystem,
    );
    trackedCaptures.push(capture);
    entries.push(Object.freeze({ ...script, capture }));
  }
  return Object.freeze(entries);
}

function processorCaptureDigests(processorBundle) {
  return Object.fromEntries(processorBundle.map(entry => [entry.identityKey, entry.capture.sha256]));
}

async function revalidateProcessorCaptures(processorBundle) {
  for (const entry of processorBundle) {
    await revalidatePipelineCapture(
      entry.capture,
      'GRH_PIPELINE_PROCESSOR_CHANGED',
      'processor-revalidation',
    );
  }
}

async function stagePythonProcessorBundle(
  processorBundle,
  workspace,
  dependencies,
  trackedCaptures,
) {
  const processorRoot = path.join(workspace, 'processor-bundle');
  const scriptsDirectory = path.join(processorRoot, 'scripts');
  try {
    await dependencies.fileSystem.mkdir(scriptsDirectory, { recursive: true, mode: 0o700 });
    const [workspaceReal, processorRootReal, scriptsReal, processorRootMetadata, scriptsMetadata] = await Promise.all([
      dependencies.fileSystem.realpath(workspace),
      dependencies.fileSystem.realpath(processorRoot),
      dependencies.fileSystem.realpath(scriptsDirectory),
      dependencies.fileSystem.lstat(processorRoot),
      dependencies.fileSystem.lstat(scriptsDirectory),
    ]);
    if (!processorRootMetadata.isDirectory() || processorRootMetadata.isSymbolicLink() ||
        !scriptsMetadata.isDirectory() || scriptsMetadata.isSymbolicLink() ||
        !isWithin(workspaceReal, processorRootReal) || !isWithin(processorRootReal, scriptsReal)) {
      throw pipelineError('GRH_PIPELINE_TEMP_ROOT_INVALID', 'workspace');
    }
    const stagedEntries = [];
    for (const entry of processorBundle) {
      const stagedCapture = await materializePipelineCapture(
        entry.capture,
        path.join(scriptsReal, entry.filename),
        'GRH_PIPELINE_PROCESSOR_CHANGED',
        'processor-revalidation',
      );
      trackedCaptures.push(stagedCapture);
      stagedEntries.push(Object.freeze({ ...entry, capture: stagedCapture }));
    }
    return Object.freeze({ entries: Object.freeze(stagedEntries), processorRoot: processorRootReal });
  } catch (error) {
    if (error instanceof GrhPipelineReplayError) throw error;
    throw pipelineError('GRH_PIPELINE_TEMP_ROOT_INVALID', 'workspace', error);
  }
}

async function resolveProcessorIdentity(repositoryRoot, pythonExecutable, dependencies, processorBundle = null) {
  const configured = dependencies.processorIdentityProvider
    ? await dependencies.processorIdentityProvider({ pythonExecutable, repositoryRoot })
    : dependencies.processorIdentity;
  let nodeRuntimeVersion;
  let pythonRuntimeVersion;
  if (!configured) {
    const [nodePin, pythonPin, pythonVersionOutput] = await Promise.all([
      dependencies.fileSystem.readFile(path.join(repositoryRoot, '.nvmrc'), 'utf8'),
      dependencies.fileSystem.readFile(path.join(repositoryRoot, '.python-version'), 'utf8'),
      dependencies.runtimeVersionReader(pythonExecutable, {
        cwd: repositoryRoot,
        env: safeSubprocessEnvironment(dependencies.environment),
        timeoutMs: 10_000,
      }),
    ]).catch(error => {
      throw pipelineError('GRH_PIPELINE_RUNTIME_MISMATCH', 'processor-identity', error);
    });
    nodeRuntimeVersion = process.versions.node;
    pythonRuntimeVersion = /^Python\s+(\d+\.\d+\.\d+)$/.exec(pythonVersionOutput)?.[1] || null;
    if (nodePin.trim() !== nodeRuntimeVersion || pythonPin.trim() !== pythonRuntimeVersion) {
      throw pipelineError('GRH_PIPELINE_RUNTIME_MISMATCH', 'processor-identity');
    }
  }
  const capturedDigests = processorBundle ? processorCaptureDigests(processorBundle) : null;
  const processors = configured || {
    buildSemanticScriptSha256: capturedDigests?.buildSemanticScriptSha256 || await dependencies.hashFile(
      path.join(repositoryRoot, 'scripts', 'build_grh_semantic.py'),
    ),
    nodeRuntimeSha256: sha256Text(`node:${nodeRuntimeVersion}`),
    nodeRuntimePinSha256: await dependencies.hashFile(path.join(repositoryRoot, '.nvmrc')),
    pipelineFoundationSha256: await dependencies.hashFile(
      path.join(repositoryRoot, 'shared', 'grh-pipeline-foundation.cjs'),
    ),
    profileScriptSha256: capturedDigests?.profileScriptSha256 || await dependencies.hashFile(
      path.join(repositoryRoot, 'scripts', 'profile_grh.py'),
    ),
    publicationContractSha256: await dependencies.hashFile(
      path.join(repositoryRoot, 'api', 'lib', 'grh-contract.js'),
    ),
    publicationAdapterSha256: await dependencies.hashFile(
      path.join(repositoryRoot, 'api', 'lib', 'grh-publication.js'),
    ),
    pythonRuntimeSha256: sha256Text(`python:${pythonRuntimeVersion}`),
    pythonRuntimePinSha256: await dependencies.hashFile(path.join(repositoryRoot, '.python-version')),
    replayRunnerSha256: await dependencies.hashFile(SCRIPT_PATH),
    sourceManifestScriptSha256: capturedDigests?.sourceManifestScriptSha256 || await dependencies.hashFile(
      path.join(repositoryRoot, 'scripts', 'grh_source_manifest.py'),
    ),
  };
  if (!inspectProcessorIdentity(processors)) {
    throw pipelineError('GRH_PIPELINE_STATE_INVALID', 'processor-identity');
  }
  return Object.freeze({ ...processors });
}

async function verifyProcessorIdentity(expected, repositoryRoot, pythonExecutable, dependencies, processorBundle = null) {
  if (processorBundle) await revalidateProcessorCaptures(processorBundle);
  const observed = await resolveProcessorIdentity(
    repositoryRoot,
    pythonExecutable,
    dependencies,
    processorBundle,
  );
  if (canonicalJson(observed) !== canonicalJson(expected)) {
    throw pipelineError('GRH_PIPELINE_PROCESSOR_CHANGED', 'processor-revalidation');
  }
  return observed;
}

function buildPipelineManifest({ manifest, manifestSha256, processorBundleDigest, runId }) {
  return Object.freeze({
    schemaVersion: PIPELINE_MANIFEST_SCHEMA_VERSION,
    runId,
    executionScope: EXECUTION_SCOPES.LOCAL_REPLAY,
    publicationTarget: PUBLICATION_TARGETS.LOCAL_STATE,
    tenantId: null,
    sourceId: 'grh-junin',
    sourceSystem: 'GRH',
    snapshotAsOf: manifest.snapshot_as_of,
    sourceSha256: manifest.sha256,
    sourceManifestDigest: manifestSha256,
    sourceSizeBytes: manifest.compressed_size_bytes,
    extractorVersion: `${PIPELINE_VERSION}.${processorBundleDigest.slice(0, 16)}`,
    profileSchemaVersion: PROFILE_SCHEMA_VERSION,
    semanticSchemaVersion: SEMANTIC_SCHEMA_VERSION,
    processorBundleDigest,
  });
}

function requireTransition(decision, stage) {
  if (!decision?.allowed || !decision.nextRun || !inspectPipelineRun(decision.nextRun)?.ok) {
    throw pipelineError('GRH_PIPELINE_STATE_INVALID', stage, { code: decision?.code });
  }
  return decision.nextRun;
}

function transition(run, event, receipt = null, existingPublication = null, stage = 'state-transition') {
  return requireTransition(
    decideGrhPipelineTransition({ run, event, receipt, existingPublication }),
    stage,
  );
}

function makeStageReceipt({
  run,
  stage,
  outcome,
  inputDigest,
  outputDigest = null,
  evidence,
  evidenceDigest = null,
  referenceId = null,
  reasonCode = null,
}) {
  return buildStageReceipt({
    runId: run.runId,
    manifestDigest: run.manifestDigest,
    idempotencyKey: run.idempotencyKey,
    stage,
    outcome,
    inputDigest,
    outputDigest,
    evidenceDigest: evidenceDigest || sha256Text(canonicalJson(evidence)),
    referenceId,
    reasonCode,
  });
}

function createReceipt({
  artifactIdentity = null,
  completedAt,
  disposition,
  failure = null,
  manifestSha256,
  pipelineRun = null,
  processors = null,
  runId,
  sourceIdentity,
  startedAt,
  storedArtifacts = null,
}) {
  const deterministic = {
    artifactIdentity,
    disposition,
    failure,
    manifestSha256,
    pipelineRun,
    pipelineVersion: PIPELINE_VERSION,
    processors,
    sourceIdentity,
  };
  return {
    contractVersion: RECEIPT_VERSION,
    deterministic,
    deterministicSha256: sha256Text(canonicalJson(deterministic)),
    observation: {
      completedAt,
      durationMs: elapsedMilliseconds(startedAt, completedAt),
      runId,
      startedAt,
      storedArtifacts,
    },
  };
}

function createLastKnownGood(receipt, pipelineRun, activation, runId, activatedAt) {
  const deterministic = {
    activationSha256: activation.deterministicSha256,
    artifactIdentity: receipt.deterministic.artifactIdentity,
    canonicalPublication: pipelineRun.lastKnownGood,
    idempotencyKey: pipelineRun.idempotencyKey,
    pipelineVersion: PIPELINE_VERSION,
    receiptDeterministicSha256: receipt.deterministicSha256,
    sourceIdentity: receipt.deterministic.sourceIdentity,
    versionDirectory: `versions/${pipelineRun.idempotencyKey}`,
  };
  return {
    contractVersion: LAST_KNOWN_GOOD_VERSION,
    deterministic,
    deterministicSha256: sha256Text(canonicalJson(deterministic)),
    observation: { activatedAt, runId },
  };
}

function inspectStoredReceipt(receipt, expected) {
  const storedRun = receipt?.deterministic?.pipelineRun;
  return receipt?.contractVersion === RECEIPT_VERSION &&
    exactKeys(receipt, ['contractVersion', 'deterministic', 'deterministicSha256', 'observation']) &&
    exactKeys(receipt.deterministic, [
      'artifactIdentity', 'disposition', 'failure', 'manifestSha256', 'pipelineRun',
      'pipelineVersion', 'processors', 'sourceIdentity',
    ]) &&
    exactKeys(receipt.observation, ['completedAt', 'durationMs', 'runId', 'startedAt', 'storedArtifacts']) &&
    receipt.deterministic.pipelineVersion === PIPELINE_VERSION &&
    receipt.deterministic.disposition === 'promoted' &&
    receipt.deterministic.failure === null &&
    receipt.deterministic.manifestSha256 === expected.manifestSha256 &&
    canonicalJson(receipt.deterministic.processors) === canonicalJson(expected.processors) &&
    canonicalJson(receipt.deterministic.sourceIdentity) === canonicalJson(expected.sourceIdentity) &&
    inspectPipelineRun(storedRun)?.ok && storedRun.state === RUN_STATES.PUBLISHED &&
    storedRun.executionScope === EXECUTION_SCOPES.LOCAL_REPLAY &&
    storedRun.publicationTarget === PUBLICATION_TARGETS.LOCAL_STATE && storedRun.tenantId === null &&
    storedRun.idempotencyKey === expected.pipelineRun.idempotencyKey &&
    canonicalJson(storedRun.source) === canonicalJson(expected.pipelineRun.source) &&
    storedRun.lastKnownGood?.sourceManifestDigest === expected.manifestSha256 &&
    receipt.observation.runId === storedRun.runId &&
    validCanonicalUtcTimestamp(receipt.observation.startedAt) &&
    validCanonicalUtcTimestamp(receipt.observation.completedAt) &&
    Number.isSafeInteger(receipt.observation.durationMs) && receipt.observation.durationMs >= 0 &&
    exactKeys(receipt.observation.storedArtifacts, ['profileSha256', 'semanticSha256']) &&
    validSha256(receipt.observation.storedArtifacts.profileSha256) &&
    validSha256(receipt.observation.storedArtifacts.semanticSha256) &&
    receipt.deterministicSha256 === sha256Text(canonicalJson(receipt.deterministic));
}

function inspectLastKnownGood(lastKnownGood) {
  const deterministic = lastKnownGood?.deterministic;
  const publication = deterministic?.canonicalPublication;
  return lastKnownGood?.contractVersion === LAST_KNOWN_GOOD_VERSION &&
    exactKeys(lastKnownGood, ['contractVersion', 'deterministic', 'deterministicSha256', 'observation']) &&
    exactKeys(deterministic, [
      'activationSha256', 'artifactIdentity', 'canonicalPublication', 'idempotencyKey', 'pipelineVersion',
      'receiptDeterministicSha256', 'sourceIdentity', 'versionDirectory',
    ]) &&
    exactKeys(lastKnownGood.observation, ['activatedAt', 'runId']) &&
    validCanonicalUtcTimestamp(lastKnownGood.observation.activatedAt) &&
    /^[a-zA-Z0-9_-]{1,72}$/.test(lastKnownGood.observation.runId || '') &&
    deterministic.pipelineVersion === PIPELINE_VERSION &&
    validSha256(deterministic.activationSha256) &&
    validSha256(deterministic.idempotencyKey) &&
    validSha256(deterministic.receiptDeterministicSha256) &&
    validSha256(deterministic.sourceIdentity?.sha256) &&
    deterministic.versionDirectory === `versions/${deterministic.idempotencyKey}` &&
    publication?.target === PUBLICATION_TARGETS.LOCAL_STATE &&
    publication?.sourceSha256 === deterministic.sourceIdentity.sha256 &&
    publication?.sourceManifestDigest && validSha256(publication.sourceManifestDigest) &&
    publication?.processorBundleDigest && validSha256(publication.processorBundleDigest) &&
    lastKnownGood.deterministicSha256 === sha256Text(canonicalJson(deterministic));
}

function createActivationRecord({
  activatedAt,
  pipelineRun,
  previousActivation,
  receipt,
  runId,
}) {
  const deterministic = {
    idempotencyKey: pipelineRun.idempotencyKey,
    pipelineVersion: PIPELINE_VERSION,
    previousActivationSha256: previousActivation?.deterministicSha256 || null,
    previousPublication: previousActivation?.deterministic?.publication || null,
    publication: pipelineRun.lastKnownGood,
    receiptDeterministicSha256: receipt.deterministicSha256,
    versionDirectory: `versions/${pipelineRun.idempotencyKey}`,
  };
  return {
    contractVersion: ACTIVATION_VERSION,
    deterministic,
    deterministicSha256: sha256Text(canonicalJson(deterministic)),
    observation: { activatedAt, runId },
  };
}

function inspectActivationRecord(activation) {
  const deterministic = activation?.deterministic;
  return activation?.contractVersion === ACTIVATION_VERSION &&
    exactKeys(activation, ['contractVersion', 'deterministic', 'deterministicSha256', 'observation']) &&
    exactKeys(deterministic, [
      'idempotencyKey', 'pipelineVersion', 'previousActivationSha256', 'previousPublication',
      'publication', 'receiptDeterministicSha256', 'versionDirectory',
    ]) &&
    exactKeys(activation.observation, ['activatedAt', 'runId']) &&
    validCanonicalUtcTimestamp(activation.observation.activatedAt) &&
    /^[a-zA-Z0-9_-]{1,72}$/.test(activation.observation.runId || '') &&
    deterministic.pipelineVersion === PIPELINE_VERSION &&
    validSha256(deterministic.idempotencyKey) &&
    validSha256(deterministic.receiptDeterministicSha256) &&
    (deterministic.previousActivationSha256 === null ||
      validSha256(deterministic.previousActivationSha256)) &&
    (deterministic.previousPublication === null ||
      typeof deterministic.previousPublication === 'object') &&
    deterministic.publication && typeof deterministic.publication === 'object' &&
    deterministic.versionDirectory === `versions/${deterministic.idempotencyKey}` &&
    activation.deterministicSha256 === sha256Text(canonicalJson(deterministic));
}

async function readDirectoryEntries(directory, dependencies) {
  try {
    return await dependencies.fileSystem.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw pipelineError('GRH_PIPELINE_STATE_INVALID', 'activation-ledger', error);
  }
}

async function validateActivationLedger(lastKnownGood, dependencies, stateContainers) {
  const activationsDirectory = stateContainers.activations;
  const versionsDirectory = stateContainers.versions;
  const [activationEntries, versionEntries] = await Promise.all([
    readDirectoryEntries(activationsDirectory, dependencies),
    readDirectoryEntries(versionsDirectory, dependencies),
  ]);
  if (activationEntries.some(entry => !entry.isFile() || entry.isSymbolicLink() ||
      !/^[0-9a-f]{64}\.json$/.test(entry.name)) ||
      versionEntries.some(entry => !entry.isDirectory() || entry.isSymbolicLink() ||
        !/^[0-9a-f]{64}$/.test(entry.name))) {
    throw pipelineError('GRH_PIPELINE_DUPLICATE_STATE_INVALID', 'activation-ledger');
  }

  const activations = [];
  for (const entry of activationEntries) {
    const activation = await readJson(
      path.join(activationsDirectory, entry.name),
      MAX_STATE_BYTES,
      'GRH_PIPELINE_DUPLICATE_STATE_INVALID',
      'activation-ledger',
      dependencies.fileSystem,
    );
    if (!inspectActivationRecord(activation) ||
        entry.name !== `${activation.deterministic.idempotencyKey}.json`) {
      throw pipelineError('GRH_PIPELINE_DUPLICATE_STATE_INVALID', 'activation-ledger');
    }
    activations.push(activation);
  }

  const activationIds = new Set(activations.map(item => item.deterministic.idempotencyKey));
  const versionIds = new Set(versionEntries.map(entry => entry.name));
  if (activationIds.size !== activations.length || versionIds.size !== versionEntries.length ||
      activationIds.size !== versionIds.size ||
      [...activationIds].some(id => !versionIds.has(id))) {
    throw pipelineError('GRH_PIPELINE_DUPLICATE_STATE_INVALID', 'activation-ledger');
  }
  if (activations.length === 0) {
    if (lastKnownGood !== null) {
      throw pipelineError('GRH_PIPELINE_DUPLICATE_STATE_INVALID', 'activation-ledger');
    }
    return null;
  }

  const byDigest = new Map(activations.map(item => [item.deterministicSha256, item]));
  const referenced = new Set();
  for (const activation of activations) {
    const previousDigest = activation.deterministic.previousActivationSha256;
    if (previousDigest === null) continue;
    const previous = byDigest.get(previousDigest);
    if (!previous || referenced.has(previousDigest) ||
        canonicalJson(activation.deterministic.previousPublication) !==
          canonicalJson(previous.deterministic.publication)) {
      throw pipelineError('GRH_PIPELINE_DUPLICATE_STATE_INVALID', 'activation-ledger');
    }
    referenced.add(previousDigest);
  }
  const roots = activations.filter(item => item.deterministic.previousActivationSha256 === null);
  const heads = activations.filter(item => !referenced.has(item.deterministicSha256));
  if (roots.length !== 1 || heads.length !== 1) {
    throw pipelineError('GRH_PIPELINE_DUPLICATE_STATE_INVALID', 'activation-ledger');
  }
  let cursor = heads[0];
  const visited = new Set();
  while (cursor) {
    if (visited.has(cursor.deterministicSha256)) {
      throw pipelineError('GRH_PIPELINE_DUPLICATE_STATE_INVALID', 'activation-ledger');
    }
    visited.add(cursor.deterministicSha256);
    cursor = cursor.deterministic.previousActivationSha256
      ? byDigest.get(cursor.deterministic.previousActivationSha256)
      : null;
  }
  if (visited.size !== activations.length || !lastKnownGood ||
      lastKnownGood.deterministic.activationSha256 !== heads[0].deterministicSha256 ||
      lastKnownGood.deterministic.idempotencyKey !== heads[0].deterministic.idempotencyKey ||
      lastKnownGood.deterministic.receiptDeterministicSha256 !==
        heads[0].deterministic.receiptDeterministicSha256 ||
      canonicalJson(lastKnownGood.deterministic.canonicalPublication) !==
        canonicalJson(heads[0].deterministic.publication)) {
    throw pipelineError('GRH_PIPELINE_DUPLICATE_STATE_INVALID', 'activation-ledger');
  }

  for (const activation of activations) {
    const idempotencyKey = activation.deterministic.idempotencyKey;
    const versionDirectory = path.join(versionsDirectory, idempotencyKey);
    const receipt = await readJson(
      path.join(versionDirectory, 'receipt.json'),
      MAX_STATE_BYTES,
      'GRH_PIPELINE_DUPLICATE_STATE_INVALID',
      'activation-ledger',
      dependencies.fileSystem,
    );
    const storedRun = receipt?.deterministic?.pipelineRun;
    const stored = receipt?.observation?.storedArtifacts;
    if (receipt?.contractVersion !== RECEIPT_VERSION ||
        !exactKeys(receipt, ['contractVersion', 'deterministic', 'deterministicSha256', 'observation']) ||
        !exactKeys(receipt?.deterministic, [
          'artifactIdentity', 'disposition', 'failure', 'manifestSha256', 'pipelineRun',
          'pipelineVersion', 'processors', 'sourceIdentity',
        ]) ||
        !exactKeys(receipt?.observation, ['completedAt', 'durationMs', 'runId', 'startedAt', 'storedArtifacts']) ||
        !validCanonicalUtcTimestamp(receipt.observation.startedAt) ||
        !validCanonicalUtcTimestamp(receipt.observation.completedAt) ||
        !Number.isSafeInteger(receipt.observation.durationMs) || receipt.observation.durationMs < 0 ||
        receipt?.deterministic?.disposition !== 'promoted' ||
        receipt?.deterministic?.failure !== null ||
        !inspectProcessorIdentity(receipt?.deterministic?.processors) ||
        receipt?.deterministicSha256 !== activation.deterministic.receiptDeterministicSha256 ||
        receipt?.deterministicSha256 !== sha256Text(canonicalJson(receipt?.deterministic)) ||
        !inspectPipelineRun(storedRun)?.ok || storedRun.state !== RUN_STATES.PUBLISHED ||
        storedRun.idempotencyKey !== idempotencyKey ||
        canonicalJson(storedRun.lastKnownGood) !== canonicalJson(activation.deterministic.publication) ||
        !exactKeys(stored, ['profileSha256', 'semanticSha256'])) {
      throw pipelineError('GRH_PIPELINE_DUPLICATE_STATE_INVALID', 'activation-ledger');
    }
    const [profileCapture, semanticCapture] = await Promise.all([
      readJsonBytes(
        path.join(versionDirectory, 'grh-profile.json'),
        MAX_ARTIFACT_BYTES,
        'GRH_PIPELINE_DUPLICATE_STATE_INVALID',
        'activation-ledger',
        dependencies.fileSystem,
      ),
      readJsonBytes(
        path.join(versionDirectory, 'grh-semantic.json'),
        MAX_ARTIFACT_BYTES,
        'GRH_PIPELINE_DUPLICATE_STATE_INVALID',
        'activation-ledger',
        dependencies.fileSystem,
      ),
    ]);
    const observedArtifactIdentity = deriveArtifactIdentity(profileCapture.value, semanticCapture.value);
    if (sha256Text(profileCapture.bytes) !== stored.profileSha256 ||
        sha256Text(semanticCapture.bytes) !== stored.semanticSha256 ||
        canonicalJson(observedArtifactIdentity) !== canonicalJson(receipt.deterministic.artifactIdentity) ||
        observedArtifactIdentity.profile.schemaVersion !== storedRun.source.profileSchemaVersion ||
        observedArtifactIdentity.semantic.schemaVersion !== storedRun.source.semanticSchemaVersion ||
        !validArtifactGenerationTimes(
          profileCapture.value,
          semanticCapture.value,
          receipt.observation.startedAt,
        )) {
      throw pipelineError('GRH_PIPELINE_DUPLICATE_STATE_INVALID', 'activation-ledger');
    }
  }
  return heads[0];
}

async function validateStoredVersion(versionDirectory, receipt, expected, manifest, dependencies) {
  if (!inspectStoredReceipt(receipt, expected)) {
    throw pipelineError('GRH_PIPELINE_DUPLICATE_STATE_INVALID', 'duplicate-check');
  }
  const profilePath = path.join(versionDirectory, 'grh-profile.json');
  const semanticPath = path.join(versionDirectory, 'grh-semantic.json');
  const [profileCapture, semanticCapture] = await Promise.all([
    readJsonBytes(
      profilePath,
      MAX_ARTIFACT_BYTES,
      'GRH_PIPELINE_DUPLICATE_STATE_INVALID',
      'duplicate-check',
      dependencies.fileSystem,
    ),
    readJsonBytes(
      semanticPath,
      MAX_ARTIFACT_BYTES,
      'GRH_PIPELINE_DUPLICATE_STATE_INVALID',
      'duplicate-check',
      dependencies.fileSystem,
    ),
  ]);
  const { bytes: profileBytes, value: profile } = profileCapture;
  const { bytes: semanticBytes, value: semantic } = semanticCapture;
  const stored = receipt.observation.storedArtifacts;
  const identity = receipt.deterministic.artifactIdentity;
  const observedIdentity = deriveArtifactIdentity(profile, semantic);
  const hashesMatch = sha256Text(profileBytes) === stored.profileSha256 &&
    sha256Text(semanticBytes) === stored.semanticSha256 &&
    canonicalJson(observedIdentity) === canonicalJson(identity);
  const inspection = dependencies.inspectPublicationBundle(profile, semantic, manifest);
  const schemasMatch = profile?.schema_version === expected.pipelineRun.source.profileSchemaVersion &&
    semantic?.schema_version === expected.pipelineRun.source.semanticSchemaVersion;
  if (!hashesMatch || !schemasMatch ||
      !validArtifactGenerationTimes(profile, semantic, receipt.observation.startedAt) || !inspection?.ok) {
    throw pipelineError('GRH_PIPELINE_DUPLICATE_STATE_INVALID', 'duplicate-check');
  }
  return { profile, semantic, storedArtifacts: stored };
}

async function validateActiveLastKnownGood(lastKnownGood, dependencies, stateContainers) {
  if (!inspectLastKnownGood(lastKnownGood)) {
    throw pipelineError('GRH_PIPELINE_STATE_INVALID', 'last-known-good-validation');
  }
  const versionsDirectory = stateContainers.versions;
  const versionDirectory = path.resolve(
    path.dirname(versionsDirectory),
    lastKnownGood.deterministic.versionDirectory,
  );
  if (!isWithin(versionsDirectory, versionDirectory)) {
    throw pipelineError('GRH_PIPELINE_STATE_INVALID', 'last-known-good-validation');
  }
  const metadata = await dependencies.fileSystem.lstat(versionDirectory).catch(error => {
    throw pipelineError('GRH_PIPELINE_STATE_INVALID', 'last-known-good-validation', error);
  });
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw pipelineError('GRH_PIPELINE_STATE_INVALID', 'last-known-good-validation');
  }
  const receipt = await readJson(
    path.join(versionDirectory, 'receipt.json'),
    MAX_STATE_BYTES,
    'GRH_PIPELINE_STATE_INVALID',
    'last-known-good-validation',
    dependencies.fileSystem,
  );
  const deterministic = receipt?.deterministic;
  const storedRun = deterministic?.pipelineRun;
  if (receipt?.contractVersion !== RECEIPT_VERSION ||
      !exactKeys(receipt, ['contractVersion', 'deterministic', 'deterministicSha256', 'observation']) ||
      !exactKeys(deterministic, [
        'artifactIdentity', 'disposition', 'failure', 'manifestSha256', 'pipelineRun',
        'pipelineVersion', 'processors', 'sourceIdentity',
      ]) ||
      !exactKeys(receipt.observation, ['completedAt', 'durationMs', 'runId', 'startedAt', 'storedArtifacts']) ||
      !validCanonicalUtcTimestamp(receipt.observation.startedAt) ||
      !validCanonicalUtcTimestamp(receipt.observation.completedAt) ||
      deterministic?.pipelineVersion !== PIPELINE_VERSION || deterministic?.disposition !== 'promoted' ||
      deterministic?.failure !== null || !inspectProcessorIdentity(deterministic?.processors) ||
      receipt.deterministicSha256 !== lastKnownGood.deterministic.receiptDeterministicSha256 ||
      receipt.deterministicSha256 !== sha256Text(canonicalJson(deterministic)) ||
      !inspectPipelineRun(storedRun)?.ok || storedRun.state !== RUN_STATES.PUBLISHED ||
      storedRun.idempotencyKey !== lastKnownGood.deterministic.idempotencyKey ||
      canonicalJson(storedRun.lastKnownGood) !==
        canonicalJson(lastKnownGood.deterministic.canonicalPublication) ||
      canonicalJson(deterministic.artifactIdentity) !==
        canonicalJson(lastKnownGood.deterministic.artifactIdentity) ||
      canonicalJson(deterministic.sourceIdentity) !==
        canonicalJson(lastKnownGood.deterministic.sourceIdentity)) {
    throw pipelineError('GRH_PIPELINE_STATE_INVALID', 'last-known-good-validation');
  }

  const profilePath = path.join(versionDirectory, 'grh-profile.json');
  const semanticPath = path.join(versionDirectory, 'grh-semantic.json');
  const [profileCapture, semanticCapture] = await Promise.all([
    readJsonBytes(profilePath, MAX_ARTIFACT_BYTES, 'GRH_PIPELINE_STATE_INVALID',
      'last-known-good-validation', dependencies.fileSystem),
    readJsonBytes(semanticPath, MAX_ARTIFACT_BYTES, 'GRH_PIPELINE_STATE_INVALID',
      'last-known-good-validation', dependencies.fileSystem),
  ]);
  const { bytes: profileBytes, value: profile } = profileCapture;
  const { bytes: semanticBytes, value: semantic } = semanticCapture;
  const stored = receipt.observation?.storedArtifacts;
  const artifactIdentity = deterministic.artifactIdentity;
  const observedIdentity = deriveArtifactIdentity(profile, semantic);
  if (!exactKeys(stored, ['profileSha256', 'semanticSha256']) ||
      sha256Text(profileBytes) !== stored.profileSha256 ||
      sha256Text(semanticBytes) !== stored.semanticSha256 ||
      canonicalJson(observedIdentity) !== canonicalJson(artifactIdentity) ||
      profile?.schema_version !== storedRun.source.profileSchemaVersion ||
      semantic?.schema_version !== storedRun.source.semanticSchemaVersion ||
      !validArtifactGenerationTimes(profile, semantic, receipt.observation.startedAt)) {
    throw pipelineError('GRH_PIPELINE_STATE_INVALID', 'last-known-good-validation');
  }
  return Object.freeze({ receipt, versionDirectory });
}

function createDependencies(overrides = {}) {
  return {
    approvedLocalRoots: null,
    buildArtifacts: runPythonArtifactBuilders,
    clock: () => new Date(),
    fileSystem: fs,
    hashFile: sha256File,
    inspectPublicationBundle: inspectGrhPublicationBundle,
    logger: () => {},
    environment: process.env,
    processorIdentity: null,
    processorIdentityProvider: null,
    runIdFactory: () => randomUUID(),
    runtimeVersionReader: readBoundedRuntimeVersion,
    ...overrides,
  };
}

export function createGrhPipelineReplay(overrides = {}) {
  const dependencies = createDependencies(overrides);

  return async function replayGrhPipeline(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw pipelineError('GRH_PIPELINE_ARGUMENT_INVALID', 'initialization');
    }
    const requiredPaths = [options.sourcePath, options.manifestPath, options.stateDirectory];
    const optionalPaths = [options.repositoryRoot, options.tempRoot, options.pythonExecutable]
      .filter(value => value !== undefined);
    const inputTimeout = options.extractorTimeoutMs ?? DEFAULT_EXTRACTOR_TIMEOUT_MS;
    if (!requiredPaths.every(value => typeof value === 'string' && value.trim().length > 0) ||
        !optionalPaths.every(value => typeof value === 'string' && value.trim().length > 0) ||
        !Number.isSafeInteger(inputTimeout) || inputTimeout < 10 || inputTimeout > 24 * 60 * 60 * 1000) {
      throw pipelineError('GRH_PIPELINE_ARGUMENT_INVALID', 'initialization');
    }
    const repositoryRoot = path.resolve(options.repositoryRoot || REPOSITORY_ROOT);
    const sourcePath = path.resolve(options.sourcePath);
    const manifestPath = path.resolve(options.manifestPath);
    const stateDirectoryInput = path.resolve(options.stateDirectory);
    const tempRootInput = path.resolve(options.tempRoot || os.tmpdir());
    const pythonExecutable = options.pythonExecutable || (process.platform === 'win32' ? 'python' : 'python3');
    const extractorTimeoutMs = inputTimeout;
    const runId = dependencies.runIdFactory();
    const startedAt = asIso(dependencies.clock());
    let stage = 'initialization';
    let stateDirectory;
    let stateContainers = null;
    let tempRoot;
    let workspace;
    let workspaceOwnership = null;
    let pendingOwnership = null;
    let pendingCreatedWithoutOwnership = false;
    const capturedFiles = [];
    const lockReleases = [];
    const releaseLock = async () => {
      let firstFailure = null;
      while (lockReleases.length > 0) {
        const release = lockReleases.pop();
        try {
          await release();
        } catch (error) {
          firstFailure ||= error;
        }
      }
      if (firstFailure) throw firstFailure;
    };
    let sourceIdentity = null;
    let manifestSha256 = null;
    let processors = null;
    let manifestCapture = null;
    let sourceCapture = null;
    let processorBundle = null;
    let stagedManifestCapture = null;
    let stagedSourceCapture = null;
    let stagedProcessorBundle = null;
    let pipelineRun = null;
    let activationHead = null;
    let failureReceipt = null;
    let failureReceiptPath = null;
    let caughtFailure = null;

    if (!/^[a-zA-Z0-9_-]{1,72}$/.test(runId)) {
      throw pipelineError('GRH_PIPELINE_ARGUMENT_INVALID', stage);
    }

    const emit = (event, details = {}) => dependencies.logger(Object.freeze({
      event,
      pipelineVersion: PIPELINE_VERSION,
      runId,
      ...details,
    }));

    try {
      const synchronizedRoots = configuredSynchronizedRoots(dependencies.environment);
      const approvedLocalRoots = configuredApprovedLocalRoots(
        dependencies.environment,
        dependencies.approvedLocalRoots,
      );
      assertLocalStatePath(stateDirectoryInput, dependencies.environment);
      assertLocalTempPath(tempRootInput);
      stateDirectory = await assertExternalDirectory(
        stateDirectoryInput,
        repositoryRoot,
        'GRH_PIPELINE_EXTERNAL_STATE_REQUIRED',
        dependencies.fileSystem,
        synchronizedRoots,
        approvedLocalRoots,
        false,
      );
      tempRoot = await assertExternalDirectory(
        tempRootInput,
        repositoryRoot,
        'GRH_PIPELINE_TEMP_ROOT_INVALID',
        dependencies.fileSystem,
        synchronizedRoots,
        approvedLocalRoots,
        true,
      );
      stateContainers = await initializeStateContainers(stateDirectory, dependencies.fileSystem);

      stage = 'manifest-validation';
      manifestCapture = await capturePipelineFile(
        manifestPath,
        MAX_MANIFEST_BYTES,
        'GRH_PIPELINE_MANIFEST_INVALID',
        stage,
        dependencies.fileSystem,
      );
      capturedFiles.push(manifestCapture);
      const manifestRead = await parseCapturedJson(
        manifestCapture,
        MAX_MANIFEST_BYTES,
        'GRH_PIPELINE_MANIFEST_INVALID',
        stage,
      );
      const manifest = manifestRead.value;
      if (!inspectManifest(manifest)) {
        throw pipelineError('GRH_PIPELINE_MANIFEST_INVALID', stage);
      }
      manifestSha256 = sha256Text(manifestRead.bytes);
      sourceIdentity = buildSourceIdentity(manifest);
      sourceCapture = await capturePipelineFile(
        sourcePath,
        Number.MAX_SAFE_INTEGER,
        'GRH_PIPELINE_SOURCE_INVALID',
        stage,
        dependencies.fileSystem,
      );
      capturedFiles.push(sourceCapture);
      verifyCanonicalSourceCapture(sourcePath, sourceCapture, manifest, stage);

      stage = 'processor-identity';
      processorBundle = await capturePythonProcessorBundle(repositoryRoot, dependencies, capturedFiles);
      processors = await resolveProcessorIdentity(
        repositoryRoot,
        pythonExecutable,
        dependencies,
        processorBundle,
      );
      const processorBundleDigest = sha256Text(canonicalJson(processors));

      stage = 'lock';
      const targetLockKey = sha256Text(canonicalJson({
        publicationTarget: PUBLICATION_TARGETS.LOCAL_STATE,
        sourceId: 'grh-junin',
      }));
      await assertStateContainerOwnership(
        stateDirectory,
        stateContainers,
        'locks',
        dependencies.fileSystem,
      );
      lockReleases.push(await acquireLock(
        path.join(stateContainers.locks, `target-${targetLockKey}.lock`),
        runId,
        sourceIdentity,
        dependencies.fileSystem,
      ));
      const sourceSnapshotLockKey = sha256Text(canonicalJson({
        canonicalSystem: sourceIdentity.canonicalSystem,
        snapshotAsOf: sourceIdentity.snapshotAsOf,
        sourceFile: sourceIdentity.sourceFile,
      }));
      await assertStateContainerOwnership(
        stateDirectory,
        stateContainers,
        'locks',
        dependencies.fileSystem,
      );
      lockReleases.push(await acquireLock(
        path.join(stateContainers.locks, `snapshot-${sourceSnapshotLockKey}.lock`),
        runId,
        sourceIdentity,
        dependencies.fileSystem,
      ));

      const lastKnownGoodPath = path.join(stateDirectory, 'last-known-good.json');
      let lastKnownGood = null;
      try {
        lastKnownGood = await readJson(
          lastKnownGoodPath,
          MAX_STATE_BYTES,
          'GRH_PIPELINE_STATE_INVALID',
          'last-known-good-validation',
          dependencies.fileSystem,
        );
      } catch (error) {
        if (error?.systemCode !== 'ENOENT') throw error;
      }
      if (lastKnownGood) {
        if (!inspectLastKnownGood(lastKnownGood)) {
          throw pipelineError('GRH_PIPELINE_DUPLICATE_STATE_INVALID', 'last-known-good-validation');
        }
        const activePublication = lastKnownGood.deterministic.canonicalPublication;
        if (activePublication.snapshotAsOf === manifest.snapshot_as_of &&
            activePublication.sourceSha256 === manifest.sha256 &&
            activePublication.sourceManifestDigest !== manifestSha256) {
          throw pipelineError('GRH_PIPELINE_DUPLICATE_STATE_INVALID', 'pipeline-plan');
        }
      }

      const pipelineManifest = buildPipelineManifest({
        manifest,
        manifestSha256,
        processorBundleDigest,
        runId,
      });
      const plan = planGrhPipelineRun({
        manifest: pipelineManifest,
        lastKnownGood: lastKnownGood?.deterministic?.canonicalPublication || null,
      });
      if (!plan?.ok) {
        const code = plan?.code === DECISION_CODES.SOURCE_ROLLBACK_BLOCKED
          ? 'GRH_PIPELINE_ROLLBACK_BLOCKED'
          : plan?.code === DECISION_CODES.SOURCE_CONFLICT_BLOCKED
            ? 'GRH_PIPELINE_SOURCE_CONFLICT'
            : 'GRH_PIPELINE_STATE_INVALID';
        throw pipelineError(code, 'pipeline-plan', { code: plan?.code });
      }
      pipelineRun = plan.run;
      activationHead = await validateActivationLedger(lastKnownGood, dependencies, stateContainers);
      if (lastKnownGood) {
        await validateActiveLastKnownGood(lastKnownGood, dependencies, stateContainers);
      }
      emit('manifest_validated', {
        executionScope: pipelineRun.executionScope,
        publicationTarget: pipelineRun.publicationTarget,
        snapshotAsOf: sourceIdentity.snapshotAsOf,
        sourceIdentitySha256: sourceIdentity.identitySha256,
      });

      const lockClaimDigest = sha256Text(canonicalJson({
        idempotencyKey: pipelineRun.idempotencyKey,
        runId,
        sourceIdentitySha256: sourceIdentity.identitySha256,
      }));
      const lockReceipt = makeStageReceipt({
        run: pipelineRun,
        stage: STAGES.LOCK,
        outcome: RECEIPT_OUTCOMES.SUCCEEDED,
        inputDigest: pipelineRun.idempotencyKey,
        outputDigest: lockClaimDigest,
        evidence: { lockClaimDigest, sourceIdentitySha256: sourceIdentity.identitySha256 },
      });
      pipelineRun = transition(pipelineRun, RUN_EVENTS.ACQUIRE_LOCK, lockReceipt, null, 'lock');
      emit('lock_acquired', { sourceIdentitySha256: sourceIdentity.identitySha256 });

      const versionDirectory = path.join(stateContainers.versions, pipelineRun.idempotencyKey);
      const storedReceiptPath = path.join(versionDirectory, 'receipt.json');
      let existingReceipt = null;
      let versionExists = false;
      try {
        const versionMetadata = await dependencies.fileSystem.lstat(versionDirectory);
        versionExists = true;
        if (!versionMetadata.isDirectory() || versionMetadata.isSymbolicLink()) {
          throw pipelineError('GRH_PIPELINE_DUPLICATE_STATE_INVALID', 'duplicate-check');
        }
        existingReceipt = await readJson(storedReceiptPath, MAX_STATE_BYTES,
          'GRH_PIPELINE_DUPLICATE_STATE_INVALID', 'duplicate-check', dependencies.fileSystem);
      } catch (error) {
        const missing = error?.code === 'ENOENT' || error?.systemCode === 'ENOENT';
        if (!missing) throw error;
        if (versionExists) {
          throw pipelineError('GRH_PIPELINE_DUPLICATE_STATE_INVALID', 'duplicate-check', error);
        }
      }

      if (existingReceipt) {
        await verifyProcessorIdentity(
          processors,
          repositoryRoot,
          pythonExecutable,
          dependencies,
          processorBundle,
        );
        const expected = { manifestSha256, pipelineRun, processors, sourceIdentity };
        const storedVersion = await validateStoredVersion(
          versionDirectory,
          existingReceipt,
          expected,
          manifest,
          dependencies,
        );
        await revalidatePipelineCapture(
          manifestCapture,
          'GRH_PIPELINE_MANIFEST_INVALID',
          'manifest-revalidation',
        );
        await revalidatePipelineCapture(
          sourceCapture,
          'GRH_PIPELINE_SOURCE_CHANGED',
          'source-revalidation',
        );

        const storedPublication = existingReceipt.deterministic.pipelineRun.lastKnownGood;
        if (!lastKnownGood ||
            lastKnownGood.deterministic.versionDirectory !== `versions/${pipelineRun.idempotencyKey}` ||
            lastKnownGood.deterministic.receiptDeterministicSha256 !== existingReceipt.deterministicSha256 ||
            canonicalJson(lastKnownGood.deterministic.artifactIdentity) !==
              canonicalJson(existingReceipt.deterministic.artifactIdentity) ||
            canonicalJson(lastKnownGood.deterministic.canonicalPublication) !== canonicalJson(storedPublication) ||
            canonicalJson(pipelineRun.lastKnownGood) !== canonicalJson(storedPublication)) {
          throw pipelineError('GRH_PIPELINE_DUPLICATE_STATE_INVALID', 'duplicate-check');
        }
        await verifyProcessorIdentity(
          processors,
          repositoryRoot,
          pythonExecutable,
          dependencies,
          processorBundle,
        );
        await closePipelineCaptures(capturedFiles, 'capture-release');

        const duplicateReceipt = makeStageReceipt({
          run: pipelineRun,
          stage: STAGES.DUPLICATE,
          outcome: RECEIPT_OUTCOMES.DUPLICATE,
          inputDigest: pipelineRun.idempotencyKey,
          outputDigest: storedPublication.bundleDigest,
          evidenceDigest: storedPublication.receiptDigest,
          referenceId: storedPublication.referenceId,
        });
        pipelineRun = transition(
          pipelineRun,
          RUN_EVENTS.MARK_DUPLICATE,
          duplicateReceipt,
          storedPublication,
          'duplicate-check',
        );
        const completedAt = asIso(dependencies.clock());
        const replayReceipt = createReceipt({
          artifactIdentity: existingReceipt.deterministic.artifactIdentity,
          completedAt,
          disposition: 'duplicate',
          manifestSha256,
          pipelineRun,
          processors,
          runId,
          sourceIdentity,
          startedAt,
          storedArtifacts: storedVersion.storedArtifacts,
        });
        const replayReceiptPath = path.join(stateContainers.runs, `${runId}.json`);
        try {
          await assertStateContainerOwnership(
            stateDirectory,
            stateContainers,
            'runs',
            dependencies.fileSystem,
          );
          await atomicWriteJson(replayReceiptPath, replayReceipt, runId, dependencies.fileSystem);
        } catch (error) {
          throw pipelineError('GRH_PIPELINE_RECEIPT_FAILED', 'duplicate-receipt', error);
        }

        emit('duplicate_skipped', {
          active: true,
          snapshotAsOf: sourceIdentity.snapshotAsOf,
          sourceIdentitySha256: sourceIdentity.identitySha256,
        });
        return Object.freeze({
          active: true,
          pipelineRun,
          receiptPath: replayReceiptPath,
          runId,
          sourceIdentity,
          status: 'duplicate',
        });
      }

      pipelineRun = transition(pipelineRun, RUN_EVENTS.START_EXTRACT, null, null, 'extract');
      stage = 'workspace';
      workspace = await dependencies.fileSystem.mkdtemp(path.join(tempRoot, 'municontrol-grh-replay-'));
      workspaceOwnership = await captureOwnedDirectory(
        workspace,
        tempRoot,
        'GRH_PIPELINE_TEMP_ROOT_INVALID',
        stage,
        dependencies.fileSystem,
      );
      workspace = workspaceOwnership.path;
      const workspaceManifestPath = path.join(workspace, 'approved-source-manifest.json');
      const workspaceSourcePath = path.join(workspace, manifest.source_file);
      stagedManifestCapture = await materializePipelineCapture(
        manifestCapture,
        workspaceManifestPath,
        'GRH_PIPELINE_MANIFEST_INVALID',
        'manifest-revalidation',
      );
      capturedFiles.push(stagedManifestCapture);
      stagedSourceCapture = await materializePipelineCapture(
        sourceCapture,
        workspaceSourcePath,
        'GRH_PIPELINE_SOURCE_CHANGED',
        'source-revalidation',
      );
      capturedFiles.push(stagedSourceCapture);
      stagedProcessorBundle = await stagePythonProcessorBundle(
        processorBundle,
        workspace,
        dependencies,
        capturedFiles,
      );
      if (stagedManifestCapture.sha256 !== manifestSha256) {
        throw pipelineError('GRH_PIPELINE_MANIFEST_INVALID', 'manifest-revalidation');
      }
      if (stagedSourceCapture.sha256 !== sourceIdentity.sha256) {
        throw pipelineError('GRH_PIPELINE_SOURCE_CHANGED', 'source-revalidation');
      }

      const extractDigest = sha256Text(canonicalJson({
        processorBundleDigest,
        sourceManifestDigest: manifestSha256,
        sourceSha256: sourceIdentity.sha256,
      }));
      const extractReceipt = makeStageReceipt({
        run: pipelineRun,
        stage: STAGES.EXTRACT,
        outcome: RECEIPT_OUTCOMES.SUCCEEDED,
        inputDigest: pipelineRun.source.sourceSha256,
        outputDigest: extractDigest,
        evidence: { extractDigest, sourceIdentitySha256: sourceIdentity.identitySha256 },
      });
      pipelineRun = transition(pipelineRun, RUN_EVENTS.COMPLETE_EXTRACT, extractReceipt, null, 'extract');
      pipelineRun = transition(pipelineRun, RUN_EVENTS.START_PROFILE, null, null, 'profile');

      stage = 'artifact-build';
      emit('artifact_build_started', {
        snapshotAsOf: sourceIdentity.snapshotAsOf,
        sourceIdentitySha256: sourceIdentity.identitySha256,
      });
      let outputs;
      try {
        outputs = await dependencies.buildArtifacts({
          generatedAt: startedAt,
          manifestPath: workspaceManifestPath,
          outputDirectory: workspace,
          processorRoot: stagedProcessorBundle.processorRoot,
          pythonExecutable,
          sourceIdentity,
          sourcePath: workspaceSourcePath,
          timeoutMs: extractorTimeoutMs,
        });
      } catch (error) {
        throw pipelineError('GRH_PIPELINE_EXTRACTOR_FAILED', stage, error);
      }
      const profileOutput = path.resolve(outputs?.profileOutput || path.join(workspace, 'grh-profile.json'));
      const semanticOutput = path.resolve(outputs?.semanticOutput || path.join(workspace, 'grh-semantic.json'));
      if (!isWithin(workspace, profileOutput) || !isWithin(workspace, semanticOutput)) {
        throw pipelineError('GRH_PIPELINE_ARTIFACT_INVALID', 'artifact-validation');
      }

      await verifyProcessorIdentity(
        processors,
        repositoryRoot,
        pythonExecutable,
        dependencies,
        processorBundle,
      );
      await revalidateProcessorCaptures(stagedProcessorBundle.entries);
      stage = 'source-revalidation';
      await revalidatePipelineCapture(
        manifestCapture,
        'GRH_PIPELINE_MANIFEST_INVALID',
        'manifest-revalidation',
      );
      await revalidatePipelineCapture(
        stagedManifestCapture,
        'GRH_PIPELINE_MANIFEST_INVALID',
        'manifest-revalidation',
      );
      await revalidatePipelineCapture(
        sourceCapture,
        'GRH_PIPELINE_SOURCE_CHANGED',
        stage,
      );
      await revalidatePipelineCapture(
        stagedSourceCapture,
        'GRH_PIPELINE_SOURCE_CHANGED',
        stage,
      );

      stage = 'artifact-validation';
      const [profileCapture, semanticCapture] = await Promise.all([
        readJsonBytes(
          profileOutput,
          MAX_ARTIFACT_BYTES,
          'GRH_PIPELINE_ARTIFACT_INVALID',
          stage,
          dependencies.fileSystem,
        ),
        readJsonBytes(
          semanticOutput,
          MAX_ARTIFACT_BYTES,
          'GRH_PIPELINE_ARTIFACT_INVALID',
          stage,
          dependencies.fileSystem,
        ),
      ]);
      const { bytes: profileBytes, value: profile } = profileCapture;
      const { bytes: semanticBytes, value: semantic } = semanticCapture;
      if (!validArtifactGenerationTimes(profile, semantic, startedAt)) {
        throw pipelineError('GRH_PIPELINE_ARTIFACT_INVALID', stage);
      }
      const artifactIdentity = deriveArtifactIdentity(profile, semantic);
      if (artifactIdentity.profile.schemaVersion !== PROFILE_SCHEMA_VERSION ||
          artifactIdentity.semantic.schemaVersion !== SEMANTIC_SCHEMA_VERSION) {
        throw pipelineError('GRH_PIPELINE_ARTIFACT_INVALID', stage);
      }
      const storedArtifacts = {
        profileSha256: sha256Text(profileBytes),
        semanticSha256: sha256Text(semanticBytes),
      };
      const candidateBundleDigest = sha256Text(canonicalJson(artifactIdentity));
      const profileReceipt = makeStageReceipt({
        run: pipelineRun,
        stage: STAGES.PROFILE,
        outcome: RECEIPT_OUTCOMES.SUCCEEDED,
        inputDigest: pipelineRun.extractDigest,
        outputDigest: candidateBundleDigest,
        evidence: { artifactIdentity, storedArtifacts },
      });
      pipelineRun = transition(pipelineRun, RUN_EVENTS.COMPLETE_PROFILE, profileReceipt, null, 'profile');
      pipelineRun = transition(pipelineRun, RUN_EVENTS.START_VALIDATE, null, null, 'artifact-validation');

      const inspection = dependencies.inspectPublicationBundle(profile, semantic, manifest);
      if (!inspection?.ok) {
        throw pipelineError('GRH_PIPELINE_ARTIFACT_INVALID', stage);
      }
      const validateReceipt = makeStageReceipt({
        run: pipelineRun,
        stage: STAGES.VALIDATE,
        outcome: RECEIPT_OUTCOMES.SUCCEEDED,
        inputDigest: pipelineRun.candidateBundleDigest,
        outputDigest: pipelineRun.candidateBundleDigest,
        evidence: { bundleDigest: pipelineRun.candidateBundleDigest, contract: 'grh-publication-bundle-v1' },
      });
      pipelineRun = transition(
        pipelineRun,
        RUN_EVENTS.COMPLETE_VALIDATE,
        validateReceipt,
        null,
        'artifact-validation',
      );
      emit('artifact_bundle_validated', {
        snapshotAsOf: sourceIdentity.snapshotAsOf,
        sourceIdentitySha256: sourceIdentity.identitySha256,
      });

      stage = 'promotion-prepare';
      await revalidatePipelineCapture(
        manifestCapture,
        'GRH_PIPELINE_MANIFEST_INVALID',
        'manifest-revalidation',
      );
      await revalidatePipelineCapture(
        stagedManifestCapture,
        'GRH_PIPELINE_MANIFEST_INVALID',
        'manifest-revalidation',
      );
      await revalidatePipelineCapture(
        sourceCapture,
        'GRH_PIPELINE_SOURCE_CHANGED',
        'source-revalidation',
      );
      await revalidatePipelineCapture(
        stagedSourceCapture,
        'GRH_PIPELINE_SOURCE_CHANGED',
        'source-revalidation',
      );
      await verifyProcessorIdentity(
        processors,
        repositoryRoot,
        pythonExecutable,
        dependencies,
        processorBundle,
      );
      await revalidateProcessorCaptures(stagedProcessorBundle.entries);
      await closePipelineCaptures(capturedFiles, 'capture-release');
      pipelineRun = transition(pipelineRun, RUN_EVENTS.START_PUBLISH, null, null, 'promotion-prepare');
      const completedAt = asIso(dependencies.clock());
      const referenceId = `local-state:${pipelineRun.idempotencyKey}`;
      const publishReceipt = makeStageReceipt({
        run: pipelineRun,
        stage: STAGES.PUBLISH,
        outcome: RECEIPT_OUTCOMES.SUCCEEDED,
        inputDigest: pipelineRun.candidateBundleDigest,
        outputDigest: pipelineRun.candidateBundleDigest,
        evidence: { artifactIdentity, storedArtifacts },
        referenceId,
      });
      const publishedRun = transition(
        pipelineRun,
        RUN_EVENTS.COMPLETE_PUBLISH,
        publishReceipt,
        null,
        'promotion-prepare',
      );
      if (publishedRun.lastKnownGood?.receiptDigest !== digestStageReceipt(publishReceipt)) {
        throw pipelineError('GRH_PIPELINE_STATE_INVALID', 'promotion-prepare');
      }
      const successReceipt = createReceipt({
        artifactIdentity,
        completedAt,
        disposition: 'promoted',
        manifestSha256,
        pipelineRun: publishedRun,
        processors,
        runId,
        sourceIdentity,
        startedAt,
        storedArtifacts,
      });
      const activation = createActivationRecord({
        activatedAt: completedAt,
        pipelineRun: publishedRun,
        previousActivation: activationHead,
        receipt: successReceipt,
        runId,
      });
      const versionsDirectory = stateContainers.versions;
      await assertStateContainerOwnership(
        stateDirectory,
        stateContainers,
        'versions',
        dependencies.fileSystem,
      );
      const pendingCandidate = path.join(versionsDirectory, `.pending-${pipelineRun.idempotencyKey}-${runId}`);
      await dependencies.fileSystem.mkdir(pendingCandidate, { mode: 0o700 });
      pendingCreatedWithoutOwnership = true;
      pendingOwnership = await captureOwnedDirectory(
        pendingCandidate,
        versionsDirectory,
        'GRH_PIPELINE_STATE_INVALID',
        'promotion-prepare',
        dependencies.fileSystem,
      );
      if (pendingOwnership.parentDev !== stateContainers.ownership.versions.dev ||
          pendingOwnership.parentIno !== stateContainers.ownership.versions.ino) {
        throw pipelineError('GRH_PIPELINE_STATE_INVALID', 'promotion-prepare');
      }
      await assertStateContainerOwnership(
        stateDirectory,
        stateContainers,
        'versions',
        dependencies.fileSystem,
      );
      pendingCreatedWithoutOwnership = false;
      await Promise.all([
        dependencies.fileSystem.writeFile(path.join(pendingOwnership.path, 'grh-profile.json'), profileBytes, {
          flag: 'wx', mode: 0o600,
        }),
        dependencies.fileSystem.writeFile(path.join(pendingOwnership.path, 'grh-semantic.json'), semanticBytes, {
          flag: 'wx', mode: 0o600,
        }),
        dependencies.fileSystem.writeFile(
          path.join(pendingOwnership.path, 'receipt.json'),
          `${canonicalJson(successReceipt)}\n`,
          { encoding: 'utf8', flag: 'wx', mode: 0o600 },
        ),
      ]);

      stage = 'workspace-cleanup';
      await removeOwnedDirectory(
        workspaceOwnership,
        'GRH_PIPELINE_CLEANUP_FAILED',
        stage,
        dependencies.fileSystem,
      );
      workspace = null;
      workspaceOwnership = null;

      stage = 'promotion';
      try {
        await assertStateContainerOwnership(
          stateDirectory,
          stateContainers,
          'versions',
          dependencies.fileSystem,
        );
        await assertOwnedDirectory(
          pendingOwnership,
          'GRH_PIPELINE_PROMOTION_FAILED',
          stage,
          dependencies.fileSystem,
        );
        try {
          await dependencies.fileSystem.lstat(versionDirectory);
          throw pipelineError('GRH_PIPELINE_PROMOTION_FAILED', stage);
        } catch (error) {
          if (error instanceof GrhPipelineReplayError) throw error;
          if (error?.code !== 'ENOENT') {
            throw pipelineError('GRH_PIPELINE_PROMOTION_FAILED', stage, error);
          }
        }
        await dependencies.fileSystem.rename(pendingOwnership.path, versionDirectory);
        pendingOwnership = null;
        await assertStateContainerOwnership(
          stateDirectory,
          stateContainers,
          'activations',
          dependencies.fileSystem,
        );
        await atomicWriteJson(
          path.join(stateContainers.activations, `${publishedRun.idempotencyKey}.json`),
          activation,
          runId,
          dependencies.fileSystem,
        );
        const promotedLastKnownGood = createLastKnownGood(
          successReceipt,
          publishedRun,
          activation,
          runId,
          completedAt,
        );
        await assertStateContainerOwnership(
          stateDirectory,
          stateContainers,
          'versions',
          dependencies.fileSystem,
        );
        await atomicWriteJson(
          lastKnownGoodPath,
          promotedLastKnownGood,
          runId,
          dependencies.fileSystem,
        );
        pipelineRun = publishedRun;
      } catch (error) {
        throw pipelineError('GRH_PIPELINE_PROMOTION_FAILED', stage, error);
      }

      emit('bundle_promoted', {
        snapshotAsOf: sourceIdentity.snapshotAsOf,
        sourceIdentitySha256: sourceIdentity.identitySha256,
      });
      return Object.freeze({
        active: true,
        pipelineRun,
        receiptPath: path.join(versionDirectory, 'receipt.json'),
        runId,
        sourceIdentity,
        status: 'promoted',
      });
    } catch (error) {
      const failure = error instanceof GrhPipelineReplayError
        ? error
        : pipelineError('GRH_PIPELINE_STATE_INVALID', stage, error);
      caughtFailure = failure;
      if (pipelineRun && ![
        RUN_STATES.PUBLISHED,
        RUN_STATES.DUPLICATE,
        RUN_STATES.FAILED,
        RUN_STATES.BLOCKED,
      ].includes(pipelineRun.state)) {
        const blockedCodes = new Set([
          'GRH_PIPELINE_DUPLICATE_STATE_INVALID',
          'GRH_PIPELINE_LOCKED',
          'GRH_PIPELINE_ROLLBACK_BLOCKED',
          'GRH_PIPELINE_SOURCE_CONFLICT',
        ]);
        const blocked = blockedCodes.has(failure.code);
        const canonicalStage = pipelineRun.state === RUN_STATES.PLANNED
          ? STAGES.LOCK
          : [RUN_STATES.LOCKED, RUN_STATES.EXTRACTING].includes(pipelineRun.state)
            ? STAGES.EXTRACT
            : [RUN_STATES.EXTRACTED, RUN_STATES.PROFILING].includes(pipelineRun.state)
              ? STAGES.PROFILE
              : [RUN_STATES.PROFILED, RUN_STATES.VALIDATING].includes(pipelineRun.state)
                ? STAGES.VALIDATE
                : STAGES.PUBLISH;
        const inputDigest = canonicalStage === STAGES.LOCK
          ? pipelineRun.idempotencyKey
          : canonicalStage === STAGES.EXTRACT
            ? pipelineRun.source.sourceSha256
            : canonicalStage === STAGES.PROFILE
              ? pipelineRun.extractDigest
              : pipelineRun.candidateBundleDigest;
        try {
          const terminalReceipt = makeStageReceipt({
            run: pipelineRun,
            stage: canonicalStage,
            outcome: blocked ? RECEIPT_OUTCOMES.BLOCKED : RECEIPT_OUTCOMES.FAILED,
            inputDigest,
            evidence: { code: failure.code, pipelineStage: canonicalStage },
            reasonCode: failure.code,
          });
          pipelineRun = transition(
            pipelineRun,
            blocked ? RUN_EVENTS.BLOCK : RUN_EVENTS.FAIL,
            terminalReceipt,
            null,
            'failure-transition',
          );
        } catch {
          emit('failure_transition_not_recorded', { code: 'GRH_PIPELINE_STATE_INVALID' });
        }
      }
      if (stateDirectory && stateContainers) {
        const completedAt = asIso(dependencies.clock());
        const disposition = pipelineRun?.state === RUN_STATES.BLOCKED || [
          'GRH_PIPELINE_DUPLICATE_STATE_INVALID',
          'GRH_PIPELINE_LOCKED',
          'GRH_PIPELINE_ROLLBACK_BLOCKED',
          'GRH_PIPELINE_SOURCE_CONFLICT',
        ].includes(failure.code) ? 'blocked' : 'failed';
        failureReceipt = createReceipt({
          completedAt,
          disposition,
          failure: { code: failure.code, stage: failure.stage },
          manifestSha256,
          pipelineRun,
          processors,
          runId,
          sourceIdentity,
          startedAt,
        });
        failureReceiptPath = path.join(stateContainers.runs, `${runId}.json`);
        try {
          await assertStateContainerOwnership(
            stateDirectory,
            stateContainers,
            'runs',
            dependencies.fileSystem,
          );
          await atomicWriteJson(
            failureReceiptPath,
            failureReceipt,
            runId,
            dependencies.fileSystem,
          );
        } catch {
          emit('failure_receipt_not_persisted', { code: 'GRH_PIPELINE_RECEIPT_FAILED' });
        }
      }
      emit('pipeline_failed', { code: failure.code, stage: failure.stage });
      throw failure;
    } finally {
      const cleanupFailures = [];
      if (capturedFiles.length > 0) {
        try {
          await closePipelineCaptures(capturedFiles, 'capture-release');
        } catch {
          cleanupFailures.push('captures');
          emit('capture_release_failed', { code: 'GRH_PIPELINE_CLEANUP_FAILED' });
        }
      }
      if (workspace) {
        if (!workspaceOwnership) {
          cleanupFailures.push('workspace');
          emit('workspace_cleanup_failed', { code: 'GRH_PIPELINE_CLEANUP_FAILED' });
        } else {
          try {
            await removeOwnedDirectory(
              workspaceOwnership,
              'GRH_PIPELINE_CLEANUP_FAILED',
              'workspace-cleanup',
              dependencies.fileSystem,
            );
          } catch {
            cleanupFailures.push('workspace');
            emit('workspace_cleanup_failed', { code: 'GRH_PIPELINE_CLEANUP_FAILED' });
          }
        }
      }
      if (pendingOwnership) {
        try {
          await removeOwnedDirectory(
            pendingOwnership,
            'GRH_PIPELINE_CLEANUP_FAILED',
            'promotion-cleanup',
            dependencies.fileSystem,
          );
        } catch {
          cleanupFailures.push('pending');
          emit('pending_cleanup_failed', { code: 'GRH_PIPELINE_CLEANUP_FAILED' });
        }
      } else if (pendingCreatedWithoutOwnership) {
        cleanupFailures.push('pending');
        emit('pending_cleanup_failed', { code: 'GRH_PIPELINE_CLEANUP_FAILED' });
      }
      let lockReleaseFailure = null;
      try {
        await releaseLock();
      } catch (error) {
        lockReleaseFailure = error instanceof GrhPipelineReplayError
          ? error
          : pipelineError('GRH_PIPELINE_STATE_INVALID', 'lock-release', error);
        cleanupFailures.push('lock');
        emit('lock_release_failed', { code: lockReleaseFailure.code });
      }
      if (cleanupFailures.length > 0 && failureReceipt && failureReceiptPath) {
        failureReceipt.deterministic.failure.cleanupFailures = cleanupFailures;
        failureReceipt.deterministicSha256 = sha256Text(canonicalJson(failureReceipt.deterministic));
        try {
          await assertStateContainerOwnership(
            stateDirectory,
            stateContainers,
            'runs',
            dependencies.fileSystem,
          );
          await atomicWriteJson(failureReceiptPath, failureReceipt, runId, dependencies.fileSystem);
        } catch {
          emit('failure_receipt_not_persisted', { code: 'GRH_PIPELINE_RECEIPT_FAILED' });
        }
      }
      if (lockReleaseFailure && !caughtFailure) {
        if (stateContainers) {
          const completedAt = asIso(dependencies.clock());
          const releaseFailureReceipt = createReceipt({
            completedAt,
            disposition: 'failed',
            failure: { code: lockReleaseFailure.code, cleanupFailures: ['lock'], stage: lockReleaseFailure.stage },
            manifestSha256,
            pipelineRun,
            processors,
            runId,
            sourceIdentity,
            startedAt,
          });
          try {
            await assertStateContainerOwnership(
              stateDirectory,
              stateContainers,
              'runs',
              dependencies.fileSystem,
            );
            await atomicWriteJson(
              path.join(stateContainers.runs, `${runId}.json`),
              releaseFailureReceipt,
              runId,
              dependencies.fileSystem,
            );
          } catch {
            emit('failure_receipt_not_persisted', { code: 'GRH_PIPELINE_RECEIPT_FAILED' });
          }
        }
        emit('pipeline_failed', { code: lockReleaseFailure.code, stage: lockReleaseFailure.stage });
        throw lockReleaseFailure;
      }
    }
  };
}

export const replayGrhPipeline = createGrhPipelineReplay();

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(GRH_PIPELINE_REPLAY_USAGE);
    return;
  }
  try {
    const result = await replayGrhPipeline({
      manifestPath: argument('--manifest'),
      pythonExecutable: argument('--python') || undefined,
      sourcePath: argument('--source'),
      stateDirectory: argument('--state-dir'),
      tempRoot: argument('--temp-root') || undefined,
    });
    process.stdout.write(`${JSON.stringify({
      active: result.active,
      runId: result.runId,
      snapshotAsOf: result.sourceIdentity.snapshotAsOf,
      status: result.status,
    })}\n`);
  } catch (error) {
    const failure = error instanceof GrhPipelineReplayError
      ? error
      : pipelineError('GRH_PIPELINE_STATE_INVALID', 'cli', error);
    process.stderr.write(`${JSON.stringify({
      code: failure.code,
      hint: SAFE_CLI_HINTS[failure.code] || undefined,
      stage: failure.stage,
    })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  await main();
}
