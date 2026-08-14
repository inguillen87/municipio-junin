import {
  GRH_FIXED_CONCEPT_CONTROL_SCHEMA_VERSION,
  inspectGrhFixedConceptControlContract,
} from './grh-fixed-concept-control-contract.js';

const HEX_64 = /^[0-9a-f]{64}$/;

function projectionError(code) {
  const error = new Error('El control agregado de conceptos fijos GRH no superó las validaciones requeridas.');
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

export function buildGrhFixedConceptControlProjection(artifact, {
  expectedSourceSha256,
} = {}) {
  if (!HEX_64.test(expectedSourceSha256 || '')) {
    throw projectionError('GRH_FIXED_CONCEPT_CONTROL_SOURCE_PIN_INVALID');
  }
  if (artifact?.source?.sourceSha256 !== expectedSourceSha256) {
    throw projectionError('GRH_FIXED_CONCEPT_CONTROL_SOURCE_MISMATCH');
  }
  const projection = deepClone(artifact);
  if (projection?.schemaVersion !== GRH_FIXED_CONCEPT_CONTROL_SCHEMA_VERSION) {
    throw projectionError('GRH_FIXED_CONCEPT_CONTROL_SCHEMA_INVALID');
  }
  if (!inspectGrhFixedConceptControlContract(projection).ok) {
    throw projectionError('GRH_FIXED_CONCEPT_CONTROL_CONTRACT_INVALID');
  }
  return deepFreeze(projection);
}
