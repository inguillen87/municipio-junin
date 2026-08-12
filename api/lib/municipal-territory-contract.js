export const MUNICIPAL_TERRITORY_SCHEMA_VERSION = 'municipal-territory-v2';
export const MUNICIPAL_TERRITORY_DEPARTMENT_ID = '50035';
export const MUNICIPAL_TERRITORY_CRS = 'EPSG:4326';
export const MUNICIPAL_TERRITORY_MAX_VERTICES = 20_000;

export const MUNICIPAL_TERRITORY_LIMITS = Object.freeze([
  'territorial_reference_only',
  'no_grh_layers',
  'no_public_works_layers',
  'no_claims_layers',
  'not_realtime',
]);

export const MUNICIPAL_TERRITORY_ACCESS_ISSUE = Object.freeze({
  sourceId: 'georef-localities',
  code: 'LOCALITIES_SOURCE_UNAVAILABLE',
  message: 'Las localidades oficiales no están disponibles temporalmente.',
});

export const MUNICIPAL_TERRITORY_SOURCE_DESCRIPTORS = Object.freeze({
  boundary: Object.freeze({
    id: 'ign-department-boundary',
    custodian: 'Instituto Geográfico Nacional (captura Oficina Provincial de Mendoza)',
    endpoint: 'https://wms.ign.gob.ar/geoserver/ows',
    dataset: 'ign:departamento',
    required: true,
    status: 'available',
  }),
  localities: Object.freeze({
    id: 'georef-localities',
    custodian: 'Servicio de Normalización de Direcciones y Unidades Territoriales de Argentina (Georef)',
    endpoint: 'https://apis.datos.gob.ar/georef/api/v2.0/localidades',
    dataset: 'localidades',
    required: false,
  }),
});

const TMS_PREFIX = 'https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/';
const TMS_SUFFIX = '@EPSG%3A3857@png/{z}/{x}/{-y}.png';
const BASEMAP_ATTRIBUTION = 'Instituto Geográfico Nacional · Argenmap';

export const MUNICIPAL_TERRITORY_BASEMAPS = Object.freeze([
  Object.freeze({
    id: 'argenmap',
    label: 'Argenmap',
    theme: 'light',
    protocol: 'tms',
    tileUrl: `${TMS_PREFIX}capabaseargenmap${TMS_SUFFIX}`,
    attribution: BASEMAP_ATTRIBUTION,
    minZoom: 3,
    maxZoom: 18,
  }),
  Object.freeze({
    id: 'gris',
    label: 'Argenmap gris',
    theme: 'light',
    protocol: 'tms',
    tileUrl: `${TMS_PREFIX}mapabase_gris${TMS_SUFFIX}`,
    attribution: BASEMAP_ATTRIBUTION,
    minZoom: 3,
    maxZoom: 18,
  }),
  Object.freeze({
    id: 'oscuro',
    label: 'Argenmap oscuro',
    theme: 'dark',
    protocol: 'tms',
    tileUrl: `${TMS_PREFIX}argenmap_oscuro${TMS_SUFFIX}`,
    attribution: BASEMAP_ATTRIBUTION,
    minZoom: 3,
    maxZoom: 18,
  }),
  Object.freeze({
    id: 'topografico',
    label: 'Argenmap topográfico',
    theme: 'topographic',
    protocol: 'tms',
    tileUrl: `${TMS_PREFIX}mapabase_topo${TMS_SUFFIX}`,
    attribution: BASEMAP_ATTRIBUTION,
    minZoom: 3,
    maxZoom: 18,
  }),
]);

export const MUNICIPAL_TERRITORY_LOCALITIES = Object.freeze([
  Object.freeze({ id: '50035010', name: 'Ingeniero Giagnoni' }),
  Object.freeze({ id: '50035020', name: 'Junín' }),
  Object.freeze({ id: '50035030', name: 'La Colonia' }),
  Object.freeze({ id: '50035040', name: 'Los Barriales' }),
  Object.freeze({ id: '50035050', name: 'Medrano' }),
  Object.freeze({ id: '50035060', name: 'Phillips' }),
  Object.freeze({ id: '50035070', name: 'Rodríguez Peña' }),
]);

