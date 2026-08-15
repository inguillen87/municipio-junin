import { createHash, randomUUID } from 'node:crypto';

import { assertPrismaDatabaseTransport, prisma } from './db.js';
import {
  GRH_PERSONAS_REVIEW_CURRENT_COUNTS,
  GRH_PERSONAS_REVIEW_DOCUMENT_CONFLICT_APPROVAL_REASON,
  GRH_PERSONAS_REVIEW_DOCUMENT_REVEAL_PURPOSE,
  GRH_PERSONAS_REVIEW_EVIDENCE_LEVELS,
  GRH_PERSONAS_REVIEW_EVIDENCE_POLICY_VERSION,
  GRH_PERSONAS_REVIEW_GRH_SHA256,
  GRH_PERSONAS_REVIEW_KINDS,
  GRH_PERSONAS_REVIEW_MATCHER_VERSION,
  GRH_PERSONAS_REVIEW_MATCH_METHODS,
  GRH_PERSONAS_REVIEW_NAME_EVIDENCE,
  GRH_PERSONAS_REVIEW_PERSONAS_SHA256,
  GRH_PERSONAS_REVIEW_PRIORITIES,
  GRH_PERSONAS_REVIEW_PURPOSE,
  GRH_PERSONAS_REVIEW_RUN_SCHEMA_VERSION,
  GRH_PERSONAS_REVIEW_SNAPSHOT_AS_OF,
  GRH_PERSONAS_REVIEW_STATUSES,
  canonicalGrhPersonasReviewJson,
  isOpaqueReviewKey,
  isReviewUuid,
  isReviewUuidV4,
  parseGrhPersonasReviewDecisionBody,
  requiresManualSourceConfirmationForDniReviewOption,
} from './grh-personas-review-contract.js';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const DOCUMENT_EVIDENCE = new Set(['MATCH', 'CONFLICT', 'MISSING']);
const ACTOR_ROLES = new Set(['TENANT_ADMIN', 'INTENDENTE']);
const DECIDABLE_STATUSES = new Set(['PENDING', 'DEFERRED']);
const STATUS_FOR_COMMAND = Object.freeze({ APPROVE: 'APPROVED', DEFER: 'DEFERRED', REJECT: 'REJECTED' });

export class GrhPersonasReviewStoreError extends Error {
  constructor(code) {
    super('GRH/PERSONAS private review is unavailable');
    this.name = 'GrhPersonasReviewStoreError';
    this.code = code;
  }
}

function fail(code) {
  throw new GrhPersonasReviewStoreError(code);
}

function validateTransport(assertTransport) {
  try {
    if (!assertTransport()) fail('GRH_PERSONAS_REVIEW_DATABASE_UNAVAILABLE');
  } catch (error) {
    if (error instanceof GrhPersonasReviewStoreError) throw error;
    fail('GRH_PERSONAS_REVIEW_DATABASE_UNAVAILABLE');
  }
}

function validateTenant(tenantId) {
  if (typeof tenantId !== 'string' || !IDENTIFIER.test(tenantId)) fail('GRH_PERSONAS_REVIEW_INPUT_INVALID');
}

function integer(value) {
  if (typeof value === 'bigint') {
    const converted = Number(value);
    return Number.isSafeInteger(converted) ? converted : null;
  }
  if (typeof value === 'string' && /^\d+$/u.test(value)) {
    const converted = Number(value);
    return Number.isSafeInteger(converted) ? converted : null;
  }
  return Number.isSafeInteger(value) ? value : null;
}

function instant(value) {
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(milliseconds)) fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
  return new Date(milliseconds).toISOString();
}

