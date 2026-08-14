import {
  GRH_GARDEN_NETWORK_SCHEMA_VERSION,
  inspectGrhGardenNetworkContract,
} from './grh-garden-network-contract.js';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function projectionError(code) {
  const error = new Error('La Red de Jardines Maternales no supera los controles requeridos.');
  error.code = code;
  return error;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

export function buildGrhGardenNetworkProjection(artifact, {
  expectedSourceSha256,
} = {}) {
  if (!SHA256_PATTERN.test(expectedSourceSha256 || '')) {
    throw projectionError('GRH_GARDEN_NETWORK_SOURCE_PIN_INVALID');
  }
  if (artifact?.source?.sourceSha256 !== expectedSourceSha256) {
    throw projectionError('GRH_GARDEN_NETWORK_SOURCE_MISMATCH');
  }
  const projection = deepClone(artifact);
  if (projection?.schemaVersion !== GRH_GARDEN_NETWORK_SCHEMA_VERSION) {
    throw projectionError('GRH_GARDEN_NETWORK_SCHEMA_INVALID');
  }
  const inspection = inspectGrhGardenNetworkContract(projection, {
    expectedSourceSha256,
  });
  if (!inspection.ok) {
    throw projectionError('GRH_GARDEN_NETWORK_CONTRACT_INVALID');
  }
  return deepFreeze(projection);
}
