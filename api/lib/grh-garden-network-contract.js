export const GRH_GARDEN_NETWORK_SCHEMA_VERSION = 'grh-garden-network-v1';
export const GRH_GARDEN_NETWORK_ASSIGNMENT_POLICY_VERSION =
  'grh-garden-network-assignment-v1';
export const GRH_GARDEN_NETWORK_PRIVACY_THRESHOLD = 10;
export const GRH_GARDEN_NETWORK_GENERATED_AT = '2026-08-14T00:00:00.000Z';

export const GRH_GARDEN_NETWORK_LIMITS = Object.freeze([
  Object.freeze({
    code: 'historical_snapshot_not_realtime',
    text: 'La información corresponde al respaldo del 6 de agosto de 2026; no se actualiza en tiempo real.',
  }),
  Object.freeze({
    code: 'latest_complete_calculation_month',
    text: 'Agosto de 2026 estaba incompleto al corte; el último mes de cálculo comparable es julio de 2026.',
  }),
  Object.freeze({
    code: 'calculation_cohort_not_total_staff',
    text: 'La serie cuenta personas con registros de cálculo de la cohorte de Jardines Maternales; no representa por sí sola toda la dotación activa.',
  }),
  Object.freeze({
    code: 'person_grain_across_employments',
    text: 'Una persona se cuenta una sola vez aunque tenga más de una clave laboral en el mismo período.',
  }),
  Object.freeze({
    code: 'unit_assignment_from_calculation',
    text: 'La unidad surge de la asignación sectorial registrada en el cálculo del período y no reemplaza al organigrama formal.',
  }),
  Object.freeze({
    code: 'small_units_are_combined',
    text: 'Los jardines con menos de 10 personas y quienes no tienen una unidad específica se reúnen en un único grupo protegido.',
  }),
  Object.freeze({
    code: 'official_locations_not_available',
    text: 'La fuente no aporta domicilios ni geolocalización oficial de los jardines; esta versión no publica ni inventa un mapa.',
  }),
  Object.freeze({
    code: 'enrollment_not_available',
    text: 'La fuente no contiene matrícula de niñas y niños por jardín.',
  }),
  Object.freeze({
    code: 'capacity_not_available',
    text: 'La fuente no contiene capacidad habilitada ni vacantes por jardín.',
  }),
  Object.freeze({
    code: 'attendance_not_available',
    text: 'La fuente no contiene presentismo de niñas, niños ni personal por jardín.',
  }),
  Object.freeze({
    code: 'budget_not_available',
    text: 'La fuente no contiene presupuesto ni ejecución de gastos por jardín.',
  }),
]);

