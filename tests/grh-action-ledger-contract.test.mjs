import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  GRH_ACTION_LEDGER_LIMITS,
  GRH_ACTION_LEDGER_SCHEMA_VERSION,
  inspectGrhActionLedgerContract,
  validateGrhActionLedgerContract,
} from '../api/lib/grh-action-ledger-contract.js';
import {
  buildGrhActionLedgerEvidence,
  buildGrhActionLedgerProjection,
  digestGrhActionLedgerPayload,
} from '../api/lib/grh-action-ledger-projection.js';
import { createGrhActionLedgerStore } from '../api/lib/grh-action-ledger-store.js';
import { buildGrhCloseProjection } from '../api/lib/grh-close-projection.js';
import { buildGrhDecisionBriefProjection } from '../api/lib/grh-decision-brief-projection.js';
import { buildGrhExecutiveProjection } from '../api/lib/grh-executive-projection.js';
import { buildGrhQualityProjection } from '../api/lib/grh-quality-projection.js';

const NOW = new Date('2026-08-11T12:00:00.000Z');
const COMMITMENT_ID = '11111111-1111-4111-8111-111111111111';
const CREATE_EVENT_ID = '22222222-2222-4222-8222-222222222222';
const CREATE_COMMAND_ID = '33333333-3333-4333-8333-333333333333';
const CLAIM_EVENT_ID = '44444444-4444-4444-8444-444444444444';
const CLAIM_COMMAND_ID = '55555555-5555-4555-8555-555555555555';
const COMPLETE_EVENT_ID = '66666666-6666-4666-8666-666666666666';
const COMPLETE_COMMAND_ID = '77777777-7777-4777-8777-777777777777';

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

function rawCommitment(brief, evidence, { completed = false } = {}) {
  const events = [
    {
      eventId: CREATE_EVENT_ID,
      commandId: CREATE_COMMAND_ID,
      command: 'create',
      actorUserId: 'user-intendente',
      actorRole: 'INTENDENTE',
      fromState: null,
      toState: 'OPEN',
      reasonCode: null,
      outcomeCode: null,
      dueOn: '2026-08-20',
      expectedVersion: 0,
      resultVersion: 1,
      occurredAt: '2026-08-11T13:00:00.000Z',
    },
    {
      eventId: CLAIM_EVENT_ID,
      commandId: CLAIM_COMMAND_ID,
      command: 'claim',
      actorUserId: 'user-contador',
      actorRole: 'CONTADOR',
      fromState: 'OPEN',
      toState: 'IN_PROGRESS',
      reasonCode: null,
      outcomeCode: null,
      dueOn: null,
      expectedVersion: 1,
      resultVersion: 2,
      occurredAt: '2026-08-11T14:00:00.000Z',
    },
  ];
  if (completed) {
    events.push({
      eventId: COMPLETE_EVENT_ID,
      commandId: COMPLETE_COMMAND_ID,
      command: 'complete',
      actorUserId: 'user-contador',
      actorRole: 'CONTADOR',
      fromState: 'IN_PROGRESS',
      toState: 'COMPLETED',
      reasonCode: null,
      outcomeCode: 'review_completed',
      dueOn: null,
      expectedVersion: 2,
      resultVersion: 3,
      occurredAt: '2026-08-11T15:00:00.000Z',
    });
  }
  return {
    id: COMMITMENT_ID,
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
    state: completed ? 'COMPLETED' : 'IN_PROGRESS',
    assigneeRole: 'CONTADOR',
    ownerUserId: 'user-contador',
    dueOn: '2026-08-20',
    version: completed ? 3 : 2,
    outcomeCode: completed ? 'review_completed' : null,
    createdAt: '2026-08-11T13:00:00.000Z',
    updatedAt: completed ? '2026-08-11T15:00:00.000Z' : '2026-08-11T14:00:00.000Z',
    events,
    replayed: false,
  };
}

function historicalCommitment(brief, evidence, {
  sourceSha256 = 'c'.repeat(64),
  snapshotAsOf = '2026-07-06',
  period = '2026-06',
} = {}) {
  const row = rawCommitment(brief, evidence);
  row.source.sha256 = sourceSha256;
  row.source.snapshotAsOf = snapshotAsOf;
  row.source.period = period;
  row.source.evidenceDigest = digestGrhActionLedgerPayload({
    schemaVersion: row.brief.schemaVersion,
    policyVersion: row.brief.policyVersion,
    sourceSha256,
    snapshotAsOf,
    period,
    priorityCode: row.priority.code,
    severity: row.priority.severity,
    actionCode: row.priority.actionCode,
  });
  return row;
}

