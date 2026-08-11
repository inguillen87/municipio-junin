import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import { readGrhArtifactBundle } from './lib/grh-artifacts.js';
import {
  readGrhWorkforceFinanceArtifact,
} from './lib/grh-workforce-finance-artifact.js';
import {
  GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
  GRH_WORKFORCE_FINANCE_APPROVED_SOURCE,
  inspectGrhWorkforceFinanceSourceContract,
} from './lib/grh-workforce-finance-source-contract.js';
import {
  GRH_WORKFORCE_FINANCE_SCHEMA_VERSION,
  inspectGrhWorkforceFinanceContract,
} from './lib/grh-workforce-finance-contract.js';
import {
  buildGrhWorkforceFinanceProjection,
} from './lib/grh-workforce-finance-projection.js';
import routePolicy from '../shared/route-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';
import tenantPresentationPolicy from '../shared/tenant-presentation-policy.cjs';

const { ACTIONS, RESOURCES } = routePolicy;
const { HEADER_NAME } = releaseTruthContract;
const { hasConfiguredCurrency, resolveTenantPresentation } = tenantPresentationPolicy;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const GRH_WORKFORCE_FINANCE_RESOURCE =
  RESOURCES.GRH_WORKFORCE_FINANCE || 'grh.workforce-finance';

const CONTRACT_VALUE = GRH_WORKFORCE_FINANCE_SCHEMA_VERSION;

function setResponseHeaders(res) {
  res.setHeader(HEADER_NAME || 'X-MuniControl-Contract', CONTRACT_VALUE);
  noStore(res);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Authorization');
}

function unavailableResponse(res) {
  return res.status(503).json({
    error: 'La analitica de dotacion y finanzas GRH no esta disponible.',
    code: 'GRH_WORKFORCE_FINANCE_UNAVAILABLE',
  });
}

function hasQueryParameters(req) {
  return req?.query !== null &&
    typeof req?.query === 'object' &&
    Object.keys(req.query).length > 0;
}

function activeBundleIdentity(bundle, approvedSource, approvedReleaseId) {
  const provenance = bundle?.provenance;
  const profile = bundle?.profile;
  const semantic = bundle?.semantic;
  if (
    typeof provenance?.sourceSha256 !== 'string' ||
    !SHA256_PATTERN.test(provenance.sourceSha256) ||
    provenance.approvedSourceSha256 !== provenance.sourceSha256 ||
    typeof provenance.snapshotAsOf !== 'string' ||
    !ISO_DATE_PATTERN.test(provenance.snapshotAsOf) ||
    typeof provenance.sourceFile !== 'string' || provenance.sourceFile.length === 0 ||
    typeof profile?.canonical_source !== 'string' || profile.canonical_source.length === 0 ||
    !Number.isSafeInteger(profile?.compressed_size_bytes) ||
    profile.compressed_size_bytes <= 0 ||
    profile.source !== provenance.sourceFile ||
    profile.sha256 !== provenance.sourceSha256 ||
    profile.snapshot_as_of !== provenance.snapshotAsOf ||
    semantic?.source?.canonical_system !== profile.canonical_source ||
    semantic?.source?.file !== provenance.sourceFile ||
    semantic?.source?.compressed_size_bytes !== profile.compressed_size_bytes ||
    profile.canonical_source !== approvedSource?.canonicalSystem ||
    provenance.sourceFile !== approvedSource?.sourceFile ||
    provenance.sourceSha256 !== approvedSource?.sourceSha256 ||
    profile.compressed_size_bytes !== approvedSource?.compressedSizeBytes ||
    provenance.snapshotAsOf !== approvedSource?.snapshotAsOf ||
    typeof approvedReleaseId !== 'string' || !SHA256_PATTERN.test(approvedReleaseId)
  ) return null;

  return Object.freeze({
    expectedCanonicalSystem: profile.canonical_source,
    expectedSourceFile: provenance.sourceFile,
    expectedCompressedSizeBytes: profile.compressed_size_bytes,
    expectedSourceSha256: provenance.sourceSha256,
    expectedSnapshotAsOf: provenance.snapshotAsOf,
    expectedReleaseId: approvedReleaseId,
  });
}

function sourceMatchesActiveBundle(sourceArtifact, expectedIdentity) {
  return sourceArtifact?.source?.canonical_system === expectedIdentity.expectedCanonicalSystem &&
    sourceArtifact?.source?.file === expectedIdentity.expectedSourceFile &&
    sourceArtifact?.source?.compressed_size_bytes === expectedIdentity.expectedCompressedSizeBytes &&
    sourceArtifact?.source?.sha256 === expectedIdentity.expectedSourceSha256 &&
    sourceArtifact?.source?.snapshot_as_of === expectedIdentity.expectedSnapshotAsOf &&
    sourceArtifact?.release_id === expectedIdentity.expectedReleaseId;
}

