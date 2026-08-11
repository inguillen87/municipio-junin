import { GRH_DECISION_BRIEF_SCHEMA_VERSION } from './grh-decision-brief-contract.js';
import { GRH_PRIVACY_POLICY_VERSION } from './grh-privacy.js';

export const GRH_ACTION_LEDGER_SCHEMA_VERSION = 'grh-action-ledger-v1';

export const GRH_ACTION_LEDGER_STATES = Object.freeze([
  'open',
  'in_progress',
  'blocked',
  'completed',
  'canceled',
]);

export const GRH_ACTION_LEDGER_COMMANDS = Object.freeze([
  'create',
  'claim',
  'block',
  'resume',
  'complete',
  'reschedule',
  'cancel',
]);

export const GRH_ACTION_LEDGER_REASON_CODES = Object.freeze([
  'dependency_pending',
  'source_review_required',
  'owner_unavailable',
  'priority_withdrawn',
  'duplicate_commitment',
]);

export const GRH_ACTION_LEDGER_OUTCOME_CODES = Object.freeze([
  'review_completed',
  'correction_requested',
  'no_change_required',
]);

export const GRH_ACTION_LEDGER_LIMITS = Object.freeze([
  'human_creation_required',
  'new_commitments_current_brief_only',
  'no_automatic_assignment',
  'no_approval_or_delegation',
  'snapshot_evidence_not_realtime',
  'no_free_text_v1',
]);

export const GRH_ACTION_LEDGER_ACTION_DEFINITIONS = Object.freeze([
  Object.freeze({
    priorityCode: 'cross_source_material_difference',
    severity: 'critical',
    actionCode: 'review_cross_source_reconciliation',
    defaultAssigneeRole: 'CONTADOR',
    href: 'hacienda.html',
  }),
  Object.freeze({
    priorityCode: 'temporal_quarantine_present',
    severity: 'warning',
    actionCode: 'review_temporal_quarantine',
    defaultAssigneeRole: 'TENANT_ADMIN',
    href: 'control.html',
  }),
]);

const SHAPES = Object.freeze({
  top: [
    'schemaVersion',
    'currentBrief',
    'permissions',
    'summary',
    'suggestions',
    'commitments',
    'limits',
  ],
  currentBrief: ['schemaVersion', 'sourceSha256', 'snapshotAsOf', 'period', 'status'],
  permissions: ['canRead', 'canCreate', 'canUpdate', 'canCancel', 'canReschedule'],
  summary: ['total', 'open', 'inProgress', 'blocked', 'completed', 'canceled', 'overdue'],
  suggestion: [
    'priorityCode',
    'severity',
    'actionCode',
    'defaultAssigneeRole',
    'available',
    'existingCommitmentId',
    'href',
  ],
  commitment: [
    'id',
    'version',
    'priorityCode',
    'severity',
    'actionCode',
    'state',
    'assignee',
    'dueOn',
    'overdue',
    'outcomeCode',
    'source',
    'availableTransitions',
    'events',
    'createdAt',
    'updatedAt',
  ],
  assignee: ['role', 'isCurrentUser'],
  source: [
    'schemaVersion',
    'policyVersion',
    'sourceSha256',
    'snapshotAsOf',
    'period',
    'evidenceDigest',
  ],
  event: [
    'sequence',
    'command',
    'fromState',
    'toState',
    'actorRole',
    'isCurrentUser',
    'reasonCode',
    'dueOn',
    'outcomeCode',
    'resultingVersion',
    'occurredAt',
  ],
});

