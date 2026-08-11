import {
  MUNICIPAL_TERRITORY_ACCESS_ISSUE,
  MUNICIPAL_TERRITORY_BASEMAPS,
  MUNICIPAL_TERRITORY_CRS,
  MUNICIPAL_TERRITORY_DEPARTMENT_ID,
  MUNICIPAL_TERRITORY_LIMITS,
  MUNICIPAL_TERRITORY_LOCALITIES,
  MUNICIPAL_TERRITORY_SCHEMA_VERSION,
  MUNICIPAL_TERRITORY_SOURCE_DESCRIPTORS,
  inspectMunicipalTerritoryBoundary,
  inspectMunicipalTerritoryContract,
} from './municipal-territory-contract.js';

export const MUNICIPAL_TERRITORY_IGN_URL =
  'https://wms.ign.gob.ar/geoserver/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ign%3Adepartamento&CQL_FILTER=in1%3D%2706413%27&outputFormat=application%2Fjson&srsName=EPSG%3A4326';
export const MUNICIPAL_TERRITORY_GEOREF_URL =
  'https://apis.datos.gob.ar/georef/api/localidades?departamento=06413&campos=id,nombre,centroide&max=100&formato=json';
export const MUNICIPAL_TERRITORY_FETCH_TIMEOUT_MS = 7_000;
export const MUNICIPAL_TERRITORY_CACHE_TTL_MS = 180_000;

const MAX_IGN_RESPONSE_BYTES = 512 * 1024;
const MAX_GEOREF_RESPONSE_BYTES = 128 * 1024;
const JSON_CONTENT_TYPE = /^application\/(?:json|geo\+json)(?:\s*;|$)/i;
const GEOREF_TOP_LEVEL_KEYS = Object.freeze(['cantidad', 'inicio', 'localidades', 'parametros', 'total']);
const GEOREF_LOCALITY_KEYS = Object.freeze(['centroide', 'id', 'nombre']);
const GEOREF_CENTROID_KEYS = Object.freeze(['lat', 'lon']);
const GEOREF_PARAMETER_KEYS = Object.freeze(['campos', 'departamento', 'formato', 'max']);

export class MunicipalTerritorySourceError extends Error {
  constructor(code) {
    super(code);
    this.name = 'MunicipalTerritorySourceError';
    this.code = code;
  }
}