test('the real decision brief projects an exact immutable action ledger with actionable suggestions only', async () => {
  const brief = await realBrief();
  const projection = buildGrhActionLedgerProjection({
    brief,
    commitments: [],
    caller: { id: 'user-intendente', role: 'INTENDENTE' },
    now: () => NOW,
  });

  assert.equal(projection.schemaVersion, GRH_ACTION_LEDGER_SCHEMA_VERSION);
  assert.deepEqual(Object.keys(projection), [
    'schemaVersion', 'currentBrief', 'permissions', 'summary', 'suggestions', 'commitments', 'limits',
  ]);
  assert.deepEqual(projection.summary, {
    total: 0, open: 0, inProgress: 0, blocked: 0, completed: 0, canceled: 0, overdue: 0,
  });
  assert.deepEqual(projection.suggestions.map(row => row.priorityCode), [
    'cross_source_material_difference',
    'temporal_quarantine_present',
  ]);
  assert.equal(projection.suggestions.some(row => row.priorityCode === 'historical_snapshot'), false);
  assert.ok(projection.suggestions.every(row => row.available && row.existingCommitmentId === null));
  assert.deepEqual(projection.limits, GRH_ACTION_LEDGER_LIMITS);
  assert.equal(validateGrhActionLedgerContract(projection), true);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.suggestions[0]), true);
});

test('the projection consumes the exact store output and strips every internal identity', async () => {
  const brief = await realBrief();
  const evidence = buildGrhActionLedgerEvidence(brief, 'cross_source_material_difference');
  const projection = buildGrhActionLedgerProjection({
    brief,
    commitments: [rawCommitment(brief, evidence)],
    caller: { id: 'user-contador', role: 'CONTADOR' },
    now: () => NOW,
  });

  assert.equal(projection.commitments.length, 1);
  const commitment = projection.commitments[0];
  assert.deepEqual(commitment.assignee, { role: 'CONTADOR', isCurrentUser: true });
  assert.deepEqual(commitment.availableTransitions, ['block', 'complete']);
  assert.deepEqual(commitment.events.map(event => event.sequence), [1, 2]);
  assert.deepEqual(commitment.events.map(event => event.resultingVersion), [1, 2]);
  assert.equal(commitment.events[1].isCurrentUser, true);
  assert.equal(projection.suggestions[0].existingCommitmentId, COMMITMENT_ID);
  assert.equal(projection.suggestions[0].available, false);
  const serialized = JSON.stringify(projection);
  assert.doesNotMatch(serialized, /ownerUserId|actorUserId|commandId|eventId|tenantId|replayed/);
  assert.doesNotMatch(serialized, /user-intendente|user-contador/);
  assert.equal(validateGrhActionLedgerContract(projection), true);
});

