import { readFile } from 'node:fs/promises';

import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import {
  GRH_PERSONAS_LINKAGE_SCHEMA_VERSION,
  inspectGrhPersonasLinkageContract,
} from './lib/grh-personas-linkage-contract.js';
import { buildGrhPersonasLinkageReadinessProjection } from './lib/grh-personas-linkage-projection.js';
import routePolicy from '../shared/route-policy.cjs';

const { ACTIONS, RESOURCES } = routePolicy;
const CONTRACT_HEADER = 'X-MuniControl-Contract';
const HEX_64 = /^[0-9a-f]{64}$/;
const ARTIFACT_URL = new URL('./_data/grh-personas-linkage-readiness.json', import.meta.url);

function artifactError(code) {
  const error = new Error('La revisión agregada de vinculación no está disponible.');
  error.code = code;
  return error;
}

export async function readGrhPersonasLinkageReadinessArtifact({
  environment = process.env,
  expectedGrhSourceSha256 = environment.GRH_SOURCE_SHA256,
  expectedPersonasSourceSha256 = environment.PERSONAS_SOURCE_SHA256,
  readFileImpl = readFile,
} = {}) {
  if (!HEX_64.test(expectedGrhSourceSha256 || '') || !HEX_64.test(expectedPersonasSourceSha256 || '')) {
    throw artifactError('GRH_PERSONAS_LINKAGE_SOURCE_PIN_INVALID');
  }
  let artifact;
  try {
    artifact = JSON.parse(await readFileImpl(ARTIFACT_URL, 'utf8'));
  } catch {
    throw artifactError('GRH_PERSONAS_LINKAGE_ARTIFACT_INVALID');
  }
  return buildGrhPersonasLinkageReadinessProjection(artifact, {
    expectedGrhSourceSha256,
    expectedPersonasSourceSha256,
  });
}

function unavailable(res) {
  return res.status(503).json({
    error: 'La revisión de vinculación entre GRH y PERSONAS no está disponible.',
    code: 'GRH_PERSONAS_LINKAGE_UNAVAILABLE',
  });
}

export function createGrhPersonasLinkageReadinessHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readArtifactImpl = readGrhPersonasLinkageReadinessArtifact,
  inspectContractImpl = inspectGrhPersonasLinkageContract,
  environment = process.env,
} = {}) {
  return async function handler(req, res) {
    res.setHeader(CONTRACT_HEADER, GRH_PERSONAS_LINKAGE_SCHEMA_VERSION);
    noStore(res);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Authorization');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Método no permitido', code: 'METHOD_NOT_ALLOWED' });
    }
    if (req.query && Object.keys(req.query).length > 0) {
      return res.status(400).json({
        error: 'Esta revisión usa el corte aprobado y no acepta filtros.',
        code: 'GRH_PERSONAS_LINKAGE_QUERY_INVALID',
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
        expectedGrhSourceSha256: environment.GRH_SOURCE_SHA256,
        expectedPersonasSourceSha256: environment.PERSONAS_SOURCE_SHA256,
      });
      if (!inspectContractImpl(projection)?.ok) {
        throw artifactError('GRH_PERSONAS_LINKAGE_CONTRACT_INVALID');
      }
      return res.status(200).json(projection);
    } catch {
      console.error('[GRH-PERSONAS-LINKAGE] Proyección gobernada no disponible');
      return unavailable(res);
    }
  };
}

export default createGrhPersonasLinkageReadinessHandler();
