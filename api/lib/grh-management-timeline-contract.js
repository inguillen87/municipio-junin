export const GRH_MANAGEMENT_TIMELINE_SCHEMA_VERSION = 'grh-management-timeline-v1';
export const GRH_MANAGEMENT_TIMELINE_PRIVACY_THRESHOLD = 10;
export const GRH_MANAGEMENT_TIMELINE_PRIVACY_RULE =
  'protect_paired_domain_block_when_any_current_prior_or_absolute_delta_measure_is_1_to_9_and_apply_complementary_year_suppression';

export const GRH_MANAGEMENT_TIMELINE_MATRIX_DOMAIN_KEYS = Object.freeze([
  'reportedAbsence',
  'documentedEmploymentActions',
  'reportedIngressDates',
  'reportedExitDates',
]);

export const GRH_MANAGEMENT_TIMELINE_DOMAIN_DEFINITIONS = Object.freeze({
  reportedAbsence: Object.freeze({
    label: 'Ausencias informadas',
    description: 'Registros de ausencia, personas GRH distintas alcanzadas y días informados en tramos calendario equivalentes.',
    comparisonStatus: 'comparable',
    measures: Object.freeze(['eventRows', 'distinctPersons', 'reportedDays']),
  }),
  documentedEmploymentActions: Object.freeze({
    label: 'Actuaciones laborales documentadas',
    description: 'Filas fechadas de GRH.foja y personas GRH distintas alcanzadas; una fila no equivale necesariamente a un cambio único.',
    comparisonStatus: 'comparable',
    measures: Object.freeze(['eventRows', 'distinctPersons']),
  }),
  reportedIngressDates: Object.freeze({
    label: 'Fechas de ingreso informadas',
    description: 'Legajos cuya fecha de ingreso informada cae en el tramo; no acredita altas de dotación.',
    comparisonStatus: 'comparable',
    measures: Object.freeze(['eventRows', 'distinctPersons']),
  }),
  reportedExitDates: Object.freeze({
    label: 'Fechas de egreso informadas',
    description: 'Legajos cuya fecha de egreso informada cae en el tramo; no acredita bajas de dotación.',
    comparisonStatus: 'comparable',
    measures: Object.freeze(['eventRows', 'distinctPersons']),
  }),
  fixedConceptStarts: Object.freeze({
    label: 'Altas informadas de conceptos fijos',
    description: 'FECHA_ALTA de GRH.fijos; describe el inicio informado de un concepto y no un ingreso laboral.',
    comparisonStatus: 'context_only',
    measures: Object.freeze(['eventRows', 'distinctPersons']),
  }),
});

export const GRH_MANAGEMENT_TIMELINE_LIMITS = Object.freeze([
  Object.freeze({
    code: 'historical_snapshot_not_realtime',
    text: 'La lectura proviene de un respaldo histórico y no se actualiza en tiempo real.',
  }),
  Object.freeze({
    code: 'planned_mandate_contains_unobserved_future',
    text: 'El mandato planificado dura 1.461 días; los días posteriores al corte se muestran como no observados, nunca como cero.',
  }),
  Object.freeze({
    code: 'equal_observed_windows_not_full_mandates',
    text: 'Los totales comparan igual cantidad de días observados; mientras el mandato actual esté incompleto no representan dos mandatos completos.',
  }),
  Object.freeze({
    code: 'comparison_not_causal_evaluation',
    text: 'Las diferencias describen registros del origen y no atribuyen causas, mérito ni desempeño a una gestión.',
  }),
  Object.freeze({
    code: 'absence_rows_not_performance',
    text: 'Las ausencias informadas no miden desempeño, productividad ni impacto operativo y no publican causas.',
  }),
  Object.freeze({
    code: 'reported_dates_not_staffing_actions',
    text: 'Las fechas de ingreso y egreso informadas no acreditan altas, bajas ni dotación activa.',
  }),
  Object.freeze({
    code: 'foja_rows_not_unique_changes',
    text: 'Cada fila de foja es una actuación documentada y no representa necesariamente un cambio laboral único.',
  }),
  Object.freeze({
    code: 'fixed_concept_starts_not_employment_ingress',
    text: 'FECHA_ALTA de fijos corresponde al concepto; se publica sólo como contexto y no como alta laboral.',
  }),
  Object.freeze({
    code: 'fixed_concept_metadata_not_comparable',
    text: 'La completitud de metadatos de conceptos fijos cambia entre ventanas; el dominio no es comparable para evaluar gestiones.',
  }),
  Object.freeze({
    code: 'repartitions_and_gardens_excluded',
    text: 'Reparticiones y jardines quedan fuera de esta versión hasta gobernar cobertura temporal, solapes y una clasificación histórica verificable.',
  }),
  Object.freeze({
    code: 'aggregate_only_no_pii',
    text: 'La salida contiene sólo agregados; no exporta identificadores, nombres, causas, instrumentos ni filas fuente.',
  }),
]);

