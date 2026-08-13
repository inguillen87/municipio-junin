import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import jwt from 'jsonwebtoken';

import { createEvaluationSessionHandler } from '../api/auth/evaluation-session.js';
import { createPrivateLinkSessionHandler } from '../api/auth/private-link-session.js';
import publishedDemoPolicy from '../shared/published-demo-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';
import routePolicy from '../shared/route-policy.cjs';

const JWT_SECRET = 'one-click-session-test-secret-that-is-long-enough';
const TENANT_ID = 'tenant-junin-test';

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

function request(body, extra = {}) {
  return {
    method: 'POST',
    url: extra.url || '/api/auth/evaluation-session',
    headers: extra.headers || { 'sec-fetch-site': 'same-origin' },
    socket: { remoteAddress: extra.address || '127.0.0.1' },
    body,
  };
}

function activeTenant(overrides = {}) {
  return {
    id: TENANT_ID,
    slug: 'junin',
    name: 'Municipalidad de Junín',
    shortName: 'Junín',
    status: 'ACTIVE',
    trialEndsAt: null,
    ...overrides,
  };
}

function publishedUser(overrides = {}) {
  return {
    id: 'published-intendente-id',
    email: 'intendente@junin.gov.ar',
    name: 'Identidad publicada',
    role: 'INTENDENTE',
    tenantId: TENANT_ID,
    tenant: activeTenant(),
    active: true,
    ...overrides,
  };
}

const allowLimiter = Object.freeze({ consume: () => ({ allowed: true, retryAfterSeconds: 0 }) });

