import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import { readGrhArtifactBundle } from './lib/grh-artifacts.js';
import {
  inspectGrhCloseContract,
} from './lib/grh-close-contract.js';
import { buildGrhCloseProjection } from './lib/grh-close-projection.js';
import routePolicy from '../shared/route-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';

const { ACTIONS, RESOURCES } = routePolicy;
const { API_CONTRACTS, HEADER_NAME } = releaseTruthContract;

function unavailableResponse(res) {
  return res.status(503).json({
    error: 'La proyeccion mensual GRH no esta disponible.',
    code: 'GRH_CLOSE_CONTRACT_UNAVAILABLE',
  });
}

function pinnedBundleIsConsistent(bundle) {
  const profile = bundle?.profile;
  const semantic = bundle?.semantic;
  const provenance = bundle?.provenance;
  return profile?.schema_version === 'grh-profile-v1' &&
    semantic?.schema_version === 'grh-semantic-v2' &&
    provenance?.profileSchemaVersion === profile.schema_version &&
    provenance?.semanticSchemaVersion === semantic.schema_version &&
    provenance?.sourceFile === profile.source &&
    provenance.sourceFile === semantic?.source?.file &&
    provenance?.sourceSha256 === profile.sha256 &&
    provenance.sourceSha256 === semantic?.source?.sha256 &&
    provenance?.approvedSourceSha256 === provenance.sourceSha256 &&
    /^[0-9a-f]{64}$/.test(provenance.approvedSourceSha256) &&
    provenance?.snapshotAsOf === profile.snapshot_as_of &&
    provenance.snapshotAsOf === semantic?.source?.snapshot_as_of &&
    profile?.compressed_size_bytes === semantic?.source?.compressed_size_bytes &&
    profile?.canonical_source === semantic?.source?.canonical_system &&
    JSON.stringify(profile?.excluded_sources) === JSON.stringify(semantic?.privacy?.excluded_sources);
}

export function createGrhCloseHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readArtifactBundleImpl = readGrhArtifactBundle,
  buildProjectionImpl = buildGrhCloseProjection,
  inspectContractImpl = inspectGrhCloseContract,
} = {}) {
  return async function handler(req, res) {
    res.setHeader(HEADER_NAME, API_CONTRACTS['/api/grh-close']);
    noStore(res);
    res.setHeader('X-Content-Type-Options', 'nosniff');

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
      RESOURCES.GRH_CONTRACT,
      ACTIONS.READ,
    );
    if (!caller || !requireDatasetTenantImpl(res, caller, 'GRH_TENANT_ID')) return;

    try {
      const bundle = await readArtifactBundleImpl(process.env.GRH_TENANT_ID);
      if (!pinnedBundleIsConsistent(bundle)) throw new Error('GRH bundle pin invalid');

      const projection = buildProjectionImpl(bundle.semantic);
      const inspection = inspectContractImpl(projection);
      if (!inspection?.ok) throw new Error('GRH close contract invalid');

      return res.status(200).json(projection);
    } catch {
      console.error('[GRH-CLOSE] Proyeccion mensual gobernada no disponible');
      return unavailableResponse(res);
    }
  };
}

export default createGrhCloseHandler();
