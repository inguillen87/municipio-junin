import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MUNICIPAL_TERRITORY_ACCESS_ISSUE,
  MUNICIPAL_TERRITORY_BASEMAPS,
  MUNICIPAL_TERRITORY_LIMITS,
  MUNICIPAL_TERRITORY_MAX_VERTICES,
  MUNICIPAL_TERRITORY_SCHEMA_VERSION,
  inspectMunicipalTerritoryContract,
  pointIsInsideMunicipalBoundary,
} from '../api/lib/municipal-territory-contract.js';
import {
  MUNICIPAL_TERRITORY_GEOREF_URL,
  MUNICIPAL_TERRITORY_IGN_URL,
  createMunicipalTerritorySource,
  projectIgnDepartmentBoundary,
} from '../api/lib/municipal-territory-source.js';
import {
  MUNICIPAL_TERRITORY_RESOURCE,
  createMunicipalTerritoryHandler,
} from '../api/municipal-territory.js';
import routePolicy from '../shared/route-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';

const QUERIED_AT = Date.parse('2026-08-11T12:00:00.000Z');
const LOCALITIES = Object.freeze([
  ['50035010', 'Ingeniero Giagnoni', -68.4123885264046, -33.1278250293367],
  ['50035020', 'Junín', -68.4872690737808, -33.1465311500985],
  ['50035030', 'La Colonia', -68.4804995237419, -33.0989413692546],
  ['50035040', 'Los Barriales', -68.5688059684624, -33.0996793533624],
  ['50035050', 'Medrano', -68.615165408116, -33.1767732947655],
  ['50035060', 'Phillips', -68.3774928550962, -33.2009807649662],
  ['50035070', 'Rodríguez Peña', -68.5951625639971, -33.1204426186256],
]);

function rectangleRing() {
  return [
    [-68.75, -33.3],
    [-68.2, -33.3],
    [-68.2, -33.0],
    [-68.75, -33.0],
    [-68.75, -33.3],
  ];
}

function ignFixture({ coordinates = [[rectangleRing()]] } = {}) {
  return {
    type: 'FeatureCollection',
    totalFeatures: 1,
    features: [{
      type: 'Feature',
      id: 'departamento.1222',
      properties: {
        gid: 1222,
        objeto: 'Departamento',
        fna: 'Departamento Junín',
        gna: 'Departamento',
        nam: 'Junín',
        in1: '50035',
        fdc: 'Oficina Provincial de Mendoza',
        sag: 'IGN',
      },
      geometry: { type: 'MultiPolygon', coordinates },
    }],
  };
}

function georefFixture() {
  return {
    cantidad: 7,
    inicio: 0,
    localidades: LOCALITIES.map(([id, nombre, lon, lat]) => ({
      centroide: { lat, lon },
      id,
      nombre,
    })),
    parametros: {
      campos: ['id', 'centroide.lat', 'nombre', 'centroide.lon'],
      categoria: 'Localidad simple,Componente de localidad compuesta,entidad',
      departamento: ['50035'],
      max: 100,
    },
    total: 7,
  };
}

function jsonResponse(body, {
  contentType = 'application/json; charset=utf-8',
  contentLength,
  chunkSize = 16 * 1024,
  onCancel = () => {},
  onRead = () => {},
  ok = true,
  status = 200,
  redirected = false,
  text,
} = {}) {
  const serialized = text ?? JSON.stringify(body);
  const encoded = new TextEncoder().encode(serialized);
  const headers = new Map([['content-type', contentType]]);
  if (contentLength !== undefined) headers.set('content-length', String(contentLength));
  let offset = 0;
  let cancelled = false;
  return {
    ok,
    status,
    redirected,
    headers: { get: (name) => headers.get(String(name).toLowerCase()) ?? null },
    body: {
      getReader: () => ({
        async read() {
          if (cancelled || offset >= encoded.byteLength) return { done: true, value: undefined };
          const value = encoded.subarray(offset, Math.min(offset + chunkSize, encoded.byteLength));
          offset += value.byteLength;
          onRead(value.byteLength);
          return { done: false, value };
        },
        async cancel(reason) {
          cancelled = true;
          onCancel(reason);
        },
        releaseLock() {},
      }),
    },
  };
}

