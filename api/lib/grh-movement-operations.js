import { inspectGrhSemanticContract } from './grh-contract.js';
import {
  buildGrhMovementOperationsActions,
  GRH_MOVEMENT_OPERATIONS_LIMITS,
  GRH_MOVEMENT_OPERATIONS_METRIC,
  GRH_MOVEMENT_OPERATIONS_POLICY_VERSION,
  GRH_MOVEMENT_OPERATIONS_PRIVACY_THRESHOLD,
  GRH_MOVEMENT_OPERATIONS_SCHEMA_VERSION,
  inspectGrhMovementOperationsContract,
} from './grh-movement-operations-contract.js';

function movementError(code, details = []) {
  const error = new TypeError('El centro de movimientos GRH no esta disponible.');
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
  return Number(value.toFixed(4));
}

function protectSeries(rows) {
  const protectedRows = rows.filter(row => row.participants < GRH_MOVEMENT_OPERATIONS_PRIVACY_THRESHOLD);
  const releasedRows = rows.filter(row => row.participants >= GRH_MOVEMENT_OPERATIONS_PRIVACY_THRESHOLD);
  if (protectedRows.length === 1) {
    const companion = releasedRows
      .slice()
      .sort((left, right) => left.participants - right.participants || left.year.localeCompare(right.year))[0];
    if (!companion) throw movementError('GRH_MOVEMENT_OPERATIONS_PRIVACY_UNRELEASABLE');
    protectedRows.push(companion);
  }
  const protectedYears = new Set(protectedRows.map(row => row.year));
  return rows.map(row => protectedYears.has(row.year) ? {
    year: row.year,
    status: row.status,
    privacyStatus: 'protected',
    events: null,
    participants: null,
    eventsPerParticipant: null,
  } : {
    ...row,
    privacyStatus: 'released',
  });
}

function unavailableComparison() {
  return {
    fromYear: null,
    toYear: null,
    status: 'unavailable',
    eventDelta: null,
    eventDeltaPct: null,
    participantDelta: null,
    participantDeltaPct: null,
    intensityDelta: null,
    intensityDeltaPct: null,
  };
}

function buildComparison(releasedComplete) {
  const [from, to] = releasedComplete.slice(-2);
  if (!from || !to) return unavailableComparison();
  const eventDelta = to.events - from.events;
  const participantDelta = to.participants - from.participants;
  const intensityDelta = round4(to.eventsPerParticipant - from.eventsPerParticipant);
  return {
    fromYear: from.year,
    toYear: to.year,
    status: 'available',
    eventDelta,
    eventDeltaPct: round4((eventDelta / from.events) * 100),
    participantDelta,
    participantDeltaPct: round4((participantDelta / from.participants) * 100),
    intensityDelta,
    intensityDeltaPct: round4((intensityDelta / from.eventsPerParticipant) * 100),
  };
}

function assertSourceIdentities(semantic) {
  const movements = semantic.movements;
  const temporal = semantic.period_quality.legamov;
  const coverage = semantic.coverage.facts.legamov;
  if (
    movements.source_table !== 'legamov' ||
    movements.valid_rows !== temporal.valid_rows ||
    movements.quarantine_rows !== temporal.quarantine_rows ||
    temporal.rows !== coverage.rows ||
    temporal.valid_rows + temporal.quarantine_rows !== temporal.rows ||
    coverage.matched_rows + coverage.orphan_rows !== coverage.rows
  ) throw movementError('GRH_MOVEMENT_OPERATIONS_SOURCE_RECONCILIATION_FAILED');
}

export function buildGrhMovementOperationsProjection(semantic) {
  const inspection = inspectGrhSemanticContract(semantic);
  if (!inspection.ok) {
    throw movementError('GRH_MOVEMENT_OPERATIONS_SOURCE_INVALID', inspection.errors);
  }
  assertSourceIdentities(semantic);
  const snapshotYear = semantic.source.snapshot_as_of.slice(0, 4);
  const sourceRows = Object.entries(semantic.movements.valid_by_year)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([year, events]) => {
      const participants = semantic.movements.distinct_participants_by_year[year];
      return {
        year,
        status: year === snapshotYear ? 'partial' : 'complete',
        events,
        participants,
        eventsPerParticipant: participants > 0 ? round4(events / participants) : null,
      };
    });
  const series = protectSeries(sourceRows);
  const released = series.filter(row => row.privacyStatus === 'released');
  const releasedComplete = released.filter(row => row.status === 'complete');
  const latestComplete = releasedComplete.at(-1) || null;
  const defaultComparison = buildComparison(releasedComplete);
  const temporal = semantic.period_quality.legamov;
  const factCoverage = semantic.coverage.facts.legamov;
  const projection = {
    schemaVersion: GRH_MOVEMENT_OPERATIONS_SCHEMA_VERSION,
    policyVersion: GRH_MOVEMENT_OPERATIONS_POLICY_VERSION,
    source: {
      canonicalSystem: semantic.source.canonical_system,
      sourceFile: semantic.source.file,
      sourceSha256: semantic.source.sha256,
      snapshotAsOf: semantic.source.snapshot_as_of,
      generatedAt: semantic.source.generated_at,
      realtime: semantic.source.realtime,
      sourceTable: 'legamov',
    },
    metric: { ...GRH_MOVEMENT_OPERATIONS_METRIC },
    coverage: {
      sourceRows: temporal.rows,
      validRows: temporal.valid_rows,
      quarantineRows: temporal.quarantine_rows,
      validRatePct: temporal.valid_rate_pct,
      validPeriods: temporal.valid_periods,
      firstValidPeriod: temporal.first_valid_period,
      lastValidPeriod: temporal.last_valid_period,
      matchedRows: factCoverage.matched_rows,
      orphanRows: factCoverage.orphan_rows,
      joinIntegrityPct: factCoverage.join_integrity_pct,
      distinctEmployeeKeys: factCoverage.distinct_employee_keys,
      employeeCoveragePct: factCoverage.employee_coverage_pct,
    },
    summary: {
      firstYear: series[0]?.year ?? null,
      lastObservedYear: series.at(-1)?.year ?? null,
      lastObservedYearStatus: series.at(-1)?.status ?? null,
      latestCompleteYear: latestComplete?.year ?? null,
      yearsAvailable: series.length,
      releasedYears: released.length,
      protectedYears: series.length - released.length,
      latestCompleteEvents: latestComplete?.events ?? null,
      latestCompleteParticipants: latestComplete?.participants ?? null,
      latestCompleteEventsPerParticipant: latestComplete?.eventsPerParticipant ?? null,
      defaultComparison,
    },
    series,
    actions: buildGrhMovementOperationsActions(defaultComparison)
      .map(action => ({ ...action })),
    limits: {
      privacyThreshold: GRH_MOVEMENT_OPERATIONS_LIMITS.privacyThreshold,
      availableWindows: [...GRH_MOVEMENT_OPERATIONS_LIMITS.availableWindows],
      availableMetrics: [...GRH_MOVEMENT_OPERATIONS_LIMITS.availableMetrics],
      classification: GRH_MOVEMENT_OPERATIONS_LIMITS.classification,
    },
  };
  const outputInspection = inspectGrhMovementOperationsContract(projection, {
    expectedSourceSha256: semantic.source.sha256,
    expectedSnapshotAsOf: semantic.source.snapshot_as_of,
  });
  if (!outputInspection.ok) {
    throw movementError('GRH_MOVEMENT_OPERATIONS_PROJECTION_INVALID', outputInspection.errors);
  }
  return deepFreeze(projection);
}
