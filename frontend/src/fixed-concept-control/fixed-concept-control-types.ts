export type FixedConceptPrivacyStatus = 'released' | 'protected_aggregate';

export interface FixedConceptControlSource {
  readonly canonicalSystem: string;
  readonly sourceFile: string;
  readonly sourceSha256: string;
  readonly snapshotAsOf: string;
  readonly generatedAt: string;
  readonly realtime: false;
  readonly tables: {
    readonly fixedConcepts: 'fijos';
    readonly conceptCatalog: 'concepto';
    readonly calculationDetails: 'calculo';
    readonly employmentMaster: 'legajo';
  };
  readonly calculationPeriod: string;
  readonly calculationPeriodEnd: string;
}

export interface FixedConceptReconciliationState {
  readonly code:
    | 'same_person_and_concept_observed'
    | 'person_observed_concept_absent'
    | 'person_not_observed_in_period';
  readonly label: string;
  readonly rows: number;
  readonly people: number;
  readonly privacyStatus: 'released';
}

export interface FixedConceptCategory {
  readonly label: string;
  readonly rows: number;
  readonly people: number;
  readonly privacyStatus: FixedConceptPrivacyStatus;
}

export interface FixedConceptAdministrationWindow {
  readonly code: 'current' | 'prior';
  readonly label: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly days: number;
  readonly startRows: number;
  readonly distinctPeople: number;
  readonly concepts: number;
  readonly stateReportedRows: number;
  readonly movementTypeReportedRows: number;
  readonly legalInstrumentReportedRows: number;
  readonly privacyStatus: 'released';
}

export interface FixedConceptQualitySignal {
  readonly code: string;
  readonly label: string;
  readonly severity: 'high' | 'medium';
  readonly rows: number;
  readonly ratePct: number;
  readonly meaning: string;
}

export interface FixedConceptControlContract {
  readonly schemaVersion: 'grh-fixed-concept-control-v1';
  readonly policyVersion: 'grh-fixed-concept-control-policy-v1';
  readonly source: FixedConceptControlSource;
  readonly privacy: {
    readonly threshold: 10;
    readonly aggregateOnly: true;
    readonly containsPii: false;
    readonly personIdentifiersExported: false;
    readonly sourceKeysExported: false;
    readonly rawRowsExported: false;
    readonly monetaryAmountsExported: false;
    readonly legalInstrumentValuesExported: false;
    readonly arbitraryFiltersAllowed: false;
    readonly complementarySuppression: true;
  };
  readonly metric: {
    readonly fixedRowGrain: string;
    readonly eligibleFixedConceptDefinition: string;
    readonly exactObservationDefinition: string;
    readonly personObservedConceptAbsentDefinition: string;
    readonly personNotObservedDefinition: string;
    readonly observationMeaning: string;
    readonly absenceMeaning: string;
    readonly comparisonRule: string;
  };
  readonly coverage: {
    readonly sourceFixedRows: number;
    readonly uniqueFixedIds: number;
    readonly duplicateFixedIdRows: number;
    readonly validEmployeeKeyRows: number;
    readonly matchedLegajoRows: number;
    readonly orphanLegajoRows: number;
    readonly legajoJoinCoveragePct: number;
    readonly catalogMatchedRows: number;
    readonly catalogOrphanRows: number;
    readonly validRangeRows: number;
    readonly missingStartRows: number;
    readonly missingEndRows: number;
    readonly endBeforeStartRows: number;
    readonly validRangeRatePct: number;
    readonly exactBusinessKeyExtraRows: number;
    readonly calculationRows: number;
    readonly calculationParticipants: number;
    readonly calculationPersonConceptPairs: number;
  };
  readonly reconciliation: {
    readonly calculationPeriod: string;
    readonly fixedEligibilityDate: string;
    readonly eligibleFixedRows: number;
    readonly eligiblePeople: number;
    readonly states: readonly FixedConceptReconciliationState[];
    readonly exactObservationRatePct: number;
  };
  readonly snapshot: {
    readonly asOf: string;
    readonly eligibleFixedRows: number;
    readonly eligiblePeople: number;
    readonly authorizedStateRows: number;
    readonly missingStateRows: number;
    readonly movementTypeReportedRows: number;
    readonly legalInstrumentReportedRows: number;
    readonly conceptsObserved: number;
    readonly categories: {
      readonly sourceCategoryCount: number;
      readonly releasedCategoryCount: number;
      readonly protectedCategoryCount: number;
      readonly rows: readonly FixedConceptCategory[];
    };
  };
  readonly administrationComparison: {
    readonly rule: 'reported_fixed_concept_start_dates_in_equal_972_day_windows';
    readonly current: FixedConceptAdministrationWindow;
    readonly prior: FixedConceptAdministrationWindow;
    readonly differences: {
      readonly startRows: number;
      readonly distinctPeople: number;
    };
    readonly metadataComparable: false;
    readonly interpretation: string;
  };
  readonly quality: {
    readonly status: 'attention_required';
    readonly signals: readonly FixedConceptQualitySignal[];
  };
  readonly limits: readonly { readonly code: string; readonly text: string }[];
}

