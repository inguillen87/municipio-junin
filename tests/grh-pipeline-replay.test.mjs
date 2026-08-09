import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import {
  GrhPipelineReplayError,
  createGrhPipelineReplay,
  runBoundedProcess,
  runPythonArtifactBuilders,
} from '../scripts/replay_grh_pipeline.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function temporaryTestArea(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'municontrol-grh-replay-test-'));
  t.after(async () => {
    const realParent = await fs.realpath(os.tmpdir());
    const realDirectory = await fs.realpath(directory).catch(() => null);
    if (realDirectory && isWithin(realParent, realDirectory)) {
      await fs.rm(realDirectory, { recursive: true, force: false });
    }
  });
  const stateDirectory = path.join(directory, 'state');
  const tempRoot = path.join(directory, 'workspaces');
  const inputDirectory = path.join(directory, 'input');
  await Promise.all([
    fs.mkdir(stateDirectory, { recursive: true }),
    fs.mkdir(tempRoot, { recursive: true }),
    fs.mkdir(inputDirectory, { recursive: true }),
  ]);
  return { directory, inputDirectory, stateDirectory, tempRoot };
}

async function canonicalFixture(area, {
  content = Buffer.from('small governed GRH fixture'),
  snapshot = '2026-08-06',
} = {}) {
  const compactDate = snapshot.replaceAll('-', '');
  const sourceFile = `grh_junin.backup_${compactDate}15_plataforma.sql.gz`;
  const sourcePath = path.join(area.inputDirectory, sourceFile);
  const manifestPath = path.join(area.inputDirectory, `manifest-${compactDate}.json`);
  await fs.writeFile(sourcePath, content);
  const manifest = {
    schema_version: 'grh-source-manifest-v1',
    canonical_system: 'GRH Junín',
    source_file: sourceFile,
    sha256: sha256(content),
    compressed_size_bytes: content.length,
    snapshot_as_of: snapshot,
    excluded_sources: ['personas_junin'],
    approval_basis: 'Fixture local aprobada exclusivamente para pruebas O2A.',
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest), 'utf8');
  return { manifest, manifestPath, sourcePath };
}

async function writeSafeArtifacts(
  outputDirectory,
  snapshot = '2026-08-06',
  generatedAt = '2026-08-09T12:00:00.000Z',
) {
  const profileOutput = path.join(outputDirectory, 'grh-profile.json');
  const semanticOutput = path.join(outputDirectory, 'grh-semantic.json');
  const profile = {
    schema_version: 'grh-profile-v1',
    generated_at: generatedAt,
    safe_fixture: true,
  };
  const semantic = {
    schema_version: 'grh-semantic-v2',
    source: { generated_at: generatedAt, snapshot_as_of: snapshot },
    privacy: { contains_pii: false },
  };
  await Promise.all([
    fs.writeFile(profileOutput, JSON.stringify(profile), 'utf8'),
    fs.writeFile(semanticOutput, JSON.stringify(semantic), 'utf8'),
  ]);
  return { profileOutput, semanticOutput };
}

function deterministicRuntime({
  buildArtifacts,
  clockStart = Date.UTC(2026, 7, 9, 12, 0, 0),
  inspectPublicationBundle,
  logs = [],
  processorIdentity,
} = {}) {
  let run = 0;
  let tick = 0;
  return {
    buildArtifacts: buildArtifacts || (async ({ generatedAt, outputDirectory }) =>
      writeSafeArtifacts(outputDirectory, '2026-08-06', generatedAt)),
    clock: () => new Date(clockStart + tick++ * 1_000),
    inspectPublicationBundle: inspectPublicationBundle || (() => ({ ok: true, errors: [] })),
    logger: event => logs.push(event),
    processorIdentity: processorIdentity || {
      buildSemanticScriptSha256: '1'.repeat(64),
      nodeRuntimeSha256: 'a'.repeat(64),
      nodeRuntimePinSha256: '2'.repeat(64),
      pipelineFoundationSha256: '3'.repeat(64),
      profileScriptSha256: '4'.repeat(64),
      publicationAdapterSha256: '5'.repeat(64),
      publicationContractSha256: '6'.repeat(64),
      pythonRuntimeSha256: 'b'.repeat(64),
      pythonRuntimePinSha256: '7'.repeat(64),
      replayRunnerSha256: '8'.repeat(64),
      sourceManifestScriptSha256: '9'.repeat(64),
    },
    runIdFactory: () => `test-run-${++run}`,
  };
}

function replayOptions(area, fixture, extra = {}) {
  return {
    manifestPath: fixture.manifestPath,
    repositoryRoot,
    sourcePath: fixture.sourcePath,
    stateDirectory: area.stateDirectory,
    tempRoot: area.tempRoot,
    ...extra,
  };
}

test('replay promotes only validated aggregate artifacts and skips an identical SHA without rebuilding', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  const logs = [];
  const workspaces = [];
  let builds = 0;
  const replay = createGrhPipelineReplay(deterministicRuntime({
    logs,
    buildArtifacts: async ({ generatedAt, outputDirectory }) => {
      builds += 1;
      workspaces.push(outputDirectory);
      return writeSafeArtifacts(outputDirectory, '2026-08-06', generatedAt);
    },
  }));

  const promoted = await replay(replayOptions(area, fixture));
  assert.equal(promoted.status, 'promoted');
  assert.equal(promoted.active, true);
  assert.equal(promoted.pipelineRun.state, 'PUBLISHED');
  assert.equal(promoted.pipelineRun.executionScope, 'LOCAL_REPLAY');
  assert.equal(promoted.pipelineRun.publicationTarget, 'LOCAL_STATE');
  assert.equal(promoted.pipelineRun.tenantId, null);
  assert.equal(builds, 1);
  assert.equal(workspaces.every(workspace => !isWithin(repositoryRoot, workspace)), true);
  assert.equal(isWithin(area.tempRoot, workspaces[0]), true);
  await assert.rejects(fs.access(workspaces[0]), error => error?.code === 'ENOENT');

  const lastKnownGoodPath = path.join(area.stateDirectory, 'last-known-good.json');
  const beforeDuplicate = await fs.readFile(lastKnownGoodPath, 'utf8');
  const lastKnownGood = JSON.parse(beforeDuplicate);
  const successReceipt = JSON.parse(await fs.readFile(promoted.receiptPath, 'utf8'));
  assert.equal(successReceipt.deterministic.disposition, 'promoted');
  assert.equal(successReceipt.deterministic.sourceIdentity.sha256, fixture.manifest.sha256);
  assert.equal(successReceipt.observation.startedAt, '2026-08-09T12:00:00.000Z');
  assert.equal(Object.hasOwn(successReceipt.deterministic, 'startedAt'), false);
  assert.equal(Object.hasOwn(successReceipt.deterministic, 'completedAt'), false);
  assert.match(successReceipt.deterministicSha256, /^[0-9a-f]{64}$/);
  assert.equal(successReceipt.deterministic.pipelineRun.state, 'PUBLISHED');
  assert.equal(lastKnownGood.deterministic.canonicalPublication.idempotencyKey,
    promoted.pipelineRun.idempotencyKey);
  assert.match(lastKnownGood.deterministic.activationSha256, /^[0-9a-f]{64}$/);

  const duplicate = await replay(replayOptions(area, fixture));
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.active, true);
  assert.equal(duplicate.pipelineRun.state, 'DUPLICATE');
  assert.equal(builds, 1);
  assert.equal(await fs.readFile(lastKnownGoodPath, 'utf8'), beforeDuplicate);
  const duplicateReceipt = JSON.parse(await fs.readFile(duplicate.receiptPath, 'utf8'));
  assert.equal(duplicateReceipt.deterministic.disposition, 'duplicate');
  assert.equal(logs.filter(event => event.event === 'artifact_build_started').length, 1);
  assert.equal(logs.some(event => event.event === 'duplicate_skipped'), true);
});

