import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import {
  buildGrhAdministrationComparisonProjection,
} from '../api/lib/grh-administration-comparison-projection.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_SOURCE = await readFile(
  path.join(ROOT, 'js', 'grh-administration-comparison-data.js'),
  'utf8',
);
const SCHEMA_VERSION = 'grh-administration-comparison-v1';

function aggregate() {
  return {
    source: {
      schemaVersion: 'grh-directory-v3', canonicalSystem: 'GRH Junín',
      sourceSha256: 'a'.repeat(64), contentSha256: 'b'.repeat(64),
      snapshotAsOf: '2026-08-06', recordCount: 2449, absenceEventCount: 31553,
    },
    identity: {
      materializedPeople: 2449, uniquePeople: 2449, employmentPeople: 2449,
      digestedPeople: 2449, materializedAbsenceEvents: 31553,
    },
    current: {
      eventRows: 5936, distinctPeople: 752, reportedDays: 65847,
      knownEventRows: 5936, missingEventRows: 0,
      reportedIngressDates: 281, reportedExitDates: 232,
    },
    prior: {
      eventRows: 3395, distinctPeople: 662, reportedDays: 52190,
      knownEventRows: 3395, missingEventRows: 0,
      reportedIngressDates: 216, reportedExitDates: 173,
    },
  };
}

const PROJECTION = buildGrhAdministrationComparisonProjection(aggregate(), { audience: 'private' });

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function response(payload, {
  status = 200,
  contentType = 'application/json; charset=utf-8',
  contract = SCHEMA_VERSION,
  json = async () => clone(payload),
} = {}) {
  const headers = new Map([
    ['content-type', contentType],
    ['x-municontrol-contract', contract],
  ]);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: name => headers.get(String(name).toLowerCase()) ?? null },
    json,
  };
}

function loadClient(fetchImpl, { auth = true } = {}) {
  const window = { AbortController, clearTimeout, setTimeout };
  if (auth) window.MuniAuth = Object.freeze({ fetch: fetchImpl });
  const context = vm.createContext({ window });
  vm.runInContext(CLIENT_SOURCE, context, {
    filename: 'js/grh-administration-comparison-data.js',
  });
  return window.MuniGrhAdministrationComparison;
}

function assertTypedError(error, code, status) {
  assert.equal(error?.name, 'AdministrationComparisonDataError');
  assert.equal(error?.code, code);
  assert.equal(error?.status, status);
  assert.equal(typeof error?.message, 'string');
  assert.ok(error.message.length > 0 && error.message.length < 180);
  assert.equal('payload' in error, false);
  assert.equal('details' in error, false);
  assert.equal('cause' in error, false);
  return true;
}

test('client fetches the fixed authenticated no-store endpoint once and deep-freezes its contract', async () => {
  const calls = [];
  const client = loadClient(async (url, init) => {
    calls.push({ url, init });
    return response(PROJECTION);
  });
  assert.deepEqual(Object.keys(client), ['load']);
  assert.equal(Object.isFrozen(client), true);
  const result = await client.load({ timeoutMs: 1000 });
  assert.equal(result.schemaVersion, SCHEMA_VERSION);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.comparison.absence.eventRows.values), true);
  assert.equal(calls.length, 1);
  assert.deepEqual({
    url: calls[0].url,
    method: calls[0].init.method,
    cache: calls[0].init.cache,
    redirect: calls[0].init.redirect,
    accept: calls[0].init.headers.Accept,
    hasBody: 'body' in calls[0].init,
  }, {
    url: '/api/grh-administration-comparison',
    method: 'GET',
    cache: 'no-store',
    redirect: 'error',
    accept: 'application/json',
    hasBody: false,
  });
  assert.equal(calls[0].init.signal instanceof AbortSignal, true);
});

test('client accepts governed portable protection and rejects a released small difference', async () => {
  const input = aggregate();
  input.current.reportedIngressDates = 19;
  input.prior.reportedIngressDates = 10;
  const protectedProjection = buildGrhAdministrationComparisonProjection(input, { audience: 'portable' });
  const result = await loadClient(async () => response(protectedProjection)).load();
  assert.deepEqual(result.comparison.reportedIngressDates.values,
    { current: null, prior: null, difference: null });

  const leaked = clone(PROJECTION);
  leaked.privacy.audience = 'portable';
  leaked.comparison.reportedIngressDates.values = { current: 19, prior: 10, difference: 9 };
  await assert.rejects(
    loadClient(async () => response(leaked)).load(),
    error => assertTypedError(error, 'ADMINISTRATION_COMPARISON_CONTRACT_INVALID', 502),
  );
});

