import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jwtSecret = 'audit-contract-test-secret-with-sufficient-length';
process.env.JWT_SECRET = jwtSecret;
process.env.LEGACY_ANALYTICS_TENANT_ID = 'tenant-junin-test';
delete process.env.DATABASE_URL;

const { prisma } = await import('../api/lib/db.js');
const originalFindUnique = prisma.user.findUnique;
prisma.user.findUnique = async ({ where }) => ({
  id: where.id,
  email: 'audit-admin@example.test',
  name: 'Audit Admin',
  role: 'TENANT_ADMIN',
  tenantId: 'tenant-junin-test',
  active: true,
  tenant: {
    id: 'tenant-junin-test',
    slug: 'tenant-junin-test',
    name: 'Municipio de prueba',
    shortName: 'Prueba',
    status: 'ACTIVE',
  },
});

after(async () => {
  prisma.user.findUnique = originalFindUnique;
  await prisma.$disconnect();
});

function response() {
  return {
    statusCode: 200,
    payload: undefined,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function authorization(userId) {
  const token = jwt.sign(
    { id: userId, role: 'TENANT_ADMIN', tenantId: 'tenant-junin-test' },
    jwtSecret,
    { expiresIn: '5m' },
  );
  return { authorization: `Bearer ${token}` };
}

test('legacy connection reads and dataset deletion are authenticated 410 boundaries', async () => {
  const { default: handler } = await import('../api/audit.js');
  const requests = [
    { method: 'GET', query: { action: 'connections' }, headers: authorization('connections-user') },
    { method: 'DELETE', query: { action: 'delete-dataset', id: '42' }, headers: authorization('delete-user') },
  ];

  for (const request of requests) {
    const res = response();
    await handler(request, res);
    assert.equal(res.statusCode, 410);
    assert.equal(res.payload.success, false);
    assert.equal(res.payload.code, 'LEGACY_CAPABILITY_RETIRED');
    assert.equal(res.payload.capability, request.query.action);
    assert.match(res.payload.error, /contrato auditable/i);
  }
});

test('retired audit API uses only legacy DDL columns while the UI uses the governed GRH catalog', () => {
  const source = readFileSync(path.join(root, 'api', 'audit.js'), 'utf8');
  const migration = readFileSync(path.join(root, 'migrations', '001_data_intelligence.sql'), 'utf8');
  const ui = readFileSync(path.join(root, 'auditoria.html'), 'utf8');

  assert.match(migration, /CREATE TABLE IF NOT EXISTS datasets[\s\S]*?filename[\s\S]*?row_count[\s\S]*?created_at/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS intelligence_reports[\s\S]*?type[\s\S]*?created_at/);
  assert.match(source, /SELECT id, module, source_type, row_count, period, processed, created_at[\s\S]*FROM datasets/);
  assert.match(source, /SELECT id, type, period, alert_level, notified, created_at[\s\S]*FROM intelligence_reports/);
  assert.match(source, /SELECT 'upload' as type, COALESCE\(module, 'dataset'\) as description, created_at FROM datasets/);
  assert.match(source, /SELECT 'report' as type, type as description, created_at FROM intelligence_reports/);
  assert.doesNotMatch(source, /SELECT \* FROM (?:datasets|intelligence_reports)/);
  assert.doesNotMatch(source, /blob_url|uploaded_by|ai_summary/);
  assert.doesNotMatch(source, /SELECT\s+id,\s*name,\s*type,\s*host,\s*port,\s*database/i);
  assert.doesNotMatch(source, /DELETE\s+FROM\s+(?:datasets|data_points)/i);
  assert.doesNotMatch(ui, /\/api\/audit|action=delete-dataset/);
  assert.match(ui, /src="js\/data-operations\.js"/);
  assert.match(ui, /Fuentes de datos/i);
  assert.match(ui, /no es un historial de cargas/i);
  assert.doesNotMatch(ui, /MuniAuth\.download|exportData\(/);
});
