import type {
  GardenNetworkContract,
  GardenNetworkMonthlyPoint,
  GardenNetworkReleasedUnit,
  GardenNetworkViewModel,
} from './garden-network-types';

const SCHEMA_VERSION = 'grh-garden-network-v1';
const TREND_PERIODS = 24;
const LIMIT_CODES = Object.freeze([
  'historical_snapshot_not_realtime',
  'latest_complete_calculation_month',
  'calculation_cohort_not_total_staff',
  'person_grain_across_employments',
  'unit_assignment_from_calculation',
  'small_units_are_combined',
  'official_locations_not_available',
  'enrollment_not_available',
  'capacity_not_available',
  'attendance_not_available',
  'budget_not_available',
] as const);
const CHART = Object.freeze({ width: 720, height: 260, left: 50, right: 20, top: 20, bottom: 40 });

const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const percentage = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const monthLong = new Intl.DateTimeFormat('es-AR', {
  month: 'long',
  timeZone: 'UTC',
  year: 'numeric',
});
const monthShort = new Intl.DateTimeFormat('es-AR', {
  month: 'short',
  timeZone: 'UTC',
  year: '2-digit',
});
const date = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeZone: 'America/Argentina/Buenos_Aires',
});
const dateTime = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Argentina/Buenos_Aires',
});

function contractError(path: string): never {
  throw new Error(`GRH_GARDEN_NETWORK_INVALID:${path}`);
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

function literal<T extends string | number | boolean>(value: unknown, expected: T, path: string): T {
  if (value !== expected) contractError(path);
  return expected;
}

function numberValue(
  value: unknown,
  path: string,
  { integerOnly = false, maximum }: { readonly integerOnly?: boolean; readonly maximum?: number } = {},
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) contractError(path);
  if (integerOnly && !Number.isSafeInteger(value)) contractError(path);
  if (maximum !== undefined && value > maximum) contractError(path);
  return value;
}

function isoTimestamp(value: unknown, path: string): string {
  const parsed = stringValue(value, path);
  if (Number.isNaN(Date.parse(parsed))) contractError(path);
  return parsed;
}

function isoDate(value: unknown, path: string): string {
  const parsed = stringValue(value, path);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(parsed) || Number.isNaN(Date.parse(`${parsed}T12:00:00Z`))) {
    contractError(path);
  }
  return parsed;
}

function monthPeriod(value: unknown, path: string): string {
  const parsed = stringValue(value, path);
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(parsed)) contractError(path);
  return parsed;
}

function monthIndex(period: string): number {
  const [year = '', month = ''] = period.split('-');
  return Number(year) * 12 + Number(month) - 1;
}

function source(value: unknown): GardenNetworkContract['source'] {
  const input = record(value, 'contract.source');
  exactKeys(input, ['canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf', 'realtime'], 'contract.source');
  const sourceSha256 = stringValue(input.sourceSha256, 'contract.source.sourceSha256');
  if (!/^[a-f0-9]{64}$/u.test(sourceSha256)) contractError('contract.source.sourceSha256');
  return {
    canonicalSystem: stringValue(input.canonicalSystem, 'contract.source.canonicalSystem'),
    sourceFile: stringValue(input.sourceFile, 'contract.source.sourceFile'),
    sourceSha256,
    snapshotAsOf: isoDate(input.snapshotAsOf, 'contract.source.snapshotAsOf'),
    realtime: literal(input.realtime, false, 'contract.source.realtime'),
  };
}

function privacy(value: unknown): GardenNetworkContract['privacy'] {
  const input = record(value, 'contract.privacy');
  exactKeys(input, [
    'status', 'threshold', 'aggregateOnly', 'containsPii', 'personIdentifiersExported',
    'employmentKeysExported', 'sourceCodesExported', 'rawRowsExported', 'complementarySuppression',
  ], 'contract.privacy');
  return {
    status: literal(input.status, 'released_with_protected_bucket', 'contract.privacy.status'),
    threshold: literal(input.threshold, 10, 'contract.privacy.threshold'),
    aggregateOnly: literal(input.aggregateOnly, true, 'contract.privacy.aggregateOnly'),
    containsPii: literal(input.containsPii, false, 'contract.privacy.containsPii'),
    personIdentifiersExported: literal(
      input.personIdentifiersExported,
      false,
      'contract.privacy.personIdentifiersExported',
    ),
    employmentKeysExported: literal(
      input.employmentKeysExported,
      false,
      'contract.privacy.employmentKeysExported',
    ),
    sourceCodesExported: literal(input.sourceCodesExported, false, 'contract.privacy.sourceCodesExported'),
    rawRowsExported: literal(input.rawRowsExported, false, 'contract.privacy.rawRowsExported'),
    complementarySuppression: literal(
      input.complementarySuppression,
      true,
      'contract.privacy.complementarySuppression',
    ),
  };
}