test('published one-click session accepts only a profileId and returns a redacted, tenant-bound JWT', async () => {
  const calls = [];
  const handler = createEvaluationSessionHandler({
    environment: { JWT_SECRET, GRH_TENANT_ID: TENANT_ID },
    assertTransportImpl: () => true,
    limiterImpl: allowLimiter,
    findUserImpl: async options => { calls.push(options); return publishedUser(); },
  });
  const res = responseRecorder();
  await handler(request({ profileId: 'intendente' }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['x-municontrol-contract'], 'municontrol-evaluation-session-v1');
  assert.deepEqual(calls, [{ where: { email: 'intendente@junin.gov.ar' }, include: { tenant: true } }]);
  assert.equal(res.payload.user.id, '');
  assert.equal(res.payload.user.email, '');
  assert.equal(res.payload.user.name, 'Evaluación Intendente');
  assert.equal(res.payload.user.role, 'INTENDENTE');
  assert.equal(res.payload.user.tenantId, TENANT_ID);
  const claims = jwt.verify(res.payload.token, JWT_SECRET);
  assert.equal(claims.id, 'published-evaluation:intendente');
  assert.equal(claims.profileId, 'intendente');
  assert.equal(Object.hasOwn(claims, 'email'), false);
  assert.equal(Object.hasOwn(claims, 'name'), false);
  assert.equal(claims.authMode, 'published-evaluation');
});

test('every published profile receives the complete aggregate navigation without admin or nominal capabilities', async () => {
  for (const profile of publishedDemoPolicy.PUBLISHED_DEMO_PROFILES) {
    const res = responseRecorder();
    await createEvaluationSessionHandler({
      environment: { JWT_SECRET, GRH_TENANT_ID: TENANT_ID },
      assertTransportImpl: () => true,
      limiterImpl: allowLimiter,
      findUserImpl: async () => publishedUser({
        email: profile.email,
        role: profile.role,
        id: `published-${profile.profileId}`,
      }),
    })(request({ profileId: profile.profileId }), res);
    assert.equal(res.statusCode, 200, profile.profileId);
    const access = res.payload.user.capabilities;
    assert.deepEqual(access, publishedDemoPolicy.PUBLISHED_DEMO_CAPABILITIES, profile.profileId);
    for (const denied of ['navigation.audit', 'navigation.export', 'navigation.import']) {
      assert.equal(access.includes(denied), false, `${profile.profileId}:${denied}`);
    }
  }
});

test('published one-click session rejects credentials, unknown profiles, cross-site calls and rate excess before DB work', async () => {
  let reads = 0;
  const base = {
    environment: { JWT_SECRET, GRH_TENANT_ID: TENANT_ID },
    assertTransportImpl: () => true,
    findUserImpl: async () => { reads += 1; return publishedUser(); },
  };
  for (const body of [
    { email: 'intendente@junin.gov.ar', password: 'forbidden' },
    { profileId: 'intendente', email: 'intendente@junin.gov.ar' },
    { profileId: 'future-profile' },
  ]) {
    const res = responseRecorder();
    await createEvaluationSessionHandler({ ...base, limiterImpl: allowLimiter })(request(body), res);
    assert.equal(res.statusCode, 400);
  }

  const crossSite = responseRecorder();
  await createEvaluationSessionHandler({ ...base, limiterImpl: allowLimiter })(request(
    { profileId: 'intendente' },
    { headers: { 'sec-fetch-site': 'cross-site' } },
  ), crossSite);
  assert.equal(crossSite.statusCode, 403);

  const limited = responseRecorder();
  await createEvaluationSessionHandler({
    ...base,
    limiterImpl: { consume: () => ({ allowed: false, retryAfterSeconds: 90 }) },
  })(request({ profileId: 'intendente' }), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers['retry-after'], '90');
  assert.equal(reads, 0);
});

test('published one-click session fails closed on user, role, tenant and lifecycle drift without a token', async t => {
  const driftCases = [
    null,
    publishedUser({ active: false }),
    publishedUser({ email: 'other@junin.gov.ar' }),
    publishedUser({ role: 'TENANT_ADMIN' }),
    publishedUser({ tenantId: 'other', tenant: activeTenant({ id: 'other' }) }),
    publishedUser({ tenant: activeTenant({ slug: 'junin-buenos-aires' }) }),
    publishedUser({ tenant: activeTenant({ status: 'SUSPENDED' }) }),
  ];
  for (const [index, user] of driftCases.entries()) {
    await t.test(`drift-${index}`, async () => {
      const handler = createEvaluationSessionHandler({
        environment: { JWT_SECRET, GRH_TENANT_ID: TENANT_ID },
        assertTransportImpl: () => true,
        limiterImpl: allowLimiter,
        findUserImpl: async () => user,
      });
      const res = responseRecorder();
      await handler(request({ profileId: 'intendente' }), res);
      assert.equal(res.statusCode, 403);
      assert.equal(Object.hasOwn(res.payload || {}, 'token'), false);
    });
  }
});

test('published session remains aggregate-only and cannot cross into nominal or mutation routes', () => {
  const profile = publishedDemoPolicy.resolvePublishedDemoProfile('intendente');
  for (const routeId of [
    'serverless.grh.directory.read',
    'serverless.grh.directory-access.read',
    'serverless.grh.action-ledger.create',
    'serverless.grh.action-ledger.update',
  ]) {
    assert.equal(publishedDemoPolicy.evaluatePublishedDemoRoute({ ...profile, routeId }).allowed, false, routeId);
  }
});

test('opaque private link exchanges an unlogged fragment token for the exact full INTENDENTE session', async () => {
  const opaqueToken = 'A'.repeat(48);
  const expiresAt = '2030-01-01T00:00:00Z';
  const privateUser = publishedUser({
    id: 'private-intendente-id',
    email: 'autoridad@junin.gob.ar',
    name: 'Autoridad municipal',
  });
  const calls = [];
  const handler = createPrivateLinkSessionHandler({
    environment: {
      JWT_SECRET,
      GRH_TENANT_ID: TENANT_ID,
      PRIVATE_INTENDENTE_LINK_TOKEN_SHA256: crypto.createHash('sha256').update(opaqueToken).digest('hex'),
      PRIVATE_INTENDENTE_LINK_EXPIRES_AT: expiresAt,
      PRIVATE_INTENDENTE_USER_ID: privateUser.id,
      PRIVATE_INTENDENTE_TENANT_ID: TENANT_ID,
    },
    clock: () => new Date('2029-12-31T20:00:00Z'),
    assertTransportImpl: () => true,
    limiterImpl: allowLimiter,
    findUserImpl: async options => { calls.push(options); return privateUser; },
  });
  const res = responseRecorder();
  await handler(request({ token: opaqueToken }, { url: '/api/auth/private-link-session' }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['x-municontrol-contract'], 'municontrol-private-link-session-v1');
  assert.deepEqual(calls, [{ where: { id: privateUser.id }, include: { tenant: true } }]);
  assert.equal(res.payload.user.id, privateUser.id);
  assert.equal(res.payload.user.email, privateUser.email);
  assert.equal(res.payload.user.role, 'INTENDENTE');
  const claims = jwt.verify(res.payload.token, JWT_SECRET, { clockTimestamp: Date.parse('2029-12-31T20:00:00Z') / 1000 });
  assert.equal(claims.authMode, 'private-intendente-link');
  assert.ok(claims.exp <= Date.parse(expiresAt) / 1000);
});

test('opaque private link rejects wrong, expired, misbound and rate-limited access without login counters', async () => {
  const opaqueToken = 'B'.repeat(48);
  const sha = crypto.createHash('sha256').update(opaqueToken).digest('hex');
  const environment = {
    JWT_SECRET,
    GRH_TENANT_ID: TENANT_ID,
    PRIVATE_INTENDENTE_LINK_TOKEN_SHA256: sha,
    PRIVATE_INTENDENTE_LINK_EXPIRES_AT: '2030-01-01T00:00:00Z',
    PRIVATE_INTENDENTE_USER_ID: 'private-intendente-id',
    PRIVATE_INTENDENTE_TENANT_ID: TENANT_ID,
  };
  let reads = 0;
  const options = {
    environment,
    clock: () => new Date('2029-12-31T20:00:00Z'),
    assertTransportImpl: () => true,
    limiterImpl: allowLimiter,
    findUserImpl: async () => { reads += 1; return publishedUser({ id: 'private-intendente-id', email: 'authority@example.test' }); },
  };

  const wrong = responseRecorder();
  await createPrivateLinkSessionHandler(options)(request({ token: 'C'.repeat(48) }), wrong);
  assert.equal(wrong.statusCode, 401);
  assert.equal(reads, 0);

  const expired = responseRecorder();
  await createPrivateLinkSessionHandler({ ...options, clock: () => new Date('2030-01-02T00:00:00Z') })(request({ token: opaqueToken }), expired);
  assert.equal(expired.statusCode, 503);
  assert.equal(reads, 0);

  const limited = responseRecorder();
  await createPrivateLinkSessionHandler({
    ...options,
    limiterImpl: { consume: () => ({ allowed: false, retryAfterSeconds: 60 }) },
  })(request({ token: opaqueToken }), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(reads, 0);

  const source = fs.readFileSync(path.resolve('api/auth/private-link-session.js'), 'utf8');
  assert.doesNotMatch(source, /loginCount|lastLogin|prisma\.user\.update/);
});

test('route and release contracts own both one-click exchange endpoints exactly', () => {
  assert.equal(routePolicy.ROUTE_POLICY_VERSION, '2026-08-13.10');
  assert.deepEqual(routePolicy.SESSION_EXCHANGE_ROUTES.map(route => [route.method, route.path, route.mode]), [
    ['POST', '/auth/evaluation-session', 'published-profile'],
    ['POST', '/auth/private-link-session', 'opaque-link'],
  ]);
  assert.equal(routePolicy.resolveSessionExchangeRoute(
    routePolicy.RUNTIMES.SERVERLESS,
    'POST',
    '/api/auth/evaluation-session',
  )?.id, 'serverless.auth.evaluation-session.exchange');
  assert.equal(routePolicy.resolveSessionExchangeRoute(
    routePolicy.RUNTIMES.SERVERLESS,
    'GET',
    '/api/auth/evaluation-session',
  ), null);
  assert.equal(Object.hasOwn(releaseTruthContract.API_CONTRACTS, '/api/auth/evaluation-session'), false);
  assert.equal(Object.hasOwn(releaseTruthContract.API_CONTRACTS, '/api/auth/private-link-session'), false);
  assert.equal(releaseTruthContract.SESSION_EXCHANGE_CONTRACTS['/api/auth/evaluation-session'], 'municontrol-evaluation-session-v1');
  assert.equal(releaseTruthContract.SESSION_EXCHANGE_CONTRACTS['/api/auth/private-link-session'], 'municontrol-private-link-session-v1');
});
