import { createHash, randomUUID } from 'node:crypto';

import { assertPrismaDatabaseTransport, prisma } from './db.js';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/u;
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/u;
const MAX_COMMITMENTS = 100;
const MAX_EVENTS_PER_COMMITMENT = 128;

const PRIORITIES = Object.freeze({
  cross_source_material_difference: Object.freeze({
    severity: 'critical',
    databaseSeverity: 'CRITICAL',
    actionCode: 'review_cross_source_reconciliation',
    databaseActionCode: 'REVIEW_CROSS_SOURCE_RECONCILIATION',
  }),
  temporal_quarantine_present: Object.freeze({
    severity: 'warning',
    databaseSeverity: 'WARNING',
    actionCode: 'review_temporal_quarantine',
    databaseActionCode: 'REVIEW_TEMPORAL_QUARANTINE',
  }),
});
const ASSIGNEE_ROLES = new Set(['CONTADOR', 'TENANT_ADMIN']);
const CREATOR_ROLES = new Set(['INTENDENTE']);
const ACTOR_ROLES = new Set(['INTENDENTE', 'TENANT_ADMIN', 'CONTADOR']);
const BLOCK_REASONS = new Set(['dependency_pending', 'source_review_required', 'owner_unavailable']);
const CANCEL_REASONS = new Set(['priority_withdrawn', 'duplicate_commitment']);
const COMPLETION_OUTCOMES = new Set(['review_completed', 'correction_requested', 'no_change_required']);
const COMMANDS = new Set(['claim', 'block', 'resume', 'complete', 'reschedule', 'cancel']);
const DATABASE_COMMAND = Object.freeze({
  claim: 'CLAIM',
  block: 'BLOCK',
  resume: 'RESUME',
  complete: 'COMPLETE',
  reschedule: 'RESCHEDULE',
  cancel: 'CANCEL',
});

export class GrhActionLedgerStoreError extends Error {
  constructor(code) {
    super('GRH action ledger is unavailable');
    this.name = 'GrhActionLedgerStoreError';
    this.code = code;
  }
}

function storeError(code) {
  return new GrhActionLedgerStoreError(code);
}

function validIdentifier(value) {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value);
}

function validVersion(value) {
  return typeof value === 'string' && VERSION_PATTERN.test(value);
}

function exactDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function exactInstant(value) {
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
  return new Date(milliseconds).toISOString();
}

function stableDigest(value) {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function normalizeTransport(assertTransport) {
  let transport;
  try {
    transport = assertTransport();
  } catch {
    throw storeError('GRH_ACTION_LEDGER_TRANSPORT_INVALID');
  }
  if (!transport) throw storeError('GRH_ACTION_LEDGER_TRANSPORT_INVALID');
}

function normalizeBase({ tenantId } = {}) {
  if (!validIdentifier(tenantId)) throw storeError('GRH_ACTION_LEDGER_INPUT_INVALID');
  return { tenantId };
}

function normalizeActor(actorUserId, actorRole) {
  if (!validIdentifier(actorUserId) || !ACTOR_ROLES.has(actorRole)) {
    throw storeError('GRH_ACTION_LEDGER_INPUT_INVALID');
  }
  return { actorUserId, actorRole };
}

function normalizeUuid(value) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw storeError('GRH_ACTION_LEDGER_INPUT_INVALID');
  }
  return value.toLowerCase();
}

function todayFrom(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw storeError('GRH_ACTION_LEDGER_ADAPTER_INVALID');
  return date.toISOString().slice(0, 10);
}

function latestDueDateFrom(today) {
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 180);
  return date.toISOString().slice(0, 10);
}

