import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import routePolicy from '../shared/route-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';

const { ACTIONS, RESOURCES } = routePolicy;
const { API_CONTRACTS, HEADER_NAME } = releaseTruthContract;

export function createGrhRawRetirementHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
} = {}) {
  return async function handler(req, res) {
    res.setHeader(HEADER_NAME, API_CONTRACTS['/api/grh-data']);
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

    return res.status(410).json({
      error: 'El contrato GRH crudo fue retirado. Use las proyecciones gobernadas de calidad o inteligencia ejecutiva.',
      code: 'GRH_RAW_CONTRACT_RETIRED',
    });
  };
}

export default createGrhRawRetirementHandler();
