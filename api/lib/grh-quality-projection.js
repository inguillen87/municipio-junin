import {
  inspectGrhProfileContract,
  inspectGrhSemanticContract,
} from './grh-contract.js';
import {
  GRH_QUALITY_SCHEMA_VERSION,
  GRH_QUALITY_SCOPE,
  GRH_REFERENTIAL_FACTS,
  GRH_TEMPORAL_DOMAINS,
  inspectGrhQualityContract,
} from './grh-quality-contract.js';

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

function round4(value) {
  return Number(Number(value).toFixed(4));
}

function percentage(numerator, denominator) {
  return denominator === 0 ? 0 : round4((numerator / denominator) * 100);
}

function sourceIdentityErrors(profile, semantic) {
  const errors = [];
  const sourcePairs = [
    ['source_file', profile.source, semantic.source.file],
    ['source_sha256', profile.sha256, semantic.source.sha256],
    ['snapshot', profile.snapshot_as_of, semantic.source.snapshot_as_of],
    ['compressed_size', profile.compressed_size_bytes, semantic.source.compressed_size_bytes],
    ['canonical_system', profile.canonical_source, semantic.source.canonical_system],
  ];
  for (const [field, profileValue, semanticValue] of sourcePairs) {
    if (profileValue !== semanticValue) errors.push(`source.${field}_identity`);
  }
  if (JSON.stringify(profile.excluded_sources) !==
    JSON.stringify(semantic.privacy.excluded_sources)) {
    errors.push('source.excluded_sources_identity');
  }

  const dictionaryRows = semantic.table_dictionary.tables;
  if (profile.tables_profiled !== semantic.table_dictionary.total_tables ||
      dictionaryRows.length !== semantic.table_dictionary.total_tables) {
    errors.push('inventory.total_table_count_identity');
  }
  for (const [table, rows] of Object.entries(profile.row_counts)) {
    const matches = dictionaryRows.filter(item => item.table === table);
    if (matches.length !== 1) errors.push('inventory.focal_table_presence');
    if (matches.length !== 1 || matches[0].rows !== rows) {
      errors.push('inventory.focal_row_count_identity');
    }
  }
  return [...new Set(errors)];
}

function inventoryGroup(totalTables, nonEmptyTables, emptyTables, totalRows) {
  return { totalTables, nonEmptyTables, emptyTables, totalRows };
}

function buildInventory(profile, semantic) {
  const all = semantic.table_dictionary;
  const focalRows = Object.values(profile.row_counts);
  const focal = inventoryGroup(
    focalRows.length,
    focalRows.filter(rows => rows > 0).length,
    focalRows.filter(rows => rows === 0).length,
    focalRows.reduce((sum, rows) => sum + rows, 0),
  );
  return {
    all: inventoryGroup(
      all.total_tables,
      all.non_empty_tables,
      all.empty_tables,
      all.total_rows,
    ),
    focal,
    remainder: inventoryGroup(
      all.total_tables - focal.totalTables,
      all.non_empty_tables - focal.nonEmptyTables,
      all.empty_tables - focal.emptyTables,
      all.total_rows - focal.totalRows,
    ),
  };
}

function buildTemporal(semantic) {
  const domains = {};
  for (const domain of GRH_TEMPORAL_DOMAINS) {
    const source = semantic.period_quality[domain];
    domains[domain] = {
      rows: source.rows,
      validRows: source.valid_rows,
      quarantineRows: source.quarantine_rows,
      validRatePct: round4(source.valid_rate_pct),
      validPeriods: source.valid_periods,
      firstValidPeriod: source.first_valid_period,
      lastValidPeriod: source.last_valid_period,
      firstValidYear: source.first_valid_year,
      lastValidYear: source.last_valid_year,
      dateMonthMismatchRows: source.date_month_mismatch_rows,
      quarantineReasonOccurrences: Object.values(source.quarantine_reason_occurrences)
        .reduce((sum, count) => sum + count, 0),
    };
  }

  const totals = {
    rows: 0,
    validRows: 0,
    quarantineRows: 0,
    dateMonthMismatchRows: 0,
    quarantineReasonOccurrences: 0,
  };
  for (const row of Object.values(domains)) {
    for (const field of Object.keys(totals)) totals[field] += row[field];
  }
  return {
    ...totals,
    validRatePct: percentage(totals.validRows, totals.rows),
    domains,
  };
}

function buildReferential(semantic) {
  const facts = {};
  for (const fact of GRH_REFERENTIAL_FACTS) {
    const source = semantic.coverage.facts[fact];
    facts[fact] = {
      rows: source.rows,
      matchedRows: source.matched_rows,
      orphanRows: source.orphan_rows,
      joinIntegrityPct: round4(source.join_integrity_pct),
      distinctEmployeeKeys: source.distinct_employee_keys,
      validMatchedEmployeeKeys: source.valid_matched_employee_keys,
      employeeCoveragePct: round4(source.employee_coverage_pct),
    };
  }
  return {
    legajo: {
      rows: semantic.coverage.legajo_rows,
      uniqueKeys: semantic.coverage.unique_legajo_keys,
      uniquenessPct: percentage(
        semantic.coverage.unique_legajo_keys,
        semantic.coverage.legajo_rows,
      ),
    },
    facts,
  };
}

