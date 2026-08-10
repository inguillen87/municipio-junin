import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import {
  EXPECTED_SOURCE_MANIFEST,
  STABLE_PRODUCTION_URL,
  applyPreparedBootstrap,
  cleanupVerifiedBootstrap,
  prepareBootstrapBundle,
  resolveBootstrapCommandInvocation,
  verifyAppliedBootstrap,
} from '../scripts/grh-directory-production-bootstrap-lib.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deterministicHash = '$2b$12$' + 'A'.repeat(53);
const uuids = Object.freeze([
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
]);

function artifactFixture() {
  return {
    schema_version: 'grh-directory-v1',
    source: {
      canonical_system: EXPECTED_SOURCE_MANIFEST.canonical_system,
      file: EXPECTED_SOURCE_MANIFEST.source_file,
      sha256: EXPECTED_SOURCE_MANIFEST.sha256,
      compressed_size_bytes: EXPECTED_SOURCE_MANIFEST.compressed_size_bytes,
      snapshot_as_of: EXPECTED_SOURCE_MANIFEST.snapshot_as_of,
      generated_at: '2026-08-10T18:00:00.000Z',
    },
    privacy: {
      contains_personal_data: true,
      private_storage_required: true,
      excluded_fields: ['dni', 'cuil', 'contact', 'address', 'bank_account', 'salary', 'event_cause'],
    },
    counts: {
      source_rows: {
        ausencia: 1,
        cargo: 1,
        catego: 1,
        convenio: 1,
        histolegajo: 1,
        legajo: 1,
        licencia: 1,
        organiza: 1,
        persona: 1,
        sectores: 1,
      },
      directory_records: 1,
      person_matches: 1,
      records_with_name: 1,
      records_without_name: 0,
      duplicate_person_links: 0,
      invalid_employee_key_rows: 0,
      valid_absence_events: 1,
      quarantined_absence_events: 0,
      valid_leave_events: 1,
      quarantined_leave_events: 0,
      valid_position_observation_rows: 1,
      blank_position_observation_rows: 0,
      quarantined_position_observation_rows: 0,
      future_effective_position_observation_rows: 1,
      records_with_position_observation: 1,
    },
    records: [{
      company_code: 101,
      legajo: 1001,
      display_name: 'Persona sintética',
      sector: { code: 7, label: 'Sector' },
      organization: { code: 5, label: 'Organización' },
      position: {
        code: 4,
        label: 'Cargo',
        parent: { code: 40, label: 'Secretaría' },
        depends_on: { code: 50, label: 'Municipio' },
      },
      category: { code: 3, label: 'Categoría' },
      agreement: { code: 2, label: 'Convenio' },
      absence: { event_count: 1, latest_date: '2026-07-01' },
      leave: { event_count: 1, latest_start_date: '2009-05-01', latest_end_date: '2009-05-10' },
      leave_history: [{ start_date: '2009-05-01', end_date: '2009-05-10', days: 10 }],
      position_observation: {
        label: 'Puesto observado',
        observed_date: '2026-08-31',
        observed_period: '2026-08',
        status: 'source_future_effective',
        source_table: 'histolegajo',
      },
    }],
  };
}

