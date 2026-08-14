import type {
  ManagementTimelineCell,
  ManagementTimelineContract,
  ManagementTimelineDomain,
  ManagementTimelineDomainKey,
  ManagementTimelineMatrixDomainKey,
  ManagementTimelineMeasureKey,
  ManagementTimelinePrivacyStatus,
  ManagementTimelineTone,
  ManagementTimelineViewModel,
  ManagementTimelineYear,
  ManagementTimelineYearViewModel,
} from './management-timeline-types';

const SCHEMA_VERSION = 'grh-management-timeline-v1';
const DOMAIN_KEYS = Object.freeze([
  'reportedAbsence',
  'documentedEmploymentActions',
  'reportedIngressDates',
  'reportedExitDates',
  'fixedConceptStarts',
] as const satisfies readonly ManagementTimelineDomainKey[]);
const MATRIX_DOMAIN_KEYS = Object.freeze(DOMAIN_KEYS.slice(0, 4) as readonly ManagementTimelineMatrixDomainKey[]);
const MEASURE_KEYS = Object.freeze([
  'eventRows',
  'distinctPersons',
  'reportedDays',
] as const satisfies readonly ManagementTimelineMeasureKey[]);
const PRIVACY_STATUSES = Object.freeze([
  'released',
  'protected_primary',
  'protected_complementary',
  'unavailable',
] as const satisfies readonly ManagementTimelinePrivacyStatus[]);
const CURRENT_YEAR_STATUSES = Object.freeze(['complete', 'partial', 'future'] as const);
const PRIOR_YEAR_STATUSES = Object.freeze(['matched_complete', 'matched_partial', 'not_compared'] as const);

const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const percentage = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const date = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeZone: 'America/Argentina/Buenos_Aires',
});

const MEASURE_LABELS: Readonly<Record<ManagementTimelineMeasureKey, string>> = Object.freeze({
  eventRows: 'registros',
  distinctPersons: 'personas',
  reportedDays: 'días informados',
});