function projectionMatchesSource(projection, sourceArtifact, expectedIdentity) {
  return projection?.source?.canonicalSystem === expectedIdentity.expectedCanonicalSystem &&
    projection?.source?.sourceFile === expectedIdentity.expectedSourceFile &&
    projection?.source?.compressedSizeBytes === expectedIdentity.expectedCompressedSizeBytes &&
    projection?.source?.sourceSha256 === expectedIdentity.expectedSourceSha256 &&
    projection?.source?.snapshotAsOf === expectedIdentity.expectedSnapshotAsOf &&
    projection?.releaseId === expectedIdentity.expectedReleaseId &&
    projection?.releaseId === sourceArtifact?.release_id &&
    projection?.policyVersion === sourceArtifact?.policy_version;
}

function projectionPresentation(caller, {
  resolveTenantPresentationImpl,
  hasConfiguredCurrencyImpl,
}) {
  const configured = resolveTenantPresentationImpl(caller?.tenant);
  if (
    !hasConfiguredCurrencyImpl(configured) ||
    configured?.sourceCurrencyStatus !== 'not_declared_in_source'
  ) {
    throw new Error('GRH workforce-finance presentation unavailable');
  }

  return Object.freeze({
    schemaVersion: configured.schemaVersion,
    locale: configured.locale,
    displayCurrencyCode: configured.displayCurrencyCode,
    basis: configured.displayCurrencyBasis,
    effectiveFrom: configured.displayCurrencyEffectiveOn,
    sourceCurrencyStatus: configured.sourceCurrencyStatus,
  });
}

export function createGrhWorkforceFinanceHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readArtifactBundleImpl = readGrhArtifactBundle,
  readWorkforceFinanceArtifactImpl = readGrhWorkforceFinanceArtifact,
  inspectSourceImpl = inspectGrhWorkforceFinanceSourceContract,
  buildProjectionImpl = buildGrhWorkforceFinanceProjection,
  inspectContractImpl = inspectGrhWorkforceFinanceContract,
  resolveTenantPresentationImpl = resolveTenantPresentation,
  hasConfiguredCurrencyImpl = hasConfiguredCurrency,
  approvedSource = GRH_WORKFORCE_FINANCE_APPROVED_SOURCE,
  approvedReleaseId = GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
  environment = process.env,
} = {}) {
  return async function handler(req, res) {
    setResponseHeaders(res);
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
      GRH_WORKFORCE_FINANCE_RESOURCE,
      ACTIONS.READ,
    );
    if (!caller || !requireDatasetTenantImpl(res, caller, 'GRH_TENANT_ID')) return;

    if (hasQueryParameters(req)) {
      return res.status(400).json({
        error: 'Este contrato no admite filtros de consulta.',
        code: 'GRH_WORKFORCE_FINANCE_QUERY_UNSUPPORTED',
      });
    }

    try {
      const tenantId = String(caller.tenantId);
      const bundle = await readArtifactBundleImpl(tenantId);
      const expectedIdentity = activeBundleIdentity(bundle, approvedSource, approvedReleaseId);
      if (!expectedIdentity) throw new Error('GRH workforce-finance base identity invalid');

      const envelope = await readWorkforceFinanceArtifactImpl({
        tenantId,
        ...expectedIdentity,
        environment,
      });
      const sourceArtifact = envelope?.payload;
      if (
        !inspectSourceImpl(sourceArtifact)?.ok ||
        !sourceMatchesActiveBundle(sourceArtifact, expectedIdentity)
      ) {
        throw new Error('GRH workforce-finance source invalid');
      }

      const presentation = projectionPresentation(caller, {
        resolveTenantPresentationImpl,
        hasConfiguredCurrencyImpl,
      });
      const projection = buildProjectionImpl(sourceArtifact, { presentation });
      if (
        !inspectContractImpl(projection)?.ok ||
        !projectionMatchesSource(projection, sourceArtifact, expectedIdentity)
      ) {
        throw new Error('GRH workforce-finance projection invalid');
      }
      return res.status(200).json(projection);
    } catch {
      console.error('[GRH-WORKFORCE-FINANCE] Proyeccion gobernada no disponible');
      return unavailableResponse(res);
    }
  };
}

export default createGrhWorkforceFinanceHandler();
