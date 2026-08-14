import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import accessPolicy from '../shared/access-policy.cjs';
import { resolveMuniGuiaContext } from '../js/contextual-help-catalog.js';
import { resolveMuniGuiaOnboarding } from '../js/muniguia-onboarding-catalog.js';
import { resolveMunicipalTaskCatalog } from '../js/municipal-task-catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function source(relativePath) {
  return readFile(path.join(ROOT, relativePath), 'utf8');
}

function sessionInput(role) {
  const session = accessPolicy.getSessionAccessForUser({ role, tenantId: 'tenant-junin' });
  assert.ok(session, role);
  return {
    role,
    variant: session.homeProfile.variant,
    policyVersion: accessPolicy.ACCESS_POLICY_VERSION,
    capabilities: session.capabilities,
  };
}

test('learning center is the first, simple layer while advanced operational truth remains intact', async () => {
  const html = await source('manuales.html');
  const anchors = [
    'bienvenida', 'tareas', 'primer-dia', 'ayuda-contextual',
    'reglas-esenciales', 'referencia-operativa',
  ];
  const positions = anchors.map((id) => html.indexOf(`id="${id}"`));
  assert.equal(positions.every((position) => position >= 0), true, positions);
  assert.deepEqual([...positions].sort((left, right) => left - right), positions);
  assert.equal((html.match(/<h1\b/giu) ?? []).length, 1);
  assert.match(html, /<details[^>]+id="referencia-operativa"/iu);
  assert.doesNotMatch(html, /<details[^>]+id="referencia-operativa"[^>]+\bopen\b/iu);
  for (const preservedAnchor of ['alcance', 'roles', 'fuente', 'gestiones', 'seguridad', 'produccion']) {
    assert.match(html, new RegExp(`id=["']${preservedAnchor}["']`, 'u'), preservedAnchor);
  }
  assert.match(html, /css\/learning-center\.css/iu);
  assert.match(html, /js\/learning-center\.js/iu);
});

test('learning runtime composes authoritative local contracts without a new data or identity boundary', async () => {
  const runtime = await source('js/learning-center.js');
  assert.match(runtime, /municipal-learning-center-v1/u);
  assert.match(runtime, /MuniAuthReady/u);
  assert.match(runtime, /MuniAccess/u);
  assert.match(runtime, /getValidatedSession/u);
  assert.match(runtime, /resolveMuniGuiaOnboarding/u);
  assert.match(runtime, /MUNIGUIA_ASSISTANT_QUESTIONS/u);
  assert.match(runtime, /municontrol:muniguia-onboarding/u);
  assert.match(runtime, /navigation\.help/u);
  assert.match(runtime, /session\.read/u);
  assert.match(runtime, /navigation\.workspace/u);
  assert.doesNotMatch(runtime, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|indexedDB|caches|localStorage)\b/u);
  assert.doesNotMatch(runtime, /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval)\b/u);
  assert.doesNotMatch(runtime, /(?:email|tenantId|userId|documentNumber|dni|cuil)\s*[:=]/iu);
  assert.match(runtime, /document\.createElement/u);
  assert.match(runtime, /\.textContent\s*=/u);
});

test('all seven roles receive only their governed journey, tasks and contextual assistant boundary', () => {
  for (const role of Object.values(accessPolicy.ROLES)) {
    const input = sessionInput(role);
    const onboarding = resolveMuniGuiaOnboarding(input);
    const tasks = resolveMunicipalTaskCatalog(input);
    const help = resolveMuniGuiaContext({ ...input, pathname: '/manuales' });
    assert.ok(onboarding, role);
    assert.ok(tasks, role);
    assert.ok(help, role);
    const expectedStageCount = ['SUPER_ADMIN', 'INTENDENTE', 'TENANT_ADMIN', 'CONTADOR'].includes(role)
      ? 5 : 3;
    assert.equal(onboarding.journey.stages.length, expectedStageCount, role);
    assert.equal(tasks.tasks.every((task) => input.capabilities.includes(task.capability)), true, role);
    assert.equal(Boolean(help.assistant), input.capabilities.includes('navigation.ai-assistant'), role);
    if (help.assistant) {
      assert.equal(help.assistant.question, '¿Cómo empiezo a usar MuniControl según mi rol?');
      assert.equal(new URL(help.assistant.href, 'https://municipio.test').pathname, '/ia.html');
    }
  }
});

test('learning styles preserve responsive, forced-color and reduced-motion contracts', async () => {
  const css = await source('css/learning-center.css');
  assert.match(css, /@media\s*\([^)]*max-width:\s*(?:3[2-9]\d|4[0-2]0)px/iu);
  assert.match(css, /@media\s*\(forced-colors:\s*active\)/iu);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/iu);
  assert.match(css, /min-height:\s*(?:44px|2\.75rem)/iu);
});
