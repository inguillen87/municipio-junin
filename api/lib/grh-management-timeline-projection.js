import {
  GRH_MANAGEMENT_TIMELINE_SCHEMA_VERSION,
  inspectGrhManagementTimelineContract,
} from './grh-management-timeline-contract.js';

const HEX_64 = /^[0-9a-f]{64}$/;

function projectionError(code) {
  const error = new Error(
    'La línea de gestión agregada GRH no superó los controles requeridos.',
  );
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

export function buildGrhManagementTimelineProjection(artifact, {
  expectedSourceSha256,
} = {}) {
  if (!HEX_64.test(expectedSourceSha256 || '')) {
    throw projectionError('GRH_MANAGEMENT_TIMELINE_SOURCE_PIN_INVALID');
  }
  if (artifact?.source?.sha256 !== expectedSourceSha256) {
    throw projectionError('GRH_MANAGEMENT_TIMELINE_SOURCE_MISMATCH');
  }
  if (artifact?.schemaVersion !== GRH_MANAGEMENT_TIMELINE_SCHEMA_VERSION) {
    throw projectionError('GRH_MANAGEMENT_TIMELINE_SCHEMA_INVALID');
  }
  const projection = deepClone(artifact);
  if (!inspectGrhManagementTimelineContract(projection).ok) {
    throw projectionError('GRH_MANAGEMENT_TIMELINE_CONTRACT_INVALID');
  }
  return deepFreeze(projection);
}