const TOP_LEVEL_KEYS = Object.freeze([
  'schemaVersion',
  'status',
  'query',
  'source',
  'jurisdiction',
  'boundary',
  'localities',
  'basemaps',
  'accessIssues',
  'limits',
]);
const QUERY_KEYS = Object.freeze(['queriedAt', 'departmentId', 'crs']);
const SOURCE_KEYS = Object.freeze(['boundary', 'localities']);
const SOURCE_DESCRIPTOR_KEYS = Object.freeze([
  'id',
  'custodian',
  'endpoint',
  'dataset',
  'required',
  'status',
]);
const JURISDICTION_KEYS = Object.freeze(['id', 'name', 'province', 'country']);
const PROVINCE_KEYS = Object.freeze(['id', 'name']);
const COUNTRY_KEYS = Object.freeze(['code', 'name']);
const FEATURE_KEYS = Object.freeze(['type', 'id', 'bbox', 'properties', 'geometry']);
const FEATURE_PROPERTY_KEYS = Object.freeze(['name', 'sourceId']);
const GEOMETRY_KEYS = Object.freeze(['type', 'coordinates']);
const LOCALITY_KEYS = Object.freeze(['id', 'name', 'centroid']);
const CENTROID_KEYS = Object.freeze(['longitude', 'latitude']);
const BASEMAP_KEYS = Object.freeze([
  'id',
  'label',
  'theme',
  'protocol',
  'tileUrl',
  'attribution',
  'minZoom',
  'maxZoom',
]);
const ACCESS_ISSUE_KEYS = Object.freeze(['sourceId', 'code', 'message']);
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const JUNIN_COORDINATE_BOUNDS = Object.freeze({
  minimumLongitude: -68.8,
  maximumLongitude: -68.1,
  minimumLatitude: -33.4,
  maximumLatitude: -32.9,
});
const EPSILON = 1e-10;

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

function add(errors, condition, code) {
  if (!condition) errors.push(code);
}

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function finiteCoordinate(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function coordinateIsInJuninBounds(longitude, latitude) {
  return finiteCoordinate(longitude) && finiteCoordinate(latitude) &&
    longitude >= JUNIN_COORDINATE_BOUNDS.minimumLongitude &&
    longitude <= JUNIN_COORDINATE_BOUNDS.maximumLongitude &&
    latitude >= JUNIN_COORDINATE_BOUNDS.minimumLatitude &&
    latitude <= JUNIN_COORDINATE_BOUNDS.maximumLatitude;
}

function positionsEqual(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === 2 && right.length === 2 &&
    left[0] === right[0] && left[1] === right[1];
}

function ringArea(ring) {
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [leftLongitude, leftLatitude] = ring[index];
    const [rightLongitude, rightLatitude] = ring[index + 1];
    twiceArea += (leftLongitude * rightLatitude) - (rightLongitude * leftLatitude);
  }
  return twiceArea / 2;
}

function inspectCoordinates(coordinates, errors) {
  add(errors,
    Array.isArray(coordinates) && coordinates.length > 0 && coordinates.length <= 16,
    'boundary.geometry.polygons');
  if (!Array.isArray(coordinates) || coordinates.length === 0 || coordinates.length > 16) return null;

  let vertexCount = 0;
  let minimumLongitude = Infinity;
  let minimumLatitude = Infinity;
  let maximumLongitude = -Infinity;
  let maximumLatitude = -Infinity;

  coordinates.forEach((polygon, polygonIndex) => {
    add(errors,
      Array.isArray(polygon) && polygon.length > 0 && polygon.length <= 64,
      `boundary.geometry.polygons.${polygonIndex}.rings`);
    if (!Array.isArray(polygon) || polygon.length === 0 || polygon.length > 64) return;

    polygon.forEach((ring, ringIndex) => {
      const path = `boundary.geometry.polygons.${polygonIndex}.rings.${ringIndex}`;
      add(errors, Array.isArray(ring) && ring.length >= 4, `${path}.vertices`);
      if (!Array.isArray(ring) || ring.length < 4) return;
      add(errors, positionsEqual(ring[0], ring[ring.length - 1]), `${path}.closed`);

      let ringCoordinatesValid = true;
      ring.forEach((position, positionIndex) => {
        const positionValid = Array.isArray(position) && position.length === 2 &&
          coordinateIsInJuninBounds(position[0], position[1]);
        add(errors, positionValid, `${path}.positions.${positionIndex}`);
        if (!positionValid) {
          ringCoordinatesValid = false;
          return;
        }
        vertexCount += 1;
        minimumLongitude = Math.min(minimumLongitude, position[0]);
        minimumLatitude = Math.min(minimumLatitude, position[1]);
        maximumLongitude = Math.max(maximumLongitude, position[0]);
        maximumLatitude = Math.max(maximumLatitude, position[1]);
      });
      if (ringCoordinatesValid) {
        add(errors, Math.abs(ringArea(ring)) > EPSILON, `${path}.area`);
      }
    });
  });

  add(errors,
    vertexCount >= 4 && vertexCount <= MUNICIPAL_TERRITORY_MAX_VERTICES,
    'boundary.geometry.vertexCount');
  if (vertexCount < 4 || vertexCount > MUNICIPAL_TERRITORY_MAX_VERTICES) return null;
  return [minimumLongitude, minimumLatitude, maximumLongitude, maximumLatitude];
}

