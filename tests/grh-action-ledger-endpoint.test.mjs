import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createGrhActionLedgerHandler,
  GRH_ACTION_LEDGER_SETUP_PENDING,
  GRH_ACTION_LEDGER_STATUS_HEADER,
  inspectGrhActionLedgerStorage,
} from '../api/grh-action-ledger.js';
import {
  DATABASE_TARGET_FINGERPRINT_HEADER,
  fingerprintDatabaseTarget,
} from '../api/lib/database-target-fingerprint.js';
import { GRH_ACTION_LEDGER_SCHEMA_VERSION, validateGrhActionLedgerContract } from
  '../api/lib/grh-action-ledger-contract.js';
import { buildGrhCloseProjection } from '../api/lib/grh-close-projection.js';
import { buildGrhDecisionBriefProjection } from '../api/lib/grh-decision-brief-projection.js';
import { buildGrhExecutiveProjection } from '../api/lib/grh-executive-projection.js';
import { buildGrhQualityProjection } from '../api/lib/grh-quality-projection.js';
import { digestGrhActionLedgerPayload } from '../api/lib/grh-action-ledger-projection.js';
import releaseTruthContract from '../shared/release-truth-contract.cjs';
import routePolicy from '../shared/route-policy.cjs';

process.env.GRH_TENANT_ID = 'tenant-junin-action-ledger-test';
delete process.env.GRH_SOURCE_SHA256;

const NOW = new Date('2026-08-11T12:00:00.000Z');
const DATABASE_URL = (() => {
  const url = new URL('postgresql://ep-ledger-main-a1b2c3-pooler.us-east-2.aws.neon.tech/municontrol?sslmode=verify-full');
  url.username = 'ledger-test';
  url.password = crypto.randomUUID();
  return url.toString();
})();
const DATABASE_TARGET_FINGERPRINT = fingerprintDatabaseTarget(DATABASE_URL);
const CREATE_COMMAND_ID = '11111111-1111-4111-8111-111111111111';
const COMMITMENT_ID = '22222222-2222-4222-8222-222222222222';
const CREATE_EVENT_ID = '33333333-3333-4333-8333-333333333333';
const CLAIM_COMMAND_ID = '44444444-4444-4444-8444-444444444444';
const CLAIM_EVENT_ID = '55555555-5555-4555-8555-555555555555';
const RESCHEDULE_COMMAND_ID = '66666666-6666-4666-8666-666666666666';
const RESCHEDULE_EVENT_ID = '77777777-7777-4777-8777-777777777777';