const DOMAIN_KEYS = Object.freeze(Object.keys(GRH_MANAGEMENT_TIMELINE_DOMAIN_DEFINITIONS));
const TOP_KEYS = Object.freeze([
  'schemaVersion', 'generatedAt', 'source', 'privacy', 'terms', 'observed',
  'managementYears', 'comparison', 'limits',
]);
const SOURCE_KEYS = Object.freeze([
  'canonicalSystem', 'fileName', 'sha256', 'snapshotAsOf', 'realtime',
  'rowCounts', 'coverage',
]);
const ROW_COUNT_KEYS = Object.freeze(['ausencia', 'fijos', 'foja', 'legajo']);
const COVERAGE_KEYS = Object.freeze([
  'employment', ...DOMAIN_KEYS,
]);
const EMPLOYMENT_COVERAGE_KEYS = Object.freeze([
  'sourceRows', 'validEmployeeKeyRows', 'invalidEmployeeKeyRows',
  'mappedEmployeeKeys', 'invalidPersonRows', 'distinctPersons',
]);
const FACT_COVERAGE_KEYS = Object.freeze([
  'sourceRows', 'validDateRows', 'quarantineDateRows',
  'resolvedPersonRows', 'unresolvedPersonRows',
]);
const PRIVACY_KEYS = Object.freeze([
  'mode', 'threshold', 'personKey', 'rule', 'protectedValue',
  'complementarySuppression', 'containsPii', 'personIdentifiersExported',
  'rawRowsExported',
]);
const TERMS_KEYS = Object.freeze(['current', 'prior']);
const TERM_KEYS = Object.freeze(['key', 'label', 'startDate', 'endDate', 'plannedDays']);
const OBSERVED_KEYS = Object.freeze(['current', 'prior']);
const OBSERVED_PERIOD_KEYS = Object.freeze([
  'startDate', 'endDate', 'days', 'progressPct', 'status',
]);
const YEAR_KEYS = Object.freeze([
  'key', 'ordinal', 'label', 'plannedDays', 'current', 'prior', 'domains',
]);
const YEAR_PERIOD_KEYS = Object.freeze([
  'plannedStartDate', 'plannedEndDate', 'observedStartDate', 'observedEndDate',
  'observedDays', 'status',
]);
const COMPARISON_KEYS = Object.freeze(['observedDays', 'matrixDomainKeys', 'domains']);
const DOMAIN_KEYS_EXACT = Object.freeze([
  'key', 'label', 'description', 'comparisonStatus', 'measures',
  'current', 'prior', 'delta',
]);
const CELL_KEYS = Object.freeze(['privacyStatus', 'values']);
const LIMIT_KEYS = Object.freeze(['code', 'text']);
const PRIVACY_STATUSES = new Set([
  'released', 'protected_primary', 'protected_complementary', 'unavailable',
]);
const HEX_64 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DAY_MS = 86_400_000;
const TERMS = Object.freeze({
  current: Object.freeze({
    key: 'current', label: 'Gestión actual', startDate: '2023-12-09',
    endDate: '2027-12-08', plannedDays: 1461,
  }),
  prior: Object.freeze({
    key: 'prior', label: 'Gestión anterior', startDate: '2019-12-09',
    endDate: '2023-12-08', plannedDays: 1461,
  }),
});
const YEAR_PERIODS = Object.freeze([
  Object.freeze({
    current: ['2023-12-09', '2024-12-08'],
    prior: ['2019-12-09', '2020-12-08'], plannedDays: 366,
  }),
  Object.freeze({
    current: ['2024-12-09', '2025-12-08'],
    prior: ['2020-12-09', '2021-12-08'], plannedDays: 365,
  }),
  Object.freeze({
    current: ['2025-12-09', '2026-12-08'],
    prior: ['2021-12-09', '2022-12-08'], plannedDays: 365,
  }),
  Object.freeze({
    current: ['2026-12-09', '2027-12-08'],
    prior: ['2022-12-09', '2023-12-08'], plannedDays: 365,
  }),
]);

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
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