test('artifact validation parses and persists one immutable byte capture per generated JSON file', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  let workspace = null;
  const artifactReads = new Map();
  const mutableFileSystem = new Proxy(fs, {
    get(target, property) {
      if (property !== 'readFile') return Reflect.get(target, property);
      return async (targetPath, ...args) => {
        const value = await fs.readFile(targetPath, ...args);
        const basename = path.basename(String(targetPath));
        if (workspace && path.dirname(String(targetPath)) === workspace &&
            ['grh-profile.json', 'grh-semantic.json'].includes(basename)) {
          const count = (artifactReads.get(basename) || 0) + 1;
          artifactReads.set(basename, count);
          if (count > 1) {
            const changed = JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : value);
            changed.swap_after_first_read = true;
            const encoded = JSON.stringify(changed);
            return Buffer.isBuffer(value) ? Buffer.from(encoded) : encoded;
          }
        }
        return value;
      };
    },
  });
  let inspectedProfile = null;
  const replay = createGrhPipelineReplay({
    ...deterministicRuntime({
      buildArtifacts: async ({ generatedAt, outputDirectory }) => {
        workspace = outputDirectory;
        return writeSafeArtifacts(outputDirectory, '2026-08-06', generatedAt);
      },
      inspectPublicationBundle: profile => {
        inspectedProfile = profile;
        return { ok: true, errors: [] };
      },
    }),
    fileSystem: mutableFileSystem,
  });

  const promoted = await replay(replayOptions(area, fixture));
  assert.equal(promoted.status, 'promoted');
  assert.deepEqual(Object.fromEntries(artifactReads), {
    'grh-profile.json': 1,
    'grh-semantic.json': 1,
  });
  assert.equal(inspectedProfile.safe_fixture, true);
  assert.equal(Object.hasOwn(inspectedProfile, 'swap_after_first_read'), false);
  const storedProfile = JSON.parse(await fs.readFile(
    path.join(path.dirname(promoted.receiptPath), 'grh-profile.json'),
    'utf8',
  ));
  assert.equal(storedProfile.safe_fixture, true);
  assert.equal(Object.hasOwn(storedProfile, 'swap_after_first_read'), false);
});

test('manifest validation and source identity happen before any artifact process starts', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  fixture.manifest.sha256 = 'f'.repeat(64);
  await fs.writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest), 'utf8');
  let builds = 0;
  const replay = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: async () => { builds += 1; },
  }));

  await assert.rejects(
    replay(replayOptions(area, fixture)),
    error => error instanceof GrhPipelineReplayError && error.code === 'GRH_PIPELINE_SOURCE_INVALID',
  );
  assert.equal(builds, 0);
  const failure = JSON.parse(await fs.readFile(path.join(area.stateDirectory, 'runs', 'test-run-1.json'), 'utf8'));
  assert.deepEqual(failure.deterministic.failure, {
    code: 'GRH_PIPELINE_SOURCE_INVALID',
    stage: 'manifest-validation',
  });
  assert.equal(failure.deterministic.sourceIdentity.sha256, 'f'.repeat(64));
});

test('snapshot dates require an ISO calendar roundtrip and reject normalized impossible dates', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area, { snapshot: '2026-02-31' });
  let builds = 0;
  const replay = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: async () => { builds += 1; },
  }));

  await assert.rejects(
    replay(replayOptions(area, fixture)),
    error => error instanceof GrhPipelineReplayError && error.code === 'GRH_PIPELINE_MANIFEST_INVALID',
  );
  assert.equal(builds, 0);
});

test('source mutation during extraction fails before contract validation or promotion', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  let inspections = 0;
  const replay = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: async ({ generatedAt, outputDirectory, sourcePath }) => {
      const outputs = await writeSafeArtifacts(outputDirectory, '2026-08-06', generatedAt);
      await fs.appendFile(sourcePath, 'changed after preflight');
      return outputs;
    },
    inspectPublicationBundle: () => { inspections += 1; return { ok: true, errors: [] }; },
  }));

  await assert.rejects(
    replay(replayOptions(area, fixture)),
    error => error instanceof GrhPipelineReplayError && error.code === 'GRH_PIPELINE_SOURCE_CHANGED',
  );
  assert.equal(inspections, 0);
  await assert.rejects(
    fs.access(path.join(area.stateDirectory, 'last-known-good.json')),
    error => error?.code === 'ENOENT',
  );
  assert.deepEqual(await fs.readdir(path.join(area.stateDirectory, 'versions')).catch(() => []), []);
});

test('immutable execution bundle isolates approved inputs and processors from mutable original paths', async t => {
  const area = await temporaryTestArea(t);
  const approvedBytes = Buffer.from('immutable source capture');
  const fixture = await canonicalFixture(area, { content: approvedBytes });
  const logs = [];
  let workspace = null;
  const replay = createGrhPipelineReplay(deterministicRuntime({
    logs,
    buildArtifacts: async options => {
      const {
        generatedAt,
        manifestPath,
        outputDirectory,
        processorRoot,
        sourcePath,
      } = options;
      workspace = outputDirectory;
      assert.equal(Object.values(options).includes(fixture.sourcePath), false);
      assert.equal(Object.values(options).includes(fixture.manifestPath), false);
      assert.equal(isWithin(outputDirectory, sourcePath), true);
      assert.equal(isWithin(outputDirectory, manifestPath), true);
      assert.equal(isWithin(outputDirectory, processorRoot), true);
      assert.deepEqual(await fs.readFile(sourcePath), approvedBytes);
      assert.deepEqual(
        JSON.parse(await fs.readFile(manifestPath, 'utf8')),
        fixture.manifest,
      );
      for (const script of ['profile_grh.py', 'build_grh_semantic.py', 'grh_source_manifest.py']) {
        assert.deepEqual(
          await fs.readFile(path.join(processorRoot, 'scripts', script)),
          await fs.readFile(path.join(repositoryRoot, 'scripts', script)),
        );
      }
      await fs.writeFile(fixture.sourcePath, Buffer.from('x'.repeat(approvedBytes.length)));
      assert.deepEqual(await fs.readFile(sourcePath), approvedBytes);
      return writeSafeArtifacts(outputDirectory, fixture.manifest.snapshot_as_of, generatedAt);
    },
  }));

  await assert.rejects(
    replay(replayOptions(area, fixture)),
    error => error instanceof GrhPipelineReplayError &&
      error.code === 'GRH_PIPELINE_SOURCE_CHANGED' && error.stage === 'source-revalidation',
  );
  assert.ok(workspace);
  await assert.rejects(fs.access(workspace), error => error?.code === 'ENOENT');
  await assert.rejects(
    fs.access(path.join(area.stateDirectory, 'last-known-good.json')),
    error => error?.code === 'ENOENT',
  );
  assert.deepEqual(await fs.readdir(path.join(area.stateDirectory, 'versions')).catch(() => []), []);
  const serializedEvidence = [
    JSON.stringify(logs),
    await fs.readFile(path.join(area.stateDirectory, 'runs', 'test-run-1.json'), 'utf8'),
  ].join('\n');
  for (const originalPath of [fixture.sourcePath, fixture.manifestPath]) {
    assert.equal(serializedEvidence.includes(originalPath), false);
  }
});

test('safe-open capture rejects a same-byte path swap between lstat and open before build', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area, { content: Buffer.from('same bytes, different file identity') });
  const displacedPath = `${fixture.sourcePath}.displaced`;
  let swapped = false;
  let builds = 0;
  const swappingFileSystem = new Proxy(fs, {
    get(target, property) {
      if (property !== 'open') return Reflect.get(target, property);
      return async (targetPath, ...args) => {
        if (!swapped && path.resolve(String(targetPath)) === path.resolve(fixture.sourcePath)) {
          swapped = true;
          const bytes = await fs.readFile(fixture.sourcePath);
          await fs.rename(fixture.sourcePath, displacedPath);
          await fs.writeFile(fixture.sourcePath, bytes);
        }
        return fs.open(targetPath, ...args);
      };
    },
  });
  const replay = createGrhPipelineReplay({
    ...deterministicRuntime({ buildArtifacts: async () => { builds += 1; } }),
    fileSystem: swappingFileSystem,
  });

  await assert.rejects(
    replay(replayOptions(area, fixture)),
    error => error instanceof GrhPipelineReplayError &&
      error.code === 'GRH_PIPELINE_SOURCE_INVALID' && error.stage === 'manifest-validation',
  );
  assert.equal(swapped, true);
  assert.equal(builds, 0);
  await assert.rejects(
    fs.access(path.join(area.stateDirectory, 'last-known-good.json')),
    error => error?.code === 'ENOENT',
  );
});

