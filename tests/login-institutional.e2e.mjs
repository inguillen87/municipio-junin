import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import accessPolicy from '../shared/access-policy.cjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGIN_PATH = path.join(REPO, 'login.html');
const SUCCESS_EMAIL = 'success@junin.gob.ar';
const TEST_PASSWORD = 'Institutional-test-only';
const EVALUATION_PASSWORD = 'Junin2026!';
const PUBLISHED_EVALUATION_IDENTITIES = Object.freeze([
  Object.freeze({ email: 'intendente@junin.gov.ar', role: 'INTENDENTE' }),
  Object.freeze({ email: 'admin@junin.gov.ar', role: 'TENANT_ADMIN' }),
  Object.freeze({ email: 'contador@junin.gov.ar', role: 'CONTADOR' }),
  Object.freeze({ email: 'rrhh@junin.gov.ar', role: 'TENANT_USER' }),
  Object.freeze({ email: 'inspector@junin.gov.ar', role: 'INSPECTOR' }),
  Object.freeze({ email: 'demo@junin.gov.ar', role: 'DEMO' }),
]);
const SUCCESS_ACCESS = accessPolicy.getSessionAccessForUser({
  role: 'INTENDENTE',
  tenantId: 'tenant-junin-e2e',
});

function json(response, status, body) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function createServer(requestLog) {
  const [loginSource, pwaRegisterSource] = await Promise.all([
    readFile(LOGIN_PATH),
    readFile(path.join(REPO, 'js', 'pwa-register.js')),
  ]);
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');

    if (url.pathname === '/js/pwa-register.js' && request.method === 'GET') {
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/javascript; charset=utf-8',
      });
      response.end(pwaRegisterSource);
      return;
    }

    if (url.pathname === '/sw.js' && request.method === 'GET') {
      response.writeHead(200, {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'text/javascript; charset=utf-8',
        'Service-Worker-Allowed': '/',
      });
      response.end("self.addEventListener('install', () => self.skipWaiting()); self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));");
      return;
    }

    if (url.pathname === '/api/grh-directory' && request.method === 'GET') {
      const authorization = request.headers.authorization || '';
      requestLog.push({
        authorization,
        limit: url.searchParams.get('limit'),
        method: request.method,
        path: url.pathname,
        purpose: request.headers['x-municontrol-purpose'] || '',
      });
      const privateAccess = authorization === 'Bearer signed-token-for-login-e2e' &&
        request.headers['x-municontrol-purpose'] === 'DIRECTORY_BROWSE' &&
        url.searchParams.size === 1 && url.searchParams.get('limit') === '1';
      response.writeHead(privateAccess ? 200 : 403, {
        'Cache-Control': 'no-store, private',
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'X-MuniControl-Contract': 'grh-directory-v1',
      });
      response.end(JSON.stringify(privateAccess ? { probe: 'authorized' } : { code: 'GRH_DIRECTORY_ACCESS_DENIED' }));
      return;
    }

    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      let body;
      try {
        body = await readJsonBody(request);
      } catch {
        json(response, 400, { error: 'invalid body' });
        return;
      }

      requestLog.push({
        body,
        contentType: request.headers['content-type'] || '',
        method: request.method,
      });

      const evaluationIdentity = PUBLISHED_EVALUATION_IDENTITIES.find(identity => identity.email === body.email);
      if (evaluationIdentity && body.password === EVALUATION_PASSWORD) {
        const access = accessPolicy.getSessionAccessForUser({
          role: evaluationIdentity.role,
          tenantId: 'tenant-junin-e2e',
        });
        json(response, 200, {
          token: `signed-evaluation-token-${evaluationIdentity.role.toLowerCase()}`,
          user: {
            email: evaluationIdentity.email,
            id: `qa-evaluation-${evaluationIdentity.role.toLowerCase()}`,
            name: `Evaluación ${evaluationIdentity.role}`,
            role: evaluationIdentity.role,
            tenantId: 'tenant-junin-e2e',
            capabilities: access.capabilities,
            accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
            homeProfile: access.homeProfile,
          },
        });
        return;
      }

      const statusByEmail = {
        'unauthorized@junin.gob.ar': 401,
        'forbidden@junin.gob.ar': 403,
        'unavailable@junin.gob.ar': 503,
      };
      const status = statusByEmail[body.email];
      if (status) {
        json(response, status, {
          error: `detalle interno que la interfaz no debe exponer (${status})`,
        });
        return;
      }

      if ((body.email === SUCCESS_EMAIL || body.email === 'unsafe-path@junin.gob.ar') && body.password === TEST_PASSWORD) {
        json(response, 200, {
          token: 'signed-token-for-login-e2e',
          user: {
            email: SUCCESS_EMAIL,
            id: 'qa-login-institutional',
            name: 'QA Acceso Institucional',
            role: 'INTENDENTE',
            tenantId: 'tenant-junin-e2e',
            capabilities: SUCCESS_ACCESS.capabilities,
            accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
            homeProfile: body.email === 'unsafe-path@junin.gob.ar'
              ? { ...SUCCESS_ACCESS.homeProfile, defaultPath: 'https://attacker.example/' }
              : SUCCESS_ACCESS.homeProfile,
          },
        });
        return;
      }

      json(response, 401, { error: 'detalle interno de credenciales' });
      return;
    }

    if ((url.pathname === '/' || url.pathname === '/login.html') && request.method === 'GET') {
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(loginSource);
      return;
    }

    if (url.pathname === '/inicio.html' && request.method === 'GET') {
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
      });
      response.end('<!doctype html><html lang="es"><title>Destino seguro</title><body><main id="loginSuccess">Sesión iniciada</main></body></html>');
      return;
    }

    if (url.pathname === '/rrhh.html' && request.method === 'GET') {
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
      });
      response.end('<!doctype html><html lang="es"><title>RRHH privado</title><body><main id="peopleDirectory">Directorio privado</main></body></html>');
      return;
    }

    response.writeHead(404, { 'Cache-Control': 'no-store' });
    response.end();
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