function signedInteger(value) {
  return Number.isSafeInteger(value);
}

function validDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function inclusiveDays(startDate, endDate) {
  if (!validDate(startDate) || !validDate(endDate)) return null;
  return Math.round(
    (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) /
      DAY_MS,
  ) + 1;
}

function addDays(value, days) {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return new Date(parsed + days * DAY_MS).toISOString().slice(0, 10);
}

function minimumDate(left, right) {
  return left <= right ? left : right;
}

function roundedPercentage(numerator, denominator) {
  return denominator === 0 ? 0 : Number(((numerator * 100) / denominator).toFixed(4));
}

function small(value) {
  return signedInteger(value) && Math.abs(value) >= 1 &&
    Math.abs(value) < GRH_MANAGEMENT_TIMELINE_PRIVACY_THRESHOLD;
}

function nullValues(value, measures) {
  return exactKeys(value, measures) && measures.every(measure => value?.[measure] === null);
}

function inspectSource(errors, source) {
  add(errors, exactKeys(source, SOURCE_KEYS), 'source.structure');
  add(errors, source?.canonicalSystem === 'GRH Junín', 'source.canonical_system');
  add(errors,
    typeof source?.fileName === 'string' && /^[^/\\]+\.sql\.gz$/i.test(source.fileName),
    'source.file_name');
  add(errors, HEX_64.test(source?.sha256 || ''), 'source.sha256');
  add(errors, validDate(source?.snapshotAsOf), 'source.snapshot_as_of');
  add(errors, source?.snapshotAsOf >= TERMS.current.startDate,
    'source.snapshot_before_current_term');
  add(errors, source?.realtime === false, 'source.realtime');

  const rowCounts = source?.rowCounts;
  add(errors, exactKeys(rowCounts, ROW_COUNT_KEYS), 'source.row_counts.structure');
  for (const key of ROW_COUNT_KEYS) {
    add(errors, nonNegativeInteger(rowCounts?.[key]) && rowCounts[key] > 0,
      `source.row_counts.${key}`);
  }

  const coverage = source?.coverage;
  add(errors, exactKeys(coverage, COVERAGE_KEYS), 'source.coverage.structure');
  const employment = coverage?.employment;
  add(errors, exactKeys(employment, EMPLOYMENT_COVERAGE_KEYS),
    'source.coverage.employment.structure');
  for (const key of EMPLOYMENT_COVERAGE_KEYS) {
    add(errors, nonNegativeInteger(employment?.[key]), `source.coverage.employment.${key}`);
  }
  add(errors, employment?.sourceRows === rowCounts?.legajo,
    'source.coverage.employment.source_identity');
  add(errors,
    employment?.validEmployeeKeyRows + employment?.invalidEmployeeKeyRows === employment?.sourceRows,
    'source.coverage.employment.key_identity');
  add(errors, employment?.mappedEmployeeKeys <= employment?.validEmployeeKeyRows,
    'source.coverage.employment.mapping_bound');
  add(errors, employment?.invalidPersonRows <= employment?.validEmployeeKeyRows,
    'source.coverage.employment.invalid_person_bound');
  add(errors, employment?.distinctPersons <= employment?.mappedEmployeeKeys,
    'source.coverage.employment.person_bound');

  const sourceTableForDomain = {
    reportedAbsence: 'ausencia',
    documentedEmploymentActions: 'foja',
    reportedIngressDates: 'legajo',
    reportedExitDates: 'legajo',
    fixedConceptStarts: 'fijos',
  };
  for (const domainKey of DOMAIN_KEYS) {
    const value = coverage?.[domainKey];
    const path = `source.coverage.${domainKey}`;
    add(errors, exactKeys(value, FACT_COVERAGE_KEYS), `${path}.structure`);
    for (const key of FACT_COVERAGE_KEYS) {
      add(errors, nonNegativeInteger(value?.[key]), `${path}.${key}`);
    }
    add(errors, value?.sourceRows === rowCounts?.[sourceTableForDomain[domainKey]],
      `${path}.source_identity`);
    add(errors, value?.validDateRows + value?.quarantineDateRows === value?.sourceRows,
      `${path}.date_identity`);
    add(errors, value?.resolvedPersonRows + value?.unresolvedPersonRows === value?.validDateRows,
      `${path}.person_identity`);
  }
}

