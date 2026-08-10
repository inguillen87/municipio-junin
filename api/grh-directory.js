import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import {
  GRH_DIRECTORY_SCHEMA_VERSION,
  inspectGrhDirectoryResponse,
} from './lib/grh-directory-contract.js';
import { readGrhDirectory } from './lib/grh-directory-store.js';
import routePolicy from '../shared/route-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';

const { ACTIONS, RESOURCES } = routePolicy;
const { API_CONTRACTS, HEADER_NAME } = releaseTruthContract;
const DIRECTORY_RESOURCE = RESOURCES.GRH_DIRECTORY || 'grh.directory';
const HIGH_DIRECTORY_ROLES = new Set(['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR']);
const CONTRACT_VALUE = API_CONTRACTS['/api/grh-directory'] || GRH_DIRECTORY_SCHEMA_VERSION;

export function parseDirectoryUserAllowlist(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.split(',');
  const ids = raw.map(item => item.trim());
  if (ids.some(id => !/^[A-Za-z0-9_-]{1,128}$/.test(id)) || new Set(ids).size !== ids.length) {
    return null;
  }
  return new Set(ids);
}

function denyDirectoryAccess(res) {
  return res.status(403).json({
    error: 'Acceso individual GRH no habilitado',
    code: 'GRH_DIRECTORY_ACCESS_DENIED',
  });
}

function unavailable(res) {
  return res.status(503).json({
    error: 'El directorio GRH no esta disponible.',
    code: 'GRH_DIRECTORY_UNAVAILABLE',
  });
}

export function createGrhDirectoryHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readDirectoryImpl = readGrhDirectory,
  inspectResponseImpl = inspectGrhDirectoryResponse,
  environment = process.env,
} = {}) {
  return async function handler(req, res) {
    res.setHeader(HEADER_NAME, CONTRACT_VALUE);
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

    const caller = await requireCapabilityImpl(req, res, DIRECTORY_RESOURCE, ACTIONS.READ);
    if (!caller) return;
    if (!HIGH_DIRECTORY_ROLES.has(caller.role)) return denyDirectoryAccess(res);
    const allowlist = parseDirectoryUserAllowlist(environment.GRH_DIRECTORY_ALLOWED_USER_IDS);
    if (!allowlist || !allowlist.has(String(caller.id || ''))) return denyDirectoryAccess(res);
    if (!requireDatasetTenantImpl(res, caller, 'GRH_TENANT_ID')) return;

    try {
      const response = await readDirectoryImpl({
        tenantId: String(caller.tenantId),
        query: req.query || {},
      });
      if (!inspectResponseImpl(response)?.ok) throw new Error('invalid directory response');
      return res.status(200).json(response);
    } catch (error) {
      if (error?.status === 400) {
        return res.status(400).json({
          error: 'Consulta de directorio invalida',
          code: 'GRH_DIRECTORY_QUERY_INVALID',
        });
      }
      if (error?.status === 404) {
        return res.status(404).json({
          error: 'Legajo no encontrado',
          code: 'GRH_DIRECTORY_NOT_FOUND',
        });
      }
      if (error?.status === 409) {
        return res.status(409).json({
          error: 'El legajo requiere codigo de empresa',
          code: 'GRH_DIRECTORY_LEGAJO_AMBIGUOUS',
        });
      }
      console.error('[GRH-DIRECTORY] Directorio gobernado no disponible');
      return unavailable(res);
    }
  };
}

export default createGrhDirectoryHandler();