function buildReconciliation(semantic) {
  const payroll = semantic.payroll;
  const source = payroll.cross_source_reconciliation;
  return {
    status: source.status,
    totpagoDiagnosticStatus: payroll.totpago_diagnostic_status,
    metricStatus: payroll.executive_metric_status,
    currencyStatus: payroll.currency,
    toleranceCents: source.tolerance_cents,
    calculationRuns: source.calculation_runs,
    totpagoRuns: source.totpago_runs,
    unionRuns: source.calculation_runs + source.totpago_runs - source.matched_runs,
    matchedRuns: source.matched_runs,
    fullyReconciledRuns: source.fully_reconciled_runs,
    runCoveragePct: round4(source.run_coverage_pct),
    metricExactRatePct: round4(source.metric_exact_rate_pct),
    valueAgreementPct: round4(source.value_agreement_pct),
    scorePct: round4(source.score_pct),
    absoluteVarianceCents: source.absolute_variance_cents,
  };
}

function buildQuality(semantic) {
  const components = semantic.quality.components;
  const risks = semantic.quality.risk_flags;
  return {
    score: Number(semantic.quality.score.toFixed(2)),
    scope: GRH_QUALITY_SCOPE,
    components: {
      temporalValidity: {
        score: Number(components.temporal_validity.score.toFixed(2)),
        weightPct: components.temporal_validity.weight_pct,
      },
      referentialIntegrity: {
        score: Number(components.referential_integrity.score.toFixed(2)),
        weightPct: components.referential_integrity.weight_pct,
      },
      payrollReconciliation: {
        score: Number(components.payroll_reconciliation.score.toFixed(2)),
        weightPct: components.payroll_reconciliation.weight_pct,
      },
      legajoKeyUniqueness: {
        score: Number(components.legajo_key_uniqueness.score.toFixed(2)),
        weightPct: components.legajo_key_uniqueness.weight_pct,
      },
    },
    risks: {
      rawSourceContainsSensitivePii: risks.raw_source_contains_sensitive_pii,
      historicalSnapshotNotRealtime: risks.historical_snapshot_not_realtime,
      currencyNotDeclaredInSource: risks.currency_not_declared_in_source,
      legacyImportErrorRows: risks.legacy_import_error_rows,
      quarantinedTemporalRows: risks.quarantined_temporal_rows,
      totpagoCrossSourceMismatch: risks.totpago_cross_source_mismatch,
      calculationControlAnomalousPeriods: risks.calculation_control_anomalous_periods,
      latestCalculationControlWithinRoundingTolerance:
        risks.latest_calculation_control_within_rounding_tolerance,
      suspiciousTextEncodingLabelCount: risks.suspicious_text_encoding_labels,
    },
  };
}

export function buildGrhQualityProjection(profile, semantic) {
  const profileInspection = inspectGrhProfileContract(profile);
  const semanticInspection = inspectGrhSemanticContract(semantic);
  const sourceErrors = [
    ...profileInspection.errors,
    ...semanticInspection.errors,
  ];
  if (sourceErrors.length > 0) {
    throw projectionError(
      'GRH_QUALITY_SOURCE_INVALID',
      'El bundle GRH no es apto para la proyección segura de calidad.',
      sourceErrors,
    );
  }

  const identityErrors = sourceIdentityErrors(profile, semantic);
  if (identityErrors.length > 0) {
    throw projectionError(
      'GRH_QUALITY_SOURCE_IDENTITY_INVALID',
      'El perfil y el modelo semántico GRH no pertenecen al mismo inventario.',
      identityErrors,
    );
  }

  const projection = {
    schemaVersion: GRH_QUALITY_SCHEMA_VERSION,
    source: {
      canonicalSystem: semantic.source.canonical_system,
      sourceFile: semantic.source.file,
      sourceSha256: semantic.source.sha256,
      snapshotAsOf: semantic.source.snapshot_as_of,
      compressedSizeBytes: semantic.source.compressed_size_bytes,
      realtime: semantic.source.realtime,
      excludedSources: [...semantic.privacy.excluded_sources],
    },
    lineage: {
      profileSchemaVersion: profile.schema_version,
      semanticSchemaVersion: semantic.schema_version,
      profileGeneratedAt: profile.generated_at,
      semanticGeneratedAt: semantic.source.generated_at,
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
    inventory: buildInventory(profile, semantic),
    quality: buildQuality(semantic),
    temporal: buildTemporal(semantic),
    referential: buildReferential(semantic),
    reconciliation: buildReconciliation(semantic),
  };

  const outputInspection = inspectGrhQualityContract(projection);
  if (!outputInspection.ok) {
    throw projectionError(
      'GRH_QUALITY_PROJECTION_INVALID',
      'La proyección de calidad GRH no supera el contrato de publicación.',
      outputInspection.errors,
    );
  }
  return deepFreeze(projection);
}
