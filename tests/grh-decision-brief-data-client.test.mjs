import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_SOURCE = await readFile(path.join(ROOT, 'js', 'grh-decision-brief-data.js'), 'utf8');
const SCHEMA_VERSION = 'grh-decision-brief-v1';

const PROJECTION = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  policyVersion: 'grh-small-cell-v1',
  source: Object.freeze({
    canonicalSystem: 'GRH Junin',
    sourceFile: 'grh_junin.snapshot_2026-08-06.sql.gz',
    sourceSha256: 'a'.repeat(64),
    snapshotAsOf: '2026-08-06',
    latestValidCalculationPeriod: '2026-07',
    realtime: false,
  }),
  privacy: Object.freeze({
    audience: 'interactive',
    threshold: 10,
    aggregateOnly: true,
    containsPii: false,
    employeeIdentifiersExported: false,
    rawRowsExported: false,
    categoricalLabelsExported: false,
    cellCodesExported: false,
    monetaryAmountsExported: false,
  }),
  period: '2026-07',
  status: 'attention_required',
  situation: Object.freeze({
    participantCount: 856,
    participantDisplay: '856',
    qualityScorePct: 88.99,
    temporalQuarantineRows: 20534,
    runCoveragePct: 100,
    metricExactRatePct: 40,
    valueAgreementPct: 6.5,
    identityWithinRoundingTolerance: true,
  }),
  change: Object.freeze({
    status: 'released',
    previousPeriod: '2026-06',
    participantDelta: 1,
    runCoverageDeltaPctPoints: 0,
    metricExactRateDeltaPctPoints: 0,
    valueAgreementDeltaPctPoints: 5.8,
  }),
  priorities: Object.freeze([
    Object.freeze({ code: 'cross_source_material_difference', severity: 'critical', href: 'hacienda.html', requiredCapability: 'navigation.hacienda' }),
    Object.freeze({ code: 'temporal_quarantine_present', severity: 'warning', href: 'control.html', requiredCapability: 'navigation.data-quality' }),
    Object.freeze({ code: 'historical_snapshot', severity: 'context', href: null, requiredCapability: null }),
  ]),
  limits: Object.freeze([
    'historical_snapshot_not_realtime',
    'calculation_control_not_bank_disbursement',
    'currency_not_declared_in_source',
    'arithmetic_decomposition_not_causal_explanation',
    'snapshot_reconciliation_not_monthly_series',
  ]),
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function response(payload, {
  status = 200,
  contentType = 'application/json; charset=utf-8',
  contract = SCHEMA_VERSION,
  json = async () => clone(payload),
  body,
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
    body,
  };
}

function loadClient(fetchImpl, { auth = true } = {}) {
  const window = { AbortController, clearTimeout, setTimeout };
  if (auth) window.MuniAuth = Object.freeze({ fetch: fetchImpl });
  const context = vm.createContext({ window });
  vm.runInContext(CLIENT_SOURCE, context, { filename: 'js/grh-decision-brief-data.js' });
  return window.MuniGrhDecisionBrief;
}

function assertTypedError(error, code, status) {
  assert.equal(error?.name, 'DecisionBriefDataError');
  assert.equal(error?.code, code);
  assert.equal(error?.status, status);
  assert.equal(typeof error?.message, 'string');
  assert.ok(error.message.length > 0 && error.message.length < 180);
  assert.equal('payload' in error, false);
  assert.equal('details' in error, false);
  assert.equal('cause' in error, false);
  return true;
}

