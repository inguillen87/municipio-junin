import { buildGrhExecutiveProjection } from './grh-executive-projection.js';
import { inspectGrhExecutiveContract } from './grh-executive-contract.js';
import { buildGrhQualityProjection } from './grh-quality-projection.js';
import { inspectGrhQualityContract } from './grh-quality-contract.js';

function portableBundleError(code, message, details = []) {
  const error = new Error(message);
  error.code = code;
  error.details = Object.freeze([...details]);
  return error;
}

function assertApprovedBundle(bundle) {
  const profile = bundle?.profile;
  const semantic = bundle?.semantic;
  const provenance = bundle?.provenance;
  const errors = [];

  if (profile?.schema_version !== 'grh-profile-v1') errors.push('profile.schema_version');
  if (semantic?.schema_version !== 'grh-semantic-v2') errors.push('semantic.schema_version');
  if (provenance?.profileSchemaVersion !== profile?.schema_version) errors.push('provenance.profile_schema');
  if (provenance?.semanticSchemaVersion !== semantic?.schema_version) errors.push('provenance.semantic_schema');
  if (provenance?.sourceFile !== profile?.source || provenance?.sourceFile !== semantic?.source?.file) {
    errors.push('provenance.source_file');
  }
  if (provenance?.sourceSha256 !== profile?.sha256 ||
      provenance?.sourceSha256 !== semantic?.source?.sha256 ||
      provenance?.approvedSourceSha256 !== provenance?.sourceSha256) {
    errors.push('provenance.source_sha256');
  }
  if (provenance?.snapshotAsOf !== profile?.snapshot_as_of ||
      provenance?.snapshotAsOf !== semantic?.source?.snapshot_as_of) {
    errors.push('provenance.snapshot');
  }

  if (errors.length > 0) {
    throw portableBundleError(
      'GRH_PORTABLE_BUNDLE_INVALID',
      'El bundle GRH no tiene proveniencia aprobada para una salida portable.',
      errors,
    );
  }
  return { profile, semantic, provenance };
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

export function buildPortableGrhViews(bundle, { rankingLimit = 10 } = {}) {
  const { profile, semantic, provenance } = assertApprovedBundle(bundle);
  const executive = buildGrhExecutiveProjection(semantic, {
    audience: 'portable',
    rankingLimit,
  });
  const quality = buildGrhQualityProjection(profile, semantic);
  const executiveInspection = inspectGrhExecutiveContract(executive);
  const qualityInspection = inspectGrhQualityContract(quality);
  const errors = [
    ...executiveInspection.errors,
    ...qualityInspection.errors,
  ];

  if (executive.source.sourceSha256 !== quality.source.sourceSha256 ||
      executive.source.snapshotAsOf !== quality.source.snapshotAsOf ||
      executive.source.sourceFile !== quality.source.sourceFile) {
    errors.push('portable.source_identity');
  }
  if (executive.privacy.audience !== 'portable' || executive.privacy.portableThreshold !== 10) {
    errors.push('portable.privacy_policy');
  }
  if (errors.length > 0) {
    throw portableBundleError(
      'GRH_PORTABLE_PROJECTION_INVALID',
      'Las proyecciones portables GRH no superan sus contratos.',
      [...new Set(errors)],
    );
  }

  return deepFreeze({ executive, quality, provenance: { ...provenance } });
}