function responseFixture() {
  return {
    schemaVersion: 'grh-directory-v1',
    source: {
      canonicalSystem: EXPECTED_SOURCE_MANIFEST.canonical_system,
      sourceFile: EXPECTED_SOURCE_MANIFEST.source_file,
      sourceSha256: EXPECTED_SOURCE_MANIFEST.sha256,
      snapshotAsOf: EXPECTED_SOURCE_MANIFEST.snapshot_as_of,
    },
    privacy: {
      containsPersonalData: true,
      excludedFields: ['dni', 'cuil', 'contact', 'address', 'bank_account', 'salary', 'event_cause'],
    },
    query: {
      mode: 'list',
      page: 1,
      limit: 1,
      total: 1,
      hasNext: false,
      cursor: null,
      nextCursor: null,
    },
    facets: {
      sectors: [{ code: 7, label: 'Sector', count: 1 }],
      organizations: [{ code: 5, label: 'Organización', count: 1 }],
      positions: [{ code: 4, label: 'Cargo', count: 1 }],
      positionObservations: [{ label: 'Puesto observado', count: 1, status: 'source_future_effective' }],
      categories: [{ agreementCode: 2, code: 3, label: 'Categoría', count: 1 }],
      agreements: [{ code: 2, label: 'Convenio', count: 1 }],
    },
    items: [{
      companyCode: 101,
      legajo: 1001,
      displayName: 'Persona sintética',
      sector: { code: 7, label: 'Sector' },
      organization: { code: 5, label: 'Organización' },
      position: {
        code: 4,
        label: 'Cargo',
        parent: { code: 40, label: 'Secretaría' },
        dependsOn: { code: 50, label: 'Municipio' },
      },
      positionObservation: {
        label: 'Puesto observado',
        observedDate: '2026-08-31',
        observedPeriod: '2026-08',
        status: 'source_future_effective',
        sourceTable: 'histolegajo',
      },
      category: { code: 3, label: 'Categoría' },
      agreement: { code: 2, label: 'Convenio' },
      events: {
        absenceCount: 1,
        latestAbsenceDate: '2026-07-01',
        leaveCount: 1,
        latestLeaveStartDate: '2009-05-01',
        latestLeaveEndDate: '2009-05-10',
      },
    }],
  };
}

