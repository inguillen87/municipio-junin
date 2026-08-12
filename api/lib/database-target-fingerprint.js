import { createHash } from 'node:crypto';

import databaseUrlPolicy from '../../shared/database-url-policy.cjs';

const { CONNECTION_OVERRIDE_PARAMS, isCanonicalDatabaseHostname } = databaseUrlPolicy;

export const DATABASE_TARGET_FINGERPRINT_VERSION = 'municontrol-database-target-v1';
export const DATABASE_TARGET_FINGERPRINT_HEADER =
  'X-MuniControl-Database-Target-SHA256';

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
const CONTROL_OR_WHITESPACE = /[\u0000-\u0020\u007f]/u;

export class DatabaseTargetFingerprintError extends Error {
  constructor(code) {
    super('Database target fingerprint unavailable');
    this.name = 'DatabaseTargetFingerprintError';
    this.code = code;
  }
}

function fail(code) {
  throw new DatabaseTargetFingerprintError(code);
}

function canonicalNeonHostname(hostname) {
  const labels = hostname.toLowerCase().split('.');
  if (labels.length >= 3 && labels.at(-2) === 'neon' && labels.at(-1) === 'tech' &&
      /^ep-[a-z0-9-]+-pooler$/u.test(labels[0])) {
    labels[0] = labels[0].slice(0, -'-pooler'.length);
  }
  return labels.join('.');
}

function canonicalJson(value) {
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    host: value.host,
    port: value.port,
    database: value.database,
  });
}

export function canonicalizeDatabaseTarget(connectionString) {
  if (typeof connectionString !== 'string' || connectionString.length === 0 ||
      connectionString !== connectionString.trim() ||
      CONTROL_OR_WHITESPACE.test(connectionString) || /%(?![a-f0-9]{2})/iu.test(connectionString)) {
    fail('DATABASE_TARGET_URL_INVALID');
  }

  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    fail('DATABASE_TARGET_URL_INVALID');
  }
  if (!POSTGRES_PROTOCOLS.has(parsed.protocol) || !parsed.hostname ||
      !isCanonicalDatabaseHostname(parsed.hostname) || !parsed.username || parsed.hash) {
    fail('DATABASE_TARGET_URL_INVALID');
  }
  for (const [name] of parsed.searchParams) {
    if (CONNECTION_OVERRIDE_PARAMS.has(name.toLowerCase())) {
      fail('DATABASE_TARGET_OVERRIDE_FORBIDDEN');
    }
  }

  const encodedDatabase = parsed.pathname.slice(1);
  if (!encodedDatabase || parsed.pathname.slice(1).includes('/')) {
    fail('DATABASE_TARGET_DATABASE_INVALID');
  }
  let database;
  try {
    database = decodeURIComponent(encodedDatabase);
  } catch {
    fail('DATABASE_TARGET_DATABASE_INVALID');
  }
  if (!database || database.length > 255 || CONTROL_OR_WHITESPACE.test(database) ||
      database.includes('/') || database.includes('\\')) {
    fail('DATABASE_TARGET_DATABASE_INVALID');
  }

  const port = parsed.port === '' ? 5432 : Number(parsed.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    fail('DATABASE_TARGET_PORT_INVALID');
  }
  return Object.freeze({
    schemaVersion: DATABASE_TARGET_FINGERPRINT_VERSION,
    host: canonicalNeonHostname(parsed.hostname),
    port,
    database,
  });
}

export function fingerprintDatabaseTarget(connectionString) {
  const canonicalTarget = canonicalizeDatabaseTarget(connectionString);
  return createHash('sha256')
    .update(`${DATABASE_TARGET_FINGERPRINT_VERSION}\n${canonicalJson(canonicalTarget)}`, 'utf8')
    .digest('hex');
}
