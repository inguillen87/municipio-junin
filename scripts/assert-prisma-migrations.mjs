import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  canonicalManifestText,
  deriveBaselineManifest,
  hasExactKeys,
  inspectRegularFile,
  readCanonicalLfText,
  sha256,
  SHA256_PATTERN,
} from '../shared/prisma-migration-contract.mjs';

const modulePath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(modulePath), '..');
const IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,255}$/;
const MAX_RECEIPT_WINDOW_MS = 60 * 60 * 1000;
const FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;

function rawFileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function safeJson(filePath) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(filePath)).replace(/\r\n?/g, '\n'));
}

function isInside(parentPath, candidatePath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

export function inspectOfflineMigrationGate({ repoRoot = defaultRepoRoot, env = process.env } = {}) {
  const derived = deriveBaselineManifest({ repoRoot });
  if (!derived.ok) {
    return {
      ok: false,
      mode: 'offline',
      schemaProvider: derived.schemaProvider || null,
      baselineId: derived.baselineId || null,
      migrationSetId: derived.migrationSetId || null,
      schemaSha256: derived.schemaSha256 || null,
      migrationHistorySha256: derived.migrationHistorySha256 || null,
      migrationLockSha256: derived.migrationLockSha256 || null,
      migrationCount: derived.migrations?.length || 0,
      migrations: derived.migrations || [],
      errors: derived.errors,
    };
  }

  const errors = [];
  const manifestPath = path.join(repoRoot, 'prisma', 'migrations', 'baseline-manifest.json');
  const actualManifest = readCanonicalLfText(manifestPath, errors, 'BASELINE_MANIFEST_MISSING');
  const expectedManifest = canonicalManifestText(derived.manifest);
  if (actualManifest !== null && actualManifest !== expectedManifest) {
    errors.push({
      code: 'BASELINE_MANIFEST_MISMATCH',
      message: 'baseline-manifest.json no coincide byte a byte con schema, lock, SQL y toolchain.',
    });
  }
  if (env.PRISMA_BASELINE_ID !== derived.baselineId
    || env.PRISMA_MIGRATION_SET_ID !== derived.migrationSetId) {
    errors.push({
      code: 'ENVIRONMENT_PIN_MISMATCH',
      message: 'Los pins PRISMA_BASELINE_ID y PRISMA_MIGRATION_SET_ID no coinciden.',
    });
  }

  return {
    ok: errors.length === 0,
    mode: 'offline',
    schemaProvider: derived.schemaProvider,
    prismaMajor: derived.toolchain.prismaMajor,
    prismaVersion: derived.toolchain.prismaVersion,
    prismaEngineVersion: derived.toolchain.prismaEngineVersion,
    prismaToolchainLockSha256: derived.toolchain.prismaToolchainLockSha256,
    baselinePolicyVersion: derived.manifest.baselinePolicyVersion,
    baselineId: derived.baselineId,
    migrationSetId: derived.migrationSetId,
    schemaSha256: derived.schemaSha256,
    migrationHistorySha256: derived.migrationHistorySha256,
    migrationLockSha256: derived.migrationLockSha256,
    migrationCount: derived.migrations.length,
    migrations: derived.migrations,
    baselineSql: derived.baselineSql,
    errors,
  };
}

function validEvidenceRef(value) {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value) && !/password|secret|token/i.test(value);
}

