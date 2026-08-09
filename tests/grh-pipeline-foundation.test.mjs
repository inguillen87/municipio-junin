import assert from 'node:assert/strict';
import test from 'node:test';

import pipeline from '../shared/grh-pipeline-foundation.cjs';

const {
  DECISION_CODES,
  RUN_EVENTS,
  RUN_STATES,
  STAGES,
  RECEIPT_OUTCOMES,
  buildFreshnessEvidence,
  buildStageReceipt,
  decideGrhPipelineTransition,
  derivePipelineIdempotencyKey,
  digestPipelineManifest,
  digestStageReceipt,
  digestFreshnessPolicy,
  evaluateFreshness,
  evaluateRestoreEvidence,
  inspectPipelineManifest,
  inspectPipelineObservation,
  inspectPipelineRun,
  inspectStageReceipt,
  planGrhPipelineRun,
} = pipeline;

const sha = character => character.repeat(64);

function manifest(overrides = {}) {
  return {
    schemaVersion: 'grh-pipeline-manifest-v1',
    runId: 'run-2026-08-09-001',
    executionScope: 'LOCAL_REPLAY',
    publicationTarget: 'LOCAL_STATE',
    tenantId: null,
    sourceId: 'grh-junin',
    sourceSystem: 'GRH',
    snapshotAsOf: '2026-08-06',
    sourceSha256: sha('a'),
    sourceManifestDigest: sha('d'),
    sourceSizeBytes: 44_537_741,
    extractorVersion: 'profile-grh-1.0.0',
    profileSchemaVersion: 'grh-profile-v1',
    semanticSchemaVersion: 'grh-semantic-v2',
    processorBundleDigest: sha('e'),
    ...overrides,
  };
}

function lastKnownGood(overrides = {}) {
  return {
    target: 'LOCAL_STATE',
    referenceId: 'local-state-old',
    bundleDigest: sha('b'),
    sourceSha256: sha('c'),
    sourceManifestDigest: sha('0'),
    snapshotAsOf: '2026-08-05',
    extractorVersion: 'profile-grh-1.0.0',
    profileSchemaVersion: 'grh-profile-v1',
    semanticSchemaVersion: 'grh-semantic-v2',
    processorBundleDigest: sha('e'),
    idempotencyKey: sha('9'),
    receiptDigest: sha('d'),
    ...overrides,
  };
}

function lastKnownGoodForManifest(sourceManifest, overrides = {}) {
  return lastKnownGood({
    sourceSha256: sourceManifest.sourceSha256,
    sourceManifestDigest: sourceManifest.sourceManifestDigest,
    snapshotAsOf: sourceManifest.snapshotAsOf,
    extractorVersion: sourceManifest.extractorVersion,
    profileSchemaVersion: sourceManifest.profileSchemaVersion,
    semanticSchemaVersion: sourceManifest.semanticSchemaVersion,
    processorBundleDigest: sourceManifest.processorBundleDigest,
    idempotencyKey: derivePipelineIdempotencyKey(sourceManifest),
    ...overrides,
  });
}

function receipt(run, stage, outcome, inputDigest, outputDigest, overrides = {}) {
  return buildStageReceipt({
    runId: run.runId,
    manifestDigest: run.manifestDigest,
    idempotencyKey: run.idempotencyKey,
    stage,
    outcome,
    inputDigest,
    outputDigest,
    evidenceDigest: sha('e'),
    referenceId: null,
    reasonCode: null,
    ...overrides,
  });
}

function advance(run, event, stage = null, inputDigest = null, outputDigest = null, overrides = {}) {
  const stageReceipt = stage === null ? null : receipt(
    run,
    stage,
    RECEIPT_OUTCOMES.SUCCEEDED,
    inputDigest,
    outputDigest,
    overrides,
  );
  const result = decideGrhPipelineTransition({ run, event, receipt: stageReceipt });
  assert.equal(result.allowed, true, `${run.state}:${event}:${JSON.stringify(result)}`);
  return result.nextRun;
}

