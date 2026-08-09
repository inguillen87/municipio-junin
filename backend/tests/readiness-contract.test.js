'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'readiness-contract-secret-with-sufficient-length';
process.env.LEGACY_ANALYTICS_TENANT_ID = 'tenant-current';

const db = require('../db/connection');
const prisma = require('../lib/prisma');

async function startHarness() {
  const { app } = require('../server');
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function request(baseUrl, route, token) {
  const response = await fetch(baseUrl + route, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await response.text();
  return {
    status: response.status,
    payload: text ? JSON.parse(text) : null,
    text,
  };
}

test('liveness stays available while readiness and DB status fail closed without details', async t => {
  const originalIsUnavailable = db.isUnavailable;
  const originalQuery = db.query;
  const originalFindUnique = prisma.user.findUnique;

  prisma.user.findUnique = async ({ where }) => ({
    id: where.id,
    email: `${where.id}@example.test`,
    name: 'Administrador vigente',
    role: 'TENANT_ADMIN',
    tenantId: 'tenant-current',
    active: true,
    tenant: {
      id: 'tenant-current',
      slug: 'tenant-current',
      name: 'Municipio de prueba',
      shortName: 'Prueba',
      status: 'ACTIVE',
    },
  });

  let unavailable = true;
  let queryImpl = async () => { throw new Error('postgresql://internal:secret@db/private'); };
  db.isUnavailable = () => unavailable;
  db.query = (...args) => queryImpl(...args);

  const { server, baseUrl } = await startHarness();
  t.after(async () => {
    db.isUnavailable = originalIsUnavailable;
    db.query = originalQuery;
    prisma.user.findUnique = originalFindUnique;
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
  });

  const health = await request(baseUrl, '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.payload.ok, true);
  assert.equal(health.payload.live, true);
  assert.equal(health.payload.db, 'unavailable');

  const unavailableReadiness = await request(baseUrl, '/api/readiness');
  assert.equal(unavailableReadiness.status, 503);
  assert.equal(unavailableReadiness.payload.ok, false);
  assert.equal(unavailableReadiness.payload.ready, false);

  unavailable = false;
  const failedReadiness = await request(baseUrl, '/api/readiness');
  assert.equal(failedReadiness.status, 503);
  assert.equal(failedReadiness.payload.ok, false);
  assert.doesNotMatch(failedReadiness.text, /internal:secret|details/i);

  const token = jwt.sign({ id: 'readiness-admin' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const failedDbStatus = await request(baseUrl, '/api/data/db-status', token);
  assert.equal(failedDbStatus.status, 503);
  assert.deepEqual(failedDbStatus.payload, {
    ok: false,
    connected: false,
    type: 'unavailable',
    message: 'No fue posible verificar la fuente PostgreSQL.',
  });
  assert.doesNotMatch(failedDbStatus.text, /internal:secret|details/i);

  queryImpl = async () => ({ rows: [{ ok: 1 }] });
  const ready = await request(baseUrl, '/api/readiness');
  assert.equal(ready.status, 200);
  assert.deepEqual(ready.payload, { ok: true, ready: true, db: 'postgresql' });

  const readyDbStatus = await request(baseUrl, '/api/data/db-status', token);
  assert.equal(readyDbStatus.status, 200);
  assert.equal(readyDbStatus.payload.ok, true);
  assert.equal(readyDbStatus.payload.connected, true);
});
