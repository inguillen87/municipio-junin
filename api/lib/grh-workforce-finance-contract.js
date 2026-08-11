import {
  GRH_WORKFORCE_FINANCE_POLICY_VERSION,
  GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION,
  computeGrhWorkforceFinanceReleaseId,
  inspectGrhWorkforceFinanceSourceContract,
} from './grh-workforce-finance-source-contract.js';

export const GRH_WORKFORCE_FINANCE_SCHEMA_VERSION = 'grh-workforce-finance-v1';

export const GRH_WORKFORCE_FINANCE_DIMENSIONS = Object.freeze([
  'sector',
  'costCenter',
  'agreement',
]);

export const GRH_WORKFORCE_FINANCE_COMPONENT_KEYS = Object.freeze([
  'grossWithFamilyAllowancesCents',
  'contributoryEarningsCents',
  'nonContributoryEarningsCents',
  'familyAllowancesCents',
  'employeeWithholdingsCents',
  'netPayrollCents',
  'netToPayCents',
  'employerContributionsCents',
]);

const TOP_KEYS = Object.freeze([
  'schemaVersion', 'policyVersion', 'releaseId', 'source', 'metric', 'cohort',
  'privacy', 'capabilities', 'periodTotals', 'dimensionViews', 'quality',
]);

const SOURCE_KEYS = Object.freeze([
  'canonicalSystem', 'sourceFile', 'sourceSha256', 'compressedSizeBytes',
  'snapshotAsOf', 'generatedAt', 'latestValidCalculationPeriod',
  'profileSchemaVersion', 'semanticSchemaVersion', 'realtime',
]);

const METRIC_KEYS = Object.freeze([
  'grain', 'sourceCurrencyStatus', 'amountUnit', 'presentationSchemaVersion',
  'presentationCurrency', 'presentationCurrencyBasis',
  'presentationCurrencyEffectiveOn', 'presentationLocale', 'status',
  'allocationBasis', 'allocationRule', 'interpretation',
]);

const DIMENSION_TO_SOURCE = Object.freeze({
  sector: 'sector',
  costCenter: 'cost_center',
  agreement: 'agreement',
});

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys) {
  if (!plainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function snakeKey(value) {
  return value.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function toSnake(value) {
  if (Array.isArray(value)) return value.map(toSnake);
  if (!plainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    snakeKey(key),
    toSnake(child),
  ]));
}

function mapDimensions(value) {
  if (Array.isArray(value)) {
    for (const child of value) mapDimensions(child);
    return;
  }
  if (!plainObject(value)) return;
  if (typeof value.dimension === 'string') {
    value.dimension = DIMENSION_TO_SOURCE[value.dimension] || value.dimension;
  }
  for (const child of Object.values(value)) mapDimensions(child);
}

function projectionToSource(value) {
  const raw = toSnake(value);
  raw.schema_version = GRH_WORKFORCE_FINANCE_SOURCE_SCHEMA_VERSION;
  raw.source.file = raw.source.source_file;
  raw.source.sha256 = raw.source.source_sha256;
  delete raw.source.source_file;
  delete raw.source.source_sha256;
  raw.metric = {
    grain: raw.metric.grain,
    currency: raw.metric.source_currency_status,
    amount_unit: raw.metric.amount_unit,
    status: raw.metric.status,
    allocation_basis: raw.metric.allocation_basis,
    allocation_rule: raw.metric.allocation_rule,
    interpretation: raw.metric.interpretation,
  };
  raw.cohort.one_way_dimensions = raw.cohort.one_way_dimensions.map(
    item => DIMENSION_TO_SOURCE[item] || item,
  );
  mapDimensions(raw.dimension_views);
  mapDimensions(raw.quality);
  return raw;
}

export function computeGrhWorkforceFinanceProjectionReleaseId(data) {
  return computeGrhWorkforceFinanceReleaseId(projectionToSource(data));
}

function add(errors, condition, code) {
  if (!condition) errors.push(code);
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

export function inspectGrhWorkforceFinanceContract(data) {
  const errors = [];
  add(errors, exactKeys(data, TOP_KEYS), 'projection.structure');
  add(errors, data?.schemaVersion === GRH_WORKFORCE_FINANCE_SCHEMA_VERSION,
    'schema.version');
  add(errors, data?.policyVersion === GRH_WORKFORCE_FINANCE_POLICY_VERSION,
    'policy.version');
  add(errors, exactKeys(data?.source, SOURCE_KEYS), 'source.structure');
  add(errors, exactKeys(data?.metric, METRIC_KEYS), 'metric.structure');
  add(errors, data?.metric?.sourceCurrencyStatus === 'not_declared_in_source',
    'metric.source_currency_status');
  add(errors, data?.metric?.presentationSchemaVersion === 'tenant-presentation-v1',
    'metric.presentation_schema');
  add(errors, /^[A-Z]{3}$/.test(data?.metric?.presentationCurrency || ''),
    'metric.presentation_currency');
  add(errors, data?.metric?.presentationCurrencyBasis === 'tenant_configuration',
    'metric.presentation_basis');
  add(errors, validDate(data?.metric?.presentationCurrencyEffectiveOn),
    'metric.presentation_effective_on');
  add(errors, /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(data?.metric?.presentationLocale || ''),
    'metric.presentation_locale');
  add(errors, Array.isArray(data?.dimensionViews) &&
    data.dimensionViews.length === GRH_WORKFORCE_FINANCE_DIMENSIONS.length &&
    data.dimensionViews.every((view, index) =>
      view?.dimension === GRH_WORKFORCE_FINANCE_DIMENSIONS[index]),
  'dimension_views.identity');

  if (errors.length === 0) {
    try {
      const sourceInspection = inspectGrhWorkforceFinanceSourceContract(
        projectionToSource(data),
      );
      errors.push(...sourceInspection.errors.map(code => `source_projection.${code}`));
    } catch {
      errors.push('source_projection.structure');
    }
  }

  const uniqueErrors = Object.freeze([...new Set(errors)]);
  return Object.freeze({ ok: uniqueErrors.length === 0, errors: uniqueErrors });
}

export function validateGrhWorkforceFinanceContract(data) {
  return inspectGrhWorkforceFinanceContract(data).ok;
}
