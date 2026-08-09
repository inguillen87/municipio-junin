import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import publicAppUrl from '../shared/public-app-url.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const approvedOrigin = 'https://preview-approved.example';
const { PublicAppUrlError, buildPublicAppUrl, getPublicAppOrigin } = publicAppUrl;

function response() {
  return {
    statusCode: 200,
    payload: undefined,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    send(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

function signedWebhookRequest(message, phoneId = 'phone-id-test') {
  const body = {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          metadata: { phone_number_id: phoneId },
          messages: [message],
        },
      }],
    }],
  };
  const raw = Buffer.from(JSON.stringify(body));
  const signature = crypto
    .createHmac('sha256', process.env.WHATSAPP_APP_SECRET)
    .update(raw)
    .digest('hex');
  const request = Readable.from([raw]);
  request.method = 'POST';
  request.query = {};
  request.headers = { 'x-hub-signature-256': `sha256=${signature}` };
  return request;
}

function preserveEnvironment(t, names) {
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

function configureWhatsAppEnvironment() {
  Object.assign(process.env, {
    PUBLIC_APP_URL: `${approvedOrigin}/`,
    WHATSAPP_ACCESS_TOKEN: 'whatsapp-test-token',
    WHATSAPP_APP_SECRET: 'whatsapp-test-app-secret',
    WHATSAPP_PHONE_ID: 'phone-id-test',
    WHATSAPP_PHONE_ID_VECINOS: 'phone-id-test',
    WHATSAPP_ALERT_TO: '5492615550101',
    CRON_SECRET: 'whatsapp-test-cron-secret-with-sufficient-length',
  });
}

function assertOnlyApprovedPublicLinks(calls) {
  assert.ok(calls.length > 0);
  for (const call of calls) {
    const payload = JSON.parse(call.options.body);
    const serialized = JSON.stringify(payload);
    const publicHosts = [...serialized.matchAll(/https:\/\/([^/"\\\s]+)/g)].map(match => match[1]);
    assert.ok(publicHosts.length > 0, `outbound payload has no public link: ${serialized}`);
    assert.deepEqual([...new Set(publicHosts)], ['preview-approved.example']);
    assert.match(serialized, /https:\/\/preview-approved\.example\/(?:login|ciudadano)\.html/);
  }
}

test('PUBLIC_APP_URL accepts one exact HTTPS origin and rejects ambiguous values', t => {
  preserveEnvironment(t, ['PUBLIC_APP_URL']);
  delete process.env.PUBLIC_APP_URL;
  assert.throws(() => getPublicAppOrigin(), PublicAppUrlError);

  assert.equal(getPublicAppOrigin(`${approvedOrigin}/`), approvedOrigin);
  assert.equal(buildPublicAppUrl('/login.html', `${approvedOrigin}/`), `${approvedOrigin}/login.html`);
  assert.equal(buildPublicAppUrl('/ciudadano.html', approvedOrigin), `${approvedOrigin}/ciudadano.html`);

  for (const invalid of [
    '',
    ` ${approvedOrigin}/`,
    'http://preview-approved.example/',
    'https://user:secret@preview-approved.example/',
    `${approvedOrigin}/login.html`,
    `${approvedOrigin}/.`,
    'https://PREVIEW-APPROVED.example/',
    'https://preview-approved.example:443/',
    `${approvedOrigin}/?tenant=junin`,
    `${approvedOrigin}/?`,
    `${approvedOrigin}/#release`,
    `${approvedOrigin}/#`,
  ]) {
    assert.throws(() => getPublicAppOrigin(invalid), PublicAppUrlError);
  }

  for (const invalidPath of ['login.html', '//attacker.example/login.html', '/login.html?next=x', '/login.html#x', '/a/../login.html']) {
    assert.throws(() => buildPublicAppUrl(invalidPath, approvedOrigin), PublicAppUrlError);
  }
});

test('outbound WhatsApp messages contain no fixed deployment origin', () => {
  const affectedFiles = [
    'api/whatsapp-webhook.js',
    'api/whatsapp-voice.js',
    'api/whatsapp-alert.js',
    'api/whatsapp-vecinos.js',
    'api/lib/whatsapp-templates.js',
    'backend/routes/whatsapp.js',
  ];

  for (const relativePath of affectedFiles) {
    const source = readFileSync(path.join(root, relativePath), 'utf8');
    assert.doesNotMatch(source, /https:\/\/municipio-junin\.vercel\.app/i, relativePath);
  }

  const citizenSource = readFileSync(path.join(root, 'api/whatsapp-vecinos.js'), 'utf8');
  assert.doesNotMatch(citizenSource, /Math\.random|referencia temporal|atenci[oó]n 24\/7|hacer un reclamo|sacar un turno|enviame la ubicaci[oó]n|ubicaci[oó]n recibida|quer[eé]s enviar una \*?foto/i);

  const voiceSource = readFileSync(path.join(root, 'api/whatsapp-voice.js'), 'utf8');
  assert.doesNotMatch(voiceSource, /escrib[ií].{0,20}detalle por texto/i);
  assert.match(voiceSource, /No envíes datos personales por este canal/i);

  const webhookSource = readFileSync(path.join(root, 'api/whatsapp-webhook.js'), 'utf8');
  assert.doesNotMatch(webhookSource, /Snapshot auditado|06\/08\/2026/i);
  assert.match(webhookSource, /WhatsApp no consulta ese contrato ni confirma/i);

  const alertSource = readFileSync(path.join(root, 'api/whatsapp-alert.js'), 'utf8');
  assert.doesNotMatch(alertSource, /WHATSAPP_ALERT_TO|graph\.facebook|sendMuniControlAlertaTemplate/);
  assert.match(alertSource, /WHATSAPP_ALERT_TENANT_SCOPE_NOT_GOVERNED/);
});

test('citizen webhook does not collect location, image or appointment data', async t => {
  const envNames = [
    'PUBLIC_APP_URL',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_APP_SECRET',
    'WHATSAPP_PHONE_ID',
    'WHATSAPP_PHONE_ID_VECINOS',
  ];
  preserveEnvironment(t, envNames);
  configureWhatsAppEnvironment();

  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: true, status: 200 };
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const { default: handler } = await import('../api/whatsapp-vecinos.js');
  const cases = [
    {
      id: 'citizen-turnos-retired',
      message: { type: 'text', text: { body: 'cmd_turnos' } },
      safeContract: /no reserva, cancela ni confirma turnos/i,
    },
    {
      id: 'citizen-location-retired',
      message: { type: 'location', location: { latitude: -33.0, longitude: -68.0 } },
      safeContract: /MuniControl no usa ni guarda.*proveedor de mensajería/i,
    },
    {
      id: 'citizen-image-retired',
      message: { type: 'image', image: { id: 'unread-media-id' } },
      safeContract: /MuniControl no procesa ni guarda.*proveedor de mensajería/i,
    },
  ];

  for (const item of cases) {
    const res = response();
    await handler(signedWebhookRequest({
      id: item.id,
      from: '5492615550101',
      ...item.message,
    }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.processed, 1);
  }

  assert.equal(calls.length, 3);
  const unsafeClaim = /reclamo generado|pre-registro|referencia temporal|#2026-|cuadrillas (?:ya )?fueron notificadas|enviame la ubicaci[oó]n|ubicaci[oó]n recibida|quer[eé]s enviar una foto|para sacar o cancelar turnos|atenci[oó]n 24\/7/i;
  calls.forEach((call, index) => {
    const payload = JSON.parse(call.options.body);
    assert.equal(payload.type, 'text');
    assert.match(payload.text.body, cases[index].safeContract);
    assert.match(payload.text.body, new RegExp(`${approvedOrigin}/ciudadano\\.html`));
    assert.doesNotMatch(payload.text.body, unsafeClaim);
  });
});

test('global Serverless alert is retired for an authenticated foreign TENANT_ADMIN', async t => {
  const envNames = ['JWT_SECRET', 'WHATSAPP_ALERT_TO', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_ID'];
  preserveEnvironment(t, envNames);
  Object.assign(process.env, {
    JWT_SECRET: 'whatsapp-foreign-tenant-secret-with-sufficient-length',
    WHATSAPP_ALERT_TO: '5492615550101',
    WHATSAPP_ACCESS_TOKEN: 'must-not-send-token',
    WHATSAPP_PHONE_ID: 'must-not-send-phone-id',
  });

  const { prisma } = await import('../api/lib/db.js');
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
  t.after(() => { prisma.user.findUnique = originalFindUnique; });

  const previousFetch = globalThis.fetch;
  let outboundCalls = 0;
  globalThis.fetch = async () => {
    outboundCalls += 1;
    throw new Error('retired alert must not reach Meta');
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const token = jwt.sign({ id: 'foreign-alert-admin' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const { default: handler } = await import('../api/whatsapp-alert.js');
  const res = response();
  await handler({
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: { message: 'No debe salir', tenantId: 'tenant-junin' },
  }, res);

  assert.equal(res.statusCode, 410);
  assert.equal(res.payload.code, 'WHATSAPP_ALERT_TENANT_SCOPE_NOT_GOVERNED');
  assert.equal(outboundCalls, 0);
});

test('serverless WhatsApp links use only the configured approved origin', async t => {
  const envNames = [
    'PUBLIC_APP_URL',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_APP_SECRET',
    'WHATSAPP_PHONE_ID',
    'WHATSAPP_PHONE_ID_VECINOS',
    'WHATSAPP_ALERT_TO',
    'CRON_SECRET',
  ];
  preserveEnvironment(t, envNames);
  configureWhatsAppEnvironment();

  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      async json() { return { messages: [{ id: `provider-${calls.length}` }] }; },
    };
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const [webhook, voice, vecinos, alert, templates] = await Promise.all([
    import('../api/whatsapp-webhook.js'),
    import('../api/whatsapp-voice.js'),
    import('../api/whatsapp-vecinos.js'),
    import('../api/whatsapp-alert.js'),
    import('../api/lib/whatsapp-templates.js'),
  ]);

  const webhookResponse = response();
  await webhook.default(signedWebhookRequest({
    id: 'origin-webhook-valid',
    from: '5492615550101',
    type: 'text',
    text: { body: 'rrhh' },
  }), webhookResponse);
  assert.equal(webhookResponse.statusCode, 200);

  const voiceResponse = response();
  await voice.default(signedWebhookRequest({
    id: 'origin-voice-valid',
    from: '5492615550101',
    type: 'audio',
  }), voiceResponse);
  assert.equal(voiceResponse.statusCode, 200);

  const vecinosResponse = response();
  await vecinos.default(signedWebhookRequest({
    id: 'origin-vecinos-valid',
    from: '5492615550101',
    type: 'text',
    text: { body: 'cmd_turnos' },
  }), vecinosResponse);
  assert.equal(vecinosResponse.statusCode, 200);

  const alertResponse = response();
  await alert.default({
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    body: { message: 'Control focal', module: 'rrhh' },
  }, alertResponse);
  assert.equal(alertResponse.statusCode, 410);
  assert.equal(calls.length, 3, 'the retired global alert must not reach Meta');

  const attemptedOverride = 'https://attacker.example/redirect';
  assert.equal((await templates.sendMuniControlAlertaTemplate({
    to: '5492615550101',
    link: attemptedOverride,
  })).success, true);
  assert.equal((await templates.sendReclamoConfirmacionTemplate({
    to: '5492615550101',
    link: attemptedOverride,
  })).success, true);
  assert.equal((await templates.sendAlertaEjecutivaTemplate({
    to: '5492615550101',
    link: attemptedOverride,
  })).success, true);

  assert.equal(calls.length, 6);
  assertOnlyApprovedPublicLinks(calls);
});

test('serverless WhatsApp link routes fail closed without a valid PUBLIC_APP_URL', async t => {
  const envNames = [
    'PUBLIC_APP_URL',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_APP_SECRET',
    'WHATSAPP_PHONE_ID',
    'WHATSAPP_PHONE_ID_VECINOS',
    'WHATSAPP_ALERT_TO',
    'CRON_SECRET',
  ];
  preserveEnvironment(t, envNames);
  configureWhatsAppEnvironment();

  const previousFetch = globalThis.fetch;
  let outboundCalls = 0;
  globalThis.fetch = async () => {
    outboundCalls += 1;
    throw new Error('outbound send must remain closed');
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const [webhook, voice, vecinos, alert, templates] = await Promise.all([
    import('../api/whatsapp-webhook.js'),
    import('../api/whatsapp-voice.js'),
    import('../api/whatsapp-vecinos.js'),
    import('../api/whatsapp-alert.js'),
    import('../api/lib/whatsapp-templates.js'),
  ]);

  for (const [configuration, suffix] of [
    [undefined, 'missing'],
    [`${approvedOrigin}/login.html`, 'path-not-origin'],
  ]) {
    if (configuration === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = configuration;

    const webhookResponse = response();
    await webhook.default(signedWebhookRequest({
      id: `origin-webhook-${suffix}`,
      from: '5492615550101',
      type: 'text',
      text: { body: 'rrhh' },
    }), webhookResponse);
    assert.equal(webhookResponse.statusCode, 503);

    const voiceResponse = response();
    await voice.default(signedWebhookRequest({
      id: `origin-voice-${suffix}`,
      from: '5492615550101',
      type: 'audio',
    }), voiceResponse);
    assert.equal(voiceResponse.statusCode, 503);

    const vecinosResponse = response();
    await vecinos.default(signedWebhookRequest({
      id: `origin-vecinos-${suffix}`,
      from: '5492615550101',
      type: 'text',
      text: { body: 'cmd_turnos' },
    }), vecinosResponse);
    assert.equal(vecinosResponse.statusCode, 503);

    const alertResponse = response();
    await alert.default({
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      body: { message: 'No enviar', module: 'rrhh' },
    }, alertResponse);
    assert.equal(alertResponse.statusCode, 410);

    await assert.rejects(
      () => templates.sendMuniControlAlertaTemplate({ to: '5492615550101' }),
      PublicAppUrlError,
    );
  }

  assert.equal(outboundCalls, 0);
});