test('processor changes cannot alter the staged execution bundle or promote local state', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  const fakeRepository = path.join(area.directory, 'mutable-processor-repository');
  const fakeScripts = path.join(fakeRepository, 'scripts');
  await fs.mkdir(fakeScripts, { recursive: true });
  for (const script of ['profile_grh.py', 'build_grh_semantic.py', 'grh_source_manifest.py']) {
    await fs.copyFile(
      path.join(repositoryRoot, 'scripts', script),
      path.join(fakeScripts, script),
    );
  }
  const originalProfile = await fs.readFile(path.join(fakeScripts, 'profile_grh.py'));
  let inspections = 0;
  const replay = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: async ({ generatedAt, outputDirectory, processorRoot }) => {
      const stagedProfile = path.join(processorRoot, 'scripts', 'profile_grh.py');
      assert.deepEqual(await fs.readFile(stagedProfile), originalProfile);
      await fs.appendFile(path.join(fakeScripts, 'profile_grh.py'), '\n# changed after capture\n');
      assert.deepEqual(await fs.readFile(stagedProfile), originalProfile);
      return writeSafeArtifacts(outputDirectory, fixture.manifest.snapshot_as_of, generatedAt);
    },
    inspectPublicationBundle: () => { inspections += 1; return { ok: true, errors: [] }; },
  }));

  await assert.rejects(
    replay(replayOptions(area, fixture, { repositoryRoot: fakeRepository })),
    error => error instanceof GrhPipelineReplayError &&
      error.code === 'GRH_PIPELINE_PROCESSOR_CHANGED' && error.stage === 'processor-revalidation',
  );
  assert.equal(inspections, 0);
  await assert.rejects(
    fs.access(path.join(area.stateDirectory, 'last-known-good.json')),
    error => error?.code === 'ENOENT',
  );
  assert.deepEqual(await fs.readdir(path.join(area.stateDirectory, 'versions')).catch(() => []), []);
});

test('manifest mutation during extraction is detected before bundle inspection and promotion', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  let inspections = 0;
  const replay = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: async ({ generatedAt, manifestPath, outputDirectory }) => {
      const outputs = await writeSafeArtifacts(outputDirectory, '2026-08-06', generatedAt);
      assert.notEqual(manifestPath, fixture.manifestPath);
      const changed = JSON.parse(await fs.readFile(fixture.manifestPath, 'utf8'));
      changed.approval_basis = 'mutated after preflight';
      await fs.writeFile(fixture.manifestPath, JSON.stringify(changed), 'utf8');
      return outputs;
    },
    inspectPublicationBundle: () => { inspections += 1; return { ok: true, errors: [] }; },
  }));

  await assert.rejects(
    replay(replayOptions(area, fixture)),
    error => error instanceof GrhPipelineReplayError &&
      error.code === 'GRH_PIPELINE_MANIFEST_INVALID' && error.stage === 'manifest-revalidation',
  );
  assert.equal(inspections, 0);
  await assert.rejects(
    fs.access(path.join(area.stateDirectory, 'last-known-good.json')),
    error => error?.code === 'ENOENT',
  );
});

test('an extractor failure preserves the previous last-known-good and redacts error details', async t => {
  const area = await temporaryTestArea(t);
  const first = await canonicalFixture(area, { snapshot: '2026-08-06', content: Buffer.from('first source') });
  const second = await canonicalFixture(area, { snapshot: '2026-08-07', content: Buffer.from('second source') });
  const sensitiveDetail = 'Juan Perez DNI 12345678 DATABASE_URL=postgres://secret absolute=C:\\private\\raw.sql.gz';
  const logs = [];
  const replay = createGrhPipelineReplay(deterministicRuntime({
    logs,
    buildArtifacts: async ({ generatedAt, outputDirectory, sourceIdentity }) => {
      if (sourceIdentity.snapshotAsOf === second.manifest.snapshot_as_of) throw new Error(sensitiveDetail);
      return writeSafeArtifacts(outputDirectory, first.manifest.snapshot_as_of, generatedAt);
    },
  }));

  await replay(replayOptions(area, first));
  const lastKnownGoodPath = path.join(area.stateDirectory, 'last-known-good.json');
  const beforeFailure = await fs.readFile(lastKnownGoodPath, 'utf8');
  await assert.rejects(
    replay(replayOptions(area, second)),
    error => error instanceof GrhPipelineReplayError && error.code === 'GRH_PIPELINE_EXTRACTOR_FAILED',
  );
  assert.equal(await fs.readFile(lastKnownGoodPath, 'utf8'), beforeFailure);

  const failureReceipt = await fs.readFile(path.join(area.stateDirectory, 'runs', 'test-run-2.json'), 'utf8');
  assert.doesNotMatch(failureReceipt, /Juan|12345678|DATABASE_URL|postgres|private|raw\.sql/i);
  assert.doesNotMatch(JSON.stringify(logs), /Juan|12345678|DATABASE_URL|postgres|private|raw\.sql/i);
  assert.match(failureReceipt, /GRH_PIPELINE_EXTRACTOR_FAILED/);
  const failureEvidence = JSON.parse(failureReceipt);
  assert.equal(failureEvidence.deterministic.pipelineRun.state, 'FAILED');
  assert.equal(failureEvidence.deterministic.pipelineRun.failure.outcome, 'FAILED');
});

test('the source/snapshot lock excludes a concurrent replay before duplicate or build decisions', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  let builds = 0;
  let releaseBuilder;
  let announceBuilder;
  const enteredBuilder = new Promise(resolve => { announceBuilder = resolve; });
  const builderGate = new Promise(resolve => { releaseBuilder = resolve; });
  const replay = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: async ({ generatedAt, outputDirectory }) => {
      builds += 1;
      announceBuilder();
      await builderGate;
      return writeSafeArtifacts(outputDirectory, '2026-08-06', generatedAt);
    },
  }));

  const firstRun = replay(replayOptions(area, fixture));
  await enteredBuilder;
  await assert.rejects(
    replay(replayOptions(area, fixture)),
    error => error instanceof GrhPipelineReplayError && error.code === 'GRH_PIPELINE_LOCKED',
  );
  releaseBuilder();
  assert.equal((await firstRun).status, 'promoted');
  assert.equal(builds, 1);
});

test('the target-wide lock prevents two snapshots from planning against and replacing the same stale head', async t => {
  const area = await temporaryTestArea(t);
  const older = await canonicalFixture(area, { snapshot: '2026-08-06', content: Buffer.from('older concurrent source') });
  const newer = await canonicalFixture(area, { snapshot: '2026-08-07', content: Buffer.from('newer concurrent source') });
  let releaseBuilder;
  let announceBuilder;
  let builds = 0;
  const enteredBuilder = new Promise(resolve => { announceBuilder = resolve; });
  const builderGate = new Promise(resolve => { releaseBuilder = resolve; });
  const replay = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: async ({ generatedAt, outputDirectory, sourceIdentity }) => {
      builds += 1;
      if (sourceIdentity.snapshotAsOf === older.manifest.snapshot_as_of) {
        announceBuilder();
        await builderGate;
      }
      return writeSafeArtifacts(
        outputDirectory,
        sourceIdentity.snapshotAsOf,
        generatedAt,
      );
    },
  }));

  const firstRun = replay(replayOptions(area, older));
  await enteredBuilder;
  await assert.rejects(
    replay(replayOptions(area, newer)),
    error => error instanceof GrhPipelineReplayError && error.code === 'GRH_PIPELINE_LOCKED',
  );
  releaseBuilder();
  await firstRun;
  const promotedNewer = await replay(replayOptions(area, newer));
  assert.equal(promotedNewer.pipelineRun.state, 'PUBLISHED');
  assert.equal(promotedNewer.pipelineRun.source.snapshotAsOf, '2026-08-07');
  assert.equal(builds, 2);
});

test('a lock payload write failure removes only the lock created by that acquisition', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  let injected = false;
  const failingFileSystem = new Proxy(fs, {
    get(target, property) {
      if (property !== 'open') return Reflect.get(target, property);
      return async (targetPath, ...args) => {
        const handle = await fs.open(targetPath, ...args);
        if (injected || !String(targetPath).endsWith('.lock')) return handle;
        injected = true;
        return new Proxy(handle, {
          get(handleTarget, handleProperty) {
            if (handleProperty === 'writeFile') {
              return async () => {
                const error = new Error('simulated lock payload failure');
                error.code = 'EIO';
                throw error;
              };
            }
            const value = Reflect.get(handleTarget, handleProperty, handleTarget);
            return typeof value === 'function' ? value.bind(handleTarget) : value;
          },
        });
      };
    },
  });
  const replay = createGrhPipelineReplay({
    ...deterministicRuntime(),
    fileSystem: failingFileSystem,
  });

  await assert.rejects(
    replay(replayOptions(area, fixture)),
    error => error instanceof GrhPipelineReplayError &&
      error.code === 'GRH_PIPELINE_STATE_INVALID' && error.stage === 'lock',
  );
  assert.equal(injected, true);
  assert.deepEqual(await fs.readdir(path.join(area.stateDirectory, 'locks')), []);
});

