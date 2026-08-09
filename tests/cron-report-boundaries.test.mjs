import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const validInternalSecret = 'c'.repeat(32);
const jwtSecret = 'j'.repeat(32);
process.env.JWT_SECRET = jwtSecret;

function response() {
  return {
    statusCode: 200,
    payload: undefined,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test('scheduled report delivery stays retired even for a trusted internal caller', async t => {
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = validInternalSecret;
  t.after(() => {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  });

  const { default: handler } = await import('../api/cron-daily-report.js');
  const res = response();
  await handler({
    method: 'GET',
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  }, res);

  assert.equal(res.statusCode, 410);
  assert.equal(res.payload.code, 'SCHEDULED_REPORT_DELIVERY_NOT_GOVERNED');
  assert.match(res.payload.error, /auditoría tenant-bound/i);
});

test('scheduled report rejects one- and 31-character internal secrets', async t => {
  const previousSecret = process.env.CRON_SECRET;
  t.after(() => {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  });

  const { default: handler } = await import('../api/cron-daily-report.js');
  for (const weakSecret of ['x', 'x'.repeat(31)]) {
    process.env.CRON_SECRET = weakSecret;
    const res = response();
    await handler({
      method: 'GET',
      headers: { authorization: `Bearer ${weakSecret}` },
    }, res);
    assert.equal(res.statusCode, 401);
  }
});

test('scheduled report rejects a CRON secret reused as JWT_SECRET', async t => {
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = jwtSecret;
  t.after(() => {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  });

  const { default: handler } = await import('../api/cron-daily-report.js');
  const res = response();
  await handler({
    method: 'GET',
    headers: { authorization: `Bearer ${jwtSecret}` },
  }, res);
  assert.equal(res.statusCode, 401);
});

test('retired email report remains 410 for a valid independent internal caller', async t => {
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = validInternalSecret;
  t.after(() => {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  });

  const { default: handler } = await import('../api/email-report.js');
  const res = response();
  await handler({
    method: 'POST',
    headers: { authorization: `Bearer ${validInternalSecret}` },
    body: {},
  }, res);
  assert.equal(res.statusCode, 410);
  assert.equal(res.payload.code, 'EMAIL_REPORT_AUDIT_NOT_GOVERNED');
});

test('Vercel does not schedule the retired delivery endpoint', () => {
  const source = readFileSync(path.join(root, 'api', 'cron-daily-report.js'), 'utf8');
  const vercel = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.doesNotMatch(source, /municipio-junin\.vercel\.app/);
  assert.doesNotMatch(source, /whatsapp-alert|data_audit|intelligence_reports|from ['"]pg['"]/i);
  assert.equal(Object.hasOwn(vercel, 'crons'), false);
});

test('untrusted callers cannot use the retired delivery route for discovery', async () => {
  const { default: handler } = await import('../api/cron-daily-report.js');
  const res = response();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 401);
});