function date(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function sourceForRun(row) {
  return Object.freeze({
    snapshotAsOf: date(row.snapshotAsOf),
    grhSourceSha256: row.grhSourceSha256,
    personasSourceSha256: row.personasSourceSha256,
    matcherVersion: row.matcherVersion,
    evidencePolicyVersion: row.evidencePolicyVersion,
  });
}

function validateRun(row) {
  const expected = GRH_PERSONAS_REVIEW_CURRENT_COUNTS;
  const values = {
    totalCases: integer(row?.totalCaseCount),
    totalOptions: integer(row?.totalOptionCount),
    candidate: integer(row?.candidateCaseCount),
    ambiguous: integer(row?.ambiguousCaseCount),
    unmatched: integer(row?.unmatchedCaseCount),
    documentConflicts: integer(row?.documentConflictCount),
    autoApproved: integer(row?.autoApprovedCount),
  };
  if (!row || !isReviewUuid(row.runId) || row.schemaVersion !== GRH_PERSONAS_REVIEW_RUN_SCHEMA_VERSION ||
      row.matcherVersion !== GRH_PERSONAS_REVIEW_MATCHER_VERSION ||
      row.evidencePolicyVersion !== GRH_PERSONAS_REVIEW_EVIDENCE_POLICY_VERSION ||
      row.encryptionKeyVersion !== 'v1' || date(row.snapshotAsOf) !== GRH_PERSONAS_REVIEW_SNAPSHOT_AS_OF ||
      row.grhSourceSha256 !== GRH_PERSONAS_REVIEW_GRH_SHA256 ||
      row.personasSourceSha256 !== GRH_PERSONAS_REVIEW_PERSONAS_SHA256 ||
      !SHA256.test(row.semanticDigest || '') || !SHA256.test(row.runDigest || '') || row.status !== 'READY' ||
      Object.keys(expected).some(key => values[key] !== expected[key])) {
    fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
  }
  return Object.freeze({ ...row, ...values, runId: row.runId.toLowerCase() });
}

async function activeRun(client, tenantId) {
  const rows = await client.$queryRaw`
    /* grh-personas-review:active-run-v1 */
    SELECT run_id AS "runId", schema_version AS "schemaVersion",
      matcher_version AS "matcherVersion", evidence_policy_version AS "evidencePolicyVersion",
      encryption_key_version AS "encryptionKeyVersion", snapshot_as_of AS "snapshotAsOf",
      grh_source_sha256 AS "grhSourceSha256", personas_source_sha256 AS "personasSourceSha256",
      semantic_digest AS "semanticDigest", run_digest AS "runDigest",
      total_case_count AS "totalCaseCount", total_option_count AS "totalOptionCount",
      candidate_case_count AS "candidateCaseCount", ambiguous_case_count AS "ambiguousCaseCount",
      unmatched_case_count AS "unmatchedCaseCount", document_conflict_count AS "documentConflictCount",
      auto_approved_count AS "autoApprovedCount", status
    FROM grh_personas_review_runs
    WHERE tenant_id = ${tenantId} AND status = 'READY'
    LIMIT 2
  `;
  if (!Array.isArray(rows) || rows.length !== 1) {
    fail(rows?.length === 0 ? 'GRH_PERSONAS_REVIEW_SETUP_PENDING' : 'GRH_PERSONAS_REVIEW_DATA_INVALID');
  }
  return validateRun(rows[0]);
}

async function statusCounts(client, tenantId, runId) {
  const rows = await client.$queryRaw`
    /* grh-personas-review:status-counts-v1 */
    SELECT status::text AS status, COUNT(*)::bigint AS count
    FROM grh_personas_review_cases
    WHERE tenant_id = ${tenantId} AND run_id = ${runId}::uuid
    GROUP BY status
  `;
  if (!Array.isArray(rows)) fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
  const counts = { pending: 0, deferred: 0, approved: 0, rejected: 0 };
  for (const row of rows) {
    const key = typeof row.status === 'string' ? row.status.toLowerCase() : '';
    const count = integer(row.count);
    if (!Object.hasOwn(counts, key) || count === null || count < 0) fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
    counts[key] = count;
  }
  if (Object.values(counts).reduce((sum, value) => sum + value, 0) !== GRH_PERSONAS_REVIEW_CURRENT_COUNTS.totalCases) {
    fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
  }
  return Object.freeze(counts);
}

function summaryFor(run, byStatus) {
  return Object.freeze({
    totalCases: run.totalCases,
    totalOptions: run.totalOptions,
    byKind: Object.freeze({ candidate: run.candidate, ambiguous: run.ambiguous, unmatched: run.unmatched }),
    byStatus,
    documentConflicts: run.documentConflicts,
    autoApproved: run.autoApproved,
  });
}

function publicQueueRow(row) {
  const optionCount = integer(row?.optionCount);
  const version = integer(row?.version);
  if (!row || !isOpaqueReviewKey(row.caseKey) || !GRH_PERSONAS_REVIEW_KINDS.includes(row.kind) ||
      !GRH_PERSONAS_REVIEW_STATUSES.includes(row.status) || !GRH_PERSONAS_REVIEW_PRIORITIES.includes(row.priority) ||
      optionCount === null || optionCount < 0 || version === null || version < 1 ||
      typeof row.documentConflict !== 'boolean' || typeof row.birthDateConflict !== 'boolean' ||
      typeof row.nameSupport !== 'boolean') fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
  return Object.freeze({
    caseKey: row.caseKey,
    kind: row.kind,
    status: row.status,
    priority: row.priority,
    version,
    optionCount,
    flags: Object.freeze({
      documentConflict: row.documentConflict,
      birthDateConflict: row.birthDateConflict,
      nameSupport: row.nameSupport,
    }),
  });
}

function validateEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
  return value;
}

