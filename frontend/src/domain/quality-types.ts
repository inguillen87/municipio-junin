export type TemporalDomainKey = 'ausencia' | 'calculo' | 'legamov' | 'licencia' | 'totpago';

export type ReferentialFactKey = 'calculo' | 'legamov' | 'ausencia' | 'licencia';

export type QualityComponentKey =
  | 'temporalValidity'
  | 'referentialIntegrity'
  | 'payrollReconciliation'
  | 'legajoKeyUniqueness';

export interface QualitySource {
  readonly canonicalSystem: string;
  readonly sourceFile: string;
  readonly sourceSha256: string;
  readonly snapshotAsOf: string;
  readonly compressedSizeBytes: number;
  readonly realtime: false;
  readonly excludedSources: readonly ['personas_junin'];
}

export interface QualityLineage {
  readonly profileSchemaVersion: 'grh-profile-v1';
  readonly semanticSchemaVersion: string;
  readonly profileGeneratedAt: string;
  readonly semanticGeneratedAt: string;
}

export interface QualityPrivacy {
  readonly aggregateOnly: true;
  readonly containsPii: false;
  readonly employeeIdentifiersExported: false;
  readonly rawRowsExported: false;
  readonly categoricalLabelsExported: false;
  readonly cellCodesExported: false;
  readonly monetarySeriesExported: false;
}

export interface InventoryGroup {
  readonly totalTables: number;
  readonly nonEmptyTables: number;
  readonly emptyTables: number;
  readonly totalRows: number;
}

export interface QualityInventory {
  readonly all: InventoryGroup;
  readonly focal: InventoryGroup;
  readonly remainder: InventoryGroup;
}

export interface QualityComponent {
  readonly score: number;
  readonly weightPct: number;
}

export interface QualityRisks {
  readonly rawSourceContainsSensitivePii: true;
  readonly historicalSnapshotNotRealtime: boolean;
  readonly currencyNotDeclaredInSource: boolean;
  readonly legacyImportErrorRows: number;
  readonly quarantinedTemporalRows: number;
  readonly totpagoCrossSourceMismatch: boolean;
  readonly calculationControlAnomalousPeriods: number;
  readonly latestCalculationControlWithinRoundingTolerance: boolean;
  readonly suspiciousTextEncodingLabelCount: number;
}

export interface QualityScore {
  readonly score: number;
  readonly scope: 'governed_aggregate_extract_not_fitness_of_every_raw_grh_table';
  readonly components: Readonly<Record<QualityComponentKey, QualityComponent>>;
  readonly risks: QualityRisks;
}

export interface TemporalDomain {
  readonly rows: number;
  readonly validRows: number;
  readonly quarantineRows: number;
  readonly validRatePct: number;
  readonly validPeriods: number;
  readonly firstValidPeriod: string;
  readonly lastValidPeriod: string;
  readonly firstValidYear: number;
  readonly lastValidYear: number;
  readonly dateMonthMismatchRows: number;
  readonly quarantineReasonOccurrences: number;
}

export interface QualityTemporal {
  readonly rows: number;
  readonly validRows: number;
  readonly quarantineRows: number;
  readonly validRatePct: number;
  readonly dateMonthMismatchRows: number;
  readonly quarantineReasonOccurrences: number;
  readonly domains: Readonly<Record<TemporalDomainKey, TemporalDomain>>;
}

export interface ReferentialLegajo {
  readonly rows: number;
  readonly uniqueKeys: number;
  readonly uniquenessPct: number;
}

export interface ReferentialFact {
  readonly rows: number;
  readonly matchedRows: number;
  readonly orphanRows: number;
  readonly joinIntegrityPct: number;
  readonly distinctEmployeeKeys: number;
  readonly validMatchedEmployeeKeys: number;
  readonly employeeCoveragePct: number;
}

export interface QualityReferential {
  readonly legajo: ReferentialLegajo;
  readonly facts: Readonly<Record<ReferentialFactKey, ReferentialFact>>;
}

export interface QualityReconciliation {
  readonly status: 'reconciled' | 'material_differences_detected';
  readonly totpagoDiagnosticStatus: 'not_cross_source_reconciled';
  readonly metricStatus: 'calculation_control_not_bank_disbursement';
  readonly currencyStatus: 'not_declared_in_source';
  readonly toleranceCents: number;
  readonly calculationRuns: number;
  readonly totpagoRuns: number;
  readonly unionRuns: number;
  readonly matchedRuns: number;
  readonly fullyReconciledRuns: number;
  readonly runCoveragePct: number;
  readonly metricExactRatePct: number;
  readonly valueAgreementPct: number;
  readonly scorePct: number;
  readonly absoluteVarianceCents: number;
}