function contractError(path: string): never {
  throw new Error(`GRH_MANAGEMENT_TIMELINE_INVALID:${path}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) contractError(path);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    contractError(path);
  }
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') contractError(path);
  return value;
}

function literal<T extends string | number | boolean | null>(
  value: unknown,
  expected: T,
  path: string,
): T {
  if (value !== expected) contractError(path);
  return expected;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) contractError(path);
  return value as T;
}

function numberValue(
  value: unknown,
  path: string,
  { allowNegative = false, integerOnly = false }: {
    readonly allowNegative?: boolean;
    readonly integerOnly?: boolean;
  } = {},
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) contractError(path);
  if (!allowNegative && value < 0) contractError(path);
  if (integerOnly && !Number.isSafeInteger(value)) contractError(path);
  return value;
}

function isoDate(value: unknown, path: string): string {
  const parsed = stringValue(value, path);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(parsed) || Number.isNaN(Date.parse(`${parsed}T12:00:00Z`))) {
    contractError(path);
  }
  return parsed;
}

function nullableIsoDate(value: unknown, path: string): string | null {
  return value === null ? null : isoDate(value, path);
}

function isoTimestamp(value: unknown, path: string): string {
  const parsed = stringValue(value, path);
  if (Number.isNaN(Date.parse(parsed))) contractError(path);
  return parsed;
}

function numberRecord(value: unknown, path: string): Readonly<Record<string, number>> {
  const input = record(value, path);
  const output: Record<string, number> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!key) contractError(path);
    output[key] = numberValue(raw, `${path}.${key}`, { integerOnly: true });
  }
  return output;
}

function measureList(value: unknown, path: string): readonly ManagementTimelineMeasureKey[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 3) contractError(path);
  const measures = value.map((measure, index) => oneOf(measure, MEASURE_KEYS, `${path}[${index}]`));
  if (new Set(measures).size !== measures.length || measures[0] !== 'eventRows' || measures[1] !== 'distinctPersons') {
    contractError(path);
  }
  if (measures.length === 3 && measures[2] !== 'reportedDays') contractError(path);
  return measures;
}

function cell(
  value: unknown,
  measures: readonly ManagementTimelineMeasureKey[],
  path: string,
  { delta = false }: { readonly delta?: boolean } = {},
): ManagementTimelineCell {
  const input = record(value, path);
  exactKeys(input, ['privacyStatus', 'values'], path);
  const privacyStatus = oneOf(input.privacyStatus, PRIVACY_STATUSES, `${path}.privacyStatus`);
  const valuesInput = record(input.values, `${path}.values`);
  exactKeys(valuesInput, measures, `${path}.values`);
  const values: Partial<Record<ManagementTimelineMeasureKey, number | null>> = {};

  for (const measure of measures) {
    const raw = valuesInput[measure];
    if (privacyStatus === 'released') {
      values[measure] = numberValue(raw, `${path}.values.${measure}`, {
        allowNegative: delta,
        integerOnly: true,
      });
    } else {
      values[measure] = literal(raw, null, `${path}.values.${measure}`);
    }
  }

  return { privacyStatus, values };
}

function domain(value: unknown, expectedKey: ManagementTimelineDomainKey, path: string): ManagementTimelineDomain {
  const input = record(value, path);
  exactKeys(input, [
    'key', 'label', 'description', 'comparisonStatus', 'measures', 'current', 'prior', 'delta',
  ], path);
  literal(input.key, expectedKey, `${path}.key`);
  const measures = measureList(input.measures, `${path}.measures`);
  const expectedStatus = expectedKey === 'fixedConceptStarts' ? 'context_only' : 'comparable';

  return {
    key: expectedKey,
    label: stringValue(input.label, `${path}.label`),
    description: stringValue(input.description, `${path}.description`),
    comparisonStatus: literal(input.comparisonStatus, expectedStatus, `${path}.comparisonStatus`),
    measures,
    current: cell(input.current, measures, `${path}.current`),
    prior: cell(input.prior, measures, `${path}.prior`),
    delta: cell(input.delta, measures, `${path}.delta`, { delta: true }),
  };
}

function domains(value: unknown, path: string): ManagementTimelineContract['comparison']['domains'] {
  const input = record(value, path);
  exactKeys(input, DOMAIN_KEYS, path);
  return Object.fromEntries(DOMAIN_KEYS.map(key => [key, domain(input[key], key, `${path}.${key}`)])) as
    ManagementTimelineContract['comparison']['domains'];
}

function term(value: unknown, path: string): ManagementTimelineContract['terms']['current'] {
  const input = record(value, path);
  exactKeys(input, ['key', 'label', 'startDate', 'endDate', 'plannedDays'], path);
  return {
    key: stringValue(input.key, `${path}.key`),
    label: stringValue(input.label, `${path}.label`),
    startDate: isoDate(input.startDate, `${path}.startDate`),
    endDate: isoDate(input.endDate, `${path}.endDate`),
    plannedDays: numberValue(input.plannedDays, `${path}.plannedDays`, { integerOnly: true }),
  };
}

function observedWindow(
  value: unknown,
  status: 'partial' | 'matched_window',
  path: string,
): ManagementTimelineContract['observed']['current'] | ManagementTimelineContract['observed']['prior'] {
  const input = record(value, path);
  exactKeys(input, ['startDate', 'endDate', 'days', 'progressPct', 'status'], path);
  return {
    startDate: isoDate(input.startDate, `${path}.startDate`),
    endDate: isoDate(input.endDate, `${path}.endDate`),
    days: numberValue(input.days, `${path}.days`, { integerOnly: true }),
    progressPct: numberValue(input.progressPct, `${path}.progressPct`),
    status: literal(input.status, status, `${path}.status`),
  };
}

function yearWindow(
  value: unknown,
  statusSet: readonly ManagementTimelineYear['current']['status'][],
  path: string,
): ManagementTimelineYear['current'] {
  const input = record(value, path);
  exactKeys(input, [
    'plannedStartDate', 'plannedEndDate', 'observedStartDate', 'observedEndDate', 'observedDays', 'status',
  ], path);
  const observedStartDate = nullableIsoDate(input.observedStartDate, `${path}.observedStartDate`);
  const observedEndDate = nullableIsoDate(input.observedEndDate, `${path}.observedEndDate`);
  const status = oneOf(input.status, statusSet, `${path}.status`);
  if ((observedStartDate === null) !== (observedEndDate === null)) contractError(path);
  if ((status === 'future' || status === 'not_compared') && (observedStartDate !== null || observedEndDate !== null)) {
    contractError(path);
  }
  if (status !== 'future' && status !== 'not_compared' && (observedStartDate === null || observedEndDate === null)) {
    contractError(path);
  }

  return {
    plannedStartDate: isoDate(input.plannedStartDate, `${path}.plannedStartDate`),
    plannedEndDate: isoDate(input.plannedEndDate, `${path}.plannedEndDate`),
    observedStartDate,
    observedEndDate,
    observedDays: numberValue(input.observedDays, `${path}.observedDays`, { integerOnly: true }),
    status,
  };
}

function year(value: unknown, ordinal: 1 | 2 | 3 | 4, path: string): ManagementTimelineYear {
  const input = record(value, path);
  exactKeys(input, ['key', 'ordinal', 'label', 'plannedDays', 'current', 'prior', 'domains'], path);
  const key = `management-year-${ordinal}` as const;
  literal(input.key, key, `${path}.key`);
  literal(input.ordinal, ordinal, `${path}.ordinal`);

  return {
    key,
    ordinal,
    label: stringValue(input.label, `${path}.label`),
    plannedDays: numberValue(input.plannedDays, `${path}.plannedDays`, { integerOnly: true }),
    current: yearWindow(input.current, CURRENT_YEAR_STATUSES, `${path}.current`),
    prior: yearWindow(input.prior, PRIOR_YEAR_STATUSES, `${path}.prior`),
    domains: domains(input.domains, `${path}.domains`),
  };
}

export function parseManagementTimelineContract(value: unknown): ManagementTimelineContract {
  const input = record(value, 'contract');
  exactKeys(input, [
    'schemaVersion', 'generatedAt', 'source', 'privacy', 'terms', 'observed',
    'managementYears', 'comparison', 'limits',
  ], 'contract');
  literal(input.schemaVersion, SCHEMA_VERSION, 'contract.schemaVersion');

  const sourceInput = record(input.source, 'contract.source');
  exactKeys(sourceInput, [
    'canonicalSystem', 'fileName', 'sha256', 'snapshotAsOf', 'realtime', 'rowCounts', 'coverage',
  ], 'contract.source');
  const sha256 = stringValue(sourceInput.sha256, 'contract.source.sha256');
  if (!/^[a-f\d]{64}$/iu.test(sha256)) contractError('contract.source.sha256');

  const privacyInput = record(input.privacy, 'contract.privacy');
  exactKeys(privacyInput, [
    'mode', 'threshold', 'personKey', 'rule', 'protectedValue', 'complementarySuppression',
    'containsPii', 'personIdentifiersExported', 'rawRowsExported',
  ], 'contract.privacy');

  const termsInput = record(input.terms, 'contract.terms');
  exactKeys(termsInput, ['current', 'prior'], 'contract.terms');
  const observedInput = record(input.observed, 'contract.observed');
  exactKeys(observedInput, ['current', 'prior'], 'contract.observed');

  const managementYearsInput = input.managementYears;
  if (!Array.isArray(managementYearsInput) || managementYearsInput.length !== 4) {
    contractError('contract.managementYears');
  }
  const managementYears = ([1, 2, 3, 4] as const).map((ordinal, index) =>
    year(managementYearsInput[index], ordinal, `contract.managementYears[${index}]`));

  const comparisonInput = record(input.comparison, 'contract.comparison');
  exactKeys(comparisonInput, ['observedDays', 'matrixDomainKeys', 'domains'], 'contract.comparison');
  if (!Array.isArray(comparisonInput.matrixDomainKeys) ||
    comparisonInput.matrixDomainKeys.length !== MATRIX_DOMAIN_KEYS.length ||
    comparisonInput.matrixDomainKeys.some((key, index) => key !== MATRIX_DOMAIN_KEYS[index])) {
    contractError('contract.comparison.matrixDomainKeys');
  }

  if (!Array.isArray(input.limits)) contractError('contract.limits');
  const limits = input.limits.map((limitValue, index) => {
    const limit = record(limitValue, `contract.limits[${index}]`);
    exactKeys(limit, ['code', 'text'], `contract.limits[${index}]`);
    return {
      code: stringValue(limit.code, `contract.limits[${index}].code`),
      text: stringValue(limit.text, `contract.limits[${index}].text`),
    };
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: isoTimestamp(input.generatedAt, 'contract.generatedAt'),
    source: {
      canonicalSystem: literal(sourceInput.canonicalSystem, 'GRH Junín', 'contract.source.canonicalSystem'),
      fileName: stringValue(sourceInput.fileName, 'contract.source.fileName'),
      sha256,
      snapshotAsOf: isoDate(sourceInput.snapshotAsOf, 'contract.source.snapshotAsOf'),
      realtime: literal(sourceInput.realtime, false, 'contract.source.realtime'),
      rowCounts: numberRecord(sourceInput.rowCounts, 'contract.source.rowCounts'),
      coverage: record(sourceInput.coverage, 'contract.source.coverage'),
    },
    privacy: {
      mode: literal(privacyInput.mode, 'aggregate_only', 'contract.privacy.mode'),
      threshold: literal(privacyInput.threshold, 10, 'contract.privacy.threshold'),
      personKey: literal(privacyInput.personKey, 'legajo.IDPERSONA', 'contract.privacy.personKey'),
      rule: stringValue(privacyInput.rule, 'contract.privacy.rule'),
      protectedValue: literal(privacyInput.protectedValue, null, 'contract.privacy.protectedValue'),
      complementarySuppression: literal(
        privacyInput.complementarySuppression,
        true,
        'contract.privacy.complementarySuppression',
      ),
      containsPii: literal(privacyInput.containsPii, false, 'contract.privacy.containsPii'),
      personIdentifiersExported: literal(
        privacyInput.personIdentifiersExported,
        false,
        'contract.privacy.personIdentifiersExported',
      ),
      rawRowsExported: literal(privacyInput.rawRowsExported, false, 'contract.privacy.rawRowsExported'),
    },
    terms: {
      current: term(termsInput.current, 'contract.terms.current'),
      prior: term(termsInput.prior, 'contract.terms.prior'),
    },
    observed: {
      current: observedWindow(observedInput.current, 'partial', 'contract.observed.current') as
        ManagementTimelineContract['observed']['current'],
      prior: observedWindow(observedInput.prior, 'matched_window', 'contract.observed.prior') as
        ManagementTimelineContract['observed']['prior'],
    },
    managementYears: managementYears as unknown as ManagementTimelineContract['managementYears'],
    comparison: {
      observedDays: numberValue(comparisonInput.observedDays, 'contract.comparison.observedDays', {
        integerOnly: true,
      }),
      matrixDomainKeys: MATRIX_DOMAIN_KEYS as ManagementTimelineContract['comparison']['matrixDomainKeys'],
      domains: domains(comparisonInput.domains, 'contract.comparison.domains'),
    },
    limits,
  };
}

function formatDate(value: string): string {
  return date.format(new Date(`${value}T12:00:00-03:00`));
}

function formatRange(start: string, end: string): string {
  return `${formatDate(start)} a ${formatDate(end)}`;
}

function cellLabel(
  domainValue: ManagementTimelineDomain,
  value: ManagementTimelineCell,
  { delta = false }: { readonly delta?: boolean } = {},
): string {
  if (value.privacyStatus === 'protected_primary' || value.privacyStatus === 'protected_complementary') {
    return 'Dato protegido';
  }
  if (value.privacyStatus === 'unavailable') return 'No disponible';

  return domainValue.measures.map(measure => {
    const raw = value.values[measure];
    if (typeof raw !== 'number') contractError(`viewModel.${domainValue.key}.${measure}`);
    const formatted = integer.format(delta ? Math.abs(raw) : raw);
    const sign = delta && raw !== 0 ? (raw > 0 ? '+' : '−') : '';
    return `${sign}${formatted} ${MEASURE_LABELS[measure]}`;
  }).join(' · ');
}

function singleMeasureLabel(
  domainValue: ManagementTimelineDomain,
  value: ManagementTimelineCell,
  measure: ManagementTimelineMeasureKey,
  { delta = false }: { readonly delta?: boolean } = {},
): string {
  if (value.privacyStatus === 'protected_primary' || value.privacyStatus === 'protected_complementary') {
    return 'Dato protegido';
  }
  if (value.privacyStatus === 'unavailable') return 'No disponible';
  const raw = value.values[measure];
  if (typeof raw !== 'number') contractError(`viewModel.${domainValue.key}.${measure}`);
  const sign = delta && raw !== 0 ? (raw > 0 ? '+' : '−') : '';
  return `${sign}${integer.format(delta ? Math.abs(raw) : raw)} ${MEASURE_LABELS[measure]}`;
}

function yearStatus(yearValue: ManagementTimelineYear): { readonly label: string; readonly tone: ManagementTimelineTone } {
  if (yearValue.current.status === 'partial') return { label: 'Corte parcial', tone: 'attention' };
  if (yearValue.current.status === 'future') return { label: 'Aún no observado', tone: 'neutral' };
  return { label: 'Tramo completo', tone: 'neutral' };
}

function windowRange(
  window: ManagementTimelineYear['current'],
  unavailableLabel: string,
): string {
  if (window.observedStartDate && window.observedEndDate) {
    return `${formatRange(window.observedStartDate, window.observedEndDate)} · ${integer.format(window.observedDays)} días`;
  }
  return `${formatRange(window.plannedStartDate, window.plannedEndDate)} · ${unavailableLabel}`;
}

function yearViewModel(
  yearValue: ManagementTimelineYear,
  equalWindowLabel: string,
): ManagementTimelineYearViewModel {
  const rows = MATRIX_DOMAIN_KEYS.map(key => {
    const domainValue = yearValue.domains[key];
    const hasProtectedValue = [domainValue.current, domainValue.prior, domainValue.delta]
      .some(value => value.privacyStatus.startsWith('protected_'));
    return {
      code: key,
      label: domainValue.label,
      explanation: domainValue.description,
      currentLabel: cellLabel(domainValue, domainValue.current),
      priorLabel: cellLabel(domainValue, domainValue.prior),
      differenceLabel: cellLabel(domainValue, domainValue.delta, { delta: true }),
      tone: hasProtectedValue ? 'attention' : 'neutral',
    } as const;
  }) as unknown as ManagementTimelineYearViewModel['rows'];
  const contextOnly = yearValue.domains.fixedConceptStarts;
  const status = yearStatus(yearValue);

  return {
    key: yearValue.key,
    ordinal: yearValue.ordinal,
    label: yearValue.label,
    statusLabel: status.label,
    tone: status.tone,
    currentRangeLabel: windowRange(yearValue.current, 'aún no observado'),
    priorRangeLabel: windowRange(yearValue.prior, 'no comparado'),
    equalWindowLabel,
    rows,
    accessibleSummary: rows.map(row =>
      `${row.label}: actual ${row.currentLabel}; anterior ${row.priorLabel}; diferencia ${row.differenceLabel}.`)
      .join(' '),
    contextOnlyLabel: contextOnly.label,
    contextOnlyDescription: contextOnly.description,
    contextOnlyCurrentLabel: cellLabel(contextOnly, contextOnly.current),
    contextOnlyPriorLabel: cellLabel(contextOnly, contextOnly.prior),
  };
}

function assistantHref(question: string): string {
  return `/ia.html?question=${encodeURIComponent(question)}`;
}

export function buildManagementTimelineViewModel(contractValue: unknown): ManagementTimelineViewModel {
  const contract = parseManagementTimelineContract(contractValue);
  const equalWindowLabel = `${integer.format(contract.comparison.observedDays)} días comparables por gestión`;
  const years = contract.managementYears.map(yearValue => yearViewModel(yearValue, equalWindowLabel)) as unknown as
    ManagementTimelineViewModel['comparison']['years'];
  const partialYear = contract.managementYears.find(yearValue => yearValue.current.status === 'partial');
  const lastCompleteYear = [...contract.managementYears].reverse()
    .find(yearValue => yearValue.current.status === 'complete');
  const defaultYearKey = (partialYear ?? lastCompleteYear ?? contract.managementYears[0]).key;

  const absence = contract.comparison.domains.reportedAbsence;
  const ingress = contract.comparison.domains.reportedIngressDates;
  const exit = contract.comparison.domains.reportedExitDates;
  const currentProgress = `${percentage.format(contract.observed.current.progressPct)}%`;

  const decisions: ManagementTimelineViewModel['decisions'] = [
    {
      code: 'observed-window',
      priorityLabel: 'Contexto del corte',
      tone: 'attention',
      whatHappened: `${contract.terms.current.label}: ${currentProgress} observado (${integer.format(contract.observed.current.days)} de ${integer.format(contract.terms.current.plannedDays)} días planificados).`,
      whyItMatters: 'La gestión actual todavía está abierta; una lectura definitiva mezclaría desempeño observado con tiempo futuro.',
      whatToDo: 'Usar únicamente la ventana equivalente publicada y volver a revisar al próximo corte gobernado.',
      actionLabel: 'Ver tablero ejecutivo',
      actionHref: '/dashboard#administrationComparisonTitle',
      assistantHref: assistantHref('Explicame cómo leer la ventana comparable de gestiones y sus límites.'),
      detailLabel: 'Cómo se igualó la comparación',
      details: [
        `Actual: ${formatRange(contract.observed.current.startDate, contract.observed.current.endDate)}.`,
        `Anterior: ${formatRange(contract.observed.prior.startDate, contract.observed.prior.endDate)}.`,
        `${equalWindowLabel}; no se proyectan los días futuros.`,
      ],
    },
    {
      code: 'reported-absence',
      priorityLabel: 'Prioridad de revisión',
      tone: 'attention',
      whatHappened: `${absence.label}: ${cellLabel(absence, absence.current)} frente a ${cellLabel(absence, absence.prior)}.`,
      whyItMatters: 'La diferencia reportada orienta dónde profundizar, pero no demuestra por sí sola una causa ni un resultado de gestión.',
      whatToDo: 'Abrir el tablero operativo, validar cobertura y segmentar sólo dentro de los permisos habilitados.',
      actionLabel: 'Revisar ausentismo',
      actionHref: '/dashboard#administrationComparisonTitle',
      assistantHref: assistantHref('Explicame la comparación de ausencias reportadas sin inferir causas.'),
      detailLabel: 'Ver evidencia y cautelas',
      details: [
        `Diferencia publicada: ${cellLabel(absence, absence.delta, { delta: true })}.`,
        absence.description,
        'Las personas se cuentan por IDPERSONA; no se muestran legajos ni datos individuales.',
      ],
    },
    {
      code: 'reported-movements',
      priorityLabel: 'Movimiento registral',
      tone: 'neutral',
      whatHappened: `${ingress.label}: ${singleMeasureLabel(ingress, ingress.current, 'eventRows')} vs ${singleMeasureLabel(ingress, ingress.prior, 'eventRows')}; ${exit.label}: ${singleMeasureLabel(exit, exit.current, 'eventRows')} vs ${singleMeasureLabel(exit, exit.prior, 'eventRows')}.`,
      whyItMatters: 'Son fechas informadas en GRH: ayudan a revisar dinámica registral, no equivalen a dotación, pago ni causal laboral.',
      whatToDo: 'Contrastar con los módulos fuente antes de convertir estos registros en una decisión de personal.',
      actionLabel: 'Abrir análisis de personal',
      actionHref: '/dashboard#administrationComparisonTitle',
      assistantHref: assistantHref('Explicame qué representan los ingresos y egresos reportados en GRH.'),
      detailLabel: 'Ver alcance registral',
      details: [
        `Ingresos, diferencia publicada: ${singleMeasureLabel(ingress, ingress.delta, 'eventRows', { delta: true })}.`,
        `Egresos, diferencia publicada: ${singleMeasureLabel(exit, exit.delta, 'eventRows', { delta: true })}.`,
        'Los años protegidos permanecen ocultos por regla K=10 y supresión complementaria.',
      ],
    },
  ];

  return {
    source: {
      canonicalSystem: contract.source.canonicalSystem,
      snapshotLabel: formatDate(contract.source.snapshotAsOf),
      generatedLabel: formatDate(contract.generatedAt.slice(0, 10)),
      sourceFile: contract.source.fileName,
      sourceSha256: contract.source.sha256,
      notice: `Copia histórica al ${formatDate(contract.source.snapshotAsOf)} · no se actualiza en tiempo real`,
    },
    comparison: {
      title: 'Gestión actual y anterior, año por año',
      description: 'Elegí uno de los cuatro años del mandato. La matriz mantiene la misma semántica y respeta cada celda protegida.',
      equalWindowLabel,
      currentLabel: contract.terms.current.label,
      priorLabel: contract.terms.prior.label,
      interpretation: 'Las diferencias llegan publicadas por el contrato gobernado. No se calculan en el navegador ni se interpretan como mejor o peor desempeño.',
      defaultYearKey,
      years,
    },
    decisions,
    methodology: [
      {
        label: 'Ventana comparable',
        value: `${integer.format(contract.observed.current.days)} días actuales y ${integer.format(contract.observed.prior.days)} días anteriores`,
      },
      {
        label: 'Avance del mandato actual',
        value: `${currentProgress} al ${formatDate(contract.observed.current.endDate)}`,
      },
      {
        label: 'Unidad de persona',
        value: 'IDPERSONA de legajo; no cantidad de legajos',
      },
      {
        label: 'Privacidad',
        value: `K=${integer.format(contract.privacy.threshold)} con supresión primaria y complementaria`,
      },
    ],
    limits: contract.limits.map(limit => limit.text),
  };
}
