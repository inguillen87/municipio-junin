import {
  GRH_ABSENCE_INSIGHTS_SCHEMA_VERSION,
  inspectGrhAbsenceInsightsContract,
} from './grh-absence-insights-contract.js';

const HEX_64 = /^[0-9a-f]{64}$/;

function projectionError(code) {
  const error = new Error('La lectura agregada de ausencias no supera los controles requeridos.');
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

export function buildGrhAbsenceInsightsProjection(artifact, {
  expectedSourceSha256,
} = {}) {
  if (!HEX_64.test(expectedSourceSha256 || '')) {
    throw projectionError('GRH_ABSENCE_INSIGHTS_SOURCE_PIN_INVALID');
  }
  if (artifact?.source?.sourceSha256 !== expectedSourceSha256) {
    throw projectionError('GRH_ABSENCE_INSIGHTS_SOURCE_MISMATCH');
  }
  const projection = deepClone(artifact);
  if (projection?.schemaVersion !== GRH_ABSENCE_INSIGHTS_SCHEMA_VERSION) {
    throw projectionError('GRH_ABSENCE_INSIGHTS_SCHEMA_INVALID');
  }
  const inspection = inspectGrhAbsenceInsightsContract(projection);
  if (!inspection.ok) {
    throw projectionError('GRH_ABSENCE_INSIGHTS_CONTRACT_INVALID');
  }
  return deepFreeze(projection);
}
