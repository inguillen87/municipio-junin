import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_SOURCE = await readFile(path.join(ROOT, 'js', 'grh-payroll-run-control-data.js'), 'utf8');
const PROJECTION = JSON.parse(await readFile(
  path.join(ROOT, 'api', '_data', 'grh-payroll-run-control.json'),
  'utf8',
));
const SCHEMA_VERSION = 'grh-payroll-run-control-v1';

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
    filename: 'js/grh-payroll-run-control-data.js',
  });
  return window.MuniGrhPayrollRunControl;
}

test('client loads only the authenticated run-control endpoint and freezes the contract', async () => {
  const calls = [];
  const client = loadClient(async (url, init) => {
    calls.push({ url, init });
    return response(PROJECTION);
  });
  const result = await client.load({ timeoutMs: 1000 });
  assert.equal(result.schemaVersion, SCHEMA_VERSION);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.monthly[0]), true);
  assert.equal(Object.isFrozen(result.quarantine.reasonOccurrences), true);
  assert.deepEqual({
    url: calls[0].url,
    method: calls[0].init.method,
    cache: calls[0].init.cache,
    redirect: calls[0].init.redirect,
    accept: calls[0].init.headers.Accept,
  }, {
    url: '/api/grh-payroll-run-control',
    method: 'GET',
    cache: 'no-store',
    redirect: 'error',
    accept: 'application/json',
  });
});

test('client rejects broken totals, quarantine drift and missing authenticated transport', async () => {
  const brokenTotal = clone(PROJECTION);
  brokenTotal.monthly[0].runHeaders += 1;
  await assert.rejects(
    () => loadClient(async () => response(brokenTotal)).load(),
    error => error?.name === 'PayrollRunControlDataError' &&
      error?.code === 'PAYROLL_RUN_CONTROL_CONTRACT_INVALID' && error?.status === 502,
  );

  const hiddenQuarantine = clone(PROJECTION);
  hiddenQuarantine.quarantine.status = 'clear';
  await assert.rejects(
    () => loadClient(async () => response(hiddenQuarantine)).load(),
    error => error?.code === 'PAYROLL_RUN_CONTROL_CONTRACT_INVALID' && error?.status === 502,
  );

  await assert.rejects(
    () => loadClient(async () => response(PROJECTION), { auth: false }).load(),
    error => error?.code === 'PAYROLL_RUN_CONTROL_CLIENT_UNAVAILABLE' && error?.status === 0,
  );
});

test('client rejects contract-header drift and invalid options', async () => {
  await assert.rejects(
    () => loadClient(async () => response(PROJECTION, { contract: 'future-v2' })).load(),
    error => error?.code === 'PAYROLL_RUN_CONTROL_CONTRACT_MISMATCH' && error?.status === 502,
  );
  await assert.rejects(
    () => loadClient(async () => response(PROJECTION)).load({ timeoutMs: 0 }),
    error => error?.code === 'PAYROLL_RUN_CONTROL_OPTIONS_INVALID',
  );
});
