import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'x';

const { hasValidJwtSecret, requireAuth, verifyToken } = await import('../api/lib/auth.js');
const { prisma } = await import('../api/lib/db.js');
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

after(async () => {
  prisma.user.findUnique = originalFindUnique;
  await prisma.$disconnect();
});

function responseMock() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test('serverless authorization rejects a JWT signed with a short configured secret', async () => {
  const token = jwt.sign({ id: 'current-user', role: 'SUPER_ADMIN' }, 'x');
  const request = { headers: { authorization: `Bearer ${token}` } };

  assert.equal(hasValidJwtSecret('x'), false);
  assert.equal(verifyToken(request), null);

  const response = responseMock();
  const user = await requireAuth(request, response);
  assert.equal(user, null);
  assert.equal(response.statusCode, 503);
  assert.equal(databaseLookups, 0, 'an invalid verifier configuration must fail before DB identity lookup');
});
