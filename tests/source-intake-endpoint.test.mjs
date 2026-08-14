import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  SOURCE_INTAKE_MODES,
  buildSourceIntakeReceipt,
} from '../api/lib/source-intake-contract.js';
import {
  createSourceIntakeHandler,
  parseSourceIntakeMultipart,
} from '../api/source-intake.js';
import publishedDemoPolicy from '../shared/published-demo-policy.cjs';
import { sourceIntakeProfileFixture } from './source-intake-fixture.mjs';

const CREATED_AT = '2026-08-14T12:00:00.000Z';
function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    payload: undefined,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { this.ended = true; return this; },
  };
}

function request(method, overrides = {}) {
  return {
    method,
    url: '/api/source-intake',
    query: {},
    headers: {},
    ...overrides,
  };
}

function privateAdmin() {
  return {
    id: 'user-admin',
    email: 'hacienda@junin.gob.ar',
    role: 'TENANT_ADMIN',
    tenantId: 'tenant-junin',
  };
}

function publishedAdmin() {
  return {
    id: 'published-evaluation:administrador',
    email: 'admin@junin.gov.ar',
    role: 'TENANT_ADMIN',
    tenantId: 'tenant-junin',
    authMethod: 'published-evaluation-jwt-db',
  };
}

function metadataFixture() {
  return {
    sourceLabel: 'Ejecucion presupuestaria mensual',
    domain: 'budget',
    referencePeriod: '2026-07',
    ownerOffice: 'Secretaria de Hacienda',
    purpose: 'reconciliation',
    classification: 'confidential',
    authority: 'owner_confirmed',
    currency: 'ARS',
    containsPersonalData: false,
  };
}

function createHandler(overrides = {}) {
  const profiled = sourceIntakeProfileFixture();
  return createSourceIntakeHandler({
    requireRoleImpl: async () => privateAdmin(),
    parseMultipartImpl: async () => ({
      filePath: path.join(os.tmpdir(), 'source-intake-test-upload'),
      extension: 'csv',
      metadata: metadataFixture(),
    }),
    validateMetadataImpl: value => value,
    profileSourceImpl: async () => profiled,
    storeImpl: {
      async listReceipts() { return []; },
      async appendReceipt() {
        return buildSourceIntakeReceipt({
          id: 'audit-log-1', createdAt: CREATED_AT, persisted: true, profiled,
        });
      },
    },
    removeFileImpl: async () => {},
    clock: () => new Date(CREATED_AT),
    ...overrides,
  });
}

test('endpoint is GET/POST-only and always emits the governed no-store contract headers', async () => {
  const response = responseRecorder();
  await createHandler()(request('DELETE'), response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, 'GET, POST');
  assert.equal(response.headers['x-municontrol-contract'], 'municipal-source-intake-v1');
  assert.match(response.headers['cache-control'], /(?:^|,)\s*no-store(?:,|$)/);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers.vary, 'Authorization');
});

test('private GET is tenant-scoped and returns at most persisted receipts', async () => {
  const profiled = sourceIntakeProfileFixture();
  const calls = [];
  const persisted = buildSourceIntakeReceipt({ id: 'audit-log-1', createdAt: CREATED_AT, persisted: true, profiled });
  const response = responseRecorder();
  await createHandler({
    storeImpl: {
      async listReceipts(input) { calls.push(input); return [persisted]; },
      async appendReceipt() { throw new Error('not expected'); },
    },
  })(request('GET'), response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [{ tenantId: 'tenant-junin' }]);
  assert.equal(response.payload.mode, SOURCE_INTAKE_MODES.PERSISTENT);
  assert.equal(response.payload.writeEnabled, true);
  assert.deepEqual(response.payload.receipts, [persisted]);
});

