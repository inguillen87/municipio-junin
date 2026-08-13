#!/usr/bin/env node

import { createDecipheriv, createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import pg from 'pg';

import databaseUrlPolicy from '../shared/database-url-policy.cjs';
import { fingerprintDatabaseTarget } from '../api/lib/database-target-fingerprint.js';
import { inspectGrhDirectoryArtifact } from '../api/lib/grh-directory-contract.js';
import { grhDirectoryContentSha256 } from '../api/lib/grh-directory-publication.js';
import {
  createGrhDirectorySnapshotEnvelope,
  decryptGrhDirectorySnapshotEnvelope,
  GRH_DIRECTORY_SNAPSHOT_ACTION,
  GRH_DIRECTORY_SNAPSHOT_ENTITY,
} from '../api/lib/grh-directory-snapshot.js';

const { Client } = pg;

export const CONFIRMATION = 'municipio-junin-directory-v3-append-only';
export const PROJECT_ID = 'falling-bird-78592221';
export const PRODUCTION_BRANCH_ID = 'br-wandering-mode-acln6k2c';
export const PRODUCTION_DATABASE = 'neondb';
export const PRODUCTION_ROLE = 'neondb_owner';
export const PRODUCTION_DATABASE_TARGET_SHA256 =
  '91a1444f4b695d9f6cd2a183fd13cad2b84efe1358b9ac41d28a2accff7578fc';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(REPOSITORY_ROOT, 'config', 'grh-source-manifest.json');
const SHA256 = /^[0-9a-f]{64}$/;
const KEY = /^[A-Za-z0-9_-]{43}$/;
const TENANT = /^[A-Za-z0-9_-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_JSON_BYTES = 32 * 1024 * 1024;

export class DirectorySnapshotPublisherError extends Error {
  constructor(code) {
    super(code);
    this.name = 'DirectorySnapshotPublisherError';
    this.code = code;
  }
}

function fail(code) {
  throw new DirectorySnapshotPublisherError(code);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function parseBase64url(value, bytes, code) {
  if (typeof value !== 'string' || !value || !/^[A-Za-z0-9_-]+$/.test(value)) fail(code);
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== bytes || decoded.toString('base64url') !== value) fail(code);
  return decoded;
}

async function readJson(file, code) {
  try {
    return JSON.parse(await fs.readFile(path.resolve(file), 'utf8'));
  } catch {
    fail(code);
  }
}

export function decryptPriorSnapshotForContinuity({ tenantId, envelope, key } = {}) {
  if (!TENANT.test(tenantId || '') || !envelope || typeof envelope !== 'object') {
    fail('DIRECTORY_V3_PRIOR_SNAPSHOT_INVALID');
  }
  const aad = envelope.aad;
  if (!aad || typeof aad !== 'object' || aad.tenantId !== tenantId ||
      aad.schemaVersion !== envelope.schemaVersion ||
      aad.sourceSha256 !== envelope.sourceSha256 ||
      aad.snapshotAsOf !== envelope.snapshotAsOf ||
      aad.keyVersion !== envelope.keyVersion || aad.compression !== 'gzip' ||
      envelope.compression !== 'gzip' || envelope.cipher !== 'aes-256-gcm' ||
      !SHA256.test(envelope.sourceSha256 || '') || envelope.keyVersion !== 'v1') {
    fail('DIRECTORY_V3_PRIOR_SNAPSHOT_INVALID');
  }
  const orderedAad = {
    tenantId,
    schemaVersion: envelope.schemaVersion,
    sourceSha256: envelope.sourceSha256,
    snapshotAsOf: envelope.snapshotAsOf,
    keyVersion: envelope.keyVersion,
    compression: envelope.compression,
  };
  if (Object.hasOwn(aad, 'absenceRecordCount')) {
    if (aad.absenceRecordCount !== envelope.absenceRecordCount) {
      fail('DIRECTORY_V3_PRIOR_SNAPSHOT_INVALID');
    }
    orderedAad.absenceRecordCount = aad.absenceRecordCount;
  }
  if (Object.hasOwn(aad, 'movementPeriodCount')) {
    if (aad.movementPeriodCount !== envelope.movementPeriodCount) {
      fail('DIRECTORY_V3_PRIOR_SNAPSHOT_INVALID');
    }
    orderedAad.movementPeriodCount = aad.movementPeriodCount;
  }
  if (!exactKeys(aad, Object.keys(orderedAad))) fail('DIRECTORY_V3_PRIOR_SNAPSHOT_INVALID');
  const decodedKey = parseBase64url(key, 32, 'DIRECTORY_V3_KEY_INVALID');
  const nonce = parseBase64url(envelope.nonce, 12, 'DIRECTORY_V3_PRIOR_SNAPSHOT_INVALID');
  const authTag = parseBase64url(envelope.authTag, 16, 'DIRECTORY_V3_PRIOR_SNAPSHOT_INVALID');
  const ciphertext = Buffer.from(envelope.ciphertext || '', 'base64url');
  if (!ciphertext.length || ciphertext.toString('base64url') !== envelope.ciphertext) {
    fail('DIRECTORY_V3_PRIOR_SNAPSHOT_INVALID');
  }
  let plaintext;
  try {
    const decipher = createDecipheriv('aes-256-gcm', decodedKey, nonce, { authTagLength: 16 });
    // jsonb does not preserve object-key order. Rebuild the exact AAD order
    // used by the historical publisher before authenticating the ciphertext.
    decipher.setAAD(Buffer.from(JSON.stringify(orderedAad), 'utf8'));
    decipher.setAuthTag(authTag);
    const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    plaintext = gunzipSync(compressed, { maxOutputLength: MAX_JSON_BYTES });
  } catch {
    fail('DIRECTORY_V3_KEY_CONTINUITY_FAILED');
  } finally {
    decodedKey.fill(0);
  }
  let artifact;
  try {
    artifact = JSON.parse(plaintext.toString('utf8'));
  } catch {
    fail('DIRECTORY_V3_PRIOR_SNAPSHOT_INVALID');
  }
  if (artifact?.schema_version !== envelope.schemaVersion ||
      artifact?.source?.sha256 !== envelope.sourceSha256 ||
      artifact?.source?.snapshot_as_of !== envelope.snapshotAsOf ||
      artifact?.records?.length !== envelope.recordCount) {
    fail('DIRECTORY_V3_PRIOR_SNAPSHOT_INVALID');
  }
  return artifact;
}

export async function loadArtifactFromInput(file) {
  const resolved = path.resolve(file);
  let raw;
  try {
    raw = await fs.readFile(resolved);
  } catch {
    fail('DIRECTORY_V3_ARTIFACT_UNREADABLE');
  }
  if (resolved.endsWith('.gz')) {
    try {
      raw = gunzipSync(raw, { maxOutputLength: MAX_JSON_BYTES });
    } catch {
      fail('DIRECTORY_V3_ARTIFACT_UNREADABLE');
    }
  }
  let parsed;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    fail('DIRECTORY_V3_ARTIFACT_UNREADABLE');
  }
  return parsed?.artifact || parsed;
}

export async function validatePublicationInputs({ artifact, keyPath, statePath, backupPath } = {}) {
  const [state, manifest, keyRaw, backup] = await Promise.all([
    readJson(statePath, 'DIRECTORY_V3_STATE_UNREADABLE'),
    readJson(MANIFEST_PATH, 'DIRECTORY_V3_MANIFEST_UNREADABLE'),
    fs.readFile(path.resolve(keyPath), 'utf8').catch(() => fail('DIRECTORY_V3_KEY_UNREADABLE')),
    fs.readFile(path.resolve(backupPath)).catch(() => fail('DIRECTORY_V3_BACKUP_UNREADABLE')),
  ]);
  const key = keyRaw.trim();
  const decodedKey = KEY.test(key) ? Buffer.from(key, 'base64url') : Buffer.alloc(0);
  const keyFingerprint = decodedKey.length === 32 ? sha256(decodedKey) : null;
  decodedKey.fill(0);
  if (state.schemaVersion !== 'grh-directory-bootstrap-v1' ||
      state.mode !== 'encrypted_snapshot' || state.status !== 'finalized' ||
      state.snapshotKeyVersion !== 'v1' ||
      !SHA256.test(state.snapshotKeyFingerprintSha256 || '') ||
      keyFingerprint !== state.snapshotKeyFingerprintSha256) {
    fail('DIRECTORY_V3_KEY_STATE_MISMATCH');
  }
  if (!inspectGrhDirectoryArtifact(artifact).ok || artifact.schema_version !== 'grh-directory-v3') {
    fail('DIRECTORY_V3_ARTIFACT_INVALID');
  }
  if (manifest.schema_version !== 'grh-source-manifest-v1' ||
      manifest.source_file !== artifact.source.file ||
      manifest.sha256 !== artifact.source.sha256 ||
      manifest.compressed_size_bytes !== artifact.source.compressed_size_bytes ||
      manifest.snapshot_as_of !== artifact.source.snapshot_as_of ||
      backup.length !== manifest.compressed_size_bytes || sha256(backup) !== manifest.sha256 ||
      state.sourceSha256 !== manifest.sha256 || state.snapshotAsOf !== manifest.snapshot_as_of ||
      state.recordCount !== artifact.records.length) {
    fail('DIRECTORY_V3_SOURCE_PIN_MISMATCH');
  }
  return Object.freeze({
    key,
    keyFingerprint,
    sourceSha256: manifest.sha256,
    snapshotAsOf: manifest.snapshot_as_of,
    recordCount: artifact.records.length,
    contentSha256: grhDirectoryContentSha256(artifact),
  });
}

function neonCliPath() {
  return path.join(path.dirname(process.execPath), 'node_modules', 'neonctl', 'bin', 'cli.js');
}

export function captureProductionConnectionString({ runner = spawnSync } = {}) {
  const result = runner(process.execPath, [
    neonCliPath(), 'connection-string', PRODUCTION_BRANCH_ID,
    '--project-id', PROJECT_ID,
    '--role-name', PRODUCTION_ROLE,
    '--database-name', PRODUCTION_DATABASE,
    '--ssl', 'verify-full',
    '--no-analytics',
  ], {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const connectionString = String(result?.stdout || '').trim();
  if (result?.error || result?.status !== 0 || !connectionString.startsWith('postgresql://')) {
    fail('DIRECTORY_V3_DATABASE_CREDENTIAL_UNAVAILABLE');
  }
  try {
    const inspected = databaseUrlPolicy.inspectDatabaseUrl(connectionString, {
      nodeEnv: 'production',
      environment: {},
    });
    if (!inspected.tlsVerified ||
        fingerprintDatabaseTarget(inspected.connectionString) !== PRODUCTION_DATABASE_TARGET_SHA256) {
      fail('DIRECTORY_V3_DATABASE_TARGET_MISMATCH');
    }
    return inspected.connectionString;
  } catch (error) {
    if (error instanceof DirectorySnapshotPublisherError) throw error;
    fail('DIRECTORY_V3_DATABASE_TARGET_MISMATCH');
  }
}

const LATEST_SQL = `SELECT id, "tenantId" AS tenant_id, "userId" AS user_id,
       "entityId" AS entity_id, details, "createdAt" AS created_at
  FROM audit_logs
 WHERE "tenantId" = $1 AND action = $2 AND entity = $3
 ORDER BY "createdAt" DESC, id DESC
 LIMIT 1`;

export async function publishDirectorySnapshotV3({
  artifact,
  pins,
  connectionString,
  ClientImpl = Client,
  idFactory = randomUUID,
} = {}) {
  const client = new ClientImpl({
    connectionString,
    connectionTimeoutMillis: 5_000,
    query_timeout: 25_000,
    keepAlive: true,
  });
  let transaction = false;
  let tenantId;
  let insertedId = null;
  try {
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    transaction = true;
    await client.query("SET LOCAL search_path TO public, pg_catalog");
    await client.query("SET LOCAL lock_timeout = '3000ms'");
    await client.query("SET LOCAL statement_timeout = '25000ms'");
    const tenantResult = await client.query(
      `SELECT id, slug, status, "trialEndsAt" AS trial_ends_at
         FROM tenants WHERE slug = $1 FOR SHARE`,
      ['junin'],
    );
    if (tenantResult.rows?.length !== 1) fail('DIRECTORY_V3_TENANT_INVALID');
    const tenant = tenantResult.rows[0];
    tenantId = tenant.id;
    const expired = tenant.status === 'TRIAL' && tenant.trial_ends_at &&
      new Date(tenant.trial_ends_at).getTime() <= Date.now();
    if (!TENANT.test(tenantId || '') || !['ACTIVE', 'TRIAL'].includes(tenant.status) || expired) {
      fail('DIRECTORY_V3_TENANT_INVALID');
    }
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('grh-directory-snapshot-v3-publish'), hashtext($1))",
      [tenantId],
    );
    const latestResult = await client.query(LATEST_SQL + ' FOR UPDATE', [
      tenantId,
      GRH_DIRECTORY_SNAPSHOT_ACTION,
      GRH_DIRECTORY_SNAPSHOT_ENTITY,
    ]);
    const latest = latestResult.rows?.[0];
    if (!latest?.details || latest.tenant_id !== tenantId) fail('DIRECTORY_V3_PRIOR_SNAPSHOT_MISSING');
    const previous = latest.details;
    if (previous?.aad?.tenantId !== tenantId) fail('DIRECTORY_V3_TENANT_CONTINUITY_FAILED');
    let previousArtifact;
    if (previous.schemaVersion === 'grh-directory-v3') {
      previousArtifact = decryptGrhDirectorySnapshotEnvelope({ tenantId, envelope: previous, key: pins.key });
    } else {
      previousArtifact = decryptPriorSnapshotForContinuity({ tenantId, envelope: previous, key: pins.key });
    }
    if (previousArtifact.source.sha256 !== pins.sourceSha256 ||
        previousArtifact.source.snapshot_as_of !== pins.snapshotAsOf ||
        previousArtifact.records.length !== pins.recordCount) {
      fail('DIRECTORY_V3_SOURCE_CONTINUITY_FAILED');
    }
    if (previous.schemaVersion === 'grh-directory-v3') {
      if (grhDirectoryContentSha256(previousArtifact) !== pins.contentSha256) {
        fail('DIRECTORY_V3_LATEST_CONTENT_CONFLICT');
      }
      await client.query('COMMIT');
      transaction = false;
      return Object.freeze({ status: 'unchanged', tenantId, insertedId: null });
    }
    const envelope = createGrhDirectorySnapshotEnvelope({ tenantId, artifact, key: pins.key });
    insertedId = idFactory();
    if (!UUID.test(insertedId || '')) fail('DIRECTORY_V3_ID_INVALID');
    const entityId = `directory-v3-${pins.contentSha256}`;
    await client.query(
      `INSERT INTO audit_logs
        (id, "tenantId", "userId", action, entity, "entityId", details, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())`,
      [insertedId, tenantId, latest.user_id || null, GRH_DIRECTORY_SNAPSHOT_ACTION,
        GRH_DIRECTORY_SNAPSHOT_ENTITY, entityId, JSON.stringify(envelope)],
    );
    const readback = await client.query(
      `SELECT details FROM audit_logs
        WHERE id = $1 AND "tenantId" = $2 AND action = $3 AND entity = $4`,
      [insertedId, tenantId, GRH_DIRECTORY_SNAPSHOT_ACTION, GRH_DIRECTORY_SNAPSHOT_ENTITY],
    );
    const observed = decryptGrhDirectorySnapshotEnvelope({
      tenantId,
      envelope: readback.rows?.[0]?.details,
      key: pins.key,
    });
    if (grhDirectoryContentSha256(observed) !== pins.contentSha256) {
      fail('DIRECTORY_V3_READBACK_MISMATCH');
    }
    await client.query('COMMIT');
    transaction = false;
    const committed = await client.query(LATEST_SQL, [
      tenantId,
      GRH_DIRECTORY_SNAPSHOT_ACTION,
      GRH_DIRECTORY_SNAPSHOT_ENTITY,
    ]);
    if (committed.rows?.[0]?.id !== insertedId) fail('DIRECTORY_V3_COMMIT_READBACK_MISMATCH');
    const committedArtifact = decryptGrhDirectorySnapshotEnvelope({
      tenantId,
      envelope: committed.rows[0].details,
      key: pins.key,
    });
    if (grhDirectoryContentSha256(committedArtifact) !== pins.contentSha256) {
      fail('DIRECTORY_V3_COMMIT_READBACK_MISMATCH');
    }
    return Object.freeze({ status: 'published', tenantId, insertedId });
  } catch (error) {
    if (transaction) await client.query('ROLLBACK').catch(() => {});
    throw error instanceof DirectorySnapshotPublisherError
      ? error
      : new DirectorySnapshotPublisherError('DIRECTORY_V3_PUBLICATION_FAILED');
  } finally {
    await client.end().catch(() => {});
  }
}

function argument(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

export async function runCli(args = process.argv.slice(2)) {
  if (argument(args, '--confirm-production-append-only') !== CONFIRMATION) {
    fail('DIRECTORY_V3_CONFIRMATION_REQUIRED');
  }
  const artifactPath = argument(args, '--artifact');
  const keyPath = argument(args, '--key');
  const statePath = argument(args, '--state');
  const backupPath = argument(args, '--backup');
  if (![artifactPath, keyPath, statePath, backupPath].every(Boolean)) {
    fail('DIRECTORY_V3_ARGUMENT_REQUIRED');
  }
  const artifact = await loadArtifactFromInput(artifactPath);
  const pins = await validatePublicationInputs({ artifact, keyPath, statePath, backupPath });
  const connectionString = captureProductionConnectionString();
  const result = await publishDirectorySnapshotV3({ artifact, pins, connectionString });
  return Object.freeze({
    status: result.status,
    schemaVersion: artifact.schema_version,
    sourceSha256: pins.sourceSha256,
    snapshotAsOf: pins.snapshotAsOf,
    recordCount: pins.recordCount,
    keyFingerprintSha256: pins.keyFingerprint,
    databaseTargetFingerprintSha256: PRODUCTION_DATABASE_TARGET_SHA256,
    appendOnly: true,
    usersChanged: false,
    environmentChanged: false,
    ddlApplied: false,
  });
}

async function main() {
  try {
    console.log(JSON.stringify(await runCli(), null, 2));
  } catch (error) {
    console.error('[GRH-DIRECTORY-V3-PUBLISH] ' + String(error?.code || 'DIRECTORY_V3_PUBLICATION_FAILED'));
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