function pointOnSegment([longitude, latitude], [startLongitude, startLatitude], [endLongitude, endLatitude]) {
  const squaredLength = ((endLongitude - startLongitude) ** 2) +
    ((endLatitude - startLatitude) ** 2);
  if (squaredLength <= EPSILON ** 2) {
    return ((longitude - startLongitude) ** 2) + ((latitude - startLatitude) ** 2) <= EPSILON ** 2;
  }
  const cross = ((latitude - startLatitude) * (endLongitude - startLongitude)) -
    ((longitude - startLongitude) * (endLatitude - startLatitude));
  if (Math.abs(cross) > EPSILON) return false;
  const dot = ((longitude - startLongitude) * (endLongitude - startLongitude)) +
    ((latitude - startLatitude) * (endLatitude - startLatitude));
  if (dot < -EPSILON) return false;
  return dot <= squaredLength + EPSILON;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (pointOnSegment(point, previousPoint, currentPoint)) return { inside: true, boundary: true };
    const intersects = ((currentPoint[1] > point[1]) !== (previousPoint[1] > point[1])) &&
      point[0] < (((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) /
        (previousPoint[1] - currentPoint[1])) + currentPoint[0];
    if (intersects) inside = !inside;
  }
  return { inside, boundary: false };
}

export function pointIsInsideMunicipalBoundary(longitude, latitude, coordinates) {
  if (!coordinateIsInJuninBounds(longitude, latitude) || !Array.isArray(coordinates)) return false;
  const point = [longitude, latitude];
  return coordinates.some((polygon) => {
    if (!Array.isArray(polygon) || !Array.isArray(polygon[0])) return false;
    const outer = pointInRing(point, polygon[0]);
    if (!outer.inside) return false;
    for (const hole of polygon.slice(1)) {
      if (!Array.isArray(hole)) return false;
      const result = pointInRing(point, hole);
      if (result.boundary) return true;
      if (result.inside) return false;
    }
    return true;
  });
}

export function inspectMunicipalTerritoryBoundary(boundary) {
  const errors = [];
  add(errors, exactKeys(boundary, FEATURE_KEYS), 'boundary.shape');
  add(errors, boundary?.type === 'Feature', 'boundary.type');
  add(errors, boundary?.id === MUNICIPAL_TERRITORY_DEPARTMENT_ID, 'boundary.id');
  add(errors, exactKeys(boundary?.properties, FEATURE_PROPERTY_KEYS), 'boundary.properties.shape');
  add(errors, boundary?.properties?.name === 'Junín', 'boundary.properties.name');
  add(errors,
    boundary?.properties?.sourceId === 'ign:departamento:50035',
    'boundary.properties.sourceId');
  add(errors, exactKeys(boundary?.geometry, GEOMETRY_KEYS), 'boundary.geometry.shape');
  add(errors, boundary?.geometry?.type === 'MultiPolygon', 'boundary.geometry.type');
  const expectedBbox = inspectCoordinates(boundary?.geometry?.coordinates, errors);
  add(errors,
    Array.isArray(boundary?.bbox) && boundary.bbox.length === 4 &&
      boundary.bbox.every(finiteCoordinate),
    'boundary.bbox.shape');
  if (expectedBbox) add(errors, exactJson(boundary?.bbox, expectedBbox), 'boundary.bbox.coordinates');
  const uniqueErrors = Object.freeze([...new Set(errors)]);
  return Object.freeze({ ok: uniqueErrors.length === 0, errors: uniqueErrors });
}

function validateQuery(query, errors) {
  add(errors, exactKeys(query, QUERY_KEYS), 'query.shape');
  add(errors,
    ISO_TIMESTAMP.test(query?.queriedAt || '') && Number.isFinite(Date.parse(query.queriedAt)),
    'query.queriedAt');
  add(errors, query?.departmentId === MUNICIPAL_TERRITORY_DEPARTMENT_ID, 'query.departmentId');
  add(errors, query?.crs === MUNICIPAL_TERRITORY_CRS, 'query.crs');
}

function validateSource(source, status, errors) {
  add(errors, exactKeys(source, SOURCE_KEYS), 'source.shape');
  for (const key of ['boundary', 'localities']) {
    add(errors, exactKeys(source?.[key], SOURCE_DESCRIPTOR_KEYS), `source.${key}.shape`);
  }
  add(errors,
    exactJson(source?.boundary, MUNICIPAL_TERRITORY_SOURCE_DESCRIPTORS.boundary),
    'source.boundary.allowlist');
  const expectedLocalities = {
    ...MUNICIPAL_TERRITORY_SOURCE_DESCRIPTORS.localities,
    status: status === 'ready' ? 'available' : 'unavailable',
  };
  add(errors, exactJson(source?.localities, expectedLocalities), 'source.localities.allowlist');
}