function normalizeCreate(input, clock) {
  const { tenantId } = normalizeBase(input);
  const { actorUserId, actorRole } = normalizeActor(input?.actorUserId, input?.actorRole);
  const commandId = normalizeUuid(input?.commandId);
  const snapshotAsOf = exactDate(input?.snapshotAsOf);
  const dueOn = exactDate(input?.dueOn);
  const priority = PRIORITIES[input?.priorityCode];
  const today = todayFrom(clock);

  if (!CREATOR_ROLES.has(actorRole) || !validVersion(input?.briefSchemaVersion) ||
      !validVersion(input?.briefPolicyVersion) || !SHA256_PATTERN.test(input?.sourceSha256 ?? '') ||
      !SHA256_PATTERN.test(input?.evidenceDigest ?? '') || !PERIOD_PATTERN.test(input?.period ?? '') ||
      !priority || input?.prioritySeverity !== priority.severity || input?.actionCode !== priority.actionCode ||
      !ASSIGNEE_ROLES.has(input?.assigneeRole) || !snapshotAsOf || !dueOn ||
      snapshotAsOf > today || dueOn > latestDueDateFrom(today) || dueOn < snapshotAsOf) {
    throw storeError('GRH_ACTION_LEDGER_INPUT_INVALID');
  }

  const normalized = Object.freeze({
    tenantId,
    actorUserId,
    actorRole,
    commandId,
    briefSchemaVersion: input.briefSchemaVersion,
    briefPolicyVersion: input.briefPolicyVersion,
    sourceSha256: input.sourceSha256,
    snapshotAsOf,
    period: input.period,
    priorityCode: input.priorityCode,
    prioritySeverity: priority.severity,
    databasePrioritySeverity: priority.databaseSeverity,
    actionCode: priority.actionCode,
    databaseActionCode: priority.databaseActionCode,
    evidenceDigest: input.evidenceDigest,
    assigneeRole: input.assigneeRole,
    dueOn,
    dueOnIsPast: dueOn < today,
  });
  return Object.freeze({
    ...normalized,
    payloadDigest: stableDigest({
      command: 'create',
      tenantId,
      actorUserId,
      actorRole,
      briefSchemaVersion: normalized.briefSchemaVersion,
      briefPolicyVersion: normalized.briefPolicyVersion,
      sourceSha256: normalized.sourceSha256,
      snapshotAsOf,
      period: normalized.period,
      priorityCode: normalized.priorityCode,
      prioritySeverity: normalized.prioritySeverity,
      actionCode: normalized.actionCode,
      evidenceDigest: normalized.evidenceDigest,
      assigneeRole: normalized.assigneeRole,
      dueOn,
    }),
  });
}

function normalizeTransition(input, clock) {
  const { tenantId } = normalizeBase(input);
  const { actorUserId, actorRole } = normalizeActor(input?.actorUserId, input?.actorRole);
  const commandId = normalizeUuid(input?.commandId);
  const commitmentId = normalizeUuid(input?.commitmentId);
  const command = input?.command;
  const reasonCode = input?.reasonCode ?? null;
  const outcomeCode = input?.outcomeCode ?? null;
  const dueOnProvided = input?.dueOn !== null && input?.dueOn !== undefined;
  const dueOn = dueOnProvided ? exactDate(input.dueOn) : null;
  let dueOnIsPast = false;

  if (!COMMANDS.has(command) || !Number.isInteger(input?.expectedVersion) || input.expectedVersion < 1 ||
      (dueOnProvided && !dueOn)) {
    throw storeError('GRH_ACTION_LEDGER_INPUT_INVALID');
  }
  if (command === 'block' ? !BLOCK_REASONS.has(reasonCode) : reasonCode !== null) {
    if (command !== 'cancel' || !CANCEL_REASONS.has(reasonCode)) {
      throw storeError('GRH_ACTION_LEDGER_INPUT_INVALID');
    }
  }
  if (command === 'cancel' && !CANCEL_REASONS.has(reasonCode)) {
    throw storeError('GRH_ACTION_LEDGER_INPUT_INVALID');
  }
  if (command === 'complete' ? !COMPLETION_OUTCOMES.has(outcomeCode) : outcomeCode !== null) {
    throw storeError('GRH_ACTION_LEDGER_INPUT_INVALID');
  }
  if (command === 'reschedule') {
    const today = todayFrom(clock);
    if (!dueOn || dueOn > latestDueDateFrom(today)) {
      throw storeError('GRH_ACTION_LEDGER_INPUT_INVALID');
    }
    dueOnIsPast = dueOn < today;
  } else if (dueOn !== null) {
    throw storeError('GRH_ACTION_LEDGER_INPUT_INVALID');
  }

  const normalized = Object.freeze({
    tenantId,
    actorUserId,
    actorRole,
    commandId,
    commitmentId,
    command,
    databaseCommand: DATABASE_COMMAND[command],
    expectedVersion: input.expectedVersion,
    reasonCode,
    outcomeCode,
    dueOn,
    dueOnIsPast,
  });
  return Object.freeze({
    ...normalized,
    payloadDigest: stableDigest({
      command,
      tenantId,
      actorUserId,
      actorRole,
      commitmentId,
      expectedVersion: normalized.expectedVersion,
      reasonCode,
      outcomeCode,
      dueOn,
    }),
  });
}

