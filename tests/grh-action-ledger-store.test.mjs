import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GrhActionLedgerStoreError,
  createGrhActionLedgerStore,
} from '../api/lib/grh-action-ledger-store.js';

const NOW = '2026-08-11T12:00:00.000Z';
const TENANT_ID = 'tenant-junin';
const ACTOR_ID = 'user-intendente';
const OWNER_ID = 'user-contador';
const COMMITMENT_ID = '11111111-1111-4111-8111-111111111111';
const COMMAND_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const SECOND_EVENT_ID = '44444444-4444-4444-8444-444444444444';
const SECOND_COMMAND_ID = '55555555-5555-4555-8555-555555555555';
const SOURCE_SHA = 'a'.repeat(64);
const EVIDENCE_DIGEST = 'b'.repeat(64);

function commitmentRow(overrides = {}) {
  return {
    id: COMMITMENT_ID,
    briefSchemaVersion: 'grh-decision-brief-v1',
    briefPolicyVersion: 'grh-small-cell-v1',
    sourceSha256: SOURCE_SHA,
    snapshotAsOf: '2026-08-06',
    period: '2026-07',
    priorityCode: 'cross_source_material_difference',
    prioritySeverity: 'CRITICAL',
    actionCode: 'REVIEW_CROSS_SOURCE_RECONCILIATION',
    evidenceDigest: EVIDENCE_DIGEST,
    state: 'OPEN',
    assigneeRole: 'CONTADOR',
    ownerUserId: null,
    dueOn: '2026-08-20',
    version: 1,
    outcomeCode: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function eventRow(overrides = {}) {
  return {
    sequence: 1n,
    eventId: EVENT_ID,
    commitmentId: COMMITMENT_ID,
    commandId: COMMAND_ID,
    actorUserId: ACTOR_ID,
    actorRole: 'INTENDENTE',
    command: 'CREATE',
    fromState: null,
    toState: 'OPEN',
    reasonCode: null,
    outcomeCode: null,
    dueOn: '2026-08-20',
    expectedVersion: 0,
    resultVersion: 1,
    occurredAt: NOW,
    ...overrides,
  };
}

function createInput(overrides = {}) {
  return {
    tenantId: TENANT_ID,
    actorUserId: ACTOR_ID,
    actorRole: 'INTENDENTE',
    commandId: COMMAND_ID,
    briefSchemaVersion: 'grh-decision-brief-v1',
    briefPolicyVersion: 'grh-small-cell-v1',
    sourceSha256: SOURCE_SHA,
    snapshotAsOf: '2026-08-06',
    period: '2026-07',
    priorityCode: 'cross_source_material_difference',
    prioritySeverity: 'critical',
    actionCode: 'review_cross_source_reconciliation',
    evidenceDigest: EVIDENCE_DIGEST,
    assigneeRole: 'CONTADOR',
    dueOn: '2026-08-20',
    ...overrides,
  };
}

function transitionInput(overrides = {}) {
  return {
    tenantId: TENANT_ID,
    actorUserId: OWNER_ID,
    actorRole: 'CONTADOR',
    commandId: SECOND_COMMAND_ID,
    commitmentId: COMMITMENT_ID,
    command: 'claim',
    expectedVersion: 1,
    reasonCode: null,
    outcomeCode: null,
    dueOn: null,
    ...overrides,
  };
}

function queryName(strings) {
  const sql = strings.join('?');
  const marker = [
    'list-v1',
    'command-v1',
    'tenant-events-v1',
    'commitment-events-v1',
    'source-v1',
    'tenant-capacity-lock-v1',
    'tenant-capacity-count-v1',
    'commitment-lock-v1',
    'create-commitment-v1',
    'append-event-v1',
    'update-commitment-v1',
  ].find(value => sql.includes(`grh-action-ledger:${value}`));
  if (!marker) throw new Error(`unexpected query: ${sql}`);
  return marker;
}

function makeClient(handlers = {}) {
  const calls = [];
  const client = {
    calls,
    async $queryRaw(strings, ...values) {
      const name = queryName(strings);
      calls.push({ kind: 'query', name, text: strings.join('?'), values });
      const handler = handlers[name];
      if (typeof handler === 'function') return structuredClone(await handler({ values, calls }));
      if (handler !== undefined) return structuredClone(handler);
      if (name === 'tenant-capacity-lock-v1') return [{ id: TENANT_ID }];
      if (name === 'tenant-capacity-count-v1') return [{ count: 0 }];
      return [];
    },
    async $transaction(callback, options) {
      calls.push({ kind: 'transaction', options });
      return callback(client);
    },
  };
  return client;
}

function makeStore(handlers = {}, options = {}) {
  const client = makeClient(handlers);
  const ids = [...(options.ids ?? [COMMITMENT_ID, EVENT_ID, SECOND_EVENT_ID])];
  const store = createGrhActionLedgerStore({
    client,
    assertTransport: options.assertTransport ?? (() => ({ tlsVerified: true })),
    clock: options.clock ?? (() => new Date(NOW)),
    idFactory: options.idFactory ?? (() => ids.shift() ?? EVENT_ID),
  });
  return { client, store };
}

function assertCode(error, code) {
  assert.ok(error instanceof GrhActionLedgerStoreError);
  assert.equal(error.code, code);
  assert.equal(error.message, 'GRH action ledger is unavailable');
  return true;
}

test('lists a tenant-bound deterministic raw timeline with internal identity only for server projection', async () => {
  const { client, store } = makeStore({
    'list-v1': [commitmentRow()],
    'tenant-events-v1': [eventRow()],
  });

  const result = await store.listCommitments({ tenantId: TENANT_ID });
  assert.deepEqual(result, [{
    id: COMMITMENT_ID,
    brief: { schemaVersion: 'grh-decision-brief-v1', policyVersion: 'grh-small-cell-v1' },
    source: {
      sha256: SOURCE_SHA,
      snapshotAsOf: '2026-08-06',
      period: '2026-07',
      evidenceDigest: EVIDENCE_DIGEST,
    },
    priority: {
      code: 'cross_source_material_difference',
      severity: 'critical',
      actionCode: 'review_cross_source_reconciliation',
    },
    state: 'OPEN',
    assigneeRole: 'CONTADOR',
    ownerUserId: null,
    dueOn: '2026-08-20',
    version: 1,
    outcomeCode: null,
    createdAt: NOW,
    updatedAt: NOW,
    events: [{
      eventId: EVENT_ID,
      commandId: COMMAND_ID,
      command: 'create',
      actorUserId: ACTOR_ID,
      actorRole: 'INTENDENTE',
      fromState: null,
      toState: 'OPEN',
      reasonCode: null,
      outcomeCode: null,
      dueOn: '2026-08-20',
      expectedVersion: 0,
      resultVersion: 1,
      occurredAt: NOW,
    }],
    replayed: false,
  }]);

  assert.deepEqual(client.calls[0], {
    kind: 'transaction',
    options: { isolationLevel: 'RepeatableRead', maxWait: 2_000, timeout: 5_000 },
  });
  assert.deepEqual(client.calls.filter(call => call.kind === 'query').map(call => call.name), [
    'list-v1',
    'tenant-events-v1',
  ]);
  for (const call of client.calls.filter(item => item.kind === 'query')) {
    assert.equal(call.text.includes(TENANT_ID), false);
    assert.ok(call.values.includes(TENANT_ID));
    assert.doesNotMatch(call.text, /email|password|dni|cuil|legajo/iu);
  }
  assert.equal(Object.hasOwn(result[0], 'createdByUserId'), false);
});

test('creates commitment and CREATE event atomically with exact action mapping', async () => {
  const { client, store } = makeStore({
    'command-v1': [],
    'source-v1': [],
    'create-commitment-v1': [commitmentRow()],
    'append-event-v1': [{ sequence: 1n }],
    'commitment-events-v1': [eventRow()],
  });

  const result = await store.createCommitment(createInput());
  assert.equal(result.replayed, false);
  assert.equal(result.priority.actionCode, 'review_cross_source_reconciliation');
  assert.equal(result.events[0].command, 'create');
  assert.deepEqual(client.calls[0], {
    kind: 'transaction',
    options: { isolationLevel: 'ReadCommitted', maxWait: 2_000, timeout: 5_000 },
  });
  assert.deepEqual(client.calls.filter(call => call.kind === 'query').map(call => call.name), [
    'tenant-capacity-lock-v1',
    'command-v1',
    'source-v1',
    'tenant-capacity-count-v1',
    'create-commitment-v1',
    'append-event-v1',
    'commitment-events-v1',
  ]);
  const createCall = client.calls.find(call => call.name === 'create-commitment-v1');
  assert.ok(createCall.values.includes('CRITICAL'));
  assert.ok(createCall.values.includes('REVIEW_CROSS_SOURCE_RECONCILIATION'));
  assert.ok(createCall.values.includes('CONTADOR'));
  const sourceCall = client.calls.find(call => call.name === 'source-v1');
  assert.deepEqual(sourceCall.values, [
    TENANT_ID,
    'grh-decision-brief-v1',
    'grh-small-cell-v1',
    SOURCE_SHA,
    '2026-08-06',
    '2026-07',
    EVIDENCE_DIGEST,
    'cross_source_material_difference',
  ]);
  for (const column of [
    'brief_schema_version',
    'brief_policy_version',
    'source_sha256',
    'snapshot_as_of',
    'period',
    'evidence_digest',
    'priority_code',
  ]) {
    assert.match(sourceCall.text, new RegExp(`"${column}"`, 'u'));
  }
  const tenantLock = client.calls.find(call => call.name === 'tenant-capacity-lock-v1');
  assert.match(tenantLock.text, /FOR UPDATE/u);
  assert.deepEqual(tenantLock.values, [TENANT_ID]);
});

test('a historical identity sharing SHA, period and priority does not block the current evidence', async () => {
  const historicalIdentity = [
    TENANT_ID,
    'grh-decision-brief-v1',
    'grh-small-cell-v1',
    SOURCE_SHA,
    '2026-07-31',
    '2026-07',
    'c'.repeat(64),
    'cross_source_material_difference',
  ];
  const { store } = makeStore({
    'command-v1': [],
    'source-v1': ({ values }) => [
      historicalIdentity.every((value, index) => value === values[index])
        ? { id: '88888888-8888-4888-8888-888888888888' }
        : null,
    ].filter(Boolean),
    'tenant-capacity-count-v1': [{ count: 1 }],
    'create-commitment-v1': [commitmentRow()],
    'append-event-v1': [{ sequence: 1n }],
    'commitment-events-v1': [eventRow()],
  });

  const result = await store.createCommitment(createInput());
  assert.equal(result.replayed, false);
  assert.equal(result.source.snapshotAsOf, '2026-08-06');
});

test('exact create replay stays durable at capacity after its due date expires', async () => {
  let payloadDigest = null;
  let commandReads = 0;
  let countReads = 0;
  let currentTime = NOW;
  const handlers = {
    'command-v1': () => {
      commandReads += 1;
      return commandReads === 1 ? [] : [{
        ...commitmentRow(),
        eventCommand: 'CREATE',
        eventPayloadDigest: payloadDigest,
      }];
    },
    'source-v1': [],
    'tenant-capacity-count-v1': () => {
      countReads += 1;
      return [{ count: countReads === 1 ? 99 : 100 }];
    },
    'create-commitment-v1': [commitmentRow()],
    'append-event-v1': ({ values }) => {
      payloadDigest = values[4];
      return [{ sequence: 1n }];
    },
    'commitment-events-v1': [eventRow()],
  };
  const { client, store } = makeStore(handlers, {
    ids: [COMMITMENT_ID, EVENT_ID, '66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777'],
    clock: () => new Date(currentTime),
  });

  assert.equal((await store.createCommitment(createInput())).replayed, false);
  currentTime = '2026-08-21T12:00:00.000Z';
  assert.equal((await store.createCommitment(createInput())).replayed, true);
  await assert.rejects(
    store.createCommitment(createInput({ assigneeRole: 'TENANT_ADMIN' })),
    error => assertCode(error, 'GRH_ACTION_LEDGER_COMMAND_COLLISION'),
  );
  assert.equal(client.calls.filter(call => call.name === 'create-commitment-v1').length, 1);
  assert.equal(client.calls.filter(call => call.name === 'append-event-v1').length, 1);
  assert.equal(client.calls.filter(call => call.name === 'tenant-capacity-lock-v1').length, 3);
  assert.equal(countReads, 1);
});

test('same tenant command id with a different digest fails as a collision', async () => {
  const { store } = makeStore({
    'command-v1': [{
      ...commitmentRow(),
      eventCommand: 'CREATE',
      eventPayloadDigest: 'f'.repeat(64),
    }],
  });
  await assert.rejects(
    store.createCommitment(createInput()),
    error => assertCode(error, 'GRH_ACTION_LEDGER_COMMAND_COLLISION'),
  );
});

test('claim locks by tenant and version, changes ownership and appends before returning timeline', async () => {
  const claimed = commitmentRow({
    state: 'IN_PROGRESS',
    ownerUserId: OWNER_ID,
    version: 2,
  });
  const claimEvent = eventRow({
    sequence: 2n,
    eventId: SECOND_EVENT_ID,
    commandId: SECOND_COMMAND_ID,
    actorUserId: OWNER_ID,
    actorRole: 'CONTADOR',
    command: 'CLAIM',
    fromState: 'OPEN',
    toState: 'IN_PROGRESS',
    dueOn: null,
    expectedVersion: 1,
    resultVersion: 2,
  });
  const { client, store } = makeStore({
    'command-v1': [],
    'commitment-lock-v1': [commitmentRow()],
    'update-commitment-v1': [claimed],
    'append-event-v1': [{ sequence: 2n }],
    'commitment-events-v1': [eventRow(), claimEvent],
  }, { ids: [SECOND_EVENT_ID] });

  const result = await store.transitionCommitment(transitionInput());
  assert.equal(result.state, 'IN_PROGRESS');
  assert.equal(result.ownerUserId, OWNER_ID);
  assert.equal(result.version, 2);
  assert.deepEqual(result.events.map(event => event.command), ['create', 'claim']);
  const lock = client.calls.find(call => call.name === 'commitment-lock-v1');
  assert.match(lock.text, /FOR UPDATE/u);
  assert.ok(lock.values.includes(TENANT_ID));
  assert.ok(lock.values.includes(COMMITMENT_ID));
  assert.ok(client.calls.find(call => call.name === 'update-commitment-v1').values.includes(1));
});

test('exact reschedule replay stays durable after the new due date expires', async () => {
  let currentTime = NOW;
  let payloadDigest = null;
  let commandReads = 0;
  const rescheduled = commitmentRow({ dueOn: '2026-08-12', version: 2 });
  const rescheduleEvent = eventRow({
    sequence: 2n,
    eventId: SECOND_EVENT_ID,
    commandId: SECOND_COMMAND_ID,
    actorUserId: ACTOR_ID,
    actorRole: 'INTENDENTE',
    command: 'RESCHEDULE',
    fromState: 'OPEN',
    toState: 'OPEN',
    dueOn: '2026-08-12',
    expectedVersion: 1,
    resultVersion: 2,
  });
  const { client, store } = makeStore({
    'command-v1': () => {
      commandReads += 1;
      return commandReads === 1 ? [] : [{
        ...rescheduled,
        eventCommand: 'RESCHEDULE',
        eventPayloadDigest: payloadDigest,
      }];
    },
    'commitment-lock-v1': [commitmentRow()],
    'update-commitment-v1': [rescheduled],
    'append-event-v1': ({ values }) => {
      payloadDigest = values[4];
      return [{ sequence: 2n }];
    },
    'commitment-events-v1': [eventRow(), rescheduleEvent],
  }, {
    ids: [
      SECOND_EVENT_ID,
      '66666666-6666-4666-8666-666666666666',
      '77777777-7777-4777-8777-777777777777',
    ],
    clock: () => new Date(currentTime),
  });
  const input = transitionInput({
    actorUserId: ACTOR_ID,
    actorRole: 'INTENDENTE',
    command: 'reschedule',
    dueOn: '2026-08-12',
  });

  assert.equal((await store.transitionCommitment(input)).replayed, false);
  currentTime = '2026-08-13T12:00:00.000Z';
  assert.equal((await store.transitionCommitment(input)).replayed, true);
  await assert.rejects(
    store.transitionCommitment({ ...input, expectedVersion: 2 }),
    error => assertCode(error, 'GRH_ACTION_LEDGER_COMMAND_COLLISION'),
  );
  assert.equal(client.calls.filter(call => call.name === 'commitment-lock-v1').length, 1);
  assert.equal(client.calls.filter(call => call.name === 'update-commitment-v1').length, 1);
  assert.equal(client.calls.filter(call => call.name === 'append-event-v1').length, 1);
});

test('all governed transitions enforce owner, state, reason, outcome and Intendente controls', async t => {
  const cases = [
    {
      name: 'block',
      current: commitmentRow({ state: 'IN_PROGRESS', ownerUserId: OWNER_ID, version: 2 }),
      input: transitionInput({ command: 'block', expectedVersion: 2, reasonCode: 'dependency_pending' }),
      updated: { state: 'BLOCKED', ownerUserId: OWNER_ID, version: 3 },
    },
    {
      name: 'resume',
      current: commitmentRow({ state: 'BLOCKED', ownerUserId: OWNER_ID, version: 3 }),
      input: transitionInput({ command: 'resume', expectedVersion: 3 }),
      updated: { state: 'IN_PROGRESS', ownerUserId: OWNER_ID, version: 4 },
    },
    {
      name: 'complete',
      current: commitmentRow({ state: 'IN_PROGRESS', ownerUserId: OWNER_ID, version: 4 }),
      input: transitionInput({ command: 'complete', expectedVersion: 4, outcomeCode: 'review_completed' }),
      updated: { state: 'COMPLETED', ownerUserId: OWNER_ID, version: 5, outcomeCode: 'review_completed' },
    },
    {
      name: 'reschedule',
      current: commitmentRow(),
      input: transitionInput({
        actorUserId: ACTOR_ID,
        actorRole: 'INTENDENTE',
        command: 'reschedule',
        dueOn: '2026-09-01',
      }),
      updated: { state: 'OPEN', version: 2, dueOn: '2026-09-01' },
    },
    {
      name: 'cancel',
      current: commitmentRow(),
      input: transitionInput({
        actorUserId: ACTOR_ID,
        actorRole: 'INTENDENTE',
        command: 'cancel',
        reasonCode: 'priority_withdrawn',
      }),
      updated: { state: 'CANCELED', version: 2 },
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const row = commitmentRow(item.updated);
      const command = item.input.command.toUpperCase();
      const timelineEvent = eventRow({
        eventId: SECOND_EVENT_ID,
        commandId: SECOND_COMMAND_ID,
        actorUserId: item.input.actorUserId,
        actorRole: item.input.actorRole,
        command,
        fromState: item.current.state,
        toState: row.state,
        reasonCode: item.input.reasonCode,
        outcomeCode: item.input.outcomeCode,
        dueOn: item.input.command === 'reschedule' ? item.input.dueOn : null,
        expectedVersion: item.input.expectedVersion,
        resultVersion: item.input.expectedVersion + 1,
      });
      const { store } = makeStore({
        'command-v1': [],
        'commitment-lock-v1': [item.current],
        'update-commitment-v1': [row],
        'append-event-v1': [{ sequence: 2n }],
        'commitment-events-v1': [timelineEvent],
      }, { ids: [SECOND_EVENT_ID] });
      const result = await store.transitionCommitment(item.input);
      assert.equal(result.state, row.state);
      assert.equal(result.version, row.version);
    });
  }

  for (const command of ['reschedule', 'cancel']) {
    await t.test(`${command} rejects TENANT_ADMIN at the store boundary`, async () => {
      const input = transitionInput({
        actorUserId: 'user-admin',
        actorRole: 'TENANT_ADMIN',
        command,
        reasonCode: command === 'cancel' ? 'duplicate_commitment' : null,
        dueOn: command === 'reschedule' ? '2026-09-01' : null,
      });
      const { store } = makeStore({
        'command-v1': [],
        'commitment-lock-v1': [commitmentRow()],
      }, { ids: [SECOND_EVENT_ID] });
      await assert.rejects(
        store.transitionCommitment(input),
        error => assertCode(error, 'GRH_ACTION_LEDGER_OWNERSHIP_DENIED'),
      );
    });
  }

  for (const actorRole of ['TENANT_ADMIN', 'CONTADOR']) {
    await t.test(`reschedule rejects an owner with ${actorRole} role`, async () => {
      const actorUserId = actorRole === 'CONTADOR' ? OWNER_ID : 'user-admin';
      const current = commitmentRow({
        state: 'IN_PROGRESS',
        assigneeRole: actorRole,
        ownerUserId: actorUserId,
        version: 2,
      });
      const { client, store } = makeStore({
        'command-v1': [],
        'commitment-lock-v1': [current],
      }, { ids: [SECOND_EVENT_ID] });
      await assert.rejects(
        store.transitionCommitment(transitionInput({
          actorUserId,
          actorRole,
          command: 'reschedule',
          expectedVersion: 2,
          dueOn: '2026-09-01',
        })),
        error => assertCode(error, 'GRH_ACTION_LEDGER_OWNERSHIP_DENIED'),
      );
      assert.equal(client.calls.some(call => call.name === 'update-commitment-v1'), false);
    });
  }
});

test('optimistic locking, not-found, source uniqueness and caps fail closed', async t => {
  await t.test('version conflict', async () => {
    const { store } = makeStore({
      'command-v1': [],
      'commitment-lock-v1': [commitmentRow({ version: 2 })],
    }, { ids: [SECOND_EVENT_ID] });
    await assert.rejects(
      store.transitionCommitment(transitionInput()),
      error => assertCode(error, 'GRH_ACTION_LEDGER_VERSION_CONFLICT'),
    );
  });

  await t.test('not found is tenant scoped', async () => {
    const { store } = makeStore({ 'command-v1': [], 'commitment-lock-v1': [] }, { ids: [SECOND_EVENT_ID] });
    await assert.rejects(
      store.transitionCommitment(transitionInput()),
      error => assertCode(error, 'GRH_ACTION_LEDGER_COMMITMENT_NOT_FOUND'),
    );
  });

  await t.test('the same exact evidence priority cannot be recreated even after terminal state', async () => {
    const { store } = makeStore({ 'command-v1': [], 'source-v1': [{ id: COMMITMENT_ID }] });
    await assert.rejects(
      store.createCommitment(createInput()),
      error => assertCode(error, 'GRH_ACTION_LEDGER_COMMITMENT_ALREADY_EXISTS'),
    );
  });

  await t.test('a pre-existing overflow remains fail closed on list', async () => {
    const { store } = makeStore({
      'list-v1': Array.from({ length: 101 }, (_, index) => commitmentRow({
        id: `${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`,
      })),
    });
    await assert.rejects(
      store.listCommitments({ tenantId: TENANT_ID }),
      error => assertCode(error, 'GRH_ACTION_LEDGER_DATA_INVALID'),
    );
  });

  await t.test('the 101st commitment is rejected under the tenant lock before insert', async () => {
    const { client, store } = makeStore({
      'command-v1': [],
      'source-v1': [],
      'tenant-capacity-count-v1': [{ count: 100 }],
    });
    await assert.rejects(
      store.createCommitment(createInput()),
      error => assertCode(error, 'GRH_ACTION_LEDGER_CAPACITY_REACHED'),
    );
    assert.deepEqual(client.calls.filter(call => call.kind === 'query').map(call => call.name), [
      'tenant-capacity-lock-v1',
      'command-v1',
      'source-v1',
      'tenant-capacity-count-v1',
    ]);
    assert.equal(client.calls.some(call => call.name === 'create-commitment-v1'), false);
    assert.equal(client.calls[0].options.isolationLevel, 'ReadCommitted');
  });

  await t.test('128 events maximum per commitment', async () => {
    const events = Array.from({ length: 129 }, (_, index) => eventRow({
      sequence: BigInt(index + 1),
      eventId: `${String(index).padStart(8, '0')}-3333-4333-8333-333333333333`,
      commandId: `${String(index).padStart(8, '0')}-2222-4222-8222-222222222222`,
    }));
    const { store } = makeStore({ 'list-v1': [commitmentRow()], 'tenant-events-v1': events });
    await assert.rejects(
      store.listCommitments({ tenantId: TENANT_ID }),
      error => assertCode(error, 'GRH_ACTION_LEDGER_DATA_INVALID'),
    );
  });
});

test('parallel creates serialize on the tenant row and only one can consume the final slot', async () => {
  let commitmentCount = 99;
  let insertCount = 0;
  let sequence = 0n;
  let lockTail = Promise.resolve();
  const eventRowsByCommitment = new Map();
  const transactionOptionsSeen = [];

  const client = {
    async $queryRaw() {
      throw new Error('recovery query was not expected');
    },
    async $transaction(callback, options) {
      transactionOptionsSeen.push(options);
      const precedingLock = lockTail;
      let releaseLock;
      lockTail = new Promise(resolve => {
        releaseLock = resolve;
      });
      let tenantLocked = false;
      const transaction = {
        async $queryRaw(strings, ...values) {
          const name = queryName(strings);
          if (name === 'tenant-capacity-lock-v1') {
            await precedingLock;
            tenantLocked = true;
            return [{ id: values[0] }];
          }
          assert.equal(tenantLocked, true, `${name} ran before the tenant lock`);
          if (name === 'command-v1' || name === 'source-v1') return [];
          if (name === 'tenant-capacity-count-v1') return [{ count: commitmentCount }];
          if (name === 'create-commitment-v1') {
            insertCount += 1;
            commitmentCount += 1;
            return [commitmentRow({
              id: values[0],
              briefSchemaVersion: values[2],
              briefPolicyVersion: values[3],
              sourceSha256: values[4],
              snapshotAsOf: values[5],
              period: values[6],
              priorityCode: values[7],
              prioritySeverity: values[8],
              actionCode: values[9],
              evidenceDigest: values[10],
              assigneeRole: values[11],
              dueOn: values[12],
            })];
          }
          if (name === 'append-event-v1') {
            sequence += 1n;
            eventRowsByCommitment.set(values[2], [eventRow({
              sequence,
              eventId: values[0],
              commitmentId: values[2],
              commandId: values[3],
              actorUserId: values[5],
              actorRole: values[6],
              command: values[7],
              fromState: values[8],
              toState: values[9],
              reasonCode: values[10],
              outcomeCode: values[11],
              dueOn: values[12],
              expectedVersion: values[13],
              resultVersion: values[14],
            })]);
            return [{ sequence }];
          }
          if (name === 'commitment-events-v1') {
            return eventRowsByCommitment.get(values[1]) ?? [];
          }
          throw new Error(`unexpected query: ${name}`);
        },
      };
      try {
        return await callback(transaction);
      } finally {
        releaseLock();
      }
    },
  };
  const ids = [
    COMMITMENT_ID,
    EVENT_ID,
    '66666666-6666-4666-8666-666666666666',
    '77777777-7777-4777-8777-777777777777',
  ];
  const store = createGrhActionLedgerStore({
    client,
    assertTransport: () => ({ tlsVerified: true }),
    clock: () => new Date(NOW),
    idFactory: () => ids.shift(),
  });

  const results = await Promise.allSettled([
    store.createCommitment(createInput()),
    store.createCommitment(createInput({
      commandId: SECOND_COMMAND_ID,
      sourceSha256: 'c'.repeat(64),
      evidenceDigest: 'd'.repeat(64),
    })),
  ]);

  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  assert.ok(rejected);
  assertCode(rejected.reason, 'GRH_ACTION_LEDGER_CAPACITY_REACHED');
  assert.equal(insertCount, 1);
  assert.equal(commitmentCount, 100);
  assert.deepEqual(transactionOptionsSeen.map(options => options.isolationLevel), [
    'ReadCommitted',
    'ReadCommitted',
  ]);
});

test('Prisma P2034 races without a durable replay map to a stable version conflict', async t => {
  const prismaConflict = () => Object.assign(new Error('transaction write conflict'), { code: 'P2034' });

  await t.test('create race', async () => {
    let commandReads = 0;
    let sourceReads = 0;
    const { store } = makeStore({
      'command-v1': () => {
        commandReads += 1;
        return [];
      },
      'source-v1': () => {
        sourceReads += 1;
        return [];
      },
      'tenant-capacity-count-v1': [{ count: 0 }],
      'create-commitment-v1': () => { throw prismaConflict(); },
    });
    await assert.rejects(
      store.createCommitment(createInput()),
      error => assertCode(error, 'GRH_ACTION_LEDGER_VERSION_CONFLICT'),
    );
    assert.equal(commandReads, 2);
    assert.equal(sourceReads, 2);
  });

  await t.test('transition race', async () => {
    let commandReads = 0;
    const { store } = makeStore({
      'command-v1': () => {
        commandReads += 1;
        return [];
      },
      'commitment-lock-v1': () => { throw prismaConflict(); },
    }, { ids: [SECOND_EVENT_ID] });
    await assert.rejects(
      store.transitionCommitment(transitionInput()),
      error => assertCode(error, 'GRH_ACTION_LEDGER_VERSION_CONFLICT'),
    );
    assert.equal(commandReads, 2);
  });
});

test('input, transport and database failures are generic and do not leak adapter details', async t => {
  await t.test('structural create errors and dates beyond +180 fail before database access', async () => {
    const { client, store } = makeStore();
    for (const invalid of [
      createInput({ actorRole: 'TENANT_ADMIN' }),
      createInput({ dueOn: '2027-02-08' }),
      createInput({ actionCode: 'review_temporal_quarantine' }),
    ]) {
      await assert.rejects(
        store.createCommitment(invalid),
        error => assertCode(error, 'GRH_ACTION_LEDGER_INPUT_INVALID'),
      );
    }
    assert.equal(client.calls.length, 0);
  });

  await t.test('an expired new create checks replay before rejecting without further reads', async () => {
    const { client, store } = makeStore({ 'command-v1': [] });
    await assert.rejects(
      store.createCommitment(createInput({ dueOn: '2026-08-10' })),
      error => assertCode(error, 'GRH_ACTION_LEDGER_INPUT_INVALID'),
    );
    assert.deepEqual(client.calls.filter(call => call.kind === 'query').map(call => call.name), [
      'tenant-capacity-lock-v1',
      'command-v1',
    ]);
  });

  await t.test('transport error', async () => {
    const { store } = makeStore({}, { assertTransport: () => null });
    await assert.rejects(
      store.listCommitments({ tenantId: TENANT_ID }),
      error => assertCode(error, 'GRH_ACTION_LEDGER_TRANSPORT_INVALID'),
    );
  });

  await t.test('database error', async () => {
    const client = makeClient({
      'list-v1': () => { throw new Error('private database host must not escape'); },
    });
    const store = createGrhActionLedgerStore({
      client,
      assertTransport: () => ({ tlsVerified: true }),
      clock: () => new Date(NOW),
    });
    await assert.rejects(
      store.listCommitments({ tenantId: TENANT_ID }),
      error => assertCode(error, 'GRH_ACTION_LEDGER_DATABASE_UNAVAILABLE'),
    );
  });
});
