import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { buildGrhExecutiveProjection } from '../api/lib/grh-executive-projection.js';
import { buildGrhQualityProjection } from '../api/lib/grh-quality-projection.js';

const root = path.resolve(import.meta.dirname, '..');
const clientPath = path.join(root, 'js', 'grh-secure-data.js');
const clientSource = await readFile(clientPath, 'utf8');

async function realProjections(audience = 'interactive') {
  const [profile, semantic] = await Promise.all([
    readFile(new URL('../api/_data/grh-profile.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../api/_data/grh-semantic.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  return {
    executive: buildGrhExecutiveProjection(semantic, { audience }),
    quality: buildGrhQualityProjection(profile, semantic),
  };
}

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
  const window = {
    AbortController,
    clearTimeout,
    setTimeout,
  };
  if (auth) window.MuniAuth = Object.freeze({ fetch: fetchImpl });
  const context = vm.createContext({ window });
  vm.runInContext(clientSource, context, { filename: 'js/grh-secure-data.js' });
  return window.MuniGrhData;
}

function assertTypedError(error, code, status) {
  assert.equal(error?.name, 'GrhDataError');
  assert.equal(error?.code, code);
  assert.equal(error?.status, status);
  assert.equal(typeof error?.message, 'string');
  assert.ok(error.message.length > 0 && error.message.length < 160);
  assert.equal('payload' in error, false);
  assert.equal('details' in error, false);
  assert.equal('cause' in error, false);
  return true;
}

test('the secure client loads both real projections concurrently and deeply freezes the experience', async () => {
  const projections = await realProjections();
  const calls = [];
  const pending = new Map();
  const fetchImpl = (url, init) => {
    calls.push({ url, init });
    return new Promise(resolve => pending.set(url, resolve));
  };
  const api = loadClient(fetchImpl);

  assert.deepEqual(Object.keys(api).sort(), ['loadExecutive', 'loadExperience', 'loadQuality']);
  assert.equal(Object.isFrozen(api), true);

  const experiencePromise = api.loadExperience();
  assert.equal(calls.length, 2, 'both governed projections must start before either one resolves');
  assert.deepEqual(calls.map(call => call.url), ['/api/grh-executive', '/api/grh-quality']);
  for (const call of calls) {
    assert.equal(call.init.method, 'GET');
    assert.equal(call.init.cache, 'no-store');
    assert.equal(call.init.redirect, 'error');
    assert.deepEqual(Object.keys(call.init.headers), ['Accept']);
    assert.equal(call.init.headers.Accept, 'application/json');
    assert.equal(call.init.signal instanceof AbortSignal, true);
    assert.equal(call.init.signal.aborted, false);
    assert.equal('body' in call.init, false);
  }

  pending.get('/api/grh-quality')(response(projections.quality));
  pending.get('/api/grh-executive')(response(projections.executive));
  const experience = await experiencePromise;

  assert.equal(experience.executive.schemaVersion, 'grh-executive-v2');
  assert.equal(experience.quality.schemaVersion, 'grh-quality-v1');
  assert.equal(Object.isFrozen(experience), true);
  assert.equal(Object.isFrozen(experience.executive.workforce.bySector.rows), true);
  assert.equal(Object.isFrozen(experience.quality.temporal.domains.calculo), true);
  assert.equal(
    experience.executive.source.sourceSha256,
    experience.quality.source.sourceSha256,
  );
});

test('individual loaders accept only their fixed endpoint and exact current schema', async () => {
  const projections = await realProjections();
  const calls = [];
  const api = loadClient(async (url, init) => {
    calls.push({ url, init });
    return response(url === '/api/grh-executive' ? projections.executive : projections.quality);
  });

  const executive = await api.loadExecutive({ timeoutMs: 1000 });
  const quality = await api.loadQuality({ timeoutMs: 1000 });
  assert.equal(executive.schemaVersion, 'grh-executive-v2');
  assert.equal(quality.schemaVersion, 'grh-quality-v1');
  assert.deepEqual(calls.map(call => call.url), ['/api/grh-executive', '/api/grh-quality']);
  assert.equal(Object.isFrozen(executive.compensation.series[0].amounts), true);
  assert.equal(Object.isFrozen(quality.inventory.all), true);
});

test('the secure client accepts the exact interactive and portable executive audiences', async (t) => {
  for (const audience of ['interactive', 'portable']) {
    await t.test(audience, async () => {
      const projections = await realProjections(audience);
      const api = loadClient(async () => response(projections.executive));
      const executive = await api.loadExecutive({ timeoutMs: 1000 });
      assert.equal(executive.privacy.audience, audience);
      assert.equal(executive.workforce.bySector.threshold, audience === 'portable' ? 10 : 5);
    });
  }
});

test('portable projections fail closed when suppression identity or threshold is weakened', async (t) => {
  const projections = await realProjections('portable');
  const mutations = [
    {
      name: 'portable threshold drift',
      mutate(value) {
        value.privacy.portableThreshold = 5;
      },
    },
    {
      name: 'portable suppressed period disclosed',
      mutate(value) {
        const row = value.absence.series.find(item => item.privacyStatus === 'suppressed');
        assert.ok(row, 'real portable projection must exercise suppressed periods');
        row.period = '1998';
      },
    },
  ];

  for (const scenario of mutations) {
    await t.test(scenario.name, async () => {
      const payload = clone(projections.executive);
      scenario.mutate(payload);
      const api = loadClient(async () => response(payload));
      await assert.rejects(
        api.loadExecutive(),
        error => assertTypedError(error, 'GRH_EXECUTIVE_CONTRACT_INVALID', 502),
      );
    });
  }
});

test('experience rejects different SHA, snapshot or canonical system without returning a mixed bundle', async (t) => {
  const projections = await realProjections();
  const mutations = [
    ['sourceSha256', 'a'.repeat(64)],
    ['snapshotAsOf', '2026-08-05'],
    ['canonicalSystem', 'GRH Junin alternativo'],
  ];

  for (const [field, value] of mutations) {
    await t.test(field, async () => {
      const quality = clone(projections.quality);
      quality.source[field] = value;
      const api = loadClient(async url => response(
        url === '/api/grh-executive' ? projections.executive : quality,
      ));
      await assert.rejects(
        api.loadExperience(),
        error => {
          assertTypedError(error, 'GRH_SOURCE_IDENTITY_MISMATCH', 502);
          assert.doesNotMatch(error.message, /e7403d|2026-08-0|alternativo/i);
          return true;
        },
      );
    });
  }
});

test('schema downgrade, unknown fields and weakened privacy fail closed with no fallback request', async (t) => {
  const projections = await realProjections();
  const cases = [
    {
      name: 'executive downgrade',
      endpoint: '/api/grh-executive',
      code: 'GRH_EXECUTIVE_CONTRACT_INVALID',
      payload() {
        const value = clone(projections.executive);
        value.schemaVersion = 'grh-executive-v1';
        return value;
      },
      load: 'loadExecutive',
    },
    {
      name: 'executive small cell',
      endpoint: '/api/grh-executive',
      code: 'GRH_EXECUTIVE_CONTRACT_INVALID',
      payload() {
        const value = clone(projections.executive);
        value.workforce.bySector.rows[0].participants = 1;
        return value;
      },
      load: 'loadExecutive',
    },
    {
      name: 'quality unknown PII field',
      endpoint: '/api/grh-quality',
      code: 'GRH_QUALITY_CONTRACT_INVALID',
      payload() {
        const value = clone(projections.quality);
        value.referential.legajo.employeeName = 'Dato prohibido';
        return value;
      },
      load: 'loadQuality',
    },
    {
      name: 'quality privacy weakened',
      endpoint: '/api/grh-quality',
      code: 'GRH_QUALITY_CONTRACT_INVALID',
      payload() {
        const value = clone(projections.quality);
        value.privacy.rawRowsExported = true;
        return value;
      },
      load: 'loadQuality',
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const calls = [];
      const api = loadClient(async url => {
        calls.push(url);
        return response(scenario.payload());
      });
      await assert.rejects(api[scenario.load](), error =>
        assertTypedError(error, scenario.code, 502));
      assert.deepEqual(calls, [scenario.endpoint]);
      assert.equal(calls.some(url => /grh-data|demo|profile|semantic/i.test(url)), false);
    });
  }
});

test('HTTP and authentication failures preserve only typed status and never parse or leak a payload', async (t) => {
  await t.test('HTTP response', async () => {
    let jsonReads = 0;
    const secret = 'persona-identificable@example.invalid';
    const api = loadClient(async () => response(null, {
      status: 403,
      json: async () => {
        jsonReads += 1;
        return { error: secret };
      },
    }));
    await assert.rejects(api.loadExecutive(), error => {
      assertTypedError(error, 'GRH_HTTP_ERROR', 403);
      assert.doesNotMatch(error.message, new RegExp(secret, 'i'));
      return true;
    });
    assert.equal(jsonReads, 0);
  });

  await t.test('MuniAuth rejection', async () => {
    const api = loadClient(async () => {
      const error = new Error('JWT y payload interno que no deben filtrarse');
      error.status = 401;
      throw error;
    });
    await assert.rejects(api.loadQuality(), error => {
      assertTypedError(error, 'GRH_REQUEST_FAILED', 401);
      assert.doesNotMatch(error.message, /JWT|payload interno/i);
      return true;
    });
  });
});

test('successful responses require a trustworthy status, JSON media type and parseable JSON', async (t) => {
  const projections = await realProjections();
  await t.test('missing status', async () => {
    const api = loadClient(async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => clone(projections.executive),
    }));
    await assert.rejects(api.loadExecutive(), error =>
      assertTypedError(error, 'GRH_RESPONSE_INVALID', 502));
  });

  await t.test('HTML media type', async () => {
    const api = loadClient(async () => response(projections.executive, { contentType: 'text/html' }));
    await assert.rejects(api.loadExecutive(), error =>
      assertTypedError(error, 'GRH_RESPONSE_NOT_JSON', 502));
  });

  await t.test('invalid JSON', async () => {
    const api = loadClient(async () => response(null, {
      json: async () => { throw new SyntaxError('raw response'); },
    }));
    await assert.rejects(api.loadExecutive(), error =>
      assertTypedError(error, 'GRH_RESPONSE_INVALID_JSON', 502));
  });
});