const TOP_LEVEL_KEYS = [
  'schemaVersion', 'generatedAt', 'source', 'privacy', 'grain', 'quality',
  'referencePeriod', 'summary', 'monthlyTrend', 'releasedUnits',
  'protectedBucket', 'limits',
];
const SOURCE_KEYS = [
  'canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf', 'realtime',
];
const PRIVACY_KEYS = [
  'status', 'threshold', 'aggregateOnly', 'containsPii',
  'personIdentifiersExported', 'employmentKeysExported', 'sourceCodesExported',
  'rawRowsExported', 'complementarySuppression',
];
const GRAIN_KEYS = ['entity', 'identityBasis', 'deduplication'];
const QUALITY_KEYS = [
  'status', 'assignmentPolicyVersion', 'latestValidCalculationPeriod', 'sourceEmploymentKeys',
  'linkedEmploymentKeys', 'people', 'observedUnitCount', 'releasedUnitCount',
  'reconciliationOk',
];
const REFERENCE_PERIOD_KEYS = ['period', 'label', 'status'];
const SUMMARY_KEYS = [
  'people', 'releasedPeople', 'protectedPeople', 'releasedUnitCount',
  'observedUnitCount',
];
const TREND_KEYS = ['period', 'label', 'people'];
const UNIT_KEYS = ['label', 'people', 'sharePct'];
const BUCKET_KEYS = ['label', 'people', 'sharePct', 'privacyStatus'];
const LIMIT_KEYS = ['code', 'text'];
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PERIOD_PATTERN = /^20\d{2}-(?:0[1-9]|1[0-2])$/;
const FORBIDDEN_KEYS = /^(?:idpersona|personId|employeeId|legajo|companyCode|sectorCode|unitCode|sourceCode|assignedPeople|unassignedPeople|dni|cuil|salary|amount|importe|rows?)$/i;
const MONTH_LABELS = Object.freeze([
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]);
const CANONICAL_TREND = Object.freeze([
  ['2024-08', 90], ['2024-09', 91], ['2024-10', 92], ['2024-11', 90],
  ['2024-12', 90], ['2025-01', 90], ['2025-02', 92], ['2025-03', 91],
  ['2025-04', 105], ['2025-05', 107], ['2025-06', 107], ['2025-07', 105],
  ['2025-08', 105], ['2025-09', 106], ['2025-10', 107], ['2025-11', 106],
  ['2025-12', 105], ['2026-01', 106], ['2026-02', 106], ['2026-03', 108],
  ['2026-04', 108], ['2026-05', 109], ['2026-06', 109], ['2026-07', 107],
].map(Object.freeze));
const CANONICAL_RELEASED_UNITS = Object.freeze([
  Object.freeze({ label: 'Amanecer', people: 12 }),
  Object.freeze({ label: 'Manitos de Colores', people: 12 }),
  Object.freeze({ label: 'Del Sol', people: 11 }),
  Object.freeze({ label: 'Pata Garabata', people: 10 }),
]);

function record(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected) {
  if (!record(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index]);
}

function safeLabel(value, maximum = 160) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function sharePct(people, total) {
  return total === 0 ? 0 : Number(((people / total) * 100).toFixed(1));
}

function periodLabel(period) {
  if (!PERIOD_PATTERN.test(period || '')) return null;
  const [year, month] = period.split('-').map(Number);
  return `${MONTH_LABELS[month - 1]} ${year}`;
}

function forbiddenKeyPaths(value, path = '', seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  const paths = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_KEYS.test(key)) paths.push(childPath);
    paths.push(...forbiddenKeyPaths(child, childPath, seen));
  }
  return paths;
}

function add(errors, condition, path) {
  if (!condition) errors.push(path);
}

function validateSource(value, errors) {
  add(errors, exactKeys(value, SOURCE_KEYS), 'source.shape');
  add(errors, value?.canonicalSystem === 'GRH Junín', 'source.canonicalSystem');
  add(errors,
    value?.sourceFile === 'grh_junin.backup_2026080615_plataforma.sql.gz',
    'source.sourceFile');
  add(errors, SHA256_PATTERN.test(value?.sourceSha256 || ''), 'source.sourceSha256');
  add(errors, value?.snapshotAsOf === '2026-08-06', 'source.snapshotAsOf');
  add(errors, value?.realtime === false, 'source.realtime');
}

function validatePrivacy(value, errors) {
  add(errors, exactKeys(value, PRIVACY_KEYS), 'privacy.shape');
  add(errors, value?.status === 'released_with_protected_bucket', 'privacy.status');
  add(errors, value?.threshold === GRH_GARDEN_NETWORK_PRIVACY_THRESHOLD, 'privacy.threshold');
  add(errors, value?.aggregateOnly === true, 'privacy.aggregateOnly');
  for (const key of [
    'containsPii', 'personIdentifiersExported', 'employmentKeysExported',
    'sourceCodesExported', 'rawRowsExported',
  ]) add(errors, value?.[key] === false, `privacy.${key}`);
  add(errors, value?.complementarySuppression === true, 'privacy.complementarySuppression');
}

