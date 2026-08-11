import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import {
  APPROVED_SNAPSHOT_KEY_FINGERPRINT_SHA256,
  ARTIFACT_SOURCE_ENV,
  BOOTSTRAP_CONTRACT,
  BOOTSTRAP_SECRET_ENV,
  SNAPSHOT_KEY_ENV,
  STABLE_PRODUCTION_URL,
  abortAmbiguousWorkforceFinanceBootstrap,
  applyWorkforceFinanceBootstrap,
  cleanupWorkforceFinanceBootstrap,
  prepareWorkforceFinanceBootstrap,
} from '../scripts/grh-workforce-finance-production-bootstrap-lib.mjs';
import { renderGrhWorkforceFinanceBootstrapFunction } from '../scripts/grh-workforce-finance-bootstrap-function-template.mjs';

const rootRepository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactSourcePath = path.join(rootRepository, 'api/_data/grh-workforce-finance.json');
const gitSha = 'f'.repeat(40);
const operationId = '11111111-1111-4111-8111-111111111111';
const entityId = '22222222-2222-4222-8222-222222222222';

function gitResult(args, { preparing = false } = {}) {
  if (args[0] === 'rev-parse') return { stdout: gitSha + '\n', stderr: '' };
  if (args[0] === 'branch') return { stdout: '', stderr: '' };
  if (args[0] === 'status') {
    return {
      stdout: preparing ? '' : `?? api/internal-grh-workforce-finance-bootstrap-${operationId}.js\n`,
      stderr: '',
    };
  }
  throw new Error(`unexpected git: ${args.join(' ')}`);
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'municontrol-workforce-bootstrap-'));
  const repositoryRoot = path.join(root, 'repository');
  const worktree = path.join(root, 'worktree');
  const stateDirectory = path.join(root, 'private-state');
  const artifactPath = path.join(root, 'approved-workforce.json');
  await fs.mkdir(repositoryRoot);
  for (const relative of [
    'api/lib/grh-workforce-finance-source-contract.js',
    'api/lib/grh-workforce-finance-snapshot.js',
    'api/lib/grh-workforce-finance-artifact.js',
    'api/lib/grh-workforce-finance-snapshot-publisher.js',
    'api/grh-workforce-finance.js',
    'shared/database-url-policy.cjs',
    'vercel.json',
  ]) {
    const target = path.join(worktree, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, relative.endsWith('.json') ? '{}\n' : '// fixture\n');
  }
  await fs.copyFile(artifactSourcePath, artifactPath);
  let uuidIndex = 0;
  const ids = [operationId, entityId];
  const prepared = await prepareWorkforceFinanceBootstrap({
    worktreePath: worktree,
    artifactPath,
    stateDirectory,
    repositoryRoot,
    runner: (command, args) => {
      assert.equal(command, 'git');
      return gitResult(args, { preparing: true });
    },
    securePathImpl: async () => {},
    randomUuidImpl: () => ids[uuidIndex++],
    randomBytesImpl: size => Buffer.alloc(size, 0xa7),
    now: () => new Date('2026-08-11T18:00:00.000Z'),
  });
  return {
    root, repositoryRoot, worktree, stateDirectory, artifactPath, prepared,
    async state() { return JSON.parse(await fs.readFile(prepared.statePath, 'utf8')); },
    async cleanup() { await fs.rm(root, { recursive: true, force: true }); },
  };
}

function protectedResult(body) {
  return {
    stdout: JSON.stringify(body) + `\n__MUNICTRL_WORKFORCE_BOOTSTRAP__201|${BOOTSTRAP_CONTRACT}`,
    stderr: '',
  };
}

function receipt(state, reused) {
  return {
    ok: true,
    code: 'GRH_WORKFORCE_FINANCE_BOOTSTRAP_APPLIED',
    releaseId: state.releaseId,
    sourceSha256: state.sourceSha256,
    snapshotAsOf: state.snapshotAsOf,
    artifactSha256: state.artifactSha256,
    envelopeSha256: 'a'.repeat(64),
    ciphertextSha256: 'b'.repeat(64),
    keyFingerprintSha256: APPROVED_SNAPSHOT_KEY_FINGERPRINT_SHA256,
    periodCount: state.periodCount,
    dimensionViewCount: state.dimensionViewCount,
    cellCount: 99,
    createdCount: reused ? 0 : 1,
    reusedCount: reused ? 1 : 0,
  };
}

