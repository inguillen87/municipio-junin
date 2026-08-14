(function (global) {
  'use strict';

  var ENDPOINT = '/api/grh-decision-brief';
  var CONTRACT_HEADER = 'X-MuniControl-Contract';
  var SCHEMA_VERSION = 'grh-decision-brief-v1';
  var POLICY_VERSION = 'grh-small-cell-v1';
  var DEFAULT_TIMEOUT_MS = 10000;
  var MAX_TIMEOUT_MS = 60000;
  var PRIVACY_THRESHOLD = 10;
  var PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;
  var SHAPES = Object.freeze({
    top: Object.freeze(['schemaVersion', 'policyVersion', 'source', 'privacy', 'period', 'status', 'situation', 'change', 'priorities', 'limits']),
    source: Object.freeze(['canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf', 'latestValidCalculationPeriod', 'realtime']),
    privacy: Object.freeze(['audience', 'threshold', 'aggregateOnly', 'containsPii', 'employeeIdentifiersExported', 'rawRowsExported', 'categoricalLabelsExported', 'cellCodesExported', 'monetaryAmountsExported']),
    situation: Object.freeze(['participantCount', 'participantDisplay', 'qualityScorePct', 'temporalQuarantineRows', 'runCoveragePct', 'metricExactRatePct', 'valueAgreementPct', 'identityWithinRoundingTolerance']),
    change: Object.freeze(['status', 'previousPeriod', 'participantDelta', 'runCoverageDeltaPctPoints', 'metricExactRateDeltaPctPoints', 'valueAgreementDeltaPctPoints']),
    priority: Object.freeze(['code', 'severity', 'href', 'requiredCapability'])
  });
  var PRIORITY_CONTRACT = Object.freeze({
    cross_source_material_difference: Object.freeze({
      severity: 'critical',
      href: 'hacienda.html',
      requiredCapability: 'navigation.hacienda'
    }),
    temporal_quarantine_present: Object.freeze({
      severity: 'warning',
      href: 'control.html',
      requiredCapability: 'navigation.data-quality'
    }),
    historical_snapshot: Object.freeze({
      severity: 'context',
      href: null,
      requiredCapability: null
    })
  });
  var LIMITS = Object.freeze([
    'historical_snapshot_not_realtime',
    'calculation_control_not_bank_disbursement',
    'currency_not_declared_in_source',
    'arithmetic_decomposition_not_causal_explanation',
    'snapshot_reconciliation_not_monthly_series'
  ]);
  var STATUS_BY_SEVERITY = Object.freeze({
    critical: 'attention_required',
    warning: 'review_recommended',
    context: 'context_only'
  });
  var SEVERITY_ORDER = Object.freeze({ critical: 0, warning: 1, context: 2 });

  function DecisionBriefDataError(code, status) {
    this.name = 'DecisionBriefDataError';
    this.code = code;
    this.status = validHttpStatus(status) ? status : 0;
    this.message = ({
      DECISION_BRIEF_CLIENT_UNAVAILABLE: 'El cliente autenticado no esta disponible.',
      DECISION_BRIEF_CLIENT_UNSUPPORTED: 'El navegador no admite la carga segura.',
      DECISION_BRIEF_OPTIONS_INVALID: 'La configuracion de carga no es valida.',
      DECISION_BRIEF_REQUEST_TIMEOUT: 'La consulta excedio el tiempo permitido.',
      DECISION_BRIEF_REQUEST_ABORTED: 'La consulta fue cancelada.',
      DECISION_BRIEF_REQUEST_FAILED: 'No se pudo consultar el brief decisional GRH.',
      DECISION_BRIEF_HTTP_ERROR: 'El brief decisional GRH respondio con un estado no exitoso.',
      DECISION_BRIEF_RESPONSE_INVALID: 'La respuesta del brief decisional GRH no es valida.',
      DECISION_BRIEF_RESPONSE_NOT_JSON: 'El brief decisional GRH no entrego un contrato JSON.',
      DECISION_BRIEF_RESPONSE_CONTRACT_MISMATCH: 'El encabezado contractual del brief decisional GRH fue rechazado.',
      DECISION_BRIEF_RESPONSE_INVALID_JSON: 'El brief decisional GRH entrego un JSON invalido.',
      DECISION_BRIEF_CONTRACT_INVALID: 'El contrato del brief decisional GRH fue rechazado.'
    })[code] || 'La operacion del brief decisional GRH fue rechazada.';
    if (Error.captureStackTrace) Error.captureStackTrace(this, DecisionBriefDataError);
  }

  DecisionBriefDataError.prototype = Object.create(Error.prototype);
  DecisionBriefDataError.prototype.constructor = DecisionBriefDataError;

  function record(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function exactKeys(value, expected) {
    if (!record(value)) return false;
    var actual = Object.keys(value).sort();
    var wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every(function (key, index) {
      return key === wanted[index];
    });
  }

  function validHttpStatus(value) {
    return Number.isInteger(value) && value >= 100 && value <= 599;
  }

  function nonNegativeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function percentage(value) {
    return Number.isFinite(value) && value >= 0 && value <= 100;
  }

  function signedPercentagePoints(value) {
    return Number.isFinite(value) && value >= -100 && value <= 100;
  }

  function validSnapshot(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match) return false;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function previousCalendarMonth(period) {
    var match = PERIOD.exec(period || '');
    if (!match) return null;
    var year = Number(match[1]);
    var month = Number(match[2]);
    return month === 1
      ? String(year - 1).padStart(4, '0') + '-12'
      : String(year).padStart(4, '0') + '-' + String(month - 1).padStart(2, '0');
  }

  function validSource(source) {
    return exactKeys(source, SHAPES.source) &&
      typeof source.canonicalSystem === 'string' && source.canonicalSystem.length > 0 &&
      source.canonicalSystem.length <= 80 && /grh/i.test(source.canonicalSystem) &&
      !/[\u0000-\u001f\u007f]/.test(source.canonicalSystem) &&
      /^grh_junin\.[a-z0-9._-]+\.sql\.gz$/i.test(source.sourceFile) &&
      /^[0-9a-f]{64}$/.test(source.sourceSha256) &&
      validSnapshot(source.snapshotAsOf) && PERIOD.test(source.latestValidCalculationPeriod) &&
      source.latestValidCalculationPeriod <= source.snapshotAsOf.slice(0, 7) &&
      source.realtime === false;
  }

  function validPrivacy(privacy) {
    return exactKeys(privacy, SHAPES.privacy) && privacy.audience === 'interactive' &&
      privacy.threshold === PRIVACY_THRESHOLD && privacy.aggregateOnly === true &&
      privacy.containsPii === false && privacy.employeeIdentifiersExported === false &&
      privacy.rawRowsExported === false && privacy.categoricalLabelsExported === false &&
      privacy.cellCodesExported === false && privacy.monetaryAmountsExported === false;
  }

  function monthlySituationReleased(situation) {
    return nonNegativeInteger(situation.participantCount) &&
      situation.participantCount >= PRIVACY_THRESHOLD &&
      situation.participantDisplay === String(situation.participantCount) &&
      percentage(situation.runCoveragePct) && percentage(situation.metricExactRatePct) &&
      percentage(situation.valueAgreementPct) &&
      typeof situation.identityWithinRoundingTolerance === 'boolean';
  }

  function monthlySituationProtected(situation) {
    return situation.participantCount === null && situation.participantDisplay === '<10' &&
      situation.runCoveragePct === null && situation.metricExactRatePct === null &&
      situation.valueAgreementPct === null && situation.identityWithinRoundingTolerance === null;
  }

  function validSituation(situation) {
    return exactKeys(situation, SHAPES.situation) && percentage(situation.qualityScorePct) &&
      nonNegativeInteger(situation.temporalQuarantineRows) &&
      (monthlySituationReleased(situation) || monthlySituationProtected(situation));
  }

  function allNullChangeDeltas(change) {
    return change.participantDelta === null && change.runCoverageDeltaPctPoints === null &&
      change.metricExactRateDeltaPctPoints === null && change.valueAgreementDeltaPctPoints === null;
  }

  function validChange(change, period, released) {
    if (!exactKeys(change, SHAPES.change) ||
        !['released', 'privacy_protected', 'period_missing'].includes(change.status) ||
        change.previousPeriod !== previousCalendarMonth(period)) return false;
    if (change.status === 'released') {
      return released && Number.isSafeInteger(change.participantDelta) &&
        signedPercentagePoints(change.runCoverageDeltaPctPoints) &&
        signedPercentagePoints(change.metricExactRateDeltaPctPoints) &&
        signedPercentagePoints(change.valueAgreementDeltaPctPoints);
    }
    return allNullChangeDeltas(change);
  }

  function validPriorities(priorities, status, situation) {
    if (!Array.isArray(priorities) || priorities.length < 1 || priorities.length > 3) return false;
    var seen = [];
    var previousSeverity = -1;
    for (var index = 0; index < priorities.length; index += 1) {
      var priority = priorities[index];
      if (!exactKeys(priority, SHAPES.priority) || !Object.prototype.hasOwnProperty.call(PRIORITY_CONTRACT, priority.code) ||
          seen.includes(priority.code)) return false;
      var expected = PRIORITY_CONTRACT[priority.code];
      if (priority.severity !== expected.severity || priority.href !== expected.href ||
          priority.requiredCapability !== expected.requiredCapability) return false;
      var order = SEVERITY_ORDER[priority.severity];
      if (order < previousSeverity) return false;
      previousSeverity = order;
      seen.push(priority.code);
    }
    if (STATUS_BY_SEVERITY[priorities[0].severity] !== status || !seen.includes('historical_snapshot')) return false;
    if (seen.includes('temporal_quarantine_present') !== (situation.temporalQuarantineRows > 0)) return false;
    return true;
  }

  function validLimits(limits) {
    return Array.isArray(limits) && limits.length === LIMITS.length &&
      limits.every(function (value, index) { return value === LIMITS[index]; });
  }

  function validContract(data) {
    if (!exactKeys(data, SHAPES.top) || data.schemaVersion !== SCHEMA_VERSION ||
        data.policyVersion !== POLICY_VERSION || !validSource(data.source) ||
        !validPrivacy(data.privacy) || !PERIOD.test(data.period) ||
        data.period !== data.source.latestValidCalculationPeriod ||
        !['attention_required', 'review_recommended', 'context_only'].includes(data.status) ||
        !validSituation(data.situation)) return false;
    var released = data.situation.participantCount !== null;
    return validChange(data.change, data.period, released) &&
      validPriorities(data.priorities, data.status, data.situation) && validLimits(data.limits);
  }

  function deepFreeze(value, seen) {
    if (!value || typeof value !== 'object') return value;
    var visited = seen || new Set();
    if (visited.has(value)) return value;
    visited.add(value);
    Object.keys(value).forEach(function (key) { deepFreeze(value[key], visited); });
    return Object.freeze(value);
  }

  function normalizeOptions(options) {
    if (options === undefined) return { timeoutMs: DEFAULT_TIMEOUT_MS, signal: null };
    if (!record(options) || !Object.keys(options).every(function (key) {
      return key === 'timeoutMs' || key === 'signal';
    })) throw new DecisionBriefDataError('DECISION_BRIEF_OPTIONS_INVALID');
    var timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
      throw new DecisionBriefDataError('DECISION_BRIEF_OPTIONS_INVALID');
    }
    var signal = options.signal === undefined ? null : options.signal;
    if (signal !== null && (!record(signal) || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) {
      throw new DecisionBriefDataError('DECISION_BRIEF_OPTIONS_INVALID');
    }
    return { timeoutMs: timeoutMs, signal: signal };
  }

  function jsonContentType(response) {
    var value = response && response.headers && typeof response.headers.get === 'function'
      ? response.headers.get('content-type')
      : null;
    return typeof value === 'string' &&
      /^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|\s*$)/i.test(value);
  }

  function responseContract(response) {
    return response && response.headers && typeof response.headers.get === 'function'
      ? response.headers.get(CONTRACT_HEADER)
      : null;
  }

  async function load(options) {
    if (!global.MuniAuth || typeof global.MuniAuth.fetch !== 'function') {
      throw new DecisionBriefDataError('DECISION_BRIEF_CLIENT_UNAVAILABLE');
    }
    if (typeof global.AbortController !== 'function' || typeof global.setTimeout !== 'function' ||
        typeof global.clearTimeout !== 'function') {
      throw new DecisionBriefDataError('DECISION_BRIEF_CLIENT_UNSUPPORTED');
    }
    var normalized = normalizeOptions(options);
    var controller = new global.AbortController();
    var timedOut = false;
    var callerAborted = false;
    var external = normalized.signal;
    var onExternalAbort = function () {
      callerAborted = true;
      if (!controller.signal.aborted) controller.abort();
    };
    if (external) {
      if (external.aborted) onExternalAbort();
      else external.addEventListener('abort', onExternalAbort, { once: true });
    }
    var timer = global.setTimeout(function () {
      timedOut = true;
      if (!controller.signal.aborted) controller.abort();
    }, normalized.timeoutMs);
    try {
      if (callerAborted) throw new DecisionBriefDataError('DECISION_BRIEF_REQUEST_ABORTED');
      var response = await global.MuniAuth.fetch(ENDPOINT, {
        method: 'GET',
        cache: 'no-store',
        redirect: 'error',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response || !validHttpStatus(response.status) || typeof response.ok !== 'boolean') {
        throw new DecisionBriefDataError('DECISION_BRIEF_RESPONSE_INVALID', 502);
      }
      if (!response.ok || response.status < 200 || response.status >= 300) {
        if (response.body && typeof response.body.cancel === 'function') {
          try {
            await response.body.cancel();
          } catch (_) {
            // Keep the public failure detail-free if the transport cannot cancel.
          }
        }
        throw new DecisionBriefDataError('DECISION_BRIEF_HTTP_ERROR', response.status);
      }
      if (responseContract(response) !== SCHEMA_VERSION) {
        throw new DecisionBriefDataError('DECISION_BRIEF_RESPONSE_CONTRACT_MISMATCH', 502);
      }
      if (!jsonContentType(response) || typeof response.json !== 'function') {
        throw new DecisionBriefDataError('DECISION_BRIEF_RESPONSE_NOT_JSON', 502);
      }
      var payload;
      try {
        payload = await response.json();
      } catch (_) {
        throw new DecisionBriefDataError('DECISION_BRIEF_RESPONSE_INVALID_JSON', 502);
      }
      if (!validContract(payload)) {
        throw new DecisionBriefDataError('DECISION_BRIEF_CONTRACT_INVALID', 502);
      }
      return deepFreeze(payload);
    } catch (error) {
      if (error instanceof DecisionBriefDataError) throw error;
      if (timedOut) throw new DecisionBriefDataError('DECISION_BRIEF_REQUEST_TIMEOUT', 408);
      if (callerAborted) throw new DecisionBriefDataError('DECISION_BRIEF_REQUEST_ABORTED');
      throw new DecisionBriefDataError('DECISION_BRIEF_REQUEST_FAILED', error && error.status);
    } finally {
      global.clearTimeout(timer);
      if (external) external.removeEventListener('abort', onExternalAbort);
    }
  }

  global.MuniGrhDecisionBrief = Object.freeze({ load: load });
})(window);