function inspectPrivacy(errors, privacy) {
  add(errors, exactKeys(privacy, PRIVACY_KEYS), 'privacy.structure');
  add(errors, privacy?.mode === 'aggregate_only', 'privacy.mode');
  add(errors, privacy?.threshold === GRH_MANAGEMENT_TIMELINE_PRIVACY_THRESHOLD,
    'privacy.threshold');
  add(errors, privacy?.personKey === 'legajo.IDPERSONA', 'privacy.person_key');
  add(errors, privacy?.rule === GRH_MANAGEMENT_TIMELINE_PRIVACY_RULE, 'privacy.rule');
  add(errors, privacy?.protectedValue === null, 'privacy.protected_value');
  add(errors, privacy?.complementarySuppression === true,
    'privacy.complementary_suppression');
  for (const field of ['containsPii', 'personIdentifiersExported', 'rawRowsExported']) {
    add(errors, privacy?.[field] === false, `privacy.${field}`);
  }
}

function inspectTerms(errors, terms) {
  add(errors, exactKeys(terms, TERMS_KEYS), 'terms.structure');
  for (const key of TERMS_KEYS) {
    const term = terms?.[key];
    const expected = TERMS[key];
    add(errors, exactKeys(term, TERM_KEYS), `terms.${key}.structure`);
    for (const field of TERM_KEYS) {
      add(errors, term?.[field] === expected[field], `terms.${key}.${field}`);
    }
    add(errors, inclusiveDays(term?.startDate, term?.endDate) === term?.plannedDays,
      `terms.${key}.inclusive_days`);
  }
}

function inspectObserved(errors, observed, source) {
  add(errors, exactKeys(observed, OBSERVED_KEYS), 'observed.structure');
  const snapshot = source?.snapshotAsOf;
  const snapshotBeforeStart = validDate(snapshot) && snapshot < TERMS.current.startDate;
  const expectedDays = snapshotBeforeStart
    ? 0
    : Math.min(
      TERMS.current.plannedDays,
      inclusiveDays(TERMS.current.startDate, minimumDate(snapshot, TERMS.current.endDate)),
    );
  for (const key of OBSERVED_KEYS) {
    const value = observed?.[key];
    add(errors, exactKeys(value, OBSERVED_PERIOD_KEYS), `observed.${key}.structure`);
    add(errors, nonNegativeInteger(value?.days) && value.days <= TERMS[key].plannedDays,
      `observed.${key}.days`);
    add(errors, value?.days > 0, `observed.${key}.positive_days`);
    add(errors, value?.progressPct === roundedPercentage(value?.days, TERMS[key].plannedDays),
      `observed.${key}.progress`);
  }
  add(errors, observed?.current?.days === expectedDays, 'observed.current.cut_identity');
  add(errors, observed?.prior?.days === observed?.current?.days, 'observed.equal_days');
  if (expectedDays === 0) {
    for (const key of OBSERVED_KEYS) {
      add(errors, observed?.[key]?.startDate === null, `observed.${key}.start_null`);
      add(errors, observed?.[key]?.endDate === null, `observed.${key}.end_null`);
    }
    add(errors, observed?.current?.status === 'not_started', 'observed.current.status');
    add(errors, observed?.prior?.status === 'not_compared', 'observed.prior.status');
    return;
  }
  add(errors, observed?.current?.startDate === TERMS.current.startDate,
    'observed.current.start');
  add(errors, observed?.current?.endDate === addDays(TERMS.current.startDate, expectedDays - 1),
    'observed.current.end');
  add(errors, observed?.prior?.startDate === TERMS.prior.startDate, 'observed.prior.start');
  add(errors, observed?.prior?.endDate === addDays(TERMS.prior.startDate, expectedDays - 1),
    'observed.prior.end');
  add(errors,
    observed?.current?.status === (expectedDays === TERMS.current.plannedDays ? 'complete' : 'partial'),
    'observed.current.status');
  add(errors,
    observed?.prior?.status ===
      (expectedDays === TERMS.prior.plannedDays ? 'matched_complete' : 'matched_window'),
    'observed.prior.status');
}