function nominalAiResponseFixture() {
  return {
    status: 'answered',
    engine: {
      id: 'grh-deterministic-v1',
      externalProvider: false,
      generated: false,
    },
    intent: 'person_lookup',
    answer: {
      directory: {
        status: 'matched',
        person: responseFixture().items[0],
      },
    },
    provenance: {
      sourceSha256: EXPECTED_SOURCE_MANIFEST.sha256,
      snapshotAsOf: EXPECTED_SOURCE_MANIFEST.snapshot_as_of,
    },
    dataStatus: {
      available: true,
      source: 'grh_directory_private_contract',
      snapshotAsOf: EXPECTED_SOURCE_MANIFEST.snapshot_as_of,
      historyUsed: true,
    },
  };
}

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'municontrol-grh-bootstrap-test-'));
  const worktree = path.join(root, 'worktree');
  const stateDirectory = path.join(root, 'private-state');
  const artifactPath = path.join(root, 'directory.json');
  for (const relative of [
    'api/lib/grh-directory-contract.js',
    'api/lib/grh-directory-publication.js',
    'shared/database-url-policy.cjs',
    'shared/published-demo-policy.cjs',
    'vercel.json',
  ]) {
    const target = path.join(worktree, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, relative.endsWith('.json') ? '{}\n' : '// fixture\n');
  }
  await fs.writeFile(artifactPath, JSON.stringify(artifactFixture()));
  let uuidIndex = 0;
  const secured = [];
  const prepared = await prepareBootstrapBundle({
    worktreePath: worktree,
    artifactPath,
    stateDirectory,
    repositoryRoot,
    now: () => new Date('2026-08-10T18:30:00.000Z'),
    randomUuidImpl: () => uuids[uuidIndex++],
    randomBytesImpl: size => Buffer.alloc(size, 0xab),
    bcryptHashImpl: async () => deterministicHash,
    securePathImpl: async (target, directory) => secured.push({ target, directory }),
  });
  return {
    root,
    worktree,
    stateDirectory,
    artifactPath,
    prepared,
    secured,
    async cleanup() {
      const resolved = path.resolve(root);
      assert.ok(resolved.startsWith(path.resolve(os.tmpdir())));
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

async function readState(statePath) {
  return JSON.parse(await fs.readFile(statePath, 'utf8'));
}

function jsonResult(value) {
  return { stdout: JSON.stringify(value), stderr: '' };
}

function response(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

test('prepare emits a private gzip envelope and a temporary endpoint pinned to the final DDL', async () => {
  const fixture = await makeFixture();
  try {
    const state = await readState(fixture.prepared.statePath);
    const [endpoint, payload, credential, secret] = await Promise.all([
      fs.readFile(state.endpointPath, 'utf8'),
      fs.readFile(state.payloadPath),
      readState(state.credentialPath),
      fs.readFile(state.secretPath, 'utf8'),
    ]);
    const envelope = JSON.parse(gunzipSync(payload).toString('utf8'));
    assert.equal(state.status, 'prepared');
    assert.equal(state.recordCount, 1);
    assert.equal(state.leaveRecordCount, 1);
    assert.equal(state.positionObservationCount, 1);
    assert.ok(state.payloadBytes < 4_000_000);
    assert.ok(state.uncompressedBytes < 16 * 1024 * 1024);
    assert.equal(envelope.operation.operationId, state.operationId);
    assert.deepEqual(envelope.manifest, EXPECTED_SOURCE_MANIFEST);
    assert.equal(envelope.pilot.role, 'CONTADOR');
    assert.equal(envelope.pilot.passwordHash, deterministicHash);
    assert.equal(credential.role, 'CONTADOR');
    assert.match(credential.email, /^piloto-grh-[a-f0-9]{12}@municontrol\.local$/);
    assert.ok(credential.password.length >= 14);
    assert.ok(secret.length >= 32);
    assert.match(endpoint, /position_observation_count/);
    assert.match(endpoint, /position_observation_label/);
    assert.match(endpoint, /export const config = \{ api: \{ bodyParser: false \} \};/);
    assert.match(endpoint, /headerValue\(req, 'content-type'\)\?\.toLowerCase\(\) !== 'application\/gzip'/);
    assert.match(endpoint, /transactionMode: 'external'/);
    assert.match(endpoint, /SET LOCAL statement_timeout = '25000ms'/);
    assert.match(endpoint, /GRH_DIRECTORY_BOOTSTRAP_V1/);
    assert.match(endpoint, /process\.env\.DIRECT_URL/);
    assert.doesNotMatch(endpoint, new RegExp(credential.password.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(endpoint, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(endpoint, new RegExp(credential.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(fixture.secured.some(entry => entry.directory));
    assert.ok(fixture.secured.filter(entry => !entry.directory).length >= 5);
    const syntax = spawnSync(process.execPath, ['--check', state.endpointPath], { encoding: 'utf8' });
    assert.equal(syntax.status, 0, syntax.stderr);
  } finally {
    await fixture.cleanup();
  }
});

test('prepare fails closed before writing when the compressed body exceeds the operational ceiling', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'municontrol-grh-bootstrap-limit-'));
  try {
    const worktree = path.join(root, 'worktree');
    const stateDirectory = path.join(root, 'state');
    const artifactPath = path.join(root, 'artifact.json');
    for (const relative of [
      'api/lib/grh-directory-contract.js', 'api/lib/grh-directory-publication.js',
      'shared/database-url-policy.cjs', 'shared/published-demo-policy.cjs', 'vercel.json',
    ]) {
      const target = path.join(worktree, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, relative.endsWith('.json') ? '{}' : '// fixture');
    }
    await fs.writeFile(artifactPath, JSON.stringify(artifactFixture()));
    let uuidIndex = 0;
    await assert.rejects(() => prepareBootstrapBundle({
      worktreePath: worktree,
      artifactPath,
      stateDirectory,
      repositoryRoot,
      randomUuidImpl: () => uuids[uuidIndex++],
      randomBytesImpl: size => Buffer.alloc(size, 0xcd),
      bcryptHashImpl: async () => deterministicHash,
      securePathImpl: async () => {},
      compressedLimit: 1,
    }), error => error.code === 'BOOTSTRAP_COMPRESSED_BODY_TOO_LARGE');
    await assert.rejects(fs.access(stateDirectory));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('apply uses a unique production deployment with skip-domain and leaves the stable alias untouched', async () => {
  const fixture = await makeFixture();
  try {
    const state = await readState(fixture.prepared.statePath);
    const calls = [];
    const runner = (command, args, options = {}) => {
      calls.push({ command, args: [...args], cwd: options.cwd, input: options.input });
      if (command === 'git') return { stdout: '?? ' + state.endpointRelativePath + '\n', stderr: '' };
      if (args[0] === 'link') return { stdout: '', stderr: '' };
      if (args[0] === 'env' && args[1] === 'ls') return jsonResult({ envs: [] });
      if (args[0] === 'env' && ['add', 'rm'].includes(args[1])) return { stdout: '', stderr: '' };
      if (args[0] === 'deploy') {
        return jsonResult({
          status: 'ok',
          deployment: { id: 'dpl_temp_unique', url: 'https://municipio-junin-private-123.vercel.app' },
        });
      }
      if (args[0] === 'inspect' && args[1] === STABLE_PRODUCTION_URL) {
        return jsonResult({ id: 'dpl_stable', url: STABLE_PRODUCTION_URL, status: 'READY', target: 'production' });
      }
      if (args[0] === 'inspect') {
        return jsonResult({
          id: 'dpl_temp_unique',
          url: 'https://municipio-junin-private-123.vercel.app',
          status: 'READY',
          target: 'production',
        });
      }
      assert.fail('unexpected command');
    };
    let bootstrapRequest;
    const fetchImpl = async (url, options) => {
      bootstrapRequest = { url, options };
      return response({
        ok: true,
        code: 'GRH_DIRECTORY_BOOTSTRAP_APPLIED',
        schemaVersion: 'grh-directory-v1',
        snapshotAsOf: state.snapshotAsOf,
        recordCount: state.recordCount,
        leaveRecordCount: state.leaveRecordCount,
        positionObservationCount: state.positionObservationCount,
      }, 201);
    };
    const result = await applyPreparedBootstrap({
      statePath: fixture.prepared.statePath,
      runner,
      fetchImpl,
      securePathImpl: async () => {},
    });
    assert.equal(result.status, 'applied');
    assert.equal(result.stableAliasUnchanged, true);
    const deploy = calls.find(call => call.args[0] === 'deploy');
    assert.ok(deploy.args.includes('--prod'));
    assert.ok(deploy.args.includes('--skip-domain'));
    assert.ok(deploy.args.includes('--json'));
    assert.equal(calls.some(call => call.args.includes('promote')), false);
    assert.ok(calls.some(call => call.args.join(' ').includes('link --yes --project municipio-junin --scope marcelos-projects-c26aa499')));
    assert.equal(bootstrapRequest.url, 'https://municipio-junin-private-123.vercel.app' + state.endpointRoute);
    assert.equal(bootstrapRequest.options.method, 'POST');
    assert.equal(bootstrapRequest.options.headers['Content-Type'], 'application/gzip');
    assert.equal(Buffer.isBuffer(bootstrapRequest.options.body), true);
    const envAdds = calls.filter(call => call.args[0] === 'env' && call.args[1] === 'add');
    assert.equal(envAdds.length, 2);
    assert.ok(envAdds.every(call => typeof call.input === 'string' && call.input.length > 0));
    const updated = await readState(fixture.prepared.statePath);
    assert.equal(updated.status, 'applied');
    assert.equal(updated.deployment.skipDomain, true);
    assert.equal(updated.deployment.baselineAliasDeploymentId, 'dpl_stable');
  } finally {
    await fixture.cleanup();
  }
});

test('apply refuses to overwrite a pre-existing allowlist or bootstrap secret', async () => {
  const fixture = await makeFixture();
  try {
    const state = await readState(fixture.prepared.statePath);
    const calls = [];
    const runner = (command, args) => {
      calls.push({ command, args: [...args] });
      if (command === 'git') return { stdout: '?? ' + state.endpointRelativePath + '\n', stderr: '' };
      if (args[0] === 'link') return { stdout: '', stderr: '' };
      if (args[0] === 'env' && args[1] === 'ls') {
        return jsonResult({ envs: [{ key: 'GRH_DIRECTORY_ALLOWED_USER_IDS' }] });
      }
      assert.fail('environment guard must stop execution');
    };
    await assert.rejects(() => applyPreparedBootstrap({
      statePath: fixture.prepared.statePath,
      runner,
      fetchImpl: async () => assert.fail('network must not run'),
      securePathImpl: async () => {},
    }), error => error.code === 'BOOTSTRAP_ENV_ALREADY_CONFIGURED');
    assert.equal(calls.some(call => call.args[0] === 'deploy'), false);
    assert.equal(calls.some(call => call.args[0] === 'env' && call.args[1] === 'add'), false);
  } finally {
    await fixture.cleanup();
  }
});

test('apply refuses a worktree containing anything beyond the generated endpoint', async () => {
  const fixture = await makeFixture();
  try {
    const runner = command => {
      if (command === 'git') return { stdout: ' M rrhh.html\n?? unexpected.txt\n', stderr: '' };
      assert.fail('Vercel must not run for a dirty worktree');
    };
    await assert.rejects(() => applyPreparedBootstrap({
      statePath: fixture.prepared.statePath,
      runner,
      fetchImpl: async () => assert.fail('network must not run'),
      securePathImpl: async () => {},
    }), error => error.code === 'BOOTSTRAP_WORKTREE_DIRTY');
  } finally {
    await fixture.cleanup();
  }
});

async function appliedFixture() {
  const fixture = await makeFixture();
  const state = await readState(fixture.prepared.statePath);
  const runner = (command, args) => {
    if (command === 'git') return { stdout: '?? ' + state.endpointRelativePath + '\n', stderr: '' };
    if (args[0] === 'link') return { stdout: '', stderr: '' };
    if (args[0] === 'env' && args[1] === 'ls') return jsonResult({ envs: [] });
    if (args[0] === 'env') return { stdout: '', stderr: '' };
    if (args[0] === 'deploy') return jsonResult({ id: 'dpl_temp_unique', url: 'https://municipio-junin-private-123.vercel.app' });
    if (args[0] === 'inspect' && args[1] === STABLE_PRODUCTION_URL) {
      return jsonResult({ id: 'dpl_stable', status: 'READY', target: 'production' });
    }
    if (args[0] === 'inspect') return jsonResult({ id: 'dpl_temp_unique', status: 'READY', target: 'production' });
    assert.fail('unexpected command');
  };
  await applyPreparedBootstrap({
    statePath: fixture.prepared.statePath,
    runner,
    fetchImpl: async () => response({
      ok: true,
      code: 'GRH_DIRECTORY_BOOTSTRAP_APPLIED',
      schemaVersion: 'grh-directory-v1',
      snapshotAsOf: state.snapshotAsOf,
      recordCount: 1,
      leaveRecordCount: 1,
      positionObservationCount: 1,
    }, 201),
    securePathImpl: async () => {},
  });
  return fixture;
}

test('verify keeps token and nominal rows in memory and emits only structural results', async () => {
  const fixture = await appliedFixture();
  try {
    const state = await readState(fixture.prepared.statePath);
    const credential = await readState(state.credentialPath);
    const fetched = [];
    const fetchImpl = async (url, options) => {
      fetched.push({ url, options });
      if (url.endsWith('/api/auth/login')) {
        return response({
          token: 't'.repeat(64),
          user: { id: credential.userId, role: 'CONTADOR', tenantId: 'tenant-junin' },
        });
      }
      if (url.endsWith('/api/ai-analyze')) return response(nominalAiResponseFixture());
      return response(responseFixture(), 200, { 'X-MuniControl-Contract': 'grh-directory-v1' });
    };
    const runner = (_command, args) => {
      if (args[0] === 'inspect' && args[1] === STABLE_PRODUCTION_URL) {
        return jsonResult({ id: 'dpl_stable', status: 'READY', target: 'production' });
      }
      if (args[0] === 'inspect') return jsonResult({ id: 'dpl_temp_unique', status: 'READY', target: 'production' });
      assert.fail('unexpected command');
    };
    const result = await verifyAppliedBootstrap({
      statePath: fixture.prepared.statePath,
      runner,
      fetchImpl,
      securePathImpl: async () => {},
    });
    assert.deepEqual(result, {
      status: 'verified',
      stableAliasUnchanged: true,
      schemaVersion: 'grh-directory-v1',
      snapshotAsOf: '2026-08-06',
      recordCount: 1,
      leaveAvailable: true,
      positionObservationAvailable: true,
      nominalAiVerified: true,
    });
    assert.equal(fetched.length, 4);
    assert.ok(fetched.some(call => call.url.endsWith('/api/grh-directory?limit=1&hasLeave=true')));
    const assistantCall = fetched.find(call => call.url.endsWith('/api/ai-analyze'));
    assert.equal(assistantCall.options.headers.Authorization, 'Bearer ' + 't'.repeat(64));
    assert.deepEqual(JSON.parse(assistantCall.options.body), { message: 'legajo 1001', mode: 'deterministic' });
    const persisted = await readState(fixture.prepared.statePath);
    assert.equal(persisted.status, 'verified');
    assert.equal(JSON.stringify(persisted).includes('Persona sintética'), false);
    assert.equal(JSON.stringify(persisted).includes('t'.repeat(64)), false);
    assert.equal(JSON.stringify(persisted).includes('legajo 1001'), false);
  } finally {
    await fixture.cleanup();
  }
});

test('verify fails closed when nominal AI is generated or loses the pinned provenance', async () => {
  const fixture = await appliedFixture();
  try {
    const state = await readState(fixture.prepared.statePath);
    const credential = await readState(state.credentialPath);
    const runner = (_command, args) => {
      if (args[0] === 'inspect' && args[1] === STABLE_PRODUCTION_URL) {
        return jsonResult({ id: 'dpl_stable', status: 'READY', target: 'production' });
      }
      if (args[0] === 'inspect') return jsonResult({ id: 'dpl_temp_unique', status: 'READY', target: 'production' });
      assert.fail('unexpected command');
    };
    await assert.rejects(() => verifyAppliedBootstrap({
      statePath: fixture.prepared.statePath,
      runner,
      fetchImpl: async url => {
        if (url.endsWith('/api/auth/login')) {
          return response({ token: 'z'.repeat(64), user: { id: credential.userId, role: 'CONTADOR', tenantId: 'tenant-junin' } });
        }
        if (url.endsWith('/api/ai-analyze')) {
          const unsafe = nominalAiResponseFixture();
          unsafe.engine.generated = true;
          unsafe.provenance.sourceSha256 = '0'.repeat(64);
          return response(unsafe);
        }
        return response(responseFixture(), 200, { 'X-MuniControl-Contract': 'grh-directory-v1' });
      },
      securePathImpl: async () => {},
    }), error => error.code === 'BOOTSTRAP_VERIFY_AI_FAILED');
    const persisted = await readState(fixture.prepared.statePath);
    assert.equal(persisted.status, 'applied');
    assert.equal(JSON.stringify(persisted).includes('z'.repeat(64)), false);
    assert.equal(JSON.stringify(persisted).includes('legajo 1001'), false);
  } finally {
    await fixture.cleanup();
  }
});

test('cleanup requires verification, removes the exact temporary deployment and retains the pilot credential', async () => {
  const fixture = await appliedFixture();
  try {
    await assert.rejects(() => cleanupVerifiedBootstrap({
      statePath: fixture.prepared.statePath,
      runner: () => assert.fail('cleanup must stop before Vercel'),
      securePathImpl: async () => {},
    }), error => error.code === 'BOOTSTRAP_CLEANUP_REQUIRES_VERIFICATION');

    const state = await readState(fixture.prepared.statePath);
    const credential = await readState(state.credentialPath);
    const verifyRunner = (_command, args) => {
      if (args[0] === 'inspect' && args[1] === STABLE_PRODUCTION_URL) return jsonResult({ id: 'dpl_stable', status: 'READY' });
      if (args[0] === 'inspect') return jsonResult({ id: 'dpl_temp_unique', status: 'READY', target: 'production' });
      assert.fail('unexpected command');
    };
    await verifyAppliedBootstrap({
      statePath: fixture.prepared.statePath,
      runner: verifyRunner,
      fetchImpl: async url => {
        if (url.endsWith('/api/auth/login')) {
          return response({ token: 'x'.repeat(64), user: { id: credential.userId, role: 'CONTADOR', tenantId: 'tenant-junin' } });
        }
        if (url.endsWith('/api/ai-analyze')) return response(nominalAiResponseFixture());
        return response(responseFixture(), 200, { 'X-MuniControl-Contract': 'grh-directory-v1' });
      },
      securePathImpl: async () => {},
    });

    const calls = [];
    const cleanupRunner = (_command, args) => {
      calls.push([...args]);
      if (args[0] === 'inspect') return jsonResult({ id: 'dpl_stable', status: 'READY' });
      return { stdout: '', stderr: '' };
    };
    const result = await cleanupVerifiedBootstrap({
      statePath: fixture.prepared.statePath,
      runner: cleanupRunner,
      securePathImpl: async () => {},
    });
    assert.equal(result.status, 'cleaned');
    assert.equal(result.allowlistRetained, true);
    assert.ok(calls.some(args => args.join(' ') === 'env rm GRH_DIRECTORY_BOOTSTRAP_SECRET production --yes'));
    assert.ok(calls.some(args => args.join(' ') === 'remove dpl_temp_unique --yes'));
    assert.equal(calls.some(args => args.includes('GRH_DIRECTORY_ALLOWED_USER_IDS') && args[1] === 'rm'), false);
    await fs.access(state.credentialPath);
    await assert.rejects(fs.access(state.endpointPath));
    await assert.rejects(fs.access(state.payloadPath));
    await assert.rejects(fs.access(state.secretPath));
    const cleaned = await readState(fixture.prepared.statePath);
    assert.equal(cleaned.status, 'cleaned');
  } finally {
    await fixture.cleanup();
  }
});

test('CLI help documents the skip-domain production workflow without executing external commands', () => {
  const result = spawnSync(process.execPath, ['scripts/grh-directory-production-bootstrap.mjs', '--help'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--skip-domain/);
  assert.match(result.stdout, /apply/);
  assert.match(result.stdout, /verify/);
  assert.match(result.stdout, /cleanup/);
  assert.doesNotMatch(result.stdout + result.stderr, /passwordHash|postgresql:\/\//i);
});

test('the production runner invokes the Vercel npm shim through cmd.exe on Windows', () => {
  const invocation = resolveBootstrapCommandInvocation('vercel', ['inspect', STABLE_PRODUCTION_URL, '--json']);
  if (process.platform === 'win32') {
    assert.equal(invocation.command, process.env.ComSpec || 'cmd.exe');
    assert.deepEqual(invocation.args, [
      '/d', '/s', '/c', 'vercel.cmd', 'inspect', STABLE_PRODUCTION_URL, '--json',
    ]);
    return;
  }
  assert.deepEqual(invocation, {
    command: 'vercel',
    args: ['inspect', STABLE_PRODUCTION_URL, '--json'],
  });
});
