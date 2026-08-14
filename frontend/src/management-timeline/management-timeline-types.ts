export type ManagementTimelineMatrixDomainKey =
  | 'reportedAbsence'
  | 'documentedEmploymentActions'
  | 'reportedIngressDates'
  | 'reportedExitDates';
export type ManagementTimelineDomainKey = ManagementTimelineMatrixDomainKey | 'fixedConceptStarts';
export type ManagementTimelineMeasureKey = 'eventRows' | 'distinctPersons' | 'reportedDays';
export type ManagementTimelinePrivacyStatus =
  | 'released'
  | 'protected_primary'
  | 'protected_complementary'
  | 'unavailable';
export type ManagementTimelineTone = 'neutral' | 'attention';

export interface ManagementTimelineCell {
  readonly privacyStatus: ManagementTimelinePrivacyStatus;
  readonly values: Readonly<Partial<Record<ManagementTimelineMeasureKey, number | null>>>;
}

export interface ManagementTimelineDomain {
  readonly key: ManagementTimelineDomainKey;
  readonly label: string;
  readonly description: string;
  readonly comparisonStatus: 'comparable' | 'context_only';
  readonly measures: readonly ManagementTimelineMeasureKey[];
  readonly current: ManagementTimelineCell;
  readonly prior: ManagementTimelineCell;
  readonly delta: ManagementTimelineCell;
}

export type ManagementTimelineDomainMap = Readonly<Record<ManagementTimelineDomainKey, ManagementTimelineDomain>>;

export interface ManagementTimelineTerm {
  readonly key: string;
  readonly label: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly plannedDays: number;
}

export interface ManagementTimelineObservedWindow {
  readonly startDate: string;
  readonly endDate: string;
  readonly days: number;
  readonly progressPct: number;
  readonly status: 'partial' | 'matched_window';
}

export interface ManagementTimelineYearWindow {
  readonly plannedStartDate: string;
  readonly plannedEndDate: string;
  readonly observedStartDate: string | null;
  readonly observedEndDate: string | null;
  readonly observedDays: number;
  readonly status:
    | 'complete'
    | 'partial'
    | 'future'
    | 'matched_complete'
    | 'matched_partial'
    | 'not_compared';
}

export interface ManagementTimelineYear {
  readonly key: `management-year-${1 | 2 | 3 | 4}`;
  readonly ordinal: 1 | 2 | 3 | 4;
  readonly label: string;
  readonly plannedDays: number;
  readonly current: ManagementTimelineYearWindow;
  readonly prior: ManagementTimelineYearWindow;
  readonly domains: ManagementTimelineDomainMap;
}

export interface ManagementTimelineContract {
  readonly schemaVersion: 'grh-management-timeline-v1';
  readonly generatedAt: string;
  readonly source: {
    readonly canonicalSystem: 'GRH Junín';
    readonly fileName: string;
    readonly sha256: string;
    readonly snapshotAsOf: string;
    readonly realtime: false;
    readonly rowCounts: Readonly<Record<string, number>>;
    readonly coverage: Readonly<Record<string, unknown>>;
  };
  readonly privacy: {
    readonly mode: 'aggregate_only';
    readonly threshold: 10;
    readonly personKey: 'legajo.IDPERSONA';
    readonly rule: string;
    readonly protectedValue: null;
    readonly complementarySuppression: true;
    readonly containsPii: false;
    readonly personIdentifiersExported: false;
    readonly rawRowsExported: false;
  };
  readonly terms: {
    readonly current: ManagementTimelineTerm;
    readonly prior: ManagementTimelineTerm;
  };
  readonly observed: {
    readonly current: ManagementTimelineObservedWindow & { readonly status: 'partial' };
    readonly prior: ManagementTimelineObservedWindow & { readonly status: 'matched_window' };
  };
  readonly managementYears: readonly [
    ManagementTimelineYear,
    ManagementTimelineYear,
    ManagementTimelineYear,
    ManagementTimelineYear,
  ];
  readonly comparison: {
    readonly observedDays: number;
    readonly matrixDomainKeys: readonly [
      'reportedAbsence',
      'documentedEmploymentActions',
      'reportedIngressDates',
      'reportedExitDates',
    ];
    readonly domains: ManagementTimelineDomainMap;
  };
  readonly limits: readonly { readonly code: string; readonly text: string }[];
}

export interface ManagementTimelineComparisonRowViewModel {
  readonly code: ManagementTimelineMatrixDomainKey;
  readonly label: string;
  readonly explanation: string;
  readonly currentLabel: string;
  readonly priorLabel: string;
  readonly differenceLabel: string;
  readonly tone: ManagementTimelineTone;
}

export interface ManagementTimelineDecisionViewModel {
  readonly code: string;
  readonly priorityLabel: string;
  readonly tone: ManagementTimelineTone;
  readonly whatHappened: string;
  readonly whyItMatters: string;
  readonly whatToDo: string;
  readonly actionLabel: string;
  readonly actionHref: string;
  readonly assistantHref: string;
  readonly detailLabel: string;
  readonly details: readonly string[];
}

export interface ManagementTimelineYearViewModel {
  readonly key: ManagementTimelineYear['key'];
  readonly ordinal: ManagementTimelineYear['ordinal'];
  readonly label: string;
  readonly statusLabel: string;
  readonly tone: ManagementTimelineTone;
  readonly currentRangeLabel: string;
  readonly priorRangeLabel: string;
  readonly equalWindowLabel: string;
  readonly rows: readonly [
    ManagementTimelineComparisonRowViewModel,
    ManagementTimelineComparisonRowViewModel,
    ManagementTimelineComparisonRowViewModel,
    ManagementTimelineComparisonRowViewModel,
  ];
  readonly accessibleSummary: string;
  readonly contextOnlyLabel: string;
  readonly contextOnlyDescription: string;
  readonly contextOnlyCurrentLabel: string;
  readonly contextOnlyPriorLabel: string;
}

export interface ManagementTimelineViewModel {
  readonly source: {
    readonly canonicalSystem: string;
    readonly snapshotLabel: string;
    readonly generatedLabel: string;
    readonly sourceFile: string;
    readonly sourceSha256: string;
    readonly notice: string;
  };
  readonly comparison: {
    readonly title: string;
    readonly description: string;
    readonly equalWindowLabel: string;
    readonly currentLabel: string;
    readonly priorLabel: string;
    readonly interpretation: string;
    readonly defaultYearKey: ManagementTimelineYear['key'];
    readonly years: readonly [
      ManagementTimelineYearViewModel,
      ManagementTimelineYearViewModel,
      ManagementTimelineYearViewModel,
      ManagementTimelineYearViewModel,
    ];
  };
  readonly decisions: readonly ManagementTimelineDecisionViewModel[];
  readonly methodology: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly limits: readonly string[];
}