function grain(value: unknown): GardenNetworkContract['grain'] {
  const input = record(value, 'contract.grain');
  exactKeys(input, ['entity', 'identityBasis', 'deduplication'], 'contract.grain');
  return {
    entity: literal(input.entity, 'person', 'contract.grain.entity'),
    identityBasis: literal(input.identityBasis, 'legajo.IDPERSONA', 'contract.grain.identityBasis'),
    deduplication: literal(
      input.deduplication,
      'distinct_person_across_employment_keys',
      'contract.grain.deduplication',
    ),
  };
}

function quality(value: unknown): GardenNetworkContract['quality'] {
  const input = record(value, 'contract.quality');
  exactKeys(input, [
    'status', 'assignmentPolicyVersion', 'latestValidCalculationPeriod', 'sourceEmploymentKeys',
    'linkedEmploymentKeys', 'people', 'observedUnitCount', 'releasedUnitCount', 'reconciliationOk',
  ], 'contract.quality');
  return {
    status: literal(input.status, 'reconciled', 'contract.quality.status'),
    assignmentPolicyVersion: literal(
      input.assignmentPolicyVersion,
      'grh-garden-network-assignment-v1',
      'contract.quality.assignmentPolicyVersion',
    ),
    latestValidCalculationPeriod: monthPeriod(
      input.latestValidCalculationPeriod,
      'contract.quality.latestValidCalculationPeriod',
    ),
    sourceEmploymentKeys: numberValue(input.sourceEmploymentKeys, 'contract.quality.sourceEmploymentKeys', {
      integerOnly: true,
    }),
    linkedEmploymentKeys: numberValue(input.linkedEmploymentKeys, 'contract.quality.linkedEmploymentKeys', {
      integerOnly: true,
    }),
    people: numberValue(input.people, 'contract.quality.people', { integerOnly: true }),
    observedUnitCount: numberValue(input.observedUnitCount, 'contract.quality.observedUnitCount', {
      integerOnly: true,
    }),
    releasedUnitCount: numberValue(input.releasedUnitCount, 'contract.quality.releasedUnitCount', {
      integerOnly: true,
    }),
    reconciliationOk: literal(input.reconciliationOk, true, 'contract.quality.reconciliationOk'),
  };
}

function referencePeriod(value: unknown): GardenNetworkContract['referencePeriod'] {
  const input = record(value, 'contract.referencePeriod');
  exactKeys(input, ['period', 'label', 'status'], 'contract.referencePeriod');
  return {
    period: monthPeriod(input.period, 'contract.referencePeriod.period'),
    label: stringValue(input.label, 'contract.referencePeriod.label'),
    status: literal(
      input.status,
      'latest_valid_calculation',
      'contract.referencePeriod.status',
    ),
  };
}

function summary(value: unknown): GardenNetworkContract['summary'] {
  const input = record(value, 'contract.summary');
  exactKeys(input, [
    'people', 'releasedPeople', 'protectedPeople', 'releasedUnitCount', 'observedUnitCount',
  ], 'contract.summary');
  return {
    people: numberValue(input.people, 'contract.summary.people', { integerOnly: true }),
    releasedPeople: numberValue(input.releasedPeople, 'contract.summary.releasedPeople', { integerOnly: true }),
    protectedPeople: numberValue(input.protectedPeople, 'contract.summary.protectedPeople', { integerOnly: true }),
    releasedUnitCount: numberValue(input.releasedUnitCount, 'contract.summary.releasedUnitCount', {
      integerOnly: true,
    }),
    observedUnitCount: numberValue(input.observedUnitCount, 'contract.summary.observedUnitCount', {
      integerOnly: true,
    }),
  };
}

function monthlyPoint(value: unknown, index: number): GardenNetworkMonthlyPoint {
  const path = `contract.monthlyTrend[${index}]`;
  const input = record(value, path);
  exactKeys(input, ['period', 'label', 'people'], path);
  return {
    period: monthPeriod(input.period, `${path}.period`),
    label: stringValue(input.label, `${path}.label`),
    people: numberValue(input.people, `${path}.people`, { integerOnly: true }),
  };
}