export interface QualityContract {
  readonly schemaVersion: 'grh-quality-v1';
  readonly source: QualitySource;
  readonly lineage: QualityLineage;
  readonly privacy: QualityPrivacy;
  readonly inventory: QualityInventory;
  readonly quality: QualityScore;
  readonly temporal: QualityTemporal;
  readonly referential: QualityReferential;
  readonly reconciliation: QualityReconciliation;
}

export type QualityKpiKey =
  | 'quality'
  | 'quarantine'
  | 'reconciliation'
  | 'referential'
  | 'tables'
  | 'rows';

export interface QualityKpiViewModel {
  readonly key: QualityKpiKey;
  readonly label: string;
  readonly value: string;
  readonly note: string;
  readonly title?: string;
  readonly tone: 'green' | 'amber' | 'red' | 'cyan' | 'violet' | 'neutral';
}

export interface QualityComponentViewModel {
  readonly key: QualityComponentKey;
  readonly label: string;
  readonly score: number;
  readonly weightPct: number;
  readonly scoreLabel: string;
  readonly weightLabel: string;
}

export interface QualityCompositionViewModel {
  readonly badge: string;
  readonly formula: string;
  readonly components: readonly QualityComponentViewModel[];
}

export interface ReconciliationMetricViewModel {
  readonly key: 'runCoverage' | 'metricExactness' | 'valueAgreement';
  readonly label: string;
  readonly value: string;
}

export interface ReconciliationViewModel {
  readonly score: string;
  readonly context: string;
  readonly metrics: readonly ReconciliationMetricViewModel[];
  readonly warning: string;
}

export interface TemporalDomainViewModel {
  readonly key: TemporalDomainKey;
  readonly label: string;
  readonly source: string;
  readonly validRows: number;
  readonly validRowsLabel: string;
  readonly quarantineRows: number;
  readonly quarantineRowsLabel: string;
  readonly validRatePct: number;
  readonly validRateLabel: string;
  readonly firstValidPeriod: string;
  readonly lastValidPeriod: string;
}

export interface TemporalViewModel {
  readonly badge: string;
  readonly reasonNote: string;
  readonly domains: readonly TemporalDomainViewModel[];
}

export interface CoverageRowViewModel {
  readonly key: ReferentialFactKey;
  readonly label: string;
  readonly rows: number;
  readonly rowsLabel: string;
  readonly joinIntegrityPct: number;
  readonly joinIntegrityLabel: string;
  readonly orphanRows: number;
  readonly orphanRowsLabel: string;
  readonly employeeCoveragePct: number;
  readonly employeeCoverageLabel: string;
}

export interface CoverageViewModel {
  readonly badge: string;
  readonly rows: readonly CoverageRowViewModel[];
}

export interface LineageStepViewModel {
  readonly index: string;
  readonly title: string;
  readonly detail: string;
  readonly state: 'Validado';
}

export interface RiskViewModel {
  readonly level: 'guarded' | 'high' | 'medium';
  readonly mark: string;
  readonly title: string;
  readonly detail: string;
}

export interface RiskRegisterViewModel {
  readonly badge: string;
  readonly items: readonly RiskViewModel[];
}

export interface ActionViewModel {
  readonly index: string;
  readonly title: string;
  readonly detail: string;
}

export interface QualitySourceViewModel {
  readonly snapshotDate: string;
  readonly snapshotMeta: string;
  readonly profileSchema: string;
  readonly semanticSchema: string;
  readonly sourceFile: string;
  readonly sourceHash: string;
  readonly sourceSize: string;
  readonly sourceSnapshot: string;
  readonly profileGeneratedAt: string;
  readonly semanticGeneratedAt: string;
}

export interface QualityViewModel {
  readonly source: QualitySourceViewModel;
  readonly kpis: readonly QualityKpiViewModel[];
  readonly quality: QualityCompositionViewModel;
  readonly reconciliation: ReconciliationViewModel;
  readonly temporal: TemporalViewModel;
  readonly coverage: CoverageViewModel;
  readonly lineage: readonly LineageStepViewModel[];
  readonly risks: RiskRegisterViewModel;
  readonly actions: readonly ActionViewModel[];
  readonly privacyStatus: string;
}
