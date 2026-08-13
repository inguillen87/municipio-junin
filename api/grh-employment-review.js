import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import { assertPrismaDatabaseTransport, prisma } from './lib/db.js';
import { inspectGrhDirectoryArtifact } from './lib/grh-directory-contract.js';
import { loadGrhDirectorySnapshotArtifact } from './lib/grh-directory-snapshot.js';
import { inspectGrhEmploymentReviewContract } from './lib/grh-employment-review-contract.js';
import {
  buildGrhEmploymentReviewProjection,
  GRH_EMPLOYMENT_REVIEW_SCHEMA_VERSION,
} from './lib/grh-employment-review-projection.js';
import routePolicy from '../shared/route-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';
import publishedDemoPolicy from '../shared/published-demo-policy.cjs';

const { ACTIONS, RESOURCES } = routePolicy;
const { HEADER_NAME } = releaseTruthContract;
const { isPublishedDemoIdentity } = publishedDemoPolicy;
const SOURCE_SHA256_PATTERN = /^[0-9a-f]{64}$/;

async function defaultSnapshotQuery(sql, values) {
  if (!assertPrismaDatabaseTransport()) throw new Error('GRH directory database unavailable');
  const rows = await prisma.$queryRawUnsafe(sql, ...values);
  return { rows };
}

async function readSnapshot({ tenantId, environment, queryImpl = defaultSnapshotQuery }) {
  return loadGrhDirectorySnapshotArtifact({
    tenantId,
    key: environment.GRH_DIRECTORY_SNAPSHOT_KEY_V1,
    queryImpl,
  });
}

function unavailable(res) {
  return res.status(503).json({
    error: 'La revisión de situaciones laborales no está disponible.',
    code: 'GRH_EMPLOYMENT_REVIEW_UNAVAILABLE',
  });
}

export function createGrhEmploymentReviewHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readSnapshotImpl = readSnapshot,
  inspectArtifactImpl = inspectGrhDirectoryArtifact,
  buildProjectionImpl = buildGrhEmploymentReviewProjection,
  inspectContractImpl = inspectGrhEmploymentReviewContract,
  isPublishedDemoIdentityImpl = isPublishedDemoIdentity,
  environment = process.env,
} = {}) {
  return async function handler(req, res) {
    res.setHeader(HEADER_NAME || 'X-MuniControl-Contract', GRH_EMPLOYMENT_REVIEW_SCHEMA_VERSION);
    noStore(res);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Authorization');

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Método no permitido', code: 'METHOD_NOT_ALLOWED' });
    }

    const caller = await requireCapabilityImpl(
      req,
      res,
      RESOURCES.GRH_ORGANIZATION_ANALYTICS,
      ACTIONS.READ,
    );
    if (!caller || !requireDatasetTenantImpl(res, caller, 'GRH_TENANT_ID')) return;

    try {
      const expectedSha = environment.GRH_SOURCE_SHA256;
      if (!SOURCE_SHA256_PATTERN.test(expectedSha || '')) throw new Error('GRH source pin unavailable');
      const artifact = await readSnapshotImpl({
        tenantId: String(caller.tenantId),
        environment,
      });
      if (!inspectArtifactImpl(artifact)?.ok || artifact.source.sha256 !== expectedSha) {
        throw new Error('GRH employment review source invalid');
      }
      const audience = isPublishedDemoIdentityImpl(caller.email) ? 'portable' : 'private';
      const projection = buildProjectionImpl(artifact, { audience });
      if (!inspectContractImpl(projection)?.ok) throw new Error('GRH employment review contract invalid');
      return res.status(200).json(projection);
    } catch {
      console.error('[GRH-EMPLOYMENT-REVIEW] Proyección no disponible');
      return unavailable(res);
    }
  };
}

export default createGrhEmploymentReviewHandler();
