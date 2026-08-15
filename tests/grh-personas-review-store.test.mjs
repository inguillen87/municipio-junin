import assert from 'node:assert/strict';
import test from 'node:test';

import { createGrhPersonasReviewStore } from '../api/lib/grh-personas-review-store.js';

const tenantId = 'tenant-junin';
const runId = '11111111-1111-4111-8111-111111111111';
const commandId = '22222222-2222-4222-8222-222222222222';
const caseKey = 'a'.repeat(64);
const optionKey = 'b'.repeat(64);
const personasRef = 'c'.repeat(64);

function runRow() {
  return {
    runId, schemaVersion: 'grh-personas-review-run-v1',
    matcherVersion: 'grh-personas-linkage-matcher-v1',
    evidencePolicyVersion: 'grh-personas-review-evidence-v2', encryptionKeyVersion: 'v1',
    snapshotAsOf: new Date('2026-08-06T00:00:00.000Z'),
    grhSourceSha256: 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9',
    personasSourceSha256: '11bf15764488e4fe8a053255f503404f6bca24a1ac47c90647649e2c41d8e39c',
    semanticDigest: 'd'.repeat(64), runDigest: 'e'.repeat(64),
    totalCaseCount: 2349, totalOptionCount: 2185, candidateCaseCount: 1699,
    ambiguousCaseCount: 157, unmatchedCaseCount: 493, documentConflictCount: 23,
    autoApprovedCount: 0, status: 'READY',
  };
}

function queryText(strings) {
  return strings.join('?');
}

function decisionOption(overrides = {}) {
  return {
    personasRef,
    evidenceLevel: 'ASSISTED',
    matchMethod: 'UNIQUE_VALID_CUIL',
    cuilEvidence: 'MATCH',
    dniEvidence: 'MISSING',
    nameEvidence: 'MATCH',
    birthDateEvidence: 'MISSING',
    ...overrides,
  };
}

test('idempotent retry replays immutable event snapshot despite new correlation and later case changes', async () => {
  let recorded = null;
  let replay = false;
  const mutationOrder = [];
  const tx = {
    async $queryRaw(strings, ...values) {
      const text = queryText(strings);
      if (text.includes('command-v1')) return replay ? [{
        payloadDigest: recorded.payloadDigest,
        caseKey, status: 'APPROVED', version: 2, selectedOptionKey: optionKey,
        reasonCode: 'EVIDENCE_CONFIRMED', decidedAt: new Date('2026-08-13T12:00:00.000Z'),
      }] : [];
      if (text.includes('active-run-v1')) return [runRow()];
      if (text.includes('decision-lock-v1')) return [{
        caseKey, status: 'PENDING', version: 1, documentConflict: false,
        birthDateConflict: false, priority: 'STANDARD',
      }];
      if (text.includes('decision-option-v1')) return [decisionOption()];
      if (text.includes('target-conflict-v1')) return [];
      if (text.includes('decision-update-v1')) {
        mutationOrder.push('case');
        return [{
          caseKey, status: 'APPROVED', version: 2, selectedOptionKey: optionKey,
          reasonCode: 'EVIDENCE_CONFIRMED', decidedAt: new Date('2026-08-13T12:00:00.000Z'),
        }];
      }
      if (text.includes('decision-event-v1')) {
        mutationOrder.push('event');
        recorded = { payloadDigest: values[5] };
        return [{ eventId: '33333333-3333-4333-8333-333333333333' }];
      }
      throw new Error(`unexpected query: ${text}`);
    },
  };
  const client = {
    ...tx,
    async $transaction(callback) { return callback(tx); },
  };
  const store = createGrhPersonasReviewStore({
    client, assertTransport: () => ({ connectionString: 'test' }),
    idFactory: () => '33333333-3333-4333-8333-333333333333',
    clock: () => new Date('2026-08-13T12:00:00.000Z'),
  });
  const base = {
    tenantId, actorUserId: 'official-1', actorRole: 'INTENDENTE', commandId,
    caseKey, expectedVersion: 1, decision: 'APPROVE', optionKey,
    reasonCode: 'EVIDENCE_CONFIRMED', purpose: 'IDENTITY_LINKAGE_REVIEW',
  };
  const first = await store.decide({ ...base, correlationId: '44444444-4444-4444-8444-444444444444' });
  assert.equal(first.replayed, false);
  assert.deepEqual(mutationOrder, ['case', 'event'], 'deferred DB coupling requires update then event in one transaction');
  replay = true;
  const second = await store.decide({ ...base, correlationId: '55555555-5555-4555-8555-555555555555' });
  assert.equal(second.replayed, true);
  assert.deepEqual(second.decision, first.decision);
  await assert.rejects(
    store.decide({
      ...base, decision: 'REJECT', optionKey: null, reasonCode: 'DIFFERENT_PERSON',
      correlationId: '66666666-6666-4666-8666-666666666666',
    }),
    error => error.code === 'GRH_PERSONAS_REVIEW_COMMAND_COLLISION',
  );
});

