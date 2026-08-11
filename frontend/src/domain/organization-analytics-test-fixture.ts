import type {
  ExecutiveRanking,
  OrganizationAnalyticsContract,
  OrganizationAnalyticsRankingRow,
} from './organization-analytics-types';

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function dimensionRow(
  code: number,
  label: string,
  registeredRecords: number,
  denominator: number,
): OrganizationAnalyticsRankingRow {
  return {
    code,
    label,
    registeredRecords,
    sharePct: round4(registeredRecords / denominator * 100),
    recordsWithAbsence: null,
    absenceEvents: null,
    eventsPerRegisteredRecord: null,
    absencePrivacyStatus: 'protected',
    privacyStatus: 'released',
  };
}

function absenceRow(
  code: number,
  label: string,
  registeredRecords: number,
  recordsWithAbsence: number,
  absenceEvents: number,
): OrganizationAnalyticsRankingRow {
  return {
    code,
    label,
    registeredRecords,
    sharePct: round4(absenceEvents / 100 * 100),
    recordsWithAbsence,
    absenceEvents,
    eventsPerRegisteredRecord: round4(absenceEvents / registeredRecords),
    absencePrivacyStatus: 'released',
    privacyStatus: 'released',
  };
}

function workforceRanking(
  first: { companyCode: number; sourceCode: number; label: string; participants: number },
  second: { companyCode: number | null; sourceCode: number | null; label: string; participants: number },
): ExecutiveRanking {
  const privacyStatus = second.companyCode === null ? 'partially_suppressed' : 'released';
  return {
    threshold: 10,
    totalParticipants: 90,
    participantDisplay: '90',
    privacyStatus,
    rows: [first, second].map(row => ({
      ...row,
      participantDisplay: String(row.participants),
      sharePct: round4(row.participants / 90 * 100),
      privacyStatus: row.companyCode === null ? 'protected_aggregate' : 'released',
    })),
  };
}

