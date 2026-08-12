const ENDPOINT = '/api/municipal-territory';
const CONTRACT_HEADER = 'x-municontrol-contract';
export const TERRITORY_SCHEMA_VERSION = 'municipal-territory-v2';
const REQUEST_TIMEOUT_MS = 15_000;

const BOUNDARY_SOURCE = Object.freeze({
  id: 'ign-department-boundary',
  custodian: 'Instituto Geográfico Nacional (captura Oficina Provincial de Mendoza)',
  endpoint: 'https://wms.ign.gob.ar/geoserver/ows',
  dataset: 'ign:departamento',
  required: true,
  status: 'available',
} as const);

const LOCALITIES_SOURCE_BASE = Object.freeze({
  id: 'georef-localities',
  custodian: 'Servicio de Normalización de Direcciones y Unidades Territoriales de Argentina (Georef)',
  endpoint: 'https://apis.datos.gob.ar/georef/api/v2.0/localidades',
  dataset: 'localidades',
  required: false,
} as const);

const TILE_PREFIX = 'https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/';
const BASEMAP_DEFINITIONS = Object.freeze([
  {
    id: 'argenmap',
    label: 'Argenmap',
    theme: 'light',
    tileUrl: `${TILE_PREFIX}capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{-y}.png`,
  },
  {
    id: 'gris',
    label: 'Argenmap gris',
    theme: 'light',
    tileUrl: `${TILE_PREFIX}mapabase_gris@EPSG%3A3857@png/{z}/{x}/{-y}.png`,
  },
  {
    id: 'oscuro',
    label: 'Argenmap oscuro',
    theme: 'dark',
    tileUrl: `${TILE_PREFIX}argenmap_oscuro@EPSG%3A3857@png/{z}/{x}/{-y}.png`,
  },
  {
    id: 'topografico',
    label: 'Argenmap topográfico',
    theme: 'topographic',
    tileUrl: `${TILE_PREFIX}mapabase_topo@EPSG%3A3857@png/{z}/{x}/{-y}.png`,
  },
] as const);

const BASEMAP_ATTRIBUTION = 'Instituto Geográfico Nacional · Argenmap';
const OFFICIAL_LOCALITIES = Object.freeze([
  Object.freeze({ id: '50035010', name: 'Ingeniero Giagnoni' }),
  Object.freeze({ id: '50035020', name: 'Junín' }),
  Object.freeze({ id: '50035030', name: 'La Colonia' }),
  Object.freeze({ id: '50035040', name: 'Los Barriales' }),
  Object.freeze({ id: '50035050', name: 'Medrano' }),
  Object.freeze({ id: '50035060', name: 'Phillips' }),
  Object.freeze({ id: '50035070', name: 'Rodríguez Peña' }),
] as const);

const REQUIRED_LIMITS = Object.freeze([
  'territorial_reference_only',
  'no_grh_layers',
  'no_public_works_layers',
  'no_claims_layers',
  'not_realtime',
] as const);

const PARTIAL_ISSUE = Object.freeze({
  sourceId: 'georef-localities',
  code: 'LOCALITIES_SOURCE_UNAVAILABLE',
  message: 'Las localidades oficiales no están disponibles temporalmente.',
} as const);

const SHAPES = Object.freeze({
  contract: ['schemaVersion', 'status', 'query', 'source', 'jurisdiction', 'boundary', 'localities', 'basemaps', 'accessIssues', 'limits'],
  query: ['queriedAt', 'departmentId', 'crs'],
  source: ['boundary', 'localities'],
  sourceDescriptor: ['id', 'custodian', 'endpoint', 'dataset', 'required', 'status'],
  jurisdiction: ['id', 'name', 'province', 'country'],
  province: ['id', 'name'],
  country: ['code', 'name'],
  feature: ['type', 'id', 'bbox', 'properties', 'geometry'],
  properties: ['name', 'sourceId'],
  geometry: ['type', 'coordinates'],
  locality: ['id', 'name', 'centroid'],
  centroid: ['longitude', 'latitude'],
  basemap: ['id', 'label', 'theme', 'protocol', 'tileUrl', 'attribution', 'minZoom', 'maxZoom'],
  issue: ['sourceId', 'code', 'message'],
} as const);

type JsonRecord = Record<string, unknown>;
type Position = readonly [number, number];
type LinearRing = readonly Position[];
type PolygonCoordinates = readonly LinearRing[];
export type MultiPolygonCoordinates = readonly PolygonCoordinates[];

