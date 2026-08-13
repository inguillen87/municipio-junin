import {
  OrganizationAnalyticsContractError,
  validateOrganizationAnalyticsContract,
} from './organization-analytics-contract';
import type {
  ActivityDomainViewModel,
  ActivityPointViewModel,
  ExecutiveRanking,
  MatrixCellViewModel,
  OrganizationAnalyticsContract,
  OrganizationAnalyticsDimension,
  OrganizationAnalyticsViewModel,
  RegistryRankingViewModel,
  SensitiveActivityDomain,
  StructureKpiViewModel,
  WorkforceDimensionKey,
  WorkforceRankingViewModel,
} from './organization-analytics-types';

const numberFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const percentageFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeZone: 'America/Argentina/Buenos_Aires',
});
const monthFormatter = new Intl.DateTimeFormat('es-AR', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const WORKFORCE_LABELS: Record<WorkforceDimensionKey, string> = {
  sector: 'Sector',
  costCenter: 'Centro de costo',
  agreement: 'Convenio',
};

function protectedGroupLabel(label: string, privacyStatus: string): string {
  return privacyStatus === 'released' ? label : 'Otros grupos protegidos';
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object') return value;
  const objectValue = value as object;
  if (seen.has(objectValue)) return value;
  seen.add(objectValue);
  const keyedValue = value as Record<string, unknown>;
  for (const key of Object.keys(value)) deepFreeze(keyedValue[key], seen);
  return Object.freeze(value);
}

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatPercentage(value: number): string {
  return `${percentageFormatter.format(value)}%`;
}

function formatDate(value: string): string {
  return dateFormatter.format(new Date(`${value}T12:00:00-03:00`));
}

function formatMonth(value: string): string {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return value;
  return monthFormatter.format(new Date(Date.UTC(year, month - 1, 1))).replace('.', '');
}

function buildWorkforceRanking(
  key: WorkforceDimensionKey,
  ranking: ExecutiveRanking,
): WorkforceRankingViewModel {
  const protectedParticipants = ranking.rows.reduce((total, row) => (
    row.privacyStatus === 'protected_aggregate' ? total + row.participants : total
  ), 0);
  return {
    key,
    label: WORKFORCE_LABELS[key],
    denominator: ranking.totalParticipants,
    denominatorLabel: `${formatNumber(ranking.totalParticipants)} participantes del período`,
    protectedParticipants,
    rows: ranking.rows.map((row, index) => ({
      key: `${key}-${String(row.sourceCode ?? 'protected')}-${index}`,
      companyCode: row.companyCode,
      sourceCode: row.sourceCode,
      label: protectedGroupLabel(row.label, row.privacyStatus),
      participants: row.participants,
      participantLabel: formatNumber(row.participants),
      sharePct: row.sharePct,
      shareLabel: formatPercentage(row.sharePct),
      privacyStatus: row.privacyStatus,
    })),
  };
}

function activityRowsInOrder(domain: SensitiveActivityDomain) {
  return [...domain.series].sort((left, right) => {
    if (left.period === null && right.period === null) return 0;
    if (left.period === null) return 1;
    if (right.period === null) return -1;
    return left.period.localeCompare(right.period);
  });
}

function buildActivity(
  key: ActivityDomainViewModel['key'],
  label: string,
  domain: SensitiveActivityDomain,
): ActivityDomainViewModel {
  const ordered = activityRowsInOrder(domain);
  const points: ActivityPointViewModel[] = ordered.map((row, index) => ({
    key: `${key}-${row.period ?? 'protected'}-${index}`,
    period: row.period,
    periodLabel: row.period ?? 'Período protegido',
    events: row.value,
    eventLabel: row.value === null ? 'No publicable' : formatNumber(row.value),
    participants: row.participantCount,
    participantLabel: row.participantCount === null ? row.participantDisplay : formatNumber(row.participantCount),
    privacyStatus: row.privacyStatus,
  }));
  const released = points.filter(point => point.privacyStatus === 'released');
  const protectedPeriods = points.length - released.length;
  return {
    key,
    label,
    sourceTable: domain.sourceTable,
    points,
    releasedPeriods: released.length,
    protectedPeriods,
    maxEvents: Math.max(0, ...released.map(point => point.events ?? 0)),
    maxParticipants: Math.max(0, ...released.map(point => point.participants ?? 0)),
    note: key === 'absence'
      ? 'Eventos y participantes distintos por año; ambas escalas se muestran separadas.'
      : 'Movimientos válidos y participantes distintos por año; el volumen no explica causas.',
  };
}

function buildRegistry(
  key: RegistryRankingViewModel['key'],
  label: string,
  dimension: OrganizationAnalyticsDimension,
): RegistryRankingViewModel {
  return {
    key,
    label,
    denominatorRecords: dimension.denominatorRecords,
    denominatorLabel: `${formatNumber(dimension.denominatorRecords)} registros con ${label.toLocaleLowerCase('es-AR')}`,
    categoryCount: dimension.categoryCount,
    releasedCategoryCount: dimension.releasedCategoryCount,
    protectedCategoryCount: dimension.protectedCategoryCount,
    rows: dimension.rows.map((row, index) => ({
      key: `${key}-${row.code ?? 'protected'}-${index}`,
      code: row.code,
      label: protectedGroupLabel(row.label, row.privacyStatus),
      registeredRecords: row.registeredRecords,
      registeredLabel: formatNumber(row.registeredRecords),
      sharePct: row.sharePct ?? 0,
      shareLabel: row.sharePct === null ? 'Protegido' : formatPercentage(row.sharePct),
      privacyStatus: row.privacyStatus,
    })),
  };
}

function matrixLevel(value: number | null, status: MatrixCellViewModel['privacyStatus'], maximum: number) {
  if (status !== 'released' || value === null || maximum === 0) return 0 as const;
  const ratio = value / maximum;
  if (ratio <= 0.25) return 1 as const;
  if (ratio <= 0.5) return 2 as const;
  if (ratio <= 0.75) return 3 as const;
  return 4 as const;
}

function buildMatrix(contract: OrganizationAnalyticsContract) {
  const rowLabels = new Map(contract.matrix.rows.map(row => [row.code, row.label]));
  const columnLabels = new Map(contract.matrix.columns.map(column => [column.code, column.label]));
  return {
    rows: contract.matrix.rows,
    columns: contract.matrix.columns,
    cells: contract.matrix.cells.map(cell => {
      const display = cell.privacyStatus === 'released'
        ? formatNumber(cell.registeredRecords ?? 0)
        : cell.privacyStatus === 'not_observed' ? '0' : 'Protegido';
      return {
        ...cell,
        key: `${cell.organizationCode}-${cell.sectorCode}`,
        display,
        level: matrixLevel(cell.registeredRecords, cell.privacyStatus, contract.matrix.maxReleasedRecords),
        accessibleLabel: `${rowLabels.get(cell.organizationCode) ?? 'Organización'} · ${columnLabels.get(cell.sectorCode) ?? 'Sector'}: ${display}`,
      };
    }),
    releasedCellCount: contract.matrix.releasedCellCount,
    protectedCellCount: contract.matrix.protectedCellCount,
  } as const;
}

function buildMovementKpi(domain: SensitiveActivityDomain): StructureKpiViewModel {
  const ordered = activityRowsInOrder(domain);
  if (ordered.some(row => row.period === null)) {
    return {
      key: 'latestMovementParticipants',
      label: 'Participantes · movimientos',
      value: 'Protegido',
      note: 'El último año no puede determinarse sin abrir un período protegido.',
      tone: 'amber',
    };
  }
  const latest = ordered.at(-1);
  if (!latest || latest.privacyStatus === 'suppressed') {
    return {
      key: 'latestMovementParticipants',
      label: 'Participantes · movimientos',
      value: 'Protegido',
      note: 'El último año observado reúne menos de 10 personas y no se muestra.',
      tone: 'amber',
    };
  }
  return {
    key: 'latestMovementParticipants',
    label: 'Participantes · movimientos',
    value: formatNumber(latest.participantCount),
    note: `${latest.period} · participantes distintos con movimientos válidos.`,
    tone: 'green',
  };
}

function buildKpis(contract: OrganizationAnalyticsContract): readonly StructureKpiViewModel[] {
  return [
    {
      key: 'registeredRecords',
      label: 'Legajos registrados',
      value: formatNumber(contract.coverage.registeredRecords),
      note: `Registros gobernados al ${formatDate(contract.source.snapshotAsOf)}.`,
      tone: 'blue',
    },
    {
      key: 'payrollParticipants',
      label: 'Participantes de cálculo',
      value: formatNumber(contract.payrollCohort.payrollParticipants),
      note: `${formatMonth(contract.payrollCohort.referencePeriod)} · claves con cálculo válido.`,
      tone: 'violet',
    },
    {
      key: 'organizationCoverage',
      label: 'Con organización',
      value: formatPercentage(contract.coverage.withOrganization.sharePct),
      note: `${formatNumber(contract.coverage.withOrganization.records)} registros clasificados.`,
      tone: 'cyan',
    },
    {
      key: 'sectorCoverage',
      label: 'Con sector',
      value: formatPercentage(contract.coverage.withSector.sharePct),
      note: `${formatNumber(contract.coverage.withSector.records)} registros clasificados.`,
      tone: 'cyan',
    },
    {
      key: 'recordsWithAbsenceHistory',
      label: 'Con historia de ausencias',
      value: formatNumber(contract.coverage.withAbsenceHistory.records),
      note: `${formatPercentage(contract.coverage.withAbsenceHistory.sharePct)} de los registros del corte.`,
      tone: 'amber',
    },
    buildMovementKpi(contract.activity.movements),
  ];
}

export function buildOrganizationAnalyticsViewModel(
  contract: OrganizationAnalyticsContract,
): OrganizationAnalyticsViewModel {
  if (!validateOrganizationAnalyticsContract(contract)) {
    throw new OrganizationAnalyticsContractError('ORGANIZATION_CONTRACT_INVALID', 502);
  }
  return deepFreeze({
    truth: {
      canonicalSystem: contract.source.canonicalSystem,
      sourceFile: contract.source.sourceFile,
      sourceHash: contract.source.sourceSha256,
      snapshotAsOf: contract.source.snapshotAsOf,
      snapshotLabel: formatDate(contract.source.snapshotAsOf),
      referencePeriod: contract.payrollCohort.referencePeriod,
      definition: 'Universo: participantes con al menos un cálculo válido en el período de referencia.',
    },
    kpis: buildKpis(contract),
    workforce: {
      sector: buildWorkforceRanking('sector', contract.payrollCohort.bySector),
      costCenter: buildWorkforceRanking('costCenter', contract.payrollCohort.byCostCenter),
      agreement: buildWorkforceRanking('agreement', contract.payrollCohort.byAgreement),
    },
    activity: [
      buildActivity('absence', 'Ausencias históricas', contract.activity.absence),
      buildActivity('movements', 'Movimientos de legajo', contract.activity.movements),
    ],
    registries: [
      buildRegistry('organization', 'Organización', contract.organizations),
      buildRegistry('sector', 'Sector', contract.sectors),
    ],
    matrix: buildMatrix(contract),
    absenceRanking: contract.absenceRanking.rows.map((row, index) => ({
      key: `absence-${row.code ?? 'protected'}-${index}`,
      organizationCode: row.code,
      rank: index + 1,
      label: protectedGroupLabel(row.label, row.privacyStatus),
      registeredRecords: row.registeredRecords,
      recordsWithAbsence: row.recordsWithAbsence ?? 0,
      absenceEvents: row.absenceEvents ?? 0,
      eventsPerRegisteredRecord: row.eventsPerRegisteredRecord,
      eventIntensityLabel: row.eventsPerRegisteredRecord === null
        ? 'Protegido'
        : `${percentageFormatter.format(row.eventsPerRegisteredRecord)} eventos por registro`,
      absencePrivacyStatus: row.absencePrivacyStatus,
      eventShareLabel: row.sharePct === null ? 'Protegido' : formatPercentage(row.sharePct),
      privacyStatus: row.privacyStatus,
    })),
    qualityFacts: [
      {
        key: 'missingOrganizationRecords',
        label: 'Sin organización informada',
        value: formatNumber(contract.dataQuality.missingOrganizationRecords),
      },
      {
        key: 'missingSectorRecords',
        label: 'Sin sector informado',
        value: formatNumber(contract.dataQuality.missingSectorRecords),
      },
      {
        key: 'unmatchedPersonRecords',
        label: 'Sin vínculo de persona',
        value: formatNumber(contract.dataQuality.unmatchedPersonRecords),
      },
      {
        key: 'unlinkedAbsenceEvents',
        label: 'Ausencias válidas sin vínculo',
        value: formatNumber(contract.dataQuality.unlinkedValidAbsenceEvents),
      },
      {
        key: 'quarantinedAbsenceEvents',
        label: 'Ausencias en cuarentena',
        value: formatNumber(contract.dataQuality.quarantinedAbsenceEvents),
      },
      {
        key: 'futurePositionObservations',
        label: 'Observaciones de cargo futuras',
        value: formatNumber(contract.dataQuality.futureEffectivePositionObservationRecords),
      },
    ],
    actions: contract.actions,
    limits: contract.limits,
  });
}