test('client rejects exact-shape, identity and unsafe privacy drift', async t => {
  const cases = [
    ['extra PII-shaped field', value => { value.comparison.employeeName = 'Dato privado'; }],
    ['weakened threshold', value => { value.privacy.threshold = 1; }],
    ['PII enabled', value => { value.privacy.containsPii = true; }],
    ['identifier export enabled', value => { value.privacy.personIdentifiersExported = true; }],
    ['raw rows enabled', value => { value.privacy.rawRowsExported = true; }],
    ['cause labels enabled', value => { value.privacy.causeLabelsExported = true; }],
    ['shifted period', value => { value.periods.current.startDate = '2023-12-10'; }],
    ['invented rate', value => { value.comparison.absence.eventRows.rate = 1.5; }],
    ['bad difference', value => { value.comparison.absence.eventRows.values.difference = 1; }],
    ['bad coverage', value => { value.comparison.absence.dayCoverage.missingEventRows.values.current = 1; }],
    ['unknown limit', value => { value.limits[0].code = 'live_certified'; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const payload = clone(PROJECTION);
      mutate(payload);
      await assert.rejects(
        loadClient(async () => response(payload)).load(),
        error => assertTypedError(error, 'ADMINISTRATION_COMPARISON_CONTRACT_INVALID', 502),
      );
    });
  }
});

test('contract header, HTTP errors and invalid JSON fail closed without parsing sensitive bodies or retrying', async t => {
  await t.test('contract mismatch precedes JSON', async () => {
    let reads = 0;
    const client = loadClient(async () => response(PROJECTION, {
      contract: 'grh-administration-comparison-v0',
      json: async () => { reads += 1; return clone(PROJECTION); },
    }));
    await assert.rejects(client.load(), error =>
      assertTypedError(error, 'ADMINISTRATION_COMPARISON_CONTRACT_MISMATCH', 502));
    assert.equal(reads, 0);
  });

  await t.test('503 is not retried or parsed', async () => {
    let calls = 0;
    let reads = 0;
    const client = loadClient(async () => {
      calls += 1;
      return response(null, {
        status: 503,
        json: async () => { reads += 1; return { person: 'dato privado' }; },
      });
    });
    await assert.rejects(client.load(), error =>
      assertTypedError(error, 'ADMINISTRATION_COMPARISON_HTTP_ERROR', 503));
    assert.equal(calls, 1);
    assert.equal(reads, 0);
  });

  await t.test('invalid JSON', async () => {
    const client = loadClient(async () => response(null, {
      json: async () => { throw new SyntaxError('private body'); },
    }));
    await assert.rejects(client.load(), error =>
      assertTypedError(error, 'ADMINISTRATION_COMPARISON_RESPONSE_INVALID_JSON', 502));
  });
});

test('timeout, caller abort and missing auth expose only typed detail-free errors', async t => {
  function abortableFetch(_url, init) {
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener(
        'abort',
        () => reject(new DOMException('private reason', 'AbortError')),
        { once: true },
      );
    });
  }
  await t.test('timeout', async () => {
    await assert.rejects(
      loadClient(abortableFetch).load({ timeoutMs: 5 }),
      error => assertTypedError(error, 'ADMINISTRATION_COMPARISON_TIMEOUT', 408),
    );
  });
  await t.test('caller abort', async () => {
    const controller = new AbortController();
    const pending = loadClient(abortableFetch).load({ timeoutMs: 1000, signal: controller.signal });
    controller.abort('sensitive reason');
    await assert.rejects(pending, error =>
      assertTypedError(error, 'ADMINISTRATION_COMPARISON_ABORTED', 0));
  });
  await t.test('missing auth client', async () => {
    await assert.rejects(loadClient(undefined, { auth: false }).load(), error =>
      assertTypedError(error, 'ADMINISTRATION_COMPARISON_CLIENT_UNAVAILABLE', 0));
  });
});

test('client has no storage, DOM, raw artifact, fallback or retry path', () => {
  assert.doesNotMatch(CLIENT_SOURCE, /\b(?:localStorage|sessionStorage|document|innerHTML)\b/);
  assert.doesNotMatch(CLIENT_SOURCE, /\/api\/(?:grh-data|grh-directory|grh-organization-analytics)|profile|semantic|personas_junin|\bdemo\b/i);
  assert.doesNotMatch(CLIENT_SOURCE, /\b(?:retry|backoff|setInterval)\b/i);
  assert.equal((CLIENT_SOURCE.match(/\/api\/grh-administration-comparison/g) || []).length, 1);
});