function publicCommitment(row, events = [], replayed = false) {
  if (!row || typeof row !== 'object' || !UUID_PATTERN.test(row.id ?? '') ||
      !validVersion(row.briefSchemaVersion) || !validVersion(row.briefPolicyVersion) ||
      !SHA256_PATTERN.test(row.sourceSha256 ?? '') || !SHA256_PATTERN.test(row.evidenceDigest ?? '') ||
      !PERIOD_PATTERN.test(row.period ?? '') || !Object.hasOwn(PRIORITIES, row.priorityCode) ||
      !['OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELED'].includes(row.state) ||
      !ASSIGNEE_ROLES.has(row.assigneeRole) || !Number.isInteger(row.version) || row.version < 1) {
    throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
  }
  if (!Array.isArray(events) || events.length < 1 || events.length > MAX_EVENTS_PER_COMMITMENT) {
    throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
  }
  const priority = PRIORITIES[row.priorityCode];
  if (row.prioritySeverity !== priority.databaseSeverity || row.actionCode !== priority.databaseActionCode) {
    throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
  }
  if (row.ownerUserId !== null && row.ownerUserId !== undefined && !validIdentifier(row.ownerUserId)) {
    throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
  }
  const snapshotAsOf = exactDate(row.snapshotAsOf);
  const dueOn = exactDate(row.dueOn);
  if (!snapshotAsOf || !dueOn) throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
  return Object.freeze({
    id: row.id.toLowerCase(),
    brief: Object.freeze({ schemaVersion: row.briefSchemaVersion, policyVersion: row.briefPolicyVersion }),
    source: Object.freeze({
      sha256: row.sourceSha256,
      snapshotAsOf,
      period: row.period,
      evidenceDigest: row.evidenceDigest,
    }),
    priority: Object.freeze({
      code: row.priorityCode,
      severity: priority.severity,
      actionCode: priority.actionCode,
    }),
    state: row.state,
    assigneeRole: row.assigneeRole,
    ownerUserId: row.ownerUserId ?? null,
    dueOn,
    version: row.version,
    outcomeCode: row.outcomeCode ?? null,
    createdAt: exactInstant(row.createdAt),
    updatedAt: exactInstant(row.updatedAt),
    events: Object.freeze(events.map(publicEvent)),
    replayed,
  });
}

function publicEvent(row) {
  const states = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELED'];
  const commands = ['CREATE', 'CLAIM', 'BLOCK', 'RESUME', 'COMPLETE', 'RESCHEDULE', 'CANCEL'];
  if (!row || typeof row !== 'object' || !UUID_PATTERN.test(row.eventId ?? '') ||
      !UUID_PATTERN.test(row.commandId ?? '') || !validIdentifier(row.actorUserId) ||
      !ACTOR_ROLES.has(row.actorRole) || !commands.includes(row.command) ||
      (row.fromState !== null && !states.includes(row.fromState)) || !states.includes(row.toState) ||
      !Number.isInteger(row.expectedVersion) || row.expectedVersion < 0 ||
      row.resultVersion !== row.expectedVersion + 1) {
    throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
  }
  const dueOn = row.dueOn === null || row.dueOn === undefined ? null : exactDate(row.dueOn);
  if (row.dueOn !== null && row.dueOn !== undefined && !dueOn) {
    throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
  }
  return Object.freeze({
    eventId: row.eventId.toLowerCase(),
    commandId: row.commandId.toLowerCase(),
    command: row.command.toLowerCase(),
    actorUserId: row.actorUserId,
    actorRole: row.actorRole,
    fromState: row.fromState,
    toState: row.toState,
    reasonCode: row.reasonCode ?? null,
    outcomeCode: row.outcomeCode ?? null,
    dueOn,
    expectedVersion: row.expectedVersion,
    resultVersion: row.resultVersion,
    occurredAt: exactInstant(row.occurredAt),
  });
}

async function listRows(client, tenantId) {
  return client.$queryRaw`
    /* grh-action-ledger:list-v1 */
    SELECT
      commitment."id",
      commitment."brief_schema_version" AS "briefSchemaVersion",
      commitment."brief_policy_version" AS "briefPolicyVersion",
      commitment."source_sha256" AS "sourceSha256",
      commitment."snapshot_as_of" AS "snapshotAsOf",
      commitment."period",
      commitment."priority_code" AS "priorityCode",
      commitment."priority_severity"::text AS "prioritySeverity",
      commitment."action_code"::text AS "actionCode",
      commitment."evidence_digest" AS "evidenceDigest",
      commitment."state"::text AS "state",
      commitment."assignee_role"::text AS "assigneeRole",
      commitment."owner_user_id" AS "ownerUserId",
      commitment."due_on" AS "dueOn",
      commitment."version",
      commitment."outcome_code" AS "outcomeCode",
      commitment."created_at" AS "createdAt",
      commitment."updated_at" AS "updatedAt"
    FROM "grh_action_commitments" AS commitment
    WHERE commitment."tenant_id" = ${tenantId}
    ORDER BY
      CASE commitment."state"
        WHEN 'BLOCKED' THEN 0
        WHEN 'OPEN' THEN 1
        WHEN 'IN_PROGRESS' THEN 2
        WHEN 'COMPLETED' THEN 3
        ELSE 4
      END,
      commitment."due_on",
      commitment."id"
    LIMIT ${MAX_COMMITMENTS + 1}
  `;
}

