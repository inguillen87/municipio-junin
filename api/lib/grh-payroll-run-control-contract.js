export const GRH_PAYROLL_RUN_CONTROL_SCHEMA_VERSION = 'grh-payroll-run-control-v1';
export const GRH_PAYROLL_RUN_CONTROL_GENERATED_AT = '2026-08-13T00:00:00.000Z';

export const GRH_PAYROLL_RUN_CONTROL_LIMITS = Object.freeze([
  Object.freeze({
    code: 'historical_snapshot_not_realtime',
    text: 'La información corresponde al respaldo del 6 de agosto de 2026 y no se actualiza en tiempo real.',
  }),
  Object.freeze({
    code: 'close_flag_not_accounting_close',
    text: 'La marca de cierre es un dato operativo de histocal; no acredita cierre contable, pago ni presentación legal.',
  }),
  Object.freeze({
    code: 'missing_close_flag_not_open',
    text: 'Una marca de cierre ausente significa sin dato informado; no debe leerse automáticamente como corrida abierta.',
  }),
  Object.freeze({
    code: 'calculation_rows_not_payment',
    text: 'La presencia de detalle en calculo acredita filas técnicas asociadas; no acredita liquidación pagada.',
  }),
  Object.freeze({
    code: 'technical_logs_not_confirmed_errors',
    text: 'liquidacionlog se publica sólo como cobertura agregada y no permite afirmar errores, causas ni resultados individuales.',
  }),
  Object.freeze({
    code: 'no_budget_execution_or_bank_payment',
    text: 'Esta vista no integra ejecución presupuestaria, tesorería, transferencias bancarias ni declaraciones juradas.',
  }),
]);

const EXPECTED = Object.freeze({
  sourceSha256: 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9',
  coverage: Object.freeze({
    sourceRunHeaders: 625,
    validRunHeaders: 612,
    quarantinedRunHeaders: 13,
    validPeriodCount: 217,
    calculationRows: 4_363_790,
    calculationRunKeys: 611,
    orphanCalculationRunKeys: 0,
    validHeadersWithCalculation: 600,
    validHeadersWithoutCalculation: 12,
    validHeadersWithCloseFlag: 517,
    validHeadersWithoutCloseFlag: 95,
    validHeaderRatePct: 97.92,
    validHeaderWithCalculationRatePct: 98.0392,
    calculationHeaderJoinCoveragePct: 100,
  }),
  currentYear: Object.freeze({
    year: 2026,
    throughPeriod: '2026-07',
    partial: true,
    monthsObserved: 7,
    runHeaders: 26,
    headersWithCalculation: 26,
    headersWithCloseFlag: 26,
    allObservedRunsHaveCalculation: true,
    allObservedRunsHaveCloseFlag: true,
  }),
  quarantine: Object.freeze({
    signalCode: 'temporal_quarantine_present',
    status: 'attention_required',
    runHeaders: 13,
    headersWithCalculation: 11,
    headersWithoutCalculation: 2,
    calculationRows: 20_270,
    calculationRowRatePct: 0.4645,
  }),
  logCoverage: Object.freeze({
    sourceRows: 122,
    runKeys: 1,
    joinedRunKeys: 1,
    joinCoveragePct: 100,
    firstEventDate: '2026-06-30',
    lastEventDate: '2026-06-30',
    rawDetailsWithheld: true,
  }),
});

const METRIC = Object.freeze({
  runHeaderGrain: 'una cabecera técnica distinta de histocal por empresa, período, mes, fecha efectiva y tipo de corrida',
  calculationRunKeyGrain: 'una clave técnica distinta de calculo reconciliada con su cabecera histocal',
  monthlyGrain: 'un período fuente válido PERI_31-MES_31 con corridas agregadas',
  validityPolicy: 'año 1979-2026, mes 1-12, fecha efectiva entre 1979-01-01 y 2026-08-06 y año coincidente con la fecha',
  monthMismatchTreatment: 'la diferencia entre mes fuente y mes de fecha es diagnóstica y no envía por sí sola una corrida a cuarentena',
  closeFlagMeaning: 'CIER_31=1 es una marca operativa informada; no prueba cierre contable ni pago',
  missingCloseFlagMeaning: 'CIER_31 ausente significa sin marca informada, no corrida abierta',
  calculationMeaning: 'detalle asociado significa filas en calculo para la misma clave técnica; no prueba pago',
  technicalLogMeaning: 'cobertura agregada de liquidacionlog; no prueba errores ni resultados individuales',
});

