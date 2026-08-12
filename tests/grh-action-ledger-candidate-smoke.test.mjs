import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DISPOSABLE_MUTATION_SCOPE,
  LEDGER_CONTRACT,
  LedgerCandidateSmokeError,
  SMOKE_CONTRACT,
  buildProtectedCurlConfig,
  createVercelRequester,
  inspectCandidateDeployment,
  resolveCandidateSmokeConfiguration,
  runLedgerCandidateSmoke,
  safeFailure,
} from '../scripts/grh-action-ledger-candidate-smoke-lib.mjs';
import { buildGrhActionLedgerEvidence, buildGrhActionLedgerProjection } from
  '../api/lib/grh-action-ledger-projection.js';
import { buildGrhCloseProjection } from '../api/lib/grh-close-projection.js';
import { buildGrhDecisionBriefProjection } from '../api/lib/grh-decision-brief-projection.js';
import { buildGrhExecutiveProjection } from '../api/lib/grh-executive-projection.js';
import { buildGrhQualityProjection } from '../api/lib/grh-quality-projection.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidateUrl = 'https://municipio-junin-ledger-candidate-a1b2c3.vercel.app';
const deploymentId = 'dpl_LedgerCandidate123';
const stableDeploymentId = 'dpl_StableProduction123';
const gitSha = 'a'.repeat(40);
const fingerprint = 'b'.repeat(64);
const privateIntendenteEmail = 'ledger-intendente@private.example';
const privateContadorEmail = 'ledger-contador@private.example';
const demoEmail = 'admin@junin.gov.ar';
const intendentePassword = 'intendente-secret-not-for-output';
const contadorPassword = 'contador-secret-not-for-output';
const demoPassword = 'demo-secret-not-for-output';
const now = new Date('2026-08-11T18:00:00.000Z');

function environment(overrides = {}) {
  return {
    MUNICONTROL_LEDGER_CANDIDATE_URL: candidateUrl,
    MUNICONTROL_LEDGER_CANDIDATE_DEPLOYMENT_ID: deploymentId,
    MUNICONTROL_LEDGER_EXPECTED_GIT_SHA: gitSha,
    MUNICONTROL_LEDGER_INTENDENTE_EMAIL: privateIntendenteEmail,
    MUNICONTROL_LEDGER_INTENDENTE_PASSWORD: intendentePassword,
    MUNICONTROL_LEDGER_CONTADOR_EMAIL: privateContadorEmail,
    MUNICONTROL_LEDGER_CONTADOR_PASSWORD: contadorPassword,
    MUNICONTROL_LEDGER_DEMO_EMAIL: demoEmail,
    MUNICONTROL_LEDGER_DEMO_PASSWORD: demoPassword,
    ...overrides,
  };
}

function assertCode(fn, code) {
  assert.throws(fn, error => error instanceof LedgerCandidateSmokeError && error.code === code);
}

