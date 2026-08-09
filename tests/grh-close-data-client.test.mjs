import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { buildGrhCloseProjection } from '../api/lib/grh-close-projection.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_SOURCE = await readFile(path.join(ROOT, 'js', 'grh-close-data.js'), 'utf8');
const SEMANTIC = await readFile(
  new URL('../api/_data/grh-semantic.json', import.meta.url),
  'utf8',
).then(JSON.parse);
const PROJECTION = buildGrhCloseProjection(SEMANTIC);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function response(payload, {
  status = 200,
  contentType = 'application/json; charset=utf-8',
  json = async () => clone(payload),
} = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-type' ? contentType : null;
      },
    },
    json,
  };
}

function loadClient(fetchImpl, { auth = true } = {}) {
  const window = { AbortController, clearTimeout, setTimeout };
  if (auth) window.MuniAuth = Object.freeze({ fetch: fetchImpl });
  const context = vm.createContext({ window });
  vm.runInContext(CLIENT_SOURCE, context, { filename: 'js/grh-close-data.js' });
  return window.MuniGrhClose;
}

function assertTypedError(error, code, status) {
  assert.equal(error?.name, 'CloseDataError');
  assert.equal(error?.code, code);
  assert.equal(error?.status, status);
  assert.equal(typeof error?.message, 'string');
  assert.ok(error.message.length > 0 && error.message.length < 160);
  assert.equal('payload' in error, false);
  assert.equal('details' in error, false);
  assert.equal('cause' in error, false);
  return true;
}

test('the close client fetches only the fixed endpoint and freezes the real governed projection', async () => {
  const calls = [];
  const api = loadClient(async (url, init) => {
    calls.push({ url, init });
    return response(PROJECTION);
  });

  assert.deepEqual(Object.keys(api), ['load']);
  assert.equal(Object.isFrozen(api), true);
  const close = await api.load({ timeoutMs: 1000 });
  assert.equal(close.schemaVersion, 'grh-close-v1');
  assert.equal(Object.isFrozen(close), true);
  assert.equal(Object.isFrozen(close.series), true);
  assert.equal(Object.isFrozen(close.series.at(-1).components), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/grh-close');
  assert.deepEqual({
    method: calls[0].init.method,
    cache: calls[0].init.cache,
    redirect: calls[0].init.redirect,
    accept: calls[0].init.headers.Accept,
    hasBody: 'body' in calls[0].init,
  }, {
    method: 'GET',
    cache: 'no-store',
    redirect: 'error',
    accept: 'application/json',
    hasBody: false,
  });
  assert.equal(calls[0].init.signal instanceof AbortSignal, true);
});

test('the close client rejects schema drift, PII-shaped extras and weakened small-cell protection', async t => {
  const cases = [
    ['schema downgrade', value => { value.schemaVersion = 'grh-close-v0'; }],
    ['unknown identity field', value => { value.series.at(-1).employeeName = 'Dato prohibido'; }],
    ['small cell released', value => {
      const row = value.series.find(item => item.privacyStatus === 'released');
      row.participantCount = 1;
      row.participantDisplay = '1';
    }],
    ['currency inferred', value => { value.metric.currency = 'ARS'; }],
    ['monthly reconciliation forged', value => { value.series.at(-1).reconciliation.valueAgreementPct = 100; }],
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const payload = clone(PROJECTION);
      mutate(payload);
      const api = loadClient(async () => response(payload));
      await assert.rejects(api.load(), error =>
        assertTypedError(error, 'CLOSE_CONTRACT_INVALID', 502));
    });
  }
});

test('HTTP failures never parse or disclose the response payload', async () => {
  let reads = 0;
  const secret = 'persona-identificable@example.invalid';
  const api = loadClient(async () => response(null, {
    status: 403,
    json: async () => {
      reads += 1;
      return { error: secret };
    },
  }));
  await assert.rejects(api.load(), error => {
    assertTypedError(error, 'CLOSE_HTTP_ERROR', 403);
    assert.doesNotMatch(error.message, new RegExp(secret, 'i'));
    return true;
  });
  assert.equal(reads, 0);
});

test('media type, invalid JSON, timeout and caller abort all fail closed', async t => {
  await t.test('HTML response', async () => {
    const api = loadClient(async () => response(PROJECTION, { contentType: 'text/html' }));
    await assert.rejects(api.load(), error =>
      assertTypedError(error, 'CLOSE_RESPONSE_NOT_JSON', 502));
  });
  await t.test('invalid JSON', async () => {
    const api = loadClient(async () => response(null, {
      json: async () => { throw new SyntaxError('raw response'); },
    }));
    await assert.rejects(api.load(), error =>
      assertTypedError(error, 'CLOSE_RESPONSE_INVALID_JSON', 502));
  });
  function abortableFetch(_url, init) {
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('private', 'AbortError')), {
        once: true,
      });
    });
  }
  await t.test('timeout', async () => {
    const api = loadClient(abortableFetch);
    await assert.rejects(api.load({ timeoutMs: 5 }), error =>
      assertTypedError(error, 'CLOSE_REQUEST_TIMEOUT', 408));
  });
  await t.test('caller abort', async () => {
    const api = loadClient(abortableFetch);
    const controller = new AbortController();
    const pending = api.load({ timeoutMs: 1000, signal: controller.signal });
    controller.abort('sensitive reason');
    await assert.rejects(pending, error =>
      assertTypedError(error, 'CLOSE_REQUEST_ABORTED', 0));
  });
});

test('the close client has no storage, DOM, raw artifact or fallback data path', async () => {
  const api = loadClient(undefined, { auth: false });
  await assert.rejects(api.load(), error =>
    assertTypedError(error, 'CLOSE_CLIENT_UNAVAILABLE', 0));
  assert.doesNotMatch(CLIENT_SOURCE, /\b(?:localStorage|sessionStorage|innerHTML)\b/);
  assert.doesNotMatch(CLIENT_SOURCE, /\/api\/grh-data|profile|semantic|personas_junin|\bdemo\b/i);
  assert.equal((CLIENT_SOURCE.match(/\/api\/grh-close/g) || []).length, 1);
});
