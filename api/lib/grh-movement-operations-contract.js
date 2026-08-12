export const GRH_MOVEMENT_OPERATIONS_SCHEMA_VERSION = 'grh-movement-operations-v1';
export const GRH_MOVEMENT_OPERATIONS_POLICY_VERSION = 'grh-movement-operations-policy-v1';
export const GRH_MOVEMENT_OPERATIONS_PRIVACY_THRESHOLD = 10;

export const GRH_MOVEMENT_OPERATIONS_METRIC = Object.freeze({
  eventUnit: 'valid_source_rows',
  participantUnit: 'distinct_compound_employee_keys',
  intensityUnit: 'events_per_participant',
  classificationStatus: 'unclassified_source_events',
  comparisonRule: 'latest_two_released_complete_years',
});

const GRH_MOVEMENT_OPERATIONS_RELATED_ACTIONS = Object.freeze([
  Object.freeze({
    id: 'open_structure',
    label: 'Abrir dotación y estructura',
    href: '/estructura',
    requiredCapability: 'navigation.organization-analytics',
  }),
  Object.freeze({
    id: 'open_data_quality',
    label: 'Revisar calidad de datos',
    href: '/calidad',
    requiredCapability: 'navigation.data-quality',
  }),
]);

export function buildGrhMovementOperationsActions(comparison) {
  const hasComparison = comparison?.status === 'available' &&
    typeof comparison.fromYear === 'string' && YEAR_PATTERN.test(comparison.fromYear) &&
    typeof comparison.toYear === 'string' && YEAR_PATTERN.test(comparison.toYear) &&
    comparison.fromYear < comparison.toYear;
  const question = hasComparison
    ? `Compará movimientos ${comparison.fromYear} y ${comparison.toYear}`
    : 'Qué movimientos históricos están disponibles';
  const assistantAction = Object.freeze({
    id: 'ask_movement_assistant',
    label: hasComparison
      ? `Comparar ${comparison.fromYear} y ${comparison.toYear} con BOT IA`
      : 'Consultar movimientos con BOT IA',
    href: `/ia.html?question=${encodeURIComponent(question)}`,
    requiredCapability: 'navigation.ai-assistant',
  });
  return Object.freeze([
    assistantAction,
    ...GRH_MOVEMENT_OPERATIONS_RELATED_ACTIONS,
  ]);
}

export const GRH_MOVEMENT_OPERATIONS_LIMITS = Object.freeze({
  privacyThreshold: GRH_MOVEMENT_OPERATIONS_PRIVACY_THRESHOLD,
  availableWindows: Object.freeze(['all_years', 'latest_5_years', 'latest_10_years']),
  availableMetrics: Object.freeze(['events', 'participants', 'events_per_participant']),
  classification: 'no_governed_movement_taxonomy',
});

const SHAPES = Object.freeze({
  top: ['schemaVersion', 'policyVersion', 'source', 'metric', 'coverage', 'summary', 'series', 'actions', 'limits'],
  source: ['canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf', 'generatedAt', 'realtime', 'sourceTable'],
  metric: ['eventUnit', 'participantUnit', 'intensityUnit', 'classificationStatus', 'comparisonRule'],
  coverage: [
    'sourceRows', 'validRows', 'quarantineRows', 'validRatePct', 'validPeriods',
    'firstValidPeriod', 'lastValidPeriod', 'matchedRows', 'orphanRows',
    'joinIntegrityPct', 'distinctEmployeeKeys', 'employeeCoveragePct',
  ],
  summary: [
    'firstYear', 'lastObservedYear', 'lastObservedYearStatus', 'latestCompleteYear',
    'yearsAvailable', 'releasedYears', 'protectedYears', 'latestCompleteEvents',
    'latestCompleteParticipants', 'latestCompleteEventsPerParticipant', 'defaultComparison',
  ],
  comparison: [
    'fromYear', 'toYear', 'status', 'eventDelta', 'eventDeltaPct',
    'participantDelta', 'participantDeltaPct', 'intensityDelta', 'intensityDeltaPct',
  ],
  seriesRow: ['year', 'status', 'privacyStatus', 'events', 'participants', 'eventsPerParticipant'],
  action: ['id', 'label', 'href', 'requiredCapability'],
  limits: ['privacyThreshold', 'availableWindows', 'availableMetrics', 'classification'],
});

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/u;
const PERIOD_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/u;
const YEAR_PATTERN = /^\d{4}$/u;

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected) {
  if (!plainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index]);
}