export interface FixedConceptStateViewModel {
  readonly code: FixedConceptReconciliationState['code'];
  readonly label: string;
  readonly explanation: string;
  readonly rows: number;
  readonly rowsLabel: string;
  readonly peopleLabel: string;
  readonly widthPct: number;
  readonly tone: 'matched' | 'review' | 'not-observed';
}

export interface FixedConceptWindowViewModel {
  readonly code: FixedConceptAdministrationWindow['code'];
  readonly label: string;
  readonly dateRangeLabel: string;
  readonly daysLabel: string;
  readonly startRowsLabel: string;
  readonly peopleLabel: string;
  readonly conceptsLabel: string;
  readonly stateCoverageLabel: string;
  readonly movementCoverageLabel: string;
  readonly legalInstrumentRowsLabel: string;
}

export interface FixedConceptControlViewModel {
  readonly source: {
    readonly canonicalSystem: string;
    readonly snapshotLabel: string;
    readonly generatedLabel: string;
    readonly sourceFile: string;
    readonly sourceSha256: string;
    readonly notice: string;
  };
  readonly reconciliation: {
    readonly periodLabel: string;
    readonly anchorLabel: string;
    readonly eligibleRowsLabel: string;
    readonly eligiblePeopleLabel: string;
    readonly exactObservationRateLabel: string;
    readonly accessibleSummary: string;
    readonly states: readonly FixedConceptStateViewModel[];
  };
  readonly snapshot: {
    readonly asOfLabel: string;
    readonly eligibleRowsLabel: string;
    readonly eligiblePeopleLabel: string;
    readonly stateReportedLabel: string;
    readonly missingStateLabel: string;
    readonly movementTypeLabel: string;
    readonly legalInstrumentLabel: string;
    readonly conceptsObservedLabel: string;
    readonly categorySummary: string;
    readonly categories: readonly {
      readonly label: string;
      readonly rowsLabel: string;
      readonly peopleLabel: string;
      readonly protected: boolean;
    }[];
  };
  readonly comparison: {
    readonly windows: readonly [FixedConceptWindowViewModel, FixedConceptWindowViewModel];
    readonly differenceRowsLabel: string;
    readonly differencePeopleLabel: string;
    readonly interpretation: string;
  };
  readonly coverage: {
    readonly sourceRowsLabel: string;
    readonly validRangeRowsLabel: string;
    readonly validRangeRateLabel: string;
    readonly endBeforeStartRowsLabel: string;
    readonly missingEndRowsLabel: string;
    readonly legajoJoinCoverageLabel: string;
    readonly catalogCoverageLabel: string;
  };
  readonly quality: {
    readonly statusLabel: string;
    readonly signals: readonly {
      readonly code: string;
      readonly label: string;
      readonly severityLabel: string;
      readonly severity: FixedConceptQualitySignal['severity'];
      readonly rowsLabel: string;
      readonly rateLabel: string;
      readonly meaning: string;
    }[];
  };
  readonly limits: readonly string[];
}