async function commandRows(client, { tenantId, commandId }) {
  return client.$queryRaw`
    /* grh-action-ledger:command-v1 */
    SELECT
      event."command"::text AS "eventCommand",
      event."payload_digest" AS "eventPayloadDigest",
      commitment."id",
      commitment."brief_schema_version" AS "briefSchemaVersion",
      commitment."brief_policy_version" AS "briefPolicyVersion",
      commitment."source_sha256" AS "sourceSha256",
      commitment."snapshot_as_of" AS "snapshotAsOf",
      commitment."period",
      commitment."priority_code" AS "priorityCode",
      commitment."priority_severity"::text AS "prioritySeverity",
      commitment."action_code"::text AS "actionCode",
      commitment."evidence_digest" AS "evidenceDigest",
      commitment."state"::text AS "state",
      commitment."assignee_role"::text AS "assigneeRole",
      commitment."owner_user_id" AS "ownerUserId",
      commitment."due_on" AS "dueOn",
      commitment."version",
      commitment."outcome_code" AS "outcomeCode",
      commitment."created_at" AS "createdAt",
      commitment."updated_at" AS "updatedAt"
    FROM "grh_action_commitment_events" AS event
    INNER JOIN "grh_action_commitments" AS commitment
      ON commitment."tenant_id" = event."tenant_id"
     AND commitment."id" = event."commitment_id"
    WHERE event."tenant_id" = ${tenantId}
      AND event."command_id" = ${commandId}::uuid
    LIMIT 2
  `;
}

async function tenantEventRows(client, tenantId) {
  return client.$queryRaw`
    /* grh-action-ledger:tenant-events-v1 */
    SELECT
      event."sequence",
      event."event_id" AS "eventId",
      event."commitment_id" AS "commitmentId",
      event."command_id" AS "commandId",
      event."actor_user_id" AS "actorUserId",
      event."actor_role"::text AS "actorRole",
      event."command"::text AS "command",
      event."from_state"::text AS "fromState",
      event."to_state"::text AS "toState",
      event."reason_code" AS "reasonCode",
      event."outcome_code" AS "outcomeCode",
      event."due_on" AS "dueOn",
      event."expected_version" AS "expectedVersion",
      event."result_version" AS "resultVersion",
      event."occurred_at" AS "occurredAt"
    FROM "grh_action_commitment_events" AS event
    WHERE event."tenant_id" = ${tenantId}
    ORDER BY event."commitment_id", event."sequence"
    LIMIT ${(MAX_COMMITMENTS * MAX_EVENTS_PER_COMMITMENT) + 1}
  `;
}

async function commitmentEventRows(client, { tenantId, commitmentId }) {
  return client.$queryRaw`
    /* grh-action-ledger:commitment-events-v1 */
    SELECT
      event."sequence",
      event."event_id" AS "eventId",
      event."commitment_id" AS "commitmentId",
      event."command_id" AS "commandId",
      event."actor_user_id" AS "actorUserId",
      event."actor_role"::text AS "actorRole",
      event."command"::text AS "command",
      event."from_state"::text AS "fromState",
      event."to_state"::text AS "toState",
      event."reason_code" AS "reasonCode",
      event."outcome_code" AS "outcomeCode",
      event."due_on" AS "dueOn",
      event."expected_version" AS "expectedVersion",
      event."result_version" AS "resultVersion",
      event."occurred_at" AS "occurredAt"
    FROM "grh_action_commitment_events" AS event
    WHERE event."tenant_id" = ${tenantId}
      AND event."commitment_id" = ${commitmentId}::uuid
    ORDER BY event."sequence"
    LIMIT ${MAX_EVENTS_PER_COMMITMENT + 1}
  `;
}

async function sourceRows(client, input) {
  return client.$queryRaw`
    /* grh-action-ledger:source-v1 */
    SELECT commitment."id"
    FROM "grh_action_commitments" AS commitment
    WHERE commitment."tenant_id" = ${input.tenantId}
      AND commitment."brief_schema_version" = ${input.briefSchemaVersion}
      AND commitment."brief_policy_version" = ${input.briefPolicyVersion}
      AND commitment."source_sha256" = ${input.sourceSha256}
      AND commitment."snapshot_as_of" = ${input.snapshotAsOf}::date
      AND commitment."period" = ${input.period}
      AND commitment."evidence_digest" = ${input.evidenceDigest}
      AND commitment."priority_code" = ${input.priorityCode}
    LIMIT 2
  `;
}

