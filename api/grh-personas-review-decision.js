import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import {
  GRH_PERSONAS_REVIEW_DECISION_SCHEMA_VERSION,
  parseGrhPersonasReviewAllowlist,
  parseGrhPersonasReviewContext,
  parseGrhPersonasReviewDecisionBody,
} from './lib/grh-personas-review-contract.js';
import grhPersonasReviewStore from './lib/grh-personas-review-store.js';
import publishedDemoPolicy from '../shared/published-demo-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';
import routePolicy from '../shared/route-policy.cjs';

const { isPublishedDemoIdentity } = publishedDemoPolicy;
const { HEADER_NAME, MUTATION_CONTRACTS } = releaseTruthContract;
const { ACTIONS, RESOURCES } = routePolicy;
const CONTRACT_VALUE = MUTATION_CONTRACTS['/api/grh-personas-review-decision'] ||
  GRH_PERSONAS_REVIEW_DECISION_SCHEMA_VERSION;
const PRIVATE_ROLES = new Set(['TENANT_ADMIN', 'INTENDENTE']);

function setHeaders(res) {
  res.setHeader(HEADER_NAME, CONTRACT_VALUE);
  noStore(res);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Authorization');
}

function privateAccess(caller, environment) {
  const readAllowlist = parseGrhPersonasReviewAllowlist(
    environment.GRH_PERSONAS_REVIEW_READ_ALLOWED_USER_IDS,
  );
  const decisionAllowlist = parseGrhPersonasReviewAllowlist(
    environment.GRH_PERSONAS_REVIEW_DECISION_ALLOWED_USER_IDS,
  );
  return caller && PRIVATE_ROLES.has(caller.role) && caller.tenantId === environment.GRH_TENANT_ID &&
    typeof caller.email === 'string' && caller.email.trim().length > 0 &&
    !isPublishedDemoIdentity(caller.email) && caller.authMethod !== 'published-evaluation-jwt-db' &&
    Boolean(readAllowlist?.has(String(caller.id))) &&
    Boolean(decisionAllowlist?.has(String(caller.id)));
}

function storeError(res, error) {
  const code = error?.code;
  if (code === 'GRH_PERSONAS_REVIEW_CASE_NOT_FOUND' || code === 'GRH_PERSONAS_REVIEW_OPTION_NOT_FOUND') {
    return res.status(404).json({ error: 'El caso o la opcion ya no esta disponible.', code });
  }
  if (['GRH_PERSONAS_REVIEW_VERSION_CONFLICT', 'GRH_PERSONAS_REVIEW_COMMAND_COLLISION',
    'GRH_PERSONAS_REVIEW_TARGET_CONFLICT'].includes(code)) {
    return res.status(409).json({ error: 'El caso cambio o la decision entra en conflicto.', code });
  }
  if (code === 'GRH_PERSONAS_REVIEW_INPUT_INVALID') {
    return res.status(400).json({ error: 'La decision no cumple el contrato.', code });
  }
  console.error('[GRH-PERSONAS-REVIEW] Decision privada no disponible');
  return res.status(503).json({
    error: 'No fue posible registrar la decision.',
    code: 'GRH_PERSONAS_REVIEW_UNAVAILABLE',
  });
}

export function createGrhPersonasReviewDecisionHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  storeImpl = grhPersonasReviewStore,
  environment = process.env,
} = {}) {
  return async function handler(req, res) {
    setHeaders(res);
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Metodo no permitido', code: 'METHOD_NOT_ALLOWED' });
    }
    const caller = await requireCapabilityImpl(
      req,
      res,
      RESOURCES.GRH_PERSONAS_LINKAGE_REVIEW,
      ACTIONS.CREATE,
    );
    if (!caller) return;
    if (!privateAccess(caller, environment)) {
      return res.status(403).json({
        error: 'La revision privada de identidades no esta habilitada para esta cuenta.',
        code: 'GRH_PERSONAS_REVIEW_PRIVATE_ACCESS_DENIED',
      });
    }
    if (!requireDatasetTenantImpl(res, caller, 'GRH_TENANT_ID')) return;
    if ((req.query && Object.keys(req.query).length > 0) ||
        (typeof req.url === 'string' && req.url.includes('?'))) {
      return res.status(400).json({
        error: 'La decision no acepta parametros de consulta.',
        code: 'GRH_PERSONAS_REVIEW_QUERY_INVALID',
      });
    }
    const body = parseGrhPersonasReviewDecisionBody(req.body);
    if (!body) {
      return res.status(400).json({
        error: 'La decision no cumple el contrato.',
        code: 'GRH_PERSONAS_REVIEW_DECISION_INPUT_INVALID',
      });
    }
    const context = parseGrhPersonasReviewContext(req.headers || {});
    if (!context) {
      return res.status(400).json({
        error: 'La decision requiere un motivo y una referencia nueva.',
        code: 'GRH_PERSONAS_REVIEW_CONTEXT_INVALID',
      });
    }
    try {
      const result = await storeImpl.decide({
        tenantId: caller.tenantId,
        actorUserId: caller.id,
        actorRole: caller.role,
        ...context,
        ...body,
      });
      return res.status(200).json({
        schemaVersion: GRH_PERSONAS_REVIEW_DECISION_SCHEMA_VERSION,
        status: 'recorded',
        replayed: result.replayed,
        decision: result.decision,
      });
    } catch (error) {
      return storeError(res, error);
    }
  };
}

export default createGrhPersonasReviewDecisionHandler();
