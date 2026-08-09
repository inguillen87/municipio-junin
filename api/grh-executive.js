import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import { readGrhArtifactBundle } from './lib/grh-artifacts.js';
import { inspectGrhExecutiveContract } from './lib/grh-executive-contract.js';
import { buildGrhExecutiveProjection } from './lib/grh-executive-projection.js';
import routePolicy from '../shared/route-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';

const { ACTIONS, RESOURCES } = routePolicy;
const { API_CONTRACTS, HEADER_NAME } = releaseTruthContract;

function unavailableResponse(res) {
  return res.status(503).json({
    error: 'La proyeccion ejecutiva GRH no esta disponible.',
    code: 'GRH_EXECUTIVE_CONTRACT_UNAVAILABLE',
  });
}

export function createGrhExecutiveHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readArtifactBundleImpl = readGrhArtifactBundle,
  buildProjectionImpl = buildGrhExecutiveProjection,
  inspectContractImpl = inspectGrhExecutiveContract,
} = {}) {
  return async function handler(req, res) {
    res.setHeader(HEADER_NAME, API_CONTRACTS['/api/grh-executive']);
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

      const projection = buildProjectionImpl(bundle.semantic, { audience: 'interactive' });
      const inspection = inspectContractImpl(projection);
      if (!inspection?.ok) throw new Error('GRH executive contract invalid');

      return res.status(200).json(projection);
    } catch {
      console.error('[GRH-EXECUTIVE] Proyeccion gobernada no disponible');
      return unavailableResponse(res);
    }
  };
}

export default createGrhExecutiveHandler();
