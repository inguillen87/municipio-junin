import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  GRH_DECISION_BRIEF_LIMITS,
  GRH_DECISION_BRIEF_PRIORITY_DEFINITIONS,
  GRH_DECISION_BRIEF_SCHEMA_VERSION,
  inspectGrhDecisionBriefContract,
  validateGrhDecisionBriefContract,
} from '../api/lib/grh-decision-brief-contract.js';
import { buildGrhDecisionBriefProjection } from '../api/lib/grh-decision-brief-projection.js';
import { inspectGrhExecutiveContract } from '../api/lib/grh-executive-contract.js';
import { buildGrhExecutiveProjection } from '../api/lib/grh-executive-projection.js';
import { buildGrhQualityProjection } from '../api/lib/grh-quality-projection.js';
import { inspectGrhCloseContract } from '../api/lib/grh-close-contract.js';
import { buildGrhCloseProjection } from '../api/lib/grh-close-projection.js';

async function realInputs() {
  const [profile, semantic] = await Promise.all([
    readFile(new URL('../api/_data/grh-profile.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../api/_data/grh-semantic.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  return {
    executive: buildGrhExecutiveProjection(semantic),
    quality: buildGrhQualityProjection(profile, semantic),
    close: buildGrhCloseProjection(semantic),
  };
}

function assertDeepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}

function nullFields(object, keys) {
  for (const key of keys) object[key] = null;
}

function protectedInputs(inputs) {
  const executive = structuredClone(inputs.executive);
  const quality = structuredClone(inputs.quality);
  const close = structuredClone(inputs.close);
  const period = close.source.latestValidCalculationPeriod;

  executive.workforce.payrollParticipants = 9;
  for (const rankingKey of ['bySector', 'byCostCenter', 'byAgreement']) {
    const ranking = executive.workforce[rankingKey];
    const seed = ranking.rows.find(row => row.privacyStatus === 'released');
    ranking.totalParticipants = 9;
    ranking.participantDisplay = '9';
    ranking.privacyStatus = 'released';
    ranking.rows = [{
      ...seed,
      participants: 9,
      participantDisplay: '9',
      sharePct: 100,
      privacyStatus: 'released',
    }];
  }
  const executiveCurrent = executive.compensation.series.find(row => row.period === period);
  executiveCurrent.participantCount = null;
  executiveCurrent.participantDisplay = '<10';
  executiveCurrent.privacyStatus = 'suppressed';
  nullFields(executiveCurrent.amounts, Object.keys(executiveCurrent.amounts));

  const closeCurrent = close.series.find(row => row.period === period);
  closeCurrent.participantCount = null;
  closeCurrent.participantDisplay = '<10';
  closeCurrent.privacyStatus = 'suppressed';
  nullFields(closeCurrent.components, Object.keys(closeCurrent.components));
  nullFields(closeCurrent.control, Object.keys(closeCurrent.control));
  nullFields(closeCurrent.reconciliation, Object.keys(closeCurrent.reconciliation));
  close.comparison.status = 'unavailable';
  close.comparison.reason = 'privacy_protected';
  close.comparison.participantDelta = null;
  nullFields(close.comparison.componentDeltas, Object.keys(close.comparison.componentDeltas));
  nullFields(close.comparison.reconciliationDeltas,
    Object.keys(close.comparison.reconciliationDeltas));

  assert.equal(inspectGrhExecutiveContract(executive).ok, true);
  assert.equal(inspectGrhCloseContract(close).ok, true);
  return { executive, quality, close };
}

test('real GRH projections build the exact immutable grh-decision-brief-v1 contract', async () => {
  const inputs = await realInputs();
  const before = structuredClone(inputs);
  const projection = buildGrhDecisionBriefProjection(
    inputs.executive,
    inputs.quality,
    inputs.close,
  );

  assert.deepEqual(inputs, before, 'the three governed projections must remain immutable');
  assert.equal(projection.schemaVersion, GRH_DECISION_BRIEF_SCHEMA_VERSION);
  assert.equal(projection.schemaVersion, 'grh-decision-brief-v1');
  assert.equal(projection.policyVersion, 'grh-small-cell-v1');
  assert.deepEqual(Object.keys(projection), [
    'schemaVersion',
    'policyVersion',
    'source',
    'privacy',
    'period',
    'status',
    'situation',
    'change',
    'priorities',
    'limits',
  ]);
  assert.equal(validateGrhDecisionBriefContract(projection), true);
  assertDeepFrozen(projection);
});

test('the real situation uses the selected monthly row and keeps quality evidence aggregate', async () => {
  const { executive, quality, close } = await realInputs();
  const projection = buildGrhDecisionBriefProjection(executive, quality, close);

  assert.equal(projection.period, '2026-07');
  assert.deepEqual(projection.situation, {
    participantCount: 856,
    participantDisplay: '856',
    qualityScorePct: 88.99,
    temporalQuarantineRows: 20_534,
    runCoveragePct: 100,
    metricExactRatePct: 40,
    valueAgreementPct: 6.4927,
    identityWithinRoundingTolerance: true,
  });
  assert.deepEqual(projection.change, {
    status: 'released',
    previousPeriod: '2026-06',
    participantDelta: 1,
    runCoverageDeltaPctPoints: 0,
    metricExactRateDeltaPctPoints: 0,
    valueAgreementDeltaPctPoints: 5.8025,
  });
  assert.notEqual(
    projection.situation.valueAgreementPct,
    quality.reconciliation.valueAgreementPct,
    'the global snapshot score must never masquerade as the current monthly value',
  );
});

test('priorities and limitations are deterministic enums with only allowlisted navigation', async () => {
  const { executive, quality, close } = await realInputs();
  const projection = buildGrhDecisionBriefProjection(executive, quality, close);

  assert.equal(projection.status, 'attention_required');
  assert.deepEqual(projection.priorities, GRH_DECISION_BRIEF_PRIORITY_DEFINITIONS);
  assert.deepEqual(projection.limits, GRH_DECISION_BRIEF_LIMITS);
  assert.deepEqual(projection.priorities.at(-1), {
    code: 'historical_snapshot',
    severity: 'context',
    href: null,
    requiredCapability: null,
  });
});

test('SHA, snapshot and current-period identity drift fail closed across all three inputs', async () => {
  const base = await realInputs();
  const scenarios = [
    ['identity.source_sha256', inputs => {
      inputs.executive.source.sourceSha256 = 'a'.repeat(64);
    }],
    ['identity.snapshot_as_of', inputs => {
      inputs.quality.source.snapshotAsOf = '2026-08-05';
    }],
    ['identity.source_file', inputs => {
      inputs.close.source.sourceFile = 'grh_junin.other_snapshot.sql.gz';
    }],
    ['identity.period', inputs => {
      inputs.executive.workforce.referencePeriod = '2026-06';
    }],
    ['identity.period', inputs => {
      inputs.quality.temporal.domains.calculo.lastValidPeriod = '2026-06';
    }],
  ];

  for (const [detail, mutate] of scenarios) {
    const inputs = structuredClone(base);
    mutate(inputs);
    assert.throws(
      () => buildGrhDecisionBriefProjection(inputs.executive, inputs.quality, inputs.close),
      error => error?.code === 'GRH_DECISION_BRIEF_SOURCE_INVALID' &&
        error.details.includes(detail),
      detail,
    );
  }
});

test('missing, duplicate and out-of-range monthly series fail closed', async () => {
  const base = await realInputs();
  const period = base.close.source.latestValidCalculationPeriod;
  const scenarios = [
    inputs => {
      inputs.close.series = inputs.close.series.filter(row => row.period !== period);
    },
    inputs => {
      inputs.close.series.push(structuredClone(
        inputs.close.series.find(row => row.period === period),
      ));
    },
    inputs => {
      inputs.close.series.find(row => row.period === period).reconciliation.valueAgreementPct = 101;
    },
    inputs => {
      inputs.executive.compensation.series = inputs.executive.compensation.series
        .filter(row => row.period !== period);
    },
  ];

  for (const mutate of scenarios) {
    const inputs = structuredClone(base);
    mutate(inputs);
    assert.throws(
      () => buildGrhDecisionBriefProjection(inputs.executive, inputs.quality, inputs.close),
      error => error?.code === 'GRH_DECISION_BRIEF_SOURCE_INVALID',
    );
  }
});

test('an interactive cell below k=10 suppresses the situation and protected comparison', async () => {
  const inputs = protectedInputs(await realInputs());
  const projection = buildGrhDecisionBriefProjection(
    inputs.executive,
    inputs.quality,
    inputs.close,
  );

  assert.deepEqual(projection.situation, {
    participantCount: null,
    participantDisplay: '<10',
    qualityScorePct: 88.99,
    temporalQuarantineRows: 20_534,
    runCoveragePct: null,
    metricExactRatePct: null,
    valueAgreementPct: null,
    identityWithinRoundingTolerance: null,
  });
  assert.deepEqual(projection.change, {
    status: 'privacy_protected',
    previousPeriod: '2026-06',
    participantDelta: null,
    runCoverageDeltaPctPoints: null,
    metricExactRateDeltaPctPoints: null,
    valueAgreementDeltaPctPoints: null,
  });
  assert.equal(validateGrhDecisionBriefContract(projection), true);
});

test('a genuinely absent consecutive month emits null deltas without older-period fallback', async () => {
  const inputs = structuredClone(await realInputs());
  const missingPeriod = inputs.close.comparison.previousPeriod;
  inputs.executive.compensation.series = inputs.executive.compensation.series
    .filter(row => row.period !== missingPeriod);
  inputs.close.series = inputs.close.series.filter(row => row.period !== missingPeriod);
  inputs.close.comparison.status = 'unavailable';
  inputs.close.comparison.reason = 'period_missing';
  inputs.close.comparison.participantDelta = null;
  nullFields(inputs.close.comparison.componentDeltas,
    Object.keys(inputs.close.comparison.componentDeltas));
  nullFields(inputs.close.comparison.reconciliationDeltas,
    Object.keys(inputs.close.comparison.reconciliationDeltas));
  assert.equal(inspectGrhCloseContract(inputs.close).ok, true);

  const projection = buildGrhDecisionBriefProjection(
    inputs.executive,
    inputs.quality,
    inputs.close,
  );
  assert.equal(projection.change.status, 'period_missing');
  assert.deepEqual(
    Object.values(projection.change).slice(2),
    [null, null, null, null],
  );
});

test('the exact-key contract rejects PII, labels, cell codes, amounts, owners and deadlines', async () => {
  const { executive, quality, close } = await realInputs();
  const projection = buildGrhDecisionBriefProjection(executive, quality, close);
  const scenarios = [
    ['decision_brief.structure', value => { value.owner = 'rrhh'; }],
    ['decision_brief.structure', value => { value.dueDate = '2026-08-10'; }],
    ['source.structure', value => { value.source.dni = '12.345.678'; }],
    ['priorities.row_structure', value => { value.priorities[0].label = 'persona privada'; }],
    ['priorities.row_structure', value => { value.priorities[0].sourceCode = 7; }],
    ['situation.structure', value => { value.situation.netPayrollCents = 42; }],
  ];

  for (const [expectedError, mutate] of scenarios) {
    const candidate = structuredClone(projection);
    mutate(candidate);
    const inspection = inspectGrhDecisionBriefContract(candidate);
    assert.equal(inspection.ok, false);
    assert.ok(inspection.errors.includes(expectedError), expectedError);
    assert.ok(inspection.errors.includes('privacy.forbidden_property'));
  }

  const forgedPrivacy = structuredClone(projection);
  forgedPrivacy.privacy.monetaryAmountsExported = true;
  assert.ok(inspectGrhDecisionBriefContract(forgedPrivacy).errors
    .includes('privacy.monetaryAmountsExported'));
});

test('upstream extras and participant drift are rejected before projection', async () => {
  const inputs = structuredClone(await realInputs());
  inputs.quality.email = 'persona@junin.gob.ar';
  assert.throws(
    () => buildGrhDecisionBriefProjection(inputs.executive, inputs.quality, inputs.close),
    error => error?.code === 'GRH_DECISION_BRIEF_SOURCE_INVALID' &&
      error.details.includes('quality.quality_projection.structure') &&
      error.details.includes('quality.privacy.forbidden_value'),
  );

  const drift = structuredClone(await realInputs());
  drift.close.series.find(row => row.period === drift.close.source.latestValidCalculationPeriod)
    .participantCount -= 1;
  drift.close.series.find(row => row.period === drift.close.source.latestValidCalculationPeriod)
    .participantDisplay = '855';
  drift.close.comparison.participantDelta = 0;
  assert.throws(
    () => buildGrhDecisionBriefProjection(drift.executive, drift.quality, drift.close),
    error => error?.code === 'GRH_DECISION_BRIEF_SOURCE_INVALID' &&
      error.details.includes('identity.participants'),
  );
});
