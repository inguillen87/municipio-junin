import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import accessPolicy from '../shared/access-policy.cjs';
import {
  MUNIGUIA_ASSISTANT_QUESTIONS,
  MUNIGUIA_CATALOG,
} from '../js/contextual-help-catalog.js';
import { resolveMuniGuiaOnboarding } from '../js/muniguia-onboarding-catalog.js';

const { ACCESS_POLICY_VERSION, getSessionAccessForUser } = accessPolicy;
const root = path.resolve(import.meta.dirname, '..');
const roles = ['SUPER_ADMIN', 'INTENDENTE', 'TENANT_ADMIN', 'TENANT_USER', 'CONTADOR', 'INSPECTOR', 'DEMO'];
const viewports = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 844 },
];
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

function fakeToken(role, options = {}) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'learning-center-qa',
    role,
    tenantId: 'tenant-junin-learning',
    dropHelp: options.dropHelp === true,
    exp: Math.floor(Date.now() / 1000) + 600,
  })}.qa`;
}

function tokenPayload(request) {
  try {
    const authorization = request.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

async function createServer() {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/api/auth/me') {
      const payload = tokenPayload(request);
      const role = roles.includes(payload?.role) ? payload.role : null;
      const access = role ? getSessionAccessForUser({ role, tenantId: 'tenant-junin-learning' }) : null;
      if (!access) {
        response.writeHead(401, { 'Content-Type': contentTypes['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: 'invalid-session' }));
        return;
      }
      const capabilities = payload.dropHelp
        ? access.capabilities.filter(capability => capability !== 'navigation.help')
        : access.capabilities;
      response.writeHead(200, { 'Content-Type': contentTypes['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({
        user: {
          id: 'learning-center-private-id',
          name: 'Persona QA Privada',
          email: 'persona.qa@example.invalid',
          role,
          tenantId: 'tenant-junin-learning',
          tenant: { name: 'Municipio QA Privado', shortName: 'Privado' },
          capabilities,
          accessPolicyVersion: ACCESS_POLICY_VERSION,
          homeProfile: access.homeProfile,
        },
      }));
      return;
    }

    const relative = url.pathname === '/manuales'
      ? 'manuales.html'
      : (url.pathname.slice(1) || 'manuales.html');
    const target = path.resolve(root, decodeURIComponent(relative));
    if (!target.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(target);
      response.writeHead(200, {
        'Content-Type': contentTypes[path.extname(target)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function newPage(browser, role, viewport, options = {}) {
  const context = await browser.newContext({
    viewport,
    ...(options.forcedColors ? { forcedColors: options.forcedColors } : {}),
    ...(options.reducedMotion ? { reducedMotion: options.reducedMotion } : {}),
  });
  await context.addInitScript(({ token, seededRole }) => {
    sessionStorage.setItem('mjunin_token', token);
    sessionStorage.setItem('mjunin_user', JSON.stringify({
      id: 'stale-browser-id',
      name: 'Nombre local no autoritativo',
      role: seededRole,
      tenantId: 'stale-browser-tenant',
    }));
    localStorage.removeItem('govtech_theme');
  }, { token: fakeToken(role, options), seededRole: role });
  const page = await context.newPage();
  return { context, page };
}

async function openLearningCenter(page, baseUrl) {
  await page.goto(`${baseUrl}/manuales.html`, { waitUntil: 'domcontentloaded' });
  const authenticated = await page.evaluate(() => window.MuniAuthReady);
  try {
    await page.waitForFunction(() => {
      const root = document.querySelector('#learningCenter');
      return root?.dataset.state === 'ready' || root?.dataset.state === 'unavailable';
    }, null, { timeout: 5000 });
  } catch {
    const earlyDiagnostic = await page.evaluate(() => ({
      href: window.location.href,
      hasRoot: Boolean(document.querySelector('#learningCenter')),
      state: document.querySelector('#learningCenter')?.dataset.state || null,
      authValidated: window.__muniAuthValidated ?? null,
      hasAccess: Boolean(window.MuniAccess?.getValidatedSession?.()),
      title: document.title,
      bodyPreview: document.body?.textContent?.trim().slice(0, 160) || '',
      htmlLength: document.documentElement?.outerHTML?.length || 0,
    }));
    assert.fail(`learning center did not settle: ${JSON.stringify(earlyDiagnostic)}`);
  }
  const state = await page.locator('#learningCenter').getAttribute('data-state');
  if (state !== 'ready') {
    const diagnostic = await page.evaluate(async authResult => {
      const session = window.MuniAccess?.getValidatedSession?.() || null;
      const onboarding = await import('/js/muniguia-onboarding-catalog.js');
      const contextual = await import('/js/contextual-help-catalog.js');
      const input = session ? {
        role: session.user.role,
        variant: session.homeProfile.variant,
        capabilities: session.capabilities,
        policyVersion: session.user.accessPolicyVersion,
      } : null;
      return {
        authenticated: authResult,
        hasSession: Boolean(session),
        role: input?.role || null,
        journey: input ? onboarding.resolveMuniGuiaOnboarding(input) : null,
        context: input ? contextual.resolveMuniGuiaContext({
          ...input,
          pathname: window.location.pathname.toLowerCase(),
        }) : null,
      };
    }, authenticated);
    assert.fail(`learning center failed closed: ${JSON.stringify(diagnostic)}`);
  }
  await page.locator('#tareas[data-municipal-task-mounted="true"] .municipal-task-card').first().waitFor();
}

function expectedJourney(role) {
  const access = getSessionAccessForUser({ role, tenantId: 'tenant-junin-learning' });
  return resolveMuniGuiaOnboarding({
    role,
    variant: access.homeProfile.variant,
    capabilities: access.capabilities,
    policyVersion: ACCESS_POLICY_VERSION,
  });
}

test('learning center owns one learner-first shell and keeps its runtime local and fail-closed', () => {
  const html = readFileSync(path.join(root, 'manuales.html'), 'utf8');
  const runtime = readFileSync(path.join(root, 'js', 'learning-center.js'), 'utf8');
  const css = readFileSync(path.join(root, 'css', 'learning-center.css'), 'utf8');
  for (const anchor of ['bienvenida', 'primer-dia', 'tareas', 'ayuda-contextual', 'reglas-esenciales', 'referencia-operativa']) {
    assert.equal((html.match(new RegExp(`id=["']${anchor}["']`, 'g')) || []).length, 1, `${anchor} must be unique`);
  }
  assert.equal((html.match(/<h1\b/g) || []).length, 1, 'the page must expose one global H1');
  assert.equal((html.match(/data-municipal-task-finder(?:\s|=)/g) || []).length, 1, 'the existing finder remains the only task source');
  assert.match(html, /<details class="learning-advanced" id="referencia-operativa">[\s\S]*Documentación avanzada/);
  assert.match(html, /<h2 class="technical-document-title">Cómo usar MuniControl con evidencia municipal<\/h2>/);
  assert.match(runtime, /MuniAccess\.getValidatedSession\(\)/);
  assert.match(runtime, /municontrol:muniguia-onboarding/);
  assert.doesNotMatch(runtime, /\bfetch\s*\(/, 'progress and learning runtime must not call an API');
  assert.doesNotMatch(runtime, /localStorage/, 'progress must stay in sessionStorage');
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /min-height: 44px/);
});