function validateJurisdiction(jurisdiction, errors) {
  add(errors, exactKeys(jurisdiction, JURISDICTION_KEYS), 'jurisdiction.shape');
  add(errors, jurisdiction?.id === MUNICIPAL_TERRITORY_DEPARTMENT_ID, 'jurisdiction.id');
  add(errors, jurisdiction?.name === 'Junín', 'jurisdiction.name');
  add(errors, exactKeys(jurisdiction?.province, PROVINCE_KEYS), 'jurisdiction.province.shape');
  add(errors, jurisdiction?.province?.id === '50', 'jurisdiction.province.id');
  add(errors, jurisdiction?.province?.name === 'Mendoza', 'jurisdiction.province.name');
  add(errors, exactKeys(jurisdiction?.country, COUNTRY_KEYS), 'jurisdiction.country.shape');
  add(errors, jurisdiction?.country?.code === 'AR', 'jurisdiction.country.code');
  add(errors, jurisdiction?.country?.name === 'Argentina', 'jurisdiction.country.name');
}

function validateLocalities(localities, boundary, status, errors) {
  const expectedLength = status === 'ready' ? MUNICIPAL_TERRITORY_LOCALITIES.length : 0;
  add(errors, Array.isArray(localities) && localities.length === expectedLength, 'localities.length');
  if (!Array.isArray(localities) || localities.length !== expectedLength) return;

  localities.forEach((locality, index) => {
    const expected = MUNICIPAL_TERRITORY_LOCALITIES[index];
    const path = `localities.${index}`;
    add(errors, exactKeys(locality, LOCALITY_KEYS), `${path}.shape`);
    add(errors, locality?.id === expected?.id, `${path}.id`);
    add(errors, locality?.name === expected?.name, `${path}.name`);
    add(errors, exactKeys(locality?.centroid, CENTROID_KEYS), `${path}.centroid.shape`);
    const longitude = locality?.centroid?.longitude;
    const latitude = locality?.centroid?.latitude;
    add(errors, coordinateIsInJuninBounds(longitude, latitude), `${path}.centroid.bounds`);
    add(errors,
      pointIsInsideMunicipalBoundary(longitude, latitude, boundary?.geometry?.coordinates),
      `${path}.centroid.boundary`);
  });
}

function validateBasemaps(basemaps, errors) {
  add(errors,
    Array.isArray(basemaps) && basemaps.length === MUNICIPAL_TERRITORY_BASEMAPS.length,
    'basemaps.length');
  if (!Array.isArray(basemaps)) return;
  basemaps.forEach((basemap, index) => {
    add(errors, exactKeys(basemap, BASEMAP_KEYS), `basemaps.${index}.shape`);
    add(errors,
      exactJson(basemap, MUNICIPAL_TERRITORY_BASEMAPS[index]),
      `basemaps.${index}.allowlist`);
  });
}

function validateAccessIssues(accessIssues, status, errors) {
  const expected = status === 'ready' ? [] : [MUNICIPAL_TERRITORY_ACCESS_ISSUE];
  add(errors, Array.isArray(accessIssues), 'accessIssues.array');
  if (Array.isArray(accessIssues)) {
    accessIssues.forEach((issue, index) => {
      add(errors, exactKeys(issue, ACCESS_ISSUE_KEYS), `accessIssues.${index}.shape`);
    });
  }
  add(errors, exactJson(accessIssues, expected), 'accessIssues.allowlist');
}

export function inspectMunicipalTerritoryContract(value) {
  const errors = [];
  add(errors, exactKeys(value, TOP_LEVEL_KEYS), 'contract.shape');
  add(errors,
    value?.schemaVersion === MUNICIPAL_TERRITORY_SCHEMA_VERSION,
    'contract.schemaVersion');
  add(errors, value?.status === 'ready' || value?.status === 'partial', 'contract.status');
  validateQuery(value?.query, errors);
  validateSource(value?.source, value?.status, errors);
  validateJurisdiction(value?.jurisdiction, errors);
  const boundaryInspection = inspectMunicipalTerritoryBoundary(value?.boundary);
  errors.push(...boundaryInspection.errors);
  validateLocalities(value?.localities, value?.boundary, value?.status, errors);
  validateBasemaps(value?.basemaps, errors);
  validateAccessIssues(value?.accessIssues, value?.status, errors);
  add(errors, exactJson(value?.limits, MUNICIPAL_TERRITORY_LIMITS), 'limits.allowlist');

  const uniqueErrors = Object.freeze([...new Set(errors)]);
  return Object.freeze({ ok: uniqueErrors.length === 0, errors: uniqueErrors });
}

export function validateMunicipalTerritoryContract(value) {
  return inspectMunicipalTerritoryContract(value).ok;
}