function response({
  status = 200,
  body = {},
  contract = null,
  databaseTargetFingerprint = null,
  contentType = 'application/json; charset=utf-8',
} = {}) {
  return Object.freeze({
    status,
    contract,
    databaseTargetFingerprint,
    contentType,
    effectiveUrl: candidateUrl,
    rawBody: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function realBrief() {
  const [profile, semantic] = await Promise.all([
    readFile(new URL('../api/_data/grh-profile.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../api/_data/grh-semantic.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  return buildGrhDecisionBriefProjection(
    buildGrhExecutiveProjection(semantic),
    buildGrhQualityProjection(profile, semantic),
    buildGrhCloseProjection(semantic),
  );
}

function uuidFor(index) {
  const hex = String(index).padStart(12, '0');
  return `10000000-0000-4000-8000-${hex}`;
}

async function statefulRequestHarness(databaseTargetFingerprint = fingerprint) {
  const brief = await realBrief();
  const evidence = buildGrhActionLedgerEvidence(brief, 'cross_source_material_difference');
  const sessions = new Map([
    [privateIntendenteEmail, {
      token: `token-intendente-${'i'.repeat(40)}`,
      user: { id: 'private-intendente-user', email: privateIntendenteEmail, role: 'INTENDENTE', tenantId: 'tenant-junin' },
      publishedDemo: false,
    }],
    [privateContadorEmail, {
      token: `token-contador-${'c'.repeat(40)}`,
      user: { id: 'private-contador-user', email: privateContadorEmail, role: 'CONTADOR', tenantId: 'tenant-junin' },
      publishedDemo: false,
    }],
    [demoEmail, {
      token: `token-demo-${'d'.repeat(40)}`,
      user: { id: 'published-demo-user', email: demoEmail, role: 'TENANT_ADMIN', tenantId: 'tenant-junin' },
      publishedDemo: true,
    }],
  ]);
  const sessionByToken = new Map([...sessions.values()].map(session => [session.token, session]));
  const passwords = new Map([
    [privateIntendenteEmail, intendentePassword],
    [privateContadorEmail, contadorPassword],
    [demoEmail, demoPassword],
  ]);
  const commands = new Set();
  const calls = [];
  let row = null;

  function projection(session) {
    return buildGrhActionLedgerProjection({
      brief,
      commitments: row ? [structuredClone(row)] : [],
      caller: session.user,
      publishedDemo: session.publishedDemo,
      now: () => now,
    });
  }

  function publicResponse(session, status = 200) {
    return response({
      status,
      contract: LEDGER_CONTRACT,
      databaseTargetFingerprint,
      body: projection(session),
    });
  }

  function event(input, session, command, fromState, toState, resultVersion, extra = {}) {
    return {
      eventId: uuidFor(resultVersion + 10),
      commandId: input.commandId,
      command,
      actorUserId: session.user.id,
      actorRole: session.user.role,
      fromState,
      toState,
      reasonCode: extra.reasonCode ?? null,
      outcomeCode: extra.outcomeCode ?? null,
      dueOn: extra.dueOn ?? null,
      expectedVersion: resultVersion - 1,
      resultVersion,
      occurredAt: new Date(now.getTime() + resultVersion * 60_000).toISOString(),
    };
  }

  const request = async ({ route, method = 'GET', headers = {}, jsonBody }) => {
    calls.push({ route, method, headers: structuredClone(headers), jsonBody: structuredClone(jsonBody) });
    if (route === '/decisiones-grh') {
      return response({
        body: await readFile(path.join(root, 'decisiones-grh.html'), 'utf8'),
        contentType: 'text/html; charset=utf-8',
      });
    }
    if (route === '/api/auth/login') {
      const session = sessions.get(jsonBody?.email);
      if (!session || passwords.get(jsonBody.email) !== jsonBody.password) return response({ status: 401 });
      return response({ body: { token: session.token, user: session.user } });
    }
    const token = String(headers.Authorization || '').replace(/^Bearer /, '');
    const session = sessionByToken.get(token);
    if (!session) return response({ status: 401 });
    if (route !== '/api/grh-action-ledger') return response({ status: 404 });
    if (method === 'GET') return publicResponse(session);
    if (session.publishedDemo || (method === 'POST' && session.user.role !== 'INTENDENTE')) {
      return response({ status: 403, contract: LEDGER_CONTRACT, body: { code: 'ROUTE_PERMISSION_DENIED' } });
    }
    if (method === 'POST') {
      if (commands.has(jsonBody.commandId)) return publicResponse(session, 200);
      if (row !== null) return response({ status: 409, contract: LEDGER_CONTRACT });
      commands.add(jsonBody.commandId);
      row = {
        id: uuidFor(1),
        brief: { schemaVersion: brief.schemaVersion, policyVersion: brief.policyVersion },
        source: {
          sha256: evidence.sourceSha256,
          snapshotAsOf: evidence.snapshotAsOf,
          period: evidence.period,
          evidenceDigest: evidence.evidenceDigest,
        },
        priority: {
          code: 'cross_source_material_difference',
          severity: 'critical',
          actionCode: 'review_cross_source_reconciliation',
        },
        state: 'OPEN',
        assigneeRole: 'CONTADOR',
        ownerUserId: null,
        dueOn: jsonBody.dueOn,
        version: 1,
        outcomeCode: null,
        createdAt: new Date(now.getTime() + 60_000).toISOString(),
        updatedAt: new Date(now.getTime() + 60_000).toISOString(),
        events: [event(jsonBody, session, 'create', null, 'OPEN', 1, { dueOn: jsonBody.dueOn })],
        replayed: false,
      };
      return publicResponse(session, 201);
    }
    if (method === 'PATCH') {
      if (commands.has(jsonBody.commandId)) return publicResponse(session);
      if (!row || row.id !== jsonBody.commitmentId) return response({ status: 404, contract: LEDGER_CONTRACT });
      if (jsonBody.command === 'reschedule' && session.user.role === 'INTENDENTE' && row.version === 1) {
        commands.add(jsonBody.commandId);
        row.dueOn = jsonBody.dueOn;
        row.version = 2;
        row.updatedAt = new Date(now.getTime() + 120_000).toISOString();
        row.events.push(event(jsonBody, session, 'reschedule', 'OPEN', 'OPEN', 2, { dueOn: jsonBody.dueOn }));
        return publicResponse(session);
      }
      if (jsonBody.command === 'claim' && session.user.role === 'CONTADOR' && row.version === 2) {
        commands.add(jsonBody.commandId);
        row.state = 'IN_PROGRESS';
        row.ownerUserId = session.user.id;
        row.version = 3;
        row.updatedAt = new Date(now.getTime() + 180_000).toISOString();
        row.events.push(event(jsonBody, session, 'claim', 'OPEN', 'IN_PROGRESS', 3));
        return publicResponse(session);
      }
      if (jsonBody.command === 'complete' && session.user.role === 'CONTADOR' && row.version === 3) {
        commands.add(jsonBody.commandId);
        row.state = 'COMPLETED';
        row.version = 4;
        row.outcomeCode = 'review_completed';
        row.updatedAt = new Date(now.getTime() + 240_000).toISOString();
        row.events.push(event(jsonBody, session, 'complete', 'IN_PROGRESS', 'COMPLETED', 4, {
          outcomeCode: 'review_completed',
        }));
        return publicResponse(session);
      }
      return response({ status: 409, contract: LEDGER_CONTRACT });
    }
    return response({ status: 405, contract: LEDGER_CONTRACT });
  };
  return { request, calls };
}

const candidateInspection = async ({ config }) => Object.freeze({
  deploymentId: config.deploymentId,
  gitSha: config.gitSha,
  target: 'preview',
  candidateUrl: config.candidateUrl,
  stableAliasDeploymentId: stableDeploymentId,
});

const productionCandidateInspection = async ({ config }) => Object.freeze({
  deploymentId: config.deploymentId,
  gitSha: config.gitSha,
  target: 'production',
  candidateUrl: config.candidateUrl,
  stableAliasDeploymentId: stableDeploymentId,
});

test('configuration defaults to read-only and mutation is impossible without both disposable proofs', () => {
  const readOnly = resolveCandidateSmokeConfiguration([], environment({
    MUNICONTROL_LEDGER_DISPOSABLE_TARGET_FINGERPRINT: fingerprint,
  }));
  assert.equal(readOnly.mode, 'read_only');
  assert.equal(readOnly.disposableTargetFingerprint, null);
  assert.equal(readOnly.credentials.intendente.password, intendentePassword);

  assertCode(() => resolveCandidateSmokeConfiguration(['--mutate-disposable'], environment()),
    'LEDGER_SMOKE_DISPOSABLE_SCOPE_REQUIRED');
  assertCode(() => resolveCandidateSmokeConfiguration(['--mutate-disposable'], environment({
    MUNICONTROL_LEDGER_MUTATION_SCOPE: DISPOSABLE_MUTATION_SCOPE,
  })), 'LEDGER_SMOKE_DISPOSABLE_FINGERPRINT_REQUIRED');
  const mutation = resolveCandidateSmokeConfiguration(['--mutate-disposable'], environment({
    MUNICONTROL_LEDGER_MUTATION_SCOPE: DISPOSABLE_MUTATION_SCOPE,
    MUNICONTROL_LEDGER_DISPOSABLE_TARGET_FINGERPRINT: fingerprint,
  }));
  assert.equal(mutation.mode, 'mutate_disposable');
  assert.equal(mutation.disposableTargetFingerprint, fingerprint);

  assertCode(() => resolveCandidateSmokeConfiguration([], environment({
    MUNICONTROL_LEDGER_CANDIDATE_URL: 'https://municipio-junin.vercel.app',
  })), 'LEDGER_SMOKE_CANDIDATE_URL_INVALID');
  assertCode(() => resolveCandidateSmokeConfiguration([], environment({
    MUNICONTROL_LEDGER_CANDIDATE_URL: 'https://user:password@candidate.vercel.app',
  })), 'LEDGER_SMOKE_CANDIDATE_URL_INVALID');
});

test('candidate inspection pins unique READY Preview or production candidate, ID and Git SHA', () => {
  const config = resolveCandidateSmokeConfiguration([], environment());
  const calls = [];
  const runner = (_command, args) => {
    calls.push(args);
    if (args[0] === 'inspect' && args[1] === 'https://municipio-junin.vercel.app') {
      return {
        stdout: JSON.stringify({
          id: stableDeploymentId,
          readyState: 'READY',
          target: 'production',
        }),
        stderr: '',
      };
    }
    if (args[0] === 'inspect') return {
      stdout: JSON.stringify({
        id: deploymentId,
        url: candidateUrl,
        readyState: 'READY',
        target: 'preview',
        meta: { githubCommitSha: gitSha },
      }),
      stderr: '',
    };
    return {
      stdout: JSON.stringify({ deployments: [{
        url: candidateUrl,
        readyState: 'READY',
        target: 'preview',
        meta: { githubCommitSha: gitSha },
      }] }),
      stderr: '',
    };
  };
  assert.deepEqual(inspectCandidateDeployment({ runner, config, cwd: root }), {
    deploymentId,
    gitSha,
    target: 'preview',
    candidateUrl,
    stableAliasDeploymentId: stableDeploymentId,
  });
  assert.equal(calls.length, 4);
  assert.equal(calls.flat().some(value => [intendentePassword, contadorPassword, demoPassword].includes(value)), false);

  const productionRunner = (_command, args) => ({
    stdout: JSON.stringify(args[0] === 'inspect' &&
      args[1] === 'https://municipio-junin.vercel.app' ? {
        id: stableDeploymentId,
        readyState: 'READY',
        target: 'production',
      } : args[0] === 'inspect' ? {
      id: deploymentId,
      url: candidateUrl,
      readyState: 'READY',
      target: 'production',
      meta: { githubCommitSha: gitSha },
    } : [{
      url: candidateUrl,
      readyState: 'READY',
      target: 'production',
      meta: { githubCommitSha: gitSha },
    }]),
    stderr: '',
  });
  assert.equal(inspectCandidateDeployment({ runner: productionRunner, config, cwd: root }).target,
    'production');

  const mutationConfig = resolveCandidateSmokeConfiguration(['--mutate-disposable'], environment({
    MUNICONTROL_LEDGER_MUTATION_SCOPE: DISPOSABLE_MUTATION_SCOPE,
    MUNICONTROL_LEDGER_DISPOSABLE_TARGET_FINGERPRINT: fingerprint,
  }));
  assertCode(() => inspectCandidateDeployment({
    runner: productionRunner,
    config: mutationConfig,
    cwd: root,
  }), 'LEDGER_SMOKE_MUTATION_REQUIRES_PREVIEW');

  const promotedRunner = (_command, args) => ({
    stdout: JSON.stringify(args[0] === 'inspect' ? {
      id: deploymentId,
      readyState: 'READY',
      target: 'production',
    } : []),
    stderr: '',
  });
  assertCode(() => inspectCandidateDeployment({ runner: promotedRunner, config, cwd: root }),
    'LEDGER_SMOKE_CANDIDATE_ALREADY_PROMOTED');

  let stableInspections = 0;
  const movedAliasRunner = (_command, args) => {
    if (args[0] === 'inspect' && args[1] === 'https://municipio-junin.vercel.app') {
      stableInspections += 1;
      return {
        stdout: JSON.stringify({
          id: stableInspections === 1 ? stableDeploymentId : 'dpl_UnexpectedStable456',
          readyState: 'READY',
          target: 'production',
        }),
        stderr: '',
      };
    }
    return {
      stdout: JSON.stringify({
        id: deploymentId,
        url: candidateUrl,
        readyState: 'READY',
        target: 'preview',
        meta: { githubCommitSha: gitSha },
      }),
      stderr: '',
    };
  };
  assertCode(() => inspectCandidateDeployment({ runner: movedAliasRunner, config, cwd: root }),
    'LEDGER_SMOKE_STABLE_ALIAS_MOVED');
});

test('vercel curl keeps password and bearer material in stdin and parses only bounded response metadata', () => {
  const config = resolveCandidateSmokeConfiguration([], environment());
  const calls = [];
  const secretToken = `secret-token-${'x'.repeat(40)}`;
  const runner = (command, args, options) => {
    calls.push({ command, args, options });
    return {
      stdout: `${JSON.stringify({ ok: true })}\n__MUNICTRL_LEDGER_SMOKE__200|${LEDGER_CONTRACT}|${fingerprint}|application/json; charset=utf-8|${candidateUrl}/api/grh-action-ledger`,
      stderr: '',
    };
  };
  const request = createVercelRequester({ runner, config, cwd: root });
  const parsed = request({
    route: '/api/grh-action-ledger',
    method: 'POST',
    headers: { Authorization: `Bearer ${secretToken}`, 'Content-Type': 'application/json' },
    jsonBody: { password: intendentePassword },
  });
  assert.equal(parsed.status, 200);
  assert.equal(parsed.contract, LEDGER_CONTRACT);
  assert.equal(parsed.databaseTargetFingerprint, fingerprint);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.join(' ').includes(secretToken), false);
  assert.equal(calls[0].args.join(' ').includes(intendentePassword), false);
  assert.match(calls[0].options.input, new RegExp(secretToken));
  assert.match(calls[0].options.input, new RegExp(intendentePassword));
  const curlConfig = buildProtectedCurlConfig({ method: 'PATCH', headers: {}, jsonBody: {} });
  assert.match(curlConfig, /request = "PATCH"/);
  assert.doesNotMatch(JSON.stringify(safeFailure(new Error(`${secretToken}:${intendentePassword}`))),
    new RegExp(`${secretToken}|${intendentePassword}`));
});

test('read-only production candidate verifies UI and roles with zero ledger mutations before promote', async () => {
  const config = resolveCandidateSmokeConfiguration([], environment());
  const harness = await statefulRequestHarness();
  const receipt = await runLedgerCandidateSmoke({
    config,
    cwd: root,
    inspectCandidateImpl: productionCandidateInspection,
    requestImpl: harness.request,
    now: () => now,
  });
  assert.equal(receipt.schemaVersion, SMOKE_CONTRACT);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.mode, 'read_only');
  assert.equal(receipt.candidate.target, 'production');
  assert.equal(receipt.candidate.stableAliasDeploymentId, stableDeploymentId);
  assert.equal(receipt.candidate.disposableTargetFingerprint, null);
  assert.equal(receipt.evidence.databaseTargetFingerprintSha256, fingerprint);
  assert.equal(receipt.evidence.replayVerified, false);
  assert.ok(receipt.checks.some(check => check.id === 'candidate_ready_production_unique'));
  assert.deepEqual(receipt.checks.find(check =>
    check.id === 'stable_alias_unchanged_not_candidate'), {
    id: 'stable_alias_unchanged_not_candidate', status: 'passed',
  });
  assert.equal(harness.calls.filter(call =>
    call.route === '/api/grh-action-ledger' && ['POST', 'PATCH'].includes(call.method)).length, 0);
  assert.deepEqual(harness.calls.filter(call => call.method === 'GET').map(call => call.route), [
    '/decisiones-grh',
    '/api/grh-action-ledger',
    '/api/grh-action-ledger',
    '/api/grh-action-ledger',
  ]);
});

test('mutation rejects a main-vs-child target mismatch before any ledger POST or PATCH', async () => {
  const config = resolveCandidateSmokeConfiguration(['--mutate-disposable'], environment({
    MUNICONTROL_LEDGER_MUTATION_SCOPE: DISPOSABLE_MUTATION_SCOPE,
    MUNICONTROL_LEDGER_DISPOSABLE_TARGET_FINGERPRINT: fingerprint,
  }));
  const childFingerprint = 'c'.repeat(64);
  const harness = await statefulRequestHarness(childFingerprint);
  let failure;
  try {
    await runLedgerCandidateSmoke({
      config,
      cwd: root,
      inspectCandidateImpl: candidateInspection,
      requestImpl: harness.request,
      now: () => now,
    });
  } catch (error) {
    failure = error;
  }

  assert.equal(failure?.code, 'LEDGER_SMOKE_DATABASE_TARGET_MISMATCH');
  assert.deepEqual(safeFailure(failure), {
    schemaVersion: SMOKE_CONTRACT,
    ok: false,
    code: 'LEDGER_SMOKE_DATABASE_TARGET_MISMATCH',
  });
  assert.equal(harness.calls.filter(call => call.route === '/api/grh-action-ledger' &&
    ['POST', 'PATCH'].includes(call.method)).length, 0);
  assert.equal(harness.calls.filter(call => call.route === '/api/grh-action-ledger' &&
    call.method === 'GET').length, 3);
  assert.doesNotMatch(JSON.stringify(safeFailure(failure)), new RegExp(`${fingerprint}|${childFingerprint}`));
});

test('disposable mutation smoke is idempotent and verifies POST replay, split ownership and history', async () => {
  const config = resolveCandidateSmokeConfiguration(['--mutate-disposable'], environment({
    MUNICONTROL_LEDGER_MUTATION_SCOPE: DISPOSABLE_MUTATION_SCOPE,
    MUNICONTROL_LEDGER_DISPOSABLE_TARGET_FINGERPRINT: fingerprint,
  }));
  const harness = await statefulRequestHarness();
  const first = await runLedgerCandidateSmoke({
    config,
    cwd: root,
    inspectCandidateImpl: candidateInspection,
    requestImpl: harness.request,
    now: () => now,
  });
  const second = await runLedgerCandidateSmoke({
    config,
    cwd: root,
    inspectCandidateImpl: candidateInspection,
    requestImpl: harness.request,
    now: () => new Date(now.getTime() + 60_000),
  });
  for (const receipt of [first, second]) {
    assert.equal(receipt.mode, 'mutate_disposable');
    assert.equal(receipt.candidate.stableAliasDeploymentId, stableDeploymentId);
    assert.equal(receipt.candidate.disposableTargetFingerprint, fingerprint);
    assert.equal(receipt.evidence.databaseTargetFingerprintSha256, fingerprint);
    assert.equal(receipt.evidence.replayVerified, true);
    assert.equal(receipt.evidence.historyEventCount, 4);
    assert.equal(receipt.evidence.historyVerifiedAcrossRoles, true);
    assert.ok(receipt.checks.some(check => check.id === 'contador_claim_complete'));
    const serialized = JSON.stringify(receipt);
    for (const forbidden of [intendentePassword, contadorPassword, demoPassword,
      'private-intendente-user', 'private-contador-user', 'published-demo-user', 'token-']) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
  }
  const successfulCreateCalls = harness.calls.filter(call =>
    call.route === '/api/grh-action-ledger' && call.method === 'POST' && call.jsonBody?.brief);
  assert.equal(successfulCreateCalls.length, 4, 'create and exact replay are repeated safely on both runs');
  assert.equal(successfulCreateCalls[0].jsonBody.commandId, successfulCreateCalls[3].jsonBody.commandId);
  const workflowPatches = harness.calls.filter(call => call.method === 'PATCH' && call.jsonBody?.command);
  assert.deepEqual(workflowPatches.map(call => call.jsonBody.command), [
    'reschedule', 'claim', 'complete', 'reschedule', 'claim', 'complete',
  ]);
});

test('script and runbook ownership remain separate from release truth and contain no credential values', async () => {
  const [manifestSource, runbook, scriptSource, libSource] = await Promise.all([
    readFile(path.join(root, 'package.json'), 'utf8'),
    readFile(path.join(root, 'docs', 'GRH_ACTION_LEDGER_CANDIDATE_SMOKE.md'), 'utf8'),
    readFile(path.join(root, 'scripts', 'grh-action-ledger-candidate-smoke.mjs'), 'utf8'),
    readFile(path.join(root, 'scripts', 'grh-action-ledger-candidate-smoke-lib.mjs'), 'utf8'),
  ]);
  const manifest = JSON.parse(manifestSource);
  assert.equal(manifest.scripts['smoke:grh-ledger:candidate'],
    'node scripts/grh-action-ledger-candidate-smoke.mjs');
  assert.equal(manifest.scripts['smoke:grh-ledger:candidate:mutate'],
    'node scripts/grh-action-ledger-candidate-smoke.mjs --mutate-disposable');
  assert.match(runbook, /read-only/i);
  assert.match(runbook, /--prod --skip-domain/);
  assert.match(runbook, /target `preview`\s+o `production`/i);
  assert.match(runbook, /DISPOSABLE_PREVIEW_LEDGER_V1/);
  assert.match(runbook, /no (?:ejecuta|existe)[\s\S]{0,20}(?:cleanup )?`DELETE`/i);
  assert.match(runbook, /Production estable[^.]{0,120}(?:rechaz|prohib)/i);
  assert.doesNotMatch(`${runbook}\n${scriptSource}\n${libSource}`,
    new RegExp(`${intendentePassword}|${contadorPassword}|${demoPassword}`));
  assert.doesNotMatch(scriptSource, /check-deployment-truth/);
});
