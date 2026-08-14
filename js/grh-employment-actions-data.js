(function (global) {
  'use strict';

  var ENDPOINT = '/api/grh-employment-actions';
  var SCHEMA_VERSION = 'grh-employment-actions-v1';
  var CONTRACT_HEADER = 'X-MuniControl-Contract';
  var DEFAULT_TIMEOUT_MS = 10000;
  var MAX_TIMEOUT_MS = 30000;
  var SOURCE_SHA256 = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';
  var TOP_KEYS = [
    'schemaVersion', 'source', 'privacy', 'metric', 'coverage', 'periods',
    'comparison', 'categories', 'protectedBucket', 'classification', 'limits'
  ];
  var PERIOD_KEYS = ['label', 'startDate', 'endDate', 'days'];
  var COMPARISON_KEYS = [
    'privacyStatus', 'actionEvents', 'distinctPersons', 'actionsPerPerson',
    'instrumentTypePresent', 'instrumentNumberPresent', 'sourceCategoryPresent',
    'documentCodePresent'
  ];
  var DELTA_KEYS = [
    'actionEvents', 'distinctPersons', 'instrumentTypePresent',
    'instrumentNumberPresent', 'sourceCategoryPresent', 'documentCodePresent',
    'actionsPerPerson'
  ];
  var CATEGORY_KEYS = [
    'area', 'category', 'competition-status', 'distribution', 'indemnity-cap', 'labor-agreement',
    'leave-regime', 'personnel-type', 'position-structure', 'reported-entry-date',
    'reported-exit-date', 'unhealthy-work', 'workplace'
  ];
  var LIMIT_CODES = [
    'historical_snapshot_not_realtime',
    'action_rows_not_unique_changes',
    'effective_date_not_current_validity',
    'entry_exit_actions_not_staffing_events',
    'comparison_not_causal_attribution',
    'sensitive_source_values_withheld',
    'source_labels_normalized'
  ];

  function EmploymentActionsDataError(code, status) {
    this.name = 'EmploymentActionsDataError';
    this.code = code;
    this.status = Number.isSafeInteger(status) ? status : 0;
    this.message = ({
      EMPLOYMENT_ACTIONS_CLIENT_UNAVAILABLE: 'El cliente autenticado no está disponible.',
      EMPLOYMENT_ACTIONS_OPTIONS_INVALID: 'La consulta de actuaciones no tiene opciones válidas.',
      EMPLOYMENT_ACTIONS_HTTP_ERROR: 'No se pudieron consultar las actuaciones laborales.',
      EMPLOYMENT_ACTIONS_CONTRACT_MISMATCH: 'La respuesta no pertenece al contrato esperado.',
      EMPLOYMENT_ACTIONS_CONTRACT_INVALID: 'Las actuaciones no superaron los controles requeridos.',
      EMPLOYMENT_ACTIONS_TIMEOUT: 'La consulta demoró más de lo esperado.',
      EMPLOYMENT_ACTIONS_ABORTED: 'La consulta fue cancelada.'
    })[code] || 'Las actuaciones laborales no están disponibles.';
  }
  EmploymentActionsDataError.prototype = Object.create(Error.prototype);
  EmploymentActionsDataError.prototype.constructor = EmploymentActionsDataError;

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
  function integer(value) {
    return Number.isSafeInteger(value);
  }
  function nonNegative(value) {
    return integer(value) && value >= 0;
  }
  function finiteOrNull(value) {
    return value === null || Number.isFinite(value);
  }
  function percentage(value) {
    return Number.isFinite(value) && value >= 0 && value <= 100;
  }
  function rounded(value) {
    return Number(value.toFixed(4));
  }
  function validPeriod(value, expected) {
    return exactKeys(value, PERIOD_KEYS) && value.label === expected.label &&
      value.startDate === expected.startDate && value.endDate === expected.endDate &&
      value.days === 972;
  }
  function validComparison(value) {
    if (!exactKeys(value, COMPARISON_KEYS) || value.privacyStatus !== 'released' ||
        !nonNegative(value.actionEvents) || !nonNegative(value.distinctPersons) ||
        !finiteOrNull(value.actionsPerPerson)) return false;
    var countKeys = [
      'instrumentTypePresent', 'instrumentNumberPresent',
      'sourceCategoryPresent', 'documentCodePresent'
    ];
    if (!countKeys.every(function (key) {
      return nonNegative(value[key]) && value[key] <= value.actionEvents;
    })) return false;
    var expectedRatio = value.distinctPersons === 0
      ? null : rounded(value.actionEvents / value.distinctPersons);
    return value.actionsPerPerson === expectedRatio;
  }
  function validCounts(value, allowNegative) {
    return exactKeys(value, ['events', 'persons']) &&
      (allowNegative ? integer(value.events) && integer(value.persons) :
        nonNegative(value.events) && nonNegative(value.persons) && value.persons <= value.events);
  }
  function small(value) {
    return Math.abs(value) >= 1 && Math.abs(value) <= 9;
  }

  function validContract(value) {
    if (!exactKeys(value, TOP_KEYS) || value.schemaVersion !== SCHEMA_VERSION ||
        !exactKeys(value.source, [
          'canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf',
          'generatedAt', 'realtime', 'tables', 'firstValidDate', 'lastValidDate'
        ]) || value.source.canonicalSystem !== 'GRH Junín' ||
        value.source.sourceFile !== 'grh_junin.backup_2026080615_plataforma.sql.gz' ||
        value.source.sourceSha256 !== SOURCE_SHA256 || value.source.snapshotAsOf !== '2026-08-06' ||
        value.source.generatedAt !== '2026-08-13T00:00:00.000Z' ||
        value.source.realtime !== false || !exactKeys(value.source.tables, ['actions', 'employment']) ||
        value.source.tables.actions !== 'foja' || value.source.tables.employment !== 'legajo' ||
        value.source.firstValidDate !== '1979-05-11' || value.source.lastValidDate !== '2026-08-06') return false;

    if (!exactKeys(value.privacy, [
      'threshold', 'rule', 'aggregateOnly', 'containsPii', 'personIdentifiersExported',
      'rawRowsExported', 'instrumentValuesExported', 'observationsExported',
      'userValuesExported', 'rawCategoryValuesExported'
    ]) || value.privacy.threshold !== 10 ||
        value.privacy.rule !== 'protect_category_when_current_prior_or_absolute_delta_is_1_to_9_and_apply_complementary_suppression' ||
        value.privacy.aggregateOnly !== true || value.privacy.containsPii !== false ||
        value.privacy.personIdentifiersExported !== false || value.privacy.rawRowsExported !== false ||
        value.privacy.instrumentValuesExported !== false || value.privacy.observationsExported !== false ||
        value.privacy.userValuesExported !== false || value.privacy.rawCategoryValuesExported !== false) return false;

    if (!exactKeys(value.metric, [
      'eventUnit', 'participantUnit', 'effectiveDateMeaning', 'comparisonRule',
      'classificationRuleVersion'
    ]) || value.metric.eventUnit !== 'actuación documentada en GRH.foja' ||
        value.metric.participantUnit !== 'persona GRH distinta enlazada por legajo con al menos una actuación' ||
        value.metric.classificationRuleVersion !== 'grh-foja-action-codes-v1' ||
        typeof value.metric.effectiveDateMeaning !== 'string' ||
        typeof value.metric.comparisonRule !== 'string') return false;

    if (!exactKeys(value.coverage, [
      'sourceRows', 'validRows', 'quarantineRows', 'matchedRows', 'orphanRows',
      'distinctEmployeeKeys', 'validDateRatePct', 'joinIntegrityPct'
    ]) || !['sourceRows', 'validRows', 'quarantineRows', 'matchedRows', 'orphanRows', 'distinctEmployeeKeys']
      .every(function (key) { return nonNegative(value.coverage[key]); }) ||
        value.coverage.validRows + value.coverage.quarantineRows !== value.coverage.sourceRows ||
        value.coverage.matchedRows + value.coverage.orphanRows !== value.coverage.sourceRows ||
        value.coverage.validDateRatePct !== rounded(value.coverage.validRows * 100 / value.coverage.sourceRows) ||
        value.coverage.joinIntegrityPct !== rounded(value.coverage.matchedRows * 100 / value.coverage.sourceRows)) return false;

    if (!exactKeys(value.periods, ['current', 'prior']) ||
        !validPeriod(value.periods.current, {
          label: 'Gestión actual hasta el corte', startDate: '2023-12-09', endDate: '2026-08-06'
        }) || !validPeriod(value.periods.prior, {
          label: 'Mismo tiempo de la gestión anterior', startDate: '2019-12-09', endDate: '2022-08-06'
        })) return false;

    if (!exactKeys(value.comparison, ['current', 'prior', 'deltas']) ||
        !validComparison(value.comparison.current) || !validComparison(value.comparison.prior) ||
        !exactKeys(value.comparison.deltas, DELTA_KEYS)) return false;
    var deltaCountKeys = DELTA_KEYS.filter(function (key) { return key !== 'actionsPerPerson'; });
    if (!deltaCountKeys.every(function (key) {
      return integer(value.comparison.deltas[key]) &&
        value.comparison.deltas[key] === value.comparison.current[key] - value.comparison.prior[key];
    })) return false;
    var expectedRatioDelta = value.comparison.current.actionsPerPerson === null ||
      value.comparison.prior.actionsPerPerson === null ? null :
      rounded(value.comparison.current.actionsPerPerson - value.comparison.prior.actionsPerPerson);
    if (value.comparison.deltas.actionsPerPerson !== expectedRatioDelta) return false;

    if (!Array.isArray(value.categories) || value.categories.length !== CATEGORY_KEYS.length) return false;
    var currentEvents = 0;
    var priorEvents = 0;
    for (var index = 0; index < value.categories.length; index += 1) {
      var category = value.categories[index];
      if (!exactKeys(category, [
        'key', 'label', 'meaning', 'privacyStatus', 'current', 'prior', 'deltas'
      ]) || category.key !== CATEGORY_KEYS[index] || category.privacyStatus !== 'released' ||
          typeof category.label !== 'string' || !category.label ||
          typeof category.meaning !== 'string' || !category.meaning ||
          !validCounts(category.current, false) || !validCounts(category.prior, false) ||
          !validCounts(category.deltas, true) ||
          category.deltas.events !== category.current.events - category.prior.events ||
          category.deltas.persons !== category.current.persons - category.prior.persons ||
          [category.current.events, category.current.persons, category.prior.events,
            category.prior.persons, category.deltas.events, category.deltas.persons].some(small)) return false;
      currentEvents += category.current.events;
      priorEvents += category.prior.events;
    }

    if (!exactKeys(value.protectedBucket, [
      'privacyStatus', 'label', 'categoryCount', 'current', 'prior', 'deltas'
    ]) || value.protectedBucket.privacyStatus !== 'protected' ||
        value.protectedBucket.label !== 'Otras actuaciones protegidas' ||
        !integer(value.protectedBucket.categoryCount) || value.protectedBucket.categoryCount < 2 ||
        !validCounts(value.protectedBucket.current, false) ||
        !validCounts(value.protectedBucket.prior, false) ||
        !validCounts(value.protectedBucket.deltas, true) ||
        value.protectedBucket.deltas.events !== value.protectedBucket.current.events - value.protectedBucket.prior.events ||
        value.protectedBucket.deltas.persons !== value.protectedBucket.current.persons - value.protectedBucket.prior.persons ||
        [value.protectedBucket.current.events, value.protectedBucket.current.persons,
          value.protectedBucket.prior.events, value.protectedBucket.prior.persons,
          value.protectedBucket.deltas.events, value.protectedBucket.deltas.persons].some(small)) return false;
    currentEvents += value.protectedBucket.current.events;
    priorEvents += value.protectedBucket.prior.events;
    if (currentEvents !== value.comparison.current.actionEvents ||
        priorEvents !== value.comparison.prior.actionEvents) return false;

    if (!exactKeys(value.classification, [
      'status', 'ruleVersion', 'categoryCount', 'releasedCategoryCount',
      'protectedCategoryCount', 'totalWindowEvents', 'classifiedWindowEvents', 'coveragePct'
    ]) || value.classification.status !== 'exhaustive_governed_mapping' ||
        value.classification.ruleVersion !== 'grh-foja-action-codes-v1' ||
        value.classification.releasedCategoryCount !== value.categories.length ||
        value.classification.protectedCategoryCount !== value.protectedBucket.categoryCount ||
        value.classification.categoryCount !== value.categories.length + value.protectedBucket.categoryCount ||
        value.classification.totalWindowEvents !== value.comparison.current.actionEvents + value.comparison.prior.actionEvents ||
        value.classification.classifiedWindowEvents !== value.classification.totalWindowEvents ||
        value.classification.coveragePct !== 100) return false;

    return Array.isArray(value.limits) && value.limits.length === LIMIT_CODES.length &&
      value.limits.every(function (limit, limitIndex) {
        return exactKeys(limit, ['code', 'text']) && limit.code === LIMIT_CODES[limitIndex] &&
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
    })) throw new EmploymentActionsDataError('EMPLOYMENT_ACTIONS_OPTIONS_INVALID');
    var timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
      throw new EmploymentActionsDataError('EMPLOYMENT_ACTIONS_OPTIONS_INVALID');
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
      throw new EmploymentActionsDataError('EMPLOYMENT_ACTIONS_CLIENT_UNAVAILABLE');
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
      if (callerAborted) throw new EmploymentActionsDataError('EMPLOYMENT_ACTIONS_ABORTED');
      var response = await global.MuniAuth.fetch(ENDPOINT, {
        method: 'GET', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json' }, signal: controller.signal
      });
      if (!response || typeof response.ok !== 'boolean' || !response.ok) {
        throw new EmploymentActionsDataError('EMPLOYMENT_ACTIONS_HTTP_ERROR', response && response.status);
      }
      if (!response.headers || response.headers.get(CONTRACT_HEADER) !== SCHEMA_VERSION) {
        throw new EmploymentActionsDataError('EMPLOYMENT_ACTIONS_CONTRACT_MISMATCH', 502);
      }
      if (!jsonResponse(response) || typeof response.json !== 'function') {
        throw new EmploymentActionsDataError('EMPLOYMENT_ACTIONS_CONTRACT_INVALID', 502);
      }
      var payload = await response.json();
      if (!validContract(payload)) {
        throw new EmploymentActionsDataError('EMPLOYMENT_ACTIONS_CONTRACT_INVALID', 502);
      }
      return deepFreeze(payload);
    } catch (error) {
      if (error instanceof EmploymentActionsDataError) throw error;
      if (timedOut) throw new EmploymentActionsDataError('EMPLOYMENT_ACTIONS_TIMEOUT', 408);
      if (callerAborted) throw new EmploymentActionsDataError('EMPLOYMENT_ACTIONS_ABORTED');
      throw new EmploymentActionsDataError('EMPLOYMENT_ACTIONS_HTTP_ERROR', error && error.status);
    } finally {
      global.clearTimeout(timer);
      if (external) external.removeEventListener('abort', onExternalAbort);
    }
  }

  global.MuniGrhEmploymentActions = Object.freeze({ load: load });
})(window);
