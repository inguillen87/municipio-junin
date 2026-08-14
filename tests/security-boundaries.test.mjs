import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import test, { after } from 'node:test';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-only-jwt-secret-with-sufficient-length';
process.env.CRON_SECRET = 'test-only-cron-secret-with-sufficient-length';
process.env.WHATSAPP_APP_SECRET = 'test-only-whatsapp-app-secret';
process.env.WHATSAPP_PHONE_ID = 'phone-id-test';
process.env.GRH_TENANT_ID = 'tenant-junin-test';
process.env.ALLOW_LOCAL_GRH_ARTIFACTS = 'true';
delete process.env.DATABASE_URL;
delete process.env.ENABLE_WHATSAPP_DIAGNOSTICS;

const { prisma } = await import('../api/lib/db.js');
const authoritativeUsers = new Map();
let authLookupCalls = 0;
const authLookupCallsById = new Map();
const failingAuthUserIds = new Set();
const originalFindUnique = prisma.user.findUnique;

prisma.user.findUnique = async ({ where }) => {
  authLookupCalls += 1;
  const lookupKey = where.id || `email:${where.email}`;
  authLookupCallsById.set(lookupKey, (authLookupCallsById.get(lookupKey) || 0) + 1);
  if (where.id && failingAuthUserIds.has(where.id)) throw new Error('simulated auth database outage');
  if (where.id) return authoritativeUsers.get(where.id) || null;
  return [...authoritativeUsers.values()].find(user => user.email === where.email) || null;
};

after(async () => {
  prisma.user.findUnique = originalFindUnique;
  await prisma.$disconnect();
});

function setAuthoritativeUser(id, {
  role = 'TENANT_USER',
  tenantId = 'tenant-junin-test',
  tenantSlug = tenantId,
  email = `${id}@example.test`,
  active = true,
  tenantStatus = 'ACTIVE',
  trialEndsAt = tenantStatus === 'TRIAL' ? '2099-01-01T00:00:00.000Z' : null,
} = {}) {
  const tenant = tenantId ? {
    id: tenantId,
    slug: tenantSlug,
    name: 'Municipio de prueba',
    shortName: 'Prueba',
    status: tenantStatus,
    trialEndsAt,
  } : null;
  authoritativeUsers.set(id, {
    id,
    email,
    name: `Usuario ${id}`,
    role,
    tenantId,
    active,
    tenant,
  });
}

function lookupCount(id) {
  return authLookupCallsById.get(id) || 0;
}

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    payload: undefined,
    redirectTarget: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    send(payload) { this.payload = payload; return this; },
    end() { return this; },
    redirect(code, target) {
      this.statusCode = typeof code === 'number' ? code : 302;
      this.redirectTarget = typeof code === 'number' ? target : code;
      return this;
    },
  };
}

test('critical data and action endpoints reject anonymous requests', async () => {
  const cases = [
    ['../api/export-data.js', { method: 'GET', query: {}, headers: {} }],
    ['../api/audit.js', { method: 'GET', query: { action: 'overview' }, headers: {} }],
    ['../api/intelligence.js', { method: 'GET', query: { analysis: 'executive_summary' }, headers: {} }],
    ['../api/upload-handler.js', { method: 'POST', query: {}, headers: {} }],
    ['../api/google-sheets.js', { method: 'POST', body: {}, query: {}, headers: {} }],
    ['../api/external-connector.js', { method: 'POST', body: {}, query: {}, headers: {} }],
    ['../api/email-report.js', { method: 'POST', body: {}, query: {}, headers: {} }],
    ['../api/whatsapp-alert.js', { method: 'POST', body: {}, query: {}, headers: {} }],
    ['../api/whatsapp-test.js', { method: 'POST', body: {}, query: {}, headers: {} }],
    ['../api/grh-data.js', { method: 'GET', query: { artifact: 'semantic' }, headers: {} }],
    ['../api/auth/me.js', { method: 'GET', query: {}, headers: {} }],
  ];

  for (const [modulePath, request] of cases) {
    const { default: handler } = await import(modulePath);
    const response = mockResponse();
    await handler(request, response);
    assert.equal(response.statusCode, 401, `${modulePath} must reject anonymous access`);
    if (modulePath === '../api/grh-data.js') {
      assert.equal(response.headers['x-municontrol-contract'], 'grh-raw-retired-v1');
    }
    if (modulePath === '../api/auth/me.js') {
      assert.equal(response.headers['x-municontrol-contract'], 'municontrol-auth-me-v1');
    }
  }
});