function fail(code) {
  throw new MunicipalTerritorySourceError(code);
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, expected) {
  if (!plainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function fixedSourceUrl(value, expected, expectedEndpoint) {
  if (value !== expected) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '' &&
      parsed.hash === '' && `${parsed.origin}${parsed.pathname}` === expectedEndpoint;
  } catch {
    return false;
  }
}

function responseHeader(response, name) {
  return typeof response?.headers?.get === 'function' ? response.headers.get(name) : null;
}

async function cancelReader(reader, reason) {
  if (typeof reader?.cancel !== 'function') return;
  try {
    await reader.cancel(reason);
  } catch {
    // The request is already being aborted; cancellation is best-effort cleanup.
  }
}

async function readBoundedUtf8Body({
  response,
  controller,
  maximumBytes,
  timeout,
  failureCode,
}) {
  const reader = response?.body?.getReader?.();
  if (!reader || typeof reader.read !== 'function') fail(`${failureCode}_BODY`);

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const fragments = [];
  let receivedBytes = 0;
  let completed = false;
  let cancelled = false;

  try {
    while (true) {
      const result = await Promise.race([
        Promise.resolve().then(() => reader.read()),
        timeout,
      ]);
      if (!plainObject(result) || typeof result.done !== 'boolean') {
        fail(`${failureCode}_BODY`);
      }
      if (result.done) {
        completed = true;
        break;
      }
      if (!(result.value instanceof Uint8Array)) fail(`${failureCode}_BODY`);

      receivedBytes += result.value.byteLength;
      if (receivedBytes > maximumBytes) {
        controller.abort();
        await cancelReader(reader, `${failureCode}_SIZE`);
        cancelled = true;
        fail(`${failureCode}_SIZE`);
      }
      fragments.push(decoder.decode(result.value, { stream: true }));
    }
    fragments.push(decoder.decode());
    return fragments.join('');
  } catch (error) {
    if (error instanceof MunicipalTerritorySourceError) throw error;
    fail(`${failureCode}_BODY`);
  } finally {
    if (!completed && !cancelled) await cancelReader(reader, `${failureCode}_BODY`);
    if (typeof reader.releaseLock === 'function') {
      try {
        reader.releaseLock();
      } catch {
        // A cancelled/aborted stream may already have released its reader.
      }
    }
  }
}

async function fetchFixedJson({
  fetchImpl,
  url,
  expectedUrl,
  endpoint,
  maximumBytes,
  timeoutMs,
  failureCode,
}) {
  if (!fixedSourceUrl(url, expectedUrl, endpoint)) fail(`${failureCode}_URL`);
  const controller = new AbortController();
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new MunicipalTerritorySourceError(`${failureCode}_TIMEOUT`));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      Promise.resolve().then(() => fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
      })),
      timeout,
    ]);
    if (!response || response.ok !== true || response.status !== 200 || response.redirected === true) {
      fail(`${failureCode}_HTTP`);
    }
    const contentType = responseHeader(response, 'content-type');
    if (typeof contentType !== 'string' || !JSON_CONTENT_TYPE.test(contentType)) {
      fail(`${failureCode}_CONTENT_TYPE`);
    }
    const declaredLength = responseHeader(response, 'content-length');
    if (declaredLength !== null) {
      if (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumBytes) {
        fail(`${failureCode}_SIZE`);
      }
    }
    const text = await readBoundedUtf8Body({
      response,
      controller,
      maximumBytes,
      timeout,
      failureCode,
    });
    try {
      return JSON.parse(text);
    } catch {
      fail(`${failureCode}_JSON`);
    }
  } catch (error) {
    if (error instanceof MunicipalTerritorySourceError) throw error;
    fail(failureCode);
  } finally {
    clearTimeout(timeoutId);
  }
}

function cloneCoordinates(value) {
  if (!Array.isArray(value)) fail('IGN_BOUNDARY_INVALID');
  return value.map((polygon) => {
    if (!Array.isArray(polygon)) fail('IGN_BOUNDARY_INVALID');
    return polygon.map((ring) => {
      if (!Array.isArray(ring)) fail('IGN_BOUNDARY_INVALID');
      return ring.map((position) => {
        if (!Array.isArray(position)) fail('IGN_BOUNDARY_INVALID');
        return [...position];
      });
    });
  });
}

function coordinatesBbox(coordinates) {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of coordinates) {
    for (const ring of polygon) {
      for (const position of ring) {
        if (!Array.isArray(position) || position.length !== 2 ||
            !Number.isFinite(position[0]) || !Number.isFinite(position[1])) {
          fail('IGN_BOUNDARY_INVALID');
        }
        bbox[0] = Math.min(bbox[0], position[0]);
        bbox[1] = Math.min(bbox[1], position[1]);
        bbox[2] = Math.max(bbox[2], position[0]);
        bbox[3] = Math.max(bbox[3], position[1]);
      }
    }
  }
  return bbox;
}

export function projectIgnDepartmentBoundary(value) {
  if (!plainObject(value) || value.type !== 'FeatureCollection' ||
      !Array.isArray(value.features) || value.features.length !== 1) {
    fail('IGN_BOUNDARY_INVALID');
  }
  const feature = value.features[0];
  const properties = feature?.properties;
  if (!plainObject(feature) || feature.type !== 'Feature' || !plainObject(properties) ||
      properties.in1 !== MUNICIPAL_TERRITORY_DEPARTMENT_ID ||
      properties.nam !== 'Junín' || properties.fna !== 'Partido de Junín' ||
      properties.objeto !== 'Departamento' || properties.gna !== 'Partido' ||
      properties.sag !== 'IGN' ||
      properties.fdc !== 'ARBA - Gerencia de Servicios Catastrales' ||
      feature?.geometry?.type !== 'MultiPolygon') {
    fail('IGN_BOUNDARY_INVALID');
  }
  const coordinates = cloneCoordinates(feature.geometry.coordinates);
  const boundary = {
    type: 'Feature',
    id: MUNICIPAL_TERRITORY_DEPARTMENT_ID,
    bbox: coordinatesBbox(coordinates),
    properties: {
      name: 'Junín',
      sourceId: 'ign:departamento:06413',
    },
    geometry: { type: 'MultiPolygon', coordinates },
  };
  if (!inspectMunicipalTerritoryBoundary(boundary).ok) fail('IGN_BOUNDARY_INVALID');
  return boundary;
}

