import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { buildGrhWorkforceFinanceProjection } from '../api/lib/grh-workforce-finance-projection.js';
import {
  GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
  GRH_WORKFORCE_FINANCE_APPROVED_SOURCE,
} from '../api/lib/grh-workforce-finance-source-contract.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_SOURCE = await readFile(
  path.join(ROOT, 'js', 'grh-workforce-finance-data.js'),
  'utf8',
);
const SOURCE = await readFile(
  new URL('../api/_data/grh-workforce-finance.json', import.meta.url),
  'utf8',
).then(JSON.parse);
const PROJECTION = buildGrhWorkforceFinanceProjection(SOURCE, {
  presentation: Object.freeze({
    schemaVersion: 'tenant-presentation-v1',
    locale: 'es-AR',
    displayCurrencyCode: 'ARS',
    basis: 'tenant_configuration',
    effectiveFrom: '2026-08-10',
    sourceCurrencyStatus: 'not_declared_in_source',
  }),
});

function clone(value) {
  return structuredClone(value);
}

function response(payload, {
  status = 200,
  contentType = 'application/json; charset=utf-8',
  contract = 'grh-workforce-finance-v1',
  text,
} = {}) {
  return {
    status,
    headers: {
      get(name) {
        const normalized = String(name).toLowerCase();
        if (normalized === 'content-type') return contentType;
        if (normalized === 'x-municontrol-contract') return contract;
        return null;
      },
    },
    text: text || (async () => JSON.stringify(payload)),
  };
}

function loadClient(fetchImpl, { auth = true } = {}) {
  const window = {
    AbortController,
    crypto: webcrypto,
    TextEncoder,
    clearTimeout,
    setTimeout,
  };
  if (auth) window.MuniAuth = Object.freeze({ fetch: fetchImpl });
  const context = vm.createContext({
    AbortController,
    Error,
    Set,
    TextEncoder,
    window,
  });
  vm.runInContext(CLIENT_SOURCE, context, {
    filename: 'js/grh-workforce-finance-data.js',
  });
  return window.MuniGrhWorkforceFinance;
}

function assertTypedError(error, code, status) {
  assert.equal(error?.name, 'WorkforceFinanceError');
  assert.equal(error?.code, code);
  assert.equal(error?.status, status);
  assert.equal(typeof error?.message, 'string');
  assert.ok(error.message.length > 0 && error.message.length < 180);
  assert.equal('payload' in error, false);
  assert.equal('details' in error, false);
  assert.equal('cause' in error, false);
  return true;
}

test('workforce-finance client fetches only the fixed governed endpoint and deep-freezes 24x3 data', async () => {
  const calls = [];
  const api = loadClient(async (url, init) => {
    calls.push({ url, init });
    return response(PROJECTION);
  });
  const projection = await api.load({ timeoutMs: 1000 });
  assert.equal(api.ENDPOINT, '/api/grh-workforce-finance');
  assert.equal(api.CONTRACT, 'grh-workforce-finance-v1');
  assert.equal(api.APPROVED_RELEASE_ID, GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID);
  assert.deepEqual({ ...api.APPROVED_SOURCE }, GRH_WORKFORCE_FINANCE_APPROVED_SOURCE);
  assert.equal(await api.validate(PROJECTION), true);
  assert.equal(Object.isFrozen(api), true);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.dimensionViews), true);
  assert.equal(Object.isFrozen(projection.dimensionViews[0].periods[0].cells[0]), true);
  assert.equal(projection.periodTotals.length, 24);
  assert.deepEqual(
    Array.from(projection.dimensionViews, view => view.dimension),
    ['sector', 'costCenter', 'agreement'],
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/grh-workforce-finance');
  assert.deepEqual({
    method: calls[0].init.method,
    cache: calls[0].init.cache,
    credentials: calls[0].init.credentials,
    redirect: calls[0].init.redirect,
    accept: calls[0].init.headers.Accept,
    hasBody: 'body' in calls[0].init,
  }, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
    accept: 'application/json',
    hasBody: false,
  });
});

