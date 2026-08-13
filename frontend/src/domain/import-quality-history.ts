import type {
  FetchImportQualityHistoryOptions,
  ImportQualityHistoryClient,
  ImportQualityHistoryContract,
  ImportQualityHistoryViewModel,
} from './import-quality-history-types';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 30_000;

const numberFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const compactNumberFormatter = new Intl.NumberFormat('es-AR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const percentFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

declare global {
  interface Window {
    readonly MuniGrhImportQualityHistory?: ImportQualityHistoryClient;
  }
}

function formatDate(value: string): string {
  return dateFormatter.format(new Date(`${value}T12:00:00Z`)).replace(/\s+de\s+/g, ' ');
}

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object') return value;
  const objectValue = value as object;
  if (seen.has(objectValue)) return value;
  seen.add(objectValue);
  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

export async function fetchImportQualityHistory(
  options: FetchImportQualityHistoryOptions = {},
): Promise<ImportQualityHistoryContract> {
  const keys = Object.keys(options);
  if (keys.some(key => key !== 'timeoutMs' && key !== 'signal')) {
    throw new Error('GRH_IMPORT_HISTORY_OPTIONS_INVALID');
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error('GRH_IMPORT_HISTORY_OPTIONS_INVALID');
  }
  const client = window.MuniGrhImportQualityHistory;
  if (!client || typeof client.load !== 'function') {
    throw new Error('GRH_IMPORT_HISTORY_CLIENT_UNAVAILABLE');
  }
  return client.load({ timeoutMs, signal: options.signal ?? null });
}

export function buildImportQualityHistoryViewModel(
  contract: ImportQualityHistoryContract,
): ImportQualityHistoryViewModel {
  const maximumAnnual = Math.max(0, ...contract.annual.map(row => row.incidents));
  const maximumCategory = Math.max(0, ...contract.categories.map(row => row.incidents));
  const dateRangeLabel = `${formatDate(contract.source.firstEventDate)} al ${formatDate(contract.source.lastEventDate)}`;

  return deepFreeze({
    headline: 'El historial muestra patrones de carga que conviene revisar',
    description: 'Resume cuándo y qué observaciones registró el sistema de origen durante sus importaciones históricas.',
    dateRangeLabel,
    cutLabel: `Corte del respaldo: ${formatDate(contract.source.snapshotAsOf)}`,
    totalIncidentsLabel: formatNumber(contract.totals.incidents),
    totalRunsLabel: formatNumber(contract.totals.importRuns),
    currentYearLabel: `${contract.currentPartial.year} parcial`,
    currentIncidentsLabel: formatNumber(contract.currentPartial.incidents),
    currentRunsLabel: `${formatNumber(contract.currentPartial.importRuns)} lotes con observaciones hasta ${formatDate(contract.currentPartial.through)}`,
    annual: contract.annual.map(row => ({
      year: row.year,
      yearLabel: row.partial ? `${row.year} parcial` : String(row.year),
      shortYearLabel: row.partial ? `${row.year} (parcial)` : String(row.year),
      incidents: row.incidents,
      incidentsLabel: formatNumber(row.incidents),
      compactIncidentsLabel: compactNumberFormatter.format(row.incidents),
      importRunsLabel: `${formatNumber(row.importRuns)} lotes con observaciones`,
      relativeHeightPct: maximumAnnual === 0 ? 0 : row.incidents / maximumAnnual * 100,
      partial: row.partial,
      accessibleLabel: `${row.partial ? `${row.year} parcial` : row.year}: ${formatNumber(row.incidents)} observaciones en ${formatNumber(row.importRuns)} cargas`,
    })),
    categories: contract.categories.map(row => ({
      key: row.key,
      label: row.label,
      meaning: row.meaning,
      incidents: row.incidents,
      incidentsLabel: formatNumber(row.incidents),
      sharePct: row.sharePct,
      shareLabel: `${percentFormatter.format(row.sharePct)}%`,
      relativeWidthPct: maximumCategory === 0 ? 0 : row.incidents / maximumCategory * 100,
      accessibleLabel: `${row.label}: ${formatNumber(row.incidents)} observaciones, ${percentFormatter.format(row.sharePct)}% del total`,
    })).sort((left, right) => right.incidents - left.incidents || left.label.localeCompare(right.label, 'es')),
    classificationLabel: `${percentFormatter.format(contract.classification.coveragePct)}% clasificado`,
    scopeNote: 'Son controles registrados por el proceso de importación de la fuente. No son fallas de personas ni describen por sí solos la salud actual de MuniControl.',
    detailNote: `Período observado: ${dateRangeLabel}. La serie del último año es parcial y no debe compararse como si fuera un año completo.`,
    limits: contract.limits.map(limit => limit.text),
  });
}
