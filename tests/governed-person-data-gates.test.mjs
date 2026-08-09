import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'governed-surface-test-secret-at-least-32-chars';
process.env.LEGACY_ANALYTICS_TENANT_ID = 'tenant-governed-test';

const { prisma } = await import('../api/lib/db.js');
const originalFindUnique = prisma.user.findUnique;
const users = new Map();
prisma.user.findUnique = async ({ where }) => users.get(where.id) || null;

after(async () => {
  prisma.user.findUnique = originalFindUnique;
  await prisma.$disconnect();
});

function authorize(id, role) {
  users.set(id, {
    id,
    email: `${id}@example.test`,
    name: id,
    role,
    tenantId: 'tenant-governed-test',
    active: true,
    tenant: {
      id: 'tenant-governed-test',
      slug: 'governed-test',
      name: 'Municipio test',
      shortName: 'Test',
      status: 'ACTIVE',
    },
  });
  return jwt.sign({ id, role, tenantId: 'tenant-governed-test' }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function responseRecorder() {
  return {
    statusCode: 200,
    payload: undefined,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    send(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

const retiredCases = [
  ['../api/data/empleados.js', 'TENANT_ADMIN', { method: 'GET', query: {} }, 'EMPLOYEE_PERSON_ACCESS_NOT_GOVERNED'],
  ['../api/data/pagos.js', 'CONTADOR', { method: 'GET', query: {} }, 'PAYMENT_WORKFLOW_NOT_GOVERNED'],
  ['../api/data/reclamos.js', 'INSPECTOR', { method: 'GET', query: {} }, 'CLAIM_ASSIGNMENT_SCOPE_NOT_GOVERNED'],
  ['../api/data/import.js', 'TENANT_ADMIN', { method: 'POST', query: {}, body: { tabla: 'empleados', rows: [{ legajo: '1' }], truncate: true } }, 'DIRECT_CORE_IMPORT_RETIRED'],
  ['../api/export-data.js', 'INTENDENTE', { method: 'GET', query: { format: 'json' } }, 'RAW_DATA_EXPORT_NOT_GOVERNED'],
  ['../api/data/dashboard.js', 'INTENDENTE', { method: 'GET', query: {} }, 'LEGACY_CROSS_DOMAIN_DASHBOARD_RETIRED'],
  ['../api/email-report.js', 'INTENDENTE', { method: 'POST', query: {}, body: { period: 'weekly' } }, 'EMAIL_REPORT_AUDIT_NOT_GOVERNED'],
];

test('person-level, payment, direct-core-import, and raw-export surfaces fail closed until scoped RBAC exists', async () => {
  for (const [modulePath, role, request, code] of retiredCases) {
    const id = `${role.toLowerCase()}-${code.toLowerCase()}`;
    const token = authorize(id, role);
    const { default: handler } = await import(modulePath);
    const response = responseRecorder();
    request.headers = { authorization: `Bearer ${token}` };
    await handler(request, response);
    assert.equal(response.statusCode, 410, modulePath);
    assert.equal(response.payload?.code, code, modulePath);
  }
});

test('retired sensitive surfaces still authenticate before disclosing lifecycle state', async () => {
  for (const [modulePath, , request] of retiredCases) {
    const { default: handler } = await import(modulePath);
    const response = responseRecorder();
    await handler({ ...request, headers: {} }, response);
    assert.equal(response.statusCode, 401, modulePath);
  }
});
