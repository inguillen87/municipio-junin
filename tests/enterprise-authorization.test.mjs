import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ENTERPRISE_AUTHORIZATION_DECISION_CODES,
  ENTERPRISE_AUTHORIZATION_FACTS_SCHEMA_VERSION,
  GRH_DIRECTORY_PERMISSION,
  evaluateEnterpriseAuthorization,
  normalizeOrganizationCode,
} from '../api/lib/enterprise-authorization.js';

const NOW = '2026-08-11T15:00:00.000Z';

function makeFacts(mutate = () => {}) {
  const facts = {
    schemaVersion: ENTERPRISE_AUTHORIZATION_FACTS_SCHEMA_VERSION,
    policyVersion: 'municipio-junin:2026-08',
    tenant: { id: 'tenant-junin', status: 'ACTIVE' },
    user: { id: 'user-9', tenantId: 'tenant-junin', status: 'ACTIVE' },
    assignments: [{
      assignmentId: 'assignment-1',
      tenantId: 'tenant-junin',
      userId: 'user-9',
      status: 'ACTIVE',
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2026-12-31T23:59:59.000Z',
      policy: {
        policyId: 'policy-directory',
        status: 'ACTIVE',
        permissions: [GRH_DIRECTORY_PERMISSION],
      },
      role: { roleId: 'role-intendente', status: 'ACTIVE' },
      scope: {
        scopeId: 'scope-government',
        status: 'ACTIVE',
        type: 'ORG_SUBTREE',
        organizationCode: 'gobierno',
        allowedOrganizationCodes: [' servicios-publicos ', 'Gobierno'],
        label: 'Secretaría de Gobierno',
      },
    }],
  };
  mutate(facts);
  return facts;
}

function adapterReturning(facts) {
  const calls = [];
  return {
    calls,
    async loadAuthorizationFacts(context) {
      calls.push(context);
      return typeof facts === 'function' ? facts(context) : facts;
    },
  };
}

function baseInput(overrides = {}) {
  return {
    mode: 'intersect',
    staticAllowed: true,
    tenantId: 'tenant-junin',
    userId: 'user-9',
    permission: GRH_DIRECTORY_PERMISSION,
    at: NOW,
    ...overrides,
  };
}

test('disabled preserves the static decision and never queries dynamic facts', async () => {
  const adapter = adapterReturning(makeFacts());
  const decision = await evaluateEnterpriseAuthorization(baseInput({
    mode: 'disabled',
    queryAdapter: adapter,
  }));

  assert.equal(decision.allowed, true);
  assert.equal(decision.status, 'allowed');
  assert.equal(decision.reason, ENTERPRISE_AUTHORIZATION_DECISION_CODES.STATIC_ALLOWED);
  assert.equal(decision.scope.kind, 'TENANT');
  assert.equal(decision.dynamic.evaluated, false);
  assert.equal(decision.policyVersion, null);
  assert.deepEqual(adapter.calls, []);
  assert.ok(Object.isFrozen(decision));
  assert.ok(Object.isFrozen(decision.scope));
});

test('intersect returns normalized organization receipts and non-PII evidence', async () => {
  const adapter = adapterReturning(makeFacts());
  const decision = await evaluateEnterpriseAuthorization(baseInput({ queryAdapter: adapter }));

  assert.equal(decision.allowed, true);
  assert.equal(decision.status, 'allowed');
  assert.equal(decision.reason, ENTERPRISE_AUTHORIZATION_DECISION_CODES.INTERSECTION_ALLOWED);
  assert.equal(decision.policyVersion, 'municipio-junin:2026-08');
  assert.deepEqual(decision.assignment, { count: 1, ids: ['assignment-1'] });
  assert.deepEqual(decision.allowedOrganizationCodes, ['GOBIERNO', 'SERVICIOS-PUBLICOS']);
  assert.deepEqual(decision.scope, {
    tenantWide: false,
    kind: 'ORG_SUBTREE',
    label: 'Secretaría de Gobierno',
    ids: ['scope-government'],
    kinds: ['ORG_SUBTREE'],
    organizationCount: 2,
    allowedOrganizationCodes: ['GOBIERNO', 'SERVICIOS-PUBLICOS'],
  });
  assert.deepEqual(decision.validity, {
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2026-12-31T23:59:59.000Z',
  });
  assert.deepEqual(decision.dynamic.receipts, [{
    assignmentId: 'assignment-1',
    policyVersion: 'municipio-junin:2026-08',
    scopeId: 'scope-government',
    scopeKind: 'ORG_SUBTREE',
    scopeLabel: 'Secretaría de Gobierno',
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2026-12-31T23:59:59.000Z',
    tenantWide: false,
    allowedOrganizationCodes: ['GOBIERNO', 'SERVICIOS-PUBLICOS'],
  }]);
  assert.equal(JSON.stringify(decision).includes('user-9'), false);
  assert.equal(JSON.stringify(decision).includes('tenant-junin'), false);
  assert.equal(adapter.calls.length, 1);
  assert.deepEqual(adapter.calls[0], {
    schemaVersion: ENTERPRISE_AUTHORIZATION_FACTS_SCHEMA_VERSION,
    tenantId: 'tenant-junin',
    userId: 'user-9',
    permission: GRH_DIRECTORY_PERMISSION,
    at: NOW,
  });
  assert.ok(Object.isFrozen(adapter.calls[0]));
});