function monthlyTrend(value: unknown): readonly GardenNetworkMonthlyPoint[] {
  if (!Array.isArray(value) || value.length !== TREND_PERIODS) contractError('contract.monthlyTrend');
  const points = value.map(monthlyPoint);
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[index - 1];
    if (!current || !previous || monthIndex(current.period) !== monthIndex(previous.period) + 1) {
      contractError(`contract.monthlyTrend[${index}].period`);
    }
  }
  return points;
}

function releasedUnit(value: unknown, index: number): GardenNetworkReleasedUnit {
  const path = `contract.releasedUnits[${index}]`;
  const input = record(value, path);
  exactKeys(input, ['label', 'people', 'sharePct'], path);
  return {
    label: stringValue(input.label, `${path}.label`),
    people: numberValue(input.people, `${path}.people`, { integerOnly: true }),
    sharePct: numberValue(input.sharePct, `${path}.sharePct`, { maximum: 100 }),
  };
}

function releasedUnits(value: unknown): readonly GardenNetworkReleasedUnit[] {
  if (!Array.isArray(value) || value.length === 0) contractError('contract.releasedUnits');
  const units = value.map(releasedUnit);
  if (new Set(units.map(unit => unit.label)).size !== units.length) contractError('contract.releasedUnits.labels');
  return units;
}

function protectedBucket(value: unknown): GardenNetworkContract['protectedBucket'] {
  const input = record(value, 'contract.protectedBucket');
  exactKeys(input, ['label', 'people', 'sharePct', 'privacyStatus'], 'contract.protectedBucket');
  return {
    label: stringValue(input.label, 'contract.protectedBucket.label'),
    people: numberValue(input.people, 'contract.protectedBucket.people', { integerOnly: true }),
    sharePct: numberValue(input.sharePct, 'contract.protectedBucket.sharePct', { maximum: 100 }),
    privacyStatus: literal(
      input.privacyStatus,
      'protected_aggregate',
      'contract.protectedBucket.privacyStatus',
    ),
  };
}

function limits(value: unknown): GardenNetworkContract['limits'] {
  if (!Array.isArray(value) || value.length !== LIMIT_CODES.length) contractError('contract.limits');
  const parsed = value.map((limit, index) => {
    const path = `contract.limits[${index}]`;
    const input = record(limit, path);
    exactKeys(input, ['code', 'text'], path);
    const code = stringValue(input.code, `${path}.code`);
    if (code !== LIMIT_CODES[index]) contractError(`${path}.code`);
    return { code, text: stringValue(input.text, `${path}.text`) };
  });
  if (new Set(parsed.map(limit => limit.code)).size !== parsed.length) contractError('contract.limits.codes');
  return parsed;
}

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.11;
}

function assertReconciliation(contract: GardenNetworkContract): void {
  const { quality: qualityValue, referencePeriod: reference, summary: totals } = contract;
  if (qualityValue.latestValidCalculationPeriod !== reference.period) {
    contractError('contract.quality.latestValidCalculationPeriod');
  }
  for (const key of ['people', 'observedUnitCount', 'releasedUnitCount'] as const) {
    if (qualityValue[key] !== totals[key]) contractError(`contract.quality.${key}`);
  }
  if (qualityValue.linkedEmploymentKeys > qualityValue.sourceEmploymentKeys) {
    contractError('contract.quality.linkedEmploymentKeys');
  }
  if (totals.releasedPeople + totals.protectedPeople !== totals.people) {
    contractError('contract.summary.privacyBuckets');
  }
  if (totals.releasedUnitCount !== contract.releasedUnits.length ||
      totals.observedUnitCount <= totals.releasedUnitCount) {
    contractError('contract.summary.unitCounts');
  }
  const releasedPeople = contract.releasedUnits.reduce((total, unit) => total + unit.people, 0);
  if (releasedPeople !== totals.releasedPeople || contract.protectedBucket.people !== totals.protectedPeople) {
    contractError('contract.summary.peopleBuckets');
  }
  for (const [index, unit] of contract.releasedUnits.entries()) {
    if (unit.people < contract.privacy.threshold ||
        !approximatelyEqual(unit.sharePct, unit.people / totals.people * 100)) {
      contractError(`contract.releasedUnits[${index}]`);
    }
  }
  if (!approximatelyEqual(
    contract.protectedBucket.sharePct,
    contract.protectedBucket.people / totals.people * 100,
  )) {
    contractError('contract.protectedBucket.sharePct');
  }
  const latestPoint = contract.monthlyTrend.at(-1);
  if (!latestPoint || latestPoint.period !== reference.period || latestPoint.people !== totals.people) {
    contractError('contract.monthlyTrend.latest');
  }
}

