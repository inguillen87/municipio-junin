import { describe, expect, it } from 'vitest';

import { validateQualityContract } from './quality-contract';
import { buildQualityViewModel } from './quality-view-model';
import type { QualityContract } from './quality-types';

function validContract(): QualityContract {
  const temporalDomain = (
    validRows: number,
    quarantineRows: number,
    validRatePct: number,
  ) => ({
    rows: 10,
    validRows,
    quarantineRows,
    validRatePct,
    validPeriods: 2,
    firstValidPeriod: '2024-01',
    lastValidPeriod: '2024-02',
    firstValidYear: 2024,
    lastValidYear: 2024,
    dateMonthMismatchRows: 0,
    quarantineReasonOccurrences: quarantineRows,
  });
  const fact = (matchedRows: number, orphanRows: number, rate: number) => ({
    rows: 10,
    matchedRows,
    orphanRows,
    joinIntegrityPct: rate,
    distinctEmployeeKeys: 10,
    validMatchedEmployeeKeys: matchedRows,
    employeeCoveragePct: rate,
  });
  const candidate: unknown = {
    schemaVersion: 'grh-quality-v1',
    source: {
      canonicalSystem: 'GRH Junín',
      sourceFile: 'grh_junin.snapshot.sql.gz',
      sourceSha256: 'b'.repeat(64),
      snapshotAsOf: '2024-02-29',
      compressedSizeBytes: 1_250_000,
      realtime: false,
      excludedSources: ['personas_junin'],
    },
    lineage: {
      profileSchemaVersion: 'grh-profile-v1',
      semanticSchemaVersion: 'grh-semantic-v2',
      profileGeneratedAt: '2024-03-01T12:00:00Z',
      semanticGeneratedAt: '2024-03-01T12:05:00-03:00',
    },
    privacy: {
      aggregateOnly: true,
      containsPii: false,
      employeeIdentifiersExported: false,
      rawRowsExported: false,
      categoricalLabelsExported: false,
      cellCodesExported: false,
      monetarySeriesExported: false,
    },
    inventory: {
      all: { totalTables: 3, nonEmptyTables: 2, emptyTables: 1, totalRows: 100 },
      focal: { totalTables: 2, nonEmptyTables: 2, emptyTables: 0, totalRows: 100 },
      remainder: { totalTables: 1, nonEmptyTables: 0, emptyTables: 1, totalRows: 0 },
    },
    quality: {
      score: 93.21,
      scope: 'governed_aggregate_extract_not_fitness_of_every_raw_grh_table',
      components: {
        temporalValidity: { score: 92, weightPct: 25 },
        referentialIntegrity: { score: 97.5, weightPct: 25 },
        payrollReconciliation: { score: 83.3333, weightPct: 25 },
        legajoKeyUniqueness: { score: 100, weightPct: 25 },
      },
      risks: {
        rawSourceContainsSensitivePii: true,
        historicalSnapshotNotRealtime: true,
        currencyNotDeclaredInSource: true,
        legacyImportErrorRows: 5,
        quarantinedTemporalRows: 4,
        totpagoCrossSourceMismatch: true,
        calculationControlAnomalousPeriods: 1,
        latestCalculationControlWithinRoundingTolerance: true,
        suspiciousTextEncodingLabelCount: 1,
      },
    },
    temporal: {
      rows: 50,
      validRows: 46,
      quarantineRows: 4,
      validRatePct: 92,
      dateMonthMismatchRows: 0,
      quarantineReasonOccurrences: 4,
      domains: {
        ausencia: temporalDomain(9, 1, 90),
        calculo: temporalDomain(8, 2, 80),
        legamov: temporalDomain(10, 0, 100),
        licencia: temporalDomain(9, 1, 90),
        totpago: temporalDomain(10, 0, 100),
      },
    },
    referential: {
      legajo: { rows: 10, uniqueKeys: 10, uniquenessPct: 100 },
      facts: {
        calculo: fact(10, 0, 100),
        legamov: fact(10, 0, 100),
        ausencia: fact(9, 1, 90),
        licencia: fact(10, 0, 100),
      },
    },
    reconciliation: {
      status: 'material_differences_detected',
      totpagoDiagnosticStatus: 'not_cross_source_reconciled',
      metricStatus: 'calculation_control_not_bank_disbursement',
      currencyStatus: 'not_declared_in_source',
      toleranceCents: 1,
      calculationRuns: 3,
      totpagoRuns: 3,
      unionRuns: 3,
      matchedRuns: 3,
      fullyReconciledRuns: 2,
      runCoveragePct: 100,
      metricExactRatePct: 80,
      valueAgreementPct: 70,
      scorePct: 83.3333,
      absoluteVarianceCents: 10,
    },
  };
  if (!validateQualityContract(candidate)) throw new Error('Invalid test fixture');
  return candidate;
}

function reconciledContract(): QualityContract {
  const base = validContract();
  const contract: QualityContract = {
    ...base,
    reconciliation: {
      ...base.reconciliation,
      status: 'reconciled',
      fullyReconciledRuns: 3,
      metricExactRatePct: 100,
      valueAgreementPct: 100,
      scorePct: 100,
      absoluteVarianceCents: 0,
    },
    quality: {
      ...base.quality,
      score: 97.38,
      components: {
        ...base.quality.components,
        payrollReconciliation: {
          ...base.quality.components.payrollReconciliation,
          score: 100,
        },
      },
      risks: {
        ...base.quality.risks,
        totpagoCrossSourceMismatch: false,
      },
    },
  };
  if (!validateQualityContract(contract)) throw new Error('Invalid reconciled test fixture');
  return contract;
}