test('decision brief client fetches the fixed no-store contract once and deep-freezes it', async () => {
  const calls = [];
  const api = loadClient(async (url, init) => {
    calls.push({ url, init });
    return response(PROJECTION);
  });

  assert.deepEqual(Object.keys(api), ['load']);
  assert.equal(Object.isFrozen(api), true);
  const brief = await api.load({ timeoutMs: 1000 });
  assert.equal(brief.schemaVersion, SCHEMA_VERSION);
  assert.equal(Object.isFrozen(brief), true);
  assert.equal(Object.isFrozen(brief.situation), true);
  assert.equal(Object.isFrozen(brief.priorities), true);
  assert.equal(Object.isFrozen(brief.priorities[0]), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/grh-decision-brief');
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

test('decision brief client accepts a protected monthly situation without inventing values', async () => {
  const payload = clone(PROJECTION);
  payload.status = 'review_recommended';
  Object.assign(payload.situation, {
    participantCount: null,
    participantDisplay: '<10',
    runCoveragePct: null,
    metricExactRatePct: null,
    valueAgreementPct: null,
    identityWithinRoundingTolerance: null,
  });
  Object.assign(payload.change, {
    status: 'privacy_protected',
    participantDelta: null,
    runCoverageDeltaPctPoints: null,
    metricExactRateDeltaPctPoints: null,
    valueAgreementDeltaPctPoints: null,
  });
  payload.priorities.shift();
  const brief = await loadClient(async () => response(payload)).load();
  assert.equal(brief.situation.participantCount, null);
  assert.equal(brief.situation.participantDisplay, '<10');
  assert.equal(brief.change.status, 'privacy_protected');
});

test('decision brief client keeps a global material-difference priority when monthly agreement reaches 100', async () => {
  const payload = clone(PROJECTION);
  payload.situation.valueAgreementPct = 100;
  const brief = await loadClient(async () => response(payload)).load();
  assert.equal(brief.situation.valueAgreementPct, 100);
  assert.equal(brief.status, 'attention_required');
  assert.equal(brief.priorities[0].code, 'cross_source_material_difference');
});

test('decision brief client accepts monthly disagreement without inventing a global material-difference priority', async () => {
  const payload = clone(PROJECTION);
  payload.status = 'review_recommended';
  payload.priorities.shift();
  const brief = await loadClient(async () => response(payload)).load();
  assert.equal(brief.situation.valueAgreementPct, 6.5);
  assert.equal(brief.status, 'review_recommended');
  assert.deepEqual(
    brief.priorities.map(priority => priority.code),
    ['temporal_quarantine_present', 'historical_snapshot'],
  );
});

test('decision brief client rejects exact-schema drift, unsafe exports and unknown enums', async t => {
  const cases = [
    ['schema downgrade', value => { value.schemaVersion = 'grh-decision-brief-v0'; }],
    ['extra identity-shaped field', value => { value.situation.employeeName = 'Dato prohibido'; }],
    ['weakened threshold', value => { value.privacy.threshold = 1; }],
    ['monetary export enabled', value => { value.privacy.monetaryAmountsExported = true; }],
    ['unknown status', value => { value.status = 'automatic_action'; }],
    ['unknown priority', value => { value.priorities[0].code = 'dismiss_control'; }],
    ['forged CTA capability', value => { value.priorities[0].requiredCapability = 'navigation.workspace'; }],
    ['forged CTA route', value => { value.priorities[1].href = 'exportar.html'; }],
    ['unknown limit', value => { value.limits[0] = 'live_certified'; }],
    ['invalid SHA', value => { value.source.sourceSha256 = 'f'.repeat(63); }],
    ['monthly metric outside percentage', value => { value.situation.valueAgreementPct = 101; }],
    ['quarantine evidence removed while priority remains', value => { value.situation.temporalQuarantineRows = 0; }],
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const payload = clone(PROJECTION);
      mutate(payload);
      const api = loadClient(async () => response(payload));
      await assert.rejects(api.load(), error =>
        assertTypedError(error, 'DECISION_BRIEF_CONTRACT_INVALID', 502));
    });
  }
});

test('missing or mismatched contract headers fail before parsing JSON', async t => {
  for (const contract of [null, 'grh-decision-brief-v0']) {
    await t.test(String(contract), async () => {
      let reads = 0;
      const api = loadClient(async () => response(PROJECTION, {
        contract,
        json: async () => { reads += 1; return clone(PROJECTION); },
      }));
      await assert.rejects(api.load(), error =>
        assertTypedError(error, 'DECISION_BRIEF_RESPONSE_CONTRACT_MISMATCH', 502));
      assert.equal(reads, 0);
    });
  }
});

test('HTTP 503 is not retried and its body is never parsed or disclosed', async () => {
  let calls = 0;
  let reads = 0;
  let cancellations = 0;
  const secret = 'persona-identificable@example.invalid';
  const api = loadClient(async () => {
    calls += 1;
    return response(null, {
      status: 503,
      json: async () => { reads += 1; return { error: secret }; },
      body: { cancel: async () => { cancellations += 1; } },
    });
  });
  await assert.rejects(api.load(), error => {
    assertTypedError(error, 'DECISION_BRIEF_HTTP_ERROR', 503);
    assert.doesNotMatch(error.message, new RegExp(secret, 'i'));
    return true;
  });
  assert.equal(calls, 1);
  assert.equal(reads, 0);
  assert.equal(cancellations, 1);
});

test('media type, invalid JSON, timeout and caller abort all fail closed', async t => {
  await t.test('HTML response', async () => {
    const api = loadClient(async () => response(PROJECTION, { contentType: 'text/html' }));
    await assert.rejects(api.load(), error =>
      assertTypedError(error, 'DECISION_BRIEF_RESPONSE_NOT_JSON', 502));
  });
  await t.test('invalid JSON', async () => {
    const api = loadClient(async () => response(null, {
      json: async () => { throw new SyntaxError('raw response'); },
    }));
    await assert.rejects(api.load(), error =>
      assertTypedError(error, 'DECISION_BRIEF_RESPONSE_INVALID_JSON', 502));
  });
  function abortableFetch(_url, init) {
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('private', 'AbortError')), { once: true });
    });
  }
  await t.test('timeout', async () => {
    const api = loadClient(abortableFetch);
    await assert.rejects(api.load({ timeoutMs: 5 }), error =>
      assertTypedError(error, 'DECISION_BRIEF_REQUEST_TIMEOUT', 408));
  });
  await t.test('caller abort', async () => {
    const api = loadClient(abortableFetch);
    const controller = new AbortController();
    const pending = api.load({ timeoutMs: 1000, signal: controller.signal });
    controller.abort('sensitive reason');
    await assert.rejects(pending, error =>
      assertTypedError(error, 'DECISION_BRIEF_REQUEST_ABORTED', 0));
  });
});

test('decision brief client has no storage, DOM, raw artifact, fallback or retry path', async () => {
  const api = loadClient(undefined, { auth: false });
  await assert.rejects(api.load(), error =>
    assertTypedError(error, 'DECISION_BRIEF_CLIENT_UNAVAILABLE', 0));
  assert.doesNotMatch(CLIENT_SOURCE, /\b(?:localStorage|sessionStorage|document|innerHTML)\b/);
  assert.doesNotMatch(CLIENT_SOURCE, /\/api\/(?:grh-data|grh-executive|grh-quality|grh-close)|profile|semantic|personas_junin|\bdemo\b/i);
  assert.doesNotMatch(CLIENT_SOURCE, /\b(?:retry|backoff|setInterval)\b/i);
  assert.equal((CLIENT_SOURCE.match(/\/api\/grh-decision-brief/g) || []).length, 1);
});
