export type PrivacyStatus = 'released' | 'protected';

export interface EmploymentActionsSource {
  readonly canonicalSystem: string;
  readonly sourceFile: string;
  readonly sourceSha256: string;
  readonly snapshotAsOf: string;
  readonly generatedAt: string;
  readonly realtime: false;
  readonly tables: Readonly<Record<string, string>>;
  readonly firstValidDate: string;
  readonly lastValidDate: string;
}

export interface EmploymentActionsPrivacy {
  readonly threshold: number;
  readonly rule: string;
  readonly aggregateOnly: true;
  readonly containsPii: false;
  readonly personIdentifiersExported: false;
  readonly rawRowsExported: false;
  readonly instrumentValuesExported: false;
  readonly observationsExported: false;
  readonly userValuesExported: false;
  readonly rawCategoryValuesExported: false;
}

export interface EmploymentActionsPeriod {
  readonly label: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly days: number;
}

export interface EmploymentActionsMetric {
  readonly privacyStatus: PrivacyStatus;
  readonly actionEvents: number | null;
  readonly distinctPersons: number | null;
  readonly actionsPerPerson: number | null;
  readonly instrumentTypePresent: number | null;
  readonly instrumentNumberPresent: number | null;
  readonly sourceCategoryPresent: number | null;
  readonly documentCodePresent: number | null;
}

export interface EmploymentActionsDelta {
  readonly actionEvents: number | null;
  readonly distinctPersons: number | null;
  readonly actionsPerPerson: number | null;
  readonly instrumentTypePresent: number | null;
  readonly instrumentNumberPresent: number | null;
  readonly sourceCategoryPresent: number | null;
  readonly documentCodePresent: number | null;
}

export interface EmploymentActionsCategoryMetric {
  readonly events: number | null;
  readonly persons: number | null;
}

export interface EmploymentActionsCategory {
  readonly key: string;
  readonly label: string;
  readonly meaning: string;
  readonly privacyStatus: PrivacyStatus;
  readonly current: EmploymentActionsCategoryMetric;
  readonly prior: EmploymentActionsCategoryMetric;
  readonly deltas: EmploymentActionsCategoryMetric;
}

export interface EmploymentActionsContract {
  readonly schemaVersion: 'grh-employment-actions-v1';
  readonly source: EmploymentActionsSource;
  readonly privacy: EmploymentActionsPrivacy;
  readonly metric: Readonly<Record<string, string>>;
  readonly coverage: Readonly<Record<string, number>>;
  readonly periods: {
    readonly current: EmploymentActionsPeriod;
    readonly prior: EmploymentActionsPeriod;
  };
  readonly comparison: {
    readonly current: EmploymentActionsMetric;
    readonly prior: EmploymentActionsMetric;
    readonly deltas: EmploymentActionsDelta;
  };
  readonly categories: readonly EmploymentActionsCategory[];
  readonly protectedBucket: {
    readonly privacyStatus: PrivacyStatus;
    readonly label: string;
    readonly categoryCount: number;
    readonly current: EmploymentActionsCategoryMetric;
    readonly prior: EmploymentActionsCategoryMetric;
    readonly deltas: EmploymentActionsCategoryMetric;
  };
  readonly classification: Readonly<Record<string, string | number>>;
  readonly limits: readonly { readonly code: string; readonly text: string }[];
}

export interface EmploymentActionsCategoryViewModel {
  readonly key: string;
  readonly label: string;
  readonly meaning: string;
  readonly currentEvents: number | null;
  readonly priorEvents: number | null;
  readonly deltaEvents: number | null;
  readonly currentLabel: string;
  readonly priorLabel: string;
  readonly deltaLabel: string;
  readonly maxEvents: number;
  readonly protected: boolean;
}

export interface EmploymentActionsViewModel {
  readonly source: {
    readonly snapshotLabel: string;
    readonly generatedLabel: string;
    readonly sourceFile: string;
    readonly sourceSha256: string;
    readonly historicalLabel: string;
  };
  readonly periods: {
    readonly current: EmploymentActionsPeriod & { readonly rangeLabel: string };
    readonly prior: EmploymentActionsPeriod & { readonly rangeLabel: string };
  };
  readonly comparison: {
    readonly currentEvents: string;
    readonly priorEvents: string;
    readonly currentPersons: string;
    readonly priorPersons: string;
    readonly eventDelta: string;
    readonly personsDelta: string;
    readonly currentActionsPerPerson: string;
    readonly priorActionsPerPerson: string;
  };
  readonly categories: readonly EmploymentActionsCategoryViewModel[];
  readonly protectedBucket: EmploymentActionsCategoryViewModel | null;
  readonly coverage: {
    readonly validRows: string;
    readonly joinIntegrity: string;
    readonly categoryCoverage: string;
  };
  readonly limits: readonly string[];
}
