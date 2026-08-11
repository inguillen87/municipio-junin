(function installGrhActionLedger(global) {
  'use strict';

  var SCHEMA_VERSION = 'grh-action-ledger-v1';
  var BRIEF_SCHEMA_VERSION = 'grh-decision-brief-v1';
  var ENDPOINT = '/api/grh-action-ledger';
  var REQUIRED_CAPABILITY = 'navigation.grh-decisions';
  var MAX_DUE_DAYS = 180;
  var STATES = Object.freeze(['open', 'in_progress', 'blocked', 'completed', 'canceled']);
  var COMMANDS = Object.freeze(['create', 'claim', 'block', 'resume', 'complete', 'reschedule', 'cancel']);
  var TRANSITION_COMMANDS = Object.freeze(['claim', 'block', 'resume', 'complete', 'reschedule', 'cancel']);
  var ASSIGNEE_ROLES = Object.freeze(['CONTADOR', 'TENANT_ADMIN']);
  var ACTOR_ROLES = Object.freeze(['INTENDENTE', 'TENANT_ADMIN', 'CONTADOR']);
  var STATUS_VALUES = Object.freeze(['attention_required', 'review_recommended', 'context_only']);
  var REASON_CODES = Object.freeze({
    block: Object.freeze(['dependency_pending', 'source_review_required', 'owner_unavailable']),
    cancel: Object.freeze(['priority_withdrawn', 'duplicate_commitment'])
  });
  var OUTCOME_CODES = Object.freeze(['review_completed', 'correction_requested', 'no_change_required']);
  var LIMITS = Object.freeze([
    'human_creation_required',
    'new_commitments_current_brief_only',
    'no_automatic_assignment',
    'no_approval_or_delegation',
    'snapshot_evidence_not_realtime',
    'no_free_text_v1'
  ]);
  var PRIORITIES = Object.freeze({
    cross_source_material_difference: Object.freeze({
      severity: 'critical',
      actionCode: 'review_cross_source_reconciliation',
      defaultAssigneeRole: 'CONTADOR',
      href: 'hacienda.html',
      title: 'Conciliar la diferencia entre fuentes',
      copy: 'Abrí una revisión responsable sobre la conciliación global y mensual del corte vigente.'
    }),
    temporal_quarantine_present: Object.freeze({
      severity: 'warning',
      actionCode: 'review_temporal_quarantine',
      defaultAssigneeRole: 'TENANT_ADMIN',
      href: 'control.html',
      title: 'Revisar la cuarentena temporal',
      copy: 'Confirmá el tratamiento de registros temporales aislados antes de reutilizar el snapshot.'
    })
  });
  var STATE_COPY = Object.freeze({
    open: 'Abierto',
    in_progress: 'En curso',
    blocked: 'Bloqueado',
    completed: 'Completado',
    canceled: 'Cancelado'
  });
  var COMMAND_COPY = Object.freeze({
    create: 'Compromiso creado',
    claim: 'Trabajo iniciado',
    block: 'Compromiso bloqueado',
    resume: 'Trabajo reanudado',
    complete: 'Revisión completada',
    reschedule: 'Fecha reprogramada',
    cancel: 'Compromiso cancelado'
  });
  var COMMAND_ACTION_COPY = Object.freeze({
    claim: 'Iniciar revisión',
    block: 'Bloquear',
    resume: 'Reanudar',
    complete: 'Completar',
    reschedule: 'Reprogramar',
    cancel: 'Cancelar'
  });
  var ROLE_COPY = Object.freeze({ CONTADOR: 'Contaduría', TENANT_ADMIN: 'Administración municipal' });
  var REASON_COPY = Object.freeze({
    dependency_pending: 'Dependencia pendiente',
    source_review_required: 'Revisión de fuente requerida',
    owner_unavailable: 'Responsable no disponible',
    priority_withdrawn: 'Prioridad retirada',
    duplicate_commitment: 'Compromiso duplicado'
  });
  var OUTCOME_COPY = Object.freeze({
    review_completed: 'Revisión realizada',
    correction_requested: 'Corrección solicitada',
    no_change_required: 'Sin cambio requerido'
  });
  var LIMIT_COPY = Object.freeze({
    human_creation_required: 'Cada compromiso requiere creación y confirmación humana.',
    new_commitments_current_brief_only: 'Los compromisos nuevos sólo admiten prioridades del brief vigente; el historial sigue consultable y operable.',
    no_automatic_assignment: 'No asigna responsables automáticamente; el valor sugerido debe confirmarse.',
    no_approval_or_delegation: 'No representa aprobación, delegación formal ni acto administrativo.',
    snapshot_evidence_not_realtime: 'La evidencia pertenece a un snapshot histórico, no a tiempo real.',
    no_free_text_v1: 'Los motivos y resultados son códigos estructurados; esta versión no admite notas libres.'
  });
  var TOP_KEYS = Object.freeze(['schemaVersion', 'currentBrief', 'permissions', 'summary', 'suggestions', 'commitments', 'limits']);
  var BRIEF_KEYS = Object.freeze(['schemaVersion', 'sourceSha256', 'snapshotAsOf', 'period', 'status']);
  var PERMISSION_KEYS = Object.freeze(['canRead', 'canCreate', 'canUpdate', 'canCancel', 'canReschedule']);
  var SUMMARY_KEYS = Object.freeze(['total', 'open', 'inProgress', 'blocked', 'completed', 'canceled', 'overdue']);
  var SUGGESTION_KEYS = Object.freeze(['priorityCode', 'severity', 'actionCode', 'defaultAssigneeRole', 'available', 'existingCommitmentId', 'href']);
  var COMMITMENT_KEYS = Object.freeze(['id', 'version', 'priorityCode', 'severity', 'actionCode', 'state', 'assignee', 'dueOn', 'overdue', 'outcomeCode', 'source', 'availableTransitions', 'events', 'createdAt', 'updatedAt']);
  var ASSIGNEE_KEYS = Object.freeze(['role', 'isCurrentUser']);
  var SOURCE_KEYS = Object.freeze(['schemaVersion', 'policyVersion', 'sourceSha256', 'snapshotAsOf', 'period', 'evidenceDigest']);
  var EVENT_KEYS = Object.freeze(['sequence', 'command', 'fromState', 'toState', 'actorRole', 'isCurrentUser', 'reasonCode', 'dueOn', 'outcomeCode', 'resultingVersion', 'occurredAt']);
  var POST_KEYS = Object.freeze(['commandId', 'brief', 'assigneeRole', 'dueOn']);
  var POST_BRIEF_KEYS = Object.freeze(['schemaVersion', 'sourceSha256', 'snapshotAsOf', 'period', 'priorityCode']);
  var PATCH_KEYS = Object.freeze(['commandId', 'commitmentId', 'expectedVersion', 'command', 'reasonCode', 'dueOn', 'outcomeCode']);

  var state = {
    contract: null,
    filter: 'all',
    loading: false,
    mutating: false,
    dialog: null,
    selectedCommitmentId: null,
    drawerReturnFocus: null
  };

  var documentRef = global.document;
  var numberFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
  var dayFormatter = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'UTC' });
  var dateTimeFormatter = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' });
  var monthFormatter = new Intl.DateTimeFormat('es-AR', { month: 'short', year: 'numeric', timeZone: 'UTC' });

  function byId(id) { return documentRef.getElementById(id); }
  function plainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function exactKeys(value, expected) {
    if (!plainObject(value)) return false;
    var actual = Object.keys(value).sort();
    var wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every(function(key, index) { return key === wanted[index]; });
  }
  function enumValue(value, allowed) { return typeof value === 'string' && allowed.indexOf(value) !== -1; }
  function identifier(value, maxLength) { return typeof value === 'string' && value.length > 0 && value.length <= (maxLength || 128) && /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value); }
  function hash(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
  function isoDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function month(value) { return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
  function timestamp(value) {
    if (typeof value !== 'string' || value.length < 20 || value.length > 35) return false;
    var instant = Date.parse(value);
    return Number.isFinite(instant) && new Date(instant).toISOString() === value;
  }
  function nonNegativeInteger(value) { return Number.isSafeInteger(value) && value >= 0; }
  function positiveInteger(value) { return Number.isSafeInteger(value) && value >= 1; }
  function nullable(value, validator) { return value === null || validator(value); }
  function unique(values) { return new Set(values).size === values.length; }
  function exactArray(value, expected) {
    return Array.isArray(value) && value.length === expected.length && value.every(function(item, index) { return item === expected[index]; });
  }
  function safeHref(value) {
    if (value === null) return true;
    if (typeof value !== 'string' || value.length < 1 || value.length > 160 || value.indexOf('\\') !== -1 || value.indexOf('//') === 0) return false;
    try {
      var url = new URL(value, global.location.origin + '/');
      return url.origin === global.location.origin && !url.username && !url.password && /^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)$/.test(url.pathname);
    } catch (_) { return false; }
  }

  function validBrief(brief) {
    return exactKeys(brief, BRIEF_KEYS) && brief.schemaVersion === BRIEF_SCHEMA_VERSION &&
      hash(brief.sourceSha256) && isoDay(brief.snapshotAsOf) && month(brief.period) && brief.period <= brief.snapshotAsOf.slice(0, 7) &&
      enumValue(brief.status, STATUS_VALUES);
  }
  function validPermissions(permissions) {
    return exactKeys(permissions, PERMISSION_KEYS) && PERMISSION_KEYS.every(function(key) {
      return typeof permissions[key] === 'boolean';
    }) && permissions.canRead === true && (!permissions.canCreate || permissions.canRead) &&
      (!permissions.canUpdate || permissions.canRead) && (!permissions.canCancel || permissions.canUpdate) &&
      (!permissions.canReschedule || permissions.canUpdate);
  }
  function validSummary(summary) {
    if (!exactKeys(summary, SUMMARY_KEYS) || !SUMMARY_KEYS.every(function(key) { return nonNegativeInteger(summary[key]); })) return false;
    return summary.total === summary.open + summary.inProgress + summary.blocked + summary.completed + summary.canceled &&
      summary.overdue <= summary.open + summary.inProgress + summary.blocked;
  }
  function validSuggestion(row) {
    if (!exactKeys(row, SUGGESTION_KEYS)) return false;
    var definition = PRIORITIES[row.priorityCode];
    return Boolean(definition) && row.severity === definition.severity && row.actionCode === definition.actionCode &&
      row.defaultAssigneeRole === definition.defaultAssigneeRole && typeof row.available === 'boolean' &&
      nullable(row.existingCommitmentId, function(value) { return identifier(value, 128); }) && row.href === definition.href && safeHref(row.href) &&
      (row.available ? row.existingCommitmentId === null : true);
  }
  function validSource(source) {
    return exactKeys(source, SOURCE_KEYS) && source.schemaVersion === BRIEF_SCHEMA_VERSION &&
      source.policyVersion === 'grh-small-cell-v1' && hash(source.sourceSha256) && isoDay(source.snapshotAsOf) &&
      month(source.period) && source.period <= source.snapshotAsOf.slice(0, 7) && hash(source.evidenceDigest);
  }
  function isCurrentBriefSource(source, brief) {
    return source.schemaVersion === brief.schemaVersion && source.sourceSha256 === brief.sourceSha256 &&
      source.snapshotAsOf === brief.snapshotAsOf && source.period === brief.period;
  }
  function validEvent(event) {
    if (!exactKeys(event, EVENT_KEYS) || !positiveInteger(event.sequence) || !enumValue(event.command, COMMANDS) ||
        !nullable(event.fromState, function(value) { return enumValue(value, STATES); }) || !enumValue(event.toState, STATES) ||
        !enumValue(event.actorRole, ACTOR_ROLES) || typeof event.isCurrentUser !== 'boolean' ||
        !nullable(event.reasonCode, function(value) { return Object.prototype.hasOwnProperty.call(REASON_COPY, value); }) ||
        !nullable(event.dueOn, isoDay) || !nullable(event.outcomeCode, function(value) { return enumValue(value, OUTCOME_CODES); }) ||
        !positiveInteger(event.resultingVersion) || !timestamp(event.occurredAt)) return false;
    if (event.command === 'create') return event.fromState === null && event.toState === 'open' && isoDay(event.dueOn) && event.reasonCode === null && event.outcomeCode === null;
    if (event.command === 'claim') return event.fromState === 'open' && event.toState === 'in_progress' && event.reasonCode === null && event.dueOn === null && event.outcomeCode === null;
    if (event.command === 'block') return event.fromState === 'in_progress' && event.toState === 'blocked' && enumValue(event.reasonCode, REASON_CODES.block) && event.dueOn === null && event.outcomeCode === null;
    if (event.command === 'resume') return event.fromState === 'blocked' && event.toState === 'in_progress' && event.reasonCode === null && event.dueOn === null && event.outcomeCode === null;
    if (event.command === 'complete') return event.fromState === 'in_progress' && event.toState === 'completed' && event.reasonCode === null && event.dueOn === null && enumValue(event.outcomeCode, OUTCOME_CODES);
    if (event.command === 'reschedule') return ['open', 'in_progress', 'blocked'].indexOf(event.fromState) !== -1 && event.toState === event.fromState && isoDay(event.dueOn) && event.reasonCode === null && event.outcomeCode === null;
    if (event.command === 'cancel') return ['open', 'in_progress', 'blocked'].indexOf(event.fromState) !== -1 && event.toState === 'canceled' && enumValue(event.reasonCode, REASON_CODES.cancel) && event.dueOn === null && event.outcomeCode === null;
    return false;
  }
  function validCommitment(row, brief) {
    if (!exactKeys(row, COMMITMENT_KEYS) || !identifier(row.id, 128) || !positiveInteger(row.version)) return false;
    var definition = PRIORITIES[row.priorityCode];
    if (!definition || row.severity !== definition.severity || row.actionCode !== definition.actionCode ||
        !enumValue(row.state, STATES) || !exactKeys(row.assignee, ASSIGNEE_KEYS) ||
        !enumValue(row.assignee.role, ASSIGNEE_ROLES) || typeof row.assignee.isCurrentUser !== 'boolean' ||
        !isoDay(row.dueOn) || typeof row.overdue !== 'boolean' ||
        !nullable(row.outcomeCode, function(value) { return enumValue(value, OUTCOME_CODES); }) ||
        !validSource(row.source) || !Array.isArray(row.availableTransitions) || row.availableTransitions.length > TRANSITION_COMMANDS.length ||
        !row.availableTransitions.every(function(command) { return enumValue(command, TRANSITION_COMMANDS); }) ||
        !unique(row.availableTransitions) || !row.availableTransitions.every(function(command, index) {
          return command === TRANSITION_COMMANDS.filter(function(candidate) { return row.availableTransitions.indexOf(candidate) !== -1; })[index];
        }) || !Array.isArray(row.events) || row.events.length < 1 || row.events.length > 128 ||
        !timestamp(row.createdAt) || !timestamp(row.updatedAt) || Date.parse(row.createdAt) > Date.parse(row.updatedAt)) return false;
    if ((row.state === 'completed') !== (row.outcomeCode !== null)) return false;
    if ((row.state === 'completed' || row.state === 'canceled') && (row.overdue || row.availableTransitions.length > 0)) return false;
    var previousEvent = null;
    for (var index = 0; index < row.events.length; index += 1) {
      var event = row.events[index];
      if (!validEvent(event) || event.sequence !== index + 1 || event.resultingVersion !== index + 1) return false;
      if (previousEvent && (event.fromState !== previousEvent.toState || previousEvent.occurredAt > event.occurredAt)) return false;
      previousEvent = event;
    }
    var first = row.events[0];
    var last = row.events[row.events.length - 1];
    var dueEvents = row.events.filter(function(event) { return event.command === 'create' || event.command === 'reschedule'; });
    var lastDueEvent = dueEvents[dueEvents.length - 1];
    return first.command === 'create' && first.dueOn !== null && last.toState === row.state &&
      last.resultingVersion === row.version && lastDueEvent && lastDueEvent.dueOn === row.dueOn &&
      (row.state !== 'completed' || (last.command === 'complete' && last.outcomeCode === row.outcomeCode));
  }
  function validCrossReferences(contract) {
    var summary = contract.summary;
    var observed = { open: 0, in_progress: 0, blocked: 0, completed: 0, canceled: 0, overdue: 0 };
    var byId = new Map();
    contract.commitments.forEach(function(row) {
      observed[row.state] += 1;
      if (row.overdue) observed.overdue += 1;
      byId.set(row.id, row);
    });
    if (byId.size !== contract.commitments.length || summary.total !== contract.commitments.length ||
        summary.open !== observed.open || summary.inProgress !== observed.in_progress || summary.blocked !== observed.blocked ||
        summary.completed !== observed.completed || summary.canceled !== observed.canceled || summary.overdue !== observed.overdue) return false;
    return contract.suggestions.every(function(suggestion) {
      var expectedAvailability = contract.permissions.canCreate && contract.commitments.length < 100 && suggestion.existingCommitmentId === null;
      if (suggestion.available !== expectedAvailability) return false;
      if (suggestion.existingCommitmentId === null) return true;
      var existing = byId.get(suggestion.existingCommitmentId);
      return Boolean(existing) && existing.priorityCode === suggestion.priorityCode &&
        isCurrentBriefSource(existing.source, contract.currentBrief) && suggestion.available === false;
    });
  }
  function inspectContract(contract) {
    if (!exactKeys(contract, TOP_KEYS) || contract.schemaVersion !== SCHEMA_VERSION || !validBrief(contract.currentBrief) ||
        !validPermissions(contract.permissions) || !validSummary(contract.summary) || !Array.isArray(contract.suggestions) ||
        contract.suggestions.length > 2 || !contract.suggestions.every(validSuggestion) ||
        !unique(contract.suggestions.map(function(row) { return row.priorityCode; })) || !contract.suggestions.every(function(row, index) {
          var canonical = Object.keys(PRIORITIES).filter(function(priorityCode) {
            return contract.suggestions.some(function(suggestion) { return suggestion.priorityCode === priorityCode; });
          });
          return row.priorityCode === canonical[index];
        }) || !Array.isArray(contract.commitments) ||
        contract.commitments.length > 100 || !contract.commitments.every(function(row) { return validCommitment(row, contract.currentBrief); }) ||
        !exactArray(contract.limits, LIMITS) || !validCrossReferences(contract)) return null;
    return contract;
  }

  function element(tag, className, text) {
    var node = documentRef.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function formatDay(value) { return dayFormatter.format(new Date(value + 'T00:00:00Z')); }
  function formatMonth(value) { return monthFormatter.format(new Date(value + '-01T00:00:00Z')); }
  function formatDateTime(value) { return dateTimeFormatter.format(new Date(value)); }
  function formatShortHash(value) { return value.slice(0, 8) + '…' + value.slice(-6); }
  function currentLocalDay() { return new Date().toISOString().slice(0, 10); }
  function plusDays(day, amount) {
    var value = new Date(day + 'T00:00:00Z');
    value.setUTCDate(value.getUTCDate() + amount);
    return value.toISOString().slice(0, 10);
  }
  function newCommandId() {
    if (!global.crypto || typeof global.crypto.randomUUID !== 'function') throw new Error('COMMAND_ID_UNAVAILABLE');
    return global.crypto.randomUUID();
  }

  function setStatus(kind, message, retry) {
    byId('decisionStatus').dataset.state = kind;
    byId('decisionStatusText').textContent = message;
    byId('decisionRetry').hidden = !retry;
  }
  function showLoading() {
    byId('decisionLedger').setAttribute('aria-busy', 'true');
    byId('decisionLoading').hidden = false;
    byId('decisionError').hidden = true;
    byId('decisionContent').hidden = true;
    setStatus('loading', 'Validando compromisos', false);
  }
  function showLoadError(status) {
    var copy = {
      403: ['Acceso no habilitado', 'El perfil actual no puede consultar este centro de decisiones.'],
      503: ['Registro temporalmente no disponible', 'La fuente o el registro de compromisos no están disponibles. No se muestran datos parciales.']
    }[status] || ['Centro no verificable', 'No fue posible validar el contrato completo. Reintentá cuando la fuente y el registro estén disponibles.'];
    state.loading = false;
    byId('decisionLedger').setAttribute('aria-busy', 'false');
    byId('decisionLoading').hidden = true;
    byId('decisionContent').hidden = true;
    byId('decisionErrorTitle').textContent = copy[0];
    byId('decisionErrorMessage').textContent = copy[1];
    byId('decisionError').hidden = false;
    setStatus('error', status === 403 ? 'Acceso no habilitado' : 'Registro no disponible', status !== 403);
    byId('decisionError').focus();
  }

  function renderSummary(summary) {
    var definitions = [
      ['Total', summary.total, ''], ['Abiertos', summary.open, ''], ['En curso', summary.inProgress, ''],
      ['Bloqueados', summary.blocked, summary.blocked ? 'danger' : ''], ['Vencidos', summary.overdue, summary.overdue ? 'danger' : ''],
      ['Completados', summary.completed, 'success'], ['Cancelados', summary.canceled, '']
    ];
    var root = byId('decisionSummary');
    clear(root);
    definitions.forEach(function(definition) {
      var card = element('article', 'decision-summary-card');
      if (definition[2]) card.dataset.tone = definition[2];
      card.append(element('span', '', definition[0]), element('strong', '', numberFormatter.format(definition[1])));
      root.appendChild(card);
    });
  }
  function renderContext(contract) {
    byId('decisionPeriodChip').textContent = 'Período ' + formatMonth(contract.currentBrief.period);
    byId('decisionSnapshotChip').textContent = 'Corte ' + formatDay(contract.currentBrief.snapshotAsOf);
    var permissions = contract.permissions;
    byId('decisionPermissionChip').textContent = permissions.canCreate ? 'Creación habilitada' : 'Consulta habilitada';
  }
  function renderSuggestions(contract) {
    var root = byId('decisionSuggestions');
    clear(root);
    if (contract.suggestions.length === 0) {
      var empty = element('div', 'decision-empty');
      empty.append(element('strong', '', 'El brief vigente no contiene prioridades accionables.'), element('span', '', 'El registro permanece disponible para consultar compromisos existentes.'));
      root.appendChild(empty);
      return;
    }
    contract.suggestions.forEach(function(suggestion, index) {
      var definition = PRIORITIES[suggestion.priorityCode];
      var card = element('article', 'decision-suggestion');
      card.dataset.severity = suggestion.severity;
      card.dataset.priorityCode = suggestion.priorityCode;
      var indexNode = element('span', 'decision-suggestion-index', String(index + 1));
      indexNode.setAttribute('aria-hidden', 'true');
      var copy = element('div');
      copy.append(element('h3', '', definition.title), element('p', '', definition.copy + ' Responsable sugerido: ' + ROLE_COPY[suggestion.defaultAssigneeRole] + '.'));
      var actions = element('div', 'decision-suggestion-actions');
      var evidence = element('a', 'decision-button decision-button--ghost', 'Ver evidencia');
      evidence.href = suggestion.href;
      var button = element('button', 'decision-button decision-button--primary');
      button.type = 'button';
      if (suggestion.existingCommitmentId !== null) {
        button.textContent = 'Abrir compromiso';
        button.dataset.openCommitment = suggestion.existingCommitmentId;
      } else {
        button.textContent = suggestion.available ? 'Crear compromiso' : 'Creación no habilitada';
        button.disabled = !suggestion.available;
        if (!button.disabled) button.dataset.createPriority = suggestion.priorityCode;
      }
      actions.append(evidence, button);
      card.append(indexNode, copy, actions);
      root.appendChild(card);
    });
  }
  function filteredCommitments(contract) {
    return contract.commitments.filter(function(row) {
      if (state.filter === 'all') return true;
      if (state.filter === 'active') return row.state === 'open' || row.state === 'in_progress' || row.state === 'blocked';
      if (state.filter === 'overdue') return row.overdue;
      return row.state === state.filter;
    });
  }
  function renderCommitments(contract) {
    var root = byId('decisionCommitments');
    var rows = filteredCommitments(contract);
    clear(root);
    rows.forEach(function(row) {
      var definition = PRIORITIES[row.priorityCode];
      var button = element('button', 'decision-commitment');
      button.type = 'button';
      button.dataset.openCommitment = row.id;
      var sourceContext = isCurrentBriefSource(row.source, contract.currentBrief) ? 'Vigente' : 'Histórico';
      button.dataset.sourceContext = sourceContext.toLowerCase();
      button.setAttribute('aria-label', 'Abrir ' + definition.title + ', ' + sourceContext + ', ' + STATE_COPY[row.state]);
      var title = element('div', 'decision-commitment-title');
      title.append(element('strong', '', definition.title), element('span', '', sourceContext + ' · período ' + formatMonth(row.source.period) +
        ' · corte ' + formatDay(row.source.snapshotAsOf) + ' · versión ' + row.version + ' · evidencia ' + formatShortHash(row.source.evidenceDigest)));
      var status = element('div', 'decision-commitment-cell');
      var statusPill = element('strong', 'decision-pill', row.overdue ? STATE_COPY[row.state] + ' · vencido' : STATE_COPY[row.state]);
      statusPill.dataset.state = row.state;
      statusPill.dataset.overdue = String(row.overdue);
      status.append(element('span', '', 'Estado'), statusPill);
      var assignee = element('div', 'decision-commitment-cell');
      assignee.append(element('span', '', 'Responsable'), element('strong', '', ROLE_COPY[row.assignee.role] + (row.assignee.isCurrentUser ? ' · vos' : '')));
      var due = element('div', 'decision-commitment-cell');
      due.append(element('span', '', 'Vencimiento'), element('strong', '', formatDay(row.dueOn)));
      var chevron = element('span', 'decision-chevron', '›');
      chevron.setAttribute('aria-hidden', 'true');
      button.append(title, status, assignee, due, chevron);
      root.appendChild(button);
    });
    byId('decisionEmpty').hidden = rows.length !== 0;
  }
  function renderLimits(limits) {
    var root = byId('decisionLimits');
    clear(root);
    limits.forEach(function(limit) { root.appendChild(element('li', '', LIMIT_COPY[limit])); });
  }
  function renderContract(contract, statusMessage) {
    state.contract = contract;
    renderContext(contract);
    renderSummary(contract.summary);
    renderSuggestions(contract);
    renderCommitments(contract);
    renderLimits(contract.limits);
    state.loading = false;
    byId('decisionLedger').setAttribute('aria-busy', 'false');
    byId('decisionLoading').hidden = true;
    byId('decisionError').hidden = true;
    byId('decisionContent').hidden = false;
    setStatus('ready', statusMessage || 'Registro verificado', false);
    if (state.selectedCommitmentId) {
      var current = commitmentById(state.selectedCommitmentId);
      if (current) renderDrawer(current);
      else closeDrawer();
    }
  }

  function commitmentById(id) {
    if (!state.contract) return null;
    return state.contract.commitments.find(function(row) { return row.id === id; }) || null;
  }
  function metaCard(label, value) {
    var card = element('div', 'decision-meta-card');
    card.append(element('span', '', label), element('strong', '', value));
    return card;
  }
  function canRunTransition(command) {
    var permissions = state.contract.permissions;
    if (command === 'reschedule') return permissions.canReschedule;
    if (command === 'cancel') return permissions.canCancel;
    return permissions.canUpdate;
  }
  function renderTimeline(row) {
    var root = byId('decisionTimeline');
    clear(root);
    row.events.slice().reverse().forEach(function(event) {
      var item = element('li', 'decision-event');
      var head = element('div', 'decision-event-head');
      var time = element('time', '', formatDateTime(event.occurredAt));
      time.dateTime = event.occurredAt;
      head.append(element('strong', '', COMMAND_COPY[event.command]), time);
      var details = STATE_COPY[event.toState] + ' · versión ' + event.resultingVersion + ' · ' + event.actorRole;
      if (event.isCurrentUser) details += ' · vos';
      if (event.reasonCode) details += ' · ' + REASON_COPY[event.reasonCode];
      if (event.dueOn) details += ' · vence ' + formatDay(event.dueOn);
      if (event.outcomeCode) details += ' · ' + OUTCOME_COPY[event.outcomeCode];
      item.append(head, element('p', '', details));
      root.appendChild(item);
    });
  }
  function renderDrawer(row) {
    var definition = PRIORITIES[row.priorityCode];
    byId('decisionDrawerTitle').textContent = definition.title;
    var meta = byId('decisionDrawerMeta');
    clear(meta);
    meta.append(
      metaCard('Estado', (row.overdue ? 'Vencido · ' : '') + STATE_COPY[row.state]),
      metaCard('Responsable', ROLE_COPY[row.assignee.role] + (row.assignee.isCurrentUser ? ' · vos' : '')),
      metaCard('Fecha comprometida', formatDay(row.dueOn)),
      metaCard('Contexto de evidencia', isCurrentBriefSource(row.source, state.contract.currentBrief) ? 'Brief vigente' : 'Histórico'),
      metaCard('Período de evidencia', formatMonth(row.source.period)),
      metaCard('Corte de evidencia', formatDay(row.source.snapshotAsOf)),
      metaCard('Versión', String(row.version)),
      metaCard('Resultado', row.outcomeCode ? OUTCOME_COPY[row.outcomeCode] : 'Pendiente')
    );
    var actions = byId('decisionTransitionActions');
    clear(actions);
    row.availableTransitions.forEach(function(command) {
      if (!canRunTransition(command)) return;
      var button = element('button', 'decision-button' + (command === 'cancel' ? ' decision-button--danger' : ''));
      button.type = 'button';
      button.dataset.transition = command;
      button.dataset.commitmentId = row.id;
      button.textContent = COMMAND_ACTION_COPY[command];
      actions.appendChild(button);
    });
    if (!actions.firstChild) actions.appendChild(element('span', 'decision-pill', 'Sólo lectura para este perfil'));
    renderTimeline(row);
  }
  function openDrawer(id, trigger) {
    var row = commitmentById(id);
    if (!row) return;
    state.selectedCommitmentId = id;
    state.drawerReturnFocus = trigger || documentRef.activeElement;
    renderDrawer(row);
    byId('decisionDrawer').hidden = false;
    documentRef.body.classList.add('decision-drawer-open');
    byId('decisionDrawer').querySelector('.decision-drawer').focus();
  }
  function closeDrawer() {
    var layer = byId('decisionDrawer');
    if (layer.hidden) return;
    layer.hidden = true;
    documentRef.body.classList.remove('decision-drawer-open');
    state.selectedCommitmentId = null;
    var target = state.drawerReturnFocus;
    state.drawerReturnFocus = null;
    if (target && target.isConnected && typeof target.focus === 'function') target.focus();
  }

  function populateSelect(select, values, labels) {
    clear(select);
    values.forEach(function(value) {
      var option = element('option', '', labels[value]);
      option.value = value;
      select.appendChild(option);
    });
  }
  function configureDueField(required, currentValue) {
    var input = byId('decisionDueOn');
    var min = currentLocalDay();
    input.min = min;
    input.max = plusDays(min, MAX_DUE_DAYS);
    input.required = required;
    input.value = currentValue || plusDays(min, 14);
    byId('decisionDueField').hidden = !required;
  }
  function openCreateDialog(priorityCode) {
    var suggestion = state.contract && state.contract.suggestions.find(function(row) { return row.priorityCode === priorityCode; });
    if (!suggestion || !suggestion.available || suggestion.existingCommitmentId !== null) return;
    state.dialog = { mode: 'create', suggestion: suggestion, commandId: newCommandId() };
    byId('decisionDialogEyebrow').textContent = 'Nuevo compromiso';
    byId('decisionDialogTitle').textContent = PRIORITIES[priorityCode].title;
    byId('decisionDialogCopy').textContent = 'Confirmá responsable y vencimiento. La evidencia del brief vigente quedará fijada al compromiso.';
    byId('decisionAssigneeField').hidden = false;
    byId('decisionAssigneeRole').value = suggestion.defaultAssigneeRole;
    byId('decisionReasonField').hidden = true;
    byId('decisionOutcomeField').hidden = true;
    configureDueField(true, null);
    resetDialogError();
    byId('decisionDialog').showModal();
    byId('decisionAssigneeRole').focus();
  }
  function openTransitionDialog(command, commitmentId) {
    var row = commitmentById(commitmentId);
    if (!row || row.availableTransitions.indexOf(command) === -1 || !canRunTransition(command)) return;
    state.dialog = { mode: 'transition', command: command, commitmentId: commitmentId, expectedVersion: row.version, commandId: newCommandId() };
    byId('decisionDialogEyebrow').textContent = 'Actualizar compromiso · versión ' + row.version;
    byId('decisionDialogTitle').textContent = COMMAND_ACTION_COPY[command];
    byId('decisionDialogCopy').textContent = 'Confirmá la transición. El servidor verificará permiso, versión vigente y reglas del estado.';
    byId('decisionAssigneeField').hidden = true;
    byId('decisionReasonField').hidden = command !== 'block' && command !== 'cancel';
    byId('decisionOutcomeField').hidden = command !== 'complete';
    configureDueField(command === 'reschedule', command === 'reschedule' ? row.dueOn : null);
    if (command === 'block' || command === 'cancel') populateSelect(byId('decisionReasonCode'), REASON_CODES[command], REASON_COPY);
    if (command === 'complete') populateSelect(byId('decisionOutcomeCode'), OUTCOME_CODES, OUTCOME_COPY);
    resetDialogError();
    byId('decisionDialog').showModal();
    var focusTarget = command === 'block' || command === 'cancel' ? byId('decisionReasonCode') :
      command === 'complete' ? byId('decisionOutcomeCode') : command === 'reschedule' ? byId('decisionDueOn') : byId('decisionSubmit');
    focusTarget.focus();
  }
  function resetDialogError() {
    setDialogReplayLocked(false);
    byId('decisionFormError').hidden = true;
    byId('decisionFormError').textContent = '';
    byId('decisionSubmit').disabled = false;
    byId('decisionSubmit').textContent = 'Confirmar';
  }
  function showDialogError(message) {
    byId('decisionFormError').textContent = message;
    byId('decisionFormError').hidden = false;
    byId('decisionSubmit').disabled = false;
    byId('decisionSubmit').textContent = 'Reintentar';
  }
  function setDialogReplayLocked(locked) {
    ['decisionAssigneeRole', 'decisionDueOn', 'decisionReasonCode', 'decisionOutcomeCode'].forEach(function(id) {
      byId(id).disabled = locked;
    });
  }
  function closeDialog() {
    if (byId('decisionDialog').open) byId('decisionDialog').close('cancel');
    state.dialog = null;
    resetDialogError();
  }
  function validateDueInput(value) {
    var min = currentLocalDay();
    return isoDay(value) && value >= min && value <= plusDays(min, MAX_DUE_DAYS);
  }
  function buildPostBody(dialog) {
    var brief = state.contract.currentBrief;
    var body = {
      commandId: dialog.commandId,
      brief: {
        schemaVersion: brief.schemaVersion,
        sourceSha256: brief.sourceSha256,
        snapshotAsOf: brief.snapshotAsOf,
        period: brief.period,
        priorityCode: dialog.suggestion.priorityCode
      },
      assigneeRole: byId('decisionAssigneeRole').value,
      dueOn: byId('decisionDueOn').value
    };
    if (!exactKeys(body, POST_KEYS) || !exactKeys(body.brief, POST_BRIEF_KEYS)) throw new Error('POST_BODY_INVALID');
    return body;
  }
  function buildPatchBody(dialog) {
    var command = dialog.command;
    var body = {
      commandId: dialog.commandId,
      commitmentId: dialog.commitmentId,
      expectedVersion: dialog.expectedVersion,
      command: command,
      reasonCode: command === 'block' || command === 'cancel' ? byId('decisionReasonCode').value : null,
      dueOn: command === 'reschedule' ? byId('decisionDueOn').value : null,
      outcomeCode: command === 'complete' ? byId('decisionOutcomeCode').value : null
    };
    if (!exactKeys(body, PATCH_KEYS)) throw new Error('PATCH_BODY_INVALID');
    return body;
  }

  function isMutationMethod(method) { return method === 'POST' || method === 'PATCH'; }
  function markMutationAmbiguous(error, method) {
    var normalized = error && typeof error === 'object' ? error : new Error(String(error || 'LEDGER_REQUEST_FAILED'));
    if (isMutationMethod(method)) normalized.mutationOutcomeAmbiguous = true;
    return normalized;
  }
  function validErrorReceipt(response, payload) {
    return response.headers.get('x-municontrol-contract') === SCHEMA_VERSION && plainObject(payload) &&
      typeof payload.code === 'string' && /^[A-Z][A-Z0-9_]{1,127}$/.test(payload.code);
  }

  async function requestContract(method, body) {
    if (!global.MuniAuth || typeof global.MuniAuth.fetch !== 'function') throw new Error('AUTH_CLIENT_UNAVAILABLE');
    var init = { method: method, headers: { Accept: 'application/json' } };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    var response;
    try {
      response = await global.MuniAuth.fetch(ENDPOINT, init);
    } catch (fetchError) {
      throw markMutationAmbiguous(fetchError, method);
    }
    if (!response.ok) {
      var error = new Error('LEDGER_HTTP_' + response.status);
      error.status = response.status;
      var receipt = null;
      try { receipt = await response.json(); } catch (_) { receipt = null; }
      var deterministicClientFailure = response.status >= 400 && response.status < 500 && validErrorReceipt(response, receipt);
      if (isMutationMethod(method) && !deterministicClientFailure) error.mutationOutcomeAmbiguous = true;
      throw error;
    }
    if (response.headers.get('x-municontrol-contract') !== SCHEMA_VERSION) {
      throw markMutationAmbiguous(new Error('LEDGER_HEADER_INVALID'), method);
    }
    var payload;
    try { payload = await response.json(); } catch (jsonError) {
      throw markMutationAmbiguous(jsonError, method);
    }
    var contract = inspectContract(payload);
    if (!contract) throw markMutationAmbiguous(new Error('LEDGER_CONTRACT_INVALID'), method);
    return contract;
  }
  async function loadLedger() {
    if (state.loading || state.mutating) return;
    state.loading = true;
    showLoading();
    try {
      var allowed = typeof global.requireCapability === 'function' ? await global.requireCapability(REQUIRED_CAPABILITY) : false;
      if (!allowed) { showLoadError(403); return; }
      renderContract(await requestContract('GET'), 'Registro verificado');
    } catch (error) {
      if (global.MuniAuth && typeof global.MuniAuth.isAuthError === 'function' && global.MuniAuth.isAuthError(error)) return;
      showLoadError(error && error.status);
    }
  }
  async function submitMutation() {
    if (state.mutating || !state.dialog || !state.contract) return;
    var dialog = state.dialog;
    var replayBody = dialog.replayBody || null;
    if (!replayBody && dialog.mode === 'create') {
      if (!enumValue(byId('decisionAssigneeRole').value, ASSIGNEE_ROLES)) {
        showDialogError('Elegí un responsable permitido.');
        return;
      }
      if (!validateDueInput(byId('decisionDueOn').value)) {
        showDialogError('La fecha debe estar entre hoy y los próximos 180 días.');
        return;
      }
    } else if (!replayBody && dialog.command === 'reschedule' && !validateDueInput(byId('decisionDueOn').value)) {
      showDialogError('La nueva fecha debe estar entre hoy y los próximos 180 días.');
      return;
    }
    state.mutating = true;
    byId('decisionSubmit').disabled = true;
    byId('decisionSubmit').textContent = 'Guardando…';
    try {
      var method = dialog.mode === 'create' ? 'POST' : 'PATCH';
      var body = replayBody || (dialog.mode === 'create' ? buildPostBody(dialog) : buildPatchBody(dialog));
      var contract = await requestContract(method, body);
      closeDialog();
      renderContract(contract, dialog.mode === 'create' ? 'Compromiso creado' : 'Compromiso actualizado');
    } catch (error) {
      if (global.MuniAuth && typeof global.MuniAuth.isAuthError === 'function' && global.MuniAuth.isAuthError(error)) return;
      var messages = {
        403: 'Tu perfil no tiene permiso para esta acción. Actualizá el registro antes de continuar.',
        409: 'El compromiso cambió o el comando ya fue procesado. Recargá el registro antes de reintentar.',
        422: 'La transición, la evidencia o la fecha ya no son válidas para el estado actual.',
        503: 'El registro no está disponible temporalmente. Reintentá el mismo comando; el estado visible no fue reemplazado.'
      };
      var ambiguousOutcome = Boolean(error && error.mutationOutcomeAmbiguous);
      if (ambiguousOutcome && body) {
        dialog.replayBody = body;
        setDialogReplayLocked(true);
      }
      showDialogError(ambiguousOutcome
        ? 'No se pudo confirmar el resultado. Reintentá el mismo comando; el estado visible no fue reemplazado.'
        : (messages[error && error.status] || 'La respuesta no pudo verificarse. El estado visible no fue reemplazado.'));
      setStatus('error', ambiguousOutcome ? 'Resultado sin confirmar' :
        error && error.status === 409 ? 'Conflicto de versión' : 'Cambio no guardado', true);
    } finally {
      state.mutating = false;
    }
  }

  function handleDocumentClick(event) {
    if (event.target.closest('[data-close-dialog]')) { closeDialog(); return; }
    var create = event.target.closest('[data-create-priority]');
    if (create) { openCreateDialog(create.dataset.createPriority); return; }
    var open = event.target.closest('[data-open-commitment]');
    if (open) { openDrawer(open.dataset.openCommitment, open); return; }
    var transition = event.target.closest('[data-transition]');
    if (transition) { openTransitionDialog(transition.dataset.transition, transition.dataset.commitmentId); return; }
    if (event.target.closest('[data-close-drawer]')) closeDrawer();
  }
  function handleKeydown(event) {
    if (event.key === 'Escape' && !byId('decisionDrawer').hidden && !byId('decisionDialog').open) closeDrawer();
    if (event.key !== 'Tab' || byId('decisionDrawer').hidden || byId('decisionDialog').open) return;
    var drawer = byId('decisionDrawer').querySelector('.decision-drawer');
    var focusable = Array.from(drawer.querySelectorAll('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'));
    if (focusable.length === 0) { event.preventDefault(); drawer.focus(); return; }
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && documentRef.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && documentRef.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  function installEvents() {
    byId('decisionRetry').addEventListener('click', loadLedger);
    byId('decisionFilters').addEventListener('click', function(event) {
      var button = event.target.closest('[data-filter]');
      if (!button || !state.contract) return;
      state.filter = button.dataset.filter;
      byId('decisionFilters').querySelectorAll('[data-filter]').forEach(function(item) {
        item.setAttribute('aria-pressed', String(item === button));
      });
      renderCommitments(state.contract);
    });
    documentRef.addEventListener('click', handleDocumentClick);
    documentRef.addEventListener('keydown', handleKeydown);
    byId('decisionForm').addEventListener('submit', function(event) {
      event.preventDefault();
      submitMutation();
    });
    byId('decisionDialog').addEventListener('close', function() {
      state.dialog = null;
      resetDialogError();
    });
  }
  function init() {
    if (!byId('decisionLedger')) return;
    installEvents();
    loadLedger();
  }

  global.MuniGrhActionLedger = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    inspectContract: inspectContract
  });
  if (documentRef.readyState === 'loading') documentRef.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}(window));
