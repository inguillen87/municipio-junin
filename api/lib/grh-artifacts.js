import { readFile } from 'node:fs/promises';
import pg from 'pg';
import {
  inspectGrhPublicationBundle,
  inspectGrhRuntimeBundle,
} from './grh-contract.js';
import databaseUrlPolicy from '../../shared/database-url-policy.cjs';

const { Pool } = pg;
const { inspectDatabaseUrl } = databaseUrlPolicy;
const ALLOWED_ARTIFACTS = new Set(['profile', 'semantic']);

const READ_ACTIVE_BUNDLE_SQL = `SELECT artifact,
       schema_version,
       TO_CHAR(snapshot_as_of, 'YYYY-MM-DD') AS snapshot_as_of,
       BTRIM(source_sha256) AS source_sha256,
       payload
  FROM grh_artifacts
 WHERE tenant_id = $1
   AND active = TRUE
   AND artifact IN ('profile', 'semantic')
 ORDER BY artifact ASC`;

let pool;

function databasePool(environment = process.env) {
  if (!environment.DATABASE_URL) return null;
  const inspected = inspectDatabaseUrl(environment.DATABASE_URL, { nodeEnv: environment.NODE_ENV });
  pool ??= new Pool({ connectionString: inspected.connectionString });
  return pool;
}

function artifactError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function configuredSourceSha256(environment, required) {
  const configured = environment.GRH_SOURCE_SHA256;
  if (configured === undefined || configured === '') {
    if (required) {
      throw artifactError(
        'GRH_SOURCE_SHA256_REQUIRED',
        'La fuente GRH aprobada no esta configurada.',
      );
    }
    return null;
  }
  if (typeof configured !== 'string' || !/^[0-9a-f]{64}$/.test(configured)) {
    throw artifactError(
      'GRH_SOURCE_SHA256_INVALID',
      'La fuente GRH aprobada no cumple el contrato SHA-256.',
    );
  }
  return configured;
}

async function readLocalJson(artifact) {
  const urls = {
    profile: new URL('../_data/grh-profile.json', import.meta.url),
    semantic: new URL('../_data/grh-semantic.json', import.meta.url),
    manifest: new URL('../../config/grh-source-manifest.json', import.meta.url),
  };
  if (!urls[artifact]) throw artifactError('GRH_LOCAL_ARTIFACT_UNKNOWN', 'Artefacto GRH local desconocido.');
  return JSON.parse(await readFile(urls[artifact], 'utf8'));
}

function metadataRows(profile, semantic) {
  return [
    {
      artifact: 'profile',
      schema_version: profile?.schema_version,
      snapshot_as_of: profile?.snapshot_as_of,
      source_sha256: profile?.sha256,
      payload: profile,
    },
    {
      artifact: 'semantic',
      schema_version: semantic?.schema_version,
      snapshot_as_of: semantic?.source?.snapshot_as_of,
      source_sha256: semantic?.source?.sha256,
      payload: semantic,
    },
  ];
}

function assertRuntimeInspection(inspection) {
  if (!inspection.ok || !inspection.bundle) {
    throw artifactError('GRH_RUNTIME_BUNDLE_INVALID', 'El bundle privado GRH no supera la validacion de proveniencia.');
  }
  return inspection.bundle;
}

export async function loadGrhArtifactBundle({
  tenantId,
  queryImpl = null,
  environment = process.env,
  readLocalJsonImpl = readLocalJson,
} = {}) {
  if (typeof tenantId !== 'string' || tenantId.length === 0) {
    throw artifactError('GRH_TENANT_REQUIRED', 'Tenant GRH requerido.');
  }

  const configuredPin = configuredSourceSha256(
    environment,
    Boolean(queryImpl) || environment.NODE_ENV === 'production',
  );
  if (queryImpl) {
    const result = await queryImpl(READ_ACTIVE_BUNDLE_SQL, [tenantId]);
    return assertRuntimeInspection(inspectGrhRuntimeBundle(result?.rows, configuredPin));
  }

  const localAllowed = environment.NODE_ENV !== 'production' &&
    environment.ALLOW_LOCAL_GRH_ARTIFACTS === 'true';
  if (!localAllowed) {
    throw artifactError('GRH_RUNTIME_BUNDLE_UNAVAILABLE', 'Bundle GRH privado no materializado.');
  }

  const [profile, semantic, manifest] = await Promise.all([
    readLocalJsonImpl('profile'),
    readLocalJsonImpl('semantic'),
    readLocalJsonImpl('manifest'),
  ]);
  const publicationInspection = inspectGrhPublicationBundle(profile, semantic, manifest);
  if (!publicationInspection.ok) {
    throw artifactError('GRH_LOCAL_BUNDLE_INVALID', 'El bundle GRH local no coincide con el manifiesto aprobado.');
  }
  if (configuredPin !== null && configuredPin !== manifest.sha256) {
    throw artifactError('GRH_SOURCE_SHA256_MISMATCH', 'El bundle GRH local no coincide con la fuente configurada.');
  }
  return assertRuntimeInspection(inspectGrhRuntimeBundle(
    metadataRows(profile, semantic),
    manifest.sha256,
  ));
}

export async function readGrhArtifactBundle(tenantId) {
  const db = databasePool();
  const queryImpl = db ? (text, params) => db.query(text, params) : null;
  return loadGrhArtifactBundle({ tenantId, queryImpl });
}

export async function readGrhArtifact(artifact, tenantId) {
  if (!ALLOWED_ARTIFACTS.has(artifact)) {
    throw artifactError('GRH_ARTIFACT_UNKNOWN', 'Artefacto GRH no configurado.');
  }
  const bundle = await readGrhArtifactBundle(tenantId);
  return bundle[artifact];
}
