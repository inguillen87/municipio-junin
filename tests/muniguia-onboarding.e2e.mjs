import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';

import accessPolicy from '../shared/access-policy.cjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
});

function fakeToken(subject) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: subject,
    exp: Math.floor(Date.now() / 1000) + 900,
  })}.onboarding-e2e`;
}

function tokenSubject(request) {
  const authorization = String(request.headers.authorization || '');
  try {
    return JSON.parse(
      Buffer.from(authorization.replace(/^Bearer\s+/u, '').split('.')[1], 'base64url').toString('utf8'),
    ).sub;
  } catch {
    return null;
  }
}

function authoritativeUser(subject, role = 'CONTADOR', { includeHelp = true } = {}) {
  const tenantId = 'tenant-onboarding-e2e';
  const access = accessPolicy.getSessionAccessForUser({ role, tenantId });
  assert.ok(access);
  return {
    id: subject,
    name: `Perfil ${role}`,
    email: `${role.toLowerCase()}@internal.invalid`,
    role,
    tenantId,
    tenant: { name: 'Municipalidad de Junín', shortName: 'Junín' },
    capabilities: access.capabilities.filter(capability => includeHelp || capability !== 'navigation.help'),
    accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
    homeProfile: access.homeProfile,
  };
}

async function createServer(users, requestLog) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    requestLog.push({ method: request.method, path: url.pathname });
    if (url.pathname === '/api/auth/me') {
      const user = users.get(tokenSubject(request));
      response.writeHead(user ? 200 : 401, {
        'Cache-Control': 'no-store',
        'Content-Type': CONTENT_TYPES['.json'],
      });
      response.end(JSON.stringify(user ? { user } : { error: 'not authorized' }));
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      response.writeHead(418, {
        'Cache-Control': 'no-store',
        'Content-Type': CONTENT_TYPES['.json'],
      });
      response.end(JSON.stringify({ error: 'onboarding must not request data' }));
      return;
    }

    const relative = decodeURIComponent(url.pathname.slice(1) || 'inicio.html');
    const target = path.resolve(ROOT, relative);
    if (!target.startsWith(`${ROOT}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(target);
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': CONTENT_TYPES[path.extname(target)] || 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404, { 'Cache-Control': 'no-store' }).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function createPage(browser, baseUrl, subject, user, viewport, options = {}) {
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    viewport,
    ...(options.forcedColors ? { forcedColors: options.forcedColors } : {}),
  });
  await context.addInitScript(({ token, seededUser }) => {
    if (sessionStorage.getItem('__muni_onboarding_seeded') === 'true') return;
    sessionStorage.setItem('__muni_onboarding_seeded', 'true');
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify(seededUser));
  }, { token: fakeToken(subject), seededUser: user });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/inicio.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#workspaceViews:not([hidden])');
  return { context, page };
}

async function stopServer(server) {
  await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
}

async function returnFromStage(page, card) {
  const action = card.locator(
    '.muni-onboarding__actions .muni-onboarding__button--primary, ' +
    '.muni-onboarding__actions .muni-onboarding__link--primary',
  ).first();
  const tagName = await action.evaluate(element => element.tagName);
  if (tagName === 'A') {
    await action.evaluate(element => {
      element.addEventListener('click', event => event.preventDefault(), { once: true });
    });
  }
  await action.click();
  if (tagName === 'A') {
    await page.reload({ waitUntil: 'networkidle' });
    await card.locator('.muni-onboarding__title').waitFor();
  }
  const dialog = page.locator('.muni-guide-dialog:not([hidden])');
  if (await dialog.count()) await page.locator('.muni-guide-close').click();
}

