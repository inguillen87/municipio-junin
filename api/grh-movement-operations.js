import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import { readGrhArtifactBundle } from './lib/grh-artifacts.js';
import {
  GRH_MOVEMENT_OPERATIONS_SCHEMA_VERSION,
  inspectGrhMovementOperationsContract,
} from './lib/grh-movement-operations-contract.js';
import { buildGrhMovementOperationsProjection } from './lib/grh-movement-operations.js';
import routePolicy from '../shared/route-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';

const { ACTIONS, RESOURCES } = routePolicy;
const { API_CONTRACTS, HEADER_NAME } = releaseTruthContract;

export const GRH_MOVEMENT_OPERATIONS_RESOURCE = RESOURCES.GRH_ORGANIZATION_ANALYTICS;

const CONTRACT_VALUE = API_CONTRACTS['/api/grh-movement-operations'] ||
  GRH_MOVEMENT_OPERATIONS_SCHEMA_VERSION;

function unavailableResponse(res) {
  return res.status(503).json({
    error: 'El centro de movimientos GRH no esta disponible.',
    code: 'GRH_MOVEMENT_OPERATIONS_UNAVAILABLE',
  });
}

export function createGrhMovementOperationsHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readArtifactBundleImpl = readGrhArtifactBundle,
  buildProjectionImpl = buildGrhMovementOperationsProjection,
  inspectContractImpl = inspectGrhMovementOperationsContract,
} = {}) {
  return async function handler(req, res) {
    res.setHeader(HEADER_NAME || 'X-MuniControl-Contract', CONTRACT_VALUE);
    noStore(res);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Authorization');

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({
        error: 'Metodo no permitido',
        code: 'METHOD_NOT_ALLOWED',
      });
    }
    if (req.query && Object.keys(req.query).length > 0) {
      return res.status(400).json({
        error: 'La consulta de movimientos no admite filtros de API.',
        code: 'GRH_MOVEMENT_OPERATIONS_QUERY_UNSUPPORTED',
      });
    }

    const caller = await requireCapabilityImpl(
      req,
      res,
      GRH_MOVEMENT_OPERATIONS_RESOURCE,
      ACTIONS.READ,
    );
    if (!caller || !requireDatasetTenantImpl(res, caller, 'GRH_TENANT_ID')) return;

    try {
      const bundle = await readArtifactBundleImpl(String(caller.tenantId));
      if (!bundle?.semantic) throw new Error('GRH movement bundle incomplete');
      const projection = buildProjectionImpl(bundle.semantic);
      const inspection = inspectContractImpl(projection, {
        expectedSourceSha256: bundle.semantic.source.sha256,
        expectedSnapshotAsOf: bundle.semantic.source.snapshot_as_of,
      });
      if (!inspection?.ok) throw new Error('GRH movement contract invalid');
      return res.status(200).json(projection);
    } catch {
      console.error('[GRH-MOVEMENT-OPERATIONS] Proyeccion gobernada no disponible');
      return unavailableResponse(res);
    }
  };
}

export default createGrhMovementOperationsHandler();
