import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SECURITY_AUDIT_GENESIS_HASH,
  SECURITY_AUDIT_RESULT_CODES,
  SECURITY_AUDIT_SCHEMA_VERSION,
  appendSecurityAuditEvent,
  canonicalSecurityAuditJson,
  createAuditPrincipalHash,
  hashSecurityAuditEvent,
  requireCommittedSecurityAudit,
} from '../api/lib/security-audit-ledger.js';

const FIXED_TIME = '2026-08-11T15:04:05.000Z';
const FIXED_EVENT_ID = '01989b25-6890-7a2f-8b15-f13b88b691f2';
const AUDIT_SECRET = 'test-only-secret-with-at-least-thirty-two-bytes';

function validInput(overrides = {}) {
  return {
    tenantId: 'tenant-junin',
    principalHash: createAuditPrincipalHash({
      secret: AUDIT_SECRET,
      tenantId: 'tenant-junin',
      userId: 'user-9',
    }),
    purpose: 'DIRECTORY_BROWSE',
    operation: 'list',
    correlationId: 'req-20260811-0001',
    authorizationMode: 'intersect',
    authorizationReason: 'INTERSECTION_ALLOWED',
    outcome: 'ALLOWED',
    policyVersion: 'rbac:0123456789abcdef',
    assignmentIds: ['assignment-2', 'assignment-1'],
    scopeIds: ['scope-b', 'scope-a'],
    scopeKind: 'ORG_SUBTREE',
    organizationCount: 3,
    resultCount: 25,
    ...overrides,
  };
}

function mockQueryAdapter({ previousRows = [], failWhen = null, insertRowCount = 1 } = {}) {
  const calls = [];
  let releases = 0;
  const client = {
    async query(sql, params) {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalizedSql, params });
      if (failWhen && normalizedSql.includes(failWhen)) {
        throw new Error('db-error-with-private-payload-Mauricio-legajo-123');
      }
      if (normalizedSql.startsWith('SELECT chain_sequence')) return { rows: previousRows };
      if (normalizedSql.startsWith('INSERT INTO')) return { rowCount: insertRowCount, rows: [] };
      return { rowCount: null, rows: [] };
    },
    release() {
      releases += 1;
    },
  };
  return {
    calls,
    get releases() { return releases; },
    async connect() { return client; },
  };
}

function dependencies(queryAdapter) {
  return {
    queryAdapter,
    clock: () => FIXED_TIME,
    idFactory: () => FIXED_EVENT_ID,
  };
}

function insertedEventFromParams(params) {
  return {
    schemaVersion: params[5],
    eventId: params[0],
    chainPartition: params[1],
    chainSequence: params[2],
    previousHash: params[3],
    tenantId: params[6],
    principalHash: params[7],
    permission: params[8],
    purpose: params[9],
    operation: params[10],
    outcome: params[11],
    authorizationMode: params[12],
    authorizationReason: params[13],
    policyVersion: params[14],
    assignmentIds: params[15],
    scopeIds: params[16],
    scopeKind: params[17],
    organizationCount: params[18],
    resultCount: params[19],
    correlationId: params[20],
    occurredAt: params[21],
  };
}

test('appends a canonical hash-chained event under a transaction-scoped advisory lock', async () => {
  const adapter = mockQueryAdapter();
  const result = await appendSecurityAuditEvent(validInput(), dependencies(adapter));

  assert.equal(result.ok, true);
  assert.equal(result.failClosed, false);
  assert.equal(result.code, SECURITY_AUDIT_RESULT_CODES.COMMITTED);
  assert.equal(result.previousHash, SECURITY_AUDIT_GENESIS_HASH);
  assert.equal(result.chainSequence, 1);
  assert.equal(result.chainPartition, 'grh-directory/tenant-junin/2026-08');
  assert.equal(adapter.releases, 1);
  assert.deepEqual(adapter.calls.map(call => call.sql.split(' ')[0]), [
    'BEGIN',
    'SELECT',
    'SELECT',
    'INSERT',
    'COMMIT',
  ]);

  const lock = adapter.calls[1];
  assert.match(lock.sql, /pg_advisory_xact_lock/);
  assert.equal(lock.params.length, 2);
  assert.ok(lock.params.every(Number.isInteger));

  const prior = adapter.calls[2];
  assert.match(prior.sql, /WHERE chain_partition = \$1/);
  assert.match(prior.sql, /FOR UPDATE$/);
  assert.deepEqual(prior.params, ['grh-directory/tenant-junin/2026-08']);

  const insert = adapter.calls[3];
  assert.match(insert.sql, /^INSERT INTO security_audit_events/);
  assert.equal(insert.params.length, 22);
  assert.deepEqual(insert.params[15], ['assignment-1', 'assignment-2']);
  assert.deepEqual(insert.params[16], ['scope-a', 'scope-b']);
  const event = insertedEventFromParams(insert.params);
  assert.equal(event.schemaVersion, SECURITY_AUDIT_SCHEMA_VERSION);
  assert.equal(insert.params[4], hashSecurityAuditEvent(event));
  assert.equal(result.eventHash, insert.params[4]);
  assert.ok(Object.isFrozen(result));
});

