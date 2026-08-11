import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  ENTERPRISE_AUTHORIZATION_FACTS_SCHEMA_VERSION,
  GRH_DIRECTORY_PERMISSION,
  evaluateEnterpriseAuthorization,
} from '../api/lib/enterprise-authorization.js';
import {
  EnterpriseAuthorizationStoreError,
  createEnterpriseAuthorizationStore,
} from '../api/lib/enterprise-authorization-store.js';

const NOW = '2026-08-11T15:00:00.000Z';
const TENANT_ID = 'tenant-junin';
const USER_ID = 'user-9';

function baseIdentity(overrides = {}) {
  return {
    tenantId: TENANT_ID,
    tenantStatus: 'ACTIVE',
    userId: USER_ID,
    userTenantId: TENANT_ID,
    userActive: true,
    securityUserId: USER_ID,
    securityTenantId: TENANT_ID,
    lifecycleStatus: 'ACTIVE',
    lockedUntil: null,
    accountExpiresAt: null,
    suspendedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function baseAssignment(overrides = {}) {
  return {
    assignmentId: 'assignment-1',
    tenantId: TENANT_ID,
    userId: USER_ID,
    assignmentStatus: 'ACTIVE',
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
    policyId: 'policy-directory',
    policyVersion: '2026-08',
    policyStatus: 'ACTIVE',
    policyActivatedAt: '2026-01-01T00:00:00.000Z',
    policyRetiredAt: null,
    roleId: 'role-intendente',
    roleStatus: 'ACTIVE',
    roleValidFrom: '2026-01-01T00:00:00.000Z',
    roleValidUntil: null,
    scopeId: 'scope-tenant',
    scopeStatus: 'ACTIVE',
    scopeType: 'TENANT',
    organizationCode: null,
    scopeLabel: null,
    orgUnitStatus: null,
    orgUnitValidFrom: null,
    orgUnitValidUntil: null,
    permissions: [GRH_DIRECTORY_PERMISSION],
    allowedOrganizationCodes: [],
    ...overrides,
  };
}

function queryName(strings) {
  const sql = strings.join('?');
  if (sql.includes('enterprise-authz:identity-v1')) return 'identity';
  if (sql.includes('enterprise-authz:assignments-v1')) return 'assignments';
  if (sql.includes('enterprise-authz:policy-set-v1')) return 'policies';
  throw new Error('unexpected-query');
}

function makeClient({
  identity = [baseIdentity()],
  assignments = [baseAssignment()],
  policies = [{ policyId: 'policy-directory', policyVersion: '2026-08' }],
  failQuery = null,
} = {}) {
  const calls = [];
  const client = {
    calls,
    async $queryRaw(strings, ...values) {
      const name = queryName(strings);
      const text = strings.join('?');
      calls.push({ kind: 'query', name, text, values });
      if (failQuery === name) throw new Error('private-db-detail-must-not-escape');
      if (name === 'identity') return structuredClone(identity);
      if (name === 'assignments') return structuredClone(assignments);
      return structuredClone(policies);
    },
    async $transaction(callback, options) {
      calls.push({ kind: 'transaction', options });
      return callback(client);
    },
  };
  return client;
}

function makeStore(fixtures = {}, transport = () => ({ tlsVerified: true })) {
  const client = makeClient(fixtures);
  return {
    client,
    store: createEnterpriseAuthorizationStore({ client, assertTransport: transport }),
  };
}

function context(overrides = {}) {
  return {
    schemaVersion: ENTERPRISE_AUTHORIZATION_FACTS_SCHEMA_VERSION,
    tenantId: TENANT_ID,
    userId: USER_ID,
    permission: GRH_DIRECTORY_PERMISSION,
    at: NOW,
    ...overrides,
  };
}

function evaluatorInput(store, overrides = {}) {
  return {
    mode: 'intersect',
    staticAllowed: true,
    tenantId: TENANT_ID,
    userId: USER_ID,
    permission: GRH_DIRECTORY_PERMISSION,
    at: NOW,
    queryAdapter: store,
    ...overrides,
  };
}

function expectedPolicyVersion() {
  const canonical = '16:policy-directory7:2026-08';
  return `rbac:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

test('loads exact tenant-scoped facts in a repeatable-read transaction with parameterized SQL', async () => {
  const { client, store } = makeStore();
  const facts = await store.loadAuthorizationFacts(context());

  assert.deepEqual(facts, {
    schemaVersion: ENTERPRISE_AUTHORIZATION_FACTS_SCHEMA_VERSION,
    policyVersion: expectedPolicyVersion(),
    tenant: { id: TENANT_ID, status: 'ACTIVE' },
    user: { id: USER_ID, tenantId: TENANT_ID, status: 'ACTIVE' },
    assignments: [{
      assignmentId: 'assignment-1',
      tenantId: TENANT_ID,
      userId: USER_ID,
      status: 'ACTIVE',
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2027-01-01T00:00:00.000Z',
      policy: {
        policyId: 'policy-directory',
        status: 'ACTIVE',
        permissions: [GRH_DIRECTORY_PERMISSION],
      },
      role: { roleId: 'role-intendente', status: 'ACTIVE' },
      scope: {
        scopeId: 'scope-tenant',
        status: 'ACTIVE',
        type: 'TENANT',
        organizationCode: null,
        allowedOrganizationCodes: [],
        label: 'Todo el municipio',
      },
    }],
  });

  assert.deepEqual(client.calls[0], {
    kind: 'transaction',
    options: { isolationLevel: 'RepeatableRead', maxWait: 2_000, timeout: 5_000 },
  });
  const queries = client.calls.filter(call => call.kind === 'query');
  assert.deepEqual(queries.map(call => call.name), ['identity', 'assignments', 'policies']);
  for (const query of queries) {
    assert.equal(query.text.includes(TENANT_ID), false);
    assert.equal(query.text.includes(USER_ID), false);
    assert.equal(query.text.includes(GRH_DIRECTORY_PERMISSION), false);
    assert.equal(/password|email|legajo|dni|cuil|query_text/iu.test(query.text), false);
  }
  assert.deepEqual(queries[0].values, [USER_ID, TENANT_ID, TENANT_ID]);
  assert.ok(queries[1].values.includes(TENANT_ID));
  assert.ok(queries[1].values.includes(USER_ID));
  assert.ok(queries[2].values.includes(GRH_DIRECTORY_PERMISSION));
});

test('foreign-tenant identity is rejected without reading assignments', async () => {
  const { client, store } = makeStore({
    identity: [baseIdentity({ userTenantId: 'tenant-other' })],
  });

  assert.equal(await store.loadAuthorizationFacts(context()), null);
  assert.deepEqual(
    client.calls.filter(call => call.kind === 'query').map(call => call.name),
    ['identity'],
  );
});

test('an identified user with no assignment returns canonical empty facts', async () => {
  const { store } = makeStore({ assignments: [] });
  const facts = await store.loadAuthorizationFacts(context());
  assert.deepEqual(facts.assignments, []);
  assert.equal(facts.policyVersion, expectedPolicyVersion());

  const decision = await evaluateEnterpriseAuthorization(evaluatorInput(store));
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'DYNAMIC_ASSIGNMENT_MISSING');
});

test('missing and inactive security state produce inactive identity facts without privileged reads', async t => {
  const cases = [
    {
      name: 'missing security state',
      identity: baseIdentity({
        securityUserId: null,
        securityTenantId: null,
        lifecycleStatus: null,
      }),
      expectedStatus: 'INACTIVE',
    },
    {
      name: 'suspended security state',
      identity: baseIdentity({
        lifecycleStatus: 'SUSPENDED',
        suspendedAt: '2026-08-10T10:00:00.000Z',
      }),
      expectedStatus: 'SUSPENDED',
    },
    {
      name: 'security state for a different user',
      identity: baseIdentity({ securityUserId: 'user-other' }),
      expectedStatus: 'INACTIVE',
    },
    {
      name: 'expired security state',
      identity: baseIdentity({ accountExpiresAt: NOW }),
      expectedStatus: 'SUSPENDED',
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const { client, store } = makeStore({ identity: [item.identity] });
      const facts = await store.loadAuthorizationFacts(context());
      assert.equal(facts.user.status, item.expectedStatus);
      assert.deepEqual(facts.assignments, []);
      assert.match(facts.policyVersion, /^rbac:[0-9a-f]{64}$/u);
      assert.deepEqual(
        client.calls.filter(call => call.kind === 'query').map(call => call.name),
        ['identity'],
      );

      const decision = await evaluateEnterpriseAuthorization(evaluatorInput(store));
      assert.equal(decision.allowed, false);
      assert.equal(decision.reason, 'DYNAMIC_IDENTITY_INACTIVE');
    });
  }
});

test('inactive policy, role, and scope remain exact facts and deny with the expected reason', async t => {
  const cases = [
    ['policy', { policyStatus: 'RETIRED', policyRetiredAt: NOW }, 'DYNAMIC_POLICY_INACTIVE'],
    ['role', { roleStatus: 'RETIRED' }, 'DYNAMIC_ROLE_INACTIVE'],
    ['scope', { scopeStatus: 'RETIRED' }, 'DYNAMIC_SCOPE_INACTIVE'],
  ];

  for (const [name, overrides, reason] of cases) {
    await t.test(name, async () => {
      const { store } = makeStore({ assignments: [baseAssignment(overrides)] });
      const facts = await store.loadAuthorizationFacts(context());
      const assignment = facts.assignments[0];
      assert.equal(
        name === 'policy' ? assignment.policy.status :
          name === 'role' ? assignment.role.status : assignment.scope.status,
        'INACTIVE',
      );

      const decision = await evaluateEnterpriseAuthorization(evaluatorInput(store));
      assert.equal(decision.allowed, false);
      assert.equal(decision.reason, reason);
    });
  }
});

test('ALLOW is surfaced and explicit DENY is represented by an empty effective permission set', async () => {
  const allowedStore = makeStore().store;
  const allowed = await evaluateEnterpriseAuthorization(evaluatorInput(allowedStore));
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.reason, 'INTERSECTION_ALLOWED');

  const deniedStore = makeStore({
    assignments: [baseAssignment({ permissions: [] })],
  }).store;
  const deniedFacts = await deniedStore.loadAuthorizationFacts(context());
  assert.deepEqual(deniedFacts.assignments[0].policy.permissions, []);
  const denied = await evaluateEnterpriseAuthorization(evaluatorInput(deniedStore));
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, 'DYNAMIC_PERMISSION_MISSING');
});

test('ORG_UNIT exposes only the normalized external organization code', async () => {
  const { store } = makeStore({
    assignments: [baseAssignment({
      scopeId: 'scope-works',
      scopeType: 'ORG_UNIT',
      organizationCode: ' obras-publicas ',
      scopeLabel: 'Obras Publicas',
      orgUnitStatus: 'ACTIVE',
      orgUnitValidFrom: '2026-01-01T00:00:00.000Z',
      allowedOrganizationCodes: ['obras-publicas'],
    })],
  });
  const facts = await store.loadAuthorizationFacts(context());

  assert.deepEqual(facts.assignments[0].scope, {
    scopeId: 'scope-works',
    status: 'ACTIVE',
    type: 'ORG_UNIT',
    organizationCode: 'OBRAS-PUBLICAS',
    allowedOrganizationCodes: ['OBRAS-PUBLICAS'],
    label: 'Obras Publicas',
  });
});

test('ORG_SUBTREE returns only active same-tenant closure codes selected by the static SQL', async () => {
  const { client, store } = makeStore({
    assignments: [baseAssignment({
      scopeId: 'scope-government',
      scopeType: 'ORG_SUBTREE',
      organizationCode: 'gobierno',
      scopeLabel: 'Secretaria de Gobierno',
      orgUnitStatus: 'ACTIVE',
      orgUnitValidFrom: '2026-01-01T00:00:00.000Z',
      allowedOrganizationCodes: ['servicios-publicos', 'gobierno'],
    })],
  });
  const facts = await store.loadAuthorizationFacts(context());

  assert.deepEqual(facts.assignments[0].scope.allowedOrganizationCodes, [
    'GOBIERNO',
    'SERVICIOS-PUBLICOS',
  ]);
  const sql = client.calls.find(call => call.name === 'assignments').text;
  assert.match(sql, /closure\."tenant_id" = assignment\."tenant_id"/u);
  assert.match(sql, /descendant\."tenant_id" = assignment\."tenant_id"/u);
  assert.match(sql, /descendant\."status" = 'ACTIVE'/u);
  assert.match(sql, /descendant\."valid_from" <=/u);
  assert.match(sql, /descendant\."valid_until" IS NULL/u);
});

test('cross-tenant assignment evidence fails closed instead of being partially returned', async () => {
  const { store } = makeStore({
    assignments: [baseAssignment({ tenantId: 'tenant-other' })],
  });

  await assert.rejects(
    () => store.loadAuthorizationFacts(context()),
    error => error instanceof EnterpriseAuthorizationStoreError &&
      error.code === 'ENTERPRISE_AUTHORIZATION_TENANT_BOUNDARY_INVALID',
  );
});

test('database and transport failures are generic, fail closed, and never expose provider details', async () => {
  const database = makeStore({ failQuery: 'assignments' });
  await assert.rejects(
    () => database.store.loadAuthorizationFacts(context()),
    error => error instanceof EnterpriseAuthorizationStoreError &&
      error.code === 'ENTERPRISE_AUTHORIZATION_DATABASE_UNAVAILABLE' &&
      !error.message.includes('private-db-detail'),
  );
  const decision = await evaluateEnterpriseAuthorization(evaluatorInput(database.store));
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'DYNAMIC_DATABASE_ERROR');

  const transport = makeStore({}, () => null);
  await assert.rejects(
    () => transport.store.loadAuthorizationFacts(context()),
    error => error.code === 'ENTERPRISE_AUTHORIZATION_TRANSPORT_INVALID',
  );
  assert.deepEqual(transport.client.calls, []);
});

test('invalid direct adapter input never reaches the transport or database', async () => {
  let transportCalls = 0;
  const { client, store } = makeStore({}, () => {
    transportCalls += 1;
    return { tlsVerified: true };
  });

  await assert.rejects(
    () => store.loadAuthorizationFacts(context({ tenantId: '../tenant' })),
    error => error.code === 'ENTERPRISE_AUTHORIZATION_INPUT_INVALID',
  );
  assert.equal(transportCalls, 0);
  assert.deepEqual(client.calls, []);
});