export function parseGardenNetworkContract(value: unknown): GardenNetworkContract {
  const input = record(value, 'contract');
  exactKeys(input, [
    'schemaVersion', 'generatedAt', 'source', 'privacy', 'grain', 'quality', 'referencePeriod',
    'summary', 'monthlyTrend', 'releasedUnits', 'protectedBucket', 'limits',
  ], 'contract');
  const contract: GardenNetworkContract = {
    schemaVersion: literal(input.schemaVersion, SCHEMA_VERSION, 'contract.schemaVersion'),
    generatedAt: isoTimestamp(input.generatedAt, 'contract.generatedAt'),
    source: source(input.source),
    privacy: privacy(input.privacy),
    grain: grain(input.grain),
    quality: quality(input.quality),
    referencePeriod: referencePeriod(input.referencePeriod),
    summary: summary(input.summary),
    monthlyTrend: monthlyTrend(input.monthlyTrend),
    releasedUnits: releasedUnits(input.releasedUnits),
    protectedBucket: protectedBucket(input.protectedBucket),
    limits: limits(input.limits),
  };
  assertReconciliation(contract);
  return contract;
}

function formatMonth(period: string, style: 'long' | 'short' = 'long'): string {
  const [year = '', month = ''] = period.split('-');
  const value = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return (style === 'long' ? monthLong : monthShort).format(value).replace('.', '');
}

function labelCount(value: number, singular: string, plural: string): string {
  return `${integer.format(value)} ${value === 1 ? singular : plural}`;
}

function buildTrend(contract: GardenNetworkContract): GardenNetworkViewModel['trend'] {
  const values = contract.monthlyTrend.map(point => point.people);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  let lower = Math.max(0, Math.floor(minimum / 5) * 5);
  let upper = Math.ceil(maximum / 5) * 5;
  if (lower === upper) {
    lower = Math.max(0, lower - 5);
    upper += 5;
  }
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const points = contract.monthlyTrend.map((point, index) => {
    const x = CHART.left + index / (contract.monthlyTrend.length - 1) * plotWidth;
    const y = CHART.top + (upper - point.people) / (upper - lower) * plotHeight;
    return {
      period: point.period,
      periodLabel: formatMonth(point.period),
      shortLabel: formatMonth(point.period, 'short'),
      people: point.people,
      peopleLabel: integer.format(point.people),
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      anchor: index === 0 || index === contract.monthlyTrend.length - 1 || index % 6 === 0,
    };
  });
  const guideValues = [upper, Math.round((upper + lower) / 2), lower];
  const guides = guideValues.map(value => ({
    value,
    label: integer.format(value),
    y: Number((CHART.top + (upper - value) / (upper - lower) * plotHeight).toFixed(2)),
  }));
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const floorY = CHART.height - CHART.bottom;
  const firstPoint = points[0];
  const lastPoint = points.at(-1);
  if (!firstPoint || !lastPoint) contractError('contract.monthlyTrend');
  const difference = lastPoint.people - firstPoint.people;
  const differenceLabel = `${difference > 0 ? '+' : difference < 0 ? '−' : ''}${integer.format(Math.abs(difference))}`;

  return {
    periodCountLabel: labelCount(points.length, 'período mensual', 'períodos mensuales'),
    rangeLabel: `${firstPoint.periodLabel} a ${lastPoint.periodLabel}`,
    startPeopleLabel: firstPoint.peopleLabel,
    endPeopleLabel: lastPoint.peopleLabel,
    changeLabel: `${differenceLabel} personas observadas entre extremos`,
    accessibleSummary: `Tendencia de ${points.length} meses. Comienza con ${firstPoint.peopleLabel} personas en ${firstPoint.periodLabel} y termina con ${lastPoint.peopleLabel} en ${lastPoint.periodLabel}.`,
    path,
    fillPath: `${path} L ${lastPoint.x} ${floorY} L ${firstPoint.x} ${floorY} Z`,
    points,
    guides,
  };
}