function publicOptionRow(row) {
  const rank = integer(row?.rank);
  if (!row || !isOpaqueReviewKey(row.optionKey) || rank === null || rank < 1 ||
      !GRH_PERSONAS_REVIEW_MATCH_METHODS.includes(row.matchMethod) ||
      !GRH_PERSONAS_REVIEW_EVIDENCE_LEVELS.includes(row.evidenceLevel) ||
      !DOCUMENT_EVIDENCE.has(row.cuilEvidence) || !DOCUMENT_EVIDENCE.has(row.dniEvidence) ||
      !GRH_PERSONAS_REVIEW_NAME_EVIDENCE.includes(row.nameEvidence) ||
      !DOCUMENT_EVIDENCE.has(row.birthDateEvidence) || row.requiresManualCheck !== true) {
    fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
  }
  return Object.freeze({
    optionKey: row.optionKey,
    rank,
    matchMethod: row.matchMethod,
    evidenceLevel: row.evidenceLevel,
    evidence: Object.freeze({
      cuil: row.cuilEvidence,
      dni: row.dniEvidence,
      name: row.nameEvidence,
      birthDate: row.birthDateEvidence,
    }),
    requiresManualCheck: true,
    evidenceEnvelope: validateEnvelope(row.evidenceEnvelope),
  });
}

function transactionOptions() {
  return { isolationLevel: 'Serializable', maxWait: 5000, timeout: 10000 };
}

function payloadDigest(context) {
  return createHash('sha256').update(canonicalGrhPersonasReviewJson({
    actorRole: context.actorRole,
    actorUserId: context.actorUserId,
    caseKey: context.caseKey,
    command: context.decision,
    expectedVersion: context.expectedVersion,
    optionKey: context.optionKey,
    purpose: context.purpose,
    reasonCode: context.reasonCode,
    tenantId: context.tenantId,
  }), 'utf8').digest('hex');
}

function decisionResult(row, replayed) {
  const version = integer(row?.version);
  if (!row || !isOpaqueReviewKey(row.caseKey) || !GRH_PERSONAS_REVIEW_STATUSES.includes(row.status) ||
      version === null || version < 2 || (row.selectedOptionKey !== null && !isOpaqueReviewKey(row.selectedOptionKey)) ||
      typeof row.reasonCode !== 'string') fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
  return Object.freeze({
    replayed,
    decision: Object.freeze({
      caseKey: row.caseKey,
      status: row.status,
      version,
      selectedOptionKey: row.selectedOptionKey ?? null,
      reasonCode: row.reasonCode,
      decidedAt: instant(row.decidedAt),
    }),
  });
}

