const ENDPOINT_TEMPLATE = `import { createHash, timingSafeEqual } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

import pg from 'pg';

import databaseUrlPolicy from '../shared/database-url-policy.cjs';
import {
  GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
  GRH_WORKFORCE_FINANCE_APPROVED_SOURCE,
  GRH_WORKFORCE_FINANCE_POLICY_VERSION,
  inspectGrhWorkforceFinanceSourceContract,
} from './lib/grh-workforce-finance-source-contract.js';
import {
  GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_ENV,
  loadGrhWorkforceFinanceSnapshotArtifact,
} from './lib/grh-workforce-finance-snapshot.js';
import {
  publishGrhWorkforceFinanceSnapshot,
} from '../scripts/publish-grh-workforce-finance-snapshot.mjs';

const { Client } = pg;
const { inspectDatabaseUrl } = databaseUrlPolicy;
const CONTRACT = 'grh-workforce-finance-bootstrap-v1';
const OPERATION_ID = __OPERATION_ID__;
const ENTITY_ID = __ENTITY_ID__;
const EXPECTED_ARTIFACT_SHA256 = __ARTIFACT_SHA256__;
const EXPECTED_KEY_FINGERPRINT_SHA256 = __KEY_FINGERPRINT_SHA256__;
const MAX_COMPRESSED_BYTES = 2 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;
const EXACT_BODY_KEYS = Object.freeze(['contract', 'operationId', 'entityId', 'artifact']);
const SAFE_RECEIPT_KEYS = Object.freeze([
  'artifactSha256', 'envelopeSha256', 'ciphertextSha256', 'plaintextBytes',
  'compressedBytes', 'periodCount', 'dimensionViewCount', 'dimensionPeriodCount',
  'cellCount', 'createdCount', 'reusedCount',
]);

export const config = { api: { bodyParser: false } };

class BootstrapError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function send(res, status, code, details = {}) {
  res.setHeader('X-MuniControl-Contract', CONTRACT);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json({ ok: status >= 200 && status < 300, code, ...details });
}

function canonicalSecret(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
    ? Buffer.from(value, 'base64url')
    : null;
}

function authorized(req) {
  const supplied = canonicalSecret(req.headers['x-grh-workforce-bootstrap-secret']);
  const expected = canonicalSecret(process.env.GRH_WORKFORCE_FINANCE_BOOTSTRAP_SECRET);
  return supplied && expected && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function assertCandidateHost(req) {
  const deployedHost = String(process.env.VERCEL_URL || '').trim().toLowerCase();
  const host = String(req.headers.host || '').trim().toLowerCase();
  if (process.env.VERCEL_ENV !== 'production' || !deployedHost || host !== deployedHost) {
    throw new BootstrapError('BOOTSTRAP_CANDIDATE_HOST_REQUIRED', 403);
  }
}

async function readBody(req) {
  const digest = String(req.headers['x-grh-body-sha256'] || '').trim();
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new BootstrapError('BOOTSTRAP_BODY_DIGEST_INVALID', 400);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_COMPRESSED_BYTES) throw new BootstrapError('BOOTSTRAP_BODY_TOO_LARGE', 413);
    chunks.push(chunk);
  }
  const compressed = Buffer.concat(chunks);
  const actual = createHash('sha256').update(compressed).digest('hex');
  if (actual !== digest) throw new BootstrapError('BOOTSTRAP_BODY_DIGEST_INVALID', 400);
  let raw;
  try {
    raw = gunzipSync(compressed, { maxOutputLength: MAX_UNCOMPRESSED_BYTES });
  } catch {
    throw new BootstrapError('BOOTSTRAP_BODY_INVALID', 400);
  }
  let body;
  try {
    body = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new BootstrapError('BOOTSTRAP_BODY_INVALID', 400);
  }
  if (!exactKeys(body, EXACT_BODY_KEYS) || body.contract !== CONTRACT ||
      body.operationId !== OPERATION_ID || body.entityId !== ENTITY_ID) {
    throw new BootstrapError('BOOTSTRAP_BODY_INVALID', 400);
  }
  return body;
}

function inspectArtifact(artifact) {
  const inspection = inspectGrhWorkforceFinanceSourceContract(artifact);
  const source = artifact?.source;
  if (!inspection.ok || artifact.release_id !== GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID ||
      artifact.policy_version !== GRH_WORKFORCE_FINANCE_POLICY_VERSION ||
      source?.canonical_system !== GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.canonicalSystem ||
      source?.file !== GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.sourceFile ||
      source?.sha256 !== GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.sourceSha256 ||
      source?.compressed_size_bytes !== GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.compressedSizeBytes ||
      source?.snapshot_as_of !== GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.snapshotAsOf) {
    throw new BootstrapError('BOOTSTRAP_ARTIFACT_INVALID', 409);
  }
}

async function apply(body) {
  inspectArtifact(body.artifact);
  const tenantId = String(process.env.GRH_TENANT_ID || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(tenantId)) {
    throw new BootstrapError('BOOTSTRAP_RUNTIME_CONFIGURATION_INVALID', 503);
  }
  let database;
  try {
    database = inspectDatabaseUrl(process.env.DIRECT_URL, {
      nodeEnv: 'production', environment: process.env,
    });
  } catch {
    throw new BootstrapError('BOOTSTRAP_DATABASE_CONFIGURATION_INVALID', 503);
  }
  const key = process.env[GRH_WORKFORCE_FINANCE_SNAPSHOT_KEY_ENV];
  const keyBytes = canonicalSecret(key);
  if (!keyBytes || createHash('sha256').update(keyBytes).digest('hex') !== EXPECTED_KEY_FINGERPRINT_SHA256) {
    throw new BootstrapError('BOOTSTRAP_SNAPSHOT_KEY_INVALID', 503);
  }
  const client = new Client({
    connectionString: database.connectionString,
    connectionTimeoutMillis: 5_000,
    query_timeout: 25_000,
    keepAlive: true,
  });
  try {
    await client.connect();
    await client.query("SET search_path TO public, pg_catalog");
    const tenant = await client.query(
      'SELECT id, slug, status, "trialEndsAt" FROM tenants WHERE id = $1', [tenantId],
    );
    const row = tenant.rows?.[0];
    const expired = row?.status === 'TRIAL' && row.trialEndsAt &&
      new Date(row.trialEndsAt).getTime() <= Date.now();
    if (!row || row.slug !== 'junin' || !['ACTIVE', 'TRIAL'].includes(row.status) || expired) {
      throw new BootstrapError('BOOTSTRAP_TENANT_INVALID', 409);
    }
    const receipt = await publishGrhWorkforceFinanceSnapshot({
      tenantId,
      operationId: OPERATION_ID,
      entityId: ENTITY_ID,
      artifact: body.artifact,
      key,
      expectedSourceSha256: GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.sourceSha256,
      expectedSnapshotAsOf: GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.snapshotAsOf,
      expectedReleaseId: GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
      expectedPolicyVersion: GRH_WORKFORCE_FINANCE_POLICY_VERSION,
      client,
    });
    if (!exactKeys(receipt, SAFE_RECEIPT_KEYS) || receipt.artifactSha256 !== EXPECTED_ARTIFACT_SHA256) {
      throw new BootstrapError('BOOTSTRAP_PUBLISH_RECEIPT_INVALID', 500);
    }
    const readBack = await loadGrhWorkforceFinanceSnapshotArtifact({
      tenantId,
      expectedSourceSha256: GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.sourceSha256,
      expectedSnapshotAsOf: GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.snapshotAsOf,
      expectedReleaseId: GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
      expectedPolicyVersion: GRH_WORKFORCE_FINANCE_POLICY_VERSION,
      environment: process.env,
      query: (sql, values) => client.query(sql, values),
    });
    inspectArtifact(readBack.payload);
    return receipt;
  } finally {
    await client.end().catch(() => {});
  }
}

export default async function handler(req, res) {
  try {
    assertCandidateHost(req);
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return send(res, 405, 'METHOD_NOT_ALLOWED');
    }
    if (!authorized(req)) return send(res, 401, 'BOOTSTRAP_UNAUTHORIZED');
    const body = await readBody(req);
    const receipt = await apply(body);
    return send(res, 201, 'GRH_WORKFORCE_FINANCE_BOOTSTRAP_APPLIED', {
      releaseId: GRH_WORKFORCE_FINANCE_APPROVED_RELEASE_ID,
      sourceSha256: GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.sourceSha256,
      snapshotAsOf: GRH_WORKFORCE_FINANCE_APPROVED_SOURCE.snapshotAsOf,
      artifactSha256: receipt.artifactSha256,
      envelopeSha256: receipt.envelopeSha256,
      ciphertextSha256: receipt.ciphertextSha256,
      keyFingerprintSha256: EXPECTED_KEY_FINGERPRINT_SHA256,
      periodCount: receipt.periodCount,
      dimensionViewCount: receipt.dimensionViewCount,
      cellCount: receipt.cellCount,
      createdCount: receipt.createdCount,
      reusedCount: receipt.reusedCount,
    });
  } catch (error) {
    if (error instanceof BootstrapError) return send(res, error.status, error.code);
    return send(res, 500, 'BOOTSTRAP_INTERNAL_ERROR');
  }
}
`;

