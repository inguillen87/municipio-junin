export interface ImportQualityHistorySource {
  readonly canonicalSystem: string;
  readonly sourceFile: string;
  readonly sourceSha256: string;
  readonly snapshotAsOf: string;
  readonly generatedAt: string;
  readonly realtime: false;
  readonly table: string;
  readonly firstEventDate: string;
  readonly lastEventDate: string;
  readonly partialThrough: string;
}

export interface ImportQualityHistoryPrivacy {
  readonly aggregateOnly: true;
  readonly containsPii: false;
  readonly personIdentifiersExported: false;
  readonly rawRowsExported: false;
  readonly rawMessagesExported: false;
}

export interface ImportQualityHistoryScope {
  readonly unit: string;
  readonly meaning: string;
  readonly notCurrentEmployeeErrors: true;
  readonly notSystemAvailability: true;
}

export interface ImportQualityHistoryTotals {
  readonly incidents: number;
  readonly importRuns: number;
}

export interface ImportQualityHistoryCurrentPartial extends ImportQualityHistoryTotals {
  readonly year: number;
  readonly partial: true;
  readonly through: string;
}

export interface ImportQualityHistoryAnnualRow extends ImportQualityHistoryTotals {
  readonly year: number;
  readonly partial: boolean;
}

export interface ImportQualityHistoryCategoryRow {
  readonly key: string;
  readonly label: string;
  readonly meaning: string;
  readonly incidents: number;
  readonly sharePct: number;
}

export interface ImportQualityHistoryClassification {
  readonly status: string;
  readonly ruleVersion: string;
  readonly classifiedIncidents: number;
  readonly coveragePct: number;
}

export interface ImportQualityHistoryLimit {
  readonly code: string;
  readonly text: string;
}

export interface ImportQualityHistoryContract {
  readonly schemaVersion: 'grh-import-quality-history-v1';
  readonly source: ImportQualityHistorySource;
  readonly privacy: ImportQualityHistoryPrivacy;
  readonly scope: ImportQualityHistoryScope;
  readonly totals: ImportQualityHistoryTotals;
  readonly currentPartial: ImportQualityHistoryCurrentPartial;
  readonly annual: readonly ImportQualityHistoryAnnualRow[];
  readonly categories: readonly ImportQualityHistoryCategoryRow[];
  readonly classification: ImportQualityHistoryClassification;
  readonly limits: readonly ImportQualityHistoryLimit[];
}

export interface ImportQualityHistoryAnnualViewModel {
  readonly year: number;
  readonly yearLabel: string;
  readonly shortYearLabel: string;
  readonly incidents: number;
  readonly incidentsLabel: string;
  readonly compactIncidentsLabel: string;
  readonly importRunsLabel: string;
  readonly relativeHeightPct: number;
  readonly partial: boolean;
  readonly accessibleLabel: string;
}

export interface ImportQualityHistoryCategoryViewModel {
  readonly key: string;
  readonly label: string;
  readonly meaning: string;
  readonly incidents: number;
  readonly incidentsLabel: string;
  readonly sharePct: number;
  readonly shareLabel: string;
  readonly relativeWidthPct: number;
  readonly accessibleLabel: string;
}

export interface ImportQualityHistoryViewModel {
  readonly headline: string;
  readonly description: string;
  readonly dateRangeLabel: string;
  readonly cutLabel: string;
  readonly totalIncidentsLabel: string;
  readonly totalRunsLabel: string;
  readonly currentYearLabel: string;
  readonly currentIncidentsLabel: string;
  readonly currentRunsLabel: string;
  readonly annual: readonly ImportQualityHistoryAnnualViewModel[];
  readonly categories: readonly ImportQualityHistoryCategoryViewModel[];
  readonly classificationLabel: string;
  readonly scopeNote: string;
  readonly detailNote: string;
  readonly limits: readonly string[];
}

export interface FetchImportQualityHistoryOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal | null;
}

export interface ImportQualityHistoryClient {
  readonly load: (options?: FetchImportQualityHistoryOptions) => Promise<ImportQualityHistoryContract>;
}
