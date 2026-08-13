import { describe, expect, it } from 'vitest';

import { createOrganizationAnalyticsContract } from './organization-analytics-test-fixture';
import type { OrganizationAnalyticsContract } from './organization-analytics-types';
import { buildOrganizationAnalyticsViewModel } from './organization-analytics-view-model';

describe('organization analytics view model', () => {
  it('keeps registry, payroll and historical activity as distinct universes', () => {
    const viewModel = buildOrganizationAnalyticsViewModel(createOrganizationAnalyticsContract());

    expect(viewModel.kpis.map(kpi => kpi.key)).toEqual([
      'registeredRecords',
      'payrollParticipants',
      'organizationCoverage',
      'sectorCoverage',
      'recordsWithAbsenceHistory',
      'latestMovementParticipants',
    ]);
    expect(viewModel.kpis.map(kpi => kpi.value)).toEqual([
      '100', '90', '80,0%', '70,0%', '20', '30',
    ]);
    expect(viewModel.workforce.sector.denominator).toBe(90);
    expect(viewModel.registries[0]?.denominatorRecords).toBe(80);
    expect(viewModel.absenceRanking.reduce((total, row) => total + row.registeredRecords, 0)).toBe(100);
  });

  it('builds complete, zero-based rankings without dropping the protected aggregate', () => {
    const viewModel = buildOrganizationAnalyticsViewModel(createOrganizationAnalyticsContract());

    expect(viewModel.workforce.agreement.rows).toHaveLength(2);
    expect(viewModel.workforce.agreement.protectedParticipants).toBe(20);
    expect(viewModel.workforce.agreement.rows[1]).toMatchObject({
      label: 'Otros grupos protegidos',
      participants: 20,
      sharePct: 22.2222,
      privacyStatus: 'protected_aggregate',
    });
    expect(viewModel.registries[0]?.rows.reduce((sum, row) => sum + row.registeredRecords, 0)).toBe(80);
    expect(viewModel.registries[0]).toMatchObject({
      categoryCount: 2,
      releasedCategoryCount: 2,
      protectedCategoryCount: 0,
    });
    expect(viewModel.registries[0]?.rows[0]).toMatchObject({ code: 101, label: 'Servicios Urbanos' });
    expect(viewModel.workforce.sector.rows[0]).toMatchObject({
      companyCode: 101,
      sourceCode: 11,
      label: 'Servicios Públicos',
    });
    expect(viewModel.workforce.sector.rows.at(-1)).toMatchObject({
      companyCode: null,
      sourceCode: null,
      label: 'Otros grupos protegidos',
      privacyStatus: 'protected_aggregate',
    });
    expect(viewModel.absenceRanking[0]).toMatchObject({
      organizationCode: 101,
      eventsPerRegisteredRecord: 1,
      eventIntensityLabel: '1,0 eventos por registro',
      absencePrivacyStatus: 'released',
    });
  });

  it('prepares event and participant scales independently for both activity domains', () => {
    const viewModel = buildOrganizationAnalyticsViewModel(createOrganizationAnalyticsContract());
    const absence = viewModel.activity.find(domain => domain.key === 'absence');
    const movements = viewModel.activity.find(domain => domain.key === 'movements');

    expect(absence).toMatchObject({ maxEvents: 100, maxParticipants: 25, releasedPeriods: 2 });
    expect(movements).toMatchObject({ maxEvents: 90, maxParticipants: 30, releasedPeriods: 2 });
    expect(movements?.points[1]).toMatchObject({
      period: '2025',
      eventLabel: '90',
      participantLabel: '30',
    });
  });

  it('keeps source codes when different categories share the same label', () => {
    const candidate = structuredClone(createOrganizationAnalyticsContract()) as unknown as {
      organizations: { rows: Array<{ code: number | null; label: string }> };
      absenceRanking: { rows: Array<{ code: number | null; label: string }> };
    };
    candidate.organizations.rows[0]!.label = 'Etiqueta repetida';
    candidate.organizations.rows[1]!.label = 'Etiqueta repetida';
    candidate.absenceRanking.rows[0]!.label = 'Etiqueta repetida';
    candidate.absenceRanking.rows[1]!.label = 'Etiqueta repetida';

    const viewModel = buildOrganizationAnalyticsViewModel(
      candidate as unknown as OrganizationAnalyticsContract,
    );

    expect(viewModel.registries[0]?.rows.map(row => [row.label, row.code])).toEqual([
      ['Etiqueta repetida', 101],
      ['Etiqueta repetida', 202],
    ]);
    expect(viewModel.absenceRanking.map(row => [row.label, row.organizationCode])).toEqual([
      ['Etiqueta repetida', 101],
      ['Etiqueta repetida', 202],
    ]);
  });

  it('does not claim a latest movement year when an unknown protected period exists', () => {
    const candidate = structuredClone(createOrganizationAnalyticsContract()) as unknown as {
      activity: { movements: { series: Record<string, unknown>[] } };
    };
    candidate.activity.movements.series.push(
      {
        period: null,
        value: null,
        participantCount: null,
        participantDisplay: 'Protegido',
        privacyStatus: 'suppressed',
      },
      {
        period: null,
        value: null,
        participantCount: null,
        participantDisplay: 'Protegido',
        privacyStatus: 'suppressed',
      },
    );

    const viewModel = buildOrganizationAnalyticsViewModel(candidate as unknown as OrganizationAnalyticsContract);
    const kpi = viewModel.kpis.find(item => item.key === 'latestMovementParticipants');
    expect(kpi).toMatchObject({ value: 'Protegido', tone: 'amber' });
    expect(kpi?.note).toContain('no puede determinarse');
  });

  it('derives matrix labels and freezes the full view model', () => {
    const viewModel = buildOrganizationAnalyticsViewModel(createOrganizationAnalyticsContract());

    expect(viewModel.matrix.cells.map(cell => cell.level)).toEqual([4, 4, 2, 4]);
    expect(viewModel.matrix.cells[0]?.accessibleLabel).toContain('Servicios Urbanos · Servicios Públicos: 20');
    expect(Object.isFrozen(viewModel)).toBe(true);
    expect(Object.isFrozen(viewModel.activity[0]?.points)).toBe(true);
    expect(Object.isFrozen(viewModel.qualityFacts[0])).toBe(true);
  });

  it('rejects a contract that no longer satisfies the public shape', () => {
    const candidate = structuredClone(createOrganizationAnalyticsContract()) as unknown as {
      payrollCohort: { payrollParticipants: number };
    };
    candidate.payrollCohort.payrollParticipants = 89;

    expect(() => buildOrganizationAnalyticsViewModel(
      candidate as unknown as OrganizationAnalyticsContract,
    )).toThrowError('El contrato de dotación y ausencias fue rechazado.');
  });
});
