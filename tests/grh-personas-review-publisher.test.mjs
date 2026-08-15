import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  COUNT_ACTIVE_EVENTS_SQL,
  DETECT_CANONICAL_LINKAGE_SQL,
  EXPECTED_COUNTS,
  FIND_READY_RUN_SQL,
  FIND_RUN_BY_DIGEST_SQL,
  GOVERNED_CANONICAL_MATCH_COUNTS,
  HMAC_KEY_ENV,
  INSERT_CASES_SQL,
  INSERT_OPTIONS_SQL,
  INSERT_RUN_SQL,
  LOCK_ACTIVE_CASES_SQL,
  PINNED_SOURCE,
  PUBLISH_DATABASE_ENV,
  READBACK_CASES_SQL,
  READ_CANONICAL_LINKAGE_PREFLIGHT_SQL,
  READBACK_OPTIONS_SQL,
  READBACK_SQL,
  RETIRE_RUN_SQL,
  runCli,
  runMaterializer,
  publishReviewBundle,
  EVIDENCE_KEY_ENV,
} from '../scripts/publish-grh-personas-review.mjs';
import { openGrhPersonasReviewEvidence } from '../api/lib/grh-personas-review-crypto.js';

const TENANT = 'tenant-junin';
const HMAC_KEY = Buffer.alloc(32, 1).toString('base64url');
const EVIDENCE_KEY = Buffer.alloc(32, 2).toString('base64url');
const GRH_SOURCE = path.join(os.homedir(), 'Downloads', 'grh_junin.backup_2026080615_plataforma.sql.gz');
const PERSONAS_SOURCE = path.join(os.homedir(), 'Downloads', 'personas_junin.backup_2026080615_plataforma.sql.gz');
const ENVELOPE = Object.freeze({
  schemaVersion: 'grh-personas-review-envelope-v1',
  keyVersion: 'v1',
  algorithm: 'A256GCM',
  iv: Buffer.alloc(12, 3).toString('base64url'),
  ciphertext: Buffer.from('ciphertext').toString('base64url'),
  tag: Buffer.alloc(16, 4).toString('base64url'),
});

function hex(index, prefix = '') {
  return `${prefix}${index.toString(16)}`.padStart(64, '0').slice(-64);
}