export function projectGeorefLocalities(value) {
  if (!exactKeys(value, GEOREF_TOP_LEVEL_KEYS) || value.cantidad !== 7 || value.total !== 7 ||
      value.inicio !== 0 || !Array.isArray(value.localidades) || value.localidades.length !== 7 ||
      !exactKeys(value.parametros, GEOREF_PARAMETER_KEYS) ||
      !Array.isArray(value.parametros.campos) ||
      JSON.stringify(value.parametros.campos) !== JSON.stringify(['id', 'nombre', 'centroide.lat', 'centroide.lon']) ||
      JSON.stringify(value.parametros.departamento) !== JSON.stringify(['06413']) ||
      value.parametros.formato !== 'json' || value.parametros.max !== 100) {
    fail('GEOREF_LOCALITIES_INVALID');
  }

  const byId = new Map();
  for (const locality of value.localidades) {
    if (!exactKeys(locality, GEOREF_LOCALITY_KEYS) ||
        !exactKeys(locality.centroide, GEOREF_CENTROID_KEYS) ||
        typeof locality.id !== 'string' || byId.has(locality.id) ||
        typeof locality.nombre !== 'string' || !Number.isFinite(locality.centroide.lon) ||
        !Number.isFinite(locality.centroide.lat)) {
      fail('GEOREF_LOCALITIES_INVALID');
    }
    byId.set(locality.id, locality);
  }

  return MUNICIPAL_TERRITORY_LOCALITIES.map((expected) => {
    const locality = byId.get(expected.id);
    if (!locality || locality.nombre !== expected.name) fail('GEOREF_LOCALITIES_INVALID');
    return {
      id: expected.id,
      name: expected.name,
      centroid: {
        longitude: locality.centroide.lon,
        latitude: locality.centroide.lat,
      },
    };
  });
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function sourceDescriptor(status) {
  return {
    boundary: { ...MUNICIPAL_TERRITORY_SOURCE_DESCRIPTORS.boundary },
    localities: {
      ...MUNICIPAL_TERRITORY_SOURCE_DESCRIPTORS.localities,
      status: status === 'ready' ? 'available' : 'unavailable',
    },
  };
}

function territoryPayload({ queriedAt, boundary, localities, status }) {
  return {
    schemaVersion: MUNICIPAL_TERRITORY_SCHEMA_VERSION,
    status,
    query: {
      queriedAt,
      departmentId: MUNICIPAL_TERRITORY_DEPARTMENT_ID,
      crs: MUNICIPAL_TERRITORY_CRS,
    },
    source: sourceDescriptor(status),
    jurisdiction: {
      id: MUNICIPAL_TERRITORY_DEPARTMENT_ID,
      name: 'Junín',
      province: { id: '06', name: 'Buenos Aires' },
      country: { code: 'AR', name: 'Argentina' },
    },
    boundary,
    localities,
    basemaps: MUNICIPAL_TERRITORY_BASEMAPS.map((basemap) => ({ ...basemap })),
    accessIssues: status === 'ready' ? [] : [{ ...MUNICIPAL_TERRITORY_ACCESS_ISSUE }],
    limits: [...MUNICIPAL_TERRITORY_LIMITS],
  };
}

function timeValue(now) {
  const value = now();
  const milliseconds = value instanceof Date ? value.getTime() : value;
  if (!Number.isFinite(milliseconds)) fail('MUNICIPAL_TERRITORY_CLOCK_INVALID');
  return milliseconds;
}

export function createMunicipalTerritorySource({
  fetchImpl = globalThis.fetch,
  now = Date.now,
  timeoutMs = MUNICIPAL_TERRITORY_FETCH_TIMEOUT_MS,
  cacheTtlMs = MUNICIPAL_TERRITORY_CACHE_TTL_MS,
} = {}) {
  if (typeof fetchImpl !== 'function' || typeof now !== 'function' ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 ||
      !Number.isSafeInteger(cacheTtlMs) || cacheTtlMs < 1) {
    throw new TypeError('Invalid municipal territory source configuration');
  }
  let cachedPayload = null;
  let cacheExpiresAt = 0;
  let inFlight = null;

  async function loadFresh(startedAt) {
    const boundaryRequest = fetchFixedJson({
      fetchImpl,
      url: MUNICIPAL_TERRITORY_IGN_URL,
      expectedUrl: MUNICIPAL_TERRITORY_IGN_URL,
      endpoint: MUNICIPAL_TERRITORY_SOURCE_DESCRIPTORS.boundary.endpoint,
      maximumBytes: MAX_IGN_RESPONSE_BYTES,
      timeoutMs,
      failureCode: 'IGN_SOURCE_UNAVAILABLE',
    }).then(projectIgnDepartmentBoundary);
    const localitiesRequest = fetchFixedJson({
      fetchImpl,
      url: MUNICIPAL_TERRITORY_GEOREF_URL,
      expectedUrl: MUNICIPAL_TERRITORY_GEOREF_URL,
      endpoint: MUNICIPAL_TERRITORY_SOURCE_DESCRIPTORS.localities.endpoint,
      maximumBytes: MAX_GEOREF_RESPONSE_BYTES,
      timeoutMs,
      failureCode: 'GEOREF_SOURCE_UNAVAILABLE',
    }).then(projectGeorefLocalities);

    const [boundaryResult, localitiesResult] = await Promise.allSettled([
      boundaryRequest,
      localitiesRequest,
    ]);
    if (boundaryResult.status !== 'fulfilled') fail('IGN_SOURCE_UNAVAILABLE');

    const queriedAt = new Date(startedAt).toISOString();
    if (localitiesResult.status === 'fulfilled') {
      const ready = territoryPayload({
        queriedAt,
        boundary: boundaryResult.value,
        localities: localitiesResult.value,
        status: 'ready',
      });
      const inspection = inspectMunicipalTerritoryContract(ready);
      if (inspection.ok) return deepFreeze(ready);
      if (!inspection.errors.every((error) => error.startsWith('localities.'))) {
        fail('MUNICIPAL_TERRITORY_CONTRACT_INVALID');
      }
    }

    const partial = territoryPayload({
      queriedAt,
      boundary: boundaryResult.value,
      localities: [],
      status: 'partial',
    });
    if (!inspectMunicipalTerritoryContract(partial).ok) {
      fail('MUNICIPAL_TERRITORY_CONTRACT_INVALID');
    }
    return deepFreeze(partial);
  }

  async function load() {
    const startedAt = timeValue(now);
    if (cachedPayload && startedAt < cacheExpiresAt) return cachedPayload;
    if (inFlight) return inFlight;
    const operation = loadFresh(startedAt);
    inFlight = operation;
    try {
      const payload = await operation;
      if (!inspectMunicipalTerritoryContract(payload).ok) {
        fail('MUNICIPAL_TERRITORY_CONTRACT_INVALID');
      }
      cachedPayload = payload;
      cacheExpiresAt = startedAt + cacheTtlMs;
      return payload;
    } finally {
      if (inFlight === operation) inFlight = null;
    }
  }

  function clearCache() {
    cachedPayload = null;
    cacheExpiresAt = 0;
  }

  return Object.freeze({ load, clearCache });
}

const defaultMunicipalTerritorySource = createMunicipalTerritorySource();

export function loadMunicipalTerritory() {
  return defaultMunicipalTerritorySource.load();
}
