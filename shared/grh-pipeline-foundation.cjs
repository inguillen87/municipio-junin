'use strict';

// Pure GRH pipeline decisions. This module performs no I/O, scheduling,
// locking, persistence, publication, secret lookup, or remote operation.
const crypto = require('node:crypto');

const PIPELINE_RUN_SCHEMA_VERSION = 'grh-pipeline-run-v1';
const PIPELINE_MANIFEST_SCHEMA_VERSION = 'grh-pipeline-manifest-v1';
const STAGE_RECEIPT_SCHEMA_VERSION = 'grh-pipeline-stage-receipt-v1';
const OBSERVATION_SCHEMA_VERSION = 'grh-pipeline-observation-v1';
const RESTORE_EVIDENCE_SCHEMA_VERSION = 'grh-restore-evidence-v1';
const FRESHNESS_EVIDENCE_SCHEMA_VERSION = 'grh-freshness-evidence-v1';
const FRESHNESS_POLICY_SCHEMA_VERSION = 'grh-freshness-policy-v1';

const EXECUTION_SCOPES = Object.freeze({
  LOCAL_REPLAY: 'LOCAL_REPLAY',
  CONNECTED_TENANT: 'CONNECTED_TENANT',
});
const PUBLICATION_TARGETS = Object.freeze({
  LOCAL_STATE: 'LOCAL_STATE',
  PRIVATE_DB: 'PRIVATE_DB',
});

const RUN_STATES = Object.freeze({
  PLANNED: 'PLANNED',
  LOCKED: 'LOCKED',
  EXTRACTING: 'EXTRACTING',
  EXTRACTED: 'EXTRACTED',
  PROFILING: 'PROFILING',
  PROFILED: 'PROFILED',
  VALIDATING: 'VALIDATING',
  VALIDATED: 'VALIDATED',
  PUBLISHING: 'PUBLISHING',
  PUBLISHED: 'PUBLISHED',
  DUPLICATE: 'DUPLICATE',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
});

const RUN_EVENTS = Object.freeze({
  ACQUIRE_LOCK: 'ACQUIRE_LOCK',
  START_EXTRACT: 'START_EXTRACT',
  COMPLETE_EXTRACT: 'COMPLETE_EXTRACT',
  START_PROFILE: 'START_PROFILE',
  COMPLETE_PROFILE: 'COMPLETE_PROFILE',
  START_VALIDATE: 'START_VALIDATE',
  COMPLETE_VALIDATE: 'COMPLETE_VALIDATE',
  START_PUBLISH: 'START_PUBLISH',
  COMPLETE_PUBLISH: 'COMPLETE_PUBLISH',
  MARK_DUPLICATE: 'MARK_DUPLICATE',
  FAIL: 'FAIL',
  BLOCK: 'BLOCK',
});

const STAGES = Object.freeze({
  LOCK: 'LOCK',
  EXTRACT: 'EXTRACT',
  PROFILE: 'PROFILE',
  VALIDATE: 'VALIDATE',
  PUBLISH: 'PUBLISH',
  DUPLICATE: 'DUPLICATE',
});

const RECEIPT_OUTCOMES = Object.freeze({
  SUCCEEDED: 'SUCCEEDED',
  DUPLICATE: 'DUPLICATE',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
});

const DECISION_CODES = Object.freeze({
  RUN_PLANNED: 'RUN_PLANNED',
  RUN_INVALID: 'RUN_INVALID',
  MANIFEST_INVALID: 'MANIFEST_INVALID',
  CONNECTED_SCOPE_NOT_ENABLED: 'CONNECTED_SCOPE_NOT_ENABLED',
  SOURCE_ROLLBACK_BLOCKED: 'SOURCE_ROLLBACK_BLOCKED',
  SOURCE_CONFLICT_BLOCKED: 'SOURCE_CONFLICT_BLOCKED',
  EVENT_UNKNOWN: 'EVENT_UNKNOWN',
  TRANSITION_NOT_ALLOWED: 'TRANSITION_NOT_ALLOWED',
  RECEIPT_REQUIRED: 'RECEIPT_REQUIRED',
  RECEIPT_NOT_ALLOWED: 'RECEIPT_NOT_ALLOWED',
  RECEIPT_INVALID: 'RECEIPT_INVALID',
  RECEIPT_MISMATCH: 'RECEIPT_MISMATCH',
  PUBLICATION_EVIDENCE_REQUIRED: 'PUBLICATION_EVIDENCE_REQUIRED',
  TRANSITION_ALLOWED: 'TRANSITION_ALLOWED',
  RESTORE_EVIDENCE_INVALID: 'RESTORE_EVIDENCE_INVALID',
  RESTORE_EVIDENCE_STRUCTURALLY_VALID: 'RESTORE_EVIDENCE_STRUCTURALLY_VALID',
  FRESHNESS_EVIDENCE_INVALID: 'FRESHNESS_EVIDENCE_INVALID',
  FRESHNESS_POLICY_UNGOVERNED: 'FRESHNESS_POLICY_UNGOVERNED',
  FRESHNESS_CURRENT: 'FRESHNESS_CURRENT',
  FRESHNESS_STALE: 'FRESHNESS_STALE',
});

const MANIFEST_KEYS = Object.freeze([
  'schemaVersion', 'runId', 'executionScope', 'publicationTarget', 'tenantId', 'sourceId', 'sourceSystem',
  'snapshotAsOf', 'sourceSha256', 'sourceManifestDigest', 'sourceSizeBytes', 'extractorVersion',
  'profileSchemaVersion', 'semanticSchemaVersion', 'processorBundleDigest',
]);
const RECEIPT_KEYS = Object.freeze([
  'schemaVersion', 'runId', 'manifestDigest', 'idempotencyKey', 'stage', 'outcome',
  'inputDigest', 'outputDigest', 'evidenceDigest', 'referenceId', 'reasonCode',
]);
const SOURCE_KEYS = Object.freeze([
  'sourceId', 'sourceSystem', 'snapshotAsOf', 'sourceSha256', 'sourceManifestDigest', 'sourceSizeBytes',
  'extractorVersion', 'profileSchemaVersion', 'semanticSchemaVersion', 'processorBundleDigest',
]);
const RUN_KEYS = Object.freeze([
  'schemaVersion', 'runId', 'executionScope', 'publicationTarget', 'tenantId', 'source', 'manifestDigest',
  'idempotencyKey', 'state', 'logicalLock', 'receipts', 'extractDigest',
  'candidateBundleDigest', 'publishedBundleDigest', 'lastKnownGood', 'failure',
]);
const RECEIPT_SLOTS = Object.freeze([
  'lock', 'extract', 'profile', 'validate', 'publish', 'duplicate', 'failure',
]);
const LKG_KEYS = Object.freeze([
  'target', 'referenceId', 'bundleDigest', 'sourceSha256', 'sourceManifestDigest', 'snapshotAsOf',
  'extractorVersion', 'profileSchemaVersion', 'semanticSchemaVersion', 'processorBundleDigest',
  'idempotencyKey', 'receiptDigest',
]);
const LOCK_KEYS = Object.freeze(['key', 'claimDigest', 'receiptDigest']);
const FAILURE_KEYS = Object.freeze(['stage', 'outcome', 'reasonCode', 'receiptDigest']);