test('intersect unions eligible scopes deterministically and exposes an effective validity envelope', async () => {
  const facts = makeFacts(value => {
    const second = structuredClone(value.assignments[0]);
    second.assignmentId = 'assignment-2';
    second.validFrom = null;
    second.validUntil = null;
    second.scope = {
      scopeId: 'scope-works',
      status: 'ACTIVE',
      type: 'ORG_UNIT',
      organizationCode: 'obras',
      allowedOrganizationCodes: ['OBRAS'],
      label: 'Obras Públicas',
    };
    value.assignments.push(second);
  });
  const decision = await evaluateEnterpriseAuthorization(baseInput({
    queryAdapter: adapterReturning(facts),
  }));

  assert.equal(decision.allowed, true);
  assert.equal(decision.scope.kind, 'MIXED');
  assert.equal(decision.scope.label, '2 ámbitos autorizados');
  assert.deepEqual(decision.scope.ids, ['scope-government', 'scope-works']);
  assert.deepEqual(decision.scope.kinds, ['ORG_SUBTREE', 'ORG_UNIT']);
  assert.deepEqual(decision.allowedOrganizationCodes, [
    'GOBIERNO',
    'OBRAS',
    'SERVICIOS-PUBLICOS',
  ]);
  assert.deepEqual(decision.validity, { validFrom: null, validUntil: null });
  assert.deepEqual(decision.assignment.ids, ['assignment-1', 'assignment-2']);
});

test('a tenant grant wins over narrower eligible scopes', async () => {
  const facts = makeFacts(value => {
    const tenantGrant = structuredClone(value.assignments[0]);
    tenantGrant.assignmentId = 'assignment-tenant';
    tenantGrant.scope = {
      scopeId: 'scope-tenant',
      status: 'ACTIVE',
      type: 'TENANT',
      organizationCode: null,
      allowedOrganizationCodes: [],
      label: 'Municipalidad de Junín',
    };
    value.assignments.push(tenantGrant);
  });
  const decision = await evaluateEnterpriseAuthorization(baseInput({
    queryAdapter: adapterReturning(facts),
  }));

  assert.equal(decision.allowed, true);
  assert.equal(decision.scope.tenantWide, true);
  assert.equal(decision.scope.kind, 'TENANT');
  assert.equal(decision.scope.label, 'Municipalidad de Junín');
  assert.deepEqual(decision.scope.ids, ['scope-tenant']);
  assert.deepEqual(decision.allowedOrganizationCodes, []);
});

test('intersect fails closed for missing facts, adapter errors, and schema drift', async t => {
  const cases = [
    {
      name: 'missing',
      adapter: adapterReturning(null),
      reason: ENTERPRISE_AUTHORIZATION_DECISION_CODES.DYNAMIC_FACTS_MISSING,
    },
    {
      name: 'database error',
      adapter: adapterReturning(() => { throw new Error('contains-private-db-detail'); }),
      reason: ENTERPRISE_AUTHORIZATION_DECISION_CODES.DYNAMIC_DATABASE_ERROR,
    },
    {
      name: 'extra fact field',
      adapter: adapterReturning(makeFacts(value => { value.unexpected = true; })),
      reason: ENTERPRISE_AUTHORIZATION_DECISION_CODES.DYNAMIC_FACTS_DRIFT,
    },
    {
      name: 'cross-tenant user',
      adapter: adapterReturning(makeFacts(value => { value.user.tenantId = 'tenant-other'; })),
      reason: ENTERPRISE_AUTHORIZATION_DECISION_CODES.DYNAMIC_FACTS_DRIFT,
    },
    {
      name: 'unknown status',
      adapter: adapterReturning(makeFacts(value => { value.assignments[0].scope.status = 'MYSTERY'; })),
      reason: ENTERPRISE_AUTHORIZATION_DECISION_CODES.DYNAMIC_FACTS_DRIFT,
    },
    {
      name: 'duplicate assignment identity',
      adapter: adapterReturning(makeFacts(value => { value.assignments.push(structuredClone(value.assignments[0])); })),
      reason: ENTERPRISE_AUTHORIZATION_DECISION_CODES.DYNAMIC_FACTS_DRIFT,
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const decision = await evaluateEnterpriseAuthorization(baseInput({ queryAdapter: item.adapter }));
      assert.equal(decision.allowed, false);
      assert.equal(decision.status, 'denied');
      assert.equal(decision.reason, item.reason);
      assert.deepEqual(decision.allowedOrganizationCodes, []);
      assert.deepEqual(decision.assignment, { count: 0, ids: [] });
      assert.equal(JSON.stringify(decision).includes('contains-private-db-detail'), false);
    });
  }
});

