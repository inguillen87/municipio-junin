'use strict';

const DEVELOPMENT_LOOPBACK_ORIGINS = Object.freeze([
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:8080',
]);

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');

  if (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '::1'
    || /^::(?:ffff:)?7f[0-9a-f]{2}:/.test(normalized)
  ) {
    return true;
  }

  const octets = normalized.split('.');
  return octets.length === 4
    && octets.every(octet => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
    && Number(octets[0]) === 127;
}

function validateExplicitOrigin(value, { production }) {
  if (typeof value !== 'string' || !value) return null;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    return null;
  }

  const loopback = isLoopbackHostname(parsed.hostname);
  const supportedProtocol = parsed.protocol === 'https:'
    || (!production && parsed.protocol === 'http:' && loopback);

  if (!supportedProtocol || (production && loopback) || parsed.origin !== value) {
    return null;
  }

  return parsed.origin;
}

function normalizeVercelOrigin(value, options) {
  const raw = String(value || '').trim();
  if (!raw) return { configured: false, origin: null };

  const candidate = raw.startsWith('https://')
    ? raw
    : raw.includes('://')
      ? null
      : `https://${raw}`;

  return {
    configured: true,
    origin: candidate ? validateExplicitOrigin(candidate, options) : null,
  };
}

function buildCorsOriginPolicy(environment = process.env) {
  // Only an explicit development runtime receives loopback exceptions. A
  // missing, misspelled or staging NODE_ENV keeps the production-strength
  // HTTPS policy instead of degrading silently.
  const production = environment.NODE_ENV !== 'development';
  const configuredValues = String(environment.PUBLIC_APP_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const invalidSources = [];
  const configuredOrigins = [];

  for (const value of configuredValues) {
    const origin = validateExplicitOrigin(value, { production });
    if (!origin) invalidSources.push('PUBLIC_APP_ORIGINS');
    else configuredOrigins.push(origin);
  }

  const vercel = normalizeVercelOrigin(environment.VERCEL_URL, { production });
  if (vercel.configured && !vercel.origin) invalidSources.push('VERCEL_URL');
  else if (vercel.origin) configuredOrigins.push(vercel.origin);

  const valid = invalidSources.length === 0;
  const allowedOrigins = new Set();
  if (valid) {
    for (const origin of configuredOrigins) allowedOrigins.add(origin);
    if (!production) {
      for (const origin of DEVELOPMENT_LOOPBACK_ORIGINS) allowedOrigins.add(origin);
    }
  }

  return Object.freeze({
    valid,
    production,
    allowedOrigins,
    invalidSources: Object.freeze([...new Set(invalidSources)]),
  });
}

function isCorsOriginAllowed(origin, policy) {
  if (origin === undefined || origin === null || origin === '') return true;
  return typeof origin === 'string'
    && policy?.valid === true
    && policy.allowedOrigins instanceof Set
    && policy.allowedOrigins.has(origin);
}

module.exports = Object.freeze({
  DEVELOPMENT_LOOPBACK_ORIGINS,
  buildCorsOriginPolicy,
  isCorsOriginAllowed,
  isLoopbackHostname,
  normalizeVercelOrigin,
  validateExplicitOrigin,
});