const MONTH_PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;
const SHA256 = /^[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CURRENT_BRIEF_STATUSES = new Set([
  'attention_required',
  'review_recommended',
  'context_only',
]);
const ACTOR_ROLES = new Set(['INTENDENTE', 'TENANT_ADMIN', 'CONTADOR']);
const ASSIGNEE_ROLES = new Set(['TENANT_ADMIN', 'CONTADOR']);
const STATE_SET = new Set(GRH_ACTION_LEDGER_STATES);
const COMMAND_SET = new Set(GRH_ACTION_LEDGER_COMMANDS);
const REASON_SET = new Set(GRH_ACTION_LEDGER_REASON_CODES);
const OUTCOME_SET = new Set(GRH_ACTION_LEDGER_OUTCOME_CODES);
const TERMINAL_STATES = new Set(['completed', 'canceled']);
const MAX_COMMITMENTS = 100;
const MAX_EVENTS_PER_COMMITMENT = 128;

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

function add(errors, condition, code) {
  if (!condition) errors.push(code);
}

function addShape(errors, value, keys, code) {
  add(errors, exactKeys(value, keys), code);
}

function validDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return false;
  const instant = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(instant)) return false;
  const date = new Date(instant);
  return date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]);
}

function validInstant(value) {
  if (typeof value !== 'string' || value.length < 20 || value.length > 35) return false;
  const instant = Date.parse(value);
  return Number.isFinite(instant) && new Date(instant).toISOString() === value;
}

function definitionForPriority(priorityCode) {
  return GRH_ACTION_LEDGER_ACTION_DEFINITIONS.find(
    definition => definition.priorityCode === priorityCode,
  ) || null;
}

function inspectSource(errors, source, prefix) {
  addShape(errors, source, SHAPES.source, `${prefix}.structure`);
  add(errors, source?.schemaVersion === GRH_DECISION_BRIEF_SCHEMA_VERSION,
    `${prefix}.schema_version`);
  add(errors, source?.policyVersion === GRH_PRIVACY_POLICY_VERSION,
    `${prefix}.policy_version`);
  add(errors, SHA256.test(source?.sourceSha256 || ''), `${prefix}.source_sha256`);
  add(errors, validDate(source?.snapshotAsOf), `${prefix}.snapshot_as_of`);
  add(errors, MONTH_PERIOD.test(source?.period || ''), `${prefix}.period`);
  add(errors, String(source?.period || '') <= String(source?.snapshotAsOf || '').slice(0, 7),
    `${prefix}.period_bound`);
  add(errors, SHA256.test(source?.evidenceDigest || ''), `${prefix}.evidence_digest`);
}

function validEventTransition(event) {
  if (event?.command === 'create') {
    return event.fromState === null && event.toState === 'open' && event.reasonCode === null &&
      validDate(event.dueOn) && event.outcomeCode === null;
  }
  if (event?.command === 'claim') {
    return event.fromState === 'open' && event.toState === 'in_progress' &&
      event.reasonCode === null && event.dueOn === null && event.outcomeCode === null;
  }
  if (event?.command === 'block') {
    return event.fromState === 'in_progress' && event.toState === 'blocked' &&
      ['dependency_pending', 'source_review_required', 'owner_unavailable']
        .includes(event.reasonCode) && event.dueOn === null && event.outcomeCode === null;
  }
  if (event?.command === 'resume') {
    return event.fromState === 'blocked' && event.toState === 'in_progress' &&
      event.reasonCode === null && event.dueOn === null && event.outcomeCode === null;
  }
  if (event?.command === 'complete') {
    return event.fromState === 'in_progress' && event.toState === 'completed' &&
      event.reasonCode === null && event.dueOn === null && OUTCOME_SET.has(event.outcomeCode);
  }
  if (event?.command === 'reschedule') {
    return ['open', 'in_progress', 'blocked'].includes(event.fromState) &&
      event.toState === event.fromState && event.reasonCode === null &&
      validDate(event.dueOn) && event.outcomeCode === null;
  }
  if (event?.command === 'cancel') {
    return ['open', 'in_progress', 'blocked'].includes(event.fromState) &&
      event.toState === 'canceled' &&
      ['priority_withdrawn', 'duplicate_commitment'].includes(event.reasonCode) &&
      event.dueOn === null && event.outcomeCode === null;
  }
  return false;
}

