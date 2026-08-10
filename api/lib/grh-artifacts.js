import { readFile } from 'node:fs/promises';
import { gunzip as gunzipCallback } from 'node:zlib';
import { promisify, TextDecoder } from 'node:util';
import pg from 'pg';
import {
  inspectGrhPublicationBundle,
  inspectGrhRuntimeBundle,
} from './grh-contract.js';
import databaseUrlPolicy from '../../shared/database-url-policy.cjs';

const { Pool } = pg;
const { inspectDatabaseUrl } = databaseUrlPolicy;
const ALLOWED_ARTIFACTS = new Set(['profile', 'semantic']);
const ARTIFACT_SOURCES = new Set(['database', 'sealed']);
const MAX_SEALED_COMPRESSED_BYTES = 1024 * 1024;
const MAX_SEALED_EXPANDED_BYTES = 8 * 1024 * 1024;
const MAX_SEALED_BASE64_LENGTH = Math.ceil(MAX_SEALED_COMPRESSED_BYTES / 3) * 4;
const gunzip = promisify(gunzipCallback);
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

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

function configuredArtifactSource(environment) {
  const configured = environment.GRH_ARTIFACT_SOURCE;
  const source = configured === undefined || configured === '' ? 'database' : configured;
  if (typeof source !== 'string' || !ARTIFACT_SOURCES.has(source)) {
    throw artifactError(
      'GRH_ARTIFACT_SOURCE_INVALID',
      'La fuente de artefactos GRH no esta configurada con un modo permitido.',
    );
  }
  return source;
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

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sealedBase64Payload(environment) {
  if (environment.GRH_SEALED_BUNDLE_BASE64 !== undefined) {
    return environment.GRH_SEALED_BUNDLE_BASE64;
  }

  const configuredParts = environment.GRH_SEALED_BUNDLE_PARTS;
  if (configuredParts === undefined || configuredParts === '') {
    throw artifactError(
      'GRH_SEALED_BUNDLE_PARTS_REQUIRED',
      'La cantidad de fragmentos del bundle GRH sellado no esta configurada.',
    );
  }
  if (typeof configuredParts !== 'string' || !/^(?:[2-9]|1[0-6])$/.test(configuredParts)) {
    throw artifactError(
      'GRH_SEALED_BUNDLE_PARTS_INVALID',
      'La cantidad de fragmentos del bundle GRH sellado no es valida.',
    );
  }

  const fragments = [];
  let totalLength = 0;
  const partCount = Number(configuredParts);
  for (let index = 1; index <= partCount; index += 1) {
    const name = `GRH_SEALED_BUNDLE_${String(index).padStart(2, '0')}`;
    const fragment = environment[name];
    if (fragment === undefined) {
      throw artifactError(
        'GRH_SEALED_BUNDLE_PART_REQUIRED',
        'Falta un fragmento requerido del bundle GRH sellado.',
      );
    }
    if (fragment === '') {
      throw artifactError(
        'GRH_SEALED_BUNDLE_PART_EMPTY',
        'Un fragmento del bundle GRH sellado esta vacio.',
      );
    }
    if (typeof fragment !== 'string') {
      throw artifactError(
        'GRH_SEALED_BUNDLE_PART_INVALID',
        'Un fragmento del bundle GRH sellado no es valido.',
      );
    }
    totalLength += fragment.length;
    if (totalLength > MAX_SEALED_BASE64_LENGTH) {
      throw artifactError(
        'GRH_SEALED_BUNDLE_COMPRESSED_LIMIT',
        'El bundle GRH sellado excede el limite comprimido permitido.',
      );
    }
    fragments.push(fragment);
  }
  return fragments.join('');
}

function decodeBase64Payload(payload) {
  if (payload === undefined || payload === '') {
    throw artifactError(
      'GRH_SEALED_BUNDLE_REQUIRED',
      'El bundle GRH sellado no esta configurado.',
    );
  }
  if (
    typeof payload !== 'string' ||
    payload.length > MAX_SEALED_BASE64_LENGTH ||
    payload.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload)
  ) {
    const code = typeof payload === 'string' && payload.length > MAX_SEALED_BASE64_LENGTH
      ? 'GRH_SEALED_BUNDLE_COMPRESSED_LIMIT'
      : 'GRH_SEALED_BUNDLE_ENCODING_INVALID';
    throw artifactError(code, 'El bundle GRH sellado no tiene una codificacion valida.');
  }

  const paddingBytes = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  const decodedLength = (payload.length / 4) * 3 - paddingBytes;
  if (decodedLength === 0 || decodedLength > MAX_SEALED_COMPRESSED_BYTES) {
    throw artifactError(
      decodedLength === 0 ? 'GRH_SEALED_BUNDLE_ENCODING_INVALID' : 'GRH_SEALED_BUNDLE_COMPRESSED_LIMIT',
      'El bundle GRH sellado excede el limite comprimido permitido.',
    );
  }
  const decoded = Buffer.from(payload, 'base64');
  if (decoded.toString('base64') !== payload) {
    throw artifactError(
      'GRH_SEALED_BUNDLE_ENCODING_INVALID',
      'El bundle GRH sellado no tiene una codificacion valida.',
    );
  }
  return decoded;
}

