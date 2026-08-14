import { describe, expect, it } from 'vitest';

import { buildEmploymentActionsViewModel } from './employment-actions-view-model';
import type { EmploymentActionsContract } from './employment-actions-types';

function fixture(): EmploymentActionsContract {
  return {
    schemaVersion: 'grh-employment-actions-v1',
    source: {
      canonicalSystem: 'GRH Junín',
      sourceFile: 'grh_junin.backup_2026080615_plataforma.sql.gz',
      sourceSha256: 'a'.repeat(64),
      snapshotAsOf: '2026-08-06',
      generatedAt: '2026-08-13T00:00:00.000Z',
      realtime: false,
      tables: { actions: 'foja', employment: 'legajo' },
      firstValidDate: '1979-01-01',
      lastValidDate: '2026-08-05',
    },
    privacy: {
      threshold: 10,
      rule: 'protect_category_when_current_prior_or_absolute_delta_is_1_to_9_and_apply_complementary_suppression',
      aggregateOnly: true,
      containsPii: false,
      personIdentifiersExported: false,
      rawRowsExported: false,
      instrumentValuesExported: false,
      observationsExported: false,
      userValuesExported: false,
      rawCategoryValuesExported: false,
    },
    metric: {
      eventUnit: 'actuación documentada en GRH.foja',
      participantUnit: 'persona GRH distinta enlazada por legajo con al menos una actuación',
      effectiveDateMeaning: 'reported_effective_date',
      comparisonRule: 'equal_972_day_windows',
      classificationRuleVersion: 'grh-foja-action-codes-v1',
    },
    coverage: {
      sourceRows: 9481,
      validRows: 9481,
      quarantineRows: 0,
      matchedRows: 9481,
      orphanRows: 0,
      distinctEmployeeKeys: 1302,
      validDateRatePct: 100,
      joinIntegrityPct: 100,
    },
    periods: {
      current: { label: 'Gestión actual hasta el corte', startDate: '2023-12-09', endDate: '2026-08-06', days: 972 },
      prior: { label: 'Mismo tiempo de la gestión anterior', startDate: '2019-12-09', endDate: '2022-08-06', days: 972 },
    },
    comparison: {
      current: { privacyStatus: 'released', actionEvents: 3882, distinctPersons: 714, actionsPerPerson: 5.437, instrumentTypePresent: 3882, instrumentNumberPresent: 3880, sourceCategoryPresent: 3881, documentCodePresent: 3698 },
      prior: { privacyStatus: 'released', actionEvents: 3226, distinctPersons: 631, actionsPerPerson: 5.1125, instrumentTypePresent: 3226, instrumentNumberPresent: 3180, sourceCategoryPresent: 3226, documentCodePresent: 3057 },
      deltas: { actionEvents: 656, distinctPersons: 83, actionsPerPerson: 0.3245, instrumentTypePresent: 656, instrumentNumberPresent: 700, sourceCategoryPresent: 655, documentCodePresent: 641 },
    },
    categories: [
      { key: 'workplace', label: 'Lugar de trabajo', meaning: 'Actuación sobre el lugar de trabajo informado.', privacyStatus: 'released', current: { events: 365, persons: 299 }, prior: { events: 148, persons: 141 }, deltas: { events: 217, persons: 158 } },
      { key: 'small', label: 'Categoría pequeña', meaning: 'Categoría protegida.', privacyStatus: 'protected', current: { events: null, persons: null }, prior: { events: null, persons: null }, deltas: { events: null, persons: null } },
    ],
    protectedBucket: { privacyStatus: 'protected', label: 'Otras actuaciones protegidas', categoryCount: 9, current: { events: 135, persons: 101 }, prior: { events: 179, persons: 135 }, deltas: { events: -44, persons: -34 } },
    classification: { status: 'exhaustive_governed_mapping', ruleVersion: 'grh-foja-action-codes-v1', categoryCount: 22, releasedCategoryCount: 13, protectedCategoryCount: 9, totalWindowEvents: 7108, classifiedWindowEvents: 7108, coveragePct: 100 },
    limits: [{ code: 'not_unique_change', text: 'Una actuación es un registro; no prueba un cambio único ni vigente.' }],
  };
}

describe('employment actions view model', () => {
  it('renders equal windows, source-backed metrics and protected rows without inventing zero', () => {
    const contract = fixture();
    const viewModel = buildEmploymentActionsViewModel(contract);
    expect(viewModel.comparison.currentEvents).toBe('3.882');
    expect(viewModel.comparison.priorEvents).toBe('3.226');
    expect(viewModel.comparison.eventDelta).toBe('+656');
    expect(viewModel.comparison.currentPersons).toBe('714');
    expect(viewModel.comparison.priorPersons).toBe('631');
    expect(viewModel.comparison.personsDelta).toBe('+83');
    expect(viewModel.periods.current.days).toBe(972);
    expect(viewModel.categories.find((category) => category.key === 'small')?.currentLabel).toBe('Grupo pequeño');
    expect(viewModel.protectedBucket?.currentLabel).toBe('135');
  });

  it('keeps the source-backed classification version and equal windows visible', () => {
    const contract = fixture();
    const viewModel = buildEmploymentActionsViewModel(contract);
    expect(contract.metric.classificationRuleVersion).toBe('grh-foja-action-codes-v1');
    expect(viewModel.periods.current.days).toBe(viewModel.periods.prior.days);
  });
});