test('login source is institutional, self-contained and preserves the auth contract', async () => {
  const source = await readFile(LOGIN_PATH, 'utf8');

  assert.match(source, /<main\b[^>]*>/i);
  assert.match(source, /class="skip-link"\s+href="#accessPanel"/i);
  assert.match(source, /id="togglePassBtn"[\s\S]*?aria-controls="passInput"[\s\S]*?aria-label="Mostrar contraseña"[\s\S]*?aria-pressed="false"/i);
  assert.match(source, /Snapshot GRH gobernado/);
  assert.match(source, /No es tiempo real/);
  assert.match(source, /Sin PII/);
  assert.match(source, /Identidad emitida por la Municipalidad/);
  assert.match(source, /id="privateGrhLoginLink"\s+href="\/login\.html\?access=private-grh&amp;return=rrhh\.html%23peopleDirectory"/);
  assert.match(source, /Tengo una credencial privada GRH/i);
  assert.match(source, /Abre el formulario privado; no inicia sesión automáticamente/i);
  assert.match(source, /AD · MÁS OPCIONES/);
  assert.match(source, /class="tour-link"\s+href="\/roles"/);
  assert.match(source, /No inicia sesi.n ni accede a datos/i);
  assert.match(source, /fetch\('\/api\/auth\/login'/);
  assert.match(source, /JSON\.stringify\(\{ email: email, password: password \}\)/);
  assert.match(source, /sessionStorage\.setItem\('mjunin_user'/);
  assert.match(source, /sessionStorage\.setItem\('mjunin_token'/);
  assert.match(source, /SAFE_DEFAULT_PATHS = Object\.freeze\(\['inicio\.html'\]\)/);
  assert.match(source, /SAFE_RETURN_PATHS = Object\.freeze/);
  assert.match(source, /params\.get\('access'\) === 'private-grh'/);
  assert.match(source, /fetch\('\/api\/grh-directory\?limit=1'/);
  assert.match(source, /'X-MuniControl-Purpose': 'DIRECTORY_BROWSE'/);
  assert.match(source, /Ese perfil .* no tiene acceso al directorio nominal/i);
  assert.match(source, /window\.location\.href = validatedReturnPath\(session\) \|\| validatedDefaultPath\(session\)/);
  assert.doesNotMatch(source, /window\.location\.href = 'index\.html'/);

  assert.doesNotMatch(source, /gradient|@keyframes|\bfloat\b|\bglow\b|kpi-card|data-count/i);
  assert.match(source, /data-demo-contract="published-evaluation-readonly-v1"/);
  assert.match(source, /snapshot GRH hist[oó]rico y agregado/i);
  assert.match(source, /escrituras bloqueadas por el servidor/i);
  const publishedEmails = [...source.matchAll(/data-evaluation-email="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(publishedEmails, PUBLISHED_EVALUATION_IDENTITIES.map(identity => identity.email));
  assert.doesNotMatch(source, /\/api\/auth\/seed-demo|ensureSeeded|fillUser\s*\(/i);
  assert.doesNotMatch(source, /AES-256|JWT firmado|HTTPS requerido/i);
  assert.doesNotMatch(source, /<img\b|<canvas\b|<video\b|<link\b[^>]*rel=["']stylesheet/i);
  const externalScripts = Array.from(source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi), match => match[1]);
  assert.deepEqual(externalScripts, ['/js/pwa-register.js']);
  assert.doesNotMatch(source, /https?:\/\//i);

  const inlineScripts = Array.from(source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))
    .filter(match => !/\bsrc\s*=/.test(match[0]))
    .map(match => match[1]);
  assert.equal(inlineScripts.length, 1);
  assert.doesNotThrow(() => new Function(inlineScripts[0]));
});

test('login is responsive, reduced-motion safe and has no external requests', async t => {
  const requestLog = [];
  const server = await createServer(requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  for (const viewport of [
    { height: 844, name: 'mobile', width: 390 },
    { height: 900, name: 'tablet', width: 768 },
    { height: 1000, name: 'desktop', width: 1440 },
  ]) {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport });
    const page = await context.newPage();
    const consoleErrors = [];
    const externalRequests = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('request', request => {
      if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url());
    });

    await page.goto(`${baseUrl}/login.html`, { waitUntil: 'networkidle' });
    const metrics = await page.evaluate(() => {
      const bounds = selector => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return { bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right, top: rect.top, width: rect.width };
      };
      const cssTimes = Array.from(document.querySelectorAll('*')).flatMap(node => {
        const style = getComputedStyle(node);
        return [...style.animationDuration.split(','), ...style.transitionDuration.split(',')];
      });
      return {
        access: bounds('#accessPanel'),
        button: bounds('#btnLogin'),
        email: bounds('#emailInput'),
        h1: document.querySelectorAll('h1').length,
        heavyAssets: document.querySelectorAll('img, canvas, video, link[rel="stylesheet"], script[src]:not([src="/js/pwa-register.js"])').length,
        main: document.querySelectorAll('main').length,
        mainOverflow: document.querySelector('main').scrollWidth - document.querySelector('main').clientWidth,
        maxCssTimeMs: Math.max(0, ...cssTimes.map(value => {
          const numeric = Number.parseFloat(value);
          if (!Number.isFinite(numeric)) return 0;
          return value.trim().endsWith('ms') ? numeric : numeric * 1000;
        })),
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        password: bounds('#passInput'),
        pwaRegisterScripts: document.querySelectorAll('script[src="/js/pwa-register.js"]').length,
        toggle: bounds('#togglePassBtn'),
      };
    });

    assert.equal(metrics.main, 1, `${viewport.name}: one main landmark`);
    assert.equal(metrics.h1, 1, `${viewport.name}: one page heading`);
    assert.equal(metrics.heavyAssets, 0, `${viewport.name}: no heavy or external presentation assets`);
    assert.equal(metrics.pwaRegisterScripts, 1, `${viewport.name}: exactly one local PWA register script`);
    assert.ok(metrics.pageOverflow <= 1, `${viewport.name}: page must not overflow horizontally`);
    assert.ok(metrics.mainOverflow <= 1, `${viewport.name}: main must not overflow horizontally`);
    assert.ok(metrics.access.left >= -1 && metrics.access.right <= viewport.width + 1, `${viewport.name}: access panel fits viewport`);
    for (const [name, box] of Object.entries({ button: metrics.button, email: metrics.email, password: metrics.password, toggle: metrics.toggle })) {
      assert.ok(box.height >= 44, `${viewport.name}: ${name} target height is at least 44px`);
      assert.ok(box.width >= 44, `${viewport.name}: ${name} target width is at least 44px`);
    }
    assert.ok(metrics.maxCssTimeMs <= 0.02, `${viewport.name}: reduced motion caps animation and transition duration`);
    assert.deepEqual(consoleErrors, [], `${viewport.name}: no browser console errors`);
    assert.deepEqual(externalRequests, [], `${viewport.name}: no external requests`);
    await context.close();
  }

  assert.deepEqual(requestLog, [], 'rendering the login must not call authentication');
});

test('the six published evaluation buttons authenticate their exact role without seeding', async t => {
  const requestLog = [];
  const server = await createServer(requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  for (const identity of PUBLISHED_EVALUATION_IDENTITIES) {
    await page.goto(`${baseUrl}/login.html`, { waitUntil: 'networkidle' });
    await Promise.all([
      page.waitForURL(`${baseUrl}/inicio.html`),
      page.click(`[data-evaluation-email="${identity.email}"]`),
    ]);
    const stored = await page.evaluate(() => ({
      token: sessionStorage.getItem('mjunin_token'),
      user: JSON.parse(sessionStorage.getItem('mjunin_user')),
    }));
    assert.equal(stored.user.email, identity.email);
    assert.equal(stored.user.role, identity.role);
    assert.match(stored.token, /^signed-evaluation-token-/);
  }

  assert.deepEqual(requestLog.map(entry => entry.body), PUBLISHED_EVALUATION_IDENTITIES.map(identity => ({
    email: identity.email,
    password: EVALUATION_PASSWORD,
  })));
});

test('login keyboard flow, guarded errors and successful session remain accessible', async t => {
  const requestLog = [];
  const server = await createServer(requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const externalRequests = [];
  page.on('request', request => {
    if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url());
  });
  await page.goto(`${baseUrl}/login.html`, { waitUntil: 'networkidle' });

  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.className), 'skip-link');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'accessPanel');

  await page.focus('#togglePassBtn');
  const focusStyle = await page.$eval('#togglePassBtn', node => {
    const style = getComputedStyle(node);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  assert.notEqual(focusStyle.outlineStyle, 'none');
  assert.ok(Number.parseFloat(focusStyle.outlineWidth) >= 3);
  await page.keyboard.press('Enter');
  assert.equal(await page.getAttribute('#passInput', 'type'), 'text');
  assert.equal(await page.getAttribute('#togglePassBtn', 'aria-pressed'), 'true');
  assert.equal(await page.getAttribute('#togglePassBtn', 'aria-label'), 'Ocultar contraseña');
  await page.keyboard.press('Space');
  assert.equal(await page.getAttribute('#passInput', 'type'), 'password');
  assert.equal(await page.getAttribute('#togglePassBtn', 'aria-pressed'), 'false');
  assert.equal(await page.getAttribute('#togglePassBtn', 'aria-label'), 'Mostrar contraseña');

  await page.click('#btnLogin');
  assert.equal(requestLog.length, 0, 'empty fields are rejected before a request');
  assert.match(await page.textContent('#errorMsg'), /Completá el correo institucional/);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'emailInput');

  const errorCases = [
    {
      email: 'unauthorized@junin.gob.ar',
      focus: 'passInput',
      message: /No pudimos validar las credenciales/,
      status: 401,
    },
    {
      email: 'forbidden@junin.gob.ar',
      focus: 'errorMsg',
      message: /no tiene acceso institucional habilitado/i,
      status: 403,
    },
    {
      email: 'unavailable@junin.gob.ar',
      focus: 'errorMsg',
      message: /servicio de acceso no está disponible/i,
      status: 503,
    },
  ];

  for (const failure of errorCases) {
    await page.fill('#emailInput', failure.email);
    await page.fill('#passInput', TEST_PASSWORD);
    const [response] = await Promise.all([
      page.waitForResponse(candidate => candidate.url() === `${baseUrl}/api/auth/login` && candidate.status() === failure.status),
      page.click('#btnLogin'),
    ]);
    assert.equal(response.status(), failure.status);
    await page.waitForFunction(() => document.querySelector('#loginForm').getAttribute('aria-busy') === 'false');
    assert.match(await page.textContent('#errorMsg'), failure.message);
    assert.doesNotMatch(await page.textContent('#errorMsg'), /detalle interno/i);
    assert.equal(await page.evaluate(() => document.activeElement?.id), failure.focus);
    assert.equal(await page.isDisabled('#btnLogin'), false);
    assert.equal(await page.textContent('#btnLogin'), 'Ingresar al sistema');
    assert.deepEqual(await page.evaluate(() => ({ token: sessionStorage.getItem('mjunin_token'), user: sessionStorage.getItem('mjunin_user') })), {
      token: null,
      user: null,
    });
    if (failure.status === 401) {
      assert.equal(await page.inputValue('#passInput'), '');
      assert.equal(await page.getAttribute('#passInput', 'aria-invalid'), 'true');
    }
  }

  await page.fill('#emailInput', '  Success@Junin.Gob.Ar  ');
  await page.fill('#passInput', TEST_PASSWORD);
  await Promise.all([
    page.waitForURL(`${baseUrl}/inicio.html`),
    page.click('#btnLogin'),
  ]);
  assert.equal(await page.textContent('#loginSuccess'), 'Sesión iniciada');

  const stored = await page.evaluate(() => ({
    token: sessionStorage.getItem('mjunin_token'),
    user: JSON.parse(sessionStorage.getItem('mjunin_user')),
  }));
  assert.equal(stored.token, 'signed-token-for-login-e2e');
  assert.deepEqual({
    email: stored.user.email,
    id: stored.user.id,
    name: stored.user.name,
    role: stored.user.role,
    tenantId: stored.user.tenantId,
  }, {
    email: SUCCESS_EMAIL,
    id: 'qa-login-institutional',
    name: 'QA Acceso Institucional',
    role: 'INTENDENTE',
    tenantId: 'tenant-junin-e2e',
  });
  assert.equal(new Date(stored.user.loginAt).toISOString(), stored.user.loginAt);
  assert.deepEqual(stored.user.capabilities, SUCCESS_ACCESS.capabilities);
  assert.equal(stored.user.accessPolicyVersion, accessPolicy.ACCESS_POLICY_VERSION);
  assert.deepEqual(stored.user.homeProfile, SUCCESS_ACCESS.homeProfile);

  assert.equal(requestLog.length, 4);
  assert.deepEqual(requestLog.map(entry => entry.method), ['POST', 'POST', 'POST', 'POST']);
  assert.ok(requestLog.every(entry => /^application\/json\b/i.test(entry.contentType)));
  assert.deepEqual(requestLog.map(entry => entry.body), [
    { email: 'unauthorized@junin.gob.ar', password: TEST_PASSWORD },
    { email: 'forbidden@junin.gob.ar', password: TEST_PASSWORD },
    { email: 'unavailable@junin.gob.ar', password: TEST_PASSWORD },
    { email: SUCCESS_EMAIL, password: TEST_PASSWORD },
  ]);
  assert.deepEqual(externalRequests, []);
});

test('login rejects a server-supplied external default path and falls back to inicio.html', async t => {
  const requestLog = [];
  const server = await createServer(requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  t.after(async () => context.close());
  const page = await context.newPage();
  const externalRequests = [];
  page.on('request', request => {
    if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url());
  });
  await page.goto(`${baseUrl}/login.html`, { waitUntil: 'networkidle' });
  await page.fill('#emailInput', 'unsafe-path@junin.gob.ar');
  await page.fill('#passInput', TEST_PASSWORD);
  await Promise.all([
    page.waitForURL(`${baseUrl}/inicio.html`),
    page.click('#btnLogin'),
  ]);
  assert.equal(await page.textContent('#loginSuccess'), 'Sesión iniciada');
  assert.deepEqual(externalRequests, []);
});

test('login accepts only a capability-bound private return and rejects hostile return URLs', async t => {
  const requestLog = [];
  const server = await createServer(requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  t.after(async () => context.close());
  const page = await context.newPage();
  const externalRequests = [];
  page.on('request', request => {
    if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url());
  });

  await page.goto(`${baseUrl}/login.html?return=rrhh.html%23peopleDirectory`, { waitUntil: 'networkidle' });
  await page.fill('#emailInput', SUCCESS_EMAIL);
  await page.fill('#passInput', TEST_PASSWORD);
  await Promise.all([
    page.waitForURL(`${baseUrl}/rrhh.html#peopleDirectory`),
    page.click('#btnLogin'),
  ]);
  assert.equal(await page.textContent('#peopleDirectory'), 'Directorio privado');

  await page.goto(`${baseUrl}/login.html?return=https%3A%2F%2Fattacker.example%2F`, { waitUntil: 'networkidle' });
  await page.fill('#emailInput', SUCCESS_EMAIL);
  await page.fill('#passInput', TEST_PASSWORD);
  await Promise.all([
    page.waitForURL(`${baseUrl}/inicio.html`),
    page.click('#btnLogin'),
  ]);
  assert.equal(await page.textContent('#loginSuccess'), 'Sesión iniciada');
  assert.deepEqual(externalRequests, []);
});

test('private GRH login explains the handoff, rejects public profiles and returns an authorized identity to the directory', async t => {
  const requestLog = [];
  const server = await createServer(requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  t.after(async () => context.close());
  const page = await context.newPage();
  const externalRequests = [];
  page.on('request', request => {
    if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url());
  });

  const privateLogin = `${baseUrl}/login.html?access=private-grh&return=rrhh.html%23peopleDirectory`;
  await page.goto(`${baseUrl}/login.html`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('#privateGrhLoginLink').isVisible(), true);
  await Promise.all([
    page.waitForURL(privateLogin),
    page.click('#privateGrhLoginLink'),
  ]);
  assert.equal(await page.locator('#privateAccessNotice').isVisible(), true);
  assert.equal(await page.locator('#evaluationAccess').isHidden(), true);
  assert.equal(await page.locator('#privateGrhLoginLink').isHidden(), true);
  assert.equal(await page.textContent('#accessKicker'), 'Acceso privado GRH');
  assert.equal(await page.textContent('#btnLogin'), 'Ingresar al directorio GRH');

  await page.fill('#emailInput', PUBLISHED_EVALUATION_IDENTITIES[0].email);
  await page.fill('#passInput', EVALUATION_PASSWORD);
  await page.click('#btnLogin');
  await page.waitForSelector('#errorMsg:not([hidden])');
  assert.match(await page.textContent('#errorMsg'), /perfiles públicos no abren el directorio/i);
  assert.equal(page.url(), privateLogin);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('mjunin_token')), null);

  await page.fill('#emailInput', SUCCESS_EMAIL);
  await page.fill('#passInput', TEST_PASSWORD);
  await Promise.all([
    page.waitForURL(`${baseUrl}/rrhh.html#peopleDirectory`),
    page.click('#btnLogin'),
  ]);
  assert.equal(await page.textContent('#peopleDirectory'), 'Directorio privado');

  const probes = requestLog.filter(entry => entry.path === '/api/grh-directory');
  assert.deepEqual(probes.map(entry => ({ authorization: entry.authorization, limit: entry.limit, purpose: entry.purpose })), [
    { authorization: 'Bearer signed-token-for-login-e2e', limit: '1', purpose: 'DIRECTORY_BROWSE' },
  ]);
  assert.deepEqual(externalRequests, []);
});