const REASONS = Object.freeze([
  Object.freeze({ code: 'year_before_policy', count: 8 }),
  Object.freeze({ code: 'year_after_snapshot', count: 3 }),
  Object.freeze({ code: 'date_before_policy', count: 1 }),
  Object.freeze({ code: 'date_after_snapshot', count: 5 }),
  Object.freeze({ code: 'period_date_year_mismatch', count: 7 }),
]);

const KEYS = Object.freeze({
  top: ['schemaVersion', 'source', 'privacy', 'metric', 'coverage', 'currentYear', 'monthly', 'quarantine', 'logCoverage', 'limits'],
  source: ['canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf', 'generatedAt', 'realtime', 'tables', 'firstValidPeriod', 'lastValidPeriod', 'latestValidEffectiveDate'],
  tables: ['runHeaders', 'calculationDetails', 'technicalLogs'],
  privacy: ['threshold', 'aggregateOnly', 'containsPii', 'personIdentifiersExported', 'rawRowsExported', 'sourceRunKeysExported', 'monetaryAmountsExported', 'rawTechnicalLogsExported', 'rawMessagesExported'],
  metric: Object.keys(METRIC),
  coverage: Object.keys(EXPECTED.coverage),
  currentYear: Object.keys(EXPECTED.currentYear),
  monthly: ['period', 'firstEffectiveDate', 'lastEffectiveDate', 'runHeaders', 'headersWithCalculation', 'headersWithoutCalculation', 'headersWithCloseFlag', 'headersWithoutCloseFlag', 'calculationRows'],
  quarantine: ['signalCode', 'status', 'runHeaders', 'headersWithCalculation', 'headersWithoutCalculation', 'calculationRows', 'calculationRowRatePct', 'reasonOccurrences'],
  reason: ['code', 'count'],
  logCoverage: Object.keys(EXPECTED.logCoverage),
  limit: ['code', 'text'],
});

