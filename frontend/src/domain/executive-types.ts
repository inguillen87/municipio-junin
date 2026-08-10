export type ExecutiveCode = string | number;

export interface ExecutiveSource {
  readonly canonicalSystem: string;
  readonly sourceFile: string;
  readonly sourceSha256: string;
  readonly snapshotAsOf: string;
  readonly realtime: false;
}

export interface ExecutivePrivacy {
  readonly audience: 'interactive';
  readonly interactiveThreshold: 5;
  readonly sensitiveThreshold: 10;
  readonly portableThreshold: 10;
  readonly protectedBucketLabel: 'Otros (celdas protegidas)';
}

export interface ReleasedRankingRow {
  readonly companyCode: ExecutiveCode;
  readonly sourceCode: ExecutiveCode;
  readonly label: string;
  readonly participants: number;
  readonly participantDisplay: string;
  readonly sharePct: number;
  readonly privacyStatus: 'released';
}

export interface ProtectedRankingRow {
  readonly companyCode: null;
  readonly sourceCode: null;
  readonly label: 'Otros (celdas protegidas)';
  readonly participants: number;
  readonly participantDisplay: string;
  readonly sharePct: number;
  readonly privacyStatus: 'protected_aggregate';
}

export type ExecutiveRankingRow = ReleasedRankingRow | ProtectedRankingRow;

export interface ExecutiveRanking {
  readonly threshold: number;
  readonly totalParticipants: number;
  readonly participantDisplay: string;
  readonly privacyStatus: 'released' | 'partially_suppressed';
  readonly rows: readonly ExecutiveRankingRow[];
}

export interface ExecutiveWorkforce {
  readonly definition: string;
  readonly referencePeriod: string;
  readonly payrollParticipants: number;
  readonly bySector: ExecutiveRanking;
  readonly byCostCenter: ExecutiveRanking;
  readonly byAgreement: ExecutiveRanking;
}

export interface ExecutiveAmounts {
  readonly grossWithFamilyAllowancesCents: number;
  readonly employeeWithholdingsCents: number;
  readonly netPayrollCents: number;
  readonly employerContributionsCents: number;
}

export interface SuppressedExecutiveAmounts {
  readonly grossWithFamilyAllowancesCents: null;
  readonly employeeWithholdingsCents: null;
  readonly netPayrollCents: null;
  readonly employerContributionsCents: null;
}

export interface ReleasedMonetaryRow {
  readonly period: string;
  readonly participantCount: number;
  readonly participantDisplay: string;
  readonly privacyStatus: 'released';
  readonly amounts: ExecutiveAmounts;
}

export interface SuppressedMonetaryRow {
  readonly period: string | null;
  readonly participantCount: null;
  readonly participantDisplay: '<10';
  readonly privacyStatus: 'suppressed';
  readonly amounts: SuppressedExecutiveAmounts;
}

export type ExecutiveMonetaryRow = ReleasedMonetaryRow | SuppressedMonetaryRow;

export interface ExecutiveCompensation {
  readonly currency: 'not_declared_in_source';
  readonly amountUnit: 'source_currency_cents';
  readonly metricStatus: 'calculation_control_not_bank_disbursement';
  readonly series: readonly ExecutiveMonetaryRow[];
}

export interface ReleasedSensitiveRow {
  readonly period: string;
  readonly value: number;
  readonly participantCount: number;
  readonly participantDisplay: string;
  readonly privacyStatus: 'released';
}

export interface SuppressedSensitiveRow {
  readonly period: string | null;
  readonly value: null;
  readonly participantCount: null;
  readonly participantDisplay: '<10';
  readonly privacyStatus: 'suppressed';
}

export type ExecutiveSensitiveRow = ReleasedSensitiveRow | SuppressedSensitiveRow;

export interface ExecutiveSensitiveDomain {
  readonly sourceTable: 'ausencia' | 'licencia' | 'legamov';
  readonly metric: 'valid_rows_by_year';
  readonly series: readonly ExecutiveSensitiveRow[];
}

