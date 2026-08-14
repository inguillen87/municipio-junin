(function (global) {
  'use strict';

  var ENDPOINT = '/api/grh-garden-network';
  var SCHEMA_VERSION = 'grh-garden-network-v1';
  var ASSIGNMENT_POLICY_VERSION = 'grh-garden-network-assignment-v1';
  var CONTRACT_HEADER = 'X-MuniControl-Contract';
  var DEFAULT_TIMEOUT_MS = 10000;
  var MAX_TIMEOUT_MS = 30000;
  var TOP_KEYS = [
    'schemaVersion', 'generatedAt', 'source', 'privacy', 'grain', 'quality',
    'referencePeriod', 'summary', 'monthlyTrend', 'releasedUnits',
    'protectedBucket', 'limits'
  ];
  var SOURCE_KEYS = [
    'canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf', 'realtime'
  ];
  var PRIVACY_KEYS = [
    'status', 'threshold', 'aggregateOnly', 'containsPii',
    'personIdentifiersExported', 'employmentKeysExported', 'sourceCodesExported',
    'rawRowsExported', 'complementarySuppression'
  ];
  var GRAIN_KEYS = ['entity', 'identityBasis', 'deduplication'];
  var QUALITY_KEYS = [
    'status', 'assignmentPolicyVersion', 'latestValidCalculationPeriod',
    'sourceEmploymentKeys', 'linkedEmploymentKeys', 'people',
    'observedUnitCount', 'releasedUnitCount', 'reconciliationOk'
  ];
  var SUMMARY_KEYS = [
    'people', 'releasedPeople', 'protectedPeople', 'releasedUnitCount',
    'observedUnitCount'
  ];
  var TREND_KEYS = ['period', 'label', 'people'];
  var UNIT_KEYS = ['label', 'people', 'sharePct'];
  var BUCKET_KEYS = ['label', 'people', 'sharePct', 'privacyStatus'];
  var MONTH_LABELS = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
  ];
  var TREND = [
    ['2024-08', 90], ['2024-09', 91], ['2024-10', 92], ['2024-11', 90],
    ['2024-12', 90], ['2025-01', 90], ['2025-02', 92], ['2025-03', 91],
    ['2025-04', 105], ['2025-05', 107], ['2025-06', 107], ['2025-07', 105],
    ['2025-08', 105], ['2025-09', 106], ['2025-10', 107], ['2025-11', 106],
    ['2025-12', 105], ['2026-01', 106], ['2026-02', 106], ['2026-03', 108],
    ['2026-04', 108], ['2026-05', 109], ['2026-06', 109], ['2026-07', 107]
  ];
  var RELEASED_UNITS = [
    ['Amanecer', 12], ['Manitos de Colores', 12], ['Del Sol', 11], ['Pata Garabata', 10]
  ];
  var LIMITS = [
    ['historical_snapshot_not_realtime', 'La información corresponde al respaldo del 6 de agosto de 2026; no se actualiza en tiempo real.'],
    ['latest_complete_calculation_month', 'Agosto de 2026 estaba incompleto al corte; el último mes de cálculo comparable es julio de 2026.'],
    ['calculation_cohort_not_total_staff', 'La serie cuenta personas con registros de cálculo de la cohorte de Jardines Maternales; no representa por sí sola toda la dotación activa.'],
    ['person_grain_across_employments', 'Una persona se cuenta una sola vez aunque tenga más de una clave laboral en el mismo período.'],
    ['unit_assignment_from_calculation', 'La unidad surge de la asignación sectorial registrada en el cálculo del período y no reemplaza al organigrama formal.'],
    ['small_units_are_combined', 'Los jardines con menos de 10 personas y quienes no tienen una unidad específica se reúnen en un único grupo protegido.'],
    ['official_locations_not_available', 'La fuente no aporta domicilios ni geolocalización oficial de los jardines; esta versión no publica ni inventa un mapa.'],
    ['enrollment_not_available', 'La fuente no contiene matrícula de niñas y niños por jardín.'],
    ['capacity_not_available', 'La fuente no contiene capacidad habilitada ni vacantes por jardín.'],
    ['attendance_not_available', 'La fuente no contiene presentismo de niñas, niños ni personal por jardín.'],
    ['budget_not_available', 'La fuente no contiene presupuesto ni ejecución de gastos por jardín.']
  ];
  var FORBIDDEN_KEYS = /^(?:idpersona|personId|employeeId|legajo|companyCode|sectorCode|unitCode|sourceCode|assignedPeople|unassignedPeople|dni|cuil|salary|amount|importe|rows?)$/i;

  function GardenNetworkDataError(code, status) {
    this.name = 'GardenNetworkDataError';
    this.code = code;
    this.status = Number.isSafeInteger(status) ? status : 0;
    this.message = ({
      GARDEN_NETWORK_CLIENT_UNAVAILABLE: 'El cliente autenticado no está disponible.',
      GARDEN_NETWORK_OPTIONS_INVALID: 'La consulta de jardines no tiene opciones válidas.',
      GARDEN_NETWORK_HTTP_ERROR: 'No se pudo consultar la Red de Jardines Maternales.',
      GARDEN_NETWORK_CONTRACT_MISMATCH: 'La respuesta no pertenece al contrato esperado.',
      GARDEN_NETWORK_CONTRACT_INVALID: 'La Red de Jardines no superó los controles requeridos.',
      GARDEN_NETWORK_TIMEOUT: 'La consulta demoró más de lo esperado.',
      GARDEN_NETWORK_ABORTED: 'La consulta fue cancelada.'
    })[code] || 'La Red de Jardines Maternales no está disponible.';
  }
  GardenNetworkDataError.prototype = Object.create(Error.prototype);
  GardenNetworkDataError.prototype.constructor = GardenNetworkDataError;

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
  function safeText(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
  }
  function sharePct(people, total) {
    return total === 0 ? 0 : Number(((people / total) * 100).toFixed(1));
  }
  function periodLabel(period) {
    if (!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(period || '')) return null;
    var parts = period.split('-');
    return MONTH_LABELS[Number(parts[1]) - 1] + ' ' + parts[0];
  }
  function containsForbiddenKey(value, seen) {
    if (!value || typeof value !== 'object') return false;
    var visited = seen || new Set();
    if (visited.has(value)) return false;
    visited.add(value);
    return Object.keys(value).some(function (key) {
      return FORBIDDEN_KEYS.test(key) || containsForbiddenKey(value[key], visited);
    });
  }
  function validSource(value) {
    return exactKeys(value, SOURCE_KEYS) && value.canonicalSystem === 'GRH Junín' &&
      value.sourceFile === 'grh_junin.backup_2026080615_plataforma.sql.gz' &&
      /^[0-9a-f]{64}$/.test(value.sourceSha256 || '') &&
      value.snapshotAsOf === '2026-08-06' && value.realtime === false;
  }
  function validPrivacy(value) {
    return exactKeys(value, PRIVACY_KEYS) && value.status === 'released_with_protected_bucket' &&
      value.threshold === 10 && value.aggregateOnly === true && value.containsPii === false &&
      value.personIdentifiersExported === false && value.employmentKeysExported === false &&
      value.sourceCodesExported === false && value.rawRowsExported === false &&
      value.complementarySuppression === true;
  }
  function validGrain(value) {
    return exactKeys(value, GRAIN_KEYS) && value.entity === 'person' &&
      value.identityBasis === 'legajo.IDPERSONA' &&
      value.deduplication === 'distinct_person_across_employment_keys';
  }
  function validQuality(value) {
    if (!exactKeys(value, QUALITY_KEYS) || value.status !== 'reconciled' ||
        value.assignmentPolicyVersion !== ASSIGNMENT_POLICY_VERSION ||
        value.latestValidCalculationPeriod !== '2026-07' ||
        value.reconciliationOk !== true) return false;
    var integerKeys = [
      'sourceEmploymentKeys', 'linkedEmploymentKeys', 'people',
      'observedUnitCount', 'releasedUnitCount'
    ];
    return integerKeys.every(function (key) { return nonNegative(value[key]); }) &&
      value.sourceEmploymentKeys === 165 &&
      value.linkedEmploymentKeys === value.sourceEmploymentKeys && value.people === 107 &&
      value.observedUnitCount === 16 && value.releasedUnitCount === 4;
  }
  function validSummary(value, quality) {
    return exactKeys(value, SUMMARY_KEYS) && SUMMARY_KEYS.every(function (key) {
      return nonNegative(value[key]);
    }) && value.people === quality.people &&
      value.releasedUnitCount === quality.releasedUnitCount &&
      value.observedUnitCount === quality.observedUnitCount &&
      value.releasedPeople + value.protectedPeople === value.people &&
      value.releasedPeople === 45 && value.protectedPeople === 62;
  }
  function validTrend(value, summary) {
    return Array.isArray(value) && value.length === TREND.length && value.every(function (row, index) {
      return exactKeys(row, TREND_KEYS) && row.period === TREND[index][0] &&
        row.label === periodLabel(row.period) && row.people === TREND[index][1];
    }) && value[value.length - 1].people === summary.people;
  }
  function validReleasedUnits(value, summary) {
    if (!Array.isArray(value) || value.length !== RELEASED_UNITS.length) return false;
    var people = 0;
    var valid = value.every(function (row, index) {
      if (nonNegative(row && row.people)) people += row.people;
      return exactKeys(row, UNIT_KEYS) && safeText(row.label, 100) &&
        row.label === RELEASED_UNITS[index][0] && row.people === RELEASED_UNITS[index][1] &&
        row.people >= 10 && row.sharePct === sharePct(row.people, summary.people);
    });
    return valid && people === summary.releasedPeople;
  }
  function validBucket(value, summary) {
    return exactKeys(value, BUCKET_KEYS) &&
      value.label === 'Otros jardines y sin unidad específica' &&
      value.people === summary.protectedPeople &&
      value.sharePct === sharePct(value.people, summary.people) &&
      value.privacyStatus === 'protected_aggregate';
  }
  function validLimits(value) {
    return Array.isArray(value) && value.length === LIMITS.length && value.every(function (row, index) {
      return exactKeys(row, ['code', 'text']) && row.code === LIMITS[index][0] &&
        row.text === LIMITS[index][1];
    });
  }
  function validContract(value) {
    return exactKeys(value, TOP_KEYS) && value.schemaVersion === SCHEMA_VERSION &&
      value.generatedAt === '2026-08-14T00:00:00.000Z' && validSource(value.source) &&
      validPrivacy(value.privacy) && validGrain(value.grain) && validQuality(value.quality) &&
      exactKeys(value.referencePeriod, ['period', 'label', 'status']) &&
      value.referencePeriod.period === '2026-07' && value.referencePeriod.label === 'Julio 2026' &&
      value.referencePeriod.status === 'latest_valid_calculation' &&
      value.referencePeriod.period === value.quality.latestValidCalculationPeriod &&
      validSummary(value.summary, value.quality) && validTrend(value.monthlyTrend, value.summary) &&
      validReleasedUnits(value.releasedUnits, value.summary) &&
      validBucket(value.protectedBucket, value.summary) && validLimits(value.limits) &&
      !containsForbiddenKey(value);
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
    })) throw new GardenNetworkDataError('GARDEN_NETWORK_OPTIONS_INVALID');
    var timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
      throw new GardenNetworkDataError('GARDEN_NETWORK_OPTIONS_INVALID');
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
      throw new GardenNetworkDataError('GARDEN_NETWORK_CLIENT_UNAVAILABLE');
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
      if (callerAborted) throw new GardenNetworkDataError('GARDEN_NETWORK_ABORTED');
      var response = await global.MuniAuth.fetch(ENDPOINT, {
        method: 'GET', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json' }, signal: controller.signal
      });
      if (!response || typeof response.ok !== 'boolean' || !response.ok) {
        throw new GardenNetworkDataError('GARDEN_NETWORK_HTTP_ERROR', response && response.status);
      }
      if (!response.headers || response.headers.get(CONTRACT_HEADER) !== SCHEMA_VERSION) {
        throw new GardenNetworkDataError('GARDEN_NETWORK_CONTRACT_MISMATCH', 502);
      }
      if (!jsonResponse(response) || typeof response.json !== 'function') {
        throw new GardenNetworkDataError('GARDEN_NETWORK_CONTRACT_INVALID', 502);
      }
      var payload = await response.json();
      if (!validContract(payload)) {
        throw new GardenNetworkDataError('GARDEN_NETWORK_CONTRACT_INVALID', 502);
      }
      return deepFreeze(payload);
    } catch (error) {
      if (error instanceof GardenNetworkDataError) throw error;
      if (timedOut) throw new GardenNetworkDataError('GARDEN_NETWORK_TIMEOUT', 408);
      if (callerAborted) throw new GardenNetworkDataError('GARDEN_NETWORK_ABORTED');
      throw new GardenNetworkDataError('GARDEN_NETWORK_HTTP_ERROR', error && error.status);
    } finally {
      global.clearTimeout(timer);
      if (external) external.removeEventListener('abort', onExternalAbort);
    }
  }

  global.MuniGrhGardenNetwork = Object.freeze({ load: load });
})(window);
