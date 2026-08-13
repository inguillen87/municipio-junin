import { readFile } from 'node:fs/promises';

import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import {
  GRH_ABSENCE_INSIGHTS_SCHEMA_VERSION,
  inspectGrhAbsenceInsightsContract,
} from './lib/grh-absence-insights-contract.js';
import {
  buildGrhAbsenceInsightsProjection,
} from './lib/grh-absence-insights-projection.js';
import routePolicy from '../shared/route-policy.cjs';

const { ACTIONS, RESOURCES } = routePolicy;
const CONTRACT_HEADER = 'X-MuniControl-Contract';
const HEX_64 = /^[0-9a-f]{64}$/;
const ARTIFACT_URL = new URL('./_data/grh-absence-insights.json', import.meta.url);

function artifactError(code) {
  const error = new Error('La lectura agregada de ausencias no está disponible.');
  error.code = code;
  return error;
}

export async function readGrhAbsenceInsightsArtifact({
  environment = process.env,
  expectedSourceSha256 = environment.GRH_SOURCE_SHA256,
  readFileImpl = readFile,
} = {}) {
  if (!HEX_64.test(expectedSourceSha256 || '')) {
    throw artifactError('GRH_ABSENCE_INSIGHTS_SOURCE_PIN_INVALID');
  }
  let artifact;
  try {
    artifact = JSON.parse(await readFileImpl(ARTIFACT_URL, 'utf8'));
  } catch {
    throw artifactError('GRH_ABSENCE_INSIGHTS_ARTIFACT_INVALID');
  }
  return buildGrhAbsenceInsightsProjection(artifact, { expectedSourceSha256 });
}

function unavailable(res) {
  return res.status(503).json({
    error: 'La lectura explicada de ausencias no está disponible.',
    code: 'GRH_ABSENCE_INSIGHTS_UNAVAILABLE',
  });
}

export function createGrhAbsenceInsightsHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readArtifactImpl = readGrhAbsenceInsightsArtifact,
  inspectContractImpl = inspectGrhAbsenceInsightsContract,
  environment = process.env,
} = {}) {
  return async function handler(req, res) {
    res.setHeader(CONTRACT_HEADER, GRH_ABSENCE_INSIGHTS_SCHEMA_VERSION);
    noStore(res);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Authorization');

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Método no permitido', code: 'METHOD_NOT_ALLOWED' });
    }
    if (req.query && Object.keys(req.query).length > 0) {
      return res.status(400).json({
        error: 'Esta lectura usa períodos fijos y no acepta filtros.',
        code: 'GRH_ABSENCE_INSIGHTS_QUERY_INVALID',
      });
    }

    const caller = await requireCapabilityImpl(
      req,
      res,
      RESOURCES.GRH_ORGANIZATION_ANALYTICS,
      ACTIONS.READ,
    );
    if (!caller || !requireDatasetTenantImpl(res, caller, 'GRH_TENANT_ID')) return;

    try {
      const projection = await readArtifactImpl({
        environment,
        expectedSourceSha256: environment.GRH_SOURCE_SHA256,
      });
      if (!inspectContractImpl(projection)?.ok) {
        throw artifactError('GRH_ABSENCE_INSIGHTS_CONTRACT_INVALID');
      }
      return res.status(200).json(projection);
    } catch {
      console.error('[GRH-ABSENCE-INSIGHTS] Proyección gobernada no disponible');
      return unavailable(res);
    }
  };
}

export default createGrhAbsenceInsightsHandler();
