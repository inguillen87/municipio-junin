import { describe, expect, it } from 'vitest';

import { validateExecutiveContract } from './executive-contract';
import { buildExecutiveViewModel } from './executive-view-model';
import type { ExecutiveContract } from './executive-types';

function releasedRanking(label: string) {
  return {
    threshold: 5,
    totalParticipants: 20,
    participantDisplay: '20',
    privacyStatus: 'released',
    rows: [{ companyCode: 1, sourceCode: 1, label, participants: 20, participantDisplay: '20', sharePct: 100, privacyStatus: 'released' }],
  };
}

function month(period: string, net: number) {
  return {
    period,
    participantCount: 20,
    participantDisplay: '20',
    privacyStatus: 'released',
    amounts: {
      grossWithFamilyAllowancesCents: net + 30_000,
      employeeWithholdingsCents: 20_000,
      netPayrollCents: net,
      employerContributionsCents: 10_000,
    },
  };
}

function suppressedMonth(period: string | null) {
  return {
    period,
    participantCount: null,
    participantDisplay: '<10',
    privacyStatus: 'suppressed',
    amounts: {
      grossWithFamilyAllowancesCents: null,
      employeeWithholdingsCents: null,
      netPayrollCents: null,
      employerContributionsCents: null,
    },
  };
}

function annual(period: string, value: number, participants: number) {
  return { period, value, participantCount: participants, participantDisplay: String(participants), privacyStatus: 'released' };
}

function createContract(): ExecutiveContract {
  const candidate: unknown = {
    schemaVersion: 'grh-executive-v2',
    policyVersion: 'grh-small-cell-v1',
    source: {
      canonicalSystem: 'GRH Junín',
      sourceFile: 'grh_junin.snapshot.sql.gz',
      sourceSha256: 'c'.repeat(64),
      snapshotAsOf: '2024-05-15',
      realtime: false,
    },
    privacy: {
      audience: 'interactive', interactiveThreshold: 5, sensitiveThreshold: 10,
      portableThreshold: 10, protectedBucketLabel: 'Otros (celdas protegidas)',
    },
    workforce: {
      definition: 'payroll participation, not a contractual active-status master',
      referencePeriod: '2024-04',
      payrollParticipants: 20,
      bySector: {
        threshold: 5,
        totalParticipants: 20,
        participantDisplay: '20',
        privacyStatus: 'partially_suppressed',
        rows: [
          { companyCode: 1, sourceCode: 10, label: 'Servicios', participants: 12, participantDisplay: '12', sharePct: 60, privacyStatus: 'released' },
          { companyCode: null, sourceCode: null, label: 'Otros (celdas protegidas)', participants: 8, participantDisplay: '8', sharePct: 40, privacyStatus: 'protected_aggregate' },
        ],
      },
      byCostCenter: releasedRanking('Centro principal'),
      byAgreement: releasedRanking('Convenio general'),
    },
    compensation: {
      currency: 'not_declared_in_source',
      amountUnit: 'source_currency_cents',
      metricStatus: 'calculation_control_not_bank_disbursement',
      series: [month('2024-01', 100_000), suppressedMonth('2024-02'), month('2024-03', 150_000), month('2024-04', 180_000)],
    },
    absence: {
      sourceTable: 'ausencia', metric: 'valid_rows_by_year',
      series: [annual('2022', 40, 12), annual('2023', 50, 15), annual('2024', 20, 10)],
    },
    leave: { sourceTable: 'licencia', metric: 'valid_rows_by_year', series: [annual('2009', 25, 11)] },
    movements: {
      sourceTable: 'legamov', metric: 'valid_rows_by_year',
      series: [annual('2023', 150, 18), annual('2024', 180, 20)],
    },
  };
  if (!validateExecutiveContract(candidate)) throw new Error('Invalid executive view-model fixture');
  return candidate;
}

function validClone(mutator: (candidate: Record<string, unknown>) => void): ExecutiveContract {
  const candidate = structuredClone(createContract()) as unknown as Record<string, unknown>;
  mutator(candidate);
  if (!validateExecutiveContract(candidate)) throw new Error('Mutation must preserve the executive contract');
  return candidate;
}