function buildBundle({
  runId = '11111111-1111-5111-8111-111111111111',
  runDigest = 'a'.repeat(64),
  semanticDigest = 'b'.repeat(64),
} = {}) {
  const cases = [];
  const options = [];
  for (let index = 0; index < EXPECTED_COUNTS.totalCaseCount; index += 1) {
    const classification = index < EXPECTED_COUNTS.candidateCaseCount
      ? 'CANDIDATE'
      : index < EXPECTED_COUNTS.candidateCaseCount + EXPECTED_COUNTS.ambiguousCaseCount
        ? 'AMBIGUOUS'
        : 'UNMATCHED';
    const ambiguousIndex = index - EXPECTED_COUNTS.candidateCaseCount;
    const optionCount = classification === 'CANDIDATE'
      ? 1
      : classification === 'AMBIGUOUS'
        ? (ambiguousIndex === 0 ? 486 : 0)
        : 0;
    const caseKey = hex(index + 1, 'c');
    cases.push({
      recordType: 'case',
      tenantId: TENANT,
      runId,
      caseKey,
      grhRef: hex(index + 1, 'd'),
      classification,
      reviewLane: classification === 'CANDIDATE' ? 'unique_valid_cuil'
        : classification === 'AMBIGUOUS' ? 'document_candidate' : 'unmatched',
      status: 'PENDING',
      tierKey: classification === 'CANDIDATE' ? 'unique_valid_cuil' : null,
      priority: index < EXPECTED_COUNTS.documentConflictCount
        ? 'DOCUMENT_CONFLICT'
        : classification === 'AMBIGUOUS' ? 'MANUAL_REVIEW' : 'STANDARD',
      optionCount,
      documentConflict: index < EXPECTED_COUNTS.documentConflictCount,
      birthDateConflict: false,
      nameSupport: classification === 'CANDIDATE',
      evidenceDigest: hex(index + 1, 'e'),
      evidenceEnvelope: structuredClone(ENVELOPE),
    });
    for (let rank = 1; rank <= optionCount; rank += 1) {
      const optionIndex = options.length + 1;
      options.push({
        recordType: 'option',
        tenantId: TENANT,
        runId,
        caseKey,
        optionKey: hex(optionIndex, '1'),
        pairRef: hex(optionIndex, '2'),
        personasRef: hex(optionIndex, '3'),
        rank,
        matchMethod: classification === 'CANDIDATE' ? 'UNIQUE_VALID_CUIL' : 'DOCUMENT_CANDIDATE',
        evidenceLevel: classification === 'CANDIDATE' ? 'STRONG' : 'ASSISTED',
        status: 'PENDING',
        cuilEvidence: 'MATCH',
        dniEvidence: 'MISSING',
        nameEvidence: 'MATCH',
        birthDateEvidence: 'MISSING',
        requiresManualCheck: true,
        evidenceDigest: hex(optionIndex, '4'),
        evidenceEnvelope: structuredClone(ENVELOPE),
      });
    }
  }
  assert.equal(options.length, EXPECTED_COUNTS.totalOptionCount);
  return {
    manifest: {
      recordType: 'manifest',
      schemaVersion: 'grh-personas-review-stream-v1',
      runSchemaVersion: 'grh-personas-review-run-v1',
      materializerVersion: 'grh-personas-review-materializer-v2',
      matcherVersion: 'grh-personas-linkage-matcher-v1',
      evidencePolicyVersion: 'grh-personas-review-evidence-v2',
      encryptionKeyVersion: 'v1',
      tenantId: TENANT,
      runId,
      runDigest,
      semanticDigest,
      snapshotAsOf: PINNED_SOURCE.snapshotAsOf,
      grhSourceSha256: PINNED_SOURCE.grhSourceSha256,
      personasSourceSha256: PINNED_SOURCE.personasSourceSha256,
      counts: { ...EXPECTED_COUNTS },
      allPending: true,
      autoApprovalAllowed: false,
      crosswalkPublished: false,
    },
    cases,
    options,
  };
}

function runRow(manifest, status = 'READY') {
  return {
    run_id: manifest.runId,
    schema_version: manifest.runSchemaVersion,
    matcher_version: manifest.matcherVersion,
    evidence_policy_version: manifest.evidencePolicyVersion,
    encryption_key_version: manifest.encryptionKeyVersion,
    snapshot_as_of: manifest.snapshotAsOf,
    grh_source_sha256: manifest.grhSourceSha256,
    personas_source_sha256: manifest.personasSourceSha256,
    semantic_digest: manifest.semanticDigest,
    run_digest: manifest.runDigest,
    total_case_count: manifest.counts.totalCaseCount,
    total_option_count: manifest.counts.totalOptionCount,
    candidate_case_count: manifest.counts.candidateCaseCount,
    ambiguous_case_count: manifest.counts.ambiguousCaseCount,
    unmatched_case_count: manifest.counts.unmatchedCaseCount,
    document_conflict_count: manifest.counts.documentConflictCount,
    auto_approved_count: 0,
    status,
  };
}

function canonicalLinkageRow(overrides = {}) {
  return {
    active_link_count: GOVERNED_CANONICAL_MATCH_COUNTS.activeLinkCount,
    unreviewed_active_link_count: 0,
    cuil_unique_count: GOVERNED_CANONICAL_MATCH_COUNTS.cuilUniqueCount,
    duplicate_cuil_count: GOVERNED_CANONICAL_MATCH_COUNTS.duplicateCuilCount,
    dni_unique_count: GOVERNED_CANONICAL_MATCH_COUNTS.dniUniqueCount,
    duplicate_dni_count: GOVERNED_CANONICAL_MATCH_COUNTS.duplicateDniCount,
    ...overrides,
  };
}