test('retired raw GRH contract enforces capability and dataset tenant without reading an artifact', async () => {
  const { default: handler } = await import('../api/grh-data.js');
  const tokenFor = (id, tenantId) => jwt.sign(
    { id, role: 'INTENDENTE', tenantId },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );
  setAuthoritativeUser('user-test', { role: 'INTENDENTE', tenantId: 'tenant-junin-test' });

  const allowed = mockResponse();
  await handler({
    method: 'GET',
    query: { artifact: 'semantic' },
    url: '/api/grh-data?artifact=semantic',
    headers: { authorization: `Bearer ${tokenFor('user-test', 'tenant-junin-test')}` },
  }, allowed);
  assert.equal(allowed.statusCode, 410);
  assert.equal(allowed.payload.code, 'GRH_RAW_CONTRACT_RETIRED');
  assert.equal(allowed.headers['cache-control'], 'no-store, private, max-age=0');
  assert.equal(allowed.headers['x-content-type-options'], 'nosniff');
  assert.equal(allowed.headers['x-municontrol-contract'], 'grh-raw-retired-v1');

  const staleForeignClaim = mockResponse();
  await handler({
    method: 'GET',
    query: { artifact: 'profile' },
    url: '/api/grh-data?artifact=profile',
    headers: { authorization: `Bearer ${tokenFor('user-test', 'tenant-foreign')}` },
  }, staleForeignClaim);
  assert.equal(staleForeignClaim.statusCode, 410, 'the current DB tenant must override a stale JWT tenant claim');
  assert.equal(staleForeignClaim.payload.code, 'GRH_RAW_CONTRACT_RETIRED');

  setAuthoritativeUser('foreign-user', { role: 'INTENDENTE', tenantId: 'tenant-foreign' });
  const actualForeign = mockResponse();
  await handler({
    method: 'GET',
    query: { artifact: 'anything' },
    url: '/api/grh-data?artifact=anything',
    headers: { authorization: `Bearer ${tokenFor('foreign-user', 'tenant-junin-test')}` },
  }, actualForeign);
  assert.equal(actualForeign.statusCode, 403, 'a forged/stale allowed tenant claim cannot override the current DB tenant');

  setAuthoritativeUser('raw-low-role', { role: 'TENANT_USER', tenantId: 'tenant-junin-test' });
  const lowRole = mockResponse();
  await handler({
    method: 'GET',
    query: {},
    url: '/api/grh-data',
    headers: { authorization: `Bearer ${tokenFor('raw-low-role', 'tenant-junin-test')}` },
  }, lowRole);
  assert.equal(lowRole.statusCode, 403);
  assert.equal(lowRole.payload.code, 'ROUTE_PERMISSION_DENIED');

  const wrongMethod = mockResponse();
  await handler({ method: 'POST', query: {}, url: '/api/grh-data', headers: {} }, wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.payload.code, 'METHOD_NOT_ALLOWED');
  assert.equal(wrongMethod.headers.allow, 'GET');
});

test('dataset tenant binding never gives SUPER_ADMIN ambient municipal data access', async () => {
  const { requireDatasetTenant } = await import('../api/lib/auth.js');

  const foreignResponse = mockResponse();
  assert.equal(requireDatasetTenant(foreignResponse, {
    id: 'platform-admin',
    role: 'SUPER_ADMIN',
    tenantId: 'tenant-other-municipality',
  }, 'GRH_TENANT_ID'), false);
  assert.equal(foreignResponse.statusCode, 403);

  const boundResponse = mockResponse();
  assert.equal(requireDatasetTenant(boundResponse, {
    id: 'junin-admin',
    role: 'SUPER_ADMIN',
    tenantId: process.env.GRH_TENANT_ID,
  }, 'GRH_TENANT_ID'), true);
  assert.equal(boundResponse.statusCode, 200);
});