test('the projection accepts the actual store adapter output without a compatibility fixture', async () => {
  const brief = await realBrief();
  const evidence = buildGrhActionLedgerEvidence(brief, 'cross_source_material_difference');
  const databaseCommitment = {
    id: COMMITMENT_ID,
    briefSchemaVersion: brief.schemaVersion,
    briefPolicyVersion: brief.policyVersion,
    sourceSha256: evidence.sourceSha256,
    snapshotAsOf: evidence.snapshotAsOf,
    period: evidence.period,
    priorityCode: 'cross_source_material_difference',
    prioritySeverity: 'CRITICAL',
    actionCode: 'REVIEW_CROSS_SOURCE_RECONCILIATION',
    evidenceDigest: evidence.evidenceDigest,
    state: 'OPEN',
    assigneeRole: 'TENANT_ADMIN',
    ownerUserId: null,
    dueOn: '2026-08-20',
    version: 1,
    outcomeCode: null,
    createdAt: '2026-08-11T13:00:00.000Z',
    updatedAt: '2026-08-11T13:00:00.000Z',
  };
  const databaseEvent = {
    sequence: 1n,
    eventId: CREATE_EVENT_ID,
    commitmentId: COMMITMENT_ID,
    commandId: CREATE_COMMAND_ID,
    actorUserId: 'user-intendente',
    actorRole: 'INTENDENTE',
    command: 'CREATE',
    fromState: null,
    toState: 'OPEN',
    reasonCode: null,
    outcomeCode: null,
    dueOn: '2026-08-20',
    expectedVersion: 0,
    resultVersion: 1,
    occurredAt: '2026-08-11T13:00:00.000Z',
  };
  const client = {
    async $queryRaw(strings) {
      const sql = strings.join('?');
      if (sql.includes('grh-action-ledger:list-v1')) return [databaseCommitment];
      if (sql.includes('grh-action-ledger:tenant-events-v1')) return [databaseEvent];
      throw new Error('unexpected query');
    },
    async $transaction(callback) { return callback(client); },
  };
  const store = createGrhActionLedgerStore({
    client,
    assertTransport: () => ({ tlsVerified: true }),
    clock: () => NOW,
  });
  const storeOutput = await store.listCommitments({ tenantId: 'tenant-junin' });
  assert.deepEqual(Object.keys(storeOutput[0]), [
    'id', 'brief', 'source', 'priority', 'state', 'assigneeRole', 'ownerUserId', 'dueOn',
    'version', 'outcomeCode', 'createdAt', 'updatedAt', 'events', 'replayed',
  ]);

  const projection = buildGrhActionLedgerProjection({
    brief,
    commitments: storeOutput,
    caller: { id: 'user-tenant-admin', role: 'TENANT_ADMIN' },
    now: () => NOW,
  });
  assert.equal(validateGrhActionLedgerContract(projection), true);
  assert.equal(projection.commitments[0].assignee.role, 'TENANT_ADMIN');
  assert.deepEqual(projection.commitments[0].availableTransitions, ['claim']);
});

test('a terminal commitment remains the unique existing suggestion and cannot be recreated', async () => {
  const brief = await realBrief();
  const evidence = buildGrhActionLedgerEvidence(brief, 'cross_source_material_difference');
  const projection = buildGrhActionLedgerProjection({
    brief,
    commitments: [rawCommitment(brief, evidence, { completed: true })],
    caller: { id: 'user-intendente', role: 'INTENDENTE' },
    now: () => NOW,
  });

  assert.equal(projection.commitments[0].state, 'completed');
  assert.equal(projection.commitments[0].outcomeCode, 'review_completed');
  assert.deepEqual(projection.commitments[0].availableTransitions, []);
  assert.equal(projection.suggestions[0].existingCommitmentId, COMMITMENT_ID);
  assert.equal(projection.suggestions[0].available, false);
  assert.equal(validateGrhActionLedgerContract(projection), true);
});

test('a historical commitment stays visible but cannot occupy the current brief suggestion', async () => {
  const brief = await realBrief();
  const evidence = buildGrhActionLedgerEvidence(brief, 'cross_source_material_difference');
  const projection = buildGrhActionLedgerProjection({
    brief,
    commitments: [historicalCommitment(brief, evidence)],
    caller: { id: 'user-intendente', role: 'INTENDENTE' },
    now: () => NOW,
  });

  assert.equal(projection.summary.total, 1);
  assert.equal(projection.commitments[0].source.snapshotAsOf, '2026-07-06');
  assert.equal(projection.suggestions[0].existingCommitmentId, null);
  assert.equal(projection.suggestions[0].available, true);
  assert.equal(validateGrhActionLedgerContract(projection), true);

  const forgedBinding = structuredClone(projection);
  forgedBinding.suggestions[0].existingCommitmentId = COMMITMENT_ID;
  forgedBinding.suggestions[0].available = false;
  assert.equal(inspectGrhActionLedgerContract(forgedBinding).ok, false);
});