export function createOrganizationAnalyticsContract(): OrganizationAnalyticsContract {
  return {
    schemaVersion: 'grh-organization-analytics-v2',
    source: {
      canonicalSystem: 'GRH Junín · snapshot gobernado',
      sourceFile: 'grh_junin.backup_2026080615_plataforma.sql.gz',
      sourceSha256: '8cfe17751c48067563a6b609eb75e4ab73512fef131d2bb829ab0bd7364f4c28',
      snapshotAsOf: '2026-08-06',
    },
    privacy: {
      threshold: 10,
      containsPii: false,
      identifiersExported: false,
      labelsProtectedBeforeRanking: true,
      complementarySuppression: true,
    },
    coverage: {
      registeredRecords: 100,
      withOrganization: { records: 80, sharePct: 80 },
      withSector: { records: 70, sharePct: 70 },
      withOrganizationAndSector: { records: 60, sharePct: 60 },
      withAbsenceHistory: { records: 20, sharePct: 20 },
      absenceEvents: 100,
    },
    organizations: {
      dimension: 'organization',
      denominatorRecords: 80,
      categoryCount: 2,
      releasedCategoryCount: 2,
      protectedCategoryCount: 0,
      rows: [
        dimensionRow(101, 'Servicios Urbanos', 50, 80),
        dimensionRow(202, 'Gobierno y Comunidad', 30, 80),
      ],
    },
    sectors: {
      dimension: 'sector',
      denominatorRecords: 70,
      categoryCount: 2,
      releasedCategoryCount: 2,
      protectedCategoryCount: 0,
      rows: [
        dimensionRow(11, 'Servicios Públicos', 40, 70),
        dimensionRow(22, 'Administración', 30, 70),
      ],
    },
    matrix: {
      rowDimension: 'organization',
      columnDimension: 'sector',
      rows: [
        { code: 101, label: 'Servicios Urbanos' },
        { code: 202, label: 'Gobierno y Comunidad' },
      ],
      columns: [
        { code: 11, label: 'Servicios Públicos' },
        { code: 22, label: 'Administración' },
      ],
      cells: [
        { organizationCode: 101, sectorCode: 11, registeredRecords: 20, privacyStatus: 'released' },
        { organizationCode: 101, sectorCode: 22, registeredRecords: 20, privacyStatus: 'released' },
        { organizationCode: 202, sectorCode: 11, registeredRecords: 10, privacyStatus: 'released' },
        { organizationCode: 202, sectorCode: 22, registeredRecords: 20, privacyStatus: 'released' },
      ],
      releasedCellCount: 4,
      protectedCellCount: 0,
      maxReleasedRecords: 20,
    },
    absenceRanking: {
      historical: true,
      denominatorRecords: 100,
      recordsWithAbsence: 20,
      absenceEvents: 100,
      rows: [
        absenceRow(101, 'Servicios Urbanos', 60, 10, 60),
        absenceRow(202, 'Gobierno y Comunidad', 40, 10, 40),
      ],
    },
    dataQuality: {
      missingOrganizationRecords: 20,
      missingSectorRecords: 30,
      missingBothRecords: 10,
      invalidEmployeeKeyRows: 2,
      unmatchedPersonRecords: 3,
      validAbsenceEvents: 105,
      quarantinedAbsenceEvents: 2,
      linkedAbsenceEvents: 100,
      unlinkedValidAbsenceEvents: 5,
      codedPositionRecords: 40,
      positionObservationRecords: 50,
      futureEffectivePositionObservationRecords: 5,
      firstFuturePositionDate: '2026-08-15',
      lastFuturePositionDate: '2026-12-01',
    },
    payrollCohort: {
      definition: 'Participantes con al menos un cálculo válido en el período; no equivale a dotación contractual vigente.',
      referencePeriod: '2026-07',
      payrollParticipants: 90,
      bySector: {
        threshold: 10,
        totalParticipants: 90,
        participantDisplay: '90',
        privacyStatus: 'partially_suppressed',
        rows: [
          {
            companyCode: 101,
            sourceCode: 11,
            label: 'Servicios Públicos',
            participants: 30,
            participantDisplay: '30',
            sharePct: round4(30 / 90 * 100),
            privacyStatus: 'released',
          },
          {
            companyCode: 101,
            sourceCode: 22,
            label: 'Administración',
            participants: 20,
            participantDisplay: '20',
            sharePct: round4(20 / 90 * 100),
            privacyStatus: 'released',
          },
          {
            companyCode: null,
            sourceCode: null,
            label: 'Otros (celdas protegidas)',
            participants: 40,
            participantDisplay: '40',
            sharePct: round4(40 / 90 * 100),
            privacyStatus: 'protected_aggregate',
          },
        ],
      },
      byCostCenter: workforceRanking(
        { companyCode: 101, sourceCode: 31, label: 'Servicios Urbanos', participants: 60 },
        { companyCode: 101, sourceCode: 32, label: 'Gobierno', participants: 30 },
      ),
      byAgreement: workforceRanking(
        { companyCode: 101, sourceCode: 41, label: 'Municipal', participants: 70 },
        { companyCode: null, sourceCode: null, label: 'Otros (celdas protegidas)', participants: 20 },
      ),
    },
    activity: {
      absence: {
        sourceTable: 'ausencia',
        metric: 'valid_rows_by_year',
        series: [
          { period: '2024', value: 100, participantCount: 20, participantDisplay: '20', privacyStatus: 'released' },
          { period: '2025', value: 80, participantCount: 25, participantDisplay: '25', privacyStatus: 'released' },
        ],
      },
      movements: {
        sourceTable: 'legamov',
        metric: 'valid_rows_by_year',
        series: [
          { period: '2024', value: 70, participantCount: 20, participantDisplay: '20', privacyStatus: 'released' },
          { period: '2025', value: 90, participantCount: 30, participantDisplay: '30', privacyStatus: 'released' },
        ],
      },
    },
    actions: [
      {
        id: 'open_workforce_dashboard',
        label: 'Abrir Gestión de personas',
        href: '/rrhh',
        requiredCapability: 'navigation.rrhh',
      },
      {
        id: 'open_executive_summary',
        label: 'Abrir resumen ejecutivo',
        href: '/ejecutivo',
        requiredCapability: 'navigation.grh-executive',
      },
      {
        id: 'open_data_quality',
        label: 'Revisar calidad de datos',
        href: '/calidad',
        requiredCapability: 'navigation.data-quality',
      },
      {
        id: 'export_executive_report',
        label: 'Abrir reportes ejecutivos',
        href: '/reportes',
        requiredCapability: 'navigation.reports',
      },
    ],
    limits: [
      'snapshot_historical',
      'registered_records_not_active_workforce',
      'absence_events_not_absence_rate',
      'absence_events_not_causal',
      'positions_not_current_hierarchy',
      'no_realtime',
    ],
  };
}
