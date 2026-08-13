(function (global) {
  'use strict';

  var ENDPOINT = '/api/grh-administration-comparison';
  var SCHEMA_VERSION = 'grh-administration-comparison-v1';
  var CONTRACT_HEADER = 'X-MuniControl-Contract';
  var THRESHOLD = 10;
  var DEFAULT_TIMEOUT_MS = 10000;
  var MAX_TIMEOUT_MS = 30000;
  var PRIVACY_RULE = 'protect_each_analytical_block_when_any_published_count_or_absolute_difference_is_1_to_9';
  var PERIODS = Object.freeze({
    current: Object.freeze({ label: 'Tramo actual de gestión', startDate: '2023-12-09', endDate: '2026-08-06', days: 972 }),
    prior: Object.freeze({ label: 'Mismo tramo, cuatro años antes', startDate: '2019-12-09', endDate: '2022-08-06', days: 972 })
  });
  var DEFINITIONS = Object.freeze({
    absence: Object.freeze({
      key: 'reported_absence',
      label: 'Ausencias informadas',
      meaning: 'Compara registros de ausencia, personas distintas alcanzadas y días informados en dos tramos calendario iguales.',
      metrics: Object.freeze({
        eventRows: 'Registros de ausencia',
        distinctPeople: 'Personas distintas con ausencias',
        reportedDays: 'Días informados en los registros',
        knownEventRows: 'Registros con días informados',
        missingEventRows: 'Registros sin días informados'
      })
    }),
    reportedIngressDates: Object.freeze({
      key: 'reported_ingress_dates',
      label: 'Fechas de ingreso informadas',
      meaning: 'Cuenta legajos cuya fecha de ingreso informada cae dentro de cada tramo; no prueba altas de personal.'
    }),
    reportedExitDates: Object.freeze({
      key: 'reported_exit_dates',
      label: 'Fechas de egreso informadas',
      meaning: 'Cuenta legajos cuya fecha de egreso informada cae dentro de cada tramo; no prueba bajas de personal.'
    })
  });
  var LIMITS = Object.freeze([
    Object.freeze({ code: 'historical_snapshot_not_realtime', text: 'La lectura corresponde al respaldo histórico del 6 de agosto de 2026; no es tiempo real.' }),
    Object.freeze({ code: 'equal_calendar_spans_not_causal_attribution', text: 'Compara dos tramos calendario iguales de 972 días; las diferencias no explican causas ni atribuyen resultados a una gestión.' }),
    Object.freeze({ code: 'absence_rows_not_performance', text: 'Los registros de ausencia no miden desempeño ni impacto operativo y no incluyen sus causas.' }),
    Object.freeze({ code: 'reported_days_have_explicit_coverage', text: 'Los días suman sólo valores informados; los registros con días conocidos y faltantes se muestran por separado.' }),
    Object.freeze({ code: 'reported_dates_not_staffing_actions', text: 'Las fechas informadas no acreditan altas, bajas, dotación activa, pagos ni decisiones administrativas.' }),
    Object.freeze({ code: 'counts_not_rates', text: 'La comparación publica conteos agregados; no calcula tasas ni porcentajes.' })
  ]);
  var SHAPES = Object.freeze({
    top: ['schemaVersion', 'source', 'privacy', 'periods', 'comparison', 'limits'],
    source: ['schemaVersion', 'canonicalSystem', 'sourceSha256', 'contentSha256', 'snapshotAsOf'],
    privacy: ['audience', 'threshold', 'status', 'aggregateOnly', 'containsPii', 'personIdentifiersExported', 'rawRowsExported', 'causeLabelsExported', 'rule'],
    periods: ['current', 'prior'],
    period: ['label', 'startDate', 'endDate', 'days'],
    comparison: ['absence', 'reportedIngressDates', 'reportedExitDates'],
    absence: ['key', 'label', 'meaning', 'privacyStatus', 'eventRows', 'distinctPeople', 'reportedDays', 'dayCoverage'],
    metric: ['label', 'values'],
    dayCoverage: ['knownEventRows', 'missingEventRows'],
    dateRow: ['key', 'label', 'meaning', 'privacyStatus', 'values'],
    values: ['current', 'prior', 'difference'],
    limit: ['code', 'text']
  });
  var VALUE_KEYS = ['current', 'prior', 'difference'];

  function AdministrationComparisonDataError(code, status) {
    this.name = 'AdministrationComparisonDataError';
    this.code = code;
    this.status = Number.isSafeInteger(status) ? status : 0;
    this.message = ({
      ADMINISTRATION_COMPARISON_CLIENT_UNAVAILABLE: 'El cliente autenticado no está disponible.',
      ADMINISTRATION_COMPARISON_CLIENT_UNSUPPORTED: 'El navegador no admite esta consulta protegida.',
      ADMINISTRATION_COMPARISON_OPTIONS_INVALID: 'Las opciones de consulta no son válidas.',
      ADMINISTRATION_COMPARISON_HTTP_ERROR: 'No se pudo consultar la comparación de períodos.',
      ADMINISTRATION_COMPARISON_RESPONSE_INVALID: 'La respuesta del servidor no es válida.',
      ADMINISTRATION_COMPARISON_CONTRACT_MISMATCH: 'La respuesta no pertenece al contrato esperado.',
      ADMINISTRATION_COMPARISON_RESPONSE_NOT_JSON: 'La respuesta no tiene el formato esperado.',
      ADMINISTRATION_COMPARISON_RESPONSE_INVALID_JSON: 'La respuesta no pudo interpretarse.',
      ADMINISTRATION_COMPARISON_CONTRACT_INVALID: 'La comparación no superó los controles requeridos.',
      ADMINISTRATION_COMPARISON_TIMEOUT: 'La consulta demoró más de lo esperado.',
      ADMINISTRATION_COMPARISON_ABORTED: 'La consulta fue cancelada.'
    })[code] || 'La comparación de períodos no está disponible.';
  }
  AdministrationComparisonDataError.prototype = Object.create(Error.prototype);
  AdministrationComparisonDataError.prototype.constructor = AdministrationComparisonDataError;

  function record(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
  function exactKeys(value, keys) {
    if (!record(value)) return false;
    var actual = Object.keys(value).sort();
    var expected = keys.slice().sort();
    return actual.length === expected.length && actual.every(function (key, index) {
      return key === expected[index];
    });
  }
  function nonNegativeInteger(value) { return Number.isSafeInteger(value) && value >= 0; }
  function smallCell(value) {
    return Number.isSafeInteger(value) && Math.abs(value) > 0 && Math.abs(value) < THRESHOLD;
  }
  function exactPeriod(value, expected) {
    return value.label === expected.label && value.startDate === expected.startDate &&
      value.endDate === expected.endDate && value.days === expected.days;
  }
  function validDefinition(value, expected) {
    return value && value.key === expected.key && value.label === expected.label && value.meaning === expected.meaning;
  }
  function validValues(values, privacyStatus) {
    if (!exactKeys(values, SHAPES.values)) return false;
    if (privacyStatus === 'protected') return VALUE_KEYS.every(function (key) { return values[key] === null; });
    return nonNegativeInteger(values.current) && nonNegativeInteger(values.prior) &&
      Number.isSafeInteger(values.difference) && values.difference === values.current - values.prior;
  }
  function validMetric(metric, label, privacyStatus) {
    return exactKeys(metric, SHAPES.metric) && metric.label === label && validValues(metric.values, privacyStatus);
  }
  function metricHasSmallCell(metric) {
    return VALUE_KEYS.some(function (key) { return smallCell(metric.values[key]); });
  }
  function validAbsence(absence, audience) {
    var definition = DEFINITIONS.absence;
    if (!exactKeys(absence, SHAPES.absence) || !validDefinition(absence, definition) ||
        !['released', 'protected'].includes(absence.privacyStatus) ||
        !validMetric(absence.eventRows, definition.metrics.eventRows, absence.privacyStatus) ||
        !validMetric(absence.distinctPeople, definition.metrics.distinctPeople, absence.privacyStatus) ||
        !validMetric(absence.reportedDays, definition.metrics.reportedDays, absence.privacyStatus) ||
        !exactKeys(absence.dayCoverage, SHAPES.dayCoverage) ||
        !validMetric(absence.dayCoverage.knownEventRows, definition.metrics.knownEventRows, absence.privacyStatus) ||
        !validMetric(absence.dayCoverage.missingEventRows, definition.metrics.missingEventRows, absence.privacyStatus)) return false;
    if (absence.privacyStatus === 'protected') return audience === 'portable';
    for (var index = 0; index < 2; index += 1) {
      var period = index === 0 ? 'current' : 'prior';
      if (absence.distinctPeople.values[period] > absence.eventRows.values[period] ||
          absence.dayCoverage.knownEventRows.values[period] + absence.dayCoverage.missingEventRows.values[period] !==
            absence.eventRows.values[period] || absence.dayCoverage.missingEventRows.values[period] !== 0) return false;
    }
    if (audience === 'portable') {
      var metrics = [absence.eventRows, absence.distinctPeople, absence.reportedDays,
        absence.dayCoverage.knownEventRows, absence.dayCoverage.missingEventRows];
      if (metrics.some(metricHasSmallCell)) return false;
    }
    return true;
  }
  function validDateRow(row, definition, audience) {
    if (!exactKeys(row, SHAPES.dateRow) || !validDefinition(row, definition) ||
        !['released', 'protected'].includes(row.privacyStatus) || !validValues(row.values, row.privacyStatus)) return false;
    if (row.privacyStatus === 'protected') return audience === 'portable';
    return audience !== 'portable' || !VALUE_KEYS.some(function (key) { return smallCell(row.values[key]); });
  }
  function validContract(data) {
    if (!exactKeys(data, SHAPES.top) || data.schemaVersion !== SCHEMA_VERSION ||
        !exactKeys(data.source, SHAPES.source) || data.source.schemaVersion !== 'grh-directory-v3' ||
        typeof data.source.canonicalSystem !== 'string' || data.source.canonicalSystem.length < 1 ||
        data.source.canonicalSystem.length > 120 || !/^[0-9a-f]{64}$/.test(data.source.sourceSha256 || '') ||
        !/^[0-9a-f]{64}$/.test(data.source.contentSha256 || '') || data.source.snapshotAsOf !== '2026-08-06' ||
        !exactKeys(data.privacy, SHAPES.privacy) || !['private', 'portable'].includes(data.privacy.audience) ||
        data.privacy.threshold !== THRESHOLD || !['released', 'partially_protected', 'protected'].includes(data.privacy.status) ||
        data.privacy.aggregateOnly !== true || data.privacy.containsPii !== false ||
        data.privacy.personIdentifiersExported !== false || data.privacy.rawRowsExported !== false ||
        data.privacy.causeLabelsExported !== false || data.privacy.rule !== PRIVACY_RULE ||
        !exactKeys(data.periods, SHAPES.periods) || !exactKeys(data.periods.current, SHAPES.period) ||
        !exactKeys(data.periods.prior, SHAPES.period) || !exactPeriod(data.periods.current, PERIODS.current) ||
        !exactPeriod(data.periods.prior, PERIODS.prior) || !exactKeys(data.comparison, SHAPES.comparison) ||
        !validAbsence(data.comparison.absence, data.privacy.audience) ||
        !validDateRow(data.comparison.reportedIngressDates, DEFINITIONS.reportedIngressDates, data.privacy.audience) ||
        !validDateRow(data.comparison.reportedExitDates, DEFINITIONS.reportedExitDates, data.privacy.audience)) return false;
    var protectedBlocks = [data.comparison.absence, data.comparison.reportedIngressDates,
      data.comparison.reportedExitDates].filter(function (block) { return block.privacyStatus === 'protected'; }).length;
    var expectedStatus = protectedBlocks === 0 ? 'released' : protectedBlocks === 3 ? 'protected' : 'partially_protected';
    if (data.privacy.status !== expectedStatus || (data.privacy.audience === 'private' && protectedBlocks !== 0)) return false;
    return Array.isArray(data.limits) && data.limits.length === LIMITS.length &&
      data.limits.every(function (limit, index) {
        return exactKeys(limit, SHAPES.limit) && limit.code === LIMITS[index].code &&
          limit.text === LIMITS[index].text;
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
    })) throw new AdministrationComparisonDataError('ADMINISTRATION_COMPARISON_OPTIONS_INVALID');
    var timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
      throw new AdministrationComparisonDataError('ADMINISTRATION_COMPARISON_OPTIONS_INVALID');
    }
    var signal = options.signal === undefined ? null : options.signal;
    if (signal !== null && (!record(signal) || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) {
      throw new AdministrationComparisonDataError('ADMINISTRATION_COMPARISON_OPTIONS_INVALID');
    }
    return { timeoutMs: timeoutMs, signal: signal };
  }
  function validHttpStatus(value) { return Number.isSafeInteger(value) && value >= 100 && value <= 599; }
  function jsonResponse(response) {
    var value = response && response.headers && typeof response.headers.get === 'function'
      ? response.headers.get('content-type') : null;
    return typeof value === 'string' && /^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|\s*$)/i.test(value);
  }

  async function load(options) {
    if (!global.MuniAuth || typeof global.MuniAuth.fetch !== 'function') {
      throw new AdministrationComparisonDataError('ADMINISTRATION_COMPARISON_CLIENT_UNAVAILABLE');
    }
    if (typeof global.AbortController !== 'function' || typeof global.setTimeout !== 'function' ||
        typeof global.clearTimeout !== 'function') {
      throw new AdministrationComparisonDataError('ADMINISTRATION_COMPARISON_CLIENT_UNSUPPORTED');
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
      if (callerAborted) throw new AdministrationComparisonDataError('ADMINISTRATION_COMPARISON_ABORTED');
      var response = await global.MuniAuth.fetch(ENDPOINT, {
        method: 'GET', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' }, signal: controller.signal
      });
      if (!response || !validHttpStatus(response.status) || typeof response.ok !== 'boolean') {
        throw new AdministrationComparisonDataError('ADMINISTRATION_COMPARISON_RESPONSE_INVALID', 502);
      }
      if (!response.ok || response.status < 200 || response.status >= 300) {
        throw new AdministrationComparisonDataError('ADMINISTRATION_COMPARISON_HTTP_ERROR', response.status);
      }
      if (!response.headers || typeof response.headers.get !== 'function' ||
          response.headers.get(CONTRACT_HEADER) !== SCHEMA_VERSION) {
        throw new AdministrationComparisonDataError('ADMINISTRATION_COMPARISON_CONTRACT_MISMATCH', 502);
      }
      if (!jsonResponse(response) || typeof response.json !== 'function') {
        throw new AdministrationComparisonDataError('ADMINISTRATION_COMPARISON_RESPONSE_NOT_JSON', 502);
      }
      var payload;
      try { payload = await response.json(); } catch (_) {
        throw new AdministrationComparisonDataError('ADMINISTRATION_COMPARISON_RESPONSE_INVALID_JSON', 502);
      }
      if (!validContract(payload)) {
        throw new AdministrationComparisonDataError('ADMINISTRATION_COMPARISON_CONTRACT_INVALID', 502);
      }
      return deepFreeze(payload);
    } catch (error) {
      if (error instanceof AdministrationComparisonDataError) throw error;
      if (timedOut) throw new AdministrationComparisonDataError('ADMINISTRATION_COMPARISON_TIMEOUT', 408);
      if (callerAborted) throw new AdministrationComparisonDataError('ADMINISTRATION_COMPARISON_ABORTED');
      throw new AdministrationComparisonDataError('ADMINISTRATION_COMPARISON_HTTP_ERROR', error && error.status);
    } finally {
      global.clearTimeout(timer);
      if (external) external.removeEventListener('abort', onExternalAbort);
    }
  }

  global.MuniGrhAdministrationComparison = Object.freeze({ load: load });
})(window);
