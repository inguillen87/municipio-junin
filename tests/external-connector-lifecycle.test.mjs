import assert from 'node:assert/strict';
import test from 'node:test';

import { createExternalConnectorHandler } from '../api/external-connector.js';

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    payload: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

function request(body) {
  return { method: 'POST', headers: {}, query: {}, body };
}

function handlerWith(PoolClass, lookupImpl = async () => [{ address: '203.0.113.10', family: 4 }]) {
  return createExternalConnectorHandler({
    PoolClass,
    lookupImpl,
    requireRoleImpl: async () => ({ id: 'admin', role: 'TENANT_ADMIN', tenantId: 'tenant-current' }),
    requireDatasetTenantImpl: () => true,
  });
}

function postgresConfig(host = 'db.allowed.test') {
  return {
    action: 'test',
    config: {
      type: 'postgresql',
      host,
      port: 5432,
      database: 'municipio',
      user: 'reader',
      password: 'never-return-this-password',
      ssl: true,
    },
  };
}

test('external PostgreSQL probe always cleans up and returns stable generic failures', async t => {
  const previousHosts = process.env.DATA_CONNECTOR_ALLOWED_HOSTS;
  const previousPrivate = process.env.DATA_CONNECTOR_ALLOW_PRIVATE;
  process.env.DATA_CONNECTOR_ALLOWED_HOSTS = 'db.allowed.test';
  delete process.env.DATA_CONNECTOR_ALLOW_PRIVATE;
  t.after(() => {
    if (previousHosts === undefined) delete process.env.DATA_CONNECTOR_ALLOWED_HOSTS;
    else process.env.DATA_CONNECTOR_ALLOWED_HOSTS = previousHosts;
    if (previousPrivate === undefined) delete process.env.DATA_CONNECTOR_ALLOW_PRIVATE;
    else process.env.DATA_CONNECTOR_ALLOW_PRIVATE = previousPrivate;
  });

  const successState = { released: 0, ended: 0 };
  class SuccessfulPool {
    constructor(config) { successState.config = config; }
    async connect() {
      return {
        async query(sql) {
          return sql.startsWith('SELECT tablename')
            ? { rows: [{ tablename: 'empleados' }, { tablename: 'liquidaciones' }] }
            : { rows: [{ test: 1 }] };
        },
        release() { successState.released += 1; },
      };
    }
    async end() { successState.ended += 1; }
  }

  const success = mockResponse();
  await handlerWith(SuccessfulPool)(request(postgresConfig()), success);
  assert.equal(success.statusCode, 200);
  assert.equal(success.payload.success, true);
  assert.deepEqual(success.payload.tables, ['empleados', 'liquidaciones']);
  assert.equal(successState.released, 1);
  assert.equal(successState.ended, 1);
  assert.equal(successState.config.host, '203.0.113.10');
  assert.deepEqual(successState.config.ssl, { rejectUnauthorized: true, servername: 'db.allowed.test' });

  const queryFailureState = { released: 0, ended: 0 };
  class QueryFailurePool {
    async connect() {
      return {
        async query(sql) {
          if (sql.startsWith('SELECT tablename')) {
            throw new Error('driver leaked postgresql://reader:never-return-this-password@internal/db');
          }
          return { rows: [{ test: 1 }] };
        },
        release() { queryFailureState.released += 1; },
      };
    }
    async end() { queryFailureState.ended += 1; }
  }

  const queryFailure = mockResponse();
  await handlerWith(QueryFailurePool)(request(postgresConfig()), queryFailure);
  assert.equal(queryFailure.statusCode, 502);
  assert.deepEqual(queryFailure.payload, {
    success: false,
    message: 'No se pudo validar la conexión PostgreSQL',
  });
  assert.doesNotMatch(JSON.stringify(queryFailure.payload), /driver leaked|never-return-this-password|details/i);
  assert.deepEqual(queryFailureState, { released: 1, ended: 1 });

  const connectFailureState = { ended: 0 };
  class ConnectFailurePool {
    async connect() { throw new Error('secret driver detail'); }
    async end() { connectFailureState.ended += 1; }
  }

  const connectFailure = mockResponse();
  await handlerWith(ConnectFailurePool)(request(postgresConfig()), connectFailure);
  assert.equal(connectFailure.statusCode, 502);
  assert.doesNotMatch(JSON.stringify(connectFailure.payload), /secret driver detail|details/i);
  assert.equal(connectFailureState.ended, 1);

  const cleanupFailureState = { released: 0, ended: 0 };
  class CleanupFailurePool {
    async connect() {
      return {
        async query(sql) {
          return sql.startsWith('SELECT tablename') ? { rows: [] } : { rows: [{ test: 1 }] };
        },
        release() { cleanupFailureState.released += 1; },
      };
    }
    async end() {
      cleanupFailureState.ended += 1;
      throw new Error('secret cleanup detail');
    }
  }

  const cleanupFailure = mockResponse();
  await handlerWith(CleanupFailurePool)(request(postgresConfig()), cleanupFailure);
  assert.equal(cleanupFailure.statusCode, 502, 'cleanup failure must never be reported as a successful probe');
  assert.doesNotMatch(JSON.stringify(cleanupFailure.payload), /secret cleanup detail|details/i);
  assert.deepEqual(cleanupFailureState, { released: 1, ended: 1 });
});