test('template is a raw-body, candidate-only, fingerprint-pinned one-shot publisher', () => {
  const rendered = renderGrhWorkforceFinanceBootstrapFunction({
    operationId,
    entityId,
    artifactSha256: 'a'.repeat(64),
    keyFingerprintSha256: APPROVED_SNAPSHOT_KEY_FINGERPRINT_SHA256,
  });
  assert.match(rendered, /bodyParser: false/);
  assert.match(rendered, /VERCEL_URL/);
  assert.match(rendered, /VERCEL_ENV !== 'production'/);
  assert.match(rendered, /process\.env\.DIRECT_URL/);
  assert.match(rendered, /GRH_WORKFORCE_FINANCE_ARTIFACT_SOURCE !== 'encrypted_snapshot'/);
  assert.match(rendered, /publishGrhWorkforceFinanceSnapshot/);
  assert.match(rendered, /from '\.\/lib\/grh-workforce-finance-snapshot-publisher\.js'/);
  assert.doesNotMatch(rendered, /from '\.\.\/scripts\//);
  assert.match(rendered, /loadGrhWorkforceFinanceSnapshotArtifact/);
  assert.match(rendered, new RegExp(APPROVED_SNAPSHOT_KEY_FINGERPRINT_SHA256));
  assert.doesNotMatch(rendered, /DATABASE_URL\s*\|\|/);
  assert.doesNotMatch(rendered, /console\.(?:log|error)/);
});

test('prepare keeps artifact, payload and secret outside Git and emits only hashes/counts', async t => {
  const current = await fixture();
  t.after(() => current.cleanup());
  const state = await current.state();
  assert.equal(state.status, 'prepared');
  assert.ok(!state.payloadPath.startsWith(current.worktree));
  assert.ok(!state.secretPath.startsWith(current.worktree));
  assert.equal(state.keyFingerprintSha256, APPROVED_SNAPSHOT_KEY_FINGERPRINT_SHA256);
  assert.equal(state.periodCount, 24);
  assert.equal(state.dimensionViewCount, 3);
  const endpoint = await fs.readFile(state.endpointPath, 'utf8');
  const secret = await fs.readFile(state.secretPath, 'utf8');
  assert.ok(!endpoint.includes(secret));
  assert.ok(!endpoint.includes('period_totals'));
  const payload = JSON.parse(gunzipSync(await fs.readFile(state.payloadPath)));
  assert.equal(payload.operationId, operationId);
  assert.equal(payload.artifact.release_id, state.releaseId);
  assert.deepEqual(Object.keys(current.prepared).sort(), [
    'artifactFileSha256', 'artifactSha256', 'dimensionViewCount', 'entityId',
    'expectedGitSha', 'keyFingerprintSha256', 'operationId', 'payloadBytes',
    'periodCount', 'statePath',
  ]);
});

test('apply reuses existing runtime env, deploys skip-domain, verifies idempotent readback and cleanup', async t => {
  const current = await fixture();
  t.after(() => current.cleanup());
  const initial = await current.state();
  const calls = [];
  let curlCount = 0;
  const runner = (command, args, options = {}) => {
    calls.push({ command, args, input: options.input });
    if (command === 'git') return gitResult(args);
    assert.equal(command, 'vercel');
    if (args[0] === 'link') return { stdout: '', stderr: '' };
    if (args[0] === 'env' && args[1] === 'ls') {
      return { stdout: JSON.stringify([{ name: SNAPSHOT_KEY_ENV }, { name: ARTIFACT_SOURCE_ENV }]), stderr: '' };
    }
    if (args[0] === 'env' && args[1] === 'add') return { stdout: '', stderr: '' };
    if (args[0] === 'env' && args[1] === 'rm') return { stdout: '', stderr: '' };
    if (args[0] === 'deploy') {
      return { stdout: JSON.stringify({ id: 'dpl_candidate', url: 'workforce-candidate.vercel.app' }), stderr: '' };
    }
    if (args[0] === 'inspect' && args[1] === STABLE_PRODUCTION_URL) {
      return { stdout: JSON.stringify({ id: 'dpl_baseline', url: STABLE_PRODUCTION_URL, status: 'READY', target: 'production' }), stderr: '' };
    }
    if (args[0] === 'inspect') {
      return { stdout: JSON.stringify({ id: 'dpl_candidate', url: 'https://workforce-candidate.vercel.app', status: 'READY', target: 'production' }), stderr: '' };
    }
    if (args[0] === 'curl') return protectedResult(receipt(initial, curlCount++ > 0));
    if (args[0] === 'remove') return { stdout: '', stderr: '' };
    throw new Error(`unexpected vercel: ${args.join(' ')}`);
  };
  const applied = await applyWorkforceFinanceBootstrap({
    statePath: current.prepared.statePath,
    runner,
    securePathImpl: async () => {},
  });
  assert.equal(applied.status, 'verified');
  assert.equal(applied.stableAliasUnchanged, true);
  assert.equal(curlCount, 2);
  const deploy = calls.find(call => call.args[0] === 'deploy');
  assert.deepEqual(deploy.args, ['deploy', '--prod', '--skip-domain', '--yes', '--json']);
  const added = calls.filter(call => call.args[0] === 'env' && call.args[1] === 'add');
  assert.equal(added.length, 1);
  assert.equal(added[0].args[2], BOOTSTRAP_SECRET_ENV);
  assert.ok(typeof added[0].input === 'string' && added[0].input.length === 43);
  assert.ok(calls.every(call => !call.args.includes('--token')));
  assert.ok(calls.every(call => call.args[0] !== 'alias' && call.args[0] !== 'promote'));

  const cleaned = await cleanupWorkforceFinanceBootstrap({
    statePath: current.prepared.statePath,
    runner,
    securePathImpl: async () => {},
  });
  assert.equal(cleaned.status, 'cleaned');
  assert.equal(cleaned.snapshotKeyRetained, true);
  assert.equal(cleaned.artifactSourceRetained, true);
  const removedEnvs = calls.filter(call => call.args[0] === 'env' && call.args[1] === 'rm');
  assert.deepEqual(removedEnvs.map(call => call.args[2]), [BOOTSTRAP_SECRET_ENV]);
  assert.equal(await fs.stat(initial.endpointPath).then(() => true, () => false), false);
  assert.equal(await fs.stat(initial.payloadPath).then(() => true, () => false), false);
});

test('apply fails closed when the pre-existing key/source env contract is incomplete', async t => {
  const current = await fixture();
  t.after(() => current.cleanup());
  const runner = (command, args) => {
    if (command === 'git') return gitResult(args);
    if (args[0] === 'link') return { stdout: '', stderr: '' };
    if (args[0] === 'env' && args[1] === 'ls') {
      return { stdout: JSON.stringify([{ name: ARTIFACT_SOURCE_ENV }]), stderr: '' };
    }
    throw new Error(`unexpected call: ${command} ${args.join(' ')}`);
  };
  await assert.rejects(
    applyWorkforceFinanceBootstrap({
      statePath: current.prepared.statePath,
      runner,
      securePathImpl: async () => {},
    }),
    error => error.code === 'BOOTSTRAP_RUNTIME_ENV_INVALID',
  );
});

test('ambiguous abort removes only transient candidate material and makes no DB claim', async t => {
  const current = await fixture();
  t.after(() => current.cleanup());
  const state = await current.state();
  state.status = 'apply_ambiguous';
  state.deployment = {
    id: 'dpl_candidate',
    url: 'https://workforce-candidate.vercel.app',
    baselineAliasDeploymentId: 'dpl_baseline',
    skipDomain: true,
  };
  await fs.writeFile(current.prepared.statePath, JSON.stringify(state, null, 2) + '\n');
  const calls = [];
  const runner = (command, args) => {
    calls.push({ command, args });
    assert.equal(command, 'vercel');
    if (args[0] === 'inspect' && args[1] === STABLE_PRODUCTION_URL) {
      return { stdout: JSON.stringify({ id: 'dpl_baseline', status: 'READY', target: 'production' }), stderr: '' };
    }
    if (args[0] === 'inspect') {
      return { stdout: JSON.stringify({ id: 'dpl_candidate', status: 'READY', target: 'production' }), stderr: '' };
    }
    if (args[0] === 'env' && args[1] === 'rm') return { stdout: '', stderr: '' };
    if (args[0] === 'remove') return { stdout: '', stderr: '' };
    throw new Error(`unexpected vercel: ${args.join(' ')}`);
  };
  const result = await abortAmbiguousWorkforceFinanceBootstrap({
    statePath: current.prepared.statePath,
    runner,
    securePathImpl: async () => {},
  });
  assert.equal(result.status, 'aborted_ambiguous');
  assert.equal(result.publicationVerified, false);
  assert.equal(result.databaseMutationClaimed, false);
  assert.equal(result.snapshotKeyRetained, true);
  assert.equal(result.artifactSourceRetained, true);
  assert.deepEqual(
    calls.filter(call => call.args[0] === 'env').map(call => call.args[2]),
    [BOOTSTRAP_SECRET_ENV],
  );
});
