import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import accessPolicy from '../shared/access-policy.cjs';
import { MUNIGUIA_CATALOG } from '../js/contextual-help-catalog.js';
import {
  MUNIGUIA_ONBOARDING_CATALOG,
  resolveMuniGuiaOnboarding,
} from '../js/muniguia-onboarding-catalog.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const ROLES = Object.values(accessPolicy.ROLES);

const EXPECTED_PAGES = Object.freeze({
  SUPER_ADMIN: ['workspace', 'import', 'audit', 'quality', 'organizationAnalytics'],
  INTENDENTE: ['workspace', 'dashboard', 'grhExecutive', 'employmentActions', 'assistant'],
  TENANT_ADMIN: ['workspace', 'import', 'audit', 'quality', 'organizationAnalytics'],
  TENANT_USER: ['workspace', 'territory', 'manuals'],
  CONTADOR: ['workspace', 'hacienda', 'reports', 'quality', 'employmentActions'],
  INSPECTOR: ['workspace', 'territory', 'manuals'],
  DEMO: ['workspace', 'territory', 'manuals'],
});

function sessionInput(role, capabilities = null) {
  const access = accessPolicy.getSessionAccessForUser({ role, tenantId: 'tenant-junin-onboarding' });
  return {
    role,
    variant: access.homeProfile.variant,
    capabilities: capabilities || [...access.capabilities],
    policyVersion: accessPolicy.ACCESS_POLICY_VERSION,
  };
}

test('onboarding catalog is frozen, versioned and references only governed MuniGuia pages', () => {
  assert.deepEqual(Object.keys(MUNIGUIA_ONBOARDING_CATALOG).sort(), [
    'catalogVersion', 'contract', 'journeys', 'progressVersion',
  ]);
  assert.equal(MUNIGUIA_ONBOARDING_CATALOG.contract, 'muniguia-onboarding-v1');
  assert.equal(MUNIGUIA_ONBOARDING_CATALOG.catalogVersion, '2026-08-13.1');
  assert.equal(MUNIGUIA_ONBOARDING_CATALOG.progressVersion, 'muniguia-onboarding-progress-v1');
  assert.deepEqual(Object.keys(MUNIGUIA_ONBOARDING_CATALOG.journeys).sort(), [...ROLES].sort());
  assert.equal(Object.isFrozen(MUNIGUIA_ONBOARDING_CATALOG), true);

  for (const role of ROLES) {
    const journey = MUNIGUIA_ONBOARDING_CATALOG.journeys[role];
    assert.deepEqual(Object.keys(journey).sort(), ['id', 'stages', 'title']);
    assert.match(journey.id, /^[a-z0-9-]+$/);
    assert.ok(journey.title.length >= 20, role);
    assert.deepEqual(journey.stages.map((stage) => stage.pageId), EXPECTED_PAGES[role]);
    assert.equal(new Set(journey.stages.map((stage) => stage.id)).size, journey.stages.length);
    for (const stage of journey.stages) {
      assert.deepEqual(Object.keys(stage).sort(), ['copy', 'id', 'label', 'pageId']);
      assert.match(stage.id, /^[a-z0-9-]+$/);
      assert.ok(stage.label.length >= 20, `${role}:${stage.id}:label`);
      assert.ok(stage.copy.length >= 90, `${role}:${stage.id}:copy`);
      assert.ok(MUNIGUIA_CATALOG.pages[stage.pageId], `${role}:${stage.pageId}`);
    }
  }
});

