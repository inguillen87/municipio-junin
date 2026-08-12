import assert from 'node:assert/strict';
import test from 'node:test';

import { createGrhDirectoryHandler } from '../api/grh-directory.js';

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

function request(query) {
  return {
    method: 'GET',
    query,
    headers: { 'x-municontrol-purpose': 'DIRECTORY_BROWSE' },
  };
}

const guards = {
  environment: {
    GRH_TENANT_ID: 'tenant-test',
    GRH_DIRECTORY_AUTHZ_MODE: 'disabled',
    GRH_DIRECTORY_ALLOWED_USER_IDS: 'official-1',
  },
  isPublicRequestImpl: () => false,
  isPublishedIdentityImpl: () => false,
  requireCapabilityImpl: async () => ({
    id: 'official-1', role: 'INTENDENTE', tenantId: 'tenant-test', email: 'official@junin.gov.ar',
  }),
  authorizationStore: Object.freeze({
    async loadAuthorizationFacts() { throw new Error('disabled mode must not query authorization facts'); },
  }),
  async appendAuditImpl() { throw new Error('disabled mode must not use enterprise audit'); },
};

test('v3 endpoint forwards governed employment filters and publishes the v3 receipt', async () => {
  const calls = [];
  const payload = { schemaVersion: 'grh-directory-v3', items: [] };
  const handler = createGrhDirectoryHandler({
    ...guards,
    inspectResponseImpl: value => ({ ok: value === payload }),
    readDirectoryImpl: async options => {
      calls.push(options);
      return payload;
    },
  });
  const response = responseRecorder();
  const query = {
    reportedStatus: 'current_by_reported_dates',
    contractRegime: '1',
    serviceSituation: '2',
  };
  await handler(request(query), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-municontrol-contract'], 'grh-directory-v3');
  assert.deepEqual(calls, [{
    tenantId: 'tenant-test',
    query,
    scopeOrganizationCodes: null,
  }]);
  assert.equal(response.payload, payload);
});

test('v3 endpoint keeps invalid employment filters behind a detail-free 400 boundary', async () => {
  const error = Object.assign(new Error('must not leak bad value'), {
    status: 400,
    code: 'GRH_DIRECTORY_QUERY_INVALID',
  });
  const handler = createGrhDirectoryHandler({
    ...guards,
    inspectResponseImpl: () => ({ ok: true }),
    readDirectoryImpl: async () => { throw error; },
  });
  const response = responseRecorder();
  await handler(request({ reportedStatus: 'active' }), response);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.payload, {
    error: 'Consulta de directorio invalida',
    code: 'GRH_DIRECTORY_QUERY_INVALID',
  });
  assert.doesNotMatch(JSON.stringify(response.payload), /active|bad value/);
});
