#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import { TextDecoder } from 'node:util';
import { pathToFileURL } from 'node:url';

import pg from 'pg';

import databaseUrlPolicy from '../shared/database-url-policy.cjs';
import { GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_ENV } from '../api/lib/grh-workforce-finance-snapshot.js';
import {
  GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_DATABASE_ENV,
  GrhWorkforceFinanceSnapshotPublisherError,
  publishGrhWorkforceFinanceSnapshot,
} from '../api/lib/grh-workforce-finance-snapshot-publisher.js';

export * from '../api/lib/grh-workforce-finance-snapshot-publisher.js';

const { Pool } = pg;
const { inspectDatabaseUrl } = databaseUrlPolicy;
const PUBLISH_DATABASE_ENV = 'GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_DATABASE_URL';
const MAX_ARTIFACT_FILE_BYTES = 16 * 1024 * 1024;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function publisherError(code) {
  return new GrhWorkforceFinanceSnapshotPublisherError(code);
}

function parseArguments(argv) {
  const allowed = new Set([
    '--artifact', '--tenant-id', '--operation-id', '--entity-id', '--source-sha256',
    '--snapshot-as-of', '--release-id', '--policy-version',
  ]);
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(flag) || typeof value !== 'string' || value.length === 0 ||
        value.startsWith('--') || Object.hasOwn(parsed, flag)) {
      throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_ARGUMENT_INVALID');
    }
    parsed[flag] = value;
  }
  if (argv.length !== allowed.size * 2 ||
      [...allowed].some(flag => !Object.hasOwn(parsed, flag))) {
    throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_ARGUMENT_INVALID');
  }
  return parsed;
}

async function readArtifact(artifactPath) {
  const metadata = await stat(artifactPath);
  if (!metadata.isFile() || metadata.size === 0 || metadata.size > MAX_ARTIFACT_FILE_BYTES) {
    throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_SIZE_INVALID');
  }
  const raw = await readFile(artifactPath);
  if (raw.length !== metadata.size) {
    throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_SIZE_INVALID');
  }
  try {
    return JSON.parse(utf8Decoder.decode(raw));
  } catch {
    throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_ARTIFACT_INVALID');
  }
}

export async function runGrhWorkforceFinanceSnapshotPublisherCli({
  argv = process.argv.slice(2),
  environment = process.env,
  stdout = process.stdout,
} = {}) {
  if (GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_DATABASE_ENV !== PUBLISH_DATABASE_ENV) {
    throw publisherError('GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_CONFIGURATION_INVALID');
  }
  const args = parseArguments(argv);
  const artifact = await readArtifact(args['--artifact']);
  const inspectedUrl = inspectDatabaseUrl(
    environment[PUBLISH_DATABASE_ENV],
    { nodeEnv: environment.NODE_ENV, environment },
  );
  const pool = new Pool({ connectionString: inspectedUrl.connectionString, max: 1 });
  const client = await pool.connect();
  try {
    const receipt = await publishGrhWorkforceFinanceSnapshot({
      tenantId: args['--tenant-id'],
      operationId: args['--operation-id'],
      entityId: args['--entity-id'],
      artifact,
      key: environment[GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_ENV],
      expectedSourceSha256: args['--source-sha256'],
      expectedSnapshotAsOf: args['--snapshot-as-of'],
      expectedReleaseId: args['--release-id'],
      expectedPolicyVersion: args['--policy-version'],
      client,
    });
    stdout.write(`${JSON.stringify(receipt)}\n`);
    return receipt;
  } finally {
    client.release();
    await pool.end();
  }
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (executedPath === import.meta.url) {
  runGrhWorkforceFinanceSnapshotPublisherCli().catch(error => {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      code: typeof error?.code === 'string'
        ? error.code
        : 'GRH_WORKFORCE_FINANCE_SNAPSHOT_PUBLISH_FAILED',
    })}\n`);
    process.exitCode = 1;
  });
}
