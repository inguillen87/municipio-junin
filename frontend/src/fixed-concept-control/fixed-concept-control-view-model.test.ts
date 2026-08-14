import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { FixedConceptControlContract } from './fixed-concept-control-types';
import { buildFixedConceptControlViewModel } from './fixed-concept-control-view-model';

const contract = JSON.parse(readFileSync(
  new URL('../../../api/_data/grh-fixed-concept-control.json', import.meta.url),
  'utf8',
)) as FixedConceptControlContract;

describe('fixed concept control view model', () => {
  it('builds the three-state reconciliation from the governed artifact', () => {
    const viewModel = buildFixedConceptControlViewModel(contract);

    expect(viewModel.reconciliation.states.map(state => state.rows)).toEqual([94, 19, 78]);
    expect(viewModel.reconciliation.states.map(state => state.rowsLabel)).toEqual(['94', '19', '78']);
    expect(viewModel.reconciliation.states.reduce((sum, state) => sum + state.widthPct, 0)).toBeCloseTo(100);
    expect(viewModel.reconciliation.eligibleRowsLabel).toBe('191');
    expect(viewModel.reconciliation.eligiblePeopleLabel).toBe('185');
    expect(viewModel.reconciliation.exactObservationRateLabel).toBe('49,21%');
  });

  it('keeps snapshot categories protected and never exposes source keys or amounts', () => {
    const viewModel = buildFixedConceptControlViewModel(contract);

    expect(viewModel.snapshot.eligibleRowsLabel).toBe('193');
    expect(viewModel.snapshot.eligiblePeopleLabel).toBe('187');
    expect(viewModel.snapshot.categories).toHaveLength(3);
    expect(viewModel.snapshot.categories.at(-1)?.protected).toBe(true);
    expect(viewModel.snapshot.legalInstrumentLabel).toBe('0');
    expect(JSON.stringify(viewModel)).not.toContain('FIJO_ID');
    expect(JSON.stringify(viewModel)).not.toMatch(/monetaryAmounts|legalInstrumentValues/u);
  });

  it('preserves equal comparison windows and honest quality caveats', () => {
    const viewModel = buildFixedConceptControlViewModel(contract);

    expect(viewModel.comparison.windows.map(window => window.daysLabel)).toEqual(['972 días', '972 días']);
    expect(viewModel.comparison.windows.map(window => window.startRowsLabel)).toEqual(['60', '423']);
    expect(viewModel.comparison.differenceRowsLabel).toBe('−363');
    expect(viewModel.comparison.interpretation).toMatch(/no son altas laborales/u);
    expect(viewModel.quality.signals).toHaveLength(4);
    expect(viewModel.limits.some(limit => /no evalúan gestiones/u.test(limit))).toBe(true);
  });
});