test('a lock unlink failure is surfaced with safe evidence and leaves a fail-closed stale lock', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  const logs = [];
  let failedUnlink = false;
  const failingFileSystem = new Proxy(fs, {
    get(target, property) {
      if (property !== 'unlink') return Reflect.get(target, property);
      return async targetPath => {
        if (!failedUnlink && String(targetPath).endsWith('.lock')) {
          failedUnlink = true;
          const error = new Error('simulated stale lock');
          error.code = 'EPERM';
          throw error;
        }
        return fs.unlink(targetPath);
      };
    },
  });
  const replay = createGrhPipelineReplay({
    ...deterministicRuntime({ logs }),
    fileSystem: failingFileSystem,
  });

  await assert.rejects(
    replay(replayOptions(area, fixture)),
    error => error instanceof GrhPipelineReplayError &&
      error.code === 'GRH_PIPELINE_STATE_INVALID' && error.stage === 'lock-release',
  );
  assert.equal(failedUnlink, true);
  assert.equal(logs.some(event => event.event === 'lock_release_failed'), true);
  const remainingLocks = await fs.readdir(path.join(area.stateDirectory, 'locks'));
  assert.equal(remainingLocks.length, 1);
  const failureReceipt = await fs.readFile(
    path.join(area.stateDirectory, 'runs', 'test-run-1.json'),
    'utf8',
  );
  assert.match(failureReceipt, /"cleanupFailures":\["lock"\]/);
  assert.doesNotMatch(failureReceipt, new RegExp(area.directory.replaceAll('\\', '\\\\'), 'i'));
});

test('an invalid publication bundle leaves the active snapshot byte-for-byte unchanged', async t => {
  const area = await temporaryTestArea(t);
  const first = await canonicalFixture(area, { snapshot: '2026-08-06', content: Buffer.from('first governed source') });
  const second = await canonicalFixture(area, { snapshot: '2026-08-07', content: Buffer.from('second governed source') });
  const replay = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: async ({ generatedAt, outputDirectory, sourceIdentity }) => writeSafeArtifacts(
      outputDirectory,
      sourceIdentity.snapshotAsOf,
      generatedAt,
    ),
    inspectPublicationBundle: (_profile, semantic) => ({
      ok: semantic.source.snapshot_as_of === '2026-08-06',
      errors: ['fixture.contract'],
    }),
  }));

  const firstPromotion = await replay(replayOptions(area, first));
  const lastKnownGoodPath = path.join(area.stateDirectory, 'last-known-good.json');
  const beforeFailure = await fs.readFile(lastKnownGoodPath, 'utf8');
  await assert.rejects(
    replay(replayOptions(area, second)),
    error => error instanceof GrhPipelineReplayError && error.code === 'GRH_PIPELINE_ARTIFACT_INVALID',
  );
  assert.equal(await fs.readFile(lastKnownGoodPath, 'utf8'), beforeFailure);
  assert.deepEqual(
    await fs.readdir(path.join(area.stateDirectory, 'versions')),
    [path.basename(path.dirname(firstPromotion.receiptPath))],
  );
});

test('volatile timestamps are validated before exclusion from deterministic bundle identity', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  const replay = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: async ({ generatedAt, outputDirectory }) => {
      const outputs = await writeSafeArtifacts(outputDirectory, '2026-08-06', generatedAt);
      const semantic = JSON.parse(await fs.readFile(outputs.semanticOutput, 'utf8'));
      semantic.source.generated_at = 'not-a-canonical-timestamp Juan Perez DNI 12345678';
      await fs.writeFile(outputs.semanticOutput, JSON.stringify(semantic), 'utf8');
      return outputs;
    },
    inspectPublicationBundle: () => ({ ok: true, errors: [] }),
  }));

  await assert.rejects(
    replay(replayOptions(area, fixture)),
    error => error instanceof GrhPipelineReplayError && error.code === 'GRH_PIPELINE_ARTIFACT_INVALID',
  );
  await assert.rejects(
    fs.access(path.join(area.stateDirectory, 'last-known-good.json')),
    error => error?.code === 'ENOENT',
  );
  const receipt = await fs.readFile(path.join(area.stateDirectory, 'runs', 'test-run-1.json'), 'utf8');
  assert.doesNotMatch(receipt, /Juan|12345678/);
});

test('canonical artifact timestamps must equal the single run generation timestamp', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  const replay = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: async ({ generatedAt, outputDirectory }) => {
      const outputs = await writeSafeArtifacts(outputDirectory, '2026-08-06', generatedAt);
      const semantic = JSON.parse(await fs.readFile(outputs.semanticOutput, 'utf8'));
      semantic.source.generated_at = '2026-08-09T12:00:00.001Z';
      await fs.writeFile(outputs.semanticOutput, JSON.stringify(semantic), 'utf8');
      return outputs;
    },
    inspectPublicationBundle: () => ({ ok: true, errors: [] }),
  }));

  await assert.rejects(
    replay(replayOptions(area, fixture)),
    error => error instanceof GrhPipelineReplayError && error.code === 'GRH_PIPELINE_ARTIFACT_INVALID',
  );
});

test('duplicate detection revalidates stored artifact bytes and fails closed on tampering', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  let builds = 0;
  const replay = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: async ({ generatedAt, outputDirectory }) => {
      builds += 1;
      return writeSafeArtifacts(outputDirectory, '2026-08-06', generatedAt);
    },
  }));
  const first = await replay(replayOptions(area, fixture));
  const lastKnownGoodPath = path.join(area.stateDirectory, 'last-known-good.json');
  const lastKnownGood = await fs.readFile(lastKnownGoodPath, 'utf8');
  await fs.appendFile(path.join(path.dirname(first.receiptPath), 'grh-profile.json'), '\n');

  await assert.rejects(
    replay(replayOptions(area, fixture)),
    error => error instanceof GrhPipelineReplayError &&
      error.code === 'GRH_PIPELINE_DUPLICATE_STATE_INVALID' && error.stage === 'activation-ledger',
  );
  assert.equal(builds, 1);
  assert.equal(await fs.readFile(lastKnownGoodPath, 'utf8'), lastKnownGood);
});

test('duplicate replay blocks an artifact that changes between ledger and active-state captures', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  const firstReplay = createGrhPipelineReplay(deterministicRuntime());
  const promoted = await firstReplay(replayOptions(area, fixture));
  const versionDirectory = path.dirname(promoted.receiptPath);
  const pointerPath = path.join(area.stateDirectory, 'last-known-good.json');
  const pointerBefore = await fs.readFile(pointerPath, 'utf8');
  const reads = new Map();
  const changingFileSystem = new Proxy(fs, {
    get(target, property) {
      if (property !== 'readFile') return Reflect.get(target, property);
      return async (targetPath, ...args) => {
        const value = await fs.readFile(targetPath, ...args);
        const basename = path.basename(String(targetPath));
        if (path.dirname(String(targetPath)) === versionDirectory &&
            ['grh-profile.json', 'grh-semantic.json'].includes(basename)) {
          const count = (reads.get(basename) || 0) + 1;
          reads.set(basename, count);
          if (count === 2) {
            const changed = JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : value);
            changed.changed_between_validation_phases = true;
            const encoded = JSON.stringify(changed);
            return Buffer.isBuffer(value) ? Buffer.from(encoded) : encoded;
          }
        }
        return value;
      };
    },
  });
  const logs = [];
  const guardedReplay = createGrhPipelineReplay({
    ...deterministicRuntime({ logs }),
    fileSystem: changingFileSystem,
  });

  await assert.rejects(
    guardedReplay(replayOptions(area, fixture)),
    error => error instanceof GrhPipelineReplayError &&
      error.code === 'GRH_PIPELINE_STATE_INVALID' && error.stage === 'last-known-good-validation',
  );
  assert.deepEqual(Object.fromEntries(reads), {
    'grh-profile.json': 2,
    'grh-semantic.json': 2,
  });
  assert.equal(logs.some(event => event.event === 'duplicate_skipped'), false);
  assert.equal(await fs.readFile(pointerPath, 'utf8'), pointerBefore);
});

test('activation ledger recomputes canonical identity even if mutable raw-hash observations are rewritten', async t => {
  const area = await temporaryTestArea(t);
  const older = await canonicalFixture(area, {
    snapshot: '2026-08-06',
    content: Buffer.from('historical canonical identity source'),
  });
  const newer = await canonicalFixture(area, {
    snapshot: '2026-08-07',
    content: Buffer.from('current canonical identity source'),
  });
  const replay = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: async ({ generatedAt, outputDirectory, sourceIdentity }) => writeSafeArtifacts(
      outputDirectory,
      sourceIdentity.snapshotAsOf,
      generatedAt,
    ),
  }));
  const oldPublication = await replay(replayOptions(area, older));
  await replay(replayOptions(area, newer));
  const pointerPath = path.join(area.stateDirectory, 'last-known-good.json');
  const pointerBefore = await fs.readFile(pointerPath, 'utf8');
  const oldVersionDirectory = path.dirname(oldPublication.receiptPath);
  const profilePath = path.join(oldVersionDirectory, 'grh-profile.json');
  const receiptPath = path.join(oldVersionDirectory, 'receipt.json');
  const profile = JSON.parse(await fs.readFile(profilePath, 'utf8'));
  profile.historical_tamper = true;
  const tamperedBytes = Buffer.from(JSON.stringify(profile));
  await fs.writeFile(profilePath, tamperedBytes);
  const receipt = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
  receipt.observation.storedArtifacts.profileSha256 = sha256(tamperedBytes);
  await fs.writeFile(receiptPath, JSON.stringify(receipt), 'utf8');

  await assert.rejects(
    replay(replayOptions(area, newer)),
    error => error instanceof GrhPipelineReplayError &&
      error.code === 'GRH_PIPELINE_DUPLICATE_STATE_INVALID' && error.stage === 'activation-ledger',
  );
  assert.equal(await fs.readFile(pointerPath, 'utf8'), pointerBefore);
});