const SHA256 = /^[a-f0-9]{64}$/;
const CANONICAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const VERSION = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const REASON_CODE = /^[A-Z][A-Z0-9_]{2,127}$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TERMINAL_STATES = new Set([
  RUN_STATES.PUBLISHED, RUN_STATES.DUPLICATE, RUN_STATES.FAILED, RUN_STATES.BLOCKED,
]);
const KNOWN_STATES = new Set(Object.values(RUN_STATES));
const KNOWN_EVENTS = new Set(Object.values(RUN_EVENTS));
const KNOWN_STAGES = new Set(Object.values(STAGES));
const KNOWN_OUTCOMES = new Set(Object.values(RECEIPT_OUTCOMES));
const FORBIDDEN_KEY_PARTS = [
  'password', 'secret', 'credential', 'accesstoken', 'refreshtoken', 'rawpayload',
  'rawrecord', 'rawrow', 'dni', 'cuil', 'domicilio', 'address', 'email', 'telefono',
];

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return isRecord(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function validId(value) {
  return typeof value === 'string' && value.trim() === value && CANONICAL_ID.test(value);
}

function validDigest(value) {
  return typeof value === 'string' && SHA256.test(value);
}

function validVersion(value) {
  return typeof value === 'string' && VERSION.test(value);
}

function parseTimestamp(value) {
  if (typeof value !== 'string' || !UTC_TIMESTAMP.test(value)) return Number.NaN;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  const canonical = value.includes('.') ? value : value.replace('Z', '.000Z');
  return new Date(parsed).toISOString() === canonical ? parsed : Number.NaN;
}

function validDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function containsForbiddenMaterial(value, visited = new WeakSet()) {
  if (typeof value === 'string') {
    const lowered = value.toLowerCase();
    return lowered.includes('personas_junin') ||
      lowered.includes('-----begin private key-----') ||
      /\b(?:postgres(?:ql)?|mysql):\/\/[^\s/@]+:[^\s/@]+@/i.test(value) ||
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(value);
  }
  if (!value || typeof value !== 'object') return false;
  if (visited.has(value)) return false;
  visited.add(value);
  return Object.entries(value).some(([key, child]) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (FORBIDDEN_KEY_PARTS.some(part => normalized.includes(part))) return true;
    return containsForbiddenMaterial(child, visited);
  });
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function stableSerialize(value) {
  return JSON.stringify(stableValue(value));
}

function digestValue(value) {
  return crypto.createHash('sha256').update(stableSerialize(value), 'utf8').digest('hex');
}

function inspection(errors) {
  return deepFreeze({ ok: errors.length === 0, errors: [...new Set(errors)] });
}

function inspectPipelineManifest(manifest) {
  const errors = [];
  if (!exactKeys(manifest, MANIFEST_KEYS)) errors.push('manifest.structure');
  if (manifest?.schemaVersion !== PIPELINE_MANIFEST_SCHEMA_VERSION) errors.push('manifest.version');
  if (!validId(manifest?.runId)) errors.push('manifest.run_id');
  if (!Object.values(EXECUTION_SCOPES).includes(manifest?.executionScope)) errors.push('manifest.execution_scope');
  if (!Object.values(PUBLICATION_TARGETS).includes(manifest?.publicationTarget)) errors.push('manifest.publication_target');
  if (manifest?.executionScope === EXECUTION_SCOPES.LOCAL_REPLAY &&
      (manifest?.tenantId !== null || manifest?.publicationTarget !== PUBLICATION_TARGETS.LOCAL_STATE)) {
    errors.push('manifest.local_scope');
  }
  if (manifest?.executionScope === EXECUTION_SCOPES.CONNECTED_TENANT &&
      (!validId(manifest?.tenantId) || manifest?.publicationTarget !== PUBLICATION_TARGETS.PRIVATE_DB)) {
    errors.push('manifest.connected_scope');
  }
  if (manifest?.sourceId !== 'grh-junin') errors.push('manifest.source_id');
  if (manifest?.sourceSystem !== 'GRH') errors.push('manifest.source_system');
  if (!validDate(manifest?.snapshotAsOf)) errors.push('manifest.snapshot');
  if (!validDigest(manifest?.sourceSha256)) errors.push('manifest.source_sha256');
  if (!validDigest(manifest?.sourceManifestDigest)) errors.push('manifest.source_manifest_digest');
  if (!Number.isSafeInteger(manifest?.sourceSizeBytes) || manifest.sourceSizeBytes <= 0) errors.push('manifest.source_size');
  if (!validVersion(manifest?.extractorVersion)) errors.push('manifest.extractor_version');
  if (!/^grh-profile-v\d+$/.test(manifest?.profileSchemaVersion || '')) errors.push('manifest.profile_version');
  if (!/^grh-semantic-v\d+$/.test(manifest?.semanticSchemaVersion || '')) errors.push('manifest.semantic_version');
  if (!validDigest(manifest?.processorBundleDigest)) errors.push('manifest.processor_bundle_digest');
  if (containsForbiddenMaterial(manifest)) errors.push('manifest.forbidden_material');
  return inspection(errors);
}

function requireValidManifest(manifest) {
  const result = inspectPipelineManifest(manifest);
  if (!result.ok) {
    const error = new TypeError(`Invalid GRH pipeline manifest: ${result.errors.join(', ')}`);
    error.code = DECISION_CODES.MANIFEST_INVALID;
    throw error;
  }
}

function digestPipelineManifest(manifest) {
  requireValidManifest(manifest);
  return digestValue(manifest);
}

function derivePipelineIdempotencyKey(manifest) {
  requireValidManifest(manifest);
  return digestValue({
    schemaVersion: PIPELINE_RUN_SCHEMA_VERSION,
    executionScope: manifest.executionScope,
    publicationTarget: manifest.publicationTarget,
    tenantId: manifest.tenantId,
    sourceId: manifest.sourceId,
    snapshotAsOf: manifest.snapshotAsOf,
    sourceSha256: manifest.sourceSha256,
    sourceManifestDigest: manifest.sourceManifestDigest,
    extractorVersion: manifest.extractorVersion,
    profileSchemaVersion: manifest.profileSchemaVersion,
    semanticSchemaVersion: manifest.semanticSchemaVersion,
    processorBundleDigest: manifest.processorBundleDigest,
  });
}

function inspectLastKnownGood(value) {
  if (value === null) return true;
  return exactKeys(value, LKG_KEYS) && Object.values(PUBLICATION_TARGETS).includes(value.target) &&
    validId(value.referenceId) &&
    validDigest(value.bundleDigest) && validDigest(value.sourceSha256) && validDigest(value.sourceManifestDigest) &&
    validDate(value.snapshotAsOf) && validVersion(value.extractorVersion) &&
    /^grh-profile-v\d+$/.test(value.profileSchemaVersion || '') &&
    /^grh-semantic-v\d+$/.test(value.semanticSchemaVersion || '') &&
    validDigest(value.processorBundleDigest) && validDigest(value.idempotencyKey) &&
    validDigest(value.receiptDigest) &&
    !containsForbiddenMaterial(value);
}

function sourceFromManifest(manifest) {
  return {
    sourceId: manifest.sourceId,
    sourceSystem: manifest.sourceSystem,
    snapshotAsOf: manifest.snapshotAsOf,
    sourceSha256: manifest.sourceSha256,
    sourceManifestDigest: manifest.sourceManifestDigest,
    sourceSizeBytes: manifest.sourceSizeBytes,
    extractorVersion: manifest.extractorVersion,
    profileSchemaVersion: manifest.profileSchemaVersion,
    semanticSchemaVersion: manifest.semanticSchemaVersion,
    processorBundleDigest: manifest.processorBundleDigest,
  };
}

function manifestFromRun(run) {
  return {
    schemaVersion: PIPELINE_MANIFEST_SCHEMA_VERSION,
    runId: run.runId,
    executionScope: run.executionScope,
    publicationTarget: run.publicationTarget,
    tenantId: run.tenantId,
    ...run.source,
  };
}

function planGrhPipelineRun({ manifest, lastKnownGood = null } = {}) {
  const manifestInspection = inspectPipelineManifest(manifest);
  if (!manifestInspection.ok) {
    return deepFreeze({ ok: false, code: DECISION_CODES.MANIFEST_INVALID, errors: manifestInspection.errors });
  }
  if (!inspectLastKnownGood(lastKnownGood)) {
    return deepFreeze({ ok: false, code: DECISION_CODES.RUN_INVALID, errors: ['run.last_known_good'] });
  }
  if (manifest.executionScope === EXECUTION_SCOPES.CONNECTED_TENANT) {
    return deepFreeze({ ok: false, code: DECISION_CODES.CONNECTED_SCOPE_NOT_ENABLED, errors: ['run.connected_scope_not_enabled'] });
  }
  if (lastKnownGood && lastKnownGood.target !== manifest.publicationTarget) {
    return deepFreeze({ ok: false, code: DECISION_CODES.RUN_INVALID, errors: ['run.last_known_good_target'] });
  }
  if (lastKnownGood && manifest.snapshotAsOf < lastKnownGood.snapshotAsOf) {
    return deepFreeze({ ok: false, code: DECISION_CODES.SOURCE_ROLLBACK_BLOCKED, errors: ['run.snapshot_rollback'] });
  }
  if (lastKnownGood && manifest.snapshotAsOf === lastKnownGood.snapshotAsOf &&
      manifest.sourceSha256 !== lastKnownGood.sourceSha256) {
    return deepFreeze({ ok: false, code: DECISION_CODES.SOURCE_CONFLICT_BLOCKED, errors: ['run.same_snapshot_source_conflict'] });
  }
  const run = {
    schemaVersion: PIPELINE_RUN_SCHEMA_VERSION,
    runId: manifest.runId,
    executionScope: manifest.executionScope,
    publicationTarget: manifest.publicationTarget,
    tenantId: manifest.tenantId,
    source: sourceFromManifest(manifest),
    manifestDigest: digestPipelineManifest(manifest),
    idempotencyKey: derivePipelineIdempotencyKey(manifest),
    state: RUN_STATES.PLANNED,
    logicalLock: null,
    receipts: Object.fromEntries(RECEIPT_SLOTS.map(slot => [slot, null])),
    extractDigest: null,
    candidateBundleDigest: null,
    publishedBundleDigest: null,
    lastKnownGood: lastKnownGood ? structuredClone(lastKnownGood) : null,
    failure: null,
  };
  return deepFreeze({ ok: true, code: DECISION_CODES.RUN_PLANNED, run });
}

function inspectPipelineRun(run) {
  const errors = [];
  if (!exactKeys(run, RUN_KEYS)) errors.push('run.structure');
  if (run?.schemaVersion !== PIPELINE_RUN_SCHEMA_VERSION) errors.push('run.version');
  if (!validId(run?.runId)) errors.push('run.run_id');
  if (!Object.values(EXECUTION_SCOPES).includes(run?.executionScope)) errors.push('run.execution_scope');
  if (!Object.values(PUBLICATION_TARGETS).includes(run?.publicationTarget)) errors.push('run.publication_target');
  if (run?.executionScope === EXECUTION_SCOPES.LOCAL_REPLAY &&
      (run?.tenantId !== null || run?.publicationTarget !== PUBLICATION_TARGETS.LOCAL_STATE)) errors.push('run.local_scope');
  if (run?.executionScope === EXECUTION_SCOPES.CONNECTED_TENANT &&
      (!validId(run?.tenantId) || run?.publicationTarget !== PUBLICATION_TARGETS.PRIVATE_DB)) errors.push('run.connected_scope');
  if (run?.executionScope !== EXECUTION_SCOPES.LOCAL_REPLAY ||
      run?.publicationTarget !== PUBLICATION_TARGETS.LOCAL_STATE || run?.tenantId !== null) {
    errors.push('run.connected_scope_not_enabled');
  }
  if (!exactKeys(run?.source, SOURCE_KEYS)) errors.push('run.source_structure');
  if (!KNOWN_STATES.has(run?.state)) errors.push('run.state');
  if (!validDigest(run?.manifestDigest)) errors.push('run.manifest_digest');
  if (!validDigest(run?.idempotencyKey)) errors.push('run.idempotency_key');
  if (!exactKeys(run?.receipts, RECEIPT_SLOTS)) errors.push('run.receipts_structure');
  if (isRecord(run?.receipts)) {
    for (const slot of RECEIPT_SLOTS) {
      if (run.receipts[slot] !== null && !validDigest(run.receipts[slot])) errors.push(`run.receipt_${slot}`);
    }
  }
  for (const key of ['extractDigest', 'candidateBundleDigest', 'publishedBundleDigest']) {
    if (run?.[key] !== null && !validDigest(run[key])) errors.push(`run.${key}`);
  }
  if (run?.logicalLock !== null && (!exactKeys(run.logicalLock, LOCK_KEYS) ||
      run.logicalLock.key !== run.idempotencyKey || !validDigest(run.logicalLock.claimDigest) ||
      !validDigest(run.logicalLock.receiptDigest))) errors.push('run.logical_lock');
  if (!inspectLastKnownGood(run?.lastKnownGood)) errors.push('run.last_known_good');
  if (run?.lastKnownGood && run.lastKnownGood.target !== run?.publicationTarget) {
    errors.push('run.last_known_good_target');
  }
  if (run?.lastKnownGood && run?.source?.snapshotAsOf < run.lastKnownGood.snapshotAsOf) {
    errors.push('run.snapshot_rollback');
  }
  if (run?.lastKnownGood && run?.source?.snapshotAsOf === run.lastKnownGood.snapshotAsOf &&
      run?.source?.sourceSha256 !== run.lastKnownGood.sourceSha256) {
    errors.push('run.same_snapshot_source_conflict');
  }
  if (run?.failure !== null && (!exactKeys(run.failure, FAILURE_KEYS) ||
      !KNOWN_STAGES.has(run.failure.stage) ||
      ![RECEIPT_OUTCOMES.FAILED, RECEIPT_OUTCOMES.BLOCKED].includes(run.failure.outcome) ||
      !REASON_CODE.test(run.failure.reasonCode || '') ||
      !validDigest(run.failure.receiptDigest))) errors.push('run.failure');
  if (containsForbiddenMaterial(run)) errors.push('run.forbidden_material');
  if (errors.length === 0) {
    const manifest = manifestFromRun(run);
    const manifestCheck = inspectPipelineManifest(manifest);
    if (!manifestCheck.ok) errors.push(...manifestCheck.errors.map(error => `run.${error}`));
    else {
      if (digestPipelineManifest(manifest) !== run.manifestDigest) errors.push('run.manifest_identity');
      if (derivePipelineIdempotencyKey(manifest) !== run.idempotencyKey) errors.push('run.idempotency_identity');
    }
  }
  const receiptSetIs = (...present) => RECEIPT_SLOTS.every(slot =>
    present.includes(slot) ? validDigest(run?.receipts?.[slot]) : run?.receipts?.[slot] === null);
  const baseProgress = (present, { lock, extract, candidate, published = false, failure = false }) => {
    if (!receiptSetIs(...present)) return false;
    if (lock ? run.logicalLock === null : run.logicalLock !== null) return false;
    if (extract ? !validDigest(run.extractDigest) : run.extractDigest !== null) return false;
    if (candidate ? !validDigest(run.candidateBundleDigest) : run.candidateBundleDigest !== null) return false;
    if (published ? !validDigest(run.publishedBundleDigest) : run.publishedBundleDigest !== null) return false;
    return failure ? run.failure !== null : run.failure === null;
  };
  const progressionOk = (() => {
    if (run?.state === RUN_STATES.PLANNED) return baseProgress([], { lock: false, extract: false, candidate: false });
    if ([RUN_STATES.LOCKED, RUN_STATES.EXTRACTING].includes(run?.state)) {
      return baseProgress(['lock'], { lock: true, extract: false, candidate: false });
    }
    if ([RUN_STATES.EXTRACTED, RUN_STATES.PROFILING].includes(run?.state)) {
      return baseProgress(['lock', 'extract'], { lock: true, extract: true, candidate: false });
    }
    if ([RUN_STATES.PROFILED, RUN_STATES.VALIDATING].includes(run?.state)) {
      return baseProgress(['lock', 'extract', 'profile'], { lock: true, extract: true, candidate: true });
    }
    if ([RUN_STATES.VALIDATED, RUN_STATES.PUBLISHING].includes(run?.state)) {
      return baseProgress(['lock', 'extract', 'profile', 'validate'], { lock: true, extract: true, candidate: true });
    }
    if (run?.state === RUN_STATES.PUBLISHED) {
      return baseProgress(['lock', 'extract', 'profile', 'validate', 'publish'], {
        lock: true, extract: true, candidate: true, published: true,
      }) && run.publishedBundleDigest === run.candidateBundleDigest &&
        run.lastKnownGood?.target === run.publicationTarget &&
        run.lastKnownGood?.referenceId &&
        run.lastKnownGood?.bundleDigest === run.publishedBundleDigest &&
        run.lastKnownGood?.sourceSha256 === run.source.sourceSha256 &&
        run.lastKnownGood?.sourceManifestDigest === run.source.sourceManifestDigest &&
        run.lastKnownGood?.snapshotAsOf === run.source.snapshotAsOf &&
        run.lastKnownGood?.extractorVersion === run.source.extractorVersion &&
        run.lastKnownGood?.profileSchemaVersion === run.source.profileSchemaVersion &&
        run.lastKnownGood?.semanticSchemaVersion === run.source.semanticSchemaVersion &&
        run.lastKnownGood?.processorBundleDigest === run.source.processorBundleDigest &&
        run.lastKnownGood?.idempotencyKey === run.idempotencyKey &&
        run.lastKnownGood?.receiptDigest === run.receipts.publish;
    }
    if (run?.state === RUN_STATES.DUPLICATE) {
      return baseProgress(['lock', 'duplicate'], { lock: true, extract: false, candidate: false }) &&
        run.lastKnownGood?.target === run.publicationTarget &&
        run.lastKnownGood?.sourceSha256 === run.source.sourceSha256 &&
        run.lastKnownGood?.sourceManifestDigest === run.source.sourceManifestDigest &&
        run.lastKnownGood?.snapshotAsOf === run.source.snapshotAsOf &&
        run.lastKnownGood?.extractorVersion === run.source.extractorVersion &&
        run.lastKnownGood?.profileSchemaVersion === run.source.profileSchemaVersion &&
        run.lastKnownGood?.semanticSchemaVersion === run.source.semanticSchemaVersion &&
        run.lastKnownGood?.processorBundleDigest === run.source.processorBundleDigest &&
        run.lastKnownGood?.idempotencyKey === run.idempotencyKey;
    }
    if ([RUN_STATES.FAILED, RUN_STATES.BLOCKED].includes(run?.state) && run?.failure) {
      const expected = {
        [STAGES.LOCK]: [[], { lock: false, extract: false, candidate: false }],
        [STAGES.EXTRACT]: [['lock'], { lock: true, extract: false, candidate: false }],
        [STAGES.PROFILE]: [['lock', 'extract'], { lock: true, extract: true, candidate: false }],
        [STAGES.VALIDATE]: [['lock', 'extract', 'profile'], { lock: true, extract: true, candidate: true }],
        [STAGES.PUBLISH]: [['lock', 'extract', 'profile', 'validate'], { lock: true, extract: true, candidate: true }],
      }[run.failure.stage];
      return Boolean(expected) && baseProgress([...expected[0], 'failure'], { ...expected[1], failure: true }) &&
        run.failure.receiptDigest === run.receipts.failure &&
        (run.state === RUN_STATES.FAILED
          ? run.failure.outcome === RECEIPT_OUTCOMES.FAILED
          : run.failure.outcome === RECEIPT_OUTCOMES.BLOCKED);
    }
    return false;
  })();
  if (!progressionOk) errors.push('run.state_progression');
  return inspection(errors);
}

function inspectStageReceipt(receipt) {
  const errors = [];
  if (!exactKeys(receipt, RECEIPT_KEYS)) errors.push('receipt.structure');
  if (receipt?.schemaVersion !== STAGE_RECEIPT_SCHEMA_VERSION) errors.push('receipt.version');
  if (!validId(receipt?.runId)) errors.push('receipt.run_id');
  if (!validDigest(receipt?.manifestDigest)) errors.push('receipt.manifest_digest');
  if (!validDigest(receipt?.idempotencyKey)) errors.push('receipt.idempotency_key');
  if (!KNOWN_STAGES.has(receipt?.stage)) errors.push('receipt.stage');
  if (!KNOWN_OUTCOMES.has(receipt?.outcome)) errors.push('receipt.outcome');
  if (!validDigest(receipt?.inputDigest)) errors.push('receipt.input_digest');
  if (!validDigest(receipt?.evidenceDigest)) errors.push('receipt.evidence_digest');
  const positive = receipt?.outcome === RECEIPT_OUTCOMES.SUCCEEDED ||
    receipt?.outcome === RECEIPT_OUTCOMES.DUPLICATE;
  if (positive ? !validDigest(receipt?.outputDigest) : receipt?.outputDigest !== null) errors.push('receipt.output_digest');
  const needsReference = receipt?.stage === STAGES.PUBLISH && receipt?.outcome === RECEIPT_OUTCOMES.SUCCEEDED ||
    receipt?.stage === STAGES.DUPLICATE && receipt?.outcome === RECEIPT_OUTCOMES.DUPLICATE;
  if (needsReference ? !validId(receipt?.referenceId) : receipt?.referenceId !== null) errors.push('receipt.reference_id');
  const negative = receipt?.outcome === RECEIPT_OUTCOMES.FAILED || receipt?.outcome === RECEIPT_OUTCOMES.BLOCKED;
  if (negative ? !REASON_CODE.test(receipt?.reasonCode || '') : receipt?.reasonCode !== null) errors.push('receipt.reason_code');
  if (receipt?.stage === STAGES.DUPLICATE && receipt?.outcome !== RECEIPT_OUTCOMES.DUPLICATE) errors.push('receipt.duplicate_outcome');
  if (receipt?.outcome === RECEIPT_OUTCOMES.DUPLICATE && receipt?.stage !== STAGES.DUPLICATE) errors.push('receipt.duplicate_stage');
  if (containsForbiddenMaterial(receipt)) errors.push('receipt.forbidden_material');
  return inspection(errors);
}

function buildStageReceipt(input) {
  const inputKeys = RECEIPT_KEYS.filter(key => key !== 'schemaVersion');
  if (!exactKeys(input, inputKeys)) {
    const error = new TypeError('Invalid GRH stage receipt input: receipt.structure');
    error.code = DECISION_CODES.RECEIPT_INVALID;
    throw error;
  }
  const receipt = { schemaVersion: STAGE_RECEIPT_SCHEMA_VERSION, ...input };
  const checked = inspectStageReceipt(receipt);
  if (!checked.ok) {
    const error = new TypeError(`Invalid GRH stage receipt: ${checked.errors.join(', ')}`);
    error.code = DECISION_CODES.RECEIPT_INVALID;
    throw error;
  }
  return deepFreeze(receipt);
}

function digestStageReceipt(receipt) {
  const result = inspectStageReceipt(receipt);
  if (!result.ok) {
    const error = new TypeError(`Invalid GRH stage receipt: ${result.errors.join(', ')}`);
    error.code = DECISION_CODES.RECEIPT_INVALID;
    throw error;
  }
  return digestValue(receipt);
}

function currentStage(run) {
  if (run.state === RUN_STATES.PLANNED) return STAGES.LOCK;
  if ([RUN_STATES.LOCKED, RUN_STATES.EXTRACTING].includes(run.state)) return STAGES.EXTRACT;
  if ([RUN_STATES.EXTRACTED, RUN_STATES.PROFILING].includes(run.state)) return STAGES.PROFILE;
  if ([RUN_STATES.PROFILED, RUN_STATES.VALIDATING].includes(run.state)) return STAGES.VALIDATE;
  if ([RUN_STATES.VALIDATED, RUN_STATES.PUBLISHING].includes(run.state)) return STAGES.PUBLISH;
  return null;
}

function expectedInput(run, stage) {
  if (stage === STAGES.LOCK || stage === STAGES.DUPLICATE) return run.idempotencyKey;
  if (stage === STAGES.EXTRACT) return run.source.sourceSha256;
  if (stage === STAGES.PROFILE) return run.extractDigest;
  if (stage === STAGES.VALIDATE || stage === STAGES.PUBLISH) return run.candidateBundleDigest;
  return null;
}

function validateReceiptFor(run, receipt, stage, outcome) {
  const checked = inspectStageReceipt(receipt);
  if (!checked.ok) return { ok: false, code: DECISION_CODES.RECEIPT_INVALID, errors: checked.errors };
  const errors = [];
  if (receipt.runId !== run.runId) errors.push('receipt.run_identity');
  if (receipt.manifestDigest !== run.manifestDigest) errors.push('receipt.manifest_identity');
  if (receipt.idempotencyKey !== run.idempotencyKey) errors.push('receipt.idempotency_identity');
  if (receipt.stage !== stage) errors.push('receipt.stage_identity');
  if (receipt.outcome !== outcome) errors.push('receipt.outcome_identity');
  if (receipt.inputDigest !== expectedInput(run, stage)) errors.push('receipt.input_identity');
  return errors.length ? { ok: false, code: DECISION_CODES.RECEIPT_MISMATCH, errors } : { ok: true };
}

function transitionResult(run, state, changes = {}) {
  const nextRun = deepFreeze({ ...run, ...changes, state });
  const checked = inspectPipelineRun(nextRun);
  if (!checked.ok) return deepFreeze({ allowed: false, code: DECISION_CODES.RUN_INVALID, errors: checked.errors });
  return deepFreeze({ allowed: true, code: DECISION_CODES.TRANSITION_ALLOWED, fromState: run.state, toState: state, nextRun });
}

const SIMPLE_TRANSITIONS = Object.freeze({
  [RUN_EVENTS.START_EXTRACT]: [RUN_STATES.LOCKED, RUN_STATES.EXTRACTING],
  [RUN_EVENTS.START_PROFILE]: [RUN_STATES.EXTRACTED, RUN_STATES.PROFILING],
  [RUN_EVENTS.START_VALIDATE]: [RUN_STATES.PROFILED, RUN_STATES.VALIDATING],
  [RUN_EVENTS.START_PUBLISH]: [RUN_STATES.VALIDATED, RUN_STATES.PUBLISHING],
});

function decideGrhPipelineTransition({ run, event, receipt = null, existingPublication = null } = {}) {
  if (isRecord(run) && (run.executionScope !== EXECUTION_SCOPES.LOCAL_REPLAY ||
      run.publicationTarget !== PUBLICATION_TARGETS.LOCAL_STATE || run.tenantId !== null)) {
    return deepFreeze({ allowed: false, code: DECISION_CODES.CONNECTED_SCOPE_NOT_ENABLED });
  }
  const runInspection = inspectPipelineRun(run);
  if (!runInspection.ok) return deepFreeze({ allowed: false, code: DECISION_CODES.RUN_INVALID, errors: runInspection.errors });
  if (!KNOWN_EVENTS.has(event)) return deepFreeze({ allowed: false, code: DECISION_CODES.EVENT_UNKNOWN });
  if (TERMINAL_STATES.has(run.state)) return deepFreeze({ allowed: false, code: DECISION_CODES.TRANSITION_NOT_ALLOWED });

  if (SIMPLE_TRANSITIONS[event]) {
    if (receipt !== null) return deepFreeze({ allowed: false, code: DECISION_CODES.RECEIPT_NOT_ALLOWED });
    const [from, to] = SIMPLE_TRANSITIONS[event];
    return run.state === from ? transitionResult(run, to) :
      deepFreeze({ allowed: false, code: DECISION_CODES.TRANSITION_NOT_ALLOWED });
  }

  const completion = {
    [RUN_EVENTS.ACQUIRE_LOCK]: [RUN_STATES.PLANNED, RUN_STATES.LOCKED, STAGES.LOCK, 'lock'],
    [RUN_EVENTS.COMPLETE_EXTRACT]: [RUN_STATES.EXTRACTING, RUN_STATES.EXTRACTED, STAGES.EXTRACT, 'extract'],
    [RUN_EVENTS.COMPLETE_PROFILE]: [RUN_STATES.PROFILING, RUN_STATES.PROFILED, STAGES.PROFILE, 'profile'],
    [RUN_EVENTS.COMPLETE_VALIDATE]: [RUN_STATES.VALIDATING, RUN_STATES.VALIDATED, STAGES.VALIDATE, 'validate'],
    [RUN_EVENTS.COMPLETE_PUBLISH]: [RUN_STATES.PUBLISHING, RUN_STATES.PUBLISHED, STAGES.PUBLISH, 'publish'],
  }[event];
  if (completion) {
    const [from, to, stage, slot] = completion;
    if (run.state !== from) return deepFreeze({ allowed: false, code: DECISION_CODES.TRANSITION_NOT_ALLOWED });
    if (!receipt) return deepFreeze({ allowed: false, code: DECISION_CODES.RECEIPT_REQUIRED });
    const checked = validateReceiptFor(run, receipt, stage, RECEIPT_OUTCOMES.SUCCEEDED);
    if (!checked.ok) return deepFreeze({ allowed: false, code: checked.code, errors: checked.errors });
    if ((stage === STAGES.VALIDATE || stage === STAGES.PUBLISH) && receipt.outputDigest !== run.candidateBundleDigest) {
      return deepFreeze({ allowed: false, code: DECISION_CODES.RECEIPT_MISMATCH, errors: ['receipt.output_identity'] });
    }
    const receiptDigest = digestStageReceipt(receipt);
    const changes = { receipts: { ...run.receipts, [slot]: receiptDigest } };
    if (stage === STAGES.LOCK) {
      changes.logicalLock = { key: run.idempotencyKey, claimDigest: receipt.outputDigest, receiptDigest };
    } else if (stage === STAGES.EXTRACT) {
      changes.extractDigest = receipt.outputDigest;
    } else if (stage === STAGES.PROFILE) {
      changes.candidateBundleDigest = receipt.outputDigest;
    } else if (stage === STAGES.PUBLISH) {
      changes.publishedBundleDigest = receipt.outputDigest;
      changes.lastKnownGood = {
        target: run.publicationTarget,
        referenceId: receipt.referenceId,
        bundleDigest: receipt.outputDigest,
        sourceSha256: run.source.sourceSha256,
        sourceManifestDigest: run.source.sourceManifestDigest,
        snapshotAsOf: run.source.snapshotAsOf,
        extractorVersion: run.source.extractorVersion,
        profileSchemaVersion: run.source.profileSchemaVersion,
        semanticSchemaVersion: run.source.semanticSchemaVersion,
        processorBundleDigest: run.source.processorBundleDigest,
        idempotencyKey: run.idempotencyKey,
        receiptDigest,
      };
    }
    return transitionResult(run, to, changes);
  }

  if (event === RUN_EVENTS.MARK_DUPLICATE) {
    if (run.state !== RUN_STATES.LOCKED) return deepFreeze({ allowed: false, code: DECISION_CODES.TRANSITION_NOT_ALLOWED });
    if (!receipt) return deepFreeze({ allowed: false, code: DECISION_CODES.RECEIPT_REQUIRED });
    const checked = validateReceiptFor(run, receipt, STAGES.DUPLICATE, RECEIPT_OUTCOMES.DUPLICATE);
    if (!checked.ok) return deepFreeze({ allowed: false, code: checked.code, errors: checked.errors });
    if (!inspectLastKnownGood(existingPublication) || existingPublication === null ||
        stableSerialize(existingPublication) !== stableSerialize(run.lastKnownGood) ||
        existingPublication.target !== run.publicationTarget ||
        existingPublication.referenceId !== receipt.referenceId ||
        existingPublication.bundleDigest !== receipt.outputDigest ||
        existingPublication.sourceSha256 !== run.source.sourceSha256 ||
        existingPublication.sourceManifestDigest !== run.source.sourceManifestDigest ||
        existingPublication.snapshotAsOf !== run.source.snapshotAsOf ||
        existingPublication.extractorVersion !== run.source.extractorVersion ||
        existingPublication.profileSchemaVersion !== run.source.profileSchemaVersion ||
        existingPublication.semanticSchemaVersion !== run.source.semanticSchemaVersion ||
        existingPublication.processorBundleDigest !== run.source.processorBundleDigest ||
        existingPublication.idempotencyKey !== run.idempotencyKey ||
        existingPublication.receiptDigest !== receipt.evidenceDigest) {
      return deepFreeze({ allowed: false, code: DECISION_CODES.PUBLICATION_EVIDENCE_REQUIRED });
    }
    return transitionResult(run, RUN_STATES.DUPLICATE, {
      receipts: { ...run.receipts, duplicate: digestStageReceipt(receipt) },
    });
  }

  if (event === RUN_EVENTS.FAIL || event === RUN_EVENTS.BLOCK) {
    if (!receipt) return deepFreeze({ allowed: false, code: DECISION_CODES.RECEIPT_REQUIRED });
    const stage = currentStage(run);
    const outcome = event === RUN_EVENTS.FAIL ? RECEIPT_OUTCOMES.FAILED : RECEIPT_OUTCOMES.BLOCKED;
    const checked = validateReceiptFor(run, receipt, stage, outcome);
    if (!checked.ok) return deepFreeze({ allowed: false, code: checked.code, errors: checked.errors });
    const receiptDigest = digestStageReceipt(receipt);
    return transitionResult(run, event === RUN_EVENTS.FAIL ? RUN_STATES.FAILED : RUN_STATES.BLOCKED, {
      receipts: { ...run.receipts, failure: receiptDigest },
      failure: { stage, outcome, reasonCode: receipt.reasonCode, receiptDigest },
    });
  }

  return deepFreeze({ allowed: false, code: DECISION_CODES.TRANSITION_NOT_ALLOWED });
}

function inspectPipelineObservation(observation) {
  const keys = ['schemaVersion', 'runId', 'stage', 'startedAt', 'completedAt', 'observedAt'];
  const errors = [];
  if (!exactKeys(observation, keys)) errors.push('observation.structure');
  if (observation?.schemaVersion !== OBSERVATION_SCHEMA_VERSION) errors.push('observation.version');
  if (!validId(observation?.runId)) errors.push('observation.run_id');
  if (!KNOWN_STAGES.has(observation?.stage)) errors.push('observation.stage');
  const started = parseTimestamp(observation?.startedAt);
  const completed = parseTimestamp(observation?.completedAt);
  const observed = parseTimestamp(observation?.observedAt);
  if (![started, completed, observed].every(Number.isFinite) || completed < started || observed < completed) errors.push('observation.timeline');
  if (containsForbiddenMaterial(observation)) errors.push('observation.forbidden_material');
  return inspection(errors);
}

function evaluateRestoreEvidence(evidence) {
  const keys = [
    'schemaVersion', 'tenantId', 'sourceId', 'backupManifestDigest', 'backupObjectDigest',
    'restoreReceiptDigest', 'isolatedTargetId', 'backupSnapshotAt', 'referenceAt',
    'restoreStartedAt', 'restoreCompletedAt', 'checks', 'outcomes',
  ];
  const checkKeys = ['rowCountsDigest', 'constraintsDigest', 'semanticBundleDigest', 'provenanceDigest'];
  const outcomeKeys = ['objectIntegrity', 'restoreCompleted', 'rowCountsReconciled', 'constraintsReconciled', 'semanticValidated', 'provenanceValidated'];
  const errors = [];
  if (!exactKeys(evidence, keys)) errors.push('restore.structure');
  if (evidence?.schemaVersion !== RESTORE_EVIDENCE_SCHEMA_VERSION) errors.push('restore.version');
  if (!validId(evidence?.tenantId) || evidence?.sourceId !== 'grh-junin' || !validId(evidence?.isolatedTargetId)) errors.push('restore.identity');
  if (evidence?.isolatedTargetId === evidence?.tenantId) errors.push('restore.target_not_isolated');
  for (const key of ['backupManifestDigest', 'backupObjectDigest', 'restoreReceiptDigest']) {
    if (!validDigest(evidence?.[key])) errors.push(`restore.${key}`);
  }
  if (!exactKeys(evidence?.checks, checkKeys) || checkKeys.some(key => !validDigest(evidence?.checks?.[key]))) errors.push('restore.checks');
  if (!exactKeys(evidence?.outcomes, outcomeKeys) || outcomeKeys.some(key => evidence?.outcomes?.[key] !== 'PASSED')) errors.push('restore.outcomes');
  const backup = parseTimestamp(evidence?.backupSnapshotAt);
  const reference = parseTimestamp(evidence?.referenceAt);
  const started = parseTimestamp(evidence?.restoreStartedAt);
  const completed = parseTimestamp(evidence?.restoreCompletedAt);
  if (![backup, reference, started, completed].every(Number.isFinite) || reference < backup ||
      started < backup || completed < started) errors.push('restore.timeline');
  if (containsForbiddenMaterial(evidence)) errors.push('restore.forbidden_material');
  if (errors.length) return deepFreeze({ ok: false, code: DECISION_CODES.RESTORE_EVIDENCE_INVALID, errors: [...new Set(errors)], measurements: null });
  return deepFreeze({
    ok: true,
    code: DECISION_CODES.RESTORE_EVIDENCE_STRUCTURALLY_VALID,
    externallyVerified: false,
    measurements: {
      snapshotLagAtReferenceMs: reference - backup,
      restoreExecutionMs: completed - started,
    },
  });
}

function buildFreshnessEvidence({ sourceId, snapshotCompletedAt, publicationCompletedAt } = {}) {
  const deterministic = {
    schemaVersion: FRESHNESS_EVIDENCE_SCHEMA_VERSION,
    sourceId,
    snapshotCompletedAt,
    publicationCompletedAt,
  };
  if (sourceId !== 'grh-junin' || !Number.isFinite(parseTimestamp(snapshotCompletedAt)) ||
      !Number.isFinite(parseTimestamp(publicationCompletedAt)) ||
      parseTimestamp(publicationCompletedAt) < parseTimestamp(snapshotCompletedAt) ||
      containsForbiddenMaterial(deterministic)) {
    throw new TypeError('Invalid GRH freshness evidence identity');
  }
  return deepFreeze({ ...deterministic, evidenceDigest: digestValue(deterministic) });
}

function digestFreshnessPolicy(policy) {
  const policyKeys = ['schemaVersion', 'policyId', 'status', 'maximumAgeMs', 'approvalEvidenceDigest'];
  if (!exactKeys(policy, policyKeys) || policy?.schemaVersion !== FRESHNESS_POLICY_SCHEMA_VERSION ||
      !validId(policy?.policyId) || !['DRAFT', 'APPROVED'].includes(policy?.status) ||
      !Number.isSafeInteger(policy?.maximumAgeMs) || policy.maximumAgeMs <= 0 ||
      (policy.status === 'APPROVED' ? !validDigest(policy.approvalEvidenceDigest) : policy.approvalEvidenceDigest !== null) ||
      containsForbiddenMaterial(policy)) {
    throw new TypeError('Invalid GRH freshness policy');
  }
  return digestValue(policy);
}

function evaluateFreshness({ evidence, policy, now, trustedPolicyDigest = null } = {}) {
  const evidenceKeys = ['schemaVersion', 'sourceId', 'snapshotCompletedAt', 'publicationCompletedAt', 'evidenceDigest'];
  const policyKeys = ['schemaVersion', 'policyId', 'status', 'maximumAgeMs', 'approvalEvidenceDigest'];
  const errors = [];
  if (!exactKeys(evidence, evidenceKeys) || evidence?.schemaVersion !== FRESHNESS_EVIDENCE_SCHEMA_VERSION ||
      evidence?.sourceId !== 'grh-junin' || !validDigest(evidence?.evidenceDigest)) errors.push('freshness.evidence');
  const deterministicEvidence = evidence && {
    schemaVersion: evidence.schemaVersion,
    sourceId: evidence.sourceId,
    snapshotCompletedAt: evidence.snapshotCompletedAt,
    publicationCompletedAt: evidence.publicationCompletedAt,
  };
  if (isRecord(deterministicEvidence) && validDigest(evidence?.evidenceDigest) &&
      digestValue(deterministicEvidence) !== evidence.evidenceDigest) errors.push('freshness.evidence_identity');
  const snapshot = parseTimestamp(evidence?.snapshotCompletedAt);
  const publication = parseTimestamp(evidence?.publicationCompletedAt);
  const observed = parseTimestamp(now);
  if (![snapshot, publication, observed].every(Number.isFinite) || publication < snapshot || observed < publication) errors.push('freshness.timeline');
  if (!exactKeys(policy, policyKeys) || policy?.schemaVersion !== FRESHNESS_POLICY_SCHEMA_VERSION ||
      !validId(policy?.policyId) || !['DRAFT', 'APPROVED'].includes(policy?.status) ||
      !Number.isSafeInteger(policy?.maximumAgeMs) || policy.maximumAgeMs <= 0 ||
      (policy.status === 'APPROVED' ? !validDigest(policy.approvalEvidenceDigest) : policy.approvalEvidenceDigest !== null)) {
    errors.push('freshness.policy');
  }
  if (containsForbiddenMaterial(evidence) || containsForbiddenMaterial(policy)) errors.push('freshness.forbidden_material');
  if (errors.length) return deepFreeze({ ok: false, code: DECISION_CODES.FRESHNESS_EVIDENCE_INVALID, errors: [...new Set(errors)], state: 'UNKNOWN' });
  const ageMs = observed - snapshot;
  if (policy.status !== 'APPROVED' || !validDigest(trustedPolicyDigest) || digestValue(policy) !== trustedPolicyDigest) {
    return deepFreeze({ ok: false, code: DECISION_CODES.FRESHNESS_POLICY_UNGOVERNED, state: 'UNGOVERNED', ageMs });
  }
  const current = ageMs <= policy.maximumAgeMs;
  return deepFreeze({
    ok: true,
    code: current ? DECISION_CODES.FRESHNESS_CURRENT : DECISION_CODES.FRESHNESS_STALE,
    state: current ? 'CURRENT' : 'STALE',
    ageMs,
    maximumAgeMs: policy.maximumAgeMs,
    policyId: policy.policyId,
  });
}

module.exports = deepFreeze({
  PIPELINE_RUN_SCHEMA_VERSION,
  PIPELINE_MANIFEST_SCHEMA_VERSION,
  STAGE_RECEIPT_SCHEMA_VERSION,
  OBSERVATION_SCHEMA_VERSION,
  RESTORE_EVIDENCE_SCHEMA_VERSION,
  FRESHNESS_EVIDENCE_SCHEMA_VERSION,
  FRESHNESS_POLICY_SCHEMA_VERSION,
  EXECUTION_SCOPES,
  PUBLICATION_TARGETS,
  RUN_STATES,
  RUN_EVENTS,
  STAGES,
  RECEIPT_OUTCOMES,
  DECISION_CODES,
  inspectPipelineManifest,
  digestPipelineManifest,
  derivePipelineIdempotencyKey,
  planGrhPipelineRun,
  inspectPipelineRun,
  inspectStageReceipt,
  buildStageReceipt,
  digestStageReceipt,
  decideGrhPipelineTransition,
  inspectPipelineObservation,
  evaluateRestoreEvidence,
  buildFreshnessEvidence,
  digestFreshnessPolicy,
  evaluateFreshness,
});
