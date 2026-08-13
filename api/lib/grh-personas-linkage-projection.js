import {
  GRH_PERSONAS_LINKAGE_SCHEMA_VERSION,
  inspectGrhPersonasLinkageContract,
} from './grh-personas-linkage-contract.js';

const HEX_64 = /^[0-9a-f]{64}$/;

function projectionError(code) {
  const error = new Error('La revisión agregada de vinculación no supera los controles requeridos.');
  error.code = code;
  return error;
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

export function buildGrhPersonasLinkageReadinessProjection(artifact, {
  expectedGrhSourceSha256,
  expectedPersonasSourceSha256,
} = {}) {
  if (!HEX_64.test(expectedGrhSourceSha256 || '') || !HEX_64.test(expectedPersonasSourceSha256 || '')) {
    throw projectionError('GRH_PERSONAS_LINKAGE_SOURCE_PIN_INVALID');
  }
  if (artifact?.source?.grh?.sourceSha256 !== expectedGrhSourceSha256 ||
      artifact?.source?.personas?.sourceSha256 !== expectedPersonasSourceSha256) {
    throw projectionError('GRH_PERSONAS_LINKAGE_SOURCE_MISMATCH');
  }
  const projection = JSON.parse(JSON.stringify(artifact));
  if (projection?.schemaVersion !== GRH_PERSONAS_LINKAGE_SCHEMA_VERSION) {
    throw projectionError('GRH_PERSONAS_LINKAGE_SCHEMA_INVALID');
  }
  if (!inspectGrhPersonasLinkageContract(projection).ok) {
    throw projectionError('GRH_PERSONAS_LINKAGE_CONTRACT_INVALID');
  }
  return deepFreeze(projection);
}
