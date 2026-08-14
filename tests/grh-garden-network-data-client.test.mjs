import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_SOURCE = await readFile(
  path.join(ROOT, 'js', 'grh-garden-network-data.js'),
  'utf8',
);
const PROJECTION = JSON.parse(await readFile(
  path.join(ROOT, 'api', '_data', 'grh-garden-network.json'),
  'utf8',
));
const SCHEMA_VERSION = 'grh-garden-network-v1';

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
  vm.runInContext(CLIENT_SOURCE, context, { filename: 'js/grh-garden-network-data.js' });
  return window.MuniGrhGardenNetwork;
}

function assertTypedError(error, code, status) {
  assert.equal(error?.name, 'GardenNetworkDataError');
  assert.equal(error?.code, code);
  assert.equal(error?.status, status);
  assert.equal(typeof error?.message, 'string');
  assert.ok(error.message.length > 0 && error.message.length < 180);
  assert.equal('payload' in error, false);
  assert.equal('details' in error, false);
  assert.equal('cause' in error, false);
  return true;
}

test('client loads the fixed authenticated endpoint once and freezes the contract', async () => {
  const calls = [];
  const client = loadClient(async (url, init) => {
    calls.push({ url, init });
    return response(PROJECTION);
  });
  const result = await client.load({ timeoutMs: 1000 });
  assert.equal(result.schemaVersion, SCHEMA_VERSION);
  assert.equal(result.summary.people, 107);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.releasedUnits[0]), true);
  assert.equal(calls.length, 1);
  assert.deepEqual({
    url: calls[0].url,
    method: calls[0].init.method,
    cache: calls[0].init.cache,
    redirect: calls[0].init.redirect,
    accept: calls[0].init.headers.Accept,
  }, {
    url: '/api/grh-garden-network',
    method: 'GET',
    cache: 'no-store',
    redirect: 'error',
    accept: 'application/json',
  });
});

test('client rejects exact-shape, privacy, provenance and reconciliation drift', async t => {
  const cases = [
    ['extra person', value => { value.person = { name: 'Dato privado' }; }],
    ['source drift', value => { value.source.sourceSha256 = 'bad'; }],
    ['PII enabled', value => { value.privacy.containsPii = true; }],
    ['source codes enabled', value => { value.privacy.sourceCodesExported = true; }],
    ['policy drift', value => { value.quality.assignmentPolicyVersion = 'unreviewed'; }],
    ['broken join', value => { value.quality.linkedEmploymentKeys -= 1; }],
    ['private assignment count', value => { value.summary.unassignedPeople = 11; }],
    ['false trend', value => { value.monthlyTrend[0].people -= 1; }],
    ['small released cell', value => { value.releasedUnits[0].people = 9; }],
    ['source unit code', value => { value.releasedUnits[0].unitCode = 10; }],
    ['false bucket', value => { value.protectedBucket.people -= 1; }],
    ['unknown map claim', value => { value.limits[6].code = 'map_available'; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const payload = clone(PROJECTION);
      mutate(payload);
      await assert.rejects(
        loadClient(async () => response(payload)).load(),
        error => assertTypedError(error, 'GARDEN_NETWORK_CONTRACT_INVALID', 502),
      );
    });
  }
});

test('contract mismatch and HTTP failures do not parse or retry bodies', async t => {
  await t.test('contract mismatch', async () => {
    let reads = 0;
    await assert.rejects(
      loadClient(async () => response(PROJECTION, {
        contract: 'grh-garden-network-v0',
        json: async () => { reads += 1; return clone(PROJECTION); },
      })).load(),
      error => assertTypedError(error, 'GARDEN_NETWORK_CONTRACT_MISMATCH', 502),
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
      error => assertTypedError(error, 'GARDEN_NETWORK_HTTP_ERROR', 503),
    );
    assert.equal(calls, 1);
    assert.equal(reads, 0);
  });
  await t.test('wrong content type', async () => {
    let reads = 0;
    await assert.rejects(
      loadClient(async () => response(PROJECTION, {
        contentType: 'text/html',
        json: async () => { reads += 1; return clone(PROJECTION); },
      })).load(),
      error => assertTypedError(error, 'GARDEN_NETWORK_CONTRACT_INVALID', 502),
    );
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
      error => assertTypedError(error, 'GARDEN_NETWORK_TIMEOUT', 408),
    );
  });
  await t.test('caller abort', async () => {
    const controller = new AbortController();
    const pending = loadClient(abortableFetch).load({ timeoutMs: 1000, signal: controller.signal });
    controller.abort('private reason');
    await assert.rejects(
      pending,
      error => assertTypedError(error, 'GARDEN_NETWORK_ABORTED', 0),
    );
  });
  await t.test('missing auth', async () => {
    await assert.rejects(
      loadClient(undefined, { auth: false }).load(),
      error => assertTypedError(error, 'GARDEN_NETWORK_CLIENT_UNAVAILABLE', 0),
    );
  });
});

test('client contains no DOM, storage, private fallback or retry path', () => {
  assert.doesNotMatch(CLIENT_SOURCE, /\b(?:localStorage|sessionStorage|document|innerHTML)\b/);
  assert.doesNotMatch(CLIENT_SOURCE, /grh-semantic|grh-profile|personas_junin|\/api\/grh-directory/i);
  assert.doesNotMatch(CLIENT_SOURCE, /\b(?:retry|backoff|setInterval)\b/i);
  assert.equal((CLIENT_SOURCE.match(/\/api\/grh-garden-network/g) || []).length, 1);
});
