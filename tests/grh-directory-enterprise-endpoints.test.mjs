import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGrhDirectoryAccessHandler,
} from '../api/grh-directory-access.js';
import { createGrhDirectoryHandler } from '../api/grh-directory.js';
import { inspectGrhDirectoryAccessResponse } from '../api/lib/grh-directory-access-contract.js';
import { readGrhDirectory } from '../api/lib/grh-directory-store.js';

const NOW = '2026-08-11T15:00:00.000Z';
const AUDIT_SECRET = 'enterprise-directory-audit-secret-32-bytes-minimum';
const CALLER = Object.freeze({
  id: 'official-1',
  email: 'private.official@junin.gov.ar',
  role: 'INTENDENTE',
  tenantId: 'tenant-test',
});

function responseRecorder() {
  return {
    statusCode: 200,
    payload: undefined,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function environment(mode, overrides = {}) {
  return {
    GRH_TENANT_ID: 'tenant-test',
    GRH_DIRECTORY_ALLOWED_USER_IDS: 'official-1',
    GRH_DIRECTORY_AUTHZ_MODE: mode,
    GRH_DIRECTORY_AUDIT_HMAC_SECRET: AUDIT_SECRET,
    ...overrides,
  };
}

function directoryRequest(
  query = {},
  purpose = 'DIRECTORY_BROWSE',
  correlationId = '550e8400-e29b-41d4-a716-446655440000',
) {
  return {
    method: 'GET',
    query,
    headers: {
      'x-municontrol-purpose': purpose,
      'x-correlation-id': correlationId,
    },
  };
}

function accessRequest(headers = {}) {
  return { method: 'GET', query: {}, headers };
}

function authorizationFacts({ scopeType = 'ORG_SUBTREE', codes = ['5', '7'] } = {}) {
  const tenantWide = scopeType === 'TENANT';
  return {
    schemaVersion: 'enterprise-authorization-facts-v1',
    policyVersion: 'rbac:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    tenant: { id: 'tenant-test', status: 'ACTIVE' },
    user: { id: 'official-1', tenantId: 'tenant-test', status: 'ACTIVE' },
    assignments: [{
      assignmentId: 'assignment-secret-internal',
      tenantId: 'tenant-test',
      userId: 'official-1',
      status: 'ACTIVE',
      validFrom: '2026-08-01T00:00:00.000Z',
      validUntil: '2026-12-31T23:59:59.000Z',
      policy: {
        policyId: 'policy-directory-private',
        status: 'ACTIVE',
        permissions: ['grh.directory:read'],
      },
      role: { roleId: 'role-intendente-private', status: 'ACTIVE' },
      scope: {
        scopeId: 'scope-secret-internal',
        status: 'ACTIVE',
        type: scopeType,
        organizationCode: tenantWide ? null : codes[0],
        allowedOrganizationCodes: tenantWide ? [] : codes,
        label: tenantWide ? 'Municipalidad de Junín' : 'Secretaría privada sensible',
      },
    }],
  };
}

function authorizationStoreReturning(facts) {
  const calls = [];
  return {
    calls,
    async loadAuthorizationFacts(input) {
      calls.push(input);
      return typeof facts === 'function' ? facts(input) : facts;
    },
  };
}

function auditRecorder({ committed = true, throws = false } = {}) {
  const events = [];
  return {
    events,
    async append(input, dependencies) {
      events.push({ input, dependencies });
      if (throws) throw new Error('audit-private-database-error');
      return committed
        ? { ok: true, failClosed: false, code: 'AUDIT_EVENT_COMMITTED' }
        : { ok: false, failClosed: true, code: 'AUDIT_WRITE_FAILED' };
    },
  };
}

function privateDependencies({ mode = 'intersect', facts = authorizationFacts(), audit } = {}) {
  const authorizationStore = authorizationStoreReturning(facts);
  return {
    environment: environment(mode),
    requireCapabilityImpl: async () => CALLER,
    isPublicRequestImpl: () => false,
    isPublishedIdentityImpl: () => false,
    authorizationStore,
    appendAuditImpl: audit?.append || auditRecorder().append,
    auditQueryAdapter: { async connect() { throw new Error('append stub must not connect'); } },
    clock: () => new Date(NOW),
  };
}

test('published evaluation identities are hard-denied before authentication or any database adapter', async () => {
  const calls = { auth: 0, policy: 0, audit: 0, read: 0 };
  const dependencies = {
    environment: environment('intersect'),
    isPublicRequestImpl: () => true,
    requireCapabilityImpl: async () => { calls.auth += 1; return CALLER; },
    authorizationStore: {
      async loadAuthorizationFacts() { calls.policy += 1; return authorizationFacts(); },
    },
    appendAuditImpl: async () => { calls.audit += 1; },
    readDirectoryImpl: async () => { calls.read += 1; return { items: [] }; },
  };

  for (const handler of [
    createGrhDirectoryHandler(dependencies),
    createGrhDirectoryAccessHandler(dependencies),
  ]) {
    const response = responseRecorder();
    await handler({ method: 'GET', query: {}, headers: {} }, response);
    assert.equal(response.statusCode, 403);
    assert.equal(response.payload.code, 'GRH_DIRECTORY_PUBLIC_ACCESS_DENIED');
  }
  assert.deepEqual(calls, { auth: 0, policy: 0, audit: 0, read: 0 });
});

test('disabled preserves the static pilot with zero enterprise store, ledger, or new secret calls', async () => {
  const calls = { policy: 0, audit: 0, read: 0 };
  const dependencies = {
    environment: environment('disabled', { GRH_DIRECTORY_AUDIT_HMAC_SECRET: undefined }),
    requireCapabilityImpl: async () => CALLER,
    isPublicRequestImpl: () => false,
    isPublishedIdentityImpl: () => false,
    authorizationStore: {
      async loadAuthorizationFacts() { calls.policy += 1; throw new Error('must not run'); },
    },
    appendAuditImpl: async () => { calls.audit += 1; throw new Error('must not run'); },
    readDirectoryImpl: async options => {
      calls.read += 1;
      assert.equal(options.scopeOrganizationCodes, null);
      return { items: [{ displayName: 'Persona privada' }] };
    },
    inspectResponseImpl: () => ({ ok: true }),
    clock: () => new Date(NOW),
  };

  const directoryResponse = responseRecorder();
  await createGrhDirectoryHandler(dependencies)(directoryRequest(), directoryResponse);
  assert.equal(directoryResponse.statusCode, 200);

  const accessResponse = responseRecorder();
  await createGrhDirectoryAccessHandler(dependencies)(accessRequest(), accessResponse);
  assert.equal(accessResponse.statusCode, 200);
  assert.equal(inspectGrhDirectoryAccessResponse(accessResponse.payload).ok, true);
  assert.equal(accessResponse.payload.status, 'static');
  assert.equal(accessResponse.payload.audit.required, false);
  assert.match(accessResponse.payload.policyVersion, /^static:/);
  assert.deepEqual(calls, { policy: 0, audit: 0, read: 1 });
});

test('shadow preserves the static pilot on dynamic mismatch and records the mismatch on nominal reads', async () => {
  const audit = auditRecorder();
  const dependencies = privateDependencies({
    mode: 'shadow',
    facts: () => { throw new Error('dynamic policy database unavailable'); },
    audit,
  });
  dependencies.readDirectoryImpl = async options => {
    assert.equal(options.scopeOrganizationCodes, null);
    return { items: [] };
  };
  dependencies.inspectResponseImpl = () => ({ ok: true });

  const directoryResponse = responseRecorder();
  await createGrhDirectoryHandler(dependencies)(directoryRequest(), directoryResponse);
  assert.equal(directoryResponse.statusCode, 200);
  assert.equal(audit.events.length, 1);
  assert.equal(audit.events[0].input.authorizationMode, 'shadow');
  assert.equal(audit.events[0].input.authorizationReason, 'DYNAMIC_DATABASE_ERROR');
  assert.equal(audit.events[0].input.outcome, 'ALLOWED');

  const accessResponse = responseRecorder();
  await createGrhDirectoryAccessHandler(dependencies)(accessRequest(), accessResponse);
  assert.equal(accessResponse.statusCode, 200);
  assert.equal(accessResponse.payload.status, 'shadow');
  assert.equal(accessResponse.payload.audit.required, true);
  assert.match(accessResponse.payload.policyVersion, /^static:/);
  assert.equal(audit.events.length, 1, 'access status must not emit a nominal audit event');
});

test('intersect evaluates persisted facts, enforces organization codes server-side, and audits without query PII', async () => {
  const audit = auditRecorder();
  const dependencies = privateDependencies({ audit });
  dependencies.readDirectoryImpl = async options => {
    assert.equal(options.tenantId, 'tenant-test');
    assert.deepEqual(options.scopeOrganizationCodes, ['5', '7']);
    assert.deepEqual(options.query, { search: 'Mauricio Alonso', organization: '5' });
    return { items: [{ displayName: 'Mauricio Alonso' }] };
  };
  dependencies.inspectResponseImpl = () => ({ ok: true });

  const response = responseRecorder();
  await createGrhDirectoryHandler(dependencies)(directoryRequest({
    search: 'Mauricio Alonso',
    organization: '5',
  }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(dependencies.authorizationStore.calls.length, 1);
  assert.deepEqual(dependencies.authorizationStore.calls[0], {
    schemaVersion: 'enterprise-authorization-facts-v1',
    tenantId: 'tenant-test',
    userId: 'official-1',
    permission: 'grh.directory:read',
    at: NOW,
  });
  assert.equal(audit.events.length, 1);
  const event = audit.events[0].input;
  assert.equal(event.outcome, 'ALLOWED');
  assert.equal(event.purpose, 'DIRECTORY_BROWSE');
  assert.equal(event.operation, 'list');
  assert.equal(event.resultCount, 1);
  assert.deepEqual(event.assignmentIds, ['assignment-secret-internal']);
  assert.deepEqual(event.scopeIds, ['scope-secret-internal']);
  const serialized = JSON.stringify(event);
  assert.doesNotMatch(serialized, /Mauricio|Alonso|search|legajo|Secretaría privada sensible|"5"|"7"/u);
});

test('a detail purpose is exact and its legajo never enters the audit ledger', async () => {
  const audit = auditRecorder();
  const dependencies = privateDependencies({ audit });
  dependencies.readDirectoryImpl = async options => {
    assert.deepEqual(options.scopeOrganizationCodes, ['5', '7']);
    return { items: [{ legajo: 987654, displayName: 'Nombre privado' }] };
  };
  dependencies.inspectResponseImpl = () => ({ ok: true });
  const response = responseRecorder();
  await createGrhDirectoryHandler(dependencies)(directoryRequest(
    { legajo: '987654', company: '1' },
    'PERSON_LOOKUP',
    '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
  ), response);

  assert.equal(response.statusCode, 200);
  assert.equal(audit.events[0].input.operation, 'detail');
  assert.equal(audit.events[0].input.purpose, 'PERSON_LOOKUP');
  assert.doesNotMatch(JSON.stringify(audit.events[0].input), /987654|Nombre privado|legajo/u);
});

test('out-of-scope filters are denied before the directory query and expose no count', async () => {
  const audit = auditRecorder();
  const dependencies = privateDependencies({
    facts: authorizationFacts({ scopeType: 'ORG_UNIT', codes: ['5'] }),
    audit,
  });
  let databaseReads = 0;
  dependencies.readDirectoryImpl = options => readGrhDirectory({
    ...options,
    environment: {},
    queryImpl: async () => { databaseReads += 1; throw new Error('must not query'); },
  });
  const response = responseRecorder();
  await createGrhDirectoryHandler(dependencies)(directoryRequest({ organization: '99' }), response);

  assert.equal(response.statusCode, 403);
  assert.equal(response.payload.code, 'GRH_DIRECTORY_SCOPE_DENIED');
  assert.equal('count' in response.payload, false);
  assert.equal('total' in response.payload, false);
  assert.equal(databaseReads, 0);
  assert.equal(audit.events.length, 1);
  assert.equal(audit.events[0].input.outcome, 'DENIED');
  assert.equal(audit.events[0].input.authorizationReason, 'DIRECTORY_SCOPE_DENIED');
  assert.equal(audit.events[0].input.resultCount, 0);
});

test('policy and audit unavailability fail closed with 503 and no personal response', async t => {
  await t.test('policy database unavailable', async () => {
    const audit = auditRecorder();
    const dependencies = privateDependencies({
      facts: () => { throw new Error('policy-db-private-detail'); },
      audit,
    });
    let reads = 0;
    dependencies.readDirectoryImpl = async () => { reads += 1; return { items: [] }; };
    const response = responseRecorder();
    await createGrhDirectoryHandler(dependencies)(directoryRequest({ search: 'Nombre privado' }), response);
    assert.equal(response.statusCode, 503);
    assert.equal(reads, 0);
    assert.equal(audit.events.length, 1);
    assert.equal(audit.events[0].input.authorizationReason, 'AUTHORIZATION_POLICY_ERROR');
    assert.doesNotMatch(JSON.stringify(audit.events[0].input), /Nombre privado|policy-db-private-detail/u);
  });

  await t.test('audit commit unavailable after read', async () => {
    const audit = auditRecorder({ committed: false });
    const dependencies = privateDependencies({ audit });
    dependencies.readDirectoryImpl = async () => ({
      items: [{ displayName: 'No debe responderse' }],
    });
    dependencies.inspectResponseImpl = () => ({ ok: true });
    const response = responseRecorder();
    await createGrhDirectoryHandler(dependencies)(directoryRequest(), response);
    assert.equal(response.statusCode, 503);
    assert.equal(response.payload.code, 'GRH_DIRECTORY_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(response.payload), /No debe responderse/u);
  });
});

test('access status shares persisted authorization but emits no read purpose or audit event', async () => {
  const audit = auditRecorder();
  const dependencies = privateDependencies({ audit });
  const response = responseRecorder();
  await createGrhDirectoryAccessHandler(dependencies)(accessRequest({
    'x-correlation-id': 'req-access-status-01',
  }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(inspectGrhDirectoryAccessResponse(response.payload).ok, true);
  assert.equal(response.payload.status, 'active');
  assert.equal(response.payload.audit.required, true);
  assert.deepEqual(response.payload.scope, {
    kind: 'ORG_SUBTREE',
    label: 'Ambitos organizativos autorizados',
    organizationCount: 2,
  });
  const serialized = JSON.stringify(response.payload);
  assert.doesNotMatch(serialized, /assignment-secret-internal|scope-secret-internal|Secretaría privada sensible|"5"|"7"/u);
  assert.equal(dependencies.authorizationStore.calls.length, 1);
  assert.equal(audit.events.length, 0);
});

test('invalid purpose and tenant boundaries stop before policy or directory reads', async t => {
  await t.test('detail request with browse purpose', async () => {
    const audit = auditRecorder();
    const dependencies = privateDependencies({ audit });
    let reads = 0;
    dependencies.readDirectoryImpl = async () => { reads += 1; return { items: [] }; };
    const response = responseRecorder();
    await createGrhDirectoryHandler(dependencies)(directoryRequest(
      { legajo: '123' },
      'DIRECTORY_BROWSE',
    ), response);
    assert.equal(response.statusCode, 400);
    assert.equal(dependencies.authorizationStore.calls.length, 0);
    assert.equal(audit.events.length, 0);
    assert.equal(reads, 0);
  });

  await t.test('cross-tenant caller', async () => {
    const audit = auditRecorder();
    const dependencies = privateDependencies({ audit });
    dependencies.requireCapabilityImpl = async () => ({ ...CALLER, tenantId: 'tenant-foreign' });
    let reads = 0;
    dependencies.readDirectoryImpl = async () => { reads += 1; return { items: [] }; };
    const response = responseRecorder();
    await createGrhDirectoryHandler(dependencies)(directoryRequest(), response);
    assert.equal(response.statusCode, 403);
    assert.equal(response.payload.code, 'GRH_DIRECTORY_TENANT_DENIED');
    assert.equal(dependencies.authorizationStore.calls.length, 0);
    assert.equal(reads, 0);
    assert.equal(audit.events.length, 1);
    assert.equal(audit.events[0].input.authorizationReason, 'TENANT_BOUNDARY_DENIED');
  });
});

test('directory read errors are audited generically and never log or return the error payload', async () => {
  const audit = auditRecorder();
  const dependencies = privateDependencies({ audit });
  dependencies.readDirectoryImpl = async () => {
    throw new Error('database failure for Mauricio legajo 123');
  };
  const response = responseRecorder();
  await createGrhDirectoryHandler(dependencies)(directoryRequest({ search: 'Mauricio' }), response);

  assert.equal(response.statusCode, 503);
  assert.equal(audit.events.length, 1);
  assert.equal(audit.events[0].input.authorizationReason, 'DIRECTORY_READ_ERROR');
  assert.doesNotMatch(JSON.stringify(audit.events[0].input), /Mauricio|legajo|123|database failure/u);
  assert.doesNotMatch(JSON.stringify(response.payload), /Mauricio|legajo|123|database failure/u);
});