class ReviewDatabaseAdapter {
  constructor({
    canonicalLinkage = null,
    tamperAfterCommit = false,
    tenant = { status: 'ACTIVE', trial_ends_at: null },
  } = {}) {
    this.runs = [];
    this.cases = [];
    this.options = [];
    this.events = [];
    this.calls = [];
    this.transactionBackup = null;
    this.committed = false;
    this.canonicalLinkage = canonicalLinkage;
    this.tamperAfterCommit = tamperAfterCommit;
    this.tenant = tenant;
  }

  async query(sql, values = []) {
    this.calls.push({ sql, values });
    if (sql === DETECT_CANONICAL_LINKAGE_SQL) {
      return { rows: [{
        has_crosswalk_persona: this.canonicalLinkage !== null,
        has_source_xref: this.canonicalLinkage !== null,
      }] };
    }
    if (sql === READ_CANONICAL_LINKAGE_PREFLIGHT_SQL && this.canonicalLinkage !== null) {
      return { rows: [structuredClone(this.canonicalLinkage)] };
    }
    if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE') {
      this.transactionBackup = structuredClone({
        runs: this.runs,
        cases: this.cases,
        options: this.options,
        events: this.events,
      });
      this.committed = false;
      return { rows: [] };
    }
    if (sql === 'COMMIT') {
      this.transactionBackup = null;
      this.committed = true;
      return { rows: [] };
    }
    if (sql === 'ROLLBACK') {
      Object.assign(this, this.transactionBackup);
      this.transactionBackup = null;
      return { rows: [] };
    }
    if (/^SET LOCAL/u.test(sql) || /pg_advisory_xact_lock/u.test(sql)) return { rows: [] };
    if (/FROM tenants WHERE id=\$1 FOR SHARE/u.test(sql)) {
      return { rows: this.tenant ? [{ id: values[0], ...structuredClone(this.tenant) }] : [] };
    }
    if (sql === FIND_READY_RUN_SQL) {
      return { rows: this.runs.filter(row => row.status === 'READY').map(row => structuredClone(row)) };
    }
    if (sql === FIND_RUN_BY_DIGEST_SQL) {
      return { rows: this.runs.filter(row => row.run_digest === values[1]).map(row => ({ run_id: row.run_id, status: row.status })) };
    }
    if (sql === LOCK_ACTIVE_CASES_SQL) {
      return { rows: this.cases.filter(row => row.run_id === values[1]).map(row => ({ case_key: row.case_key, status: row.status })) };
    }
    if (sql === COUNT_ACTIVE_EVENTS_SQL) {
      return { rows: [{ event_count: this.events.filter(row => row.run_id === values[1]).length }] };
    }
    if (sql === RETIRE_RUN_SQL) {
      const row = this.runs.find(item => item.run_id === values[1] && item.status === 'READY');
      if (!row) return { rowCount: 0, rows: [] };
      row.status = 'RETIRED';
      return { rowCount: 1, rows: [] };
    }
    if (sql === INSERT_RUN_SQL) {
      const [runId, tenantId, schemaVersion, matcherVersion, evidencePolicyVersion,
        encryptionKeyVersion, snapshotAsOf, grhSha, personasSha, semanticDigest,
        runDigest, totalCases, totalOptions, candidateCases, ambiguousCases,
        unmatchedCases, documentConflicts] = values;
      this.runs.push({
        run_id: runId,
        tenant_id: tenantId,
        schema_version: schemaVersion,
        matcher_version: matcherVersion,
        evidence_policy_version: evidencePolicyVersion,
        encryption_key_version: encryptionKeyVersion,
        snapshot_as_of: snapshotAsOf,
        grh_source_sha256: grhSha,
        personas_source_sha256: personasSha,
        semantic_digest: semanticDigest,
        run_digest: runDigest,
        total_case_count: totalCases,
        total_option_count: totalOptions,
        candidate_case_count: candidateCases,
        ambiguous_case_count: ambiguousCases,
        unmatched_case_count: unmatchedCases,
        document_conflict_count: documentConflicts,
        auto_approved_count: 0,
        status: 'READY',
      });
      return { rowCount: 1, rows: [] };
    }
    if (sql === INSERT_CASES_SQL) {
      const rows = JSON.parse(values[2]);
      this.cases.push(...rows.map(row => ({
        ...row,
        tenant_id: values[0],
        run_id: values[1],
        status: 'PENDING',
        version: 1,
        selected_option_key: null,
        selected_personas_ref: null,
        reason_code: null,
        decided_by_user_id: null,
        decided_at: null,
      })));
      return { rowCount: rows.length, rows: [] };
    }
    if (sql === INSERT_OPTIONS_SQL) {
      const rows = JSON.parse(values[2]);
      this.options.push(...rows.map(row => ({
        ...row,
        tenant_id: values[0],
        run_id: values[1],
        requires_manual_check: true,
      })));
      return { rowCount: rows.length, rows: [] };
    }
    if (sql === READBACK_SQL) {
      const run = this.runs.find(row => row.run_id === values[1]);
      if (!run) return { rows: [] };
      const cases = this.cases.filter(row => row.run_id === run.run_id);
      const options = this.options.filter(row => row.run_id === run.run_id);
      return { rows: [{
        ...structuredClone(run),
        observed_case_count: cases.length,
        observed_option_count: options.length,
        pending_case_count: cases.filter(row => row.status === 'PENDING').length,
        observed_candidate_count: cases.filter(row => row.kind === 'CANDIDATE').length,
        observed_ambiguous_count: cases.filter(row => row.kind === 'AMBIGUOUS').length,
        observed_unmatched_count: cases.filter(row => row.kind === 'UNMATCHED').length,
        observed_document_conflict_count: cases.filter(row => row.document_conflict).length,
        target_collision_count: options.length - new Set(options.map(row => row.personas_ref)).size,
        manual_option_count: options.filter(row => row.requires_manual_check).length,
      }] };
    }
    if (sql === READBACK_CASES_SQL) {
      const rows = this.cases.filter(row => row.run_id === values[1]).map(row => {
        const { tenant_id, run_id, ...rest } = row;
        return structuredClone(rest);
      }).sort((left, right) => left.case_key.localeCompare(right.case_key));
      if (this.tamperAfterCommit && this.committed && rows.length) {
        rows[0].evidence_envelope.ciphertext = Buffer.from('tampered').toString('base64url');
      }
      return { rows };
    }
    if (sql === READBACK_OPTIONS_SQL) {
      return { rows: this.options.filter(row => row.run_id === values[1]).map(row => {
        const { tenant_id, run_id, ...rest } = row;
        return structuredClone(rest);
      }).sort((left, right) => left.case_key.localeCompare(right.case_key) || left.rank - right.rank || left.option_key.localeCompare(right.option_key)) };
    }
    throw new Error(`unexpected query: ${sql}`);
  }
}

