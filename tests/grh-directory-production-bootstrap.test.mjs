import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import {
  BOOTSTRAP_INTERNAL_STAGES,
  bootstrapInternalDiagnostic,
  renderGrhDirectoryBootstrapFunction,
} from '../scripts/grh-directory-bootstrap-function-template.mjs';

import {
  GRH_DIRECTORY_SNAPSHOT_ACTION,
  GRH_DIRECTORY_SNAPSHOT_ENTITY,
  createGrhDirectorySnapshotEnvelope,
  decryptGrhDirectorySnapshotEnvelope,
} from '../api/lib/grh-directory-snapshot.js';

import {
  EXPECTED_SOURCE_MANIFEST,
  STABLE_PRODUCTION_URL,
  applyPreparedBootstrap,
  cleanupVerifiedBootstrap,
  finalizeProductionBootstrap,
  prepareBootstrapBundle,
  resolveAmbiguousBootstrap,
  resolveBootstrapCommandInvocation,
  verifyAppliedBootstrap,
  verifyProductionBootstrap,
} from '../scripts/grh-directory-production-bootstrap-lib.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deterministicHash = '$2b$12$' + 'A'.repeat(53);
const expectedGitSha = 'f'.repeat(40);
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

async function makeFixture({ mode = 'encrypted_snapshot' } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'municontrol-grh-bootstrap-test-'));
  const worktree = path.join(root, 'worktree');
  const stateDirectory = path.join(root, 'private-state');
  const artifactPath = path.join(root, 'directory.json');
  for (const relative of [
    'api/lib/grh-directory-contract.js',
    'api/lib/grh-directory-publication.js',
    'api/lib/grh-directory-snapshot.js',
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
    mode,
    worktreePath: worktree,
    artifactPath,
    stateDirectory,
    repositoryRoot,
    now: () => new Date('2026-08-10T18:30:00.000Z'),
    randomUuidImpl: () => uuids[uuidIndex++],
    randomBytesImpl: size => Buffer.alloc(size, 0xab),
    bcryptHashImpl: async () => deterministicHash,
    securePathImpl: async (target, directory) => secured.push({ target, directory }),
    runner: (command, args, options) => {
      assert.equal(command, 'git');
      return pinnedGitCommand(args, options, { preparing: true });
    },
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

function protectedCurlResult(body, status = 200, contract = '') {
  return {
    stdout: JSON.stringify(body) + `\n__MUNICTRL_RECEIPT__${status}|${contract}`,
    stderr: '',
  };
}

function pinnedGitCommand(args, options = {}, { state = null, preparing = false } = {}) {
  if (args[0] === 'rev-parse' && args[1] === '--verify') {
    return { stdout: expectedGitSha + '\n', stderr: '' };
  }
  if (args[0] === 'branch' && args[1] === '--show-current') {
    return { stdout: '', stderr: '' };
  }
  if (args[0] === 'status') {
    const worktreeStatus = preparing ? '' : '?? ' + state.endpointRelativePath + '\n';
    return { stdout: worktreeStatus, stderr: '' };
  }
  assert.fail(`unexpected git command in ${options.cwd || 'unknown cwd'}: ${args.join(' ')}`);
}

function bootstrapAppliedBody(state) {
  return {
    ok: true,
    code: 'GRH_DIRECTORY_BOOTSTRAP_APPLIED',
    schemaVersion: 'grh-directory-v1',
    snapshotAsOf: state.snapshotAsOf,
    recordCount: state.recordCount,
    leaveRecordCount: state.leaveRecordCount,
    positionObservationCount: state.positionObservationCount,
  };
}

test('prepare emits a private gzip envelope, snapshot key, and explicit encrypted-snapshot endpoint', async () => {
  const fixture = await makeFixture();
  try {
    const state = await readState(fixture.prepared.statePath);
    const [endpoint, payload, credential, secret, snapshotKey] = await Promise.all([
      fs.readFile(state.endpointPath, 'utf8'),
      fs.readFile(state.payloadPath),
      readState(state.credentialPath),
      fs.readFile(state.secretPath, 'utf8'),
      fs.readFile(state.snapshotKeyPath, 'utf8'),
    ]);
    const envelope = JSON.parse(gunzipSync(payload).toString('utf8'));
    assert.equal(state.status, 'prepared');
    assert.equal(state.mode, 'encrypted_snapshot');
    assert.equal(state.expectedGitSha, expectedGitSha);
    assert.equal(state.snapshotKeyVersion, 'v1');
    assert.equal(state.snapshotKeyFingerprintSha256.length, 64);
    assert.equal(state.recordCount, 1);
    assert.equal(state.leaveRecordCount, 1);
    assert.equal(state.positionObservationCount, 1);
    assert.ok(state.payloadBytes < 4_000_000);
    assert.ok(state.uncompressedBytes < 16 * 1024 * 1024);
    assert.equal(envelope.operation.operationId, state.operationId);
    assert.deepEqual(envelope.manifest, EXPECTED_SOURCE_MANIFEST);
    assert.equal(envelope.pilot.role, 'INTENDENTE');
    assert.equal(envelope.pilot.passwordHash, deterministicHash);
    assert.equal(credential.role, 'INTENDENTE');
    assert.match(credential.email, /^piloto-grh-[a-f0-9]{12}@municontrol\.local$/);
    assert.ok(credential.password.length >= 14);
    assert.ok(secret.length >= 32);
    assert.match(snapshotKey, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(snapshotKey, 'base64url').length, 32);
    assert.match(endpoint, /position_observation_count/);
    assert.match(endpoint, /position_observation_label/);
    assert.match(endpoint, /export const config = \{ api: \{ bodyParser: false \} \};/);
    assert.match(endpoint, /headerValue\(req, 'content-type'\)\?\.toLowerCase\(\) !== 'application\/gzip'/);
    assert.match(endpoint, /const BOOTSTRAP_MODE = "encrypted_snapshot"/);
    assert.match(endpoint, /createGrhDirectorySnapshotEnvelope/);
    assert.match(endpoint, /GRH_DIRECTORY_SNAPSHOT_ACTION/);
    assert.match(endpoint, /GRH_DIRECTORY_SNAPSHOT_ENTITY/);
    assert.match(endpoint, /snapshotKey\.decoded\.fill\(0\)/);
    assert.match(endpoint, /if \(BOOTSTRAP_MODE === 'ddl'\) \{\s+stage = 'schema_privilege'/);
    assert.match(endpoint, /if \(BOOTSTRAP_MODE === 'ddl'\) \{\s+stage = 'migration'/);
    assert.match(endpoint, /if \(BOOTSTRAP_MODE === 'encrypted_snapshot'\) \{\s+stage = 'snapshot_encrypt'/);
    assert.equal((endpoint.match(/INSERT INTO audit_logs/g) || []).length, 2);
    assert.doesNotMatch(endpoint, /(?:UPDATE|DELETE FROM) audit_logs/i);
    assert.match(endpoint, /SET LOCAL statement_timeout = '25000ms'/);
    assert.match(endpoint, /GRH_DIRECTORY_BOOTSTRAP_V1/);
    assert.match(endpoint, /process\.env\.DIRECT_URL/);
    assert.match(endpoint, /has_schema_privilege\(current_user, 'public', 'CREATE'\)/);
    assert.match(endpoint, /has_table_privilege\(current_user, 'public\.tenants', 'REFERENCES'\)/);
    for (const stage of BOOTSTRAP_INTERNAL_STAGES) assert.ok(endpoint.includes(`'${stage}'`));
    assert.match(endpoint, /BOOTSTRAP_INTERNAL_\$\{safeStage\.toUpperCase\(\)\}/);
    assert.match(endpoint, /\^\[0-9A-Z\]\{5\}\$/);
    assert.doesNotMatch(endpoint, /error\.(?:message|detail|query|sql)/);
    assert.doesNotMatch(endpoint, /__BOOTSTRAP_INTERNAL_DIAGNOSTIC__/);
    assert.doesNotMatch(endpoint, new RegExp(credential.password.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(endpoint, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(endpoint, new RegExp(snapshotKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(endpoint, new RegExp(credential.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(fixture.secured.some(entry => entry.directory));
    assert.ok(fixture.secured.some(entry =>
      entry.target === state.snapshotKeyPath && entry.directory === false));
    assert.ok(fixture.secured.filter(entry => !entry.directory).length >= 6);
    const syntax = spawnSync(process.execPath, ['--check', state.endpointPath], { encoding: 'utf8' });
    assert.equal(syntax.status, 0, syntax.stderr);
  } finally {
    await fixture.cleanup();
  }
});

test('internal stage diagnostics expose only a stable stage code and an allowlisted PostgreSQL code', () => {
  const secret = 'postgresql://private-user:private-password@example.invalid/database';
  const publication = bootstrapInternalDiagnostic('publication', {
    code: 'XX000',
    message: secret,
    detail: 'INSERT INTO people ...',
    query: 'SELECT private_name FROM employees',
  });
  assert.deepEqual(publication, {
    code: 'BOOTSTRAP_INTERNAL_PUBLICATION',
    pgCode: 'XX000',
  });
  assert.deepEqual(Object.keys(publication).sort(), ['code', 'pgCode']);
  assert.equal(JSON.stringify(publication).includes(secret), false);

  const migration = bootstrapInternalDiagnostic('migration', {
    code: 'not-a-pg-code',
    message: 'syntax failure containing private SQL',
  });
  assert.deepEqual(migration, { code: 'BOOTSTRAP_INTERNAL_MIGRATION' });
  assert.deepEqual(bootstrapInternalDiagnostic('not-a-stage', { code: '42601' }), {
    code: 'BOOTSTRAP_INTERNAL_CONFIGURATION',
    pgCode: '42601',
  });
});

test('encrypted snapshot publication contract is exact and decrypts with the runtime reader', () => {
  const artifact = artifactFixture();
  const key = Buffer.alloc(32, 0x5a).toString('base64url');
  const envelope = createGrhDirectorySnapshotEnvelope({
    tenantId: 'tenant-junin',
    artifact,
    key,
    nonce: Buffer.alloc(12, 0x31),
  });
  assert.equal(GRH_DIRECTORY_SNAPSHOT_ACTION, 'GRH_DIRECTORY_SNAPSHOT_PAYLOAD_V1');
  assert.equal(GRH_DIRECTORY_SNAPSHOT_ENTITY, 'GRH_DIRECTORY_SNAPSHOT');
  assert.deepEqual(Object.keys(envelope), [
    'kind', 'schemaVersion', 'keyVersion', 'compression', 'cipher',
    'sourceSha256', 'snapshotAsOf', 'recordCount', 'leaveRecordCount',
    'positionObservationCount', 'nonce', 'ciphertext', 'authTag', 'aad',
  ]);
  assert.equal(envelope.kind, 'grh.directory.snapshot.v1');
  assert.deepEqual(Object.keys(envelope.aad), [
    'tenantId', 'schemaVersion', 'sourceSha256', 'snapshotAsOf', 'keyVersion', 'compression',
  ]);
  assert.equal(JSON.stringify(envelope).includes(artifact.records[0].display_name), false);
  assert.deepEqual(
    decryptGrhDirectorySnapshotEnvelope({ tenantId: 'tenant-junin', envelope, key }),
    artifact,
  );
});

test('the endpoint renderer preserves PostgreSQL end anchors without expanding replacement tokens', () => {
  const migrationSql = "CHECK (source_sha256 ~ '^[0-9a-f]{64}$');";
  const endpoint = renderGrhDirectoryBootstrapFunction({
    mode: 'ddl',
    operationId: uuids[0],
    migrationSql,
    migrationSha256: 'a'.repeat(64),
    manifest: { schema_version: 'fixture' },
    manifestSha256: 'b'.repeat(64),
  });
  assert.ok(endpoint.includes(`const MIGRATION_SQL = ${JSON.stringify(migrationSql)};`));
  assert.equal((endpoint.match(/export default async function handler/g) || []).length, 1);
  assert.doesNotMatch(endpoint, /__MIGRATION_SQL__/);
});

test('prepare fails closed before writing when the compressed body exceeds the operational ceiling', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'municontrol-grh-bootstrap-limit-'));
  try {
    const worktree = path.join(root, 'worktree');
    const stateDirectory = path.join(root, 'state');
    const artifactPath = path.join(root, 'artifact.json');
    for (const relative of [
      'api/lib/grh-directory-contract.js', 'api/lib/grh-directory-publication.js',
      'api/lib/grh-directory-snapshot.js',
      'shared/database-url-policy.cjs', 'shared/published-demo-policy.cjs', 'vercel.json',
    ]) {
      const target = path.join(worktree, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, relative.endsWith('.json') ? '{}' : '// fixture');
    }
    await fs.writeFile(artifactPath, JSON.stringify(artifactFixture()));
    let uuidIndex = 0;
    await assert.rejects(() => prepareBootstrapBundle({
      mode: 'encrypted_snapshot',
      worktreePath: worktree,
      artifactPath,
      stateDirectory,
      repositoryRoot,
      randomUuidImpl: () => uuids[uuidIndex++],
      randomBytesImpl: size => Buffer.alloc(size, 0xcd),
      bcryptHashImpl: async () => deterministicHash,
      securePathImpl: async () => {},
      runner: (command, args, options) => {
        assert.equal(command, 'git');
        return pinnedGitCommand(args, options, { preparing: true });
      },
      compressedLimit: 1,
    }), error => error.code === 'BOOTSTRAP_COMPRESSED_BODY_TOO_LARGE');
    await assert.rejects(fs.access(stateDirectory));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('prepare requires an explicit publication mode', async () => {
  await assert.rejects(
    () => prepareBootstrapBundle({}),
    error => error.code === 'BOOTSTRAP_MODE_REQUIRED',
  );
});

test('explicit ddl mode remains available without generating or requiring a snapshot key', async () => {
  const fixture = await makeFixture({ mode: 'ddl' });
  try {
    const state = await readState(fixture.prepared.statePath);
    const endpoint = await fs.readFile(state.endpointPath, 'utf8');
    assert.equal(state.mode, 'ddl');
    assert.equal(state.snapshotKeyPath, null);
    assert.equal(state.snapshotKeyVersion, null);
    assert.match(endpoint, /const BOOTSTRAP_MODE = "ddl"/);
    assert.match(endpoint, /await client\.query\(MIGRATION_SQL\)/);
  } finally {
    await fixture.cleanup();
  }
});

test('apply uses a unique production deployment with skip-domain and leaves the stable alias untouched', async () => {
  const fixture = await makeFixture();
  try {
    const state = await readState(fixture.prepared.statePath);
    const secret = await fs.readFile(state.secretPath, 'utf8');
    const calls = [];
    let protectedConfigSeen = false;
    const runner = (command, args, options = {}) => {
      calls.push({ command, args: [...args], cwd: options.cwd, hasInput: typeof options.input === 'string' });
      if (command === 'git') return pinnedGitCommand(args, options, { state });
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
      if (args[0] === 'curl') {
        protectedConfigSeen = true;
        assert.deepEqual(args, [
          'curl', state.endpointRoute, '--deployment', 'https://municipio-junin-private-123.vercel.app',
          '--yes', '--', '--config', '-',
        ]);
        assert.match(options.input, /header = "X-GRH-Bootstrap-Secret: /);
        assert.ok(options.input.includes(secret));
        assert.match(options.input, /data-binary = "@.+grh-directory-bootstrap\.payload\.json\.gz"/);
        return protectedCurlResult(bootstrapAppliedBody(state), 201, 'grh-directory-bootstrap-v1');
      }
      assert.fail('unexpected command');
    };
    const result = await applyPreparedBootstrap({
      statePath: fixture.prepared.statePath,
      runner,
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
    assert.equal(protectedConfigSeen, true);
    assert.equal(JSON.stringify(calls).includes(secret), false);
    assert.equal(JSON.stringify(result).includes(secret), false);
    const envAdds = calls.filter(call => call.args[0] === 'env' && call.args[1] === 'add');
    assert.equal(envAdds.length, 3);
    assert.deepEqual(envAdds.map(call => call.args[2]), [
      'GRH_DIRECTORY_SNAPSHOT_KEY_V1',
      'GRH_DIRECTORY_ALLOWED_USER_IDS',
      'GRH_DIRECTORY_BOOTSTRAP_SECRET',
    ]);
    assert.ok(envAdds.every(call => call.hasInput));
    assert.ok(envAdds.every(call => call.args.includes('--sensitive') && call.args.includes('--yes')));
    const updated = await readState(fixture.prepared.statePath);
    assert.equal(updated.status, 'applied');
    assert.equal(updated.deployment.skipDomain, true);
    assert.equal(updated.deployment.baselineAliasDeploymentId, 'dpl_stable');
  } finally {
    await fixture.cleanup();
  }
});

async function assertPreApplyDeploymentRollback({ failure, expectedCode }) {
  const fixture = await makeFixture();
  try {
    const state = await readState(fixture.prepared.statePath);
    const calls = [];
    let stableInspections = 0;
    const runner = (command, args, options = {}) => {
      calls.push({ command, args: [...args] });
      if (command === 'git') return pinnedGitCommand(args, options, { state });
      if (args[0] === 'link') return { stdout: '', stderr: '' };
      if (args[0] === 'env' && args[1] === 'ls') return jsonResult({ envs: [] });
      if (args[0] === 'env' || args[0] === 'remove') return { stdout: '', stderr: '' };
      if (args[0] === 'deploy') {
        return jsonResult({
          id: 'dpl_temp_unique',
          url: 'https://municipio-junin-private-123.vercel.app',
        });
      }
      if (args[0] === 'inspect' && args[1] === STABLE_PRODUCTION_URL) {
        stableInspections += 1;
        if (failure === 'alias' && stableInspections === 2) {
          return jsonResult({ id: 'dpl_unexpected_alias', status: 'READY', target: 'production' });
        }
        return jsonResult({ id: 'dpl_stable', status: 'READY', target: 'production' });
      }
      if (args[0] === 'inspect' && failure === 'invalid_inspect') return { stdout: '{', stderr: '' };
      if (args[0] === 'inspect' && failure === 'not_ready') {
        return jsonResult({ id: 'dpl_temp_unique', status: 'BUILDING', target: 'production' });
      }
      if (args[0] === 'inspect') {
        return jsonResult({ id: 'dpl_temp_unique', status: 'READY', target: 'production' });
      }
      if (args[0] === 'curl') assert.fail('apply must not start before release checks pass');
      assert.fail('unexpected command');
    };
    await assert.rejects(() => applyPreparedBootstrap({
      statePath: fixture.prepared.statePath,
      runner,
      securePathImpl: async () => {},
    }), error => error.code === expectedCode);
    assert.ok(calls.some(call => call.args.join(' ') === 'remove dpl_temp_unique --yes'));
    const removedEnvs = calls
      .filter(call => call.args[0] === 'env' && call.args[1] === 'rm')
      .map(call => call.args[2])
      .sort();
    assert.deepEqual(removedEnvs, [
      'GRH_DIRECTORY_ALLOWED_USER_IDS',
      'GRH_DIRECTORY_BOOTSTRAP_SECRET',
      'GRH_DIRECTORY_SNAPSHOT_KEY_V1',
    ].sort());
    assert.equal(calls.some(call => call.args[0] === 'curl'), false);
    const persisted = await readState(fixture.prepared.statePath);
    assert.equal(persisted.status, 'prepared');
    assert.equal(persisted.deployment, null);
  } finally {
    await fixture.cleanup();
  }
}

test('invalid temporary deployment inspection rolls back deployment and envs before apply', async () => {
  await assertPreApplyDeploymentRollback({
    failure: 'invalid_inspect',
    expectedCode: 'BOOTSTRAP_DEPLOYMENT_INSPECTION_INVALID',
  });
});

test('NOT_READY temporary deployment rolls back deployment and envs before apply', async () => {
  await assertPreApplyDeploymentRollback({
    failure: 'not_ready',
    expectedCode: 'BOOTSTRAP_DEPLOYMENT_NOT_READY',
  });
});

test('stable alias movement before apply rolls back the temporary deployment and envs', async () => {
  await assertPreApplyDeploymentRollback({
    failure: 'alias',
    expectedCode: 'BOOTSTRAP_ALIAS_MOVED',
  });
});

test('apply rolls back exactly the three attempted env vars when setup fails before deployment', async () => {
  const fixture = await makeFixture();
  try {
    const state = await readState(fixture.prepared.statePath);
    const calls = [];
    const runner = (command, args, options = {}) => {
      calls.push({ command, args: [...args], hasInput: typeof options.input === 'string' });
      if (command === 'git') return pinnedGitCommand(args, options, { state });
      if (args[0] === 'link') return { stdout: '', stderr: '' };
      if (args[0] === 'env' && args[1] === 'ls') return jsonResult({ envs: [] });
      if (args[0] === 'env' && args[1] === 'add' &&
          args[2] === 'GRH_DIRECTORY_BOOTSTRAP_SECRET') return { stderr: '' };
      if (args[0] === 'env') return { stdout: '', stderr: '' };
      if (args[0] === 'inspect') return jsonResult({
        id: 'dpl_stable', status: 'READY', target: 'production',
      });
      if (args[0] === 'deploy') assert.fail('deployment must not be attempted');
      assert.fail('unexpected command');
    };
    await assert.rejects(() => applyPreparedBootstrap({
      statePath: fixture.prepared.statePath,
      runner,
      securePathImpl: async () => {},
    }), error => error.code === 'BOOTSTRAP_COMMAND_RESULT_INVALID');
    const added = calls
      .filter(call => call.args[0] === 'env' && call.args[1] === 'add')
      .map(call => call.args[2]);
    const removed = calls
      .filter(call => call.args[0] === 'env' && call.args[1] === 'rm')
      .map(call => call.args[2]);
    assert.deepEqual(added, [
      'GRH_DIRECTORY_SNAPSHOT_KEY_V1',
      'GRH_DIRECTORY_ALLOWED_USER_IDS',
      'GRH_DIRECTORY_BOOTSTRAP_SECRET',
    ]);
    assert.deepEqual(removed.sort(), [...added].sort());
    assert.equal((await readState(fixture.prepared.statePath)).status, 'prepared');
  } finally {
    await fixture.cleanup();
  }
});

test('apply requires the stable baseline to be READY and target production before adding envs', async () => {
  for (const baseline of [
    { id: 'dpl_stable', status: 'BUILDING', target: 'production' },
    { id: 'dpl_stable', status: 'READY', target: 'preview' },
  ]) {
    const fixture = await makeFixture();
    try {
      const state = await readState(fixture.prepared.statePath);
      const calls = [];
      const runner = (command, args, options = {}) => {
        calls.push({ command, args: [...args] });
        if (command === 'git') return pinnedGitCommand(args, options, { state });
        if (args[0] === 'link') return { stdout: '', stderr: '' };
        if (args[0] === 'env' && args[1] === 'ls') return jsonResult({ envs: [] });
        if (args[0] === 'inspect') return jsonResult(baseline);
        assert.fail('invalid baseline reached a mutating command');
      };
      await assert.rejects(() => applyPreparedBootstrap({
        statePath: fixture.prepared.statePath,
        runner,
        securePathImpl: async () => {},
      }), error => error.code === 'BOOTSTRAP_BASELINE_INSPECTION_INVALID');
      assert.equal(calls.some(call => call.args[0] === 'env' && call.args[1] === 'add'), false);
      assert.equal(calls.some(call => call.args[0] === 'deploy'), false);
    } finally {
      await fixture.cleanup();
    }
  }
});

test('apply refuses to overwrite a pre-existing allowlist, bootstrap secret, or snapshot key', async () => {
  const fixture = await makeFixture();
  try {
    const state = await readState(fixture.prepared.statePath);
    const calls = [];
    const runner = (command, args, options) => {
      calls.push({ command, args: [...args] });
      if (command === 'git') return pinnedGitCommand(args, options, { state });
      if (args[0] === 'link') return { stdout: '', stderr: '' };
      if (args[0] === 'env' && args[1] === 'ls') {
        return jsonResult({ envs: [{ key: 'GRH_DIRECTORY_SNAPSHOT_KEY_V1' }] });
      }
      assert.fail('environment guard must stop execution');
    };
    await assert.rejects(() => applyPreparedBootstrap({
      statePath: fixture.prepared.statePath,
      runner,
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
    const state = await readState(fixture.prepared.statePath);
    const runner = (command, args, options) => {
      if (command === 'git') {
        if (args[0] === 'status') return { stdout: ' M rrhh.html\n?? unexpected.txt\n', stderr: '' };
        return pinnedGitCommand(args, options, { state });
      }
      assert.fail('Vercel must not run for a dirty worktree');
    };
    await assert.rejects(() => applyPreparedBootstrap({
      statePath: fixture.prepared.statePath,
      runner,
      securePathImpl: async () => {},
    }), error => error.code === 'BOOTSTRAP_GIT_PIN_INVALID');
  } finally {
    await fixture.cleanup();
  }
});

test('Git SHA drift or an attached worktree fails before any Vercel command', async () => {
  const cases = [
    {
      name: 'source HEAD drift',
      override: (args, options, state) =>
        options.cwd === state.repositoryRoot && args.at(-1) === 'HEAD'
          ? { stdout: 'e'.repeat(40) + '\n', stderr: '' }
          : null,
    },
    {
      name: 'worktree origin drift',
      override: (args, options, state) =>
        options.cwd === state.worktreePath && args.at(-1) === 'refs/remotes/origin/master'
          ? { stdout: 'd'.repeat(40) + '\n', stderr: '' }
          : null,
    },
    {
      name: 'attached worktree',
      override: args => args[0] === 'branch'
        ? { stdout: 'master\n', stderr: '' }
        : null,
    },
  ];
  for (const scenario of cases) {
    const fixture = await makeFixture();
    try {
      const state = await readState(fixture.prepared.statePath);
      const calls = [];
      const runner = (command, args, options = {}) => {
        calls.push({ command, args: [...args] });
        if (command !== 'git') assert.fail(`${scenario.name} reached Vercel`);
        return scenario.override(args, options, state) || pinnedGitCommand(args, options, { state });
      };
      await assert.rejects(() => applyPreparedBootstrap({
        statePath: fixture.prepared.statePath,
        runner,
        securePathImpl: async () => {},
      }), error => error.code === 'BOOTSTRAP_GIT_PIN_INVALID');
      assert.ok(calls.length > 0);
      assert.ok(calls.every(call => call.command === 'git'));
    } finally {
      await fixture.cleanup();
    }
  }
});

async function appliedFixture() {
  const fixture = await makeFixture();
  const state = await readState(fixture.prepared.statePath);
  const calls = [];
  const runner = (command, args, options) => {
    calls.push({ command, args: [...args] });
    if (command === 'git') return pinnedGitCommand(args, options, { state });
    if (args[0] === 'link') return { stdout: '', stderr: '' };
    if (args[0] === 'env' && args[1] === 'ls') return jsonResult({ envs: [] });
    if (args[0] === 'env') return { stdout: '', stderr: '' };
    if (args[0] === 'deploy') return jsonResult({ id: 'dpl_temp_unique', url: 'https://municipio-junin-private-123.vercel.app' });
    if (args[0] === 'inspect' && args[1] === STABLE_PRODUCTION_URL) {
      return jsonResult({ id: 'dpl_stable', status: 'READY', target: 'production' });
    }
    if (args[0] === 'inspect') return jsonResult({ id: 'dpl_temp_unique', status: 'READY', target: 'production' });
    if (args[0] === 'curl') {
      return protectedCurlResult(bootstrapAppliedBody(state), 201, 'grh-directory-bootstrap-v1');
    }
    assert.fail('unexpected command');
  };
  await applyPreparedBootstrap({
    statePath: fixture.prepared.statePath,
    runner,
    securePathImpl: async () => {},
  });
  return fixture;
}

async function cleanedFixture() {
  const fixture = await appliedFixture();
  const state = await readState(fixture.prepared.statePath);
  const credential = await readState(state.credentialPath);
  await verifyAppliedBootstrap({
    statePath: fixture.prepared.statePath,
    runner: protectedVerificationRunner({ credential, token: 'c'.repeat(64) }),
    securePathImpl: async () => {},
  });
  await cleanupVerifiedBootstrap({
    statePath: fixture.prepared.statePath,
    runner: (_command, args) => {
      if (args[0] === 'inspect') return jsonResult({ id: 'dpl_stable', status: 'READY' });
      return { stdout: '', stderr: '' };
    },
    securePathImpl: async () => {},
  });
  return fixture;
}

async function ambiguousFixture({
  receiptBody = { redirect: true },
  receiptStatus = 302,
  receiptContract = '',
  expectedCode = 'BOOTSTRAP_APPLY_RESPONSE_INVALID',
} = {}) {
  const fixture = await makeFixture();
  const state = await readState(fixture.prepared.statePath);
  const calls = [];
  const runner = (command, args, options) => {
    calls.push({ command, args: [...args] });
    if (command === 'git') return pinnedGitCommand(args, options, { state });
    if (args[0] === 'link') return { stdout: '', stderr: '' };
    if (args[0] === 'env' && args[1] === 'ls') return jsonResult({ envs: [] });
    if (args[0] === 'env') return { stdout: '', stderr: '' };
    if (args[0] === 'deploy') return jsonResult({ id: 'dpl_temp_unique', url: 'https://municipio-junin-private-123.vercel.app' });
    if (args[0] === 'inspect' && args[1] === STABLE_PRODUCTION_URL) {
      return jsonResult({ id: 'dpl_stable', status: 'READY', target: 'production' });
    }
    if (args[0] === 'inspect') return jsonResult({ id: 'dpl_temp_unique', status: 'READY', target: 'production' });
    if (args[0] === 'curl') return protectedCurlResult(receiptBody, receiptStatus, receiptContract);
    assert.fail('unexpected command');
  };
  let applyError;
  await assert.rejects(() => applyPreparedBootstrap({
    statePath: fixture.prepared.statePath,
    runner,
    securePathImpl: async () => {},
  }), error => {
    applyError = error;
    return error.code === expectedCode;
  });
  assert.equal((await readState(fixture.prepared.statePath)).status, 'apply_ambiguous');
  assert.equal(calls.some(call => call.args[0] === 'remove'), false);
  assert.equal(calls.some(call => call.args[0] === 'env' && call.args[1] === 'rm'), false);
  fixture.applyError = applyError;
  return fixture;
}

function protectedVerificationRunner({
  credential,
  token,
  aiBody = nominalAiResponseFixture(),
  calls = [],
  deploymentUrl = 'https://municipio-junin-private-123.vercel.app',
  stableInspection = null,
  productionList = null,
}) {
  return (_command, args, options = {}) => {
    if (args[0] === 'inspect' && args[1] === STABLE_PRODUCTION_URL) {
      return jsonResult(stableInspection || { id: 'dpl_stable', status: 'READY', target: 'production' });
    }
    if (args[0] === 'ls') return jsonResult(productionList || { deployments: [] });
    if (args[0] === 'inspect') {
      return jsonResult({ id: 'dpl_temp_unique', status: 'READY', target: 'production' });
    }
    if (args[0] !== 'curl') assert.fail('unexpected command');
    const route = args[1];
    calls.push({ command: 'vercel', args: [...args], hasInput: typeof options.input === 'string' });
    assert.deepEqual(args.slice(2), [
      '--deployment', deploymentUrl,
      '--yes', '--', '--config', '-',
    ]);
    assert.equal(args.join(' ').includes(token), false);
    if (route === '/api/auth/login') {
      assert.ok(options.input.includes(credential.email));
      assert.ok(options.input.includes(credential.password));
      return protectedCurlResult({
        token,
        user: { id: credential.userId, role: 'INTENDENTE', tenantId: 'tenant-junin' },
      });
    }
    assert.ok(options.input.includes('Authorization: Bearer ' + token));
    if (route === '/api/ai-analyze') {
      assert.ok(options.input.includes('legajo 1001'));
      return protectedCurlResult(aiBody);
    }
    if (route === '/api/grh-directory?limit=1' ||
        route === '/api/grh-directory?limit=1&hasLeave=true') {
      return protectedCurlResult(responseFixture(), 200, 'grh-directory-v1');
    }
    assert.fail('unexpected protected route');
  };
}

test('apply preserves a safe migration-stage diagnostic without persisting response details', async () => {
  const fixture = await ambiguousFixture({
    receiptBody: { ok: false, code: 'BOOTSTRAP_INTERNAL_MIGRATION', pgCode: '42601' },
    receiptStatus: 500,
    receiptContract: 'grh-directory-bootstrap-v1',
    expectedCode: 'BOOTSTRAP_INTERNAL_MIGRATION',
  });
  try {
    assert.equal(fixture.applyError.pgCode, '42601');
    assert.equal(fixture.applyError.message, 'GRH directory production bootstrap failed');
    assert.deepEqual(Object.keys(fixture.applyError).sort(), ['code', 'name', 'pgCode']);
    const persisted = await readState(fixture.prepared.statePath);
    assert.equal(persisted.status, 'apply_ambiguous');
    assert.equal(JSON.stringify(persisted).includes('42601'), false);
    assert.equal(JSON.stringify(persisted).includes('BOOTSTRAP_INTERNAL_MIGRATION'), false);
  } finally {
    await fixture.cleanup();
  }
});

test('resolve surfaces a safe publication-stage diagnostic and rejects all body detail', async () => {
  const fixture = await ambiguousFixture();
  try {
    const state = await readState(fixture.prepared.statePath);
    const secret = await fs.readFile(state.secretPath, 'utf8');
    const runner = (_command, args, options = {}) => {
      if (args[0] === 'inspect' && args[1] === STABLE_PRODUCTION_URL) {
        return jsonResult({ id: 'dpl_stable', status: 'READY', target: 'production' });
      }
      if (args[0] === 'inspect') return jsonResult({ id: 'dpl_temp_unique', status: 'READY', target: 'production' });
      if (args[0] !== 'curl') assert.fail('unexpected command');
      assert.ok(options.input.includes(secret));
      assert.equal(args.join(' ').includes(secret), false);
      return protectedCurlResult({
        ok: false,
        code: 'BOOTSTRAP_INTERNAL_PUBLICATION',
        pgCode: 'XX000',
      }, 500, 'grh-directory-bootstrap-v1');
    };
    let diagnostic;
    await assert.rejects(() => resolveAmbiguousBootstrap({
      statePath: fixture.prepared.statePath,
      runner,
      securePathImpl: async () => {},
    }), error => {
      diagnostic = error;
      return error.code === 'BOOTSTRAP_INTERNAL_PUBLICATION' && error.pgCode === 'XX000';
    });
    assert.equal(JSON.stringify(diagnostic).includes(secret), false);
    assert.deepEqual(Object.keys(diagnostic).sort(), ['code', 'name', 'pgCode']);
    assert.equal((await readState(fixture.prepared.statePath)).status, 'apply_ambiguous');
  } finally {
    await fixture.cleanup();
  }
});

test('resolve replays the protected one-shot exactly once and promotes a valid 201 receipt to applied', async () => {
  const fixture = await ambiguousFixture();
  try {
    const state = await readState(fixture.prepared.statePath);
    const secret = await fs.readFile(state.secretPath, 'utf8');
    const calls = [];
    const runner = (_command, args, options = {}) => {
      if (args[0] === 'inspect' && args[1] === STABLE_PRODUCTION_URL) {
        return jsonResult({ id: 'dpl_stable', status: 'READY', target: 'production' });
      }
      if (args[0] === 'inspect') return jsonResult({ id: 'dpl_temp_unique', status: 'READY', target: 'production' });
      if (args[0] !== 'curl') assert.fail('unexpected command');
      calls.push({ args: [...args], hasInput: typeof options.input === 'string' });
      assert.ok(options.input.includes(secret));
      return protectedCurlResult(bootstrapAppliedBody(state), 201, 'grh-directory-bootstrap-v1');
    };
    const result = await resolveAmbiguousBootstrap({
      statePath: fixture.prepared.statePath,
      runner,
      securePathImpl: async () => {},
    });
    assert.equal(result.status, 'applied');
    assert.equal(result.alreadyConsumed, false);
    assert.equal(result.verificationRequired, true);
    assert.equal(calls.length, 1);
    assert.equal(JSON.stringify(calls).includes(secret), false);
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.equal((await readState(fixture.prepared.statePath)).status, 'applied');
  } finally {
    await fixture.cleanup();
  }
});

test('resolve treats 410 already-consumed as verification-only and never duplicates the one-shot', async () => {
  const fixture = await ambiguousFixture();
  try {
    const state = await readState(fixture.prepared.statePath);
    let oneShotCalls = 0;
    const resolveRunner = (_command, args) => {
      if (args[0] === 'inspect' && args[1] === STABLE_PRODUCTION_URL) {
        return jsonResult({ id: 'dpl_stable', status: 'READY', target: 'production' });
      }
      if (args[0] === 'inspect') return jsonResult({ id: 'dpl_temp_unique', status: 'READY', target: 'production' });
      if (args[0] !== 'curl') assert.fail('unexpected command');
      oneShotCalls += 1;
      return protectedCurlResult({ ok: false, code: 'BOOTSTRAP_ALREADY_CONSUMED' }, 410, 'grh-directory-bootstrap-v1');
    };
    const resolution = await resolveAmbiguousBootstrap({
      statePath: fixture.prepared.statePath,
      runner: resolveRunner,
      securePathImpl: async () => {},
    });
    assert.deepEqual(resolution, {
      status: 'apply_ambiguous',
      alreadyConsumed: true,
      verificationRequired: true,
      stableAliasUnchanged: true,
    });
    assert.equal(oneShotCalls, 1);
    assert.equal((await readState(fixture.prepared.statePath)).status, 'apply_ambiguous');

    const credential = await readState(state.credentialPath);
    const verified = await verifyAppliedBootstrap({
      statePath: fixture.prepared.statePath,
      runner: protectedVerificationRunner({ credential, token: 'v'.repeat(64) }),
      securePathImpl: async () => {},
    });
    assert.equal(verified.status, 'verified');
    assert.equal(oneShotCalls, 1);
  } finally {
    await fixture.cleanup();
  }
});

test('verify keeps token and nominal rows in memory and emits only structural results', async () => {
  const fixture = await appliedFixture();
  try {
    const state = await readState(fixture.prepared.statePath);
    const credential = await readState(state.credentialPath);
    const calls = [];
    const token = 't'.repeat(64);
    const runner = protectedVerificationRunner({ credential, token, calls });
    const result = await verifyAppliedBootstrap({
      statePath: fixture.prepared.statePath,
      runner,
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
    assert.equal(calls.length, 4);
    assert.ok(calls.some(call => call.args[1] === '/api/grh-directory?limit=1&hasLeave=true'));
    assert.ok(calls.every(call => call.hasInput));
    assert.equal(JSON.stringify(calls).includes(token), false);
    assert.equal(JSON.stringify(calls).includes(credential.password), false);
    assert.equal(JSON.stringify(result).includes(token), false);
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
    const unsafe = nominalAiResponseFixture();
    unsafe.engine.generated = true;
    unsafe.provenance.sourceSha256 = '0'.repeat(64);
    const runner = protectedVerificationRunner({
      credential,
      token: 'z'.repeat(64),
      aiBody: unsafe,
    });
    await assert.rejects(() => verifyAppliedBootstrap({
      statePath: fixture.prepared.statePath,
      runner,
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
    const credentialBytes = await fs.readFile(state.credentialPath);
    const recoveryKeyBytes = await fs.readFile(state.snapshotKeyPath);
    const verifyRunner = protectedVerificationRunner({ credential, token: 'x'.repeat(64) });
    await verifyAppliedBootstrap({
      statePath: fixture.prepared.statePath,
      runner: verifyRunner,
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
    assert.equal(result.snapshotKeyRetained, true);
    assert.equal(result.snapshotKeyLocalRetained, true);
    assert.equal(result.snapshotKeyVersion, 'v1');
    assert.equal(result.snapshotKeyFingerprintSha256, state.snapshotKeyFingerprintSha256);
    assert.equal(result.recoverySourceSha256, state.sourceSha256);
    assert.ok(calls.some(args => args.join(' ') === 'env rm GRH_DIRECTORY_BOOTSTRAP_SECRET production --yes'));
    assert.ok(calls.some(args => args.join(' ') === 'remove dpl_temp_unique --yes'));
    assert.equal(calls.some(args => args.includes('GRH_DIRECTORY_ALLOWED_USER_IDS') && args[1] === 'rm'), false);
    assert.equal(calls.some(args => args.includes('GRH_DIRECTORY_SNAPSHOT_KEY_V1') && args[1] === 'rm'), false);
    assert.deepEqual(await fs.readFile(state.credentialPath), credentialBytes);
    await assert.rejects(fs.access(state.endpointPath));
    await assert.rejects(fs.access(state.payloadPath));
    await assert.rejects(fs.access(state.secretPath));
    assert.deepEqual(await fs.readFile(state.snapshotKeyPath), recoveryKeyBytes);
    const cleaned = await readState(fixture.prepared.statePath);
    assert.equal(cleaned.status, 'cleaned');
  } finally {
    await fixture.cleanup();
  }
});

test('verify-production certifies the new stable deployment and finalize only seals state', async () => {
  const fixture = await cleanedFixture();
  try {
    const state = await readState(fixture.prepared.statePath);
    const credential = await readState(state.credentialPath);
    const credentialBytes = await fs.readFile(state.credentialPath);
    const recoveryKeyBytes = await fs.readFile(state.snapshotKeyPath);
    await assert.rejects(() => finalizeProductionBootstrap({
      statePath: fixture.prepared.statePath,
      securePathImpl: async () => {},
    }), error => error.code === 'BOOTSTRAP_FINALIZE_REQUIRES_PRODUCTION_VERIFICATION');

    const calls = [];
    const releaseUrl = 'https://municipio-junin-release-new.vercel.app';
    const inspectedRelease = {
      id: 'dpl_release_new',
      url: releaseUrl,
      status: 'READY',
      target: 'production',
    };
    const listedRelease = {
      url: releaseUrl,
      state: 'READY',
      target: 'production',
      meta: { githubCommitSha: expectedGitSha },
    };
    const verified = await verifyProductionBootstrap({
      statePath: fixture.prepared.statePath,
      runner: protectedVerificationRunner({
        credential,
        token: 'p'.repeat(64),
        calls,
        deploymentUrl: STABLE_PRODUCTION_URL,
        stableInspection: inspectedRelease,
        productionList: { deployments: [listedRelease] },
      }),
      securePathImpl: async () => {},
    });
    assert.equal(verified.status, 'production_verified');
    assert.equal(verified.productionDeploymentId, 'dpl_release_new');
    assert.equal(verified.productionGitSha, expectedGitSha);
    assert.equal(verified.snapshotKeyFingerprintSha256, state.snapshotKeyFingerprintSha256);
    assert.equal(calls.length, 4);
    assert.ok(calls.every(call => call.args.includes(STABLE_PRODUCTION_URL)));

    const finalized = await finalizeProductionBootstrap({
      statePath: fixture.prepared.statePath,
      securePathImpl: async () => {},
    });
    assert.equal(finalized.status, 'finalized');
    assert.equal(finalized.productionGitSha, expectedGitSha);
    assert.equal(finalized.snapshotKeyLocalRetained, true);
    assert.deepEqual(await fs.readFile(state.credentialPath), credentialBytes);
    assert.deepEqual(await fs.readFile(state.snapshotKeyPath), recoveryKeyBytes);
    const persisted = await readState(fixture.prepared.statePath);
    assert.equal(persisted.status, 'finalized');
    assert.equal(persisted.productionVerification.deploymentId, 'dpl_release_new');
  } finally {
    await fixture.cleanup();
  }
});

test('verify-production rejects the baseline, NOT_READY, and wrong-SHA deployments before smokes', async () => {
  const releaseUrl = 'https://municipio-junin-release-new.vercel.app';
  const validInspection = {
    id: 'dpl_release_new', url: releaseUrl, status: 'READY', target: 'production',
  };
  const validListEntry = {
    url: releaseUrl, state: 'READY', target: 'production',
    meta: { githubCommitSha: expectedGitSha },
  };
  const invalidReleases = [
    {
      name: 'baseline deployment',
      inspection: { ...validInspection, id: 'dpl_stable' },
      deployments: [validListEntry],
    },
    {
      name: 'not ready',
      inspection: { ...validInspection, status: 'BUILDING' },
      deployments: [validListEntry],
    },
    {
      name: 'wrong SHA',
      inspection: validInspection,
      deployments: [{ ...validListEntry, meta: { githubCommitSha: 'e'.repeat(40) } }],
    },
    {
      name: 'conflicting optional list ID',
      inspection: validInspection,
      deployments: [{ ...validListEntry, id: 'dpl_other_release' }],
    },
    {
      name: 'missing list entry',
      inspection: validInspection,
      deployments: [],
    },
    {
      name: 'duplicate exact URL',
      inspection: validInspection,
      deployments: [validListEntry, { ...validListEntry }],
    },
  ];
  for (const scenario of invalidReleases) {
    const fixture = await cleanedFixture();
    try {
      let curlCalls = 0;
      const runner = (_command, args) => {
        if (args[0] === 'inspect') return jsonResult(scenario.inspection);
        if (args[0] === 'ls') return jsonResult({ deployments: scenario.deployments });
        if (args[0] === 'curl') curlCalls += 1;
        assert.fail(`unexpected ${scenario.name} command`);
      };
      await assert.rejects(() => verifyProductionBootstrap({
        statePath: fixture.prepared.statePath,
        runner,
        securePathImpl: async () => {},
      }), error => error.code === 'BOOTSTRAP_PRODUCTION_RELEASE_INVALID');
      assert.equal(curlCalls, 0);
      assert.equal((await readState(fixture.prepared.statePath)).status, 'cleaned');
    } finally {
      await fixture.cleanup();
    }
  }
});

test('verify-production fails closed when the stable deployment changes during smokes', async () => {
  const fixture = await cleanedFixture();
  try {
    const state = await readState(fixture.prepared.statePath);
    const credential = await readState(state.credentialPath);
    const releases = [
      {
        id: 'dpl_release_before',
        url: 'https://municipio-junin-release-before.vercel.app',
        status: 'READY',
        target: 'production',
      },
      {
        id: 'dpl_release_after',
        url: 'https://municipio-junin-release-after.vercel.app',
        status: 'READY',
        target: 'production',
      },
    ];
    let inspectIndex = 0;
    let listIndex = 0;
    const smokeRunner = protectedVerificationRunner({
      credential,
      token: 'q'.repeat(64),
      deploymentUrl: STABLE_PRODUCTION_URL,
    });
    const runner = (command, args, options) => {
      if (args[0] === 'inspect') return jsonResult(releases[inspectIndex++]);
      if (args[0] === 'ls') {
        const release = releases[listIndex++];
        return jsonResult({
          deployments: [{ ...release, meta: { githubCommitSha: expectedGitSha } }],
        });
      }
      return smokeRunner(command, args, options);
    };
    await assert.rejects(() => verifyProductionBootstrap({
      statePath: fixture.prepared.statePath,
      runner,
      securePathImpl: async () => {},
    }), error => error.code === 'BOOTSTRAP_PRODUCTION_ALIAS_CHANGED');
    assert.equal(inspectIndex, 2);
    assert.equal(listIndex, 2);
    assert.equal((await readState(fixture.prepared.statePath)).status, 'cleaned');
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
  assert.match(result.stdout, /--mode encrypted_snapshot/);
  assert.match(result.stdout, /AES-256-GCM/);
  assert.match(result.stdout, /apply/);
  assert.match(result.stdout, /resolve/);
  assert.match(result.stdout, /verify/);
  assert.match(result.stdout, /cleanup/);
  assert.match(result.stdout, /verify-production/);
  assert.match(result.stdout, /finalize/);
  assert.match(result.stdout, /vercel curl/);
  assert.doesNotMatch(result.stdout + result.stderr, /passwordHash|postgresql:\/\//i);
});

test('the production runner quotes an ampersand route as one cmd.exe command on Windows', () => {
  const vercelArgs = [
    'curl', '/api/grh-directory?limit=1&hasLeave=true',
    '--deployment', 'https://municipio-junin-private-123.vercel.app', '--', '--config', '-',
  ];
  const invocation = resolveBootstrapCommandInvocation('vercel', vercelArgs);
  if (process.platform === 'win32') {
    assert.equal(invocation.command, process.env.ComSpec || 'cmd.exe');
    assert.deepEqual(invocation.args.slice(0, 4), ['/d', '/v:off', '/s', '/c']);
    assert.equal(invocation.args.length, 5);
    assert.match(invocation.args[4], /"\/api\/grh-directory\?limit=1&hasLeave=true"/);
    assert.throws(
      () => resolveBootstrapCommandInvocation('vercel', ['curl', '/api/test?unsafe=%PATH%']),
      error => error.code === 'BOOTSTRAP_COMMAND_ARGUMENT_INVALID',
    );
    return;
  }
  assert.deepEqual(invocation, {
    command: 'vercel',
    args: vercelArgs,
  });
});