test('onboarding runtime is session-only, sink-free and progressively mounted from Inicio', async () => {
  const [runtime, html] = await Promise.all([
    readFile(path.join(ROOT, 'js', 'muniguia-onboarding.js'), 'utf8'),
    readFile(path.join(ROOT, 'inicio.html'), 'utf8'),
  ]);
  assert.doesNotMatch(runtime, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|indexedDB|caches)\b/u);
  assert.match(runtime, /sessionStorage\.getItem/);
  assert.match(runtime, /sessionStorage\.setItem/);
  assert.match(runtime, /municontrol:muniguia-onboarding/);
  assert.doesNotMatch(runtime, /\.innerHTML\s*=|insertAdjacentHTML|document\.write|\beval\s*\(/u);
  assert.doesNotMatch(runtime, /3 minutos|Conocé tu espacio en 3/iu);
  assert.match(html, /css\/muniguia-onboarding\.css/);
  assert.match(html, /id="muniguiaOnboardingMount"[^>]*hidden/);
  assert.match(html, /js\/muniguia-onboarding\.js/);
});

test('Inicio offers explicit new, in-progress, completed, repeat and reset states without auto-opening a modal', {
  timeout: 90_000,
}, async t => {
  const subject = 'onboarding-progress-user';
  const user = authoritativeUser(subject);
  const requestLog = [];
  const server = await createServer(new Map([[subject, user]]), requestLog);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await stopServer(server);
  });

  const { context, page } = await createPage(browser, baseUrl, subject, user, { width: 1440, height: 940 });
  t.after(() => context.close());
  const card = page.locator('#muniguiaOnboardingMount');
  await card.locator('.muni-onboarding__title').waitFor();
  assert.equal(await card.locator('.muni-onboarding__title').innerText(), 'Tu recorrido inicial');
  assert.match(await card.locator('.muni-onboarding__eyebrow').innerText(), /5 etapas · 10 minutos/iu);
  assert.equal(await card.locator('.muni-onboarding__stage').count(), 5);
  assert.equal(await card.locator('.muni-onboarding__state').innerText(), 'Nuevo');
  assert.equal(await page.locator('.muni-guide-dialog:not([hidden])').count(), 0, 'the guide cannot auto-open');
  assert.equal(
    (await page.evaluate(() => Object.keys(sessionStorage))).some(
      key => key.startsWith('municontrol:muniguia-onboarding:'),
    ),
    false,
  );

  await card.getByRole('button', { name: 'Conocer mi espacio' }).click();
  assert.equal(await card.locator('.muni-onboarding__state').innerText(), 'En curso');
  assert.equal(await card.locator('.muni-onboarding__progress-label').innerText(), '0 de 5 pasos listos');
  const storageAfterStart = await page.evaluate(() => Object.entries(sessionStorage)
    .filter(([key]) => key.startsWith('municontrol:muniguia-onboarding:'))
    .map(([key, value]) => ({ key, value })));
  assert.equal(storageAfterStart.length, 1);
  assert.match(storageAfterStart[0].key, /:CONTADOR:financial-control$/u);
  assert.doesNotMatch(
    storageAfterStart[0].key + storageAfterStart[0].value,
    /internal\.invalid|tenant-onboarding|onboarding-progress-user/iu,
  );

  for (let stageIndex = 0; stageIndex < 5; stageIndex += 1) {
    let done = card.getByRole('button', { name: 'Marcar como listo' });
    assert.equal(await done.isDisabled(), true, `stage ${stageIndex + 1} cannot complete from a mere render`);
    await returnFromStage(page, card);
    done = card.getByRole('button', { name: 'Marcar como listo' });
    assert.equal(await done.isDisabled(), false, `stage ${stageIndex + 1} requires an explicit launch`);
    await done.click();
    assert.equal(
      await card.locator('.muni-onboarding__progress-label').innerText(),
      `${stageIndex + 1} de 5 pasos listos`,
    );
  }

  assert.equal(await card.locator('.muni-onboarding__state').innerText(), 'Completado');
  await card.getByRole('button', { name: 'Repetir recorrido' }).click();
  assert.equal(await card.locator('.muni-onboarding__state').innerText(), 'En curso');
  assert.equal(await card.locator('.muni-onboarding__progress-label').innerText(), '0 de 5 pasos listos');
  await card.getByRole('button', { name: 'Reiniciar recorrido' }).click();
  assert.equal(await card.locator('.muni-onboarding__state').innerText(), 'Nuevo');
  assert.equal(await card.getByRole('button', { name: 'Conocer mi espacio' }).count(), 1);
  assert.deepEqual(
    await page.evaluate(() => Object.keys(sessionStorage)
      .filter(key => key.startsWith('municontrol:muniguia-onboarding:'))),
    [],
    'reset removes this journey progress instead of persisting a synthetic new state',
  );
  assert.equal(requestLog.some(entry => entry.path.startsWith('/api/onboarding')), false);
});