test('Python materializer envelopes and HMAC identities interoperate with the Node validator', {
  skip: !(existsSync(GRH_SOURCE) && existsSync(PERSONAS_SOURCE)),
}, async () => {
  const bundle = await runMaterializer({
    tenantId: TENANT,
    grhSource: GRH_SOURCE,
    personasSource: PERSONAS_SOURCE,
    hmacKey: HMAC_KEY,
    evidenceKey: EVIDENCE_KEY,
  });
  assert.equal(bundle.cases.length, EXPECTED_COUNTS.totalCaseCount);
  assert.equal(bundle.options.length, EXPECTED_COUNTS.totalOptionCount);
  assert.equal(bundle.cases.every(row => row.status === 'PENDING'), true);
  assert.equal(bundle.options.every(row => row.requiresManualCheck), true);
  const uniqueDniLevels = Object.fromEntries(['CONFLICT', 'INSUFFICIENT', 'ASSISTED'].map(level => [
    level,
    bundle.options.filter(row => row.matchMethod === 'UNIQUE_DNI_BACKUP' && row.evidenceLevel === level).length,
  ]));
  assert.deepEqual(uniqueDniLevels, { CONFLICT: 95, INSUFFICIENT: 81, ASSISTED: 27 });
  const firstCase = bundle.cases[0];
  const firstOption = bundle.options[0];
  const environment = { [EVIDENCE_KEY_ENV]: EVIDENCE_KEY };
  const caseEvidence = openGrhPersonasReviewEvidence({
    tenantId: TENANT,
    runId: bundle.manifest.runId,
    recordType: 'case',
    stableKey: firstCase.caseKey,
    envelope: firstCase.evidenceEnvelope,
    environment,
  });
  const optionEvidence = openGrhPersonasReviewEvidence({
    tenantId: TENANT,
    runId: bundle.manifest.runId,
    recordType: 'option',
    stableKey: firstOption.optionKey,
    envelope: firstOption.evidenceEnvelope,
    environment,
  });
  assert.equal(caseEvidence.schemaVersion, 'grh-personas-review-case-evidence-v1');
  assert.equal(optionEvidence.schemaVersion, 'grh-personas-review-option-evidence-v1');
});