function reachableRuns() {
  const initial = planGrhPipelineRun({ manifest: manifest(), lastKnownGood: lastKnownGood() });
  assert.equal(initial.ok, true);
  const runs = [initial.run];
  let run = initial.run;
  run = advance(run, RUN_EVENTS.ACQUIRE_LOCK, STAGES.LOCK, run.idempotencyKey, sha('1'));
  runs.push(run);
  run = advance(run, RUN_EVENTS.START_EXTRACT);
  runs.push(run);
  run = advance(run, RUN_EVENTS.COMPLETE_EXTRACT, STAGES.EXTRACT, run.source.sourceSha256, sha('2'));
  runs.push(run);
  run = advance(run, RUN_EVENTS.START_PROFILE);
  runs.push(run);
  run = advance(run, RUN_EVENTS.COMPLETE_PROFILE, STAGES.PROFILE, run.extractDigest, sha('3'));
  runs.push(run);
  run = advance(run, RUN_EVENTS.START_VALIDATE);
  runs.push(run);
  run = advance(run, RUN_EVENTS.COMPLETE_VALIDATE, STAGES.VALIDATE, run.candidateBundleDigest, run.candidateBundleDigest);
  runs.push(run);
  run = advance(run, RUN_EVENTS.START_PUBLISH);
  runs.push(run);
  return runs;
}

test('manifest identity is strict, deterministic, and idempotent across run ids', () => {
  const first = manifest();
  const reordered = Object.fromEntries(Object.entries(first).reverse());
  assert.deepEqual(inspectPipelineManifest(first), { ok: true, errors: [] });
  assert.equal(digestPipelineManifest(first), digestPipelineManifest(reordered));

  const anotherRun = manifest({ runId: 'run-2026-08-09-002' });
  assert.notEqual(digestPipelineManifest(first), digestPipelineManifest(anotherRun));
  assert.equal(derivePipelineIdempotencyKey(first), derivePipelineIdempotencyKey(anotherRun));
  assert.notEqual(
    derivePipelineIdempotencyKey(first),
    derivePipelineIdempotencyKey(manifest({ semanticSchemaVersion: 'grh-semantic-v3' })),
  );
  assert.notEqual(
    derivePipelineIdempotencyKey(first),
    derivePipelineIdempotencyKey(manifest({ processorBundleDigest: sha('f') })),
  );
  assert.notEqual(
    derivePipelineIdempotencyKey(first),
    derivePipelineIdempotencyKey(manifest({ sourceManifestDigest: sha('f') })),
  );

  assert.equal(inspectPipelineManifest({ ...first, rawPayload: { dni: '123' } }).ok, false);
  assert.equal(inspectPipelineManifest(manifest({ sourceId: 'personas_junin' })).ok, false);
  assert.equal(inspectPipelineManifest(manifest({ snapshotAsOf: '2026-02-31' })).ok, false);
  assert.equal(planGrhPipelineRun({ manifest: manifest({ sourceSha256: sha('A') }) }).code,
    DECISION_CODES.MANIFEST_INVALID);
});

test('a planned run is immutable, pristine, and cannot claim operational success', () => {
  const result = planGrhPipelineRun({ manifest: manifest(), lastKnownGood: lastKnownGood() });
  assert.equal(result.code, DECISION_CODES.RUN_PLANNED);
  assert.equal(result.run.state, RUN_STATES.PLANNED);
  assert.equal(result.run.logicalLock, null);
  assert.equal(result.run.publishedBundleDigest, null);
  assert.ok(Object.values(result.run.receipts).every(value => value === null));
  assert.equal(Object.isFrozen(result.run), true);
  assert.equal(Object.isFrozen(result.run.receipts), true);
  assert.deepEqual(inspectPipelineRun(result.run), { ok: true, errors: [] });
});