test('a changed approval manifest cannot reuse a version produced under different evidence', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  let builds = 0;
  const replay = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: async ({ generatedAt, outputDirectory }) => {
      builds += 1;
      return writeSafeArtifacts(outputDirectory, '2026-08-06', generatedAt);
    },
  }));
  await replay(replayOptions(area, fixture));
  const lastKnownGoodPath = path.join(area.stateDirectory, 'last-known-good.json');
  const previousPointer = await fs.readFile(lastKnownGoodPath, 'utf8');
  fixture.manifest.approval_basis = 'Una aprobación diferente no es evidencia equivalente.';
  await fs.writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest), 'utf8');

  await assert.rejects(
    replay(replayOptions(area, fixture)),
    error => error instanceof GrhPipelineReplayError &&
      error.code === 'GRH_PIPELINE_DUPLICATE_STATE_INVALID',
  );
  assert.equal(builds, 1);
  assert.equal(await fs.readFile(lastKnownGoodPath, 'utf8'), previousPointer);
});

test('same source under a changed governed processor identity builds a new version, never duplicate', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  let builds = 0;
  const firstRuntime = deterministicRuntime({
    buildArtifacts: async ({ generatedAt, outputDirectory }) => {
      builds += 1;
      return writeSafeArtifacts(outputDirectory, '2026-08-06', generatedAt);
    },
  });
  const firstReplay = createGrhPipelineReplay(firstRuntime);
  const first = await firstReplay(replayOptions(area, fixture));
  const changedProcessors = {
    ...firstRuntime.processorIdentity,
    publicationContractSha256: 'a'.repeat(64),
  };
  const secondReplay = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: async ({ generatedAt, outputDirectory }) => {
      builds += 1;
      return writeSafeArtifacts(outputDirectory, '2026-08-06', generatedAt);
    },
    clockStart: Date.UTC(2026, 7, 10, 23, 59, 59),
    processorIdentity: changedProcessors,
  }));

  const second = await secondReplay(replayOptions(area, fixture));
  assert.equal(first.status, 'promoted');
  assert.equal(second.status, 'promoted');
  assert.equal(builds, 2);
  assert.notEqual(path.dirname(first.receiptPath), path.dirname(second.receiptPath));
  assert.equal(second.pipelineRun.state, 'PUBLISHED');
  assert.notEqual(first.pipelineRun.idempotencyKey, second.pipelineRun.idempotencyKey);
  assert.equal(first.pipelineRun.publishedBundleDigest, second.pipelineRun.publishedBundleDigest);
  const [firstReceipt, secondReceipt] = await Promise.all([
    fs.readFile(first.receiptPath, 'utf8').then(JSON.parse),
    fs.readFile(second.receiptPath, 'utf8').then(JSON.parse),
  ]);
  assert.notEqual(firstReceipt.observation.storedArtifacts.profileSha256,
    secondReceipt.observation.storedArtifacts.profileSha256);
  assert.notEqual(firstReceipt.observation.storedArtifacts.semanticSha256,
    secondReceipt.observation.storedArtifacts.semanticSha256);

  const thirdProcessors = {
    ...changedProcessors,
    publicationAdapterSha256: 'e'.repeat(64),
  };
  const thirdReplay = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: async ({ generatedAt, outputDirectory }) => {
      builds += 1;
      const outputs = await writeSafeArtifacts(outputDirectory, '2026-08-06', generatedAt);
      const profile = JSON.parse(await fs.readFile(outputs.profileOutput, 'utf8'));
      profile.safe_fixture = 'substantive-change';
      await fs.writeFile(outputs.profileOutput, JSON.stringify(profile), 'utf8');
      return outputs;
    },
    clockStart: Date.UTC(2026, 7, 11, 12, 0, 0),
    processorIdentity: thirdProcessors,
  }));
  const third = await thirdReplay(replayOptions(area, fixture));
  assert.notEqual(second.pipelineRun.publishedBundleDigest, third.pipelineRun.publishedBundleDigest);

  await assert.rejects(
    firstReplay(replayOptions(area, fixture)),
    error => error instanceof GrhPipelineReplayError &&
      error.code === 'GRH_PIPELINE_DUPLICATE_STATE_INVALID',
  );
  assert.equal(builds, 3);
});

test('two empty local state roots rebuild the same canonical bundle despite different run clocks', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  const secondStateDirectory = path.join(area.directory, 'second-empty-state');
  await fs.mkdir(secondStateDirectory);
  const firstReplay = createGrhPipelineReplay(deterministicRuntime({
    clockStart: Date.UTC(2026, 7, 9, 12, 0, 0),
  }));
  const secondReplay = createGrhPipelineReplay(deterministicRuntime({
    clockStart: Date.UTC(2026, 7, 10, 12, 0, 0),
  }));

  const first = await firstReplay(replayOptions(area, fixture));
  const second = await secondReplay(replayOptions(area, fixture, { stateDirectory: secondStateDirectory }));
  const [firstReceipt, secondReceipt] = await Promise.all([
    fs.readFile(first.receiptPath, 'utf8').then(JSON.parse),
    fs.readFile(second.receiptPath, 'utf8').then(JSON.parse),
  ]);
  assert.equal(first.pipelineRun.publishedBundleDigest, second.pipelineRun.publishedBundleDigest);
  assert.deepEqual(firstReceipt.deterministic.artifactIdentity, secondReceipt.deterministic.artifactIdentity);
  assert.notEqual(
    firstReceipt.observation.storedArtifacts.profileSha256,
    secondReceipt.observation.storedArtifacts.profileSha256,
  );
  assert.notEqual(
    firstReceipt.observation.storedArtifacts.semanticSha256,
    secondReceipt.observation.storedArtifacts.semanticSha256,
  );
});

test('processor identity mutation during build is detected before validation or local promotion', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  let builds = 0;
  const runtime = deterministicRuntime({
    buildArtifacts: async ({ generatedAt, outputDirectory }) => {
      builds += 1;
      return writeSafeArtifacts(outputDirectory, '2026-08-06', generatedAt);
    },
  });
  const baseline = runtime.processorIdentity;
  const changed = { ...baseline, profileScriptSha256: 'c'.repeat(64) };
  let identityReads = 0;
  const replay = createGrhPipelineReplay({
    ...runtime,
    processorIdentity: null,
    processorIdentityProvider: async () => identityReads++ === 0 ? baseline : changed,
  });

  await assert.rejects(
    replay(replayOptions(area, fixture)),
    error => error instanceof GrhPipelineReplayError &&
      error.code === 'GRH_PIPELINE_PROCESSOR_CHANGED',
  );
  assert.equal(builds, 1);
  await assert.rejects(
    fs.access(path.join(area.stateDirectory, 'last-known-good.json')),
    error => error?.code === 'ENOENT',
  );
});

test('processor identity is rehashed immediately before duplicate classification', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  const firstRuntime = deterministicRuntime();
  const replay = createGrhPipelineReplay(firstRuntime);
  await replay(replayOptions(area, fixture));
  const lastKnownGoodPath = path.join(area.stateDirectory, 'last-known-good.json');
  const pointerBefore = await fs.readFile(lastKnownGoodPath);
  const baseline = firstRuntime.processorIdentity;
  const changed = { ...baseline, publicationAdapterSha256: 'd'.repeat(64) };
  let identityReads = 0;
  const guardedDuplicate = createGrhPipelineReplay({
    ...deterministicRuntime({
      buildArtifacts: async () => { throw new Error('duplicate path must not build'); },
    }),
    processorIdentity: null,
    processorIdentityProvider: async () => identityReads++ === 0 ? baseline : changed,
  });

  await assert.rejects(
    guardedDuplicate(replayOptions(area, fixture)),
    error => error instanceof GrhPipelineReplayError &&
      error.code === 'GRH_PIPELINE_PROCESSOR_CHANGED',
  );
  assert.equal(await fs.readFile(lastKnownGoodPath, 'utf8'), pointerBefore.toString('utf8'));
});

