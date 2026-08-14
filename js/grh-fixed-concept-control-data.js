(function installGrhFixedConceptControlClient(global) {
  'use strict';

  var ENDPOINT = '/api/grh-fixed-concept-control';
  var SCHEMA_VERSION = 'grh-fixed-concept-control-v1';
  var POLICY_VERSION = 'grh-fixed-concept-control-policy-v1';
  var CONTRACT_HEADER = 'X-MuniControl-Contract';
  var DEFAULT_TIMEOUT_MS = 10000;
  var MAX_TIMEOUT_MS = 30000;
  var SOURCE_SHA256 = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';
  var TOP_KEYS = [
    'schemaVersion', 'policyVersion', 'source', 'privacy', 'metric', 'coverage',
    'reconciliation', 'snapshot', 'administrationComparison', 'quality', 'limits'
  ];
  var COVERAGE = Object.freeze({
    sourceFixedRows: 8729,
    uniqueFixedIds: 8729,
    duplicateFixedIdRows: 0,
    validEmployeeKeyRows: 8729,
    matchedLegajoRows: 8729,
    orphanLegajoRows: 0,
    legajoJoinCoveragePct: 100,
    catalogMatchedRows: 8729,
    catalogOrphanRows: 0,
    validRangeRows: 8066,
    missingStartRows: 0,
    missingEndRows: 2,
    endBeforeStartRows: 661,
    validRangeRatePct: 92.4046,
    exactBusinessKeyExtraRows: 79,
    calculationRows: 29395,
    calculationParticipants: 856,
    calculationPersonConceptPairs: 22181
  });
  var STATE_ROWS = Object.freeze([
    Object.freeze({ code: 'same_person_and_concept_observed', label: 'Misma persona y concepto observados', rows: 94, people: 90, privacyStatus: 'released' }),
    Object.freeze({ code: 'person_observed_concept_absent', label: 'Persona observada; concepto no observado', rows: 19, people: 18, privacyStatus: 'released' }),
    Object.freeze({ code: 'person_not_observed_in_period', label: 'Persona no observada en el período', rows: 78, people: 77, privacyStatus: 'released' })
  ]);
  var CATEGORY_ROWS = Object.freeze([
    Object.freeze({ label: 'RESPONSABILIDAD JERARQUICA', rows: 113, people: 113, privacyStatus: 'released' }),
    Object.freeze({ label: 'ESTADO DOCENTE', rows: 59, people: 59, privacyStatus: 'released' }),
    Object.freeze({ label: 'Otros conceptos protegidos', rows: 21, people: 19, privacyStatus: 'protected_aggregate' })
  ]);
  var LIMIT_CODES = [
    'historical_snapshot_not_realtime',
    'observation_not_authorization_or_payment',
    'absence_not_error',
    'fixed_range_not_employment_status',
    'reported_start_not_employment_ingress',
    'administration_comparison_descriptive_only',
    'no_amounts_budget_procurement_or_treasury'
  ];
  var QUALITY_CODES = [
    'fixed_range_end_before_start',
    'fixed_range_end_missing',
    'snapshot_eligible_legal_instrument_missing',
    'snapshot_eligible_movement_type_missing'
  ];

  function FixedConceptControlDataError(code, status) {
    this.name = 'FixedConceptControlDataError';
    this.code = code;
    this.status = Number.isSafeInteger(status) ? status : 0;
    this.message = ({
      FIXED_CONCEPT_CONTROL_CLIENT_UNAVAILABLE: 'El cliente autenticado no está disponible.',
      FIXED_CONCEPT_CONTROL_OPTIONS_INVALID: 'La consulta de conceptos fijos no tiene opciones válidas.',
      FIXED_CONCEPT_CONTROL_HTTP_ERROR: 'No se pudo consultar el control de conceptos fijos.',
      FIXED_CONCEPT_CONTROL_CONTRACT_MISMATCH: 'La respuesta no pertenece al contrato esperado.',
      FIXED_CONCEPT_CONTROL_CONTRACT_INVALID: 'Los conceptos fijos no superaron los controles requeridos.',
      FIXED_CONCEPT_CONTROL_TIMEOUT: 'La consulta demoró más de lo esperado.',
      FIXED_CONCEPT_CONTROL_ABORTED: 'La consulta fue cancelada.'
    })[code] || 'El control de conceptos fijos no está disponible.';
  }
  FixedConceptControlDataError.prototype = Object.create(Error.prototype);
  FixedConceptControlDataError.prototype.constructor = FixedConceptControlDataError;

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
  function expectedValues(value, expected) {
    return record(value) && Object.keys(expected).every(function (key) {
      return value[key] === expected[key];
    });
  }
  function exactRow(value, expected) {
    return exactKeys(value, Object.keys(expected)) && expectedValues(value, expected);
  }
  function percentage(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
  }
  function nonNegativeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function validContract(value) {
    if (!exactKeys(value, TOP_KEYS) || value.schemaVersion !== SCHEMA_VERSION ||
        value.policyVersion !== POLICY_VERSION) return false;
    if (!exactKeys(value.source, [
      'canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf', 'generatedAt',
      'realtime', 'tables', 'calculationPeriod', 'calculationPeriodEnd'
    ]) || value.source.canonicalSystem !== 'GRH Junín' ||
        value.source.sourceFile !== 'grh_junin.backup_2026080615_plataforma.sql.gz' ||
        value.source.sourceSha256 !== SOURCE_SHA256 || value.source.snapshotAsOf !== '2026-08-06' ||
        value.source.generatedAt !== '2026-08-14T00:00:00.000Z' || value.source.realtime !== false ||
        value.source.calculationPeriod !== '2026-07' || value.source.calculationPeriodEnd !== '2026-07-31' ||
        !exactRow(value.source.tables, {
          fixedConcepts: 'fijos', conceptCatalog: 'concepto',
          calculationDetails: 'calculo', employmentMaster: 'legajo'
        })) return false;

    if (!exactKeys(value.privacy, [
      'threshold', 'aggregateOnly', 'containsPii', 'personIdentifiersExported',
      'sourceKeysExported', 'rawRowsExported', 'monetaryAmountsExported',
      'legalInstrumentValuesExported', 'arbitraryFiltersAllowed', 'complementarySuppression'
    ]) || value.privacy.threshold !== 10 || value.privacy.aggregateOnly !== true ||
        value.privacy.complementarySuppression !== true ||
        ['containsPii', 'personIdentifiersExported', 'sourceKeysExported', 'rawRowsExported',
          'monetaryAmountsExported', 'legalInstrumentValuesExported', 'arbitraryFiltersAllowed']
          .some(function (key) { return value.privacy[key] !== false; })) return false;

    if (!exactKeys(value.metric, [
      'fixedRowGrain', 'eligibleFixedConceptDefinition', 'exactObservationDefinition',
      'personObservedConceptAbsentDefinition', 'personNotObservedDefinition',
      'observationMeaning', 'absenceMeaning', 'comparisonRule'
    ]) || Object.values(value.metric).some(function (text) {
      return typeof text !== 'string' || text.length < 20 || text.length > 220;
    })) return false;

    if (!exactKeys(value.coverage, Object.keys(COVERAGE)) || !expectedValues(value.coverage, COVERAGE)) return false;
    if (value.coverage.matchedLegajoRows + value.coverage.orphanLegajoRows !== value.coverage.validEmployeeKeyRows ||
        value.coverage.catalogMatchedRows + value.coverage.catalogOrphanRows !== value.coverage.sourceFixedRows ||
        value.coverage.validRangeRows + value.coverage.missingStartRows + value.coverage.missingEndRows +
          value.coverage.endBeforeStartRows !== value.coverage.sourceFixedRows) return false;

    var reconciliation = value.reconciliation;
    if (!exactKeys(reconciliation, [
      'calculationPeriod', 'fixedEligibilityDate', 'eligibleFixedRows', 'eligiblePeople',
      'states', 'exactObservationRatePct'
    ]) || reconciliation.calculationPeriod !== '2026-07' || reconciliation.fixedEligibilityDate !== '2026-07-31' ||
        reconciliation.eligibleFixedRows !== 191 || reconciliation.eligiblePeople !== 185 ||
        reconciliation.exactObservationRatePct !== 49.2147 || !Array.isArray(reconciliation.states) ||
        reconciliation.states.length !== STATE_ROWS.length ||
        reconciliation.states.some(function (row, index) { return !exactRow(row, STATE_ROWS[index]); }) ||
        reconciliation.states.reduce(function (sum, row) { return sum + row.rows; }, 0) !== 191) return false;

    var snapshot = value.snapshot;
    if (!exactKeys(snapshot, [
      'asOf', 'eligibleFixedRows', 'eligiblePeople', 'authorizedStateRows', 'missingStateRows',
      'movementTypeReportedRows', 'legalInstrumentReportedRows', 'conceptsObserved', 'categories'
    ]) || snapshot.asOf !== '2026-08-06' || snapshot.eligibleFixedRows !== 193 ||
        snapshot.eligiblePeople !== 187 || snapshot.authorizedStateRows !== 192 || snapshot.missingStateRows !== 1 ||
        snapshot.movementTypeReportedRows !== 84 || snapshot.legalInstrumentReportedRows !== 0 ||
        snapshot.conceptsObserved !== 11 || !exactKeys(snapshot.categories, [
          'sourceCategoryCount', 'releasedCategoryCount', 'protectedCategoryCount', 'rows'
        ]) || snapshot.categories.sourceCategoryCount !== 11 || snapshot.categories.releasedCategoryCount !== 2 ||
        snapshot.categories.protectedCategoryCount !== 9 || !Array.isArray(snapshot.categories.rows) ||
        snapshot.categories.rows.length !== CATEGORY_ROWS.length ||
        snapshot.categories.rows.some(function (row, index) { return !exactRow(row, CATEGORY_ROWS[index]); }) ||
        snapshot.categories.rows.reduce(function (sum, row) { return sum + row.rows; }, 0) !== 193) return false;

    var comparison = value.administrationComparison;
    if (!exactKeys(comparison, [
      'rule', 'current', 'prior', 'differences', 'metadataComparable', 'interpretation'
    ]) || comparison.rule !== 'reported_fixed_concept_start_dates_in_equal_972_day_windows' ||
        comparison.metadataComparable !== false || typeof comparison.interpretation !== 'string') return false;
    var windowKeys = [
      'code', 'label', 'startDate', 'endDate', 'days', 'startRows', 'distinctPeople',
      'concepts', 'stateReportedRows', 'movementTypeReportedRows',
      'legalInstrumentReportedRows', 'privacyStatus'
    ];
    if (!exactKeys(comparison.current, windowKeys) || !exactKeys(comparison.prior, windowKeys) ||
        !exactRow(comparison.differences, { startRows: -363, distinctPeople: -331 }) ||
        comparison.current.code !== 'current' || comparison.prior.code !== 'prior' ||
        comparison.current.privacyStatus !== 'released' || comparison.prior.privacyStatus !== 'released' ||
        comparison.current.days !== 972 || comparison.prior.days !== 972 ||
        comparison.current.startRows !== 60 || comparison.current.distinctPeople !== 56 ||
        comparison.prior.startRows !== 423 || comparison.prior.distinctPeople !== 387) return false;

    if (!exactKeys(value.quality, ['status', 'signals']) || value.quality.status !== 'attention_required' ||
        !Array.isArray(value.quality.signals) || value.quality.signals.length !== QUALITY_CODES.length ||
        value.quality.signals.some(function (signal, index) {
          return !exactKeys(signal, ['code', 'label', 'severity', 'rows', 'ratePct', 'meaning']) ||
            signal.code !== QUALITY_CODES[index] || !nonNegativeInteger(signal.rows) ||
            !percentage(signal.ratePct) || typeof signal.meaning !== 'string' || signal.meaning.length < 20;
        })) return false;

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
    })) throw new FixedConceptControlDataError('FIXED_CONCEPT_CONTROL_OPTIONS_INVALID');
    var timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
      throw new FixedConceptControlDataError('FIXED_CONCEPT_CONTROL_OPTIONS_INVALID');
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
      throw new FixedConceptControlDataError('FIXED_CONCEPT_CONTROL_CLIENT_UNAVAILABLE');
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
      if (callerAborted) throw new FixedConceptControlDataError('FIXED_CONCEPT_CONTROL_ABORTED');
      var response = await global.MuniAuth.fetch(ENDPOINT, {
        method: 'GET', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json' }, signal: controller.signal
      });
      if (!response || typeof response.ok !== 'boolean' || !response.ok) {
        throw new FixedConceptControlDataError('FIXED_CONCEPT_CONTROL_HTTP_ERROR', response && response.status);
      }
      if (!response.headers || response.headers.get(CONTRACT_HEADER) !== SCHEMA_VERSION) {
        throw new FixedConceptControlDataError('FIXED_CONCEPT_CONTROL_CONTRACT_MISMATCH', 502);
      }
      if (!jsonResponse(response) || typeof response.json !== 'function') {
        throw new FixedConceptControlDataError('FIXED_CONCEPT_CONTROL_CONTRACT_INVALID', 502);
      }
      var payload = await response.json();
      if (!validContract(payload)) {
        throw new FixedConceptControlDataError('FIXED_CONCEPT_CONTROL_CONTRACT_INVALID', 502);
      }
      return deepFreeze(payload);
    } catch (error) {
      if (error instanceof FixedConceptControlDataError) throw error;
      if (timedOut) throw new FixedConceptControlDataError('FIXED_CONCEPT_CONTROL_TIMEOUT', 408);
      if (callerAborted) throw new FixedConceptControlDataError('FIXED_CONCEPT_CONTROL_ABORTED');
      throw new FixedConceptControlDataError('FIXED_CONCEPT_CONTROL_HTTP_ERROR', error && error.status);
    } finally {
      global.clearTimeout(timer);
      if (external) external.removeEventListener('abort', onExternalAbort);
    }
  }

  global.MuniGrhFixedConceptControl = Object.freeze({ load: load });
}(window));