function inspectEvent(errors, event, index, commitmentId) {
  const prefix = `commitments.${commitmentId}.events.${index}`;
  addShape(errors, event, SHAPES.event, `${prefix}.structure`);
  add(errors, Number.isSafeInteger(event?.sequence) && event.sequence === index + 1,
    `${prefix}.sequence`);
  add(errors, COMMAND_SET.has(event?.command), `${prefix}.command`);
  add(errors, event?.fromState === null || STATE_SET.has(event?.fromState), `${prefix}.from_state`);
  add(errors, STATE_SET.has(event?.toState), `${prefix}.to_state`);
  add(errors, ACTOR_ROLES.has(event?.actorRole), `${prefix}.actor_role`);
  add(errors, typeof event?.isCurrentUser === 'boolean', `${prefix}.current_user`);
  add(errors, event?.reasonCode === null || REASON_SET.has(event?.reasonCode),
    `${prefix}.reason_code`);
  add(errors, event?.dueOn === null || validDate(event?.dueOn), `${prefix}.due_on`);
  add(errors, event?.outcomeCode === null || OUTCOME_SET.has(event?.outcomeCode),
    `${prefix}.outcome_code`);
  add(errors, Number.isSafeInteger(event?.resultingVersion) &&
    event.resultingVersion === index + 1, `${prefix}.resulting_version`);
  add(errors, validInstant(event?.occurredAt), `${prefix}.occurred_at`);
  add(errors, validEventTransition(event), `${prefix}.transition`);
}

function inspectCommitment(errors, commitment, index, currentBrief) {
  const id = commitment?.id || `row-${index}`;
  const prefix = `commitments.${id}`;
  addShape(errors, commitment, SHAPES.commitment, `${prefix}.structure`);
  add(errors, IDENTIFIER.test(commitment?.id || ''), `${prefix}.id`);
  add(errors, Number.isSafeInteger(commitment?.version) && commitment.version >= 1,
    `${prefix}.version`);

  const definition = definitionForPriority(commitment?.priorityCode);
  add(errors, Boolean(definition), `${prefix}.priority_code`);
  if (definition) {
    add(errors, commitment?.severity === definition.severity, `${prefix}.severity`);
    add(errors, commitment?.actionCode === definition.actionCode, `${prefix}.action_code`);
  }
  add(errors, STATE_SET.has(commitment?.state), `${prefix}.state`);
  addShape(errors, commitment?.assignee, SHAPES.assignee, `${prefix}.assignee_structure`);
  add(errors, ASSIGNEE_ROLES.has(commitment?.assignee?.role),
    `${prefix}.assignee_role`);
  add(errors, typeof commitment?.assignee?.isCurrentUser === 'boolean',
    `${prefix}.assignee_current_user`);
  add(errors, validDate(commitment?.dueOn), `${prefix}.due_on`);
  add(errors, typeof commitment?.overdue === 'boolean', `${prefix}.overdue`);
  add(errors,
    commitment?.state === 'completed'
      ? OUTCOME_SET.has(commitment?.outcomeCode)
      : commitment?.outcomeCode === null,
    `${prefix}.outcome_code`,
  );
  inspectSource(errors, commitment?.source, `${prefix}.source`);

  add(errors, Array.isArray(commitment?.availableTransitions),
    `${prefix}.available_transitions`);
  const transitions = Array.isArray(commitment?.availableTransitions)
    ? commitment.availableTransitions
    : [];
  add(errors, transitions.every(command => command !== 'create' && COMMAND_SET.has(command)),
    `${prefix}.available_transition_value`);
  add(errors, new Set(transitions).size === transitions.length,
    `${prefix}.available_transition_duplicate`);
  const canonicalTransitions = GRH_ACTION_LEDGER_COMMANDS.filter(command =>
    command !== 'create' && transitions.includes(command));
  add(errors, transitions.every((command, position) => command === canonicalTransitions[position]),
    `${prefix}.available_transition_order`);
  if (TERMINAL_STATES.has(commitment?.state)) {
    add(errors, transitions.length === 0, `${prefix}.terminal_transition`);
    add(errors, commitment?.overdue === false, `${prefix}.terminal_overdue`);
  }

  add(errors, Array.isArray(commitment?.events) && commitment.events.length >= 1 &&
    commitment.events.length <= MAX_EVENTS_PER_COMMITMENT, `${prefix}.events`);
  const events = Array.isArray(commitment?.events) ? commitment.events : [];
  events.forEach((event, eventIndex) => inspectEvent(errors, event, eventIndex, id));
  for (let eventIndex = 1; eventIndex < events.length; eventIndex += 1) {
    const previous = events[eventIndex - 1];
    const current = events[eventIndex];
    add(errors, current?.fromState === previous?.toState,
      `${prefix}.events.${eventIndex}.state_chain`);
    if (validInstant(previous?.occurredAt) && validInstant(current?.occurredAt)) {
      add(errors, previous.occurredAt <= current.occurredAt,
        `${prefix}.events.${eventIndex}.time_order`);
    }
  }
  if (events.length > 0) {
    const last = events.at(-1);
    add(errors, last?.resultingVersion === commitment?.version, `${prefix}.event_version_identity`);
    add(errors, last?.toState === commitment?.state, `${prefix}.event_state_identity`);
    const lastDueEvent = events.filter(event =>
      event?.command === 'create' || event?.command === 'reschedule').at(-1);
    add(errors, lastDueEvent?.dueOn === commitment?.dueOn, `${prefix}.event_due_on_identity`);
    add(errors,
      commitment?.state === 'completed'
        ? last?.command === 'complete' && last?.outcomeCode === commitment?.outcomeCode
        : commitment?.outcomeCode === null,
      `${prefix}.event_outcome_identity`,
    );
  }

  add(errors, validInstant(commitment?.createdAt), `${prefix}.created_at`);
  add(errors, validInstant(commitment?.updatedAt), `${prefix}.updated_at`);
  if (validInstant(commitment?.createdAt) && validInstant(commitment?.updatedAt)) {
    add(errors, commitment.createdAt <= commitment.updatedAt, `${prefix}.timestamp_order`);
  }
}