const HEX_64 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const PERIOD = /^\d{4}-(?:0[1-9]|1[0-2])$/;

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index]);
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function percentage(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function rounded(value) {
  return Number(value.toFixed(4));
}

function percentageRatio(numerator, denominator) {
  return denominator === 0 ? null : rounded((numerator / denominator) * 100);
}

function validDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function add(errors, condition, code) {
  if (!condition) errors.push(code);
}

function matchesExpected(value, expected) {
  return Object.entries(expected).every(([key, expectedValue]) => value?.[key] === expectedValue);
}

export function inspectGrhPayrollRunControlContract(value) {
  const errors = [];
  add(errors, exactKeys(value, KEYS.top), 'payroll_run_control.structure');
  add(errors, value?.schemaVersion === GRH_PAYROLL_RUN_CONTROL_SCHEMA_VERSION, 'schema.version');

  const source = value?.source;
  add(errors, exactKeys(source, KEYS.source), 'source.structure');
  add(errors, source?.canonicalSystem === 'GRH Junín', 'source.canonical_system');
  add(errors, source?.sourceFile === 'grh_junin.backup_2026080615_plataforma.sql.gz', 'source.file');
  add(errors, HEX_64.test(source?.sourceSha256 || ''), 'source.sha256_format');
  add(errors, source?.sourceSha256 === EXPECTED.sourceSha256, 'source.sha256');
  add(errors, source?.snapshotAsOf === '2026-08-06', 'source.snapshot');
  add(errors, source?.generatedAt === GRH_PAYROLL_RUN_CONTROL_GENERATED_AT, 'source.generated_at');
  add(errors, source?.realtime === false, 'source.realtime');
  add(errors, exactKeys(source?.tables, KEYS.tables), 'source.tables.structure');
  add(errors, source?.tables?.runHeaders === 'histocal', 'source.tables.run_headers');
  add(errors, source?.tables?.calculationDetails === 'calculo', 'source.tables.calculation_details');
  add(errors, source?.tables?.technicalLogs === 'liquidacionlog', 'source.tables.technical_logs');
  add(errors, source?.firstValidPeriod === '2008-01', 'source.first_valid_period');
  add(errors, source?.lastValidPeriod === '2026-07', 'source.last_valid_period');
  add(errors, source?.latestValidEffectiveDate === '2026-07-31', 'source.latest_valid_effective_date');

  const privacy = value?.privacy;
  add(errors, exactKeys(privacy, KEYS.privacy), 'privacy.structure');
  add(errors, privacy?.threshold === 10, 'privacy.threshold');
  add(errors, privacy?.aggregateOnly === true, 'privacy.aggregate_only');
  for (const field of [
    'containsPii', 'personIdentifiersExported', 'rawRowsExported',
    'sourceRunKeysExported', 'monetaryAmountsExported',
    'rawTechnicalLogsExported', 'rawMessagesExported',
  ]) {
    add(errors, privacy?.[field] === false, `privacy.${field}`);
  }

  const metric = value?.metric;
  add(errors, exactKeys(metric, KEYS.metric), 'metric.structure');
  for (const [key, expected] of Object.entries(METRIC)) {
    add(errors, metric?.[key] === expected, `metric.${key}`);
  }

  const coverage = value?.coverage;
  add(errors, exactKeys(coverage, KEYS.coverage), 'coverage.structure');
  for (const field of KEYS.coverage.filter(key => !key.endsWith('Pct'))) {
    add(errors, nonNegativeInteger(coverage?.[field]), `coverage.${field}`);
  }
  for (const field of KEYS.coverage.filter(key => key.endsWith('Pct'))) {
    add(errors, percentage(coverage?.[field]), `coverage.${field}`);
  }
  add(errors, matchesExpected(coverage, EXPECTED.coverage), 'coverage.canonical_identity');
  add(errors, coverage?.validRunHeaders + coverage?.quarantinedRunHeaders === coverage?.sourceRunHeaders, 'coverage.header_identity');
  add(errors, coverage?.validHeadersWithCalculation + coverage?.validHeadersWithoutCalculation === coverage?.validRunHeaders, 'coverage.calculation_identity');
  add(errors, coverage?.validHeadersWithCloseFlag + coverage?.validHeadersWithoutCloseFlag === coverage?.validRunHeaders, 'coverage.close_flag_identity');
  add(errors, coverage?.validHeaderRatePct === percentageRatio(coverage?.validRunHeaders, coverage?.sourceRunHeaders), 'coverage.valid_rate_identity');
  add(errors, coverage?.validHeaderWithCalculationRatePct === percentageRatio(coverage?.validHeadersWithCalculation, coverage?.validRunHeaders), 'coverage.detail_rate_identity');
  add(errors, coverage?.calculationHeaderJoinCoveragePct === percentageRatio(coverage?.calculationRunKeys - coverage?.orphanCalculationRunKeys, coverage?.calculationRunKeys), 'coverage.join_rate_identity');

  const currentYear = value?.currentYear;
  add(errors, exactKeys(currentYear, KEYS.currentYear), 'current_year.structure');
  add(errors, matchesExpected(currentYear, EXPECTED.currentYear), 'current_year.canonical_identity');

  const monthly = Array.isArray(value?.monthly) ? value.monthly : [];
  add(errors, monthly.length === coverage?.validPeriodCount, 'monthly.length');
  let priorPeriod = '';
  let monthlyRunHeaders = 0;
  let monthlyWithCalculation = 0;
  let monthlyWithoutCalculation = 0;
  let monthlyWithClose = 0;
  let monthlyWithoutClose = 0;
  let monthlyCalculationRows = 0;
  let latestEffectiveDate = '';
  for (const [index, item] of monthly.entries()) {
    const path = `monthly.${index}`;
    add(errors, exactKeys(item, KEYS.monthly), `${path}.structure`);
    add(errors, PERIOD.test(item?.period || ''), `${path}.period`);
    add(errors, item?.period > priorPeriod, `${path}.order`);
    add(errors, validDate(item?.firstEffectiveDate), `${path}.first_effective_date`);
    add(errors, validDate(item?.lastEffectiveDate), `${path}.last_effective_date`);
    add(errors, item?.firstEffectiveDate <= item?.lastEffectiveDate, `${path}.date_order`);
    add(errors, item?.firstEffectiveDate?.slice(0, 4) === item?.period?.slice(0, 4), `${path}.first_year_identity`);
    add(errors, item?.lastEffectiveDate?.slice(0, 4) === item?.period?.slice(0, 4), `${path}.last_year_identity`);
    for (const field of KEYS.monthly.slice(3)) {
      add(errors, nonNegativeInteger(item?.[field]), `${path}.${field}`);
    }
    add(errors, item?.runHeaders > 0, `${path}.run_headers_positive`);
    add(errors, item?.headersWithCalculation + item?.headersWithoutCalculation === item?.runHeaders, `${path}.calculation_identity`);
    add(errors, item?.headersWithCloseFlag + item?.headersWithoutCloseFlag === item?.runHeaders, `${path}.close_flag_identity`);
    priorPeriod = item?.period || priorPeriod;
    latestEffectiveDate = item?.lastEffectiveDate > latestEffectiveDate ? item.lastEffectiveDate : latestEffectiveDate;
    monthlyRunHeaders += item?.runHeaders || 0;
    monthlyWithCalculation += item?.headersWithCalculation || 0;
    monthlyWithoutCalculation += item?.headersWithoutCalculation || 0;
    monthlyWithClose += item?.headersWithCloseFlag || 0;
    monthlyWithoutClose += item?.headersWithoutCloseFlag || 0;
    monthlyCalculationRows += item?.calculationRows || 0;
  }
  add(errors, monthly[0]?.period === source?.firstValidPeriod, 'monthly.first_period_identity');
  add(errors, monthly.at(-1)?.period === source?.lastValidPeriod, 'monthly.last_period_identity');
  add(errors, latestEffectiveDate === source?.latestValidEffectiveDate, 'monthly.latest_date_identity');
  add(errors, monthlyRunHeaders === coverage?.validRunHeaders, 'monthly.run_header_identity');
  add(errors, monthlyWithCalculation === coverage?.validHeadersWithCalculation, 'monthly.with_calculation_identity');
  add(errors, monthlyWithoutCalculation === coverage?.validHeadersWithoutCalculation, 'monthly.without_calculation_identity');
  add(errors, monthlyWithClose === coverage?.validHeadersWithCloseFlag, 'monthly.with_close_identity');
  add(errors, monthlyWithoutClose === coverage?.validHeadersWithoutCloseFlag, 'monthly.without_close_identity');

  const quarantine = value?.quarantine;
  add(errors, exactKeys(quarantine, KEYS.quarantine), 'quarantine.structure');
  add(errors, matchesExpected(quarantine, EXPECTED.quarantine), 'quarantine.canonical_identity');
  add(errors, quarantine?.headersWithCalculation + quarantine?.headersWithoutCalculation === quarantine?.runHeaders, 'quarantine.header_identity');
  add(errors, quarantine?.calculationRowRatePct === percentageRatio(quarantine?.calculationRows, coverage?.calculationRows), 'quarantine.rate_identity');
  add(errors, monthlyCalculationRows + quarantine?.calculationRows === coverage?.calculationRows, 'quarantine.calculation_row_identity');
  const reasons = Array.isArray(quarantine?.reasonOccurrences) ? quarantine.reasonOccurrences : [];
  add(errors, reasons.length === REASONS.length, 'quarantine.reasons.length');
  reasons.forEach((reason, index) => {
    add(errors, exactKeys(reason, KEYS.reason), `quarantine.reasons.${index}.structure`);
    add(errors, reason?.code === REASONS[index]?.code, `quarantine.reasons.${index}.code`);
    add(errors, reason?.count === REASONS[index]?.count, `quarantine.reasons.${index}.count`);
  });

  const logCoverage = value?.logCoverage;
  add(errors, exactKeys(logCoverage, KEYS.logCoverage), 'log_coverage.structure');
  add(errors, matchesExpected(logCoverage, EXPECTED.logCoverage), 'log_coverage.canonical_identity');
  add(errors, logCoverage?.joinedRunKeys <= logCoverage?.runKeys, 'log_coverage.join_bound');
  add(errors, logCoverage?.joinCoveragePct === percentageRatio(logCoverage?.joinedRunKeys, logCoverage?.runKeys), 'log_coverage.rate_identity');
  add(errors, validDate(logCoverage?.firstEventDate), 'log_coverage.first_event_date');
  add(errors, validDate(logCoverage?.lastEventDate), 'log_coverage.last_event_date');
  add(errors, logCoverage?.firstEventDate <= logCoverage?.lastEventDate, 'log_coverage.date_order');

  const limits = Array.isArray(value?.limits) ? value.limits : [];
  add(errors, limits.length === GRH_PAYROLL_RUN_CONTROL_LIMITS.length, 'limits.length');
  limits.forEach((limit, index) => {
    const expected = GRH_PAYROLL_RUN_CONTROL_LIMITS[index];
    add(errors, exactKeys(limit, KEYS.limit), `limits.${index}.structure`);
    add(errors, limit?.code === expected?.code, `limits.${index}.code`);
    add(errors, limit?.text === expected?.text, `limits.${index}.text`);
  });

  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

export function validateGrhPayrollRunControlContract(value) {
  return inspectGrhPayrollRunControlContract(value).ok;
}
