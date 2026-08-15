import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGrhPersonasReviewCaseKey,
  createGrhPersonasReviewOptionKey,
  createGrhPersonasReviewPairRef,
  createGrhPersonasReviewSourceRef,
  openGrhPersonasReviewEvidence,
  sealGrhPersonasReviewEvidence,
} from '../api/lib/grh-personas-review-crypto.js';

const environment = {
  GRH_PERSONAS_REVIEW_EVIDENCE_KEY_V1: Buffer.alloc(32, 7).toString('base64url'),
  GRH_PERSONAS_REVIEW_HMAC_KEY_V1: Buffer.alloc(32, 8).toString('base64url'),
};
const tenantId = 'tenant-junin';
const runId = '11111111-1111-4111-8111-111111111111';

function caseEvidence(overrides = {}) {
  return {
    schemaVersion: 'grh-personas-review-case-evidence-v1',
    person: {
      displayName: 'PERSONA GRH PRUEBA',
      birthDate: '1988-08-08',
      documents: { cuil: '20999999999', dni: '99999999' },
      ...overrides,
    },
  };
}

test('AES-GCM evidence round-trips with exact authenticated context', () => {
  const stableKey = 'a'.repeat(64);
  const envelope = sealGrhPersonasReviewEvidence({
    tenantId, runId, recordType: 'case', stableKey,
    evidence: caseEvidence(), environment, iv: Buffer.alloc(12, 3),
  });
  assert.deepEqual(Object.keys(envelope).sort(),
    ['algorithm', 'ciphertext', 'iv', 'keyVersion', 'schemaVersion', 'tag'].sort());
  assert.equal(envelope.algorithm, 'A256GCM');
  assert.equal(envelope.iv, Buffer.alloc(12, 3).toString('base64url'));
  assert.deepEqual(openGrhPersonasReviewEvidence({
    tenantId, runId, recordType: 'case', stableKey, envelope, environment,
  }), caseEvidence());
});

test('tamper, key drift and AAD drift fail closed without plaintext', () => {
  const stableKey = 'b'.repeat(64);
  const envelope = sealGrhPersonasReviewEvidence({
    tenantId, runId, recordType: 'case', stableKey,
    evidence: caseEvidence(), environment,
  });
  const attempts = [
    { stableKey: 'c'.repeat(64), envelope },
    { stableKey, envelope: { ...envelope, tag: Buffer.alloc(16, 4).toString('base64url') } },
    { stableKey, envelope, environment: { ...environment, GRH_PERSONAS_REVIEW_EVIDENCE_KEY_V1: Buffer.alloc(32, 9).toString('base64url') } },
  ];
  for (const attempt of attempts) {
    assert.throws(() => openGrhPersonasReviewEvidence({
      tenantId, runId, recordType: 'case', environment, ...attempt,
    }), error => error.code === 'GRH_PERSONAS_REVIEW_CRYPTO_INVALID');
  }
});

test('stable refs are domain separated, tenant bound and independent of review runs', () => {
  const grhRef = createGrhPersonasReviewSourceRef({ tenantId, sourceSystem: 'GRH', sourceId: 'GRH-TEST-001', environment });
  const personasRef = createGrhPersonasReviewSourceRef({ tenantId, sourceSystem: 'PERSONAS', sourceId: 'PERSONAS-TEST-001', environment });
  const caseKey = createGrhPersonasReviewCaseKey({ tenantId, grhRef, environment });
  const pairRef = createGrhPersonasReviewPairRef({ tenantId, grhRef, personasRef, environment });
  const optionKey = createGrhPersonasReviewOptionKey({ tenantId, pairRef, environment });
  assert.deepEqual([grhRef, personasRef, caseKey, pairRef, optionKey].map(value => /^[a-f0-9]{64}$/.test(value)),
    [true, true, true, true, true]);
  assert.equal(createGrhPersonasReviewCaseKey({ tenantId, grhRef, environment }), caseKey);
  assert.equal(createGrhPersonasReviewPairRef({ tenantId, grhRef, personasRef, environment }), pairRef);
  assert.equal(createGrhPersonasReviewOptionKey({ tenantId, pairRef, environment }), optionKey);
  assert.equal(new Set([grhRef, personasRef, caseKey, pairRef, optionKey]).size, 5);
  assert.notEqual(createGrhPersonasReviewCaseKey({ tenantId: 'other-tenant', grhRef, environment }), caseKey);
});

test('evidence rejects impossible/sentinel dates, unsafe names and invalid document widths', () => {
  for (const birthDate of ['2026-99-99', '1900-01-01', '1992-12-31', '1111-11-11']) {
    assert.throws(() => sealGrhPersonasReviewEvidence({
      tenantId, runId, recordType: 'case', stableKey: 'd'.repeat(64),
      evidence: caseEvidence({ birthDate }), environment,
    }));
  }
  for (const person of [
    { displayName: ' BAD ' },
    { displayName: 'BAD\nNAME' },
    { documents: { cuil: '2099999999', dni: '99999999' } },
    { documents: { cuil: '20999999999', dni: '99999' } },
  ]) {
    assert.throws(() => sealGrhPersonasReviewEvidence({
      tenantId, runId, recordType: 'case', stableKey: 'e'.repeat(64),
      evidence: caseEvidence(person), environment,
    }));
  }
  assert.doesNotThrow(() => sealGrhPersonasReviewEvidence({
    tenantId, runId, recordType: 'case', stableKey: 'f'.repeat(64),
    evidence: caseEvidence({ documents: { cuil: '20999999999', dni: '999999' } }), environment,
  }));
});

test('cryptographic keys are strict canonical base64url values of 32 bytes', () => {
  for (const badKey of ['', 'abc', `${environment.GRH_PERSONAS_REVIEW_HMAC_KEY_V1}=`, Buffer.alloc(31).toString('base64url')]) {
    assert.throws(() => createGrhPersonasReviewSourceRef({
      tenantId, sourceSystem: 'GRH', sourceId: 'GRH-TEST-001',
      environment: { ...environment, GRH_PERSONAS_REVIEW_HMAC_KEY_V1: badKey },
    }), error => error.code === 'GRH_PERSONAS_REVIEW_KEY_INVALID');
  }
});