function expectedYearObservation(period, observed) {
  if (!observed?.startDate || !observed?.endDate) {
    return { startDate: null, endDate: null, days: 0 };
  }
  const startDate = period[0] >= observed.startDate ? period[0] : observed.startDate;
  const endDate = period[1] <= observed.endDate ? period[1] : observed.endDate;
  if (startDate > endDate) return { startDate: null, endDate: null, days: 0 };
  return { startDate, endDate, days: inclusiveDays(startDate, endDate) };
}

function inspectCell(errors, value, measures, path, { signed = false } = {}) {
  add(errors, exactKeys(value, CELL_KEYS), `${path}.structure`);
  add(errors, PRIVACY_STATUSES.has(value?.privacyStatus), `${path}.privacy_status`);
  add(errors, exactKeys(value?.values, measures), `${path}.values.structure`);
  if (value?.privacyStatus !== 'released') {
    add(errors, nullValues(value?.values, measures), `${path}.values.protected`);
    return;
  }
  for (const measure of measures) {
    add(errors,
      signed ? signedInteger(value?.values?.[measure]) : nonNegativeInteger(value?.values?.[measure]),
      `${path}.values.${measure}`);
  }
  if (!signed) {
    add(errors, value?.values?.distinctPersons <= value?.values?.eventRows,
      `${path}.values.person_bound`);
  }
}

function inspectDomain(errors, value, domainKey, path, { unavailable = false } = {}) {
  const definition = GRH_MANAGEMENT_TIMELINE_DOMAIN_DEFINITIONS[domainKey];
  const measures = definition.measures;
  add(errors, exactKeys(value, DOMAIN_KEYS_EXACT), `${path}.structure`);
  add(errors, value?.key === domainKey, `${path}.key`);
  add(errors, value?.label === definition.label, `${path}.label`);
  add(errors, value?.description === definition.description, `${path}.description`);
  add(errors, value?.comparisonStatus === definition.comparisonStatus,
    `${path}.comparison_status`);
  add(errors,
    Array.isArray(value?.measures) && value.measures.length === measures.length &&
      value.measures.every((measure, index) => measure === measures[index]),
    `${path}.measures`);
  inspectCell(errors, value?.current, measures, `${path}.current`);
  inspectCell(errors, value?.prior, measures, `${path}.prior`);
  inspectCell(errors, value?.delta, measures, `${path}.delta`, { signed: true });
  const statuses = [
    value?.current?.privacyStatus,
    value?.prior?.privacyStatus,
    value?.delta?.privacyStatus,
  ];
  add(errors, statuses.every(status => status === statuses[0]), `${path}.status_identity`);
  add(errors, unavailable ? statuses[0] === 'unavailable' : statuses[0] !== 'unavailable',
    `${path}.availability`);
  if (statuses[0] !== 'released') return;
  for (const measure of measures) {
    const current = value?.current?.values?.[measure];
    const prior = value?.prior?.values?.[measure];
    const delta = value?.delta?.values?.[measure];
    add(errors, delta === current - prior, `${path}.${measure}.delta_identity`);
    add(errors, !small(current) && !small(prior) && !small(delta),
      `${path}.${measure}.small_cell`);
  }
}

