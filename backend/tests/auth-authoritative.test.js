'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'express-test-jwt-secret-with-sufficient-length';
process.env.JWT_EXPIRES = '8h';
process.env.LEGACY_ANALYTICS_TENANT_ID = 'tenant-current';
process.env.WHATSAPP_VERIFY_TOKEN = 'verify-token-test';
delete process.env.ENABLE_WHATSAPP_DIAGNOSTICS;

const prisma = require('../lib/prisma');
const originalFindUnique = prisma.user.findUnique;
const originalTenantUpdate = prisma.tenant.update;
const users = new Map();
const failingUserIds = new Set();
const lookupsById = new Map();

prisma.user.findUnique = async ({ where }) => {
  lookupsById.set(where.id, (lookupsById.get(where.id) || 0) + 1);
  if (failingUserIds.has(where.id)) throw new Error('simulated auth DB outage');
  return users.get(where.id) || null;
};

function setUser(id, {
  role = 'TENANT_USER',
  tenantId = 'tenant-current',
  active = true,
  tenantStatus = 'ACTIVE',
  trialEndsAt = tenantStatus === 'TRIAL' ? '2099-01-01T00:00:00.000Z' : null,
} = {}) {
  users.set(id, {
    id,
    email: `${id}@example.test`,
    name: `Usuario ${id}`,
    role,
    tenantId,
    active,
    tenant: tenantId ? {
      id: tenantId,
      slug: tenantId,
      name: 'Municipio de prueba',
      shortName: 'Prueba',
      status: tenantStatus,
      plan: 'TRIAL',
      themePrimary: '#123456',
      themeAccent: '#654321',
      themeBackground: '#ffffff',
      logoUrl: null,
      trialEndsAt,
    } : null,
  });
}

function lookupCount(id) {
  return lookupsById.get(id) || 0;
}

function tokenFor(id, claims = {}) {
  return jwt.sign({
    id,
    role: claims.role || 'SUPER_ADMIN',
    tenantId: claims.tenantId === undefined ? 'tenant-stale' : claims.tenantId,
  }, process.env.JWT_SECRET, { expiresIn: '8h' });
}