describe('buildExecutiveViewModel', () => {
  it('derives exactly five honest KPIs and preserves protected payroll gaps', () => {
    const model = buildExecutiveViewModel(createContract());
    const kpis = Object.fromEntries(model.kpis.map((kpi) => [kpi.key, kpi]));

    expect(model.kpis.map((kpi) => kpi.key)).toEqual([
      'payrollParticipants',
      'latestPayrollControl',
      'sectorCoverage',
      'lastCompleteAbsence',
      'publishedMovements',
    ]);
    expect(kpis.payrollParticipants?.value).toBe('20');
    expect(kpis.latestPayrollControl?.value).toBe('1.800,00 u. fuente');
    expect(kpis.sectorCoverage?.value).toBe('60,0%');
    expect(kpis.lastCompleteAbsence?.value).toBe('50');
    expect(kpis.lastCompleteAbsence?.note).toMatch(/no una tasa/i);
    expect(kpis.publishedMovements?.value).toBe('330');
    expect(kpis.latestPayrollControl?.note).toMatch(/no equivale a pago bancario/i);

    expect(model.payroll.points).toHaveLength(4);
    expect(model.payroll.points[1]).toMatchObject({
      period: '2024-02',
      privacyStatus: 'suppressed',
      valueSourceUnits: null,
      valueLabel: 'No publicable',
      changePct: null,
      changeStatus: 'protected_current',
    });
    expect(model.payroll.points[2]).toMatchObject({ changePct: null, changeStatus: 'protected_previous' });
    expect(model.payroll.points[3]?.changePct).toBeCloseTo(0.2, 12);
    expect(model.payroll.points[3]?.changeStatus).toBe('available');
    expect(model.payroll.warning).toMatch(/nunca se imputan como cero/i);
    expect(model.sector.protectedParticipants).toBe(8);
    expect(model.annual.map((domain) => domain.key)).toEqual(['absence', 'leave', 'movements']);
    expect(model.annual[1]?.note).toMatch(/termina en 2009/i);
    expect(model.privacy.note).toMatch(/fuente cruda/i);
  });

  it('does not silently fall back when the latest known payroll period is suppressed', () => {
    const contract = validClone((candidate) => {
      const compensation = candidate.compensation as Record<string, unknown>;
      const series = compensation.series as unknown[];
      series.push(suppressedMonth('2024-05'));
    });
    const model = buildExecutiveViewModel(contract);
    const latest = model.kpis.find((kpi) => kpi.key === 'latestPayrollControl');

    expect(model.payroll.latestPeriod).toBe('2024-05');
    expect(model.payroll.latestStatus).toBe('protected');
    expect(latest).toMatchObject({ value: 'No publicable', status: 'protected' });
    expect(latest?.note).toMatch(/no se sustituye/i);
    expect(latest?.value).not.toContain('1.800');
  });

  it('calculates a delta only for immediate calendar months', () => {
    const contract = validClone((candidate) => {
      const compensation = candidate.compensation as Record<string, unknown>;
      compensation.series = [month('2024-01', 100_000), month('2024-03', 150_000)];
    });
    const model = buildExecutiveViewModel(contract);

    expect(model.payroll.points[1]).toMatchObject({
      period: '2024-03',
      changePct: null,
      changeLabel: 'No consecutivo',
      changeStatus: 'non_consecutive',
    });
  });

  it('fails the latest KPI closed when a protected period has no public date', () => {
    const contract = validClone((candidate) => {
      const compensation = candidate.compensation as Record<string, unknown>;
      const series = compensation.series as unknown[];
      series.push(suppressedMonth(null));
    });
    const model = buildExecutiveViewModel(contract);
    const latest = model.kpis.find((kpi) => kpi.key === 'latestPayrollControl');

    expect(model.payroll.latestPeriod).toBeNull();
    expect(model.payroll.latestStatus).toBe('protected');
    expect(latest?.value).toBe('No publicable');
    expect(latest?.note).toMatch(/no puede probarse/i);
  });

  it('never backfills a protected complete absence year or presents partial movements as an exact total', () => {
    const contract = validClone((candidate) => {
      const absence = candidate.absence as Record<string, unknown>;
      const absenceSeries = absence.series as unknown[];
      absenceSeries[1] = {
        period: '2023', value: null, participantCount: null,
        participantDisplay: '<10', privacyStatus: 'suppressed',
      };
      const movements = candidate.movements as Record<string, unknown>;
      const movementSeries = movements.series as unknown[];
      movementSeries.push({
        period: '2025', value: null, participantCount: null,
        participantDisplay: '<10', privacyStatus: 'suppressed',
      });
    });
    const model = buildExecutiveViewModel(contract);
    const absence = model.kpis.find((kpi) => kpi.key === 'lastCompleteAbsence');
    const movements = model.kpis.find((kpi) => kpi.key === 'publishedMovements');

    expect(absence).toMatchObject({ value: 'No publicable', status: 'protected' });
    expect(absence?.note).toMatch(/no se retrocede/i);
    expect(absence?.value).not.toBe('40');
    expect(movements).toMatchObject({ value: 'Lectura parcial', status: 'partial' });
    expect(movements?.note).toContain('330 eventos liberados');
  });

  it('returns an immutable projection and rejects callers that bypass the contract type', () => {
    const model = buildExecutiveViewModel(createContract());
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.kpis)).toBe(true);
    expect(Object.isFrozen(model.payroll.points[0])).toBe(true);
    expect(Object.isFrozen(model.sector.rows)).toBe(true);

    expect(() => buildExecutiveViewModel({ schemaVersion: 'grh-executive-v2' } as ExecutiveContract))
      .toThrow(expect.objectContaining({ code: 'GRH_EXECUTIVE_CONTRACT_INVALID', status: 502 }));
  });
});
