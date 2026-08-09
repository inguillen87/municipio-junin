'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const jwt = require('jsonwebtoken');

const approvedOrigin = 'https://preview-approved.example';

function webhookBody(id) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          metadata: { phone_number_id: 'phone-id-test' },
          messages: [{
            id,
            from: '5492615550101',
            type: 'text',
            text: { body: 'rrhh' },
          }],
        },
      }],
    }],
  };
}

async function postSignedWebhook(nativeFetch, baseUrl, id) {
  const raw = JSON.stringify(webhookBody(id));
  const signature = crypto
    .createHmac('sha256', process.env.WHATSAPP_APP_SECRET)
    .update(raw)
    .digest('hex');
  const response = await nativeFetch(`${baseUrl}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': `sha256=${signature}`,
    },
    body: raw,
  });
  return {
    status: response.status,
    payload: await response.json(),
  };
}

test('Express WhatsApp links use PUBLIC_APP_URL and fail closed when it is missing or invalid', async t => {
  const envNames = [
    'PUBLIC_APP_URL',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_APP_SECRET',
    'WHATSAPP_PHONE_ID',
  ];
  const previousEnvironment = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  Object.assign(process.env, {
    PUBLIC_APP_URL: `${approvedOrigin}/`,
    WHATSAPP_ACCESS_TOKEN: 'whatsapp-test-token',
    WHATSAPP_APP_SECRET: 'whatsapp-test-app-secret',
    WHATSAPP_PHONE_ID: 'phone-id-test',
  });

  const nativeFetch = globalThis.fetch;
  const outboundCalls = [];
  globalThis.fetch = async (url, options) => {
    outboundCalls.push({ url: String(url), options });
    return { ok: true, status: 200 };
  };

  const { app } = require('../server');
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    globalThis.fetch = nativeFetch;
    for (const [name, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await new Promise(resolve => server.close(resolve));
  });

  const configured = await postSignedWebhook(nativeFetch, baseUrl, 'express-origin-valid');
  assert.equal(configured.status, 200);
  assert.deepEqual(configured.payload, { ok: true });
  assert.equal(outboundCalls.length, 1);
  const configuredPayload = JSON.parse(outboundCalls[0].options.body);
  assert.match(configuredPayload.text.body, new RegExp(`${approvedOrigin}/login\\.html$`));
  assert.doesNotMatch(configuredPayload.text.body, /municipio-junin\.vercel\.app/i);

  delete process.env.PUBLIC_APP_URL;
  const missing = await postSignedWebhook(nativeFetch, baseUrl, 'express-origin-missing');
  assert.equal(missing.status, 503);
  assert.deepEqual(missing.payload, { ok: false, error: 'Canal no configurado' });
  assert.equal(outboundCalls.length, 1);

  process.env.PUBLIC_APP_URL = `${approvedOrigin}/login.html`;
  const invalid = await postSignedWebhook(nativeFetch, baseUrl, 'express-origin-invalid');
  assert.equal(invalid.status, 503);
  assert.deepEqual(invalid.payload, { ok: false, error: 'Canal no configurado' });
  assert.equal(outboundCalls.length, 1);
});

test('Express global alert is retired for a foreign TENANT_ADMIN without an outbound send', async t => {
  const envNames = [
    'JWT_SECRET',
    'WHATSAPP_ALERT_TO',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_ID',
  ];
  const previousEnvironment = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  Object.assign(process.env, {
    JWT_SECRET: 'express-whatsapp-foreign-tenant-secret-with-sufficient-length',
    WHATSAPP_ALERT_TO: '5492615550101',
    WHATSAPP_ACCESS_TOKEN: 'must-not-send-token',
    WHATSAPP_PHONE_ID: 'must-not-send-phone-id',
  });

  const prisma = require('../lib/prisma');
  const originalFindUnique = prisma.user.findUnique;
  prisma.user.findUnique = async ({ where }) => ({
    id: where.id,
    email: 'foreign-admin@example.test',
    name: 'Administrador extranjero',
    role: 'TENANT_ADMIN',
    tenantId: 'tenant-foreign',
    active: true,
    tenant: {
      id: 'tenant-foreign',
      slug: 'tenant-foreign',
      name: 'Municipio extranjero',
      shortName: 'Extranjero',
      status: 'ACTIVE',
    },
  });

  const nativeFetch = globalThis.fetch;
  let outboundCalls = 0;
  globalThis.fetch = async () => {
    outboundCalls += 1;
    throw new Error('retired alert must not reach Meta');
  };

  const { app } = require('../server');
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    globalThis.fetch = nativeFetch;
    prisma.user.findUnique = originalFindUnique;
    for (const [name, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await new Promise(resolve => server.close(resolve));
  });

  const token = jwt.sign({ id: 'foreign-alert-admin' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const response = await nativeFetch(`${baseUrl}/api/whatsapp/send-alert`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tenantId: 'tenant-junin',
      message: 'No debe enviarse al destinatario global',
      type: 'critical',
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 410);
  assert.equal(payload.code, 'WHATSAPP_ALERT_TENANT_SCOPE_NOT_GOVERNED');
  assert.equal(outboundCalls, 0);
});
