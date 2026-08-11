import { noStore } from './lib/auth.js';
import {
  GRH_DIRECTORY_SCHEMA_VERSION,
  inspectGrhDirectoryResponse,
} from './lib/grh-directory-contract.js';
import { readGrhDirectory } from './lib/grh-directory-store.js';
import {
  authorizeGrhDirectoryRequest,
  parseDirectoryUserAllowlist,
  respondGrhDirectoryDenied,
  respondGrhDirectoryUnavailable,
} from './grh-directory-access.js';
import releaseTruthContract from '../shared/release-truth-contract.cjs';

const { API_CONTRACTS, HEADER_NAME } = releaseTruthContract;
const CONTRACT_VALUE = API_CONTRACTS['/api/grh-directory'] || GRH_DIRECTORY_SCHEMA_VERSION;

export { parseDirectoryUserAllowlist };

function setDirectoryHeaders(res) {
  res.setHeader(HEADER_NAME, CONTRACT_VALUE);
  noStore(res);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Authorization');
}

function isDetailQuery(query) {
  return query?.legajo !== undefined && query?.legajo !== null && query?.legajo !== '';
}

async function commitFailureAudit(authorization, reason) {
  return authorization.commitAudit({
    outcome: 'DENIED',
    reason,
    resultCount: 0,
    decision: authorization.decision,
  });
}

export function createGrhDirectoryHandler({
  readDirectoryImpl = readGrhDirectory,
  inspectResponseImpl = inspectGrhDirectoryResponse,
  ...authorizationDependencies
} = {}) {
  return async function handler(req, res) {
    setDirectoryHeaders(res);
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Metodo no permitido', code: 'METHOD_NOT_ALLOWED' });
    }

    const operation = isDetailQuery(req.query) ? 'detail' : 'list';
    const authorization = await authorizeGrhDirectoryRequest(req, res, {
      operation,
      ...authorizationDependencies,
    });
    if (!authorization) return;

    const scopeOrganizationCodes = authorization.decision.scope.tenantWide
      ? null
      : [...authorization.decision.allowedOrganizationCodes];

    try {
      const response = await readDirectoryImpl({
        tenantId: String(authorization.caller.tenantId),
        query: req.query || {},
        scopeOrganizationCodes,
      });
      if (!inspectResponseImpl(response)?.ok) {
        await commitFailureAudit(authorization, 'DIRECTORY_CONTRACT_ERROR');
        return respondGrhDirectoryUnavailable(res);
      }
      const committed = await authorization.commitAudit({
        outcome: 'ALLOWED',
        reason: authorization.decision.reason,
        resultCount: Array.isArray(response.items) ? response.items.length : 0,
        decision: authorization.decision,
      });
      if (!committed) return respondGrhDirectoryUnavailable(res);
      return res.status(200).json(response);
    } catch (error) {
      if (error?.status === 400) {
        const committed = await commitFailureAudit(authorization, 'DIRECTORY_QUERY_INVALID');
        if (!committed) return respondGrhDirectoryUnavailable(res);
        return res.status(400).json({
          error: 'Consulta de directorio invalida',
          code: 'GRH_DIRECTORY_QUERY_INVALID',
        });
      }
      if (error?.status === 403) {
        const committed = await commitFailureAudit(authorization, 'DIRECTORY_SCOPE_DENIED');
        if (!committed) return respondGrhDirectoryUnavailable(res);
        return respondGrhDirectoryDenied(res, 'GRH_DIRECTORY_SCOPE_DENIED');
      }
      if (error?.status === 404) {
        const committed = await authorization.commitAudit({
          outcome: 'ALLOWED',
          reason: authorization.decision.reason,
          resultCount: 0,
          decision: authorization.decision,
        });
        if (!committed) return respondGrhDirectoryUnavailable(res);
        return res.status(404).json({
          error: 'Legajo no encontrado',
          code: 'GRH_DIRECTORY_NOT_FOUND',
        });
      }
      if (error?.status === 409) {
        const committed = await commitFailureAudit(authorization, 'DIRECTORY_RESULT_AMBIGUOUS');
        if (!committed) return respondGrhDirectoryUnavailable(res);
        return res.status(409).json({
          error: 'El legajo requiere codigo de empresa',
          code: 'GRH_DIRECTORY_LEGAJO_AMBIGUOUS',
        });
      }
      await commitFailureAudit(authorization, 'DIRECTORY_READ_ERROR');
      return respondGrhDirectoryUnavailable(res);
    }
  };
}

export default createGrhDirectoryHandler();
