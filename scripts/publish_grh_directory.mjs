import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

import {
  inspectGrhDirectoryArtifact,
} from '../api/lib/grh-directory-contract.js';
import { publishGrhDirectory } from '../api/lib/grh-directory-publication.js';
import databaseUrlPolicy from '../shared/database-url-policy.cjs';

const { Pool } = pg;
const { inspectDatabaseUrl } = databaseUrlPolicy;

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function manifestMatchesArtifact(manifest, artifact) {
  const manifestKeys = [
    'schema_version',
    'canonical_system',
    'source_file',
    'sha256',
    'compressed_size_bytes',
    'snapshot_as_of',
    'excluded_sources',
    'approval_basis',
  ];
  return exactKeys(manifest, manifestKeys) &&
    manifest.schema_version === 'grh-source-manifest-v1' &&
    manifest.canonical_system === artifact.source.canonical_system &&
    manifest.source_file === artifact.source.file &&
    manifest.sha256 === artifact.source.sha256 &&
    manifest.compressed_size_bytes === artifact.source.compressed_size_bytes &&
    manifest.snapshot_as_of === artifact.source.snapshot_as_of &&
    JSON.stringify(manifest.excluded_sources) === JSON.stringify(['personas_junin']) &&
    typeof manifest.approval_basis === 'string' && manifest.approval_basis.trim().length > 0;
}

export async function runPublication({
  environment = process.env,
  dataPath = path.resolve(argument('--data') || 'api/_data/grh-directory.json'),
  manifestPath = path.resolve(argument('--manifest') || 'config/grh-source-manifest.json'),
  poolFactory = options => new Pool(options),
} = {}) {
  const tenantId = String(environment.GRH_TENANT_ID || '').trim();
  if (!tenantId || !environment.DATABASE_URL) {
    throw new Error('GRH_DIRECTORY_PUBLICATION_CONFIGURATION_REQUIRED');
  }
  const inspectedDatabase = inspectDatabaseUrl(environment.DATABASE_URL, {
    nodeEnv: 'publication',
    environment,
  });
  const [artifact, manifest] = await Promise.all([
    readFile(dataPath, 'utf8').then(JSON.parse),
    readFile(manifestPath, 'utf8').then(JSON.parse),
  ]);
  const inspection = inspectGrhDirectoryArtifact(artifact);
  if (!inspection.ok || !manifestMatchesArtifact(manifest, artifact)) {
    throw new Error('GRH_DIRECTORY_PUBLICATION_CONTRACT_INVALID');
  }

  const pool = poolFactory({ connectionString: inspectedDatabase.connectionString });
  const client = await pool.connect();
  try {
    return await publishGrhDirectory(client, tenantId, artifact);
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  try {
    const result = await runPublication();
    const label = result.status === 'unchanged' ? 'sin cambios' : 'materializado';
    console.log('Directorio GRH ' + label + '.');
  } catch {
    console.error('No se pudo materializar el directorio GRH privado.');
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) await main();
