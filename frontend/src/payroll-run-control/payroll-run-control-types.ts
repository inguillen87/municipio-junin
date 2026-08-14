export interface PayrollRunControlSource {
  readonly canonicalSystem: string;
  readonly sourceFile: string;
  readonly sourceSha256: string;
  readonly snapshotAsOf: string;
  readonly generatedAt: string;
  readonly realtime: false;
  readonly tables: {
    readonly runHeaders: 'histocal';
    readonly calculationDetails: 'calculo';
    readonly technicalLogs: 'liquidacionlog';
  };
  readonly firstValidPeriod: string;
  readonly lastValidPeriod: string;
  readonly latestValidEffectiveDate: string;
}

export interface PayrollRunControlMonthly {
  readonly period: string;
  readonly firstEffectiveDate: string;
  readonly lastEffectiveDate: string;
  readonly runHeaders: number;
  readonly headersWithCalculation: number;
  readonly headersWithoutCalculation: number;
  readonly headersWithCloseFlag: number;
  readonly headersWithoutCloseFlag: number;
  readonly calculationRows: number;
}

export interface PayrollRunControlContract {
  readonly schemaVersion: 'grh-payroll-run-control-v1';
  readonly source: PayrollRunControlSource;
  readonly privacy: {
    readonly threshold: 10;
    readonly aggregateOnly: true;
    readonly containsPii: false;
    readonly personIdentifiersExported: false;
    readonly rawRowsExported: false;
    readonly sourceRunKeysExported: false;
    readonly monetaryAmountsExported: false;
    readonly rawTechnicalLogsExported: false;
    readonly rawMessagesExported: false;
  };
  readonly metric: Readonly<Record<string, string>>;
  readonly coverage: {
    readonly sourceRunHeaders: number;
    readonly validRunHeaders: number;
    readonly quarantinedRunHeaders: number;
    readonly validPeriodCount: number;
    readonly calculationRows: number;
    readonly calculationRunKeys: number;
    readonly orphanCalculationRunKeys: number;
    readonly validHeadersWithCalculation: number;
    readonly validHeadersWithoutCalculation: number;
    readonly validHeadersWithCloseFlag: number;
    readonly validHeadersWithoutCloseFlag: number;
    readonly validHeaderRatePct: number;
    readonly validHeaderWithCalculationRatePct: number;
    readonly calculationHeaderJoinCoveragePct: number;
  };
  readonly currentYear: {
    readonly year: number;
    readonly throughPeriod: string;
    readonly partial: true;
    readonly monthsObserved: number;
    readonly runHeaders: number;
    readonly headersWithCalculation: number;
    readonly headersWithCloseFlag: number;
    readonly allObservedRunsHaveCalculation: boolean;
    readonly allObservedRunsHaveCloseFlag: boolean;
  };
  readonly monthly: readonly PayrollRunControlMonthly[];
  readonly quarantine: {
    readonly signalCode: 'temporal_quarantine_present';
    readonly status: 'attention_required' | 'clear';
    readonly runHeaders: number;
    readonly headersWithCalculation: number;
    readonly headersWithoutCalculation: number;
    readonly calculationRows: number;
    readonly calculationRowRatePct: number;
    readonly reasonOccurrences: readonly { readonly code: string; readonly count: number }[];
  };
  readonly logCoverage: {
    readonly sourceRows: number;
    readonly runKeys: number;
    readonly joinedRunKeys: number;
    readonly joinCoveragePct: number;
    readonly firstEventDate: string;
    readonly lastEventDate: string;
    readonly rawDetailsWithheld: true;
  };
  readonly limits: readonly { readonly code: string; readonly text: string }[];
}

export interface PayrollRunMonthViewModel {
  readonly period: string;
  readonly periodLabel: string;
  readonly dateRangeLabel: string;
  readonly runHeaders: number;
  readonly runHeadersLabel: string;
  readonly headersWithCalculation: number;
  readonly headersWithoutCalculation: number;
  readonly headersWithCloseFlag: number;
  readonly headersWithoutCloseFlag: number;
  readonly calculationRowsLabel: string;
  readonly barWidthPct: number;
  readonly completeObservedControls: boolean;
}

export interface PayrollRunControlViewModel {
  readonly source: {
    readonly snapshotLabel: string;
    readonly generatedLabel: string;
    readonly sourceFile: string;
    readonly sourceSha256: string;
    readonly historicalRangeLabel: string;
    readonly historicalNotice: string;
  };
  readonly currentYear: {
    readonly title: string;
    readonly throughLabel: string;
    readonly runHeaders: string;
    readonly headersWithCalculation: string;
    readonly headersWithCloseFlag: string;
    readonly allWithCalculation: boolean;
    readonly allWithCloseFlag: boolean;
  };
  readonly coverage: {
    readonly validHeaders: string;
    readonly validRate: string;
    readonly detailCoverage: string;
    readonly calculationJoin: string;
    readonly observedPeriods: string;
    readonly sourceHeaders: string;
  };
  readonly monthly: readonly PayrollRunMonthViewModel[];
  readonly quarantine: {
    readonly attentionRequired: boolean;
    readonly runHeaders: string;
    readonly headersWithCalculation: string;
    readonly headersWithoutCalculation: string;
    readonly calculationRows: string;
    readonly calculationRowRate: string;
    readonly reasons: readonly { readonly code: string; readonly label: string; readonly count: string }[];
  };
  readonly logCoverage: {
    readonly sourceRows: string;
    readonly runKeys: string;
    readonly joinedRunKeys: string;
    readonly joinCoverage: string;
    readonly observedDate: string;
  };
  readonly limits: readonly string[];
}
