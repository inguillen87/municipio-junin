import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_SOURCE = await readFile(path.join(ROOT, 'js', 'grh-fixed-concept-control-data.js'), 'utf8');
const PROJECTION = JSON.parse(await readFile(
  path.join(ROOT, 'api', '_data', 'grh-fixed-concept-control.json'),
  'utf8',
));
const SCHEMA_VERSION = 'grh-fixed-concept-control-v1';

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function response(payload, {
  status = 200,
  contentType = 'application/json; charset=utf-8',
  contract = SCHEMA_VERSION,
} = {}) {
  const headers = new Map([
    ['content-type', contentType],
    ['x-municontrol-contract', contract],
  ]);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: name => headers.get(String(name).toLowerCase()) ?? null },
    json: async () => clone(payload),
  };
}
function loadClient(fetchImpl, { auth = true } = {}) {
  const window = { AbortController, clearTimeout, setTimeout };
  if (auth) window.MuniAuth = Object.freeze({ fetch: fetchImpl });
  vm.runInContext(CLIENT_SOURCE, vm.createContext({ window }), {
    filename: 'js/grh-fixed-concept-control-data.js',
  });
  return window.MuniGrhFixedConceptControl;
}

test('client loads only the authenticated fixed-concept endpoint and freezes the contract', async () => {
  const calls = [];
  const client = loadClient(async (url, init) => {
    calls.push({ url, init });
    return response(PROJECTION);
  });
  const result = await client.load({ timeoutMs: 1000 });
  assert.equal(result.schemaVersion, SCHEMA_VERSION);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.reconciliation.states[0]), true);
  assert.equal(Object.isFrozen(result.snapshot.categories.rows), true);
  assert.deepEqual({
    url: calls[0].url,
    method: calls[0].init.method,
    cache: calls[0].init.cache,
    redirect: calls[0].init.redirect,
    accept: calls[0].init.headers.Accept,
  }, {
    url: '/api/grh-fixed-concept-control',
    method: 'GET',
    cache: 'no-store',
    redirect: 'error',
    accept: 'application/json',
  });
});

test('client rejects forged reconciliation, privacy drift and missing authenticated transport', async () => {
  const forged = clone(PROJECTION);
  forged.reconciliation.states[0].rows += 1;
  await assert.rejects(
    () => loadClient(async () => response(forged)).load(),
    error => error?.name === 'FixedConceptControlDataError' &&
      error?.code === 'FIXED_CONCEPT_CONTROL_CONTRACT_INVALID' && error?.status === 502,
  );
  const privacy = clone(PROJECTION);
  privacy.privacy.personIdentifiersExported = true;
  await assert.rejects(
    () => loadClient(async () => response(privacy)).load(),
    error => error?.code === 'FIXED_CONCEPT_CONTROL_CONTRACT_INVALID' && error?.status === 502,
  );
  await assert.rejects(
    () => loadClient(async () => response(PROJECTION), { auth: false }).load(),
    error => error?.code === 'FIXED_CONCEPT_CONTROL_CLIENT_UNAVAILABLE' && error?.status === 0,
  );
});

test('client rejects header drift, malformed comparisons and invalid options', async () => {
  await assert.rejects(
    () => loadClient(async () => response(PROJECTION, { contract: 'future-v2' })).load(),
    error => error?.code === 'FIXED_CONCEPT_CONTROL_CONTRACT_MISMATCH' && error?.status === 502,
  );
  const malformed = clone(PROJECTION);
  malformed.administrationComparison.current = null;
  await assert.rejects(
    () => loadClient(async () => response(malformed)).load(),
    error => error?.code === 'FIXED_CONCEPT_CONTROL_CONTRACT_INVALID' && error?.status === 502,
  );
  await assert.rejects(
    () => loadClient(async () => response(PROJECTION)).load({ timeoutMs: 0 }),
    error => error?.code === 'FIXED_CONCEPT_CONTROL_OPTIONS_INVALID',
  );
});
