import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import accessPolicy from '../shared/access-policy.cjs';
import { MUNIGUIA_CATALOG, resolveMuniGuiaContext } from '../js/contextual-help-catalog.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const ROLES = Object.values(accessPolicy.ROLES);

function sessionInput(role, pathname, tenantId = 'tenant-junin-guide') {
  const access = accessPolicy.getSessionAccessForUser({ role, tenantId });
  return {
    role,
    capabilities: [...access.capabilities],
    variant: access.homeProfile.variant,
    policyVersion: accessPolicy.ACCESS_POLICY_VERSION,
    pathname,
  };
}

function idPattern(id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`id=["']${escaped}["']`);
}

test('MuniGuía catalog is exact, frozen and aligned with access policy and real anchors', async () => {
  assert.deepEqual(Object.keys(MUNIGUIA_CATALOG).sort(), [
    'accessPolicyVersion', 'contract', 'mountCapability', 'pages', 'roles',
  ]);
  assert.equal(MUNIGUIA_CATALOG.contract, 'muniguia-contextual-v1');
  assert.equal(MUNIGUIA_CATALOG.accessPolicyVersion, accessPolicy.ACCESS_POLICY_VERSION);
  assert.equal(MUNIGUIA_CATALOG.mountCapability, accessPolicy.CAPABILITIES.NAV_HELP);
  assert.deepEqual(Object.keys(MUNIGUIA_CATALOG.roles).sort(), [...ROLES].sort());
  assert.equal(Object.keys(MUNIGUIA_CATALOG.pages).length, 12);
  assert.equal(Object.isFrozen(MUNIGUIA_CATALOG), true);

  const manual = await readFile(path.join(ROOT, 'manuales.html'), 'utf8');
  const aliases = [];
  for (const [role, definition] of Object.entries(MUNIGUIA_CATALOG.roles)) {
    assert.deepEqual(Object.keys(definition).sort(), ['focusCapabilities', 'intent', 'label', 'variant']);
    assert.equal(definition.variant, accessPolicy.ROLE_HOME_PROFILE[role].variant);
    assert.ok(definition.intent.length >= 50);
    for (const capability of definition.focusCapabilities) {
      assert.equal(accessPolicy.hasCapability(role, capability), true, `${role}:${capability}`);
    }
    assert.equal(Object.isFrozen(definition), true);
  }

  for (const [pageId, page] of Object.entries(MUNIGUIA_CATALOG.pages)) {
    assert.deepEqual(Object.keys(page).sort(), [
      'aliases', 'href', 'label', 'manualAnchor', 'objective', 'requiredCapability', 'steps',
    ]);
    assert.equal(accessPolicy.isKnownCapability(page.requiredCapability), true, `${pageId}:capability`);
    assert.match(page.href, /^[a-z0-9-]+\.html$/);
    assert.deepEqual(page.aliases, [`/${page.href.replace(/\.html$/, '')}`, `/${page.href}`]);
    aliases.push(...page.aliases);
    assert.match(manual, idPattern(page.manualAnchor), `${pageId}:manual anchor`);
    assert.equal(page.steps.length, 3, `${pageId}:exactly three steps`);
    const pageSource = await readFile(path.join(ROOT, page.href), 'utf8');
    const stepIds = new Set();
    for (const step of page.steps) {
      assert.deepEqual(Object.keys(step).sort(), ['copy', 'id', 'selector', 'title']);
      assert.match(step.id, /^[a-z0-9-]+$/);
      assert.match(step.selector, /^#[A-Za-z][A-Za-z0-9_-]*$/);
      assert.equal(stepIds.has(step.id), false, `${pageId}:duplicate step id`);
      stepIds.add(step.id);
      assert.match(pageSource, idPattern(step.selector.slice(1)), `${pageId}:${step.selector}`);
      assert.ok(step.copy.length >= 60, `${pageId}:${step.id}:substantive copy`);
    }
    assert.equal(Object.isFrozen(page), true);
    assert.equal(Object.isFrozen(page.steps), true);
  }
  assert.equal(new Set(aliases).size, aliases.length, 'pathname aliases must be unique');

  const navSource = await readFile(path.join(ROOT, 'js/nav.js'), 'utf8');
  const allowlistBlock = navSource.match(/var MUNIGUIA_PRIVATE_PATHS = \[([\s\S]*?)\];/);
  assert.ok(allowlistBlock, 'nav must expose one literal MuniGuía pathname allowlist');
  const navAliases = [...allowlistBlock[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual([...navAliases].sort(), [...aliases].sort(), 'nav loader and catalog pathnames must stay exact');
});

test('resolver uses effective capabilities and fails closed for role, variant, policy and pathname drift', () => {
  for (const role of ROLES) {
    const resolved = resolveMuniGuiaContext(sessionInput(role, '/inicio'));
    assert.ok(resolved, `${role}:workspace guide`);
    assert.equal(resolved.role.id, role);
    assert.equal(resolved.page.id, 'workspace');
    assert.equal(resolved.page.steps.length, 3);
    assert.equal(Object.isFrozen(resolved), true);
  }

  for (const page of Object.values(MUNIGUIA_CATALOG.pages)) {
    for (const alias of page.aliases) {
      for (const role of ROLES) {
        const input = sessionInput(role, alias);
        const allowed = input.capabilities.includes(page.requiredCapability);
        assert.equal(Boolean(resolveMuniGuiaContext(input)), allowed, `${role}:${alias}`);
      }
    }
  }

  const valid = sessionInput('INTENDENTE', '/dashboard');
  const mutations = [
    { ...valid, role: 'UNKNOWN' },
    { ...valid, variant: 'controlled-preview' },
    { ...valid, policyVersion: '2026-08-09.0' },
    { ...valid, pathname: '/foo/dashboard.html' },
    { ...valid, pathname: '/dashboard/' },
    { ...valid, pathname: '/DASHBOARD' },
    { ...valid, pathname: '/%64ashboard' },
    { ...valid, pathname: '/roles' },
    { ...valid, capabilities: valid.capabilities.filter((value) => value !== 'navigation.help') },
    { ...valid, capabilities: [...valid.capabilities, valid.capabilities[0]] },
    { ...valid, capabilities: [...valid.capabilities, 'navigation.unknown'] },
    { ...valid, unexpected: true },
  ];
  for (const mutation of mutations) assert.equal(resolveMuniGuiaContext(mutation), null);

  const tenantless = sessionInput('SUPER_ADMIN', '/inicio', null);
  assert.deepEqual(tenantless.capabilities, ['session.read', 'navigation.workspace', 'navigation.help']);
  const tenantlessGuide = resolveMuniGuiaContext(tenantless);
  assert.ok(tenantlessGuide);
  assert.equal(tenantlessGuide.related, null);
  assert.equal(resolveMuniGuiaContext({ ...tenantless, pathname: '/control' }), null);
});

test('related actions and runtime remain capability-bound, local, non-persistent and sink-free', async () => {
  for (const role of ROLES) {
    const input = sessionInput(role, '/inicio');
    const resolved = resolveMuniGuiaContext(input);
    if (!resolved.related) continue;
    assert.equal(input.capabilities.includes(resolved.related.capability), true);
    assert.match(resolved.related.href, /^[a-z0-9-]+\.html$/);
  }

  const runtime = await readFile(path.join(ROOT, 'js/contextual-help.js'), 'utf8');
  assert.doesNotMatch(runtime, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|caches)\b/);
  assert.doesNotMatch(runtime, /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval)\b/);
  assert.match(runtime, /document\.createElement/);
  assert.match(runtime, /\.textContent\s*=/);
  assert.match(runtime, /navigation\.help/);
  assert.match(runtime, /aria-modal/);
  assert.match(runtime, /prefers-reduced-motion/);

  const catalog = await readFile(path.join(ROOT, 'js/contextual-help-catalog.js'), 'utf8');
  assert.doesNotMatch(catalog, /https?:\/\//i);
  assert.doesNotMatch(catalog, /(?:@|\bDNI\b|\bCUIL\b|\blegajo\b)/i);
});