function inspectSummary(errors, summary, commitments) {
  addShape(errors, summary, SHAPES.summary, 'summary.structure');
  const expected = {
    total: commitments.length,
    open: commitments.filter(row => row?.state === 'open').length,
    inProgress: commitments.filter(row => row?.state === 'in_progress').length,
    blocked: commitments.filter(row => row?.state === 'blocked').length,
    completed: commitments.filter(row => row?.state === 'completed').length,
    canceled: commitments.filter(row => row?.state === 'canceled').length,
    overdue: commitments.filter(row => row?.overdue === true).length,
  };
  for (const [key, value] of Object.entries(expected)) {
    add(errors, summary?.[key] === value, `summary.${key}`);
  }
}

export function inspectGrhActionLedgerContract(data) {
  const errors = [];
  addShape(errors, data, SHAPES.top, 'action_ledger.structure');
  add(errors, data?.schemaVersion === GRH_ACTION_LEDGER_SCHEMA_VERSION, 'schema.version');

  const currentBrief = data?.currentBrief;
  addShape(errors, currentBrief, SHAPES.currentBrief, 'current_brief.structure');
  add(errors, currentBrief?.schemaVersion === GRH_DECISION_BRIEF_SCHEMA_VERSION,
    'current_brief.schema_version');
  add(errors, SHA256.test(currentBrief?.sourceSha256 || ''), 'current_brief.source_sha256');
  add(errors, validDate(currentBrief?.snapshotAsOf), 'current_brief.snapshot_as_of');
  add(errors, MONTH_PERIOD.test(currentBrief?.period || ''), 'current_brief.period');
  add(errors, String(currentBrief?.period || '') <= String(currentBrief?.snapshotAsOf || '').slice(0, 7),
    'current_brief.period_bound');
  add(errors, CURRENT_BRIEF_STATUSES.has(currentBrief?.status), 'current_brief.status');

  const permissions = data?.permissions;
  addShape(errors, permissions, SHAPES.permissions, 'permissions.structure');
  for (const key of SHAPES.permissions) {
    add(errors, typeof permissions?.[key] === 'boolean', `permissions.${key}`);
  }
  add(errors, permissions?.canCreate !== true || permissions?.canRead === true,
    'permissions.create_requires_read');
  add(errors, permissions?.canUpdate !== true || permissions?.canRead === true,
    'permissions.update_requires_read');
  add(errors, permissions?.canCancel !== true || permissions?.canUpdate === true,
    'permissions.cancel_requires_update');
  add(errors, permissions?.canReschedule !== true || permissions?.canUpdate === true,
    'permissions.reschedule_requires_update');

  add(errors, Array.isArray(data?.commitments) && data.commitments.length <= MAX_COMMITMENTS,
    'commitments.structure');
  const commitments = Array.isArray(data?.commitments) ? data.commitments : [];
  commitments.forEach((commitment, index) =>
    inspectCommitment(errors, commitment, index, currentBrief));
  add(errors, new Set(commitments.map(row => row?.id)).size === commitments.length,
    'commitments.duplicate');
  inspectSummary(errors, data?.summary, commitments);

  add(errors, Array.isArray(data?.suggestions) && data.suggestions.length <=
    GRH_ACTION_LEDGER_ACTION_DEFINITIONS.length, 'suggestions.structure');
  const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
  const seenSuggestions = new Set();
  let priorDefinitionIndex = -1;
  for (const [index, suggestion] of suggestions.entries()) {
    const prefix = `suggestions.${index}`;
    addShape(errors, suggestion, SHAPES.suggestion, `${prefix}.structure`);
    const definition = definitionForPriority(suggestion?.priorityCode);
    add(errors, Boolean(definition), `${prefix}.priority_code`);
    add(errors, !seenSuggestions.has(suggestion?.priorityCode), `${prefix}.duplicate`);
    seenSuggestions.add(suggestion?.priorityCode);
    if (definition) {
      const definitionIndex = GRH_ACTION_LEDGER_ACTION_DEFINITIONS.indexOf(definition);
      add(errors, definitionIndex > priorDefinitionIndex, `${prefix}.order`);
      priorDefinitionIndex = definitionIndex;
      for (const key of ['severity', 'actionCode', 'defaultAssigneeRole', 'href']) {
        add(errors, suggestion?.[key] === definition[key], `${prefix}.${key}`);
      }
    }
    add(errors, typeof suggestion?.available === 'boolean', `${prefix}.available`);
    add(errors,
      suggestion?.existingCommitmentId === null ||
        IDENTIFIER.test(suggestion?.existingCommitmentId || ''),
      `${prefix}.existing_commitment_id`,
    );
    const existing = commitments.find(row => row.id === suggestion?.existingCommitmentId);
    add(errors,
      suggestion?.existingCommitmentId === null || (
        existing?.priorityCode === suggestion?.priorityCode &&
        existing?.source?.schemaVersion === currentBrief?.schemaVersion &&
        existing?.source?.sourceSha256 === currentBrief?.sourceSha256 &&
        existing?.source?.snapshotAsOf === currentBrief?.snapshotAsOf &&
        existing?.source?.period === currentBrief?.period
      ),
      `${prefix}.existing_commitment_identity`,
    );
    add(errors,
      suggestion?.available === (
        permissions?.canCreate === true && commitments.length < MAX_COMMITMENTS &&
        suggestion?.existingCommitmentId === null
      ),
      `${prefix}.availability_identity`,
    );
  }

  add(errors, Array.isArray(data?.limits) &&
    data.limits.length === GRH_ACTION_LEDGER_LIMITS.length &&
    data.limits.every((value, index) => value === GRH_ACTION_LEDGER_LIMITS[index]),
  'limits.enumeration');

  const uniqueErrors = Object.freeze([...new Set(errors)]);
  return Object.freeze({ ok: uniqueErrors.length === 0, errors: uniqueErrors });
}

export function validateGrhActionLedgerContract(data) {
  return inspectGrhActionLedgerContract(data).ok;
}