test('terminal approved and rejected cases cannot be decided again even with the current version', async () => {
  for (const status of ['APPROVED', 'REJECTED']) {
    const queries = [];
    const tx = {
      async $queryRaw(strings) {
        const text = queryText(strings);
        queries.push(text);
        if (text.includes('command-v1')) return [];
        if (text.includes('active-run-v1')) return [runRow()];
        if (text.includes('decision-lock-v1')) return [{
          caseKey, status, version: 2, documentConflict: false,
          birthDateConflict: false, priority: 'STANDARD',
        }];
        throw new Error(`unexpected query after terminal lock: ${text}`);
      },
    };
    const client = { ...tx, async $transaction(callback) { return callback(tx); } };
    const store = createGrhPersonasReviewStore({
      client, assertTransport: () => ({ connectionString: 'test' }),
      idFactory: () => '33333333-3333-4333-8333-333333333333',
      clock: () => new Date('2026-08-13T12:00:00.000Z'),
    });
    await assert.rejects(store.decide({
      tenantId, actorUserId: 'official-1', actorRole: 'INTENDENTE', commandId,
      caseKey, expectedVersion: 2, decision: 'REJECT', optionKey: null,
      reasonCode: 'DIFFERENT_PERSON', purpose: 'IDENTITY_LINKAGE_REVIEW',
      correlationId: '44444444-4444-4444-8444-444444444444',
    }), error => error.code === 'GRH_PERSONAS_REVIEW_VERSION_CONFLICT', status);
    assert.equal(queries.some(text => text.includes('decision-update-v1')), false, status);
    assert.equal(queries.some(text => text.includes('decision-event-v1')), false, status);
  }
});

test('document-conflict approval requires an explicit manual source confirmation', async () => {
  const queries = [];
  const tx = {
    async $queryRaw(strings) {
      const text = queryText(strings);
      queries.push(text);
      if (text.includes('command-v1')) return [];
      if (text.includes('active-run-v1')) return [runRow()];
      if (text.includes('decision-lock-v1')) return [{
        caseKey, status: 'PENDING', version: 1,
        documentConflict: true, birthDateConflict: false, priority: 'DOCUMENT_CONFLICT',
      }];
      if (text.includes('decision-option-v1')) return [decisionOption()];
      if (text.includes('target-conflict-v1')) return [];
      if (text.includes('decision-update-v1')) return [{
        caseKey, status: 'APPROVED', version: 2, selectedOptionKey: optionKey,
        reasonCode: 'MANUAL_SOURCE_CHECK_CONFIRMED',
        decidedAt: new Date('2026-08-13T12:00:00.000Z'),
      }];
      if (text.includes('decision-event-v1')) {
        return [{ eventId: '33333333-3333-4333-8333-333333333333' }];
      }
      throw new Error(`unexpected query: ${text}`);
    },
  };
  const client = { ...tx, async $transaction(callback) { return callback(tx); } };
  const store = createGrhPersonasReviewStore({
    client, assertTransport: () => ({ connectionString: 'test' }),
    idFactory: () => '33333333-3333-4333-8333-333333333333',
    clock: () => new Date('2026-08-13T12:00:00.000Z'),
  });
  const base = {
    tenantId, actorUserId: 'official-1', actorRole: 'INTENDENTE',
    caseKey, expectedVersion: 1, decision: 'APPROVE', optionKey,
    purpose: 'IDENTITY_LINKAGE_REVIEW',
    correlationId: '44444444-4444-4444-8444-444444444444',
  };
  await assert.rejects(store.decide({
    ...base, commandId: '88888888-8888-4888-8888-888888888888',
    reasonCode: 'EVIDENCE_CONFIRMED',
  }), error => error.code === 'GRH_PERSONAS_REVIEW_INPUT_INVALID');
  assert.equal(queries.some(text => text.includes('decision-option-v1')), false);

  queries.length = 0;
  const accepted = await store.decide({
    ...base, commandId: '99999999-9999-4999-8999-999999999999',
    reasonCode: 'MANUAL_SOURCE_CHECK_CONFIRMED',
  });
  assert.equal(accepted.decision.reasonCode, 'MANUAL_SOURCE_CHECK_CONFIRMED');
  assert.equal(queries.some(text => text.includes('decision-event-v1')), true);
});