test('published GET is read-only and every published POST stops before multipart, profiler or store', async () => {
  const calls = { parse: 0, profile: 0, list: 0, append: 0, remove: 0 };
  const store = {
    async listReceipts() { calls.list += 1; return []; },
    async appendReceipt() { calls.append += 1; throw new Error('published write'); },
  };
  const getResponse = responseRecorder();
  await createHandler({ requireRoleImpl: async () => publishedAdmin(), storeImpl: store })(request('GET'), getResponse);
  assert.equal(getResponse.statusCode, 200);
  assert.equal(getResponse.payload.mode, SOURCE_INTAKE_MODES.PREVIEW);
  assert.equal(getResponse.payload.writeEnabled, false);
  assert.deepEqual(getResponse.payload.receipts, []);

  const postResponse = responseRecorder();
  await createHandler({
    requireRoleImpl: async () => publishedAdmin(),
    storeImpl: store,
    parseMultipartImpl: async () => { calls.parse += 1; throw new Error('multipart must be unreachable'); },
    profileSourceImpl: async () => { calls.profile += 1; throw new Error('profiler must be unreachable'); },
    removeFileImpl: async () => { calls.remove += 1; },
  })(request('POST'), postResponse);
  assert.equal(postResponse.statusCode, 403);
  assert.deepEqual(postResponse.payload, {
    error: 'La evaluacion publicada es solo lectura y no procesa archivos.',
    code: 'SOURCE_INTAKE_PUBLISHED_PREVIEW_DISABLED',
  });
  assert.deepEqual(calls, { parse: 0, profile: 0, list: 0, append: 0, remove: 0 });

  for (const role of ['SUPER_ADMIN', 'INTENDENTE', 'CONTADOR', 'TENANT_USER', 'INSPECTOR', 'DEMO']) {
    let parsed = false;
    const response = responseRecorder();
    await createHandler({
      requireRoleImpl: async () => ({ ...publishedAdmin(), role }),
      parseMultipartImpl: async () => { parsed = true; throw new Error('not expected'); },
    })(request('POST'), response);
    assert.equal(response.statusCode, 403, role);
    assert.equal(response.payload.code, 'SOURCE_INTAKE_PUBLISHED_PREVIEW_DISABLED', role);
    assert.equal(parsed, false, role);

    const readResponse = responseRecorder();
    await createHandler({ requireRoleImpl: async () => ({ ...publishedAdmin(), role }) })(request('GET'), readResponse);
    assert.equal(readResponse.statusCode, 403, `${role} GET`);
    assert.equal(readResponse.payload.code, 'SOURCE_INTAKE_PUBLISHED_ROLE_DENIED', `${role} GET`);
  }
});

test('published route authorization admits GET and rejects POST before the handler can parse', async () => {
  const decisions = [];
  let parsed = 0;
  const requireRoleImpl = async (req, res) => {
    const routeId = req.method === 'GET'
      ? 'serverless.municipal.source-intake.read'
      : 'serverless.municipal.source-intake.create';
    const decision = publishedDemoPolicy.evaluatePublishedDemoRoute({
      email: 'admin@junin.gov.ar',
      role: 'TENANT_ADMIN',
      tenantSlug: 'junin',
      routeId,
    });
    decisions.push([req.method, decision.allowed, decision.code]);
    if (!decision.allowed) {
      res.status(403).json({ error: 'denied', code: decision.code });
      return null;
    }
    return publishedAdmin();
  };
  const handler = createHandler({
    requireRoleImpl,
    parseMultipartImpl: async () => { parsed += 1; throw new Error('not expected'); },
  });
  const getResponse = responseRecorder();
  await handler(request('GET'), getResponse);
  assert.equal(getResponse.statusCode, 200);
  assert.deepEqual(getResponse.payload.receipts, []);

  const postResponse = responseRecorder();
  await handler(request('POST'), postResponse);
  assert.equal(postResponse.statusCode, 403);
  assert.equal(postResponse.payload.code, publishedDemoPolicy.PUBLISHED_DEMO_DECISION_CODES.DENIED);
  assert.equal(parsed, 0);
  assert.deepEqual(decisions.map(([method, allowed]) => [method, allowed]), [['GET', true], ['POST', false]]);
});