test('continues an existing chain using the previous sequence and hash', async () => {
  const previousHash = 'a'.repeat(64);
  const adapter = mockQueryAdapter({
    previousRows: [{ chain_sequence: '41', event_hash: previousHash }],
  });
  const result = await appendSecurityAuditEvent(validInput(), dependencies(adapter));

  assert.equal(result.ok, true);
  assert.equal(result.chainSequence, 42);
  assert.equal(result.previousHash, previousHash);
  const insert = adapter.calls.find(call => call.sql.startsWith('INSERT INTO'));
  assert.equal(insert.params[2], 42);
  assert.equal(insert.params[3], previousHash);
});

test('the maximum accepted tenant identifier fits the governed chain partition', async () => {
  const tenantId = 't'.repeat(128);
  const adapter = mockQueryAdapter();
  const result = await appendSecurityAuditEvent(validInput({
    tenantId,
    principalHash: createAuditPrincipalHash({
      secret: AUDIT_SECRET,
      tenantId,
      userId: 'user-9',
    }),
  }), dependencies(adapter));

  assert.equal(result.ok, true);
  assert.equal(result.chainPartition.length, 150);
  assert.ok(result.chainPartition.length <= 160);
});

test('canonical JSON and event hashes are stable across key order', () => {
  const left = { z: [3, { b: true, a: null }], a: 'á' };
  const right = { a: 'á', z: [3, { a: null, b: true }] };
  assert.equal(
    canonicalSecurityAuditJson(left),
    '{"a":"á","z":[3,{"a":null,"b":true}]}',
  );
  assert.equal(canonicalSecurityAuditJson(left), canonicalSecurityAuditJson(right));
  assert.equal(hashSecurityAuditEvent(left), hashSecurityAuditEvent(right));
  assert.match(hashSecurityAuditEvent(left), /^[a-f0-9]{64}$/);
});

test('canonicalization rejects cycles, undefined values, negative zero, and exotic prototypes', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalSecurityAuditJson(cyclic), /Cyclic/);
  assert.throws(() => canonicalSecurityAuditJson({ value: undefined }), /Undefined/);
  assert.throws(() => canonicalSecurityAuditJson({ value: -0 }), /Non-canonical/);
  assert.throws(() => canonicalSecurityAuditJson(new Date()), /Unsupported/);
});

test('principal identifiers are HMAC-pseudonymized and never stored raw', async () => {
  const first = createAuditPrincipalHash({
    secret: AUDIT_SECRET,
    tenantId: 'tenant-junin',
    userId: 'user-9',
  });
  const repeated = createAuditPrincipalHash({
    secret: AUDIT_SECRET,
    tenantId: 'tenant-junin',
    userId: 'user-9',
  });
  const anotherTenant = createAuditPrincipalHash({
    secret: AUDIT_SECRET,
    tenantId: 'tenant-other',
    userId: 'user-9',
  });
  assert.equal(first, repeated);
  assert.notEqual(first, anotherTenant);
  assert.match(first, /^[a-f0-9]{64}$/);

  const adapter = mockQueryAdapter();
  await appendSecurityAuditEvent(validInput({ principalHash: first }), dependencies(adapter));
  const serializedCalls = JSON.stringify(adapter.calls);
  assert.equal(serializedCalls.includes('user-9'), false);
  assert.equal(serializedCalls.includes(AUDIT_SECRET), false);
});

test('PII and arbitrary payload fields are rejected before opening a connection', async t => {
  for (const [field, value] of [
    ['query', 'Mauricio Alonso'],
    ['name', 'Mauricio Alonso'],
    ['legajo', '12345'],
    ['metadata', { target: 'Mauricio' }],
  ]) {
    await t.test(field, async () => {
      const adapter = mockQueryAdapter();
      const input = { ...validInput(), [field]: value };
      const result = await appendSecurityAuditEvent(input, dependencies(adapter));
      assert.deepEqual(result, {
        ok: false,
        failClosed: true,
        code: SECURITY_AUDIT_RESULT_CODES.INPUT_INVALID,
      });
      assert.deepEqual(adapter.calls, []);
      assert.equal(JSON.stringify(result).includes(String(value)), false);
    });
  }
});

test('hostile input getters are represented as a generic fail-closed validation result', async () => {
  const hostile = new Proxy(validInput(), {
    ownKeys() { throw new Error('private-query-value'); },
  });
  const result = await appendSecurityAuditEvent(hostile, dependencies(mockQueryAdapter()));
  assert.deepEqual(result, {
    ok: false,
    failClosed: true,
    code: SECURITY_AUDIT_RESULT_CODES.INPUT_INVALID,
  });
  assert.equal(JSON.stringify(result).includes('private-query-value'), false);
});

