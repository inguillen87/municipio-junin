import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import { readGrhArtifactBundle } from './lib/grh-artifacts.js';
import { buildGrhCloseProjection } from './lib/grh-close-projection.js';
import {
  inspectGrhDecisionBriefContract,
} from './lib/grh-decision-brief-contract.js';
import {
  buildGrhDecisionBriefProjection,
} from './lib/grh-decision-brief-projection.js';
import { buildGrhExecutiveProjection } from './lib/grh-executive-projection.js';
import { buildGrhQualityProjection } from './lib/grh-quality-projection.js';
import routePolicy from '../shared/route-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';

const { ACTIONS, RESOURCES } = routePolicy;
const { API_CONTRACTS, HEADER_NAME } = releaseTruthContract;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function unavailableResponse(res) {
  return res.status(503).json({
    error: 'El brief ejecutivo GRH no esta disponible.',
    code: 'GRH_DECISION_BRIEF_CONTRACT_UNAVAILABLE',
  });
}

function pinnedBundleIsConsistent(bundle, configuredPin = process.env.GRH_SOURCE_SHA256) {
  const profile = bundle?.profile;
  const semantic = bundle?.semantic;
  const provenance = bundle?.provenance;
  const sourceSha256 = provenance?.sourceSha256;
  const configuredPinIsConsistent = configuredPin === undefined || configuredPin === '' || (
    typeof configuredPin === 'string' &&
    SHA256_PATTERN.test(configuredPin) &&
    configuredPin === sourceSha256
  );

  return profile?.schema_version === 'grh-profile-v1' &&
    semantic?.schema_version === 'grh-semantic-v2' &&
    provenance?.profileSchemaVersion === profile.schema_version &&
    provenance?.semanticSchemaVersion === semantic.schema_version &&
    provenance?.sourceFile === profile.source &&
    provenance.sourceFile === semantic?.source?.file &&
    sourceSha256 === profile.sha256 &&
    sourceSha256 === semantic?.source?.sha256 &&
    provenance?.approvedSourceSha256 === sourceSha256 &&
    SHA256_PATTERN.test(provenance.approvedSourceSha256) &&
    provenance?.snapshotAsOf === profile.snapshot_as_of &&
    provenance.snapshotAsOf === semantic?.source?.snapshot_as_of &&
    profile?.compressed_size_bytes === semantic?.source?.compressed_size_bytes &&
    profile?.canonical_source === semantic?.source?.canonical_system &&
    JSON.stringify(profile?.excluded_sources) === JSON.stringify(semantic?.privacy?.excluded_sources) &&
    configuredPinIsConsistent;
}

export function createGrhDecisionBriefHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readArtifactBundleImpl = readGrhArtifactBundle,
  buildExecutiveProjectionImpl = buildGrhExecutiveProjection,
  buildQualityProjectionImpl = buildGrhQualityProjection,
  buildCloseProjectionImpl = buildGrhCloseProjection,
  buildDecisionBriefProjectionImpl = buildGrhDecisionBriefProjection,
  inspectContractImpl = inspectGrhDecisionBriefContract,
} = {}) {
  return async function handler(req, res) {
    res.setHeader(HEADER_NAME, API_CONTRACTS['/api/grh-decision-brief']);
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

      const executive = buildExecutiveProjectionImpl(bundle.semantic, { audience: 'interactive' });
      const quality = buildQualityProjectionImpl(bundle.profile, bundle.semantic);
      const close = buildCloseProjectionImpl(bundle.semantic);
      const projection = buildDecisionBriefProjectionImpl(executive, quality, close);
      const inspection = inspectContractImpl(projection);
      if (!inspection?.ok) throw new Error('GRH decision brief contract invalid');

      return res.status(200).json(projection);
    } catch {
      console.error('[GRH-DECISION-BRIEF] Brief ejecutivo gobernado no disponible');
      return unavailableResponse(res);
    }
  };
}

export default createGrhDecisionBriefHandler();
