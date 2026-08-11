import { createHash } from 'node:crypto';

import {
  GRH_ACTION_LEDGER_ACTION_DEFINITIONS,
  GRH_ACTION_LEDGER_COMMANDS,
  GRH_ACTION_LEDGER_LIMITS,
  GRH_ACTION_LEDGER_SCHEMA_VERSION,
  inspectGrhActionLedgerContract,
} from './grh-action-ledger-contract.js';
import {
  GRH_DECISION_BRIEF_SCHEMA_VERSION,
  inspectGrhDecisionBriefContract,
} from './grh-decision-brief-contract.js';
import { GRH_PRIVACY_POLICY_VERSION } from './grh-privacy.js';

const READ_ROLES = new Set(['INTENDENTE', 'TENANT_ADMIN', 'CONTADOR']);
const UPDATE_ROLES = new Set(['INTENDENTE', 'TENANT_ADMIN', 'CONTADOR']);
const ACTIVE_STATES = new Set(['open', 'in_progress', 'blocked']);
const RAW_COMMITMENT_KEYS = Object.freeze([
  'id', 'brief', 'source', 'priority', 'state', 'assigneeRole', 'ownerUserId', 'dueOn',
  'version', 'outcomeCode', 'createdAt', 'updatedAt', 'events', 'replayed',
]);
const RAW_EVENT_KEYS = Object.freeze([
  'eventId', 'commandId', 'command', 'actorUserId', 'actorRole', 'fromState', 'toState',
  'reasonCode', 'outcomeCode', 'dueOn', 'expectedVersion', 'resultVersion', 'occurredAt',
]);
const RAW_STATES = new Set(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELED']);
const RAW_ROLES = new Set(['INTENDENTE', 'TENANT_ADMIN', 'CONTADOR']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_COMMITMENTS = 100;

function ledgerError(code, details = []) {
  const error = new Error('GRH action ledger projection unavailable');
  error.code = code;
  error.details = Object.freeze([...new Set(details)]);
  return error;
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys) {
  if (!plainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function validRawDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value;
}

function validRawInstant(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function assertRawCommitment(row) {
  const definition = actionDefinition(row?.priority?.code);
  if (!exactKeys(row, RAW_COMMITMENT_KEYS) || !UUID.test(row.id || '') ||
      !exactKeys(row.brief, ['schemaVersion', 'policyVersion']) ||
      !exactKeys(row.source, ['sha256', 'snapshotAsOf', 'period', 'evidenceDigest']) ||
      !exactKeys(row.priority, ['code', 'severity', 'actionCode']) ||
      row.brief.schemaVersion !== GRH_DECISION_BRIEF_SCHEMA_VERSION ||
      row.brief.policyVersion !== GRH_PRIVACY_POLICY_VERSION ||
      !SHA256.test(row.source.sha256 || '') || !SHA256.test(row.source.evidenceDigest || '') ||
      !validRawDate(row.source.snapshotAsOf) || !PERIOD.test(row.source.period || '') ||
      row.source.period > row.source.snapshotAsOf.slice(0, 7) || !definition ||
      row.priority.severity !== definition.severity ||
      row.priority.actionCode !== definition.actionCode ||
      !RAW_STATES.has(row.state) || !RAW_ROLES.has(row.assigneeRole) ||
      !(row.ownerUserId === null || (typeof row.ownerUserId === 'string' && row.ownerUserId.length > 0)) ||
      !validRawDate(row.dueOn) || !Number.isSafeInteger(row.version) || row.version < 1 ||
      !validRawInstant(row.createdAt) || !validRawInstant(row.updatedAt) ||
      !Array.isArray(row.events) || row.events.length < 1 || typeof row.replayed !== 'boolean') {
    throw ledgerError('GRH_ACTION_LEDGER_STORE_INVALID');
  }
  const expectedDigest = digestGrhActionLedgerPayload({
    schemaVersion: row.brief.schemaVersion,
    policyVersion: row.brief.policyVersion,
    sourceSha256: row.source.sha256,
    snapshotAsOf: row.source.snapshotAsOf,
    period: row.source.period,
    priorityCode: row.priority.code,
    severity: row.priority.severity,
    actionCode: row.priority.actionCode,
  });
  if (row.source.evidenceDigest !== expectedDigest) {
    throw ledgerError('GRH_ACTION_LEDGER_STORE_INVALID');
  }
  for (const event of row.events) {
    if (!exactKeys(event, RAW_EVENT_KEYS) || !UUID.test(event.eventId || '') ||
        !UUID.test(event.commandId || '') || typeof event.command !== 'string' ||
        typeof event.actorUserId !== 'string' || !event.actorUserId ||
        !RAW_ROLES.has(event.actorRole) ||
        !(event.fromState === null || RAW_STATES.has(event.fromState)) ||
        !RAW_STATES.has(event.toState) || !Number.isSafeInteger(event.expectedVersion) ||
        !Number.isSafeInteger(event.resultVersion) || !validRawInstant(event.occurredAt)) {
      throw ledgerError('GRH_ACTION_LEDGER_STORE_INVALID');
    }
  }
}

export function digestGrhActionLedgerPayload(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function actionDefinition(priorityCode) {
  return GRH_ACTION_LEDGER_ACTION_DEFINITIONS.find(
    definition => definition.priorityCode === priorityCode,
  ) || null;
}

function sourceForBrief(brief, definition) {
  const source = {
    schemaVersion: brief.schemaVersion,
    policyVersion: brief.policyVersion,
    sourceSha256: brief.source.sourceSha256,
    snapshotAsOf: brief.source.snapshotAsOf,
    period: brief.period,
  };
  return deepFreeze({
    ...source,
    evidenceDigest: digestGrhActionLedgerPayload({
      ...source,
      priorityCode: definition.priorityCode,
      severity: definition.severity,
      actionCode: definition.actionCode,
    }),
  });
}

export function buildGrhActionLedgerEvidence(brief, priorityCode) {
  const inspection = inspectGrhDecisionBriefContract(brief);
  const definition = actionDefinition(priorityCode);
  const priority = Array.isArray(brief?.priorities)
    ? brief.priorities.find(row => row?.code === priorityCode)
    : null;
  if (!inspection.ok || !definition || priority?.severity !== definition.severity) {
    throw ledgerError('GRH_ACTION_LEDGER_EVIDENCE_INVALID', inspection.errors);
  }
  return sourceForBrief(brief, definition);
}

export function buildGrhActionLedgerPermissions(caller, { publishedDemo = false } = {}) {
  const role = caller?.role;
  const mutationAllowed = !publishedDemo;
  return deepFreeze({
    canRead: READ_ROLES.has(role),
    canCreate: mutationAllowed && role === 'INTENDENTE',
    canUpdate: mutationAllowed && UPDATE_ROLES.has(role),
    canCancel: mutationAllowed && role === 'INTENDENTE',
    canReschedule: mutationAllowed && role === 'INTENDENTE',
  });
}

function normalizeState(value) {
  return typeof value === 'string' ? value.toLowerCase() : value;
}

function normalizeCommand(value) {
  return typeof value === 'string' ? value.toLowerCase() : value;
}

function normalizeOutcome(value) {
  return typeof value === 'string' ? value.toLowerCase() : value ?? null;
}

function normalizeReason(value) {
  return typeof value === 'string' ? value.toLowerCase() : value ?? null;
}

function normalizeDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  return typeof value === 'string' ? value.slice(0, 10) : value;
}

function normalizeInstant(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value !== 'string') return value;
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? new Date(instant).toISOString() : value;
}

function rawSource(row) {
  return {
    schemaVersion: row?.brief?.schemaVersion,
    policyVersion: row?.brief?.policyVersion,
    sourceSha256: row?.source?.sha256,
    snapshotAsOf: normalizeDate(row?.source?.snapshotAsOf),
    period: row?.source?.period,
    evidenceDigest: row?.source?.evidenceDigest,
  };
}

function sameSource(left, right) {
  return left.schemaVersion === right.schemaVersion &&
    left.policyVersion === right.policyVersion &&
    left.sourceSha256 === right.sourceSha256 &&
    left.snapshotAsOf === right.snapshotAsOf &&
    left.period === right.period &&
    left.evidenceDigest === right.evidenceDigest;
}

function validatedRawCommitments(rows) {
  if (!Array.isArray(rows) || rows.length > MAX_COMMITMENTS) {
    throw ledgerError('GRH_ACTION_LEDGER_STORE_INVALID');
  }
  rows.forEach(assertRawCommitment);
  return rows;
}

function rawOwnerId(row) {
  return row?.ownerUserId ?? null;
}

function rawActorId(event) {
  return event?.actorUserId ?? null;
}

function availableTransitions(row, caller, permissions) {
  if (!permissions.canUpdate) return [];
  const state = normalizeState(row?.state);
  if (!ACTIVE_STATES.has(state)) return [];
  const commands = [];
  const ownerId = rawOwnerId(row);
  const isOwner = typeof ownerId === 'string' && ownerId === caller.id;
  if (state === 'open' && ownerId === null && caller.role === row?.assigneeRole) {
    commands.push('claim');
  }
  if (isOwner && state === 'in_progress') commands.push('block', 'complete');
  if (isOwner && state === 'blocked') commands.push('resume');
  if (permissions.canReschedule) commands.push('reschedule');
  if (permissions.canCancel) commands.push('cancel');
  return GRH_ACTION_LEDGER_COMMANDS.filter(command => commands.includes(command));
}

function projectEvent(event, index, caller) {
  return {
    sequence: index + 1,
    command: normalizeCommand(event?.command),
    fromState: event?.fromState === null ? null : normalizeState(event?.fromState),
    toState: normalizeState(event?.toState),
    actorRole: event?.actorRole,
    isCurrentUser: rawActorId(event) === caller.id,
    reasonCode: normalizeReason(event?.reasonCode),
    dueOn: event?.dueOn === null || event?.dueOn === undefined
      ? null
      : normalizeDate(event.dueOn),
    outcomeCode: normalizeOutcome(event?.outcomeCode),
    resultingVersion: Number(event?.resultVersion),
    occurredAt: normalizeInstant(event?.occurredAt),
  };
}

function projectCommitment(row, caller, permissions, today) {
  const priorityCode = row?.priority?.code;
  const severity = row?.priority?.severity;
  const actionCode = row?.priority?.actionCode;
  const state = normalizeState(row?.state);
  const dueOn = normalizeDate(row?.dueOn);
  return {
    id: row?.id,
    version: Number(row?.version),
    priorityCode,
    severity,
    actionCode,
    state,
    assignee: {
      role: row?.assigneeRole,
      isCurrentUser: rawOwnerId(row) === caller.id,
    },
    dueOn,
    overdue: ACTIVE_STATES.has(state) && typeof dueOn === 'string' && dueOn < today,
    outcomeCode: normalizeOutcome(row?.outcomeCode),
    source: rawSource(row),
    availableTransitions: availableTransitions(row, caller, permissions),
    events: Array.isArray(row?.events)
      ? row.events.map((event, index) => projectEvent(event, index, caller))
      : row?.events,
    createdAt: normalizeInstant(row?.createdAt),
    updatedAt: normalizeInstant(row?.updatedAt),
  };
}

function summaryFor(commitments) {
  return {
    total: commitments.length,
    open: commitments.filter(row => row.state === 'open').length,
    inProgress: commitments.filter(row => row.state === 'in_progress').length,
    blocked: commitments.filter(row => row.state === 'blocked').length,
    completed: commitments.filter(row => row.state === 'completed').length,
    canceled: commitments.filter(row => row.state === 'canceled').length,
    overdue: commitments.filter(row => row.overdue).length,
  };
}

function instantFromNow(now) {
  const value = typeof now === 'function' ? now() : now;
  const instant = value instanceof Date ? value : new Date(value ?? Date.now());
  if (!Number.isFinite(instant.getTime())) throw ledgerError('GRH_ACTION_LEDGER_CLOCK_INVALID');
  return instant;
}

export function buildGrhActionLedgerProjection({
  brief,
  commitments: rawCommitments,
  caller,
  publishedDemo = false,
  now = () => new Date(),
} = {}) {
  const briefInspection = inspectGrhDecisionBriefContract(brief);
  if (!briefInspection.ok || typeof caller?.id !== 'string' || !caller.id ||
      !READ_ROLES.has(caller?.role)) {
    throw ledgerError('GRH_ACTION_LEDGER_SOURCE_INVALID', briefInspection.errors);
  }

  const permissions = buildGrhActionLedgerPermissions(caller, { publishedDemo });
  const actionablePriorities = GRH_ACTION_LEDGER_ACTION_DEFINITIONS.filter(definition =>
    brief.priorities.some(priority =>
      priority.code === definition.priorityCode && priority.severity === definition.severity));
  const evidenceByPriority = new Map(actionablePriorities.map(definition => [
    definition.priorityCode,
    sourceForBrief(brief, definition),
  ]));
  const today = instantFromNow(now).toISOString().slice(0, 10);
  const validatedRows = validatedRawCommitments(rawCommitments);
  const currentRows = validatedRows.filter(row => {
    const expected = evidenceByPriority.get(row.priority.code);
    return expected && sameSource(rawSource(row), expected);
  });
  const atCapacity = validatedRows.length >= MAX_COMMITMENTS;
  const commitments = validatedRows
    .map(row => projectCommitment(row, caller, permissions, today))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) ||
      left.id.localeCompare(right.id));

  const existingByPriority = new Map();
  for (const row of currentRows) {
    if (existingByPriority.has(row.priority.code)) {
      throw ledgerError('GRH_ACTION_LEDGER_STORE_INVALID');
    }
    existingByPriority.set(row.priority.code, row.id);
  }
  const suggestions = actionablePriorities.map(definition => {
    const existingCommitmentId = existingByPriority.get(definition.priorityCode) || null;
    return {
      priorityCode: definition.priorityCode,
      severity: definition.severity,
      actionCode: definition.actionCode,
      defaultAssigneeRole: definition.defaultAssigneeRole,
      available: permissions.canCreate && !atCapacity && existingCommitmentId === null,
      existingCommitmentId,
      href: definition.href,
    };
  });

  const projection = {
    schemaVersion: GRH_ACTION_LEDGER_SCHEMA_VERSION,
    currentBrief: {
      schemaVersion: brief.schemaVersion,
      sourceSha256: brief.source.sourceSha256,
      snapshotAsOf: brief.source.snapshotAsOf,
      period: brief.period,
      status: brief.status,
    },
    permissions,
    summary: summaryFor(commitments),
    suggestions,
    commitments,
    limits: [...GRH_ACTION_LEDGER_LIMITS],
  };
  const inspection = inspectGrhActionLedgerContract(projection);
  if (!inspection.ok) {
    throw ledgerError('GRH_ACTION_LEDGER_PROJECTION_INVALID', inspection.errors);
  }
  return deepFreeze(projection);
}
