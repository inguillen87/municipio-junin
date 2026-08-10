import { readFile } from 'node:fs/promises';
import process from 'node:process';
import pg from 'pg';
import databaseUrlPolicy from '../shared/database-url-policy.cjs';

const { Pool } = pg;
const { inspectDatabaseUrl } = databaseUrlPolicy;

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

const tenantId = argument('--tenant-id');
if (!tenantId || !/^[A-Za-z0-9_-]{10,80}$/.test(tenantId)) {
  fail('GRH_INSPECTION_TENANT_REQUIRED', 'Se requiere un tenant id válido para inspeccionar la materialización GRH.');
}
const configuredDatabaseUrl = process.env.GRH_INSPECTION_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!configuredDatabaseUrl) fail('GRH_INSPECTION_DATABASE_REQUIRED', 'No hay una conexión autorizada para la inspección GRH.');

function enforceNeonVerifyFull(connectionString) {
  if (!process.argv.includes('--enforce-neon-verify-full')) return connectionString;
  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    fail('GRH_INSPECTION_DATABASE_POLICY', 'La conexión autorizada no es canónica.');
  }
  if (!parsed.hostname.toLowerCase().endsWith('.neon.tech')) {
    fail('GRH_INSPECTION_DATABASE_POLICY', 'El ajuste TLS explícito sólo admite un endpoint Neon verificado.');
  }
  parsed.searchParams.delete('sslmode');
  parsed.searchParams.append('sslmode', 'verify-full');
  return parsed.href;
}

const databaseUrl = enforceNeonVerifyFull(configuredDatabaseUrl);

let inspected;
try {
  inspected = inspectDatabaseUrl(databaseUrl, { nodeEnv: 'inspection' });
} catch {
  fail('GRH_INSPECTION_DATABASE_POLICY', 'DATABASE_URL no supera la política TLS requerida.');
}

const manifest = JSON.parse(await readFile(new URL('../config/grh-source-manifest.json', import.meta.url), 'utf8'));
const pool = new Pool({ connectionString: inspected.connectionString, max: 1 });

try {
  const client = await pool.connect();
  try {
    const tenantResult = await client.query(
      'SELECT slug, status::text AS status, plan::text AS plan FROM tenants WHERE id = $1',
      [tenantId],
    );
    const tableResult = await client.query(
      "SELECT pg_catalog.to_regclass('public.grh_artifacts')::text AS relation",
    );
    const tablePresent = tableResult.rows[0]?.relation === 'grh_artifacts';
    const artifacts = tablePresent
      ? (await client.query(
        `SELECT artifact,
                schema_version,
                TO_CHAR(snapshot_as_of, 'YYYY-MM-DD') AS snapshot_as_of,
                BTRIM(source_sha256) AS source_sha256,
                active,
                updated_at
           FROM grh_artifacts
          WHERE tenant_id = $1
          ORDER BY artifact ASC`,
        [tenantId],
      )).rows
      : [];
    const activeArtifacts = artifacts.filter(row => row.active === true);
    const artifactNames = activeArtifacts.map(row => row.artifact);
    const pairReady = artifactNames.length === 2 && artifactNames[0] === 'profile' && artifactNames[1] === 'semantic';
    const sourcePinned = pairReady && activeArtifacts.every(row => row.source_sha256 === manifest.sha256);
    const snapshotPinned = pairReady && activeArtifacts.every(row => row.snapshot_as_of === manifest.snapshot_as_of);

    console.log(JSON.stringify({
      ok: true,
      tenant: tenantResult.rows[0] ?? null,
      tablePresent,
      artifacts: artifacts.map(row => ({
        artifact: row.artifact,
        schemaVersion: row.schema_version,
        snapshotAsOf: row.snapshot_as_of,
        sourceMatchesManifest: row.source_sha256 === manifest.sha256,
        active: row.active,
        updatedAt: row.updated_at,
      })),
      readiness: {
        pairReady,
        sourcePinned,
        snapshotPinned,
        runtimeReady: Boolean(tenantResult.rows[0]) && tablePresent && pairReady && sourcePinned && snapshotPinned,
      },
    }, null, 2));
  } finally {
    client.release();
  }
} catch (error) {
  fail(error?.code ?? 'GRH_INSPECTION_FAILED', 'No se pudo inspeccionar la materialización GRH con la conexión autorizada.');
} finally {
  await pool.end();
}