test('birth-date or selected-option conflict rejects ordinary approval before mutation', async () => {
  const scenarios = [
    {
      name: 'birth-date conflict',
      commandId: '66666666-6666-4666-8666-666666666666',
      locked: {
        caseKey, status: 'PENDING', version: 1, documentConflict: false,
        birthDateConflict: true, priority: 'STANDARD',
      },
      option: decisionOption(),
      reachesOption: false,
    },
    {
      name: 'conflicting selected option',
      commandId: '77777777-7777-4777-8777-777777777777',
      locked: {
        caseKey, status: 'PENDING', version: 1, documentConflict: false,
        birthDateConflict: false, priority: 'STANDARD',
      },
      option: decisionOption({ evidenceLevel: 'CONFLICT' }),
      reachesOption: true,
    },
  ];
  for (const scenario of scenarios) {
    const queries = [];
    const tx = {
      async $queryRaw(strings) {
        const text = queryText(strings);
        queries.push(text);
        if (text.includes('command-v1')) return [];
        if (text.includes('active-run-v1')) return [runRow()];
        if (text.includes('decision-lock-v1')) return [scenario.locked];
        if (text.includes('decision-option-v1')) return [scenario.option];
        throw new Error(`unexpected query: ${text}`);
      },
    };
    const client = { ...tx, async $transaction(callback) { return callback(tx); } };
    const store = createGrhPersonasReviewStore({
      client, assertTransport: () => ({ connectionString: 'test' }),
    });
    await assert.rejects(store.decide({
      tenantId, actorUserId: 'official-1', actorRole: 'INTENDENTE',
      commandId: scenario.commandId,
      caseKey, expectedVersion: 1, decision: 'APPROVE', optionKey,
      reasonCode: 'EVIDENCE_CONFIRMED', purpose: 'IDENTITY_LINKAGE_REVIEW',
      correlationId: '44444444-4444-4444-8444-444444444444',
    }), error => error.code === 'GRH_PERSONAS_REVIEW_INPUT_INVALID', scenario.name);
    assert.equal(queries.some(text => text.includes('decision-option-v1')), scenario.reachesOption, scenario.name);
    assert.equal(queries.some(text => text.includes('decision-update-v1')), false, scenario.name);
    assert.equal(queries.some(text => text.includes('decision-event-v1')), false, scenario.name);
  }
});

