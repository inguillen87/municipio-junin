import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CostCenterFinanceBridgeError,
  loadCostCenterFinanceModel,
} from './workforce-finance-bridge';

const SOURCE: Readonly<{ canonicalSystem: string; sourceSha256: string; snapshotAsOf: string }> = Object.freeze({
  canonicalSystem: 'GRH Junin',
  sourceSha256: 'a'.repeat(64),
  snapshotAsOf: '2026-08-06',
});

function periods(): string[] {
  return Array.from({ length: 24 }, (_, index) => {
    const absoluteMonth = 2024 * 12 + 7 + index;
    return `${Math.floor(absoluteMonth / 12)}-${String(absoluteMonth % 12 + 1).padStart(2, '0')}`;
  });
}

function components(seed: number) {
  return {
    grossWithFamilyAllowancesCents: seed + 800,
    contributoryEarningsCents: seed + 600,
    nonContributoryEarningsCents: seed + 100,
    familyAllowancesCents: seed + 100,
    employeeWithholdingsCents: seed + 200,
    netPayrollCents: seed + 600,
    netToPayCents: seed + 600,
    employerContributionsCents: seed + 150,
  };
}

function cell(companyCode = 101, sourceCode = 2, label = 'SERVICIOS PUBLICOS') {
  return {
    companyCode,
    sourceCode,
    label,
    allocationSharePct: 30.6229,
    privacyStatus: 'released',
    components: components(sourceCode * 1_000),
    change: {
      status: 'released',
      previousPeriod: '2026-06',
      netPayrollDeltaCents: 250,
      netPayrollDeltaPct: 1.25,
    },
  };
}

function payload() {
  const windowPeriods = periods();
  return {
    source: { ...SOURCE },
    metric: {
      presentationCurrency: 'ARS',
      presentationLocale: 'es-AR',
      status: 'calculation_control_not_bank_disbursement',
    },
    cohort: {
      firstPeriod: windowPeriods[0],
      lastPeriod: windowPeriods.at(-1),
      publishedWindowMonths: 24,
    },
    dimensionViews: [{
      dimension: 'costCenter',
      periods: windowPeriods.map((period, index) => ({
        period,
        cells: [
          cell(),
          index === 4
            ? { ...cell(101, 3, 'SECRETARIA DE GOBIERNO'), privacyStatus: 'protected_aggregate' }
            : cell(101, 3, 'SECRETARIA DE GOBIERNO'),
        ],
      })),
    }],
  };
}

function options(signal?: AbortSignal) {
  return {
    ...(signal ? { signal } : {}),
    timeoutMs: 12_000,
    expectedSource: SOURCE,
    expectedReferencePeriod: '2026-07',
  };
}

function installClient(load: ReturnType<typeof vi.fn>) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { MuniGrhWorkforceFinance: { load } },
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
  vi.restoreAllMocks();
});

describe('workforce finance bridge', () => {
  it('projects one immutable 24-month cost-center model and forwards request controls', async () => {
    const controller = new AbortController();
    const load = vi.fn().mockResolvedValue(payload());
    installClient(load);

    const model = await loadCostCenterFinanceModel(options(controller.signal));

    expect(load).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledWith({ signal: controller.signal, timeoutMs: 12_000 });
    expect(model.presentation).toEqual({
      currencyCode: 'ARS',
      locale: 'es-AR',
      firstPeriod: '2024-08',
      lastPeriod: '2026-07',
      windowMonths: 24,
      status: 'calculation_control_not_bank_disbursement',
    });
    expect(model.periods).toHaveLength(24);
    expect(model.periods[0]?.cells['101:2']?.components.netPayrollCents).toBe(2_600);
    expect(model.periods[4]?.cells['101:3']).toBeUndefined();
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.periods[0]?.cells)).toBe(true);
  });

  it.each([
    ['canonical source', (candidate: ReturnType<typeof payload>) => { candidate.source.canonicalSystem = 'Otro'; },
      'COST_CENTER_FINANCE_SOURCE_MISMATCH'],
    ['source hash', (candidate: ReturnType<typeof payload>) => { candidate.source.sourceSha256 = 'b'.repeat(64); },
      'COST_CENTER_FINANCE_SOURCE_MISMATCH'],
    ['reference period', (candidate: ReturnType<typeof payload>) => { candidate.cohort.lastPeriod = '2026-06'; },
      'COST_CENTER_FINANCE_REFERENCE_PERIOD_MISMATCH'],
    ['duplicate identity', (candidate: ReturnType<typeof payload>) => {
      candidate.dimensionViews[0]!.periods[0]!.cells.push(cell());
    }, 'COST_CENTER_FINANCE_IDENTITY_DUPLICATE'],
    ['non numeric identity', (candidate: ReturnType<typeof payload>) => {
      candidate.dimensionViews[0]!.periods[0]!.cells[0]!.sourceCode = 'two' as unknown as number;
    }, 'COST_CENTER_FINANCE_IDENTITY_INVALID'],
    ['short window', (candidate: ReturnType<typeof payload>) => {
      candidate.dimensionViews[0]!.periods.pop();
    }, 'COST_CENTER_FINANCE_PERIODS_INVALID'],
  ])('fails closed for %s drift', async (_name, mutate, code) => {
    const candidate = payload();
    mutate(candidate);
    installClient(vi.fn().mockResolvedValue(candidate));
    await expect(loadCostCenterFinanceModel(options())).rejects.toMatchObject({ code });
  });

  it('preserves the validated client failure without producing a partial model', async () => {
    const failure = new Error('upstream unavailable');
    installClient(vi.fn().mockRejectedValue(failure));
    await expect(loadCostCenterFinanceModel(options())).rejects.toBe(failure);
  });

  it('fails explicitly when the certified browser client is absent', async () => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    await expect(loadCostCenterFinanceModel(options())).rejects.toBeInstanceOf(CostCenterFinanceBridgeError);
  });
});