async function readSealedBundle(environment) {
  const compressed = decodeBase64Payload(sealedBase64Payload(environment));
  if (compressed.length < 18 || compressed[0] !== 0x1f || compressed[1] !== 0x8b) {
    throw artifactError(
      'GRH_SEALED_BUNDLE_COMPRESSION_INVALID',
      'El bundle GRH sellado no tiene un contenedor gzip valido.',
    );
  }

  let expanded;
  try {
    expanded = await gunzip(compressed, { maxOutputLength: MAX_SEALED_EXPANDED_BYTES });
  } catch (error) {
    const expansionLimit = error?.code === 'ERR_BUFFER_TOO_LARGE';
    throw artifactError(
      expansionLimit
        ? 'GRH_SEALED_BUNDLE_EXPANSION_LIMIT'
        : 'GRH_SEALED_BUNDLE_COMPRESSION_INVALID',
      expansionLimit
        ? 'El bundle GRH sellado excede el limite de expansion permitido.'
        : 'El bundle GRH sellado no tiene un contenedor gzip valido.',
    );
  }

  let decoded;
  try {
    decoded = JSON.parse(utf8Decoder.decode(expanded));
  } catch {
    throw artifactError(
      'GRH_SEALED_BUNDLE_JSON_INVALID',
      'El bundle GRH sellado no contiene un documento JSON valido.',
    );
  }

  const keys = isPlainObject(decoded) ? Object.keys(decoded).sort() : [];
  if (
    keys.length !== 3 ||
    keys[0] !== 'manifest' ||
    keys[1] !== 'profile' ||
    keys[2] !== 'semantic' ||
    !isPlainObject(decoded.profile) ||
    !isPlainObject(decoded.semantic) ||
    !isPlainObject(decoded.manifest)
  ) {
    throw artifactError(
      'GRH_SEALED_BUNDLE_STRUCTURE_INVALID',
      'El bundle GRH sellado no cumple la estructura requerida.',
    );
  }
  return decoded;
}

async function loadSealedGrhArtifactBundle(environment) {
  const configuredPin = configuredSourceSha256(environment, true);
  const { profile, semantic, manifest } = await readSealedBundle(environment);
  const publicationInspection = inspectGrhPublicationBundle(profile, semantic, manifest);
  if (!publicationInspection.ok) {
    throw artifactError(
      'GRH_SEALED_BUNDLE_PUBLICATION_INVALID',
      'El bundle GRH sellado no coincide con el manifiesto aprobado.',
    );
  }
  if (configuredPin !== manifest.sha256) {
    throw artifactError(
      'GRH_SOURCE_SHA256_MISMATCH',
      'El bundle GRH sellado no coincide con la fuente configurada.',
    );
  }
  const inspection = inspectGrhRuntimeBundle(metadataRows(profile, semantic), configuredPin);
  if (!inspection.ok || !inspection.bundle) {
    throw artifactError(
      'GRH_SEALED_BUNDLE_RUNTIME_INVALID',
      'El bundle GRH sellado no supera la validacion de proveniencia.',
    );
  }
  return inspection.bundle;
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

  const source = configuredArtifactSource(environment);
  if (source === 'sealed') {
    return loadSealedGrhArtifactBundle(environment);
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
  const source = configuredArtifactSource(process.env);
  if (source === 'sealed') {
    return loadGrhArtifactBundle({ tenantId, environment: process.env });
  }
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
