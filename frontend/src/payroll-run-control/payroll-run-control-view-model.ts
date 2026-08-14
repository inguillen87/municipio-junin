import type {
  PayrollRunControlContract,
  PayrollRunControlViewModel,
  PayrollRunMonthViewModel,
} from './payroll-run-control-types';

const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const percentage = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'America/Argentina/Buenos_Aires' });
const month = new Intl.DateTimeFormat('es-AR', { month: 'short', year: 'numeric', timeZone: 'UTC' });

const REASON_LABELS: Readonly<Record<string, string>> = Object.freeze({
  year_before_policy: 'Año anterior al piso temporal',
  year_after_snapshot: 'Año posterior al respaldo',
  period_after_snapshot: 'Período posterior al respaldo',
  month_out_of_range: 'Mes fuera de rango',
  date_before_policy: 'Fecha anterior al piso temporal',
  date_after_snapshot: 'Fecha posterior al respaldo',
  period_date_year_mismatch: 'Año del período distinto al de la fecha',
});

function formatDate(value: string): string {
  return date.format(new Date(`${value}T12:00:00-03:00`));
}

function formatPeriod(value: string): string {
  const parts = value.split('-');
  const year = Number(parts[0] ?? 0);
  const monthNumber = Number(parts[1] ?? 1);
  return month.format(new Date(Date.UTC(year, monthNumber - 1, 1))).replace('.', '');
}

function monthView(
  row: PayrollRunControlContract['monthly'][number],
  maxRunHeaders: number,
): PayrollRunMonthViewModel {
  const dateRangeLabel = row.firstEffectiveDate === row.lastEffectiveDate
    ? formatDate(row.firstEffectiveDate)
    : `${formatDate(row.firstEffectiveDate)} a ${formatDate(row.lastEffectiveDate)}`;
  return {
    period: row.period,
    periodLabel: formatPeriod(row.period),
    dateRangeLabel,
    runHeaders: row.runHeaders,
    runHeadersLabel: integer.format(row.runHeaders),
    headersWithCalculation: row.headersWithCalculation,
    headersWithoutCalculation: row.headersWithoutCalculation,
    headersWithCloseFlag: row.headersWithCloseFlag,
    headersWithoutCloseFlag: row.headersWithoutCloseFlag,
    calculationRowsLabel: integer.format(row.calculationRows),
    barWidthPct: Math.max(4, (row.runHeaders / maxRunHeaders) * 100),
    completeObservedControls: row.headersWithCalculation === row.runHeaders &&
      row.headersWithCloseFlag === row.runHeaders,
  };
}

export function buildPayrollRunControlViewModel(
  contract: PayrollRunControlContract,
): PayrollRunControlViewModel {
  const maxRunHeaders = Math.max(...contract.monthly.map(row => row.runHeaders), 1);
  return {
    source: {
      snapshotLabel: formatDate(contract.source.snapshotAsOf),
      generatedLabel: formatDate(contract.source.generatedAt.slice(0, 10)),
      sourceFile: contract.source.sourceFile,
      sourceSha256: contract.source.sourceSha256,
      historicalRangeLabel: `${formatPeriod(contract.source.firstValidPeriod)} a ${formatPeriod(contract.source.lastValidPeriod)}`,
      historicalNotice: `Respaldo histórico al ${formatDate(contract.source.snapshotAsOf)} · no se actualiza en tiempo real`,
    },
    currentYear: {
      title: `Corridas ${contract.currentYear.year}`,
      throughLabel: `Enero a ${formatPeriod(contract.currentYear.throughPeriod).split(' ')[0]} · período parcial`,
      runHeaders: integer.format(contract.currentYear.runHeaders),
      headersWithCalculation: integer.format(contract.currentYear.headersWithCalculation),
      headersWithCloseFlag: integer.format(contract.currentYear.headersWithCloseFlag),
      allWithCalculation: contract.currentYear.allObservedRunsHaveCalculation,
      allWithCloseFlag: contract.currentYear.allObservedRunsHaveCloseFlag,
    },
    coverage: {
      validHeaders: integer.format(contract.coverage.validRunHeaders),
      validRate: `${percentage.format(contract.coverage.validHeaderRatePct)}%`,
      detailCoverage: `${percentage.format(contract.coverage.validHeaderWithCalculationRatePct)}%`,
      calculationJoin: `${percentage.format(contract.coverage.calculationHeaderJoinCoveragePct)}%`,
      observedPeriods: integer.format(contract.coverage.validPeriodCount),
      sourceHeaders: integer.format(contract.coverage.sourceRunHeaders),
    },
    monthly: contract.monthly.map(row => monthView(row, maxRunHeaders)),
    quarantine: {
      attentionRequired: contract.quarantine.status === 'attention_required',
      runHeaders: integer.format(contract.quarantine.runHeaders),
      headersWithCalculation: integer.format(contract.quarantine.headersWithCalculation),
      headersWithoutCalculation: integer.format(contract.quarantine.headersWithoutCalculation),
      calculationRows: integer.format(contract.quarantine.calculationRows),
      calculationRowRate: `${percentage.format(contract.quarantine.calculationRowRatePct)}%`,
      reasons: contract.quarantine.reasonOccurrences.map(reason => ({
        code: reason.code,
        label: REASON_LABELS[reason.code] ?? 'Motivo temporal gobernado',
        count: integer.format(reason.count),
      })),
    },
    logCoverage: {
      sourceRows: integer.format(contract.logCoverage.sourceRows),
      runKeys: integer.format(contract.logCoverage.runKeys),
      joinedRunKeys: integer.format(contract.logCoverage.joinedRunKeys),
      joinCoverage: `${percentage.format(contract.logCoverage.joinCoveragePct)}%`,
      observedDate: contract.logCoverage.firstEventDate === contract.logCoverage.lastEventDate
        ? formatDate(contract.logCoverage.firstEventDate)
        : `${formatDate(contract.logCoverage.firstEventDate)} a ${formatDate(contract.logCoverage.lastEventDate)}`,
    },
    limits: contract.limits.map(limit => limit.text),
  };
}
