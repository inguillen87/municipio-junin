(function (global) {
  'use strict';

  var ENDPOINT = '/api/grh-import-quality-history';
  var SCHEMA_VERSION = 'grh-import-quality-history-v1';
  var CONTRACT_HEADER = 'X-MuniControl-Contract';
  var DEFAULT_TIMEOUT_MS = 10000;
  var MAX_TIMEOUT_MS = 30000;
  var TOP_KEYS = [
    'schemaVersion', 'source', 'privacy', 'scope', 'totals', 'currentPartial',
    'annual', 'categories', 'classification', 'limits'
  ];
  var SOURCE_KEYS = [
    'canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf', 'generatedAt',
    'realtime', 'table', 'firstEventDate', 'lastEventDate', 'partialThrough'
  ];
  var CATEGORY_METADATA = [
    ['amount_zero', 'Importes informados en cero'],
    ['quantity_zero', 'Cantidades informadas en cero'],
    ['dni_without_active_legajo', 'Documento sin legajo activo'],
    ['format_or_length', 'Formato o longitud no válida'],
    ['dni_multiple_legajos', 'Documento asociado a más de un legajo'],
    ['other_technical', 'Otros controles técnicos']
  ];
  var LIMIT_CODES = [
    'historical_import_controls_not_current_employee_errors',
    'not_platform_availability',
    'partial_2026_through_last_source_event',
    'incident_not_confirmed_impact',
    'raw_messages_withheld'
  ];

  function ImportQualityHistoryDataError(code, status) {
    this.name = 'ImportQualityHistoryDataError';
    this.code = code;
    this.status = Number.isSafeInteger(status) ? status : 0;
    this.message = ({
      IMPORT_QUALITY_HISTORY_CLIENT_UNAVAILABLE: 'El cliente autenticado no está disponible.',
      IMPORT_QUALITY_HISTORY_OPTIONS_INVALID: 'La consulta del historial no tiene opciones válidas.',
      IMPORT_QUALITY_HISTORY_HTTP_ERROR: 'No se pudo consultar el historial de importaciones.',
      IMPORT_QUALITY_HISTORY_CONTRACT_MISMATCH: 'La respuesta no pertenece al contrato esperado.',
      IMPORT_QUALITY_HISTORY_CONTRACT_INVALID: 'El historial no superó los controles requeridos.',
      IMPORT_QUALITY_HISTORY_TIMEOUT: 'La consulta demoró más de lo esperado.',
      IMPORT_QUALITY_HISTORY_ABORTED: 'La consulta fue cancelada.'
    })[code] || 'El historial de controles de importación no está disponible.';
  }
  ImportQualityHistoryDataError.prototype = Object.create(Error.prototype);
  ImportQualityHistoryDataError.prototype.constructor = ImportQualityHistoryDataError;

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
  function percentage(value) {
    return Number.isFinite(value) && value >= 0 && value <= 100;
  }
  function ratio(numerator, denominator) {
    return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(4));
  }
  function validContract(value) {
    if (!exactKeys(value, TOP_KEYS) || value.schemaVersion !== SCHEMA_VERSION ||
        !exactKeys(value.source, SOURCE_KEYS) || value.source.canonicalSystem !== 'GRH Junín' ||
        value.source.sourceFile !== 'grh_junin.backup_2026080615_plataforma.sql.gz' ||
        !/^[0-9a-f]{64}$/.test(value.source.sourceSha256 || '') ||
        value.source.snapshotAsOf !== '2026-08-06' ||
        value.source.generatedAt !== '2026-08-13T00:00:00.000Z' ||
        value.source.realtime !== false || value.source.table !== 'errorimportacion' ||
        value.source.firstEventDate > value.source.lastEventDate ||
        value.source.lastEventDate !== value.source.partialThrough ||
        value.source.lastEventDate > value.source.snapshotAsOf ||
        !exactKeys(value.privacy, [
          'aggregateOnly', 'containsPii', 'personIdentifiersExported',
          'rawRowsExported', 'rawMessagesExported'
        ]) || value.privacy.aggregateOnly !== true || value.privacy.containsPii !== false ||
        value.privacy.personIdentifiersExported !== false ||
        value.privacy.rawRowsExported !== false || value.privacy.rawMessagesExported !== false ||
        !exactKeys(value.scope, [
          'unit', 'meaning', 'notCurrentEmployeeErrors', 'notSystemAvailability'
        ]) || value.scope.unit !== 'historical_import_control_incident' ||
        value.scope.meaning !== 'Cada incidencia es un control registrado por el importador histórico de GRH.' ||
        value.scope.notCurrentEmployeeErrors !== true || value.scope.notSystemAvailability !== true ||
        !exactKeys(value.totals, ['incidents', 'importRuns']) ||
        !nonNegative(value.totals.incidents) || value.totals.incidents === 0 ||
        !nonNegative(value.totals.importRuns) || value.totals.importRuns === 0 ||
        value.totals.importRuns > value.totals.incidents) return false;

    if (!Array.isArray(value.annual) || value.annual.length === 0) return false;
    var annualIncidents = 0;
    var annualRuns = 0;
    for (var index = 0; index < value.annual.length; index += 1) {
      var row = value.annual[index];
      if (!exactKeys(row, ['year', 'incidents', 'importRuns', 'partial']) ||
          !Number.isSafeInteger(row.year) || !nonNegative(row.incidents) || row.incidents === 0 ||
          !nonNegative(row.importRuns) || row.importRuns === 0 || row.importRuns > row.incidents ||
          row.partial !== (index === value.annual.length - 1) ||
          (index > 0 && row.year !== value.annual[index - 1].year + 1)) return false;
      annualIncidents += row.incidents;
      annualRuns += row.importRuns;
    }
    var latest = value.annual[value.annual.length - 1];
    if (value.annual[0].year !== Number(value.source.firstEventDate.slice(0, 4)) ||
        latest.year !== Number(value.source.lastEventDate.slice(0, 4)) ||
        annualIncidents !== value.totals.incidents || annualRuns !== value.totals.importRuns ||
        !exactKeys(value.currentPartial, ['year', 'incidents', 'importRuns', 'partial', 'through']) ||
        value.currentPartial.year !== latest.year || value.currentPartial.incidents !== latest.incidents ||
        value.currentPartial.importRuns !== latest.importRuns || value.currentPartial.partial !== true ||
        value.currentPartial.through !== value.source.partialThrough) return false;

    if (!Array.isArray(value.categories) || value.categories.length !== CATEGORY_METADATA.length) return false;
    var categoryIncidents = 0;
    for (var categoryIndex = 0; categoryIndex < value.categories.length; categoryIndex += 1) {
      var category = value.categories[categoryIndex];
      var expected = CATEGORY_METADATA[categoryIndex];
      if (!exactKeys(category, ['key', 'label', 'meaning', 'incidents', 'sharePct']) ||
          category.key !== expected[0] || category.label !== expected[1] ||
          typeof category.meaning !== 'string' || category.meaning.length === 0 || category.meaning.length > 180 ||
          !nonNegative(category.incidents) || category.incidents === 0 || !percentage(category.sharePct) ||
          category.sharePct !== ratio(category.incidents, value.totals.incidents)) return false;
      categoryIncidents += category.incidents;
    }
    if (categoryIncidents !== value.totals.incidents ||
        !exactKeys(value.classification, ['status', 'ruleVersion', 'classifiedIncidents', 'coveragePct']) ||
        value.classification.status !== 'exhaustive' ||
        value.classification.ruleVersion !== 'grh-import-quality-classification-v1' ||
        value.classification.classifiedIncidents !== value.totals.incidents ||
        value.classification.coveragePct !== 100 || !Array.isArray(value.limits) ||
        value.limits.length !== LIMIT_CODES.length) return false;
    return value.limits.every(function (limit, limitIndex) {
      return exactKeys(limit, ['code', 'text']) && limit.code === LIMIT_CODES[limitIndex] &&
        typeof limit.text === 'string' && limit.text.length > 0 && limit.text.length <= 180;
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
    })) throw new ImportQualityHistoryDataError('IMPORT_QUALITY_HISTORY_OPTIONS_INVALID');
    var timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
      throw new ImportQualityHistoryDataError('IMPORT_QUALITY_HISTORY_OPTIONS_INVALID');
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
      throw new ImportQualityHistoryDataError('IMPORT_QUALITY_HISTORY_CLIENT_UNAVAILABLE');
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
      if (callerAborted) throw new ImportQualityHistoryDataError('IMPORT_QUALITY_HISTORY_ABORTED');
      var response = await global.MuniAuth.fetch(ENDPOINT, {
        method: 'GET', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json' }, signal: controller.signal
      });
      if (!response || typeof response.ok !== 'boolean' || !response.ok) {
        throw new ImportQualityHistoryDataError(
          'IMPORT_QUALITY_HISTORY_HTTP_ERROR', response && response.status
        );
      }
      if (!response.headers || response.headers.get(CONTRACT_HEADER) !== SCHEMA_VERSION) {
        throw new ImportQualityHistoryDataError('IMPORT_QUALITY_HISTORY_CONTRACT_MISMATCH', 502);
      }
      if (!jsonResponse(response) || typeof response.json !== 'function') {
        throw new ImportQualityHistoryDataError('IMPORT_QUALITY_HISTORY_CONTRACT_INVALID', 502);
      }
      var payload = await response.json();
      if (!validContract(payload)) {
        throw new ImportQualityHistoryDataError('IMPORT_QUALITY_HISTORY_CONTRACT_INVALID', 502);
      }
      return deepFreeze(payload);
    } catch (error) {
      if (error instanceof ImportQualityHistoryDataError) throw error;
      if (timedOut) throw new ImportQualityHistoryDataError('IMPORT_QUALITY_HISTORY_TIMEOUT', 408);
      if (callerAborted) throw new ImportQualityHistoryDataError('IMPORT_QUALITY_HISTORY_ABORTED');
      throw new ImportQualityHistoryDataError('IMPORT_QUALITY_HISTORY_HTTP_ERROR', error && error.status);
    } finally {
      global.clearTimeout(timer);
      if (external) external.removeEventListener('abort', onExternalAbort);
    }
  }

  global.MuniGrhImportQualityHistory = Object.freeze({ load: load });
})(window);