test('all seven roles render only authoritative learning at 1440, 390 and 320 px', async t => {
  const server = await createServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  for (const role of roles) {
    const access = getSessionAccessForUser({ role, tenantId: 'tenant-junin-learning' });
    const roleCatalog = MUNIGUIA_CATALOG.roles[role];
    for (const viewport of viewports) {
      const { context, page } = await newPage(browser, role, viewport);
      const consoleErrors = [];
      const externalRequests = [];
      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('request', request => {
        const url = new URL(request.url());
        if (url.origin !== baseUrl) externalRequests.push(request.url());
      });
      await openLearningCenter(page, baseUrl);

      const evidence = await page.evaluate(allowedCapabilities => {
        const visible = element => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const firstTask = document.querySelector('#tareas .municipal-task-card');
        const assistant = document.querySelector('[data-learning-assistant]');
        const controls = Array.from(document.querySelectorAll('#learningCenter button, #learningCenter a[href], #learningCenter input'))
          .filter(visible)
          .map(element => ({
            tag: element.tagName,
            text: element.textContent.trim(),
            width: element.getBoundingClientRect().width,
            height: element.getBoundingClientRect().height,
          }));
        return {
          role: document.querySelector('[data-learning-role]')?.textContent.trim(),
          state: document.querySelector('#learningCenter')?.dataset.state,
          h1Count: document.querySelectorAll('h1').length,
          finderCount: document.querySelectorAll('[data-municipal-task-finder]').length,
          taskTop: firstTask?.getBoundingClientRect().top,
          viewportHeight: innerHeight,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          advancedOpen: document.querySelector('#referencia-operativa')?.open,
          guideVisible: visible(document.querySelector('[data-learning-guide]')),
          assistantVisible: assistant ? visible(assistant) : false,
          assistantHref: assistant?.getAttribute('href') || null,
          unauthorizedActions: Array.from(document.querySelectorAll('[data-capability]'))
            .map(element => element.dataset.capability)
            .filter(capability => !allowedCapabilities.includes(capability)),
          controls,
          progressKeys: Object.keys(sessionStorage).filter(key => key.startsWith('municontrol:muniguia-onboarding:')),
        };
      }, access.capabilities);

      assert.equal(evidence.state, 'ready', `${role} ${viewport.width}px state`);
      assert.equal(evidence.role, roleCatalog.label, `${role} ${viewport.width}px role label`);
      assert.equal(evidence.h1Count, 1, `${role} ${viewport.width}px H1 count`);
      assert.equal(evidence.finderCount, 1, `${role} ${viewport.width}px finder count`);
      assert.ok(evidence.taskTop >= 0 && evidence.taskTop < evidence.viewportHeight,
        `${role} ${viewport.width}px first task top=${evidence.taskTop} viewport=${evidence.viewportHeight}`);
      assert.ok(evidence.overflow <= 1, `${role} ${viewport.width}px overflow=${evidence.overflow}`);
      assert.equal(evidence.advancedOpen, false, `${role} ${viewport.width}px advanced docs default closed`);
      assert.equal(evidence.guideVisible, true, `${role} ${viewport.width}px MuniGuía`);
      assert.equal(evidence.assistantVisible, access.capabilities.includes('navigation.ai-assistant'),
        `${role} ${viewport.width}px assistant capability`);
      if (evidence.assistantVisible) {
        assert.equal(
          evidence.assistantHref,
          `ia.html?question=${encodeURIComponent(MUNIGUIA_ASSISTANT_QUESTIONS.manuals)}`,
          `${role} ${viewport.width}px assistant question`,
        );
      }
      assert.deepEqual(evidence.unauthorizedActions, [], `${role} ${viewport.width}px unauthorized actions`);
      assert.deepEqual(evidence.progressKeys, [], `${role} ${viewport.width}px no progress before consent`);
      for (const control of evidence.controls) {
        assert.ok(control.height >= 43.5, `${role} ${viewport.width}px ${control.tag} "${control.text}" height=${control.height}`);
      }
      assert.deepEqual(externalRequests, [], `${role} ${viewport.width}px external requests`);
      assert.deepEqual(consoleErrors, [], `${role} ${viewport.width}px console errors`);
      await context.close();
    }
  }
});