async function lockedTenantRows(client, tenantId) {
  return client.$queryRaw`
    /* grh-action-ledger:tenant-capacity-lock-v1 */
    SELECT tenant."id"
    FROM "tenants" AS tenant
    WHERE tenant."id" = ${tenantId}
    LIMIT 2
    FOR UPDATE
  `;
}

async function tenantCommitmentCountRows(client, tenantId) {
  return client.$queryRaw`
    /* grh-action-ledger:tenant-capacity-count-v1 */
    SELECT COUNT(*)::integer AS "count"
    FROM "grh_action_commitments" AS commitment
    WHERE commitment."tenant_id" = ${tenantId}
  `;
}

async function lockedCommitmentRows(client, { tenantId, commitmentId }) {
  return client.$queryRaw`
    /* grh-action-ledger:commitment-lock-v1 */
    SELECT
      commitment."id",
      commitment."brief_schema_version" AS "briefSchemaVersion",
      commitment."brief_policy_version" AS "briefPolicyVersion",
      commitment."source_sha256" AS "sourceSha256",
      commitment."snapshot_as_of" AS "snapshotAsOf",
      commitment."period",
      commitment."priority_code" AS "priorityCode",
      commitment."priority_severity"::text AS "prioritySeverity",
      commitment."action_code"::text AS "actionCode",
      commitment."evidence_digest" AS "evidenceDigest",
      commitment."state"::text AS "state",
      commitment."assignee_role"::text AS "assigneeRole",
      commitment."owner_user_id" AS "ownerUserId",
      commitment."due_on" AS "dueOn",
      commitment."version",
      commitment."outcome_code" AS "outcomeCode",
      commitment."created_at" AS "createdAt",
      commitment."updated_at" AS "updatedAt"
    FROM "grh_action_commitments" AS commitment
    WHERE commitment."tenant_id" = ${tenantId}
      AND commitment."id" = ${commitmentId}::uuid
    LIMIT 2
    FOR UPDATE
  `;
}

function replayRowOrCollision(rows, context) {
  if (!Array.isArray(rows) || rows.length > 1) throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
  if (rows.length === 0) return null;
  if (rows[0].eventCommand !== context.databaseCommand || rows[0].eventPayloadDigest !== context.payloadDigest) {
    throw storeError('GRH_ACTION_LEDGER_COMMAND_COLLISION');
  }
  return rows[0];
}

async function commitmentWithEvents(client, row, tenantId, replayed) {
  const events = await commitmentEventRows(client, { tenantId, commitmentId: row.id });
  if (!Array.isArray(events) || events.length > MAX_EVENTS_PER_COMMITMENT) {
    throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
  }
  return publicCommitment(row, events, replayed);
}

function transitionFor(row, context) {
  const isOwner = row.ownerUserId === context.actorUserId;
  const administrativeActor = CREATOR_ROLES.has(context.actorRole);
  switch (context.command) {
    case 'claim':
      if (row.state !== 'OPEN') throw storeError('GRH_ACTION_LEDGER_TRANSITION_INVALID');
      if (context.actorRole !== row.assigneeRole) throw storeError('GRH_ACTION_LEDGER_ASSIGNEE_ROLE_DENIED');
      return { toState: 'IN_PROGRESS', ownerUserId: context.actorUserId, dueOn: row.dueOn, outcomeCode: null };
    case 'block':
      if (row.state !== 'IN_PROGRESS') throw storeError('GRH_ACTION_LEDGER_TRANSITION_INVALID');
      if (!isOwner) throw storeError('GRH_ACTION_LEDGER_OWNERSHIP_DENIED');
      return { toState: 'BLOCKED', ownerUserId: row.ownerUserId, dueOn: row.dueOn, outcomeCode: null };
    case 'resume':
      if (row.state !== 'BLOCKED') throw storeError('GRH_ACTION_LEDGER_TRANSITION_INVALID');
      if (!isOwner) throw storeError('GRH_ACTION_LEDGER_OWNERSHIP_DENIED');
      return { toState: 'IN_PROGRESS', ownerUserId: row.ownerUserId, dueOn: row.dueOn, outcomeCode: null };
    case 'complete':
      if (row.state !== 'IN_PROGRESS') throw storeError('GRH_ACTION_LEDGER_TRANSITION_INVALID');
      if (!isOwner) throw storeError('GRH_ACTION_LEDGER_OWNERSHIP_DENIED');
      return { toState: 'COMPLETED', ownerUserId: row.ownerUserId, dueOn: row.dueOn, outcomeCode: context.outcomeCode };
    case 'reschedule':
      if (!['OPEN', 'IN_PROGRESS', 'BLOCKED'].includes(row.state)) {
        throw storeError('GRH_ACTION_LEDGER_TRANSITION_INVALID');
      }
      if (!administrativeActor) throw storeError('GRH_ACTION_LEDGER_OWNERSHIP_DENIED');
      return { toState: row.state, ownerUserId: row.ownerUserId, dueOn: context.dueOn, outcomeCode: null };
    case 'cancel':
      if (!['OPEN', 'IN_PROGRESS', 'BLOCKED'].includes(row.state)) {
        throw storeError('GRH_ACTION_LEDGER_TRANSITION_INVALID');
      }
      if (!administrativeActor) throw storeError('GRH_ACTION_LEDGER_OWNERSHIP_DENIED');
      return { toState: 'CANCELED', ownerUserId: row.ownerUserId, dueOn: row.dueOn, outcomeCode: null };
    default:
      throw storeError('GRH_ACTION_LEDGER_INPUT_INVALID');
  }
}

