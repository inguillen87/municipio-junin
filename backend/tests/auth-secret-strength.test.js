'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'x';

const prisma = require('../lib/prisma');
const originalFindUnique = prisma.user.findUnique;
let databaseLookups = 0;

prisma.user.findUnique = async () => {
  databaseLookups += 1;
  return {
    id: 'current-user',
    email: 'current@example.test',
    name: 'Current user',
    role: 'SUPER_ADMIN',
    tenantId: null,
    active: true,
    tenant: null,
  };
};

function responseMock() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test('Express authorization rejects a JWT signed with a short configured secret', async t => {
  t.after(async () => {
    prisma.user.findUnique = originalFindUnique;
    await prisma.$disconnect();
  });

  const token = jwt.sign({ id: 'current-user', role: 'SUPER_ADMIN' }, 'x');
  const request = { headers: { authorization: `Bearer ${token}` } };
  const response = responseMock();
  let reached = false;

  const { authenticate } = require('../middleware/authMiddleware');
  await authenticate(request, response, () => { reached = true; });

  assert.equal(reached, false);
  assert.equal(response.statusCode, 503);
  assert.equal(databaseLookups, 0, 'a weak verifier secret must fail before DB identity lookup');
});
