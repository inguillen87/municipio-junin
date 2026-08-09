(function (global) {
  'use strict';

  var ENDPOINT = '/api/grh-close';
  var DEFAULT_TIMEOUT_MS = 10000;
  var MAX_TIMEOUT_MS = 60000;
  var THRESHOLD = 10;
  var COMPONENT_KEYS = Object.freeze([
    'grossWithFamilyAllowancesCents',
    'contributoryEarningsCents',
    'nonContributoryEarningsCents',
    'familyAllowancesCents',
    'employeeWithholdingsCents',
    'netPayrollCents',
    'netToPayCents',
    'employerContributionsCents'
  ]);
  var CONTROL_KEYS = Object.freeze([
    'netIdentityVarianceCents',
    'netToPayVarianceCents',
    'roundingToleranceCents',
    'identityExactlyReconciled',
    'identityWithinRoundingTolerance'
  ]);
  var RECONCILIATION_KEYS = Object.freeze([
    'calculationRuns',
    'totpagoRuns',
    'matchedRuns',
    'fullyReconciledRuns',
    'runCoveragePct',
    'metricExactRatePct',
    'valueAgreementPct',
    'absoluteVarianceCents'
  ]);
  var RECONCILIATION_DELTA_KEYS = Object.freeze([
    'runCoveragePct',
    'metricExactRatePct',
    'valueAgreementPct',
    'absoluteVarianceCents'
  ]);
  var SHAPES = Object.freeze({
    top: ['schemaVersion', 'policyVersion', 'source', 'privacy', 'metric', 'series', 'comparison'],
    source: ['canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf', 'latestValidCalculationPeriod', 'realtime'],
    privacy: ['audience', 'threshold', 'aggregateOnly', 'containsPii', 'employeeIdentifiersExported', 'rawRowsExported', 'categoricalLabelsExported', 'cellCodesExported', 'comparisonRule'],
    metric: ['grain', 'currency', 'amountUnit', 'status', 'interpretation'],
    row: ['period', 'participantCount', 'participantDisplay', 'privacyStatus', 'components', 'control', 'reconciliation'],
    comparison: ['status', 'reason', 'previousPeriod', 'currentPeriod', 'participantDelta', 'componentDeltas', 'reconciliationDeltas']
  });
  var PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;

  function CloseDataError(code, status) {
    this.name = 'CloseDataError';
    this.code = code;
    this.status = validStatus(status) ? status : 0;
    this.message = ({
      CLOSE_CLIENT_UNAVAILABLE: 'El cliente autenticado no esta disponible.',
      CLOSE_CLIENT_UNSUPPORTED: 'El navegador no admite la carga segura.',
      CLOSE_OPTIONS_INVALID: 'La configuracion de carga no es valida.',
      CLOSE_REQUEST_TIMEOUT: 'La consulta excedio el tiempo permitido.',
      CLOSE_REQUEST_ABORTED: 'La consulta fue cancelada.',
      CLOSE_REQUEST_FAILED: 'No se pudo consultar el cierre GRH.',
      CLOSE_HTTP_ERROR: 'El cierre GRH respondio con un estado no exitoso.',
      CLOSE_RESPONSE_INVALID: 'La respuesta del cierre GRH no es valida.',
      CLOSE_RESPONSE_NOT_JSON: 'El cierre GRH no entrego un contrato JSON.',
      CLOSE_RESPONSE_INVALID_JSON: 'El cierre GRH entrego un JSON invalido.',
      CLOSE_CONTRACT_INVALID: 'El contrato de cierre GRH fue rechazado.'
    })[code] || 'La operacion de cierre GRH fue rechazada.';
    if (Error.captureStackTrace) Error.captureStackTrace(this, CloseDataError);
  }

  CloseDataError.prototype = Object.create(Error.prototype);
  CloseDataError.prototype.constructor = CloseDataError;

  function record(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function exactKeys(value, keys) {
    if (!record(value)) return false;
    var actual = Object.keys(value).sort();
    var expected = keys.slice().sort();
    return actual.length === expected.length && actual.every(function (key, index) {
      return key === expected[index];
    });
  }

  function nonNegativeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function signedInteger(value) {
    return Number.isSafeInteger(value);
  }

  function percentage(value) {
    return Number.isFinite(value) && value >= 0 && value <= 100;
  }

  function closeTo(left, right) {
    return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 0.0001;
  }

  function round4(value) {
    return Number(value.toFixed(4));
  }

  function allNull(value, keys) {
    return exactKeys(value, keys) && keys.every(function (key) { return value[key] === null; });
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

  function validSnapshot(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match) return false;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function validSource(source) {
    return exactKeys(source, SHAPES.source) &&
      typeof source.canonicalSystem === 'string' && source.canonicalSystem.length > 0 &&
      source.canonicalSystem.length <= 80 && /grh/i.test(source.canonicalSystem) &&
      !/[\u0000-\u001f\u007f]/.test(source.canonicalSystem) &&
      /^grh_junin\.[a-z0-9._-]+\.sql\.gz$/i.test(source.sourceFile) &&
      /^[0-9a-f]{64}$/.test(source.sourceSha256) && validSnapshot(source.snapshotAsOf) &&
      PERIOD.test(source.latestValidCalculationPeriod) &&
      source.latestValidCalculationPeriod <= source.snapshotAsOf.slice(0, 7) &&
      source.realtime === false;
  }

  function validPrivacy(privacy) {
    return exactKeys(privacy, SHAPES.privacy) && privacy.audience === 'interactive' &&
      privacy.threshold === THRESHOLD && privacy.aggregateOnly === true &&
      privacy.containsPii === false && privacy.employeeIdentifiersExported === false &&
      privacy.rawRowsExported === false && privacy.categoricalLabelsExported === false &&
      privacy.cellCodesExported === false &&
      privacy.comparisonRule === 'both_consecutive_periods_released';
  }

  function validMetric(metric) {
    return exactKeys(metric, SHAPES.metric) && metric.grain === 'calendar_month' &&
      metric.currency === 'not_declared_in_source' &&
      metric.amountUnit === 'source_currency_cents' &&
      metric.status === 'calculation_control_not_bank_disbursement' &&
      metric.interpretation === 'arithmetic_decomposition_not_causal_explanation';
  }

  function validComponents(components) {
    return exactKeys(components, COMPONENT_KEYS) &&
      COMPONENT_KEYS.every(function (key) { return nonNegativeInteger(components[key]); }) &&
      components.grossWithFamilyAllowancesCents ===
        components.contributoryEarningsCents + components.nonContributoryEarningsCents +
        components.familyAllowancesCents;
  }

  function validControl(control, components) {
    if (!exactKeys(control, CONTROL_KEYS) ||
        !signedInteger(control.netIdentityVarianceCents) ||
        !signedInteger(control.netToPayVarianceCents) ||
        !nonNegativeInteger(control.roundingToleranceCents) ||
        typeof control.identityExactlyReconciled !== 'boolean' ||
        typeof control.identityWithinRoundingTolerance !== 'boolean') return false;
    var netIdentity = components.netPayrollCents -
      (components.grossWithFamilyAllowancesCents - components.employeeWithholdingsCents);
    var payIdentity = components.netToPayCents - components.netPayrollCents;
    var exact = Math.abs(netIdentity) <= 1 && Math.abs(payIdentity) <= 1;
    var within = Math.abs(netIdentity) <= control.roundingToleranceCents &&
      Math.abs(payIdentity) <= control.roundingToleranceCents;
    return control.netIdentityVarianceCents === netIdentity &&
      control.netToPayVarianceCents === payIdentity &&
      control.identityExactlyReconciled === exact &&
      control.identityWithinRoundingTolerance === within;
  }

  function validReconciliation(row) {
    if (!exactKeys(row, RECONCILIATION_KEYS)) return false;
    var integerKeys = ['calculationRuns', 'totpagoRuns', 'matchedRuns', 'fullyReconciledRuns'];
    if (!integerKeys.every(function (key) { return nonNegativeInteger(row[key]); }) ||
        row.calculationRuns <= 0 || row.matchedRuns > row.calculationRuns ||
        row.matchedRuns > row.totpagoRuns || row.fullyReconciledRuns > row.matchedRuns ||
        !percentage(row.runCoveragePct) || !percentage(row.metricExactRatePct) ||
        !percentage(row.valueAgreementPct) || !nonNegativeInteger(row.absoluteVarianceCents)) return false;
    var unionRuns = row.calculationRuns + row.totpagoRuns - row.matchedRuns;
    return unionRuns > 0 && closeTo(row.runCoveragePct, round4(row.matchedRuns / unionRuns * 100));
  }

  function validSeries(series, latestPeriod) {
    if (!Array.isArray(series) || series.length < 2 || series.length > 1000) return false;
    var previous = null;
    var periods = new Set();
    for (var index = 0; index < series.length; index += 1) {
      var row = series[index];
      if (!exactKeys(row, SHAPES.row) || !exactKeys(row.components, COMPONENT_KEYS) ||
          !exactKeys(row.control, CONTROL_KEYS) || !exactKeys(row.reconciliation, RECONCILIATION_KEYS) ||
          !PERIOD.test(row.period) || periods.has(row.period) || (previous && row.period <= previous)) return false;
      periods.add(row.period);
      previous = row.period;
      if (row.privacyStatus === 'released') {
        if (!nonNegativeInteger(row.participantCount) || row.participantCount < THRESHOLD ||
            row.participantDisplay !== String(row.participantCount) ||
            !validComponents(row.components) || !validControl(row.control, row.components) ||
            !validReconciliation(row.reconciliation)) return false;
      } else if (row.privacyStatus === 'suppressed') {
        if (row.participantCount !== null || row.participantDisplay !== '<10' ||
            !allNull(row.components, COMPONENT_KEYS) || !allNull(row.control, CONTROL_KEYS) ||
            !allNull(row.reconciliation, RECONCILIATION_KEYS)) return false;
      } else {
        return false;
      }
    }
    return previous === latestPeriod;
  }

  function validComparison(comparison, series, latestPeriod) {
    if (!exactKeys(comparison, SHAPES.comparison) ||
        !exactKeys(comparison.componentDeltas, COMPONENT_KEYS) ||
        !exactKeys(comparison.reconciliationDeltas, RECONCILIATION_DELTA_KEYS)) return false;
    var expectedPrevious = previousCalendarMonth(latestPeriod);
    if (comparison.previousPeriod !== expectedPrevious || comparison.currentPeriod !== latestPeriod) return false;
    var previous = series.find(function (row) { return row.period === expectedPrevious; });
    var current = series.find(function (row) { return row.period === latestPeriod; });
    var released = previous && current && previous.privacyStatus === 'released' && current.privacyStatus === 'released';
    if (!released) {
      return comparison.status === 'unavailable' &&
        comparison.reason === (previous ? 'privacy_protected' : 'period_missing') &&
        comparison.participantDelta === null && allNull(comparison.componentDeltas, COMPONENT_KEYS) &&
        allNull(comparison.reconciliationDeltas, RECONCILIATION_DELTA_KEYS);
    }
    return comparison.status === 'released' && comparison.reason === 'both_periods_released' &&
      comparison.participantDelta === current.participantCount - previous.participantCount &&
      COMPONENT_KEYS.every(function (key) {
        return comparison.componentDeltas[key] === current.components[key] - previous.components[key];
      }) &&
      comparison.reconciliationDeltas.runCoveragePct === round4(current.reconciliation.runCoveragePct - previous.reconciliation.runCoveragePct) &&
      comparison.reconciliationDeltas.metricExactRatePct === round4(current.reconciliation.metricExactRatePct - previous.reconciliation.metricExactRatePct) &&
      comparison.reconciliationDeltas.valueAgreementPct === round4(current.reconciliation.valueAgreementPct - previous.reconciliation.valueAgreementPct) &&
      comparison.reconciliationDeltas.absoluteVarianceCents === current.reconciliation.absoluteVarianceCents - previous.reconciliation.absoluteVarianceCents &&
      signedInteger(comparison.participantDelta) &&
      COMPONENT_KEYS.every(function (key) { return signedInteger(comparison.componentDeltas[key]); }) &&
      RECONCILIATION_DELTA_KEYS.every(function (key) {
        return Number.isFinite(comparison.reconciliationDeltas[key]);
      });
  }

  function validContract(data) {
    return exactKeys(data, SHAPES.top) && data.schemaVersion === 'grh-close-v1' &&
      data.policyVersion === 'grh-small-cell-v1' && validSource(data.source) &&
      validPrivacy(data.privacy) && validMetric(data.metric) &&
      validSeries(data.series, data.source.latestValidCalculationPeriod) &&
      validComparison(data.comparison, data.series, data.source.latestValidCalculationPeriod);
  }

  function validStatus(value) {
    return Number.isInteger(value) && value >= 100 && value <= 599;
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
    })) throw new CloseDataError('CLOSE_OPTIONS_INVALID');
    var timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
      throw new CloseDataError('CLOSE_OPTIONS_INVALID');
    }
    var signal = options.signal === undefined ? null : options.signal;
    if (signal !== null && (!record(signal) || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) {
      throw new CloseDataError('CLOSE_OPTIONS_INVALID');
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

  async function load(options) {
    if (!global.MuniAuth || typeof global.MuniAuth.fetch !== 'function') {
      throw new CloseDataError('CLOSE_CLIENT_UNAVAILABLE');
    }
    if (typeof global.AbortController !== 'function') {
      throw new CloseDataError('CLOSE_CLIENT_UNSUPPORTED');
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
      if (callerAborted) throw new CloseDataError('CLOSE_REQUEST_ABORTED');
      var response = await global.MuniAuth.fetch(ENDPOINT, {
        method: 'GET',
        cache: 'no-store',
        redirect: 'error',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response || !validStatus(response.status) || typeof response.ok !== 'boolean') {
        throw new CloseDataError('CLOSE_RESPONSE_INVALID', 502);
      }
      if (!response.ok || response.status < 200 || response.status >= 300) {
        throw new CloseDataError('CLOSE_HTTP_ERROR', response.status);
      }
      if (!jsonContentType(response) || typeof response.json !== 'function') {
        throw new CloseDataError('CLOSE_RESPONSE_NOT_JSON', 502);
      }
      var payload;
      try {
        payload = await response.json();
      } catch (_) {
        throw new CloseDataError('CLOSE_RESPONSE_INVALID_JSON', 502);
      }
      if (!validContract(payload)) throw new CloseDataError('CLOSE_CONTRACT_INVALID', 502);
      return deepFreeze(payload);
    } catch (error) {
      if (error instanceof CloseDataError) throw error;
      if (timedOut) throw new CloseDataError('CLOSE_REQUEST_TIMEOUT', 408);
      if (callerAborted) throw new CloseDataError('CLOSE_REQUEST_ABORTED');
      throw new CloseDataError('CLOSE_REQUEST_FAILED', error && error.status);
    } finally {
      global.clearTimeout(timer);
      if (external) external.removeEventListener('abort', onExternalAbort);
    }
  }

  global.MuniGrhClose = Object.freeze({ load: load });
})(window);
