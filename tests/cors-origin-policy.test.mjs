import assert from 'node:assert/strict';
import test from 'node:test';

import corsOriginPolicy from '../shared/cors-origin-policy.cjs';
import { cors } from '../api/lib/auth.js';

const { buildCorsOriginPolicy, isCorsOriginAllowed } = corsOriginPolicy;
const managedEnvironmentNames = ['NODE_ENV', 'PUBLIC_APP_ORIGINS', 'VERCEL_URL'];

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(managedEnvironmentNames.map(name => [name, process.env[name]]));
  try {
    for (const name of managedEnvironmentNames) {
      if (Object.hasOwn(values, name) && values[name] !== undefined) process.env[name] = values[name];
      else delete process.env[name];
    }
    return callback();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function invokeServerlessCors(origin, environment) {
  return withEnvironment(environment, () => {
    const headers = new Map();
    cors(
      { headers: origin ? { origin } : {} },
      { setHeader: (name, value) => headers.set(name.toLowerCase(), value) },
    );
    return headers;
  });
}

test('production accepts only an explicitly configured canonical HTTPS origin', () => {
  const environment = {
    NODE_ENV: 'production',
    PUBLIC_APP_ORIGINS: 'https://cabildo.example.test',
  };
  const policy = buildCorsOriginPolicy(environment);

  assert.equal(policy.valid, true);
  assert.equal(isCorsOriginAllowed('https://cabildo.example.test', policy), true);
  assert.equal(isCorsOriginAllowed('http://cabildo.example.test', policy), false);
  assert.equal(isCorsOriginAllowed('https://cabildo.example.test.evil.test', policy), false);
  assert.equal(isCorsOriginAllowed('https://cabildo.example.test@evil.test', policy), false);

  const headers = invokeServerlessCors('https://cabildo.example.test', environment);
  assert.equal(headers.get('access-control-allow-origin'), 'https://cabildo.example.test');
  assert.equal(headers.get('vary'), 'Origin');
});

test('one invalid configured origin fails the complete production allowlist closed', () => {
  const invalidOrigins = [
    'http://cabildo.example.test',
    'https://usuario:clave@cabildo.example.test',
    'https://cabildo.example.test/admin',
    'https://cabildo.example.test?municipio=junin',
    'https://cabildo.example.test#admin',
    'https://localhost:8443',
    'https://localhost.',
    'https://[::ffff:7f00:1]',
  ];

  for (const invalidOrigin of invalidOrigins) {
    const environment = {
      NODE_ENV: 'production',
      PUBLIC_APP_ORIGINS: `https://seguro.example.test,${invalidOrigin}`,
    };
    const policy = buildCorsOriginPolicy(environment);
    assert.equal(policy.valid, false, invalidOrigin);
    assert.equal(policy.allowedOrigins.size, 0, invalidOrigin);
    assert.equal(isCorsOriginAllowed('https://seguro.example.test', policy), false, invalidOrigin);
    assert.equal(
      invokeServerlessCors('https://seguro.example.test', environment).has('access-control-allow-origin'),
      false,
      invalidOrigin,
    );
  }
});

test('production has no historical or localhost implicit origins', () => {
  const environment = { NODE_ENV: 'production', PUBLIC_APP_ORIGINS: '' };
  for (const origin of [
    'https://municipio-junin.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:8080',
  ]) {
    assert.equal(
      invokeServerlessCors(origin, environment).has('access-control-allow-origin'),
      false,
      origin,
    );
  }
});

test('development permits only the explicit loopback set over HTTP', () => {
  const policy = buildCorsOriginPolicy({ NODE_ENV: 'development' });
  assert.equal(isCorsOriginAllowed('http://localhost:3000', policy), true);
  assert.equal(isCorsOriginAllowed('http://127.0.0.1:5500', policy), true);
  assert.equal(isCorsOriginAllowed('http://dev.example.test', policy), false);

  assert.equal(
    isCorsOriginAllowed('http://localhost:3000', buildCorsOriginPolicy({})),
    false,
    'an unset NODE_ENV must not enable development exceptions',
  );
});

test('VERCEL_URL is normalized to HTTPS and invalid schemes fail closed', () => {
  const valid = buildCorsOriginPolicy({
    NODE_ENV: 'production',
    PUBLIC_APP_ORIGINS: '',
    VERCEL_URL: 'municipio-preview-123.vercel.app',
  });
  assert.equal(isCorsOriginAllowed('https://municipio-preview-123.vercel.app', valid), true);
  assert.equal(isCorsOriginAllowed('http://municipio-preview-123.vercel.app', valid), false);

  const invalid = buildCorsOriginPolicy({
    NODE_ENV: 'production',
    PUBLIC_APP_ORIGINS: 'https://seguro.example.test',
    VERCEL_URL: 'http://municipio-preview-123.vercel.app',
  });
  assert.equal(invalid.valid, false);
  assert.equal(isCorsOriginAllowed('https://seguro.example.test', invalid), false);
});