function validateGrain(value, errors) {
  add(errors, exactKeys(value, GRAIN_KEYS), 'grain.shape');
  add(errors, value?.entity === 'person', 'grain.entity');
  add(errors, value?.identityBasis === 'legajo.IDPERSONA', 'grain.identityBasis');
  add(errors,
    value?.deduplication === 'distinct_person_across_employment_keys',
    'grain.deduplication');
}

function validateQuality(value, errors) {
  add(errors, exactKeys(value, QUALITY_KEYS), 'quality.shape');
  add(errors, value?.status === 'reconciled', 'quality.status');
  add(errors,
    value?.assignmentPolicyVersion === GRH_GARDEN_NETWORK_ASSIGNMENT_POLICY_VERSION,
    'quality.assignmentPolicyVersion');
  add(errors, value?.latestValidCalculationPeriod === '2026-07', 'quality.latestPeriod');
  for (const key of [
    'sourceEmploymentKeys', 'linkedEmploymentKeys', 'people',
    'observedUnitCount', 'releasedUnitCount',
  ]) {
    add(errors, nonNegativeInteger(value?.[key]), `quality.${key}`);
  }
  add(errors, value?.sourceEmploymentKeys === 165, 'quality.sourceEmploymentKeys.canonical');
  add(errors, value?.linkedEmploymentKeys === value?.sourceEmploymentKeys, 'quality.linkedEmploymentKeys');
  add(errors, value?.people === 107, 'quality.people.canonical');
  add(errors, value?.observedUnitCount === 16, 'quality.observedUnitCount.canonical');
  add(errors, value?.releasedUnitCount === 4, 'quality.releasedUnitCount.canonical');
  add(errors, value?.releasedUnitCount <= value?.observedUnitCount, 'quality.unitCount');
  add(errors, value?.reconciliationOk === true, 'quality.reconciliationOk');
}

function validateSummary(value, quality, errors) {
  add(errors, exactKeys(value, SUMMARY_KEYS), 'summary.shape');
  for (const key of SUMMARY_KEYS) add(errors, nonNegativeInteger(value?.[key]), `summary.${key}`);
  add(errors, value?.people === quality?.people, 'summary.people.quality');
  add(errors, value?.releasedUnitCount === quality?.releasedUnitCount, 'summary.releasedUnits.quality');
  add(errors, value?.observedUnitCount === quality?.observedUnitCount, 'summary.observedUnits.quality');
  add(errors, value?.releasedPeople + value?.protectedPeople === value?.people, 'summary.privacy');
  add(errors, value?.releasedPeople === 45, 'summary.releasedPeople.canonical');
  add(errors, value?.protectedPeople === 62, 'summary.protectedPeople.canonical');
}

function validateTrend(value, summary, errors) {
  add(errors, Array.isArray(value), 'monthlyTrend.array');
  if (!Array.isArray(value)) return;
  add(errors, value.length === CANONICAL_TREND.length, 'monthlyTrend.length');
  value.forEach((row, index) => {
    const expected = CANONICAL_TREND[index];
    add(errors, exactKeys(row, TREND_KEYS), `monthlyTrend.${index}.shape`);
    add(errors, row?.period === expected?.[0], `monthlyTrend.${index}.period`);
    add(errors, row?.label === periodLabel(row?.period), `monthlyTrend.${index}.label`);
    add(errors, nonNegativeInteger(row?.people), `monthlyTrend.${index}.people`);
    add(errors, row?.people === expected?.[1], `monthlyTrend.${index}.canonical`);
  });
  add(errors, value.at(-1)?.people === summary?.people, 'monthlyTrend.latest.people');
}