test('execution scope is explicit and rollback or same-date source conflicts are blocked', () => {
  assert.equal(inspectPipelineManifest(manifest({ tenantId: 'tenant-invented' })).ok, false);
  assert.equal(inspectPipelineManifest(manifest({ publicationTarget: 'PRIVATE_DB' })).ok, false);
  assert.equal(inspectPipelineManifest(manifest({ runId: 'operator@example.com' })).ok, false);
  assert.equal(inspectPipelineManifest(manifest({ runId: '../private/dump' })).ok, false);

  const connected = manifest({
    executionScope: 'CONNECTED_TENANT',
    publicationTarget: 'PRIVATE_DB',
    tenantId: 'tenant-governed-id',
  });
  assert.equal(inspectPipelineManifest(connected).ok, true, 'the future connected shape can be modeled');
  assert.equal(planGrhPipelineRun({ manifest: connected }).code, DECISION_CODES.CONNECTED_SCOPE_NOT_ENABLED);
  const localRun = planGrhPipelineRun({ manifest: manifest() }).run;
  const forgedConnectedRun = {
    ...localRun,
    executionScope: connected.executionScope,
    publicationTarget: connected.publicationTarget,
    tenantId: connected.tenantId,
    manifestDigest: digestPipelineManifest(connected),
    idempotencyKey: derivePipelineIdempotencyKey(connected),
  };
  assert.equal(inspectPipelineRun(forgedConnectedRun).ok, false, 'connected manifest shape never becomes an O2A run');
  assert.equal(decideGrhPipelineTransition({
    run: forgedConnectedRun,
    event: RUN_EVENTS.ACQUIRE_LOCK,
  }).code, DECISION_CODES.CONNECTED_SCOPE_NOT_ENABLED);

  const lkg = lastKnownGood({ sourceSha256: sha('a'), snapshotAsOf: '2026-08-06' });
  assert.equal(planGrhPipelineRun({
    manifest: manifest({ snapshotAsOf: '2026-08-05' }), lastKnownGood: lkg,
  }).code, DECISION_CODES.SOURCE_ROLLBACK_BLOCKED);
  assert.equal(planGrhPipelineRun({
    manifest: manifest({ sourceSha256: sha('f') }), lastKnownGood: lkg,
  }).code, DECISION_CODES.SOURCE_CONFLICT_BLOCKED);

  const forgedRollback = {
    ...localRun,
    lastKnownGood: lastKnownGood({ snapshotAsOf: '2026-08-07' }),
  };
  assert.equal(inspectPipelineRun(forgedRollback).ok, false);
  assert.equal(decideGrhPipelineTransition({
    run: forgedRollback,
    event: RUN_EVENTS.ACQUIRE_LOCK,
  }).code, DECISION_CODES.RUN_INVALID);
  const forgedConflict = {
    ...localRun,
    lastKnownGood: lastKnownGood({ snapshotAsOf: '2026-08-06', sourceSha256: sha('f') }),
  };
  assert.equal(inspectPipelineRun(forgedConflict).ok, false);
  const forgedCrossTarget = {
    ...localRun,
    lastKnownGood: lastKnownGood({ target: 'PRIVATE_DB' }),
  };
  assert.equal(inspectPipelineRun(forgedCrossTarget).ok, false);
});

test('only the exact receipt-bound sequence reaches PUBLISHED and promotes LKG once', () => {
  const runs = reachableRuns();
  let run = runs.at(-1);
  const oldLkg = structuredClone(run.lastKnownGood);
  assert.equal(run.state, RUN_STATES.PUBLISHING);
  assert.deepEqual(run.lastKnownGood, oldLkg);
  assert.equal(run.publishedBundleDigest, null);

  const publishReceipt = receipt(
    run,
    STAGES.PUBLISH,
    RECEIPT_OUTCOMES.SUCCEEDED,
    run.candidateBundleDigest,
    run.candidateBundleDigest,
    { referenceId: 'publication-new' },
  );
  const result = decideGrhPipelineTransition({ run, event: RUN_EVENTS.COMPLETE_PUBLISH, receipt: publishReceipt });
  assert.equal(result.allowed, true);
  assert.equal(result.toState, RUN_STATES.PUBLISHED);
  assert.equal(result.nextRun.publishedBundleDigest, sha('3'));
  assert.deepEqual(result.nextRun.lastKnownGood, {
    target: 'LOCAL_STATE',
    referenceId: 'publication-new',
    bundleDigest: sha('3'),
    sourceSha256: sha('a'),
    sourceManifestDigest: sha('d'),
    snapshotAsOf: '2026-08-06',
    extractorVersion: 'profile-grh-1.0.0',
    profileSchemaVersion: 'grh-profile-v1',
    semanticSchemaVersion: 'grh-semantic-v2',
    processorBundleDigest: sha('e'),
    idempotencyKey: run.idempotencyKey,
    receiptDigest: digestStageReceipt(publishReceipt),
  });
  assert.deepEqual(run.lastKnownGood, oldLkg, 'pure decision must not mutate the input run');
  assert.deepEqual(inspectPipelineRun(result.nextRun), { ok: true, errors: [] });
  assert.equal(decideGrhPipelineTransition({
    run: result.nextRun,
    event: RUN_EVENTS.START_EXTRACT,
  }).code, DECISION_CODES.TRANSITION_NOT_ALLOWED);
});