async function insertCommitment(client, input, commitmentId) {
  return client.$queryRaw`
    /* grh-action-ledger:create-commitment-v1 */
    INSERT INTO "grh_action_commitments" (
      "id", "tenant_id", "brief_schema_version", "brief_policy_version", "source_sha256",
      "snapshot_as_of", "period", "priority_code", "priority_severity", "action_code",
      "evidence_digest", "state", "assignee_role", "owner_user_id", "due_on", "version",
      "outcome_code", "created_by_user_id", "created_at", "updated_at"
    ) VALUES (
      ${commitmentId}::uuid, ${input.tenantId}, ${input.briefSchemaVersion}, ${input.briefPolicyVersion},
      ${input.sourceSha256}, ${input.snapshotAsOf}::date, ${input.period}, ${input.priorityCode},
      ${input.databasePrioritySeverity}::"GrhActionPrioritySeverity",
      ${input.databaseActionCode}::"GrhActionCode", ${input.evidenceDigest}, 'OPEN',
      ${input.assigneeRole}::"Role", NULL, ${input.dueOn}::date, 1, NULL, ${input.actorUserId},
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    RETURNING
      "id", "brief_schema_version" AS "briefSchemaVersion", "brief_policy_version" AS "briefPolicyVersion",
      "source_sha256" AS "sourceSha256", "snapshot_as_of" AS "snapshotAsOf", "period",
      "priority_code" AS "priorityCode", "priority_severity"::text AS "prioritySeverity",
      "action_code"::text AS "actionCode", "evidence_digest" AS "evidenceDigest", "state"::text AS "state",
      "assignee_role"::text AS "assigneeRole", "owner_user_id" AS "ownerUserId", "due_on" AS "dueOn",
      "version", "outcome_code" AS "outcomeCode", "created_at" AS "createdAt", "updated_at" AS "updatedAt"
  `;
}

async function insertEvent(client, input) {
  return client.$queryRaw`
    /* grh-action-ledger:append-event-v1 */
    INSERT INTO "grh_action_commitment_events" (
      "event_id", "tenant_id", "commitment_id", "command_id", "payload_digest", "actor_user_id",
      "actor_role", "command", "from_state", "to_state", "reason_code", "outcome_code", "due_on",
      "expected_version", "result_version", "occurred_at"
    ) VALUES (
      ${input.eventId}::uuid, ${input.tenantId}, ${input.commitmentId}::uuid, ${input.commandId}::uuid,
      ${input.payloadDigest}, ${input.actorUserId}, ${input.actorRole}::"Role",
      ${input.databaseCommand}::"GrhActionLedgerCommand",
      ${input.fromState}::"GrhActionCommitmentState", ${input.toState}::"GrhActionCommitmentState",
      ${input.reasonCode}, ${input.outcomeCode}, ${input.eventDueOn}::date,
      ${input.expectedVersion}, ${input.resultVersion}, CURRENT_TIMESTAMP
    )
    RETURNING "sequence"
  `;
}

async function updateCommitment(client, input, transition) {
  return client.$queryRaw`
    /* grh-action-ledger:update-commitment-v1 */
    UPDATE "grh_action_commitments"
    SET
      "state" = ${transition.toState}::"GrhActionCommitmentState",
      "owner_user_id" = ${transition.ownerUserId},
      "due_on" = ${transition.dueOn}::date,
      "outcome_code" = ${transition.outcomeCode},
      "version" = "version" + 1,
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "tenant_id" = ${input.tenantId}
      AND "id" = ${input.commitmentId}::uuid
      AND "version" = ${input.expectedVersion}
    RETURNING
      "id", "brief_schema_version" AS "briefSchemaVersion", "brief_policy_version" AS "briefPolicyVersion",
      "source_sha256" AS "sourceSha256", "snapshot_as_of" AS "snapshotAsOf", "period",
      "priority_code" AS "priorityCode", "priority_severity"::text AS "prioritySeverity",
      "action_code"::text AS "actionCode", "evidence_digest" AS "evidenceDigest", "state"::text AS "state",
      "assignee_role"::text AS "assigneeRole", "owner_user_id" AS "ownerUserId", "due_on" AS "dueOn",
      "version", "outcome_code" AS "outcomeCode", "created_at" AS "createdAt", "updated_at" AS "updatedAt"
  `;
}

