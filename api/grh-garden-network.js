import { readFile } from 'node:fs/promises';

import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import {
  GRH_GARDEN_NETWORK_SCHEMA_VERSION,
  inspectGrhGardenNetworkContract,
} from './lib/grh-garden-network-contract.js';
import {
  buildGrhGardenNetworkProjection,
} from './lib/grh-garden-network-projection.js';
import routePolicy from '../shared/route-policy.cjs';

const { ACTIONS, RESOURCES } = routePolicy;
const CONTRACT_HEADER = 'X-MuniControl-Contract';
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ARTIFACT_URL = new URL('./_data/grh-garden-network.json', import.meta.url);

export const GRH_GARDEN_NETWORK_RESOURCE =
  RESOURCES.GRH_ORGANIZATION_ANALYTICS || 'grh.organization.analytics';

function artifactError(code) {
  const error = new Error('La Red de Jardines Maternales no está disponible.');
  error.code = code;
  return error;
}

export async function readGrhGardenNetworkArtifact({
  environment = process.env,
  expectedSourceSha256 = environment.GRH_SOURCE_SHA256,
  readFileImpl = readFile,
} = {}) {
  if (!SHA256_PATTERN.test(expectedSourceSha256 || '')) {
    throw artifactError('GRH_GARDEN_NETWORK_SOURCE_PIN_INVALID');
  }
  let artifact;
  try {
    artifact = JSON.parse(await readFileImpl(ARTIFACT_URL, 'utf8'));
  } catch {
    throw artifactError('GRH_GARDEN_NETWORK_ARTIFACT_INVALID');
  }
  return buildGrhGardenNetworkProjection(artifact, { expectedSourceSha256 });
}

function unavailable(res) {
  return res.status(503).json({
    error: 'La Red de Jardines Maternales no está disponible.',
    code: 'GRH_GARDEN_NETWORK_UNAVAILABLE',
  });
}

export function createGrhGardenNetworkHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readArtifactImpl = readGrhGardenNetworkArtifact,
  inspectContractImpl = inspectGrhGardenNetworkContract,
  environment = process.env,
} = {}) {
  return async function handler(req, res) {
    res.setHeader(CONTRACT_HEADER, GRH_GARDEN_NETWORK_SCHEMA_VERSION);
    noStore(res);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Authorization');

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Método no permitido', code: 'METHOD_NOT_ALLOWED' });
    }
    if (req.query && Object.keys(req.query).length > 0) {
      return res.status(400).json({
        error: 'Esta lectura usa un corte gobernado y no acepta filtros.',
        code: 'GRH_GARDEN_NETWORK_QUERY_INVALID',
      });
    }

    const caller = await requireCapabilityImpl(
      req,
      res,
      GRH_GARDEN_NETWORK_RESOURCE,
      ACTIONS.READ,
    );
    if (!caller || !requireDatasetTenantImpl(res, caller, 'GRH_TENANT_ID')) return;

    try {
      const projection = await readArtifactImpl({
        environment,
        expectedSourceSha256: environment.GRH_SOURCE_SHA256,
      });
      if (!inspectContractImpl(projection, {
        expectedSourceSha256: environment.GRH_SOURCE_SHA256,
      })?.ok) {
        throw artifactError('GRH_GARDEN_NETWORK_CONTRACT_INVALID');
      }
      return res.status(200).json(projection);
    } catch {
      console.error('[GRH-GARDEN-NETWORK] Proyección gobernada no disponible');
      return unavailable(res);
    }
  };
}

export default createGrhGardenNetworkHandler();
