import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import { readGrhArtifactBundle } from './lib/grh-artifacts.js';
import {
  GRH_DOMAIN_CATALOG_SCHEMA_VERSION,
  inspectGrhDomainCatalogContract,
} from './lib/grh-domain-catalog-contract.js';
import { buildGrhDomainCatalogProjection } from './lib/grh-domain-catalog.js';
import routePolicy from '../shared/route-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';

const { ACTIONS, RESOURCES } = routePolicy;
const { HEADER_NAME } = releaseTruthContract;

function setHeaders(res) {
  res.setHeader(HEADER_NAME || 'X-MuniControl-Contract', GRH_DOMAIN_CATALOG_SCHEMA_VERSION);
  noStore(res);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Authorization');
}

export function createGrhDomainCatalogHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readArtifactBundleImpl = readGrhArtifactBundle,
  buildProjectionImpl = buildGrhDomainCatalogProjection,
  inspectContractImpl = inspectGrhDomainCatalogContract,
} = {}) {
  return async function handler(req, res) {
    setHeaders(res);
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Metodo no permitido', code: 'METHOD_NOT_ALLOWED' });
    }
    if (req?.query && typeof req.query === 'object' && Object.keys(req.query).length > 0) {
      return res.status(400).json({ error: 'Este contrato no admite filtros de consulta.', code: 'GRH_DOMAIN_CATALOG_QUERY_UNSUPPORTED' });
    }
    const caller = await requireCapabilityImpl(req, res, RESOURCES.GRH_CONTRACT, ACTIONS.READ);
    if (!caller || !requireDatasetTenantImpl(res, caller, 'GRH_TENANT_ID')) return;
    try {
      const bundle = await readArtifactBundleImpl(String(caller.tenantId));
      const projection = buildProjectionImpl(bundle);
      if (!inspectContractImpl(projection)?.ok) throw new Error('GRH domain catalog contract invalid');
      return res.status(200).json(projection);
    } catch {
      console.error('[GRH-DOMAIN-CATALOG] Catalogo gobernado no disponible');
      return res.status(503).json({
        error: 'El catalogo de areas GRH no esta disponible.',
        code: 'GRH_DOMAIN_CATALOG_UNAVAILABLE',
      });
    }
  };
}

export default createGrhDomainCatalogHandler();