function transactionOptions(isolationLevel = 'Serializable') {
  return { isolationLevel, maxWait: 2_000, timeout: 5_000 };
}

function validGeneratedUuid(value) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw storeError('GRH_ACTION_LEDGER_ADAPTER_INVALID');
  }
  return value.toLowerCase();
}

function isPrismaWriteConflict(error) {
  return Boolean(error && typeof error === 'object' && error.code === 'P2034');
}

export function createGrhActionLedgerStore({
  client = prisma,
  assertTransport = assertPrismaDatabaseTransport,
  clock = () => new Date(),
  idFactory = randomUUID,
} = {}) {
  if (!client || typeof client.$queryRaw !== 'function' || typeof client.$transaction !== 'function' ||
      typeof assertTransport !== 'function' || typeof clock !== 'function' || typeof idFactory !== 'function') {
    throw storeError('GRH_ACTION_LEDGER_ADAPTER_INVALID');
  }

  async function recoverCreateRace(input, error) {
    if (error instanceof GrhActionLedgerStoreError) throw error;
    try {
      const replay = replayRowOrCollision(await commandRows(client, input), {
        databaseCommand: 'CREATE',
        payloadDigest: input.payloadDigest,
      });
      if (replay) return commitmentWithEvents(client, replay, input.tenantId, true);
      const duplicates = await sourceRows(client, input);
      if (!Array.isArray(duplicates) || duplicates.length > 1) {
        throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
      }
      if (duplicates.length === 1) throw storeError('GRH_ACTION_LEDGER_COMMITMENT_ALREADY_EXISTS');
    } catch (recoveryError) {
      if (recoveryError instanceof GrhActionLedgerStoreError) throw recoveryError;
      throw storeError('GRH_ACTION_LEDGER_DATABASE_UNAVAILABLE');
    }
    if (isPrismaWriteConflict(error)) throw storeError('GRH_ACTION_LEDGER_VERSION_CONFLICT');
    throw storeError('GRH_ACTION_LEDGER_DATABASE_UNAVAILABLE');
  }

  async function recoverTransitionRace(input, error) {
    if (error instanceof GrhActionLedgerStoreError) throw error;
    try {
      const replay = replayRowOrCollision(await commandRows(client, input), input);
      if (replay) return commitmentWithEvents(client, replay, input.tenantId, true);
    } catch (recoveryError) {
      if (recoveryError instanceof GrhActionLedgerStoreError) throw recoveryError;
      throw storeError('GRH_ACTION_LEDGER_DATABASE_UNAVAILABLE');
    }
    if (isPrismaWriteConflict(error)) throw storeError('GRH_ACTION_LEDGER_VERSION_CONFLICT');
    throw storeError('GRH_ACTION_LEDGER_DATABASE_UNAVAILABLE');
  }

  return Object.freeze({
    async listCommitments(input) {
      const { tenantId } = normalizeBase(input);
      normalizeTransport(assertTransport);
      try {
        return await client.$transaction(async transaction => {
          const rows = await listRows(transaction, tenantId);
          if (!Array.isArray(rows) || rows.length > MAX_COMMITMENTS) {
            throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
          }
          const events = await tenantEventRows(transaction, tenantId);
          if (!Array.isArray(events) || events.length > MAX_COMMITMENTS * MAX_EVENTS_PER_COMMITMENT) {
            throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
          }
          const grouped = new Map(rows.map(row => [row.id, []]));
          for (const event of events) {
            const timeline = grouped.get(event.commitmentId);
            if (!timeline) throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
            timeline.push(event);
            if (timeline.length > MAX_EVENTS_PER_COMMITMENT) {
              throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
            }
          }
          return Object.freeze(rows.map(row => publicCommitment(row, grouped.get(row.id), false)));
        }, { isolationLevel: 'RepeatableRead', maxWait: 2_000, timeout: 5_000 });
      } catch (error) {
        if (error instanceof GrhActionLedgerStoreError) throw error;
        throw storeError('GRH_ACTION_LEDGER_DATABASE_UNAVAILABLE');
      }
    },

    async createCommitment(input) {
      const context = normalizeCreate(input, clock);
      normalizeTransport(assertTransport);
      let commitmentId;
      let eventId;
      try {
        commitmentId = validGeneratedUuid(idFactory());
        eventId = validGeneratedUuid(idFactory());
      } catch (error) {
        if (error instanceof GrhActionLedgerStoreError) throw error;
        throw storeError('GRH_ACTION_LEDGER_ADAPTER_INVALID');
      }

      try {
        return await client.$transaction(async transaction => {
          const tenantRows = await lockedTenantRows(transaction, context.tenantId);
          if (!Array.isArray(tenantRows) || tenantRows.length !== 1 ||
              tenantRows[0]?.id !== context.tenantId) {
            throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
          }
          const replay = replayRowOrCollision(await commandRows(transaction, context), {
            databaseCommand: 'CREATE',
            payloadDigest: context.payloadDigest,
          });
          if (replay) return commitmentWithEvents(transaction, replay, context.tenantId, true);
          if (context.dueOnIsPast) throw storeError('GRH_ACTION_LEDGER_INPUT_INVALID');
          const duplicates = await sourceRows(transaction, context);
          if (!Array.isArray(duplicates) || duplicates.length > 1) {
            throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
          }
          if (duplicates.length === 1) throw storeError('GRH_ACTION_LEDGER_COMMITMENT_ALREADY_EXISTS');

          const countRows = await tenantCommitmentCountRows(transaction, context.tenantId);
          if (!Array.isArray(countRows) || countRows.length !== 1 ||
              !Number.isInteger(countRows[0]?.count) || countRows[0].count < 0) {
            throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
          }
          if (countRows[0].count >= MAX_COMMITMENTS) {
            throw storeError('GRH_ACTION_LEDGER_CAPACITY_REACHED');
          }

          const rows = await insertCommitment(transaction, context, commitmentId);
          if (!Array.isArray(rows) || rows.length !== 1) throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
          const eventRows = await insertEvent(transaction, {
            ...context,
            eventId,
            commitmentId,
            databaseCommand: 'CREATE',
            fromState: null,
            toState: 'OPEN',
            reasonCode: null,
            outcomeCode: null,
            eventDueOn: context.dueOn,
            expectedVersion: 0,
            resultVersion: 1,
          });
          if (!Array.isArray(eventRows) || eventRows.length !== 1) {
            throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
          }
          return commitmentWithEvents(transaction, rows[0], context.tenantId, false);
        }, transactionOptions('ReadCommitted'));
      } catch (error) {
        return recoverCreateRace(context, error);
      }
    },

    async transitionCommitment(input) {
      const context = normalizeTransition(input, clock);
      normalizeTransport(assertTransport);
      let eventId;
      try {
        eventId = validGeneratedUuid(idFactory());
      } catch (error) {
        if (error instanceof GrhActionLedgerStoreError) throw error;
        throw storeError('GRH_ACTION_LEDGER_ADAPTER_INVALID');
      }

      try {
        return await client.$transaction(async transaction => {
          const replay = replayRowOrCollision(await commandRows(transaction, context), context);
          if (replay) return commitmentWithEvents(transaction, replay, context.tenantId, true);
          if (context.dueOnIsPast) throw storeError('GRH_ACTION_LEDGER_INPUT_INVALID');

          const lockedRows = await lockedCommitmentRows(transaction, context);
          if (!Array.isArray(lockedRows) || lockedRows.length > 1) {
            throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
          }
          if (lockedRows.length === 0) throw storeError('GRH_ACTION_LEDGER_COMMITMENT_NOT_FOUND');
          const current = lockedRows[0];
          if (current.version !== context.expectedVersion) {
            throw storeError('GRH_ACTION_LEDGER_VERSION_CONFLICT');
          }
          const transition = transitionFor(current, context);
          const rows = await updateCommitment(transaction, context, transition);
          if (!Array.isArray(rows) || rows.length !== 1) {
            throw storeError('GRH_ACTION_LEDGER_VERSION_CONFLICT');
          }
          const eventRows = await insertEvent(transaction, {
            ...context,
            eventId,
            fromState: current.state,
            toState: transition.toState,
            eventDueOn: context.command === 'reschedule' ? context.dueOn : null,
            resultVersion: context.expectedVersion + 1,
          });
          if (!Array.isArray(eventRows) || eventRows.length !== 1) {
            throw storeError('GRH_ACTION_LEDGER_DATA_INVALID');
          }
          return commitmentWithEvents(transaction, rows[0], context.tenantId, false);
        }, transactionOptions());
      } catch (error) {
        return recoverTransitionRace(context, error);
      }
    },
  });
}

export const grhActionLedgerStore = createGrhActionLedgerStore();

export function listCommitments(input) {
  return grhActionLedgerStore.listCommitments(input);
}

export function createCommitment(input) {
  return grhActionLedgerStore.createCommitment(input);
}

export function transitionCommitment(input) {
  return grhActionLedgerStore.transitionCommitment(input);
}

export default grhActionLedgerStore;
