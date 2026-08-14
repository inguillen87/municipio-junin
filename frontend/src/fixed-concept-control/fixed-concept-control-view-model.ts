import type {
  FixedConceptAdministrationWindow,
  FixedConceptControlContract,
  FixedConceptControlViewModel,
  FixedConceptReconciliationState,
  FixedConceptStateViewModel,
  FixedConceptWindowViewModel,
} from './fixed-concept-control-types';

const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const percentage = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'America/Argentina/Buenos_Aires' });
const month = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const STATE_PRESENTATION: Readonly<Record<FixedConceptReconciliationState['code'], {
  readonly explanation: string;
  readonly tone: FixedConceptStateViewModel['tone'];
}>> = Object.freeze({
  same_person_and_concept_observed: {
    explanation: 'La misma persona y el mismo concepto aparecen en el cálculo del período.',
    tone: 'matched',
  },
  person_observed_concept_absent: {
    explanation: 'La persona aparece en cálculo, pero ese concepto no fue observado.',
    tone: 'review',
  },
  person_not_observed_in_period: {
    explanation: 'La persona no aparece en ninguna fila válida del cálculo del período.',
    tone: 'not-observed',
  },
});

function formatDate(value: string): string {
  return date.format(new Date(`${value}T12:00:00-03:00`));
}

function formatPeriod(value: string): string {
  const [year = '0', monthNumber = '1'] = value.split('-');
  return month.format(new Date(Date.UTC(Number(year), Number(monthNumber) - 1, 1)));
}

function formatPercent(value: number): string {
  return `${percentage.format(value)}%`;
}

function signedInteger(value: number): string {
  if (value === 0) return 'Sin diferencia';
  return `${value > 0 ? '+' : '−'}${integer.format(Math.abs(value))}`;
}

function reconciliationState(
  state: FixedConceptReconciliationState,
  eligibleRows: number,
): FixedConceptStateViewModel {
  const presentation = STATE_PRESENTATION[state.code];
  return {
    code: state.code,
    label: state.label,
    explanation: presentation.explanation,
    rows: state.rows,
    rowsLabel: integer.format(state.rows),
    peopleLabel: integer.format(state.people),
    widthPct: eligibleRows > 0 ? state.rows / eligibleRows * 100 : 0,
    tone: presentation.tone,
  };
}

function administrationWindow(window: FixedConceptAdministrationWindow): FixedConceptWindowViewModel {
  return {
    code: window.code,
    label: window.label,
    dateRangeLabel: `${formatDate(window.startDate)} a ${formatDate(window.endDate)}`,
    daysLabel: `${integer.format(window.days)} días`,
    startRowsLabel: integer.format(window.startRows),
    peopleLabel: integer.format(window.distinctPeople),
    conceptsLabel: integer.format(window.concepts),
    stateCoverageLabel: `${integer.format(window.stateReportedRows)} de ${integer.format(window.startRows)}`,
    movementCoverageLabel: `${integer.format(window.movementTypeReportedRows)} de ${integer.format(window.startRows)}`,
    legalInstrumentRowsLabel: integer.format(window.legalInstrumentReportedRows),
  };
}

export function buildFixedConceptControlViewModel(
  contract: FixedConceptControlContract,
): FixedConceptControlViewModel {
  const reconciliation = contract.reconciliation;
  const states = reconciliation.states.map(state =>
    reconciliationState(state, reconciliation.eligibleFixedRows));
  const stateSummary = states.map(state => `${state.label}: ${state.rowsLabel}`).join('; ');
  const currentWindow = administrationWindow(contract.administrationComparison.current);
  const priorWindow = administrationWindow(contract.administrationComparison.prior);

  return {
    source: {
      canonicalSystem: contract.source.canonicalSystem,
      snapshotLabel: formatDate(contract.source.snapshotAsOf),
      generatedLabel: formatDate(contract.source.generatedAt.slice(0, 10)),
      sourceFile: contract.source.sourceFile,
      sourceSha256: contract.source.sourceSha256,
      notice: `Copia histórica al ${formatDate(contract.source.snapshotAsOf)} · no se actualiza en tiempo real`,
    },
    reconciliation: {
      periodLabel: formatPeriod(reconciliation.calculationPeriod),
      anchorLabel: formatDate(reconciliation.fixedEligibilityDate),
      eligibleRowsLabel: integer.format(reconciliation.eligibleFixedRows),
      eligiblePeopleLabel: integer.format(reconciliation.eligiblePeople),
      exactObservationRateLabel: formatPercent(reconciliation.exactObservationRatePct),
      accessibleSummary: `${integer.format(reconciliation.eligibleFixedRows)} filas elegibles. ${stateSummary}.`,
      states,
    },
    snapshot: {
      asOfLabel: formatDate(contract.snapshot.asOf),
      eligibleRowsLabel: integer.format(contract.snapshot.eligibleFixedRows),
      eligiblePeopleLabel: integer.format(contract.snapshot.eligiblePeople),
      stateReportedLabel: integer.format(contract.snapshot.authorizedStateRows),
      missingStateLabel: integer.format(contract.snapshot.missingStateRows),
      movementTypeLabel: integer.format(contract.snapshot.movementTypeReportedRows),
      legalInstrumentLabel: integer.format(contract.snapshot.legalInstrumentReportedRows),
      conceptsObservedLabel: integer.format(contract.snapshot.conceptsObserved),
      categorySummary: `${integer.format(contract.snapshot.categories.releasedCategoryCount)} categorías visibles · ${integer.format(contract.snapshot.categories.protectedCategoryCount)} protegidas`,
      categories: contract.snapshot.categories.rows.map(row => ({
        label: row.label,
        rowsLabel: integer.format(row.rows),
        peopleLabel: integer.format(row.people),
        protected: row.privacyStatus === 'protected_aggregate',
      })),
    },
    comparison: {
      windows: [currentWindow, priorWindow],
      differenceRowsLabel: signedInteger(contract.administrationComparison.differences.startRows),
      differencePeopleLabel: signedInteger(contract.administrationComparison.differences.distinctPeople),
      interpretation: contract.administrationComparison.interpretation,
    },
    coverage: {
      sourceRowsLabel: integer.format(contract.coverage.sourceFixedRows),
      validRangeRowsLabel: integer.format(contract.coverage.validRangeRows),
      validRangeRateLabel: formatPercent(contract.coverage.validRangeRatePct),
      endBeforeStartRowsLabel: integer.format(contract.coverage.endBeforeStartRows),
      missingEndRowsLabel: integer.format(contract.coverage.missingEndRows),
      legajoJoinCoverageLabel: formatPercent(contract.coverage.legajoJoinCoveragePct),
      catalogCoverageLabel: `${integer.format(contract.coverage.catalogMatchedRows)} de ${integer.format(contract.coverage.sourceFixedRows)}`,
    },
    quality: {
      statusLabel: contract.quality.status === 'attention_required' ? 'Requiere revisión' : 'Sin observaciones',
      signals: contract.quality.signals.map(signal => ({
        code: signal.code,
        label: signal.label,
        severityLabel: signal.severity === 'high' ? 'Prioridad alta' : 'Prioridad media',
        severity: signal.severity,
        rowsLabel: integer.format(signal.rows),
        rateLabel: formatPercent(signal.ratePct),
        meaning: signal.meaning,
      })),
    },
    limits: contract.limits.map(limit => limit.text),
  };
}
