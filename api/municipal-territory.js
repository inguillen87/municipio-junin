import { noStore, requireCapability } from './lib/auth.js';
import {
  MUNICIPAL_TERRITORY_SCHEMA_VERSION,
  inspectMunicipalTerritoryContract,
} from './lib/municipal-territory-contract.js';
import { loadMunicipalTerritory } from './lib/municipal-territory-source.js';
import routePolicy from '../shared/route-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';

const { ACTIONS, RESOURCES } = routePolicy;
const { API_CONTRACTS, HEADER_NAME } = releaseTruthContract;

export const MUNICIPAL_TERRITORY_RESOURCE =
  RESOURCES.MUNICIPAL_TERRITORY || 'municipal.territory';

const CONTRACT_HEADER_NAME = HEADER_NAME || 'X-MuniControl-Contract';
const CONTRACT_HEADER_VALUE = API_CONTRACTS['/api/municipal-territory'] ||
  MUNICIPAL_TERRITORY_SCHEMA_VERSION;

function unavailableResponse(res) {
  return res.status(503).json({
    error: 'La referencia territorial oficial no está disponible temporalmente.',
    code: 'MUNICIPAL_TERRITORY_UNAVAILABLE',
  });
}

export function createMunicipalTerritoryHandler({
  requireCapabilityImpl = requireCapability,
  loadMunicipalTerritoryImpl = loadMunicipalTerritory,
  inspectContractImpl = inspectMunicipalTerritoryContract,
} = {}) {
  return async function handler(req, res) {
    res.setHeader(CONTRACT_HEADER_NAME, CONTRACT_HEADER_VALUE);
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

    const caller = await requireCapabilityImpl(
      req,
      res,
      MUNICIPAL_TERRITORY_RESOURCE,
      ACTIONS.READ,
    );
    if (!caller) return;

    try {
      const payload = await loadMunicipalTerritoryImpl();
      if (!inspectContractImpl(payload)?.ok) {
        throw new Error('Municipal territory contract invalid');
      }
      return res.status(200).json(payload);
    } catch {
      console.error('[MUNICIPAL-TERRITORY] Referencia oficial no disponible');
      return unavailableResponse(res);
    }
  };
}

export default createMunicipalTerritoryHandler();
