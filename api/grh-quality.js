import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import { readGrhArtifactBundle } from './lib/grh-artifacts.js';
import { inspectGrhQualityContract } from './lib/grh-quality-contract.js';
import { buildGrhQualityProjection } from './lib/grh-quality-projection.js';
import routePolicy from '../shared/route-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';

const { ACTIONS, RESOURCES } = routePolicy;
const { API_CONTRACTS, HEADER_NAME } = releaseTruthContract;

function unavailableResponse(res) {
  return res.status(503).json({
    error: 'La proyeccion de calidad GRH no esta disponible.',
    code: 'GRH_QUALITY_CONTRACT_UNAVAILABLE',
  });
}

export function createGrhQualityHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readArtifactBundleImpl = readGrhArtifactBundle,
  buildProjectionImpl = buildGrhQualityProjection,
  inspectContractImpl = inspectGrhQualityContract,
} = {}) {
  return async function handler(req, res) {
    res.setHeader(HEADER_NAME, API_CONTRACTS['/api/grh-quality']);
    noStore(res);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({
        error: 'Metodo no permitido',
        code: 'METHOD_NOT_ALLOWED',
      });
    }

    const caller = await requireCapabilityImpl(
      req,
      res,
      RESOURCES.GRH_CONTRACT,
      ACTIONS.READ,
    );
    if (!caller || !requireDatasetTenantImpl(res, caller, 'GRH_TENANT_ID')) return;

    try {
      const bundle = await readArtifactBundleImpl(process.env.GRH_TENANT_ID);
      if (!bundle?.profile || !bundle?.semantic) throw new Error('GRH bundle incomplete');

      const projection = buildProjectionImpl(bundle.profile, bundle.semantic);
      const inspection = inspectContractImpl(projection);
      if (!inspection?.ok) throw new Error('GRH quality contract invalid');

      return res.status(200).json(projection);
    } catch {
      console.error('[GRH-QUALITY] Proyeccion gobernada no disponible');
      return unavailableResponse(res);
    }
  };
}

export default createGrhQualityHandler();
