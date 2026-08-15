import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import {
  GRH_PERSONAS_REVIEW_SCHEMA_VERSION,
  parseGrhPersonasReviewAllowlist,
  parseGrhPersonasReviewContext,
  parseGrhPersonasReviewDocumentRevealContext,
  parseGrhPersonasReviewQuery,
} from './lib/grh-personas-review-contract.js';
import { openGrhPersonasReviewEvidence } from './lib/grh-personas-review-crypto.js';
import grhPersonasReviewStore from './lib/grh-personas-review-store.js';
import publishedDemoPolicy from '../shared/published-demo-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';
import routePolicy from '../shared/route-policy.cjs';

const { isPublishedDemoIdentity } = publishedDemoPolicy;
const { API_CONTRACTS, HEADER_NAME } = releaseTruthContract;
const { ACTIONS, RESOURCES } = routePolicy;
const CONTRACT_VALUE = API_CONTRACTS['/api/grh-personas-review'] || GRH_PERSONAS_REVIEW_SCHEMA_VERSION;
const PRIVATE_ROLES = new Set(['TENANT_ADMIN', 'INTENDENTE']);

function setHeaders(res) {
  res.setHeader(HEADER_NAME, CONTRACT_VALUE);
  noStore(res);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Authorization');
}

function denied(res) {
  return res.status(403).json({
    error: 'La revision privada de identidades no esta habilitada para esta cuenta.',
    code: 'GRH_PERSONAS_REVIEW_PRIVATE_ACCESS_DENIED',
  });
}

function unavailable(res, code = 'GRH_PERSONAS_REVIEW_UNAVAILABLE') {
  return res.status(503).json({
    error: 'La revision privada entre GRH y PERSONAS no esta disponible.',
    code,
  });
}

function requireCommittedAudit(committed) {
  if (committed !== true) {
    const error = new Error('Private review audit was not committed');
    error.code = 'GRH_PERSONAS_REVIEW_AUDIT_UNAVAILABLE';
    throw error;
  }
}

function respondError(res, error) {
  const code = error?.code;
  if (code === 'GRH_PERSONAS_REVIEW_CASE_NOT_FOUND') {
    return res.status(404).json({ error: 'Caso de revision no encontrado.', code });
  }
  if (code === 'GRH_PERSONAS_REVIEW_INPUT_INVALID') {
    return res.status(400).json({
      error: 'Los filtros de revision no son validos.',
      code: 'GRH_PERSONAS_REVIEW_QUERY_INVALID',
    });
  }
  if (code === 'GRH_PERSONAS_REVIEW_SETUP_PENDING') return unavailable(res, code);
  console.error('[GRH-PERSONAS-REVIEW] Lectura privada no disponible');
  return unavailable(res);
}

function allowlisted(caller, environment, variable) {
  const allowlist = parseGrhPersonasReviewAllowlist(environment[variable]);
  return caller && PRIVATE_ROLES.has(caller.role) && typeof caller.tenantId === 'string' &&
    caller.tenantId === environment.GRH_TENANT_ID && typeof caller.email === 'string' &&
    caller.email.trim().length > 0 && !isPublishedDemoIdentity(caller.email) &&
    caller.authMethod !== 'published-evaluation-jwt-db' && Boolean(allowlist?.has(String(caller.id)));
}

function baseResponse(result, canDecide) {
  return {
    schemaVersion: GRH_PERSONAS_REVIEW_SCHEMA_VERSION,
    status: 'ready',
    source: result.source,
    permissions: { canRead: true, canDecide },
  };
}

function decryptDetail(result, environment) {
  const caseEvidence = openGrhPersonasReviewEvidence({
    tenantId: environment.GRH_TENANT_ID,
    runId: result.runId,
    recordType: 'case',
    stableKey: result.case.caseKey,
    envelope: result.case.evidenceEnvelope,
    environment,
  });
  const options = result.case.options.map(option => {
    const evidence = openGrhPersonasReviewEvidence({
      tenantId: environment.GRH_TENANT_ID,
      runId: result.runId,
      recordType: 'option',
      stableKey: option.optionKey,
      envelope: option.evidenceEnvelope,
      environment,
    });
    return {
      optionKey: option.optionKey,
      rank: option.rank,
      matchMethod: option.matchMethod,
      evidenceLevel: option.evidenceLevel,
      evidence: option.evidence,
      person: {
        displayName: evidence.person.displayName,
        birthDate: evidence.person.birthDate,
      },
      requiresManualCheck: option.requiresManualCheck,
    };
  });
  const { evidenceEnvelope: _privateEnvelope, optionCount: _privateOptionCount, ...safeCase } = result.case;
  return {
    ...safeCase,
    person: {
      displayName: caseEvidence.person.displayName,
      birthDate: caseEvidence.person.birthDate,
    },
    options,
  };
}