test('timeout and caller AbortSignal are safely composed and reported without exposing abort reasons', async (t) => {
  function abortableFetch(_url, init) {
    return new Promise((_resolve, reject) => {
      if (init.signal.aborted) {
        reject(new DOMException('private abort reason', 'AbortError'));
        return;
      }
      init.signal.addEventListener('abort', () => {
        reject(new DOMException('private abort reason', 'AbortError'));
      }, { once: true });
    });
  }

  await t.test('timeout', async () => {
    const api = loadClient(abortableFetch);
    await assert.rejects(api.loadExecutive({ timeoutMs: 5 }), error => {
      assertTypedError(error, 'GRH_REQUEST_TIMEOUT', 408);
      assert.doesNotMatch(error.message, /private abort reason/i);
      return true;
    });
  });

  await t.test('caller abort', async () => {
    const api = loadClient(abortableFetch);
    const controller = new AbortController();
    const pending = api.loadQuality({ timeoutMs: 1000, signal: controller.signal });
    controller.abort('sensitive caller reason');
    await assert.rejects(pending, error => {
      assertTypedError(error, 'GRH_REQUEST_ABORTED', 0);
      assert.doesNotMatch(error.message, /sensitive caller reason/i);
      return true;
    });
  });

  await t.test('already aborted', async () => {
    let calls = 0;
    const api = loadClient(async () => { calls += 1; });
    const controller = new AbortController();
    controller.abort('never send');
    await assert.rejects(api.loadExperience({ signal: controller.signal }), error =>
      assertTypedError(error, 'GRH_REQUEST_ABORTED', 0));
    assert.equal(calls, 0);
  });
});

test('the client is fail-closed without authentication and contains no storage, DOM or legacy data path', async () => {
  const api = loadClient(undefined, { auth: false });
  await assert.rejects(api.loadExecutive(), error =>
    assertTypedError(error, 'GRH_CLIENT_UNAVAILABLE', 0));

  assert.doesNotMatch(clientSource, /\b(?:localStorage|sessionStorage|innerHTML)\b/);
  assert.doesNotMatch(clientSource, /\/api\/grh-data|\bMuniDB\b|\bdemo\b/i);
  assert.equal((clientSource.match(/\/api\/grh-executive/g) || []).length, 1);
  assert.equal((clientSource.match(/\/api\/grh-quality/g) || []).length, 1);
});