test('GRH printable report protects small groups without publishing sensitive annual counts', async () => {
  const { default: handler } = await import('../api/pdf-report.js');
  setAuthoritativeUser('pdf-report-user', { role: 'INTENDENTE', tenantId: 'tenant-junin-test' });
  const token = jwt.sign(
    { id: 'pdf-report-user', role: 'INTENDENTE', tenantId: 'tenant-junin-test' },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );
  const response = mockResponse();
  await handler({
    method: 'GET',
    query: { type: 'rrhh' },
    headers: { authorization: `Bearer ${token}` },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.match(response.payload, /Participantes · 2026-07/);
  assert.match(response.payload, /Grupos con menos de 10 personas protegidos/);
  assert.match(response.payload, /Comparación entre fuentes/);
  assert.doesNotMatch(response.payload, /\bk\s*=\s*10\b|Conciliación cross-source|PII publicada/i);
  assert.match(response.payload, /Sólo diagnóstica · no ejecutiva/);
  assert.doesNotMatch(response.payload, /Ausencias\s*·\s*\d|Licencias\s*·\s*\d|Movimientos\s*·\s*\d/i);
  assert.match(response.payload, /Neto de control · ARS/);
  assert.match(response.payload, /pesos argentinos \(ARS\)[\s\S]{0,120}dump original no declara/i);
  assert.doesNotMatch(response.payload, /Neto observado|\$/);
});

test('DEMO tokens cannot mutate employees or run destructive imports', async () => {
  setAuthoritativeUser('demo-test', { role: 'DEMO', tenantId: 'tenant-junin-test' });
  const token = jwt.sign(
    { id: 'demo-test', role: 'DEMO', tenantId: 'tenant-junin-test' },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );
  for (const [modulePath, request] of [
    ['../api/data/empleados.js', { method: 'POST', query: {}, body: { nombre: 'x' } }],
    ['../api/data/import.js', { method: 'POST', query: {}, body: { tabla: 'empleados', rows: [], truncate: true } }],
  ]) {
    const { default: handler } = await import(modulePath);
    const response = mockResponse();
    request.headers = { authorization: `Bearer ${token}` };
    await handler(request, response);
    assert.equal(response.statusCode, 403, `${modulePath} must reject DEMO mutation`);
  }
});

test('/api/auth/me returns the current DB role and tenant with one lookup', async () => {
  const { default: handler } = await import('../api/auth/me.js');
  setAuthoritativeUser('me-current-user', { role: 'INTENDENTE', tenantId: 'tenant-current' });
  const token = jwt.sign(
    { id: 'me-current-user', role: 'SUPER_ADMIN', tenantId: 'tenant-stale' },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  const response = mockResponse();
  const before = lookupCount('me-current-user');
  await handler({
    method: 'GET',
    query: {},
    headers: { authorization: `Bearer ${token}` },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.user.role, 'INTENDENTE');
  assert.equal(response.payload.user.tenantId, 'tenant-current');
  assert.match(response.payload.user.accessPolicyVersion, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  assert.equal(response.payload.user.capabilities.includes('navigation.grh-executive'), true);
  assert.equal(response.payload.user.capabilities.includes('navigation.import'), false);
  assert.equal(lookupCount('me-current-user') - before, 1);
});

test('/api/auth/me gives a published evaluation the opaque non-PII identity required by governed surfaces', async () => {
  const { default: handler } = await import('../api/auth/me.js');
  const profile = (await import('../shared/published-demo-policy.cjs')).default
    .resolvePublishedDemoProfile('intendente');
  setAuthoritativeUser('published-intendente-db', {
    role: profile.role,
    tenantId: process.env.GRH_TENANT_ID,
    tenantSlug: profile.tenantSlug,
    email: profile.email,
  });
  const token = jwt.sign({
    id: 'published-evaluation:intendente',
    profileId: profile.profileId,
    role: profile.role,
    tenantId: process.env.GRH_TENANT_ID,
    authMode: 'published-evaluation',
  }, process.env.JWT_SECRET, { expiresIn: '8h' });
  const response = mockResponse();

  await handler({
    method: 'GET',
    url: '/api/auth/me',
    query: {},
    headers: { authorization: `Bearer ${token}` },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.user.id, 'published-evaluation:intendente');
  assert.equal(response.payload.user.email, '');
  assert.equal(response.payload.user.role, 'INTENDENTE');
  assert.equal(response.payload.user.capabilities.includes('navigation.grh-executive'), true);
  assert.equal(response.payload.user.capabilities.includes('navigation.organization-analytics'), true);
});

test('/api/auth/me returns the published Administrador home profile projected to its read-only ceiling', async () => {
  const { default: handler } = await import('../api/auth/me.js');
  const profile = (await import('../shared/published-demo-policy.cjs')).default
    .resolvePublishedDemoProfile('administrador');
  setAuthoritativeUser('published-administrador-db', {
    role: profile.role,
    tenantId: process.env.GRH_TENANT_ID,
    tenantSlug: profile.tenantSlug,
    email: profile.email,
  });
  const token = jwt.sign({
    id: 'published-evaluation:administrador',
    profileId: profile.profileId,
    role: profile.role,
    tenantId: process.env.GRH_TENANT_ID,
    authMode: 'published-evaluation',
  }, process.env.JWT_SECRET, { expiresIn: '8h' });
  const response = mockResponse();

  await handler({
    method: 'GET',
    url: '/api/auth/me',
    query: {},
    headers: { authorization: `Bearer ${token}` },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload.user.homeProfile.priorityCapabilities, [
    'navigation.workspace',
    'navigation.data-quality',
  ]);
  assert.equal(response.payload.user.homeProfile.priorityCapabilities.every(capability =>
    response.payload.user.capabilities.includes(capability)
  ), true);
  assert.equal(response.payload.user.capabilities.includes('navigation.import'), false);
  assert.equal(response.payload.user.capabilities.includes('navigation.audit'), false);
});

test('/api/auth/me rejects an unknown DB role before issuing capabilities', async () => {
  const { default: handler } = await import('../api/auth/me.js');
  setAuthoritativeUser('me-unknown-role', { role: 'TESORERIA', tenantId: 'tenant-current' });
  const token = jwt.sign(
    { id: 'me-unknown-role', role: 'SUPER_ADMIN', tenantId: 'tenant-stale' },
    process.env.JWT_SECRET,
    { expiresIn: '8h' },
  );
  const response = mockResponse();
  await handler({
    method: 'GET',
    query: {},
    headers: { authorization: `Bearer ${token}` },
  }, response);

  assert.equal(response.statusCode, 403);
  assert.equal(response.payload.error, 'Rol no habilitado');
  assert.equal(response.payload.user, undefined);
});

test('/api/auth/me fails closed for expired or unbounded TRIAL tenants', async () => {
  const { default: handler } = await import('../api/auth/me.js');
  const tokenFor = id => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '5m' });

  for (const [id, trialEndsAt] of [
    ['trial-without-expiry', null],
    ['trial-expired', '2026-08-08T00:00:00.000Z'],
  ]) {
    setAuthoritativeUser(id, { role: 'INTENDENTE', tenantStatus: 'TRIAL', trialEndsAt });
    const response = mockResponse();
    await handler({
      method: 'GET',
      query: {},
      headers: { authorization: `Bearer ${tokenFor(id)}` },
    }, response);
    assert.equal(response.statusCode, 403);
    assert.equal(response.payload.error, 'Municipio no habilitado');
  }

  setAuthoritativeUser('trial-current', {
    role: 'INTENDENTE',
    tenantStatus: 'TRIAL',
    trialEndsAt: '2099-01-01T00:00:00.000Z',
  });
  const current = mockResponse();
  await handler({
    method: 'GET',
    query: {},
    headers: { authorization: `Bearer ${tokenFor('trial-current')}` },
  }, current);
  assert.equal(current.statusCode, 200);
});

test('stale privileged JWTs are denied after DB downgrade, deactivation, or tenant suspension', async () => {
  const { default: handler } = await import('../api/whatsapp-test.js');
  const token = jwt.sign(
    { id: 'revocable-admin', role: 'SUPER_ADMIN', tenantId: 'tenant-old-claim' },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  const request = () => ({
    method: 'POST',
    body: {},
    query: {},
    headers: { authorization: `Bearer ${token}` },
  });

  setAuthoritativeUser('revocable-admin', { role: 'TENANT_USER', tenantId: 'tenant-junin-test' });
  const downgraded = mockResponse();
  await handler(request(), downgraded);
  assert.equal(downgraded.statusCode, 403);

  setAuthoritativeUser('revocable-admin', { role: 'SUPER_ADMIN', tenantId: 'tenant-junin-test', active: false });
  const deactivated = mockResponse();
  await handler(request(), deactivated);
  assert.equal(deactivated.statusCode, 401);

  setAuthoritativeUser('revocable-admin', { role: 'SUPER_ADMIN', tenantId: 'tenant-junin-test', tenantStatus: 'SUSPENDED' });
  const suspended = mockResponse();
  await handler(request(), suspended);
  assert.equal(suspended.statusCode, 403);

  setAuthoritativeUser('revocable-admin', { role: 'SUPER_ADMIN', tenantId: 'tenant-junin-test', tenantStatus: 'TRIAL' });
  const currentAndEnabled = mockResponse();
  await handler(request(), currentAndEnabled);
  assert.equal(currentAndEnabled.statusCode, 404, 'a current privileged user in an enabled TRIAL tenant reaches the protected handler');
});

test('authoritative auth uses current claims once per request, fails closed on DB outage, and preserves CRON', async () => {
  const { requireAuth, requireRole, requireRoleOrInternal } = await import('../api/lib/auth.js');
  setAuthoritativeUser('current-user', { role: 'INTENDENTE', tenantId: 'tenant-current' });
  const token = jwt.sign(
    { id: 'current-user', role: 'SUPER_ADMIN', tenantId: 'tenant-stale' },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  const request = { headers: { authorization: `Bearer ${token}` } };
  const response = mockResponse();
  const before = lookupCount('current-user');
  const current = await requireAuth(request, response);
  const privileged = await requireRole(request, response, ['SUPER_ADMIN']);
  assert.equal(current.role, 'INTENDENTE');
  assert.equal(current.tenantId, 'tenant-current');
  assert.equal(privileged, null);
  assert.equal(response.statusCode, 403);
  assert.equal(lookupCount('current-user') - before, 1, 'nested auth helpers must share one DB lookup per request');

  failingAuthUserIds.add('current-user');
  try {
    const unavailable = mockResponse();
    const unavailableUser = await requireAuth({ headers: { authorization: `Bearer ${token}` } }, unavailable);
    assert.equal(unavailableUser, null);
    assert.equal(unavailable.statusCode, 503);

    const internalBefore = authLookupCalls;
    const internalResponse = mockResponse();
    const internal = await requireRoleOrInternal({
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }, internalResponse, ['SUPER_ADMIN']);
    assert.equal(internal.role, 'SYSTEM');
    assert.equal(internal.authMethod, 'CRON_SECRET');
    assert.equal(authLookupCalls, internalBefore, 'trusted CRON requests must not query a browser user');
  } finally {
    failingAuthUserIds.delete('current-user');
  }
});

test('retired claim surface never exposes public tracking without authentication', async () => {
  const { default: handler } = await import('../api/data/reclamos.js');
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const response = mockResponse();
    await handler({
      method,
      query: { public: '1', numero: 'R-ABCDEF123456', id: 'foreign-id' },
      body: { id: 'foreign-id', estado: 'Cerrado' },
      headers: {},
    }, response);
    assert.equal(response.statusCode, 401);
  }
});

test('legacy email magic links cannot mint a browser session', async () => {
  const { default: handler } = await import('../api/auth-email.js');
  const response = mockResponse();
  await handler({ method: 'GET', query: { token: 'forged' }, headers: {} }, response);
  assert.equal(response.statusCode, 302);
  assert.equal(response.redirectTarget, '/login.html?reason=magic_link_retired');
});

test('Meta webhook accepts only an exact HMAC of the raw body', async () => {
  const { parseVerifiedWebhook, WebhookAuthError } = await import('../api/lib/whatsapp-webhook-auth.js');
  const raw = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [] }));
  const signature = crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(raw).digest('hex');
  const validRequest = Readable.from([raw]);
  validRequest.headers = { 'x-hub-signature-256': `sha256=${signature}` };
  const parsed = await parseVerifiedWebhook(validRequest);
  assert.equal(parsed.object, 'whatsapp_business_account');

  const invalidRequest = Readable.from([raw]);
  invalidRequest.headers = { 'x-hub-signature-256': `sha256=${'0'.repeat(64)}` };
  await assert.rejects(() => parseVerifiedWebhook(invalidRequest), WebhookAuthError);
});

test('voice webhook rejects forged events before any outbound send', async () => {
  const { default: handler } = await import('../api/whatsapp-voice.js');
  const raw = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [] }));
  const request = Readable.from([raw]);
  request.method = 'POST';
  request.query = {};
  request.headers = { 'x-hub-signature-256': `sha256=${'0'.repeat(64)}` };
  const response = mockResponse();
  let outboundCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { outboundCalls += 1; throw new Error('must not send'); };
  try {
    await handler(request, response);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(response.statusCode, 401);
  assert.equal(outboundCalls, 0);
});

test('internal bearer authorization fails closed when the configured secret is absent', async () => {
  const { isTrustedInternalRequest } = await import('../api/lib/auth.js');
  const original = process.env.TEST_INTERNAL_SECRET;
  delete process.env.TEST_INTERNAL_SECRET;
  assert.equal(
    isTrustedInternalRequest({ headers: { authorization: 'Bearer undefined' } }, 'TEST_INTERNAL_SECRET'),
    false
  );
  if (original) process.env.TEST_INTERNAL_SECRET = original;
});

test('internal bearer requires an independent 32-character secret without weakening authoritative JWT tenant auth', async t => {
  const { isTrustedInternalRequest, requireRoleOrInternal } = await import('../api/lib/auth.js');
  const secretName = 'TEST_INTERNAL_SECRET';
  const original = process.env[secretName];
  const requestFor = secret => ({ headers: { authorization: `Bearer ${secret}` } });
  t.after(() => {
    if (original === undefined) delete process.env[secretName];
    else process.env[secretName] = original;
    authoritativeUsers.delete('internal-boundary-user');
  });

  for (const weakSecret of ['x', 'x'.repeat(31)]) {
    process.env[secretName] = weakSecret;
    assert.equal(isTrustedInternalRequest(requestFor(weakSecret), secretName), false);
  }

  const exactMinimum = 'i'.repeat(32);
  process.env[secretName] = exactMinimum;
  assert.equal(isTrustedInternalRequest(requestFor(exactMinimum), secretName), true);
  assert.equal(
    isTrustedInternalRequest(requestFor(exactMinimum)),
    false,
    'a strong bearer is valid only for its configured internal secret name'
  );

  process.env[secretName] = process.env.JWT_SECRET;
  assert.equal(
    isTrustedInternalRequest(requestFor(process.env.JWT_SECRET), secretName),
    false,
    'an internal secret must not reuse the JWT signing secret'
  );

  setAuthoritativeUser('internal-boundary-user', {
    role: 'INTENDENTE',
    tenantId: 'tenant-current-boundary',
  });
  const jwtToken = jwt.sign(
    { id: 'internal-boundary-user', role: 'SUPER_ADMIN', tenantId: 'tenant-stale-boundary' },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );
  const before = lookupCount('internal-boundary-user');
  const response = mockResponse();
  const user = await requireRoleOrInternal(
    requestFor(jwtToken),
    response,
    ['INTENDENTE'],
    secretName
  );
  assert.equal(user.role, 'INTENDENTE');
  assert.equal(user.tenantId, 'tenant-current-boundary');
  assert.equal(user.authMethod, 'jwt-db');
  assert.equal(lookupCount('internal-boundary-user') - before, 1);
});