test('resolver projects all seven role journeys from effective capabilities without creating grants', () => {
  for (const role of ROLES) {
    const input = sessionInput(role);
    const resolved = resolveMuniGuiaOnboarding(input);
    assert.ok(resolved, role);
    assert.deepEqual(Object.keys(resolved).sort(), [
      'catalogVersion', 'contract', 'journey', 'progressVersion',
    ]);
    assert.deepEqual(Object.keys(resolved.journey).sort(), [
      'estimatedMinutes', 'id', 'stages', 'title',
    ]);
    assert.equal(resolved.journey.estimatedMinutes, resolved.journey.stages.length * 2);
    assert.equal(Object.isFrozen(resolved), true);
    assert.equal(Object.isFrozen(resolved.journey.stages), true);

    for (const stage of resolved.journey.stages) {
      assert.deepEqual(Object.keys(stage).sort(), [
        'capability', 'copy', 'href', 'id', 'label', 'pageId',
      ]);
      const page = MUNIGUIA_CATALOG.pages[stage.pageId];
      assert.equal(stage.capability, page.requiredCapability);
      assert.equal(stage.href, page.href);
      assert.equal(input.capabilities.includes(stage.capability), true, `${role}:${stage.id}`);
    }
  }
});

test('effective capability ceilings remove unavailable stages and never replace them', () => {
  const publishedCeiling = [
    'session.read',
    'navigation.workspace',
    'navigation.dashboard',
    'navigation.reports',
    'navigation.hacienda',
    'navigation.grh-executive',
    'navigation.grh-decisions',
    'navigation.employment-actions',
    'navigation.organization-analytics',
    'navigation.territory',
    'navigation.data-quality',
    'navigation.rrhh',
    'navigation.ai-assistant',
    'navigation.help',
  ];
  const publishedAdministrator = resolveMuniGuiaOnboarding(
    sessionInput('TENANT_ADMIN', publishedCeiling),
  );
  assert.deepEqual(
    publishedAdministrator.journey.stages.map((stage) => stage.pageId),
    ['workspace', 'quality', 'organizationAnalytics'],
  );
  assert.equal(publishedAdministrator.journey.estimatedMinutes, 6);
  assert.equal(publishedAdministrator.journey.stages.some((stage) =>
    ['navigation.import', 'navigation.audit'].includes(stage.capability)), false);

  const reducedIntendente = resolveMuniGuiaOnboarding(sessionInput('INTENDENTE', [
    'session.read', 'navigation.workspace', 'navigation.help', 'navigation.dashboard',
  ]));
  assert.deepEqual(
    reducedIntendente.journey.stages.map((stage) => stage.pageId),
    ['workspace', 'dashboard'],
  );

  const injectedDemo = resolveMuniGuiaOnboarding(sessionInput('DEMO', [
    ...sessionInput('DEMO').capabilities,
    'navigation.dashboard',
    'navigation.import',
  ]));
  assert.deepEqual(
    injectedDemo.journey.stages.map((stage) => stage.pageId),
    ['workspace', 'territory', 'manuals'],
  );
});

test('resolver fails closed for input, policy, role, variant and capability drift', () => {
  const valid = sessionInput('INTENDENTE');
  const invalidInputs = [
    null,
    [],
    {},
    { ...valid, unexpected: true },
    { ...valid, role: 'UNKNOWN' },
    { ...valid, variant: 'controlled-preview' },
    { ...valid, policyVersion: '2026-08-13.0' },
    { ...valid, capabilities: [] },
    { ...valid, capabilities: 'navigation.workspace' },
    { ...valid, capabilities: valid.capabilities.filter((item) => item !== 'session.read') },
    { ...valid, capabilities: valid.capabilities.filter((item) => item !== 'navigation.workspace') },
    { ...valid, capabilities: valid.capabilities.filter((item) => item !== 'navigation.help') },
    { ...valid, capabilities: [...valid.capabilities, valid.capabilities[0]] },
    { ...valid, capabilities: [...valid.capabilities, 'navigation.future'] },
  ];
  for (const input of invalidInputs) assert.equal(resolveMuniGuiaOnboarding(input), null);
});

test('onboarding catalog remains a pure contract with no DOM, network or storage access', async () => {
  const source = await readFile(path.join(ROOT, 'js', 'muniguia-onboarding-catalog.js'), 'utf8');
  assert.doesNotMatch(source, /\b(?:document|window|fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/);
  assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|indexedDB|caches)\b/);
  assert.doesNotMatch(source, /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval)\b/);
  assert.match(source, /MUNIGUIA_CATALOG\.pages/);
  assert.match(source, /capabilities\.includes\(page\.requiredCapability\)/);
});
