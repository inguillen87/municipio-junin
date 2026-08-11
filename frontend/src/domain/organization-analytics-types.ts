export type OrganizationRowPrivacyStatus = 'released' | 'protected_aggregate' | 'suppressed';
export type AbsencePrivacyStatus = 'released' | 'protected';
export type MatrixPrivacyStatus =
  | 'released'
  | 'not_observed'
  | 'primary_suppressed'
  | 'complementary_suppressed';
export type ExecutiveRankingPrivacyStatus = 'released' | 'partially_suppressed';
export type ExecutiveRankingRowPrivacyStatus = 'released' | 'protected_aggregate';
export type SensitiveSeriesPrivacyStatus = 'released' | 'suppressed';

export interface OrganizationAnalyticsSource {
  readonly canonicalSystem: string;
  readonly sourceFile: string;
  readonly sourceSha256: string;
  readonly snapshotAsOf: string;
}

export interface OrganizationAnalyticsPrivacy {
  readonly threshold: 10;
  readonly containsPii: false;
  readonly identifiersExported: false;
  readonly labelsProtectedBeforeRanking: true;
  readonly complementarySuppression: true;
}

export interface CoverageMetric {
  readonly records: number;
  readonly sharePct: number;
}

export interface OrganizationAnalyticsCoverage {
  readonly registeredRecords: number;
  readonly withOrganization: CoverageMetric;
  readonly withSector: CoverageMetric;
  readonly withOrganizationAndSector: CoverageMetric;
  readonly withAbsenceHistory: CoverageMetric;
  readonly absenceEvents: number;
}

export interface OrganizationAnalyticsRankingRow {
  readonly code: number | null;
  readonly label: string;
  readonly registeredRecords: number;
  readonly sharePct: number | null;
  readonly recordsWithAbsence: number | null;
  readonly absenceEvents: number | null;
  readonly eventsPerRegisteredRecord: number | null;
  readonly absencePrivacyStatus: AbsencePrivacyStatus;
  readonly privacyStatus: OrganizationRowPrivacyStatus;
}

export interface OrganizationAnalyticsDimension {
  readonly dimension: 'organization' | 'sector';
  readonly denominatorRecords: number;
  readonly categoryCount: number;
  readonly releasedCategoryCount: number;
  readonly protectedCategoryCount: number;
  readonly rows: readonly OrganizationAnalyticsRankingRow[];
}

export interface MatrixAxis {
  readonly code: number;
  readonly label: string;
}

export interface MatrixCell {
  readonly organizationCode: number;
  readonly sectorCode: number;
  readonly registeredRecords: number | null;
  readonly privacyStatus: MatrixPrivacyStatus;
}

export interface OrganizationAnalyticsMatrix {
  readonly rowDimension: 'organization';
  readonly columnDimension: 'sector';
  readonly rows: readonly MatrixAxis[];
  readonly columns: readonly MatrixAxis[];
  readonly cells: readonly MatrixCell[];
  readonly releasedCellCount: number;
  readonly protectedCellCount: number;
  readonly maxReleasedRecords: number;
}

export interface OrganizationAbsenceRanking {
  readonly historical: true;
  readonly denominatorRecords: number;
  readonly recordsWithAbsence: number;
  readonly absenceEvents: number;
  readonly rows: readonly OrganizationAnalyticsRankingRow[];
}

export interface OrganizationAnalyticsDataQuality {
  readonly missingOrganizationRecords: number;
  readonly missingSectorRecords: number;
  readonly missingBothRecords: number;
  readonly invalidEmployeeKeyRows: number;
  readonly unmatchedPersonRecords: number;
  readonly validAbsenceEvents: number;
  readonly quarantinedAbsenceEvents: number;
  readonly linkedAbsenceEvents: number;
  readonly unlinkedValidAbsenceEvents: number;
  readonly codedPositionRecords: number;
  readonly positionObservationRecords: number;
  readonly futureEffectivePositionObservationRecords: number;
  readonly firstFuturePositionDate: string | null;
  readonly lastFuturePositionDate: string | null;
}

export interface OrganizationAnalyticsAction {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly requiredCapability: string;
}

export interface ExecutiveRankingRow {
  readonly companyCode: string | number | null;
  readonly sourceCode: string | number | null;
  readonly label: string;
  readonly participants: number;
  readonly participantDisplay: string;
  readonly sharePct: number;
  readonly privacyStatus: ExecutiveRankingRowPrivacyStatus;
}

export interface ExecutiveRanking {
  readonly threshold: 10;
  readonly totalParticipants: number;
  readonly participantDisplay: string;
  readonly privacyStatus: ExecutiveRankingPrivacyStatus;
  readonly rows: readonly ExecutiveRankingRow[];
}

export interface PayrollCohort {
  readonly definition: string;
  readonly referencePeriod: string;
  readonly payrollParticipants: number;
  readonly bySector: ExecutiveRanking;
  readonly byCostCenter: ExecutiveRanking;
  readonly byAgreement: ExecutiveRanking;
}

export interface ReleasedSensitiveSeriesRow {
  readonly period: string;
  readonly value: number;
  readonly participantCount: number;
  readonly participantDisplay: string;
  readonly privacyStatus: 'released';
}