test('role journey shares MuniGuía session progress without identifiers, PII or API writes', async t => {
  const server = await createServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const role = 'INTENDENTE';
  const projection = expectedJourney(role);
  const { context, page } = await newPage(browser, role, { width: 390, height: 844 });
  let apiRequests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests += 1;
  });
  await openLearningCenter(page, baseUrl);
  assert.equal(apiRequests, 1, 'loading uses only the authoritative session request');

  const labels = await page.locator('.learning-step__title').allTextContents();
  assert.deepEqual(labels, projection.journey.stages.map(stage => stage.label));
  await page.locator('[data-learning-begin]').click();
  const requestsBeforeProgress = apiRequests;
  const firstLaunch = page.locator('[data-learning-launch]');
  assert.equal(await firstLaunch.getAttribute('href'), projection.journey.stages[0].href);
  await firstLaunch.evaluate(element => {
    element.addEventListener('click', event => event.preventDefault(), { once: true });
  });
  await firstLaunch.click();
  assert.equal(apiRequests, requestsBeforeProgress, 'launching a stage performs no API write');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.MuniAuthReady);
  await page.locator('#learningCenter[data-state="ready"]').waitFor();
  const requestsAfterReturn = apiRequests;
  assert.equal(await page.locator('[data-learning-complete]').isEnabled(), true);
  await page.locator('[data-learning-complete]').click();
  assert.equal(apiRequests, requestsAfterReturn, 'journey progress performs no API write');

  const stored = await page.evaluate(() => {
    const keys = Object.keys(sessionStorage).filter(key => key.startsWith('municontrol:muniguia-onboarding:'));
    return {
      keys,
      values: keys.map(key => sessionStorage.getItem(key)),
      localKeys: Object.keys(localStorage).filter(key => key.startsWith('municontrol:muniguia-onboarding:')),
    };
  });
  assert.equal(stored.keys.length, 1);
  assert.match(stored.keys[0], /^municontrol:muniguia-onboarding:muniguia-onboarding-v1:/);
  assert.deepEqual(stored.localKeys, []);
  const serialized = `${stored.keys[0]} ${stored.values[0]}`.toLowerCase();
  for (const forbidden of [
    'learning-center-private-id',
    'persona qa privada',
    'persona.qa@example.invalid',
    'tenant-junin-learning',
    'municipio qa privado',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `progress must omit ${forbidden}`);
  }
  const value = JSON.parse(stored.values[0]);
  assert.deepEqual(Object.keys(value).sort(), [
    'completedStageIds', 'journeyId', 'launchedStageId', 'schemaVersion', 'status',
  ].sort());
  assert.equal(value.status, 'in_progress');
  assert.deepEqual(value.completedStageIds, [projection.journey.stages[0].id]);
  assert.equal(value.launchedStageId, null);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.MuniAuthReady);
  await page.locator('#learningCenter[data-state="ready"]').waitFor();
  assert.match(await page.locator('[data-learning-progress-summary]').innerText(), /1 de 5 pasos/);
  await page.locator('[data-learning-reset]').click();
  assert.deepEqual(await page.evaluate(() => Object.keys(sessionStorage)
    .filter(key => key.startsWith('municontrol:muniguia-onboarding:'))), []);
  await context.close();

  const fresh = await newPage(browser, role, { width: 390, height: 844 });
  await openLearningCenter(fresh.page, baseUrl);
  assert.deepEqual(await fresh.page.evaluate(() => Object.keys(sessionStorage)
    .filter(key => key.startsWith('municontrol:muniguia-onboarding:'))), []);
  await fresh.context.close();
});

