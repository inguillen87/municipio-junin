import { inspectGrhExecutiveContract } from './grh-executive-contract.js';
import { inspectGrhQualityContract } from './grh-quality-contract.js';
import { inspectGrhCloseContract } from './grh-close-contract.js';
import {
  GRH_DECISION_BRIEF_LIMITS,
  GRH_DECISION_BRIEF_PRIORITY_DEFINITIONS,
  GRH_DECISION_BRIEF_PRIVACY_THRESHOLD,
  GRH_DECISION_BRIEF_SCHEMA_VERSION,
  inspectGrhDecisionBriefContract,
} from './grh-decision-brief-contract.js';
import { GRH_PRIVACY_POLICY_VERSION } from './grh-privacy.js';

function briefError(code, message, details = []) {
  const error = new Error(message);
  error.code = code;
  error.details = Object.freeze([...new Set(details)]);
  return error;
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function add(errors, condition, code) {
  if (!condition) errors.push(code);
}

function prefixed(prefix, errors) {
  return errors.map(code => `${prefix}.${code}`);
}

function matchingRows(rows, period) {
  return Array.isArray(rows) ? rows.filter(row => row?.period === period) : [];
}

function periodIdentityErrors(executive, quality, close) {
  const errors = [];
  const period = close.source.latestValidCalculationPeriod;
  const executivePeriod = executive.workforce.referencePeriod;
  const qualityPeriod = quality.temporal.domains.calculo.lastValidPeriod;
  const closeComparisonPeriod = close.comparison.currentPeriod;
  add(errors,
    period === executivePeriod && period === qualityPeriod && period === closeComparisonPeriod,
    'identity.period');

  const closeCurrentRows = matchingRows(close.series, period);
  const executiveCurrentRows = matchingRows(executive.compensation.series, period);
  add(errors, closeCurrentRows.length === 1, 'identity.close_current_period');
  add(errors, executiveCurrentRows.length === 1, 'identity.executive_current_period');

  const executivePeriods = executive.compensation.series.map(row => row.period);
  const closePeriods = close.series.map(row => row.period);
  add(errors,
    executivePeriods.length === closePeriods.length &&
      executivePeriods.every((value, index) => value === closePeriods[index]),
    'identity.period_series');
  add(errors,
    closePeriods[0] === quality.temporal.domains.calculo.firstValidPeriod,
    'identity.first_period');

  if (closeCurrentRows.length !== 1 || executiveCurrentRows.length !== 1) return errors;
  const closeCurrent = closeCurrentRows[0];
  const executiveCurrent = executiveCurrentRows[0];
  if (closeCurrent.privacyStatus === 'released') {
    add(errors,
      closeCurrent.participantCount === executive.workforce.payrollParticipants &&
        closeCurrent.participantCount === executiveCurrent.participantCount &&
        closeCurrent.participantDisplay === executiveCurrent.participantDisplay &&
        executiveCurrent.privacyStatus === 'released',
      'identity.participants');
  } else {
    add(errors,
      executive.workforce.payrollParticipants < GRH_DECISION_BRIEF_PRIVACY_THRESHOLD &&
        executiveCurrent.privacyStatus === 'suppressed' &&
        executiveCurrent.participantCount === null &&
        executiveCurrent.participantDisplay === `<${GRH_DECISION_BRIEF_PRIVACY_THRESHOLD}`,
      'identity.protected_participants');
  }
  return errors;
}

function sourceIdentityErrors(executive, quality, close) {
  const errors = [];
  const sources = [executive.source, quality.source, close.source];
  for (const [field, code] of [
    ['canonicalSystem', 'canonical_system'],
    ['sourceFile', 'source_file'],
    ['sourceSha256', 'source_sha256'],
    ['snapshotAsOf', 'snapshot_as_of'],
    ['realtime', 'realtime'],
  ]) {
    add(errors, sources.every(source => source[field] === sources[0][field]), `identity.${code}`);
  }
  add(errors,
    executive.policyVersion === GRH_PRIVACY_POLICY_VERSION &&
      close.policyVersion === GRH_PRIVACY_POLICY_VERSION,
    'identity.policy_version');
  return errors;
}

function validateSources(executive, quality, close) {
  const executiveInspection = inspectGrhExecutiveContract(executive);
  const qualityInspection = inspectGrhQualityContract(quality);
  const closeInspection = inspectGrhCloseContract(close);
  const errors = [
    ...prefixed('executive', executiveInspection.errors),
    ...prefixed('quality', qualityInspection.errors),
    ...prefixed('close', closeInspection.errors),
  ];
  if (errors.length === 0) {
    errors.push(...sourceIdentityErrors(executive, quality, close));
    errors.push(...periodIdentityErrors(executive, quality, close));
  }
  if (errors.length > 0) {
    throw briefError(
      'GRH_DECISION_BRIEF_SOURCE_INVALID',
      'Los contratos GRH no son aptos para construir el brief ejecutivo.',
      errors,
    );
  }
}

function buildSituation(quality, current) {
  const aggregate = {
    qualityScorePct: quality.quality.score,
    temporalQuarantineRows: quality.temporal.quarantineRows,
  };
  if (current.privacyStatus !== 'released') {
    return {
      participantCount: null,
      participantDisplay: `<${GRH_DECISION_BRIEF_PRIVACY_THRESHOLD}`,
      ...aggregate,
      runCoveragePct: null,
      metricExactRatePct: null,
      valueAgreementPct: null,
      identityWithinRoundingTolerance: null,
    };
  }
  return {
    participantCount: current.participantCount,
    participantDisplay: current.participantDisplay,
    ...aggregate,
    runCoveragePct: current.reconciliation.runCoveragePct,
    metricExactRatePct: current.reconciliation.metricExactRatePct,
    valueAgreementPct: current.reconciliation.valueAgreementPct,
    identityWithinRoundingTolerance: current.control.identityWithinRoundingTolerance,
  };
}

function buildChange(comparison) {
  if (comparison.status !== 'released') {
    return {
      status: comparison.reason,
      previousPeriod: comparison.previousPeriod,
      participantDelta: null,
      runCoverageDeltaPctPoints: null,
      metricExactRateDeltaPctPoints: null,
      valueAgreementDeltaPctPoints: null,
    };
  }
  return {
    status: 'released',
    previousPeriod: comparison.previousPeriod,
    participantDelta: comparison.participantDelta,
    runCoverageDeltaPctPoints: comparison.reconciliationDeltas.runCoveragePct,
    metricExactRateDeltaPctPoints: comparison.reconciliationDeltas.metricExactRatePct,
    valueAgreementDeltaPctPoints: comparison.reconciliationDeltas.valueAgreementPct,
  };
}

function buildPriorities(quality, realtime) {
  const priorities = [];
  if (quality.reconciliation.status === 'material_differences_detected') {
    priorities.push({ ...GRH_DECISION_BRIEF_PRIORITY_DEFINITIONS[0] });
  }
  if (quality.temporal.quarantineRows > 0) {
    priorities.push({ ...GRH_DECISION_BRIEF_PRIORITY_DEFINITIONS[1] });
  }
  if (realtime === false) {
    priorities.push({ ...GRH_DECISION_BRIEF_PRIORITY_DEFINITIONS[2] });
  }
  return priorities;
}

function statusForPriorities(priorities) {
  if (priorities.some(row => row.severity === 'critical')) return 'attention_required';
  if (priorities.some(row => row.severity === 'warning')) return 'review_recommended';
  return 'context_only';
}

export function buildGrhDecisionBriefProjection(executive, quality, close) {
  validateSources(executive, quality, close);

  const period = close.source.latestValidCalculationPeriod;
  const current = close.series.find(row => row.period === period);
  const priorities = buildPriorities(quality, close.source.realtime);
  const projection = {
    schemaVersion: GRH_DECISION_BRIEF_SCHEMA_VERSION,
    policyVersion: GRH_PRIVACY_POLICY_VERSION,
    source: {
      canonicalSystem: close.source.canonicalSystem,
      sourceFile: close.source.sourceFile,
      sourceSha256: close.source.sourceSha256,
      snapshotAsOf: close.source.snapshotAsOf,
      latestValidCalculationPeriod: period,
      realtime: close.source.realtime,
    },
    privacy: {
      audience: 'interactive',
      threshold: GRH_DECISION_BRIEF_PRIVACY_THRESHOLD,
      aggregateOnly: true,
      containsPii: false,
      employeeIdentifiersExported: false,
      rawRowsExported: false,
      categoricalLabelsExported: false,
      cellCodesExported: false,
      monetaryAmountsExported: false,
    },
    period,
    status: statusForPriorities(priorities),
    situation: buildSituation(quality, current),
    change: buildChange(close.comparison),
    priorities,
    limits: [...GRH_DECISION_BRIEF_LIMITS],
  };

  const outputInspection = inspectGrhDecisionBriefContract(projection);
  if (!outputInspection.ok) {
    throw briefError(
      'GRH_DECISION_BRIEF_PROJECTION_INVALID',
      'El brief ejecutivo GRH no supera el contrato de salida.',
      outputInspection.errors,
    );
  }
  return deepFreeze(projection);
}