test('DNI-only options need name or birth-date support unless manually confirmed', async () => {
  const scenarios = [
    {
      name: 'unique DNI without independent support', reject: true,
      option: decisionOption({
        matchMethod: 'UNIQUE_DNI_BACKUP', cuilEvidence: 'MISSING', dniEvidence: 'MATCH',
        nameEvidence: 'MISSING', birthDateEvidence: 'MISSING',
      }),
      reasonCode: 'EVIDENCE_CONFIRMED',
    },
    {
      name: 'duplicate DNI method without independent support', reject: true,
      option: decisionOption({
        matchMethod: 'DUPLICATE_DNI_NAME', cuilEvidence: 'MISSING', dniEvidence: 'MATCH',
        nameEvidence: 'DIFFERENT', birthDateEvidence: 'MISSING',
      }),
      reasonCode: 'EVIDENCE_CONFIRMED',
    },
    {
      name: 'generic method whose only document support is DNI', reject: true,
      option: decisionOption({
        matchMethod: 'DOCUMENT_CANDIDATE', cuilEvidence: 'CONFLICT', dniEvidence: 'MATCH',
        nameEvidence: 'MISSING', birthDateEvidence: 'CONFLICT',
      }),
      reasonCode: 'EVIDENCE_CONFIRMED',
    },
    {
      name: 'name corroborates DNI', reject: false,
      option: decisionOption({
        matchMethod: 'UNIQUE_DNI_BACKUP', cuilEvidence: 'MISSING', dniEvidence: 'MATCH',
        nameEvidence: 'MATCH', birthDateEvidence: 'MISSING',
      }),
      reasonCode: 'EVIDENCE_CONFIRMED',
    },
    {
      name: 'birth date corroborates DNI', reject: false,
      option: decisionOption({
        matchMethod: 'UNIQUE_DNI_BACKUP', cuilEvidence: 'MISSING', dniEvidence: 'MATCH',
        nameEvidence: 'MISSING', birthDateEvidence: 'MATCH',
      }),
      reasonCode: 'EVIDENCE_CONFIRMED',
    },
    {
      name: 'manual confirmation overrides missing independent support', reject: false,
      option: decisionOption({
        matchMethod: 'UNIQUE_DNI_BACKUP', cuilEvidence: 'MISSING', dniEvidence: 'MATCH',
        nameEvidence: 'MISSING', birthDateEvidence: 'MISSING',
      }),
      reasonCode: 'MANUAL_SOURCE_CHECK_CONFIRMED',
    },
  ];
  for (const scenario of scenarios) {
    const queries = [];
    const tx = {
      async $queryRaw(strings) {
        const text = queryText(strings);
        queries.push(text);
        if (text.includes('command-v1')) return [];
        if (text.includes('active-run-v1')) return [runRow()];
        if (text.includes('decision-lock-v1')) return [{
          caseKey, status: 'PENDING', version: 1, documentConflict: false,
          birthDateConflict: false, priority: 'STANDARD',
        }];
        if (text.includes('decision-option-v1')) return [scenario.option];
        if (text.includes('target-conflict-v1')) return [];
        if (text.includes('decision-update-v1')) return [{
          caseKey, status: 'APPROVED', version: 2, selectedOptionKey: optionKey,
          reasonCode: scenario.reasonCode, decidedAt: new Date('2026-08-13T12:00:00.000Z'),
        }];
        if (text.includes('decision-event-v1')) {
          return [{ eventId: '33333333-3333-4333-8333-333333333333' }];
        }
        throw new Error(`unexpected query: ${text}`);
      },
    };
    const client = { ...tx, async $transaction(callback) { return callback(tx); } };
    const store = createGrhPersonasReviewStore({
      client, assertTransport: () => ({ connectionString: 'test' }),
      idFactory: () => '33333333-3333-4333-8333-333333333333',
      clock: () => new Date('2026-08-13T12:00:00.000Z'),
    });
    const input = {
      tenantId, actorUserId: 'official-1', actorRole: 'INTENDENTE', commandId,
      caseKey, expectedVersion: 1, decision: 'APPROVE', optionKey,
      reasonCode: scenario.reasonCode, purpose: 'IDENTITY_LINKAGE_REVIEW',
      correlationId: '44444444-4444-4444-8444-444444444444',
    };
    if (scenario.reject) {
      await assert.rejects(store.decide(input),
        error => error.code === 'GRH_PERSONAS_REVIEW_INPUT_INVALID', scenario.name);
      assert.equal(queries.some(text => text.includes('decision-update-v1')), false, scenario.name);
      assert.equal(queries.some(text => text.includes('decision-event-v1')), false, scenario.name);
    } else {
      const result = await store.decide(input);
      assert.equal(result.decision.reasonCode, scenario.reasonCode, scenario.name);
      assert.equal(queries.some(text => text.includes('decision-event-v1')), true, scenario.name);
    }
  }
});

