import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const modulePath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(modulePath), '..');
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MIGRATION_DIRECTORY_PATTERN = /^\d{14}_[a-z0-9][a-z0-9_]*$/;
const IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,255}$/;
const MAX_RECEIPT_WINDOW_MS = 60 * 60 * 1000;
const FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function normalizedText(filePath) {
  const bytes = fs.readFileSync(filePath);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return text.replace(/\r\n?/g, '\n');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizedFileSha256(filePath) {
  return sha256(normalizedText(filePath));
}

function inspectSchemaProvider(schemaPath, errors) {
  const schema = normalizedText(schemaPath);
  const datasourceMatches = [...schema.matchAll(/\bdatasource\s+db\s*\{([\s\S]*?)\}/g)];
  const providerMatches = datasourceMatches.length === 1
    ? [...datasourceMatches[0][1].matchAll(/\bprovider\s*=\s*"([^"]+)"/g)]
    : [];
  if (providerMatches.length !== 1 || providerMatches[0][1] !== 'postgresql') {
    errors.push({ code: 'SCHEMA_PROVIDER_INVALID', message: 'schema.prisma debe declarar exactamente datasource db con provider = "postgresql".' });
    return null;
  }
  return providerMatches[0][1];
}

function rawFileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function safeJson(filePath) {
  return JSON.parse(normalizedText(filePath));
}

function isInside(parentPath, candidatePath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function inspectRegularFile(filePath, errors, code) {
  if (!fs.existsSync(filePath)) {
    errors.push({ code, message: `Falta ${path.basename(filePath)}.` });
    return false;
  }
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    errors.push({ code, message: `${path.basename(filePath)} debe ser un archivo regular, no un enlace.` });
    return false;
  }
  return true;
}

function packagePrismaMajor(repoRoot, errors) {
  const packagePath = path.join(repoRoot, 'package.json');
  if (!inspectRegularFile(packagePath, errors, 'PACKAGE_MISSING')) return null;
  try {
    const pkg = safeJson(packagePath);
    const declared = pkg.devDependencies?.prisma || pkg.dependencies?.prisma;
    const match = String(declared || '').match(/\d+/);
    if (!match) throw new Error('version ausente');
    return Number(match[0]);
  } catch {
    errors.push({ code: 'PRISMA_VERSION_INVALID', message: 'No se pudo determinar la versi\u00f3n mayor de Prisma.' });
    return null;
  }
}

function collectMigrations(migrationsRoot, errors) {
  const allowedRootFiles = new Set(['migration_lock.toml', 'baseline-manifest.json']);
  const migrations = [];
  const entries = fs.readdirSync(migrationsRoot, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const entryPath = path.join(migrationsRoot, entry.name);
    const stat = fs.lstatSync(entryPath);
    if (stat.isSymbolicLink()) {
      errors.push({ code: 'MIGRATION_SYMLINK', message: `No se permiten enlaces en prisma/migrations: ${entry.name}.` });
      continue;
    }
    if (entry.isFile()) {
      if (!allowedRootFiles.has(entry.name)) {
        errors.push({ code: 'MIGRATION_ROOT_EXTRA', message: `Archivo no gobernado en prisma/migrations: ${entry.name}.` });
      }
      continue;
    }
    if (!entry.isDirectory() || !MIGRATION_DIRECTORY_PATTERN.test(entry.name)) {
      errors.push({ code: 'MIGRATION_DIRECTORY_INVALID', message: `Directorio de migraci\u00f3n inv\u00e1lido: ${entry.name}.` });
      continue;
    }

    const children = fs.readdirSync(entryPath, { withFileTypes: true });
    if (children.length !== 1 || children[0].name !== 'migration.sql' || !children[0].isFile()) {
      errors.push({ code: 'MIGRATION_CONTENT_INVALID', message: `${entry.name} debe contener solamente migration.sql.` });
      continue;
    }
    const migrationPath = path.join(entryPath, 'migration.sql');
    const migrationStat = fs.lstatSync(migrationPath);
    if (migrationStat.isSymbolicLink() || migrationStat.size === 0) {
      errors.push({ code: 'MIGRATION_FILE_INVALID', message: `${entry.name}/migration.sql debe ser un archivo regular no vac\u00edo.` });
      continue;
    }
    migrations.push({ directory: entry.name, sha256: normalizedFileSha256(migrationPath) });
  }
  return migrations;
}

function computeHistorySha256(migrations) {
  return sha256(JSON.stringify(migrations));
}

function computeBaselineId(provider, prismaMajor, baselineMigration) {
  return `prisma-baseline-${sha256(JSON.stringify({ provider, prismaMajor, baselineMigration }))}`;
}

function computeMigrationSetId(baselineId, schemaSha256, migrationHistorySha256, migrations) {
  return `prisma-set-${sha256(JSON.stringify({ baselineId, schemaSha256, migrationHistorySha256, migrations }))}`;
}

export function inspectOfflineMigrationGate({ repoRoot = defaultRepoRoot, env = process.env } = {}) {
  const errors = [];
  const prismaRoot = path.join(repoRoot, 'prisma');
  const schemaPath = path.join(prismaRoot, 'schema.prisma');
  const migrationsRoot = path.join(prismaRoot, 'migrations');
  const lockPath = path.join(migrationsRoot, 'migration_lock.toml');
  const manifestPath = path.join(migrationsRoot, 'baseline-manifest.json');
  const prismaMajor = packagePrismaMajor(repoRoot, errors);

  if (!inspectRegularFile(schemaPath, errors, 'SCHEMA_MISSING')) {
    return { ok: false, mode: 'offline', errors };
  }
  const schemaProvider = inspectSchemaProvider(schemaPath, errors);
  if (!fs.existsSync(migrationsRoot) || !fs.lstatSync(migrationsRoot).isDirectory() || fs.lstatSync(migrationsRoot).isSymbolicLink()) {
    errors.push({ code: 'MIGRATIONS_MISSING', message: 'No existe una historia Prisma regular y revisada.' });
    return { ok: false, mode: 'offline', errors };
  }
  const lockOk = inspectRegularFile(lockPath, errors, 'MIGRATION_LOCK_MISSING');
  const manifestOk = inspectRegularFile(manifestPath, errors, 'BASELINE_MANIFEST_MISSING');
  const migrations = collectMigrations(migrationsRoot, errors);
  if (migrations.length === 0) {
    errors.push({ code: 'MIGRATIONS_EMPTY', message: 'La historia Prisma no contiene migration.sql aplicables.' });
  }

  if (lockOk) {
    const providerMatches = [...normalizedText(lockPath).matchAll(/^provider\s*=\s*"([^"]+)"\s*$/gm)];
    if (providerMatches.length !== 1 || providerMatches[0][1] !== 'postgresql') {
      errors.push({ code: 'MIGRATION_PROVIDER_INVALID', message: 'migration_lock.toml debe declarar exactamente provider = "postgresql".' });
    }
  }

  let manifest = null;
  if (manifestOk) {
    try {
      manifest = safeJson(manifestPath);
    } catch {
      errors.push({ code: 'BASELINE_MANIFEST_INVALID_JSON', message: 'baseline-manifest.json no es JSON UTF-8 v\u00e1lido.' });
    }
  }

  const schemaSha256 = normalizedFileSha256(schemaPath);
  const migrationHistorySha256 = computeHistorySha256(migrations);
  let baselineId = null;
  let migrationSetId = null;
  if (manifest) {
    const manifestKeys = [
      'contractVersion', 'provider', 'prismaMajor', 'baselineId', 'baselineMigration',
      'schemaSha256', 'migrationHistorySha256', 'migrationSetId', 'migrations',
    ];
    if (!hasExactKeys(manifest, manifestKeys)) {
      errors.push({ code: 'BASELINE_MANIFEST_SHAPE', message: 'El manifest de baseline contiene campos faltantes o no permitidos.' });
    } else {
      const baselineShape = hasExactKeys(manifest.baselineMigration, ['directory', 'sha256']);
      const migrationShapes = Array.isArray(manifest.migrations)
        && manifest.migrations.every(item => hasExactKeys(item, ['directory', 'sha256']));
      if (!baselineShape || !migrationShapes) {
        errors.push({ code: 'BASELINE_MANIFEST_MIGRATIONS', message: 'El manifest no declara migraciones con forma exacta.' });
      } else {
        baselineId = computeBaselineId(manifest.provider, manifest.prismaMajor, manifest.baselineMigration);
        migrationSetId = computeMigrationSetId(baselineId, schemaSha256, migrationHistorySha256, migrations);
        const firstMigration = migrations[0] || null;
        const exactMigrationSet = JSON.stringify(manifest.migrations) === JSON.stringify(migrations);
        if (manifest.contractVersion !== 1
          || manifest.provider !== 'postgresql'
          || manifest.provider !== schemaProvider
          || manifest.prismaMajor !== prismaMajor) {
          errors.push({ code: 'BASELINE_MANIFEST_VERSION', message: 'El contrato, provider o versi\u00f3n mayor de Prisma no coincide.' });
        }
        if (!firstMigration || JSON.stringify(manifest.baselineMigration) !== JSON.stringify(firstMigration)) {
          errors.push({ code: 'BASELINE_MIGRATION_MISMATCH', message: 'La migraci\u00f3n baseline debe ser la primera migraci\u00f3n exacta de la historia.' });
        }
        if (!exactMigrationSet || manifest.migrationHistorySha256 !== migrationHistorySha256) {
          errors.push({ code: 'MIGRATION_SET_MISMATCH', message: 'La lista o hash de migraciones no coincide con el manifest.' });
        }
        if (manifest.schemaSha256 !== schemaSha256) {
          errors.push({ code: 'SCHEMA_HASH_MISMATCH', message: 'schema.prisma no coincide con el manifest revisado.' });
        }
        if (manifest.baselineId !== baselineId || manifest.migrationSetId !== migrationSetId) {
          errors.push({ code: 'RELEASE_ID_MISMATCH', message: 'baselineId o migrationSetId no coincide con el contenido can\u00f3nico.' });
        }
        if (env.PRISMA_BASELINE_ID !== baselineId || env.PRISMA_MIGRATION_SET_ID !== migrationSetId) {
          errors.push({ code: 'ENVIRONMENT_PIN_MISMATCH', message: 'Los pins PRISMA_BASELINE_ID y PRISMA_MIGRATION_SET_ID no coinciden.' });
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    mode: 'offline',
    schemaProvider,
    baselineId,
    migrationSetId,
    schemaSha256,
    migrationHistorySha256,
    migrationCount: migrations.length,
    migrations,
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
  const pending = Array.isArray(receipt.pendingMigrations) ? receipt.pendingMigrations : [];
  const orderedPending = (offline.migrations || [])
    .map(item => item.directory)
    .filter(directory => pending.includes(directory));
  if (new Set(pending).size !== pending.length
    || pending.some(item => !migrationDirectories.has(item))
    || JSON.stringify(pending) !== JSON.stringify(orderedPending)) {
    errors.push({ code: 'RECEIPT_PENDING_INVALID', message: 'pendingMigrations debe ser un subconjunto exacto de la historia pineada.' });
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
      message: 'La evidencia tiene forma válida, pero no existe todavía un verificador institucional firmado por CI/KMS/OIDC; deploy permanece bloqueado.',
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