export interface SuppressedSensitiveSeriesRow {
  readonly period: string | null;
  readonly value: null;
  readonly participantCount: null;
  readonly participantDisplay: 'Protegido';
  readonly privacyStatus: 'suppressed';
}

export type SensitiveSeriesRow = ReleasedSensitiveSeriesRow | SuppressedSensitiveSeriesRow;

export interface SensitiveActivityDomain {
  readonly sourceTable: 'ausencia' | 'legamov';
  readonly metric: 'valid_rows_by_year';
  readonly series: readonly SensitiveSeriesRow[];
}

export interface OrganizationAnalyticsActivity {
  readonly absence: SensitiveActivityDomain;
  readonly movements: SensitiveActivityDomain;
}

export interface OrganizationAnalyticsContract {
  readonly schemaVersion: 'grh-organization-analytics-v2';
  readonly source: OrganizationAnalyticsSource;
  readonly privacy: OrganizationAnalyticsPrivacy;
  readonly coverage: OrganizationAnalyticsCoverage;
  readonly organizations: OrganizationAnalyticsDimension;
  readonly sectors: OrganizationAnalyticsDimension;
  readonly matrix: OrganizationAnalyticsMatrix;
  readonly absenceRanking: OrganizationAbsenceRanking;
  readonly dataQuality: OrganizationAnalyticsDataQuality;
  readonly payrollCohort: PayrollCohort;
  readonly activity: OrganizationAnalyticsActivity;
  readonly actions: readonly OrganizationAnalyticsAction[];
  readonly limits: readonly string[];
}

export type WorkforceDimensionKey = 'sector' | 'costCenter' | 'agreement';

export interface WorkforceRowViewModel {
  readonly key: string;
  readonly label: string;
  readonly participants: number;
  readonly participantLabel: string;
  readonly sharePct: number;
  readonly shareLabel: string;
  readonly privacyStatus: ExecutiveRankingRowPrivacyStatus;
}

export interface WorkforceRankingViewModel {
  readonly key: WorkforceDimensionKey;
  readonly label: string;
  readonly denominator: number;
  readonly denominatorLabel: string;
  readonly protectedParticipants: number;
  readonly rows: readonly WorkforceRowViewModel[];
}

export interface ActivityPointViewModel {
  readonly key: string;
  readonly period: string | null;
  readonly periodLabel: string;
  readonly events: number | null;
  readonly eventLabel: string;
  readonly participants: number | null;
  readonly participantLabel: string;
  readonly privacyStatus: SensitiveSeriesPrivacyStatus;
}

export interface ActivityDomainViewModel {
  readonly key: 'absence' | 'movements';
  readonly label: string;
  readonly sourceTable: 'ausencia' | 'legamov';
  readonly points: readonly ActivityPointViewModel[];
  readonly releasedPeriods: number;
  readonly protectedPeriods: number;
  readonly maxEvents: number;
  readonly maxParticipants: number;
  readonly note: string;
}

export interface RegistryRankingRowViewModel {
  readonly key: string;
  readonly label: string;
  readonly registeredRecords: number;
  readonly registeredLabel: string;
  readonly sharePct: number;
  readonly shareLabel: string;
  readonly privacyStatus: OrganizationRowPrivacyStatus;
}

export interface RegistryRankingViewModel {
  readonly key: 'organization' | 'sector';
  readonly label: string;
  readonly denominatorRecords: number;
  readonly denominatorLabel: string;
  readonly rows: readonly RegistryRankingRowViewModel[];
}

export interface MatrixCellViewModel extends MatrixCell {
  readonly key: string;
  readonly display: string;
  readonly level: 0 | 1 | 2 | 3 | 4;
  readonly accessibleLabel: string;
}

export interface MatrixViewModel {
  readonly rows: readonly MatrixAxis[];
  readonly columns: readonly MatrixAxis[];
  readonly cells: readonly MatrixCellViewModel[];
  readonly releasedCellCount: number;
  readonly protectedCellCount: number;
}

export interface AbsenceRankingRowViewModel {
  readonly key: string;
  readonly rank: number;
  readonly label: string;
  readonly registeredRecords: number;
  readonly recordsWithAbsence: number;
  readonly absenceEvents: number;
  readonly eventShareLabel: string;
  readonly privacyStatus: OrganizationRowPrivacyStatus;
}

export interface QualityFactViewModel {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly actionHref?: string;
}

export interface StructureKpiViewModel {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly note: string;
  readonly tone: 'blue' | 'cyan' | 'green' | 'amber' | 'violet';
}

export interface OrganizationAnalyticsViewModel {
  readonly truth: {
    readonly canonicalSystem: string;
    readonly sourceFile: string;
    readonly sourceHash: string;
    readonly snapshotAsOf: string;
    readonly snapshotLabel: string;
    readonly referencePeriod: string;
    readonly definition: string;
  };
  readonly kpis: readonly StructureKpiViewModel[];
  readonly workforce: Readonly<Record<WorkforceDimensionKey, WorkforceRankingViewModel>>;
  readonly activity: readonly ActivityDomainViewModel[];
  readonly registries: readonly RegistryRankingViewModel[];
  readonly matrix: MatrixViewModel;
  readonly absenceRanking: readonly AbsenceRankingRowViewModel[];
  readonly qualityFacts: readonly QualityFactViewModel[];
  readonly actions: readonly OrganizationAnalyticsAction[];
  readonly limits: readonly string[];
}