test('onboarding card is responsive, keyboard-operable and exposed in forced colors at 1440, 390 and 320', {
  timeout: 60_000,
}, async t => {
  const subject = 'onboarding-responsive-user';
  const user = authoritativeUser(subject, 'TENANT_USER');
  const server = await createServer(new Map([[subject, user]]), []);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await stopServer(server);
  });

  for (const viewport of [
    { width: 1440, height: 940 },
    { width: 390, height: 844 },
    { width: 320, height: 760 },
  ]) {
    const { context, page } = await createPage(browser, baseUrl, subject, user, viewport, {
      forcedColors: viewport.width === 320 ? 'active' : 'none',
    });
    const card = page.locator('#muniguiaOnboardingMount');
    await card.locator('.muni-onboarding__title').waitFor();
    assert.match(await card.locator('.muni-onboarding__eyebrow').innerText(), /3 etapas · 6 minutos/iu);
    const audit = await page.evaluate(() => {
      const root = document.querySelector('#muniguiaOnboardingMount');
      const title = root.querySelector('.muni-onboarding__title');
      const actionRects = [...root.querySelectorAll('button, a[href]')].map(element => {
        const rect = element.getBoundingClientRect();
        return { height: rect.height, width: rect.width, left: rect.left, right: rect.right };
      });
      return {
        actionRects,
        forcedColors: matchMedia('(forced-colors: active)').matches,
        labelledBy: root.getAttribute('aria-labelledby'),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        progressLabel: root.querySelector('progress').getAttribute('aria-label'),
        titleId: title.id,
      };
    });
    assert.ok(audit.overflow <= 1, `${viewport.width}px overflowed by ${audit.overflow}px`);
    assert.equal(audit.labelledBy, audit.titleId);
    assert.equal(audit.progressLabel, 'Avance del recorrido');
    assert.ok(audit.actionRects.every(rect => rect.height >= 44 && rect.width >= 44));
    assert.ok(audit.actionRects.every(rect => rect.left >= 0 && rect.right <= viewport.width + 1));
    assert.equal(audit.forcedColors, viewport.width === 320);

    const start = card.getByRole('button', { name: 'Conocer mi espacio' });
    await start.focus();
    await page.keyboard.press('Enter');
    assert.equal(await card.locator('.muni-onboarding__state').innerText(), 'En curso');
    await context.close();
  }
});

test('missing navigation.help keeps onboarding absent and avoids loading its catalog', { timeout: 30_000 }, async t => {
  const subject = 'onboarding-no-help';
  const user = authoritativeUser(subject, 'CONTADOR', { includeHelp: false });
  const requests = [];
  const server = await createServer(new Map([[subject, user]]), requests);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await stopServer(server);
  });
  const { context, page } = await createPage(browser, baseUrl, subject, user, { width: 390, height: 844 });
  t.after(() => context.close());
  assert.equal(await page.locator('#muniguiaOnboardingMount').isHidden(), true);
  assert.equal(requests.some(entry => entry.path === '/js/muniguia-onboarding-catalog.js'), false);
  assert.deepEqual(
    await page.evaluate(() => Object.keys(sessionStorage)
      .filter(key => key.startsWith('municontrol:muniguia-onboarding:'))),
    [],
  );
});