export interface TerritorySourceDescriptor {
  readonly id: string;
  readonly custodian: string;
  readonly endpoint: string;
  readonly dataset: string;
  readonly required: boolean;
  readonly status: 'available' | 'unavailable';
}

export interface TerritoryLocality {
  readonly id: string;
  readonly name: string;
  readonly centroid: {
    readonly longitude: number;
    readonly latitude: number;
  };
}

export interface TerritoryBasemap {
  readonly id: 'argenmap' | 'gris' | 'oscuro' | 'topografico';
  readonly label: string;
  readonly theme: 'light' | 'dark' | 'topographic';
  readonly protocol: 'tms';
  readonly tileUrl: string;
  readonly attribution: string;
  readonly minZoom: 3;
  readonly maxZoom: 18;
}

export interface MunicipalTerritoryContract {
  readonly schemaVersion: typeof TERRITORY_SCHEMA_VERSION;
  readonly status: 'ready' | 'partial';
  readonly query: {
    readonly queriedAt: string;
    readonly departmentId: '50035';
    readonly crs: 'EPSG:4326';
  };
  readonly source: {
    readonly boundary: TerritorySourceDescriptor;
    readonly localities: TerritorySourceDescriptor;
  };
  readonly jurisdiction: {
    readonly id: '50035';
    readonly name: 'Junín';
    readonly province: { readonly id: '50'; readonly name: 'Mendoza' };
    readonly country: { readonly code: 'AR'; readonly name: 'Argentina' };
  };
  readonly boundary: {
    readonly type: 'Feature';
    readonly id: '50035';
    readonly bbox: readonly [number, number, number, number];
    readonly properties: {
      readonly name: 'Junín';
      readonly sourceId: 'ign:departamento:50035';
    };
    readonly geometry: {
      readonly type: 'MultiPolygon';
      readonly coordinates: MultiPolygonCoordinates;
    };
  };
  readonly localities: readonly TerritoryLocality[];
  readonly basemaps: readonly TerritoryBasemap[];
  readonly accessIssues: readonly {
    readonly sourceId: string;
    readonly code: string;
    readonly message: string;
  }[];
  readonly limits: typeof REQUIRED_LIMITS;
}

function record(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: unknown, expected: readonly string[]): value is JsonRecord {
  if (!record(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function exactRecord(value: unknown, expected: Readonly<JsonRecord>): boolean {
  if (!exactKeys(value, Object.keys(expected))) return false;
  return Object.entries(expected).every(([key, expectedValue]) => value[key] === expectedValue);
}

function safeText(value: unknown, maxLength = 180): value is string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || value.length > maxLength) return false;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 31 || codeUnit === 127) return false;
  }
  return true;
}

function finiteCoordinate(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function samePosition(left: Position, right: Position): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function readCoordinates(value: unknown): MultiPolygonCoordinates | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) return null;
  let pointCount = 0;
  const coordinates: Position[][][] = [];

  for (const polygonValue of value) {
    if (!Array.isArray(polygonValue) || polygonValue.length === 0 || polygonValue.length > 64) return null;
    const polygon: Position[][] = [];
    for (const ringValue of polygonValue) {
      if (!Array.isArray(ringValue) || ringValue.length < 4 || ringValue.length > 20_000) return null;
      const ring: Position[] = [];
      for (const positionValue of ringValue) {
        if (!Array.isArray(positionValue) || positionValue.length !== 2 ||
            !finiteCoordinate(positionValue[0], -68.8, -68.1) || !finiteCoordinate(positionValue[1], -33.4, -32.9)) {
          return null;
        }
        ring.push([positionValue[0], positionValue[1]]);
        pointCount += 1;
        if (pointCount > 20_000) return null;
      }
      const first = ring[0];
      const last = ring.at(-1);
      if (!first || !last || !samePosition(first, last)) return null;
      let twiceArea = 0;
      for (let index = 0; index < ring.length - 1; index += 1) {
        const left = ring[index];
        const right = ring[index + 1];
        if (!left || !right) return null;
        twiceArea += (left[0] * right[1]) - (right[0] * left[1]);
      }
      if (Math.abs(twiceArea / 2) <= 1e-10) return null;
      polygon.push(ring);
    }
    coordinates.push(polygon);
  }
  return coordinates;
}