test('workforce-finance client rejects header drift, schema extras and protected-count leakage', async t => {
  await t.test('wrong contract header', async () => {
    const api = loadClient(async () => response(PROJECTION, { contract: 'grh-workforce-finance-v0' }));
    await assert.rejects(api.load(), error =>
      assertTypedError(error, 'WORKFORCE_FINANCE_RESPONSE_INVALID', 200));
  });

  for (const [name, mutate] of [
    ['PII-shaped extra', value => { value.dimensionViews[0].periods[0].cells[0].legajo = 571; }],
    ['missing month', value => { value.periodTotals.splice(3, 1); }],
    ['presentation inference', value => { value.metric.presentationCurrency = 'USD'; }],
    ['release identity drift', value => { value.releaseId = 'f'.repeat(64); }],
    ['content-addressed financial drift', value => {
      value.periodTotals[0].components.employerContributionsCents += 1;
      for (const view of value.dimensionViews) {
        const aggregate = view.periods[0].cells.find(cell =>
          cell.privacyStatus === 'protected_aggregate');
        assert.ok(aggregate, 'real projection must include one protected aggregate per view');
        aggregate.components.employerContributionsCents += 1;
      }
    }],
    ['source system drift', value => { value.source.canonicalSystem = 'GRH Mars'; }],
    ['source file drift', value => { value.source.sourceFile = 'grh_junin.fake.sql.gz'; }],
    ['source size drift', value => { value.source.compressedSizeBytes = 1; }],
    ['noncanonical generated timestamp', value => { value.source.generatedAt = '2026-08-11Z'; }],
    ['calculation source type drift', value => { value.quality.calculation.sourceRows = 'banana'; }],
    ['calculation rate drift', value => { value.quality.calculation.validRatePct = 999; }],
    ['reference count drift', value => { value.quality.references[0].observedCodes = -1; }],
    ['reference assignment drift', value => { value.quality.references[0].observedControlRuns += 1; }],
    ['assignment run count drift', value => { value.quality.assignment.employeePeriodRuns = -5; }],
    ['run partition drift', value => { value.quality.assignment.dimensionRunChecks[0].validRuns -= 1; }],
    ['multi-category rate drift', value => {
      value.quality.assignment.multiCategoryEmployeePeriods[0].multiCategoryPct = 99;
    }],
    ['multi-category population drift', value => {
      value.quality.assignment.multiCategoryEmployeePeriods[0].employeePeriods += 1;
    }],
    ['participant total drift', value => {
      value.quality.participantSetReconciliation.allCalculoEmployeePeriods += 1;
      value.quality.participantSetReconciliation.controlEmployeePeriods += 1;
    }],
    ['amount-sign count type drift', value => {
      value.quality.amountSigns.dimensions[0].cellsChecked = 'many';
    }],
    ['privacy gate cap drift', value => {
      const index = value.quality.warnings.findIndex(item =>
        item.startsWith('cross_view_max_subset_equations_per_period:'));
      assert.notEqual(index, -1);
      value.quality.warnings[index] = 'cross_view_max_subset_equations_per_period:12000001';
    }],
    ['missing privacy attestation', value => {
      value.quality.warnings = value.quality.warnings.filter(item =>
        item !== 'cross_view_subset_difference_gate_passed');
    }],
    ['protected count leak', value => {
      const cell = value.dimensionViews
        .flatMap(view => view.periods)
        .flatMap(period => period.cells)
        .find(item => item.participantPrivacyStatus === 'protected_difference_attack');
      assert.ok(cell, 'real projection must exercise count protection');
      cell.distinctParticipantsObserved = 5;
      cell.participantDisplay = '5';
      cell.control.roundingToleranceCents = 5;
      cell.control.identityWithinRoundingTolerance = true;
    }],
    ['protected count sum leak', value => {
      const period = value.dimensionViews
        .flatMap(view => view.periods)
        .find(item => item.cells.some(cell =>
          cell.participantPrivacyStatus === 'protected_difference_attack'));
      assert.ok(period, 'real projection must exercise protected period accounting');
      period.participantAccounting.sumCellDistinctParticipantsObserved =
        period.participantAccounting.periodDistinctParticipants;
    }],
    ['period participant identity drift', value => {
      value.dimensionViews[0].periods[0].participantAccounting.periodDistinctParticipants += 1;
    }],
    ['multi-category bounds drift', value => {
      const accounting = value.dimensionViews
        .flatMap(view => view.periods)
        .map(period => period.participantAccounting)
        .find(item => item.multiCategoryPrivacyStatus === 'released');
      assert.ok(accounting, 'real projection must exercise released overlap accounting');
      accounting.multiCategoryParticipants = accounting.periodDistinctParticipants + 1;
      accounting.multiCategoryParticipantDisplay = String(accounting.multiCategoryParticipants);
    }],
  ]) {
    await t.test(name, async () => {
      const payload = clone(PROJECTION);
      mutate(payload);
      const api = loadClient(async () => response(payload));
      await assert.rejects(api.load(), error =>
        assertTypedError(error, 'WORKFORCE_FINANCE_CONTRACT_INVALID', 200));
    });
  }
});

test('workforce-finance HTTP failures never parse or disclose response bodies', async () => {
  let reads = 0;
  const secret = 'persona-identificable@example.invalid';
  const api = loadClient(async () => response(null, {
    status: 403,
    text: async () => {
      reads += 1;
      return JSON.stringify({ error: secret });
    },
  }));
  await assert.rejects(api.load(), error => {
    assertTypedError(error, 'WORKFORCE_FINANCE_HTTP_ERROR', 403);
    assert.doesNotMatch(error.message, new RegExp(secret, 'i'));
    return true;
  });
  assert.equal(reads, 0);
});

test('workforce-finance client has no storage, DOM, raw artifact or fallback path', async () => {
  const api = loadClient(undefined, { auth: false });
  await assert.rejects(api.load(), error =>
    assertTypedError(error, 'WORKFORCE_FINANCE_CLIENT_UNAVAILABLE', 0));
  assert.doesNotMatch(CLIENT_SOURCE, /\b(?:localStorage|sessionStorage|innerHTML)\b/);
  assert.doesNotMatch(CLIENT_SOURCE, /\/api\/grh-data|profile\.json|semantic\.json|personas_junin|\bdemo\b/i);
  assert.equal((CLIENT_SOURCE.match(/\/api\/grh-workforce-finance/g) || []).length, 1);
});
