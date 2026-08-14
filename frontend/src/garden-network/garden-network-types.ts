export interface GardenNetworkSource {
  readonly canonicalSystem: string;
  readonly sourceFile: string;
  readonly sourceSha256: string;
  readonly snapshotAsOf: string;
  readonly realtime: false;
}

export interface GardenNetworkPrivacy {
  readonly status: 'released_with_protected_bucket';
  readonly threshold: 10;
  readonly aggregateOnly: true;
  readonly containsPii: false;
  readonly personIdentifiersExported: false;
  readonly employmentKeysExported: false;
  readonly sourceCodesExported: false;
  readonly rawRowsExported: false;
  readonly complementarySuppression: true;
}

export interface GardenNetworkGrain {
  readonly entity: 'person';
  readonly identityBasis: 'legajo.IDPERSONA';
  readonly deduplication: 'distinct_person_across_employment_keys';
}

export interface GardenNetworkQuality {
  readonly status: 'reconciled';
  readonly assignmentPolicyVersion: 'grh-garden-network-assignment-v1';
  readonly latestValidCalculationPeriod: string;
  readonly sourceEmploymentKeys: number;
  readonly linkedEmploymentKeys: number;
  readonly people: number;
  readonly observedUnitCount: number;
  readonly releasedUnitCount: number;
  readonly reconciliationOk: true;
}

export interface GardenNetworkReferencePeriod {
  readonly period: string;
  readonly label: string;
  readonly status: 'latest_valid_calculation';
}

export interface GardenNetworkSummary {
  readonly people: number;
  readonly releasedPeople: number;
  readonly protectedPeople: number;
  readonly releasedUnitCount: number;
  readonly observedUnitCount: number;
}

export interface GardenNetworkMonthlyPoint {
  readonly period: string;
  readonly label: string;
  readonly people: number;
}

export interface GardenNetworkReleasedUnit {
  readonly label: string;
  readonly people: number;
  readonly sharePct: number;
}

export interface GardenNetworkProtectedBucket {
  readonly label: string;
  readonly people: number;
  readonly sharePct: number;
  readonly privacyStatus: 'protected_aggregate';
}

export interface GardenNetworkContract {
  readonly schemaVersion: 'grh-garden-network-v1';
  readonly generatedAt: string;
  readonly source: GardenNetworkSource;
  readonly privacy: GardenNetworkPrivacy;
  readonly grain: GardenNetworkGrain;
  readonly quality: GardenNetworkQuality;
  readonly referencePeriod: GardenNetworkReferencePeriod;
  readonly summary: GardenNetworkSummary;
  readonly monthlyTrend: readonly GardenNetworkMonthlyPoint[];
  readonly releasedUnits: readonly GardenNetworkReleasedUnit[];
  readonly protectedBucket: GardenNetworkProtectedBucket;
  readonly limits: readonly { readonly code: string; readonly text: string }[];
}

export interface GardenNetworkChartPoint {
  readonly period: string;
  readonly periodLabel: string;
  readonly shortLabel: string;
  readonly people: number;
  readonly peopleLabel: string;
  readonly x: number;
  readonly y: number;
  readonly anchor: boolean;
}

export interface GardenNetworkChartGuide {
  readonly label: string;
  readonly value: number;
  readonly y: number;
}

export interface GardenNetworkViewModel {
  readonly source: {
    readonly canonicalSystem: string;
    readonly snapshotLabel: string;
    readonly generatedLabel: string;
    readonly sourceFile: string;
    readonly sourceSha256: string;
    readonly notice: string;
  };
  readonly summary: {
    readonly referencePeriodLabel: string;
    readonly peopleLabel: string;
    readonly observedUnitsLabel: string;
    readonly releasedPeopleLabel: string;
    readonly releasedUnitsLabel: string;
    readonly protectedPeopleLabel: string;
    readonly accessibleSummary: string;
  };
  readonly trend: {
    readonly periodCountLabel: string;
    readonly rangeLabel: string;
    readonly startPeopleLabel: string;
    readonly endPeopleLabel: string;
    readonly changeLabel: string;
    readonly accessibleSummary: string;
    readonly path: string;
    readonly fillPath: string;
    readonly points: readonly GardenNetworkChartPoint[];
    readonly guides: readonly GardenNetworkChartGuide[];
  };
  readonly units: {
    readonly released: readonly {
      readonly label: string;
      readonly peopleLabel: string;
      readonly shareLabel: string;
      readonly widthPct: number;
    }[];
    readonly protected: {
      readonly label: string;
      readonly peopleLabel: string;
      readonly shareLabel: string;
      readonly widthPct: number;
    };
    readonly accessibleSummary: string;
  };
  readonly quality: {
    readonly statusLabel: string;
    readonly latestValidPeriodLabel: string;
    readonly sourceEmploymentKeysLabel: string;
    readonly linkedEmploymentKeysLabel: string;
    readonly reconciliationLabel: string;
  };
  readonly methodology: readonly { readonly label: string; readonly value: string }[];
  readonly mapReadiness: {
    readonly title: string;
    readonly description: string;
  };
  readonly dataGaps: {
    readonly title: string;
    readonly items: readonly string[];
  };
  readonly limits: readonly string[];
}
