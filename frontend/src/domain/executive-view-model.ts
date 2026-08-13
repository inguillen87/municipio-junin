import {
  ExecutiveContractError,
  validateExecutiveContract,
} from './executive-contract';
import type {
  AnnualDomainViewModel,
  AnnualPointViewModel,
  ExecutiveContract,
  ExecutiveKpiViewModel,
  ExecutiveMonetaryRow,
  ExecutiveSensitiveDomain,
  ExecutiveViewModel,
  PayrollChangeStatus,
  PayrollPointViewModel,
  PayrollSeriesViewModel,
  SectorRankingViewModel,
} from './executive-types';
import { formatJuninCurrency } from './tenant-presentation';

const numberFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const percentageFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const signedPercentageFormatter = new Intl.NumberFormat('es-AR', {
  style: 'percent',
  signDisplay: 'exceptZero',
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

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object') return value;
  const objectValue = value as object;
  if (seen.has(objectValue)) return value;
  seen.add(objectValue);
  const keyedValue = value as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    deepFreeze(keyedValue[key], seen);
  }
  return Object.freeze(value);
}

function formatDate(value: string): string {
  return dateFormatter.format(new Date(`${value}T12:00:00-03:00`));
}

function formatMonth(value: string): string {
  const [year, month] = value.split('-').map(Number);
  if (year === undefined || month === undefined) return value;
  return monthFormatter.format(new Date(Date.UTC(year, month - 1, 1))).replace('.', '');
}

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatWorkforceDefinition(): string {
  return 'Personas con al menos un cálculo válido en el mes analizado. Esta cifra no indica cuántas personas tienen un vínculo laboral vigente.';
}

function rankingLabel(label: string, privacyStatus: 'released' | 'protected_aggregate'): string {
  return privacyStatus === 'protected_aggregate' ? 'Otros grupos protegidos' : label;
}

function periodIndex(period: string): number {
  const [year, month] = period.split('-').map(Number);
  return (year ?? 0) * 12 + (month ?? 0);
}

function isConsecutiveMonth(previous: string, current: string): boolean {
  return periodIndex(current) - periodIndex(previous) === 1;
}

function monetaryRowsInDisplayOrder(series: readonly ExecutiveMonetaryRow[]): readonly ExecutiveMonetaryRow[] {
  return [...series].sort((left, right) => {
    if (left.period === null && right.period === null) return 0;
    if (left.period === null) return 1;
    if (right.period === null) return -1;
    return left.period.localeCompare(right.period);
  });
}

function changeForPoint(
  current: ExecutiveMonetaryRow,
  previous: ExecutiveMonetaryRow | undefined,
): { changePct: number | null; changeLabel: string; changeStatus: PayrollChangeStatus } {
  if (current.privacyStatus === 'suppressed') {
    return { changePct: null, changeLabel: 'No mostrado', changeStatus: 'protected_current' };
  }
  if (!previous) return { changePct: null, changeLabel: '—', changeStatus: 'first_period' };
  if (previous.privacyStatus === 'suppressed') {
    return { changePct: null, changeLabel: 'Sin comparación', changeStatus: 'protected_previous' };
  }
  if (!isConsecutiveMonth(previous.period, current.period)) {
    return { changePct: null, changeLabel: 'Sin mes anterior', changeStatus: 'non_consecutive' };
  }
  if (previous.amounts.netPayrollCents === 0) {
    return { changePct: null, changeLabel: 'Sin base', changeStatus: 'zero_baseline' };
  }
  const changePct = current.amounts.netPayrollCents / previous.amounts.netPayrollCents - 1;
  return {
    changePct,
    changeLabel: signedPercentageFormatter.format(changePct),
    changeStatus: 'available',
  };
}

