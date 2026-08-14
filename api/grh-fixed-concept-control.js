import { readFile } from 'node:fs/promises';

import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import {
  GRH_FIXED_CONCEPT_CONTROL_SCHEMA_VERSION,
  inspectGrhFixedConceptControlContract,
} from './lib/grh-fixed-concept-control-contract.js';
import {
  buildGrhFixedConceptControlProjection,
} from './lib/grh-fixed-concept-control-projection.js';
import routePolicy from '../shared/route-policy.cjs';

const { ACTIONS, RESOURCES } = routePolicy;
const CONTRACT_HEADER = 'X-MuniControl-Contract';
const HEX_64 = /^[0-9a-f]{64}$/;
const ARTIFACT_URL = new URL('./_data/grh-fixed-concept-control.json', import.meta.url);

function artifactError(code) {
  const error = new Error('El control agregado de conceptos fijos GRH no está disponible.');
  error.code = code;
  return error;
}

export async function readGrhFixedConceptControlArtifact({
  environment = process.env,
  expectedSourceSha256 = environment.GRH_SOURCE_SHA256,
  readFileImpl = readFile,
} = {}) {
  if (!HEX_64.test(expectedSourceSha256 || '')) {
    throw artifactError('GRH_FIXED_CONCEPT_CONTROL_SOURCE_PIN_INVALID');
  }
  let artifact;
  try {
    artifact = JSON.parse(await readFileImpl(ARTIFACT_URL, 'utf8'));
  } catch {
    throw artifactError('GRH_FIXED_CONCEPT_CONTROL_ARTIFACT_INVALID');
  }
  return buildGrhFixedConceptControlProjection(artifact, { expectedSourceSha256 });
}

function unavailable(res) {
  return res.status(503).json({
    error: 'El control agregado de conceptos fijos GRH no está disponible.',
    code: 'GRH_FIXED_CONCEPT_CONTROL_UNAVAILABLE',
  });
}

export function createGrhFixedConceptControlHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readArtifactImpl = readGrhFixedConceptControlArtifact,
  inspectContractImpl = inspectGrhFixedConceptControlContract,
  environment = process.env,
} = {}) {
  return async function handler(req, res) {
    res.setHeader(CONTRACT_HEADER, GRH_FIXED_CONCEPT_CONTROL_SCHEMA_VERSION);
    noStore(res);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Authorization');

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Método no permitido', code: 'METHOD_NOT_ALLOWED' });
    }
    if (req.query && Object.keys(req.query).length > 0) {
      return res.status(400).json({
        error: 'Esta lectura usa cortes históricos gobernados y no acepta filtros de servidor.',
        code: 'GRH_FIXED_CONCEPT_CONTROL_QUERY_INVALID',
      });
    }

    const caller = await requireCapabilityImpl(
      req,
      res,
      RESOURCES.GRH_WORKFORCE_FINANCE,
      ACTIONS.READ,
    );
    if (!caller || !requireDatasetTenantImpl(res, caller, 'GRH_TENANT_ID')) return;

    try {
      const projection = await readArtifactImpl({
        environment,
        expectedSourceSha256: environment.GRH_SOURCE_SHA256,
      });
      if (!inspectContractImpl(projection)?.ok) {
        throw artifactError('GRH_FIXED_CONCEPT_CONTROL_CONTRACT_INVALID');
      }
      return res.status(200).json(projection);
    } catch {
      console.error('[GRH-FIXED-CONCEPT-CONTROL] Proyección gobernada no disponible');
      return unavailable(res);
    }
  };
}

export default createGrhFixedConceptControlHandler();