test('search remains role-scoped, advanced routing opens on demand, and missing help fails closed', async t => {
  const server = await createServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const executive = await newPage(browser, 'INTENDENTE', { width: 390, height: 844 });
  await openLearningCenter(executive.page, baseUrl);
  await executive.page.locator('#tareasSearch').fill('comparar gestiones');
  await executive.page.locator('#tareas[data-result-count="1"]').waitFor();
  assert.match(await executive.page.locator('#tareasResults').innerText(), /gestiones/i);
  assert.equal(await executive.page.locator('#referencia-operativa').getAttribute('open'), null);
  await executive.page.locator('a[href="#referencia-operativa"]').click();
  assert.equal(await executive.page.locator('#referencia-operativa').getAttribute('open'), '');
  await executive.page.locator('#referencia-operativa > summary').click();
  assert.equal(await executive.page.locator('#referencia-operativa').getAttribute('open'), null);
  await executive.page.locator('#tareasSearch').fill('revisar cierre');
  const guideLink = executive.page.locator('#tareasResults a[href^="/manuales.html#"]').first();
  await guideLink.click();
  assert.equal(await executive.page.locator('#referencia-operativa').getAttribute('open'), '');
  assert.equal(await executive.page.locator('h1').count(), 1);
  assert.equal(await executive.page.locator('.technical-document-title').count(), 1);
  await executive.context.close();

  const limited = await newPage(browser, 'TENANT_USER', { width: 320, height: 844 });
  await openLearningCenter(limited.page, baseUrl);
  await limited.page.locator('#tareasSearch').fill('comparar gestiones');
  await limited.page.locator('#tareas[data-result-count="0"]').waitFor();
  assert.match(await limited.page.locator('.municipal-task-finder__empty').innerText(), /No encontramos/);
  assert.equal(await limited.page.locator('[data-learning-assistant]:visible').count(), 0);
  await limited.context.close();

  const noHelp = await newPage(browser, 'INTENDENTE', { width: 390, height: 844 }, { dropHelp: true });
  await noHelp.page.goto(`${baseUrl}/manuales.html`, { waitUntil: 'domcontentloaded' });
  await noHelp.page.evaluate(() => window.MuniAuthReady);
  await noHelp.page.locator('#learningCenter[data-state="unavailable"]').waitFor();
  assert.equal(await noHelp.page.locator('[data-learning-guide]:visible').count(), 0);
  assert.equal(await noHelp.page.locator('[data-learning-assistant]:visible').count(), 0);
  assert.equal(await noHelp.page.locator('#primer-dia:visible').count(), 0);
  assert.equal(await noHelp.page.locator('#ayuda-contextual:visible').count(), 0);
  assert.doesNotMatch(await noHelp.page.locator('[data-learning-status]').innerText(), /Intendencia|Privad/i);
  await noHelp.context.close();
});

