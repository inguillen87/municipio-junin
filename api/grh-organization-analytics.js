import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import { assertPrismaDatabaseTransport, prisma } from './lib/db.js';
import { inspectGrhDirectoryArtifact } from './lib/grh-directory-contract.js';
import { loadGrhDirectorySnapshotArtifact } from './lib/grh-directory-snapshot.js';
import {
  GRH_ORGANIZATION_ANALYTICS_SCHEMA_VERSION,
  inspectGrhOrganizationAnalyticsContract,
} from './lib/grh-organization-analytics-contract.js';
import {
  buildGrhOrganizationAnalyticsProjection,
} from './lib/grh-organization-analytics-projection.js';
import routePolicy from '../shared/route-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';

const { ACTIONS, RESOURCES } = routePolicy;
const { API_CONTRACTS, HEADER_NAME } = releaseTruthContract;
const SOURCE_SHA256_PATTERN = /^[0-9a-f]{64}$/;

export const GRH_ORGANIZATION_ANALYTICS_RESOURCE =
  RESOURCES.GRH_ORGANIZATION_ANALYTICS || 'grh.organization.analytics';

const CONTRACT_VALUE = API_CONTRACTS['/api/grh-organization-analytics'] ||
  GRH_ORGANIZATION_ANALYTICS_SCHEMA_VERSION;

function unavailableResponse(res) {
  return res.status(503).json({
    error: 'La analitica organizacional GRH no esta disponible.',
    code: 'GRH_ORGANIZATION_ANALYTICS_UNAVAILABLE',
  });
}

async function defaultSnapshotQuery(sql, values) {
  if (!assertPrismaDatabaseTransport()) {
    const error = new Error('GRH directory database unavailable');
    error.code = 'GRH_DIRECTORY_SNAPSHOT_DATABASE_UNAVAILABLE';
    throw error;
  }
  const rows = await prisma.$queryRawUnsafe(sql, ...values);
  return { rows };
}

export async function readEncryptedGrhDirectorySnapshot({
  tenantId,
  environment = process.env,
  queryImpl = defaultSnapshotQuery,
} = {}) {
  return loadGrhDirectorySnapshotArtifact({
    tenantId,
    key: environment.GRH_DIRECTORY_SNAPSHOT_KEY_V1,
    queryImpl,
  });
}

function sourcePinIsValid(artifact, environment) {
  const pin = environment?.GRH_SOURCE_SHA256;
  return typeof pin === 'string' && SOURCE_SHA256_PATTERN.test(pin) &&
    artifact?.source?.sha256 === pin;
}

export function createGrhOrganizationAnalyticsHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readSnapshotArtifactImpl = readEncryptedGrhDirectorySnapshot,
  inspectArtifactImpl = inspectGrhDirectoryArtifact,
  buildProjectionImpl = buildGrhOrganizationAnalyticsProjection,
  inspectContractImpl = inspectGrhOrganizationAnalyticsContract,
  environment = process.env,
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

    const caller = await requireCapabilityImpl(
      req,
      res,
      GRH_ORGANIZATION_ANALYTICS_RESOURCE,
      ACTIONS.READ,
    );
    if (!caller || !requireDatasetTenantImpl(res, caller, 'GRH_TENANT_ID')) return;

    try {
      const artifact = await readSnapshotArtifactImpl({
        tenantId: String(caller.tenantId),
        environment,
      });
      if (!inspectArtifactImpl(artifact)?.ok || !sourcePinIsValid(artifact, environment)) {
        throw new Error('GRH organization analytics source invalid');
      }
      const projection = buildProjectionImpl(artifact);
      if (!inspectContractImpl(projection)?.ok) {
        throw new Error('GRH organization analytics contract invalid');
      }
      return res.status(200).json(projection);
    } catch {
      console.error('[GRH-ORGANIZATION-ANALYTICS] Proyeccion gobernada no disponible');
      return unavailableResponse(res);
    }
  };
}

export default createGrhOrganizationAnalyticsHandler();
