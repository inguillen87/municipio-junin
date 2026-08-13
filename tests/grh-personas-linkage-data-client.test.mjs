import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE = await readFile(path.join(ROOT, 'js', 'grh-personas-linkage-data.js'), 'utf8');
const ARTIFACT = JSON.parse(await readFile(path.join(ROOT, 'api', '_data', 'grh-personas-linkage-readiness.json'), 'utf8'));
const SCHEMA = 'grh-personas-linkage-readiness-v1';
const clone = value => JSON.parse(JSON.stringify(value));

function response(payload, { status = 200, contract = SCHEMA, contentType = 'application/json; charset=utf-8', json } = {}) {
  const headers = new Map([['x-municontrol-contract', contract], ['content-type', contentType]]);
  return { status, ok: status >= 200 && status < 300, headers: { get: key => headers.get(String(key).toLowerCase()) }, json: json || (async () => clone(payload)) };
}

function loadClient(fetchImpl, authenticated = true) {
  const window = { AbortController, setTimeout, clearTimeout };
  if (authenticated) window.MuniAuth = Object.freeze({ fetch: fetchImpl });
  vm.runInContext(SOURCE, vm.createContext({ window }), { filename: 'grh-personas-linkage-data.js' });
  return window.MuniGrhPersonasLinkageReadiness;
}

test('client makes one authenticated no-store request and freezes the exact artifact', async () => {
  const calls = [];
  const client = loadClient(async (url, init) => { calls.push({ url, init }); return response(ARTIFACT); });
  assert.equal(client.validate(ARTIFACT), true);
  const result = await client.load({ timeoutMs: 1000 });
  assert.equal(result.reconciliation.candidates, 1699);
  assert.equal(Object.isFrozen(result.algorithm.tiers[0]), true);
  assert.equal(calls.length, 1);
  assert.deepEqual({ url: calls[0].url, method: calls[0].init.method, cache: calls[0].init.cache, redirect: calls[0].init.redirect }, {
    url: '/api/grh-personas-linkage-readiness', method: 'GET', cache: 'no-store', redirect: 'error',
  });
});

test('client rejects privacy, reconciliation and source drift', async () => {
  for (const mutate of [
    value => { value.fullName = 'private'; },
    value => { value.reconciliation.candidates = 1700; },
    value => { value.reconciliation.ambiguousBreakdown.promotedFromNameOnly = 1; },
    value => { value.idPersonaControl.joinAllowed = true; },
    value => { value.privacy.containsPii = true; },
    value => { value.source.personas.sourceSha256 = 'bad'; },
  ]) {
    const changed = clone(ARTIFACT); mutate(changed);
    assert.equal(loadClient(async () => response(changed)).validate(changed), false);
    await assert.rejects(loadClient(async () => response(changed)).load(), error => error?.code === 'GRH_PERSONAS_LINKAGE_CONTRACT_INVALID' && !('payload' in error));
  }
});

test('client does not parse failed bodies and has no retry, storage, DOM or raw fallback', async () => {
  let reads = 0;
  await assert.rejects(loadClient(async () => response(null, {
    status: 503,
    json: async () => { reads += 1; return { fullName: 'private' }; },
  })).load(), error => error?.code === 'GRH_PERSONAS_LINKAGE_HTTP_ERROR');
  assert.equal(reads, 0);
  await assert.rejects(loadClient(async () => response(ARTIFACT, { contract: 'old' })).load(), error => error?.code === 'GRH_PERSONAS_LINKAGE_CONTRACT_MISMATCH');
  await assert.rejects(loadClient(undefined, false).load(), error => error?.code === 'GRH_PERSONAS_LINKAGE_CLIENT_UNAVAILABLE');
  assert.doesNotMatch(SOURCE, /\b(?:localStorage|sessionStorage|document|innerHTML|retry|backoff|setInterval)\b/i);
  assert.equal((SOURCE.match(/\/api\/grh-personas-linkage-readiness/g) || []).length, 1);
});