describe('buildQualityViewModel', () => {
  it('ports the four executive KPIs and every ordered evidence collection', () => {
    const model = buildQualityViewModel(validContract());

    expect(model.kpis.map(({ key }) => key)).toEqual([
      'temporalValidity',
      'referential',
      'reconciliation',
      'quarantine',
    ]);
    expect(model.kpis.map(({ label }) => label)).toEqual([
      'Registros con fechas correctas',
      'Registros vinculados a legajos',
      'Liquidaciones que coinciden',
      'Registros pendientes de revisión',
    ]);
    expect(model.quality.components.map(({ key }) => key)).toEqual([
      'temporalValidity',
      'referentialIntegrity',
      'payrollReconciliation',
      'legajoKeyUniqueness',
    ]);
    expect(model.temporal.domains.map(({ key }) => key)).toEqual([
      'ausencia',
      'calculo',
      'legamov',
      'licencia',
      'totpago',
    ]);
    expect(model.coverage.rows.map(({ key }) => key)).toEqual([
      'calculo',
      'legamov',
      'ausencia',
      'licencia',
    ]);
    expect(model.lineage).toHaveLength(4);
    expect(model.risks.items).toHaveLength(8);
    expect(model.actions).toHaveLength(5);
  });

  it('derives displayed figures from the contract and preserves the truth qualifiers', () => {
    const contract = validContract();
    const model = buildQualityViewModel(contract);
    const kpis = Object.fromEntries(model.kpis.map((kpi) => [kpi.key, kpi]));

    expect(kpis.temporalValidity?.value).toBe('92,0%');
    expect(kpis.referential?.value).toBe('97,5%');
    expect(kpis.reconciliation?.value).toBe('2 de 3');
    expect(kpis.quarantine?.value).toBe('4');
    expect(model.source.sourceFile).toBe(contract.source.sourceFile);
    expect(model.source.sourceHash).toBe(contract.source.sourceSha256);
    expect(model.source.sourceSize).toBe('1,25 MB');
    expect(model.reconciliation.context).toBe('2 de 3 liquidaciones revisadas coinciden por completo.');
    expect(model.temporal.domains[1]?.quarantineRows).toBe(contract.temporal.domains.calculo.quarantineRows);
    expect(model.coverage.rows[2]?.orphanRows).toBe(contract.referential.facts.ausencia.orphanRows);
    expect(model.executive.statusLabel).toBe('Disponible con observaciones');
    expect(model.executive.attentionTitle).toBe('1 de 3 liquidaciones revisadas no coinciden por completo');
    expect(model.executive.impact).toMatch(/no significan por sí solas que falte un pago/i);
    expect(model.risks.items[2]?.title).toBe('4 registros apartados por fecha o período');
    expect(model.actions[0]?.detail).toContain('70,0%');
    expect(model.privacyStatus).toContain('No descarga datos personales');
    expect(model.privacyStatus).toContain('La tabla personas_junin está excluida');
  });

  it('returns an immutable projection and refuses callers that bypass the contract type', () => {
    const model = buildQualityViewModel(validContract());
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.kpis)).toBe(true);
    expect(Object.isFrozen(model.quality.components[0])).toBe(true);
    expect(Object.isFrozen(model.risks.items)).toBe(true);

    expect(() => buildQualityViewModel({ schemaVersion: 'grh-quality-v1' } as QualityContract))
      .toThrow(expect.objectContaining({ code: 'GRH_QUALITY_CONTRACT_INVALID', status: 502 }));
  });

  it('does not publish a false material-difference risk for a reconciled contract', () => {
    const model = buildQualityViewModel(reconciledContract());
    const reconciliationKpi = model.kpis.find(kpi => kpi.key === 'reconciliation');

    expect(reconciliationKpi?.value).toBe('3 de 3');
    expect(reconciliationKpi?.tone).toBe('green');
    expect(reconciliationKpi?.note).toMatch(/coinciden/i);
    expect(model.risks.items[1]?.level).toBe('guarded');
    expect(model.risks.items[1]?.title).toMatch(/comparación de liquidaciones coincide/i);
    expect(model.actions[0]?.title).toMatch(/Repetir la revisión/i);
    expect(model.risks.items.some(item => /diferencias materiales/i.test(item.title))).toBe(false);
  });

  it('marks the latest calculation control as unsafe when it exceeds tolerance', () => {
    const base = validContract();
    const outsideTolerance: QualityContract = {
      ...base,
      quality: {
        ...base.quality,
        risks: {
          ...base.quality.risks,
          latestCalculationControlWithinRoundingTolerance: false,
        },
      },
    };
    expect(validateQualityContract(outsideTolerance)).toBe(true);

    const calculationRisk = buildQualityViewModel(outsideTolerance).risks.items[6];
    expect(calculationRisk?.level).toBe('high');
    expect(calculationRisk?.title).toMatch(/fuera de tolerancia/i);
    expect(calculationRisk?.detail).toMatch(/excede la tolerancia/i);
  });
});