function inspectManagementYears(errors, years, observed) {
  add(errors, Array.isArray(years) && years.length === 4, 'management_years.length');
  let observedDays = 0;
  (Array.isArray(years) ? years : []).forEach((year, index) => {
    const path = `management_years.${index}`;
    const expected = YEAR_PERIODS[index];
    add(errors, exactKeys(year, YEAR_KEYS), `${path}.structure`);
    add(errors, year?.key === `management-year-${index + 1}`, `${path}.key`);
    add(errors, year?.ordinal === index + 1, `${path}.ordinal`);
    add(errors, year?.label === `Año ${index + 1}`, `${path}.label`);
    add(errors, year?.plannedDays === expected?.plannedDays, `${path}.planned_days`);
    for (const side of ['current', 'prior']) {
      const period = year?.[side];
      const expectedObservation = expectedYearObservation(expected[side], observed?.[side]);
      const expectedStatus = expectedObservation.days === 0
        ? (side === 'current' ? 'future' : 'not_compared')
        : expectedObservation.days === expected.plannedDays
          ? (side === 'current' ? 'complete' : 'matched_complete')
          : (side === 'current' ? 'partial' : 'matched_partial');
      add(errors, exactKeys(period, YEAR_PERIOD_KEYS), `${path}.${side}.structure`);
      add(errors, period?.plannedStartDate === expected[side][0],
        `${path}.${side}.planned_start`);
      add(errors, period?.plannedEndDate === expected[side][1],
        `${path}.${side}.planned_end`);
      add(errors, period?.observedStartDate === expectedObservation.startDate,
        `${path}.${side}.observed_start`);
      add(errors, period?.observedEndDate === expectedObservation.endDate,
        `${path}.${side}.observed_end`);
      add(errors, period?.observedDays === expectedObservation.days,
        `${path}.${side}.observed_days`);
      add(errors, period?.status === expectedStatus, `${path}.${side}.status`);
    }
    add(errors, year?.current?.observedDays === year?.prior?.observedDays,
      `${path}.equal_days`);
    observedDays += year?.current?.observedDays || 0;
    add(errors, exactKeys(year?.domains, DOMAIN_KEYS), `${path}.domains.structure`);
    for (const domainKey of DOMAIN_KEYS) {
      inspectDomain(errors, year?.domains?.[domainKey], domainKey,
        `${path}.domains.${domainKey}`, { unavailable: year?.current?.observedDays === 0 });
    }
  });
  add(errors, observedDays === observed?.current?.days, 'management_years.observed_identity');

  for (const domainKey of DOMAIN_KEYS) {
    const statuses = (Array.isArray(years) ? years : [])
      .map(year => year?.domains?.[domainKey]?.current?.privacyStatus)
      .filter(status => status !== 'unavailable');
    const primaryCount = statuses.filter(status => status === 'protected_primary').length;
    const complementaryCount = statuses
      .filter(status => status === 'protected_complementary').length;
    add(errors, primaryCount === 0 ? complementaryCount === 0 : true,
      `management_years.${domainKey}.unnecessary_complement`);
    add(errors,
      !(primaryCount === 1 && statuses.length >= 2) || complementaryCount >= 1,
      `management_years.${domainKey}.complementary_suppression`);
  }
}

