'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'express-route-policy-secret-with-sufficient-length';

const prisma = require('../lib/prisma');
const routePolicy = require('../../shared/route-policy.cjs');
const { authenticate, requireCapability } = require('../middleware/authMiddleware');

const originalFindUnique = prisma.user.findUnique;
const users = new Map();

prisma.user.findUnique = async ({ where }) => users.get(where.id) || null;

function setUser(id, role, tenantId = 'tenant-current') {
  users.set(id, {
    id,
    email: `${id}@example.test`,
    name: `Usuario ${id}`,
    role,
    tenantId,
    active: true,
    tenant: tenantId ? {
      id: tenantId,
      slug: tenantId,
      name: 'Municipio de prueba',
      shortName: 'Prueba',
      status: 'ACTIVE',
      plan: 'TRIAL',
      themePrimary: '#123456',
      themeAccent: '#654321',
      themeBackground: '#ffffff',
      logoUrl: null,
      trialEndsAt: null,
    } : null,
  });
}

function tokenFor(id, staleRole = 'SUPER_ADMIN') {
  return jwt.sign({ id, role: staleRole, tenantId: 'stale-tenant' }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

async function startHarness() {
  const app = express();
  app.use(express.json());
  const reached = (req, res) => res.json({ ok: true, role: req.user.role });

  app.get('/api/admin/stats', authenticate, reached);
  app.post('/api/data/import', authenticate, reached);
  app.get('/api/data/metrics', authenticate, reached);
  app.post('/api/whatsapp/send-alert', authenticate, reached);
  app.get('/api/future-protected', authenticate, reached);

  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function request(baseUrl, path, id, method = 'GET') {
  const response = await fetch(baseUrl + path, {
    method,
    headers: { Authorization: `Bearer ${tokenFor(id)}` },
  });
  return { status: response.status, payload: await response.json() };
}

test('Express authenticate enforces the exact route manifest using the current DB role', async t => {
  const { server, baseUrl } = await startHarness();
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    prisma.user.findUnique = originalFindUnique;
    await prisma.$disconnect();
  });

  setUser('stale-admin', 'TENANT_USER');
  const staleAdmin = await request(baseUrl, '/api/admin/stats', 'stale-admin');
  assert.equal(staleAdmin.status, 403);
  assert.equal(staleAdmin.payload.code, 'ROUTE_PERMISSION_DENIED');

  setUser('platform-admin', 'SUPER_ADMIN', null);
  const platformAdmin = await request(baseUrl, '/api/admin/stats', 'platform-admin');
  assert.deepEqual(platformAdmin, { status: 200, payload: { ok: true, role: 'SUPER_ADMIN' } });

  setUser('tenant-admin', 'TENANT_ADMIN');
  const tenantImport = await request(baseUrl, '/api/data/import', 'tenant-admin', 'POST');
  assert.equal(tenantImport.status, 200);

  setUser('executive', 'INTENDENTE');
  const executiveRead = await request(baseUrl, '/api/data/metrics', 'executive');
  assert.equal(executiveRead.status, 200);
  const executiveImport = await request(baseUrl, '/api/data/import', 'executive', 'POST');
  assert.equal(executiveImport.status, 403);

  const tenantWhatsApp = await request(baseUrl, '/api/whatsapp/send-alert', 'tenant-admin', 'POST');
  assert.equal(tenantWhatsApp.status, 200);
  const platformWhatsApp = await request(baseUrl, '/api/whatsapp/send-alert', 'platform-admin', 'POST');
  assert.equal(platformWhatsApp.status, 403, 'platform administration is not ambient municipal access');

  const unknown = await request(baseUrl, '/api/future-protected', 'platform-admin');
  assert.equal(unknown.status, 403);
  assert.equal(unknown.payload.code, 'ROUTE_PERMISSION_DENIED');
});

test('Express capability middleware denies unknown and ungranted resource/actions', () => {
  const response = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };

  let reached = false;
  requireCapability(routePolicy.RESOURCES.GRH_CONTRACT, routePolicy.ACTIONS.READ)(
    { user: { role: 'INTENDENTE' } },
    response,
    () => { reached = true; },
  );
  assert.equal(reached, true);

  reached = false;
  requireCapability('future.resource', 'admin')(
    { user: { role: 'SUPER_ADMIN' } },
    response,
    () => { reached = true; },
  );
  assert.equal(reached, false);
  assert.equal(response.statusCode, 403);
  assert.equal(response.payload.code, 'ROUTE_PERMISSION_DENIED');
});
