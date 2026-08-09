'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

process.env.NODE_ENV = 'production';
process.env.PUBLIC_APP_ORIGINS = 'https://cabildo.example.test';
process.env.FRONTEND_URL = 'http://insecure.example.test';
delete process.env.VERCEL_URL;

const { createCorsOptions } = require('../lib/cors-policy');
const { app } = require('../server');

function evaluateOrigin(environment, origin) {
  const options = createCorsOptions(environment);
  let result;
  let error;
  options.origin(origin, (receivedError, receivedResult) => {
    error = receivedError;
    result = receivedResult;
  });
  assert.equal(error, null);
  return result;
}

async function startHarness() {
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

test('Express enforces the shared exact production policy at the HTTP boundary', async t => {
  const { server, baseUrl } = await startHarness();
  t.after(() => new Promise(resolve => server.close(resolve)));

  for (const [origin, expected] of [
    ['https://cabildo.example.test', 'https://cabildo.example.test'],
    ['http://insecure.example.test', null],
    ['https://cabildo.example.test.evil.test', null],
    ['https://municipio-junin.vercel.app', null],
    ['http://localhost:3000', null],
  ]) {
    const response = await fetch(`${baseUrl}/api/health`, { headers: { Origin: origin } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), expected, origin);
  }
});

test('Express fails an invalid mixed production configuration closed', () => {
  const environment = {
    NODE_ENV: 'production',
    PUBLIC_APP_ORIGINS: 'https://seguro.example.test,http://insecure.example.test',
  };
  assert.equal(evaluateOrigin(environment, 'https://seguro.example.test'), false);
  assert.equal(evaluateOrigin(environment, undefined), true, 'non-browser requests remain supported');
});

test('Express permits development loopback but not production localhost', () => {
  assert.equal(evaluateOrigin({ NODE_ENV: 'development' }, 'http://localhost:8080'), true);
  assert.equal(evaluateOrigin({ NODE_ENV: 'development' }, 'http://dev.example.test'), false);
  assert.equal(evaluateOrigin({ NODE_ENV: 'production' }, 'http://localhost:8080'), false);
  assert.equal(evaluateOrigin({}, 'http://localhost:8080'), false);
});

test('Express accepts VERCEL_URL only as its normalized HTTPS origin', () => {
  const environment = {
    NODE_ENV: 'production',
    VERCEL_URL: 'municipio-preview-123.vercel.app',
  };
  assert.equal(evaluateOrigin(environment, 'https://municipio-preview-123.vercel.app'), true);
  assert.equal(evaluateOrigin(environment, 'http://municipio-preview-123.vercel.app'), false);
  assert.equal(
    evaluateOrigin({ ...environment, VERCEL_URL: 'http://municipio-preview-123.vercel.app' }, 'https://municipio-preview-123.vercel.app'),
    false,
  );
});