export interface ExecutiveContract {
  readonly schemaVersion: 'grh-executive-v2';
  readonly policyVersion: 'grh-small-cell-v1';
  readonly source: ExecutiveSource;
  readonly privacy: ExecutivePrivacy;
  readonly workforce: ExecutiveWorkforce;
  readonly compensation: ExecutiveCompensation;
  readonly absence: ExecutiveSensitiveDomain;
  readonly leave: ExecutiveSensitiveDomain;
  readonly movements: ExecutiveSensitiveDomain;
}

export type ExecutiveKpiKey =
  | 'payrollParticipants'
  | 'latestPayrollControl'
  | 'sectorCoverage'
  | 'lastCompleteAbsence'
  | 'publishedMovements';

export interface ExecutiveKpiViewModel {
  readonly key: ExecutiveKpiKey;
  readonly label: string;
  readonly value: string;
  readonly note: string;
  readonly status: 'released' | 'protected' | 'partial';
  readonly tone: 'cyan' | 'violet' | 'amber' | 'green' | 'neutral';
}

export type PayrollChangeStatus =
  | 'available'
  | 'first_period'
  | 'non_consecutive'
  | 'zero_baseline'
  | 'protected_current'
  | 'protected_previous';

export interface PayrollPointViewModel {
  readonly period: string | null;
  readonly periodLabel: string;
  readonly privacyStatus: 'released' | 'suppressed';
  readonly valueSourceUnits: number | null;
  readonly valueLabel: string;
  readonly participantDisplay: string;
  readonly changePct: number | null;
  readonly changeLabel: string;
  readonly changeStatus: PayrollChangeStatus;
}

export interface PayrollSeriesViewModel {
  readonly totalPeriods: number;
  readonly releasedPeriods: number;
  readonly suppressedPeriods: number;
  readonly latestPeriod: string | null;
  readonly latestStatus: 'released' | 'protected';
  readonly points: readonly PayrollPointViewModel[];
  readonly warning: string;
}

export interface SectorRowViewModel {
  readonly label: string;
  readonly participants: number;
  readonly participantDisplay: string;
  readonly sharePct: number;
  readonly shareLabel: string;
  readonly privacyStatus: 'released' | 'protected_aggregate';
}

export interface SectorRankingViewModel {
  readonly totalParticipants: number;
  readonly totalLabel: string;
  readonly individuallyPublishedParticipants: number;
  readonly individuallyPublishedCoveragePct: number;
  readonly individuallyPublishedCoverageLabel: string;
  readonly protectedParticipants: number;
  readonly rows: readonly SectorRowViewModel[];
  readonly note: string;
}

export interface AnnualPointViewModel {
  readonly period: string | null;
  readonly periodLabel: string;
  readonly value: number | null;
  readonly valueLabel: string;
  readonly participantDisplay: string;
  readonly privacyStatus: 'released' | 'suppressed';
}

export interface AnnualDomainViewModel {
  readonly key: 'absence' | 'leave' | 'movements';
  readonly label: string;
  readonly sourceTable: 'ausencia' | 'licencia' | 'legamov';
  readonly releasedPeriods: number;
  readonly suppressedPeriods: number;
  readonly points: readonly AnnualPointViewModel[];
  readonly note: string;
}

export interface ExecutiveTruthViewModel {
  readonly canonicalSystem: string;
  readonly sourceFile: string;
  readonly sourceHash: string;
  readonly snapshotAsOf: string;
  readonly snapshotLabel: string;
  readonly referencePeriod: string;
  readonly freshnessLabel: string;
  readonly workforceDefinition: string;
}

export interface ExecutivePrivacyViewModel {
  readonly policyVersion: 'grh-small-cell-v1';
  readonly rankingThreshold: 5;
  readonly sensitiveThreshold: 10;
  readonly protectedRankingRows: number;
  readonly suppressedMonetaryPeriods: number;
  readonly suppressedAnnualPeriods: number;
  readonly note: string;
}

export interface ExecutiveViewModel {
  readonly truth: ExecutiveTruthViewModel;
  readonly kpis: readonly ExecutiveKpiViewModel[];
  readonly payroll: PayrollSeriesViewModel;
  readonly sector: SectorRankingViewModel;
  readonly annual: readonly AnnualDomainViewModel[];
  readonly privacy: ExecutivePrivacyViewModel;
}