test('unknown, out-of-order, missing, and mismatched receipts fail closed', () => {
  const planned = planGrhPipelineRun({ manifest: manifest() }).run;
  assert.equal(decideGrhPipelineTransition({ run: planned, event: 'SKIP_VALIDATION' }).code,
    DECISION_CODES.EVENT_UNKNOWN);
  assert.equal(decideGrhPipelineTransition({ run: planned, event: RUN_EVENTS.START_EXTRACT }).code,
    DECISION_CODES.TRANSITION_NOT_ALLOWED);
  assert.equal(decideGrhPipelineTransition({ run: planned, event: RUN_EVENTS.ACQUIRE_LOCK }).code,
    DECISION_CODES.RECEIPT_REQUIRED);

  const wrong = receipt(planned, STAGES.LOCK, RECEIPT_OUTCOMES.SUCCEEDED, sha('f'), sha('1'));
  const mismatch = decideGrhPipelineTransition({ run: planned, event: RUN_EVENTS.ACQUIRE_LOCK, receipt: wrong });
  assert.equal(mismatch.allowed, false);
  assert.equal(mismatch.code, DECISION_CODES.RECEIPT_MISMATCH);

  const withVolatileMetadata = { ...wrong, observedAt: '2026-08-09T12:00:00.000Z' };
  assert.equal(inspectStageReceipt(withVolatileMetadata).ok, false);
  assert.throws(() => buildStageReceipt({
    ...Object.fromEntries(Object.entries(wrong).filter(([key]) => key !== 'schemaVersion')),
    rawPayload: { password: 'never' },
  }), error => error?.code === DECISION_CODES.RECEIPT_INVALID);
});

test('receipt stage, idempotency, and validated output identities cannot be substituted', () => {
  const planned = planGrhPipelineRun({ manifest: manifest() }).run;
  const wrongIdempotency = receipt(
    planned,
    STAGES.LOCK,
    RECEIPT_OUTCOMES.SUCCEEDED,
    planned.idempotencyKey,
    sha('1'),
    { idempotencyKey: sha('f') },
  );
  assert.equal(decideGrhPipelineTransition({
    run: planned,
    event: RUN_EVENTS.ACQUIRE_LOCK,
    receipt: wrongIdempotency,
  }).code, DECISION_CODES.RECEIPT_MISMATCH);

  const validating = reachableRuns().find(run => run.state === RUN_STATES.VALIDATING);
  const wrongStage = receipt(
    validating,
    STAGES.PROFILE,
    RECEIPT_OUTCOMES.SUCCEEDED,
    validating.candidateBundleDigest,
    validating.candidateBundleDigest,
  );
  assert.equal(decideGrhPipelineTransition({
    run: validating,
    event: RUN_EVENTS.COMPLETE_VALIDATE,
    receipt: wrongStage,
  }).code, DECISION_CODES.RECEIPT_MISMATCH);

  const wrongOutput = receipt(
    validating,
    STAGES.VALIDATE,
    RECEIPT_OUTCOMES.SUCCEEDED,
    validating.candidateBundleDigest,
    sha('f'),
  );
  assert.equal(decideGrhPipelineTransition({
    run: validating,
    event: RUN_EVENTS.COMPLETE_VALIDATE,
    receipt: wrongOutput,
  }).code, DECISION_CODES.RECEIPT_MISMATCH);
});

