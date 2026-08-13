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
  inspectBootstrapDatabaseTargets,
  renderGrhDirectoryBootstrapFunction,
} from '../scripts/grh-directory-bootstrap-function-template.mjs';

import { fingerprintDatabaseTarget } from '../api/lib/database-target-fingerprint.js';

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
  safeCliResult,
  verifyAppliedBootstrap,
  verifyProductionBootstrap,
} from '../scripts/grh-directory-production-bootstrap-lib.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deterministicHash = '$2b$12$' + 'A'.repeat(53);
const expectedGitSha = 'f'.repeat(40);
const previewSourceGitSha = 'e'.repeat(40);
const previewBranch = 'codex/grh-ledger-release-gates';
const databaseTargetFingerprintSha256 = 'a'.repeat(64);
const stableDatabaseTargetFingerprintSha256 = 'b'.repeat(64);
const previewDeploymentId = 'dpl_preview_candidate';
const previewDeploymentUrl = 'https://municipio-junin-preview-candidate.vercel.app';
const uuids = Object.freeze([
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
]);

function artifactFixture() {
  return {
    schema_version: 'grh-directory-v3',
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
      excluded_fields: ['dni', 'cuil', 'contact', 'address', 'bank_account', 'salary', 'absence_leave_event_cause'],
    },
    counts: {
      source_rows: {
        ausencia: 1,
        calculo: 1,
        cargo: 1,
        catego: 1,
        convenio: 1,
        costos: 1,
        histolegajo: 1,
        legajo: 1,
        legamov: 1,
        licencia: 1,
        motibaja: 0,
        organiza: 1,
        persona: 1,
        regcontr: 1,
        revista: 1,
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
      valid_movement_rows: 1,
      quarantined_movement_rows: 0,
      valid_position_observation_rows: 1,
      blank_position_observation_rows: 0,
      quarantined_position_observation_rows: 0,
      future_effective_position_observation_rows: 1,
      records_with_position_observation: 1,
      valid_calculation_rows: 1,
      quarantined_calculation_rows: 0,
      reference_payroll_period: '2026-07',
      reference_payroll_rows: 1,
      records_observed_in_reference_payroll: 1,
      employment_statuses: {
        ended_by_reported_dates: 0,
        current_by_reported_dates: 1,
        unknown_missing_ingress: 0,
        unknown_sentinel_ingress: 0,
        unknown_implausible_active_tenure: 0,
        invalid_chronology: 0,
      },
    },
    records: [{
      company_code: 101,
      legajo: 1001,
      display_name: 'Persona sintética',
      sector: { code: 7, label: 'Sector' },
      cost_center: { code: 12, label: 'Centro de costo' },
      organization: { code: 5, label: 'Organización' },
      position: {
        code: 4,
        label: 'Cargo',
        parent: { code: 40, label: 'Secretaría' },
        depends_on: { code: 50, label: 'Municipio' },
      },
      category: { code: 3, label: 'Categoría' },
      agreement: { code: 2, label: 'Convenio' },
      contract_regime: { code: 1, label: 'Permanente' },
      service_situation: { code: 2, label: 'Servicio activo' },
      termination_reason: null,
      employment: {
        reported_ingress_date: '2010-01-01',
        reported_exit_date: null,
        reported_status: 'current_by_reported_dates',
        as_of: '2026-08-06',
        basis: 'legajo_reported_dates',
        reference_payroll_participation: { period: '2026-07', observed: true, row_count: 1 },
      },
      absence: { event_count: 1, latest_date: '2026-07-01' },
      absence_history: [{ date: '2026-07-01', days: 1 }],
      leave: { event_count: 1, latest_start_date: '2009-05-01', latest_end_date: '2009-05-10' },
      leave_history: [{ start_date: '2009-05-01', end_date: '2009-05-10', days: 10 }],
      movement: { row_count: 1, period_count: 1, latest_period: '2026-07' },
      movement_history: [{ period: '2026-07', row_count: 1 }],
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
    schemaVersion: 'grh-directory-v3',
    source: {
      canonicalSystem: EXPECTED_SOURCE_MANIFEST.canonical_system,
      sourceFile: EXPECTED_SOURCE_MANIFEST.source_file,
      sourceSha256: EXPECTED_SOURCE_MANIFEST.sha256,
      snapshotAsOf: EXPECTED_SOURCE_MANIFEST.snapshot_as_of,
    },
    privacy: {
      containsPersonalData: true,
      excludedFields: ['dni', 'cuil', 'contact', 'address', 'bank_account', 'salary', 'absence_leave_event_cause'],
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
      costCenters: [{ code: 12, label: 'Centro de costo', count: 1 }],
      organizations: [{ code: 5, label: 'Organización', count: 1 }],
      positions: [{ code: 4, label: 'Cargo', count: 1 }],
      positionObservations: [{ label: 'Puesto observado', count: 1, status: 'source_future_effective' }],
      categories: [{ agreementCode: 2, code: 3, label: 'Categoría', count: 1 }],
      agreements: [{ code: 2, label: 'Convenio', count: 1 }],
      reportedStatuses: [{
        status: 'current_by_reported_dates', label: 'Sin egreso informado al corte', count: 1,
      }],
      contractRegimes: [{ code: 1, label: 'Permanente', count: 1 }],
      serviceSituations: [{ code: 2, label: 'Servicio activo', count: 1 }],
    },
    items: [{
      companyCode: 101,
      legajo: 1001,
      displayName: 'Persona sintética',
      sector: { code: 7, label: 'Sector' },
      costCenter: { code: 12, label: 'Centro de costo' },
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
      contractRegime: { code: 1, label: 'Permanente' },
      serviceSituation: { code: 2, label: 'Servicio activo' },
      terminationReason: null,
      employment: {
        reportedIngressDate: '2010-01-01',
        reportedExitDate: null,
        reportedStatus: 'current_by_reported_dates',
        asOf: '2026-08-06',
        basis: 'legajo_reported_dates',
        referencePayrollParticipation: { period: '2026-07', observed: true, rowCount: 1 },
      },
      events: {
        absenceCount: 1,
        latestAbsenceDate: '2026-07-01',
        leaveCount: 1,
        latestLeaveStartDate: '2009-05-01',
        latestLeaveEndDate: '2009-05-10',
      },
      movement: { rowCount: 1, periodCount: 1, latestPeriod: '2026-07' },
    }],
  };
}

function detailResponseFixture() {
  const response = responseFixture();
  response.query = {
    mode: 'detail', page: 1, limit: 1, total: 1,
    hasNext: false, cursor: null, nextCursor: null,
  };
  response.facets = null;
  response.items[0].absenceHistory = {
    total: 1, limit: 24, items: [{ date: '2026-07-01', days: 1 }],
  };
  response.items[0].leaveHistory = {
    total: 1, limit: 24,
    items: [{ startDate: '2009-05-01', endDate: '2009-05-10', days: 10 }],
  };
  response.items[0].movementHistory = {
    total: 1, limit: 24, items: [{ period: '2026-07', rowCount: 1 }],
  };
  return response;
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
        person: detailResponseFixture().items[0],
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
    'api/lib/database-target-fingerprint.js',
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

async function makePreviewFixture({
  mode = 'ddl',
  target = 'preview',
  branch = previewBranch,
  databaseFingerprint = databaseTargetFingerprintSha256,
  stableDatabaseFingerprint = stableDatabaseTargetFingerprintSha256,
} = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'municontrol-grh-preview-bootstrap-test-'));
  const worktree = path.join(root, 'worktree');
  const stateDirectory = path.join(root, 'private-state');
  const artifactPath = path.join(root, 'directory.json');
  for (const relative of [
    'api/lib/grh-directory-contract.js',
    'api/lib/grh-directory-publication.js',
    'api/lib/grh-directory-snapshot.js',
    'api/lib/database-target-fingerprint.js',
    'shared/database-url-policy.cjs',
    'shared/published-demo-policy.cjs',
    'vercel.json',
  ]) {
    const destination = path.join(worktree, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, relative.endsWith('.json') ? '{}\n' : '// fixture\n');
  }
  await fs.writeFile(artifactPath, JSON.stringify(artifactFixture()));
  let uuidIndex = 0;
  const gitCalls = [];
  const runner = (command, args, options = {}) => {
    assert.equal(command, 'git');
    gitCalls.push({ args: [...args], cwd: options.cwd });
    if (args[0] === 'rev-parse' && args[1] === '--verify') {
      const ref = args[2];
      if (ref === 'HEAD') {
        return {
          stdout: (path.resolve(options.cwd) === path.resolve(repositoryRoot)
            ? previewSourceGitSha
            : expectedGitSha) + '\n',
          stderr: '',
        };
      }
      if (ref === `refs/remotes/origin/${branch}`) {
        return { stdout: expectedGitSha + '\n', stderr: '' };
      }
      if (ref === 'refs/remotes/origin/master') {
        return { stdout: previewSourceGitSha + '\n', stderr: '' };
      }
    }
    if (args[0] === 'branch' && args[1] === '--show-current') {
      return { stdout: branch + '\n', stderr: '' };
    }
    if (args[0] === 'status') return { stdout: '', stderr: '' };
    assert.fail(`unexpected preview git command: ${args.join(' ')}`);
  };
  try {
    const prepared = await prepareBootstrapBundle({
      mode,
      target,
      previewBranch: branch,
      databaseTargetFingerprintSha256: databaseFingerprint,
      stableDatabaseTargetFingerprintSha256: stableDatabaseFingerprint,
      worktreePath: worktree,
      artifactPath,
      stateDirectory,
      repositoryRoot,
      now: () => new Date('2026-08-12T15:00:00.000Z'),
      randomUuidImpl: () => uuids[uuidIndex++],
      randomBytesImpl: size => Buffer.alloc(size, 0xbc),
      bcryptHashImpl: async () => deterministicHash,
      securePathImpl: async () => {},
      runner,
    });
    return {
      root,
      worktree,
      stateDirectory,
      artifactPath,
      prepared,
      gitCalls,
      async cleanup() {
        const resolved = path.resolve(root);
        assert.ok(resolved.startsWith(path.resolve(os.tmpdir())));
        await fs.rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true });
    throw error;
  }
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

function previewPinnedGitCommand(args, options = {}, { state, preparing = false } = {}) {
  if (args[0] === 'rev-parse' && args[1] === '--verify') {
    const ref = args[2];
    if (ref === 'HEAD') {
      return {
        stdout: (path.resolve(options.cwd) === path.resolve(state.repositoryRoot)
          ? previewSourceGitSha
          : state.expectedGitSha) + '\n',
        stderr: '',
      };
    }
    if (ref === `refs/remotes/origin/${state.previewBranch}`) {
      return { stdout: state.expectedGitSha + '\n', stderr: '' };
    }
    if (ref === 'refs/remotes/origin/master') {
      return { stdout: previewSourceGitSha + '\n', stderr: '' };
    }
  }
  if (args[0] === 'branch' && args[1] === '--show-current') {
    return { stdout: state.previewBranch + '\n', stderr: '' };
  }
  if (args[0] === 'status') {
    return {
      stdout: preparing ? '' : `?? ${state.endpointRelativePath}\n`,
      stderr: '',
    };
  }
  assert.fail(`unexpected preview git command in ${options.cwd || 'unknown cwd'}: ${args.join(' ')}`);
}

function previewDeploymentInspection() {
  return {
    id: previewDeploymentId,
    url: previewDeploymentUrl,
    status: 'READY',
    target: 'preview',
  };
}

function previewDeploymentList() {
  return {
    deployments: [{
      url: previewDeploymentUrl,
      state: 'READY',
      target: null,
      meta: {
        githubCommitSha: expectedGitSha,
        githubCommitRef: previewBranch,
      },
    }],
  };
}

function bootstrapAppliedBody(state) {
  const body = {
    ok: true,
    code: 'GRH_DIRECTORY_BOOTSTRAP_APPLIED',
    schemaVersion: 'grh-directory-v3',
    snapshotAsOf: state.snapshotAsOf,
    recordCount: state.recordCount,
    absenceRecordCount: state.absenceRecordCount,
    leaveRecordCount: state.leaveRecordCount,
    movementPeriodCount: state.movementPeriodCount,
    positionObservationCount: state.positionObservationCount,
  };
  if (state.target === 'preview') {
    body.databaseTargetFingerprintSha256 = state.databaseTargetFingerprintSha256;
  }
  return body;
}

function bootstrapPreflightBody(state) {
  return {
    ok: true,
    code: 'GRH_DIRECTORY_BOOTSTRAP_PREFLIGHT_OK',
    databaseTargetFingerprintSha256: state.databaseTargetFingerprintSha256,
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
    assert.equal(state.absenceRecordCount, 1);
    assert.equal(state.leaveRecordCount, 1);
    assert.equal(state.movementPeriodCount, 1);
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
    assert.match(endpoint, /GRH_DIRECTORY_BOOTSTRAP_V3/);
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
    'sourceSha256', 'snapshotAsOf', 'recordCount', 'absenceRecordCount',
    'leaveRecordCount', 'movementPeriodCount', 'positionObservationCount',
    'nonce', 'ciphertext', 'authTag', 'aad',
  ]);
  assert.equal(envelope.kind, 'grh.directory.snapshot.v3');
  assert.deepEqual(Object.keys(envelope.aad), [
    'tenantId', 'schemaVersion', 'sourceSha256', 'snapshotAsOf', 'keyVersion', 'compression',
    'absenceRecordCount', 'movementPeriodCount',
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
    await fs.access(path.join(fixture.worktree, 'api', 'lib', 'database-target-fingerprint.js'));
    assert.equal(state.mode, 'ddl');
    assert.equal(state.snapshotKeyPath, null);
    assert.equal(state.snapshotKeyVersion, null);
    assert.match(endpoint, /const BOOTSTRAP_MODE = "ddl"/);
    assert.match(endpoint, /await client\.query\(MIGRATION_SQL\)/);
  } finally {
    await fixture.cleanup();
  }
});

test('preview prepare is DDL-only and pins the attached worktree to the exact remote branch ref', async () => {
  const fixture = await makePreviewFixture();
  try {
    const state = await readState(fixture.prepared.statePath);
    const endpoint = await fs.readFile(state.endpointPath, 'utf8');
    await fs.access(path.join(fixture.worktree, 'api', 'lib', 'database-target-fingerprint.js'));
    assert.equal(state.status, 'prepared');
    assert.equal(state.mode, 'ddl');
    assert.equal(state.target, 'preview');
    assert.equal(state.previewBranch, previewBranch);
    assert.equal(state.expectedGitSha, expectedGitSha);
    assert.equal(state.databaseTargetFingerprintSha256, databaseTargetFingerprintSha256);
    assert.equal(
      state.stableDatabaseTargetFingerprintSha256,
      stableDatabaseTargetFingerprintSha256,
    );
    assert.notEqual(
      state.databaseTargetFingerprintSha256,
      state.stableDatabaseTargetFingerprintSha256,
    );
    assert.equal(state.snapshotKeyPath, null);
    assert.equal(state.snapshotKeyVersion, null);
    assert.equal(state.snapshotKeyFingerprintSha256, null);
    assert.ok(fixture.gitCalls.some(call =>
      call.args.join(' ') === `rev-parse --verify refs/remotes/origin/${previewBranch}`));
    assert.ok(fixture.gitCalls.some(call =>
      call.args.join(' ') === 'rev-parse --verify HEAD' &&
      path.resolve(call.cwd) === path.resolve(fixture.worktree)));
    assert.ok(fixture.gitCalls.some(call =>
      call.args.join(' ') === 'branch --show-current' &&
      path.resolve(call.cwd) === path.resolve(fixture.worktree)));
    assert.equal(fixture.gitCalls.some(call =>
      call.args.join(' ') === 'rev-parse --verify refs/remotes/origin/master' &&
      path.resolve(call.cwd) === path.resolve(fixture.worktree)), false);

    assert.match(endpoint, /import \{ fingerprintDatabaseTarget \} from '\.\/lib\/database-target-fingerprint\.js';/);
    assert.match(endpoint, new RegExp(databaseTargetFingerprintSha256));
    assert.match(endpoint, /process\.env\.DIRECT_URL/);
    assert.match(endpoint, /process\.env\.DATABASE_URL/);
    const runtimeGuard = endpoint.indexOf('const databaseTargetFingerprintSha256 = requireRuntimeDatabaseTargets()');
    const directFingerprint = endpoint.indexOf('directFingerprint = fingerprintImpl(directUrl)');
    const pooledFingerprint = endpoint.indexOf('databaseFingerprint = fingerprintImpl(databaseUrl)');
    const databaseInspection = endpoint.indexOf('database = inspectDatabaseUrl(process.env.DIRECT_URL');
    const clientConstruction = endpoint.indexOf('new Client');
    const connect = endpoint.indexOf('await client.connect()');
    const migration = endpoint.indexOf('await client.query(MIGRATION_SQL)');
    assert.ok(directFingerprint >= 0, 'the endpoint must fingerprint DIRECT_URL');
    assert.ok(pooledFingerprint > directFingerprint, 'the endpoint must also fingerprint DATABASE_URL');
    assert.ok(runtimeGuard > pooledFingerprint, 'the runtime guard must use the dual-fingerprint inspector');
    assert.ok(databaseInspection > runtimeGuard, 'both targets must be checked before URL inspection');
    assert.ok(clientConstruction > databaseInspection, 'both targets must be checked before Client construction');
    assert.ok(connect > clientConstruction, 'the client must be constructed before connecting');
    assert.ok(migration > connect, 'migration remains after the verified connection');
    assert.match(endpoint, /action === 'preflight'/);
    assert.match(endpoint, /GRH_DIRECTORY_BOOTSTRAP_PREFLIGHT_OK/);
    assert.doesNotMatch(endpoint, /postgres(?:ql)?:\/\/[^'"\s]+/i);
  } finally {
    await fixture.cleanup();
  }
});

test('dual database target guard accepts one Neon child via direct and pooled URLs and fails closed otherwise', () => {
  const childDirect =
    'postgresql://preview_role:preview_password@ep-child-a1b2c3.us-east-2.aws.neon.tech/municontrol?sslmode=verify-full';
  const childPooled =
    'postgresql://preview_role:preview_password@ep-child-a1b2c3-pooler.us-east-2.aws.neon.tech/municontrol?sslmode=verify-full';
  const mainPooled =
    'postgresql://preview_role:preview_password@ep-main-d4e5f6-pooler.us-east-2.aws.neon.tech/municontrol?sslmode=verify-full';
  const expectedFingerprint = fingerprintDatabaseTarget(childDirect);
  assert.deepEqual(inspectBootstrapDatabaseTargets({
    expectedFingerprint,
    directUrl: childDirect,
    databaseUrl: childPooled,
    fingerprintImpl: fingerprintDatabaseTarget,
  }), {
    ok: true,
    databaseTargetFingerprintSha256: expectedFingerprint,
  });
  for (const configuration of [
    { directUrl: undefined, databaseUrl: childPooled, code: 'BOOTSTRAP_DATABASE_TARGET_INVALID', status: 503 },
    { directUrl: childDirect, databaseUrl: undefined, code: 'BOOTSTRAP_DATABASE_TARGET_INVALID', status: 503 },
    { directUrl: 'not-a-database-url', databaseUrl: childPooled, code: 'BOOTSTRAP_DATABASE_TARGET_INVALID', status: 503 },
    { directUrl: childDirect, databaseUrl: mainPooled, code: 'BOOTSTRAP_DATABASE_TARGET_MISMATCH', status: 409 },
  ]) {
    assert.deepEqual(inspectBootstrapDatabaseTargets({
      expectedFingerprint,
      directUrl: configuration.directUrl,
      databaseUrl: configuration.databaseUrl,
      fingerprintImpl: fingerprintDatabaseTarget,
    }), {
      ok: false,
      code: configuration.code,
      status: configuration.status,
    });
  }
});

test('preview prepare rejects snapshot publication and requires branch plus distinct database fingerprints', async () => {
  const invalid = [
    { mode: 'encrypted_snapshot' },
    { branch: null },
    { branch: 'master' },
    { branch: 'refs/heads/codex/unsafe' },
    { databaseFingerprint: null },
    { databaseFingerprint: '0'.repeat(63) },
    { stableDatabaseFingerprint: null },
    { stableDatabaseFingerprint: '0'.repeat(63) },
    {
      databaseFingerprint: databaseTargetFingerprintSha256,
      stableDatabaseFingerprint: databaseTargetFingerprintSha256,
    },
  ];
  for (const options of invalid) {
    await assert.rejects(
      () => makePreviewFixture(options),
      error => typeof error?.code === 'string' && error.code.startsWith('BOOTSTRAP_'),
    );
  }
});

const requiredPreviewEnvironment = Object.freeze([
  'DATABASE_URL',
  'DIRECT_URL',
  'JWT_SECRET',
  'GRH_TENANT_ID',
  'GRH_SOURCE_SHA256',
  'GRH_ARTIFACT_SOURCE',
]);
const inheritedPreviewEnvironment = Object.freeze([
  'JWT_SECRET',
  'GRH_TENANT_ID',
  'GRH_SOURCE_SHA256',
  'GRH_ARTIFACT_SOURCE',
]);
const branchPreviewDatabaseEnvironment = Object.freeze(['DATABASE_URL', 'DIRECT_URL']);

test('preview apply, verify, and cleanup remain branch-scoped and never mutate Production', async () => {
  const fixture = await makePreviewFixture();
  try {
    const initial = await readState(fixture.prepared.statePath);
    const credential = await readState(initial.credentialPath);
    const secret = await fs.readFile(initial.secretPath, 'utf8');
    const calls = [];
    const token = 'r'.repeat(64);
    const smokeRunner = protectedVerificationRunner({
      credential,
      token,
      deploymentUrl: previewDeploymentUrl,
      calls,
    });
    const runner = (command, args, options = {}) => {
      calls.push({
        command,
        args: [...args],
        cwd: options.cwd,
        hasInput: typeof options.input === 'string',
      });
      if (command === 'git') {
        return previewPinnedGitCommand(args, options, { state: initial });
      }
      if (args[0] === 'link') return { stdout: '', stderr: '' };
      if (args[0] === 'env' && args[1] === 'ls') {
        if (args.length === 4) {
          return jsonResult({
            envs: [
              ...inheritedPreviewEnvironment.map(key => ({ key, gitBranch: null })),
              { key: 'GRH_DIRECTORY_BOOTSTRAP_SECRET', gitBranch: 'codex/unrelated' },
            ],
          });
        }
        return jsonResult({
          envs: [
            ...branchPreviewDatabaseEnvironment.map(key => ({ key, gitBranch: previewBranch })),
            { key: 'GRH_DIRECTORY_ALLOWED_USER_IDS', gitBranch: null },
          ],
        });
      }
      if (args[0] === 'env' && ['add', 'rm'].includes(args[1])) {
        return { stdout: '', stderr: '' };
      }
      if (args[0] === 'deploy') {
        return jsonResult({ id: previewDeploymentId, url: previewDeploymentUrl });
      }
      if (args[0] === 'inspect' && args[1] === STABLE_PRODUCTION_URL) {
        return jsonResult({
          id: 'dpl_stable',
          url: STABLE_PRODUCTION_URL,
          status: 'READY',
          target: 'production',
        });
      }
      if (args[0] === 'inspect') return jsonResult(previewDeploymentInspection());
      if (args[0] === 'ls') return jsonResult(previewDeploymentList());
      if (args[0] === 'curl' && args[1] === initial.endpointRoute) {
        assert.ok(options.input.includes(secret));
        if (options.input.includes('X-GRH-Bootstrap-Action: preflight')) {
          assert.equal(options.input.includes('data-binary'), false);
          assert.equal(options.input.includes('postgresql://'), false);
          const preflightBody = bootstrapPreflightBody(initial);
          assert.deepEqual(Object.keys(preflightBody), [
            'ok', 'code', 'databaseTargetFingerprintSha256',
          ]);
          assert.doesNotMatch(JSON.stringify(preflightBody), /(?:url|host|user)/i);
          return protectedCurlResult(
            preflightBody,
            200,
            'grh-directory-bootstrap-v3',
          );
        }
        return protectedCurlResult(bootstrapAppliedBody(initial), 201, 'grh-directory-bootstrap-v3');
      }
      if (args[0] === 'curl') return smokeRunner(command, args, options);
      if (args[0] === 'remove') return { stdout: '', stderr: '' };
      assert.fail(`unexpected preview command: ${args.join(' ')}`);
    };

    const applied = await applyPreparedBootstrap({
      statePath: fixture.prepared.statePath,
      runner,
      securePathImpl: async () => {},
    });
    assert.equal(applied.status, 'applied');
    assert.equal(applied.stableAliasUnchanged, true);
    assert.equal(applied.databaseTargetFingerprintSha256, databaseTargetFingerprintSha256);
    assert.equal(applied.stableDatabaseTargetFingerprintSha256, stableDatabaseTargetFingerprintSha256);
    assert.notEqual(applied.deploymentId, 'dpl_stable');

    assert.equal(calls.some(call =>
      call.args[0] === 'env' && call.args[1] === 'run'), false);
    const envLists = calls
      .filter(call => call.args[0] === 'env' && call.args[1] === 'ls')
      .map(call => call.args);
    assert.deepEqual(envLists, [
      ['env', 'ls', 'preview', '--json'],
      ['env', 'ls', 'preview', previewBranch, '--json'],
    ]);
    const envAdds = calls.filter(call => call.args[0] === 'env' && call.args[1] === 'add');
    assert.deepEqual(envAdds.map(call => call.args), [
      ['env', 'add', 'GRH_DIRECTORY_ALLOWED_USER_IDS', 'preview', previewBranch, '--sensitive', '--yes'],
      ['env', 'add', 'GRH_DIRECTORY_BOOTSTRAP_SECRET', 'preview', previewBranch, '--sensitive', '--yes'],
    ]);
    assert.ok(envAdds.every(call => call.hasInput));
    assert.equal(envAdds.some(call => call.args.includes('GRH_DIRECTORY_SNAPSHOT_KEY_V1')), false);
    const deploy = calls.find(call => call.args[0] === 'deploy');
    assert.deepEqual(deploy.args, ['deploy', '--target', 'preview', '--yes', '--json']);
    assert.equal(deploy.args.includes('--prod'), false);
    assert.equal(deploy.args.includes('--skip-domain'), false);
    assert.ok(calls.some(call => call.args.join(' ') ===
      `ls municipio-junin --environment preview --json`));

    const firstHttp = calls.findIndex(call => call.args[0] === 'curl');
    const firstMutation = calls.findIndex(call =>
      (call.args[0] === 'env' && call.args[1] === 'add') || call.args[0] === 'deploy');
    const lastEnvironmentInventory = calls.reduce((last, call, index) =>
      call.args[0] === 'env' && call.args[1] === 'ls' ? index : last, -1);
    assert.ok(lastEnvironmentInventory >= 0 && lastEnvironmentInventory < firstMutation);
    const candidateInspect = calls.findIndex(call =>
      call.args[0] === 'inspect' && call.args[1] === previewDeploymentUrl);
    const candidateList = calls.findIndex(call => call.args[0] === 'ls');
    const postDeployStable = calls.reduce((indexes, call, index) => {
      if (call.args[0] === 'inspect' && call.args[1] === STABLE_PRODUCTION_URL) indexes.push(index);
      return indexes;
    }, []);
    assert.ok(candidateInspect >= 0 && candidateInspect < firstHttp);
    assert.ok(candidateList >= 0 && candidateList < firstHttp);
    assert.equal(postDeployStable.length >= 2, true);
    assert.ok(postDeployStable[1] < firstHttp);
    const bootstrapCurls = calls.filter(call =>
      call.args[0] === 'curl' && call.args[1] === initial.endpointRoute);
    assert.equal(bootstrapCurls.length, 2);
    assert.equal(bootstrapCurls[0].hasInput, true);
    assert.equal(bootstrapCurls[1].hasInput, true);

    const safeApplied = safeCliResult(applied);
    assert.equal(safeApplied.databaseTargetFingerprintSha256, databaseTargetFingerprintSha256);
    assert.equal(
      safeApplied.stableDatabaseTargetFingerprintSha256,
      stableDatabaseTargetFingerprintSha256,
    );
    assert.equal(JSON.stringify(calls).includes(secret), false);
    assert.equal(JSON.stringify(calls).includes(credential.password), false);
    assert.equal(JSON.stringify(applied).includes(secret), false);

    const verified = await verifyAppliedBootstrap({
      statePath: fixture.prepared.statePath,
      runner,
      securePathImpl: async () => {},
    });
    assert.equal(verified.status, 'verified');
    assert.equal(verified.stableAliasUnchanged, true);
    assert.equal(verified.databaseTargetFingerprintSha256, databaseTargetFingerprintSha256);

    const cleaned = await cleanupVerifiedBootstrap({
      statePath: fixture.prepared.statePath,
      runner,
      securePathImpl: async () => {},
    });
    assert.equal(cleaned.status, 'cleaned');
    const envRemovals = calls
      .filter(call => call.args[0] === 'env' && call.args[1] === 'rm')
      .map(call => call.args);
    assert.deepEqual(envRemovals, [
      ['env', 'rm', 'GRH_DIRECTORY_BOOTSTRAP_SECRET', 'preview', previewBranch, '--yes'],
      ['env', 'rm', 'GRH_DIRECTORY_ALLOWED_USER_IDS', 'preview', previewBranch, '--yes'],
    ]);
    assert.ok(calls.some(call =>
      call.args.join(' ') === `remove ${previewDeploymentId} --yes`));
    assert.equal(calls.some(call =>
      call.args[0] === 'env' && ['add', 'rm'].includes(call.args[1]) &&
      call.args.includes('production')), false);
    assert.equal(calls.some(call =>
      call.args[0] === 'deploy' && call.args.includes('--prod')), false);
    const persisted = await readState(fixture.prepared.statePath);
    assert.equal(persisted.status, 'cleaned');
    assert.equal(persisted.target, 'preview');
    assert.equal(persisted.previewBranch, previewBranch);
    assert.equal(JSON.stringify(persisted).includes(secret), false);
    assert.equal(JSON.stringify(cleaned).includes(secret), false);
  } finally {
    await fixture.cleanup();
  }
});

test('preview remote target mismatch rolls back deployment and temporary envs before payload apply', async () => {
  const fixture = await makePreviewFixture();
  try {
    const state = await readState(fixture.prepared.statePath);
    const calls = [];
    const runner = (command, args, options = {}) => {
      calls.push({
        command,
        args: [...args],
        hasInput: typeof options.input === 'string',
        preflight: typeof options.input === 'string' &&
          options.input.includes('X-GRH-Bootstrap-Action: preflight'),
        payload: typeof options.input === 'string' && options.input.includes('data-binary'),
      });
      if (command === 'git') return previewPinnedGitCommand(args, options, { state });
      if (args[0] === 'link') return { stdout: '', stderr: '' };
      if (args[0] === 'env' && args[1] === 'ls') {
        const global = args.length === 4;
        const keys = global ? inheritedPreviewEnvironment : branchPreviewDatabaseEnvironment;
        const gitBranch = global ? null : previewBranch;
        return jsonResult({ envs: keys.map(key => ({ key, gitBranch })) });
      }
      if (args[0] === 'env' && ['add', 'rm'].includes(args[1])) {
        return { stdout: '', stderr: '' };
      }
      if (args[0] === 'deploy') {
        return jsonResult({ id: previewDeploymentId, url: previewDeploymentUrl });
      }
      if (args[0] === 'inspect' && args[1] === STABLE_PRODUCTION_URL) {
        return jsonResult({
          id: 'dpl_stable',
          url: STABLE_PRODUCTION_URL,
          status: 'READY',
          target: 'production',
        });
      }
      if (args[0] === 'inspect') return jsonResult(previewDeploymentInspection());
      if (args[0] === 'ls') return jsonResult(previewDeploymentList());
      if (args[0] === 'curl') {
        assert.equal(options.input.includes('X-GRH-Bootstrap-Action: preflight'), true);
        assert.equal(options.input.includes('data-binary'), false);
        return protectedCurlResult({
          ok: false,
          code: 'BOOTSTRAP_DATABASE_TARGET_MISMATCH',
        }, 409, 'grh-directory-bootstrap-v3');
      }
      if (args[0] === 'remove') return { stdout: '', stderr: '' };
      assert.fail(`unexpected preview preflight command: ${args.join(' ')}`);
    };
    await assert.rejects(() => applyPreparedBootstrap({
      statePath: fixture.prepared.statePath,
      runner,
      securePathImpl: async () => {},
    }), error => error?.code === 'BOOTSTRAP_DATABASE_TARGET_MISMATCH');
    const curls = calls.filter(call => call.args[0] === 'curl');
    assert.equal(curls.length, 1);
    assert.equal(curls[0].preflight, true);
    assert.equal(curls[0].payload, false);
    assert.ok(calls.some(call =>
      call.args.join(' ') === `remove ${previewDeploymentId} --yes`));
    assert.deepEqual(calls
      .filter(call => call.args[0] === 'env' && call.args[1] === 'rm')
      .map(call => call.args[2])
      .sort(), [
      'GRH_DIRECTORY_ALLOWED_USER_IDS',
      'GRH_DIRECTORY_BOOTSTRAP_SECRET',
    ].sort());
    const persisted = await readState(fixture.prepared.statePath);
    assert.equal(persisted.status, 'prepared');
    assert.equal(persisted.deployment, null);
  } finally {
    await fixture.cleanup();
  }
});

test('preview provenance comes from one exact list entry and rejects drift before preflight', async () => {
  const valid = previewDeploymentList().deployments[0];
  const scenarios = [
    {
      name: 'wrong SHA',
      deployments: [{ ...valid, meta: { ...valid.meta, githubCommitSha: 'e'.repeat(40) } }],
    },
    {
      name: 'wrong ref',
      deployments: [{ ...valid, meta: { ...valid.meta, githubCommitRef: 'codex/other-preview' } }],
    },
    {
      name: 'missing SHA',
      deployments: [{
        ...valid,
        meta: { githubCommitRef: valid.meta.githubCommitRef },
      }],
    },
    {
      name: 'missing ref',
      deployments: [{
        ...valid,
        meta: { githubCommitSha: valid.meta.githubCommitSha },
      }],
    },
    { name: 'not ready in list', deployments: [{ ...valid, state: 'BUILDING' }] },
    { name: 'conflicting list target', deployments: [{ ...valid, target: 'production' }] },
    { name: 'missing exact URL', deployments: [] },
    { name: 'duplicate exact URL', deployments: [valid, { ...valid }] },
    { name: 'conflicting optional ID', deployments: [{ ...valid, id: 'dpl_other_preview' }] },
  ];

  for (const scenario of scenarios) {
    const fixture = await makePreviewFixture();
    try {
      const state = await readState(fixture.prepared.statePath);
      const calls = [];
      const runner = (command, args, options = {}) => {
        calls.push({ command, args: [...args] });
        if (command === 'git') return previewPinnedGitCommand(args, options, { state });
        if (args[0] === 'link') return { stdout: '', stderr: '' };
        if (args[0] === 'env' && args[1] === 'ls') {
          const global = args.length === 4;
          const keys = global ? inheritedPreviewEnvironment : branchPreviewDatabaseEnvironment;
          const gitBranch = global ? null : previewBranch;
          return jsonResult({ envs: keys.map(key => ({ key, gitBranch })) });
        }
        if (args[0] === 'env' && ['add', 'rm'].includes(args[1])) {
          return { stdout: '', stderr: '' };
        }
        if (args[0] === 'deploy') {
          return jsonResult({ id: previewDeploymentId, url: previewDeploymentUrl });
        }
        if (args[0] === 'inspect' && args[1] === STABLE_PRODUCTION_URL) {
          return jsonResult({
            id: 'dpl_stable',
            url: STABLE_PRODUCTION_URL,
            status: 'READY',
            target: 'production',
          });
        }
        if (args[0] === 'inspect') return jsonResult(previewDeploymentInspection());
        if (args[0] === 'ls') return jsonResult({ deployments: scenario.deployments });
        if (args[0] === 'remove') return { stdout: '', stderr: '' };
        assert.fail(`unexpected ${scenario.name} command: ${args.join(' ')}`);
      };

      await assert.rejects(() => applyPreparedBootstrap({
        statePath: fixture.prepared.statePath,
        runner,
        securePathImpl: async () => {},
      }), error => error?.code === 'BOOTSTRAP_PREVIEW_DEPLOYMENT_INVALID');
      assert.equal(calls.some(call => call.args[0] === 'curl'), false);
      assert.ok(calls.some(call =>
        call.args.join(' ') === `remove ${previewDeploymentId} --yes`));
      const persisted = await readState(fixture.prepared.statePath);
      assert.equal(persisted.status, 'prepared');
      assert.equal(persisted.deployment, null);
    } finally {
      await fixture.cleanup();
    }
  }
});

test('preview inspect is bound to the exact deployment output before list provenance', async () => {
  const alternateUrl = 'https://municipio-junin-preview-other.vercel.app';
  const scenarios = [
    {
      name: 'different deployment ID',
      inspection: { ...previewDeploymentInspection(), id: 'dpl_other_preview' },
    },
    {
      name: 'different immutable URL',
      inspection: { ...previewDeploymentInspection(), url: alternateUrl },
    },
    {
      name: 'not ready',
      inspection: { ...previewDeploymentInspection(), status: 'BUILDING' },
    },
    {
      name: 'wrong target',
      inspection: { ...previewDeploymentInspection(), target: 'production' },
    },
    {
      name: 'stable baseline substitution',
      inspection: { ...previewDeploymentInspection(), id: 'dpl_stable' },
    },
  ];

  for (const scenario of scenarios) {
    const fixture = await makePreviewFixture();
    try {
      const state = await readState(fixture.prepared.statePath);
      const calls = [];
      const runner = (command, args, options = {}) => {
        calls.push({ command, args: [...args] });
        if (command === 'git') return previewPinnedGitCommand(args, options, { state });
        if (args[0] === 'link') return { stdout: '', stderr: '' };
        if (args[0] === 'env' && args[1] === 'ls') {
          const global = args.length === 4;
          const keys = global ? inheritedPreviewEnvironment : branchPreviewDatabaseEnvironment;
          const gitBranch = global ? null : previewBranch;
          return jsonResult({ envs: keys.map(key => ({ key, gitBranch })) });
        }
        if (args[0] === 'env' && ['add', 'rm'].includes(args[1])) {
          return { stdout: '', stderr: '' };
        }
        if (args[0] === 'deploy') {
          return jsonResult({ id: previewDeploymentId, url: previewDeploymentUrl });
        }
        if (args[0] === 'inspect' && args[1] === STABLE_PRODUCTION_URL) {
          return jsonResult({
            id: 'dpl_stable',
            url: STABLE_PRODUCTION_URL,
            status: 'READY',
            target: 'production',
          });
        }
        if (args[0] === 'inspect') return jsonResult(scenario.inspection);
        if (args[0] === 'remove') return { stdout: '', stderr: '' };
        assert.notEqual(args[0], 'ls', `${scenario.name} must fail before list provenance`);
        assert.fail(`unexpected ${scenario.name} command: ${args.join(' ')}`);
      };

      await assert.rejects(() => applyPreparedBootstrap({
        statePath: fixture.prepared.statePath,
        runner,
        securePathImpl: async () => {},
      }), error => error?.code === 'BOOTSTRAP_PREVIEW_DEPLOYMENT_INVALID');
      assert.equal(calls.some(call => call.args[0] === 'ls'), false);
      assert.equal(calls.some(call => call.args[0] === 'curl'), false);
      assert.ok(calls.some(call =>
        call.args.join(' ') === `remove ${previewDeploymentId} --yes`));
      const persisted = await readState(fixture.prepared.statePath);
      assert.equal(persisted.status, 'prepared');
      assert.equal(persisted.deployment, null);
    } finally {
      await fixture.cleanup();
    }
  }
});

test('preview apply accepts inherited runtime envs but fails closed when one is absent everywhere', async () => {
  const fixture = await makePreviewFixture();
  try {
    const state = await readState(fixture.prepared.statePath);
    const calls = [];
    const runner = (command, args, options = {}) => {
      calls.push({ command, args: [...args] });
      if (command === 'git') return previewPinnedGitCommand(args, options, { state });
      if (args[0] === 'link') return { stdout: '', stderr: '' };
      if (args[0] === 'env' && args[1] === 'ls') {
        if (args.length === 4) {
          return jsonResult({
            envs: inheritedPreviewEnvironment
              .filter(key => key !== 'JWT_SECRET')
              .map(key => ({ key, gitBranch: null })),
          });
        }
        return jsonResult({
          envs: branchPreviewDatabaseEnvironment.map(key => ({ key, gitBranch: previewBranch })),
        });
      }
      assert.fail('missing Preview runtime env reached a mutating command');
    };
    await assert.rejects(
      () => applyPreparedBootstrap({
        statePath: fixture.prepared.statePath,
        runner,
        securePathImpl: async () => {},
      }),
      error => error?.code === 'BOOTSTRAP_PREVIEW_ENVIRONMENT_INCOMPLETE',
    );
    assert.deepEqual(calls
      .filter(call => call.args[0] === 'env' && call.args[1] === 'ls')
      .map(call => call.args), [
      ['env', 'ls', 'preview', '--json'],
      ['env', 'ls', 'preview', previewBranch, '--json'],
    ]);
    assert.equal(calls.some(call => call.args[0] === 'env' && call.args[1] === 'run'), false);
    assert.equal(calls.some(call =>
      call.args[0] === 'env' && ['add', 'rm'].includes(call.args[1])), false);
    assert.equal(calls.some(call => call.args[0] === 'deploy'), false);
    assert.equal(calls.some(call => call.args[0] === 'curl'), false);
    assert.equal((await readState(fixture.prepared.statePath)).status, 'prepared');
  } finally {
    await fixture.cleanup();
  }
});

test('preview apply requires DATABASE_URL and DIRECT_URL on the exact branch even if global Preview has them', async () => {
  const fixture = await makePreviewFixture();
  try {
    const state = await readState(fixture.prepared.statePath);
    const calls = [];
    const runner = (command, args, options = {}) => {
      calls.push({ command, args: [...args] });
      if (command === 'git') return previewPinnedGitCommand(args, options, { state });
      if (args[0] === 'link') return { stdout: '', stderr: '' };
      if (args[0] === 'env' && args[1] === 'ls') {
        if (args.length === 4) {
          return jsonResult({
            envs: requiredPreviewEnvironment.map(key => ({ key, gitBranch: null })),
          });
        }
        return jsonResult({ envs: [{ key: 'DATABASE_URL', gitBranch: previewBranch }] });
      }
      assert.fail('missing branch database override reached a mutating command');
    };
    await assert.rejects(
      () => applyPreparedBootstrap({
        statePath: fixture.prepared.statePath,
        runner,
        securePathImpl: async () => {},
      }),
      error => error?.code === 'BOOTSTRAP_PREVIEW_BRANCH_DATABASE_INCOMPLETE',
    );
    assert.deepEqual(calls
      .filter(call => call.args[0] === 'env' && call.args[1] === 'ls')
      .map(call => call.args), [
      ['env', 'ls', 'preview', '--json'],
      ['env', 'ls', 'preview', previewBranch, '--json'],
    ]);
    assert.equal(calls.some(call => call.args[0] === 'env' && call.args[1] === 'run'), false);
    assert.equal(calls.some(call =>
      call.args[0] === 'env' && ['add', 'rm'].includes(call.args[1])), false);
    assert.equal(calls.some(call => call.args[0] === 'deploy'), false);
    assert.equal(calls.some(call => call.args[0] === 'curl'), false);
    assert.equal((await readState(fixture.prepared.statePath)).status, 'prepared');
  } finally {
    await fixture.cleanup();
  }
});

test('preview apply rejects temporary bootstrap secrets in global or branch inventory without exposing values', async () => {
  const scenarios = [
    { scope: 'global', key: 'GRH_DIRECTORY_ALLOWED_USER_IDS' },
    { scope: 'branch', key: 'GRH_DIRECTORY_BOOTSTRAP_SECRET' },
  ];
  for (const scenario of scenarios) {
    const fixture = await makePreviewFixture();
    try {
      const state = await readState(fixture.prepared.statePath);
      const calls = [];
      const sentinel = `must-not-leak-${scenario.scope}`;
      const runner = (command, args, options = {}) => {
        calls.push({ command, args: [...args] });
        if (command === 'git') return previewPinnedGitCommand(args, options, { state });
        if (args[0] === 'link') return { stdout: '', stderr: '' };
        if (args[0] === 'env' && args[1] === 'ls') {
          const global = args.length === 4;
          const keys = global ? inheritedPreviewEnvironment : branchPreviewDatabaseEnvironment;
          const gitBranch = global ? null : previewBranch;
          const envs = keys.map(key => ({ key, gitBranch }));
          if ((global && scenario.scope === 'global') || (!global && scenario.scope === 'branch')) {
            envs.push({ key: scenario.key, gitBranch, value: sentinel });
          }
          return jsonResult({ envs });
        }
        assert.fail(`${scenario.scope} temporary secret reached a mutating command`);
      };
      let rejection;
      await assert.rejects(
        () => applyPreparedBootstrap({
          statePath: fixture.prepared.statePath,
          runner,
          securePathImpl: async () => {},
        }),
        error => {
          rejection = error;
          return error?.code === 'BOOTSTRAP_ENV_ALREADY_CONFIGURED';
        },
      );
      assert.equal(calls.some(call => call.args[0] === 'env' && call.args[1] === 'run'), false);
      assert.equal(calls.some(call =>
        call.args[0] === 'env' && ['add', 'rm'].includes(call.args[1])), false);
      assert.equal(calls.some(call => call.args[0] === 'deploy'), false);
      assert.equal(calls.some(call => call.args[0] === 'curl'), false);
      assert.equal(JSON.stringify(calls).includes(sentinel), false);
      assert.equal(JSON.stringify(rejection).includes(sentinel), false);
      assert.equal((await readState(fixture.prepared.statePath)).status, 'prepared');
    } finally {
      await fixture.cleanup();
    }
  }
});

test('Preview state cannot enter Production verification or finalization', async () => {
  const fixture = await makePreviewFixture();
  try {
    await assert.rejects(
      () => verifyProductionBootstrap({
        statePath: fixture.prepared.statePath,
        runner: () => assert.fail('Preview must fail before Vercel Production inspection'),
        securePathImpl: async () => {},
      }),
      error => typeof error?.code === 'string' && error.code.startsWith('BOOTSTRAP_'),
    );
    await assert.rejects(
      () => finalizeProductionBootstrap({
        statePath: fixture.prepared.statePath,
        securePathImpl: async () => {},
      }),
      error => typeof error?.code === 'string' && error.code.startsWith('BOOTSTRAP_'),
    );
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
        return protectedCurlResult(bootstrapAppliedBody(state), 201, 'grh-directory-bootstrap-v3');
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
      return protectedCurlResult(bootstrapAppliedBody(state), 201, 'grh-directory-bootstrap-v3');
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
    if (route === '/api/grh-directory?company=101&legajo=1001') {
      assert.ok(options.input.includes('X-MuniControl-Purpose: PERSON_LOOKUP'));
      return protectedCurlResult(detailResponseFixture(), 200, 'grh-directory-v3');
    }
    if (route === '/api/grh-directory?limit=1' ||
        route === '/api/grh-directory?limit=1&hasLeave=true' ||
        route === '/api/grh-directory?limit=1&hasAbsence=true' ||
        route === '/api/grh-directory?limit=1&hasMovement=true' ||
        route === '/api/grh-directory?limit=1&reportedStatus=current_by_reported_dates' ||
        route === '/api/grh-directory?limit=1&contractRegime=1' ||
        route === '/api/grh-directory?limit=1&serviceSituation=2') {
      assert.ok(options.input.includes('X-MuniControl-Purpose: DIRECTORY_BROWSE'));
      return protectedCurlResult(responseFixture(), 200, 'grh-directory-v3');
    }
    assert.fail('unexpected protected route');
  };
}

test('apply preserves a safe migration-stage diagnostic without persisting response details', async () => {
  const fixture = await ambiguousFixture({
    receiptBody: { ok: false, code: 'BOOTSTRAP_INTERNAL_MIGRATION', pgCode: '42601' },
    receiptStatus: 500,
    receiptContract: 'grh-directory-bootstrap-v3',
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
      }, 500, 'grh-directory-bootstrap-v3');
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
      return protectedCurlResult(bootstrapAppliedBody(state), 201, 'grh-directory-bootstrap-v3');
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
      return protectedCurlResult({ ok: false, code: 'BOOTSTRAP_ALREADY_CONSUMED' }, 410, 'grh-directory-bootstrap-v3');
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
      schemaVersion: 'grh-directory-v3',
      snapshotAsOf: '2026-08-06',
      recordCount: 1,
      absenceAvailable: true,
      leaveAvailable: true,
      movementAvailable: true,
      positionObservationAvailable: true,
      employmentAvailable: true,
      nominalAiVerified: true,
    });
    assert.equal(calls.length, 12);
    assert.ok(calls.some(call => call.args[1] === '/api/grh-directory?limit=1&hasLeave=true'));
    assert.ok(calls.some(call => call.args[1] === '/api/grh-directory?limit=1&hasAbsence=true'));
    assert.ok(calls.some(call => call.args[1] === '/api/grh-directory?limit=1&hasMovement=true'));
    assert.ok(calls.some(call => call.args[1] ===
      '/api/grh-directory?limit=1&reportedStatus=current_by_reported_dates'));
    assert.ok(calls.some(call => call.args[1] === '/api/grh-directory?limit=1&contractRegime=1'));
    assert.ok(calls.some(call => call.args[1] === '/api/grh-directory?limit=1&serviceSituation=2'));
    assert.equal(calls.filter(call => call.args[1] === '/api/grh-directory?company=101&legajo=1001').length, 3);
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
    assert.equal(calls.length, 12);
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
  assert.match(result.stdout, /--target preview/);
  assert.match(result.stdout, /--preview-branch/);
  assert.match(result.stdout, /--database-target-sha256/);
  assert.match(result.stdout, /--stable-database-target-sha256/);
  assert.match(result.stdout, /DDL/i);
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

test('database fingerprint helper emits only one opaque hash and never the connection secret', () => {
  const password = 'preview-database-password-must-never-print';
  const directUrl =
    `postgresql://preview_role:${password}` +
    '@ep-preview-a1b2c3.us-east-2.aws.neon.tech/municontrol?sslmode=verify-full';
  const result = spawnSync(process.execPath, ['scripts/print-database-target-fingerprint.mjs'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, DIRECT_URL: directUrl },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^__MUNICTRL_DATABASE_TARGET__[0-9a-f]{64}\n$/);
  assert.equal(result.stderr, '');
  assert.equal((result.stdout + result.stderr).includes(password), false);
  assert.doesNotMatch(result.stdout + result.stderr, /postgres(?:ql)?:\/\//i);
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