test('assignment, policy, role, scope, permission and validity must all be active', async t => {
  const cases = [
    ['assignment inactive', value => { value.assignments[0].status = 'REVOKED'; }, 'DYNAMIC_ASSIGNMENT_INACTIVE'],
    ['not yet valid', value => { value.assignments[0].validFrom = '2026-09-01T00:00:00.000Z'; }, 'DYNAMIC_ASSIGNMENT_NOT_YET_VALID'],
    ['expired at exclusive boundary', value => { value.assignments[0].validUntil = NOW; }, 'DYNAMIC_ASSIGNMENT_EXPIRED'],
    ['policy inactive', value => { value.assignments[0].policy.status = 'DISABLED'; }, 'DYNAMIC_POLICY_INACTIVE'],
    ['role inactive', value => { value.assignments[0].role.status = 'SUSPENDED'; }, 'DYNAMIC_ROLE_INACTIVE'],
    ['scope inactive', value => { value.assignments[0].scope.status = 'INACTIVE'; }, 'DYNAMIC_SCOPE_INACTIVE'],
    ['permission absent', value => { value.assignments[0].policy.permissions = ['grh.leave:read']; }, 'DYNAMIC_PERMISSION_MISSING'],
  ];

  for (const [name, mutate, reason] of cases) {
    await t.test(name, async () => {
      const decision = await evaluateEnterpriseAuthorization(baseInput({
        queryAdapter: adapterReturning(makeFacts(mutate)),
      }));
      assert.equal(decision.allowed, false);
      assert.equal(decision.reason, reason);
      assert.deepEqual(decision.dynamic.receipts, []);
    });
  }
});

test('shadow preserves static authorization but reports scoped and unavailable dynamic evidence', async () => {
  const scoped = await evaluateEnterpriseAuthorization(baseInput({
    mode: 'shadow',
    queryAdapter: adapterReturning(makeFacts()),
  }));
  assert.equal(scoped.allowed, true);
  assert.equal(scoped.mismatch, true);
  assert.equal(scoped.scope.kind, 'TENANT');
  assert.equal(scoped.dynamic.scope.kind, 'ORG_SUBTREE');

  const unavailable = await evaluateEnterpriseAuthorization(baseInput({
    mode: 'shadow',
    queryAdapter: adapterReturning(() => { throw new Error('secret'); }),
  }));
  assert.equal(unavailable.allowed, true);
  assert.equal(unavailable.mismatch, true);
  assert.equal(unavailable.reason, 'DYNAMIC_DATABASE_ERROR');
  assert.equal(JSON.stringify(unavailable).includes('secret'), false);
});

test('shadow does not promote dynamic receipts when the effective static decision denies', async () => {
  const decision = await evaluateEnterpriseAuthorization(baseInput({
    mode: 'shadow',
    staticAllowed: false,
    queryAdapter: adapterReturning(makeFacts()),
  }));

  assert.equal(decision.allowed, false);
  assert.equal(decision.mismatch, true);
  assert.equal(decision.policyVersion, null);
  assert.deepEqual(decision.assignment, { count: 0, ids: [] });
  assert.deepEqual(decision.dynamic.receipts.map(item => item.assignmentId), ['assignment-1']);
});

test('only the exact directory permission is accepted and invalid input never queries the adapter', async () => {
  const adapter = adapterReturning(makeFacts());
  const decision = await evaluateEnterpriseAuthorization(baseInput({
    permission: 'grh.directory:write',
    queryAdapter: adapter,
  }));

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'PERMISSION_INVALID');
  assert.deepEqual(adapter.calls, []);
  assert.equal(normalizeOrganizationCode('  secretaria_1 '), 'SECRETARIA_1');
  assert.equal(normalizeOrganizationCode('secretaría_1'), null);
  assert.equal(normalizeOrganizationCode('../escape'), null);
});

test('non-plain authorization fact objects are rejected as drift', async () => {
  const facts = makeFacts();
  const inherited = Object.create({ hidden: 'value' });
  Object.assign(inherited, facts.tenant);
  facts.tenant = inherited;
  const decision = await evaluateEnterpriseAuthorization(baseInput({
    queryAdapter: adapterReturning(facts),
  }));

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'DYNAMIC_FACTS_DRIFT');
});
