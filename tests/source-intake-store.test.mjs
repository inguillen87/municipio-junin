import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SOURCE_INTAKE_AUDIT_ACTION,
  SOURCE_INTAKE_AUDIT_ENTITY,
  SOURCE_INTAKE_SCHEMA_VERSION,
  sourceIntakeDetailsFromProfiled,
} from '../api/lib/source-intake-contract.js';
import {
  SourceIntakeStoreError,
  createSourceIntakeStore,
} from '../api/lib/source-intake-store.js';
import { sourceIntakeProfileFixture } from './source-intake-fixture.mjs';

const CREATED_AT = new Date('2026-08-14T12:00:00.000Z');

function storeHarness({ createRow, listRows } = {}) {
  const calls = [];
  const client = {
    auditLog: {
      async create(args) {
        calls.push(['create', args]);
        return createRow ?? {
          id: 'audit-log-1',
          createdAt: CREATED_AT,
          details: args.data.details,
        };
      },
      async findMany(args) {
        calls.push(['findMany', args]);
        return listRows ?? [];
      },
    },
  };
  return {
    calls,
    store: createSourceIntakeStore({ client, assertTransport: () => ({ safe: true }) }),
  };
}

test('appendReceipt creates one append-only tenant/user audit receipt with no source payload', async () => {
  const { calls, store } = storeHarness();
  const receipt = await store.appendReceipt({
    tenantId: 'tenant-junin',
    userId: 'user-admin',
    profiled: sourceIntakeProfileFixture(),
  });
  assert.equal(receipt.id, 'audit-log-1');
  assert.equal(receipt.persisted, true);
  assert.equal(calls.length, 1);
  const args = calls[0][1];
  assert.deepEqual(Object.keys(args.data), ['tenantId', 'userId', 'action', 'entity', 'details']);
  assert.deepEqual(args.data, {
    tenantId: 'tenant-junin',
    userId: 'user-admin',
    action: SOURCE_INTAKE_AUDIT_ACTION,
    entity: SOURCE_INTAKE_AUDIT_ENTITY,
    details: sourceIntakeDetailsFromProfiled(sourceIntakeProfileFixture()),
  });
  assert.deepEqual(args.select, { id: true, createdAt: true, details: true });
  assert.equal(args.data.details.schemaVersion, SOURCE_INTAKE_SCHEMA_VERSION);
  assert.doesNotMatch(JSON.stringify(args.data.details), /filename|headers|"values"|"rows"|actorId|email|tenantId|userId/i);
});

test('listReceipts scopes by tenant and immutable receipt identity, newest-first and capped at 20', async () => {
  const details = sourceIntakeDetailsFromProfiled(sourceIntakeProfileFixture());
  const { calls, store } = storeHarness({
    listRows: [
      { id: 'audit-log-2', createdAt: new Date('2026-08-14T13:00:00.000Z'), details },
      { id: 'audit-log-1', createdAt: CREATED_AT, details },
    ],
  });
  const receipts = await store.listReceipts({ tenantId: 'tenant-junin' });
  assert.deepEqual(receipts.map(item => item.id), ['audit-log-2', 'audit-log-1']);
  assert.ok(receipts.every(item => item.persisted));
  assert.deepEqual(calls[0][1], {
    where: {
      tenantId: 'tenant-junin',
      action: SOURCE_INTAKE_AUDIT_ACTION,
      entity: SOURCE_INTAKE_AUDIT_ENTITY,
    },
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
    take: 20,
    select: { id: true, createdAt: true, details: true },
  });
});

test('store rejects missing tenancy, unavailable transport, and tampered AuditLog details', async () => {
  const { store } = storeHarness();
  await assert.rejects(
    store.appendReceipt({ tenantId: '', userId: 'user-admin', profiled: sourceIntakeProfileFixture() }),
    error => error instanceof SourceIntakeStoreError && error.code === 'SOURCE_INTAKE_STORE_INPUT_INVALID',
  );
  await assert.rejects(
    store.listReceipts({ tenantId: ' tenant-junin ' }),
    error => error instanceof SourceIntakeStoreError && error.code === 'SOURCE_INTAKE_STORE_INPUT_INVALID',
  );

  const unavailable = createSourceIntakeStore({
    client: { auditLog: { create() {}, findMany() {} } },
    assertTransport: () => null,
  });
  await assert.rejects(
    unavailable.listReceipts({ tenantId: 'tenant-junin' }),
    error => error instanceof SourceIntakeStoreError && error.code === 'SOURCE_INTAKE_STORE_UNAVAILABLE',
  );

  const details = sourceIntakeDetailsFromProfiled(sourceIntakeProfileFixture());
  details.filename = 'secret.csv';
  const tampered = storeHarness({ listRows: [{ id: 'audit-log-1', createdAt: CREATED_AT, details }] }).store;
  await assert.rejects(
    tampered.listReceipts({ tenantId: 'tenant-junin' }),
    error => error instanceof SourceIntakeStoreError && error.code === 'SOURCE_INTAKE_STORE_UNAVAILABLE',
  );
});