function replaceOnce(source, token, replacement) {
  const first = source.indexOf(token);
  if (first < 0 || source.indexOf(token, first + token.length) >= 0) {
    throw new TypeError('Invalid workforce-finance bootstrap template token');
  }
  return source.replace(token, () => replacement);
}

export function renderGrhWorkforceFinanceBootstrapFunction({
  operationId,
  entityId,
  artifactSha256,
  keyFingerprintSha256,
} = {}) {
  if (!/^[0-9a-f-]{36}$/.test(operationId || '') ||
      !/^[0-9a-f-]{36}$/.test(entityId || '') ||
      !/^[0-9a-f]{64}$/.test(artifactSha256 || '') ||
      !/^[0-9a-f]{64}$/.test(keyFingerprintSha256 || '')) {
    throw new TypeError('Invalid workforce-finance bootstrap template input');
  }
  return [
    ['__OPERATION_ID__', JSON.stringify(operationId)],
    ['__ENTITY_ID__', JSON.stringify(entityId)],
    ['__ARTIFACT_SHA256__', JSON.stringify(artifactSha256)],
    ['__KEY_FINGERPRINT_SHA256__', JSON.stringify(keyFingerprintSha256)],
  ].reduce((source, [token, replacement]) => replaceOnce(source, token, replacement), ENDPOINT_TEMPLATE);
}