function validBbox(value: unknown, coordinates: MultiPolygonCoordinates): value is [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4 ||
      !finiteCoordinate(value[0], -180, 180) || !finiteCoordinate(value[1], -90, 90) ||
      !finiteCoordinate(value[2], -180, 180) || !finiteCoordinate(value[3], -90, 90) ||
      value[0] >= value[2] || value[1] >= value[3]) return false;

  let minimumLongitude = Infinity;
  let minimumLatitude = Infinity;
  let maximumLongitude = -Infinity;
  let maximumLatitude = -Infinity;
  for (const polygon of coordinates) {
    for (const ring of polygon) {
      for (const [longitude, latitude] of ring) {
        minimumLongitude = Math.min(minimumLongitude, longitude);
        minimumLatitude = Math.min(minimumLatitude, latitude);
        maximumLongitude = Math.max(maximumLongitude, longitude);
        maximumLatitude = Math.max(maximumLatitude, latitude);
      }
    }
  }
  return value[0] === minimumLongitude && value[1] === minimumLatitude &&
    value[2] === maximumLongitude && value[3] === maximumLatitude;
}

function pointOnSegment(point: Position, start: Position, end: Position): boolean {
  const cross = (point[1] - start[1]) * (end[0] - start[0]) -
    (point[0] - start[0]) * (end[1] - start[1]);
  if (Math.abs(cross) > 1e-10) return false;
  return point[0] >= Math.min(start[0], end[0]) && point[0] <= Math.max(start[0], end[0]) &&
    point[1] >= Math.min(start[1], end[1]) && point[1] <= Math.max(start[1], end[1]);
}

function pointInRing(point: Position, ring: LinearRing): { inside: boolean; boundary: boolean } {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (!currentPoint || !previousPoint) return { inside: false, boundary: false };
    if (pointOnSegment(point, previousPoint, currentPoint)) return { inside: true, boundary: true };
    const crosses = (currentPoint[1] > point[1]) !== (previousPoint[1] > point[1]) &&
      point[0] < ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) /
        (previousPoint[1] - currentPoint[1]) + currentPoint[0];
    if (crosses) inside = !inside;
  }
  return { inside, boundary: false };
}

function pointInMultiPolygon(point: Position, coordinates: MultiPolygonCoordinates): boolean {
  return coordinates.some((polygon) => {
    const exterior = polygon[0];
    if (!exterior || !pointInRing(point, exterior).inside) return false;
    for (const hole of polygon.slice(1)) {
      const result = pointInRing(point, hole);
      if (result.boundary) return true;
      if (result.inside) return false;
    }
    return true;
  });
}

function validBoundary(value: unknown): value is MunicipalTerritoryContract['boundary'] {
  if (!exactKeys(value, SHAPES.feature) || value.type !== 'Feature' || value.id !== '50035' ||
      !exactRecord(value.properties, { name: 'Junín', sourceId: 'ign:departamento:50035' }) ||
      !exactKeys(value.geometry, SHAPES.geometry) || value.geometry.type !== 'MultiPolygon') return false;
  const coordinates = readCoordinates(value.geometry.coordinates);
  return coordinates !== null && validBbox(value.bbox, coordinates);
}

function validSource(value: unknown, status: 'ready' | 'partial'): boolean {
  if (!exactKeys(value, SHAPES.source) || !exactRecord(value.boundary, BOUNDARY_SOURCE)) return false;
  const expectedLocalities = {
    ...LOCALITIES_SOURCE_BASE,
    status: status === 'ready' ? 'available' : 'unavailable',
  };
  return exactRecord(value.localities, expectedLocalities);
}

function validLocalities(
  value: unknown,
  status: 'ready' | 'partial',
  coordinates: MultiPolygonCoordinates,
): value is readonly TerritoryLocality[] {
  if (!Array.isArray(value) || value.length !== (status === 'ready' ? 7 : 0)) return false;
  for (const [index, locality] of value.entries()) {
    const expected = OFFICIAL_LOCALITIES[index];
    if (!exactKeys(locality, SHAPES.locality) || !safeText(locality.id, 80) || !safeText(locality.name, 120) ||
        !exactKeys(locality.centroid, SHAPES.centroid) ||
        !finiteCoordinate(locality.centroid.longitude, -68.8, -68.1) ||
        !finiteCoordinate(locality.centroid.latitude, -33.4, -32.9)) return false;
    if (!expected || locality.id !== expected.id || locality.name !== expected.name ||
        !pointInMultiPolygon([locality.centroid.longitude, locality.centroid.latitude], coordinates)) return false;
  }
  return true;
}

