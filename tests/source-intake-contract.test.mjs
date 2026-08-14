import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SOURCE_INTAKE_SCHEMA_VERSION,
  SOURCE_INTAKE_MODES,
  buildSourceIntakeEnvelope,
  buildSourceIntakeReceipt,
  inspectSourceIntakeReceipt,
  normalizeProfiledSourceIntake,
  sourceIntakeDetailsFromProfiled,
  sourceIntakeReceiptFromAuditLog,
} from '../api/lib/source-intake-contract.js';
import { cloneFixture, sourceIntakeProfileFixture } from './source-intake-fixture.mjs';

const CREATED_AT = '2026-08-14T12:00:00.000Z';

function receipt(profiled = sourceIntakeProfileFixture(), persisted = true) {
  return buildSourceIntakeReceipt({ id: persisted ? 'audit-log-1' : `preview:${profiled.file.sha256}`, createdAt: CREATED_AT, persisted, profiled });
}

test('the governed receipt and both envelopes expose only the exact v1 aggregate shape', () => {
  const persisted = receipt();
  assert.equal(inspectSourceIntakeReceipt(persisted).ok, true);
  assert.deepEqual(Object.keys(persisted), [
    'id', 'status', 'createdAt', 'persisted', 'source', 'file', 'profile', 'quality', 'limits',
  ]);
  const details = sourceIntakeDetailsFromProfiled(sourceIntakeProfileFixture());
  assert.deepEqual(Object.keys(details), ['schemaVersion', 'status', 'source', 'file', 'profile', 'quality', 'limits']);
  assert.equal(details.schemaVersion, SOURCE_INTAKE_SCHEMA_VERSION);
  assert.doesNotMatch(JSON.stringify(details), /tenant|actor|userId|email|filename|headers|"rawText"|"values"|"rows"/i);

  const persistentEnvelope = buildSourceIntakeEnvelope({
    mode: SOURCE_INTAKE_MODES.PERSISTENT,
    receipts: [persisted],
  });
  assert.equal(persistentEnvelope.writeEnabled, true);
  assert.equal(persistentEnvelope.maxFileBytes, 4194304);
  assert.deepEqual(persistentEnvelope.allowedExtensions, ['csv', 'json', 'pdf', 'txt', 'xls', 'xlsx']);

  const previewEnvelope = buildSourceIntakeEnvelope({ mode: SOURCE_INTAKE_MODES.PREVIEW, receipts: [] });
  assert.equal(previewEnvelope.writeEnabled, false);
  assert.deepEqual(previewEnvelope.receipts, []);
  assert.throws(() => buildSourceIntakeEnvelope({
    mode: SOURCE_INTAKE_MODES.PREVIEW,
    receipt: receipt(sourceIntakeProfileFixture(), false),
  }), /SOURCE_INTAKE_ENVELOPE_INVALID/);
  assert.throws(() => buildSourceIntakeEnvelope({ mode: SOURCE_INTAKE_MODES.PREVIEW, receipts: [persisted] }),
    /SOURCE_INTAKE_ENVELOPE_INVALID/);
});

test('receipt validation pins source enums, period, finance currency, and the mandatory quarantine blocks', () => {
  const mutations = [
    value => { value.source.domain = 'future'; },
    value => { value.source.referencePeriod = 'julio-2026'; },
    value => { value.source.currency = 'not_applicable'; },
    value => { value.source.authority = 'future'; },
    value => { value.file.kind = 'pdf'; },
    value => { value.profile.pageCount = 1; },
    value => { value.profile.schemaDigest = null; },
    value => { value.quality.checks.find(check => check.code === 'original_not_retained').status = 'passed'; value.quality.passedCount += 1; value.quality.blockedCount -= 1; },
    value => { value.quality.checks.find(check => check.code === 'antimalware_not_run').severity = 'info'; },
    value => { value.quality.checks.find(check => check.code === 'authority_owner_confirmed').code = 'authority_unverified'; value.quality.checks[5].status = 'blocked'; value.quality.checks[5].severity = 'high'; value.quality.passedCount -= 1; value.quality.blockedCount += 1; },
    value => { value.source.containsPersonalData = true; },
  ];
  for (const mutate of mutations) {
    const profiled = sourceIntakeProfileFixture();
    mutate(profiled);
    assert.throws(() => normalizeProfiledSourceIntake(profiled), /SOURCE_INTAKE_PROFILE_INVALID/);
  }
});

test('AuditLog readback is fail-closed against extra payloads, drift, and corrupted quality summaries', () => {
  const details = sourceIntakeDetailsFromProfiled(sourceIntakeProfileFixture());
  const row = { id: 'audit-log-1', createdAt: new Date(CREATED_AT), details };
  assert.equal(sourceIntakeReceiptFromAuditLog(row).persisted, true);

  const tampered = cloneFixture(row);
  tampered.details.filename = 'secreto.csv';
  assert.throws(() => sourceIntakeReceiptFromAuditLog(tampered), /SOURCE_INTAKE_AUDIT_ROW_INVALID/);

  const inconsistent = cloneFixture(row);
  inconsistent.details.quality.blockedCount = 0;
  assert.throws(() => sourceIntakeReceiptFromAuditLog(inconsistent), /SOURCE_INTAKE_AUDIT_ROW_INVALID/);

  const extraCheck = cloneFixture(row);
  extraCheck.details.quality.checks.push({ code: 'future', status: 'passed', severity: 'info', label: 'Future.' });
  extraCheck.details.quality.passedCount += 1;
  assert.throws(() => sourceIntakeReceiptFromAuditLog(extraCheck), /SOURCE_INTAKE_AUDIT_ROW_INVALID/);
});
