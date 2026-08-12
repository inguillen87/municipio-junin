const DEFAULT_TIMEOUT_MS = 15_000;
const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const COMPONENT_KEYS = [
  'grossWithFamilyAllowancesCents',
  'contributoryEarningsCents',
  'nonContributoryEarningsCents',
  'familyAllowancesCents',
  'employeeWithholdingsCents',
  'netPayrollCents',
  'netToPayCents',
  'employerContributionsCents',
] as const;

type ComponentKey = typeof COMPONENT_KEYS[number];

export type CostCenterFinanceComponents = Readonly<Record<ComponentKey, number>>;

export interface CostCenterFinanceChange {
  readonly status: 'released' | 'unavailable';
  readonly previousPeriod: string | null;
  readonly netPayrollDeltaCents: number | null;
  readonly netPayrollDeltaPct: number | null;
}

export interface CostCenterFinanceCell {
  readonly key: string;
  readonly companyCode: number;
  readonly sourceCode: number;
  readonly label: string;
  readonly allocationSharePct: number;
  readonly components: CostCenterFinanceComponents;
  readonly change: CostCenterFinanceChange;
}

export interface CostCenterFinancePeriod {
  readonly period: string;
  readonly cells: Readonly<Record<string, CostCenterFinanceCell>>;
}

export interface CostCenterFinanceModel {
  readonly presentation: {
    readonly currencyCode: string;
    readonly locale: string;
    readonly firstPeriod: string;
    readonly lastPeriod: string;
    readonly windowMonths: 24;
    readonly status: 'calculation_control_not_bank_disbursement';
  };
  readonly periods: readonly CostCenterFinancePeriod[];
}

export interface LoadCostCenterFinanceOptions {
  readonly signal?: AbortSignal | null;
  readonly timeoutMs?: number;
  readonly expectedSource: {
    readonly canonicalSystem: string;
    readonly sourceSha256: string;
    readonly snapshotAsOf: string;
  };
  readonly expectedReferencePeriod: string;
}

interface WorkforceFinanceClient {
  load(options: { signal?: AbortSignal; timeoutMs: number }): Promise<unknown>;
}

declare global {
  interface Window {
    MuniGrhWorkforceFinance?: WorkforceFinanceClient;
  }
}

export class CostCenterFinanceBridgeError extends Error {
  readonly code: string;

  constructor(code: string) {
    super('La comparacion financiera de areas no esta disponible.');
    this.name = 'CostCenterFinanceBridgeError';
    this.code = code;
  }
}

function fail(code: string): never {
  throw new CostCenterFinanceBridgeError(code);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactString(value: unknown, maximum = 180): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
    fail('COST_CENTER_FINANCE_MODEL_INVALID');
  }
  return value;
}

function safeInteger(value: unknown, { positive = false } = {}): number {
  if (!Number.isSafeInteger(value) || (value as number) < (positive ? 1 : 0)) {
    fail('COST_CENTER_FINANCE_IDENTITY_INVALID');
  }
  return value as number;
}

function finiteNumber(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail('COST_CENTER_FINANCE_MODEL_INVALID');
  }
  return value;
}