function validBasemaps(value: unknown): value is readonly TerritoryBasemap[] {
  if (!Array.isArray(value) || value.length !== BASEMAP_DEFINITIONS.length) return false;
  return value.every((basemap, index) => {
    const expected = BASEMAP_DEFINITIONS[index];
    if (!expected || !exactKeys(basemap, SHAPES.basemap)) return false;
    return basemap.id === expected.id && basemap.label === expected.label &&
      basemap.theme === expected.theme && basemap.protocol === 'tms' && basemap.tileUrl === expected.tileUrl &&
      basemap.attribution === BASEMAP_ATTRIBUTION && basemap.minZoom === 3 && basemap.maxZoom === 18;
  });
}

function validIssues(value: unknown, status: 'ready' | 'partial'): boolean {
  if (!Array.isArray(value)) return false;
  if (status === 'ready') return value.length === 0;
  return value.length === 1 && exactRecord(value[0], PARTIAL_ISSUE);
}

function validLimits(value: unknown): value is typeof REQUIRED_LIMITS {
  return Array.isArray(value) && value.length === REQUIRED_LIMITS.length &&
    value.every((item, index) => item === REQUIRED_LIMITS[index]);
}

function validQuery(value: unknown): boolean {
  if (!exactKeys(value, SHAPES.query) || value.departmentId !== '50035' || value.crs !== 'EPSG:4326' ||
      typeof value.queriedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.queriedAt)) return false;
  try {
    return new Date(value.queriedAt).toISOString() === value.queriedAt;
  } catch {
    return false;
  }
}

export function validateMunicipalTerritoryContract(value: unknown): value is MunicipalTerritoryContract {
  try {
    if (!exactKeys(value, SHAPES.contract) || value.schemaVersion !== TERRITORY_SCHEMA_VERSION ||
        (value.status !== 'ready' && value.status !== 'partial') || !validQuery(value.query) ||
        !validSource(value.source, value.status) ||
        !exactKeys(value.jurisdiction, SHAPES.jurisdiction) || value.jurisdiction.id !== '50035' ||
        value.jurisdiction.name !== 'Junín' || !exactRecord(value.jurisdiction.province, { id: '50', name: 'Mendoza' }) ||
        !exactRecord(value.jurisdiction.country, { code: 'AR', name: 'Argentina' }) ||
        !validBoundary(value.boundary) || !validBasemaps(value.basemaps) ||
        !validIssues(value.accessIssues, value.status) || !validLimits(value.limits)) return false;

    return validLocalities(value.localities, value.status, value.boundary.geometry.coordinates);
  } catch {
    return false;
  }
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object') return value;
  const objectValue = value as object;
  if (seen.has(objectValue)) return value;
  seen.add(objectValue);
  for (const nested of Object.values(value as JsonRecord)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

interface AuthenticatedClient {
  fetch(input: string, init: RequestInit): Promise<Response>;
}

function authenticatedClient(): AuthenticatedClient {
  const candidate = (window as Window & { MuniAuth?: unknown }).MuniAuth;
  if (!record(candidate) || typeof candidate.fetch !== 'function') throw new Error('TERRITORY_CLIENT_UNAVAILABLE');
  return candidate;
}

function jsonContentType(response: Response): boolean {
  const value = response.headers.get('content-type');
  return typeof value === 'string' &&
    /^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|\s*$)/i.test(value);
}

export async function fetchMunicipalTerritory(signal: AbortSignal): Promise<MunicipalTerritoryContract> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal.aborted) controller.abort();
  else signal.addEventListener('abort', onAbort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await authenticatedClient().fetch(ENDPOINT, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok || response.status !== 200 || !jsonContentType(response) ||
        response.headers.get(CONTRACT_HEADER) !== TERRITORY_SCHEMA_VERSION) {
      throw new Error('TERRITORY_RESPONSE_UNAVAILABLE');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('TERRITORY_RESPONSE_INVALID_JSON');
    }
    if (!validateMunicipalTerritoryContract(payload)) throw new Error('TERRITORY_CONTRACT_INVALID');
    return deepFreeze(payload);
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener('abort', onAbort);
  }
}