test('publisher rejects DNI-only evidence mislabeled as assisted before any database mutation', async () => {
  const bundle = buildBundle();
  const unsafe = bundle.options[0];
  unsafe.matchMethod = 'UNIQUE_DNI_BACKUP';
  unsafe.cuilEvidence = 'MISSING';
  unsafe.dniEvidence = 'MATCH';
  unsafe.nameEvidence = 'DIFFERENT';
  unsafe.birthDateEvidence = 'MISSING';
  unsafe.evidenceLevel = 'ASSISTED';
  const client = new ReviewDatabaseAdapter();
  await assert.rejects(
    publishReviewBundle({ bundle, client }),
    error => error.code === 'REVIEW_PUBLICATION_INPUT_INVALID',
  );
  assert.equal(client.calls.length, 0);
});

test('publisher blocks unreviewed canonical links and governed matcher drift before BEGIN', async t => {
  const bundle = buildBundle();
  const scenarios = [
    {
      name: 'active matched links without review',
      row: canonicalLinkageRow({ unreviewed_active_link_count: 1 }),
    },
    {
      name: 'method counts from the superseded matcher',
      row: canonicalLinkageRow({ duplicate_cuil_count: 40, duplicate_dni_count: 24 }),
    },
  ];
  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const client = new ReviewDatabaseAdapter({ canonicalLinkage: scenario.row });
      await assert.rejects(
        publishReviewBundle({ bundle, client }),
        error => error.code === 'REVIEW_CANONICAL_LINKAGE_PREFLIGHT_FAILED',
      );
      assert.deepEqual(client.calls.map(call => call.sql), [
        DETECT_CANONICAL_LINKAGE_SQL,
        READ_CANONICAL_LINKAGE_PREFLIGHT_SQL,
      ]);
      assert.equal(client.calls.some(call =>
        /^(?:BEGIN|INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP)\b/iu.test(call.sql.trim())), false);
    });
  }
});