test('queue cursor is resolved to the exact priority/kind/case tuple', async () => {
  let queueSql = '';
  const client = {
    async $queryRaw(strings) {
      const text = queryText(strings);
      if (text.includes('active-run-v1')) return [runRow()];
      if (text.includes('status-counts-v1')) return [{ status: 'PENDING', count: 2349n }];
      if (text.includes('queue-cursor-v1')) return [{ priority: 'DOCUMENT_CONFLICT', kind: 'AMBIGUOUS', status: 'PENDING' }];
      if (text.includes('queue-v1')) { queueSql = text; return []; }
      throw new Error(`unexpected query: ${text}`);
    },
  };
  const store = createGrhPersonasReviewStore({ client, assertTransport: () => ({ connectionString: 'test' }) });
  const result = await store.queue({ tenantId, status: 'PENDING', kind: null, limit: 25, cursor: caseKey });
  assert.deepEqual(result.items, []);
  assert.match(queueSql, /CASE priority[\s\S]+CASE kind[\s\S]+case_key >/u);
  assert.equal(queueSql.includes('(${cursor}::text IS NULL OR case_key >'), false);
});

test('detail and document-reveal audits commit distinct non-document events and fail closed', async () => {
  const writes = [];
  const store = createGrhPersonasReviewStore({
    client: { auditLog: { create: async value => { writes.push(value); return { id: 'audit-1' }; } } },
    assertTransport: () => ({ connectionString: 'test' }),
    idFactory: () => 'audit-1', clock: () => new Date('2026-08-13T12:00:00.000Z'),
  });
  await store.recordDetailRead({
    tenantId, actorUserId: 'official-1', caseKey, purpose: 'IDENTITY_LINKAGE_REVIEW',
    correlationId: '77777777-7777-4777-8777-777777777777', optionCount: 2,
  });
  assert.deepEqual(writes[0].data.details, {
    purpose: 'IDENTITY_LINKAGE_REVIEW', correlationId: '77777777-7777-4777-8777-777777777777', optionCount: 2,
  });
  assert.equal(JSON.stringify(writes).includes('displayName'), false);
  await store.recordDocumentReveal({
    tenantId, actorUserId: 'official-1', caseKey, purpose: 'IDENTITY_DOCUMENT_REVEAL',
    correlationId: '88888888-8888-4888-8888-888888888888', optionCount: 2,
  });
  assert.equal(writes[1].data.action, 'GRH_PERSONAS_REVIEW_DOCUMENT_REVEAL');
  assert.equal(writes[1].data.entityId, caseKey);
  assert.deepEqual(writes[1].data.details, {
    purpose: 'IDENTITY_DOCUMENT_REVEAL', correlationId: '88888888-8888-4888-8888-888888888888', optionCount: 2,
  });
  assert.equal(/"(?:cuil|dni|documents|displayName|birthDate)"/u.test(JSON.stringify(writes[1].data.details)), false);
  await assert.rejects(store.recordDocumentReveal({
    tenantId, actorUserId: 'official-1', caseKey, purpose: 'IDENTITY_LINKAGE_REVIEW',
    correlationId: '88888888-8888-4888-8888-888888888888', optionCount: 2,
  }), error => error.code === 'GRH_PERSONAS_REVIEW_AUDIT_UNAVAILABLE');
  await assert.rejects(store.recordDetailRead({
    tenantId, actorUserId: 'official-1', caseKey, purpose: 'IDENTITY_LINKAGE_REVIEW',
    correlationId: '77777777-7777-5777-8777-777777777777', optionCount: 2,
  }), error => error.code === 'GRH_PERSONAS_REVIEW_AUDIT_UNAVAILABLE');

  const uncommittedStore = createGrhPersonasReviewStore({
    client: { auditLog: { create: async () => ({ id: 'different-audit-id' }) } },
    assertTransport: () => ({ connectionString: 'test' }),
    idFactory: () => 'audit-expected', clock: () => new Date('2026-08-13T12:00:00.000Z'),
  });
  await assert.rejects(uncommittedStore.recordDocumentReveal({
    tenantId, actorUserId: 'official-1', caseKey, purpose: 'IDENTITY_DOCUMENT_REVEAL',
    correlationId: '99999999-9999-4999-8999-999999999999', optionCount: 2,
  }), error => error.code === 'GRH_PERSONAS_REVIEW_AUDIT_UNAVAILABLE');
});