function buildPayroll(contract: ExecutiveContract): PayrollSeriesViewModel {
  const ordered = monetaryRowsInDisplayOrder(contract.compensation.series);
  const points: PayrollPointViewModel[] = ordered.map((row, index) => {
    const change = changeForPoint(row, ordered[index - 1]);
    return {
      period: row.period,
      periodLabel: row.period === null ? 'Mes no mostrado' : formatMonth(row.period),
      privacyStatus: row.privacyStatus,
      valueSourceUnits: row.privacyStatus === 'released' ? row.amounts.netPayrollCents / 100 : null,
      valueLabel: row.privacyStatus === 'released'
        ? formatJuninCurrency(row.amounts.netPayrollCents)
        : 'No mostrado',
      participantDisplay: row.participantDisplay,
      ...change,
    };
  });
  const releasedPeriods = ordered.filter((row) => row.privacyStatus === 'released').length;
  const suppressedPeriods = ordered.length - releasedPeriods;
  const hasUnknownProtectedPeriod = ordered.some((row) => row.period === null);
  const knownRows = ordered.filter((row): row is ExecutiveMonetaryRow & { period: string } => row.period !== null);
  const latestKnown = knownRows.at(-1);
  const latestStatus = hasUnknownProtectedPeriod || !latestKnown || latestKnown.privacyStatus === 'suppressed'
    ? 'protected'
    : 'released';

  return {
    totalPeriods: ordered.length,
    releasedPeriods,
    suppressedPeriods,
    latestPeriod: hasUnknownProtectedPeriod ? null : latestKnown?.period ?? null,
    latestStatus,
    points,
    warning: 'Importes mostrados en ARS por configuración municipal. El respaldo original no declara moneda: son importes de control de liquidación y no confirman pagos. Los meses no mostrados permanecen vacíos y nunca se reemplazan por cero.',
  };
}

function buildSector(contract: ExecutiveContract): SectorRankingViewModel {
  const ranking = contract.workforce.bySector;
  const released = ranking.rows.filter((row) => row.privacyStatus === 'released');
  const protectedRow = ranking.rows.find((row) => row.privacyStatus === 'protected_aggregate');
  const individuallyPublishedParticipants = released.reduce((total, row) => total + row.participants, 0);
  const coverage = individuallyPublishedParticipants / ranking.totalParticipants * 100;
  return {
    totalParticipants: ranking.totalParticipants,
    totalLabel: formatNumber(ranking.totalParticipants),
    individuallyPublishedParticipants,
    individuallyPublishedCoveragePct: coverage,
    individuallyPublishedCoverageLabel: `${percentageFormatter.format(coverage)}%`,
    protectedParticipants: protectedRow?.participants ?? 0,
    rows: ranking.rows.map((row) => ({
      label: rankingLabel(row.label, row.privacyStatus),
      participants: row.participants,
      participantDisplay: row.participantDisplay,
      sharePct: row.sharePct,
      shareLabel: `${percentageFormatter.format(row.sharePct)}%`,
      privacyStatus: row.privacyStatus,
    })),
    note: protectedRow
      ? `${formatNumber(protectedRow.participants)} participantes se reúnen en “Otros grupos protegidos” para cuidar identidades; no representan dotación activa.`
      : 'Todas las categorías reúnen al menos 5 personas y pueden mostrarse por separado; no representan dotación activa.',
  };
}

function annualRowsInDisplayOrder(domain: ExecutiveSensitiveDomain) {
  return [...domain.series].sort((left, right) => {
    if (left.period === null && right.period === null) return 0;
    if (left.period === null) return 1;
    if (right.period === null) return -1;
    return left.period.localeCompare(right.period);
  });
}

