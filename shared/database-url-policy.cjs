'use strict';

const net = require('node:net');

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const CONNECTION_OVERRIDE_PARAMS = new Set([
  'database',
  'dbname',
  'host',
  'hostaddr',
  'options',
  'password',
  'port',
  'user',
]);

class DatabaseUrlPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DatabaseUrlPolicyError';
    this.code = code;
  }
}

function isCanonicalDatabaseHostname(hostname) {
  if (typeof hostname !== 'string' || !hostname || /[%\\/\s\u0000-\u001f\u007f]/u.test(hostname)) return false;
  const unwrapped = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  if (net.isIP(unwrapped)) return true;
  if (unwrapped.length > 253 || unwrapped.endsWith('.')) return false;
  return unwrapped.split('.').every(label => (
    label.length >= 1 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/iu.test(label)
  ));
}

function inspectDatabaseUrl(connectionString, options = {}) {
  const nodeEnv = String(options.nodeEnv || '').trim().toLowerCase();
  const environment = options.environment && typeof options.environment === 'object'
    ? options.environment
    : process.env;
  if (typeof connectionString !== 'string' || !connectionString.trim()) {
    throw new DatabaseUrlPolicyError('DATABASE_URL_REQUIRED', 'La conexión PostgreSQL no está configurada');
  }
  if (connectionString !== connectionString.trim()
    || /[\u0000-\u0020\u007f]/u.test(connectionString)
    || /%(?![a-f0-9]{2})/iu.test(connectionString)) {
    throw new DatabaseUrlPolicyError('DATABASE_URL_NOT_CANONICAL', 'La conexión PostgreSQL contiene whitespace, controles o escapes no canónicos');
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
  if (!isCanonicalDatabaseHostname(parsed.hostname)) {
    throw new DatabaseUrlPolicyError('DATABASE_HOST_CANONICAL_REQUIRED', 'El host PostgreSQL debe ser DNS o IP canónico; sockets y autoridades codificadas no están permitidos');
  }
  if (!parsed.username || !parsed.pathname || parsed.pathname === '/') {
    throw new DatabaseUrlPolicyError('DATABASE_URL_IDENTITY_REQUIRED', 'La conexión debe declarar usuario y base en la autoridad canónica');
  }
  for (const [name] of parsed.searchParams) {
    if (CONNECTION_OVERRIDE_PARAMS.has(name.toLowerCase())) {
      throw new DatabaseUrlPolicyError('DATABASE_URL_OVERRIDE_FORBIDDEN', 'La conexión contiene un override de identidad o sesión no permitido');
    }
  }

  const developmentLoopback = nodeEnv === 'development' && LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
  if (!developmentLoopback && !parsed.password) {
    throw new DatabaseUrlPolicyError('DATABASE_CREDENTIAL_REQUIRED', 'La conexión PostgreSQL remota debe declarar su credencial en la URL gobernada');
  }
  if (String(environment.NODE_TLS_REJECT_UNAUTHORIZED || '').trim() === '0') {
    throw new DatabaseUrlPolicyError('DATABASE_TLS_ENV_FORBIDDEN', 'La verificación TLS global de Node no puede estar desactivada');
  }

  const sslModes = parsed.searchParams.getAll('sslmode').map(value => value.trim().toLowerCase());
  if (developmentLoopback) {
    if (sslModes.length > 1 || sslModes.some(mode => !['disable', 'verify-full'].includes(mode))) {
      throw new DatabaseUrlPolicyError('DATABASE_TLS_INVALID', 'El modo TLS de PostgreSQL no es válido');
    }
    return Object.freeze({ connectionString: parsed.href, host: parsed.hostname, tlsVerified: sslModes[0] === 'verify-full', developmentLoopback: true });
  }

  if (sslModes.length !== 1 || sslModes[0] !== 'verify-full') {
    throw new DatabaseUrlPolicyError('DATABASE_TLS_VERIFY_FULL_REQUIRED', 'La conexión PostgreSQL remota exige sslmode=verify-full');
  }
  return Object.freeze({ connectionString: parsed.href, host: parsed.hostname, tlsVerified: true, developmentLoopback: false });
}

module.exports = Object.freeze({
  CONNECTION_OVERRIDE_PARAMS,
  DatabaseUrlPolicyError,
  isCanonicalDatabaseHostname,
  inspectDatabaseUrl,
});