function inspectReleaseReceipt(offline, { repoRoot, env, now }) {
  const errors = [];
  const receiptPathInput = env.PRISMA_DRIFT_RECEIPT_PATH;
  if (!receiptPathInput || !path.isAbsolute(receiptPathInput)) {
    errors.push({ code: 'RECEIPT_PATH_INVALID', message: 'PRISMA_DRIFT_RECEIPT_PATH debe apuntar a un archivo absoluto externo al repositorio.' });
    return { errors };
  }
  const receiptPath = path.resolve(receiptPathInput);
  if (!inspectRegularFile(receiptPath, errors, 'RECEIPT_MISSING')) return { errors };
  const canonicalRepoRoot = fs.realpathSync(repoRoot);
  const canonicalReceiptPath = fs.realpathSync(receiptPath);
  if (canonicalReceiptPath === canonicalRepoRoot || isInside(canonicalRepoRoot, canonicalReceiptPath)) {
    errors.push({ code: 'RECEIPT_INSIDE_REPOSITORY', message: 'El receipt conectado no puede residir dentro del checkout, incluso mediante enlaces o junctions.' });
    return { errors };
  }

  const pinnedReceiptSha = env.PRISMA_DRIFT_RECEIPT_SHA256;
  if (!SHA256_PATTERN.test(String(pinnedReceiptSha || '')) || rawFileSha256(receiptPath) !== pinnedReceiptSha) {
    errors.push({ code: 'RECEIPT_PIN_MISMATCH', message: 'El receipt conectado no coincide con PRISMA_DRIFT_RECEIPT_SHA256.' });
  }

  let receipt;
  try {
    receipt = safeJson(receiptPath);
  } catch {
    errors.push({ code: 'RECEIPT_INVALID_JSON', message: 'El receipt conectado no es JSON UTF-8 v\u00e1lido.' });
    return { errors };
  }

  const receiptKeys = [
    'contractVersion', 'baselineId', 'migrationSetId', 'targetId', 'checkedAt', 'expiresAt',
    'issuer', 'database', 'checks', 'artifacts', 'pendingMigrations', 'reviewerIds',
  ];
  const issuerKeys = ['tool', 'version', 'runId'];
  const databaseKeys = ['schemaFingerprintSha256', 'migrationStateSha256'];
  const checkKeys = ['migrateStatus', 'driftStatus', 'restoreStatus'];
  const artifactKeys = ['migrateStatusSha256', 'driftReportSha256', 'backupEvidenceRef', 'restoreEvidenceRef'];
  if (!hasExactKeys(receipt, receiptKeys)
    || !hasExactKeys(receipt.issuer, issuerKeys)
    || !hasExactKeys(receipt.database, databaseKeys)
    || !hasExactKeys(receipt.checks, checkKeys)
    || !hasExactKeys(receipt.artifacts, artifactKeys)) {
    errors.push({ code: 'RECEIPT_SHAPE_INVALID', message: 'El receipt conectado contiene campos faltantes o no permitidos.' });
    return { errors };
  }

  if (receipt.contractVersion !== 1
    || receipt.baselineId !== offline.baselineId
    || receipt.migrationSetId !== offline.migrationSetId
    || receipt.targetId !== env.PRISMA_TARGET_ID
    || !validEvidenceRef(receipt.targetId)) {
    errors.push({ code: 'RECEIPT_IDENTITY_MISMATCH', message: 'El receipt no corresponde al baseline, set o target pineados.' });
  }
  if (!SHA256_PATTERN.test(receipt.database.schemaFingerprintSha256)
    || !SHA256_PATTERN.test(receipt.database.migrationStateSha256)
    || !SHA256_PATTERN.test(receipt.artifacts.migrateStatusSha256)
    || !SHA256_PATTERN.test(receipt.artifacts.driftReportSha256)) {
    errors.push({ code: 'RECEIPT_DIGEST_INVALID', message: 'El receipt no contiene fingerprints SHA-256 v\u00e1lidos.' });
  }
  if (receipt.checks.migrateStatus !== 'history_consistent'
    || receipt.checks.driftStatus !== 'no_unexpected_drift'
    || receipt.checks.restoreStatus !== 'passed') {
    errors.push({ code: 'RECEIPT_CHECK_FAILED', message: 'Historia, drift y restore deben constar como verificados.' });
  }
  if (!validEvidenceRef(receipt.issuer.tool)
    || !validEvidenceRef(receipt.issuer.version)
    || !validEvidenceRef(receipt.issuer.runId)
    || !validEvidenceRef(receipt.artifacts.backupEvidenceRef)
    || !validEvidenceRef(receipt.artifacts.restoreEvidenceRef)) {
    errors.push({ code: 'RECEIPT_EVIDENCE_INVALID', message: 'Issuer y referencias de evidencia deben ser identificadores no secretos.' });
  }

  const checkedAt = Date.parse(receipt.checkedAt);
  const expiresAt = Date.parse(receipt.expiresAt);
  if (!Number.isFinite(checkedAt) || !Number.isFinite(expiresAt)
    || checkedAt > now.getTime() + FUTURE_CLOCK_SKEW_MS
    || expiresAt <= now.getTime()
    || expiresAt <= checkedAt
    || expiresAt - checkedAt > MAX_RECEIPT_WINDOW_MS) {
    errors.push({ code: 'RECEIPT_TIME_INVALID', message: 'El receipt debe estar vigente y su ventana no puede superar 60 minutos.' });
  }

  const normalizedReviewers = Array.isArray(receipt.reviewerIds)
    ? receipt.reviewerIds.map(value => String(value).trim().toLowerCase())
    : [];
  if (normalizedReviewers.length < 2
    || normalizedReviewers.some(value => !validEvidenceRef(value))
    || new Set(normalizedReviewers).size !== normalizedReviewers.length) {
    errors.push({ code: 'RECEIPT_REVIEWERS_INVALID', message: 'Se requieren al menos dos revisores independientes con IDs distintos.' });
  }

  const migrationDirectories = new Set((offline.migrations || []).map(item => item.directory));
  const pendingIsArray = Array.isArray(receipt.pendingMigrations);
  const pending = pendingIsArray ? receipt.pendingMigrations : [];
  const orderedPending = (offline.migrations || [])
    .map(item => item.directory)
    .filter(directory => pending.includes(directory));
  if (!pendingIsArray
    || new Set(pending).size !== pending.length
    || pending.some(item => typeof item !== 'string' || !migrationDirectories.has(item))
    || JSON.stringify(pending) !== JSON.stringify(orderedPending)) {
    errors.push({ code: 'RECEIPT_PENDING_INVALID', message: 'pendingMigrations debe ser un array y un subconjunto exacto y ordenado de la historia pineada.' });
  }
  return { errors, targetId: receipt.targetId, checkedAt: receipt.checkedAt, expiresAt: receipt.expiresAt };
}