test('publisher rejects every unusable trial tenant before writing private review rows', async t => {
  const bundle = buildBundle();
  const scenarios = [
    { name: 'missing trial expiry', trial_ends_at: null },
    { name: 'invalid trial expiry', trial_ends_at: 'not-a-date' },
    { name: 'expired trial', trial_ends_at: '2000-01-01T00:00:00.000Z' },
  ];
  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const client = new ReviewDatabaseAdapter({
        tenant: { status: 'TRIAL', trial_ends_at: scenario.trial_ends_at },
      });
      await assert.rejects(
        publishReviewBundle({ bundle, client }),
        error => error.code === 'REVIEW_TENANT_INVALID',
      );
      assert.equal(client.calls.some(call =>
        [INSERT_RUN_SQL, INSERT_CASES_SQL, INSERT_OPTIONS_SQL].includes(call.sql)), false);
      assert.equal(client.calls.filter(call => call.sql === 'COMMIT').length, 0);
      assert.equal(client.calls.filter(call => call.sql === 'ROLLBACK').length, 1);
    });
  }
});

test('publisher writes encrypted rows in one transaction, verifies full content and is idempotent', async () => {
  const bundle = buildBundle();
  const client = new ReviewDatabaseAdapter();
  const first = await publishReviewBundle({ bundle, client });
  assert.equal(first.status, 'published');
  assert.equal(client.runs.length, 1);
  assert.equal(client.cases.length, EXPECTED_COUNTS.totalCaseCount);
  assert.equal(client.options.length, EXPECTED_COUNTS.totalOptionCount);
  assert.equal(client.cases.every(row => row.status === 'PENDING'), true);
  assert.equal(client.options.every(row => row.requires_manual_check), true);
  assert.equal(client.calls.filter(call => call.sql === 'COMMIT').length, 1);
  assert.ok(client.calls.findIndex(call => call.sql === READBACK_CASES_SQL) <
    client.calls.findIndex(call => call.sql === 'COMMIT'));
  assert.ok(client.calls.findLastIndex(call => call.sql === READBACK_OPTIONS_SQL) >
    client.calls.findIndex(call => call.sql === 'COMMIT'));
  const serializedInsert = client.calls
    .filter(call => [INSERT_CASES_SQL, INSERT_OPTIONS_SQL].includes(call.sql))
    .map(call => call.values[2]).join('');
  assert.doesNotMatch(serializedInsert, /displayName|birthDate|documents|sourceId/u);

  const callsBefore = client.calls.length;
  const second = await publishReviewBundle({ bundle, client });
  assert.equal(second.status, 'unchanged');
  assert.equal(client.calls.slice(callsBefore).some(call =>
    [INSERT_RUN_SQL, INSERT_CASES_SQL, INSERT_OPTIONS_SQL, RETIRE_RUN_SQL].includes(call.sql)), false);
});

test('publisher rejects replacing a run that has decisions and preserves all history', async () => {
  const original = buildBundle();
  const client = new ReviewDatabaseAdapter();
  await publishReviewBundle({ bundle: original, client });
  client.events.push({ run_id: original.manifest.runId });
  const replacement = buildBundle({
    runId: '22222222-2222-5222-8222-222222222222',
    runDigest: 'c'.repeat(64),
    semanticDigest: 'd'.repeat(64),
  });
  const baseline = structuredClone({ runs: client.runs, cases: client.cases, options: client.options, events: client.events });
  await assert.rejects(
    publishReviewBundle({ bundle: replacement, client }),
    error => error.code === 'REVIEW_ACTIVE_RUN_HAS_DECISIONS',
  );
  assert.deepEqual({ runs: client.runs, cases: client.cases, options: client.options, events: client.events }, baseline);
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
});

