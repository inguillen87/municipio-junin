import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import { assertPrismaDatabaseTransport, prisma } from './lib/db.js';
import { readGrhArtifactBundle } from './lib/grh-artifacts.js';
import {
  inspectGrhProfileContract,
  inspectGrhSemanticContract,
} from './lib/grh-contract.js';
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
const { HEADER_NAME } = releaseTruthContract;
const SOURCE_SHA256_PATTERN = /^[0-9a-f]{64}$/;

export const GRH_ORGANIZATION_ANALYTICS_RESOURCE =
  RESOURCES.GRH_ORGANIZATION_ANALYTICS || 'grh.organization.analytics';

const CONTRACT_VALUE = GRH_ORGANIZATION_ANALYTICS_SCHEMA_VERSION;

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

function sourceIdentityIsValid({
  artifact,
  bundle,
  environment,
  inspectProfileImpl,
  inspectSemanticImpl,
}) {
  const pin = environment?.GRH_SOURCE_SHA256;
  const semantic = bundle?.semantic;
  const profile = bundle?.profile;
  if (
    typeof pin !== 'string' || !SOURCE_SHA256_PATTERN.test(pin) ||
    !inspectSemanticImpl(semantic)?.ok ||
    !inspectProfileImpl(
      profile,
      artifact?.source?.file,
      artifact?.source?.sha256,
      artifact?.source?.snapshot_as_of,
    )?.ok
  ) return false;

  return artifact?.source?.sha256 === pin &&
    semantic?.source?.sha256 === pin &&
    semantic?.source?.file === artifact?.source?.file &&
    semantic?.source?.snapshot_as_of === artifact?.source?.snapshot_as_of &&
    semantic?.source?.canonical_system === artifact?.source?.canonical_system &&
    semantic?.source?.compressed_size_bytes === artifact?.source?.compressed_size_bytes &&
    profile?.source === artifact?.source?.file &&
    profile?.sha256 === pin &&
    profile?.snapshot_as_of === artifact?.source?.snapshot_as_of;
}

export function createGrhOrganizationAnalyticsHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readSnapshotArtifactImpl = readEncryptedGrhDirectorySnapshot,
  readArtifactBundleImpl = readGrhArtifactBundle,
  inspectArtifactImpl = inspectGrhDirectoryArtifact,
  inspectProfileImpl = inspectGrhProfileContract,
  inspectSemanticImpl = inspectGrhSemanticContract,
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
      const tenantId = String(caller.tenantId);
      const [artifact, bundle] = await Promise.all([
        readSnapshotArtifactImpl({ tenantId, environment }),
        readArtifactBundleImpl(tenantId),
      ]);
      if (!inspectArtifactImpl(artifact)?.ok || !sourceIdentityIsValid({
        artifact,
        bundle,
        environment,
        inspectProfileImpl,
        inspectSemanticImpl,
      })) {
        throw new Error('GRH organization analytics source invalid');
      }
      const projection = buildProjectionImpl(artifact, bundle.semantic);
      if (!inspectContractImpl(projection, {
        expectedSourceSha256: artifact.source.sha256,
        expectedSnapshotAsOf: artifact.source.snapshot_as_of,
      })?.ok) {
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