test('volatile timing observations are separate from stable receipts', () => {
  const planned = planGrhPipelineRun({ manifest: manifest() }).run;
  const lockReceipt = receipt(planned, STAGES.LOCK, RECEIPT_OUTCOMES.SUCCEEDED, planned.idempotencyKey, sha('1'));
  const before = digestStageReceipt(lockReceipt);
  const first = {
    schemaVersion: 'grh-pipeline-observation-v1',
    runId: planned.runId,
    stage: STAGES.LOCK,
    startedAt: '2026-08-09T12:00:00.000Z',
    completedAt: '2026-08-09T12:00:01.000Z',
    observedAt: '2026-08-09T12:00:02.000Z',
  };
  const later = { ...first, observedAt: '2026-08-09T12:00:03.000Z' };
  assert.equal(inspectPipelineObservation(first).ok, true);
  assert.equal(inspectPipelineObservation(later).ok, true);
  assert.equal(digestStageReceipt(lockReceipt), before);
  assert.equal(inspectPipelineObservation({ ...first, completedAt: '2026-08-09T11:59:59.000Z' }).ok, false);
});

test('duplicate detection is terminal, requires existing publication evidence, and never promotes', () => {
  const duplicateManifest = manifest();
  const initialLkg = lastKnownGood({
    referenceId: 'publication-existing',
    bundleDigest: sha('9'),
    sourceSha256: sha('a'),
    sourceManifestDigest: sha('d'),
    snapshotAsOf: '2026-08-06',
    receiptDigest: sha('8'),
    idempotencyKey: derivePipelineIdempotencyKey(duplicateManifest),
  });
  let run = planGrhPipelineRun({ manifest: duplicateManifest, lastKnownGood: initialLkg }).run;
  run = advance(run, RUN_EVENTS.ACQUIRE_LOCK, STAGES.LOCK, run.idempotencyKey, sha('1'));
  const existing = Object.fromEntries(Object.entries(initialLkg).reverse());
  const duplicateReceipt = receipt(
    run,
    STAGES.DUPLICATE,
    RECEIPT_OUTCOMES.DUPLICATE,
    run.idempotencyKey,
    existing.bundleDigest,
    { referenceId: existing.referenceId, evidenceDigest: existing.receiptDigest },
  );
  assert.equal(decideGrhPipelineTransition({
    run,
    event: RUN_EVENTS.MARK_DUPLICATE,
    receipt: duplicateReceipt,
  }).code, DECISION_CODES.PUBLICATION_EVIDENCE_REQUIRED);

  const unboundReceipt = receipt(
    run,
    STAGES.DUPLICATE,
    RECEIPT_OUTCOMES.DUPLICATE,
    run.idempotencyKey,
    existing.bundleDigest,
    { referenceId: existing.referenceId, evidenceDigest: sha('7') },
  );
  assert.equal(decideGrhPipelineTransition({
    run,
    event: RUN_EVENTS.MARK_DUPLICATE,
    receipt: unboundReceipt,
    existingPublication: existing,
  }).code, DECISION_CODES.PUBLICATION_EVIDENCE_REQUIRED);

  const result = decideGrhPipelineTransition({
    run,
    event: RUN_EVENTS.MARK_DUPLICATE,
    receipt: duplicateReceipt,
    existingPublication: existing,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.nextRun.state, RUN_STATES.DUPLICATE);
  assert.equal(result.nextRun.publishedBundleDigest, null);
  assert.deepEqual(result.nextRun.lastKnownGood, initialLkg);
  assert.equal(decideGrhPipelineTransition({
    run: result.nextRun,
    event: RUN_EVENTS.START_EXTRACT,
  }).allowed, false);
});

test('duplicate cannot reuse LKG after any isolated processing or approval identity drift', () => {
  const baselineManifest = manifest({ runId: 'run-identity-baseline' });
  const baselineLkg = lastKnownGoodForManifest(baselineManifest, {
    referenceId: 'local-state-baseline',
    bundleDigest: sha('6'),
    receiptDigest: sha('7'),
  });
  const drifts = [
    ['extractorVersion', 'profile-grh-1.0.1'],
    ['profileSchemaVersion', 'grh-profile-v2'],
    ['semanticSchemaVersion', 'grh-semantic-v3'],
    ['processorBundleDigest', sha('f')],
    ['sourceManifestDigest', sha('1')],
  ];

  for (const [field, value] of drifts) {
    const driftedManifest = manifest({ runId: `run-drift-${field}`, [field]: value });
    const planned = planGrhPipelineRun({ manifest: driftedManifest, lastKnownGood: baselineLkg });
    assert.equal(planned.ok, true, field);
    let run = planned.run;
    run = advance(run, RUN_EVENTS.ACQUIRE_LOCK, STAGES.LOCK, run.idempotencyKey, sha('1'));
    const duplicateReceipt = receipt(
      run,
      STAGES.DUPLICATE,
      RECEIPT_OUTCOMES.DUPLICATE,
      run.idempotencyKey,
      baselineLkg.bundleDigest,
      { referenceId: baselineLkg.referenceId, evidenceDigest: baselineLkg.receiptDigest },
    );
    const result = decideGrhPipelineTransition({
      run,
      event: RUN_EVENTS.MARK_DUPLICATE,
      receipt: duplicateReceipt,
      existingPublication: baselineLkg,
    });
    assert.equal(result.allowed, false, field);
    assert.equal(result.code, DECISION_CODES.PUBLICATION_EVIDENCE_REQUIRED, field);
    assert.equal(run.publishedBundleDigest, null, field);
  }
});

test('an injected failure at every active state preserves LKG and never promotes a candidate', () => {
  const activeRuns = reachableRuns();
  const stageFor = new Map([
    [RUN_STATES.PLANNED, STAGES.LOCK],
    [RUN_STATES.LOCKED, STAGES.EXTRACT],
    [RUN_STATES.EXTRACTING, STAGES.EXTRACT],
    [RUN_STATES.EXTRACTED, STAGES.PROFILE],
    [RUN_STATES.PROFILING, STAGES.PROFILE],
    [RUN_STATES.PROFILED, STAGES.VALIDATE],
    [RUN_STATES.VALIDATING, STAGES.VALIDATE],
    [RUN_STATES.VALIDATED, STAGES.PUBLISH],
    [RUN_STATES.PUBLISHING, STAGES.PUBLISH],
  ]);
  for (const run of activeRuns) {
    const stage = stageFor.get(run.state);
    const input = stage === STAGES.LOCK ? run.idempotencyKey
      : stage === STAGES.EXTRACT ? run.source.sourceSha256
        : stage === STAGES.PROFILE ? run.extractDigest : run.candidateBundleDigest;
    const failureReceipt = receipt(
      run,
      stage,
      RECEIPT_OUTCOMES.FAILED,
      input,
      null,
      { reasonCode: 'INJECTED_FAILURE' },
    );
    const result = decideGrhPipelineTransition({ run, event: RUN_EVENTS.FAIL, receipt: failureReceipt });
    assert.equal(result.allowed, true, run.state);
    assert.equal(result.nextRun.state, RUN_STATES.FAILED, run.state);
    assert.equal(result.nextRun.failure.outcome, RECEIPT_OUTCOMES.FAILED, run.state);
    assert.equal(result.nextRun.publishedBundleDigest, null, run.state);
    assert.deepEqual(result.nextRun.lastKnownGood, lastKnownGood(), run.state);
    assert.equal(run.failure, null, 'input stays untouched');
    assert.equal(inspectPipelineRun({ ...result.nextRun, state: RUN_STATES.BLOCKED }).ok, false, run.state);
  }
});

test('BLOCKED and FAILED terminal evidence cannot be relabeled across outcomes', () => {
  const planned = planGrhPipelineRun({ manifest: manifest() }).run;
  const blockedReceipt = receipt(
    planned,
    STAGES.LOCK,
    RECEIPT_OUTCOMES.BLOCKED,
    planned.idempotencyKey,
    null,
    { reasonCode: 'GOVERNANCE_BLOCK' },
  );
  const result = decideGrhPipelineTransition({
    run: planned,
    event: RUN_EVENTS.BLOCK,
    receipt: blockedReceipt,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.nextRun.state, RUN_STATES.BLOCKED);
  assert.equal(result.nextRun.failure.outcome, RECEIPT_OUTCOMES.BLOCKED);
  assert.equal(inspectPipelineRun({ ...result.nextRun, state: RUN_STATES.FAILED }).ok, false);
});

test('restore evidence yields measurements only when every independent check passes', () => {
  const evidence = {
    schemaVersion: 'grh-restore-evidence-v1',
    tenantId: 'tenant-junin',
    sourceId: 'grh-junin',
    backupManifestDigest: sha('1'),
    backupObjectDigest: sha('2'),
    restoreReceiptDigest: sha('3'),
    isolatedTargetId: 'restore-sandbox-001',
    backupSnapshotAt: '2026-08-08T00:00:00.000Z',
    referenceAt: '2026-08-09T00:00:00.000Z',
    restoreStartedAt: '2026-08-09T01:00:00.000Z',
    restoreCompletedAt: '2026-08-09T02:30:00.000Z',
    checks: {
      rowCountsDigest: sha('4'),
      constraintsDigest: sha('5'),
      semanticBundleDigest: sha('6'),
      provenanceDigest: sha('7'),
    },
    outcomes: {
      objectIntegrity: 'PASSED',
      restoreCompleted: 'PASSED',
      rowCountsReconciled: 'PASSED',
      constraintsReconciled: 'PASSED',
      semanticValidated: 'PASSED',
      provenanceValidated: 'PASSED',
    },
  };
  const result = evaluateRestoreEvidence(evidence);
  assert.equal(result.code, DECISION_CODES.RESTORE_EVIDENCE_STRUCTURALLY_VALID);
  assert.equal(result.externallyVerified, false);
  assert.deepEqual(result.measurements, {
    snapshotLagAtReferenceMs: 86_400_000,
    restoreExecutionMs: 5_400_000,
  });
  assert.doesNotMatch(JSON.stringify(result), /\brpo\b|\brto\b/i);
  assert.equal(evaluateRestoreEvidence({
    ...evidence,
    outcomes: { ...evidence.outcomes, semanticValidated: 'FAILED' },
  }).ok, false);
  assert.equal(evaluateRestoreEvidence({
    ...evidence,
    isolatedTargetId: evidence.tenantId,
  }).ok, false);
  assert.equal(evaluateRestoreEvidence({
    ...evidence,
    restoreStartedAt: '2026-08-07T23:59:59.000Z',
  }).ok, false);
});

test('freshness remains ungoverned without approved policy and never invents an SLA', () => {
  const evidence = buildFreshnessEvidence({
    sourceId: 'grh-junin',
    snapshotCompletedAt: '2026-08-09T10:00:00.000Z',
    publicationCompletedAt: '2026-08-09T10:05:00.000Z',
  });
  const draft = {
    schemaVersion: 'grh-freshness-policy-v1',
    policyId: 'daily-freshness-proposal',
    status: 'DRAFT',
    maximumAgeMs: 7_200_000,
    approvalEvidenceDigest: null,
  };
  const ungoverned = evaluateFreshness({ evidence, policy: draft, now: '2026-08-09T11:00:00.000Z' });
  assert.equal(ungoverned.ok, false);
  assert.equal(ungoverned.state, 'UNGOVERNED');

  const approved = { ...draft, status: 'APPROVED', approvalEvidenceDigest: sha('b') };
  assert.equal(evaluateFreshness({
    evidence, policy: approved, trustedPolicyDigest: digestFreshnessPolicy(approved), now: '2026-08-09T11:00:00.000Z',
  }).state, 'CURRENT');
  assert.equal(evaluateFreshness({
    evidence, policy: approved, trustedPolicyDigest: digestFreshnessPolicy(approved), now: '2026-08-09T13:00:00.000Z',
  }).state, 'STALE');
  assert.equal(evaluateFreshness({
    evidence, policy: { ...approved, approvalEvidenceDigest: null }, now: '2026-08-09T11:00:00.000Z',
  }).state, 'UNKNOWN');
});