function nullableNumber(value: unknown): number | null {
  if (value === null) return null;
  return finiteNumber(value, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
}

function nextPeriod(period: string): string {
  const match = PERIOD_PATTERN.exec(period);
  if (!match) fail('COST_CENTER_FINANCE_PERIOD_INVALID');
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}

function identity(companyCode: number, sourceCode: number): string {
  return `${companyCode}:${sourceCode}`;
}

function components(value: unknown): CostCenterFinanceComponents {
  const source = record(value);
  if (!source) fail('COST_CENTER_FINANCE_MODEL_INVALID');
  const output = {} as Record<ComponentKey, number>;
  for (const key of COMPONENT_KEYS) output[key] = safeInteger(source[key]);
  return Object.freeze(output);
}

function change(value: unknown): CostCenterFinanceChange {
  const source = record(value);
  if (!source || (source.status !== 'released' && source.status !== 'unavailable')) {
    fail('COST_CENTER_FINANCE_MODEL_INVALID');
  }
  const previousPeriod = source.previousPeriod === null
    ? null
    : exactString(source.previousPeriod, 7);
  if (previousPeriod !== null && !PERIOD_PATTERN.test(previousPeriod)) {
    fail('COST_CENTER_FINANCE_PERIOD_INVALID');
  }
  return Object.freeze({
    status: source.status,
    previousPeriod,
    netPayrollDeltaCents: nullableNumber(source.netPayrollDeltaCents),
    netPayrollDeltaPct: nullableNumber(source.netPayrollDeltaPct),
  });
}

function projectCell(value: unknown): CostCenterFinanceCell | null {
  const source = record(value);
  if (!source) fail('COST_CENTER_FINANCE_MODEL_INVALID');
  if (source.privacyStatus !== 'released') return null;
  const companyCode = safeInteger(source.companyCode, { positive: true });
  const sourceCode = safeInteger(source.sourceCode);
  return Object.freeze({
    key: identity(companyCode, sourceCode),
    companyCode,
    sourceCode,
    label: exactString(source.label),
    allocationSharePct: finiteNumber(source.allocationSharePct, 0, 100),
    components: components(source.components),
    change: change(source.change),
  });
}

function projectPeriods(value: unknown): readonly CostCenterFinancePeriod[] {
  if (!Array.isArray(value) || value.length !== 24) fail('COST_CENTER_FINANCE_PERIODS_INVALID');
  const output: CostCenterFinancePeriod[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const source = record(value[index]);
    if (!source || typeof source.period !== 'string' || !PERIOD_PATTERN.test(source.period) ||
        !Array.isArray(source.cells)) fail('COST_CENTER_FINANCE_PERIOD_INVALID');
    if (index > 0 && nextPeriod(output[index - 1]!.period) !== source.period) {
      fail('COST_CENTER_FINANCE_PERIOD_INVALID');
    }
    const cells: Record<string, CostCenterFinanceCell> = {};
    for (const candidate of source.cells) {
      const cell = projectCell(candidate);
      if (!cell) continue;
      if (Object.hasOwn(cells, cell.key)) fail('COST_CENTER_FINANCE_IDENTITY_DUPLICATE');
      cells[cell.key] = cell;
    }
    output.push(Object.freeze({ period: source.period, cells: Object.freeze(cells) }));
  }
  return Object.freeze(output);
}

function projectModel(payload: unknown, options: LoadCostCenterFinanceOptions): CostCenterFinanceModel {
  const source = record(payload);
  const provenance = record(source?.source);
  const metric = record(source?.metric);
  const cohort = record(source?.cohort);
  if (!source || !provenance || !metric || !cohort || !Array.isArray(source.dimensionViews)) {
    fail('COST_CENTER_FINANCE_MODEL_INVALID');
  }
  const expected = options.expectedSource;
  if (!SHA256_PATTERN.test(expected.sourceSha256) ||
      provenance.canonicalSystem !== expected.canonicalSystem ||
      provenance.sourceSha256 !== expected.sourceSha256 ||
      provenance.snapshotAsOf !== expected.snapshotAsOf) {
    fail('COST_CENTER_FINANCE_SOURCE_MISMATCH');
  }
  if (!PERIOD_PATTERN.test(options.expectedReferencePeriod) ||
      cohort.lastPeriod !== options.expectedReferencePeriod ||
      cohort.publishedWindowMonths !== 24) {
    fail('COST_CENTER_FINANCE_REFERENCE_PERIOD_MISMATCH');
  }
  const views = source.dimensionViews.filter(candidate => record(candidate)?.dimension === 'costCenter');
  if (views.length !== 1) fail('COST_CENTER_FINANCE_DIMENSION_INVALID');
  const view = record(views[0]);
  const periods = projectPeriods(view?.periods);
  if (cohort.firstPeriod !== periods[0]?.period || cohort.lastPeriod !== periods.at(-1)?.period ||
      metric.status !== 'calculation_control_not_bank_disbursement') {
    fail('COST_CENTER_FINANCE_MODEL_INVALID');
  }
  const currencyCode = exactString(metric.presentationCurrency, 8);
  const locale = exactString(metric.presentationLocale, 24);
  return Object.freeze({
    presentation: Object.freeze({
      currencyCode,
      locale,
      firstPeriod: periods[0]!.period,
      lastPeriod: periods.at(-1)!.period,
      windowMonths: 24 as const,
      status: 'calculation_control_not_bank_disbursement' as const,
    }),
    periods,
  });
}

export async function loadCostCenterFinanceModel(
  options: LoadCostCenterFinanceOptions,
): Promise<CostCenterFinanceModel> {
  if (typeof window === 'undefined' || typeof window.MuniGrhWorkforceFinance?.load !== 'function') {
    fail('COST_CENTER_FINANCE_CLIENT_UNAVAILABLE');
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
    fail('COST_CENTER_FINANCE_OPTIONS_INVALID');
  }
  const requestOptions: { signal?: AbortSignal; timeoutMs: number } = { timeoutMs };
  if (options.signal) requestOptions.signal = options.signal;
  const payload = await window.MuniGrhWorkforceFinance.load(requestOptions);
  return projectModel(payload, options);
}