test('purpose, operation, correlation, scope, counts, and evidence are exact and bounded', async t => {
  const invalidCases = [
    { purpose: 'FREE_TEXT' },
    { operation: 'search' },
    { correlationId: 'contains spaces' },
    { authorizationMode: 'enabled' },
    { authorizationReason: 'lowercase-reason' },
    { outcome: 'SUCCESS' },
    { principalHash: 'admin@junin.gov.ar' },
    { resultCount: -1 },
    { operation: 'detail', resultCount: 2 },
    { outcome: 'DENIED', resultCount: 1 },
    { scopeKind: 'NONE', organizationCount: 1 },
    { scopeKind: 'ORG_UNIT', organizationCount: 0 },
    { assignmentIds: ['duplicate', 'duplicate'] },
    { policyVersion: null },
  ];

  for (const overrides of invalidCases) {
    await t.test(JSON.stringify(overrides), async () => {
      const adapter = mockQueryAdapter();
      const result = await appendSecurityAuditEvent(validInput(overrides), dependencies(adapter));
      assert.equal(result.code, SECURITY_AUDIT_RESULT_CODES.INPUT_INVALID);
      assert.equal(result.failClosed, true);
      assert.deepEqual(adapter.calls, []);
    });
  }
});

test('a static allowed event may omit dynamic policy and assignment evidence', async () => {
  const adapter = mockQueryAdapter();
  const result = await appendSecurityAuditEvent(validInput({
    authorizationMode: 'disabled',
    authorizationReason: 'STATIC_ALLOWED',
    policyVersion: null,
    assignmentIds: [],
    scopeIds: [],
    scopeKind: 'TENANT',
    organizationCount: 0,
  }), dependencies(adapter));
  assert.equal(result.ok, true);
});

test('invalid prior chain state rolls back and returns a generic fail-closed receipt', async t => {
  const cases = [
    [{ chain_sequence: 'not-a-number', event_hash: 'a'.repeat(64) }],
    [{ chain_sequence: String(Number.MAX_SAFE_INTEGER), event_hash: 'a'.repeat(64) }],
    [{ chain_sequence: '1', event_hash: 'not-a-hash' }],
    [{ chain_sequence: 1, event_hash: 'a'.repeat(64), extra: 'drift' }],
    [
      { chain_sequence: 2, event_hash: 'b'.repeat(64) },
      { chain_sequence: 1, event_hash: 'a'.repeat(64) },
    ],
  ];

  for (const previousRows of cases) {
    await t.test(JSON.stringify(previousRows), async () => {
      const adapter = mockQueryAdapter({ previousRows });
      const result = await appendSecurityAuditEvent(validInput(), dependencies(adapter));
      assert.deepEqual(result, {
        ok: false,
        failClosed: true,
        code: SECURITY_AUDIT_RESULT_CODES.CHAIN_DRIFT,
      });
      assert.equal(adapter.calls.at(-1).sql, 'ROLLBACK');
      assert.equal(adapter.releases, 1);
    });
  }
});

test('insert and commit failures are fail-closed, rolled back, released, and never logged', async t => {
  for (const failWhen of ['INSERT INTO', 'COMMIT']) {
    await t.test(failWhen, async () => {
      const adapter = mockQueryAdapter({ failWhen });
      const seen = [];
      const originals = { log: console.log, warn: console.warn, error: console.error };
      console.log = (...args) => seen.push(['log', ...args]);
      console.warn = (...args) => seen.push(['warn', ...args]);
      console.error = (...args) => seen.push(['error', ...args]);
      let result;
      try {
        result = await appendSecurityAuditEvent(validInput(), dependencies(adapter));
      } finally {
        console.log = originals.log;
        console.warn = originals.warn;
        console.error = originals.error;
      }

      assert.deepEqual(result, {
        ok: false,
        failClosed: true,
        code: SECURITY_AUDIT_RESULT_CODES.WRITE_FAILED,
      });
      assert.deepEqual(seen, []);
      assert.equal(adapter.calls.at(-1).sql, 'ROLLBACK');
      assert.equal(adapter.releases, 1);
      assert.equal(JSON.stringify(result).includes('Mauricio'), false);
    });
  }
});

test('connection and adapter failures never expose internal errors', async () => {
  const connectionFailure = {
    async connect() { throw new Error('password=private-value'); },
  };
  const failed = await appendSecurityAuditEvent(validInput(), dependencies(connectionFailure));
  assert.deepEqual(failed, {
    ok: false,
    failClosed: true,
    code: SECURITY_AUDIT_RESULT_CODES.WRITE_FAILED,
  });
  assert.equal(JSON.stringify(failed).includes('private-value'), false);

  const invalidAdapter = await appendSecurityAuditEvent(validInput(), { queryAdapter: {} });
  assert.equal(invalidAdapter.code, SECURITY_AUDIT_RESULT_CODES.ADAPTER_INVALID);
  assert.equal(invalidAdapter.failClosed, true);
});

test('requireCommittedSecurityAudit enforces the fail-closed receipt', async () => {
  const adapter = mockQueryAdapter();
  const committed = await appendSecurityAuditEvent(validInput(), dependencies(adapter));
  assert.equal(requireCommittedSecurityAudit(committed), committed);

  assert.throws(
    () => requireCommittedSecurityAudit({ ok: false, failClosed: true }),
    error => error.code === 'SECURITY_AUDIT_REQUIRED' && error.status === 503 &&
      !error.message.includes('payload'),
  );
});
