import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { buildGrhEmploymentReviewAggregateProjection } from '../api/lib/grh-employment-review-projection.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_SOURCE = await readFile(path.join(ROOT, 'js', 'grh-employment-review-data.js'), 'utf8');
const SCHEMA_VERSION = 'grh-employment-review-v2';

function aggregate() {
  return {
    source: {
      schemaVersion: 'grh-directory-v3',
      canonicalSystem: 'GRH Junin',
      sourceSha256: 'a'.repeat(64),
      snapshotAsOf: '2026-08-06',
    },
    referencePeriod: '2026-07',
    referencePeriodCount: 1,
    totalDirectoryPeople: 2449,
    materializedPeople: 2449,
    employmentPeople: 2449,
    counts: {
      reported_current_people: 867,
      reported_ended_people: 1560,
      uncertain_people: 22,
      reference_payroll_participants: 856,
      reported_current_with_reference_payroll: 848,
      reported_current_without_reference_payroll: 19,
      reported_ended_with_reference_payroll: 7,
      uncertain_status_with_reference_payroll: 1,
    },
  };
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function response(payload, { contract = SCHEMA_VERSION, status = 200 } = {}) {
  const headers = new Map([
    ['content-type', 'application/json; charset=utf-8'],
    ['x-municontrol-contract', contract],
  ]);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: name => headers.get(String(name).toLowerCase()) ?? null },
    json: async () => clone(payload),
  };
}

function loadClient(fetchImpl) {
  const window = { AbortController, clearTimeout, setTimeout };
  if (fetchImpl) window.MuniAuth = Object.freeze({ fetch: fetchImpl });
  vm.runInContext(CLIENT_SOURCE, vm.createContext({ window }), {
    filename: 'js/grh-employment-review-data.js',
  });
  return window.MuniGrhEmploymentReview;
}

test('employment review client accepts and freezes the exact private v2 bridge', async () => {
  const projection = buildGrhEmploymentReviewAggregateProjection(aggregate(), { audience: 'private' });
  const calls = [];
  const client = loadClient(async (url, init) => {
    calls.push({ url, init });
    return response(projection);
  });
  const result = await client.load({ timeoutMs: 1000 });
  assert.equal(result.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual([
    result.totalDirectoryPeople,
    result.reportedCurrentPeople,
    result.reportedEndedPeople,
    result.uncertainPeople,
    result.referencePayrollParticipants,
    result.reportedCurrentWithReferencePayroll,
    result.currentWithoutPayroll,
    result.endedWithPayroll,
    result.uncertainWithPayroll,
    result.totalToReview,
  ], [2449, 867, 1560, 22, 856, 848, 19, 7, 1, 27]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.categories), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/grh-employment-review');
  assert.deepEqual({
    method: calls[0].init.method,
    cache: calls[0].init.cache,
    redirect: calls[0].init.redirect,
    accept: calls[0].init.headers.Accept,
  }, { method: 'GET', cache: 'no-store', redirect: 'error', accept: 'application/json' });
});

test('employment review client accepts only the protected 7 and 1 cells in portable v2', async () => {
  const projection = buildGrhEmploymentReviewAggregateProjection(aggregate(), { audience: 'portable' });
  const result = await loadClient(async () => response(projection)).load();
  assert.equal(result.reportedCurrentWithReferencePayroll, 848);
  assert.equal(result.currentWithoutPayroll, 19);
  assert.equal(result.endedWithPayroll, null);
  assert.equal(result.uncertainWithPayroll, null);
  assert.deepEqual(result.categories.map(row => row.count), [19, null, null]);
});

test('employment review client fails closed on contract, identity and privacy drift', async t => {
  const projection = buildGrhEmploymentReviewAggregateProjection(aggregate(), { audience: 'portable' });
  const cases = [
    ['extra field', value => { value.employeeName = 'Dato privado'; }],
    ['status identity', value => { value.reportedCurrentPeople = 866; }],
    ['payroll identity', value => { value.referencePayrollParticipants = 855; }],
    ['safe headline hidden', value => {
      value.reportedCurrentWithReferencePayroll = null;
      value.privacyStatus = 'partially_protected';
    }],
    ['small cell leak', value => {
      value.endedWithPayroll = 7;
      value.categories[1] = { ...value.categories[1], count: 7, display: '7', privacyStatus: 'released' };
    }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const payload = clone(projection);
      mutate(payload);
      await assert.rejects(
        loadClient(async () => response(payload)).load(),
        error => error?.code === 'EMPLOYMENT_REVIEW_CONTRACT_INVALID' && error?.status === 502,
      );
    });
  }
  await assert.rejects(
    loadClient(async () => response(projection, { contract: 'grh-employment-review-v1' })).load(),
    error => error?.code === 'EMPLOYMENT_REVIEW_CONTRACT_MISMATCH' && error?.status === 502,
  );
});

test('employment review client has no storage, DOM, raw artifact, fallback or retry path', async () => {
  await assert.rejects(
    loadClient().load(),
    error => error?.code === 'EMPLOYMENT_REVIEW_CLIENT_UNAVAILABLE',
  );
  assert.doesNotMatch(CLIENT_SOURCE, /\b(?:localStorage|sessionStorage|document|innerHTML)\b/);
  assert.doesNotMatch(CLIENT_SOURCE, /\/api\/(?:grh-data|grh-directory)|profile|semantic|personas_junin|\bdemo\b/i);
  assert.doesNotMatch(CLIENT_SOURCE, /\b(?:retry|backoff|setInterval)\b/i);
  assert.equal((CLIENT_SOURCE.match(/\/api\/grh-employment-review/g) || []).length, 1);
});