test('320 px forced colors and 390 px reduced motion preserve access and 44 px targets', async t => {
  const server = await createServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const forced = await newPage(browser, 'TENANT_ADMIN', { width: 320, height: 844 }, { forcedColors: 'active' });
  await openLearningCenter(forced.page, baseUrl);
  const forcedEvidence = await forced.page.evaluate(() => {
    const action = document.querySelector('[data-learning-guide]');
    action.focus();
    const rect = action.getBoundingClientRect();
    const style = getComputedStyle(action);
    const summaryRect = document.querySelector('#referencia-operativa summary').getBoundingClientRect();
    return {
      actionHeight: rect.height,
      outlineStyle: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth),
      summaryHeight: summaryRect.height,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  assert.ok(forcedEvidence.actionHeight >= 43.5);
  assert.ok(forcedEvidence.summaryHeight >= 43.5);
  assert.notEqual(forcedEvidence.outlineStyle, 'none');
  assert.ok(forcedEvidence.outlineWidth >= 2);
  assert.ok(forcedEvidence.overflow <= 1);
  await forced.context.close();

  const reduced = await newPage(browser, 'TENANT_ADMIN', { width: 390, height: 844 }, { reducedMotion: 'reduce' });
  await openLearningCenter(reduced.page, baseUrl);
  const motion = await reduced.page.locator('[data-learning-guide]').evaluate(element => {
    const style = getComputedStyle(element);
    return {
      animationDuration: style.animationDuration,
      transitionDuration: style.transitionDuration,
    };
  });
  const durations = `${motion.animationDuration},${motion.transitionDuration}`
    .split(',')
    .map(value => Number.parseFloat(value) || 0);
  assert.ok(durations.every(value => value <= 0.001), JSON.stringify(motion));
  await reduced.context.close();
});