async function commandRows(client, tenantId, commandId) {
  return client.$queryRaw`
    /* grh-personas-review:command-v1 */
    SELECT event.payload_digest AS "payloadDigest", event.case_key AS "caseKey",
      event.to_status::text AS status, event.result_version AS version,
      event.selected_option_key AS "selectedOptionKey", event.reason_code AS "reasonCode",
      event.occurred_at AS "decidedAt"
    FROM grh_personas_review_events event
    WHERE event.tenant_id = ${tenantId} AND event.command_id = ${commandId}::uuid
    LIMIT 2
  `;
}

export function createGrhPersonasReviewStore({
  client = prisma,
  assertTransport = assertPrismaDatabaseTransport,
  idFactory = randomUUID,
  clock = () => new Date(),
} = {}) {
  async function commitReadAudit({
    tenantId,
    actorUserId,
    caseKey,
    purpose,
    correlationId,
    optionCount,
    expectedPurpose,
    action,
  }) {
    validateTenant(tenantId);
    validateTransport(assertTransport);
    if (!IDENTIFIER.test(actorUserId || '') || !isOpaqueReviewKey(caseKey) ||
        purpose !== expectedPurpose || !isReviewUuidV4(correlationId) ||
        !Number.isSafeInteger(optionCount) || optionCount < 0 || optionCount > 100) {
      fail('GRH_PERSONAS_REVIEW_AUDIT_UNAVAILABLE');
    }
    const occurredAt = clock();
    const auditId = idFactory();
    if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime()) ||
        typeof auditId !== 'string' || auditId.length < 1 || auditId.length > 128) {
      fail('GRH_PERSONAS_REVIEW_AUDIT_UNAVAILABLE');
    }
    try {
      const committed = await client.auditLog.create({
        data: {
          id: auditId,
          tenantId,
          userId: actorUserId,
          action,
          entity: 'grh_personas_review_case',
          entityId: caseKey,
          details: { purpose, correlationId: correlationId.toLowerCase(), optionCount },
          createdAt: occurredAt,
        },
        select: { id: true },
      });
      if (!committed || committed.id !== auditId) fail('GRH_PERSONAS_REVIEW_AUDIT_UNAVAILABLE');
    } catch {
      fail('GRH_PERSONAS_REVIEW_AUDIT_UNAVAILABLE');
    }
    return true;
  }

  return Object.freeze({
    async summary({ tenantId } = {}) {
      validateTenant(tenantId);
      validateTransport(assertTransport);
      const run = await activeRun(client, tenantId);
      const byStatus = await statusCounts(client, tenantId, run.runId);
      return Object.freeze({ runId: run.runId, source: sourceForRun(run), summary: summaryFor(run, byStatus) });
    },

    async queue({ tenantId, status, kind = null, limit, cursor = null } = {}) {
      validateTenant(tenantId);
      validateTransport(assertTransport);
      if (!GRH_PERSONAS_REVIEW_STATUSES.includes(status) ||
          (kind !== null && !GRH_PERSONAS_REVIEW_KINDS.includes(kind)) ||
          !Number.isSafeInteger(limit) || limit < 1 || limit > 50 ||
          (cursor !== null && !isOpaqueReviewKey(cursor))) fail('GRH_PERSONAS_REVIEW_INPUT_INVALID');
      const run = await activeRun(client, tenantId);
      const byStatus = await statusCounts(client, tenantId, run.runId);
      let cursorPriorityRank = null;
      let cursorKindRank = null;
      if (cursor !== null) {
        const cursorRows = await client.$queryRaw`
          /* grh-personas-review:queue-cursor-v1 */
          SELECT priority::text AS priority, kind::text AS kind, status::text AS status
          FROM grh_personas_review_cases
          WHERE tenant_id = ${tenantId} AND run_id = ${run.runId}::uuid AND case_key = ${cursor}
            AND status = ${status} AND (${kind}::text IS NULL OR kind = ${kind})
          LIMIT 2
        `;
        if (!Array.isArray(cursorRows) || cursorRows.length !== 1 ||
            !GRH_PERSONAS_REVIEW_PRIORITIES.includes(cursorRows[0].priority) ||
            !GRH_PERSONAS_REVIEW_KINDS.includes(cursorRows[0].kind)) {
          fail('GRH_PERSONAS_REVIEW_INPUT_INVALID');
        }
        cursorPriorityRank = { DOCUMENT_CONFLICT: 0, MANUAL_REVIEW: 1, STANDARD: 2 }[cursorRows[0].priority];
        cursorKindRank = { AMBIGUOUS: 0, CANDIDATE: 1, UNMATCHED: 2 }[cursorRows[0].kind];
      }
      const rows = await client.$queryRaw`
        /* grh-personas-review:queue-v1 */
        SELECT case_key AS "caseKey", kind::text AS kind, status::text AS status,
          priority::text AS priority, version, option_count AS "optionCount",
          document_conflict AS "documentConflict", birth_date_conflict AS "birthDateConflict",
          name_support AS "nameSupport"
        FROM grh_personas_review_cases
        WHERE tenant_id = ${tenantId} AND run_id = ${run.runId}::uuid
          AND status = ${status} AND (${kind}::text IS NULL OR kind = ${kind})
          AND (${cursor}::text IS NULL OR
            CASE priority WHEN 'DOCUMENT_CONFLICT' THEN 0 WHEN 'MANUAL_REVIEW' THEN 1 ELSE 2 END > ${cursorPriorityRank}
            OR (
              CASE priority WHEN 'DOCUMENT_CONFLICT' THEN 0 WHEN 'MANUAL_REVIEW' THEN 1 ELSE 2 END = ${cursorPriorityRank}
              AND CASE kind WHEN 'AMBIGUOUS' THEN 0 WHEN 'CANDIDATE' THEN 1 ELSE 2 END > ${cursorKindRank}
            ) OR (
              CASE priority WHEN 'DOCUMENT_CONFLICT' THEN 0 WHEN 'MANUAL_REVIEW' THEN 1 ELSE 2 END = ${cursorPriorityRank}
              AND CASE kind WHEN 'AMBIGUOUS' THEN 0 WHEN 'CANDIDATE' THEN 1 ELSE 2 END = ${cursorKindRank}
              AND case_key > ${cursor}
            )
          )
        ORDER BY
          CASE priority WHEN 'DOCUMENT_CONFLICT' THEN 0 WHEN 'MANUAL_REVIEW' THEN 1 ELSE 2 END,
          CASE kind WHEN 'AMBIGUOUS' THEN 0 WHEN 'CANDIDATE' THEN 1 ELSE 2 END,
          case_key
        LIMIT ${limit + 1}
      `;
      if (!Array.isArray(rows) || rows.length > limit + 1) fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
      const items = rows.slice(0, limit).map(publicQueueRow);
      return Object.freeze({
        runId: run.runId,
        source: sourceForRun(run),
        summary: summaryFor(run, byStatus),
        page: Object.freeze({ limit, nextCursor: rows.length > limit ? items.at(-1)?.caseKey ?? null : null }),
        items: Object.freeze(items),
      });
    },

    async detail({ tenantId, caseKey } = {}) {
      validateTenant(tenantId);
      validateTransport(assertTransport);
      if (!isOpaqueReviewKey(caseKey)) fail('GRH_PERSONAS_REVIEW_INPUT_INVALID');
      const run = await activeRun(client, tenantId);
      const byStatus = await statusCounts(client, tenantId, run.runId);
      const caseRows = await client.$queryRaw`
        /* grh-personas-review:detail-case-v1 */
        SELECT case_key AS "caseKey", kind::text AS kind, status::text AS status,
          priority::text AS priority, version, option_count AS "optionCount",
          document_conflict AS "documentConflict", birth_date_conflict AS "birthDateConflict",
          name_support AS "nameSupport", evidence_envelope AS "evidenceEnvelope",
          selected_option_key AS "selectedOptionKey", reason_code AS "reasonCode",
          decided_at AS "decidedAt"
        FROM grh_personas_review_cases
        WHERE tenant_id = ${tenantId} AND run_id = ${run.runId}::uuid AND case_key = ${caseKey}
        LIMIT 2
      `;
      if (!Array.isArray(caseRows) || caseRows.length > 1) fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
      if (caseRows.length === 0) fail('GRH_PERSONAS_REVIEW_CASE_NOT_FOUND');
      const publicCase = publicQueueRow(caseRows[0]);
      const optionRows = await client.$queryRaw`
        /* grh-personas-review:detail-options-v1 */
        SELECT option_key AS "optionKey", rank, match_method::text AS "matchMethod",
          evidence_level::text AS "evidenceLevel", evidence_envelope AS "evidenceEnvelope",
          cuil_evidence::text AS "cuilEvidence", dni_evidence::text AS "dniEvidence",
          name_evidence::text AS "nameEvidence", birth_date_evidence::text AS "birthDateEvidence",
          requires_manual_check AS "requiresManualCheck"
        FROM grh_personas_review_options
        WHERE tenant_id = ${tenantId} AND run_id = ${run.runId}::uuid AND case_key = ${caseKey}
        ORDER BY rank, option_key
        LIMIT 101
      `;
      if (!Array.isArray(optionRows) || optionRows.length > 100 || optionRows.length !== publicCase.optionCount) {
        fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
      }
      const options = optionRows.map(publicOptionRow);
      const decision = caseRows[0].status === 'PENDING' ? null : Object.freeze({
        status: caseRows[0].status,
        selectedOptionKey: caseRows[0].selectedOptionKey ?? null,
        reasonCode: caseRows[0].reasonCode,
        decidedAt: instant(caseRows[0].decidedAt),
      });
      return Object.freeze({
        runId: run.runId,
        source: sourceForRun(run),
        summary: summaryFor(run, byStatus),
        case: Object.freeze({
          ...publicCase,
          evidenceEnvelope: validateEnvelope(caseRows[0].evidenceEnvelope),
          options: Object.freeze(options),
          decision,
        }),
      });
    },

    async recordDetailRead({ tenantId, actorUserId, caseKey, purpose, correlationId, optionCount } = {}) {
      return commitReadAudit({
        tenantId,
        actorUserId,
        caseKey,
        purpose,
        correlationId,
        optionCount,
        expectedPurpose: GRH_PERSONAS_REVIEW_PURPOSE,
        action: 'GRH_PERSONAS_REVIEW_DETAIL_READ',
      });
    },

    async recordDocumentReveal({ tenantId, actorUserId, caseKey, purpose, correlationId, optionCount } = {}) {
      return commitReadAudit({
        tenantId,
        actorUserId,
        caseKey,
        purpose,
        correlationId,
        optionCount,
        expectedPurpose: GRH_PERSONAS_REVIEW_DOCUMENT_REVEAL_PURPOSE,
        action: 'GRH_PERSONAS_REVIEW_DOCUMENT_REVEAL',
      });
    },

    async decide(input = {}) {
      validateTenant(input.tenantId);
      validateTransport(assertTransport);
      const parsedDecision = parseGrhPersonasReviewDecisionBody({
        commandId: input.commandId,
        caseKey: input.caseKey,
        expectedVersion: input.expectedVersion,
        decision: input.decision,
        optionKey: input.optionKey,
        reasonCode: input.reasonCode,
      });
      if (!IDENTIFIER.test(input.actorUserId || '') || !ACTOR_ROLES.has(input.actorRole) || !parsedDecision ||
          input.purpose !== 'IDENTITY_LINKAGE_REVIEW' || !isReviewUuidV4(input.correlationId)) {
        fail('GRH_PERSONAS_REVIEW_INPUT_INVALID');
      }
      const context = Object.freeze({ ...input, payloadDigest: payloadDigest(input) });
      const execute = async transaction => {
        const existing = await commandRows(transaction, context.tenantId, context.commandId);
        if (!Array.isArray(existing) || existing.length > 1) fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
        if (existing.length === 1) {
          if (existing[0].payloadDigest !== context.payloadDigest) fail('GRH_PERSONAS_REVIEW_COMMAND_COLLISION');
          return decisionResult(existing[0], true);
        }
        const run = await activeRun(transaction, context.tenantId);
        const locked = await transaction.$queryRaw`
          /* grh-personas-review:decision-lock-v1 */
          SELECT case_key AS "caseKey", status::text AS status, version,
            document_conflict AS "documentConflict", birth_date_conflict AS "birthDateConflict",
            priority::text AS priority
          FROM grh_personas_review_cases
          WHERE tenant_id = ${context.tenantId} AND run_id = ${run.runId}::uuid
            AND case_key = ${context.caseKey}
          LIMIT 2 FOR UPDATE
        `;
        if (!Array.isArray(locked) || locked.length > 1) fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
        if (locked.length === 0) fail('GRH_PERSONAS_REVIEW_CASE_NOT_FOUND');
        if (!GRH_PERSONAS_REVIEW_STATUSES.includes(locked[0].status)) {
          fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
        }
        if (!DECIDABLE_STATUSES.has(locked[0].status)) fail('GRH_PERSONAS_REVIEW_VERSION_CONFLICT');
        if (integer(locked[0].version) !== context.expectedVersion) fail('GRH_PERSONAS_REVIEW_VERSION_CONFLICT');
        if (typeof locked[0].documentConflict !== 'boolean' ||
            typeof locked[0].birthDateConflict !== 'boolean' ||
            !GRH_PERSONAS_REVIEW_PRIORITIES.includes(locked[0].priority) ||
            (locked[0].priority === 'DOCUMENT_CONFLICT') !== locked[0].documentConflict) {
          fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
        }
        if (context.decision === 'APPROVE' &&
            (locked[0].documentConflict || locked[0].birthDateConflict ||
              locked[0].priority === 'DOCUMENT_CONFLICT') &&
            context.reasonCode !== GRH_PERSONAS_REVIEW_DOCUMENT_CONFLICT_APPROVAL_REASON) {
          fail('GRH_PERSONAS_REVIEW_INPUT_INVALID');
        }

        let personasRef = null;
        if (context.decision === 'APPROVE') {
          const options = await transaction.$queryRaw`
            /* grh-personas-review:decision-option-v1 */
            SELECT personas_ref AS "personasRef", evidence_level::text AS "evidenceLevel",
              match_method::text AS "matchMethod", cuil_evidence::text AS "cuilEvidence",
              dni_evidence::text AS "dniEvidence", name_evidence::text AS "nameEvidence",
              birth_date_evidence::text AS "birthDateEvidence"
            FROM grh_personas_review_options
            WHERE tenant_id = ${context.tenantId} AND run_id = ${run.runId}::uuid
              AND case_key = ${context.caseKey} AND option_key = ${context.optionKey}
            LIMIT 2
          `;
          if (!Array.isArray(options) || options.length > 1) fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
          if (options.length === 0 || !isOpaqueReviewKey(options[0].personasRef)) {
            fail('GRH_PERSONAS_REVIEW_OPTION_NOT_FOUND');
          }
          if (!GRH_PERSONAS_REVIEW_EVIDENCE_LEVELS.includes(options[0].evidenceLevel) ||
              !GRH_PERSONAS_REVIEW_MATCH_METHODS.includes(options[0].matchMethod) ||
              !DOCUMENT_EVIDENCE.has(options[0].cuilEvidence) ||
              !DOCUMENT_EVIDENCE.has(options[0].dniEvidence) ||
              !GRH_PERSONAS_REVIEW_NAME_EVIDENCE.includes(options[0].nameEvidence) ||
              !DOCUMENT_EVIDENCE.has(options[0].birthDateEvidence)) {
            fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
          }
          const evidenceRequiresManualConfirmation = options[0].evidenceLevel === 'CONFLICT' ||
            requiresManualSourceConfirmationForDniReviewOption({
              matchMethod: options[0].matchMethod,
              cuilEvidence: options[0].cuilEvidence,
              dniEvidence: options[0].dniEvidence,
              nameEvidence: options[0].nameEvidence,
              birthDateEvidence: options[0].birthDateEvidence,
            });
          if (evidenceRequiresManualConfirmation &&
              context.reasonCode !== GRH_PERSONAS_REVIEW_DOCUMENT_CONFLICT_APPROVAL_REASON) {
            fail('GRH_PERSONAS_REVIEW_INPUT_INVALID');
          }
          personasRef = options[0].personasRef;
          const collisions = await transaction.$queryRaw`
            /* grh-personas-review:target-conflict-v1 */
            SELECT case_key AS "caseKey" FROM grh_personas_review_cases
            WHERE tenant_id = ${context.tenantId} AND run_id = ${run.runId}::uuid
              AND status = 'APPROVED' AND selected_personas_ref = ${personasRef}
              AND case_key <> ${context.caseKey}
            LIMIT 1
          `;
          if (!Array.isArray(collisions)) fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
          if (collisions.length > 0) fail('GRH_PERSONAS_REVIEW_TARGET_CONFLICT');
        }

        const decidedAt = clock();
        if (!(decidedAt instanceof Date) || !Number.isFinite(decidedAt.getTime())) fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
        const toStatus = STATUS_FOR_COMMAND[context.decision];
        const updated = await transaction.$queryRaw`
          /* grh-personas-review:decision-update-v1 */
          UPDATE grh_personas_review_cases SET
            status = ${toStatus}, selected_option_key = ${context.optionKey},
            selected_personas_ref = ${personasRef}, reason_code = ${context.reasonCode},
            decided_by_user_id = ${context.actorUserId}, decided_at = ${decidedAt},
            version = version + 1, updated_at = ${decidedAt}
          WHERE tenant_id = ${context.tenantId} AND run_id = ${run.runId}::uuid
            AND case_key = ${context.caseKey} AND version = ${context.expectedVersion}
            AND status IN ('PENDING', 'DEFERRED')
          RETURNING case_key AS "caseKey", status::text AS status, version,
            selected_option_key AS "selectedOptionKey", reason_code AS "reasonCode",
            decided_at AS "decidedAt"
        `;
        if (!Array.isArray(updated) || updated.length !== 1) fail('GRH_PERSONAS_REVIEW_VERSION_CONFLICT');
        const eventId = idFactory();
        if (!isReviewUuid(eventId)) fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
        const inserted = await transaction.$queryRaw`
          /* grh-personas-review:decision-event-v1 */
          INSERT INTO grh_personas_review_events (
            event_id, tenant_id, run_id, case_key, command_id, payload_digest,
            actor_user_id, actor_role, command, from_status, to_status,
            selected_option_key, reason_code, purpose, correlation_id,
            expected_version, result_version, occurred_at
          ) VALUES (
            ${eventId}::uuid, ${context.tenantId}, ${run.runId}::uuid, ${context.caseKey},
            ${context.commandId}::uuid, ${context.payloadDigest}, ${context.actorUserId},
            ${context.actorRole}::"Role", ${context.decision}, ${locked[0].status}, ${toStatus},
            ${context.optionKey}, ${context.reasonCode}, ${context.purpose}, ${context.correlationId}::uuid,
            ${context.expectedVersion},
            ${context.expectedVersion + 1}, ${decidedAt}
          ) RETURNING event_id AS "eventId"
        `;
        if (!Array.isArray(inserted) || inserted.length !== 1) fail('GRH_PERSONAS_REVIEW_DATA_INVALID');
        return decisionResult(updated[0], false);
      };
      try {
        return await client.$transaction(execute, transactionOptions());
      } catch (error) {
        if (error instanceof GrhPersonasReviewStoreError) throw error;
        try {
          const existing = await commandRows(client, context.tenantId, context.commandId);
          if (Array.isArray(existing) && existing.length === 1) {
            if (existing[0].payloadDigest !== context.payloadDigest) fail('GRH_PERSONAS_REVIEW_COMMAND_COLLISION');
            return decisionResult(existing[0], true);
          }
        } catch (recoveryError) {
          if (recoveryError instanceof GrhPersonasReviewStoreError) throw recoveryError;
        }
        if (error?.code === 'P2002' || (error?.code === 'P2010' && error?.meta?.code === '23505')) {
          fail('GRH_PERSONAS_REVIEW_TARGET_CONFLICT');
        }
        fail('GRH_PERSONAS_REVIEW_DATABASE_UNAVAILABLE');
      }
    },
  });
}

export const grhPersonasReviewStore = createGrhPersonasReviewStore();
export default grhPersonasReviewStore;