function fixedFetch({ ign = ignFixture(), georef = georefFixture(), calls = [] } = {}) {
  return async (url, init) => {
    calls.push({ url, init });
    if (url === MUNICIPAL_TERRITORY_IGN_URL) {
      if (ign instanceof Error) throw ign;
      return ign?.ok === undefined ? jsonResponse(ign) : ign;
    }
    if (url === MUNICIPAL_TERRITORY_GEOREF_URL) {
      if (georef instanceof Error) throw georef;
      return georef?.ok === undefined ? jsonResponse(georef) : georef;
    }
    throw new Error(`unexpected URL ${url}`);
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    payload: undefined,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

function withQuietErrors(callback) {
  const original = console.error;
  console.error = () => {};
  return Promise.resolve().then(callback).finally(() => { console.error = original; });
}

async function loadReady(options = {}) {
  return createMunicipalTerritorySource({
    fetchImpl: fixedFetch(options),
    now: () => QUERIED_AT,
    timeoutMs: 100,
    cacheTtlMs: 1_000,
  }).load();
}

test('official fixed sources build the exact ready contract and start in parallel', async () => {
  const calls = [];
  const payload = await loadReady({ calls });
  assert.equal(inspectMunicipalTerritoryContract(payload).ok, true);
  assert.equal(payload.schemaVersion, MUNICIPAL_TERRITORY_SCHEMA_VERSION);
  assert.equal(payload.status, 'ready');
  assert.equal(payload.query.queriedAt, '2026-08-11T12:00:00.000Z');
  assert.equal(payload.query.departmentId, '50035');
  assert.equal(payload.query.crs, 'EPSG:4326');
  assert.equal(payload.source.boundary.endpoint.includes('?'), false);
  assert.equal(payload.source.localities.endpoint.includes('?'), false);
  assert.match(payload.source.boundary.custodian, /Instituto Geográfico Nacional.*Mendoza/u);
  assert.equal(payload.boundary.geometry.type, 'MultiPolygon');
  assert.equal(payload.localities.length, 7);
  assert.deepEqual(Object.keys(payload.localities[0]).sort(), ['centroid', 'id', 'name']);
  assert.equal(payload.localities.every(locality => pointIsInsideMunicipalBoundary(
    locality.centroid.longitude,
    locality.centroid.latitude,
    payload.boundary.geometry.coordinates,
  )), true);
  assert.deepEqual(payload.basemaps, MUNICIPAL_TERRITORY_BASEMAPS);
  assert.deepEqual(payload.basemaps.map(({ id, theme }) => [id, theme]), [
    ['argenmap', 'light'],
    ['gris', 'light'],
    ['oscuro', 'dark'],
    ['topografico', 'topographic'],
  ]);
  assert.deepEqual(payload.accessIssues, []);
  assert.deepEqual(payload.limits, MUNICIPAL_TERRITORY_LIMITS);
  assert.equal(Object.isFrozen(payload), true);
  assert.equal(Object.isFrozen(payload.boundary.geometry.coordinates), true);
  assert.deepEqual(calls.map(call => call.url).sort(), [
    MUNICIPAL_TERRITORY_GEOREF_URL,
    MUNICIPAL_TERRITORY_IGN_URL,
  ].sort());
  for (const call of calls) {
    assert.deepEqual(call.init.headers, { Accept: 'application/json' });
    assert.equal(call.init.method, 'GET');
    assert.equal(call.init.redirect, 'error');
    assert.equal(call.init.cache, 'no-store');
    assert.equal(call.init.signal instanceof AbortSignal, true);
  }
});

test('GeoRef failure or invalidity degrades atomically to a valid partial contract', async () => {
  for (const georef of [
    new Error('offline'),
    { ...georefFixture(), total: 6 },
    (() => { const value = georefFixture(); value.localidades[0].nombre = 'Nombre falso'; return value; })(),
    (() => { const value = georefFixture(); value.localidades[0].extra = 'not allowlisted'; return value; })(),
    (() => { const value = georefFixture(); value.localidades[0].centroide.lon = 0; return value; })(),
  ]) {
    const payload = await loadReady({ georef });
    assert.equal(payload.status, 'partial');
    assert.deepEqual(payload.localities, []);
    assert.equal(payload.source.boundary.status, 'available');
    assert.equal(payload.source.localities.status, 'unavailable');
    assert.deepEqual(payload.accessIssues, [MUNICIPAL_TERRITORY_ACCESS_ISSUE]);
    assert.equal(inspectMunicipalTerritoryContract(payload).ok, true);
  }
});

test('a centroid in a MultiPolygon hole invalidates the whole optional locality source', async () => {
  const holeAroundJunin = [
    [-68.51, -33.16],
    [-68.46, -33.16],
    [-68.46, -33.13],
    [-68.51, -33.13],
    [-68.51, -33.16],
  ];
  const payload = await loadReady({
    ign: ignFixture({ coordinates: [[rectangleRing(), holeAroundJunin]] }),
  });
  assert.equal(payload.status, 'partial');
  assert.deepEqual(payload.localities, []);
  assert.deepEqual(payload.accessIssues, [MUNICIPAL_TERRITORY_ACCESS_ISSUE]);
  assert.equal(inspectMunicipalTerritoryContract(payload).ok, true);
});

test('required IGN boundary rejects identity, provenance, geometry and coordinate attacks', async () => {
  const mutations = [
    value => { value.features[0].properties.in1 = '06413'; },
    value => { value.features[0].properties.nam = 'Otro'; },
    value => { value.features[0].properties.sag = 'unknown'; },
    value => { value.features[0].properties.fdc = 'unknown'; },
    value => { value.features[0].geometry.type = 'Polygon'; },
    value => { value.features[0].geometry.coordinates[0][0][0][0] = 0; },
    value => { value.features[0].geometry.coordinates[0][0].pop(); },
    value => { value.features.push(structuredClone(value.features[0])); },
  ];
  for (const mutate of mutations) {
    const value = ignFixture();
    mutate(value);
    const source = createMunicipalTerritorySource({
      fetchImpl: fixedFetch({ ign: value }),
      now: () => QUERIED_AT,
      timeoutMs: 100,
      cacheTtlMs: 1_000,
    });
    await assert.rejects(source.load(), /IGN_SOURCE_UNAVAILABLE/);
  }

  const ring = [];
  for (let index = 0; index <= MUNICIPAL_TERRITORY_MAX_VERTICES; index += 1) {
    ring.push(index % 2 === 0 ? [-68.7, -33.25] : [-68.3, -33.05]);
  }
  ring.push([...ring[0]]);
  assert.throws(
    () => projectIgnDepartmentBoundary(ignFixture({ coordinates: [[ring]] })),
    /IGN_BOUNDARY_INVALID/,
  );
});

test('strict JSON content type and response byte limits fail closed by source criticality', async () => {
  const invalidRequiredResponses = [
    jsonResponse(ignFixture(), { contentType: 'text/html' }),
    jsonResponse(ignFixture(), { contentLength: 600_000 }),
    jsonResponse(null, { text: '{not-json' }),
    jsonResponse(ignFixture(), { status: 302, ok: false }),
    jsonResponse(ignFixture(), { redirected: true }),
  ];
  for (const ign of invalidRequiredResponses) {
    const source = createMunicipalTerritorySource({
      fetchImpl: fixedFetch({ ign }),
      now: () => QUERIED_AT,
      timeoutMs: 100,
      cacheTtlMs: 1_000,
    });
    await assert.rejects(source.load(), /IGN_SOURCE_UNAVAILABLE/);
  }

  const optional = await loadReady({
    georef: jsonResponse(georefFixture(), { contentType: 'text/plain' }),
  });
  assert.equal(optional.status, 'partial');
});

test('a chunked response without Content-Length is cancelled before its unbounded body is buffered', async () => {
  const oversizedText = `${JSON.stringify(ignFixture())}${' '.repeat(2 * 1024 * 1024)}`;
  const totalBytes = new TextEncoder().encode(oversizedText).byteLength;
  let bytesRead = 0;
  let cancelReason = null;
  let requiredSignal;
  const source = createMunicipalTerritorySource({
    fetchImpl: async (url, init) => {
      if (url === MUNICIPAL_TERRITORY_GEOREF_URL) return jsonResponse(georefFixture());
      requiredSignal = init.signal;
      return jsonResponse(null, {
        text: oversizedText,
        chunkSize: 16 * 1024,
        onRead: (length) => { bytesRead += length; },
        onCancel: (reason) => { cancelReason = reason; },
      });
    },
    now: () => QUERIED_AT,
    timeoutMs: 100,
    cacheTtlMs: 1_000,
  });

  await assert.rejects(source.load(), /IGN_SOURCE_UNAVAILABLE/);
  assert.equal(requiredSignal.aborted, true);
  assert.equal(cancelReason, 'IGN_SOURCE_UNAVAILABLE_SIZE');
  assert.ok(bytesRead > 512 * 1024);
  assert.ok(bytesRead < totalBytes);
});

test('required and optional timeouts abort their fixed requests with honest outcomes', async () => {
  let requiredSignal;
  const requiredSource = createMunicipalTerritorySource({
    fetchImpl: (url, init) => {
      if (url === MUNICIPAL_TERRITORY_GEOREF_URL) return jsonResponse(georefFixture());
      requiredSignal = init.signal;
      return new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    },
    now: () => QUERIED_AT,
    timeoutMs: 10,
    cacheTtlMs: 1_000,
  });
  await assert.rejects(requiredSource.load(), /IGN_SOURCE_UNAVAILABLE/);
  assert.equal(requiredSignal.aborted, true);

  let optionalSignal;
  const optionalSource = createMunicipalTerritorySource({
    fetchImpl: (url, init) => {
      if (url === MUNICIPAL_TERRITORY_IGN_URL) return jsonResponse(ignFixture());
      optionalSignal = init.signal;
      return new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    },
    now: () => QUERIED_AT,
    timeoutMs: 10,
    cacheTtlMs: 1_000,
  });
  const partial = await optionalSource.load();
  assert.equal(optionalSignal.aborted, true);
  assert.equal(partial.status, 'partial');
});

test('the short memory cache contains only validated payloads and never errors', async () => {
  let currentTime = QUERIED_AT;
  let calls = 0;
  let failBoundary = false;
  const source = createMunicipalTerritorySource({
    fetchImpl: async (url) => {
      calls += 1;
      if (url === MUNICIPAL_TERRITORY_IGN_URL) {
        if (failBoundary) throw new Error('offline');
        return jsonResponse(ignFixture());
      }
      return jsonResponse(georefFixture());
    },
    now: () => currentTime,
    timeoutMs: 100,
    cacheTtlMs: 50,
  });
  const first = await source.load();
  const second = await source.load();
  assert.equal(first, second);
  assert.equal(calls, 2);
  currentTime += 51;
  const third = await source.load();
  assert.notEqual(third, first);
  assert.equal(calls, 4);

  source.clearCache();
  failBoundary = true;
  await assert.rejects(source.load(), /IGN_SOURCE_UNAVAILABLE/);
  const callsAfterFailure = calls;
  failBoundary = false;
  const recovered = await source.load();
  assert.equal(recovered.status, 'ready');
  assert.equal(calls, callsAfterFailure + 2);
});

test('contract inspection rejects shape drift, arbitrary URLs, locality subsets and status lies', async () => {
  const payload = await loadReady();
  const mutations = [
    value => { value.extra = true; },
    value => { value.query.departmentId = '06413'; },
    value => { value.source.boundary.endpoint = 'https://attacker.invalid/ows'; },
    value => { value.boundary.geometry.coordinates[0][0][0] = [0, 0]; },
    value => { value.localities[0].dni = '123'; },
    value => { value.localities.pop(); },
    value => { value.basemaps[0].tileUrl = 'https://attacker.invalid/{z}'; },
    value => { value.status = 'partial'; },
    value => { value.limits.pop(); },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(payload);
    mutate(changed);
    assert.equal(inspectMunicipalTerritoryContract(changed).ok, false);
  }
});

test('endpoint is GET-only and authenticates the exact municipal territory capability', async () => {
  let authenticated = false;
  const methodHandler = createMunicipalTerritoryHandler({
    requireCapabilityImpl: async () => { authenticated = true; return null; },
  });
  const methodResponse = responseRecorder();
  await methodHandler({ method: 'POST', headers: {}, query: { url: 'https://attacker.invalid' } }, methodResponse);
  assert.equal(methodResponse.statusCode, 405);
  assert.equal(methodResponse.payload.code, 'METHOD_NOT_ALLOWED');
  assert.equal(methodResponse.headers.allow, 'GET');
  assert.equal(methodResponse.headers['cache-control'], 'no-store, private, max-age=0');
  assert.equal(methodResponse.headers.pragma, 'no-cache');
  assert.equal(methodResponse.headers['x-content-type-options'], 'nosniff');
  assert.equal(methodResponse.headers.vary, 'Authorization');
  assert.equal(
    methodResponse.headers['x-municontrol-contract'],
    releaseTruthContract.API_CONTRACTS['/api/municipal-territory'] || MUNICIPAL_TERRITORY_SCHEMA_VERSION,
  );
  assert.equal(authenticated, false);

  const payload = await loadReady();
  const calls = [];
  const handler = createMunicipalTerritoryHandler({
    requireCapabilityImpl: async (_req, _res, resource, action) => {
      calls.push(['auth', resource, action]);
      return { id: 'official', role: 'INTENDENTE', tenantId: 'junin' };
    },
    loadMunicipalTerritoryImpl: async () => {
      calls.push(['load']);
      return payload;
    },
  });
  const response = responseRecorder();
  await handler({
    method: 'GET',
    headers: {},
    query: { departamento: '00000', url: 'https://attacker.invalid', cql: 'INCLUDE' },
  }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload, payload);
  assert.deepEqual(calls, [
    ['auth', MUNICIPAL_TERRITORY_RESOURCE, routePolicy.ACTIONS.READ],
    ['load'],
  ]);
  assert.equal(MUNICIPAL_TERRITORY_RESOURCE, 'municipal.territory');
});

test('denied identity never loads and source/contract failures return a generic 503 without caching details', async () => {
  let loads = 0;
  const denied = createMunicipalTerritoryHandler({
    requireCapabilityImpl: async (_req, res) => {
      res.status(403).json({ code: 'ROUTE_PERMISSION_DENIED' });
      return null;
    },
    loadMunicipalTerritoryImpl: async () => { loads += 1; },
  });
  const deniedResponse = responseRecorder();
  await denied({ method: 'GET', headers: {}, query: {} }, deniedResponse);
  assert.equal(deniedResponse.statusCode, 403);
  assert.equal(loads, 0);

  for (const loadMunicipalTerritoryImpl of [
    async () => { throw new Error('private upstream detail'); },
    async () => ({ schemaVersion: 'forged' }),
  ]) {
    await withQuietErrors(async () => {
      const handler = createMunicipalTerritoryHandler({
        requireCapabilityImpl: async () => ({ id: 'official', role: 'INTENDENTE' }),
        loadMunicipalTerritoryImpl,
      });
      const response = responseRecorder();
      await handler({ method: 'GET', headers: {}, query: {} }, response);
      assert.equal(response.statusCode, 503);
      assert.deepEqual(response.payload, {
        error: 'La referencia territorial oficial no está disponible temporalmente.',
        code: 'MUNICIPAL_TERRITORY_UNAVAILABLE',
      });
      assert.doesNotMatch(JSON.stringify(response.payload), /private upstream detail/i);
    });
  }
});