test('an intact orphan version cannot recreate a missing last-known-good pointer silently', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  let builds = 0;
  const replay = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: async ({ generatedAt, outputDirectory }) => {
      builds += 1;
      return writeSafeArtifacts(outputDirectory, '2026-08-06', generatedAt);
    },
  }));
  await replay(replayOptions(area, fixture));
  await fs.unlink(path.join(area.stateDirectory, 'last-known-good.json'));

  await assert.rejects(
    replay(replayOptions(area, fixture)),
    error => error instanceof GrhPipelineReplayError &&
      error.code === 'GRH_PIPELINE_DUPLICATE_STATE_INVALID',
  );
  assert.equal(builds, 1);
  await assert.rejects(
    fs.access(path.join(area.stateDirectory, 'last-known-good.json')),
    error => error?.code === 'ENOENT',
  );
  const blocked = JSON.parse(await fs.readFile(path.join(area.stateDirectory, 'runs', 'test-run-2.json'), 'utf8'));
  assert.equal(blocked.deterministic.disposition, 'blocked');
  assert.equal(blocked.deterministic.pipelineRun.state, 'BLOCKED');
});

test('last-known-good replacement rolls back and retry blocks an orphan instead of activating it', async t => {
  const area = await temporaryTestArea(t);
  const first = await canonicalFixture(area, { snapshot: '2026-08-06', content: Buffer.from('first swap source') });
  const second = await canonicalFixture(area, { snapshot: '2026-08-07', content: Buffer.from('second swap source') });
  let firstBuilds = 0;
  const firstReplay = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: async ({ generatedAt, outputDirectory }) => {
      firstBuilds += 1;
      return writeSafeArtifacts(outputDirectory, '2026-08-06', generatedAt);
    },
  }));
  await firstReplay(replayOptions(area, first));
  const lastKnownGoodPath = path.join(area.stateDirectory, 'last-known-good.json');
  const originalPointer = await fs.readFile(lastKnownGoodPath, 'utf8');

  let failedReplacements = 0;
  const failingFileSystem = new Proxy(fs, {
    get(target, property) {
      if (property !== 'rename') return Reflect.get(target, property);
      return async (source, destination) => {
        if (failedReplacements < 2 && destination === lastKnownGoodPath && String(source).endsWith('.tmp')) {
          failedReplacements += 1;
          const error = new Error('simulated Windows replacement failure');
          error.code = 'EPERM';
          throw error;
        }
        return fs.rename(source, destination);
      };
    },
  });
  let secondBuilds = 0;
  const failingReplay = createGrhPipelineReplay({
    ...deterministicRuntime({
      buildArtifacts: async ({ generatedAt, outputDirectory }) => {
        secondBuilds += 1;
        return writeSafeArtifacts(outputDirectory, '2026-08-07', generatedAt);
      },
    }),
    fileSystem: failingFileSystem,
  });
  await assert.rejects(
    failingReplay(replayOptions(area, second)),
    error => error instanceof GrhPipelineReplayError && error.code === 'GRH_PIPELINE_PROMOTION_FAILED',
  );
  assert.equal(await fs.readFile(lastKnownGoodPath, 'utf8'), originalPointer);
  assert.equal(failedReplacements, 2);

  const retry = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: async () => { throw new Error('must not rebuild an intact version'); },
  }));
  await assert.rejects(
    retry(replayOptions(area, second)),
    error => error instanceof GrhPipelineReplayError &&
      error.code === 'GRH_PIPELINE_DUPLICATE_STATE_INVALID',
  );
  assert.equal(secondBuilds, 1);
  assert.equal(firstBuilds, 1);
  const currentPointer = JSON.parse(await fs.readFile(lastKnownGoodPath, 'utf8'));
  assert.equal(currentPointer.deterministic.sourceIdentity.sha256, first.manifest.sha256);
  assert.deepEqual(
    (await fs.readdir(area.stateDirectory, { recursive: true })).filter(name => /\.(?:bak|tmp)$/.test(name)),
    [],
  );
});

test('a pre-existing pending junction is never treated as owned cleanup or allowed to delete a valid version', async t => {
  const area = await temporaryTestArea(t);
  const firstFixture = await canonicalFixture(area, {
    snapshot: '2026-08-06',
    content: Buffer.from('valid version protected from pending cleanup'),
  });
  const secondFixture = await canonicalFixture(area, {
    snapshot: '2026-08-07',
    content: Buffer.from('new version with hostile pending name'),
  });
  const firstReplay = createGrhPipelineReplay(deterministicRuntime());
  const first = await firstReplay(replayOptions(area, firstFixture));
  const validVersionDirectory = path.dirname(first.receiptPath);
  const receiptBefore = await fs.readFile(first.receiptPath);
  const pointerPath = path.join(area.stateDirectory, 'last-known-good.json');
  const pointerBefore = await fs.readFile(pointerPath);
  let injectedPendingPath = null;
  t.after(async () => {
    if (!injectedPendingPath) return;
    const metadata = await fs.lstat(injectedPendingPath).catch(() => null);
    if (metadata?.isSymbolicLink()) await fs.unlink(injectedPendingPath);
  });
  const hostileFileSystem = new Proxy(fs, {
    get(target, property) {
      if (property !== 'mkdir') return Reflect.get(target, property);
      return async (targetPath, ...args) => {
        if (!injectedPendingPath && path.basename(String(targetPath)).startsWith('.pending-')) {
          injectedPendingPath = String(targetPath);
          await fs.symlink(
            validVersionDirectory,
            injectedPendingPath,
            process.platform === 'win32' ? 'junction' : 'dir',
          );
        }
        return fs.mkdir(targetPath, ...args);
      };
    },
  });
  const hostileReplay = createGrhPipelineReplay({
    ...deterministicRuntime({
      buildArtifacts: async ({ generatedAt, outputDirectory }) => writeSafeArtifacts(
        outputDirectory,
        '2026-08-07',
        generatedAt,
      ),
    }),
    fileSystem: hostileFileSystem,
  });

  await assert.rejects(
    hostileReplay(replayOptions(area, secondFixture)),
    error => error instanceof GrhPipelineReplayError && error.code === 'GRH_PIPELINE_STATE_INVALID',
  );
  assert.ok(injectedPendingPath);
  assert.equal((await fs.lstat(injectedPendingPath)).isSymbolicLink(), true);
  assert.equal(await fs.readFile(first.receiptPath, 'utf8'), receiptBefore.toString('utf8'));
  assert.equal(await fs.readFile(pointerPath, 'utf8'), pointerBefore.toString('utf8'));
});

test('activation ledger blocks missing or rolled-back pointers when multiple valid versions exist', async t => {
  const area = await temporaryTestArea(t);
  const older = await canonicalFixture(area, { snapshot: '2026-08-06', content: Buffer.from('ledger older source') });
  const newer = await canonicalFixture(area, { snapshot: '2026-08-07', content: Buffer.from('ledger newer source') });
  let builds = 0;
  const replay = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: async ({ generatedAt, outputDirectory, sourceIdentity }) => {
      builds += 1;
      return writeSafeArtifacts(
        outputDirectory,
        sourceIdentity.snapshotAsOf,
        generatedAt,
      );
    },
  }));
  await replay(replayOptions(area, older));
  const lastKnownGoodPath = path.join(area.stateDirectory, 'last-known-good.json');
  const olderPointer = await fs.readFile(lastKnownGoodPath);
  await replay(replayOptions(area, newer));

  await fs.unlink(lastKnownGoodPath);
  await assert.rejects(
    replay(replayOptions(area, older)),
    error => error instanceof GrhPipelineReplayError &&
      error.code === 'GRH_PIPELINE_DUPLICATE_STATE_INVALID' && error.stage === 'activation-ledger',
  );
  assert.equal(builds, 2);

  await fs.writeFile(lastKnownGoodPath, olderPointer);
  await assert.rejects(
    replay(replayOptions(area, older)),
    error => error instanceof GrhPipelineReplayError &&
      error.code === 'GRH_PIPELINE_DUPLICATE_STATE_INVALID' && error.stage === 'activation-ledger',
  );
  assert.equal(builds, 2);
});

test('foundation planning blocks an older snapshot before build and preserves the local head', async t => {
  const area = await temporaryTestArea(t);
  const newer = await canonicalFixture(area, { snapshot: '2026-08-07', content: Buffer.from('planner newer source') });
  const older = await canonicalFixture(area, { snapshot: '2026-08-06', content: Buffer.from('planner older source') });
  let builds = 0;
  const replay = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: async ({ generatedAt, outputDirectory }) => {
      builds += 1;
      return writeSafeArtifacts(outputDirectory, '2026-08-07', generatedAt);
    },
  }));
  await replay(replayOptions(area, newer));
  const pointerPath = path.join(area.stateDirectory, 'last-known-good.json');
  const pointerBefore = await fs.readFile(pointerPath);

  await assert.rejects(
    replay(replayOptions(area, older)),
    error => error instanceof GrhPipelineReplayError && error.code === 'GRH_PIPELINE_ROLLBACK_BLOCKED',
  );
  assert.equal(builds, 1);
  assert.equal(await fs.readFile(pointerPath, 'utf8'), pointerBefore.toString('utf8'));
});

