import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_SOURCE = await readFile(
  path.join(ROOT, 'js', 'grh-absence-insights-data.js'),
  'utf8',
);
const PROJECTION = JSON.parse(await readFile(
  path.join(ROOT, 'api', '_data', 'grh-absence-insights.json'),
  'utf8',
));
const SCHEMA_VERSION = 'grh-absence-insights-v1';

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
  vm.runInContext(CLIENT_SOURCE, context, { filename: 'js/grh-absence-insights-data.js' });
  return window.MuniGrhAbsenceInsights;
}

function assertTypedError(error, code, status) {
  assert.equal(error?.name, 'AbsenceInsightsDataError');
  assert.equal(error?.code, code);
  assert.equal(error?.status, status);
  assert.equal(typeof error?.message, 'string');
  assert.ok(error.message.length > 0 && error.message.length < 180);
  assert.equal('payload' in error, false);
  assert.equal('details' in error, false);
  assert.equal('cause' in error, false);
  return true;
}

test('client loads the fixed authenticated endpoint once and freezes the full contract', async () => {
  const calls = [];
  const client = loadClient(async (url, init) => {
    calls.push({ url, init });
    return response(PROJECTION);
  });
  const result = await client.load({ timeoutMs: 1000 });
  assert.equal(result.schemaVersion, SCHEMA_VERSION);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.categories[0].current), true);
  assert.equal(calls.length, 1);
  assert.deepEqual({
    url: calls[0].url,
    method: calls[0].init.method,
    cache: calls[0].init.cache,
    redirect: calls[0].init.redirect,
    accept: calls[0].init.headers.Accept,
  }, {
    url: '/api/grh-absence-insights',
    method: 'GET',
    cache: 'no-store',
    redirect: 'error',
    accept: 'application/json',
  });
});

test('client rejects exact-shape, privacy, source and reconciliation drift', async t => {
  const cases = [
    ['extra person field', value => { value.person = { name: 'Dato privado' }; }],
    ['source drift', value => { value.source.sourceSha256 = 'bad'; }],
    ['PII enabled', value => { value.privacy.containsPii = true; }],
    ['raw rows enabled', value => { value.privacy.rawRowsExported = true; }],
    ['shifted period', value => { value.periods.current.startDate = '2023-12-10'; }],
    ['false delta', value => { value.comparison.deltas.events = 0; }],
    ['small cell released', value => { value.categories[0].current.people = 9; }],
    ['false category coverage', value => { value.categories[0].current.events += 1; }],
    ['false bucket coverage', value => { value.protectedBucket.current.events -= 1; }],
    ['unknown limit', value => { value.limits[0].code = 'live_data'; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const payload = clone(PROJECTION);
      mutate(payload);
      await assert.rejects(
        loadClient(async () => response(payload)).load(),
        error => assertTypedError(error, 'ABSENCE_INSIGHTS_CONTRACT_INVALID', 502),
      );
    });
  }
});

test('contract mismatch and HTTP failures do not parse or retry bodies', async t => {
  await t.test('contract mismatch', async () => {
    let reads = 0;
    await assert.rejects(
      loadClient(async () => response(PROJECTION, {
        contract: 'grh-absence-insights-v0',
        json: async () => { reads += 1; return clone(PROJECTION); },
      })).load(),
      error => assertTypedError(error, 'ABSENCE_INSIGHTS_CONTRACT_MISMATCH', 502),
    );
    assert.equal(reads, 0);
  });

  await t.test('503', async () => {
    let calls = 0;
    let reads = 0;
    await assert.rejects(
      loadClient(async () => {
        calls += 1;
        return response(null, {
          status: 503,
          json: async () => { reads += 1; return { person: 'private' }; },
        });
      }).load(),
      error => assertTypedError(error, 'ABSENCE_INSIGHTS_HTTP_ERROR', 503),
    );
    assert.equal(calls, 1);
    assert.equal(reads, 0);
  });
});

test('timeout, caller abort and missing auth return typed detail-free errors', async t => {
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
      error => assertTypedError(error, 'ABSENCE_INSIGHTS_TIMEOUT', 408),
    );
  });
  await t.test('caller abort', async () => {
    const controller = new AbortController();
    const pending = loadClient(abortableFetch).load({ timeoutMs: 1000, signal: controller.signal });
    controller.abort('private reason');
    await assert.rejects(
      pending,
      error => assertTypedError(error, 'ABSENCE_INSIGHTS_ABORTED', 0),
    );
  });
  await t.test('missing auth', async () => {
    await assert.rejects(
      loadClient(undefined, { auth: false }).load(),
      error => assertTypedError(error, 'ABSENCE_INSIGHTS_CLIENT_UNAVAILABLE', 0),
    );
  });
});

test('client contains no DOM, storage, raw artifact fallback or retry path', () => {
  assert.doesNotMatch(CLIENT_SOURCE, /\b(?:localStorage|sessionStorage|document|innerHTML)\b/);
  assert.doesNotMatch(CLIENT_SOURCE, /grh-semantic|grh-profile|personas_junin|\/api\/grh-directory/i);
  assert.doesNotMatch(CLIENT_SOURCE, /\b(?:retry|backoff|setInterval)\b/i);
  assert.equal((CLIENT_SOURCE.match(/\/api\/grh-absence-insights/g) || []).length, 1);
});
