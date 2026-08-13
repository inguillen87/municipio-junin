import {
  GRH_ADMINISTRATION_COMPARISON_DEFINITIONS,
  GRH_ADMINISTRATION_COMPARISON_LIMITS,
  GRH_ADMINISTRATION_COMPARISON_PERIODS,
  GRH_ADMINISTRATION_COMPARISON_PRIVACY_RULE,
  GRH_ADMINISTRATION_COMPARISON_SCHEMA_VERSION,
  GRH_ADMINISTRATION_COMPARISON_THRESHOLD,
  inspectGrhAdministrationComparisonContract,
} from './grh-administration-comparison-contract.js';

const AUDIENCES = new Set(['private', 'portable']);
const PERIOD_KEYS = Object.freeze(['current', 'prior']);
const ABSENCE_METRIC_KEYS = Object.freeze([
  'eventRows',
  'distinctPeople',
  'reportedDays',
  'knownEventRows',
  'missingEventRows',
]);
const HEX_64 = /^[0-9a-f]{64}$/;

function comparisonError(code) {
  const error = new Error('La comparación de períodos administrativos no supera los controles requeridos.');
  error.code = code;
  return error;
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validPeriodMetrics(period) {
  return ABSENCE_METRIC_KEYS.every(key => nonNegativeInteger(period?.[key])) &&
    nonNegativeInteger(period?.reportedIngressDates) &&
    nonNegativeInteger(period?.reportedExitDates) &&
    period.distinctPeople <= period.eventRows &&
    period.knownEventRows + period.missingEventRows === period.eventRows;
}

function governedCountIsSmall(value) {
  return Math.abs(value) > 0 && Math.abs(value) < GRH_ADMINISTRATION_COMPARISON_THRESHOLD;
}

function pairHasSmallCell(current, prior) {
  return governedCountIsSmall(current) ||
    governedCountIsSmall(prior) ||
    governedCountIsSmall(current - prior);
}

function valuesFor(current, prior, protectedBlock) {
  return protectedBlock
    ? { current: null, prior: null, difference: null }
    : { current, prior, difference: current - prior };
}

function metric(label, current, prior, protectedBlock) {
  return {
    label,
    values: valuesFor(current, prior, protectedBlock),
  };
}

function dateRow(definition, current, prior, protectedBlock) {
  return {
    key: definition.key,
    label: definition.label,
    meaning: definition.meaning,
    privacyStatus: protectedBlock ? 'protected' : 'released',
    values: valuesFor(current, prior, protectedBlock),
  };
}

function validateAggregate(aggregate) {
  const source = aggregate?.source;
  const identity = aggregate?.identity;
  if (
    source?.schemaVersion !== 'grh-directory-v3' ||
    typeof source?.canonicalSystem !== 'string' || source.canonicalSystem.length === 0 ||
    source.canonicalSystem.length > 120 ||
    !HEX_64.test(source?.sourceSha256 || '') ||
    !HEX_64.test(source?.contentSha256 || '') ||
    source?.snapshotAsOf !== GRH_ADMINISTRATION_COMPARISON_PERIODS.current.endDate ||
    !nonNegativeInteger(source?.recordCount) ||
    source.recordCount < GRH_ADMINISTRATION_COMPARISON_THRESHOLD ||
    !nonNegativeInteger(source?.absenceEventCount) ||
    !nonNegativeInteger(identity?.materializedPeople) ||
    !nonNegativeInteger(identity?.uniquePeople) ||
    !nonNegativeInteger(identity?.employmentPeople) ||
    !nonNegativeInteger(identity?.digestedPeople) ||
    !nonNegativeInteger(identity?.materializedAbsenceEvents) ||
    identity.materializedPeople !== source.recordCount ||
    identity.uniquePeople !== source.recordCount ||
    identity.employmentPeople !== source.recordCount ||
    identity.digestedPeople !== source.recordCount ||
    identity.materializedAbsenceEvents !== source.absenceEventCount ||
    aggregate.current?.eventRows + aggregate.prior?.eventRows > source.absenceEventCount ||
    !PERIOD_KEYS.every(key => validPeriodMetrics(aggregate?.[key]))
  ) {
    throw comparisonError('GRH_ADMINISTRATION_COMPARISON_AGGREGATE_INVALID');
  }
  for (const key of PERIOD_KEYS) {
    if (aggregate[key].reportedIngressDates > source.recordCount ||
      aggregate[key].reportedExitDates > source.recordCount) {
      throw comparisonError('GRH_ADMINISTRATION_COMPARISON_AGGREGATE_INVALID');
    }
    // `reportedDays` is only an exact total when every event row carries its
    // days value. V1 never publishes a silently partial sum.
    if (aggregate[key].missingEventRows !== 0) {
      throw comparisonError('GRH_ADMINISTRATION_COMPARISON_DAY_COVERAGE_INCOMPLETE');
    }
  }
}

export function buildGrhAdministrationComparisonProjection(aggregate, {
  audience = 'portable',
} = {}) {
  if (!AUDIENCES.has(audience)) {
    throw comparisonError('GRH_ADMINISTRATION_COMPARISON_OPTIONS_INVALID');
  }
  validateAggregate(aggregate);

  const current = aggregate.current;
  const prior = aggregate.prior;
  const portable = audience === 'portable';
  const protectAbsence = portable && ABSENCE_METRIC_KEYS.some(
    key => pairHasSmallCell(current[key], prior[key]),
  );
  const protectIngress = portable && pairHasSmallCell(
    current.reportedIngressDates,
    prior.reportedIngressDates,
  );
  const protectExit = portable && pairHasSmallCell(
    current.reportedExitDates,
    prior.reportedExitDates,
  );

  const absenceDefinition = GRH_ADMINISTRATION_COMPARISON_DEFINITIONS.absence;
  const comparison = {
    absence: {
      key: absenceDefinition.key,
      label: absenceDefinition.label,
      meaning: absenceDefinition.meaning,
      privacyStatus: protectAbsence ? 'protected' : 'released',
      eventRows: metric(
        absenceDefinition.metrics.eventRows,
        current.eventRows,
        prior.eventRows,
        protectAbsence,
      ),
      distinctPeople: metric(
        absenceDefinition.metrics.distinctPeople,
        current.distinctPeople,
        prior.distinctPeople,
        protectAbsence,
      ),
      reportedDays: metric(
        absenceDefinition.metrics.reportedDays,
        current.reportedDays,
        prior.reportedDays,
        protectAbsence,
      ),
      dayCoverage: {
        knownEventRows: metric(
          absenceDefinition.metrics.knownEventRows,
          current.knownEventRows,
          prior.knownEventRows,
          protectAbsence,
        ),
        missingEventRows: metric(
          absenceDefinition.metrics.missingEventRows,
          current.missingEventRows,
          prior.missingEventRows,
          protectAbsence,
        ),
      },
    },
    reportedIngressDates: dateRow(
      GRH_ADMINISTRATION_COMPARISON_DEFINITIONS.reportedIngressDates,
      current.reportedIngressDates,
      prior.reportedIngressDates,
      protectIngress,
    ),
    reportedExitDates: dateRow(
      GRH_ADMINISTRATION_COMPARISON_DEFINITIONS.reportedExitDates,
      current.reportedExitDates,
      prior.reportedExitDates,
      protectExit,
    ),
  };
  const protectedBlocks = [protectAbsence, protectIngress, protectExit].filter(Boolean).length;
  const status = protectedBlocks === 0
    ? 'released'
    : protectedBlocks === 3 ? 'protected' : 'partially_protected';

  const projection = {
    schemaVersion: GRH_ADMINISTRATION_COMPARISON_SCHEMA_VERSION,
    source: {
      schemaVersion: aggregate.source.schemaVersion,
      canonicalSystem: aggregate.source.canonicalSystem,
      sourceSha256: aggregate.source.sourceSha256,
      contentSha256: aggregate.source.contentSha256,
      snapshotAsOf: aggregate.source.snapshotAsOf,
    },
    privacy: {
      audience,
      threshold: GRH_ADMINISTRATION_COMPARISON_THRESHOLD,
      status,
      aggregateOnly: true,
      containsPii: false,
      personIdentifiersExported: false,
      rawRowsExported: false,
      causeLabelsExported: false,
      rule: GRH_ADMINISTRATION_COMPARISON_PRIVACY_RULE,
    },
    periods: {
      current: { ...GRH_ADMINISTRATION_COMPARISON_PERIODS.current },
      prior: { ...GRH_ADMINISTRATION_COMPARISON_PERIODS.prior },
    },
    comparison,
    limits: GRH_ADMINISTRATION_COMPARISON_LIMITS.map(limit => ({ ...limit })),
  };
  const inspection = inspectGrhAdministrationComparisonContract(projection);
  if (!inspection.ok) {
    throw comparisonError('GRH_ADMINISTRATION_COMPARISON_PROJECTION_INVALID');
  }
  return deepFreeze(projection);
}