test('Python builders receive only explicit paths and a secret-free subprocess environment', async t => {
  const area = await temporaryTestArea(t);
  const processorRoot = path.join(area.directory, 'private-processor-bundle');
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalJwtSecret = process.env.JWT_SECRET;
  process.env.DATABASE_URL = 'postgres://must-not-reach-python';
  process.env.JWT_SECRET = 'must-not-reach-python';
  t.after(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });
  const calls = [];
  await runPythonArtifactBuilders({
    generatedAt: '2026-08-09T12:00:00.000Z',
    manifestPath: 'C:\\outside\\manifest.json',
    outputDirectory: 'C:\\outside\\outputs',
    processorRoot,
    pythonExecutable: 'python-test',
    repositoryRoot,
    runProcessImpl: async (command, args, options) => calls.push({ command, args, options }),
    sourcePath: 'C:\\outside\\grh.sql.gz',
  });

  assert.equal(calls.length, 2);
  assert.equal(calls.every(call => call.command === 'python-test'), true);
  assert.match(calls[0].args[0], /profile_grh\.py$/);
  assert.match(calls[1].args[0], /build_grh_semantic\.py$/);
  assert.equal(calls.every(call => isWithin(processorRoot, call.args[0])), true);
  assert.equal(calls.every(call => call.options.cwd === processorRoot), true);
  assert.equal(calls[0].args.includes('--manifest'), true);
  assert.equal(calls[0].args.includes('--out'), true);
  assert.equal(calls[0].args.includes('--generated-at'), true);
  assert.equal(calls[1].args.includes('--generated-at'), true);
  const profileGeneratedAt = calls[0].args[calls[0].args.indexOf('--generated-at') + 1];
  const semanticGeneratedAt = calls[1].args[calls[1].args.indexOf('--generated-at') + 1];
  assert.equal(profileGeneratedAt, '2026-08-09T12:00:00.000Z');
  assert.equal(semanticGeneratedAt, profileGeneratedAt);
  assert.equal(calls.every(call => !Object.hasOwn(call.options.env, 'DATABASE_URL')), true);
  assert.equal(calls.every(call => !Object.hasOwn(call.options.env, 'JWT_SECRET')), true);
  assert.equal(calls.every(call => call.options.env.PYTHONDONTWRITEBYTECODE === '1'), true);
  assert.equal(calls.every(call => call.options.timeoutMs === 20 * 60 * 1000), true);
});

test('real Python builders share one canonical timestamp on a governed synthetic dump', {
  timeout: 30_000,
}, async t => {
  const area = await temporaryTestArea(t);
  const sql = `CREATE TABLE \`legajo\` (\n` +
    `  \`CODI_01\` int,\n  \`LEGA_12\` int\n) ENGINE=InnoDB;\n` +
    `INSERT INTO \`legajo\` VALUES (1,100);\n` +
    `CREATE TABLE \`totpago\` (\n` +
    `  \`CODI_01\` int,\n  \`PERI_31\` int,\n  \`MES_31\` int,\n  \`FECA_31\` date,\n` +
    `  \`TIPO_31\` varchar(1),\n  \`THCA_65\` decimal(10,2),\n  \`THSA_65\` decimal(10,2),\n` +
    `  \`TRET_65\` decimal(10,2),\n  \`NETO_65\` decimal(10,2),\n  \`TAPO_65\` decimal(10,2),\n` +
    `  \`LEGA_65\` int,\n  \`TLEG_65\` int\n) ENGINE=InnoDB;\n` +
    `INSERT INTO \`totpago\` VALUES (1,2026,7,'2026-07-31','M',100,0,0,100,0,1,1);\n` +
    `CREATE TABLE \`calculo\` (\n` +
    `  \`CODI_01\` int,\n  \`PERI_31\` int,\n  \`MES_31\` int,\n  \`FECA_31\` date,\n` +
    `  \`TIPO_31\` varchar(1),\n  \`LEGA_12\` int,\n  \`CODI_27\` int,\n  \`IMPO_31\` decimal(10,2),\n` +
    `  \`CODI_02\` int,\n  \`CODI_06\` int,\n  \`CODI_07\` int\n) ENGINE=InnoDB;\n` +
    `INSERT INTO \`calculo\` VALUES (1,2026,7,'2026-07-31','M',100,998,100,1,1,1);\n`;
  const fixture = await canonicalFixture(area, { content: gzipSync(Buffer.from(sql, 'utf8')) });
  const outputDirectory = path.join(area.directory, 'real-builder-output');
  await fs.mkdir(outputDirectory, { recursive: true });
  const generatedAt = '2026-08-09T12:34:56.789Z';
  const outputs = await runPythonArtifactBuilders({
    generatedAt,
    manifestPath: fixture.manifestPath,
    outputDirectory,
    pythonExecutable: process.platform === 'win32' ? 'python' : 'python3',
    repositoryRoot,
    sourcePath: fixture.sourcePath,
    timeoutMs: 20_000,
  });
  const [profile, semantic] = await Promise.all([
    fs.readFile(outputs.profileOutput, 'utf8').then(JSON.parse),
    fs.readFile(outputs.semanticOutput, 'utf8').then(JSON.parse),
  ]);
  assert.equal(profile.generated_at, generatedAt);
  assert.equal(semantic.source.generated_at, generatedAt);
});

test('full replay executes the private processor bundle on a governed small synthetic dump', {
  timeout: 30_000,
}, async t => {
  const area = await temporaryTestArea(t);
  const sql = `CREATE TABLE \`legajo\` (\n` +
    `  \`CODI_01\` int,\n  \`LEGA_12\` int\n) ENGINE=InnoDB;\n` +
    `INSERT INTO \`legajo\` VALUES (1,100);\n` +
    `CREATE TABLE \`totpago\` (\n` +
    `  \`CODI_01\` int,\n  \`PERI_31\` int,\n  \`MES_31\` int,\n  \`FECA_31\` date,\n` +
    `  \`TIPO_31\` varchar(1),\n  \`THCA_65\` decimal(10,2),\n  \`THSA_65\` decimal(10,2),\n` +
    `  \`TRET_65\` decimal(10,2),\n  \`NETO_65\` decimal(10,2),\n  \`TAPO_65\` decimal(10,2),\n` +
    `  \`LEGA_65\` int,\n  \`TLEG_65\` int\n) ENGINE=InnoDB;\n` +
    `INSERT INTO \`totpago\` VALUES (1,2026,7,'2026-07-31','M',100,0,0,100,0,1,1);\n` +
    `CREATE TABLE \`calculo\` (\n` +
    `  \`CODI_01\` int,\n  \`PERI_31\` int,\n  \`MES_31\` int,\n  \`FECA_31\` date,\n` +
    `  \`TIPO_31\` varchar(1),\n  \`LEGA_12\` int,\n  \`CODI_27\` int,\n  \`IMPO_31\` decimal(10,2),\n` +
    `  \`CODI_02\` int,\n  \`CODI_06\` int,\n  \`CODI_07\` int\n) ENGINE=InnoDB;\n` +
    `INSERT INTO \`calculo\` VALUES (1,2026,7,'2026-07-31','M',100,998,100,1,1,1);\n`;
  const fixture = await canonicalFixture(area, { content: gzipSync(Buffer.from(sql, 'utf8')) });
  const replay = createGrhPipelineReplay(deterministicRuntime({
    buildArtifacts: runPythonArtifactBuilders,
  }));

  const result = await replay(replayOptions(area, fixture, {
    pythonExecutable: process.platform === 'win32' ? 'python' : 'python3',
  }));

  assert.equal(result.status, 'promoted');
  assert.equal(isWithin(repositoryRoot, result.receiptPath), false);
  const receipt = await fs.readFile(result.receiptPath, 'utf8');
  assert.equal(receipt.includes(fixture.sourcePath), false);
  assert.equal(receipt.includes(fixture.manifestPath), false);
  assert.deepEqual(await fs.readdir(area.tempRoot), []);
});

test('bounded subprocesses are force-terminated after their configured timeout', async () => {
  const started = Date.now();
  await assert.rejects(
    runBoundedProcess(process.execPath, ['-e', 'setTimeout(() => {}, 60_000)'], {
      cwd: repositoryRoot,
      env: { ...process.env },
      timeoutMs: 40,
    }),
    /timeout/,
  );
  assert.ok(Date.now() - started < 5_000);
});