function responseRecorder() {
  return {
    statusCode: 200,
    payload: undefined,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

function request(method = 'GET', body = undefined) {
  return {
    method,
    url: '/api/grh-action-ledger',
    headers: {},
    query: {},
    body,
  };
}

async function artifactFixture() {
  const [profile, semantic] = await Promise.all([
    readFile(new URL('../api/_data/grh-profile.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../api/_data/grh-semantic.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  return {
    profile,
    semantic,
    provenance: {
      sourceFile: profile.source,
      sourceSha256: profile.sha256,
      approvedSourceSha256: profile.sha256,
      snapshotAsOf: profile.snapshot_as_of,
      profileSchemaVersion: profile.schema_version,
      semanticSchemaVersion: semantic.schema_version,
    },
  };
}

function briefFor(bundle) {
  return buildGrhDecisionBriefProjection(
    buildGrhExecutiveProjection(bundle.semantic),
    buildGrhQualityProjection(bundle.profile, bundle.semantic),
    buildGrhCloseProjection(bundle.semantic),
  );
}

function createBody(brief, mutation = {}) {
  return {
    commandId: CREATE_COMMAND_ID,
    brief: {
      schemaVersion: brief.schemaVersion,
      sourceSha256: brief.source.sourceSha256,
      snapshotAsOf: brief.source.snapshotAsOf,
      period: brief.period,
      priorityCode: 'cross_source_material_difference',
    },
    assigneeRole: 'CONTADOR',
    dueOn: '2026-08-20',
    ...mutation,
  };
}

function createEvent(input) {
  return {
    eventId: CREATE_EVENT_ID,
    commandId: input.commandId,
    command: 'create',
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    fromState: null,
    toState: 'OPEN',
    reasonCode: null,
    outcomeCode: null,
    dueOn: input.dueOn,
    expectedVersion: 0,
    resultVersion: 1,
    occurredAt: '2026-08-11T13:00:00.000Z',
  };
}

function rawFromCreate(input) {
  return {
    id: COMMITMENT_ID,
    brief: { schemaVersion: input.briefSchemaVersion, policyVersion: input.briefPolicyVersion },
    source: {
      sha256: input.sourceSha256,
      snapshotAsOf: input.snapshotAsOf,
      period: input.period,
      evidenceDigest: input.evidenceDigest,
    },
    priority: {
      code: input.priorityCode,
      severity: input.prioritySeverity,
      actionCode: input.actionCode,
    },
    state: 'OPEN',
    assigneeRole: input.assigneeRole,
    ownerUserId: null,
    dueOn: input.dueOn,
    version: 1,
    outcomeCode: null,
    createdAt: '2026-08-11T13:00:00.000Z',
    updatedAt: '2026-08-11T13:00:00.000Z',
    events: [createEvent(input)],
    replayed: false,
  };
}

function mutableStore(initial = []) {
  let rows = structuredClone(initial);
  const calls = { list: [], create: [], transition: [] };
  return {
    calls,
    get rows() { return rows; },
    async listCommitments(input) {
      calls.list.push(structuredClone(input));
      return structuredClone(rows);
    },
    async createCommitment(input) {
      calls.create.push(structuredClone(input));
      rows = [rawFromCreate(input)];
      return structuredClone(rows[0]);
    },
    async transitionCommitment(input) {
      calls.transition.push(structuredClone(input));
      const row = rows.find(candidate => candidate.id === input.commitmentId);
      if (input.command === 'claim') {
        row.state = 'IN_PROGRESS';
        row.ownerUserId = input.actorUserId;
        row.version += 1;
        row.updatedAt = '2026-08-11T14:00:00.000Z';
        row.events.push({
          eventId: CLAIM_EVENT_ID,
          commandId: input.commandId,
          command: 'claim',
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          fromState: 'OPEN',
          toState: 'IN_PROGRESS',
          reasonCode: null,
          outcomeCode: null,
          dueOn: null,
          expectedVersion: input.expectedVersion,
          resultVersion: row.version,
          occurredAt: row.updatedAt,
        });
      }
      return structuredClone(row);
    },
  };
}

function handlerFor({
  bundle,
  caller,
  store,
  requireCapabilityImpl,
  databaseUrlImpl = () => DATABASE_URL,
  inspectLedgerStorageImpl,
  clock = () => NOW,
} = {}) {
  return createGrhActionLedgerHandler({
    requireCapabilityImpl: requireCapabilityImpl || (async (_req, _res, resource, action) => {
      assert.equal(resource, routePolicy.RESOURCES.GRH_ACTION_LEDGER);
      const expected = _req.method === 'GET'
        ? routePolicy.ACTIONS.READ
        : _req.method === 'POST'
          ? routePolicy.ACTIONS.CREATE
          : routePolicy.ACTIONS.UPDATE;
      assert.equal(action, expected);
      return caller;
    }),
    requireDatasetTenantImpl: (_res, subject, envName) => {
      assert.equal(subject.tenantId, process.env.GRH_TENANT_ID);
      assert.equal(envName, 'GRH_TENANT_ID');
      return true;
    },
    readArtifactBundleImpl: async () => bundle,
    storeImpl: store,
    databaseUrlImpl,
    ...(inspectLedgerStorageImpl ? { inspectLedgerStorageImpl } : {}),
    clock,
  });
}

test('the ledger publishes one contract and allows only GET, POST and PATCH before authentication', async () => {
  let authenticated = false;
  const handler = createGrhActionLedgerHandler({
    requireCapabilityImpl: async () => { authenticated = true; },
  });
  const response = responseRecorder();
  await handler(request('DELETE'), response);

  assert.equal(response.statusCode, 405);
  assert.deepEqual(response.payload, { error: 'Metodo no permitido', code: 'METHOD_NOT_ALLOWED' });
  assert.equal(response.headers.allow, 'GET, POST, PATCH');
  assert.equal(response.headers['x-municontrol-contract'], GRH_ACTION_LEDGER_SCHEMA_VERSION);
  assert.equal(
    response.headers['x-municontrol-contract'],
    releaseTruthContract.API_CONTRACTS['/api/grh-action-ledger'],
  );
  assert.equal(response.headers['cache-control'], 'no-store, private, max-age=0');
  assert.equal(response.headers.vary, 'Authorization');
  assert.equal(response.headers[DATABASE_TARGET_FINGERPRINT_HEADER.toLowerCase()], undefined);
  assert.equal(authenticated, false);
});

test('all supported methods reject query parameters before authentication or data reads', async () => {
  let authenticated = 0;
  let reads = 0;
  const handler = createGrhActionLedgerHandler({
    requireCapabilityImpl: async () => { authenticated += 1; },
    readArtifactBundleImpl: async () => { reads += 1; },
  });
  for (const method of ['GET', 'POST', 'PATCH']) {
    const req = request(method);
    req.url = '/api/grh-action-ledger?tenantId=foreign';
    req.query = { tenantId: 'foreign' };
    const response = responseRecorder();
    await handler(req, response);
    assert.equal(response.statusCode, 400, method);
    assert.deepEqual(response.payload, {
      error: 'Este contrato no admite parametros de consulta.',
      code: 'GRH_ACTION_LEDGER_QUERY_UNSUPPORTED',
    });
  }
  const nullPrototypeQuery = request('GET');
  nullPrototypeQuery.query = Object.assign(Object.create(null), { tenantId: 'foreign' });
  const nullPrototypeResponse = responseRecorder();
  await handler(nullPrototypeQuery, nullPrototypeResponse);
  assert.equal(nullPrototypeResponse.statusCode, 400);
  assert.equal(authenticated, 0);
  assert.equal(reads, 0);
});

test('GET rebuilds the governed brief and returns a valid read-only published-demo projection', async () => {
  const bundle = await artifactFixture();
  const store = mutableStore();
  const handler = handlerFor({
    bundle,
    caller: {
      id: 'user-published-intendente',
      email: 'intendente@junin.gov.ar',
      role: 'INTENDENTE',
      tenantId: process.env.GRH_TENANT_ID,
    },
    store,
  });
  const response = responseRecorder();
  await handler(request(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.headers[DATABASE_TARGET_FINGERPRINT_HEADER.toLowerCase()],
    DATABASE_TARGET_FINGERPRINT,
  );
  assert.equal(validateGrhActionLedgerContract(response.payload), true);
  assert.deepEqual(response.payload.permissions, {
    canRead: true, canCreate: false, canUpdate: false, canCancel: false, canReschedule: false,
  });
  assert.deepEqual(store.calls.list, [{ tenantId: process.env.GRH_TENANT_ID }]);
});

test('authenticated GET fails closed on an invalid database target without exposing or reading data', async () => {
  const bundle = await artifactFixture();
  const store = mutableStore();
  let artifactReads = 0;
  const secret = 'database-secret-must-not-escape';
  const handler = createGrhActionLedgerHandler({
    requireCapabilityImpl: async () => ({
      id: 'private-user', email: 'private@example.test', role: 'INTENDENTE',
      tenantId: process.env.GRH_TENANT_ID,
    }),
    requireDatasetTenantImpl: () => true,
    databaseUrlImpl: () => `postgresql://ledger:${secret}@ep-main.neon.tech/db?host=ep-child.neon.tech`,
    readArtifactBundleImpl: async () => { artifactReads += 1; return bundle; },
    storeImpl: store,
  });
  const response = responseRecorder();
  await handler(request('GET'), response);

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.payload, {
    error: 'El registro operativo GRH no esta disponible.',
    code: 'GRH_ACTION_LEDGER_UNAVAILABLE',
  });
  assert.equal(response.headers[DATABASE_TARGET_FINGERPRINT_HEADER.toLowerCase()], undefined);
  assert.equal(artifactReads, 0);
  assert.equal(store.calls.list.length, 0);
  assert.doesNotMatch(JSON.stringify({ headers: response.headers, payload: response.payload }),
    new RegExp(secret));
});

test('storage inspection distinguishes a missing ledger from ready, partial and unavailable storage', async () => {
  const inspect = rows => inspectGrhActionLedgerStorage({
    assertTransport: () => ({ valid: true }),
    client: { async $queryRaw() { return rows; } },
  });
  assert.equal(await inspect([{
    hasCommitmentsTable: false,
    hasEventsTable: false,
  }]), 'missing');
  assert.equal(await inspect([{
    hasCommitmentsTable: true,
    hasEventsTable: true,
  }]), 'ready');
  assert.equal(await inspect([{
    hasCommitmentsTable: true,
    hasEventsTable: false,
  }]), 'inconsistent');
  assert.equal(await inspect([]), 'unavailable');
  assert.equal(await inspectGrhActionLedgerStorage({
    assertTransport: () => null,
    client: { async $queryRaw() { throw new Error('must not run'); } },
  }), 'unavailable');
});

test('GET publishes an explicit read-only empty contract only when both ledger tables are confirmed missing', async () => {
  const bundle = await artifactFixture();
  const store = {
    calls: 0,
    async listCommitments() {
      this.calls += 1;
      const error = new Error('database unavailable');
      error.code = 'GRH_ACTION_LEDGER_DATABASE_UNAVAILABLE';
      throw error;
    },
  };
  const caller = {
    id: 'private-intendente', email: 'private@example.test', role: 'INTENDENTE',
    tenantId: process.env.GRH_TENANT_ID,
  };
  const response = responseRecorder();
  await handlerFor({
    bundle,
    caller,
    store,
    inspectLedgerStorageImpl: async () => 'missing',
  })(request('GET'), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers[GRH_ACTION_LEDGER_STATUS_HEADER.toLowerCase()],
    GRH_ACTION_LEDGER_SETUP_PENDING);
  assert.match(response.headers.warning, /registro de compromisos aun no esta habilitado/i);
  assert.equal(validateGrhActionLedgerContract(response.payload), true);
  assert.deepEqual(response.payload.commitments, []);
  assert.deepEqual(response.payload.summary, {
    total: 0, open: 0, inProgress: 0, blocked: 0, completed: 0, canceled: 0, overdue: 0,
  });
  assert.deepEqual(response.payload.permissions, {
    canRead: true, canCreate: false, canUpdate: false, canCancel: false, canReschedule: false,
  });
  assert.ok(response.payload.suggestions.every(suggestion => suggestion.available === false &&
    suggestion.existingCommitmentId === null));
  assert.equal(store.calls, 1);
});

test('GET keeps failing closed when ledger storage is ready, partial or cannot be inspected', async () => {
  const bundle = await artifactFixture();
  const caller = {
    id: 'private-intendente', email: 'private@example.test', role: 'INTENDENTE',
    tenantId: process.env.GRH_TENANT_ID,
  };
  for (const storageStatus of ['ready', 'inconsistent', 'unavailable']) {
    const response = responseRecorder();
    const original = console.error;
    console.error = () => {};
    try {
      await handlerFor({
        bundle,
        caller,
        store: {
          async listCommitments() {
            const error = new Error('database unavailable');
            error.code = 'GRH_ACTION_LEDGER_DATABASE_UNAVAILABLE';
            throw error;
          },
        },
        inspectLedgerStorageImpl: async () => storageStatus,
      })(request('GET'), response);
    } finally {
      console.error = original;
    }
    assert.equal(response.statusCode, 503, storageStatus);
    assert.equal(response.payload.code, 'GRH_ACTION_LEDGER_UNAVAILABLE', storageStatus);
    assert.equal(response.headers[GRH_ACTION_LEDGER_STATUS_HEADER.toLowerCase()], undefined,
      storageStatus);
  }
});

test('POST derives every evidence field server-side and returns the full created ledger', async () => {
  const bundle = await artifactFixture();
  const brief = briefFor(bundle);
  const store = mutableStore();
  const caller = {
    id: 'user-intendente', email: 'private@example.test', role: 'INTENDENTE',
    tenantId: process.env.GRH_TENANT_ID,
  };
  const response = responseRecorder();
  await handlerFor({ bundle, caller, store })(request('POST', createBody(brief)), response);

  assert.equal(response.statusCode, 201);
  assert.equal(validateGrhActionLedgerContract(response.payload), true);
  assert.equal(response.payload.commitments.length, 1);
  assert.equal(response.payload.suggestions[0].existingCommitmentId, COMMITMENT_ID);
  assert.equal(store.calls.create.length, 1);
  const call = store.calls.create[0];
  assert.deepEqual(Object.keys(call), [
    'tenantId', 'actorUserId', 'actorRole', 'commandId', 'briefSchemaVersion',
    'briefPolicyVersion', 'sourceSha256', 'snapshotAsOf', 'period', 'priorityCode',
    'prioritySeverity', 'actionCode', 'evidenceDigest', 'assigneeRole', 'dueOn',
  ]);
  assert.equal(call.actorUserId, caller.id);
  assert.equal(call.priorityCode, 'cross_source_material_difference');
  assert.equal(call.prioritySeverity, 'critical');
  assert.equal(call.actionCode, 'review_cross_source_reconciliation');
  assert.match(call.evidenceDigest, /^[0-9a-f]{64}$/);
  assert.equal(call.sourceSha256, brief.source.sourceSha256);
  assert.equal(call.assigneeRole, 'CONTADOR');
  assert.equal(call.payloadDigest, undefined);
  assert.equal(call.expectedEvidence, undefined);
  assert.doesNotMatch(JSON.stringify(response.payload), /user-intendente|actorUserId|ownerUserId|commandId|eventId/);
});

test('an exact idempotent create replay returns 200 while a new command returns 201', async () => {
  const bundle = await artifactFixture();
  const brief = briefFor(bundle);
  const seed = mutableStore();
  const caller = {
    id: 'user-intendente', email: 'private@example.test', role: 'INTENDENTE',
    tenantId: process.env.GRH_TENANT_ID,
  };
  await handlerFor({ bundle, caller, store: seed })(
    request('POST', createBody(brief)),
    responseRecorder(),
  );
  const replay = mutableStore(seed.rows);
  replay.createCommitment = async () => ({ ...structuredClone(replay.rows[0]), replayed: true });
  const response = responseRecorder();
  await handlerFor({ bundle, caller, store: replay })(request('POST', createBody(brief)), response);

  assert.equal(response.statusCode, 200);
  assert.equal(validateGrhActionLedgerContract(response.payload), true);
  assert.equal(response.payload.commitments[0].id, COMMITMENT_ID);
});

test('POST and reschedule retries reach the store after their original due date', async () => {
  const bundle = await artifactFixture();
  const brief = briefFor(bundle);
  const caller = {
    id: 'user-intendente', email: 'private@example.test', role: 'INTENDENTE',
    tenantId: process.env.GRH_TENANT_ID,
  };
  const originalBody = createBody(brief, { dueOn: '2026-08-11' });
  const seed = mutableStore();
  await handlerFor({ bundle, caller, store: seed })(
    request('POST', originalBody),
    responseRecorder(),
  );

  const nextDay = () => new Date('2026-08-12T12:00:00.000Z');
  const createReplay = mutableStore(seed.rows);
  createReplay.createCommitment = async input => {
    createReplay.calls.create.push(structuredClone(input));
    return { ...structuredClone(createReplay.rows[0]), replayed: true };
  };
  const createResponse = responseRecorder();
  await handlerFor({ bundle, caller, store: createReplay, clock: nextDay })(
    request('POST', originalBody),
    createResponse,
  );
  assert.equal(createResponse.statusCode, 200);
  assert.equal(createReplay.calls.create.length, 1);

  const rescheduled = structuredClone(seed.rows[0]);
  rescheduled.version = 2;
  rescheduled.updatedAt = '2026-08-11T14:00:00.000Z';
  rescheduled.events.push({
    eventId: RESCHEDULE_EVENT_ID,
    commandId: RESCHEDULE_COMMAND_ID,
    command: 'reschedule',
    actorUserId: caller.id,
    actorRole: caller.role,
    fromState: 'OPEN',
    toState: 'OPEN',
    reasonCode: null,
    outcomeCode: null,
    dueOn: '2026-08-11',
    expectedVersion: 1,
    resultVersion: 2,
    occurredAt: rescheduled.updatedAt,
  });
  const transitionReplay = mutableStore([rescheduled]);
  transitionReplay.transitionCommitment = async input => {
    transitionReplay.calls.transition.push(structuredClone(input));
    return { ...structuredClone(transitionReplay.rows[0]), replayed: true };
  };
  const transitionResponse = responseRecorder();
  await handlerFor({ bundle, caller, store: transitionReplay, clock: nextDay })(request('PATCH', {
    commandId: RESCHEDULE_COMMAND_ID,
    commitmentId: COMMITMENT_ID,
    expectedVersion: 1,
    command: 'reschedule',
    reasonCode: null,
    dueOn: '2026-08-11',
    outcomeCode: null,
  }), transitionResponse);
  assert.equal(transitionResponse.statusCode, 200);
  assert.equal(transitionReplay.calls.transition.length, 1);
});

test('capacity exhaustion is a stable 409 while exact replays remain successful', async () => {
  const bundle = await artifactFixture();
  const brief = briefFor(bundle);
  const caller = {
    id: 'user-intendente', email: 'private@example.test', role: 'INTENDENTE',
    tenantId: process.env.GRH_TENANT_ID,
  };
  const store = mutableStore();
  store.createCommitment = async () => {
    const error = new Error('private capacity detail');
    error.code = 'GRH_ACTION_LEDGER_CAPACITY_REACHED';
    throw error;
  };
  const response = responseRecorder();
  await handlerFor({ bundle, caller, store })(request('POST', createBody(brief)), response);

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.payload, {
    error: 'La capacidad operativa GRH fue alcanzada.',
    code: 'GRH_ACTION_LEDGER_CAPACITY_REACHED',
  });
  assert.doesNotMatch(JSON.stringify(response.payload), /private|detail|stack/i);
});

test('POST rejects stale evidence and malformed bodies before the store', async () => {
  const bundle = await artifactFixture();
  const brief = briefFor(bundle);
  const scenarios = [
    [409, createBody(brief, { brief: { ...createBody(brief).brief, sourceSha256: 'a'.repeat(64) } })],
    [422, createBody(brief, { dueOn: '2026-02-30' })],
    [422, { ...createBody(brief), freeText: 'aprobar sin evidencia' }],
  ];
  for (const [status, body] of scenarios) {
    const store = mutableStore();
    const response = responseRecorder();
    await handlerFor({
      bundle,
      caller: {
        id: 'user-intendente', email: 'private@example.test', role: 'INTENDENTE',
        tenantId: process.env.GRH_TENANT_ID,
      },
      store,
    })(request('POST', body), response);
    assert.equal(response.statusCode, status);
    assert.equal(store.calls.create.length, 0);
  }
});

test('new POST dates outside today through plus 180 days are rejected by the replay-aware store', async () => {
  const bundle = await artifactFixture();
  const brief = briefFor(bundle);
  for (const dueOn of ['2026-08-10', '2027-02-08']) {
    const store = mutableStore();
    store.createCommitment = async input => {
      store.calls.create.push(structuredClone(input));
      const error = new Error('private temporal detail');
      error.code = 'GRH_ACTION_LEDGER_INPUT_INVALID';
      throw error;
    };
    const response = responseRecorder();
    await handlerFor({
      bundle,
      caller: {
        id: 'user-intendente', email: 'private@example.test', role: 'INTENDENTE',
        tenantId: process.env.GRH_TENANT_ID,
      },
      store,
    })(request('POST', createBody(brief, { dueOn })), response);
    assert.equal(response.statusCode, 422);
    assert.equal(store.calls.create.length, 1);
    assert.doesNotMatch(JSON.stringify(response.payload), /private|temporal detail/i);
  }
});

test('PATCH lets the matching assignee claim and returns the sanitized owner timeline', async () => {
  const bundle = await artifactFixture();
  const brief = briefFor(bundle);
  const seedStore = mutableStore();
  await handlerFor({
    bundle,
    caller: {
      id: 'seed-intendente', email: 'private@example.test', role: 'INTENDENTE',
      tenantId: process.env.GRH_TENANT_ID,
    },
    store: seedStore,
  })(request('POST', createBody(brief)), responseRecorder());
  const store = mutableStore(seedStore.rows);
  const caller = {
    id: 'user-contador', email: 'private-contador@example.test', role: 'CONTADOR',
    tenantId: process.env.GRH_TENANT_ID,
  };
  const body = {
    commandId: CLAIM_COMMAND_ID,
    commitmentId: COMMITMENT_ID,
    expectedVersion: 1,
    command: 'claim',
    reasonCode: null,
    dueOn: null,
    outcomeCode: null,
  };
  const response = responseRecorder();
  await handlerFor({ bundle, caller, store })(request('PATCH', body), response);

  assert.equal(response.statusCode, 200);
  assert.equal(validateGrhActionLedgerContract(response.payload), true);
  assert.equal(response.payload.commitments[0].state, 'in_progress');
  assert.deepEqual(response.payload.commitments[0].assignee, {
    role: 'CONTADOR', isCurrentUser: true,
  });
  assert.deepEqual(response.payload.commitments[0].availableTransitions, ['block', 'complete']);
  assert.deepEqual(response.payload.commitments[0].events.map(event => event.sequence), [1, 2]);
  assert.deepEqual(store.calls.transition[0], {
    tenantId: process.env.GRH_TENANT_ID,
    actorUserId: caller.id,
    actorRole: caller.role,
    ...body,
  });
});

test('PATCH enforces owner and administrative role rules before mutation', async () => {
  const bundle = await artifactFixture();
  const brief = briefFor(bundle);
  const seed = mutableStore();
  await handlerFor({
    bundle,
    caller: {
      id: 'seed-intendente', email: 'private@example.test', role: 'INTENDENTE',
      tenantId: process.env.GRH_TENANT_ID,
    },
    store: seed,
  })(request('POST', createBody(brief)), responseRecorder());
  const cases = [
    [{ id: 'wrong-contador', role: 'CONTADOR' }, 'complete'],
    [{ id: 'user-contador', role: 'CONTADOR' }, 'reschedule'],
    [{ id: 'wrong-admin', role: 'TENANT_ADMIN' }, 'cancel'],
  ];
  for (const [identity, command] of cases) {
    const store = mutableStore(seed.rows);
    const response = responseRecorder();
    await handlerFor({
      bundle,
      caller: {
        ...identity,
        email: `${identity.id}@example.test`,
        tenantId: process.env.GRH_TENANT_ID,
      },
      store,
    })(request('PATCH', {
      commandId: CLAIM_COMMAND_ID,
      commitmentId: COMMITMENT_ID,
      expectedVersion: 1,
      command,
      reasonCode: command === 'cancel' ? 'priority_withdrawn' : null,
      dueOn: command === 'reschedule' ? '2026-08-21' : null,
      outcomeCode: command === 'complete' ? 'review_completed' : null,
    }), response);
    assert.equal(response.statusCode, 403, command);
    assert.equal(store.calls.transition.length, 0, command);
  }
});

test('PATCH operates a validated historical commitment and maps optimistic failures without details', async () => {
  const bundle = await artifactFixture();
  const brief = briefFor(bundle);
  const seed = mutableStore();
  await handlerFor({
    bundle,
    caller: {
      id: 'seed-intendente', email: 'private@example.test', role: 'INTENDENTE',
      tenantId: process.env.GRH_TENANT_ID,
    },
    store: seed,
  })(request('POST', createBody(brief)), responseRecorder());
  const historical = structuredClone(seed.rows[0]);
  historical.source.sha256 = 'a'.repeat(64);
  historical.source.snapshotAsOf = '2026-07-06';
  historical.source.period = '2026-06';
  historical.source.evidenceDigest = digestGrhActionLedgerPayload({
    schemaVersion: historical.brief.schemaVersion,
    policyVersion: historical.brief.policyVersion,
    sourceSha256: historical.source.sha256,
    snapshotAsOf: historical.source.snapshotAsOf,
    period: historical.source.period,
    priorityCode: historical.priority.code,
    severity: historical.priority.severity,
    actionCode: historical.priority.actionCode,
  });
  const body = {
    commandId: CLAIM_COMMAND_ID,
    commitmentId: COMMITMENT_ID,
    expectedVersion: 1,
    command: 'claim', reasonCode: null, dueOn: null, outcomeCode: null,
  };
  const historicalResponse = responseRecorder();
  const historicalStore = mutableStore([historical]);
  await handlerFor({
    bundle,
    caller: {
      id: 'user-contador', email: 'private-contador@example.test', role: 'CONTADOR',
      tenantId: process.env.GRH_TENANT_ID,
    },
    store: historicalStore,
  })(request('PATCH', body), historicalResponse);
  assert.equal(historicalResponse.statusCode, 200);
  assert.equal(historicalStore.calls.transition.length, 1);
  assert.equal(historicalResponse.payload.commitments[0].state, 'in_progress');
  assert.equal(historicalResponse.payload.commitments[0].source.snapshotAsOf, '2026-07-06');
  assert.equal(validateGrhActionLedgerContract(historicalResponse.payload), true);

  const conflictStore = mutableStore(seed.rows);
  conflictStore.transitionCommitment = async () => {
    const error = new Error('private database row');
    error.code = 'GRH_ACTION_LEDGER_VERSION_CONFLICT';
    throw error;
  };
  const conflictResponse = responseRecorder();
  await handlerFor({
    bundle,
    caller: {
      id: 'user-contador', email: 'private-contador@example.test', role: 'CONTADOR',
      tenantId: process.env.GRH_TENANT_ID,
    },
    store: conflictStore,
  })(request('PATCH', body), conflictResponse);
  assert.equal(conflictResponse.statusCode, 409);
  assert.equal(conflictResponse.payload.code, 'GRH_ACTION_LEDGER_VERSION_CONFLICT');
  assert.doesNotMatch(JSON.stringify(conflictResponse.payload), /database|row|stack|detail/i);
});

test('PATCH rejects an invalid historical evidence digest before any transition', async () => {
  const bundle = await artifactFixture();
  const brief = briefFor(bundle);
  const seed = mutableStore();
  await handlerFor({
    bundle,
    caller: {
      id: 'seed-intendente', email: 'private@example.test', role: 'INTENDENTE',
      tenantId: process.env.GRH_TENANT_ID,
    },
    store: seed,
  })(request('POST', createBody(brief)), responseRecorder());
  const invalidHistorical = structuredClone(seed.rows[0]);
  invalidHistorical.source.sha256 = 'd'.repeat(64);
  invalidHistorical.source.snapshotAsOf = '2026-07-06';
  invalidHistorical.source.period = '2026-06';
  const store = mutableStore([invalidHistorical]);
  const response = responseRecorder();
  const original = console.error;
  console.error = () => {};
  try {
    await handlerFor({
      bundle,
      caller: {
        id: 'user-contador', email: 'private-contador@example.test', role: 'CONTADOR',
        tenantId: process.env.GRH_TENANT_ID,
      },
      store,
    })(request('PATCH', {
      commandId: CLAIM_COMMAND_ID,
      commitmentId: COMMITMENT_ID,
      expectedVersion: 1,
      command: 'claim', reasonCode: null, dueOn: null, outcomeCode: null,
    }), response);
  } finally {
    console.error = original;
  }
  assert.equal(response.statusCode, 503);
  assert.equal(response.payload.code, 'GRH_ACTION_LEDGER_UNAVAILABLE');
  assert.equal(store.calls.transition.length, 0);
  assert.doesNotMatch(JSON.stringify(response.payload), /digest|source|private|stack|detail/i);
});

test('invalid governed bundle and malformed store data share one detail-free 503 receipt', async () => {
  const bundle = await artifactFixture();
  const cases = [
    { bundle: { ...bundle, provenance: { ...bundle.provenance, sourceSha256: 'a'.repeat(64) } }, store: mutableStore() },
    {
      bundle,
      store: {
        async listCommitments() {
          return [{ ownerAssigned: false, events: [] }];
        },
      },
    },
  ];
  for (const scenario of cases) {
    const response = responseRecorder();
    const original = console.error;
    console.error = () => {};
    try {
      await handlerFor({
        ...scenario,
        caller: {
          id: 'user-intendente', email: 'private@example.test', role: 'INTENDENTE',
          tenantId: process.env.GRH_TENANT_ID,
        },
      })(request(), response);
    } finally {
      console.error = original;
    }
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.payload, {
      error: 'El registro operativo GRH no esta disponible.',
      code: 'GRH_ACTION_LEDGER_UNAVAILABLE',
    });
    assert.doesNotMatch(JSON.stringify(response.payload), /private|owner|event|stack|detail/i);
  }
});
