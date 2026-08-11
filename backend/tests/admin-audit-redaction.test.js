'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'admin-audit-redaction-secret-with-sufficient-length';

const prisma = require('../lib/prisma');
const adminRouter = require('../routes/admin');

const DIRECTORY_SNAPSHOT_ACTION = 'GRH_DIRECTORY_SNAPSHOT_PAYLOAD_V1';
const WORKFORCE_FINANCE_SNAPSHOT_ACTION = 'GRH_WORKFORCE_FINANCE_SNAPSHOT_PAYLOAD_V1';
const SNAPSHOT_ACTIONS = [DIRECTORY_SNAPSHOT_ACTION, WORKFORCE_FINANCE_SNAPSHOT_ACTION];

async function startHarness() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);

  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

test('GET /admin/audit excludes the encrypted GRH payload before fetch and before serialization', async t => {
  const originalFindUnique = prisma.user.findUnique;
  const originalFindMany = prisma.auditLog.findMany;
  let receivedQuery;

  prisma.user.findUnique = async ({ where }) => ({
    id: where.id,
    email: 'platform-auditor@example.test',
    name: 'Auditor de plataforma',
    role: 'SUPER_ADMIN',
    tenantId: null,
    active: true,
    tenant: null,
  });
  prisma.auditLog.findMany = async query => {
    receivedQuery = query;
    return [
      {
        id: 'ordinary-log',
        action: 'TENANT_SETTINGS_VIEWED',
        details: { section: 'appearance', retained: true },
        user: { name: 'Auditor de plataforma', email: 'platform-auditor@example.test' },
        tenant: { name: 'Municipio de prueba' },
      },
      {
        id: 'private-directory-snapshot-envelope',
        action: DIRECTORY_SNAPSHOT_ACTION,
        details: { ciphertext: 'must-never-be-serialized', authTag: 'also-private' },
        user: null,
        tenant: { name: 'Municipio de prueba' },
      },
      {
        id: 'private-workforce-finance-snapshot-envelope',
        action: WORKFORCE_FINANCE_SNAPSHOT_ACTION,
        details: { ciphertext: 'finance-must-never-be-serialized', aad: { tenantId: 'private' } },
        user: null,
        tenant: { name: 'Municipio de prueba' },
      },
    ];
  };

  const { server, baseUrl } = await startHarness();
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    prisma.user.findUnique = originalFindUnique;
    prisma.auditLog.findMany = originalFindMany;
    await prisma.$disconnect();
  });

  const token = jwt.sign({ id: 'platform-auditor' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const response = await fetch(`${baseUrl}/api/admin/audit`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(receivedQuery.where, {
    action: { notIn: SNAPSHOT_ACTIONS },
  });
  assert.deepEqual(payload, {
    ok: true,
    source: 'postgresql',
    data: [{
      id: 'ordinary-log',
      action: 'TENANT_SETTINGS_VIEWED',
      details: { section: 'appearance', retained: true },
      user: { name: 'Auditor de plataforma', email: 'platform-auditor@example.test' },
      tenant: { name: 'Municipio de prueba' },
    }],
  });
  assert.doesNotMatch(
    JSON.stringify(payload),
    /must-never-be-serialized|also-private|finance-must-never-be-serialized|private-(?:directory|workforce-finance)-snapshot-envelope/,
  );
});