function buildAnnualDomain(
  key: AnnualDomainViewModel['key'],
  label: string,
  domain: ExecutiveSensitiveDomain,
): AnnualDomainViewModel {
  const ordered = annualRowsInDisplayOrder(domain);
  const points: AnnualPointViewModel[] = ordered.map((row) => ({
    period: row.period,
    periodLabel: row.period ?? 'Año no mostrado',
    value: row.value,
    valueLabel: row.privacyStatus === 'released' ? formatNumber(row.value) : 'No mostrado',
    participantDisplay: row.participantDisplay,
    privacyStatus: row.privacyStatus,
  }));
  const releasedPeriods = ordered.filter((row) => row.privacyStatus === 'released').length;
  const suppressedPeriods = ordered.length - releasedPeriods;
  const latestReleased = ordered.filter((row) => row.privacyStatus === 'released').at(-1);
  let note = 'Las cantidades corresponden a registros acumulados; no son tasas por persona.';
  if (key === 'leave') {
    note = latestReleased?.period
      ? `La información disponible termina en ${latestReleased.period}; no indica una licencia vigente.`
      : 'No hay un año de licencias que pueda mostrarse; no se reemplaza con estimaciones.';
  } else if (key === 'movements') {
    note = 'Cambios de legajo registrados por año; la cantidad no explica la causa ni asigna responsabilidad.';
  }
  if (suppressedPeriods > 0) {
    note += ` ${formatNumber(suppressedPeriods)} año(s) no se muestran para cuidar identidades y no se contabilizan como cero.`;
  }
  return {
    key,
    label,
    sourceTable: domain.sourceTable,
    releasedPeriods,
    suppressedPeriods,
    points,
    note,
  };
}

function latestPayrollKpi(
  contract: ExecutiveContract,
  payroll: PayrollSeriesViewModel,
): ExecutiveKpiViewModel {
  if (payroll.latestStatus === 'protected') {
    const period = payroll.latestPeriod;
    return {
      key: 'latestPayrollControl',
      label: 'Importe de control del último mes',
      value: 'No mostrado',
      note: period
        ? `${period} reúne menos de 10 personas: no se muestra y no se reemplaza con un mes anterior.`
        : 'Existe un registro reservado sin fecha visible; no se puede determinar cuál es el último importe.',
      status: 'protected',
      tone: 'amber',
    };
  }
  const latest = contract.compensation.series.find((row) => row.period === payroll.latestPeriod);
  if (!latest || latest.privacyStatus !== 'released') {
    throw new ExecutiveContractError('GRH_EXECUTIVE_CONTRACT_INVALID', 502);
  }
  return {
    key: 'latestPayrollControl',
    label: 'Importe de control del último mes',
    value: formatJuninCurrency(latest.amounts.netPayrollCents),
    note: `${latest.period} · ${latest.participantDisplay} personas incluidas · ARS por configuración municipal; no confirma pagos.`,
    status: 'released',
    tone: 'violet',
  };
}

function absenceKpi(contract: ExecutiveContract): ExecutiveKpiViewModel {
  const snapshotYear = Number(contract.source.snapshotAsOf.slice(0, 4));
  const targetYear = String(snapshotYear - 1);
  const row = contract.absence.series.find((candidate) => candidate.period === targetYear);
  if (!row || row.privacyStatus === 'suppressed') {
    return {
      key: 'lastCompleteAbsence',
      label: `Ausencias registradas en ${targetYear}`,
      value: 'No mostrado',
      note: `El último año completo no está disponible o debe reservarse; no se reemplaza con otro año ni se estima.`,
      status: 'protected',
      tone: 'amber',
    };
  }
  return {
    key: 'lastCompleteAbsence',
    label: `Ausencias registradas en ${targetYear}`,
    value: formatNumber(row.value),
    note: `${row.participantDisplay} personas distintas; son registros acumulados, no una tasa de ausentismo.`,
    status: 'released',
    tone: 'amber',
  };
}

