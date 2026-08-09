'use strict';

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

class DatabaseUrlPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DatabaseUrlPolicyError';
    this.code = code;
  }
}

function inspectDatabaseUrl(connectionString, options = {}) {
  const nodeEnv = String(options.nodeEnv || '').trim().toLowerCase();
  if (typeof connectionString !== 'string' || !connectionString.trim()) {
    throw new DatabaseUrlPolicyError('DATABASE_URL_REQUIRED', 'La conexión PostgreSQL no está configurada');
  }

  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new DatabaseUrlPolicyError('DATABASE_URL_INVALID', 'La conexión PostgreSQL no tiene un formato válido');
  }
  if (!POSTGRES_PROTOCOLS.has(parsed.protocol) || !parsed.hostname) {
    throw new DatabaseUrlPolicyError('DATABASE_URL_INVALID', 'La conexión debe usar PostgreSQL y declarar un host');
  }

  const sslModes = parsed.searchParams.getAll('sslmode').map(value => value.trim().toLowerCase());
  const developmentLoopback = nodeEnv === 'development' && LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
  if (developmentLoopback) {
    if (sslModes.length > 1 || sslModes.some(mode => !['disable', 'verify-full'].includes(mode))) {
      throw new DatabaseUrlPolicyError('DATABASE_TLS_INVALID', 'El modo TLS de PostgreSQL no es válido');
    }
    return Object.freeze({ connectionString, host: parsed.hostname, tlsVerified: sslModes[0] === 'verify-full', developmentLoopback: true });
  }

  if (sslModes.length !== 1 || sslModes[0] !== 'verify-full') {
    throw new DatabaseUrlPolicyError('DATABASE_TLS_VERIFY_FULL_REQUIRED', 'La conexión PostgreSQL remota exige sslmode=verify-full');
  }
  return Object.freeze({ connectionString, host: parsed.hostname, tlsVerified: true, developmentLoopback: false });
}

module.exports = Object.freeze({
  DatabaseUrlPolicyError,
  inspectDatabaseUrl,
});