function inspectComparison(errors, comparison, years, observed, source) {
  add(errors, exactKeys(comparison, COMPARISON_KEYS), 'comparison.structure');
  add(errors, comparison?.observedDays === observed?.current?.days,
    'comparison.observed_days');
  add(errors,
    Array.isArray(comparison?.matrixDomainKeys) &&
      comparison.matrixDomainKeys.length === GRH_MANAGEMENT_TIMELINE_MATRIX_DOMAIN_KEYS.length &&
      comparison.matrixDomainKeys.every(
        (key, index) => key === GRH_MANAGEMENT_TIMELINE_MATRIX_DOMAIN_KEYS[index],
      ),
    'comparison.matrix_domains');
  add(errors, exactKeys(comparison?.domains, DOMAIN_KEYS), 'comparison.domains.structure');
  for (const domainKey of DOMAIN_KEYS) {
    const total = comparison?.domains?.[domainKey];
    const path = `comparison.domains.${domainKey}`;
    inspectDomain(errors, total, domainKey, path, { unavailable: comparison?.observedDays === 0 });
    const totalStatus = total?.current?.privacyStatus;
    const yearDomains = (Array.isArray(years) ? years : [])
      .filter(year => year?.current?.observedDays > 0)
      .map(year => year?.domains?.[domainKey]);
    const protectedCount = yearDomains.filter(
      domain => ['protected_primary', 'protected_complementary']
        .includes(domain?.current?.privacyStatus),
    ).length;
    add(errors, totalStatus !== 'released' || protectedCount !== 1,
      `${path}.reconstruction_protection`);
    if (totalStatus !== 'released') continue;
    const measures = GRH_MANAGEMENT_TIMELINE_DOMAIN_DEFINITIONS[domainKey].measures;
    const allReleased = yearDomains.every(
      domain => domain?.current?.privacyStatus === 'released',
    );
    for (const measure of measures) {
      const currentTotal = total?.current?.values?.[measure];
      const priorTotal = total?.prior?.values?.[measure];
      const releasedDomains = yearDomains.filter(
        domain => domain.current.privacyStatus === 'released',
      );
      if (measure === 'distinctPersons') {
        add(errors,
          releasedDomains.every(domain => domain.current.values[measure] <= currentTotal),
          `${path}.${measure}.current_year_lower_bound`);
        add(errors,
          releasedDomains.every(domain => domain.prior.values[measure] <= priorTotal),
          `${path}.${measure}.prior_year_lower_bound`);
        if (allReleased) {
          add(errors,
            currentTotal <= yearDomains.reduce(
              (sum, domain) => sum + domain.current.values[measure], 0,
            ),
            `${path}.${measure}.current_year_upper_bound`);
          add(errors,
            priorTotal <= yearDomains.reduce(
              (sum, domain) => sum + domain.prior.values[measure], 0,
            ),
            `${path}.${measure}.prior_year_upper_bound`);
        }
      } else if (allReleased) {
        add(errors,
          currentTotal === yearDomains.reduce(
            (sum, domain) => sum + domain.current.values[measure], 0,
          ),
          `${path}.${measure}.current_year_identity`);
        add(errors,
          priorTotal === yearDomains.reduce(
            (sum, domain) => sum + domain.prior.values[measure], 0,
          ),
          `${path}.${measure}.prior_year_identity`);
      } else {
        add(errors,
          releasedDomains.reduce(
            (sum, domain) => sum + domain.current.values[measure], 0,
          ) <= currentTotal,
          `${path}.${measure}.current_year_bound`);
        add(errors,
          releasedDomains.reduce(
            (sum, domain) => sum + domain.prior.values[measure], 0,
          ) <= priorTotal,
          `${path}.${measure}.prior_year_bound`);
      }
    }
    add(errors, total?.current?.values?.eventRows <=
      source?.coverage?.[domainKey]?.validDateRows, `${path}.source_row_bound`);
    add(errors, total?.prior?.values?.eventRows <=
      source?.coverage?.[domainKey]?.validDateRows, `${path}.prior_source_row_bound`);
    add(errors, total?.current?.values?.distinctPersons <=
      source?.coverage?.employment?.distinctPersons, `${path}.current_person_bound`);
    add(errors, total?.prior?.values?.distinctPersons <=
      source?.coverage?.employment?.distinctPersons, `${path}.prior_person_bound`);
  }
}

function inspectLimits(errors, limits) {
  add(errors, Array.isArray(limits) && limits.length === GRH_MANAGEMENT_TIMELINE_LIMITS.length,
    'limits.length');
  (Array.isArray(limits) ? limits : []).forEach((limit, index) => {
    const expected = GRH_MANAGEMENT_TIMELINE_LIMITS[index];
    add(errors, exactKeys(limit, LIMIT_KEYS), `limits.${index}.structure`);
    add(errors, limit?.code === expected?.code, `limits.${index}.code`);
    add(errors, limit?.text === expected?.text, `limits.${index}.text`);
  });
}

export function inspectGrhManagementTimelineContract(value) {
  const errors = [];
  add(errors, exactKeys(value, TOP_KEYS), 'timeline.structure');
  add(errors, value?.schemaVersion === GRH_MANAGEMENT_TIMELINE_SCHEMA_VERSION,
    'schema.version');
  add(errors,
    typeof value?.generatedAt === 'string' && ISO_TIMESTAMP.test(value.generatedAt) &&
      Number.isFinite(Date.parse(value.generatedAt)),
    'generated_at');
  inspectSource(errors, value?.source);
  inspectPrivacy(errors, value?.privacy);
  inspectTerms(errors, value?.terms);
  inspectObserved(errors, value?.observed, value?.source);
  inspectManagementYears(errors, value?.managementYears, value?.observed);
  inspectComparison(
    errors,
    value?.comparison,
    value?.managementYears,
    value?.observed,
    value?.source,
  );
  inspectLimits(errors, value?.limits);
  return { ok: errors.length === 0, errors };
}

export function validateGrhManagementTimelineContract(value) {
  return inspectGrhManagementTimelineContract(value).ok;
}