test('cleanup failures emit only safe evidence and are recorded without filesystem paths', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  const logs = [];
  const failingFileSystem = new Proxy(fs, {
    get(target, property) {
      if (property !== 'rm') return Reflect.get(target, property);
      return async targetPath => {
        if (String(targetPath).includes('municontrol-grh-replay-')) {
          const error = new Error(`sensitive cleanup path ${targetPath}`);
          error.code = 'EPERM';
          throw error;
        }
        return fs.rm(targetPath, { recursive: true, force: false });
      };
    },
  });
  const replay = createGrhPipelineReplay({
    ...deterministicRuntime({
      logs,
      buildArtifacts: async () => { throw new Error('sensitive extractor detail'); },
    }),
    fileSystem: failingFileSystem,
  });

  await assert.rejects(
    replay(replayOptions(area, fixture)),
    error => error instanceof GrhPipelineReplayError && error.code === 'GRH_PIPELINE_EXTRACTOR_FAILED',
  );
  const failureReceipt = await fs.readFile(path.join(area.stateDirectory, 'runs', 'test-run-1.json'), 'utf8');
  assert.match(failureReceipt, /"cleanupFailures":\["workspace"\]/);
  assert.equal(logs.some(event => event.event === 'workspace_cleanup_failed'), true);
  assert.doesNotMatch(failureReceipt, new RegExp(area.directory.replaceAll('\\', '\\\\'), 'i'));
  assert.doesNotMatch(JSON.stringify(logs), new RegExp(area.directory.replaceAll('\\', '\\\\'), 'i'));
});

test('state and temporary roots inside the repository boundary fail closed', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  const fakeRepository = path.join(area.directory, 'fake-repository');
  const unsafeState = path.join(fakeRepository, 'state');
  await fs.mkdir(fakeRepository, { recursive: true });
  const replay = createGrhPipelineReplay(deterministicRuntime());

  await assert.rejects(
    replay(replayOptions(area, fixture, {
      repositoryRoot: fakeRepository,
      stateDirectory: unsafeState,
    })),
    error => error instanceof GrhPipelineReplayError &&
      error.code === 'GRH_PIPELINE_EXTERNAL_STATE_REQUIRED',
  );
  await assert.rejects(fs.access(unsafeState), error => error?.code === 'ENOENT');
});

test('state and temporary roots under synchronized OneDrive boundaries fail before creation', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  const synchronizedRoot = path.join(area.directory, 'synchronized-root');
  const unsafeState = path.join(synchronizedRoot, 'state');
  const unsafeTemp = path.join(synchronizedRoot, 'temp');
  await fs.mkdir(synchronizedRoot, { recursive: true });
  const replay = createGrhPipelineReplay({
    ...deterministicRuntime(),
    environment: { OneDrive: synchronizedRoot },
  });

  await assert.rejects(
    replay(replayOptions(area, fixture, { stateDirectory: unsafeState })),
    error => error instanceof GrhPipelineReplayError &&
      error.code === 'GRH_PIPELINE_EXTERNAL_STATE_REQUIRED',
  );
  await assert.rejects(fs.access(unsafeState), error => error?.code === 'ENOENT');

  await assert.rejects(
    replay(replayOptions(area, fixture, { tempRoot: unsafeTemp })),
    error => error instanceof GrhPipelineReplayError && error.code === 'GRH_PIPELINE_TEMP_ROOT_INVALID',
  );
  await assert.rejects(fs.access(unsafeTemp), error => error?.code === 'ENOENT');
});

test('fixed state containers reject junction or symlink redirection before writing through it', async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  const replay = createGrhPipelineReplay(deterministicRuntime());
  for (const containerName of ['activations', 'locks', 'runs', 'versions']) {
    const stateDirectory = path.join(area.directory, `state-${containerName}`);
    const redirectedTarget = path.join(area.directory, `redirected-${containerName}`);
    const redirectedContainer = path.join(stateDirectory, containerName);
    await Promise.all([
      fs.mkdir(stateDirectory, { recursive: true }),
      fs.mkdir(redirectedTarget, { recursive: true }),
    ]);
    try {
      await fs.symlink(
        redirectedTarget,
        redirectedContainer,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOSYS'].includes(error?.code)) {
        t.skip('This host does not permit a local directory link fixture.');
        return;
      }
      throw error;
    }
    await assert.rejects(
      replay(replayOptions(area, fixture, { stateDirectory })),
      error => error instanceof GrhPipelineReplayError &&
        error.code === 'GRH_PIPELINE_STATE_INVALID' && error.stage === 'state-containers',
    );
    assert.deepEqual(await fs.readdir(redirectedTarget), []);
    assert.deepEqual((await fs.readdir(stateDirectory)).sort(), [containerName]);
  }
});

test('state and temp refuse drive roots and Windows network or device namespaces before filesystem access', {
  skip: process.platform !== 'win32',
}, async t => {
  const area = await temporaryTestArea(t);
  const fixture = await canonicalFixture(area);
  const replay = createGrhPipelineReplay(deterministicRuntime());
  for (const unsafeState of [
    path.parse(area.stateDirectory).root,
    path.dirname(os.homedir()),
    process.env.WINDIR,
    path.join(path.parse(area.stateDirectory).root, 'unapproved-grh-state'),
    '\\\\server.invalid\\share\\grh-state',
    '\\\\?\\C:\\grh-state',
    '\\\\.\\C:\\grh-state',
  ]) {
    await assert.rejects(
      replay(replayOptions(area, fixture, { stateDirectory: unsafeState })),
      error => error instanceof GrhPipelineReplayError &&
        error.code === 'GRH_PIPELINE_EXTERNAL_STATE_REQUIRED',
    );
  }
  for (const unsafeTemp of [
    path.parse(area.tempRoot).root,
    '\\\\server.invalid\\share\\grh-temp',
    '\\\\?\\C:\\grh-temp',
    '\\\\.\\C:\\grh-temp',
  ]) {
    await assert.rejects(
      replay(replayOptions(area, fixture, { tempRoot: unsafeTemp })),
      error => error instanceof GrhPipelineReplayError && error.code === 'GRH_PIPELINE_TEMP_ROOT_INVALID',
    );
  }
});

test('runner has no network, database, scheduler or in-repository artifact publication surface', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'scripts', 'replay_grh_pipeline.mjs'), 'utf8');
  assert.doesNotMatch(source, /from ['"](?:pg|node:net|node:http|node:https|node:dns|node:tls)['"]/);
  assert.doesNotMatch(source, /\bfetch\s*\(|DATABASE_URL|setInterval\s*\(|node-cron|api[\\/]_data/);
  assert.doesNotMatch(source, /publishGrhArtifactBundle|INSERT\s+INTO|UPDATE\s+grh_/i);
  assert.match(source, /inspectPublicationBundle\(profile, semantic, manifest\)/);
  assert.match(source, /mkdtemp\(path\.join\(tempRoot/);
  for (const governedInput of [
    'grh-pipeline-foundation.cjs', 'profile_grh.py',
    'build_grh_semantic.py', 'grh_source_manifest.py', 'grh-contract.js',
    'grh-publication.js', '.python-version', '.nvmrc',
  ]) {
    assert.match(source, new RegExp(governedInput.replaceAll('.', '\\.')));
  }
  assert.match(source, /replayRunnerSha256:\s*await dependencies\.hashFile\(SCRIPT_PATH\)/);
  assert.match(source, /PYTHONDONTWRITEBYTECODE/);
});

test('CLI help is documentable, side-effect free and exits successfully', () => {
  const scriptPath = path.join(repositoryRoot, 'scripts', 'replay_grh_pipeline.mjs');
  const result = spawnSync(process.execPath, [scriptPath, '--help'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env },
    windowsHide: true,
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--source <backup\.sql\.gz>/);
  assert.match(result.stdout, /LOCAL_STATE/);
  assert.equal(result.stderr, '');
});

test('optional real replay smoke stays opt-in and never writes into the repository', {
  skip: process.env.GRH_PIPELINE_REAL_SMOKE !== 'true' || !process.env.GRH_PIPELINE_REAL_SOURCE,
  timeout: 10 * 60 * 1000,
}, async t => {
  const area = await temporaryTestArea(t);
  const replay = createGrhPipelineReplay();
  const result = await replay({
    manifestPath: path.join(repositoryRoot, 'config', 'grh-source-manifest.json'),
    repositoryRoot,
    sourcePath: process.env.GRH_PIPELINE_REAL_SOURCE,
    stateDirectory: area.stateDirectory,
    tempRoot: area.tempRoot,
  });
  assert.equal(result.status, 'promoted');
  assert.equal(isWithin(repositoryRoot, result.receiptPath), false);
});