function movementsKpi(contract: ExecutiveContract): ExecutiveKpiViewModel {
  const releasedRows = contract.movements.series.filter((row) => row.privacyStatus === 'released');
  const releasedTotal = releasedRows.reduce((total, row) => total + row.value, 0);
  const suppressedPeriods = contract.movements.series.length - releasedRows.length;
  return {
    key: 'publishedMovements',
    label: 'Cambios registrados en legajos',
    value: suppressedPeriods === 0 ? formatNumber(releasedTotal) : 'Información parcial',
    note: suppressedPeriods === 0
      ? 'Registros históricos disponibles; no explican la causa ni indican vigencia laboral.'
      : `${formatNumber(releasedTotal)} registros disponibles y ${formatNumber(suppressedPeriods)} año(s) reservados; no se presenta un total incompleto como exacto.`,
    status: suppressedPeriods === 0 ? 'released' : 'partial',
    tone: 'green',
  };
}

function buildKpis(
  contract: ExecutiveContract,
  payroll: PayrollSeriesViewModel,
  sector: SectorRankingViewModel,
): readonly ExecutiveKpiViewModel[] {
  return [
    {
      key: 'payrollParticipants',
      label: 'Personas incluidas en el cálculo',
      value: formatNumber(contract.workforce.payrollParticipants),
      note: `${contract.workforce.referencePeriod} · personas con al menos un cálculo válido; no indica personal con vínculo vigente.`,
      status: 'released',
      tone: 'cyan',
    },
    latestPayrollKpi(contract, payroll),
    {
      key: 'sectorCoverage',
      label: 'Personas con sector identificado',
      value: sector.individuallyPublishedCoverageLabel,
      note: sector.note,
      status: sector.protectedParticipants > 0 ? 'partial' : 'released',
      tone: 'cyan',
    },
    absenceKpi(contract),
    movementsKpi(contract),
  ];
}

export function buildExecutiveViewModel(contract: ExecutiveContract): ExecutiveViewModel {
  if (!validateExecutiveContract(contract)) {
    throw new ExecutiveContractError('GRH_EXECUTIVE_CONTRACT_INVALID', 502);
  }
  const payroll = buildPayroll(contract);
  const sector = buildSector(contract);
  const annual = [
    buildAnnualDomain('absence', 'Ausencias registradas', contract.absence),
    buildAnnualDomain('leave', 'Licencias históricas', contract.leave),
    buildAnnualDomain('movements', 'Cambios registrados en legajos', contract.movements),
  ] as const;
  const protectedRankingRows = [
    contract.workforce.bySector,
    contract.workforce.byCostCenter,
    contract.workforce.byAgreement,
  ].reduce((total, ranking) => total + ranking.rows.filter((row) => row.privacyStatus === 'protected_aggregate').length, 0);
  const suppressedAnnualPeriods = annual.reduce((total, domain) => total + domain.suppressedPeriods, 0);

  return deepFreeze({
    truth: {
      canonicalSystem: contract.source.canonicalSystem,
      sourceFile: contract.source.sourceFile,
      sourceHash: contract.source.sourceSha256,
      snapshotAsOf: contract.source.snapshotAsOf,
      snapshotLabel: formatDate(contract.source.snapshotAsOf),
      referencePeriod: contract.workforce.referencePeriod,
      freshnessLabel: `Respaldo histórico del ${formatDate(contract.source.snapshotAsOf)} · no es tiempo real.`,
      workforceDefinition: formatWorkforceDefinition(),
    },
    kpis: buildKpis(contract, payroll, sector),
    payroll,
    sector,
    annual,
    privacy: {
      policyVersion: contract.policyVersion,
      rankingThreshold: contract.privacy.interactiveThreshold,
      sensitiveThreshold: contract.privacy.sensitiveThreshold,
      protectedRankingRows,
      suppressedMonetaryPeriods: payroll.suppressedPeriods,
      suppressedAnnualPeriods,
      note: 'Esta vista sólo muestra datos agrupados, sin información personal. Las categorías con menos de 5 personas se reúnen en “Otros grupos protegidos”; los importes o eventos de grupos con menos de 10 personas no se muestran.',
    },
  });
}