async function startHarness() {
  const app = express();
  app.use(express.json());
  app.use('/admin', require('../routes/admin'));
  app.use('/auth', require('../routes/auth'));
  app.use('/whatsapp', require('../routes/whatsapp'));
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function request(baseUrl, path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(baseUrl + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = text;
  try { payload = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { status: response.status, payload };
}

test('Express authorization is DB-authoritative across admin, me, refresh, and legacy middleware', async t => {
  const { server, baseUrl } = await startHarness();
  let tenantMutationCalls = 0;
  prisma.tenant.update = async () => { tenantMutationCalls += 1; return { id: 'unexpected' }; };
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    prisma.user.findUnique = originalFindUnique;
    prisma.tenant.update = originalTenantUpdate;
    await prisma.$disconnect();
  });

  const missingLoginBody = await request(baseUrl, '/auth/login', { method: 'POST' });
  assert.equal(missingLoginBody.status, 400, 'a missing JSON body must fail before database work');
  const oversizedLoginPassword = await request(baseUrl, '/auth/login', {
    method: 'POST',
    body: { email: 'official@example.test', password: 'a'.repeat(73) },
  });
  assert.equal(oversizedLoginPassword.status, 400, 'bcrypt inputs beyond 72 bytes must fail closed');

  const staleAdminToken = tokenFor('revocable-admin', { role: 'SUPER_ADMIN', tenantId: 'tenant-stale' });

  setUser('revocable-admin', { role: 'TENANT_USER', tenantId: 'tenant-current' });
  const downgraded = await request(baseUrl, '/admin/tenants/x/modules', {
    method: 'PUT', token: staleAdminToken, body: {},
  });
  assert.equal(downgraded.status, 403);

  setUser('revocable-admin', { role: 'SUPER_ADMIN', tenantId: 'tenant-current', active: false });
  const inactive = await request(baseUrl, '/admin/tenants/x/modules', {
    method: 'PUT', token: staleAdminToken, body: {},
  });
  assert.equal(inactive.status, 401);

  setUser('revocable-admin', { role: 'SUPER_ADMIN', tenantId: 'tenant-current', tenantStatus: 'SUSPENDED' });
  const suspended = await request(baseUrl, '/admin/tenants/x/modules', {
    method: 'PUT', token: staleAdminToken, body: {},
  });
  assert.equal(suspended.status, 403);

  setUser('revocable-admin', {
    role: 'SUPER_ADMIN',
    tenantId: 'tenant-current',
    tenantStatus: 'TRIAL',
    trialEndsAt: '2026-08-08T00:00:00.000Z',
  });
  const expiredTrial = await request(baseUrl, '/admin/tenants/x/modules', {
    method: 'PUT', token: staleAdminToken, body: {},
  });
  assert.equal(expiredTrial.status, 403);

  setUser('revocable-admin', { role: 'SUPER_ADMIN', tenantId: null });
  failingUserIds.add('revocable-admin');
  const unavailable = await request(baseUrl, '/admin/tenants/x/modules', {
    method: 'PUT', token: staleAdminToken, body: {},
  });
  failingUserIds.delete('revocable-admin');
  assert.equal(unavailable.status, 503);

  setUser('revocable-admin', { role: 'SUPER_ADMIN', tenantId: null });
  const currentAdmin = await request(baseUrl, '/admin/tenants/x/modules', {
    method: 'PUT', token: staleAdminToken, body: {},
  });
  assert.equal(currentAdmin.status, 410, 'a current SUPER_ADMIN must reach the protected business handler');

  const retiredUserProvisioning = await request(baseUrl, '/admin/users', {
    method: 'POST', token: staleAdminToken, body: { email: 'known@example.test', password: 'known-password-value' },
  });
  assert.equal(retiredUserProvisioning.status, 410);
  assert.equal(retiredUserProvisioning.payload.code, 'ACCOUNT_LIFECYCLE_NOT_GOVERNED');

  const retiredTenantProvisioning = await request(baseUrl, '/admin/tenants', {
    method: 'POST', token: staleAdminToken, body: { adminPassword: 'known-password-value' },
  });
  assert.equal(retiredTenantProvisioning.status, 410);
  assert.equal(retiredTenantProvisioning.payload.code, 'ACCOUNT_LIFECYCLE_NOT_GOVERNED');

  const retiredTenantUpdate = await request(baseUrl, '/admin/tenants/tenant-current', {
    method: 'PUT', token: staleAdminToken, body: { trialEndsAt: '2099-01-01T00:00:00.000Z' },
  });
  assert.equal(retiredTenantUpdate.status, 410);
  assert.equal(retiredTenantUpdate.payload.code, 'TENANT_LIFECYCLE_NOT_GOVERNED');

  const retiredTenantStatus = await request(baseUrl, '/admin/tenants/tenant-current/status', {
    method: 'PATCH', token: staleAdminToken, body: { status: 'ACTIVE' },
  });
  assert.equal(retiredTenantStatus.status, 410);
  assert.equal(retiredTenantStatus.payload.code, 'TENANT_LIFECYCLE_NOT_GOVERNED');
  assert.equal(tenantMutationCalls, 0, 'retired tenant lifecycle routes must not write to Prisma');

  setUser('current-executive', { role: 'INTENDENTE', tenantId: 'tenant-current' });
  const staleIdentityToken = tokenFor('current-executive', { role: 'SUPER_ADMIN', tenantId: 'tenant-stale' });
  const meBefore = lookupCount('current-executive');
  const me = await request(baseUrl, '/auth/me', { token: staleIdentityToken });
  assert.equal(me.status, 200);
  assert.equal(me.payload.user.role, 'INTENDENTE');
  assert.equal(me.payload.user.tenantId, 'tenant-current');
  assert.match(me.payload.user.accessPolicyVersion, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  assert.equal(me.payload.user.capabilities.includes('navigation.grh-executive'), true);
  assert.equal(me.payload.user.capabilities.includes('navigation.import'), false);
  assert.equal(lookupCount('current-executive') - meBefore, 1, '/me must perform one authoritative lookup');

  setUser('unknown-policy-role', { role: 'TESORERIA', tenantId: 'tenant-current' });
  const unknownRole = await request(baseUrl, '/auth/me', { token: tokenFor('unknown-policy-role') });
  assert.equal(unknownRole.status, 403);
  assert.equal(unknownRole.payload.error, 'Rol no habilitado');

  const refreshed = await request(baseUrl, '/auth/refresh', { method: 'POST', token: staleIdentityToken });
  assert.equal(refreshed.status, 410);
  assert.equal(refreshed.payload.code, 'SESSION_REFRESH_NOT_GOVERNED');
  assert.equal(Object.hasOwn(refreshed.payload, 'token'), false, 'retired refresh must never issue a new token');

  const { requireAuth } = require('../middleware/auth');
  const { authenticate, requireRole, requireLegacyTenantBinding, hasRole } = require('../middleware/authMiddleware');
  setUser('shared-request-user', { role: 'TENANT_ADMIN', tenantId: 'tenant-current' });
  const sharedToken = tokenFor('shared-request-user', { role: 'SUPER_ADMIN', tenantId: 'tenant-stale' });
  const sharedReq = { headers: { authorization: `Bearer ${sharedToken}` }, params: {}, body: {} };
  const sharedRes = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  const sharedBefore = lookupCount('shared-request-user');
  let legacyReached = false;
  let modernReached = false;
  await requireAuth(sharedReq, sharedRes, () => { legacyReached = true; });
  await authenticate(sharedReq, sharedRes, () => { modernReached = true; });
  assert.equal(legacyReached, true);
  assert.equal(modernReached, true);
  assert.equal(lookupCount('shared-request-user') - sharedBefore, 1, 'both middleware variants must share one lookup per request');
  assert.equal(sharedReq.user.role, 'TENANT_ADMIN');
  assert.equal(sharedReq.user.tenantId, 'tenant-current');
  assert.equal(hasRole('TENANT_ADMIN', 'TENANT_ADMIN'), true);
  assert.equal(hasRole('INTENDENTE', 'TENANT_ADMIN'), false, 'political hierarchy must not inherit technical admin rights');
  assert.equal(hasRole('CONTADOR', 'TENANT_USER'), false, 'business roles must not inherit generic user rights');
  assert.equal(hasRole('SUPER_ADMIN', 'TENANT_ADMIN'), false, 'platform administration is not ambient municipal access');
  let unknownRoleReached = false;
  requireRole('UNKNOWN_ROLE')(sharedReq, sharedRes, () => { unknownRoleReached = true; });
  assert.equal(unknownRoleReached, false, 'an unknown required role must fail closed');
  assert.equal(sharedRes.statusCode, 403);
  let legacyTenantReached = false;
  requireLegacyTenantBinding(sharedReq, sharedRes, () => { legacyTenantReached = true; });
  assert.equal(legacyTenantReached, true, 'legacy binding must use the current DB tenant, not the stale token tenant');

  const webhook = await request(baseUrl, '/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-token-test&hub.challenge=ok');
  assert.equal(webhook.status, 200);
  assert.equal(webhook.payload, 'ok', 'the explicit Meta verification route remains independent from browser JWT auth');
});

test('Express legacy dataset binding gives no ambient SUPER_ADMIN bypass', () => {
  const { requireLegacyTenantBinding } = require('../middleware/authMiddleware');
  const response = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  });

  let foreignReached = false;
  const foreignResponse = response();
  requireLegacyTenantBinding({
    user: { id: 'platform-admin', role: 'SUPER_ADMIN', tenantId: 'tenant-other' },
  }, foreignResponse, () => { foreignReached = true; });
  assert.equal(foreignReached, false);
  assert.equal(foreignResponse.statusCode, 403);

  let boundReached = false;
  const boundResponse = response();
  requireLegacyTenantBinding({
    user: { id: 'bound-admin', role: 'SUPER_ADMIN', tenantId: process.env.LEGACY_ANALYTICS_TENANT_ID },
  }, boundResponse, () => { boundReached = true; });
  assert.equal(boundReached, true);
  assert.equal(boundResponse.statusCode, 200);
});
