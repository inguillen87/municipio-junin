(function (global) {
  'use strict';

  var ENDPOINT = '/api/grh-absence-insights';
  var SCHEMA_VERSION = 'grh-absence-insights-v1';
  var CONTRACT_HEADER = 'X-MuniControl-Contract';
  var DEFAULT_TIMEOUT_MS = 10000;
  var MAX_TIMEOUT_MS = 30000;
  var TOP_KEYS = [
    'schemaVersion', 'source', 'privacy', 'summary', 'periods', 'comparison',
    'categories', 'protectedBucket', 'coverage', 'limits'
  ];
  var SOURCE_KEYS = [
    'canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf',
    'generatedAt', 'realtime', 'tables'
  ];
  var TABLE_KEYS = ['absenceRecords', 'absenceReasons', 'historicalLeave'];
  var PRIVACY_KEYS = [
    'status', 'threshold', 'aggregateOnly', 'containsPii',
    'personIdentifiersExported', 'rawRowsExported', 'sourceCauseLabelsExported'
  ];
  var SUMMARY_KEYS = [
    'rawAbsenceRows', 'validAbsenceRows', 'quarantinedRows',
    'validReportedDays', 'motiveCatalogEntries'
  ];
  var PERIOD_KEYS = ['label', 'startDate', 'endDate', 'days'];
  var COMPARISON_KEYS = ['current', 'prior', 'deltas'];
  var VALUE_KEYS = ['events', 'people', 'days'];
  var CATEGORY_KEYS = ['key', 'label', 'meaning', 'current', 'prior', 'deltas'];
  var PERIOD_METRIC_KEYS = ['privacyStatus', 'events', 'people', 'days'];
  var COVERAGE_PERIOD_KEYS = [
    'totalEvents', 'publishedCategoryEvents', 'protectedEvents', 'coveragePct'
  ];
  var LIMIT_CODES = [
    'historical_snapshot_not_realtime',
    'absence_records_not_all_leave',
    'legacy_leave_kept_separate',
    'equal_periods_not_causes',
    'small_groups_are_combined'
  ];
  var PERIODS = {
    current: { label: 'Gestión actual hasta el corte', startDate: '2023-12-09', endDate: '2026-08-06', days: 972 },
    prior: { label: 'Mismo tiempo de la gestión anterior', startDate: '2019-12-09', endDate: '2022-08-06', days: 972 }
  };

  function AbsenceInsightsDataError(code, status) {
    this.name = 'AbsenceInsightsDataError';
    this.code = code;
    this.status = Number.isSafeInteger(status) ? status : 0;
    this.message = ({
      ABSENCE_INSIGHTS_CLIENT_UNAVAILABLE: 'El cliente autenticado no está disponible.',
      ABSENCE_INSIGHTS_OPTIONS_INVALID: 'La consulta de ausencias no tiene opciones válidas.',
      ABSENCE_INSIGHTS_HTTP_ERROR: 'No se pudo consultar la información de ausencias.',
      ABSENCE_INSIGHTS_CONTRACT_MISMATCH: 'La respuesta no pertenece al contrato esperado.',
      ABSENCE_INSIGHTS_CONTRACT_INVALID: 'La información de ausencias no superó los controles requeridos.',
      ABSENCE_INSIGHTS_TIMEOUT: 'La consulta demoró más de lo esperado.',
      ABSENCE_INSIGHTS_ABORTED: 'La consulta fue cancelada.'
    })[code] || 'La información explicada de ausencias no está disponible.';
  }
  AbsenceInsightsDataError.prototype = Object.create(Error.prototype);
  AbsenceInsightsDataError.prototype.constructor = AbsenceInsightsDataError;

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
  function nonNegative(value) { return Number.isSafeInteger(value) && value >= 0; }
  function signed(value) { return Number.isSafeInteger(value); }
  function exactPeriod(value, expected) {
    return exactKeys(value, PERIOD_KEYS) && PERIOD_KEYS.every(function (key) {
      return value[key] === expected[key];
    });
  }
  function validValues(value, allowSigned) {
    return exactKeys(value, VALUE_KEYS) && VALUE_KEYS.every(function (key) {
      return allowSigned ? signed(value[key]) : nonNegative(value[key]);
    }) && (allowSigned || value.people <= value.events);
  }
  function validMetric(value) {
    if (!exactKeys(value, PERIOD_METRIC_KEYS) ||
        ['released', 'protected'].indexOf(value.privacyStatus) === -1) return false;
    if (value.privacyStatus === 'protected') {
      return VALUE_KEYS.every(function (key) { return value[key] === null; });
    }
    return VALUE_KEYS.every(function (key) { return nonNegative(value[key]); }) &&
      value.people <= value.events && (value.people === 0 || value.people >= 10);
  }
  function validDelta(delta, current, prior) {
    if (!exactKeys(delta, VALUE_KEYS)) return false;
    var released = current.privacyStatus === 'released' && prior.privacyStatus === 'released';
    return VALUE_KEYS.every(function (key) {
      return released ? signed(delta[key]) && delta[key] === current[key] - prior[key] : delta[key] === null;
    });
  }
  function validCategory(category) {
    return exactKeys(category, CATEGORY_KEYS) && /^reason_\d{2}$/.test(category.key || '') &&
      typeof category.label === 'string' && category.label.length > 0 && category.label.length <= 100 &&
      category.meaning === 'Motivo del catálogo municipal aplicado a registros de ausencia.' &&
      validMetric(category.current) && validMetric(category.prior) &&
      validDelta(category.deltas, category.current, category.prior) &&
      (category.current.privacyStatus === 'released' || category.prior.privacyStatus === 'released');
  }
  function validContract(value) {
    if (!exactKeys(value, TOP_KEYS) || value.schemaVersion !== SCHEMA_VERSION ||
        !exactKeys(value.source, SOURCE_KEYS) || value.source.canonicalSystem !== 'GRH Junín' ||
        value.source.sourceFile !== 'grh_junin.backup_2026080615_plataforma.sql.gz' ||
        !/^[0-9a-f]{64}$/.test(value.source.sourceSha256 || '') ||
        value.source.snapshotAsOf !== '2026-08-06' ||
        value.source.generatedAt !== '2026-08-13T00:00:00.000Z' ||
        value.source.generatedAt.slice(0, 10) < value.source.snapshotAsOf || value.source.realtime !== false ||
        !exactKeys(value.source.tables, TABLE_KEYS) ||
        value.source.tables.absenceRecords !== 'ausencia' ||
        value.source.tables.absenceReasons !== 'motause' ||
        value.source.tables.historicalLeave !== 'licencia' ||
        !exactKeys(value.privacy, PRIVACY_KEYS) ||
        value.privacy.status !== 'released_with_protected_bucket' ||
        value.privacy.threshold !== 10 || value.privacy.aggregateOnly !== true ||
        value.privacy.containsPii !== false || value.privacy.personIdentifiersExported !== false ||
        value.privacy.rawRowsExported !== false || value.privacy.sourceCauseLabelsExported !== false ||
        !exactKeys(value.summary, SUMMARY_KEYS) || !SUMMARY_KEYS.every(function (key) {
          return nonNegative(value.summary[key]);
        }) || value.summary.rawAbsenceRows !== value.summary.validAbsenceRows + value.summary.quarantinedRows ||
        !exactKeys(value.periods, ['current', 'prior']) ||
        !exactPeriod(value.periods.current, PERIODS.current) || !exactPeriod(value.periods.prior, PERIODS.prior) ||
        !exactKeys(value.comparison, COMPARISON_KEYS) ||
        !validValues(value.comparison.current, false) || !validValues(value.comparison.prior, false) ||
        !validValues(value.comparison.deltas, true)) return false;
    if (!VALUE_KEYS.every(function (key) {
      return value.comparison.deltas[key] === value.comparison.current[key] - value.comparison.prior[key];
    })) return false;
    if (!Array.isArray(value.categories) || value.categories.length === 0 ||
        !value.categories.every(validCategory) ||
        new Set(value.categories.map(function (item) { return item.key; })).size !== value.categories.length) return false;
    if (!exactKeys(value.protectedBucket, CATEGORY_KEYS) ||
        value.protectedBucket.key !== 'other_protected_motives' ||
        value.protectedBucket.label !== 'Otros motivos' ||
        !validMetric(value.protectedBucket.current) || !validMetric(value.protectedBucket.prior) ||
        value.protectedBucket.current.privacyStatus !== 'released' ||
        value.protectedBucket.prior.privacyStatus !== 'released' ||
        !validDelta(value.protectedBucket.deltas, value.protectedBucket.current, value.protectedBucket.prior) ||
        !exactKeys(value.coverage, ['current', 'prior'])) return false;
    for (var periodIndex = 0; periodIndex < 2; periodIndex += 1) {
      var periodKey = periodIndex === 0 ? 'current' : 'prior';
      var coverage = value.coverage[periodKey];
      if (!exactKeys(coverage, COVERAGE_PERIOD_KEYS) ||
          !COVERAGE_PERIOD_KEYS.every(function (key) { return nonNegative(coverage[key]); }) ||
          coverage.coveragePct !== 100 ||
          coverage.totalEvents !== coverage.publishedCategoryEvents + coverage.protectedEvents ||
          coverage.totalEvents !== value.comparison[periodKey].events ||
          coverage.protectedEvents !== value.protectedBucket[periodKey].events) return false;
      var releasedEvents = value.categories.reduce(function (total, category) {
        return total + (category[periodKey].privacyStatus === 'released' ? category[periodKey].events : 0);
      }, 0);
      if (releasedEvents !== coverage.publishedCategoryEvents) return false;
    }
    return Array.isArray(value.limits) && value.limits.length === LIMIT_CODES.length &&
      value.limits.every(function (limit, index) {
        return exactKeys(limit, ['code', 'text']) && limit.code === LIMIT_CODES[index] &&
          typeof limit.text === 'string' && limit.text.length > 0;
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
    })) throw new AbsenceInsightsDataError('ABSENCE_INSIGHTS_OPTIONS_INVALID');
    var timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
      throw new AbsenceInsightsDataError('ABSENCE_INSIGHTS_OPTIONS_INVALID');
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
      throw new AbsenceInsightsDataError('ABSENCE_INSIGHTS_CLIENT_UNAVAILABLE');
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
      if (callerAborted) throw new AbsenceInsightsDataError('ABSENCE_INSIGHTS_ABORTED');
      var response = await global.MuniAuth.fetch(ENDPOINT, {
        method: 'GET', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json' }, signal: controller.signal
      });
      if (!response || typeof response.ok !== 'boolean' || !response.ok) {
        throw new AbsenceInsightsDataError('ABSENCE_INSIGHTS_HTTP_ERROR', response && response.status);
      }
      if (!response.headers || response.headers.get(CONTRACT_HEADER) !== SCHEMA_VERSION) {
        throw new AbsenceInsightsDataError('ABSENCE_INSIGHTS_CONTRACT_MISMATCH', 502);
      }
      if (!jsonResponse(response) || typeof response.json !== 'function') {
        throw new AbsenceInsightsDataError('ABSENCE_INSIGHTS_CONTRACT_INVALID', 502);
      }
      var payload = await response.json();
      if (!validContract(payload)) {
        throw new AbsenceInsightsDataError('ABSENCE_INSIGHTS_CONTRACT_INVALID', 502);
      }
      return deepFreeze(payload);
    } catch (error) {
      if (error instanceof AbsenceInsightsDataError) throw error;
      if (timedOut) throw new AbsenceInsightsDataError('ABSENCE_INSIGHTS_TIMEOUT', 408);
      if (callerAborted) throw new AbsenceInsightsDataError('ABSENCE_INSIGHTS_ABORTED');
      throw new AbsenceInsightsDataError('ABSENCE_INSIGHTS_HTTP_ERROR', error && error.status);
    } finally {
      global.clearTimeout(timer);
      if (external) external.removeEventListener('abort', onExternalAbort);
    }
  }

  global.MuniGrhAbsenceInsights = Object.freeze({ load: load });
})(window);
