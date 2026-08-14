import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { PayrollRunControlContract } from './payroll-run-control-types';
import { buildPayrollRunControlViewModel } from './payroll-run-control-view-model';

const contract = JSON.parse(readFileSync(
  new URL('../../../api/_data/grh-payroll-run-control.json', import.meta.url),
  'utf8',
)) as PayrollRunControlContract;

describe('payroll run control view model', () => {
  it('formats the canonical current-year and source coverage without changing meaning', () => {
    const viewModel = buildPayrollRunControlViewModel(contract);

    expect(viewModel.currentYear.title).toBe('Corridas 2026');
    expect(viewModel.currentYear.runHeaders).toBe('26');
    expect(viewModel.currentYear.headersWithCalculation).toBe('26');
    expect(viewModel.currentYear.headersWithCloseFlag).toBe('26');
    expect(viewModel.currentYear.allWithCalculation).toBe(true);
    expect(viewModel.currentYear.allWithCloseFlag).toBe(true);
    expect(viewModel.coverage.validHeaders).toBe('612');
    expect(viewModel.coverage.sourceHeaders).toBe('625');
    expect(viewModel.coverage.calculationJoin).toBe('100,00%');
    expect(viewModel.source.historicalRangeLabel).toContain('2008');
    expect(viewModel.source.historicalRangeLabel).toContain('2026');
  });

  it('preserves all periods, real date ranges and explicit missing controls', () => {
    const viewModel = buildPayrollRunControlViewModel(contract);

    expect(viewModel.monthly).toHaveLength(217);
    expect(viewModel.monthly[0]?.period).toBe('2008-01');
    expect(viewModel.monthly.at(-1)?.period).toBe('2026-07');
    expect(viewModel.monthly.at(-1)?.runHeaders).toBe(3);
    expect(viewModel.monthly.at(-1)?.completeObservedControls).toBe(true);
    expect(viewModel.monthly.some(row => row.dateRangeLabel.includes(' a '))).toBe(true);
    expect(viewModel.monthly.reduce((sum, row) => sum + row.headersWithoutCalculation, 0)).toBe(12);
    expect(viewModel.monthly.reduce((sum, row) => sum + row.headersWithoutCloseFlag, 0)).toBe(95);
  });

  it('keeps quarantine and technical logs aggregated and honestly labelled', () => {
    const viewModel = buildPayrollRunControlViewModel(contract);

    expect(viewModel.quarantine.attentionRequired).toBe(true);
    expect(viewModel.quarantine.runHeaders).toBe('13');
    expect(viewModel.quarantine.headersWithCalculation).toBe('11');
    expect(viewModel.quarantine.headersWithoutCalculation).toBe('2');
    expect(viewModel.quarantine.calculationRows).toBe('20.270');
    expect(viewModel.quarantine.reasons).toHaveLength(5);
    expect(viewModel.logCoverage.sourceRows).toBe('122');
    expect(viewModel.logCoverage.runKeys).toBe('1');
    expect(viewModel.logCoverage.joinCoverage).toBe('100,00%');
    expect(viewModel.limits.some(limit => /no acredita cierre contable/u.test(limit))).toBe(true);
  });
});