function validateReleasedUnits(value, summary, errors) {
  add(errors, Array.isArray(value), 'releasedUnits.array');
  if (!Array.isArray(value)) return;
  add(errors, value.length === CANONICAL_RELEASED_UNITS.length, 'releasedUnits.length');
  let people = 0;
  value.forEach((row, index) => {
    const expected = CANONICAL_RELEASED_UNITS[index];
    add(errors, exactKeys(row, UNIT_KEYS), `releasedUnits.${index}.shape`);
    add(errors, row?.label === expected?.label, `releasedUnits.${index}.label`);
    add(errors,
      row?.people === expected?.people && row?.people >= GRH_GARDEN_NETWORK_PRIVACY_THRESHOLD,
      `releasedUnits.${index}.people`);
    add(errors,
      row?.sharePct === sharePct(row?.people, summary?.people),
      `releasedUnits.${index}.sharePct`);
    if (nonNegativeInteger(row?.people)) people += row.people;
  });
  add(errors, people === summary?.releasedPeople, 'releasedUnits.reconciliation');
}

function validateProtectedBucket(value, summary, errors) {
  add(errors, exactKeys(value, BUCKET_KEYS), 'protectedBucket.shape');
  add(errors,
    value?.label === 'Otros jardines y sin unidad específica',
    'protectedBucket.label');
  add(errors, value?.people === summary?.protectedPeople, 'protectedBucket.people');
  add(errors,
    value?.sharePct === sharePct(value?.people, summary?.people),
    'protectedBucket.sharePct');
  add(errors, value?.privacyStatus === 'protected_aggregate', 'protectedBucket.privacyStatus');
}

function validateLimits(value, errors) {
  add(errors, Array.isArray(value), 'limits.array');
  if (!Array.isArray(value)) return;
  add(errors, value.length === GRH_GARDEN_NETWORK_LIMITS.length, 'limits.length');
  value.forEach((limit, index) => {
    add(errors, exactKeys(limit, LIMIT_KEYS), `limits.${index}.shape`);
    add(errors,
      JSON.stringify(limit) === JSON.stringify(GRH_GARDEN_NETWORK_LIMITS[index]),
      `limits.${index}.allowlist`);
  });
}

export function inspectGrhGardenNetworkContract(value, {
  expectedSourceSha256 = null,
} = {}) {
  const errors = [];
  add(errors, exactKeys(value, TOP_LEVEL_KEYS), 'contract.shape');
  add(errors,
    value?.schemaVersion === GRH_GARDEN_NETWORK_SCHEMA_VERSION,
    'contract.schemaVersion');
  add(errors, value?.generatedAt === GRH_GARDEN_NETWORK_GENERATED_AT, 'contract.generatedAt');
  validateSource(value?.source, errors);
  validatePrivacy(value?.privacy, errors);
  validateGrain(value?.grain, errors);
  validateQuality(value?.quality, errors);
  add(errors, exactKeys(value?.referencePeriod, REFERENCE_PERIOD_KEYS), 'referencePeriod.shape');
  add(errors, value?.referencePeriod?.period === '2026-07', 'referencePeriod.period');
  add(errors, value?.referencePeriod?.label === 'Julio 2026', 'referencePeriod.label');
  add(errors,
    value?.referencePeriod?.status === 'latest_valid_calculation',
    'referencePeriod.status');
  add(errors,
    value?.quality?.latestValidCalculationPeriod === value?.referencePeriod?.period,
    'referencePeriod.quality');
  validateSummary(value?.summary, value?.quality, errors);
  validateTrend(value?.monthlyTrend, value?.summary, errors);
  validateReleasedUnits(value?.releasedUnits, value?.summary, errors);
  validateProtectedBucket(value?.protectedBucket, value?.summary, errors);
  validateLimits(value?.limits, errors);
  add(errors,
    expectedSourceSha256 === null ||
      (SHA256_PATTERN.test(expectedSourceSha256) && value?.source?.sourceSha256 === expectedSourceSha256),
    'source.expectedSha256');
  for (const path of forbiddenKeyPaths(value)) errors.push(`pii_key.${path}`);
  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze([...new Set(errors)]),
  });
}
