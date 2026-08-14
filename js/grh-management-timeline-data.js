(function (global) {
  'use strict';

  var ENDPOINT = '/api/grh-management-timeline';
  var SCHEMA_VERSION = 'grh-management-timeline-v1';
  var CONTRACT_HEADER = 'X-MuniControl-Contract';
  var DEFAULT_TIMEOUT_MS = 10000;
  var MAX_TIMEOUT_MS = 30000;
  var SOURCE_SHA256 = 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9';
  var PRIVACY_RULE = 'protect_paired_domain_block_when_any_current_prior_or_absolute_delta_measure_is_1_to_9_and_apply_complementary_year_suppression';
  var TOP_KEYS = [
    'schemaVersion', 'generatedAt', 'source', 'privacy', 'terms', 'observed',
    'managementYears', 'comparison', 'limits'
  ];
  var DOMAIN_KEYS = [
    'reportedAbsence', 'documentedEmploymentActions', 'reportedIngressDates',
    'reportedExitDates', 'fixedConceptStarts'
  ];
  var MATRIX_DOMAIN_KEYS = DOMAIN_KEYS.slice(0, 4);
  var DEFINITIONS = Object.freeze({
    reportedAbsence: Object.freeze({
      label: 'Ausencias informadas',
      description: 'Registros de ausencia, personas GRH distintas alcanzadas y días informados en tramos calendario equivalentes.',
      comparisonStatus: 'comparable',
      measures: Object.freeze(['eventRows', 'distinctPersons', 'reportedDays'])
    }),
    documentedEmploymentActions: Object.freeze({
      label: 'Actuaciones laborales documentadas',
      description: 'Filas fechadas de GRH.foja y personas GRH distintas alcanzadas; una fila no equivale necesariamente a un cambio único.',
      comparisonStatus: 'comparable',
      measures: Object.freeze(['eventRows', 'distinctPersons'])
    }),
    reportedIngressDates: Object.freeze({
      label: 'Fechas de ingreso informadas',
      description: 'Legajos cuya fecha de ingreso informada cae en el tramo; no acredita altas de dotación.',
      comparisonStatus: 'comparable',
      measures: Object.freeze(['eventRows', 'distinctPersons'])
    }),
    reportedExitDates: Object.freeze({
      label: 'Fechas de egreso informadas',
      description: 'Legajos cuya fecha de egreso informada cae en el tramo; no acredita bajas de dotación.',
      comparisonStatus: 'comparable',
      measures: Object.freeze(['eventRows', 'distinctPersons'])
    }),
    fixedConceptStarts: Object.freeze({
      label: 'Altas informadas de conceptos fijos',
      description: 'FECHA_ALTA de GRH.fijos; describe el inicio informado de un concepto y no un ingreso laboral.',
      comparisonStatus: 'context_only',
      measures: Object.freeze(['eventRows', 'distinctPersons'])
    })
  });
  var LIMIT_CODES = [
    'historical_snapshot_not_realtime',
    'planned_mandate_contains_unobserved_future',
    'equal_observed_windows_not_full_mandates',
    'comparison_not_causal_evaluation',
    'absence_rows_not_performance',
    'reported_dates_not_staffing_actions',
    'foja_rows_not_unique_changes',
    'fixed_concept_starts_not_employment_ingress',
    'fixed_concept_metadata_not_comparable',
    'repartitions_and_gardens_excluded',
    'aggregate_only_no_pii'
  ];
  var STATUSES = [
    'released', 'protected_primary', 'protected_complementary', 'unavailable'
  ];

  function ManagementTimelineDataError(code, status) {
    this.name = 'ManagementTimelineDataError';
    this.code = code;
    this.status = Number.isSafeInteger(status) ? status : 0;
    this.message = ({
      MANAGEMENT_TIMELINE_CLIENT_UNAVAILABLE: 'El cliente autenticado no está disponible.',
      MANAGEMENT_TIMELINE_OPTIONS_INVALID: 'La consulta de gestiones no tiene opciones válidas.',
      MANAGEMENT_TIMELINE_HTTP_ERROR: 'No se pudo consultar la comparación de gestiones.',
      MANAGEMENT_TIMELINE_CONTRACT_MISMATCH: 'La respuesta no pertenece al contrato esperado.',
      MANAGEMENT_TIMELINE_CONTRACT_INVALID: 'La comparación no superó los controles requeridos.',
      MANAGEMENT_TIMELINE_RESPONSE_INVALID_JSON: 'La respuesta de gestiones no es JSON válido.',
      MANAGEMENT_TIMELINE_TIMEOUT: 'La consulta demoró más de lo esperado.',
      MANAGEMENT_TIMELINE_ABORTED: 'La consulta fue cancelada.'
    })[code] || 'La comparación de gestiones no está disponible.';
  }
  ManagementTimelineDataError.prototype = Object.create(Error.prototype);
  ManagementTimelineDataError.prototype.constructor = ManagementTimelineDataError;

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
  function small(value) {
    return integer(value) && Math.abs(value) >= 1 && Math.abs(value) <= 9;
  }
  function exactArray(value, expected) {
    return Array.isArray(value) && value.length === expected.length &&
      value.every(function (item, index) { return item === expected[index]; });
  }
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var parsed = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
  function nullValues(value, measures) {
    return exactKeys(value, measures) && measures.every(function (measure) {
      return value[measure] === null;
    });
  }
  function validCell(cell, measures, signed) {
    if (!exactKeys(cell, ['privacyStatus', 'values']) ||
        STATUSES.indexOf(cell.privacyStatus) === -1 || !exactKeys(cell.values, measures)) {
      return false;
    }
    if (cell.privacyStatus !== 'released') return nullValues(cell.values, measures);
    if (!measures.every(function (measure) {
      return signed ? integer(cell.values[measure]) : nonNegative(cell.values[measure]);
    })) return false;
    return signed || cell.values.distinctPersons <= cell.values.eventRows;
  }
  function validDomain(domain, key, unavailable) {
    var definition = DEFINITIONS[key];
    if (!exactKeys(domain, [
      'key', 'label', 'description', 'comparisonStatus', 'measures',
      'current', 'prior', 'delta'
    ]) || domain.key !== key || domain.label !== definition.label ||
        domain.description !== definition.description ||
        domain.comparisonStatus !== definition.comparisonStatus ||
        !exactArray(domain.measures, definition.measures) ||
        !validCell(domain.current, definition.measures, false) ||
        !validCell(domain.prior, definition.measures, false) ||
        !validCell(domain.delta, definition.measures, true)) return false;
    var status = domain.current.privacyStatus;
    if (domain.prior.privacyStatus !== status || domain.delta.privacyStatus !== status ||
        (unavailable ? status !== 'unavailable' : status === 'unavailable')) return false;
    if (status !== 'released') return true;
    return definition.measures.every(function (measure) {
      var current = domain.current.values[measure];
      var prior = domain.prior.values[measure];
      var delta = domain.delta.values[measure];
      return delta === current - prior && !small(current) && !small(prior) && !small(delta);
    });
  }
  function validDomainMap(domains, unavailable) {
    return exactKeys(domains, DOMAIN_KEYS) && DOMAIN_KEYS.every(function (key) {
      return validDomain(domains[key], key, unavailable);
    });
  }

  function validSource(source) {
    if (!exactKeys(source, [
      'canonicalSystem', 'fileName', 'sha256', 'snapshotAsOf', 'realtime',
      'rowCounts', 'coverage'
    ]) || source.canonicalSystem !== 'GRH Junín' ||
        source.fileName !== 'grh_junin.backup_2026080615_plataforma.sql.gz' ||
        source.sha256 !== SOURCE_SHA256 || source.snapshotAsOf !== '2026-08-06' ||
        source.realtime !== false || !exactKeys(source.rowCounts, [
          'ausencia', 'fijos', 'foja', 'legajo'
        ]) || !['ausencia', 'fijos', 'foja', 'legajo'].every(function (key) {
          return nonNegative(source.rowCounts[key]) && source.rowCounts[key] > 0;
        })) return false;
    var coverage = source.coverage;
    if (!exactKeys(coverage, ['employment'].concat(DOMAIN_KEYS)) ||
        !exactKeys(coverage.employment, [
          'sourceRows', 'validEmployeeKeyRows', 'invalidEmployeeKeyRows',
          'mappedEmployeeKeys', 'invalidPersonRows', 'distinctPersons'
        ])) return false;
    var employment = coverage.employment;
    if (!Object.keys(employment).every(function (key) { return nonNegative(employment[key]); }) ||
        employment.sourceRows !== source.rowCounts.legajo ||
        employment.validEmployeeKeyRows + employment.invalidEmployeeKeyRows !== employment.sourceRows ||
        employment.mappedEmployeeKeys > employment.validEmployeeKeyRows ||
        employment.distinctPersons > employment.mappedEmployeeKeys) return false;
    var tables = {
      reportedAbsence: 'ausencia', documentedEmploymentActions: 'foja',
      reportedIngressDates: 'legajo', reportedExitDates: 'legajo',
      fixedConceptStarts: 'fijos'
    };
    return DOMAIN_KEYS.every(function (key) {
      var item = coverage[key];
      return exactKeys(item, [
        'sourceRows', 'validDateRows', 'quarantineDateRows',
        'resolvedPersonRows', 'unresolvedPersonRows'
      ]) && Object.keys(item).every(function (field) { return nonNegative(item[field]); }) &&
        item.sourceRows === source.rowCounts[tables[key]] &&
        item.validDateRows + item.quarantineDateRows === item.sourceRows &&
        item.resolvedPersonRows + item.unresolvedPersonRows === item.validDateRows;
    });
  }

  function validTerms(value) {
    if (!exactKeys(value, ['current', 'prior'])) return false;
    var expected = {
      current: {
        key: 'current', label: 'Gestión actual', startDate: '2023-12-09',
        endDate: '2027-12-08', plannedDays: 1461
      },
      prior: {
        key: 'prior', label: 'Gestión anterior', startDate: '2019-12-09',
        endDate: '2023-12-08', plannedDays: 1461
      }
    };
    return ['current', 'prior'].every(function (key) {
      return exactKeys(value[key], ['key', 'label', 'startDate', 'endDate', 'plannedDays']) &&
        Object.keys(expected[key]).every(function (field) {
          return value[key][field] === expected[key][field];
        });
    });
  }

  function validObserved(value) {
    if (!exactKeys(value, ['current', 'prior'])) return false;
    var expected = {
      current: {
        startDate: '2023-12-09', endDate: '2026-08-06', days: 972,
        progressPct: 66.5298, status: 'partial'
      },
      prior: {
        startDate: '2019-12-09', endDate: '2022-08-06', days: 972,
        progressPct: 66.5298, status: 'matched_window'
      }
    };
    return ['current', 'prior'].every(function (key) {
      return exactKeys(value[key], ['startDate', 'endDate', 'days', 'progressPct', 'status']) &&
        Object.keys(expected[key]).every(function (field) {
          return value[key][field] === expected[key][field];
        });
    });
  }

  function validYears(years) {
    var planned = [
      [['2023-12-09', '2024-12-08'], ['2019-12-09', '2020-12-08'], 366, 366],
      [['2024-12-09', '2025-12-08'], ['2020-12-09', '2021-12-08'], 365, 365],
      [['2025-12-09', '2026-12-08'], ['2021-12-09', '2022-12-08'], 365, 241],
      [['2026-12-09', '2027-12-08'], ['2022-12-09', '2023-12-08'], 365, 0]
    ];
    if (!Array.isArray(years) || years.length !== 4) return false;
    return years.every(function (year, index) {
      var item = planned[index];
      if (!exactKeys(year, [
        'key', 'ordinal', 'label', 'plannedDays', 'current', 'prior', 'domains'
      ]) || year.key !== 'management-year-' + (index + 1) || year.ordinal !== index + 1 ||
          year.label !== 'Año ' + (index + 1) || year.plannedDays !== item[2]) return false;
      var unavailable = item[3] === 0;
      if (!validDomainMap(year.domains, unavailable)) return false;
      var currentStatus = unavailable ? 'future' : item[3] === item[2] ? 'complete' : 'partial';
      var priorStatus = unavailable ? 'not_compared' :
        item[3] === item[2] ? 'matched_complete' : 'matched_partial';
      var periods = [
        [year.current, item[0], currentStatus], [year.prior, item[1], priorStatus]
      ];
      return periods.every(function (period, sideIndex) {
        var value = period[0];
        var dates = period[1];
        var isUnavailable = item[3] === 0;
        var observedEnd = isUnavailable ? null :
          sideIndex === 0 && index === 2 ? '2026-08-06' :
          sideIndex === 1 && index === 2 ? '2022-08-06' : dates[1];
        return exactKeys(value, [
          'plannedStartDate', 'plannedEndDate', 'observedStartDate',
          'observedEndDate', 'observedDays', 'status'
        ]) && value.plannedStartDate === dates[0] && value.plannedEndDate === dates[1] &&
          value.observedStartDate === (isUnavailable ? null : dates[0]) &&
          value.observedEndDate === observedEnd && value.observedDays === item[3] &&
          value.status === period[2];
      });
    });
  }

  function validComparison(value, years, source) {
    if (!exactKeys(value, ['observedDays', 'matrixDomainKeys', 'domains']) ||
        value.observedDays !== 972 || !exactArray(value.matrixDomainKeys, MATRIX_DOMAIN_KEYS) ||
        !validDomainMap(value.domains, false)) return false;
    for (var index = 0; index < DOMAIN_KEYS.length; index += 1) {
      var key = DOMAIN_KEYS[index];
      var total = value.domains[key];
      var yearDomains = years.slice(0, 3).map(function (year) { return year.domains[key]; });
      var protectedCount = yearDomains.filter(function (domain) {
        return domain.current.privacyStatus === 'protected_primary' ||
          domain.current.privacyStatus === 'protected_complementary';
      }).length;
      if (total.current.privacyStatus === 'released' && protectedCount === 1) return false;
      if (total.current.privacyStatus === 'released' &&
          (total.current.values.eventRows > source.coverage[key].validDateRows ||
           total.prior.values.eventRows > source.coverage[key].validDateRows ||
           total.current.values.distinctPersons > source.coverage.employment.distinctPersons ||
           total.prior.values.distinctPersons > source.coverage.employment.distinctPersons)) return false;
      if (protectedCount === 0) {
        var additive = DEFINITIONS[key].measures.filter(function (measure) {
          return measure !== 'distinctPersons';
        });
        if (!additive.every(function (measure) {
          return total.current.values[measure] === yearDomains.reduce(function (sum, domain) {
            return sum + domain.current.values[measure];
          }, 0) && total.prior.values[measure] === yearDomains.reduce(function (sum, domain) {
            return sum + domain.prior.values[measure];
          }, 0);
        })) return false;
      }
    }
    return true;
  }

  function validContract(value) {
    if (!exactKeys(value, TOP_KEYS) || value.schemaVersion !== SCHEMA_VERSION ||
        typeof value.generatedAt !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.generatedAt) ||
        !validSource(value.source)) return false;
    if (!exactKeys(value.privacy, [
      'mode', 'threshold', 'personKey', 'rule', 'protectedValue',
      'complementarySuppression', 'containsPii', 'personIdentifiersExported',
      'rawRowsExported'
    ]) || value.privacy.mode !== 'aggregate_only' || value.privacy.threshold !== 10 ||
        value.privacy.personKey !== 'legajo.IDPERSONA' ||
        value.privacy.rule !== PRIVACY_RULE || value.privacy.protectedValue !== null ||
        value.privacy.complementarySuppression !== true ||
        value.privacy.containsPii !== false ||
        value.privacy.personIdentifiersExported !== false ||
        value.privacy.rawRowsExported !== false || !validTerms(value.terms) ||
        !validObserved(value.observed) || !validYears(value.managementYears) ||
        !validComparison(value.comparison, value.managementYears, value.source)) return false;
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
    })) throw new ManagementTimelineDataError('MANAGEMENT_TIMELINE_OPTIONS_INVALID');
    var timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
      throw new ManagementTimelineDataError('MANAGEMENT_TIMELINE_OPTIONS_INVALID');
    }
    return { timeoutMs: timeoutMs, signal: options.signal || null };
  }
  function jsonResponse(response) {
    var value = response && response.headers && typeof response.headers.get === 'function'
      ? response.headers.get('content-type') : null;
    return typeof value === 'string' &&
      /^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|\s*$)/i.test(value);
  }

  async function load(options) {
    if (!global.MuniAuth || typeof global.MuniAuth.fetch !== 'function') {
      throw new ManagementTimelineDataError('MANAGEMENT_TIMELINE_CLIENT_UNAVAILABLE');
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
      if (callerAborted) throw new ManagementTimelineDataError('MANAGEMENT_TIMELINE_ABORTED');
      var response = await global.MuniAuth.fetch(ENDPOINT, {
        method: 'GET', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json' }, signal: controller.signal
      });
      if (!response || typeof response.ok !== 'boolean' || !response.ok) {
        throw new ManagementTimelineDataError(
          'MANAGEMENT_TIMELINE_HTTP_ERROR', response && response.status
        );
      }
      if (!response.headers || response.headers.get(CONTRACT_HEADER) !== SCHEMA_VERSION) {
        throw new ManagementTimelineDataError('MANAGEMENT_TIMELINE_CONTRACT_MISMATCH', 502);
      }
      if (!jsonResponse(response) || typeof response.json !== 'function') {
        throw new ManagementTimelineDataError('MANAGEMENT_TIMELINE_CONTRACT_INVALID', 502);
      }
      var payload;
      try {
        payload = await response.json();
      } catch (_error) {
        throw new ManagementTimelineDataError('MANAGEMENT_TIMELINE_RESPONSE_INVALID_JSON', 502);
      }
      if (!validContract(payload)) {
        throw new ManagementTimelineDataError('MANAGEMENT_TIMELINE_CONTRACT_INVALID', 502);
      }
      return deepFreeze(payload);
    } catch (error) {
      if (error instanceof ManagementTimelineDataError) throw error;
      if (timedOut) throw new ManagementTimelineDataError('MANAGEMENT_TIMELINE_TIMEOUT', 408);
      if (callerAborted) throw new ManagementTimelineDataError('MANAGEMENT_TIMELINE_ABORTED');
      throw new ManagementTimelineDataError('MANAGEMENT_TIMELINE_HTTP_ERROR', error && error.status);
    } finally {
      global.clearTimeout(timer);
      if (external) external.removeEventListener('abort', onExternalAbort);
    }
  }

  global.MuniGrhManagementTimeline = Object.freeze({ load: load });
})(window);
