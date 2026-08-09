import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';
import { inspectGrhPublicationBundle } from '../api/lib/grh-contract.js';
import { publishGrhArtifactBundle } from '../api/lib/grh-publication.js';
import databaseUrlPolicy from '../shared/database-url-policy.cjs';

const { Pool } = pg;
const { inspectDatabaseUrl } = databaseUrlPolicy;

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const tenantId = argument('--tenant-id');
const dataDirectory = path.resolve(argument('--data-dir') || 'api/_data');
const manifestPath = path.resolve(argument('--manifest') || 'config/grh-source-manifest.json');
if (!tenantId || !process.env.DATABASE_URL) {
  fail('Se requieren --tenant-id y DATABASE_URL.');
} else {
  let inspectedDatabase;
  try {
    inspectedDatabase = inspectDatabaseUrl(process.env.DATABASE_URL, { nodeEnv: 'publication' });
  } catch {
    fail('DATABASE_URL no supera la política TLS: se exige sslmode=verify-full.');
  }

  if (inspectedDatabase) {
    const semantic = JSON.parse(await readFile(path.join(dataDirectory, 'grh-semantic.json'), 'utf8'));
    const profile = JSON.parse(await readFile(path.join(dataDirectory, 'grh-profile.json'), 'utf8'));
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const publicationInspection = inspectGrhPublicationBundle(profile, semantic, manifest);

    if (!publicationInspection.ok) {
      const contractErrors = publicationInspection.errors;
      fail(`Los contratos GRH no superaron la validación de privacidad/fuente: ${contractErrors.join(', ') || 'profile/source'}.`);
    } else {
      const verifiedProvenance = Object.freeze({
        source: profile.source,
        sha256: profile.sha256,
        snapshotAsOf: profile.snapshot_as_of,
      });
      const pool = new Pool({ connectionString: inspectedDatabase.connectionString });
      const client = await pool.connect();
      try {
        await publishGrhArtifactBundle(client, tenantId, profile, semantic, verifiedProvenance);
        console.log(`Contratos GRH materializados para tenant ${tenantId}: profile, semantic.`);
      } catch (error) {
        fail(`No se pudieron materializar los contratos GRH: ${error.message}`);
      } finally {
        client.release();
        await pool.end();
      }
    }
  }
}