test('private POST profiles, appends one safe receipt, and removes the temporary file', async () => {
  const calls = [];
  const removed = [];
  const profiled = sourceIntakeProfileFixture();
  const response = responseRecorder();
  await createHandler({
    storeImpl: {
      async listReceipts() { return []; },
      async appendReceipt(input) {
        calls.push(input);
        return buildSourceIntakeReceipt({ id: 'audit-log-1', createdAt: CREATED_AT, persisted: true, profiled });
      },
    },
    removeFileImpl: async (...args) => { removed.push(args); },
  })(request('POST'), response);
  assert.equal(response.statusCode, 201);
  assert.equal(response.payload.mode, SOURCE_INTAKE_MODES.PERSISTENT);
  assert.equal(response.payload.receipt.status, 'quarantined');
  assert.deepEqual(calls, [{ tenantId: 'tenant-junin', userId: 'user-admin', profiled }]);
  assert.equal(removed.length, 1);
  assert.equal(removed[0][1].force, true);
  assert.doesNotMatch(JSON.stringify(response.payload), /filename|headers|"values"|"rows"|email|tenantId|userId/i);
});

test('auth and tenant failures happen before multipart parsing, and malformed input never reaches the store', async () => {
  let parsed = 0;
  let stored = 0;
  const parseMultipartImpl = async () => { parsed += 1; throw Object.assign(new Error(), { code: 'SOURCE_INTAKE_METADATA_INVALID' }); };
  const storeImpl = {
    async listReceipts() { stored += 1; return []; },
    async appendReceipt() { stored += 1; throw new Error('not expected'); },
  };

  const anonymous = responseRecorder();
  await createHandler({ requireRoleImpl: async () => null, parseMultipartImpl, storeImpl })(request('POST'), anonymous);
  assert.equal(parsed, 0);

  const tenantless = responseRecorder();
  await createHandler({
    requireRoleImpl: async () => ({ ...privateAdmin(), tenantId: '' }), parseMultipartImpl, storeImpl,
  })(request('POST'), tenantless);
  assert.equal(tenantless.statusCode, 403);
  assert.equal(parsed, 0);

  const malformed = responseRecorder();
  await createHandler({ parseMultipartImpl, storeImpl })(request('POST'), malformed);
  assert.equal(malformed.statusCode, 422);
  assert.equal(malformed.payload.code, 'SOURCE_INTAKE_INPUT_INVALID');
  assert.equal(parsed, 1);
  assert.equal(stored, 0);
});

test('oversized multipart errors are 413 and store failures are a generic 503', async () => {
  const oversized = responseRecorder();
  await createHandler({
    parseMultipartImpl: async () => { throw Object.assign(new Error(), { code: 1016, httpCode: 413 }); },
  })(request('POST'), oversized);
  assert.equal(oversized.statusCode, 413);
  assert.equal(oversized.payload.code, 'SOURCE_INTAKE_FILE_TOO_LARGE');

  const unavailable = responseRecorder();
  await createHandler({
    storeImpl: {
      async listReceipts() { throw new Error('db host secret'); },
      async appendReceipt() { throw new Error('db host secret'); },
    },
  })(request('POST'), unavailable);
  assert.equal(unavailable.statusCode, 503);
  assert.equal(unavailable.payload.code, 'SOURCE_INTAKE_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(unavailable.payload), /host|stack|database/i);
});

test('multipart parser pins one file, nine exact fields, and the 4 MiB serverless cap', async () => {
  let options;
  class IncomingFormStub {
    constructor(value) { options = value; }
    parse(_req, callback) {
      callback(null, Object.fromEntries(Object.entries(metadataFixture()).map(([key, value]) => [key, [String(value)]])), {
        file: [{
          filepath: path.join(os.tmpdir(), 'source-intake-multipart-test'),
          originalFilename: 'presupuesto.csv',
        }],
      });
    }
  }
  const parsed = await parseSourceIntakeMultipart({
    headers: { 'content-type': 'multipart/form-data; boundary=source-intake-test' },
  }, { IncomingFormClass: IncomingFormStub, removeFile: async () => {} });
  assert.equal(options.maxFiles, 1);
  assert.equal(options.maxFileSize, 4194304);
  assert.equal(options.maxTotalFileSize, 4194304);
  assert.equal(options.maxFields, 9);
  assert.equal(parsed.extension, 'csv');
  assert.equal(parsed.metadata.containsPersonalData, false);

  await assert.rejects(
    parseSourceIntakeMultipart({ headers: { 'content-type': 'application/json' } }),
    error => error.code === 'SOURCE_INTAKE_CONTENT_TYPE_INVALID',
  );
});
