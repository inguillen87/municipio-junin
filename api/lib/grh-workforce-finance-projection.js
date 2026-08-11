import {
  GRH_WORKFORCE_FINANCE_SOURCE_COMPONENT_KEYS,
  inspectGrhWorkforceFinanceSourceContract,
} from './grh-workforce-finance-source-contract.js';
import {
  GRH_WORKFORCE_FINANCE_SCHEMA_VERSION,
  inspectGrhWorkforceFinanceContract,
} from './grh-workforce-finance-contract.js';

const COMPONENT_NAMES = Object.freeze({
  gross_with_family_allowances_cents: 'grossWithFamilyAllowancesCents',
  contributory_earnings_cents: 'contributoryEarningsCents',
  non_contributory_earnings_cents: 'nonContributoryEarningsCents',
  family_allowances_cents: 'familyAllowancesCents',
  employee_withholdings_cents: 'employeeWithholdingsCents',
  net_payroll_cents: 'netPayrollCents',
  net_to_pay_cents: 'netToPayCents',
  employer_contributions_cents: 'employerContributionsCents',
});

const DIMENSION_NAMES = Object.freeze({
  sector: 'sector',
  cost_center: 'costCenter',
  agreement: 'agreement',
});

const PRESENTATION_KEYS = Object.freeze([
  'schemaVersion', 'locale', 'displayCurrencyCode', 'basis', 'effectiveFrom',
  'sourceCurrencyStatus',
]);

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys) {
  if (!plainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function projectionError(code, message, details = []) {
  const error = new Error(message);
  error.code = code;
  error.details = Object.freeze([...details]);
  return error;
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

function inspectPresentation(presentation) {
  const errors = [];
  if (!exactKeys(presentation, PRESENTATION_KEYS)) errors.push('presentation.structure');
  if (presentation?.schemaVersion !== 'tenant-presentation-v1') errors.push('presentation.schema');
  if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(presentation?.locale || '')) {
    errors.push('presentation.locale');
  }
  if (!/^[A-Z]{3}$/.test(presentation?.displayCurrencyCode || '')) {
    errors.push('presentation.currency');
  }
  if (presentation?.basis !== 'tenant_configuration') errors.push('presentation.basis');
  if (!validDate(presentation?.effectiveFrom)) errors.push('presentation.effective_from');
  if (presentation?.sourceCurrencyStatus !== 'not_declared_in_source') {
    errors.push('presentation.source_currency_status');
  }
  return errors;
}

function components(value) {
  return Object.fromEntries(GRH_WORKFORCE_FINANCE_SOURCE_COMPONENT_KEYS.map(
    sourceKey => [COMPONENT_NAMES[sourceKey], value[sourceKey]],
  ));
}

function control(value) {
  return {
    netIdentityVarianceCents: value.net_identity_variance_cents,
    netToPayVarianceCents: value.net_to_pay_variance_cents,
    roundingToleranceCents: value.rounding_tolerance_cents,
    identityExactlyReconciled: value.identity_exactly_reconciled,
    identityWithinRoundingTolerance: value.identity_within_rounding_tolerance,
  };
}

function reconciliation(value) {
  return {
    calculationRuns: value.calculation_runs,
    totpagoRuns: value.totpago_runs,
    matchedRuns: value.matched_runs,
    fullyReconciledRuns: value.fully_reconciled_runs,
    runCoveragePct: value.run_coverage_pct,
    metricExactRatePct: value.metric_exact_rate_pct,
    valueAgreementPct: value.value_agreement_pct,
    absoluteVarianceCents: value.absolute_variance_cents,
  };
}

function change(value) {
  return {
    status: value.status,
    reason: value.reason,
    previousPeriod: value.previous_period,
    distinctParticipantsDelta: value.distinct_participants_delta,
    grossWithFamilyAllowancesDeltaCents: value.gross_with_family_allowances_delta_cents,
    employeeWithholdingsDeltaCents: value.employee_withholdings_delta_cents,
    netPayrollDeltaCents: value.net_payroll_delta_cents,
    employerContributionsDeltaCents: value.employer_contributions_delta_cents,
    netPayrollDeltaPct: value.net_payroll_delta_pct,
  };
}

function cell(value) {
  return {
    companyCode: value.company_code,
    sourceCode: value.source_code,
    label: value.label,
    distinctParticipantsObserved: value.distinct_participants_observed,
    participantDisplay: value.participant_display,
    participantPrivacyStatus: value.participant_privacy_status,
    allocationSharePct: value.allocation_share_pct,
    privacyStatus: value.privacy_status,
    components: components(value.components),
    control: control(value.control),
    change: change(value.change),
  };
}

function participantAccounting(value) {
  return {
    periodDistinctParticipants: value.period_distinct_participants,
    sumCellDistinctParticipantsObserved: value.sum_cell_distinct_participants_observed,
    multiCategoryParticipants: value.multi_category_participants,
    multiCategoryParticipantDisplay: value.multi_category_participant_display,
    multiCategoryPrivacyStatus: value.multi_category_privacy_status,
    participantsMayOverlap: value.participants_may_overlap,
  };
}

function dimensionView(value) {
  return {
    dimension: DIMENSION_NAMES[value.dimension],
    assignmentSemantics: value.assignment_semantics,
    periods: value.periods.map(period => ({
      period: period.period,
      privacyStatus: period.privacy_status,
      participantAccounting: participantAccounting(period.participant_accounting),
      cells: period.cells.map(cell),
    })),
  };
}

function periodTotal(value) {
  return {
    period: value.period,
    participantCount: value.participant_count,
    participantDisplay: value.participant_display,
    privacyStatus: value.privacy_status,
    components: components(value.components),
    control: control(value.control),
    reconciliation: reconciliation(value.reconciliation),
  };
}

function dimensionRow(value) {
  return { ...value, dimension: DIMENSION_NAMES[value.dimension] };
}

function quality(value) {
  return {
    calculation: {
      sourceRows: value.calculation.source_rows,
      validRows: value.calculation.valid_rows,
      quarantineRows: value.calculation.quarantine_rows,
      validRatePct: value.calculation.valid_rate_pct,
      windowRows: value.calculation.window_rows,
      windowControlRows: value.calculation.window_control_rows,
      windowPeriods: value.calculation.window_periods,
    },
    references: value.references.map(row => ({
      dimension: DIMENSION_NAMES[row.dimension],
      observedCodes: row.observed_codes,
      resolvedCodes: row.resolved_codes,
      unresolvedCodes: row.unresolved_codes,
      observedControlRuns: row.observed_control_runs,
      resolvedControlRuns: row.resolved_control_runs,
      coveragePct: row.coverage_pct,
    })),
    assignment: {
      employeePeriodRuns: value.assignment.employee_period_runs,
      invalidEmployeePeriodRuns: value.assignment.invalid_employee_period_runs,
      dimensionRunChecks: value.assignment.dimension_run_checks.map(row => ({
        dimension: DIMENSION_NAMES[row.dimension],
        employeePeriodRuns: row.employee_period_runs,
        validRuns: row.valid_runs,
        ambiguousRuns: row.ambiguous_runs,
        missingCodeRuns: row.missing_code_runs,
        unresolvedReferenceRuns: row.unresolved_reference_runs,
        invalidEmployeeKeyRuns: row.invalid_employee_key_runs,
        coveragePct: row.coverage_pct,
      })),
      multiCategoryEmployeePeriods: value.assignment.multi_category_employee_periods.map(row => ({
        dimension: DIMENSION_NAMES[row.dimension],
        employeePeriods: row.employee_periods,
        multiCategoryEmployeePeriods: row.multi_category_employee_periods,
        multiCategoryPct: row.multi_category_pct,
      })),
    },
    participantSetReconciliation: {
      periodsChecked: value.participant_set_reconciliation.periods_checked,
      exactPeriods: value.participant_set_reconciliation.exact_periods,
      mismatchedPeriods: value.participant_set_reconciliation.mismatched_periods,
      allCalculoEmployeePeriods: value.participant_set_reconciliation.all_calculo_employee_periods,
      controlEmployeePeriods: value.participant_set_reconciliation.control_employee_periods,
      controlCohortUsedForFinance: value.participant_set_reconciliation.control_cohort_used_for_finance,
    },
    amountSigns: {
      periodsChecked: value.amount_signs.periods_checked,
      periodsWithNonpositiveNetPayroll: value.amount_signs.periods_with_nonpositive_net_payroll,
      negativePeriodComponents: components(value.amount_signs.negative_period_components),
      dimensions: value.amount_signs.dimensions.map(row => ({
        dimension: DIMENSION_NAMES[row.dimension],
        cellsChecked: row.cells_checked,
        negativeComponentCells: components(row.negative_component_cells),
        allocationPeriodsAvailable: row.allocation_periods_available,
        allocationPeriodsUnavailable: row.allocation_periods_unavailable,
      })),
    },
    partitionChecks: value.partition_checks.map(row => ({
      ...dimensionRow({
        dimension: row.dimension,
        periodsChecked: row.periods_checked,
        componentIdentityFailures: row.component_identity_failures,
        netAllocationIdentityFailures: row.net_allocation_identity_failures,
        allocationShareFailures: row.allocation_share_failures,
      }),
    })),
    warnings: [...value.warnings],
  };
}

function buildProjection(source, presentation) {
  return {
    schemaVersion: GRH_WORKFORCE_FINANCE_SCHEMA_VERSION,
    policyVersion: source.policy_version,
    releaseId: source.release_id,
    source: {
      canonicalSystem: source.source.canonical_system,
      sourceFile: source.source.file,
      sourceSha256: source.source.sha256,
      compressedSizeBytes: source.source.compressed_size_bytes,
      snapshotAsOf: source.source.snapshot_as_of,
      generatedAt: source.source.generated_at,
      latestValidCalculationPeriod: source.source.latest_valid_calculation_period,
      profileSchemaVersion: source.source.profile_schema_version,
      semanticSchemaVersion: source.source.semantic_schema_version,
      realtime: source.source.realtime,
    },
    metric: {
      grain: source.metric.grain,
      sourceCurrencyStatus: source.metric.currency,
      amountUnit: source.metric.amount_unit,
      presentationSchemaVersion: presentation.schemaVersion,
      presentationCurrency: presentation.displayCurrencyCode,
      presentationCurrencyBasis: presentation.basis,
      presentationCurrencyEffectiveOn: presentation.effectiveFrom,
      presentationLocale: presentation.locale,
      status: source.metric.status,
      allocationBasis: source.metric.allocation_basis,
      allocationRule: source.metric.allocation_rule,
      interpretation: source.metric.interpretation,
    },
    cohort: {
      participantDefinition: source.cohort.participant_definition,
      assignmentMode: source.cohort.assignment_mode,
      assignmentGrain: source.cohort.assignment_grain,
      assignmentSemantics: source.cohort.assignment_semantics,
      publishedWindowMonths: source.cohort.published_window_months,
      firstPeriod: source.cohort.first_period,
      lastPeriod: source.cohort.last_period,
      oneWayDimensions: source.cohort.one_way_dimensions.map(item => DIMENSION_NAMES[item]),
      participantsMayOverlapAcrossCategories: source.cohort.participants_may_overlap_across_categories,
    },
    privacy: {
      threshold: source.privacy.threshold,
      aggregateOnly: source.privacy.aggregate_only,
      containsPii: source.privacy.contains_pii,
      employeeIdentifiersExported: source.privacy.employee_identifiers_exported,
      rawRowsExported: source.privacy.raw_rows_exported,
      arbitraryFiltersAllowed: source.privacy.arbitrary_filters_allowed,
      intersectionsAllowed: source.privacy.intersections_allowed,
      primarySuppression: source.privacy.primary_suppression,
      complementarySuppression: source.privacy.complementary_suppression,
      crossPeriodProtection: source.privacy.cross_period_protection,
      smallOverlapProtection: source.privacy.small_overlap_protection,
      releasedAmountsRemainArithmeticallyComparable:
        source.privacy.released_amounts_remain_arithmetically_comparable,
      protectedBucketLabel: source.privacy.protected_bucket_label,
    },
    capabilities: {
      cohortFinance: source.capabilities.cohort_finance,
      cellArithmeticControl: source.capabilities.cell_arithmetic_control,
      periodCrossSourceReconciliation: source.capabilities.period_cross_source_reconciliation,
      cohortCrossSourceReconciliation: source.capabilities.cohort_cross_source_reconciliation,
      cohortAbsence: source.capabilities.cohort_absence,
      cohortLeave: source.capabilities.cohort_leave,
    },
    periodTotals: source.period_totals.map(periodTotal),
    dimensionViews: source.dimension_views.map(dimensionView),
    quality: quality(source.quality),
  };
}

export function buildGrhWorkforceFinanceProjection(source, { presentation } = {}) {
  const sourceInspection = inspectGrhWorkforceFinanceSourceContract(source);
  if (!sourceInspection.ok) {
    throw projectionError(
      'GRH_WORKFORCE_FINANCE_SOURCE_INVALID',
      'El artefacto workforce-finance no supera el contrato de origen.',
      sourceInspection.errors,
    );
  }
  const presentationErrors = inspectPresentation(presentation);
  if (presentationErrors.length > 0) {
    throw projectionError(
      'GRH_WORKFORCE_FINANCE_PRESENTATION_INVALID',
      'La presentacion monetaria del tenant no esta configurada.',
      presentationErrors,
    );
  }
  const projection = buildProjection(source, presentation);
  const projectionInspection = inspectGrhWorkforceFinanceContract(projection);
  if (!projectionInspection.ok) {
    throw projectionError(
      'GRH_WORKFORCE_FINANCE_PROJECTION_INVALID',
      'La proyeccion workforce-finance no supera el contrato.',
      projectionInspection.errors,
    );
  }
  return deepFreeze(projection);
}
