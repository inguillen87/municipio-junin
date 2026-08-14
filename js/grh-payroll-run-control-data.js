(function installPayrollRunControlClient(global) {
  'use strict';

  var ENDPOINT = '/api/grh-payroll-run-control';
  var SCHEMA_VERSION = 'grh-payroll-run-control-v1';
  var CONTRACT_HEADER = 'X-MuniControl-Contract';
  var DEFAULT_TIMEOUT_MS = 10000;
  var MAX_TIMEOUT_MS = 30000;
  var SOURCE_SHA256 = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';
  var TOP_KEYS = [
    'schemaVersion', 'source', 'privacy', 'metric', 'coverage', 'currentYear',
    'monthly', 'quarantine', 'logCoverage', 'limits'
  ];
  var MONTH_KEYS = [
    'period', 'firstEffectiveDate', 'lastEffectiveDate', 'runHeaders',
    'headersWithCalculation', 'headersWithoutCalculation',
    'headersWithCloseFlag', 'headersWithoutCloseFlag', 'calculationRows'
  ];
  var COVERAGE = Object.freeze({
    sourceRunHeaders: 625,
    validRunHeaders: 612,
    quarantinedRunHeaders: 13,
    validPeriodCount: 217,
    calculationRows: 4363790,
    calculationRunKeys: 611,
    orphanCalculationRunKeys: 0,
    validHeadersWithCalculation: 600,
    validHeadersWithoutCalculation: 12,
    validHeadersWithCloseFlag: 517,
    validHeadersWithoutCloseFlag: 95,
    validHeaderRatePct: 97.92,
    validHeaderWithCalculationRatePct: 98.0392,
    calculationHeaderJoinCoveragePct: 100
  });
  var LIMIT_CODES = [
    'historical_snapshot_not_realtime',
    'close_flag_not_accounting_close',
    'missing_close_flag_not_open',
    'calculation_rows_not_payment',
    'technical_logs_not_confirmed_errors',
    'no_budget_execution_or_bank_payment'
  ];

  function PayrollRunControlDataError(code, status) {
    this.name = 'PayrollRunControlDataError';
    this.code = code;
    this.status = Number.isSafeInteger(status) ? status : 0;
    this.message = ({
      PAYROLL_RUN_CONTROL_CLIENT_UNAVAILABLE: 'El cliente autenticado no está disponible.',
      PAYROLL_RUN_CONTROL_OPTIONS_INVALID: 'La consulta de corridas no tiene opciones válidas.',
      PAYROLL_RUN_CONTROL_HTTP_ERROR: 'No se pudo consultar el control de corridas.',
      PAYROLL_RUN_CONTROL_CONTRACT_MISMATCH: 'La respuesta no pertenece al contrato esperado.',
      PAYROLL_RUN_CONTROL_CONTRACT_INVALID: 'Las corridas no superaron los controles requeridos.',
      PAYROLL_RUN_CONTROL_TIMEOUT: 'La consulta demoró más de lo esperado.',
      PAYROLL_RUN_CONTROL_ABORTED: 'La consulta fue cancelada.'
    })[code] || 'El control de corridas no está disponible.';
  }
  PayrollRunControlDataError.prototype = Object.create(Error.prototype);
  PayrollRunControlDataError.prototype.constructor = PayrollRunControlDataError;

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
  function nonNegative(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }
  function expectedValues(value, expected) {
    return record(value) && Object.keys(expected).every(function (key) {
      return value[key] === expected[key];
    });
  }

  function validContract(value) {
    if (!exactKeys(value, TOP_KEYS) || value.schemaVersion !== SCHEMA_VERSION) return false;
    if (!exactKeys(value.source, [
      'canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf', 'generatedAt',
      'realtime', 'tables', 'firstValidPeriod', 'lastValidPeriod', 'latestValidEffectiveDate'
    ]) || value.source.canonicalSystem !== 'GRH Junín' ||
        value.source.sourceFile !== 'grh_junin.backup_2026080615_plataforma.sql.gz' ||
        value.source.sourceSha256 !== SOURCE_SHA256 || value.source.snapshotAsOf !== '2026-08-06' ||
        value.source.generatedAt !== '2026-08-13T00:00:00.000Z' || value.source.realtime !== false ||
        value.source.firstValidPeriod !== '2008-01' || value.source.lastValidPeriod !== '2026-07' ||
        value.source.latestValidEffectiveDate !== '2026-07-31' ||
        !exactKeys(value.source.tables, ['runHeaders', 'calculationDetails', 'technicalLogs']) ||
        value.source.tables.runHeaders !== 'histocal' ||
        value.source.tables.calculationDetails !== 'calculo' ||
        value.source.tables.technicalLogs !== 'liquidacionlog') return false;

    if (!exactKeys(value.privacy, [
      'threshold', 'aggregateOnly', 'containsPii', 'personIdentifiersExported',
      'rawRowsExported', 'sourceRunKeysExported', 'monetaryAmountsExported',
      'rawTechnicalLogsExported', 'rawMessagesExported'
    ]) || value.privacy.threshold !== 10 || value.privacy.aggregateOnly !== true ||
        ['containsPii', 'personIdentifiersExported', 'rawRowsExported',
          'sourceRunKeysExported', 'monetaryAmountsExported',
          'rawTechnicalLogsExported', 'rawMessagesExported'].some(function (key) {
          return value.privacy[key] !== false;
        })) return false;

    if (!exactKeys(value.metric, [
      'runHeaderGrain', 'calculationRunKeyGrain', 'monthlyGrain', 'validityPolicy',
      'monthMismatchTreatment', 'closeFlagMeaning', 'missingCloseFlagMeaning',
      'calculationMeaning', 'technicalLogMeaning'
    ]) || Object.values(value.metric).some(function (text) {
      return typeof text !== 'string' || text.length < 20 || text.length > 220;
    })) return false;

    if (!exactKeys(value.coverage, Object.keys(COVERAGE)) || !expectedValues(value.coverage, COVERAGE)) return false;
    if (!exactKeys(value.currentYear, [
      'year', 'throughPeriod', 'partial', 'monthsObserved', 'runHeaders',
      'headersWithCalculation', 'headersWithCloseFlag',
      'allObservedRunsHaveCalculation', 'allObservedRunsHaveCloseFlag'
    ]) || value.currentYear.year !== 2026 || value.currentYear.throughPeriod !== '2026-07' ||
        value.currentYear.partial !== true || value.currentYear.monthsObserved !== 7 ||
        value.currentYear.runHeaders !== 26 || value.currentYear.headersWithCalculation !== 26 ||
        value.currentYear.headersWithCloseFlag !== 26 ||
        value.currentYear.allObservedRunsHaveCalculation !== true ||
        value.currentYear.allObservedRunsHaveCloseFlag !== true) return false;

    if (!Array.isArray(value.monthly) || value.monthly.length !== 217) return false;
    var sums = { runs: 0, withCalculation: 0, withoutCalculation: 0, withClose: 0, withoutClose: 0, calculationRows: 0 };
    var previous = '';
    for (var index = 0; index < value.monthly.length; index += 1) {
      var month = value.monthly[index];
      if (!exactKeys(month, MONTH_KEYS) || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month.period) ||
          month.period <= previous || typeof month.firstEffectiveDate !== 'string' ||
          typeof month.lastEffectiveDate !== 'string' || month.firstEffectiveDate > month.lastEffectiveDate ||
          !MONTH_KEYS.slice(3).every(function (key) { return nonNegative(month[key]); }) ||
          month.runHeaders < 1 || month.headersWithCalculation + month.headersWithoutCalculation !== month.runHeaders ||
          month.headersWithCloseFlag + month.headersWithoutCloseFlag !== month.runHeaders) return false;
      sums.runs += month.runHeaders;
      sums.withCalculation += month.headersWithCalculation;
      sums.withoutCalculation += month.headersWithoutCalculation;
      sums.withClose += month.headersWithCloseFlag;
      sums.withoutClose += month.headersWithoutCloseFlag;
      sums.calculationRows += month.calculationRows;
      previous = month.period;
    }
    if (value.monthly[0].period !== '2008-01' || value.monthly[value.monthly.length - 1].period !== '2026-07' ||
        sums.runs !== 612 || sums.withCalculation !== 600 || sums.withoutCalculation !== 12 ||
        sums.withClose !== 517 || sums.withoutClose !== 95 || sums.calculationRows !== 4343520) return false;

    if (!exactKeys(value.quarantine, [
      'signalCode', 'status', 'runHeaders', 'headersWithCalculation',
      'headersWithoutCalculation', 'calculationRows', 'calculationRowRatePct', 'reasonOccurrences'
    ]) || value.quarantine.signalCode !== 'temporal_quarantine_present' ||
        value.quarantine.status !== 'attention_required' || value.quarantine.runHeaders !== 13 ||
        value.quarantine.headersWithCalculation !== 11 || value.quarantine.headersWithoutCalculation !== 2 ||
        value.quarantine.calculationRows !== 20270 || value.quarantine.calculationRowRatePct !== 0.4645 ||
        !Array.isArray(value.quarantine.reasonOccurrences) || value.quarantine.reasonOccurrences.length !== 5 ||
        value.quarantine.reasonOccurrences.some(function (reason) {
          return !exactKeys(reason, ['code', 'count']) || typeof reason.code !== 'string' || !nonNegative(reason.count);
        })) return false;

    if (!exactKeys(value.logCoverage, [
      'sourceRows', 'runKeys', 'joinedRunKeys', 'joinCoveragePct',
      'firstEventDate', 'lastEventDate', 'rawDetailsWithheld'
    ]) || value.logCoverage.sourceRows !== 122 || value.logCoverage.runKeys !== 1 ||
        value.logCoverage.joinedRunKeys !== 1 || value.logCoverage.joinCoveragePct !== 100 ||
        value.logCoverage.firstEventDate !== '2026-06-30' ||
        value.logCoverage.lastEventDate !== '2026-06-30' ||
        value.logCoverage.rawDetailsWithheld !== true) return false;

    return Array.isArray(value.limits) && value.limits.length === LIMIT_CODES.length &&
      value.limits.every(function (limit, index) {
        return exactKeys(limit, ['code', 'text']) && limit.code === LIMIT_CODES[index] &&
          typeof limit.text === 'string' && limit.text.length > 0 && limit.text.length <= 240;
      });
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
    })) throw new PayrollRunControlDataError('PAYROLL_RUN_CONTROL_OPTIONS_INVALID');
    var timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
      throw new PayrollRunControlDataError('PAYROLL_RUN_CONTROL_OPTIONS_INVALID');
    }
    return { timeoutMs: timeoutMs, signal: options.signal || null };
  }

  function jsonResponse(response) {
    var value = response && response.headers && typeof response.headers.get === 'function'
      ? response.headers.get('content-type') : null;
    return typeof value === 'string' && /^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|\s*$)/i.test(value);
  }

  async function load(options) {
    if (!global.MuniAuth || typeof global.MuniAuth.fetch !== 'function') {
      throw new PayrollRunControlDataError('PAYROLL_RUN_CONTROL_CLIENT_UNAVAILABLE');
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
      if (callerAborted) throw new PayrollRunControlDataError('PAYROLL_RUN_CONTROL_ABORTED');
      var response = await global.MuniAuth.fetch(ENDPOINT, {
        method: 'GET', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json' }, signal: controller.signal
      });
      if (!response || typeof response.ok !== 'boolean' || !response.ok) {
        throw new PayrollRunControlDataError('PAYROLL_RUN_CONTROL_HTTP_ERROR', response && response.status);
      }
      if (!response.headers || response.headers.get(CONTRACT_HEADER) !== SCHEMA_VERSION) {
        throw new PayrollRunControlDataError('PAYROLL_RUN_CONTROL_CONTRACT_MISMATCH', 502);
      }
      if (!jsonResponse(response) || typeof response.json !== 'function') {
        throw new PayrollRunControlDataError('PAYROLL_RUN_CONTROL_CONTRACT_INVALID', 502);
      }
      var payload = await response.json();
      if (!validContract(payload)) {
        throw new PayrollRunControlDataError('PAYROLL_RUN_CONTROL_CONTRACT_INVALID', 502);
      }
      return deepFreeze(payload);
    } catch (error) {
      if (error instanceof PayrollRunControlDataError) throw error;
      if (timedOut) throw new PayrollRunControlDataError('PAYROLL_RUN_CONTROL_TIMEOUT', 408);
      if (callerAborted) throw new PayrollRunControlDataError('PAYROLL_RUN_CONTROL_ABORTED');
      throw new PayrollRunControlDataError('PAYROLL_RUN_CONTROL_HTTP_ERROR', error && error.status);
    } finally {
      global.clearTimeout(timer);
      if (external) external.removeEventListener('abort', onExternalAbort);
    }
  }

  global.MuniGrhPayrollRunControl = Object.freeze({ load: load });
}(window));