test('capacity across historical briefs closes every new suggestion for the current brief', async () => {
  const brief = await realBrief();
  const evidence = buildGrhActionLedgerEvidence(brief, 'cross_source_material_difference');
  const commitments = Array.from({ length: 100 }, (_, index) => {
    const row = rawCommitment(brief, evidence);
    const hex = index.toString(16).padStart(8, '0');
    row.id = `${hex}-1111-4111-8111-111111111111`;
    row.source.sha256 = (index + 1).toString(16).padStart(64, '0');
    row.source.snapshotAsOf = '2026-07-06';
    row.source.period = '2026-06';
    row.source.evidenceDigest = digestGrhActionLedgerPayload({
      schemaVersion: row.brief.schemaVersion,
      policyVersion: row.brief.policyVersion,
      sourceSha256: row.source.sha256,
      snapshotAsOf: row.source.snapshotAsOf,
      period: row.source.period,
      priorityCode: row.priority.code,
      severity: row.priority.severity,
      actionCode: row.priority.actionCode,
    });
    row.events[0].eventId = `${hex}-2222-4222-8222-222222222222`;
    row.events[0].commandId = `${hex}-3333-4333-8333-333333333333`;
    row.events[1].eventId = `${hex}-4444-4444-8444-444444444444`;
    row.events[1].commandId = `${hex}-5555-4555-8555-555555555555`;
    return row;
  });
  const projection = buildGrhActionLedgerProjection({
    brief,
    commitments,
    caller: { id: 'user-intendente', role: 'INTENDENTE' },
    now: () => NOW,
  });

  assert.equal(projection.summary.total, 100);
  assert.equal(projection.summary.inProgress, 100);
  assert.equal(projection.commitments.length, 100);
  assert.ok(projection.commitments.every(row => row.source.snapshotAsOf === '2026-07-06'));
  assert.ok(projection.suggestions.every(row => row.existingCommitmentId === null));
  assert.ok(projection.suggestions.every(row => row.available === false));
  assert.equal(validateGrhActionLedgerContract(projection), true);
});

test('missing owner/events and old flattened aliases fail closed instead of being invented', async () => {
  const brief = await realBrief();
  const evidence = buildGrhActionLedgerEvidence(brief, 'cross_source_material_difference');
  const baseline = rawCommitment(brief, evidence);
  const scenarios = [
    value => { delete value.ownerUserId; },
    value => { delete value.events; },
    value => { value.priorityCode = value.priority.code; delete value.priority; },
    value => { value.source.sourceSha256 = value.source.sha256; delete value.source.sha256; },
    value => { value.events[0].resultingVersion = value.events[0].resultVersion; delete value.events[0].resultVersion; },
  ];

  for (const mutate of scenarios) {
    const candidate = structuredClone(baseline);
    mutate(candidate);
    assert.throws(
      () => buildGrhActionLedgerProjection({
        brief,
        commitments: [candidate],
        caller: { id: 'user-contador', role: 'CONTADOR' },
        now: () => NOW,
      }),
      error => error?.code === 'GRH_ACTION_LEDGER_STORE_INVALID',
    );
  }
});

test('the public contract rejects contradictory state, time, due-date and outcome timelines', async () => {
  const brief = await realBrief();
  const evidence = buildGrhActionLedgerEvidence(brief, 'cross_source_material_difference');
  const valid = buildGrhActionLedgerProjection({
    brief,
    commitments: [rawCommitment(brief, evidence, { completed: true })],
    caller: { id: 'user-contador', role: 'CONTADOR' },
    now: () => NOW,
  });
  const scenarios = [
    value => { value.commitments[0].events[1].fromState = 'blocked'; },
    value => { value.commitments[0].events[1].occurredAt = '2026-08-11T12:00:00.000Z'; },
    value => { value.commitments[0].events[0].dueOn = null; },
    value => { value.commitments[0].events[2].outcomeCode = null; },
    value => { value.commitments[0].events[2].resultingVersion = 7; },
  ];
  for (const mutate of scenarios) {
    const candidate = structuredClone(valid);
    mutate(candidate);
    const inspection = inspectGrhActionLedgerContract(candidate);
    assert.equal(inspection.ok, false);
  }
});

test('published demos receive a read-only projection even when their role normally mutates', async () => {
  const brief = await realBrief();
  const projection = buildGrhActionLedgerProjection({
    brief,
    commitments: [],
    caller: { id: 'published-intendente', role: 'INTENDENTE' },
    publishedDemo: true,
    now: () => NOW,
  });
  assert.deepEqual(projection.permissions, {
    canRead: true,
    canCreate: false,
    canUpdate: false,
    canCancel: false,
    canReschedule: false,
  });
  assert.ok(projection.suggestions.every(row => row.available === false));
});
