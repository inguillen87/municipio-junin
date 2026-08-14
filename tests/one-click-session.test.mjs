import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import jwt from 'jsonwebtoken';

import { createEvaluationSessionHandler } from '../api/auth/evaluation-session.js';
import { createPrivateLinkSessionHandler } from '../api/auth/private-link-session.js';
import { sessionResponseUser } from '../api/lib/one-click-session.js';
import accessPolicy from '../shared/access-policy.cjs';
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

function prismaFailure(name, code, detail = 'sensitive database detail') {
  const error = new Error(detail);
  error.name = name;
  if (name === 'PrismaClientInitializationError') error.errorCode = code;
  else error.code = code;
  return error;
}

async function captureAuthLogs(run) {
  const originalWarn = console.warn;
  const originalError = console.error;
  const logs = [];
  console.warn = (...args) => logs.push({ level: 'warn', args });
  console.error = (...args) => logs.push({ level: 'error', args });
  try {
    await run();
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
  return logs;
}

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

test('published identity read retries one explicit transient Prisma failure and then returns 200', async () => {
  let reads = 0;
  const delays = [];
  const res = responseRecorder();
  const logs = await captureAuthLogs(async () => {
    await createEvaluationSessionHandler({
      environment: { JWT_SECRET, GRH_TENANT_ID: TENANT_ID },
      assertTransportImpl: () => true,
      limiterImpl: allowLimiter,
      retryDelayImpl: async milliseconds => { delays.push(milliseconds); },
      findUserImpl: async () => {
        reads += 1;
        if (reads === 1) throw prismaFailure('PrismaClientInitializationError', 'P1001');
        return publishedUser();
      },
    })(request({ profileId: 'intendente' }), res);
  });

  assert.equal(res.statusCode, 200);
  assert.equal(reads, 2);
  assert.deepEqual(delays, [100]);
  assert.deepEqual(logs, [{
    level: 'warn',
    args: [
      '[AUTH] Reintentando lectura del perfil de evaluación publicado',
      { name: 'PrismaClientInitializationError', code: 'P1001', attempt: 1 },
    ],
  }]);
  assert.doesNotMatch(JSON.stringify(logs), /sensitive database detail/i);
});

test('published identity read stops after a second transient Prisma failure and returns 503', async () => {
  let reads = 0;
  const delays = [];
  const failures = [
    prismaFailure('PrismaClientKnownRequestError', 'P2024'),
    prismaFailure('PrismaClientInitializationError', 'P1002'),
  ];
  const res = responseRecorder();
  const logs = await captureAuthLogs(async () => {
    await createEvaluationSessionHandler({
      environment: { JWT_SECRET, GRH_TENANT_ID: TENANT_ID },
      assertTransportImpl: () => true,
      limiterImpl: allowLimiter,
      retryDelayImpl: async milliseconds => { delays.push(milliseconds); },
      findUserImpl: async () => { throw failures[reads++]; },
    })(request({ profileId: 'intendente' }), res);
  });

  assert.equal(res.statusCode, 503);
  assert.equal(reads, 2);
  assert.deepEqual(delays, [100]);
  assert.deepEqual(logs.map(entry => [entry.level, entry.args[1]]), [
    ['warn', { name: 'PrismaClientKnownRequestError', code: 'P2024', attempt: 1 }],
    ['error', { name: 'PrismaClientInitializationError', code: 'P1002', attempt: 2 }],
  ]);
  assert.doesNotMatch(JSON.stringify(logs), /sensitive database detail/i);
});

test('published identity read does not retry an unknown failure', async () => {
  let reads = 0;
  const delays = [];
  const res = responseRecorder();
  const logs = await captureAuthLogs(async () => {
    await createEvaluationSessionHandler({
      environment: { JWT_SECRET, GRH_TENANT_ID: TENANT_ID },
      assertTransportImpl: () => true,
      limiterImpl: allowLimiter,
      retryDelayImpl: async milliseconds => { delays.push(milliseconds); },
      findUserImpl: async () => {
        reads += 1;
        throw Object.assign(new Error('private query detail'), { code: 'P1001' });
      },
    })(request({ profileId: 'intendente' }), res);
  });

  assert.equal(res.statusCode, 503);
  assert.equal(reads, 1);
  assert.deepEqual(delays, []);
  assert.deepEqual(logs.map(entry => [entry.level, entry.args[1]]), [
    ['error', { name: 'Error', code: 'P1001', attempt: 1 }],
  ]);
  assert.doesNotMatch(JSON.stringify(logs), /private query detail/i);
});

test('published identity mismatch is denied without retrying the successful read', async () => {
  let reads = 0;
  const delays = [];
  const res = responseRecorder();
  const logs = await captureAuthLogs(async () => {
    await createEvaluationSessionHandler({
      environment: { JWT_SECRET, GRH_TENANT_ID: TENANT_ID },
      assertTransportImpl: () => true,
      limiterImpl: allowLimiter,
      retryDelayImpl: async milliseconds => { delays.push(milliseconds); },
      findUserImpl: async () => {
        reads += 1;
        return publishedUser({ active: false });
      },
    })(request({ profileId: 'intendente' }), res);
  });

  assert.equal(res.statusCode, 403);
  assert.equal(reads, 1);
  assert.deepEqual(delays, []);
  assert.deepEqual(logs, []);
});

test('published auth refresh may expose only the opaque JWT subject while the exchange stays redacted', () => {
  const profile = publishedDemoPolicy.resolvePublishedDemoProfile('intendente');
  const user = publishedUser();

  assert.equal(sessionResponseUser(user, { publishedProfile: profile }).id, '');
  assert.equal(sessionResponseUser(user, {
    publishedProfile: profile,
    exposePublishedSessionId: true,
  }).id, 'published-evaluation:intendente');
  assert.equal(sessionResponseUser(user, {
    publishedProfile: profile,
    exposePublishedSessionId: true,
  }).email, '');
  assert.equal(sessionResponseUser(user, {
    publishedProfile: { ...profile },
    exposePublishedSessionId: true,
  }).id, '');
});

test('the exact six published profiles receive only their role capabilities inside the published ceiling', async () => {
  assert.deepEqual(
    publishedDemoPolicy.PUBLISHED_DEMO_PROFILES.map(profile => profile.profileId),
    ['administrador', 'contador', 'vista-demo', 'inspector', 'intendente', 'usuario-municipal'],
  );
  assert.equal(
    publishedDemoPolicy.PUBLISHED_DEMO_PROFILES.some(profile => profile.role === 'SUPER_ADMIN'),
    false,
  );
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
    const roleAccess = accessPolicy.getSessionAccessForUser({
      role: profile.role,
      tenantId: TENANT_ID,
    });
    const expectedCapabilities = roleAccess.capabilities.filter(capability =>
      publishedDemoPolicy.PUBLISHED_DEMO_CAPABILITIES.includes(capability)
    );
    assert.deepEqual(access, expectedCapabilities, profile.profileId);
    const roleHomeProfile = roleAccess.homeProfile;
    const expectedPriorityCapabilities = roleHomeProfile.priorityCapabilities.filter(capability =>
      expectedCapabilities.includes(capability)
    );
    assert.deepEqual(res.payload.user.homeProfile, {
      ...roleHomeProfile,
      priorityCapabilities: expectedPriorityCapabilities,
    }, profile.profileId);
    for (const denied of ['navigation.audit', 'navigation.export']) {
      assert.equal(access.includes(denied), false, `${profile.profileId}:${denied}`);
    }
    assert.equal(access.includes('navigation.import'), profile.role === 'TENANT_ADMIN',
      `${profile.profileId}:navigation.import`);
    if (['TENANT_USER', 'INSPECTOR', 'DEMO'].includes(profile.role)) {
      assert.deepEqual(access, [
        'session.read',
        'navigation.workspace',
        'navigation.territory',
        'navigation.help',
      ], profile.profileId);
      for (const denied of [
        'navigation.dashboard',
        'navigation.hacienda',
        'navigation.grh-executive',
        'navigation.rrhh',
        'navigation.ai-assistant',
      ]) {
        assert.equal(access.includes(denied), false, `${profile.profileId}:${denied}`);
      }
    } else {
      for (const aggregate of [
        'navigation.dashboard',
        'navigation.hacienda',
        'navigation.grh-executive',
        'navigation.organization-analytics',
      ]) {
        assert.equal(access.includes(aggregate), true, `${profile.profileId}:${aggregate}`);
      }
    }
  }
});

test('published Administrador has a valid home profile within the read-only capability ceiling', () => {
  const profile = publishedDemoPolicy.resolvePublishedDemoProfile('administrador');
  const responseUser = sessionResponseUser(publishedUser({
    id: 'published-administrador-id',
    email: profile.email,
    role: profile.role,
  }), { publishedProfile: profile });

  assert.deepEqual(responseUser.homeProfile.priorityCapabilities, [
    'navigation.workspace',
    'navigation.import',
    'navigation.data-quality',
  ]);
  assert.equal(responseUser.homeProfile.priorityCapabilities.every(capability =>
    responseUser.capabilities.includes(capability)
  ), true);
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
  assert.equal(routePolicy.ROUTE_POLICY_VERSION, '2026-08-14.18');
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