test('external connector preserves allowlist/private-address gates and retires global actions', async t => {
  const previousHosts = process.env.DATA_CONNECTOR_ALLOWED_HOSTS;
  const previousPrivate = process.env.DATA_CONNECTOR_ALLOW_PRIVATE;
  process.env.DATA_CONNECTOR_ALLOWED_HOSTS = 'db.allowed.test';
  delete process.env.DATA_CONNECTOR_ALLOW_PRIVATE;
  t.after(() => {
    if (previousHosts === undefined) delete process.env.DATA_CONNECTOR_ALLOWED_HOSTS;
    else process.env.DATA_CONNECTOR_ALLOWED_HOSTS = previousHosts;
    if (previousPrivate === undefined) delete process.env.DATA_CONNECTOR_ALLOW_PRIVATE;
    else process.env.DATA_CONNECTOR_ALLOW_PRIVATE = previousPrivate;
  });

  let poolsCreated = 0;
  class UnexpectedPool {
    constructor() { poolsCreated += 1; }
  }

  const disallowed = mockResponse();
  await handlerWith(UnexpectedPool)(request(postgresConfig('attacker.test')), disallowed);
  assert.equal(disallowed.statusCode, 403);

  const privateDestination = mockResponse();
  await handlerWith(UnexpectedPool, async () => [{ address: '127.0.0.1', family: 4 }])(
    request(postgresConfig()),
    privateDestination,
  );
  assert.equal(privateDestination.statusCode, 403);

  const unsupported = mockResponse();
  const unsupportedBody = postgresConfig();
  unsupportedBody.config.type = 'mysql';
  await handlerWith(UnexpectedPool)(request(unsupportedBody), unsupported);
  assert.equal(unsupported.statusCode, 400);

  const noTls = mockResponse();
  const noTlsBody = postgresConfig();
  noTlsBody.config.ssl = false;
  await handlerWith(UnexpectedPool)(request(noTlsBody), noTls);
  assert.equal(noTls.statusCode, 400);
  assert.match(noTls.payload.message, /TLS verificable/);

  for (const action of ['save', 'list', 'query']) {
    const retired = mockResponse();
    await handlerWith(UnexpectedPool)(request({ action, config: {} }), retired);
    assert.equal(retired.statusCode, 410);
    assert.equal(retired.payload.code, 'CONNECTOR_ACTION_RETIRED');
  }
  assert.equal(poolsCreated, 0);
});