export function inspectMigrationGate({
  mode,
  repoRoot = defaultRepoRoot,
  env = process.env,
  now = new Date(),
} = {}) {
  if (!['offline', 'release'].includes(mode)) {
    return { ok: false, mode: mode || null, errors: [{ code: 'MODE_REQUIRED', message: 'Use --offline para inspecci\u00f3n o --release para deploy.' }] };
  }
  const offline = inspectOfflineMigrationGate({ repoRoot, env });
  if (mode === 'offline' || !offline.ok) return { ...offline, mode };
  const receipt = inspectReleaseReceipt(offline, { repoRoot, env, now });
  const releaseErrors = [...offline.errors, ...receipt.errors];
  if (releaseErrors.length === 0) {
    releaseErrors.push({
      code: 'RELEASE_ATTESTATION_NOT_GOVERNED',
      message: 'La evidencia tiene forma v\u00e1lida, pero no existe todav\u00eda un verificador institucional firmado por CI/KMS/OIDC; deploy permanece bloqueado.',
    });
  }
  return {
    ...offline,
    mode,
    targetId: receipt.targetId || null,
    receiptCheckedAt: receipt.checkedAt || null,
    receiptExpiresAt: receipt.expiresAt || null,
    errors: releaseErrors,
    ok: false,
  };
}

function cliMode(argv) {
  if (argv.includes('--release') && argv.includes('--offline')) return null;
  if (argv.includes('--release')) return 'release';
  if (argv.includes('--offline')) return 'offline';
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  const result = inspectMigrationGate({ mode: cliMode(process.argv.slice(2)) });
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log(`[MIGRATION_GATE] ${result.migrationCount} migraci\u00f3n(es) verificadas; modo ${result.mode}.`);
  } else {
    for (const error of result.errors) console.error(`[MIGRATION_GATE:${error.code}] ${error.message}`);
  }
  process.exitCode = result.ok ? 0 : 1;
}
