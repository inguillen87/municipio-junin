(function exposePersonasReviewData(global) {
  'use strict';

  var REVIEW_CONTRACT = 'grh-personas-review-v1';
  var DECISION_CONTRACT = 'grh-personas-review-decision-v1';
  var REVIEW_ENDPOINT = '/api/grh-personas-review';
  var DECISION_ENDPOINT = '/api/grh-personas-review-decision';
  var CONTRACT_HEADER = 'x-municontrol-contract';
  var PURPOSE = 'IDENTITY_LINKAGE_REVIEW';
  var DOCUMENT_REVEAL_PURPOSE = 'IDENTITY_DOCUMENT_REVEAL';
  var QUEUE_STATUSES = Object.freeze(['PENDING', 'DEFERRED', 'APPROVED', 'REJECTED']);
  var CASE_KINDS = Object.freeze(['CANDIDATE', 'AMBIGUOUS', 'UNMATCHED']);
  var PRIORITIES = Object.freeze(['DOCUMENT_CONFLICT', 'MANUAL_REVIEW', 'STANDARD']);
  var MATCH_METHODS = Object.freeze([
    'UNIQUE_VALID_CUIL', 'UNIQUE_DNI_BACKUP', 'DUPLICATE_VALID_CUIL_NAME',
    'DUPLICATE_DNI_NAME', 'DOCUMENT_CANDIDATE', 'NAME_BIRTHDATE_SIGNAL', 'NAME_ONLY_SIGNAL'
  ]);
  var EVIDENCE_LEVELS = Object.freeze(['STRONG', 'ASSISTED', 'CONFLICT', 'INSUFFICIENT']);
  var DOCUMENT_EVIDENCE = Object.freeze(['MATCH', 'CONFLICT', 'MISSING']);
  var NAME_EVIDENCE = Object.freeze(['MATCH', 'DIFFERENT', 'MISSING']);
  var DECISIONS = Object.freeze(['APPROVE', 'DEFER', 'REJECT']);
  var REASON_CODES = Object.freeze([
    'EVIDENCE_CONFIRMED', 'MANUAL_SOURCE_CHECK_CONFIRMED', 'INSUFFICIENT_EVIDENCE',
    'SOURCE_DATA_REVIEW_REQUIRED', 'DIFFERENT_PERSON', 'NO_MATCH_CONFIRMED'
  ]);
  var CASE_KEY_PATTERN = /^[0-9a-f]{64}$/;
  var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function PersonasReviewDataError(message, code, status) {
    this.name = 'PersonasReviewDataError';
    this.message = message;
    this.code = code;
    this.status = status || 0;
    if (Error.captureStackTrace) Error.captureStackTrace(this, PersonasReviewDataError);
  }
  PersonasReviewDataError.prototype = Object.create(Error.prototype);
  PersonasReviewDataError.prototype.constructor = PersonasReviewDataError;

  function exactKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var actual = Object.keys(value).sort();
    var wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every(function same(key, index) { return key === wanted[index]; });
  }

  function isCount(value) { return Number.isSafeInteger(value) && value >= 0; }
  function oneOf(value, allowed) { return allowed.indexOf(value) !== -1; }
  function isNonEmptyText(value, maxLength) {
    return typeof value === 'string' && value.length > 0 && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value);
  }
  function isOptionalText(value, maxLength) { return value === null || isNonEmptyText(value, maxLength); }
  function isDate(value) { return value === null || /^\d{4}-\d{2}-\d{2}$/.test(value); }
  function isDocumentValue(value) {
    return value === null || (typeof value === 'string' && value.length >= 5 && value.length <= 24 && /^[0-9 .-]+$/.test(value));
  }

  function validSource(value) {
    return exactKeys(value, ['snapshotAsOf', 'grhSourceSha256', 'personasSourceSha256', 'matcherVersion', 'evidencePolicyVersion']) &&
      /^\d{4}-\d{2}-\d{2}$/.test(value.snapshotAsOf) &&
      CASE_KEY_PATTERN.test(value.grhSourceSha256) && CASE_KEY_PATTERN.test(value.personasSourceSha256) &&
      isNonEmptyText(value.matcherVersion, 100) && isNonEmptyText(value.evidencePolicyVersion, 100);
  }

  function validPermissions(value) {
    return exactKeys(value, ['canRead', 'canDecide']) && value.canRead === true && typeof value.canDecide === 'boolean';
  }

  function validSummary(value) {
    if (!exactKeys(value, ['totalCases', 'totalOptions', 'byKind', 'byStatus', 'documentConflicts', 'autoApproved']) ||
        !isCount(value.totalCases) || !isCount(value.totalOptions) || !isCount(value.documentConflicts) ||
        value.documentConflicts > value.totalCases || value.autoApproved !== 0 ||
        !exactKeys(value.byKind, ['candidate', 'ambiguous', 'unmatched']) ||
        !exactKeys(value.byStatus, ['pending', 'deferred', 'approved', 'rejected'])) return false;
    var kindCounts = Object.values(value.byKind);
    var statusCounts = Object.values(value.byStatus);
    return kindCounts.every(isCount) && statusCounts.every(isCount) &&
      kindCounts.reduce(function sum(total, item) { return total + item; }, 0) === value.totalCases &&
      statusCounts.reduce(function sum(total, item) { return total + item; }, 0) === value.totalCases;
  }

  function validBase(value) {
    return value.schemaVersion === REVIEW_CONTRACT && value.status === 'ready' &&
      validSource(value.source) && validPermissions(value.permissions);
  }

  function validFlags(value) {
    return exactKeys(value, ['documentConflict', 'birthDateConflict', 'nameSupport']) &&
      typeof value.documentConflict === 'boolean' && typeof value.birthDateConflict === 'boolean' &&
      typeof value.nameSupport === 'boolean';
  }

  function validQueueItem(value) {
    return exactKeys(value, ['caseKey', 'kind', 'status', 'priority', 'version', 'optionCount', 'flags']) &&
      CASE_KEY_PATTERN.test(value.caseKey) && oneOf(value.kind, CASE_KINDS) && oneOf(value.status, QUEUE_STATUSES) &&
      oneOf(value.priority, PRIORITIES) && Number.isSafeInteger(value.version) && value.version >= 1 &&
      isCount(value.optionCount) && validFlags(value.flags);
  }

  function validSummaryResponse(value) {
    return exactKeys(value, ['schemaVersion', 'status', 'source', 'permissions', 'summary']) &&
      validBase(value) && validSummary(value.summary);
  }

  function validQueueResponse(value) {
    if (!exactKeys(value, ['schemaVersion', 'status', 'source', 'permissions', 'summary', 'page', 'items']) ||
        !validBase(value) || !validSummary(value.summary) || !exactKeys(value.page, ['limit', 'nextCursor']) ||
        !Number.isSafeInteger(value.page.limit) || value.page.limit < 1 || value.page.limit > 50 ||
        !(value.page.nextCursor === null || CASE_KEY_PATTERN.test(value.page.nextCursor)) ||
        !Array.isArray(value.items) || value.items.length > value.page.limit) return false;
    return value.items.every(validQueueItem);
  }

  function validPerson(value) {
    return exactKeys(value, ['displayName', 'birthDate']) &&
      isOptionalText(value.displayName, 240) && isDate(value.birthDate);
  }

  function validEvidence(value) {
    return exactKeys(value, ['cuil', 'dni', 'name', 'birthDate']) &&
      oneOf(value.cuil, DOCUMENT_EVIDENCE) && oneOf(value.dni, DOCUMENT_EVIDENCE) &&
      oneOf(value.name, NAME_EVIDENCE) && oneOf(value.birthDate, DOCUMENT_EVIDENCE);
  }

  function validOption(value) {
    if (!(exactKeys(value, ['optionKey', 'rank', 'matchMethod', 'evidenceLevel', 'evidence', 'person', 'requiresManualCheck']) &&
      CASE_KEY_PATTERN.test(value.optionKey) && Number.isSafeInteger(value.rank) && value.rank >= 1 &&
      oneOf(value.matchMethod, MATCH_METHODS) && oneOf(value.evidenceLevel, EVIDENCE_LEVELS) &&
      validEvidence(value.evidence) && validPerson(value.person) && typeof value.requiresManualCheck === 'boolean')) return false;
    if (value.evidence.name === 'MATCH' && value.person.displayName === null) return false;
    if (value.evidence.birthDate === 'MATCH' && value.person.birthDate === null) return false;
    return true;
  }

  function validRecordedDecision(value) {
    return value === null || (
      exactKeys(value, ['status', 'selectedOptionKey', 'reasonCode', 'decidedAt']) &&
      oneOf(value.status, ['APPROVED', 'DEFERRED', 'REJECTED']) &&
      (value.selectedOptionKey === null || CASE_KEY_PATTERN.test(value.selectedOptionKey)) &&
      oneOf(value.reasonCode, REASON_CODES) && !Number.isNaN(Date.parse(value.decidedAt))
    );
  }

  function validCase(value) {
    if (!exactKeys(value, ['caseKey', 'kind', 'status', 'priority', 'version', 'flags', 'person', 'options', 'decision']) ||
        !CASE_KEY_PATTERN.test(value.caseKey) || !oneOf(value.kind, CASE_KINDS) || !oneOf(value.status, QUEUE_STATUSES) ||
        !oneOf(value.priority, PRIORITIES) || !Number.isSafeInteger(value.version) || value.version < 1 ||
        !validFlags(value.flags) || !validPerson(value.person) || !Array.isArray(value.options) ||
        !value.options.every(validOption) || !validRecordedDecision(value.decision)) return false;
    var keys = new Set();
    var ranks = new Set();
    return value.options.every(function uniqueOption(option) {
      if (keys.has(option.optionKey) || ranks.has(option.rank)) return false;
      keys.add(option.optionKey);
      ranks.add(option.rank);
      return true;
    });
  }

  function validDetailResponse(value) {
    return exactKeys(value, ['schemaVersion', 'status', 'source', 'permissions', 'summary', 'documentsRevealed', 'case']) &&
      validBase(value) && validSummary(value.summary) && value.documentsRevealed === false && validCase(value.case);
  }

  function validDocumentSet(value) {
    return exactKeys(value, ['cuil', 'dni']) &&
      isDocumentValue(value.cuil) && isDocumentValue(value.dni);
  }

  function validDocumentsResponse(value) {
    if (!exactKeys(value, ['schemaVersion', 'status', 'source', 'permissions', 'documentsRevealed', 'documents']) ||
        !validBase(value) || value.documentsRevealed !== true ||
        !exactKeys(value.documents, ['case', 'options']) ||
        !exactKeys(value.documents.case, ['caseKey', 'documents']) ||
        !CASE_KEY_PATTERN.test(value.documents.case.caseKey) ||
        !validDocumentSet(value.documents.case.documents) ||
        !Array.isArray(value.documents.options) || value.documents.options.length > 100) return false;
    var keys = new Set();
    return value.documents.options.every(function validOptionDocuments(option) {
      if (!exactKeys(option, ['optionKey', 'documents']) || !CASE_KEY_PATTERN.test(option.optionKey) ||
          !validDocumentSet(option.documents) || keys.has(option.optionKey)) return false;
      keys.add(option.optionKey);
      return true;
    });
  }

  function validDecisionRequest(value) {
    if (!exactKeys(value, ['commandId', 'caseKey', 'expectedVersion', 'decision', 'optionKey', 'reasonCode']) ||
        !UUID_PATTERN.test(value.commandId) || !CASE_KEY_PATTERN.test(value.caseKey) ||
        !Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 1 ||
        !oneOf(value.decision, DECISIONS) || !oneOf(value.reasonCode, REASON_CODES)) return false;
    if (value.decision === 'APPROVE') {
      return CASE_KEY_PATTERN.test(value.optionKey) &&
        oneOf(value.reasonCode, ['EVIDENCE_CONFIRMED', 'MANUAL_SOURCE_CHECK_CONFIRMED']);
    }
    if (value.optionKey !== null) return false;
    if (value.decision === 'DEFER') {
      return oneOf(value.reasonCode, ['INSUFFICIENT_EVIDENCE', 'SOURCE_DATA_REVIEW_REQUIRED']);
    }
    return oneOf(value.reasonCode, ['DIFFERENT_PERSON', 'NO_MATCH_CONFIRMED']);
  }

  function validDecisionResponse(value) {
    if (!exactKeys(value, ['schemaVersion', 'status', 'replayed', 'decision']) ||
        value.schemaVersion !== DECISION_CONTRACT || value.status !== 'recorded' ||
        typeof value.replayed !== 'boolean' ||
        !exactKeys(value.decision, ['caseKey', 'status', 'version', 'selectedOptionKey', 'reasonCode', 'decidedAt'])) return false;
    var decision = value.decision;
    return CASE_KEY_PATTERN.test(decision.caseKey) && oneOf(decision.status, ['APPROVED', 'DEFERRED', 'REJECTED']) &&
      Number.isSafeInteger(decision.version) && decision.version >= 2 &&
      (decision.selectedOptionKey === null || CASE_KEY_PATTERN.test(decision.selectedOptionKey)) &&
      oneOf(decision.reasonCode, REASON_CODES) && !Number.isNaN(Date.parse(decision.decidedAt));
  }

  function deepFreeze(value, seen) {
    if (!value || typeof value !== 'object') return value;
    var visited = seen || new Set();
    if (visited.has(value)) return value;
    visited.add(value);
    Object.values(value).forEach(function freezeChild(child) { deepFreeze(child, visited); });
    return Object.freeze(value);
  }

  async function readErrorCode(response) {
    try {
      if (!/^application\/json\b/i.test(response.headers.get('content-type') || '')) return null;
      var payload = await response.clone().json();
      return payload && typeof payload.code === 'string' ? payload.code : null;
    } catch (error) {
      return null;
    }
  }

  async function request(url, options) {
    if (!global.MuniAuth || typeof global.MuniAuth.fetch !== 'function') {
      throw new PersonasReviewDataError('El acceso institucional no está disponible.', 'PERSONAS_REVIEW_CLIENT_UNAVAILABLE', 0);
    }
    var settings = options || {};
    var timeoutMs = Number.isFinite(settings.timeoutMs) ? settings.timeoutMs : 10000;
    var controller = new global.AbortController();
    var timedOut = false;
    var timer = global.setTimeout(function abortRequest() { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      var response = await global.MuniAuth.fetch(url, {
        method: settings.method || 'GET',
        headers: settings.headers,
        body: settings.body,
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal
      });
      if (!response.ok) {
        var serverCode = await readErrorCode(response);
        throw new PersonasReviewDataError('La revisión privada no está disponible.', serverCode || 'PERSONAS_REVIEW_HTTP_ERROR', response.status);
      }
      if (response.headers.get(CONTRACT_HEADER) !== settings.contract) {
        throw new PersonasReviewDataError('La versión de la revisión no coincide.', 'PERSONAS_REVIEW_CONTRACT_MISMATCH', 502);
      }
      if (!/^application\/json\b/i.test(response.headers.get('content-type') || '')) {
        throw new PersonasReviewDataError('La respuesta de revisión no es válida.', 'PERSONAS_REVIEW_CONTENT_TYPE_INVALID', 502);
      }
      var value = await response.json();
      if (!settings.validate(value)) {
        throw new PersonasReviewDataError('La revisión no superó sus controles.', 'PERSONAS_REVIEW_CONTRACT_INVALID', 502);
      }
      return deepFreeze(value);
    } catch (error) {
      if (error instanceof PersonasReviewDataError || (global.MuniAuth.isAuthError && global.MuniAuth.isAuthError(error))) throw error;
      if (error && error.name === 'AbortError') {
        throw new PersonasReviewDataError(
          timedOut ? 'La revisión tardó demasiado.' : 'La consulta fue cancelada.',
          timedOut ? 'PERSONAS_REVIEW_TIMEOUT' : 'PERSONAS_REVIEW_ABORTED',
          timedOut ? 408 : 0
        );
      }
      throw new PersonasReviewDataError('La revisión privada no está disponible.', 'PERSONAS_REVIEW_NETWORK_ERROR', 0);
    } finally {
      global.clearTimeout(timer);
    }
  }

  function loadSummary() {
    return request(REVIEW_ENDPOINT + '?view=summary', {
      contract: REVIEW_CONTRACT,
      validate: validSummaryResponse,
      headers: { Accept: 'application/json' }
    });
  }

  function loadQueue(options) {
    var settings = options || {};
    var status = oneOf(settings.status, QUEUE_STATUSES) ? settings.status : 'PENDING';
    var limit = Number.isSafeInteger(settings.limit) && settings.limit >= 1 && settings.limit <= 50 ? settings.limit : 1;
    var params = new URLSearchParams({ view: 'queue', status: status, limit: String(limit) });
    if (oneOf(settings.kind, CASE_KINDS)) params.set('kind', settings.kind);
    if (CASE_KEY_PATTERN.test(settings.cursor)) params.set('cursor', settings.cursor);
    return request(REVIEW_ENDPOINT + '?' + params.toString(), {
      contract: REVIEW_CONTRACT,
      validate: validQueueResponse,
      headers: { Accept: 'application/json' }
    });
  }

  function loadDetail(caseKey) {
    if (!CASE_KEY_PATTERN.test(caseKey)) {
      return Promise.reject(new PersonasReviewDataError('La sugerencia solicitada no es válida.', 'PERSONAS_REVIEW_CASE_INVALID', 400));
    }
    var params = new URLSearchParams({ view: 'detail', case: caseKey });
    return request(REVIEW_ENDPOINT + '?' + params.toString(), {
      contract: REVIEW_CONTRACT,
      validate: validDetailResponse,
      headers: {
        Accept: 'application/json',
        'X-MuniControl-Purpose': PURPOSE,
        'X-Correlation-Id': createCommandId()
      }
    });
  }

  function loadDocuments(caseKey) {
    if (!CASE_KEY_PATTERN.test(caseKey)) {
      return Promise.reject(new PersonasReviewDataError('La sugerencia solicitada no es válida.', 'PERSONAS_REVIEW_CASE_INVALID', 400));
    }
    var params = new URLSearchParams({ view: 'documents', case: caseKey });
    return request(REVIEW_ENDPOINT + '?' + params.toString(), {
      contract: REVIEW_CONTRACT,
      validate: validDocumentsResponse,
      headers: {
        Accept: 'application/json',
        'X-MuniControl-Purpose': DOCUMENT_REVEAL_PURPOSE,
        'X-Correlation-Id': createCommandId()
      }
    });
  }

  function decide(command) {
    if (!validDecisionRequest(command)) {
      return Promise.reject(new PersonasReviewDataError('La decisión no es válida.', 'PERSONAS_REVIEW_DECISION_INVALID', 400));
    }
    return request(DECISION_ENDPOINT, {
      method: 'POST',
      contract: DECISION_CONTRACT,
      validate: validDecisionResponse,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-MuniControl-Purpose': PURPOSE,
        'X-Correlation-Id': createCommandId()
      },
      body: JSON.stringify(command)
    });
  }

  function createCommandId() {
    if (!global.crypto || typeof global.crypto.randomUUID !== 'function') {
      throw new PersonasReviewDataError('El navegador no puede crear una decisión segura.', 'PERSONAS_REVIEW_UUID_UNAVAILABLE', 0);
    }
    return global.crypto.randomUUID();
  }

  global.MuniPersonasReviewData = Object.freeze({
    REVIEW_CONTRACT: REVIEW_CONTRACT,
    DECISION_CONTRACT: DECISION_CONTRACT,
    PURPOSE: PURPOSE,
    DOCUMENT_REVEAL_PURPOSE: DOCUMENT_REVEAL_PURPOSE,
    PersonasReviewDataError: PersonasReviewDataError,
    validateSummary: validSummaryResponse,
    validateQueue: validQueueResponse,
    validateDetail: validDetailResponse,
    validateDocuments: validDocumentsResponse,
    validateDecision: validDecisionResponse,
    loadSummary: loadSummary,
    loadQueue: loadQueue,
    loadDetail: loadDetail,
    loadDocuments: loadDocuments,
    decide: decide,
    createCommandId: createCommandId
  });
})(window);
