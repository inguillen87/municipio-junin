import { assertPrismaDatabaseTransport, prisma } from './db.js';
import {
  SOURCE_INTAKE_AUDIT_ACTION,
  SOURCE_INTAKE_AUDIT_ENTITY,
  SOURCE_INTAKE_LIST_LIMIT,
  sourceIntakeDetailsFromProfiled,
  sourceIntakeReceiptFromAuditLog,
} from './source-intake-contract.js';

const FORBIDDEN_ID = /[\u0000-\u0020\u007f]/u;

export class SourceIntakeStoreError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SourceIntakeStoreError';
    this.code = code;
  }
}

function requiredId(value) {
  return typeof value === 'string' && value === value.trim() && value.length > 0 &&
    value.length <= 160 && !FORBIDDEN_ID.test(value);
}

function unavailable() {
  return new SourceIntakeStoreError('SOURCE_INTAKE_STORE_UNAVAILABLE');
}

export function createSourceIntakeStore({
  client = prisma,
  assertTransport = assertPrismaDatabaseTransport,
} = {}) {
  function ensureReady() {
    try {
      if (typeof assertTransport !== 'function' || !assertTransport() ||
          !client?.auditLog || typeof client.auditLog.create !== 'function' ||
          typeof client.auditLog.findMany !== 'function') throw unavailable();
    } catch (error) {
      if (error instanceof SourceIntakeStoreError) throw error;
      throw unavailable();
    }
  }

  return Object.freeze({
    async appendReceipt({ tenantId, userId, profiled } = {}) {
      if (!requiredId(tenantId) || !requiredId(userId)) {
        throw new SourceIntakeStoreError('SOURCE_INTAKE_STORE_INPUT_INVALID');
      }
      let details;
      try {
        details = sourceIntakeDetailsFromProfiled(profiled);
      } catch {
        throw new SourceIntakeStoreError('SOURCE_INTAKE_STORE_INPUT_INVALID');
      }
      ensureReady();
      try {
        const row = await client.auditLog.create({
          data: {
            tenantId,
            userId,
            action: SOURCE_INTAKE_AUDIT_ACTION,
            entity: SOURCE_INTAKE_AUDIT_ENTITY,
            details,
          },
          select: { id: true, createdAt: true, details: true },
        });
        return sourceIntakeReceiptFromAuditLog(row);
      } catch (error) {
        if (error instanceof SourceIntakeStoreError) throw error;
        throw unavailable();
      }
    },

    async listReceipts({ tenantId } = {}) {
      if (!requiredId(tenantId)) {
        throw new SourceIntakeStoreError('SOURCE_INTAKE_STORE_INPUT_INVALID');
      }
      ensureReady();
      try {
        const rows = await client.auditLog.findMany({
          where: {
            tenantId,
            action: SOURCE_INTAKE_AUDIT_ACTION,
            entity: SOURCE_INTAKE_AUDIT_ENTITY,
          },
          orderBy: { createdAt: 'desc' },
          take: SOURCE_INTAKE_LIST_LIMIT,
          select: { id: true, createdAt: true, details: true },
        });
        if (!Array.isArray(rows) || rows.length > SOURCE_INTAKE_LIST_LIMIT) throw unavailable();
        return rows.map(sourceIntakeReceiptFromAuditLog);
      } catch (error) {
        if (error instanceof SourceIntakeStoreError) throw error;
        throw unavailable();
      }
    },
  });
}

export default createSourceIntakeStore();
