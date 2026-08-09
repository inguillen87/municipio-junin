'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'legacy-retirement-test-secret-with-sufficient-length';
process.env.LEGACY_ANALYTICS_TENANT_ID = 'tenant-current';

const prisma = require('../lib/prisma');
const originalFindUnique = prisma.user.findUnique;

prisma.user.findUnique = async ({ where }) => ({
  id: where.id,
  email: `${where.id}@example.test`,
  name: 'Operador vigente',
  role: 'TENANT_ADMIN',
  tenantId: 'tenant-current',
  active: true,
  tenant: {
    id: 'tenant-current',
    slug: 'tenant-current',
    name: 'Municipio de prueba',
    shortName: 'Prueba',
    status: 'ACTIVE',
    plan: 'TRIAL',
    themePrimary: '#123456',
    themeAccent: '#654321',
    themeBackground: '#ffffff',
    logoUrl: null,
    trialEndsAt: null,
  },
});

function tokenFor(id = 'operator') {
  return jwt.sign({
    id,
    role: 'SUPER_ADMIN',
    tenantId: 'stale-tenant',
  }, process.env.JWT_SECRET, { expiresIn: '8h' });
}

async function startHarness() {
  const { app } = require('../server');
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function request(baseUrl, route, { method = 'GET', token } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(baseUrl + route, { method, headers });
  const text = await response.text();
  let payload = text;
  try { payload = text ? JSON.parse(text) : null; } catch { /* retain text */ }
  return { status: response.status, payload };
}

test('Express retires tenantless datasets and never serves the checkout or uploads', async t => {
  const { server, baseUrl } = await startHarness();
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    prisma.user.findUnique = originalFindUnique;
    await prisma.$disconnect();
  });

  const anonymous = await request(baseUrl, '/api/empleados');
  assert.equal(anonymous.status, 401, 'retired data still requires an authoritative identity');

  for (const surface of ['contratos', 'empleados', 'reclamos', 'archivos']) {
    const response = await request(baseUrl, `/api/${surface}`, { token: tokenFor(surface) });
    assert.equal(response.status, 410, `${surface} must be unavailable until tenant isolation exists`);
    assert.equal(response.payload.code, 'TENANT_DATASET_REQUIRED');
    assert.equal(response.payload.surface, surface);
  }

  for (const route of ['/api/data/metrics', '/api/data/secretarias', '/api/data/empleados/stats', '/api/data/alertas']) {
    const response = await request(baseUrl, route, { token: tokenFor(route) });
    assert.equal(response.status, 410, `${route} must remain unavailable until governed contracts exist`);
    assert.equal(response.payload.code, 'LEGACY_ANALYTICS_READ_RETIRED');
  }

  const uploadAttempt = await request(baseUrl, '/api/archivos/upload', {
    method: 'POST',
    token: tokenFor('uploader'),
  });
  assert.equal(uploadAttempt.status, 410, 'upload parsing and disk writes must be unreachable');

  for (const route of ['/backend/server.js', '/backend/uploads/private.csv', '/package.json', '/api/_data/grh-semantic.json']) {
    const response = await request(baseUrl, route);
    assert.equal(response.status, 404, `${route} must not be exposed by Express static hosting`);
  }

  const health = await request(baseUrl, '/api/health');
  assert.equal(health.status, 200, 'the supported health endpoint remains available');
  assert.equal(health.payload.ok, true);
});

test('the retired public form cannot collect data or manufacture a ticket', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'form-public.html'), 'utf8');

  assert.match(html, /data-surface-state="retired"/);
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /localStorage|sessionStorage|innerHTML|Math\.random|setTimeout|submitForm/);
  assert.match(html, /no solicita, guarda ni transmite información/i);
});