export function buildGardenNetworkViewModel(value: unknown): GardenNetworkViewModel {
  const contract = parseGardenNetworkContract(value);
  const officialLocationLimit = contract.limits.find(limit => limit.code === 'official_locations_not_available');
  if (!officialLocationLimit) contractError('contract.limits.official_locations_not_available');
  const futureGapCodes = new Set([
    'enrollment_not_available',
    'capacity_not_available',
    'attendance_not_available',
    'budget_not_available',
  ]);
  const futureGaps = contract.limits.filter(limit => futureGapCodes.has(limit.code));
  if (futureGaps.length !== futureGapCodes.size) contractError('contract.limits.futureDataGaps');
  const coreLimits = contract.limits.filter(limit =>
    limit.code !== officialLocationLimit.code && !futureGapCodes.has(limit.code));
  const maximumUnitPeople = Math.max(
    contract.protectedBucket.people,
    ...contract.releasedUnits.map(unit => unit.people),
  );

  return {
    source: {
      canonicalSystem: contract.source.canonicalSystem,
      snapshotLabel: date.format(new Date(`${contract.source.snapshotAsOf}T12:00:00Z`)),
      generatedLabel: dateTime.format(new Date(contract.generatedAt)),
      sourceFile: contract.source.sourceFile,
      sourceSha256: contract.source.sourceSha256,
      notice: 'Copia verificada del sistema fuente; no es una conexión en tiempo real.',
    },
    summary: {
      referencePeriodLabel: formatMonth(contract.referencePeriod.period),
      peopleLabel: integer.format(contract.summary.people),
      observedUnitsLabel: integer.format(contract.summary.observedUnitCount),
      releasedPeopleLabel: integer.format(contract.summary.releasedPeople),
      releasedUnitsLabel: integer.format(contract.summary.releasedUnitCount),
      protectedPeopleLabel: integer.format(contract.summary.protectedPeople),
      accessibleSummary: `${integer.format(contract.summary.people)} personas observadas en el cálculo de ${formatMonth(contract.referencePeriod.period)}. ${integer.format(contract.summary.releasedPeople)} se muestran en ${contract.summary.releasedUnitCount} unidades y ${integer.format(contract.summary.protectedPeople)} permanecen agrupadas para proteger datos pequeños.`,
    },
    trend: buildTrend(contract),
    units: {
      released: contract.releasedUnits.map(unit => ({
        label: unit.label,
        peopleLabel: integer.format(unit.people),
        shareLabel: `${percentage.format(unit.sharePct)} % del total observado`,
        widthPct: Number((unit.people / maximumUnitPeople * 100).toFixed(2)),
      })),
      protected: {
        label: contract.protectedBucket.label,
        peopleLabel: integer.format(contract.protectedBucket.people),
        shareLabel: `${percentage.format(contract.protectedBucket.sharePct)} % del total observado`,
        widthPct: Number((contract.protectedBucket.people / maximumUnitPeople * 100).toFixed(2)),
      },
      accessibleSummary: `${contract.releasedUnits.length} unidades superan el umbral y se muestran por separado. El resto se conserva en un único grupo protegido de ${integer.format(contract.protectedBucket.people)} personas.`,
    },
    quality: {
      statusLabel: 'Cálculo reconciliado',
      latestValidPeriodLabel: formatMonth(contract.quality.latestValidCalculationPeriod),
      sourceEmploymentKeysLabel: integer.format(contract.quality.sourceEmploymentKeys),
      linkedEmploymentKeysLabel: integer.format(contract.quality.linkedEmploymentKeys),
      reconciliationLabel: 'Totales, unidades liberadas y grupo protegido concilian.',
    },
    methodology: [
      {
        label: 'Qué se cuenta',
        value: 'Personas distintas observadas en cada cálculo mensual.',
      },
      {
        label: 'Identidad estadística',
        value: 'IDPERSONA, deduplicado entre claves de empleo; el identificador no se publica.',
      },
      {
        label: 'Regla de privacidad',
        value: `Sólo se separan unidades con al menos ${contract.privacy.threshold} personas y se aplica supresión complementaria.`,
      },
      {
        label: 'Período de referencia',
        value: `${formatMonth(contract.referencePeriod.period)}, último cálculo válido disponible.`,
      },
      {
        label: 'Clasificación de unidades',
        value: `${contract.quality.assignmentPolicyVersion}; una etiqueta genérica nunca se interpreta como jardín.`,
      },
    ],
    mapReadiness: {
      title: 'Qué falta para mapear la red',
      description: officialLocationLimit.text,
    },
    dataGaps: {
      title: 'Datos que todavía no contiene esta fuente',
      items: futureGaps.map(limit => limit.text),
    },
    limits: coreLimits.map(limit => limit.text),
  };
}