function decryptDocuments(result, environment) {
  const caseEvidence = openGrhPersonasReviewEvidence({
    tenantId: environment.GRH_TENANT_ID,
    runId: result.runId,
    recordType: 'case',
    stableKey: result.case.caseKey,
    envelope: result.case.evidenceEnvelope,
    environment,
  });
  const options = result.case.options.map(option => {
    const evidence = openGrhPersonasReviewEvidence({
      tenantId: environment.GRH_TENANT_ID,
      runId: result.runId,
      recordType: 'option',
      stableKey: option.optionKey,
      envelope: option.evidenceEnvelope,
      environment,
    });
    return {
      optionKey: option.optionKey,
      documents: {
        cuil: evidence.person.documents.cuil,
        dni: evidence.person.documents.dni,
      },
    };
  });
  return {
    case: {
      caseKey: result.case.caseKey,
      documents: {
        cuil: caseEvidence.person.documents.cuil,
        dni: caseEvidence.person.documents.dni,
      },
    },
    options,
  };
}

export function createGrhPersonasReviewHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  storeImpl = grhPersonasReviewStore,
  environment = process.env,
} = {}) {
  return async function handler(req, res) {
    setHeaders(res);
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Metodo no permitido', code: 'METHOD_NOT_ALLOWED' });
    }
    const caller = await requireCapabilityImpl(
      req,
      res,
      RESOURCES.GRH_PERSONAS_LINKAGE_REVIEW,
      ACTIONS.READ,
    );
    if (!caller) return;
    if (!allowlisted(caller, environment, 'GRH_PERSONAS_REVIEW_READ_ALLOWED_USER_IDS')) return denied(res);
    if (!requireDatasetTenantImpl(res, caller, 'GRH_TENANT_ID')) return;
    const canDecide = allowlisted(caller, environment, 'GRH_PERSONAS_REVIEW_DECISION_ALLOWED_USER_IDS');
    const query = parseGrhPersonasReviewQuery(req.query || {});
    if (!query) {
      return res.status(400).json({
        error: 'Los filtros de revision no son validos.',
        code: 'GRH_PERSONAS_REVIEW_QUERY_INVALID',
      });
    }

    try {
      if (query.view === 'summary') {
        const result = await storeImpl.summary({ tenantId: caller.tenantId });
        return res.status(200).json({ ...baseResponse(result, canDecide), summary: result.summary });
      }
      if (query.view === 'queue') {
        const result = await storeImpl.queue({ tenantId: caller.tenantId, ...query });
        return res.status(200).json({
          ...baseResponse(result, canDecide),
          summary: result.summary,
          page: result.page,
          items: result.items,
        });
      }

      const revealsDocuments = query.view === 'documents';
      const context = revealsDocuments
        ? parseGrhPersonasReviewDocumentRevealContext(req.headers || {})
        : parseGrhPersonasReviewContext(req.headers || {});
      if (!context) {
        return res.status(400).json({
          error: revealsDocuments
            ? 'El acceso a documentos requiere un motivo especifico y una referencia nueva.'
            : 'El detalle requiere un motivo de consulta y una referencia nueva.',
          code: revealsDocuments
            ? 'GRH_PERSONAS_REVIEW_DOCUMENT_REVEAL_CONTEXT_INVALID'
            : 'GRH_PERSONAS_REVIEW_CONTEXT_INVALID',
        });
      }
      const result = await storeImpl.detail({ tenantId: caller.tenantId, caseKey: query.caseKey });
      const auditCommitted = await storeImpl[revealsDocuments ? 'recordDocumentReveal' : 'recordDetailRead']({
        tenantId: caller.tenantId,
        actorUserId: caller.id,
        caseKey: query.caseKey,
        purpose: context.purpose,
        correlationId: context.correlationId,
        optionCount: result.case.optionCount,
      });
      requireCommittedAudit(auditCommitted);
      if (revealsDocuments) {
        const documents = decryptDocuments(result, environment);
        return res.status(200).json({
          ...baseResponse(result, canDecide),
          documentsRevealed: true,
          documents,
        });
      }
      const detail = decryptDetail(result, environment);
      return res.status(200).json({
        ...baseResponse(result, canDecide),
        summary: result.summary,
        documentsRevealed: false,
        case: detail,
      });
    } catch (error) {
      return respondError(res, error);
    }
  };
}

export default createGrhPersonasReviewHandler();