function add(errors, condition, code) {
  if (!condition) errors.push(code);
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function finitePercentage(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function boundedText(value, maximum = 240) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 &&
    value.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value);
}

function round4(value) {
  return Number(value.toFixed(4));
}

function sameNumber(left, right) {
  return finiteNumber(left) && finiteNumber(right) && Math.abs(left - right) <= 0.00005;
}

function expectedRate(numerator, denominator) {
  return denominator === 0 ? 0 : round4((numerator / denominator) * 100);
}

function sameArray(left, right) {
  return Array.isArray(left) && left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function sameObject(value, expected) {
  return exactKeys(value, Object.keys(expected)) &&
    Object.entries(expected).every(([key, expectedValue]) => value[key] === expectedValue);
}

function inspectSource(errors, source, options) {
  add(errors, exactKeys(source, SHAPES.source), 'source.shape');
  add(errors, boundedText(source?.canonicalSystem, 120), 'source.canonicalSystem');
  add(errors, boundedText(source?.sourceFile, 180), 'source.sourceFile');
  add(errors, typeof source?.sourceSha256 === 'string' && SHA256_PATTERN.test(source.sourceSha256), 'source.sourceSha256');
  add(errors, typeof source?.snapshotAsOf === 'string' && DATE_PATTERN.test(source.snapshotAsOf) &&
    Number.isFinite(Date.parse(`${source.snapshotAsOf}T00:00:00Z`)), 'source.snapshotAsOf');
  add(errors, typeof source?.generatedAt === 'string' && TIMESTAMP_PATTERN.test(source.generatedAt) &&
    Number.isFinite(Date.parse(source.generatedAt)), 'source.generatedAt');
  add(errors, source?.realtime === false, 'source.realtime');
  add(errors, source?.sourceTable === 'legamov', 'source.sourceTable');
  add(errors, options.expectedSourceSha256 === undefined ||
    source?.sourceSha256 === options.expectedSourceSha256, 'source.expectedSourceSha256');
  add(errors, options.expectedSnapshotAsOf === undefined ||
    source?.snapshotAsOf === options.expectedSnapshotAsOf, 'source.expectedSnapshotAsOf');
}

function inspectCoverage(errors, coverage, source) {
  add(errors, exactKeys(coverage, SHAPES.coverage), 'coverage.shape');
  for (const key of [
    'sourceRows', 'validRows', 'quarantineRows', 'validPeriods', 'matchedRows',
    'orphanRows', 'distinctEmployeeKeys',
  ]) {
    add(errors, nonNegativeInteger(coverage?.[key]), `coverage.${key}`);
  }
  add(errors, positiveInteger(coverage?.sourceRows), 'coverage.sourceRows.positive');
  add(errors, coverage?.validRows + coverage?.quarantineRows === coverage?.sourceRows,
    'coverage.sourceIdentity');
  add(errors, coverage?.matchedRows + coverage?.orphanRows === coverage?.sourceRows,
    'coverage.joinIdentity');
  add(errors, finitePercentage(coverage?.validRatePct) &&
    sameNumber(coverage.validRatePct, expectedRate(coverage.validRows, coverage.sourceRows)),
  'coverage.validRateIdentity');
  add(errors, finitePercentage(coverage?.joinIntegrityPct) &&
    sameNumber(coverage.joinIntegrityPct, expectedRate(coverage.matchedRows, coverage.sourceRows)),
  'coverage.joinIntegrityIdentity');
  add(errors, finitePercentage(coverage?.employeeCoveragePct), 'coverage.employeeCoveragePct');
  add(errors, typeof coverage?.firstValidPeriod === 'string' &&
    PERIOD_PATTERN.test(coverage.firstValidPeriod), 'coverage.firstValidPeriod');
  add(errors, typeof coverage?.lastValidPeriod === 'string' &&
    PERIOD_PATTERN.test(coverage.lastValidPeriod), 'coverage.lastValidPeriod');
  add(errors, coverage?.firstValidPeriod <= coverage?.lastValidPeriod, 'coverage.periodOrder');
  add(errors, coverage?.lastValidPeriod <= String(source?.snapshotAsOf || '').slice(0, 7),
    'coverage.snapshotBound');
  add(errors, positiveInteger(coverage?.validPeriods), 'coverage.validPeriods.positive');
  add(errors, coverage?.distinctEmployeeKeys <= coverage?.sourceRows,
    'coverage.distinctEmployeeKeys.bound');
}

function inspectSeries(errors, series, source) {
  add(errors, Array.isArray(series) && series.length > 0, 'series.available');
  if (!Array.isArray(series)) return [];
  const snapshotYear = String(source?.snapshotAsOf || '').slice(0, 4);
  const years = new Set();
  let previousYear = null;
  let protectedYears = 0;
  for (const [index, row] of series.entries()) {
    const path = `series.${index}`;
    add(errors, exactKeys(row, SHAPES.seriesRow), `${path}.shape`);
    add(errors, typeof row?.year === 'string' && YEAR_PATTERN.test(row.year), `${path}.year`);
    add(errors, !years.has(row?.year), `${path}.year.unique`);
    add(errors, previousYear === null || previousYear < row?.year, `${path}.year.order`);
    add(errors, row?.year <= snapshotYear, `${path}.year.snapshotBound`);
    years.add(row?.year);
    previousYear = row?.year;
    const expectedStatus = row?.year === snapshotYear ? 'partial' : 'complete';
    add(errors, row?.status === expectedStatus, `${path}.status`);
    if (row?.privacyStatus === 'released') {
      add(errors, nonNegativeInteger(row.events), `${path}.events`);
      add(errors, nonNegativeInteger(row.participants) &&
        row.participants >= GRH_MOVEMENT_OPERATIONS_PRIVACY_THRESHOLD &&
        row.participants <= row.events, `${path}.participants`);
      add(errors, finiteNumber(row.eventsPerParticipant) &&
        sameNumber(row.eventsPerParticipant, round4(row.events / row.participants)),
      `${path}.intensity`);
    } else if (row?.privacyStatus === 'protected') {
      protectedYears += 1;
      add(errors, row.events === null && row.participants === null &&
        row.eventsPerParticipant === null, `${path}.protectedMetrics`);
    } else {
      add(errors, false, `${path}.privacyStatus`);
    }
  }
  add(errors, protectedYears !== 1, 'series.complementarySuppression');
  return series;
}

function inspectComparison(errors, comparison, releasedCompleteRows) {
  add(errors, exactKeys(comparison, SHAPES.comparison), 'summary.defaultComparison.shape');
  const candidates = releasedCompleteRows.slice(-2);
  if (candidates.length < 2) {
    add(errors, comparison?.status === 'unavailable', 'summary.defaultComparison.status');
    for (const key of SHAPES.comparison.filter(key => key !== 'status')) {
      add(errors, comparison?.[key] === null, `summary.defaultComparison.${key}`);
    }
    return;
  }
  const [from, to] = candidates;
  const eventDelta = to.events - from.events;
  const participantDelta = to.participants - from.participants;
  const intensityDelta = round4(to.eventsPerParticipant - from.eventsPerParticipant);
  const expected = {
    fromYear: from.year,
    toYear: to.year,
    status: 'available',
    eventDelta,
    eventDeltaPct: round4((eventDelta / from.events) * 100),
    participantDelta,
    participantDeltaPct: round4((participantDelta / from.participants) * 100),
    intensityDelta,
    intensityDeltaPct: round4((intensityDelta / from.eventsPerParticipant) * 100),
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    add(errors, typeof expectedValue === 'number'
      ? sameNumber(comparison?.[key], expectedValue)
      : comparison?.[key] === expectedValue,
    `summary.defaultComparison.${key}`);
  }
}

function inspectSummary(errors, summary, series) {
  add(errors, exactKeys(summary, SHAPES.summary), 'summary.shape');
  if (!Array.isArray(series) || series.length === 0) return;
  const first = series[0];
  const last = series.at(-1);
  const released = series.filter(row => row?.privacyStatus === 'released');
  const protectedRows = series.filter(row => row?.privacyStatus === 'protected');
  const releasedComplete = released.filter(row => row?.status === 'complete');
  const latestComplete = releasedComplete.at(-1) || null;
  add(errors, summary?.firstYear === first.year, 'summary.firstYear');
  add(errors, summary?.lastObservedYear === last.year, 'summary.lastObservedYear');
  add(errors, summary?.lastObservedYearStatus === last.status, 'summary.lastObservedYearStatus');
  add(errors, summary?.yearsAvailable === series.length, 'summary.yearsAvailable');
  add(errors, summary?.releasedYears === released.length, 'summary.releasedYears');
  add(errors, summary?.protectedYears === protectedRows.length, 'summary.protectedYears');
  if (latestComplete) {
    add(errors, summary?.latestCompleteYear === latestComplete.year, 'summary.latestCompleteYear');
    add(errors, summary?.latestCompleteEvents === latestComplete.events, 'summary.latestCompleteEvents');
    add(errors, summary?.latestCompleteParticipants === latestComplete.participants,
      'summary.latestCompleteParticipants');
    add(errors, sameNumber(summary?.latestCompleteEventsPerParticipant,
      latestComplete.eventsPerParticipant), 'summary.latestCompleteEventsPerParticipant');
  } else {
    for (const key of [
      'latestCompleteYear', 'latestCompleteEvents', 'latestCompleteParticipants',
      'latestCompleteEventsPerParticipant',
    ]) add(errors, summary?.[key] === null, `summary.${key}`);
  }
  inspectComparison(errors, summary?.defaultComparison, releasedComplete);
}

function inspectActions(errors, actions, comparison) {
  const expectedActions = buildGrhMovementOperationsActions(comparison);
  add(errors, Array.isArray(actions) && actions.length === expectedActions.length,
    'actions.length');
  if (!Array.isArray(actions)) return;
  actions.forEach((action, index) => {
    add(errors, exactKeys(action, SHAPES.action), `actions.${index}.shape`);
    add(errors, sameObject(action, expectedActions[index] || {}),
      `actions.${index}.value`);
  });
}

function inspectLimits(errors, limits) {
  add(errors, exactKeys(limits, SHAPES.limits), 'limits.shape');
  add(errors, limits?.privacyThreshold === GRH_MOVEMENT_OPERATIONS_LIMITS.privacyThreshold,
    'limits.privacyThreshold');
  add(errors, sameArray(limits?.availableWindows, GRH_MOVEMENT_OPERATIONS_LIMITS.availableWindows),
    'limits.availableWindows');
  add(errors, sameArray(limits?.availableMetrics, GRH_MOVEMENT_OPERATIONS_LIMITS.availableMetrics),
    'limits.availableMetrics');
  add(errors, limits?.classification === GRH_MOVEMENT_OPERATIONS_LIMITS.classification,
    'limits.classification');
}

export function inspectGrhMovementOperationsContract(value, options = {}) {
  const errors = [];
  add(errors, exactKeys(value, SHAPES.top), 'contract.shape');
  add(errors, value?.schemaVersion === GRH_MOVEMENT_OPERATIONS_SCHEMA_VERSION,
    'contract.schemaVersion');
  add(errors, value?.policyVersion === GRH_MOVEMENT_OPERATIONS_POLICY_VERSION,
    'contract.policyVersion');
  inspectSource(errors, value?.source, options);
  add(errors, sameObject(value?.metric, GRH_MOVEMENT_OPERATIONS_METRIC), 'metric');
  inspectCoverage(errors, value?.coverage, value?.source);
  const series = inspectSeries(errors, value?.series, value?.source);
  inspectSummary(errors, value?.summary, series);
  if (Array.isArray(series) && series.length > 0) {
    add(errors, value?.summary?.firstYear === String(value?.coverage?.firstValidPeriod || '').slice(0, 4),
      'contract.firstPeriodIdentity');
    add(errors, value?.summary?.lastObservedYear === String(value?.coverage?.lastValidPeriod || '').slice(0, 4),
      'contract.lastPeriodIdentity');
    const releasedEventTotal = series.reduce((total, row) => (
      row?.privacyStatus === 'released' && nonNegativeInteger(row?.events)
        ? total + row.events
        : total
    ), 0);
    add(errors, releasedEventTotal <= value?.coverage?.validRows,
      'contract.releasedEventBound');
    if (value?.summary?.protectedYears === 0) {
      add(errors, releasedEventTotal === value?.coverage?.validRows,
        'contract.validRowIdentity');
    }
    add(errors, value?.coverage?.validPeriods >= series.length,
      'contract.validPeriodYearBound');
  }
  inspectActions(errors, value?.actions, value?.summary?.defaultComparison);
  inspectLimits(errors, value?.limits);
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...new Set(errors)]) });
}

export function validateGrhMovementOperationsContract(value, options = {}) {
  return inspectGrhMovementOperationsContract(value, options).ok;
}
