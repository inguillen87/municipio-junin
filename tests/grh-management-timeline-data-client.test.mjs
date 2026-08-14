import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const CLIENT_SOURCE = await readFile(
  new URL('../js/grh-management-timeline-data.js', import.meta.url),
  'utf8',
);
const ARTIFACT = JSON.parse(await readFile(
  new URL('../api/_data/grh-management-timeline.json', import.meta.url),
  'utf8',
));
const SCHEMA_VERSION = 'grh-management-timeline-v1';

function clone(value) {
  return structuredClone(value);
}

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
    filename: 'js/grh-management-timeline-data.js',
  });
  return window.MuniGrhManagementTimeline;
}

function assertTypedError(error, code, status) {
  assert.equal(error?.name, 'ManagementTimelineDataError');
  assert.equal(error?.code, code);
  assert.equal(error?.status, status);
  assert.equal(typeof error?.message, 'string');
  assert.ok(error.message.length > 0 && error.message.length < 180);
  assert.equal('payload' in error, false);
  assert.equal('details' in error, false);
  assert.equal('cause' in error, false);
  return true;
}

test('client fetches the authenticated endpoint once and deep-freezes the real contract', async () => {
  const calls = [];
  const client = loadClient(async (url, init) => {
    calls.push({ url, init });
    return response(ARTIFACT);
  });
  assert.deepEqual(Object.keys(client), ['load']);
  assert.equal(Object.isFrozen(client), true);
  const result = await client.load({ timeoutMs: 1000 });
  assert.equal(result.schemaVersion, SCHEMA_VERSION);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(
    result.managementYears[2].domains.reportedIngressDates.current.values,
  ), true);
  assert.equal(calls.length, 1);
  assert.deepEqual({
    url: calls[0].url,
    method: calls[0].init.method,
    cache: calls[0].init.cache,
    redirect: calls[0].init.redirect,
    accept: calls[0].init.headers.Accept,
    hasBody: 'body' in calls[0].init,
  }, {
    url: '/api/grh-management-timeline',
    method: 'GET',
    cache: 'no-store',
    redirect: 'error',
    accept: 'application/json',
    hasBody: false,
  });
  assert.equal(calls[0].init.signal instanceof AbortSignal, true);
});

test('client accepts governed null protection and rejects any hidden-value disclosure', async () => {
  const result = await loadClient(async () => response(ARTIFACT)).load();
  assert.deepEqual(
    result.managementYears[2].domains.reportedIngressDates.current.values,
    { eventRows: null, distinctPersons: null },
  );

  const leaked = clone(ARTIFACT);
  leaked.managementYears[2].domains.reportedIngressDates.current.values.eventRows = 80;
  await assert.rejects(
    loadClient(async () => response(leaked)).load(),
    error => assertTypedError(error, 'MANAGEMENT_TIMELINE_CONTRACT_INVALID', 502),
  );
});

test('client rejects exact-shape, identity, privacy and semantic drift', async t => {
  const cases = [
    ['extra PII-shaped field', value => {
      value.comparison.domains.reportedAbsence.personName = 'Dato privado';
    }],
    ['wrong person key', value => { value.privacy.personKey = 'legajo'; }],
    ['weakened threshold', value => { value.privacy.threshold = 1; }],
    ['PII enabled', value => { value.privacy.containsPii = true; }],
    ['identifier export enabled', value => { value.privacy.personIdentifiersExported = true; }],
    ['raw rows enabled', value => { value.privacy.rawRowsExported = true; }],
    ['wrong corrected count', value => {
      value.comparison.domains.reportedAbsence.current.values.distinctPersons = 752;
    }],
    ['invented future zero', value => {
      const cell = value.managementYears[3].domains.reportedAbsence.current;
      cell.privacyStatus = 'released';
      cell.values = { eventRows: 0, distinctPersons: 0, reportedDays: 0 };
    }],
    ['removed garden limit', value => { value.limits.splice(9, 1); }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const payload = clone(ARTIFACT);
      mutate(payload);
      await assert.rejects(
        loadClient(async () => response(payload)).load(),
        error => assertTypedError(error, 'MANAGEMENT_TIMELINE_CONTRACT_INVALID', 502),
      );
    });
  }
});

test('contract header and HTTP failures precede JSON and are never retried', async t => {
  await t.test('contract mismatch', async () => {
    let reads = 0;
    const client = loadClient(async () => response(ARTIFACT, {
      contract: 'grh-management-timeline-v0',
      json: async () => { reads += 1; return clone(ARTIFACT); },
    }));
    await assert.rejects(
      client.load(),
      error => assertTypedError(error, 'MANAGEMENT_TIMELINE_CONTRACT_MISMATCH', 502),
    );
    assert.equal(reads, 0);
  });

  await t.test('503', async () => {
    let calls = 0;
    let reads = 0;
    const client = loadClient(async () => {
      calls += 1;
      return response(null, {
        status: 503,
        json: async () => { reads += 1; return { person: 'private' }; },
      });
    });
    await assert.rejects(
      client.load(),
      error => assertTypedError(error, 'MANAGEMENT_TIMELINE_HTTP_ERROR', 503),
    );
    assert.equal(calls, 1);
    assert.equal(reads, 0);
  });

  await t.test('invalid JSON', async () => {
    const client = loadClient(async () => response(null, {
      json: async () => { throw new SyntaxError('private body'); },
    }));
    await assert.rejects(
      client.load(),
      error => assertTypedError(error, 'MANAGEMENT_TIMELINE_RESPONSE_INVALID_JSON', 502),
    );
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
      error => assertTypedError(error, 'MANAGEMENT_TIMELINE_TIMEOUT', 408),
    );
  });
  await t.test('caller abort', async () => {
    const controller = new AbortController();
    const pending = loadClient(abortableFetch).load({
      timeoutMs: 1000,
      signal: controller.signal,
    });
    controller.abort('sensitive reason');
    await assert.rejects(
      pending,
      error => assertTypedError(error, 'MANAGEMENT_TIMELINE_ABORTED', 0),
    );
  });
  await t.test('missing auth', async () => {
    await assert.rejects(
      loadClient(undefined, { auth: false }).load(),
      error => assertTypedError(error, 'MANAGEMENT_TIMELINE_CLIENT_UNAVAILABLE', 0),
    );
  });
});

test('client has no storage, DOM, raw artifact, fallback or retry path', () => {
  assert.doesNotMatch(CLIENT_SOURCE, /\b(?:localStorage|sessionStorage|document|innerHTML)\b/);
  assert.doesNotMatch(
    CLIENT_SOURCE,
    /\/api\/(?:grh-data|grh-directory|grh-organization-analytics)|profile|semantic|personas_junin|\bdemo\b/i,
  );
  assert.doesNotMatch(CLIENT_SOURCE, /\b(?:retry|backoff|setInterval)\b/i);
  assert.equal((CLIENT_SOURCE.match(/\/api\/grh-management-timeline/g) || []).length, 1);
});