test('same digest remains idempotent after a human decision and never overwrites mutable review state', async () => {
  const bundle = buildBundle();
  const client = new ReviewDatabaseAdapter();
  await publishReviewBundle({ bundle, client });
  const decided = client.cases[0];
  decided.status = 'APPROVED';
  decided.version = 2;
  decided.selected_option_key = client.options.find(row => row.case_key === decided.case_key).option_key;
  decided.selected_personas_ref = client.options.find(row => row.case_key === decided.case_key).personas_ref;
  decided.reason_code = 'DOCUMENTS_CONFIRMED';
  decided.decided_by_user_id = 'user-reviewer';
  decided.decided_at = '2026-08-13T12:00:00.000Z';
  client.events.push({ run_id: bundle.manifest.runId });
  const callsBefore = client.calls.length;
  const result = await publishReviewBundle({ bundle, client });
  assert.equal(result.status, 'unchanged');
  assert.equal(decided.status, 'APPROVED');
  assert.equal(decided.version, 2);
  assert.equal(client.calls.slice(callsBefore).some(call =>
    [INSERT_RUN_SQL, INSERT_CASES_SQL, INSERT_OPTIONS_SQL, RETIRE_RUN_SQL].includes(call.sql)), false);
});

test('publisher detects post-commit ciphertext tampering even when counts and run digest still match', async () => {
  const bundle = buildBundle();
  const client = new ReviewDatabaseAdapter({ tamperAfterCommit: true });
  await assert.rejects(
    publishReviewBundle({ bundle, client }),
    error => error.code === 'REVIEW_COMMIT_CONTENT_READBACK_MISMATCH',
  );
  assert.equal(client.runs.length, 1);
  assert.equal(client.cases.length, EXPECTED_COUNTS.totalCaseCount);
  assert.equal(client.options.length, EXPECTED_COUNTS.totalOptionCount);
});

test('dry-run validates aggregate data without requiring or opening a database connection', async () => {
  const bundle = buildBundle();
  let clientConstructed = false;
  let stdout = '';
  const result = await runCli({
    argv: ['--dry-run', '--tenant-id', TENANT, '--grh-source', GRH_SOURCE, '--personas-source', PERSONAS_SOURCE],
    environment: {
      [HMAC_KEY_ENV]: HMAC_KEY,
      [EVIDENCE_KEY_ENV]: EVIDENCE_KEY,
      DATABASE_URL: 'postgresql://runtime:secret@localhost/runtime?sslmode=disable',
    },
    stdout: { write: value => { stdout += value; } },
    materializerRunner: async () => bundle,
    ClientImpl: class {
      constructor() { clientConstructed = true; }
    },
  });
  assert.equal(result.status, 'validated');
  assert.equal(result.totalCaseCount, EXPECTED_COUNTS.totalCaseCount);
  assert.equal(clientConstructed, false);
  assert.doesNotMatch(stdout, /ciphertext|displayName|documents/u);
});

test('publisher rejects reusing the stable-reference key for evidence encryption before materialization', async () => {
  let materializerCalls = 0;
  await assert.rejects(
    runCli({
      argv: ['--dry-run', '--tenant-id', TENANT, '--grh-source', GRH_SOURCE, '--personas-source', PERSONAS_SOURCE],
      environment: {
        [HMAC_KEY_ENV]: HMAC_KEY,
        [EVIDENCE_KEY_ENV]: HMAC_KEY,
      },
      stdout: { write() {} },
      materializerRunner: async () => { materializerCalls += 1; return buildBundle(); },
    }),
    error => error.code === 'REVIEW_KEY_REUSE_FORBIDDEN',
  );
  assert.equal(materializerCalls, 0);
});

test('publisher source has no fallback to runtime DATABASE_URL and never mutates review history', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../scripts/publish-grh-personas-review.mjs', import.meta.url), 'utf8');
  assert.match(source, new RegExp(PUBLISH_DATABASE_ENV, 'u'));
  assert.doesNotMatch(source, /environment\.DATABASE_URL|process\.env\.PYTHON/u);
  assert.doesNotMatch(source, /DELETE\s+FROM\s+grh_personas_review/iu);
  assert.doesNotMatch(source, /UPDATE\s+grh_personas_review_(?:cases|events)/iu);
  assert.doesNotMatch(source, /(?:INSERT|UPDATE).*crosswalk/iu);
});
