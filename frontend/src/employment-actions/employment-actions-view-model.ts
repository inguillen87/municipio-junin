import type {
  EmploymentActionsCategory,
  EmploymentActionsCategoryViewModel,
  EmploymentActionsContract,
  EmploymentActionsViewModel,
} from './employment-actions-types';

const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const percentage = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'America/Argentina/Buenos_Aires' });

function formatDate(value: string): string {
  return date.format(new Date(`${value}T12:00:00-03:00`));
}

function formatInteger(value: number | null): string {
  return value === null ? 'Grupo pequeño' : integer.format(value);
}

function formatSigned(value: number | null): string {
  if (value === null) return 'Grupo pequeño';
  if (value === 0) return 'Sin diferencia';
  return `${value > 0 ? '+' : '−'}${integer.format(Math.abs(value))}`;
}

function categoryView(category: EmploymentActionsCategory): EmploymentActionsCategoryViewModel {
  const protectedCategory = category.privacyStatus === 'protected' ||
    category.current.events === null || category.prior.events === null || category.deltas.events === null;
  return {
    key: category.key,
    label: category.label,
    meaning: category.meaning,
    currentEvents: category.current.events,
    priorEvents: category.prior.events,
    deltaEvents: category.deltas.events,
    currentLabel: formatInteger(category.current.events),
    priorLabel: formatInteger(category.prior.events),
    deltaLabel: formatSigned(category.deltas.events),
    maxEvents: Math.max(category.current.events ?? 0, category.prior.events ?? 0, 1),
    protected: protectedCategory,
  };
}

export function buildEmploymentActionsViewModel(contract: EmploymentActionsContract): EmploymentActionsViewModel {
  const categories = contract.categories
    .map(categoryView)
    .sort((left, right) => (right.currentEvents ?? -1) - (left.currentEvents ?? -1) ||
      left.label.localeCompare(right.label, 'es'));
  const bucket = contract.protectedBucket.categoryCount > 0
    ? categoryView({
      key: 'other-protected',
      label: contract.protectedBucket.label,
      meaning: `${contract.protectedBucket.categoryCount} categorías pequeñas agrupadas.`,
      privacyStatus: contract.protectedBucket.privacyStatus,
      current: contract.protectedBucket.current,
      prior: contract.protectedBucket.prior,
      deltas: contract.protectedBucket.deltas,
    })
    : null;
  const classificationCoverage = Number(contract.classification.coveragePct);
  const joinIntegrity = Number(contract.coverage.joinIntegrityPct);
  const validRows = Number(contract.coverage.validRows);
  return {
    source: {
      snapshotLabel: formatDate(contract.source.snapshotAsOf),
      generatedLabel: formatDate(contract.source.generatedAt.slice(0, 10)),
      sourceFile: contract.source.sourceFile,
      sourceSha256: contract.source.sourceSha256,
      historicalLabel: `Información histórica hasta ${formatDate(contract.source.snapshotAsOf)} · no se actualiza en tiempo real`,
    },
    periods: {
      current: { ...contract.periods.current, rangeLabel: `${formatDate(contract.periods.current.startDate)} → ${formatDate(contract.periods.current.endDate)}` },
      prior: { ...contract.periods.prior, rangeLabel: `${formatDate(contract.periods.prior.startDate)} → ${formatDate(contract.periods.prior.endDate)}` },
    },
    comparison: {
      currentEvents: formatInteger(contract.comparison.current.actionEvents),
      priorEvents: formatInteger(contract.comparison.prior.actionEvents),
      currentPersons: formatInteger(contract.comparison.current.distinctPersons),
      priorPersons: formatInteger(contract.comparison.prior.distinctPersons),
      eventDelta: formatSigned(contract.comparison.deltas.actionEvents),
      personsDelta: formatSigned(contract.comparison.deltas.distinctPersons),
      currentActionsPerPerson: contract.comparison.current.actionsPerPerson === null ? 'No disponible' : decimal.format(contract.comparison.current.actionsPerPerson),
      priorActionsPerPerson: contract.comparison.prior.actionsPerPerson === null ? 'No disponible' : decimal.format(contract.comparison.prior.actionsPerPerson),
    },
    categories,
    protectedBucket: bucket,
    coverage: {
      validRows: Number.isFinite(validRows) ? integer.format(validRows) : 'No disponible',
      joinIntegrity: Number.isFinite(joinIntegrity) ? `${percentage.format(joinIntegrity)}%` : 'No disponible',
      categoryCoverage: Number.isFinite(classificationCoverage) ? `${percentage.format(classificationCoverage)}%` : 'No disponible',
    },
    limits: contract.limits.map(limit => limit.text),
  };
}
