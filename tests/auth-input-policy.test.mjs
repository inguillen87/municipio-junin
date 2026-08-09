import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import authInputPolicy from '../shared/auth-input-policy.cjs';

const {
  MAX_BCRYPT_PASSWORD_BYTES,
  inspectBootstrapPassword,
  inspectLoginCredentials,
} = authInputPolicy;

function mockResponse() {
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

test('login input is normalized and fails closed outside the bcrypt byte boundary', () => {
  assert.deepEqual(inspectLoginCredentials(undefined), { ok: false, code: 'LOGIN_INPUT_REQUIRED' });
  assert.deepEqual(inspectLoginCredentials({ email: {}, password: [] }), { ok: false, code: 'LOGIN_INPUT_REQUIRED' });

  const valid = inspectLoginCredentials({
    email: '  FUNCIONARIO@EXAMPLE.TEST ',
    password: 'a'.repeat(MAX_BCRYPT_PASSWORD_BYTES),
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.email, 'funcionario@example.test');

  assert.equal(inspectLoginCredentials({
    email: 'funcionario@example.test',
    password: 'a'.repeat(MAX_BCRYPT_PASSWORD_BYTES + 1),
  }).ok, false);
  assert.equal(inspectLoginCredentials({
    email: 'funcionario@example.test',
    password: 'á'.repeat(37),
  }).ok, false, 'the limit is UTF-8 bytes, not JavaScript code units');
});

test('the policy rejects the concrete bcrypt truncation ambiguity', () => {
  const first = `${'a'.repeat(72)}X`;
  const second = `${'a'.repeat(72)}Y`;
  const hash = bcrypt.hashSync(first, 4);
  assert.equal(first === second, false);
  assert.equal(bcrypt.compareSync(second, hash), true, 'bcrypt itself ignores bytes after byte 72');
  assert.equal(inspectLoginCredentials({ email: 'a@example.test', password: first }).ok, false);
  assert.equal(inspectLoginCredentials({ email: 'a@example.test', password: second }).ok, false);
  assert.equal(inspectBootstrapPassword(first).code, 'PASSWORD_EXCEEDS_BCRYPT_LIMIT');
});

test('the Serverless login boundary rejects missing and oversized credentials before DB work', async () => {
  const { default: handler } = await import('../api/auth/login.js');
  for (const body of [undefined, { email: 'a@example.test', password: 'a'.repeat(73) }]) {
    const response = mockResponse();
    await handler({ method: 'POST', headers: {}, socket: {}, body }, response);
    assert.equal(response.statusCode, 400);
    assert.equal(typeof response.payload?.error, 'string');
  }
});

test('the Serverless login never issues a token to a tenantless municipal role', async t => {
  const previousEnvironment = {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  };
  Object.assign(process.env, {
    DATABASE_URL: 'postgresql://local@localhost/municontrol-test',
    JWT_SECRET: 'auth-input-test-secret-with-sufficient-length',
    NODE_ENV: 'development',
  });
  const { prisma } = await import('../api/lib/db.js');
  const originalFindUnique = prisma.user.findUnique;
  const originalUpdate = prisma.user.update;
  let updates = 0;
  let currentRole = 'INTENDENTE';
  let currentTenantId = null;
  prisma.user.findUnique = async () => ({
    id: 'tenantless-executive',
    email: 'executive@example.test',
    name: 'Executive',
    role: currentRole,
    tenantId: currentTenantId,
    tenant: currentTenantId ? { id: currentTenantId, status: 'ACTIVE' } : null,
    active: true,
    passwordHash: bcrypt.hashSync('valid-login-password', 4),
  });
  prisma.user.update = async () => { updates += 1; };
  t.after(() => {
    prisma.user.findUnique = originalFindUnique;
    prisma.user.update = originalUpdate;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const { default: handler } = await import('../api/auth/login.js');
  const response = mockResponse();
  await handler({
    method: 'POST',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    body: { email: 'executive@example.test', password: 'valid-login-password' },
  }, response);
  assert.equal(response.statusCode, 403);
  assert.equal(Object.hasOwn(response.payload || {}, 'token'), false);
  assert.equal(updates, 0, 'a rejected identity must not update login counters');

  currentRole = 'TESORERIA';
  currentTenantId = 'tenant-1';
  const unknownRoleResponse = mockResponse();
  await handler({
    method: 'POST',
    headers: {},
    socket: { remoteAddress: '127.0.0.2' },
    body: { email: 'executive@example.test', password: 'valid-login-password' },
  }, unknownRoleResponse);
  assert.equal(unknownRoleResponse.statusCode, 403);
  assert.equal(Object.hasOwn(unknownRoleResponse.payload || {}, 'token'), false);
  assert.equal(updates, 0);
});

test('bootstrap passwords require 14 characters and never exceed the bcrypt byte limit', () => {
  assert.equal(inspectBootstrapPassword('short').code, 'PASSWORD_TOO_SHORT');
  assert.equal(inspectBootstrapPassword('correct-horse-battery-staple').ok, true);
  assert.equal(inspectBootstrapPassword('ñ'.repeat(36)).ok, true);
  assert.equal(inspectBootstrapPassword('ñ'.repeat(37)).code, 'PASSWORD_EXCEEDS_BCRYPT_LIMIT');
});
